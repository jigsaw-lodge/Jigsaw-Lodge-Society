/* eslint-disable no-undef */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

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
  assert.ok(Array.isArray(body?.world?.events), "world.events should be an array");
  assert.ok(body?.world?.battle, "world.battle should exist");
  assert.ok(Array.isArray(body?.world?.players), "world.players should be an array");
  assert.ok(Array.isArray(body?.world?.pairs), "world.pairs should be an array");
  assert.ok(Array.isArray(body?.world?.sessions), "world.sessions should be an array");
  assert.ok(typeof body?.world?.metrics === "object", "world.metrics should be an object");
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
