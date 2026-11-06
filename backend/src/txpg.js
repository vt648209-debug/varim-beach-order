import axios from "axios";
import https from "node:https";
import fs from "node:fs";
import { config } from "./config.js";

// Прямой интернет-эквайринг УБРиР: TranzAxis e-Commerce Payment Gateway (TXPG, Compass Plus).
// Спецификация банка: «Описание взаимодействия интернет-магазина с TXPG» (04.03.2026).
//   createOrder: POST {baseUrl}/order -> { order: { id, password, hppUrl, status } }
//   getOrder:    GET  {baseUrl}/order/{id}?password={password}
// Покупатель платит на HPP банка: {hppUrl}?id={id}&password={password},
// затем HPP возвращает его на hppRedirectUrl. Push-уведомлений нет — статус запрашиваем сами.

export const PAID_STATUSES = ["FullyPaid", "Funded", "Closed"];
export const FAILED_STATUSES = ["Expired", "Cancelled", "Rejected", "Refused", "Declined", "Voided"];

export function txpgEnabled() {
  return Boolean(config.txpg.baseUrl);
}

function readIf(path) {
  return path ? fs.readFileSync(path) : undefined;
}

let client = null;
function http() {
  if (client) return client;
  const t = config.txpg;
  const agent = new https.Agent({
    // Клиентский сертификат, если банк выдал (обычно TXPG работает по взаимной TLS-аутентификации)
    cert: readIf(t.certFile),
    key: readIf(t.keyFile),
    pfx: readIf(t.pfxFile),
    passphrase: t.certPassphrase || undefined,
    // Корневой сертификат банка (НУЦ Минцифры), если системный не доверяет
    ca: readIf(t.caFile),
    keepAlive: true,
  });
  const headers = { "Content-Type": "application/json" };
  if (t.user) headers.Authorization = "Basic " + Buffer.from(t.user + ":" + t.password, "utf8").toString("base64");
  client = axios.create({ baseURL: t.baseUrl.replace(/\/+$/, ""), timeout: 20000, httpsAgent: agent, headers: headers });
  return client;
}

function formatAmount(rub) {
  return config.txpg.amountInKopecks ? String(Math.round(Number(rub) * 100)) : Number(rub).toFixed(2);
}

function formatExpTime(minutes) {
  const d = new Date(Date.now() + minutes * 60000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const g = (k) => p.find((x) => x.type === k).value;
  return g("year") + "-" + g("month") + "-" + g("day") + " " + g("hour") + ":" + g("minute") + ":" + g("second");
}

// Создаёт заказ в TXPG и возвращает { txpgId, password, link }
export async function createTxpgOrder({ amount, description, redirectUrl }) {
  const body = {
    order: {
      typeRid: config.txpg.typeRid,
      amount: formatAmount(amount),
      currency: "RUB",
      description: (description || "Заказ Varim").slice(0, 120),
      language: "ru",
      hppRedirectUrl: redirectUrl,
      expTime: formatExpTime(config.txpg.orderTtlMinutes),
      initiationEnvKind: "Browser",
    },
  };
  const r = await http().post("/order", body);
  const o = r.data && r.data.order;
  if (!o || !o.id || !o.password || !o.hppUrl) throw new Error("TXPG: заказ не создан (" + JSON.stringify(r.data) + ")");
  const sep = o.hppUrl.includes("?") ? "&" : "?";
  const link = o.hppUrl + sep + "id=" + encodeURIComponent(o.id) + "&password=" + encodeURIComponent(o.password);
  return { txpgId: String(o.id), password: String(o.password), link: link };
}

export async function getTxpgOrder(txpgId, password) {
  const r = await http().get("/order/" + encodeURIComponent(txpgId) + "?password=" + encodeURIComponent(password));
  const o = r.data && r.data.order;
  if (!o || !o.status) throw new Error("TXPG: нет статуса (" + JSON.stringify(r.data) + ")");
  return o; // { id, status, amount, ... }
}
