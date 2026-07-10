import { config } from "./config.js";
import { logger } from "./logger.js";

export async function notifyClient(order, status) {
  if (!config.telegram.botToken || !config.telegram.courierChatId) {
    logger.info({ orderId: order.id, status: status }, "notifyClient: Telegram не настроен, пропуск");
    return;
  }
  logger.info({ orderId: order.id, status: status }, "notifyClient stub called");
}
