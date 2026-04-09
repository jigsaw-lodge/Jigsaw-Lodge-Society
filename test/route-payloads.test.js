"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHARED_TOKEN = process.env.JLS_SHARED_TOKEN || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const DAILY_UTC_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

function utcDate() {
  return DAILY_UTC_FMT.format(new Date());
}

function utcWeekKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const week = Math.ceil((((now - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function utcMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function utcQuarterKey() {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
}

test("honey route preserves the requested honey type for the worker", async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const avatar = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;

  try {
    const honey = await post("/api/honey/use", { avatar, type: "dev", zone: "honey-lane" });
    assert.equal(honey.res.status, 200, honey.text);
    assert.equal(honey.body?.ok, true);
    assert.equal(honey.body?.queued, true);

    const applied = await waitFor(async () => {
      const [type, stage] = await Promise.all([
        redis.hGet(`jls:player:${avatar}`, "honey_type"),
        redis.hGet(`jls:player:${avatar}`, "honey_stage"),
      ]);
      return type === "dev" && Number(stage || 0) === 1;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(applied, true, "dev honey never applied");
  } finally {
    await redis.quit();
  }
});

test("purchase route preserves amount/type so worker awards pentacles", async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const avatar = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;

  try {
    const purchase = await post("/api/purchase", { avatar, amount: 3, type: "pentacle" });
    assert.equal(purchase.res.status, 200, purchase.text);
    assert.equal(purchase.body?.ok, true);
    assert.equal(purchase.body?.queued, true);

    const applied = await waitFor(async () => {
      const pentacles = await redis.hGet(`jls:player:${avatar}`, "pentacles");
      return Number(pentacles || 0) >= 3;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(applied, true, "purchase never updated pentacles");
  } finally {
    await redis.quit();
  }
});

test("challenge claim preserves tier so the worker can award the matching reward", async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const avatar = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const playerKey = `jls:player:${avatar}`;

  try {
    await redis.hSet(playerKey, {
      avatar,
      rituals_today: "5",
      rituals_week: "25",
      rituals_month: "100",
      rituals_quarter: "300",
      last_daily_reset: utcDate(),
      last_weekly_reset: utcWeekKey(),
      last_monthly_reset: utcMonthKey(),
      last_quarterly_reset: utcQuarterKey(),
      last_seen: String(Date.now()),
      last_action_at: String(Date.now()),
    });

    const claim = await post("/api/challenges/claim", { avatar, tier: "daily" });
    assert.equal(claim.res.status, 200, claim.text);
    assert.equal(claim.body?.ok, true);
    assert.equal(claim.body?.queued, true);

    const applied = await waitFor(async () => {
      const [pct, until] = await Promise.all([
        redis.hGet(playerKey, "challenge_boost_pct"),
        redis.hGet(playerKey, "challenge_boost_until"),
      ]);
      return Number(pct || 0) === 10 && Number(until || 0) > 0;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(applied, true, "daily challenge reward never applied");
  } finally {
    await redis.quit();
  }
});
