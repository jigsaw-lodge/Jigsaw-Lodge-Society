"use strict";

const crypto = require("crypto");

const CONTRACT_VERSION = Number(process.env.CONTRACT_VERSION || 3);
const EVENT_CHANNEL = process.env.EVENT_CHANNEL || "events_channel";
const EVENT_LIST_KEY = process.env.EVENT_LIST_KEY || "jls:events";
const EVENT_LIMIT = Number(process.env.EVENT_LIMIT || 100);
const PROCESSED_PREFIX = process.env.EVENT_PROCESSED_PREFIX || "jls:processed:";

function nowMs() {
  return Date.now();
}

function createEventId() {
  return `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function envelope(type, payload = {}, meta = {}) {
  return {
    id: createEventId(),
    type,
    payload,
    meta,
    contract_version: CONTRACT_VERSION,
    created_at: nowMs(),
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function publishEvent(redis, type, payload = {}, meta = {}) {
  const event = envelope(type, payload, meta);
  const raw = JSON.stringify(event);
  await redis.lPush(EVENT_LIST_KEY, raw);
  await redis.lTrim(EVENT_LIST_KEY, 0, EVENT_LIMIT - 1);
  await redis.publish(EVENT_CHANNEL, raw);
  return event;
}

async function claimEvent(redis, eventId, ttlSeconds = 7 * 24 * 60 * 60) {
  if (!eventId) return false;
  const key = `${PROCESSED_PREFIX}${eventId}`;
  const result = await redis.set(key, "1", {
    NX: true,
    EX: ttlSeconds,
  });
  return result === "OK";
}

module.exports = {
  CONTRACT_VERSION,
  EVENT_CHANNEL,
  EVENT_LIST_KEY,
  EVENT_LIMIT,
  PROCESSED_PREFIX,
  nowMs,
  envelope,
  safeJsonParse,
  publishEvent,
  claimEvent,
};
