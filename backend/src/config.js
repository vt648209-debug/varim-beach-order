import "dotenv/config";

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error("Missing env var: " + name);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  allowedOrigin: required("ALLOWED_ORIGIN", "https://vt648209-debug.github.io"),

  saby: {
    apiBase: required("SABY_API_BASE", "https://api.sbis.ru"),
    authMode: process.env.SABY_AUTH_MODE || "static",
    staticToken: process.env.SABY_STATIC_TOKEN || "",
    login: process.env.SABY_LOGIN || "",
    password: process.env.SABY_PASSWORD || "",
    pointId: Number(process.env.SABY_POINT_ID || 0),
    priceListId: Number(process.env.SABY_PRICE_LIST_ID || 0),
    deliveryMode: process.env.DELIVERY_MODE || "pickup",
    webhookSecret: process.env.SABY_WEBHOOK_SECRET || "",
  },

  dbFile: process.env.DB_FILE || "./data/orders.db",

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    courierChatId: process.env.TELEGRAM_COURIER_CHAT_ID || "",
  },
};
