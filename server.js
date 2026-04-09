"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const { createServer } = require("http");
const { WebSocketServer } = require("ws");
const pino = require("pino");

const { createRedisClient, connectWithRetry } = require("./services/redisClient");
const {
  publishEvent,
  EVENT_CHANNEL,
  EVENT_LIST_KEY,
  nowMs,
  safeJsonParse,
} = require("./services/eventDispatcher");
const { buildBattleBar } = require("./services/battleBar");
const { getRequestToken, tokenAllowed, enforceRateLimit } = require("./services/auth");
const {
  sanitizeAvatar,
  sanitizeZone,
  sanitizeText,
  sanitizeAction,
} = require("./services/validation");
const db = require("./services/database");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const WS_PORT = Number(process.env.WS_PORT || 3010);

const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();
const ALLOWED_ORDERS = new Set(["architect", "eye", "black_sun", "neutral"]);
const ALLOWED_ARTIFACT_EFFECTS = new Set([
  "xp_boost",
  "ritual_modifier",
  "surge_amplification",
  "zone_pressure",
]);

const STATIC_CANDIDATES = [
  process.env.WEB_DIR,
  path.join(__dirname, "frontend"),
  path.join(__dirname, "web"),
  path.join(__dirname, "public"),
  path.join(__dirname, "..", "frontend"),
  path.join(__dirname, "..", "web"),
  path.join(__dirname, "..", "public"),
].filter(Boolean);

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

if (!ADMIN_TOKEN) {
  logger.error(
    "ADMIN_TOKEN must be set before starting the API so artifact tooling and guards are available (see docs/canonical-system-spec.md)."
  );
  process.exit(1);
}

const STATIC_ROOT = determineStaticRoot();
const redis = createRedisClient();
const redisSub = redis.duplicate();

redis.on("error", (err) => logger.error({ err }, "redis error"));
redisSub.on("error", (err) => logger.error({ err }, "redis subscriber error"));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const relayWss = new WebSocketServer({ port: WS_PORT });

function determineStaticRoot() {
  for (const candidate of STATIC_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch (err) {
      logger.warn({ err }, "static candidate invalid");
    }
  }
  return "";
}

function attachCors(app) {
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-JLS-Token");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
}

function validateApiToken(req, body) {
  const token = getRequestToken(req, body);
  if (!tokenAllowed(token)) {
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
}

function safeEventPayload(body) {
  return {
    avatar: sanitizeAvatar(body.avatar),
    action: sanitizeAction(body.action || body.type || ""),
    zone: sanitizeZone(body.zone),
    watchers: Number.isFinite(Number(body.watchers)) ? Number(body.watchers) : 0,
    group_tag: Number.isFinite(Number(body.group_tag)) ? Number(body.group_tag) : 0,
    object_id: sanitizeText(body.object_id || body.object || body.chair || "", ""),
    partner: sanitizeAvatar(body.partner || body.partner_avatar),
    ts: Math.floor(nowMs() / 1000),
  };
}

async function loadHudState(avatar) {
  // SL HUD expects these fields inside { state: { ... } }.
  // We treat Redis as the real-time truth layer and compute a couple derived fields.
  const key = `jls:player:${avatar}`;
  const hash = await redis.hGetAll(key);
  const xp = Number(hash.xp || 0);
  const level = Number(hash.level || 0);
  const rituals = Number(hash.rituals || 0);
  const bonds = Number(hash.bonds || 0);
  const watchers = Number(hash.watchers || 0);
  const pentacles = Number(hash.pentacles || 0);
  const honey = String(hash.honey || hash.honey_type || "");
  const honeyExpire = Number(hash.honey_expire || 0);
  const surgeReady = Number(hash.surge_ready || 0);

  // Canonical-ish derived display (HUD uses a 0-100 bar):
  const ritualProgress = xp > 0 ? Math.floor(Math.abs(xp) % 100) : 0;

  return {
    level,
    rituals,
    bonds,
    watchers,
    pentacles,
    ritual_progress: ritualProgress,
    honey,
    honey_expire: honeyExpire,
    surge_ready: surgeReady,
  };
}

async function safeHudState(avatar) {
  try {
    if (!avatar) return null;
    return await loadHudState(avatar);
  } catch {
    return null;
  }
}

function getAdminTokenFromRequest(req) {
  const headerToken = String(req.headers["x-admin-token"] || "").trim();
  if (headerToken) return headerToken;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const bodyToken = String(req.body?.admin_token || "").trim();
  return bodyToken;
}

function ensureAdminRequest(req) {
  if (!ADMIN_TOKEN) {
    const err = new Error("admin_access_disabled");
    err.status = 503;
    throw err;
  }
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    const err = new Error("missing_admin_token");
    err.status = 401;
    throw err;
  }
  if (token !== ADMIN_TOKEN) {
    const err = new Error("forbidden");
    err.status = 403;
    throw err;
  }
}

