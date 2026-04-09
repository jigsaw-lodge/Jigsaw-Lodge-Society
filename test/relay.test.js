"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: sleep } = require("node:timers/promises");
const { createClient } = require("redis");
const WebSocket = require("ws");

const RELAY_ENTRY = path.resolve(__dirname, "..", "wsrelay.js");
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const EVENT_CHANNEL = "events_channel";

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

async function waitFor(fn, { timeoutMs = 10_000, stepMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(stepMs);
  }
  return null;
}

async function readHealth(port) {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();
  return { status: res.status, body };
}

function createSocketCollector(socket) {
  const messages = [];
  const waiters = [];

  const onMessage = (raw) => {
    let parsed = null;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    messages.push(parsed);

    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const waiter = waiters[i];
      if (!waiter.predicate(parsed)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(i, 1);
      waiter.resolve(parsed);
    }
  };

  socket.on("message", onMessage);

  return {
    async waitFor(predicate, timeoutMs = 8_000) {
      for (const message of messages) {
        if (predicate(message)) return message;
      }

      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((entry) => entry.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("timed out waiting for websocket message"));
        }, timeoutMs);

        waiters.push({ predicate, resolve, timer });
      });
    },
    async expectNone(predicate, timeoutMs = 750) {
      try {
        await this.waitFor(predicate, timeoutMs);
        return false;
      } catch {
        return true;
      }
    },
    dispose() {
      socket.off("message", onMessage);
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
    },
  };
}

async function startRelay(port) {
  const child = spawn(process.execPath, [RELAY_ENTRY], {
    env: {
      ...process.env,
      REDIS_URL,
      WS_PORT: String(port),
      WS_HOST: "127.0.0.1",
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
      const { status, body } = await readHealth(port);
      if (status === 200 && body?.ok === 1) return true;
    } catch {}
    return false;
  }, { timeoutMs: 12_000, stepMs: 150 });

  if (!ready) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
    throw new Error(`relay failed to boot on port ${port}\n${logs}`);
  }

  return {
    child,
    logs: () => logs,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    },
  };
}

async function connectClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const collector = createSocketCollector(socket);

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  const connected = await collector.waitFor((message) => message?.type === "connected");
  return { socket, collector, connected };
}

function publishEvent(redis, type, payload = {}) {
  const event = {
    id: `relay-${type}-${crypto.randomBytes(4).toString("hex")}`,
    type,
    payload,
    contract_version: 3,
    created_at: Date.now(),
  };

  return {
    event,
    send: () => redis.publish(EVENT_CHANNEL, JSON.stringify(event)),
  };
}

