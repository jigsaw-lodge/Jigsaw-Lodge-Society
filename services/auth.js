"use strict";

const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 800);
const RATE_LIMIT_PREFIX = process.env.RATE_LIMIT_PREFIX || "jls:rl:";
const SHARED_TOKEN = String(process.env.JLS_SHARED_TOKEN || "").trim();

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
  sanitizeToken,
  tokenAllowed,
  getRequestToken,
  enforceRateLimit,
};
