import { Router } from "express";
import { config } from "../config.js";
import { getOrderByLocalId, updateStatus, listOrdersByStatus } from "../orderStore.js";
import { logger } from "../logger.js";
import { paykeeperEnabled, verifyNotification, notificationAnswer } from "../paykeeper.js";
import { txpgEnabled, getTxpgOrder, PAID_STATUSES, FAILED_STATUSES } from "../txpg.js";
import { finalizePaidOrder, OPEN_PAYMENT_STATUSES } from "../paymentFlow.js";

export const paymentRouter = Router();

const inFlight = new Set();

// Проверяет оплату заказа в TXPG и, если оплачен, завершает его. Возвращает актуальный локальный статус.
export async function syncTxpgOrder(localId) {
  const local = getOrderByLocalId(localId);
  if (!local) return null;
  if (!OPEN_PAYMENT_STATUSES.includes(local.status)) return local.status;
  const tx = local.saby_response && local.saby_response.txpg;
  if (!tx || !tx.id) return local.status;
  if (inFlight.has(localId)) return local.status;
  inFlight.add(localId);
  try {
    const o = await getTxpgOrder(tx.id, tx.password);
    if (PAID_STATUSES.includes(o.status)) {
      await finalizePaidOrder(local, "TXPG " + tx.id, { provider: "txpg", txpgStatus: o.status, amount: o.amount });
    } else if (FAILED_STATUSES.includes(o.status)) {
      updateStatus(local.id, "payment_failed", { txpgStatus: o.status });
    }
  } catch (err) {
    logger.warn({ err: err.message, orderId: localId }, "TXPG: не удалось получить статус");
  } finally {
    inFlight.delete(localId);
  }
  return getOrderByLocalId(localId).status;
}

// Сюда банк возвращает покупателя после оплаты (hppRedirectUrl)
paymentRouter.get("/payments/txpg/return/:orderId", async (req, res) => {
  const status = await syncTxpgOrder(req.params.orderId);
  const ok = status === "paid" || status === "paid_saby_failed";
  const pending = status === "awaiting_payment";
  const result = ok ? "success" : (pending ? "pending" : "fail");
  res.redirect(302, config.txpg.siteUrl + "?pay=" + result);
});

// Фоновая проверка неоплаченных заказов (если покупатель закрыл страницу банка, не вернувшись на сайт)
export function startTxpgPoller() {
  if (!txpgEnabled()) return;
  setInterval(async () => {
    const rows = listOrdersByStatus("awaiting_payment", 120);
    for (const r of rows) await syncTxpgOrder(r.id);
  }, 60000).unref();
  logger.info("TXPG: фоновая проверка оплат запущена");
}

// POST-оповещение PayKeeper (используется только при подключении через ПЭЙКИПЕР)
paymentRouter.post("/payments/paykeeper/notify", async (req, res) => {
  const body = req.body || {};
  if (!paykeeperEnabled()) return res.status(503).send("Not configured");
  if (!verifyNotification(body)) {
    logger.warn({ id: body.id, orderid: body.orderid }, "PayKeeper notify: неверная подпись");
    return res.status(400).send("Error! Hash mismatch");
  }
  const answer = notificationAnswer(body.id);
  const local = getOrderByLocalId(String(body.orderid || ""));
  if (!local || !OPEN_PAYMENT_STATUSES.includes(local.status)) return res.send(answer);
  if (Math.abs(Number(local.payload.total || 0) - Number(body.sum || 0)) > 0.009) {
    updateStatus(local.id, "paid_amount_mismatch", { paykeeper: body });
    return res.send(answer);
  }
  await finalizePaidOrder(local, "PayKeeper " + body.id, { provider: "paykeeper", sum: body.sum });
  return res.send(answer);
});

// Статус оплаты для страницы сайта
paymentRouter.get("/payments/status/:orderId", async (req, res) => {
  let local = getOrderByLocalId(req.params.orderId);
  if (!local) return res.status(404).json({ error: "not_found" });
  if (txpgEnabled() && local.status === "awaiting_payment") {
    await syncTxpgOrder(local.id);
    local = getOrderByLocalId(local.id);
  }
  res.json({ orderId: local.id, status: local.status, paid: ["paid", "paid_saby_failed"].includes(local.status) });
});
