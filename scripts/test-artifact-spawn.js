#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { Pool } = require("pg");
const fetch = globalThis.fetch || require("undici").fetch;
const WebSocket = require("ws");
const { initializeRuntimeConfig } = require("../services/runtimeConfig");

initializeRuntimeConfig("artifact_smoke");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const WS_URL = process.env.WS_URL || "ws://localhost:3010";
const WS_TIMEOUT_MS = Number(process.env.WS_TIMEOUT_MS || 10000);

if (!ADMIN_TOKEN) {
  console.error("ADMIN_TOKEN is required to hit the admin artifact endpoint.");
  process.exit(1);
}

const artifactId = `test-artifact-${crypto.randomBytes(4).toString("hex")}-${Date.now()}`;
const payload = {
  artifact_id: artifactId,
  type: "smoke-test",
  effect_type: "xp_boost",
  power_level: 0.25,
  duration: 1800,
  location: process.env.TEST_ZONE || "0:0",
};

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function waitForArtifactFeed(artifactId) {
  let eventId = "";
  let artifactSeen = false;
  let feedSeen = false;
  let finished = false;
  let ws;
  let timeout;
  let resolvePromise;
  let rejectPromise;

  function cleanup(err) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (ws) {
      ws.removeAllListeners();
      ws.close();
    }
    if (err) {
      rejectPromise(err);
      return;
    }
    resolvePromise();
  }

  function checkCompletion() {
    if (artifactSeen && feedSeen) {
      cleanup();
    }
  }

  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;

    ws = new WebSocket(WS_URL);
    timeout = setTimeout(() => cleanup(new Error("timeout waiting for artifact feed")), WS_TIMEOUT_MS);

    ws.on("error", (err) => cleanup(err));
    ws.on("open", () => {
      console.log("WebSocket relay connected, waiting for artifact spawn feed...");
    });
    ws.on("message", (raw) => {
      const msg = safeJsonParse(raw);
      if (!msg) return;

      if (msg.type === "artifact_spawn" && (msg.id === eventId || msg.payload?.artifact_id === artifactId)) {
        artifactSeen = true;
        console.log("artifact_spawn event delivered through WS");
      }

      if (
        msg.type === "feed" &&
        msg.payload?.event_type === "artifact_spawn" &&
        (msg.payload?.event_id === eventId || msg.payload?.payload?.artifact_id === artifactId)
      ) {
        feedSeen = true;
        console.log("artifact feed envelope observed");
      }

      checkCompletion();
    });
  });

  return {
    promise,
    setEventId(id) {
      eventId = id || "";
      checkCompletion();
    },
  };
}

async function run() {
  const feedWatcher = waitForArtifactFeed(artifactId);

  const response = await fetch(`${BASE_URL}/api/admin/artifact/spawn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`artifact spawn failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const eventId = body?.event_id;
  if (!eventId) {
    throw new Error("artifact spawn response missing event_id");
  }
  console.log("spawn response", body);

  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "jls",
  });

  try {
    const { rows } = await pool.query(
      "SELECT artifact_id, active, expires_at FROM artifact_registry WHERE artifact_id = $1",
      [artifactId]
    );
    if (!rows.length) {
      throw new Error("artifact_registry row not found");
    }
    console.log("artifact persisted", rows[0]);

    const { rows: events } = await pool.query(
      `SELECT id, type FROM events WHERE type = 'artifact_registered' AND payload->>'artifact_id' = $1 ORDER BY created_at DESC LIMIT 1`,
      [artifactId]
    );
    if (!events.length) {
      throw new Error("artifact_registered event not observed yet");
    }
    console.log("artifact_registered event recorded", events[0]);

    const { rows: spawnEvents } = await pool.query(
      `SELECT id, type FROM events WHERE id = $1 AND type = 'artifact_spawn' LIMIT 1`,
      [eventId]
    );
    if (!spawnEvents.length) {
      throw new Error("artifact_spawn event not recorded");
    }
    console.log("artifact_spawn event recorded", spawnEvents[0]);
    feedWatcher.setEventId(eventId);
    await feedWatcher.promise;
  } finally {
    await pool.end();
  }
}

run()
  .then(() => {
    console.log("Artifact smoke test passed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
