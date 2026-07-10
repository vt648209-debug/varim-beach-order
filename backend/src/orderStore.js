import Database from "better-sqlite3";
import { config } from "./config.js";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
const db = new Database(config.dbFile);

db.exec(
  "CREATE TABLE IF NOT EXISTS orders (" +
  "id TEXT PRIMARY KEY," +
  "external_id TEXT," +
  "status TEXT," +
  "payload TEXT," +
  "saby_response TEXT," +
  "created_at TEXT DEFAULT (datetime('now'))," +
  "updated_at TEXT DEFAULT (datetime('now'))" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_external_id ON orders(external_id);"
  );

export function saveOrder({ id, externalId, status, payload, sabyResponse }) {
  db.prepare(
    "INSERT INTO orders (id, external_id, status, payload, saby_response) " +
    "VALUES (@id, @externalId, @status, @payload, @sabyResponse)"
    ).run({
    id, externalId, status,
    payload: JSON.stringify(payload),
    sabyResponse: JSON.stringify(sabyResponse || {}),
  });
}

export function getOrderByLocalId(id) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  return row ? deserialize(row) : null;
}

export function getOrderByExternalId(externalId) {
  const row = db.prepare("SELECT * FROM orders WHERE external_id = ?").get(externalId);
  return row ? deserialize(row) : null;
}

export function updateStatus(id, status, extra) {
  db.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now'), " +
    "saby_response = json_patch(saby_response, ?) WHERE id = ?"
    ).run(status, JSON.stringify(extra || {}), id);
}

function deserialize(row) {
  return {
    ...row,
    payload: JSON.parse(row.payload || "{}"),
    saby_response: JSON.parse(row.saby_response || "{}"),
  };
}
