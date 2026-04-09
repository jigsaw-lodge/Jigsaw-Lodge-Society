/* eslint-disable no-undef */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

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
  const spawn = await postJsonWithHeaders(
    "/api/admin/artifact/spawn",
    {
      artifact_id: artifactId,
      type: "sigil",
      effect_type: "xp_boost",
      power_level: 3,
      zone: "0:0",
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
