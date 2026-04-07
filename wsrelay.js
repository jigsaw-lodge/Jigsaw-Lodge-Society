"use strict";

// JIGSAW LODGE SOCIETY — WEBSOCKET BROADCAST RELAY
// Redis subscriber → WebSocket push layer
// Keeps the API stateless and the client feedback live.

require("dotenv").config();

const http = require("http");
const pino = require("pino");
const { createClient } = require("redis");
const { WebSocketServer } = require("ws");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const WS_PORT = Number(process.env.WS_PORT || 3010);
const WS_HOST = process.env.WS_HOST || "0.0.0.0";
const EVENT_CHANNEL = "events_channel";

const REDIS_RETRY_LIMIT = 3;
const HEARTBEAT_MS = 30_000;

const PARCEL_BROADCAST_EVENTS = new Set(["ritual_complete", "surge", "battle_result"]);

const FEED_MESSAGE_HANDLERS = {
  ritual_complete: (payload) => {
    const actor = payload.winner || payload.avatar || (payload.participants && payload.participants[0]);
    return actor ? `${actor} completed a ritual` : "A ritual completed";
  },
  surge: (payload) => {
    const actor = payload.avatar || payload.winner || (payload.participants && payload.participants[0]);
    return actor ? `${actor} triggered a surge ⚡` : "A surge just occurred ⚡";
  },
  battle_result: (payload) => {
    const winner = payload.winner;
    if (winner) return `${winner} won the battle`;
    if (payload.message) return payload.message;
    return "A battle just resolved";
  },
  honey_used: (payload) => {
    const actor = payload.avatar || payload.owner_id || payload.target;
    const honey = payload.type || payload.honey || "honey";
    return actor ? `${actor} consumed ${honey}` : `${honey} was consumed`;
  },
  zone_flip: (payload) => {
    const order = payload.order || payload.owner || "an order";
    return `Zone claimed by ${order}`;
  },
  artifact_spawn: (payload) => {
    const artifact = payload.type || payload.artifact_id || "an artifact";
    return `▵ Artifact ${artifact} now charges the scene ▵`;
  },
  ascension: (payload) => {
    const actor = payload.avatar || payload.winner || payload.player;
    return actor ? `▵ ${actor} HAS BEEN RECOGNIZED ▵` : "▵ The ascended are called ▵";
  },
};

const redis = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy(retries) {
      return Math.min(50 * retries, 1000);
    },
  },
});

const sub = redis.duplicate();

redis.on("error", (err) => logger.error({ err }, "redis error"));
sub.on("error", (err) => logger.error({ err }, "redis subscriber error"));

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({
      ok: 1,
      service: "wsRelay",
      redis: redis.isOpen ? 1 : 0,
      clients: wss.clients.size,
      time: Date.now(),
    }));
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server });

