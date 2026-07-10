import axios from "axios";
import { config } from "./config.js";
import { logger } from "./logger.js";

let cachedToken = null;
let tokenExpiresAt = 0;

async function loginAndGetToken() {
  const resp = await axios.post(config.saby.apiBase + "/auth/login", {
    login: config.saby.login,
    password: config.saby.password,
  });
  cachedToken = resp.data && resp.data.token;
  tokenExpiresAt = Date.now() + 10 * 60 * 1000;
  return cachedToken;
}

async function getToken() {
  if (config.saby.authMode === "static") {
    if (!config.saby.staticToken) {
      throw new Error("SABY_STATIC_TOKEN не задан в .env");
    }
    return config.saby.staticToken;
  }
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return loginAndGetToken();
}

const client = axios.create({
  baseURL: config.saby.apiBase,
  timeout: 15000,
});

client.interceptors.request.use(async (req) => {
  const token = await getToken();
  req.headers["X-SBISAccessToken"] = token;
  req.headers["Content-Type"] = "application/json";
  return req;
});

async function withRetry(fn, opts) {
  const retries = (opts && opts.retries) || 3;
  const baseDelayMs = (opts && opts.baseDelayMs) || 400;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response && err.response.status;
      const retryable = !status || status >= 500 || status === 429;
      if (!retryable || attempt === retries) break;
      if (status === 401 && config.saby.authMode === "login") {
        cachedToken = null;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn({ attempt: attempt, status: status, delay: delay }, "Saby API retry");
      await new Promise(function (r) { setTimeout(r, delay); });
    }
  }
  throw lastErr;
}

export const sabyClient = {
  async createOrder(payload) {
    return withRetry(async function () {
      const res = await client.post("/retail/order/create", payload);
      return res.data;
    });
  },

  async getOrder(externalId) {
    return withRetry(async function () {
      const res = await client.get("/retail/order/" + externalId);
      return res.data;
    });
  },

  async getOrderState(externalId) {
    return withRetry(async function () {
      const res = await client.get("/retail/order/" + externalId + "/state");
      return res.data;
    });
  },

  async updateOrder(externalId, patch) {
    return withRetry(async function () {
      const res = await client.put("/retail/order/" + externalId + "/update", patch);
      return res.data;
    });
  },

  async cancelOrder(externalId, reason) {
    return withRetry(async function () {
      const res = await client.put("/retail/order/" + externalId + "/cancel", { reason: reason });
      return res.data;
    });
  },

  async getPaymentLink(externalId) {
    try {
      const data = await withRetry(function () {
        return client.get("/retail/order/" + externalId + "/payment-link").then(function (r) { return r.data; });
      }, { retries: 1 });
      return (data && data.link) || null;
    } catch (err) {
      logger.warn({ err: err.message, externalId: externalId }, "payment-link недоступен, fallback на оплату курьеру");
      return null;
    }
  },
};
