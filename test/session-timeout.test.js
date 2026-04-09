"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

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

test("stale sessions timeout, clear avatar links, and emit session_timeout once", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");

  const redis = createClient({ url: REDIS_URL });
  const sub = createClient({ url: REDIS_URL });
  await redis.connect();
  await sub.connect();

  const suffixA = crypto.randomBytes(6).toString("hex");
  const suffixB = crypto.randomBytes(6).toString("hex");
  const a = `00000000-0000-4000-8000-${suffixA}`;
  const b = `00000000-0000-4000-8000-${suffixB}`;

  try {
    const start = await post("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
    assert.equal(start.res.status, 200, start.text);
    assert.equal(start.body?.ok, true);
    const sessionId = start.body?.session_id;
    assert.ok(sessionId, "missing session_id");

    const sessionKey = `jls:session:${sessionId}`;
    const avatarKeyA = `jls:avatarSession:${a}`;
    const avatarKeyB = `jls:avatarSession:${b}`;

    const ready = await waitFor(async () => {
      const exists = await redis.exists(sessionKey);
      if (!exists) return false;
      const [linkA, linkB] = await Promise.all([redis.get(avatarKeyA), redis.get(avatarKeyB)]);
      return linkA === sessionId && linkB === sessionId;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(ready, true, "session never became ready in Redis");

    const now = Date.now();
    await redis.hSet(sessionKey, {
      last_tick: String(now - (130 * 1000)),
      started_at: String(now - (130 * 1000)),
      active: "1",
      ended_at: "0",
    });

    let timeoutEvents = 0;
    const timeoutPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for session_timeout")), 12_000);
      sub.subscribe(EVENT_CHANNEL, (raw) => {
        let event = null;
        try {
          event = JSON.parse(raw);
        } catch {
          event = null;
        }
        if (!event || event.type !== "session_timeout") return;
        if (event.payload?.session_id !== sessionId) return;
        timeoutEvents += 1;
        clearTimeout(timer);
        resolve(event.payload || {});
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const cleanup = await post(
      "/api/admin/session/cleanup-stale",
      {},
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(cleanup.res.status, 200, cleanup.text);
    assert.equal(cleanup.body?.ok, true);
    assert.equal(cleanup.body?.queued, true);

    const payload = await timeoutPromise;
    assert.equal(payload.session_id, sessionId);

    await sleep(800);

    const [linkAAfter, linkBAfter, sessionHash] = await Promise.all([
      redis.get(avatarKeyA),
      redis.get(avatarKeyB),
      redis.hGetAll(sessionKey),
    ]);

    assert.equal(linkAAfter, null, "avatar A session link should be cleared");
    assert.equal(linkBAfter, null, "avatar B session link should be cleared");
    assert.equal(Number(sessionHash.active || 0), 0, "session should be inactive after timeout");
    assert.ok(Number(sessionHash.ended_at || 0) > 0, "session ended_at should be set");
    assert.ok(Number(sessionHash.duration || 0) >= 120000, "timed out duration should reflect idle age");
    assert.equal(timeoutEvents, 1, "timeout event should only be observed once");
  } finally {
    try {
      await sub.unsubscribe(EVENT_CHANNEL);
    } catch {}
    await sub.quit();
    await redis.quit();
  }
});
