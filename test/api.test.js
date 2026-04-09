/* eslint-disable no-undef */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, text, body };
}

async function getJsonWithHeaders(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, text, body };
}

async function postJson(path, payload) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

async function postJsonWithHeaders(path, payload, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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

test("GET /api/health returns ok", async () => {
  const { res, body, text } = await getJson("/api/health");
  assert.equal(res.status, 200, text);
  assert.equal(body?.ok, 1);
});

test("GET /api/worker/heartbeat returns ok", async () => {
  const { res, body, text } = await getJson("/api/worker/heartbeat");
  assert.equal(res.status, 200, text);
  assert.equal(body?.ok, 1);
});

test("GET /api/world returns world.events array", async () => {
  const { res, body, text } = await getJson("/api/world");
  assert.equal(res.status, 200, text);
  assert.ok(body?.world);
  assert.equal(typeof body?.world?.generated_at, "number", "world.generated_at should be a number");
  assert.ok(Array.isArray(body?.world?.events), "world.events should be an array");
  assert.ok(body?.world?.battle, "world.battle should exist");
  assert.ok(Array.isArray(body?.world?.players), "world.players should be an array");
  assert.ok(Array.isArray(body?.world?.pairs), "world.pairs should be an array");
  assert.ok(Array.isArray(body?.world?.sessions), "world.sessions should be an array");
  assert.ok(Array.isArray(body?.world?.artifacts), "world.artifacts should be an array");
  assert.ok(typeof body?.world?.metrics === "object", "world.metrics should be an object");
  assert.equal(typeof body?.world?.metrics?.active_sessions, "number");
  assert.equal(typeof body?.world?.metrics?.active_players_5m, "number");
  assert.equal(typeof body?.world?.metrics?.treasury_total_l, "number");
  assert.equal(typeof body?.world?.battle?.progress, "number");
  assert.equal(typeof body?.world?.battle?.ticker, "string");
  assert.equal(typeof body?.world?.battle?.summary, "string");
});

test("GET /api/world includes active artifacts after admin spawn", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");
  const artifactId = `api-world-artifact-${crypto.randomBytes(5).toString("hex")}`;
  const zone = `world-${crypto.randomBytes(4).toString("hex")}`;
  try {
    const spawn = await postJsonWithHeaders(
      "/api/admin/artifact/spawn",
      {
        artifact_id: artifactId,
        type: "sigil",
        effect_type: "xp_boost",
        power_level: 3,
        zone,
        duration: 3600,
        owner_id: "00000000-0000-4000-8000-00000000feed",
      },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(spawn.res.status, 200, spawn.text);
    assert.equal(spawn.body?.ok, true);

    const found = await waitFor(async () => {
      const { res, body } = await getJson("/api/world");
      if (res.status !== 200) return false;
      return Array.isArray(body?.world?.artifacts)
        && body.world.artifacts.some((artifact) => artifact.artifact_id === artifactId);
    }, { timeoutMs: 12_000, stepMs: 250 });

    assert.equal(found, true, "spawned artifact never appeared in /api/world");
  } finally {
    await postJsonWithHeaders(
      `/api/admin/artifact/${artifactId}/expire`,
      {},
      { "X-Admin-Token": ADMIN_TOKEN }
    ).catch(() => {});
  }
});

test("artifact admin tools list, inspect, and expire artifacts", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");
  const artifactId = `admin-artifact-${crypto.randomBytes(5).toString("hex")}`;

  const spawn = await postJsonWithHeaders(
    "/api/admin/artifact/spawn",
    {
      artifact_id: artifactId,
      type: "relic",
      effect_type: "ritual_modifier",
      power_level: 2,
      zone: "0:0",
      duration: 3600,
      owner_id: "00000000-0000-4000-8000-00000000beef",
    },
    { "X-Admin-Token": ADMIN_TOKEN }
  );
  assert.equal(spawn.res.status, 200, spawn.text);
  assert.equal(spawn.body?.ok, true);

  const listed = await waitFor(async () => {
    const { res, body } = await getJsonWithHeaders(
      "/api/admin/artifacts?active=true&limit=25",
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    if (res.status !== 200) return false;
    return Array.isArray(body?.artifacts)
      && body.artifacts.some((artifact) => artifact.artifact_id === artifactId && artifact.active === true);
  }, { timeoutMs: 12_000, stepMs: 250 });
  assert.equal(listed, true, "spawned artifact never appeared in admin list");

  const inspect = await getJsonWithHeaders(
    `/api/admin/artifact/${artifactId}`,
    { "X-Admin-Token": ADMIN_TOKEN }
  );
  assert.equal(inspect.res.status, 200, inspect.text);
  assert.equal(inspect.body?.ok, true);
  assert.equal(inspect.body?.artifact?.artifact_id, artifactId);
  assert.equal(inspect.body?.artifact?.active, true);

  const expire = await postJsonWithHeaders(
    `/api/admin/artifact/${artifactId}/expire`,
    {},
    { "X-Admin-Token": ADMIN_TOKEN }
  );
  assert.equal(expire.res.status, 200, expire.text);
  assert.equal(expire.body?.ok, true);
  assert.equal(expire.body?.queued, true);

  const expired = await waitFor(async () => {
    const [inspectAgain, world] = await Promise.all([
      getJsonWithHeaders(`/api/admin/artifact/${artifactId}`, { "X-Admin-Token": ADMIN_TOKEN }),
      getJson("/api/world"),
    ]);
    if (inspectAgain.res.status !== 200 || world.res.status !== 200) return false;
    const inactive = inspectAgain.body?.artifact?.active === false;
    const absentFromWorld = Array.isArray(world.body?.world?.artifacts)
      && !world.body.world.artifacts.some((artifact) => artifact.artifact_id === artifactId);
    return inactive && absentFromWorld;
  }, { timeoutMs: 12_000, stepMs: 250 });

  assert.equal(expired, true, "artifact never expired cleanly through admin tools");
});

test("naturally expired artifacts disappear from /api/world and stop boosting session tick XP", async () => {
  assert.ok(ADMIN_TOKEN, "ADMIN_TOKEN not set in test environment");
  const redis = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
  await redis.connect();

  const artifactId = `artifact-expiry-${crypto.randomBytes(5).toString("hex")}`;
  const a = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const b = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const zone = `expiry-${crypto.randomBytes(4).toString("hex")}`;
  let sessionId = "";

  try {
    const spawn = await postJsonWithHeaders(
      "/api/admin/artifact/spawn",
      {
        artifact_id: artifactId,
        type: "pulse",
        effect_type: "xp_boost",
        power_level: 1,
        zone,
        duration: 3,
        owner_id: "00000000-0000-4000-8000-00000000fade",
      },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(spawn.res.status, 200, spawn.text);
    assert.equal(spawn.body?.ok, true);

    const visible = await waitFor(async () => {
      const { res, body } = await getJson("/api/world");
      if (res.status !== 200) return false;
      return Array.isArray(body?.world?.artifacts)
        && body.world.artifacts.some((artifact) => artifact.artifact_id === artifactId);
    }, { timeoutMs: 12_000, stepMs: 250 });
    assert.equal(visible, true, "artifact never appeared in /api/world");

    const start = await postJson("/api/session/start", { avatar: a, partner: b, zone });
    assert.equal(start.res.status, 200, start.text);
    sessionId = start.body?.session_id || "";
    assert.ok(sessionId, "missing session_id");

    const sessionReady = await waitFor(async () => {
      const hash = await redis.hGetAll(`jls:session:${sessionId}`);
      return hash && Object.keys(hash).length > 0;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(sessionReady, true, "session never became ready");

    const xpBeforeTick1 = Number((await redis.hGet(`jls:player:${a}`, "xp")) || 0);

    const ff1 = await postJsonWithHeaders(
      "/api/admin/session/fast-forward",
      { session_id: sessionId, delta_ms: 61 * 1000 },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(ff1.res.status, 200, ff1.text);

    const tick1 = await postJson("/api/session/tick", { avatar: a, zone });
    assert.equal(tick1.res.status, 200, tick1.text);

    const xp1Ready = await waitFor(async () => {
      const xp = Number((await redis.hGet(`jls:player:${a}`, "xp")) || 0);
      return xp > xpBeforeTick1;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(xp1Ready, true, "artifact-boosted XP was never recorded");
    const xpAfterTick1 = Number((await redis.hGet(`jls:player:${a}`, "xp")) || 0);

    await sleep(3600);

    const pruned = await waitFor(async () => {
      const { res, body } = await getJson("/api/world");
      if (res.status !== 200) return false;
      return Array.isArray(body?.world?.artifacts)
        && !body.world.artifacts.some((artifact) => artifact.artifact_id === artifactId);
    }, { timeoutMs: 12_000, stepMs: 300 });
    assert.equal(pruned, true, "expired artifact never dropped out of /api/world");

    const ff2 = await postJsonWithHeaders(
      "/api/admin/session/fast-forward",
      { session_id: sessionId, delta_ms: 61 * 1000 },
      { "X-Admin-Token": ADMIN_TOKEN }
    );
    assert.equal(ff2.res.status, 200, ff2.text);

    await sleep(900);
    const tick2 = await postJson("/api/session/tick", { avatar: a, zone });
    assert.equal(tick2.res.status, 200, tick2.text);

    const xp2Ready = await waitFor(async () => {
      const xp = Number((await redis.hGet(`jls:player:${a}`, "xp")) || 0);
      return xp > xpAfterTick1;
    }, { timeoutMs: 12_000, stepMs: 200 });
    assert.equal(xp2Ready, true, "post-expiry XP was never recorded");
    const xpAfterTick2 = Number((await redis.hGet(`jls:player:${a}`, "xp")) || 0);

    const firstGain = xpAfterTick1 - xpBeforeTick1;
    const secondGain = xpAfterTick2 - xpAfterTick1;

    assert.equal(firstGain, 624, `expected boosted first gain of 624 XP, got ${firstGain}`);
    assert.equal(secondGain, 312, `expected unboosted second gain of 312 XP, got ${secondGain}`);
  } finally {
    if (sessionId) {
      await postJson("/api/session/end", { avatar: a }).catch(() => {});
    }
    await postJsonWithHeaders(
      `/api/admin/artifact/${artifactId}/expire`,
      {},
      { "X-Admin-Token": ADMIN_TOKEN }
    ).catch(() => {});
    await redis.quit();
  }
});

test("POST /api/session/start queues and returns session_id", async () => {
  const a = "00000000-0000-4000-8000-0000000000a1";
  const b = "00000000-0000-4000-8000-0000000000a2";
  const { res, body, text } = await postJson("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
  assert.equal(res.status, 200, text);
  assert.equal(body?.ok, true);
  assert.ok(body?.session_id);
  assert.equal(body?.queued, true);
  assert.ok(body?.state, "expected state snapshot");
  assert.ok(body?.partner_state, "expected partner_state snapshot");
});

test("POST /api/session/tick returns state snapshot", async () => {
  const a = "00000000-0000-4000-8000-0000000000b1";
  const b = "00000000-0000-4000-8000-0000000000b2";
  await postJson("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
  await new Promise((r) => setTimeout(r, 900));
  const { res, body, text } = await postJson("/api/session/tick", { avatar: a, zone: "0:0" });
  assert.equal(res.status, 200, text);
  assert.equal(body?.ok, true);
  assert.equal(body?.queued, true);
  assert.ok(body?.state, "expected state snapshot");
});

test("POST /api/session/end returns state snapshot", async () => {
  const a = "00000000-0000-4000-8000-0000000000c1";
  const b = "00000000-0000-4000-8000-0000000000c2";
  await postJson("/api/session/start", { avatar: a, partner: b, zone: "0:0" });
  await new Promise((r) => setTimeout(r, 900));
  const { res, body, text } = await postJson("/api/session/end", { avatar: a });
  assert.equal(res.status, 200, text);
  assert.equal(body?.ok, true);
  assert.equal(body?.queued, true);
  assert.ok(body?.state, "expected state snapshot");
});
