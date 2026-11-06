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

  // Прямой интернет-эквайринг УБРиР (TXPG). Параметры выдаёт банк.
  txpg: {
    baseUrl: process.env.TXPG_BASE_URL || "",          // адрес API-шлюза банка
    user: process.env.TXPG_USER || "",                 // если банк дал логин/пароль API
    password: process.env.TXPG_PASSWORD || "",
    certFile: process.env.TXPG_CERT_FILE || "",        // клиентский сертификат (PEM)
    keyFile: process.env.TXPG_KEY_FILE || "",          // ключ к сертификату (PEM)
    pfxFile: process.env.TXPG_PFX_FILE || "",          // либо сертификат в .p12/.pfx
    certPassphrase: process.env.TXPG_CERT_PASSPHRASE || "",
    caFile: process.env.TXPG_CA_FILE || "",            // корневой сертификат (НУЦ Минцифры)
    typeRid: process.env.TXPG_TYPE_RID || "Purchase",
    amountInKopecks: process.env.TXPG_AMOUNT_IN_KOPECKS === "1",
    orderTtlMinutes: Number(process.env.TXPG_ORDER_TTL_MINUTES || 30),
    // публичный адрес API, на который банк вернёт покупателя после оплаты
    publicApiBase: process.env.PUBLIC_API_BASE || "https://api.xn----7sbfonnmsn9b.xn--p1ai/api",
    // страница сайта, куда отправляем покупателя после проверки оплаты
    siteUrl: process.env.SITE_URL || "https://vt648209-debug.github.io/varim-beach-order/varim-beach-order.html",
  },

  paykeeper: {
    // адрес сервера PayKeeper из личного кабинета, например xxxx.ubrr-processing.ru
    server: process.env.PAYKEEPER_SERVER || "",
    user: process.env.PAYKEEPER_USER || "",
    password: process.env.PAYKEEPER_PASSWORD || "",
    // секретное слово для POST-оповещений (задаётся в ЛК PayKeeper)
    secret: process.env.PAYKEEPER_SECRET || "",
  },

  dbFile: process.env.DB_FILE || "./data/orders.db",

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    courierChatId: process.env.TELEGRAM_COURIER_CHAT_ID || "",
  },
};
