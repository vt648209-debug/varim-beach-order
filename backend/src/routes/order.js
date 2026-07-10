import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { OrderCreateSchema } from "../validators.js";
import { buildSabyPayload } from "../sabyPayloadBuilder.js";
import { sabyClient } from "../sabyClient.js";
import { saveOrder, getOrderByLocalId, updateStatus } from "../orderStore.js";
import { logger } from "../logger.js";

export const orderRouter = Router();

orderRouter.post("/order/create", async (req, res, next) => {
  try {
    const parsed = OrderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const order = parsed.data;
    const built = buildSabyPayload(order);
    const payload = built.payload;
    const total = built.total;

  const localId = uuidv4();
    let sabyResponse;
    try {
      sabyResponse = await sabyClient.createOrder(payload);
    } catch (err) {
      logger.error({ err: err.message, localId: localId }, "Ошибка создания заказа в Saby");
      return res.status(502).json({ error: "saby_unavailable", message: "Не удалось создать заказ в Saby, попробуйте ещё раз" });
    }

  const externalId = (sabyResponse && (sabyResponse.id || sabyResponse.externalId)) || null;
    saveOrder({ id: localId, externalId: externalId, status: "created", payload: payload, sabyResponse: sabyResponse });

  let paymentLink = null;
    if (order.payment === "card" && externalId) {
      paymentLink = await sabyClient.getPaymentLink(externalId);
    }

  res.status(201).json({
    orderId: localId,
    externalId: externalId,
    status: "created",
    total: total,
    paymentLink: paymentLink,
  });
  } catch (err) {
    next(err);
  }
});

orderRouter.get("/order/:id", async (req, res, next) => {
  try {
    const local = getOrderByLocalId(req.params.id);
    if (!local) return res.status(404).json({ error: "not_found" });

  try {
    const state = await sabyClient.getOrderState(local.external_id);
    if (state && state.status && state.status !== local.status) {
      updateStatus(local.id, state.status, { lastState: state });
    }
    return res.json({ orderId: local.id, externalId: local.external_id, status: (state && state.status) || local.status });
  } catch (err) {
    logger.warn({ err: err.message }, "Не удалось получить статус из Saby, отдаём локальный");
    return res.json({ orderId: local.id, externalId: local.external_id, status: local.status, stale: true });
  }
  } catch (err) {
    next(err);
  }
});

orderRouter.get("/order/:id/payment-link", async (req, res, next) => {
  try {
    const local = getOrderByLocalId(req.params.id);
    if (!local) return res.status(404).json({ error: "not_found" });
    const link = await sabyClient.getPaymentLink(local.external_id);
    res.json({ paymentLink: link, fallback: link ? null : "cash_on_delivery" });
  } catch (err) {
    next(err);
  }
});

orderRouter.post("/order/:id/cancel", async (req, res, next) => {
  try {
    const local = getOrderByLocalId(req.params.id);
    if (!local) return res.status(404).json({ error: "not_found" });
    await sabyClient.cancelOrder(local.external_id, (req.body && req.body.reason) || "Отменено клиентом");
    updateStatus(local.id, "cancelled", {});
    res.json({ orderId: local.id, status: "cancelled" });
  } catch (err) {
    next(err);
  }
});
