import { buildSabyPayload } from "./sabyPayloadBuilder.js";
import { sabyClient } from "./sabyClient.js";
import { updateStatus, setExternalId } from "./orderStore.js";
import { logger } from "./logger.js";
import { notifyClient } from "./notify.js";

export const OPEN_PAYMENT_STATUSES = ["awaiting_payment", "payment_init_failed"];

// Помечает заказ оплаченным и передаёт его в СБИС. Вызывать один раз на заказ.
export async function finalizePaidOrder(local, paymentRef, extra) {
  updateStatus(local.id, "paid", { payment: Object.assign({ ref: String(paymentRef) }, extra || {}) });
  logger.info({ orderId: local.id, paymentRef: paymentRef }, "Заказ оплачен онлайн");
  try {
    const built = buildSabyPayload(local.payload.order);
    built.payload.comment = ("ОПЛАЧЕНО ОНЛАЙН (№ " + paymentRef + "). " + (built.payload.comment || "")).slice(0, 1000);
    const sabyResponse = await sabyClient.createOrder(built.payload);
    const externalId = (sabyResponse && (sabyResponse.id || sabyResponse.externalId)) || null;
    if (externalId) setExternalId(local.id, String(externalId));
    updateStatus(local.id, "paid", { sabyResponse: sabyResponse });
    try { await notifyClient(local, "paid"); } catch (e) { /* не критично */ }
  } catch (err) {
    // Деньги приняты, но СБИС не принял заказ — нужна ручная обработка
    logger.error({ err: err.message, orderId: local.id }, "Оплачен, но не создан в СБИС");
    updateStatus(local.id, "paid_saby_failed", { sabyError: err.message });
  }
}
