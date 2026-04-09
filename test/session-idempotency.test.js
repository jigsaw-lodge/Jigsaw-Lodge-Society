"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SHARED_TOKEN = process.env.JLS_SHARED_TOKEN || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const EVENT_LIST_KEY = process.env.EVENT_LIST_KEY || "jls:events";
const EVENT_CHANNEL = process.env.EVENT_CHANNEL || "events_channel";

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

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
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
    const ok = await fn();
    if (ok) return true;
    await sleep(stepMs);
  }
  return false;
}

test("session end is idempotent (no double ritual awards)", async () => {
  const redis = createClient({ url: REDIS_URL });
  const sub = createClient({ url: REDIS_URL });
  await redis.connect();
  await sub.connect();

  // Use fresh UUIDs each run so prior Redis/DB state can't contaminate the test.
  const suffixA = crypto.randomBytes(6).toString("hex");
  const suffixB = crypto.randomBytes(6).toString("hex");
  const a = `00000000-0000-4000-8000-${suffixA}`;
  const b = `00000000-0000-4000-8000-${suffixB}`;

  try {
    // Start session.
    const start = await post("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
    assert.equal(start.res.status, 200, start.text);
    assert.equal(start.body?.ok, true);
    const sessionId = start.body?.session_id;
    assert.ok(sessionId, "missing session_id");

    // Wait until worker has created the Redis session + avatar-session link.
    const sessionKey = `jls:session:${sessionId}`;
    const avatarSessionKey = `jls:avatarSession:${a}`;
    const sessionReady = await waitFor(async () => {
      const exists = await redis.exists(sessionKey);
      if (!exists) return false;
      const link = await redis.get(avatarSessionKey);
      return link === sessionId;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(sessionReady, true, "session never became ready in Redis");

    // Fast-forward the session by 46 minutes so it qualifies for ritual completion.
    assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");
    const ff = await post(
      "/api/admin/session/fast-forward",
      { session_id: sessionId, delta_ms: 46 * 60 * 1000 },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(ff.res.status, 200, ff.text);
    assert.equal(ff.body?.ok, true);

    // Subscribe before ending so we don't miss the pubsub message under high event volume.
    let endedPayload = null;
    const endedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for session_ended ritual_complete")), 12_000);
      sub.subscribe(EVENT_CHANNEL, (raw) => {
        let event = null;
        try {
          event = JSON.parse(raw);
        } catch {
          event = null;
        }
        if (!event || event.type !== "session_ended") return;
        if (event.payload?.session_id !== sessionId) return;
        endedPayload = event.payload || null;
        if (Number(event.payload?.ritual_complete || 0) !== 1) return;
        clearTimeout(timer);
        resolve(true);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // End the session twice (simulate duplicate client events).
    const end1 = await post("/api/session/end", { avatar: a });
    assert.equal(end1.res.status, 200, end1.text);
    await sleep(900);
    const end2 = await post("/api/session/end", { avatar: a });
    assert.equal(end2.res.status, 200, end2.text);

    // Wait for worker confirmation via pubsub.
    try {
      await endedPromise;
    } catch (err) {
      // Extra context to make failures easy to debug.
      const sessionHash = await redis.hGetAll(`jls:session:${sessionId}`);
      const recent = await redis.lRange(EVENT_LIST_KEY, 0, 25);
      throw new Error(
        `session_ended ritual_complete event never observed for ${sessionId}; endedPayload=${JSON.stringify(
          endedPayload
        )}; sessionHashKeys=${JSON.stringify(Object.keys(sessionHash || {}).sort())}; recentEventsHead=${recent
          .slice(0, 3)
          .join("\\n")}; original=${err.message}`
      );
    }

    // Now fetch state snapshots (rate-limited, so do it once per avatar).
    const stateA1 = (await post("/api/event", { avatar: a, action: "hud_tick" })).body?.state;
    await sleep(900);
    const stateB1 = (await post("/api/event", { avatar: b, action: "hud_tick" })).body?.state;
    assert.equal(stateA1?.rituals, 1);
    assert.equal(stateB1?.rituals, 1);

    // Give time for any duplicate processing; state should remain stable.
    await sleep(1500);
    const stateA2 = (await post("/api/event", { avatar: a, action: "hud_tick" })).body?.state;
    await sleep(900);
    const stateB2 = (await post("/api/event", { avatar: b, action: "hud_tick" })).body?.state;
    assert.equal(stateA2?.rituals, 1);
    assert.equal(stateB2?.rituals, 1);
    assert.equal(Number(stateA2?.pentacles || 0), Number(stateA1?.pentacles || 0));
    assert.equal(Number(stateB2?.pentacles || 0), Number(stateB1?.pentacles || 0));
  } finally {
    try {
      await sub.unsubscribe(EVENT_CHANNEL);
    } catch {}
    await sub.quit();
    await redis.quit();
  }
});
