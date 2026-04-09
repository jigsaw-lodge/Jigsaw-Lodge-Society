#!/usr/bin/env node
"use strict";

// Lightweight decision aid for estimating time-to-level-100 under different XP curves.
// This is not a perfect model. It's a sanity-check tool so we stop guessing.

function pow(base, exp) {
  return Math.pow(base, exp);
}

function formatDays(days) {
  if (!Number.isFinite(days)) return "n/a";
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  if (days < 30) return `${days.toFixed(1)}d`;
  const months = days / 30;
  if (months < 24) return `${months.toFixed(1)}mo`;
  const years = days / 365;
  return `${years.toFixed(2)}y`;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Candidate A: incremental XP requirement per level; total is sum(1..N).
function totalXpToLevel_geometric(level, base, growth) {
  const L = Math.max(1, Math.floor(level));
  let total = 0;
  for (let i = 1; i <= L; i += 1) {
    total += Number(base) * pow(Number(growth), i - 1);
  }
  return total;
}

function growthForTargetTotalXp(targetTotalXp, levelCap, base) {
  // Find growth g such that sum_{i=0..levelCap-1} base*g^i ~= targetTotalXp.
  // Binary search: g in (1, 2). We assume monotonic.
  const target = Number(targetTotalXp);
  const L = Math.max(1, Math.floor(levelCap));
  const b = Number(base);

  function total(g) {
    return totalXpToLevel_geometric(L, b, g);
  }

  let lo = 1.0 + 1e-12;
  let hi = 2.0;
  while (total(hi) < target) hi *= 1.05;

  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (total(mid) > target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Candidate B: spec says level = floor((xp/250)^0.606).
// We approximate the XP threshold to *reach* level L by inverting:
// xp ~= 250 * (L ^ (1/0.606)).
function totalXpToLevel_power(level, scale, exp) {
  const L = Math.max(1, Math.floor(level));
  return Number(scale) * pow(L, 1 / Number(exp));
}

function totalXpToLevel_canonical(level) {
  return totalXpToLevel_power(level, 250, 0.606);
}

function scaleForTargetXp100(targetXp100, exp) {
  // Invert xp = scale * (100 ^ (1/exp)) => scale = xp / 100^(1/exp)
  const denom = pow(100, 1 / Number(exp));
  return Number(targetXp100) / denom;
}

function estimateDailyXp(profile) {
  // Very intentionally simple model:
  // - active XP: based on "active minutes per day" * "xp per active minute"
  // - drip XP: only if ritual_done_today == true; uses drip minutes per day * xp per drip minute
  const activeMinutes = Number(profile.activeMinutesPerDay || 0);
  const xpPerActiveMinute = Number(profile.xpPerActiveMinute || 0);
  const dripMinutes = Number(profile.dripMinutesPerDay || 0);
  const xpPerDripMinute = Number(profile.xpPerDripMinute || 0);
  const ritualsPerDay = Number(profile.ritualsPerDay || 0);

  const activeXp = Math.max(0, activeMinutes) * Math.max(0, xpPerActiveMinute);
  const dripEligible = ritualsPerDay >= 1;
  const dripXp = dripEligible ? Math.max(0, dripMinutes) * Math.max(0, xpPerDripMinute) : 0;

  // Optional catch-up boost modeling: a simple multiplier.
  const catchupMultiplier = clamp(Number(profile.catchupMultiplier || 1), 1, 1.25);

  // Optional cap: active XP cap multiplier; we apply it as a hard cap factor on active XP only.
  const activeCapMultiplier = clamp(Number(profile.activeCapMultiplier || 4), 1, 10);

  // If the user modeled xpPerActiveMinute assuming raw multipliers, this cap approximates the final clamp.
  const cappedActiveXp = Math.min(activeXp, activeMinutes * xpPerActiveMinute * activeCapMultiplier);

  return (cappedActiveXp + dripXp) * catchupMultiplier;
}

function estimateDaysTo100(curveFn, profile) {
  const sessionsPerWeek = Number(profile.daysPerWeek || 7);
  const dailyXpOnPlayDay = estimateDailyXp(profile);
  const avgDailyXp = dailyXpOnPlayDay * clamp(sessionsPerWeek / 7, 0, 1);

  const targetXp = curveFn(100);
  if (avgDailyXp <= 0) return Infinity;
  return targetXp / avgDailyXp;
}

function main() {
  const EXP = 0.606;
  const TARGET_XP_100 = 900_000; // appears in unified spec as an intent anchor
  const tunedScale = scaleForTargetXp100(TARGET_XP_100, EXP);

  const GEO_BASE = 100;
  // Hasan recommendation: anchor total XP required to reach level 100 to ~1.5M.
  // With typical "regular" play assumptions, this lands ~2-3 years to 100.
  const GEO_TARGET_TOTAL_100 = 1_500_000;
  const geoGrowth = growthForTargetTotalXp(GEO_TARGET_TOTAL_100, 100, GEO_BASE);

  const profiles = [
    {
      name: "Casual",
      daysPerWeek: 4,
      activeMinutesPerDay: 20,
      xpPerActiveMinute: 25, // tune this to match real telemetry later
      ritualsPerDay: 0.5,
      dripMinutesPerDay: 0,
      xpPerDripMinute: 0,
      catchupMultiplier: 1.1,
    },
    {
      name: "Regular",
      daysPerWeek: 5,
      activeMinutesPerDay: 60,
      xpPerActiveMinute: 25,
      ritualsPerDay: 1,
      dripMinutesPerDay: 60,
      // unified spec drip is every 60s with baseDripXP=12; 12/min baseline before multipliers
      xpPerDripMinute: 12,
      catchupMultiplier: 1.05,
    },
    {
      name: "Committed",
      daysPerWeek: 7,
      activeMinutesPerDay: 120,
      xpPerActiveMinute: 30,
      ritualsPerDay: 1,
      dripMinutesPerDay: 180,
      xpPerDripMinute: 12,
      catchupMultiplier: 1.0,
    },
  ];

  const curves = [
    { name: "Geometric(base=100, growth=1.12) (as-written in unified text)", fn: (L) => totalXpToLevel_geometric(L, 100, 1.12) },
    { name: "Power(scale=250, exp=0.606) (from canonical doc)", fn: (L) => totalXpToLevel_power(L, 250, EXP) },
    { name: `Power(scale=${tunedScale.toFixed(2)}, exp=0.606) (tuned so XP@100~=900k)`, fn: (L) => totalXpToLevel_power(L, tunedScale, EXP) },
    { name: `Geometric(base=${GEO_BASE}, growth=${geoGrowth.toFixed(6)}) (Hasan curve: totalXP@100~=${GEO_TARGET_TOTAL_100.toLocaleString("en-US")})`, fn: (L) => totalXpToLevel_geometric(L, GEO_BASE, geoGrowth) },
  ];

  console.log("XP time-to-100 estimator");
  console.log("Note: numbers depend heavily on xpPerActiveMinute; calibrate with real telemetry.");
  console.log(`Power-curve tuning note: exp=${EXP}, tunedScale=${tunedScale.toFixed(2)} for XP@100~=${TARGET_XP_100.toLocaleString("en-US")}`);
  console.log(`Geometric tuning note: base=${GEO_BASE}, growth=${geoGrowth.toFixed(6)} for totalXP@100~=${GEO_TARGET_TOTAL_100.toLocaleString("en-US")}`);
  console.log("");

  for (const curve of curves) {
    const xp100 = curve.fn(100);
    console.log(`Curve: ${curve.name}`);
    console.log(`Total XP to reach 100 (approx): ${Math.round(xp100).toLocaleString("en-US")}`);
    for (const p of profiles) {
      const days = estimateDaysTo100(curve.fn, p);
      console.log(`  ${p.name}: ${formatDays(days)} (avgDailyXp=${Math.round(estimateDailyXp(p) * (p.daysPerWeek / 7)).toLocaleString("en-US")})`);
    }
    console.log("");
  }
}

main();
