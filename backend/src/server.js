import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { orderRouter } from "./routes/order.js";
import { webhookRouter } from "./routes/webhook.js";

const app = express();

app.use(pinoHttp({ logger: logger }));
app.use(express.json({ limit: "200kb" }));

app.use(cors({
  origin: config.allowedOrigin,
  methods: ["GET", "POST"],
}));

app.use("/api", orderRouter);
app.use("/api", webhookRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  logger.info("Backend listening on port " + config.port);
});
