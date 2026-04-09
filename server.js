"use strict";

let runtimeConfigReport;
try {
  const { initializeRuntimeConfig } = require("./services/runtimeConfig");
  runtimeConfigReport = initializeRuntimeConfig("api");
} catch (err) {
  require("fs").writeSync(process.stderr.fd, `${err.message}\n`);
  process.exit(1);
}

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
const { validateRequestAuth, enforceRateLimit } = require("./services/auth");
const {
  sanitizeAvatar,
  sanitizeZone,
  sanitizeText,
  sanitizeAction,
} = require("./services/validation");
const db = require("./services/database");
const {
  buildRequestLogContext,
  detectAdminAuthSource,
  serializeError,
} = require("./services/structuredLogging");
const { emitRuntimeWarnings } = require("./services/runtimeConfig");

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

const logger = pino({ level: process.env.LOG_LEVEL || "info" }).child({ component: "api" });
emitRuntimeWarnings(runtimeConfigReport, logger);

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
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-JLS-Token, X-JLS-Signature, X-JLS-Timestamp, X-JLS-Request-Id"
    );
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
}

async function validateApiAuth(req, body, routeAction = "") {
  return validateRequestAuth(redis, req, body, routeAction);
}

function sanitizeOrderValue(value) {
  const order = sanitizeText(value || "", "").toLowerCase();
  return ALLOWED_ORDERS.has(order) ? order : "";
}

