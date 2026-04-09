"use strict";

// XP curve source of truth:
// docs/spec-decision-xp-curve.md (Hasan decision).
//
// We precompute thresholds so `levelFromTotalXp` is fast and stable.

const XP_BASE = Number(process.env.XP_CURVE_BASE || 100);
const XP_GROWTH = Number(process.env.XP_CURVE_GROWTH || 1.072416);
const MAX_LEVEL = Number(process.env.XP_CURVE_MAX_LEVEL || 150);

function xpToNextLevel(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const raw = XP_BASE * Math.pow(XP_GROWTH, L - 1);
  return Math.max(1, Math.round(raw));
}

function buildThresholds(maxLevel) {
  const thresholds = new Array(maxLevel + 1).fill(0);
  let total = 0;
  for (let level = 1; level <= maxLevel; level += 1) {
    total += xpToNextLevel(level);
    thresholds[level] = total;
  }
  return thresholds;
}

const THRESHOLDS = buildThresholds(MAX_LEVEL);

function totalXpToReachLevel(level) {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(level) || 0)));
  return THRESHOLDS[L] || 0;
}

function levelFromTotalXp(xp) {
  const total = Number(xp) || 0;
  if (total <= 0) return 0;

  // Linear scan is fine for <=150, but keep it explicit and deterministic.
  let level = 0;
  for (let i = 1; i <= MAX_LEVEL; i += 1) {
    if (total >= THRESHOLDS[i]) level = i;
    else break;
  }
  return level;
}

module.exports = {
  XP_BASE,
  XP_GROWTH,
  MAX_LEVEL,
  xpToNextLevel,
  totalXpToReachLevel,
  levelFromTotalXp,
};

