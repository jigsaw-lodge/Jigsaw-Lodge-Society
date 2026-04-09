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

test("15-minute ritual milestone is awarded exactly once before full ritual completion", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");

  const redis = createClient({ url: REDIS_URL });
  const sub = createClient({ url: REDIS_URL });
  await redis.connect();
  await sub.connect();

  const suffixA = crypto.randomBytes(6).toString("hex");
  const suffixB = crypto.randomBytes(6).toString("hex");
  const a = `00000000-0000-4000-8000-${suffixA}`;
  const b = `00000000-0000-4000-8000-${suffixB}`;

  let phase15Count = 0;
  let endCount = 0;

  try {
    await sub.subscribe(EVENT_CHANNEL, (raw) => {
      let event = null;
      try {
        event = JSON.parse(raw);
      } catch {
        event = null;
      }
      if (!event || !event.payload) return;
      if (event.payload.session_id !== [a, b].sort().join(":")) return;
      if (event.type === "ritual_phase_15") phase15Count += 1;
      if (event.type === "session_ended") endCount += 1;
    });

    const start = await post("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
    assert.equal(start.res.status, 200, start.text);
    assert.equal(start.body?.ok, true);
    const sessionId = start.body?.session_id;
    assert.ok(sessionId, "missing session_id");

    const sessionKey = `jls:session:${sessionId}`;
    const sessionReady = await waitFor(async () => {
      const exists = await redis.exists(sessionKey);
      if (!exists) return false;
      const [linkA, linkB] = await Promise.all([
        redis.get(`jls:avatarSession:${a}`),
        redis.get(`jls:avatarSession:${b}`),
      ]);
      return linkA === sessionId && linkB === sessionId;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(sessionReady, true, "session never became ready in Redis");

    const ff = await post(
      "/api/admin/session/fast-forward",
      { session_id: sessionId, delta_ms: 16 * 60 * 1000 },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(ff.res.status, 200, ff.text);
    assert.equal(ff.body?.ok, true);

    const tick1 = await post("/api/session/tick", { avatar: a, zone: "0:0" });
    assert.equal(tick1.res.status, 200, tick1.text);

    const phaseReady = await waitFor(async () => phase15Count === 1, {
      timeoutMs: 12_000,
      stepMs: 200,
    });
    assert.equal(phaseReady, true, "ritual_phase_15 event never observed");

    await sleep(1100);
    const tick2 = await post("/api/session/tick", { avatar: a, zone: "0:0" });
    assert.equal(tick2.res.status, 200, tick2.text);

    await sleep(1100);
    const end = await post("/api/session/end", { avatar: a });
    assert.equal(end.res.status, 200, end.text);

    const ended = await waitFor(async () => endCount >= 1, {
      timeoutMs: 12_000,
      stepMs: 200,
    });
    assert.equal(ended, true, "session_ended event never observed");

    await sleep(1200);

    const sessionHash = await redis.hGetAll(sessionKey);
    const recent = await redis.lRange(EVENT_LIST_KEY, 0, 25);
    const stateA = (await post("/api/event", { avatar: a, action: "hud_tick" })).body?.state;
    await sleep(900);
    const stateB = (await post("/api/event", { avatar: b, action: "hud_tick" })).body?.state;

    assert.equal(phase15Count, 1, `expected exactly one ritual_phase_15 event; recent=${recent.slice(0, 6).join("\\n")}`);
    assert.equal(Number(sessionHash.phase_15_awarded || 0), 1, "phase_15_awarded should be set");
    assert.equal(Number(sessionHash.ritual_awarded || 0), 0, "full ritual should not be awarded before 45 minutes");
    assert.equal(stateA?.rituals, 0, "phase 15 should not increment rituals");
    assert.equal(stateB?.rituals, 0, "phase 15 should not increment rituals");
  } finally {
    try {
      await sub.unsubscribe(EVENT_CHANNEL);
    } catch {}
    await sub.quit();
    await redis.quit();
  }
});
