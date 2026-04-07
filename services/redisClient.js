"use strict";

const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_RETRY_LIMIT = Number(process.env.REDIS_RETRY_LIMIT || 3);
const BASE_RETRY_DELAY = Number(process.env.REDIS_RETRY_DELAY || 250);

function buildSocketOptions() {
  return {
    reconnectStrategy(retries) {
      return Math.min(50 * retries, 1000);
    },
  };
}

function createRedisClient(overrides = {}) {
  return createClient({
    url: REDIS_URL,
    socket: buildSocketOptions(),
    ...overrides,
  });
}

async function ensureOpen(client) {
  if (!client || client.isOpen) return;
  await client.connect();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(client, label, logger, options = {}) {
  const retries = options.retries ?? REDIS_RETRY_LIMIT;
  const baseDelay = options.baseDelay ?? BASE_RETRY_DELAY;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (!client.isOpen) await client.connect();
      return true;
    } catch (err) {
      lastError = err;
      logger?.error({ label, attempt, err: err.message }, "redis connection attempt failed");
      await delay(baseDelay * attempt);
    }
  }

  logger?.error({ label, err: lastError?.message || "unknown" }, "redis connection failed after retries");
  return false;
}

module.exports = {
  REDIS_URL,
  REDIS_RETRY_LIMIT,
  createRedisClient,
  ensureOpen,
  connectWithRetry,
};
