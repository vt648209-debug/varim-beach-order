import { Router } from "express";
import { buildSabyPayload } from "../sabyPayloadBuilder.js";
import { sabyClient } from "../sabyClient.js";
import { getOrderByLocalId, updateStatus, setExternalId } from "../orderStore.js";
import { logger } from "../logger.js";
import { paykeeperEnabled, verifyNotification, notificationAnswer } from "../paykeeper.js";
import { notifyClient } from "../notify.js";

export const paymentRouter = Router();

// POST-оповещение PayKeeper об успешной оплате.
// URL для настройки в ЛК: https://api.варим-кофе.рф/api/payments/paykeeper/notify
paymentRouter.post("/payments/paykeeper/notify", async (req, res) => {
  const body = req.body || {};
  if (!paykeeperEnabled()) {
    logger.warn("PayKeeper notify: интеграция не настроена");
    return res.status(503).send("Not configured");
  }
  if (!verifyNotification(body)) {
    logger.warn({ id: body.id, orderid: body.orderid }, "PayKeeper notify: неверная подпись");
    return res.status(400).send("Error! Hash mismatch");
  }

  const answer = notificationAnswer(body.id);
  const local = getOrderByLocalId(String(body.orderid || ""));
  if (!local) {
    // Оплата без заказа на сайте (например, счёт из ЛК) — подтверждаем приём, чтобы PayKeeper не повторял.
    logger.warn({ id: body.id, orderid: body.orderid, sum: body.sum }, "PayKeeper notify: заказ не найден");
    return res.send(answer);
  }

  // Повторное оповещение по уже обработанному заказу
  if (local.status !== "awaiting_payment" && local.status !== "payment_init_failed") {
    return res.send(answer);
  }

  const expected = Number(local.payload.total || 0);
  const paid = Number(body.sum || 0);
  if (Math.abs(expected - paid) > 0.009) {
    logger.error({ orderId: local.id, expected: expected, paid: paid }, "PayKeeper notify: сумма не совпадает с заказом");
    updateStatus(local.id, "paid_amount_mismatch", { paykeeper: body });
    return res.send(answer);
  }

  updateStatus(local.id, "paid", { paykeeper: { id: body.id, sum: body.sum, ps_id: body.ps_id, fop_receipt_key: body.fop_receipt_key || null } });
  logger.info({ orderId: local.id, paymentId: body.id, sum: body.sum }, "PayKeeper: заказ оплачен");

  // Передаём оплаченный заказ в СБИС
  try {
    const order = local.payload.order;
    const built = buildSabyPayload(order);
    built.payload.comment = ("ОПЛАЧЕНО ОНЛАЙН (PayKeeper № " + body.id + "). " + (built.payload.comment || "")).slice(0, 1000);
    const sabyResponse = await sabyClient.createOrder(built.payload);
    const externalId = (sabyResponse && (sabyResponse.id || sabyResponse.externalId)) || null;
    if (externalId) setExternalId(local.id, String(externalId));
    updateStatus(local.id, "paid", { sabyResponse: sabyResponse });
    try { await notifyClient(local, "paid"); } catch (e) { /* не критично */ }
  } catch (err) {
    // Деньги приняты — PayKeeper отвечаем OK, а заказ отмечаем для ручной обработки
    logger.error({ err: err.message, orderId: local.id }, "Оплачен, но не создан в СБИС — нужна ручная обработка");
    updateStatus(local.id, "paid_saby_failed", { sabyError: err.message });
  }

  return res.send(answer);
});

// Статус оплаты для страницы возврата с платёжной формы
paymentRouter.get("/payments/status/:orderId", (req, res) => {
  const local = getOrderByLocalId(req.params.orderId);
  if (!local) return res.status(404).json({ error: "not_found" });
  const paid = ["paid", "paid_saby_failed"].includes(local.status);
  res.json({ orderId: local.id, status: local.status, paid: paid });
});