function sanitizeArtifactPayload(body = {}) {
  const now = Math.floor(nowMs() / 1000);
  const artifactId = sanitizeText(body.artifact_id || `artifact-${now}`, "");
  const duration = Number.isFinite(Number(body.duration))
    ? Number(body.duration)
    : 48 * 60 * 60;
  const expiresAt =
    Number.isFinite(Number(body.expires_at)) && Number(body.expires_at) > now
      ? Number(body.expires_at)
      : now + duration;
  const owner = sanitizeAvatar(body.owner || body.owner_id);
  const location = sanitizeZone(body.location || body.zone);
  const effect = sanitizeText(body.effect_type || "", "");
  const normalizedEffect = ALLOWED_ARTIFACT_EFFECTS.has(effect) ? effect : "";
  const order = sanitizeText(body.order || "", "");
  const normalizedOrder = ALLOWED_ORDERS.has(order) ? order : "";
  return {
    artifact_id: artifactId,
    type: sanitizeText(body.type || body.artifact_type || "", ""),
    power_level: Number.isFinite(Number(body.power_level)) ? Number(body.power_level) : 0,
    effect_type: normalizedEffect,
    duration,
    owner_id: owner,
    location,
    expires_at: expiresAt,
    active: body.active !== undefined ? Boolean(body.active) : true,
    order: normalizedOrder,
    created_at: nowMs(),
  };
}

async function publishApiEvent(type, body) {
  const payload = safeEventPayload(body);
  await publishEvent(redis, type, payload);
  return payload;
}

async function bridgeEventsToWebSockets() {
  await redisSub.subscribe(EVENT_CHANNEL, (message) => {
    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      client.send(message);
    }
    for (const client of relayWss.clients) {
      if (client.readyState !== client.OPEN) continue;
      client.send(message);
    }
  });
}

