"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: sleep } = require("node:timers/promises");
const { createClient } = require("redis");

const { computeRequestSignature } = require("../services/auth");

const SERVER_ENTRY = path.resolve(__dirname, "..", "server.js");
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const DB_HOST = process.env.DB_HOST || "db";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASS = process.env.DB_PASS || "password";
const DB_NAME = process.env.DB_NAME || "jls";
const DB_PORT = process.env.DB_PORT || "5432";

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function waitFor(fn, { timeoutMs = 12_000, stepMs = 150 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(stepMs);
  }
  return null;
}

async function postJson(baseUrl, pathName, payload) {
  const res = await fetch(`${baseUrl}${pathName}`, {
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

function signedPayload(secret, pathName, body, routeAction) {
  const payload = {
    ...body,
    timestamp: Math.floor(Date.now() / 1000),
    request_id: `req-${crypto.randomBytes(6).toString("hex")}`,
  };
  payload.signature = computeRequestSignature(secret, { method: "POST", path: pathName }, payload, routeAction);
  return payload;
}

async function startSignedServer(secret) {
  const port = await getFreePort();
  const wsPort = await getFreePort();
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      WS_PORT: String(wsPort),
      ADMIN_TOKEN: "signed-test-admin",
      JLS_SIGNING_SECRET: secret,
      JLS_REQUIRE_SIGNED_REQUESTS: "1",
      JLS_SHARED_TOKEN: "",
      REDIS_URL,
      DB_HOST,
      DB_USER,
      DB_PASS,
      DB_NAME,
      DB_PORT,
      LOG_LEVEL: "error",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });

  const ready = await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return body?.ok === 1 ? body : null;
    } catch {
      return null;
    }
  });

  if (!ready) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
    throw new Error(`signed test server failed to boot\n${logs}`);
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    logs: () => logs,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    },
  };
}

test("signed requests are accepted, replay-protected, and rejected when stale or missing", async (t) => {
  const secret = "signed-secret-001";
  const server = await startSignedServer(secret);
  t.after(async () => {
    await server.stop();
  });

  const avatar = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const objectId = `hud-${crypto.randomBytes(4).toString("hex")}`;

  const unsigned = await postJson(server.baseUrl, "/api/event", {
    avatar,
    object: objectId,
    action: "hud_tick",
  });
  assert.equal(unsigned.res.status, 401, unsigned.text);
  assert.equal(unsigned.body?.error, "missing_signature");

  const signed = signedPayload(secret, "/api/event", {
    avatar,
    object: objectId,
    action: "hud_tick",
  }, "hud_tick");
  const accepted = await postJson(server.baseUrl, "/api/event", signed);
  assert.equal(accepted.res.status, 200, accepted.text);
  assert.equal(accepted.body?.ok, true);

  const replay = await postJson(server.baseUrl, "/api/event", signed);
  assert.equal(replay.res.status, 409, replay.text);
  assert.equal(replay.body?.error, "replay_detected");

  const stale = signedPayload(secret, "/api/event", {
    avatar,
    object: objectId,
    action: "hud_tick",
    timestamp: Math.floor(Date.now() / 1000) - 900,
  }, "hud_tick");
  stale.timestamp = Math.floor(Date.now() / 1000) - 900;
  stale.signature = computeRequestSignature(secret, { method: "POST", path: "/api/event" }, stale, "hud_tick");
  const staleResp = await postJson(server.baseUrl, "/api/event", stale);
  assert.equal(staleResp.res.status, 401, staleResp.text);
  assert.equal(staleResp.body?.error, "stale_signature");
});

test("legacy signed furniture sit and unsit bridge into session_start and session_end correctly", async (t) => {
  const secret = "signed-secret-002";
  const server = await startSignedServer(secret);
  t.after(async () => {
    await server.stop();
  });

  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  t.after(async () => {
    await redis.quit();
  });

  const avatar = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const partner = `00000000-0000-4000-8000-${crypto.randomBytes(6).toString("hex")}`;
  const objectId = `chair-${crypto.randomBytes(4).toString("hex")}`;
  const zone = `chair-${crypto.randomBytes(4).toString("hex")}`;

  const sit = signedPayload(secret, "/api/event", {
    avatar,
    partner,
    object: objectId,
    zone,
    order: "architect",
    action: "sit",
  }, "sit");
  const started = await postJson(server.baseUrl, "/api/event", sit);
  assert.equal(started.res.status, 200, started.text);
  assert.equal(started.body?.ok, true);
  assert.equal(started.body?.routed_as, "session_start");
  assert.equal(typeof started.body?.session_id, "string");

  const sessionId = await waitFor(async () => {
    const value = await redis.get(`jls:avatarSession:${avatar}`);
    return value || null;
  });
  assert.equal(sessionId, started.body?.session_id, server.logs());

  const tick = signedPayload(secret, "/api/session/tick", {
    avatar,
    zone,
    order: "architect",
  }, "session_tick");
  const tickResp = await postJson(server.baseUrl, "/api/session/tick", tick);
  assert.equal(tickResp.res.status, 200, tickResp.text);
  assert.equal(tickResp.body?.ok, true);

  const unsit = signedPayload(secret, "/api/event", {
    avatar,
    object: objectId,
    action: "unsit",
  }, "unsit");
  const ended = await postJson(server.baseUrl, "/api/event", unsit);
  assert.equal(ended.res.status, 200, ended.text);
  assert.equal(ended.body?.ok, true);
  assert.equal(ended.body?.routed_as, "session_end");

  const cleared = await waitFor(async () => {
    const value = await redis.get(`jls:avatarSession:${avatar}`);
    return value === null;
  });
  assert.equal(cleared, true, server.logs());
});