function safeEventPayload(body) {
  return {
    avatar: sanitizeAvatar(body.avatar),
    action: sanitizeAction(body.action || body.type || ""),
    zone: sanitizeZone(body.zone),
    order: sanitizeOrderValue(body.order),
    group: Boolean(body.group),
    watchers: Number.isFinite(Number(body.watchers)) ? Number(body.watchers) : 0,
    group_tag: Number.isFinite(Number(body.group_tag)) ? Number(body.group_tag) : 0,
    object_id: sanitizeText(body.object_id || body.object || body.chair || "", ""),
    partner: sanitizeAvatar(body.partner || body.partner_avatar),
    session_id: sanitizeText(body.session_id || "", ""),
    winner: sanitizeAvatar(body.winner),
    loser: sanitizeAvatar(body.loser),
    type: sanitizeText(body.type || "", ""),
    honey: sanitizeText(body.honey || "", ""),
    tier: sanitizeText(body.tier || "", ""),
    amount: Number.isFinite(Number(body.amount)) ? Number(body.amount) : 0,
    x: Number.isFinite(Number(body.x)) ? Number(body.x) : 0,
    y: Number.isFinite(Number(body.y)) ? Number(body.y) : 0,
    z: Number.isFinite(Number(body.z)) ? Number(body.z) : 0,
    request_id: sanitizeText(body.request_id || body.nonce || "", ""),
    request_ts: Number.isFinite(Number(body.timestamp || body.ts)) ? Number(body.timestamp || body.ts) : 0,
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

function logApiInfo(event, req, body, extra = {}, message = event) {
  logger.info(
    {
      event,
      ...buildRequestLogContext(req, body, extra),
    },
    message
  );
}

function logApiWarn(event, req, body, extra = {}, message = event) {
  logger.warn(
    {
      event,
      ...buildRequestLogContext(req, body, extra),
    },
    message
  );
}

function logApiFailure(event, req, body, err, extra = {}, message = event) {
  const payload = {
    event,
    ...buildRequestLogContext(req, body, extra),
    err: serializeError(err),
  };
  if (err?.status && err.status < 500) {
    logger.warn(payload, message);
    return;
  }
  logger.error(payload, message);
}

function rejectRequest(req, res, status, error, event, body, extra = {}, message = error) {
  logApiWarn(
    event,
    req,
    body,
    {
      outcome: "rejected",
      status,
      error,
      ...extra,
    },
    message
  );
  return res.status(status).json({ error });
}

function adminEventMeta(req, route) {
  return {
    source: "admin",
    route,
    triggered_by: "admin",
    admin_auth_source: detectAdminAuthSource(req, req.body || {}),
  };
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
  const normalizedOrder = sanitizeOrderValue(body.order);
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

async function publishApiEvent(type, body, meta = {}) {
  const payload = safeEventPayload(body);
  await publishEvent(redis, type, payload, {
    source: "api",
    ...meta,
  });
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
    let action = "";
    let legacySessionEvent = "";
    try {
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return rejectRequest(req, res, 400, "invalid_avatar", "api.event", body);
      action = sanitizeAction(body.action || body.type || "event");
      if (!action) return rejectRequest(req, res, 400, "invalid_action", "api.event", body);
      await validateApiAuth(req, body, action);
      legacySessionEvent = legacySessionEventType(action);
      if (legacySessionEvent === "session_start") {
        const result = await queueSessionStart(body, { route: "/api/event", legacy_action: action });
        return res.json({
          ok: true,
          queued: true,
          action,
          routed_as: legacySessionEvent,
          session_id: result.session_id,
          started_at: result.started_at,
          state: result.state,
          partner_state: result.partner_state,
        });
      }
      if (legacySessionEvent === "session_tick") {
        const result = await queueSessionTick(body, { route: "/api/event", legacy_action: action });
        return res.json({
          ok: true,
          queued: true,
          action,
          routed_as: legacySessionEvent,
          state: result.state,
        });
      }
      if (legacySessionEvent === "session_end") {
        const result = await queueSessionEnd(body, { route: "/api/event", legacy_action: action });
        return res.json({
          ok: true,
          queued: true,
          action,
          routed_as: legacySessionEvent,
          state: result.state,
        });
      }

      if (!(await enforceRateLimit(redis, avatar, action))) {
        return rejectRequest(
          req,
          res,
          429,
          "rate_limited",
          "api.event",
          body,
          { action }
        );
      }
      await publishApiEvent(action, body, { route: "/api/event" });
      const state = await loadHudState(avatar);
      return res.json({ ok: true, queued: true, action, state });
    } catch (err) {
      logApiFailure(
        legacySessionEvent ? `api.${legacySessionEvent}` : "api.event",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
          action,
          routed_as: legacySessionEvent || undefined,
        },
        "event request failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  const sessionPayload = (body) => ({
    avatar: sanitizeAvatar(body.avatar),
    partner: sanitizeAvatar(body.partner || body.partner_avatar),
    object_id: sanitizeText(body.object_id || body.object || body.chair || "", ""),
    zone: sanitizeZone(body.zone),
    order: sanitizeOrderValue(body.order),
    session_id: sanitizeText(body.session_id || "", ""),
    request_id: sanitizeText(body.request_id || body.nonce || "", ""),
    request_ts: Number.isFinite(Number(body.timestamp || body.ts)) ? Number(body.timestamp || body.ts) : 0,
    watchers: Number.isFinite(Number(body.watchers)) ? Number(body.watchers) : 0,
    group_tag: Number.isFinite(Number(body.group_tag)) ? Number(body.group_tag) : 0,
    ts: Math.floor(nowMs() / 1000),
  });

  const legacySessionEventType = (action) => {
    switch (action) {
      case "sit":
      case "session_start":
        return "session_start";
      case "ritual_tick":
      case "session_tick":
        return "session_tick";
      case "stand":
      case "unsit":
      case "session_end":
        return "session_end";
      default:
        return "";
    }
  };

  const queueSessionStart = async (body, meta = {}) => {
    const avatar = sanitizeAvatar(body.avatar);
    const partner = sanitizeAvatar(body.partner || body.partner_avatar);
    if (!avatar || !partner || avatar === partner) {
      const err = new Error("invalid_session");
      err.status = 400;
      throw err;
    }
    if (!(await enforceRateLimit(redis, avatar, "session_start"))) {
      const err = new Error("rate_limited");
      err.status = 429;
      throw err;
    }

    const payload = {
      ...sessionPayload(body),
      type_specific: "start",
    };
    const canonicalSessionId = payload.session_id || [avatar, partner].sort().join(":");
    payload.session_id = canonicalSessionId;
    payload.started_at = nowMs();
    await publishEvent(redis, "session_start", payload, {
      source: "api",
      ...meta,
    });
    const [state, partnerState] = await Promise.all([
      safeHudState(avatar),
      safeHudState(partner),
    ]);

    return {
      session_id: canonicalSessionId,
      started_at: payload.started_at,
      state,
      partner_state: partnerState,
    };
  };

  const queueSessionTick = async (body, meta = {}) => {
    const avatar = sanitizeAvatar(body.avatar);
    if (!avatar) {
      const err = new Error("invalid_avatar");
      err.status = 400;
      throw err;
    }
    if (!(await enforceRateLimit(redis, avatar, "session_tick"))) {
      const err = new Error("rate_limited");
      err.status = 429;
      throw err;
    }
    await publishApiEvent("session_tick", body, meta);
    const state = await safeHudState(avatar);
    return { state };
  };

  const queueSessionEnd = async (body, meta = {}) => {
    const avatar = sanitizeAvatar(body.avatar);
    if (!avatar) {
      const err = new Error("invalid_avatar");
      err.status = 400;
      throw err;
    }
    if (!(await enforceRateLimit(redis, avatar, "session_end"))) {
      const err = new Error("rate_limited");
      err.status = 429;
      throw err;
    }
    await publishApiEvent("session_end", body, meta);
    const state = await safeHudState(avatar);
    return { state };
  };

  app.post("/api/session/start", async (req, res) => {
    const body = req.body || {};
    try {
      await validateApiAuth(req, body, "session_start");
      const result = await queueSessionStart(body, { route: "/api/session/start" });
      return res.json({
        ok: true,
        queued: true,
        session_id: result.session_id,
        started_at: result.started_at,
        state: result.state,
        partner_state: result.partner_state,
      });
    } catch (err) {
      logApiFailure(
        "api.session_start",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "session start failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/session/tick", async (req, res) => {
    const body = req.body || {};
    try {
      await validateApiAuth(req, body, "session_tick");
      const result = await queueSessionTick(body, { route: "/api/session/tick" });
      return res.json({ ok: true, queued: true, state: result.state });
    } catch (err) {
      logApiFailure(
        "api.session_tick",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "session tick failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/session/end", async (req, res) => {
    const body = req.body || {};
    try {
      await validateApiAuth(req, body, "session_end");
      const result = await queueSessionEnd(body, { route: "/api/session/end" });
      return res.json({ ok: true, queued: true, state: result.state });
    } catch (err) {
      logApiFailure(
        "api.session_end",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "session end failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/drip", async (req, res) => {
    const body = req.body || {};
    try {
      await validateApiAuth(req, body, "drip_request");
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
      await validateApiAuth(req, body, "honey_used");
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
      await validateApiAuth(req, body, "challenge_claim");
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
      await validateApiAuth(req, body, "battle_resolve");
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
      await validateApiAuth(req, body, "purchase");
      const avatar = sanitizeAvatar(body.avatar);
      if (!avatar) return rejectRequest(req, res, 400, "invalid_avatar", "api.purchase", body);
      const amount = Number(body.amount || 0);
      const type = String(body.type || "l").toLowerCase();
      if (amount <= 0) {
        return rejectRequest(
          req,
          res,
          400,
          "invalid_amount",
          "api.purchase",
          body,
          { purchase_type: type, amount }
        );
      }
      if (!(await enforceRateLimit(redis, avatar, "purchase"))) {
        return rejectRequest(
          req,
          res,
          429,
          "rate_limited",
          "api.purchase",
          body,
          { purchase_type: type, amount }
        );
      }
      await publishApiEvent("purchase", { avatar, amount, type }, { route: "/api/purchase" });
      logApiInfo(
        "api.purchase",
        req,
        body,
        {
          outcome: "queued",
          status: 200,
          purchase_type: type,
          amount,
        },
        "purchase queued"
      );
      return res.json({ ok: true, queued: true });
    } catch (err) {
      logApiFailure(
        "api.purchase",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "purchase failed"
      );
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
        return rejectRequest(req, res, 400, "invalid_artifact_id", "api.admin.artifact_spawn", body);
      }
      const event = await publishEvent(redis, "artifact_spawn", payload, {
        ...adminEventMeta(req, "/api/admin/artifact/spawn"),
      });
      logApiInfo(
        "api.admin.artifact_spawn",
        req,
        body,
        {
          outcome: "queued",
          status: 200,
          artifact_id: payload.artifact_id,
          artifact_type: payload.type,
          effect_type: payload.effect_type,
          event_id: event.id,
        },
        "admin artifact spawn queued"
      );
      return res.json({
        ok: true,
        artifact_id: payload.artifact_id,
        event_id: event.id,
        expires_at: payload.expires_at,
      });
    } catch (err) {
      logApiFailure(
        "api.admin.artifact_spawn",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin artifact spawn failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/admin/artifacts", async (req, res) => {
    try {
      ensureAdminRequest(req);
      const activeRaw = String(req.query.active || "").trim().toLowerCase();
      let active = null;
      if (activeRaw === "1" || activeRaw === "true" || activeRaw === "yes") active = true;
      if (activeRaw === "0" || activeRaw === "false" || activeRaw === "no") active = false;
      const limit = Number(req.query.limit || 50);
      await db.expireArtifacts(Math.floor(nowMs() / 1000));
      const artifacts = await db.listArtifacts(limit, active);
      logApiInfo(
        "api.admin.artifact_list",
        req,
        {},
        {
          outcome: "listed",
          status: 200,
          artifact_count: artifacts.length,
          limit,
          active_filter: activeRaw || "all",
        },
        "admin artifact list served"
      );
      return res.json({ ok: true, artifacts });
    } catch (err) {
      logApiFailure(
        "api.admin.artifact_list",
        req,
        {},
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin artifact list failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/api/admin/artifact/:artifactId", async (req, res) => {
    const body = {};
    try {
      ensureAdminRequest(req);
      const artifactId = sanitizeText(req.params?.artifactId || "", "");
      if (!artifactId) {
        return rejectRequest(req, res, 400, "invalid_artifact_id", "api.admin.artifact_inspect", body);
      }
      await db.expireArtifacts(Math.floor(nowMs() / 1000));
      const artifact = await db.getArtifact(artifactId);
      if (!artifact) {
        return rejectRequest(
          req,
          res,
          404,
          "artifact_not_found",
          "api.admin.artifact_inspect",
          body,
          { artifact_id: artifactId }
        );
      }
      logApiInfo(
        "api.admin.artifact_inspect",
        req,
        body,
        {
          outcome: "found",
          status: 200,
          artifact_id: artifact.artifact_id,
          artifact_active: artifact.active,
        },
        "admin artifact inspect served"
      );
      return res.json({ ok: true, artifact });
    } catch (err) {
      logApiFailure(
        "api.admin.artifact_inspect",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin artifact inspect failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/artifact/:artifactId/expire", async (req, res) => {
    const body = req.body || {};
    try {
      ensureAdminRequest(req);
      const artifactId = sanitizeText(req.params?.artifactId || "", "");
      if (!artifactId) {
        return rejectRequest(req, res, 400, "invalid_artifact_id", "api.admin.artifact_expire", body);
      }
      const artifact = await db.getArtifact(artifactId);
      if (!artifact) {
        return rejectRequest(
          req,
          res,
          404,
          "artifact_not_found",
          "api.admin.artifact_expire",
          body,
          { artifact_id: artifactId }
        );
      }
      const event = await publishEvent(redis, "artifact_expire", { artifact_id: artifactId }, {
        ...adminEventMeta(req, "/api/admin/artifact/expire"),
      });
      logApiInfo(
        "api.admin.artifact_expire",
        req,
        body,
        {
          outcome: "queued",
          status: 200,
          artifact_id: artifactId,
          event_id: event.id,
        },
        "admin artifact expire queued"
      );
      return res.json({
        ok: true,
        queued: true,
        artifact_id: artifactId,
        event_id: event.id,
      });
    } catch (err) {
      logApiFailure(
        "api.admin.artifact_expire",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin artifact expire failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/session/fast-forward", async (req, res) => {
    const body = req.body || {};
    try {
      ensureAdminRequest(req);
      const sessionId = sanitizeText(body.session_id || body.pair_key || "", "");
      if (!sessionId) {
        return rejectRequest(req, res, 400, "invalid_session_id", "api.admin.session_fast_forward", body);
      }

      const deltaMsRaw = Number(body.delta_ms ?? body.deltaMs ?? 0);
      const deltaMs = Number.isFinite(deltaMsRaw) ? Math.max(0, Math.min(deltaMsRaw, 7 * 24 * 60 * 60 * 1000)) : 0;
      if (!deltaMs) {
        return rejectRequest(req, res, 400, "invalid_delta_ms", "api.admin.session_fast_forward", body);
      }

      const now = nowMs();
      const startedAt = now - deltaMs;
      const sessionKey = `jls:session:${sessionId}`;
      const exists = await redis.exists(sessionKey);
      if (!exists) {
        return rejectRequest(
          req,
          res,
          404,
          "session_not_found",
          "api.admin.session_fast_forward",
          body,
          { session_id: sessionId }
        );
      }

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

      logApiInfo(
        "api.admin.session_fast_forward",
        req,
        body,
        {
          outcome: "updated",
          status: 200,
          session_id: sessionId,
          delta_ms: deltaMs,
          started_at: startedAt,
        },
        "admin session fast-forward applied"
      );
      return res.json({ ok: true, session_id: sessionId, started_at: startedAt, now });
    } catch (err) {
      logApiFailure(
        "api.admin.session_fast_forward",
        req,
        body,
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin session fast-forward failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/admin/session/cleanup-stale", async (req, res) => {
    try {
      ensureAdminRequest(req);
      const event = await publishEvent(redis, "admin_cleanup_sessions", {}, {
        ...adminEventMeta(req, "/api/admin/session/cleanup-stale"),
      });
      logApiInfo(
        "api.admin.cleanup_stale_sessions",
        req,
        {},
        {
          outcome: "queued",
          status: 200,
          event_id: event.id,
        },
        "admin stale-session cleanup queued"
      );
      return res.json({
        ok: true,
        queued: true,
        event_id: event.id,
      });
    } catch (err) {
      logApiFailure(
        "api.admin.cleanup_stale_sessions",
        req,
        {},
        err,
        {
          outcome: "failed",
          status: err?.status || 500,
        },
        "admin cleanup stale sessions failed"
      );
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/sync", async (req, res) => {
    const body = req.body || {};
    try {
      await validateApiAuth(req, body, "sync");
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
      await db.expireArtifacts(Math.floor(nowMs() / 1000));
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
