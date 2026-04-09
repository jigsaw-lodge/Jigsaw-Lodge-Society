"use strict";

const ZONE_PRESSURE_DECAY = 0.98;
const ZONE_FLIP_THRESHOLD = 100;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function deriveOrderMultiplier(order) {
  const key = String(order || "neutral").toLowerCase();
  if (key === "dominant") return 0.85;
  if (key === "weak") return 1.25;
  return 1;
}

function calculateZonePressureDelta(players = 0, orderMultiplier = 1) {
  const count = Math.max(0, toFinite(players, 0));
  const mult = Math.max(0, toFinite(orderMultiplier, 1));
  return Math.pow(count, 0.75) * 0.2 * mult;
}

function nextZonePressureState({
  pressure = 0,
  players = 0,
  orderMultiplier = 1,
  owner = "",
  ownerHint = "",
  now = Date.now(),
} = {}) {
  const currentPressure = Math.max(0, toFinite(pressure, 0));
  const delta = calculateZonePressureDelta(players, orderMultiplier);
  let nextPressure = currentPressure * ZONE_PRESSURE_DECAY + delta;
  let nextOwner = String(owner || "");
  let lastFlip = 0;
  let flipped = false;

  if (nextPressure >= ZONE_FLIP_THRESHOLD) {
    nextPressure = 0;
    nextOwner = String(ownerHint || owner || "");
    lastFlip = Math.max(0, Math.floor(toFinite(now, Date.now())));
    flipped = true;
  }

  return {
    pressure: nextPressure,
    owner: nextOwner,
    last_flip: lastFlip,
    flipped,
    delta,
  };
}

module.exports = {
  ZONE_PRESSURE_DECAY,
  ZONE_FLIP_THRESHOLD,
  deriveOrderMultiplier,
  calculateZonePressureDelta,
  nextZonePressureState,
};
