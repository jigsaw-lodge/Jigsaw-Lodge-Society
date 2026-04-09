"use strict";

const crypto = require("node:crypto");

const { sanitizeAvatar, sanitizeZone, sanitizeText, sanitizeAction } = require("./validation");

const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 800);
const RATE_LIMIT_PREFIX = process.env.RATE_LIMIT_PREFIX || "jls:rl:";
const SHARED_TOKEN = String(process.env.JLS_SHARED_TOKEN || "").trim();
const SIGNING_SECRET = String(process.env.JLS_SIGNING_SECRET || "").trim();
const SIGNING_MAX_SKEW_SEC = Number(process.env.JLS_SIGNING_MAX_SKEW_SEC || 120);
const SIGNING_NONCE_TTL_SEC = Math.max(
  Number(process.env.JLS_SIGNING_NONCE_TTL_SEC || 300),
  SIGNING_MAX_SKEW_SEC + 30
);
const SIGNING_NONCE_PREFIX = process.env.JLS_SIGNING_NONCE_PREFIX || "jls:sig:";
const REQUIRE_SIGNED_REQUESTS = /^(1|true|yes)$/i.test(
  String(process.env.JLS_REQUIRE_SIGNED_REQUESTS || "")
);
const SIGNATURE_VERSION = "v1";

function sanitizeToken(value) {
  return String(value || "").trim();
}

function tokenAllowed(token) {
  if (!SHARED_TOKEN) return true;
  return token === SHARED_TOKEN;
}

function getRequestToken(req, body = {}) {
  return sanitizeToken(body.token || req.header("x-jls-token") || req.header("authorization") || "");
}

function normalizeNumericField(value, fallback = "0") {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : fallback;
}

function normalizeTimestamp(value) {
  let timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  if (timestamp > 1_000_000_000_000) {
    timestamp = Math.floor(timestamp / 1000);
  }
  return Math.floor(timestamp);
}

function getRequestTimestamp(req, body = {}) {
  return normalizeTimestamp(body.timestamp || body.ts || req.header("x-jls-timestamp") || 0);
}

function getRequestId(req, body = {}) {
  return sanitizeText(body.request_id || body.nonce || req.header("x-jls-request-id") || "", "");
}

function getRequestSignature(req, body = {}) {
  return sanitizeText(body.signature || req.header("x-jls-signature") || "", "").toLowerCase();
}

function buildSignaturePayload(req, body = {}, routeAction = "") {
  const path = String(req.path || req.originalUrl || "").split("?")[0];
  const action = sanitizeAction(routeAction || body.action || body.type || "");
  const order = sanitizeText(body.order || "", "").toLowerCase();
  const objectId = sanitizeText(body.object_id || body.object || body.chair || "", "");
  const timestamp = getRequestTimestamp(req, body);
  const requestId = getRequestId(req, body);

  return [
    SIGNATURE_VERSION,
    String(req.method || "POST").toUpperCase(),
    path,
    sanitizeAvatar(body.avatar || body.id),
    action,
    sanitizeAvatar(body.partner || body.partner_avatar),
    objectId,
    sanitizeZone(body.zone),
    order,
    normalizeNumericField(body.watchers),
    normalizeNumericField(body.group_tag),
    sanitizeText(body.type || "", ""),
    sanitizeText(body.honey || "", ""),
    sanitizeText(body.tier || "", ""),
    normalizeNumericField(body.amount),
    sanitizeAvatar(body.winner),
    sanitizeAvatar(body.loser),
    sanitizeText(body.session_id || "", ""),
    normalizeNumericField(body.x),
    normalizeNumericField(body.y),
    normalizeNumericField(body.z),
    String(timestamp),
    requestId,
  ].join("|");
}

function computeRequestSignature(secret, req, body = {}, routeAction = "") {
  const signingSecret = sanitizeToken(secret);
  if (!signingSecret) return "";
  const payload = buildSignaturePayload(req, body, routeAction);
  return crypto
    .createHash("sha1")
    .update(`${signingSecret}|${payload}`)
    .digest("hex");
}

function authError(message, status = 401) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function validateSignedRequest(redis, req, body = {}, routeAction = "") {
  if (!SIGNING_SECRET) {
    throw authError("signing_not_configured", 503);
  }

  const signature = getRequestSignature(req, body);
  const requestId = getRequestId(req, body);
  const timestamp = getRequestTimestamp(req, body);
  if (!signature || !requestId || !timestamp) {
    throw authError("missing_signature_fields");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > SIGNING_MAX_SKEW_SEC) {
    throw authError("stale_signature");
  }

  const expected = computeRequestSignature(SIGNING_SECRET, req, body, routeAction);
  if (!expected || signature !== expected) {
    throw authError("invalid_signature");
  }

  if (redis && requestId) {
    const replayKey = `${SIGNING_NONCE_PREFIX}${requestId}`;
    const claimed = await redis.set(replayKey, String(timestamp), {
      NX: true,
      EX: SIGNING_NONCE_TTL_SEC,
    });
    if (claimed !== "OK") {
      throw authError("replay_detected", 409);
    }
  }

  return {
    mode: "signed",
    request_id: requestId,
    timestamp,
  };
}

async function validateRequestAuth(redis, req, body = {}, routeAction = "") {
  const signature = getRequestSignature(req, body);
  if (signature) {
    return validateSignedRequest(redis, req, body, routeAction);
  }

  if (REQUIRE_SIGNED_REQUESTS && SIGNING_SECRET) {
    throw authError("missing_signature");
  }

  const token = getRequestToken(req, body);
  if (!tokenAllowed(token)) {
    throw authError("unauthorized");
  }

  return {
    mode: SHARED_TOKEN ? "token" : "open",
  };
}

async function enforceRateLimit(redis, avatarId, action) {
  if (!redis || !avatarId || !action) return false;
  const key = `${RATE_LIMIT_PREFIX}${avatarId}:${action}`;
  const result = await redis.set(key, "1", { NX: true, PX: RATE_LIMIT_MS });
  return result === "OK";
}

module.exports = {
  RATE_LIMIT_MS,
  RATE_LIMIT_PREFIX,
  SHARED_TOKEN,
  SIGNING_SECRET,
  SIGNING_MAX_SKEW_SEC,
  SIGNING_NONCE_TTL_SEC,
  SIGNING_NONCE_PREFIX,
  REQUIRE_SIGNED_REQUESTS,
  SIGNATURE_VERSION,
  sanitizeToken,
  tokenAllowed,
  getRequestToken,
  getRequestTimestamp,
  getRequestId,
  getRequestSignature,
  buildSignaturePayload,
  computeRequestSignature,
  validateSignedRequest,
  validateRequestAuth,
  enforceRateLimit,
};
