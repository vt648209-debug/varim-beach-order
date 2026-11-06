import axios from "axios";
import crypto from "node:crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Интернет-эквайринг УБРиР работает на платформе PayKeeper (JSON API).
// Документация: https://ecom.ubrr.ru/dokumentatsiya-json-api/

export function paykeeperEnabled() {
  const p = config.paykeeper;
  return Boolean(p.server && p.user && p.password && p.secret);
}

function baseUrl() {
  const s = config.paykeeper.server.replace(/\/+$/, "");
  return /^https?:\/\//.test(s) ? s : "https://" + s;
}

function authHeader() {
  const raw = config.paykeeper.user + ":" + config.paykeeper.password;
  return "Basic " + Buffer.from(raw, "utf8").toString("base64");
}

const http = axios.create({ timeout: 15000 });

async function getToken() {
  const r = await http.get(baseUrl() + "/info/settings/token/", {
    headers: { Authorization: authHeader() },
  });
  if (!r.data || !r.data.token) throw new Error("PayKeeper: не получен token (" + JSON.stringify(r.data) + ")");
  return r.data.token;
}

// Создаёт счёт и возвращает { invoiceId, link }.
export async function createInvoice({ orderId, amount, clientName, phone, email, serviceName }) {
  const token = await getToken();
  const form = new URLSearchParams();
  form.set("pay_amount", Number(amount).toFixed(2));
  form.set("orderid", orderId);
  form.set("clientid", clientName || "Гость");
  if (phone) form.set("client_phone", phone);
  if (email) form.set("client_email", email);
  form.set("service_name", serviceName || "Заказ Varim пляжная доставка");
  form.set("token", token);

  const r = await http.post(baseUrl() + "/change/invoice/preview/", form.toString(), {
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
  });
  const invoiceId = r.data && r.data.invoice_id;
  if (!invoiceId) throw new Error("PayKeeper: счёт не создан (" + JSON.stringify(r.data) + ")");
  return { invoiceId: String(invoiceId), link: baseUrl() + "/bill/" + invoiceId + "/" };
}

export async function getInvoiceStatus(invoiceId) {
  const r = await http.get(baseUrl() + "/info/invoice/byid/?id=" + encodeURIComponent(invoiceId), {
    headers: { Authorization: authHeader() },
  });
  return r.data && r.data.status; // created | sent | paid | expired
}

function md5(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

// Проверка подписи POST-оповещения: md5(id + sum(2 знака) + clientid + orderid + secret)
export function verifyNotification(body) {
  const id = String(body.id || "");
  const sum = Number(body.sum || 0).toFixed(2);
  const clientid = String(body.clientid || "");
  const orderid = String(body.orderid || "");
  const expected = md5(id + sum + clientid + orderid + config.paykeeper.secret);
  const key = String(body.key || "").toLowerCase();
  if (key.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}

export function notificationAnswer(id) {
  return "OK " + md5(String(id) + config.paykeeper.secret);
}

export { logger as _pkLogger };