function registerRoutes() {
  attachCors(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: 1, redis: redis.isOpen ? 1 : 0, time: nowMs() });
  });

  app.get("/api/worker/heartbeat", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: 1, redis: redis.isOpen ? 1 : 0, time: nowMs() });
    } catch (err) {
      logger.warn({ err }, "worker heartbeat failed");
      res.status(503).json({ ok: 0, error: "db_unreachable" });
    }
  });

  app.post("/api/event", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      const action = sanitizeAction(body.action || body.type || "event");
      if (!action) return res.status(400).json({ error: "invalid_action" });
      if (!(await enforceRateLimit(redis, avatar, action))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent(action, body);
      // Back-compat for SL HUD: return a {state:{...}} object immediately.
      // This reflects the latest Redis snapshot, not necessarily the post-event result.
      const state = await loadHudState(avatar);
      return res.json({ ok: true, queued: true, action, state });
    } catch (err) {
      logger.error({ err }, "event request failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  const sessionPayload = (body) => ({
    avatar: sanitizeAvatar(body.avatar),
    partner: sanitizeAvatar(body.partner || body.partner_avatar),
    object_id: sanitizeText(body.object_id || body.object || body.chair || "", ""),
    zone: sanitizeZone(body.zone),
    session_id: sanitizeText(body.session_id || "", ""),
    watchers: Number.isFinite(Number(body.watchers)) ? Number(body.watchers) : 0,
    group_tag: Number.isFinite(Number(body.group_tag)) ? Number(body.group_tag) : 0,
    ts: Math.floor(nowMs() / 1000),
  });

  app.post("/api/session/start", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      const partner = sanitizeAvatar(body.partner || body.partner_avatar);
      if (!avatar || !partner || avatar === partner) {
        return res.status(400).json({ error: "invalid_session" });
      }
      if (!(await enforceRateLimit(redis, avatar, "session_start"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      const payload = {
        ...sessionPayload(body),
        type_specific: "start",
      };
      const canonicalSessionId = payload.session_id || [avatar, partner].sort().join(":");
      payload.session_id = canonicalSessionId;
      payload.started_at = nowMs();
      await publishEvent(redis, "session_start", payload);
      const [state, partnerState] = await Promise.all([
        safeHudState(avatar),
        safeHudState(partner),
      ]);
      return res.json({
        ok: true,
        queued: true,
        session_id: canonicalSessionId,
        started_at: payload.started_at,
        state,
        partner_state: partnerState,
      });
    } catch (err) {
      logger.error({ err }, "session start failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/session/tick", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      if (!(await enforceRateLimit(redis, avatar, "session_tick"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("session_tick", body);
      const state = await safeHudState(avatar);
      return res.json({ ok: true, queued: true, state });
    } catch (err) {
      logger.error({ err }, "session tick failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/session/end", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      if (!(await enforceRateLimit(redis, avatar, "session_end"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("session_end", body);
      const state = await safeHudState(avatar);
      return res.json({ ok: true, queued: true, state });
    } catch (err) {
      logger.error({ err }, "session end failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/drip", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      if (!(await enforceRateLimit(redis, avatar, "drip"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("drip_request", body);
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logger.error({ err }, "drip failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/honey/use", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      if (!(await enforceRateLimit(redis, avatar, "honey_use"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("honey_used", body);
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logger.error({ err }, "honey use failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/challenges", async (req, res) => {
    try {
      const avatar = sanitizeAvatar(req.query.avatar || "");
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      const data = await db.getChallenge(avatar);
      return res.json({ ok: true, challenge: data || {} });
    } catch (err) {
      logger.error({ err }, "challenge fetch failed");
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/zone", async (req, res) => {
    try {
      const zone = sanitizeZone(req.query.zone || "");
      if (!zone) return res.status(400).json({ error: "invalid_zone" });
      const data = await db.getZone(zone);
      return res.json({ ok: true, zone: data || { zone_id: zone, pressure: 0 } });
    } catch (err) {
      logger.error({ err }, "zone fetch failed");
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/challenges/claim", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      const tier = String(body.tier || "").toLowerCase();
      if (!["daily", "weekly", "monthly", "quarterly"].includes(tier)) {
        return res.status(400).json({ error: "invalid_tier" });
      }
      if (!(await enforceRateLimit(redis, avatar, "challenge_claim"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("challenge_claim", body);
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logger.error({ err }, "challenge claim failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/battle/resolve", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const winner = sanitizeAvatar(body.winner);
      const loser = sanitizeAvatar(body.loser);
      if (!winner || !loser || winner === loser) {
        return res.status(400).json({ error: "invalid_battle" });
      }
      if (!(await enforceRateLimit(redis, winner, "battle_resolve"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("battle_resolve", body);
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logger.error({ err }, "battle resolve failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/purchase", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      const amount = Number(body.amount || 0);
      const type = String(body.type || "l").toLowerCase();
      if (amount <= 0) return res.status(400).json({ error: "invalid_amount" });
      if (!(await enforceRateLimit(redis, avatar, "purchase"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("purchase", { avatar, amount, type }, { source: "purchase" });
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logger.error({ err }, "purchase failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/artifact/spawn", async (req, res) => {
    const body = req.body || {};
    try {
      ensureAdminRequest(req);
      const payload = sanitizeArtifactPayload(body);
      if (!payload.artifact_id) {
        return res.status(400).json({ error: "invalid_artifact_id" });
      }
      const event = await publishEvent(redis, "artifact_spawn", payload, {
        source: "admin",
        triggered_by: getAdminTokenFromRequest(req),
      });
      return res.json({
        ok: true,
        artifact_id: payload.artifact_id,
        event_id: event.id,
        expires_at: payload.expires_at,
      });
    } catch (err) {
      logger.error({ err }, "admin artifact spawn failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/session/fast-forward", async (req, res) => {
    const body = req.body || {};
    try {
      ensureAdminRequest(req);
      const sessionId = sanitizeText(body.session_id || body.pair_key || "", "");
      if (!sessionId) return res.status(400).json({ error: "invalid_session_id" });

      const deltaMsRaw = Number(body.delta_ms ?? body.deltaMs ?? 0);
      const deltaMs = Number.isFinite(deltaMsRaw) ? Math.max(0, Math.min(deltaMsRaw, 7 * 24 * 60 * 60 * 1000)) : 0;
      if (!deltaMs) return res.status(400).json({ error: "invalid_delta_ms" });

      const now = nowMs();
      const startedAt = now - deltaMs;
      const sessionKey = `jls:session:${sessionId}`;
      const exists = await redis.exists(sessionKey);
      if (!exists) return res.status(404).json({ error: "session_not_found" });

      // This is a debug/admin helper for accelerating manual tests.
      // It does not award anything by itself; it only adjusts timestamps.
      await redis.hSet(sessionKey, {
        started_at: String(startedAt),
        last_tick: String(now - 1000),
        last_reward_at: String(now - 61_000),
      });

      await db.saveSession(sessionId, {
        started_at: startedAt,
        last_tick: now - 1000,
        last_reward_at: now - 61_000,
      });

      return res.json({ ok: true, session_id: sessionId, started_at: startedAt, now });
    } catch (err) {
      logger.error({ err }, "admin session fast-forward failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/session/cleanup-stale", async (req, res) => {
    try {
      ensureAdminRequest(req);
      const event = await publishEvent(redis, "admin_cleanup_sessions", {}, {
        source: "admin",
        triggered_by: getAdminTokenFromRequest(req),
      });
      return res.json({
        ok: true,
        queued: true,
        event_id: event.id,
      });
    } catch (err) {
      logger.error({ err }, "admin cleanup stale sessions failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/sync", async (req, res) => {
    const body = req.body || {};
    try {
      validateApiToken(req, body);
      const avatar = sanitizeAvatar(body.avatar || body.id);
      if (!avatar) return res.status(400).json({ error: "invalid_avatar" });
      if (!(await enforceRateLimit(redis, avatar, "sync"))) {
        return res.status(429).json({ error: "rate_limited" });
      }
      await publishApiEvent("sync", body);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "sync failed");
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/world", async (_req, res) => {
    try {
      const events = (await redis.lRange(EVENT_LIST_KEY, 0, 24))
        .map((raw) => safeJsonParse(raw))
        .filter(Boolean);
      const battle = await buildBattleBar(redis, events);
      const players = await db.listPlayers(25);
      const pairs = await db.listPairs(25);
      const sessions = await db.listActiveSessions(25);
      const artifacts = await db.getActiveArtifacts();
      const activeSessions = await db.countActiveSessions();
      const activePlayers5m = await db.countActivePlayersSince(nowMs() - 5 * 60 * 1000);
      const treasuryTotal = await db.getTreasuryTotal();
      const generatedAt = nowMs();
      const metrics = {
        active_sessions: activeSessions,
        active_players_5m: activePlayers5m,
        treasury_total_l: Number(treasuryTotal) || 0,
      };

      return res.json({
        world: {
          generated_at: generatedAt,
          events,
          battle,
          players,
          pairs,
          sessions,
          artifacts,
          metrics,
        },
      });
    } catch (err) {
      logger.error({ err }, "world snapshot failed");
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/", (_req, res) => {
    if (!STATIC_ROOT) {
      return res.status(200).type("text/plain").send("Jigsaw Lodge Society API");
    }
    const indexCandidates = [
      path.join(STATIC_ROOT, "index.html"),
      path.join(STATIC_ROOT, "index.htm"),
    ];
    for (const filePath of indexCandidates) {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return res.sendFile(filePath);
        }
      } catch {
        // ignore
      }
    }
    return res.status(200).type("text/plain").send("Jigsaw Lodge Society API");
  });

  app.use((req, res, next) => {
    if (req.method !== "GET" || !STATIC_ROOT) return next();

    const safePath = path
      .normalize(req.path === "/" ? "/index.html" : req.path)
      .replace(/^(\.\.[/\\])+/, "");
    const absolute = path.join(STATIC_ROOT, safePath);
    if (!absolute.startsWith(STATIC_ROOT)) {
      return res.status(403).type("text/plain").send("Forbidden");
    }

    try {
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        return res.sendFile(absolute);
      }
    } catch {
      // continue
    }
    return next();
  });

  app.use((err, _req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid_json" });
    }
    logger.error({ err }, "unhandled middleware error");
    return res.status(500).json({ error: "server_error" });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
}

function setupWebSocketHeartbeat(serverInstance) {
  const heartbeatMs = Number(process.env.WS_HEARTBEAT_MS || 30_000);
  const interval = setInterval(() => {
    for (const client of serverInstance.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping(() => {});
    }
  }, heartbeatMs);
  serverInstance.on("close", () => clearInterval(interval));
}

async function start() {
  registerRoutes();
  await db.ensureSchema();
  await connectWithRetry(redis, "primary", logger);
  await connectWithRetry(redisSub, "subscriber", logger);
  await bridgeEventsToWebSockets();

  setupWebSocketHeartbeat(wss);
  setupWebSocketHeartbeat(relayWss);

  wss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.send(JSON.stringify({ type: "connected", contract_version: 3 }));
    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  relayWss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.send(JSON.stringify({ type: "relay_connected", contract_version: 3 }));
    socket.on("pong", () => {
      socket.isAlive = true;
    });
  });

  server.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, ws_port: WS_PORT }, "jigsaw lodge api online");
  });
}

start().catch((err) => {
  logger.error({ err }, "startup failed");
  process.exit(1);
});
