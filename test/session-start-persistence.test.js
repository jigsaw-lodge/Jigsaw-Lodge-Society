"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");
const { Client } = require("pg");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHARED_TOKEN = process.env.JLS_SHARED_TOKEN || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

function headers(extra = {}) {
  const out = { "Content-Type": "application/json", ...extra };
  if (SHARED_TOKEN) out["X-JLS-Token"] = SHARED_TOKEN;
  return out;
}

async function post(path, payload, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(extraHeaders),
    body: JSON.stringify(payload || {}),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, text, body };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, { timeoutMs = 8000, stepMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
}

test("session start persists to Redis and Postgres", async () => {
  const redis = createClient({ url: REDIS_URL });
  const db = new Client({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "password",
    database: process.env.DB_NAME || "jls",
  });

  await redis.connect();
  await db.connect();

  const suffixA = crypto.randomBytes(6).toString("hex");
  const suffixB = crypto.randomBytes(6).toString("hex");
  const a = `00000000-0000-4000-8000-${suffixA}`;
  const b = `00000000-0000-4000-8000-${suffixB}`;

  try {
    const start = await post("/api/session/start", {
      avatar: a,
      partner: b,
      zone: "0:0",
      object_id: "chair-ritual-alpha",
    });
    assert.equal(start.res.status, 200, start.text);
    assert.equal(start.body?.ok, true);

    const sessionId = start.body?.session_id;
    assert.ok(sessionId, "missing session_id");

    const ready = await waitFor(async () => {
      const sessionHash = await redis.hGetAll(`jls:session:${sessionId}`);
      if (!sessionHash || Object.keys(sessionHash).length === 0) return false;
      const [linkA, linkB] = await Promise.all([
        redis.get(`jls:avatarSession:${a}`),
        redis.get(`jls:avatarSession:${b}`),
      ]);
      if (linkA !== sessionId || linkB !== sessionId) return false;
      const result = await db.query(
        `SELECT session_id, avatar_a, avatar_b, object_id, zone, active
         FROM sessions
         WHERE session_id = $1`,
        [sessionId]
      );
      return result.rows.length === 1;
    }, { timeoutMs: 12_000, stepMs: 200 });

    assert.equal(ready, true, "session start never fully persisted");

    const sessionHash = await redis.hGetAll(`jls:session:${sessionId}`);
    const dbResult = await db.query(
      `SELECT session_id, avatar_a, avatar_b, object_id, zone, active
       FROM sessions
       WHERE session_id = $1`,
      [sessionId]
    );
    const row = dbResult.rows[0];

    assert.equal(sessionHash.session_id, sessionId);
    assert.equal(sessionHash.object_id, "chair-ritual-alpha");
    assert.equal(sessionHash.zone, "0:0");
    assert.equal(Number(sessionHash.active || 0), 1);

    assert.ok(row, "missing session row in Postgres");
    assert.equal(row.session_id, sessionId);
    assert.equal(row.object_id, "chair-ritual-alpha");
    assert.equal(row.zone, "0:0");
    assert.equal(row.active, true);
    assert.equal([row.avatar_a, row.avatar_b].sort().join(":"), [a, b].sort().join(":"));
  } finally {
    await db.end();
    await redis.quit();
  }
});
