"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHARED_TOKEN = process.env.JLS_SHARED_TOKEN || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

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

test("battle resolve awards pentacles and appears in /api/world battle summary", async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const winner = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const loser = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;

  try {
    const syncWinner = await post("/api/sync", { avatar: winner, order: "architect", zone: "battle-lane" });
    const syncLoser = await post("/api/sync", { avatar: loser, order: "black_sun", zone: "battle-lane" });
    assert.equal(syncWinner.res.status, 200, syncWinner.text);
    assert.equal(syncLoser.res.status, 200, syncLoser.text);

    const playersReady = await waitFor(async () => {
      const [winnerOrder, loserOrder] = await Promise.all([
        redis.hGet(`jls:player:${winner}`, "order"),
        redis.hGet(`jls:player:${loser}`, "order"),
      ]);
      return winnerOrder === "architect" && loserOrder === "black_sun";
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(playersReady, true, "players never synced into Redis with orders");

    const resolve = await post("/api/battle/resolve", { winner, loser });
    assert.equal(resolve.res.status, 200, resolve.text);
    assert.equal(resolve.body?.ok, true);
    assert.equal(resolve.body?.queued, true);

    const rewardsReady = await waitFor(async () => {
      const [winnerPentacles, loserPentacles] = await Promise.all([
        redis.hGet(`jls:player:${winner}`, "pentacles"),
        redis.hGet(`jls:player:${loser}`, "pentacles"),
      ]);
      return Number(winnerPentacles || 0) >= 5 && Number(loserPentacles || 0) >= 2.5;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(rewardsReady, true, "battle rewards never landed in Redis");

    const worldReady = await waitFor(async () => {
      const { res, body } = await getJson("/api/world");
      if (res.status !== 200) return false;
      const events = body?.world?.events || [];
      const battle = body?.world?.battle || {};
      const sawEvent = events.some(
        (event) => event?.type === "battle_result"
          && event.payload?.winner === winner
          && event.payload?.loser === loser
      );
      const summary = String(battle.summary || "");
      return sawEvent && summary.includes(winner) && summary.includes(loser);
    }, { timeoutMs: 12_000, stepMs: 250 });
    assert.equal(worldReady, true, "battle result never surfaced in /api/world");
  } finally {
    await redis.quit();
  }
});
