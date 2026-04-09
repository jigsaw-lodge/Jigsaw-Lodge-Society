"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");
const { Client } = require("pg");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SHARED_TOKEN = process.env.JLS_SHARED_TOKEN || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const EVENT_CHANNEL = process.env.EVENT_CHANNEL || "events_channel";

function headers(extra = {}) {
  const out = { "Content-Type": "application/json", ...extra };
  if (SHARED_TOKEN) out["X-JLS-Token"] = SHARED_TOKEN;
  return out;
}

async function getJson(path, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: extraHeaders });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, text, body };
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
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, { timeoutMs = 8000, stepMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(stepMs);
  }
  return false;
}

test("zone pressure flips for an ordered active session and keeps DB session snapshots intact", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");

  const redis = createClient({ url: REDIS_URL });
  const sub = createClient({ url: REDIS_URL });
  const db = new Client({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "password",
    database: process.env.DB_NAME || "jls",
  });

  await redis.connect();
  await sub.connect();
  await db.connect();

  const suffixA = crypto.randomBytes(6).toString("hex");
  const suffixB = crypto.randomBytes(6).toString("hex");
  const a = `00000000-0000-4000-8000-${suffixA}`;
  const b = `00000000-0000-4000-8000-${suffixB}`;
  const zone = `zone-${crypto.randomBytes(4).toString("hex")}`;
  const objectId = `chair-${crypto.randomBytes(4).toString("hex")}`;
  let sessionId = "";
  let lastFlip = null;
  let flipCount = 0;

  try {
    await sub.subscribe(EVENT_CHANNEL, (raw) => {
      let event = null;
      try {
        event = JSON.parse(raw);
      } catch {
        event = null;
      }
      if (!event || event.type !== "zone_flip") return;
      if (event.payload?.zone !== zone) return;
      flipCount += 1;
      lastFlip = event.payload;
    });

    const start = await post("/api/session/start", {
      avatar: a,
      partner: b,
      object_id: objectId,
      zone,
      order: "architect",
    });
    assert.equal(start.res.status, 200, start.text);
    assert.equal(start.body?.ok, true);
    sessionId = start.body?.session_id || "";
    assert.ok(sessionId, "missing session_id");

    const sessionReady = await waitFor(async () => {
      const [sessionHash, linkA, linkB, rowResult] = await Promise.all([
        redis.hGetAll(`jls:session:${sessionId}`),
        redis.get(`jls:avatarSession:${a}`),
        redis.get(`jls:avatarSession:${b}`),
        db.query(
          `SELECT session_id, avatar_a, avatar_b, object_id, zone, active, order_type
           FROM sessions
           WHERE session_id = $1`,
          [sessionId]
        ),
      ]);

      const row = rowResult.rows[0];
      return sessionHash?.order === "architect"
        && linkA === sessionId
        && linkB === sessionId
        && row?.order_type === "architect"
        && row?.object_id === objectId;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(sessionReady, true, "session never became ready with order context");

    const ff = await post(
      "/api/admin/session/fast-forward",
      { session_id: sessionId, delta_ms: 61 * 1000 },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(ff.res.status, 200, ff.text);

    const tick = await post("/api/session/tick", {
      avatar: a,
      zone,
      order: "architect",
    });
    assert.equal(tick.res.status, 200, tick.text);

    const dbIntegrityHeld = await waitFor(async () => {
      const result = await db.query(
        `SELECT session_id, avatar_a, avatar_b, object_id, zone, active, order_type, last_tick, last_reward_at
         FROM sessions
         WHERE session_id = $1`,
        [sessionId]
      );
      const row = result.rows[0];
      return row
        && row.active === true
        && row.avatar_a
        && row.avatar_b
        && row.object_id === objectId
        && row.zone === zone
        && row.order_type === "architect"
        && Number(row.last_tick || 0) > 0
        && Number(row.last_reward_at || 0) > 0;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(dbIntegrityHeld, true, "partial session updates should preserve DB session truth");

    await db.query(
      `INSERT INTO zones(zone_id, pressure, owner, last_flip, updated_at)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT (zone_id) DO UPDATE SET
         pressure = EXCLUDED.pressure,
         owner = EXCLUDED.owner,
         last_flip = EXCLUDED.last_flip,
         updated_at = EXCLUDED.updated_at`,
      [zone, 102, "neutral", 0, Date.now()]
    );

    const flipped = await waitFor(async () => flipCount >= 1, {
      timeoutMs: 12_000,
      stepMs: 200,
    });
    assert.equal(flipped, true, "zone_flip event never observed");
    assert.equal(lastFlip?.owner, "architect");

    const zoneState = await getJson(`/api/zone?zone=${encodeURIComponent(zone)}`);
    assert.equal(zoneState.res.status, 200, zoneState.text);
    assert.equal(zoneState.body?.ok, true);
    assert.equal(zoneState.body?.zone?.zone_id, zone);
    assert.equal(Number(zoneState.body?.zone?.pressure || 0), 0);
    assert.equal(zoneState.body?.zone?.owner, "architect");
    assert.ok(Number(zoneState.body?.zone?.last_flip || 0) > 0);

    const world = await getJson("/api/world");
    assert.equal(world.res.status, 200, world.text);
    const session = world.body?.world?.sessions?.find((item) => item.session_id === sessionId);
    assert.ok(session, "session missing from /api/world snapshot");
    assert.equal(session.order_type, "architect");
    assert.equal(session.zone, zone);
  } finally {
    if (sessionId) {
      await post("/api/session/end", { avatar: a }).catch(() => {});
    }
    try {
      await sub.unsubscribe(EVENT_CHANNEL);
    } catch {}
    await sub.quit();
    await redis.quit();
    await db.end();
  }
});