function now() {
  return Date.now();
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function connectRedisWithRetry(client, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= REDIS_RETRY_LIMIT; attempt += 1) {
    try {
      if (!client.isOpen) {
        await client.connect();
      }
      return true;
    } catch (err) {
      lastError = err;
      logger.error({ label, attempt, err: err.message }, "redis connection attempt failed");
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  logger.error({ label, err: lastError?.message || "unknown" }, "redis connection failed after retries");
  return false;
}

function sendToServer(serverInstance, message) {
  if (!serverInstance) return;
  const raw = typeof message === "string" ? message : safeJsonStringify(message);
  if (!raw) return;

  for (const client of serverInstance.clients) {
    if (client.readyState !== client.OPEN) continue;
    try {
      client.send(raw);
    } catch (err) {
      logger.error({ err: err.message }, "websocket send failed");
    }
  }
}

function broadcast(message) {
  sendToServer(wss, message);
}

function broadcastEnvelope(type, payload = {}) {
  const envelope = {
    type,
    payload,
    created_at: now(),
  };

  const raw = safeJsonStringify(envelope);
  if (!raw) return;
  broadcast(raw);
}

function createFeedMessage(event) {
  if (!event || !event.type) return null;
  const handler = FEED_MESSAGE_HANDLERS[event.type];
  if (typeof handler !== "function") return null;
  return handler(event.payload || {});
}

function handlePublishedEvent(rawMessage) {
  if (!rawMessage) return;

  broadcast(rawMessage);

  const event = safeJsonParse(rawMessage);
  if (!event || typeof event !== "object") return;

  const feedMessage = createFeedMessage(event);
  if (feedMessage) {
    broadcastEnvelope("feed", {
      event_type: event.type,
      event_id: event.id || "",
      payload: event.payload || {},
      message: feedMessage,
      created_at: event.created_at || now(),
    });
  }

  if (PARCEL_BROADCAST_EVENTS.has(event.type)) {
    broadcastEnvelope("parcel_event", {
      event_type: event.type,
      event_id: event.id || "",
      zone: event.payload?.zone || "",
      message: feedMessage || `${event.type} occurred`,
      payload: event.payload || {},
      created_at: event.created_at || now(),
    });
  }
}

function setupHeartbeat() {
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        try {
          client.terminate();
        } catch {}
        continue;
      }

      client.isAlive = false;
      try {
        client.ping();
      } catch {
        // ignore ping failures; socket will be reaped on next cycle
      }
    }
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(heartbeat));
}

wss.on("connection", (socket, req) => {
  socket.isAlive = true;
  socket.lastSeenAt = now();

  const clientInfo = {
    remoteAddress: req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  };

  socket.send(
    JSON.stringify({
      type: "connected",
      service: "wsRelay",
      contract_version: 3,
      time: now(),
    })
  );

  logger.info({ clientInfo }, "websocket client connected");

  socket.on("pong", () => {
    socket.isAlive = true;
    socket.lastSeenAt = now();
  });

  socket.on("message", (raw) => {
    const text = raw.toString("utf8");
    const message = safeJsonParse(text);

    if (!message || typeof message !== "object") {
      socket.send(JSON.stringify({ type: "error", error: "invalid_json" }));
      return;
    }

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", time: now() }));
      return;
    }

    if (message.type === "subscribe") {
      socket.send(JSON.stringify({
        type: "subscribed",
        channel: message.channel || "events_channel",
      }));
      return;
    }

    socket.send(JSON.stringify({ type: "ack", time: now() }));
  });

  socket.on("close", () => {
    logger.info({ clientInfo }, "websocket client disconnected");
  });

  socket.on("error", (err) => {
    logger.error({ err: err.message }, "websocket socket error");
  });
});

async function subscribeToEvents() {
  await sub.subscribe(EVENT_CHANNEL, (message) => {
    handlePublishedEvent(message);
  });
}

async function boot() {
  const redisReady = await connectRedisWithRetry(redis, "primary");
  if (!redisReady) {
    process.exit(1);
  }

  const subReady = await connectRedisWithRetry(sub, "subscriber");
  if (!subReady) {
    process.exit(1);
  }

  await subscribeToEvents();
  setupHeartbeat();

  server.listen(WS_PORT, WS_HOST, () => {
    logger.info(
      {
        ws: `ws://${WS_HOST}:${WS_PORT}`,
        redis: REDIS_URL,
        channel: EVENT_CHANNEL,
      },
      "ws relay online"
    );
  });
}

process.on("SIGINT", async () => {
  try {
    await sub.unsubscribe(EVENT_CHANNEL);
  } catch {}
  try {
    await sub.quit();
  } catch {}
  try {
    await redis.quit();
  } catch {}
  try {
    server.close();
  } catch {}
  process.exit(0);
});

process.on("SIGTERM", async () => {
  try {
    await sub.unsubscribe(EVENT_CHANNEL);
  } catch {}
  try {
    await sub.quit();
  } catch {}
  try {
    await redis.quit();
  } catch {}
  try {
    server.close();
  } catch {}
  process.exit(0);
});

boot().catch((err) => {
  logger.error({ err: err.message }, "ws relay boot failed");
  process.exit(1);
});