test("relay supports connect, subscribe, ping, reconnect, and feed envelopes for major events", async (t) => {
  const port = await getFreePort();
  const relay = await startRelay(port);
  t.after(async () => {
    await relay.stop();
  });

  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  t.after(async () => {
    await redis.quit();
  });

  const first = await connectClient(port);
  t.after(() => {
    first.collector.dispose();
    if (first.socket.readyState === WebSocket.OPEN || first.socket.readyState === WebSocket.CONNECTING) {
      first.socket.close();
    }
  });
  assert.equal(first.connected?.service, "wsRelay");

  first.socket.send(JSON.stringify({ type: "subscribe" }));
  const subscribed = await first.collector.waitFor((message) => message?.type === "subscribed");
  assert.equal(subscribed?.channel, EVENT_CHANNEL);

  first.socket.send(JSON.stringify({ type: "ping" }));
  const pong = await first.collector.waitFor((message) => message?.type === "pong");
  assert.equal(typeof pong?.time, "number");

  const firstHealth = await waitFor(async () => {
    const health = await readHealth(port);
    return health.body?.clients === 1 ? health : null;
  });
  assert.equal(firstHealth?.body?.clients, 1);

  first.socket.close();
  first.collector.dispose();
  await waitFor(async () => {
    const health = await readHealth(port);
    return health.body?.clients === 0 ? health : null;
  });

  const second = await connectClient(port);
  t.after(() => {
    second.collector.dispose();
    if (second.socket.readyState === WebSocket.OPEN || second.socket.readyState === WebSocket.CONNECTING) {
      second.socket.close();
    }
  });
  second.socket.send(JSON.stringify({ type: "subscribe", channel: EVENT_CHANNEL }));
  await second.collector.waitFor((message) => message?.type === "subscribed");

  const secondHealth = await waitFor(async () => {
    const health = await readHealth(port);
    return health.body?.clients === 1 ? health : null;
  });
  assert.equal(secondHealth?.body?.clients, 1);

  const scenarios = [
    {
      type: "artifact_spawn",
      payload: { type: "sigil", artifact_id: "artifact-001" },
      expectedFeed: "▵ Artifact sigil now charges the scene ▵",
      parcel: false,
    },
    {
      type: "honey_used",
      payload: { avatar: "AVA-1", type: "royal" },
      expectedFeed: "AVA-1 consumed royal",
      parcel: false,
    },
    {
      type: "battle_result",
      payload: { winner: "AVA-2", zone: "battle-lane" },
      expectedFeed: "AVA-2 won the battle",
      parcel: true,
    },
    {
      type: "session_started",
      payload: { avatar_a: "AVA-3", avatar_b: "AVA-4" },
      expectedFeed: "AVA-3 and AVA-4 began a ritual",
      parcel: false,
    },
    {
      type: "ritual_phase_15",
      payload: { avatar_a: "AVA-5" },
      expectedFeed: "AVA-5 crossed the phase-15 threshold",
      parcel: false,
    },
    {
      type: "session_timeout",
      payload: { avatar_a: "AVA-6" },
      expectedFeed: "AVA-6 let the ritual go idle",
      parcel: false,
    },
    {
      type: "session_ended",
      payload: { avatar_a: "AVA-7", zone: "ritual-lane", ritual_complete: 1 },
      expectedFeed: "AVA-7 completed a ritual",
      parcel: true,
    },
  ];

  for (const scenario of scenarios) {
    const published = publishEvent(redis, scenario.type, scenario.payload);
    await published.send();

    const raw = await second.collector.waitFor(
      (message) => message?.type === scenario.type && message?.id === published.event.id
    );
    assert.equal(raw?.payload?.zone || "", scenario.payload.zone || "");

    const feed = await second.collector.waitFor(
      (message) => message?.type === "feed" && message?.payload?.event_id === published.event.id
    );
    assert.equal(feed?.payload?.event_type, scenario.type);
    assert.equal(feed?.payload?.message, scenario.expectedFeed);

    if (!scenario.parcel) continue;

    const parcel = await second.collector.waitFor(
      (message) => message?.type === "parcel_event" && message?.payload?.event_id === published.event.id
    );
    assert.equal(parcel?.payload?.event_type, scenario.type);
    assert.equal(parcel?.payload?.message, scenario.expectedFeed);
  }
});

test("relay does not emit feed or parcel envelopes for incomplete session_ended events", async (t) => {
  const port = await getFreePort();
  const relay = await startRelay(port);
  t.after(async () => {
    await relay.stop();
  });

  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  t.after(async () => {
    await redis.quit();
  });

  const client = await connectClient(port);
  t.after(() => {
    client.collector.dispose();
    if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
      client.socket.close();
    }
  });

  client.socket.send(JSON.stringify({ type: "subscribe" }));
  await client.collector.waitFor((message) => message?.type === "subscribed");

  const published = publishEvent(redis, "session_ended", {
    avatar_a: "AVA-8",
    zone: "quiet-room",
    ritual_complete: 0,
  });
  await published.send();

  const raw = await client.collector.waitFor(
    (message) => message?.type === "session_ended" && message?.id === published.event.id
  );
  assert.equal(raw?.payload?.ritual_complete, 0);

  const noFeed = await client.collector.expectNone(
    (message) => message?.type === "feed" && message?.payload?.event_id === published.event.id
  );
  assert.equal(noFeed, true, `unexpected feed emitted\n${relay.logs()}`);

  const noParcel = await client.collector.expectNone(
    (message) => message?.type === "parcel_event" && message?.payload?.event_id === published.event.id
  );
  assert.equal(noParcel, true, `unexpected parcel event emitted\n${relay.logs()}`);
});
