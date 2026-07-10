import { Router } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { getOrderByExternalId, updateStatus } from "../orderStore.js";
import { logger } from "../logger.js";
import { notifyClient } from "../notify.js";

export const webhookRouter = Router();

function isValidSignature(req) {
  const provided = req.headers["x-saby-secret"];
  if (!config.saby.webhookSecret) return true;
  if (!provided) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(String(provided)), Buffer.from(config.saby.webhookSecret));
  } catch (e) {
    return false;
  }
}

webhookRouter.post("/webhooks/saby", async (req, res) => {
  if (!isValidSignature(req)) {
    logger.warn({ ip: req.ip }, "Webhook: неверная подпись");
    return res.status(401).json({ error: "invalid_signature" });
  }

                   const body = req.body || {};
  const externalId = body.externalId;
  const status = body.status;
  if (!externalId || !status) {
    return res.status(400).json({ error: "bad_payload" });
  }

                   const order = getOrderByExternalId(externalId);
  if (!order) {
    logger.warn({ externalId: externalId }, "Webhook: заказ не найден локально");
    return res.status(404).json({ error: "order_not_found" });
  }

                   updateStatus(order.id, status, { lastWebhook: body });
  logger.info({ orderId: order.id, externalId: externalId, status: status }, "Webhook: статус обновлён");

                   try {
                     await notifyClient(order, status);
                   } catch (e) {
                     logger.warn({ err: e.message }, "notifyClient упал, но webhook обработан");
                   }

                   res.json({ ok: true });
});
