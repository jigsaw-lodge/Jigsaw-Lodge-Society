"use strict";

// JIGSAW LODGE SOCIETY — ENGINE WORKER
// Consumes events_channel and applies XP / ritual / honey / drip progression.

require("dotenv").config();

const pino = require("pino");
const { createRedisClient, connectWithRetry } = require("../services/redisClient");
const {
  EVENT_CHANNEL,
  EVENT_LIST_KEY,
  safeJsonParse,
  publishEvent,
} = require("../services/eventDispatcher");
const { sanitizeAvatar, sanitizeZone, sanitizeText } = require("../services/validation");
const db = require("../services/database");
const { levelFromTotalXp } = require("../services/xpCurve");
const {
  deriveOrderMultiplier,
  nextZonePressureState,
} = require("../services/zonePressure");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const PLAYER_PREFIX = "jls:player:";
const SESSION_PREFIX = "jls:session:";
const AVATAR_SESSION_PREFIX = "jls:avatarSession:";
const PAIR_PREFIX = "jls:pair:";

const DAILY_UTC_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ACTIVE_REWARD_MS = Number(process.env.ACTIVE_REWARD_MS || 60_000);
const SESSION_IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS || 120_000);
const SESSION_PHASE_15_MS = Number(process.env.SESSION_PHASE_15_MS || 15 * 60 * 1000);
const SESSION_RITUAL_MS = Number(process.env.SESSION_RITUAL_MS || 45 * 60 * 1000);
const DRIP_BASE_XP = 5;
const SURGE_XP_BONUS = 1.25;
const SURGE_CHARGE_STEP = 10;
const SURGE_DECAY_STEP = 5;
const SURGE_DECAY_IDLE_MS = 60_000;

const HONEY_DURATIONS = {
  normal: 45 * 60,
  dev: 30 * 60,
  poison: 30 * 60,
  royal: 15 * 60,
};

const HONEY_STAGES = [1.75, 2.0, 3.0];
const HONEY_MULTIPLIERS = {
  dev: 3.0,
  poison: 3.0,
  royal: 7.0,
  "": 1,
};

const ARTIFACT_CACHE_TTL_MS = Number(process.env.ARTIFACT_CACHE_TTL_MS) || 15_000;
const ARTIFACT_PRUNE_INTERVAL_MS = Number(process.env.ARTIFACT_PRUNE_INTERVAL_MS) || 60_000;
const artifactCache = { updatedAt: 0, items: [] };
const CHALLENGE_TARGET_DAILY = Number(process.env.CHALLENGE_TARGET_DAILY || 5);
const CHALLENGE_TARGET_WEEKLY = Number(process.env.CHALLENGE_TARGET_WEEKLY || 25);
const CHALLENGE_TARGET_MONTHLY = Number(process.env.CHALLENGE_TARGET_MONTHLY || 100);
const CHALLENGE_TARGET_QUARTERLY = Number(process.env.CHALLENGE_TARGET_QUARTERLY || 300);
const SURGE_WINDOW_MS = 7000;
const SURGE_PENDING_PREFIX = "jls:surge:pending:";
const ZONE_PRESSURE_TICK_MS = 500;

const redis = createRedisClient({ url: REDIS_URL });
const sub = redis.duplicate();

redis.on("error", (err) => logger.error({ err }, "redis error"));
sub.on("error", (err) => logger.error({ err }, "redis subscriber error"));

function nowMs() {
  return Date.now();
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function utcDate() {
  return DAILY_UTC_FMT.format(new Date());
}

function utcWeekKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const week = Math.ceil((((now - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function utcMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function utcQuarterKey() {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function truthy(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

function defaultPlayer(avatarId) {
  return {
    avatar_id: avatarId,
    xp: 0,
    level: 0,
    rituals: 0,
    rituals_today: 0,
    rituals_week: 0,
    rituals_month: 0,
    rituals_quarter: 0,
    pentacles: 0,
    bonds: 0,
    order: "neutral",
    zone: "0:0",
    x: 0,
    y: 0,
    z: 0,
    honey: "",
    honey_type: "",
    honey_stage: 0,
    honey_multiplier: 1,
    honey_expire: 0,
    honey_cooldown: 0,
    poison_expire: 0,
    dev_uses_today: 0,
    poison_uses_today: 0,
    royal_uses_today: 0,
    last_daily_reset: utcDate(),
    last_weekly_reset: utcWeekKey(),
    last_monthly_reset: utcMonthKey(),
    last_quarterly_reset: utcQuarterKey(),
    last_seen: 0,
    last_action_at: 0,
    watchers: 0,
    stacks: 0,
    surge_charge: 0,
    surge_ready: 0,
    surge_stacks: 0,
    group_tag: 0,
    last_zone: "0:0",
    session_xp: 0,
    total_l$: 0,
    challenge_boost_pct: 0,
    challenge_boost_until: 0,
    equip_slot1: "",
    equip_slot2: "",
    equip_slot3: "",
  };
}

function normalizePlayer(raw, avatarId) {
  const base = defaultPlayer(avatarId);
  const p = Object.assign(base, raw || {});
  p.avatar_id = avatarId;
  p.xp = toNumber(p.xp, 0);
  p.level = toInt(p.level, 0);
  p.rituals = toInt(p.rituals, 0);
  p.rituals_today = toInt(p.rituals_today, 0);
  p.rituals_week = toInt(p.rituals_week, 0);
  p.rituals_month = toInt(p.rituals_month, 0);
  p.rituals_quarter = toInt(p.rituals_quarter, 0);
  p.pentacles = toNumber(p.pentacles, 0);
  p.bonds = toInt(p.bonds, 0);
  p.order = String(p.order || "neutral");
  p.zone = String(p.zone || "0:0");
  p.x = toNumber(p.x, 0);
  p.y = toNumber(p.y, 0);
  p.z = toNumber(p.z, 0);
  p.honey = String(p.honey || "");
  p.honey_type = String(p.honey_type || p.honey || "");
  p.honey_stage = toInt(p.honey_stage, 0);
  p.honey_multiplier = toNumber(p.honey_multiplier, 1);
  p.honey_expire = toInt(p.honey_expire, 0);
  p.honey_cooldown = toInt(p.honey_cooldown, 0);
  p.poison_expire = toInt(p.poison_expire, 0);
  p.dev_uses_today = toInt(p.dev_uses_today, 0);
  p.poison_uses_today = toInt(p.poison_uses_today, 0);
  p.royal_uses_today = toInt(p.royal_uses_today, 0);
  p.last_daily_reset = String(p.last_daily_reset || utcDate());
  p.last_weekly_reset = String(p.last_weekly_reset || utcWeekKey());
  p.last_monthly_reset = String(p.last_monthly_reset || utcMonthKey());
  p.last_quarterly_reset = String(p.last_quarterly_reset || utcQuarterKey());
  p.last_seen = toInt(p.last_seen, 0);
  p.last_action_at = toInt(p.last_action_at, 0);
  p.watchers = toInt(p.watchers, 0);
  p.stacks = toInt(p.stacks, 0);
  p.surge_charge = toInt(p.surge_charge, 0);
  p.surge_ready = toInt(p.surge_ready, 0);
  p.surge_stacks = toInt(p.surge_stacks, 0);
  p.group_tag = toInt(p.group_tag, 0);
  p.last_zone = String(p.last_zone || p.zone || "0:0");
  p.session_xp = toNumber(p.session_xp, 0);
  p.total_l$ = toNumber(p.total_l$, 0);
  p.challenge_boost_pct = toNumber(p.challenge_boost_pct, 0);
  p.challenge_boost_until = toInt(p.challenge_boost_until, 0);
  p.equip_slot1 = String(p.equip_slot1 || "");
  p.equip_slot2 = String(p.equip_slot2 || "");
  p.equip_slot3 = String(p.equip_slot3 || "");
  return p;
}

function hashFromObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

// Atomic "claim once" for session flags stored in the session hash.
//
// Important: HSETNX only sets if the field is missing. Our session hashes often
// initialize flags like `ritual_awarded=0`, so HSETNX would always fail and the
// session_end path would silently skip rewards. This Lua script treats missing
// OR "0" as claimable and sets the flag to "1" exactly once.
const CLAIM_SESSION_FLAG_LUA = `
local v = redis.call('HGET', KEYS[1], ARGV[1])
if (not v) or v == '0' then
  redis.call('HSET', KEYS[1], ARGV[1], '1')
  return 1
end
return 0
`;

async function claimSessionFlag(sessionKey, field) {
  if (!sessionKey || !field) return false;
  try {
    const result = await redis.eval(CLAIM_SESSION_FLAG_LUA, {
      keys: [sessionKey],
      arguments: [field],
    });
    return Number(result) === 1;
  } catch (err) {
    // Fallback for environments where EVAL is restricted: best-effort claim.
    const cur = await redis.hGet(sessionKey, field);
    if (String(cur || "0") === "1") return false;
    await redis.hSet(sessionKey, { [field]: "1" });
    return true;
  }
}

async function hSetFields(key, fields = {}) {
  const clean = hashFromObject(fields);
  if (Object.keys(clean).length === 0) return;
  // node-redis v4/v5: use object form for multi-field HSET.
  await redis.hSet(key, clean);
}

function mapFieldsForDb(fields) {
  const mapped = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null) continue;
    let column = key;
    if (key === "total_l$") column = "total_l";
    if (key === "order") column = "order_type";
    mapped[column] = value;
  }
  return mapped;
}

function objectFromHash(hash, avatarId) {
  return normalizePlayer(hash || {}, avatarId);
}

function deriveJealousyLevel(player) {
  if (!player) return 0;
  const watchers = toInt(player.watchers, 0);
  const bonds = toInt(player.bonds, 0);
  const ritualsToday = toInt(player.rituals_today, 0);
  const base = watchers * 2 + bonds * 3 + ritualsToday * 5;
  return Math.min(100, Math.round(base));
}

function deriveRivalTag(player) {
  const jealousy = deriveJealousyLevel(player);
  if (jealousy >= 80) return "surpass";
  if (jealousy >= 60) return "rival";
  if (jealousy >= 40) return "close";
  return "stable";
}

function deriveZonePressure(session, players = []) {
  if (!session) return 0;
  const watchers = toInt(session.watchers, 0);
  const participants = Math.max(1, players.length);
  const base = (participants * 5 + watchers) * 3;
  return Math.min(100, Math.round(base));
}

function deriveChallengeProgress(players = []) {
  if (!players.length) {
    return { daily: 0, weekly: 0, monthly: 0, quarterly: 0 };
  }
  const maxDaily = Math.max(...players.map((p) => toInt(p.rituals_today, 0)));
  const maxWeekly = Math.max(...players.map((p) => toInt(p.rituals_week, 0)));
  const maxMonthly = Math.max(...players.map((p) => toInt(p.rituals_month, 0)));
  const maxQuarterly = Math.max(...players.map((p) => toInt(p.rituals_quarter, 0)));
  const dailyTarget = Math.max(1, CHALLENGE_TARGET_DAILY);
  const weeklyTarget = Math.max(1, CHALLENGE_TARGET_WEEKLY);
  const monthlyTarget = Math.max(1, CHALLENGE_TARGET_MONTHLY);
  const quarterlyTarget = Math.max(1, CHALLENGE_TARGET_QUARTERLY);
  return {
    daily: Math.min(100, Math.round((maxDaily / dailyTarget) * 100)),
    weekly: Math.min(100, Math.round((maxWeekly / weeklyTarget) * 100)),
    monthly: Math.min(100, Math.round((maxMonthly / monthlyTarget) * 100)),
    quarterly: Math.min(100, Math.round((maxQuarterly / quarterlyTarget) * 100)),
  };
}

function buildFlowPayload(session, players = []) {
  const sanitizedPlayers = players.filter(Boolean);
  const zone = String(session?.zone || "0:0");
  const watchers = toInt(session?.watchers, 0);
  const jealousyDetails = sanitizedPlayers.map((player) => ({
    avatar: player.avatar_id,
    level: deriveJealousyLevel(player),
    rival_tag: deriveRivalTag(player),
  }));
  const jealousyLevel = jealousyDetails.length
    ? Math.max(...jealousyDetails.map((detail) => detail.level))
    : 0;
  const jealousyTag = jealousyDetails.length
    ? jealousyDetails.sort((a, b) => b.level - a.level)[0].rival_tag
    : "stable";
  const challenge = deriveChallengeProgress(sanitizedPlayers);
  return {
    zone,
    participants: sanitizedPlayers.map((player) => player.avatar_id),
    watchers,
    zone_pressure: deriveZonePressure(session, sanitizedPlayers),
    jealousy_level: jealousyLevel,
    jealousy_tag: jealousyTag,
    jealousy_details: jealousyDetails,
    challenge_daily: challenge.daily,
    challenge_weekly: challenge.weekly,
    challenge_monthly: challenge.monthly,
    challenge_quarterly: challenge.quarterly,
    challenge_progress: challenge.daily,
  };
}

async function emitFlowUpdate(session, players = []) {
  if (!session) return;
  const payload = buildFlowPayload(session, players);
  logger.info(
    {
      zone: payload.zone,
      zone_pressure: payload.zone_pressure,
      jealousy_level: payload.jealousy_level,
      challenge_progress: payload.challenge_progress,
    },
    "flow_update emitted"
  );
  await emitWorkerEvent("flow_update", payload);
}

async function refreshActiveArtifacts() {
  const now = nowMs();
  if (artifactCache.updatedAt && now - artifactCache.updatedAt < ARTIFACT_CACHE_TTL_MS) {
    return artifactCache.items;
  }

  await db.expireArtifacts(nowSec());
  const artifacts = await db.getActiveArtifacts();
  artifactCache.items = artifacts || [];
  artifactCache.updatedAt = now;
  return artifactCache.items;
}

function artifactZonesMatch(artifact, zone) {
  if (!artifact) return false;
  const targetZone = String(zone || "").trim();
  const artifactZone = String(artifact.location || "").trim();
  if (!artifactZone) return true;
  if (!targetZone) return false;
  return artifactZone === targetZone;
}

async function getRelevantArtifacts(zone) {
  const artifacts = await refreshActiveArtifacts();
  const now = nowSec();
  const normalizedZone = String(zone || "").trim();
  return artifacts.filter((artifact) => {
    if (!artifact) return false;
    const expiresAt = toInt(artifact.expires_at, 0);
    if (expiresAt > 0 && expiresAt <= now) return false;
    return artifactZonesMatch(artifact, normalizedZone);
  });
}

async function applyZonePressureTick(zoneId, players = 0, orderMultiplier = 1, ownerHint = "") {
  const zone = sanitizeZone(zoneId);
  if (!zone) return null;
  const existing = (await db.getZone(zone)) || {};
  const result = nextZonePressureState({
    pressure: existing.pressure,
    players,
    orderMultiplier,
    owner: existing.owner || "",
    ownerHint,
    now: nowMs(),
  });
  const lastFlip = result.flipped ? result.last_flip : toInt(existing.last_flip, 0);

  await db.upsertZone(zone, {
    pressure: result.pressure,
    owner: result.owner,
    last_flip: lastFlip,
    updated_at: nowMs(),
  });

  if (result.flipped) {
    await emitWorkerEvent("zone_flip", {
      zone,
      owner: result.owner,
      pressure: result.pressure,
      last_flip: lastFlip,
    });
  }

  return {
    zone,
    pressure: result.pressure,
    owner: result.owner,
    flipped: result.flipped,
  };
}

async function applyArtifactModifiers(player, baseXp, context = {}) {
  const zone = context.zone || player.zone;
  const artifacts = await getRelevantArtifacts(zone);
  let xpMultiplier = 1;
  let flatBonus = 0;
  let surgeBonus = 0;
  const artifactIds = new Set();
  const reason = String(context.reason || "").toLowerCase();

  for (const artifact of artifacts) {
    if (!artifact.effect_type) continue;
    artifactIds.add(artifact.artifact_id);
    const power = toNumber(artifact.power_level, 0);
    switch (artifact.effect_type) {
      case "xp_boost":
        xpMultiplier += power;
        break;
      case "ritual_modifier":
        if (reason.includes("ritual")) {
          flatBonus += power;
        }
        break;
      case "surge_amplification":
        surgeBonus += Math.max(1, Math.round(power));
        break;
      case "zone_pressure":
        xpMultiplier += power * 0.1;
        break;
      default:
        break;
    }
  }

  const adjustedXp = Math.max(0, Math.round((baseXp * xpMultiplier + flatBonus) * 100) / 100);
  return {
    xp: adjustedXp,
    xpMultiplier,
    flatBonus,
    surgeBonus,
    artifacts: [...artifactIds],
  };
}

function calculateLevel(xp) {
  return levelFromTotalXp(xp);
}

function calculateHoneyMultiplier(player) {
  const now = nowSec();

  if (player.honey_type === "dev") {
    if (player.honey_stage >= 1 && player.honey_stage <= 3) {
      return HONEY_STAGES[player.honey_stage - 1];
    }
    return HONEY_MULTIPLIERS.dev;
  }

  if (player.honey_type === "poison" && player.poison_expire > now) {
    return HONEY_MULTIPLIERS.poison;
  }

  if (player.honey_type === "royal" && player.honey_expire > now) {
    return HONEY_MULTIPLIERS.royal;
  }

  return 1;
}

function applySurgeMultiplier(player, baseXp) {
  if (toInt(player.surge_ready, 0) >= 1) {
    return Math.round(baseXp * SURGE_XP_BONUS * 100) / 100;
  }
  return baseXp;
}

function updateSurgeCharge(player, delta = 0, nowMsValue = nowMs()) {
  const updates = {};
  let charge = toInt(player.surge_charge, 0);
  if (delta !== 0) {
    charge = Math.min(100, Math.max(0, charge + delta));
    updates.surge_charge = charge;
    updates.surge_ready = charge >= 100 ? 1 : 0;
  }

  const idleMs = nowMsValue - toInt(player.last_action_at, nowMsValue);
  if (idleMs > SURGE_DECAY_IDLE_MS && charge > 0) {
    charge = Math.max(0, charge - SURGE_DECAY_STEP);
    updates.surge_charge = charge;
    updates.surge_ready = charge >= 100 ? 1 : 0;
  }

  if (updates.surge_charge !== undefined) {
    player.surge_charge = charge;
    player.surge_ready = updates.surge_ready;
  }
  return updates;
}

function calculateActiveXp(player, participants, flags) {
  const baseXP = 100;
  const synergyMultiplier = 1 + participants * 0.15;
  const honeyMultiplier = calculateHoneyMultiplier(player);
  const groupMultiplier = flags.group ? 1.15 : 1;
  const zoneMultiplier = flags.zone ? 1.2 : 1;
  const groupTagMultiplier = flags.groupTag ? 1.05 : 1;

  const raw =
    baseXP *
    participants *
    synergyMultiplier *
    honeyMultiplier *
    groupMultiplier *
    zoneMultiplier *
    groupTagMultiplier;

  const adjusted = applySurgeMultiplier(player, raw);
  return Math.max(0, Math.round(adjusted * 100) / 100);
}

function calculateDripXp(player, flags) {
  const honeyMultiplier = calculateHoneyMultiplier(player);
  const zoneMultiplier = flags.zone ? 1.2 : 1;
  const groupTagMultiplier = flags.groupTag ? 1.05 : 1;

  const raw = DRIP_BASE_XP * honeyMultiplier * zoneMultiplier * groupTagMultiplier;
  return Math.max(0, Math.round(raw * 100) / 100);
}

async function ensureRedisReady() {
  await connectWithRetry(redis, "primary", logger);
  await connectWithRetry(sub, "subscriber", logger);
}

async function loadPlayer(avatarId) {
  const data = await redis.hGetAll(`${PLAYER_PREFIX}${avatarId}`);
  if (!data || Object.keys(data).length === 0) return null;
  return objectFromHash(data, avatarId);
}

async function ensurePlayer(avatarId) {
  const existing = await loadPlayer(avatarId);
  if (existing) {
    await db.ensurePlayer(avatarId);
    return existing;
  }

  const base = defaultPlayer(avatarId);
  await hSetFields(`${PLAYER_PREFIX}${avatarId}`, hashFromObject(base));
  await db.ensurePlayer(avatarId);
  return base;
}

async function savePlayer(avatarId, updates) {
  const clean = hashFromObject(updates);
  if (Object.keys(clean).length === 0) return;
  await hSetFields(`${PLAYER_PREFIX}${avatarId}`, clean);
  const dbFields = mapFieldsForDb(updates);
  if (Object.keys(dbFields).length > 0) {
    await db.ensurePlayer(avatarId);
    await db.updatePlayer(avatarId, dbFields);
  }
}

async function refreshPlayerLifecycle(player) {
  const today = utcDate();
  const weekKey = utcWeekKey();
  const monthKey = utcMonthKey();
  const quarterKey = utcQuarterKey();
  const now = nowSec();
  const updates = {
    last_seen: nowMs(),
  };
  let resetDaily = false;
  let resetWeekly = false;
  let resetMonthly = false;
  let resetQuarterly = false;

  if (player.last_daily_reset !== today) {
    updates.rituals_today = 0;
    updates.dev_uses_today = 0;
    updates.poison_uses_today = 0;
    updates.royal_uses_today = 0;
    updates.last_daily_reset = today;
    resetDaily = true;
  }

  if (player.last_weekly_reset !== weekKey) {
    updates.rituals_week = 0;
    updates.last_weekly_reset = weekKey;
    resetWeekly = true;
  }

  if (player.last_monthly_reset !== monthKey) {
    updates.rituals_month = 0;
    updates.last_monthly_reset = monthKey;
    resetMonthly = true;
  }

  if (player.last_quarterly_reset !== quarterKey) {
    updates.rituals_quarter = 0;
    updates.last_quarterly_reset = quarterKey;
    resetQuarterly = true;
  }

  if (player.honey_type && player.honey_expire > 0 && player.honey_expire <= now) {
    updates.honey = "";
    updates.honey_type = "";
    updates.honey_stage = 0;
    updates.honey_multiplier = 1;
    updates.honey_expire = 0;
  }

  if (player.honey_type === "poison" && player.poison_expire > 0 && player.poison_expire <= now) {
    updates.honey = "";
    updates.honey_type = "";
    updates.honey_stage = 0;
    updates.honey_multiplier = 1;
    updates.poison_expire = 0;
  }

  if (player.honey_type === "royal" && player.honey_expire > 0 && player.honey_expire <= now) {
    updates.honey = "";
    updates.honey_type = "";
    updates.honey_stage = 0;
    updates.honey_multiplier = 1;
    updates.honey_expire = 0;
  }

  const surgeDecay = updateSurgeCharge(player, 0, nowMs());
  Object.assign(updates, surgeDecay);

  if (Object.keys(updates).length > 0) {
    await savePlayer(player.avatar_id, updates);
    Object.assign(player, updates);
  }

  if (resetDaily || resetWeekly || resetMonthly || resetQuarterly) {
    const current = (await db.getChallenge(player.avatar_id)) || {};
    await db.upsertChallenge(player.avatar_id, {
      daily_progress: resetDaily ? 0 : Number(current.daily_progress || 0),
      weekly_progress: resetWeekly ? 0 : Number(current.weekly_progress || 0),
      monthly_progress: resetMonthly ? 0 : Number(current.monthly_progress || 0),
      quarterly_progress: resetQuarterly ? 0 : Number(current.quarterly_progress || 0),
      daily_claimed: resetDaily ? 0 : Number(current.daily_claimed || 0),
      weekly_claimed: resetWeekly ? 0 : Number(current.weekly_claimed || 0),
      monthly_claimed: resetMonthly ? 0 : Number(current.monthly_claimed || 0),
      quarterly_claimed: resetQuarterly ? 0 : Number(current.quarterly_claimed || 0),
      updated_at: nowMs(),
    });
  }

  return player;
}

async function bumpChallengeProgress(player) {
  if (!player || !player.avatar_id) return;
  const current = (await db.getChallenge(player.avatar_id)) || {};
  const daily = Math.min(100, Math.round((toInt(player.rituals_today, 0) / CHALLENGE_TARGET_DAILY) * 100));
  const weekly = Math.min(100, Math.round((toInt(player.rituals_week, 0) / CHALLENGE_TARGET_WEEKLY) * 100));
  const monthly = Math.min(100, Math.round((toInt(player.rituals_month, 0) / CHALLENGE_TARGET_MONTHLY) * 100));
  const quarterly = Math.min(100, Math.round((toInt(player.rituals_quarter, 0) / CHALLENGE_TARGET_QUARTERLY) * 100));
  await db.upsertChallenge(player.avatar_id, {
    daily_progress: daily,
    weekly_progress: weekly,
    monthly_progress: monthly,
    quarterly_progress: quarterly,
    daily_claimed: Number(current.daily_claimed || 0),
    weekly_claimed: Number(current.weekly_claimed || 0),
    monthly_claimed: Number(current.monthly_claimed || 0),
    quarterly_claimed: Number(current.quarterly_claimed || 0),
    updated_at: nowMs(),
  });
}

async function awardXp(avatarId, amount, reason, extra = {}) {
  const player = await ensurePlayer(avatarId);
  await refreshPlayerLifecycle(player);

  const baseGain = Number(amount) || 0;
  const artifactContext = {
    zone: extra.zone || player.zone,
    reason,
  };
  const artifactEffects = await applyArtifactModifiers(player, baseGain, artifactContext);
  const finalGain = artifactEffects.xp;

  player.xp = toNumber(player.xp, 0) + finalGain;
  player.level = calculateLevel(player.xp);
  player.last_action_at = nowMs();
  player.last_seen = nowMs();
  player.session_xp = toNumber(player.session_xp, 0) + finalGain;

  const updates = {
    xp: player.xp,
    level: player.level,
    last_action_at: player.last_action_at,
    last_seen: player.last_seen,
    session_xp: player.session_xp,
  };

  const surgeUpdates = updateSurgeCharge(player, SURGE_CHARGE_STEP, nowMs());
  Object.assign(updates, surgeUpdates);

  if (artifactEffects.surgeBonus) {
    const stacks = toInt(player.surge_stacks, 0) + Math.max(0, Math.round(artifactEffects.surgeBonus));
    player.surge_stacks = stacks;
    updates.surge_stacks = stacks;
  }

  await savePlayer(avatarId, updates);

  await emitWorkerEvent("xp_awarded", {
    avatar: avatarId,
    amount: finalGain,
    base_xp: baseGain,
    reason,
    xp: player.xp,
    level: player.level,
    artifacts: artifactEffects.artifacts,
    xp_multiplier: artifactEffects.xpMultiplier,
    surge_bonus: artifactEffects.surgeBonus,
    ...extra,
  });

  return { player, gain: finalGain };
}

async function awardPentacles(avatarId, amount, reason, extra = {}) {
  const player = await ensurePlayer(avatarId);
  await refreshPlayerLifecycle(player);

  const gain = Number(amount) || 0;
  player.pentacles = toNumber(player.pentacles, 0) + gain;
  player.last_action_at = nowMs();
  player.last_seen = nowMs();

  await savePlayer(avatarId, {
    pentacles: player.pentacles,
    last_action_at: player.last_action_at,
    last_seen: player.last_seen,
  });

  await emitWorkerEvent("pentacle_awarded", {
    avatar: avatarId,
    amount: gain,
    reason,
    pentacles: player.pentacles,
    ...extra,
  });

  return { player, gain };
}

async function addBond(avatarA, avatarB) {
  if (!avatarA || !avatarB || avatarA === avatarB) return;
  const a = await ensurePlayer(avatarA);
  const b = await ensurePlayer(avatarB);

  a.bonds = toInt(a.bonds, 0) + 1;
  b.bonds = toInt(b.bonds, 0) + 1;

  await savePlayer(avatarA, {
    bonds: a.bonds,
    last_seen: nowMs(),
  });
  await savePlayer(avatarB, {
    bonds: b.bonds,
    last_seen: nowMs(),
  });
}

async function getSession(sessionId) {
  const hash = await redis.hGetAll(`${SESSION_PREFIX}${sessionId}`);
  if (!hash || Object.keys(hash).length === 0) return null;

  return {
    session_id: sessionId,
    avatar_a: String(hash.avatar_a || ""),
    avatar_b: String(hash.avatar_b || ""),
    object_id: String(hash.object_id || ""),
    zone: String(hash.zone || "0:0"),
    started_at: toInt(hash.started_at, 0),
    last_tick: toInt(hash.last_tick, 0),
    last_reward_at: toInt(hash.last_reward_at, 0),
    active: toInt(hash.active, 0),
    ended_at: toInt(hash.ended_at, 0),
    duration: toInt(hash.duration, 0),
    group_tag: toInt(hash.group_tag, 0),
    watchers: toInt(hash.watchers, 0),
    phase_15_awarded: toInt(hash.phase_15_awarded, 0),
    ritual_awarded: toInt(hash.ritual_awarded, 0),
  };
}

async function getSessionByAvatar(avatarId) {
  const sessionId = await redis.get(`${AVATAR_SESSION_PREFIX}${avatarId}`);
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return session;
}

async function saveSession(sessionId, fields) {
  const clean = hashFromObject(fields);
  if (Object.keys(clean).length === 0) return;
  await hSetFields(`${SESSION_PREFIX}${sessionId}`, clean);
  await db.saveSession(sessionId, fields);
}

async function clearAvatarSessionLinks(session) {
  if (!session) return;
  const delArgs = [];
  if (session.avatar_a) delArgs.push(`${AVATAR_SESSION_PREFIX}${session.avatar_a}`);
  if (session.avatar_b) delArgs.push(`${AVATAR_SESSION_PREFIX}${session.avatar_b}`);
  if (delArgs.length > 0) {
    await redis.del(...delArgs);
  }
  if (session.session_id) {
    await db.saveSession(session.session_id, {
      active: 0,
      ended_at: nowMs(),
      duration: toInt(session.duration, 0),
    });
  }
}

async function emitWorkerEvent(type, payload = {}, meta = {}) {
  const event = await publishEvent(redis, type, payload, {
    source: "worker",
    ...meta,
  });
  await db.logEvent(event);
  return event;
}

async function claimEvent(eventId) {
  const key = `jls:processed:${eventId}`;
  const result = await redis.set(key, "1", {
    NX: true,
    EX: 7 * 24 * 60 * 60,
  });
  return result === "OK";
}

async function handleSyncEvent(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  const updates = {
    last_seen: nowMs(),
    last_action_at: nowMs(),
  };

  if (p.x !== undefined) updates.x = toNumber(p.x, 0);
  if (p.y !== undefined) updates.y = toNumber(p.y, 0);
  if (p.z !== undefined) updates.z = toNumber(p.z, 0);
  if (p.zone !== undefined) updates.zone = sanitizeZone(p.zone);
  if (p.order !== undefined) updates.order = String(p.order || "neutral");
  if (p.watchers !== undefined) updates.watchers = toInt(p.watchers, 0);
  if (p.group_tag !== undefined) updates.group_tag = toInt(p.group_tag, 0);
  if (p.object_id !== undefined) updates.object_id = sanitizeText(p.object_id, "");

  if (updates.zone) updates.last_zone = updates.zone;

  await savePlayer(avatar, updates);
}

async function handleSessionStart(event) {
  const p = event.payload || {};
  const avatarA = sanitizeAvatar(p.avatar);
  const avatarB = sanitizeAvatar(p.partner);
  const objectId = sanitizeText(p.object_id || "", "");
  const zone = sanitizeZone(p.zone);
  const startedAt = toInt(p.started_at, nowMs());

  if (!avatarA || !avatarB || avatarA === avatarB) return;

  const sessionId = pairKey(avatarA, avatarB);

  await ensurePlayer(avatarA);
  await ensurePlayer(avatarB);

  const existing = await getSession(sessionId);
  const effectiveStartedAt =
    existing && existing.active === 1 && toInt(existing.started_at, 0) > 0
      ? toInt(existing.started_at, startedAt)
      : startedAt;

  // Reset per-session XP counters at the beginning of a session so end-of-session
  // winner/loser resolution is meaningful.
  await savePlayer(avatarA, { session_xp: 0, last_seen: nowMs() });
  await savePlayer(avatarB, { session_xp: 0, last_seen: nowMs() });

  const session = {
    session_id: sessionId,
    avatar_a: avatarA,
    avatar_b: avatarB,
    object_id: objectId,
    zone,
    order: String(p.order || "neutral"),
    started_at: effectiveStartedAt,
    last_tick: effectiveStartedAt,
    last_reward_at: existing ? toInt(existing.last_reward_at, effectiveStartedAt) : effectiveStartedAt,
    active: 1,
    ended_at: 0,
    duration: 0,
    group_tag: toInt(p.group_tag, 0),
    watchers: toInt(p.watchers, 0),
    phase_15_awarded: existing ? toInt(existing.phase_15_awarded, 0) : 0,
    ritual_awarded: existing ? toInt(existing.ritual_awarded, 0) : 0,
  };

  await saveSession(sessionId, session);
  await redis.set(`${AVATAR_SESSION_PREFIX}${avatarA}`, sessionId);
  await redis.set(`${AVATAR_SESSION_PREFIX}${avatarB}`, sessionId);

  await emitWorkerEvent("session_started", {
    session_id: sessionId,
    avatar_a: avatarA,
    avatar_b: avatarB,
    object_id: objectId,
    zone,
  });
}

async function handleSessionTick(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const session = await getSessionByAvatar(avatar);
  if (!session || !session.active) return;

  const now = nowMs();
  const startedAt = toInt(session.started_at, now);
  const duration = Math.max(0, now - startedAt);
  const elapsedSinceTick = now - toInt(session.last_tick, session.started_at || now);
  if (elapsedSinceTick > SESSION_IDLE_TIMEOUT_MS) return;

  if (duration >= SESSION_PHASE_15_MS && toInt(session.phase_15_awarded, 0) !== 1) {
    const sessionKey = `${SESSION_PREFIX}${session.session_id}`;
    // Atomic claim so duplicated ticks or multiple workers cannot double-award.
    const claimed = await claimSessionFlag(sessionKey, "phase_15_awarded");
    if (!claimed) {
      // Refresh local snapshot so later logic is consistent.
      session.phase_15_awarded = 1;
    } else {
    const avatarA = session.avatar_a;
    const avatarB = session.avatar_b;
    const participants = [avatarA, avatarB].filter(Boolean);
    for (const participant of participants) {
      await awardXp(participant, 25, "ritual_phase_15", { session_id: session.session_id });
    }
    await saveSession(session.session_id, {
      phase_15_awarded_at: now,
    });
    await emitWorkerEvent("ritual_phase_15", {
      session_id: session.session_id,
      avatar_a: avatarA,
      avatar_b: avatarB,
      duration,
    });
    }
  }

  const elapsedSinceReward = now - toInt(session.last_reward_at, session.started_at || now);
  if (elapsedSinceReward < ACTIVE_REWARD_MS) {
    await saveSession(session.session_id, {
      last_tick: now,
      watchers: toInt(p.watchers, session.watchers),
      group_tag: toInt(p.group_tag, session.group_tag),
      zone: sanitizeZone(p.zone || session.zone),
    });
    return;
  }

  const avatarA = session.avatar_a;
  const avatarB = session.avatar_b;
  const participants = [avatarA, avatarB].filter(Boolean);
  const count = Math.max(1, participants.length);

  const hasGroup = truthy(p.group);
  const hasZone = Boolean(sanitizeZone(p.zone || session.zone));
  const hasGroupTag = truthy(p.group_tag) || toInt(session.group_tag, 0) > 0;

  let totalGain = 0;
  const participantPlayers = [];

  for (const participant of participants) {
    const player = await ensurePlayer(participant);
    await refreshPlayerLifecycle(player);

    const participantFlags = {
      group: hasGroup,
      zone: hasZone,
      groupTag: hasGroupTag || toInt(player.group_tag, 0) > 0,
    };

    const gain = calculateActiveXp(player, count, participantFlags);
    const result = await awardXp(participant, gain, "session_tick", {
      session_id: session.session_id,
      zone: sanitizeZone(p.zone || session.zone),
      watchers: toInt(p.watchers, session.watchers),
    });

    totalGain += result.gain;
    participantPlayers.push(result.player);
  }

  await saveSession(session.session_id, {
    last_tick: now,
    last_reward_at: now,
    watchers: toInt(p.watchers, session.watchers),
    group_tag: toInt(p.group_tag, session.group_tag),
    zone: sanitizeZone(p.zone || session.zone),
    order: String(p.order || session.order || "neutral"),
  });

  const pair = await redis.hGetAll(`${PAIR_PREFIX}${session.session_id}`);
  const currentShared = toNumber(pair.shared_xp, 0);
  await hSetFields(
    `${PAIR_PREFIX}${session.session_id}`,
    hashFromObject({
      pair_key: session.session_id,
      avatar_a: avatarA,
      avatar_b: avatarB,
      shared_xp: String(currentShared + totalGain),
      sessions: String(toNumber(pair.sessions, 0)),
      updated_at: String(nowMs()),
    })
  );
  await db.updatePair(session.session_id, {
    avatar_a: avatarA,
    avatar_b: avatarB,
    shared_xp: currentShared + totalGain,
    sessions: toNumber(pair.sessions, 0),
    updated_at: nowMs(),
  });

  await emitWorkerEvent("session_tick_resolved", {
    session_id: session.session_id,
    avatar,
    participants: count,
    xp_awarded: totalGain,
    zone: sanitizeZone(p.zone || session.zone),
  });
  await emitFlowUpdate(session, participantPlayers);
}

async function handleSessionEnd(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const session = await getSessionByAvatar(avatar);
  if (!session) return;
  if (!session.active || toInt(session.ended_at, 0) > 0) return;

  const now = nowMs();
  const startedAt = toInt(session.started_at, now);
  const duration = Math.max(0, now - startedAt);
  const avatarA = session.avatar_a;
  const avatarB = session.avatar_b;
  const sessionKey = `${SESSION_PREFIX}${session.session_id}`;

  await saveSession(session.session_id, {
    active: 0,
    ended_at: now,
    duration,
    last_tick: now,
    last_reward_at: toInt(session.last_reward_at, startedAt),
  });

  let ritualComplete = false;
  let ritualXp = 0;
  const participantPlayers = [];

  // If the session ended after the 15-minute mark but the milestone never fired (no tick),
  // award it once here (idempotent via session flag).
  if (duration >= SESSION_PHASE_15_MS && toInt(session.phase_15_awarded, 0) !== 1) {
    const claimed = await claimSessionFlag(sessionKey, "phase_15_awarded");
    if (claimed) {
      for (const participant of [avatarA, avatarB].filter(Boolean)) {
        await awardXp(participant, 25, "ritual_phase_15", { session_id: session.session_id, duration });
      }
      await saveSession(session.session_id, { phase_15_awarded_at: now });
      await emitWorkerEvent("ritual_phase_15", {
        session_id: session.session_id,
        avatar_a: avatarA,
        avatar_b: avatarB,
        duration,
        source: "session_end",
      });
    }
  }

  if (duration >= SESSION_RITUAL_MS && toInt(session.ritual_awarded, 0) !== 1) {
    // Atomic claim so a duplicate session_end cannot double-award the ritual completion.
    const claimed = await claimSessionFlag(sessionKey, "ritual_awarded");
    if (!claimed) {
      // Still clear links, but do not award again.
      await clearAvatarSessionLinks(session);
      return;
    }
    ritualComplete = true;
    ritualXp = 75;

    const playerA = avatarA ? await ensurePlayer(avatarA) : null;
    const playerB = avatarB ? await ensurePlayer(avatarB) : null;
    if (playerA) await refreshPlayerLifecycle(playerA);
    if (playerB) await refreshPlayerLifecycle(playerB);

    const xpA = playerA ? toNumber(playerA.session_xp, 0) : 0;
    const xpB = playerB ? toNumber(playerB.session_xp, 0) : 0;

    const ordered = [avatarA, avatarB].filter(Boolean).sort();
    const fallbackWinner = ordered[0] || "";
    let winner = fallbackWinner;
    let loser = ordered[1] || "";
    if (xpA > xpB) {
      winner = avatarA;
      loser = avatarB;
    } else if (xpB > xpA) {
      winner = avatarB;
      loser = avatarA;
    }

    for (const participant of [avatarA, avatarB].filter(Boolean)) {
      await awardXp(participant, ritualXp, "ritual_complete", {
        session_id: session.session_id,
        duration,
        winner,
        loser,
      });

      const player = await ensurePlayer(participant);
      await refreshPlayerLifecycle(player);
      player.rituals = toInt(player.rituals, 0) + 1;
      player.rituals_today = toInt(player.rituals_today, 0) + 1;
      player.rituals_week = toInt(player.rituals_week, 0) + 1;
      player.rituals_month = toInt(player.rituals_month, 0) + 1;
      player.rituals_quarter = toInt(player.rituals_quarter, 0) + 1;
      player.bonds = toInt(player.bonds, 0) + 1;
      player.last_seen = nowMs();
      player.last_action_at = nowMs();
      player.level = calculateLevel(player.xp);

      await savePlayer(participant, {
        rituals: player.rituals,
        rituals_today: player.rituals_today,
        rituals_week: player.rituals_week,
        rituals_month: player.rituals_month,
        rituals_quarter: player.rituals_quarter,
        bonds: player.bonds,
        level: player.level,
        last_seen: player.last_seen,
        last_action_at: player.last_action_at,
      });
      await bumpChallengeProgress(player);
      participantPlayers.push(player);
    }

    // Pentacles via deterministic winner/loser resolution.
    if (winner && loser) {
      await awardPentacles(winner, 5, "ritual_winner", { session_id: session.session_id, opponent: loser });
      await awardPentacles(loser, 2.5, "ritual_loser", { session_id: session.session_id, opponent: winner });
      await emitWorkerEvent("battle_result", {
        winner,
        loser,
        winner_reward: 5,
        loser_reward: 2.5,
      });
    }

    await addBond(avatarA, avatarB);

    const pair = await redis.hGetAll(`${PAIR_PREFIX}${session.session_id}`);
    const currentSessions = toNumber(pair.sessions, 0);
    const currentShared = toNumber(pair.shared_xp, 0);

    await hSetFields(
      `${PAIR_PREFIX}${session.session_id}`,
      hashFromObject({
        pair_key: session.session_id,
        avatar_a: avatarA,
        avatar_b: avatarB,
        shared_xp: String(currentShared + ritualXp * 2),
        sessions: String(currentSessions + 1),
        updated_at: String(nowMs()),
      })
    );
    await db.updatePair(session.session_id, {
      avatar_a: avatarA,
      avatar_b: avatarB,
      shared_xp: currentShared + ritualXp * 2,
      sessions: currentSessions + 1,
      updated_at: nowMs(),
    });

    await saveSession(session.session_id, {
      ritual_awarded_at: now,
    });
  }

  await clearAvatarSessionLinks(session);

  await emitWorkerEvent("session_ended", {
    session_id: session.session_id,
    avatar_a: avatarA,
    avatar_b: avatarB,
    duration,
    ritual_complete: ritualComplete ? 1 : 0,
    ritual_xp: ritualXp,
  });
  await emitFlowUpdate(session, participantPlayers);
}

async function handleDripRequest(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  const now = nowMs();
  const idleMs = now - toInt(player.last_action_at, 0);
  if (idleMs > SESSION_IDLE_TIMEOUT_MS) {
    await emitWorkerEvent("drip_blocked", {
      avatar,
      reason: "idle",
      idle_ms: idleMs,
    });
    return;
  }

  if (toInt(player.rituals_today, 0) <= 0) {
    await emitWorkerEvent("drip_blocked", {
      avatar,
      reason: "no_ritual_today",
    });
    return;
  }

  const flags = {
    zone: Boolean(sanitizeZone(p.zone || player.zone)),
    groupTag: truthy(p.group_tag) || toInt(player.group_tag, 0) > 0,
  };

  const gain = calculateDripXp(player, flags);
  await awardXp(avatar, gain, "drip", {
    zone: sanitizeZone(p.zone || player.zone),
  });

  await emitWorkerEvent("drip_awarded", {
    avatar,
    xp: gain,
    zone: sanitizeZone(p.zone || player.zone),
  });
}

async function handleChallengeClaim(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;
  const tier = String(p.tier || "").toLowerCase();
  if (!["daily", "weekly", "monthly", "quarterly"].includes(tier)) return;

  const challenge = (await db.getChallenge(avatar)) || {};
  const claimedKey = `${tier}_claimed`;
  const claimed = Number(challenge[claimedKey] || 0);

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);
  const daily = Math.min(100, Math.round((toInt(player.rituals_today, 0) / CHALLENGE_TARGET_DAILY) * 100));
  const weekly = Math.min(100, Math.round((toInt(player.rituals_week, 0) / CHALLENGE_TARGET_WEEKLY) * 100));
  const monthly = Math.min(100, Math.round((toInt(player.rituals_month, 0) / CHALLENGE_TARGET_MONTHLY) * 100));
  const quarterly = Math.min(100, Math.round((toInt(player.rituals_quarter, 0) / CHALLENGE_TARGET_QUARTERLY) * 100));
  const progressMap = {
    daily,
    weekly,
    monthly,
    quarterly,
  };
  const progress = progressMap[tier] || 0;
  if (progress < 100 || claimed > 0) {
    await emitWorkerEvent("challenge_rejected", { avatar, tier, reason: "not_ready" });
    return;
  }

  const now = nowSec();
  let reward = "xp_boost";
  if (tier === "daily") reward = "xp_boost";
  if (tier === "weekly") reward = "ritual_credit";
  if (tier === "monthly") reward = "pentacle";
  if (tier === "quarterly") reward = "royal_honey";

  if (reward === "xp_boost") {
    player.challenge_boost_pct = tier === "daily" ? 10 : tier === "weekly" ? 20 : 35;
    player.challenge_boost_until = now + 3600;
  }
  if (reward === "ritual_credit") {
    player.rituals = toInt(player.rituals, 0) + 3;
  }
  if (reward === "pentacle") {
    player.pentacles = toNumber(player.pentacles, 0) + 1;
  }
  if (reward === "royal_honey") {
    player.honey = "royal";
    player.honey_type = "royal";
    player.honey_stage = 1;
    player.honey_multiplier = HONEY_MULTIPLIERS.royal;
    player.honey_expire = now + 45 * 60;
    player.honey_cooldown = now + 24 * 60 * 60;
  }

  await savePlayer(avatar, {
    rituals: player.rituals,
    pentacles: player.pentacles,
    honey: player.honey,
    honey_type: player.honey_type,
    honey_stage: player.honey_stage,
    honey_multiplier: player.honey_multiplier,
    honey_expire: player.honey_expire,
    honey_cooldown: player.honey_cooldown,
    challenge_boost_pct: player.challenge_boost_pct,
    challenge_boost_until: player.challenge_boost_until,
    last_seen: nowMs(),
    last_action_at: nowMs(),
  });

  await db.upsertChallenge(avatar, {
    daily_progress: daily,
    weekly_progress: weekly,
    monthly_progress: monthly,
    quarterly_progress: quarterly,
    daily_claimed: tier === "daily" ? 1 : Number(challenge.daily_claimed || 0),
    weekly_claimed: tier === "weekly" ? 1 : Number(challenge.weekly_claimed || 0),
    monthly_claimed: tier === "monthly" ? 1 : Number(challenge.monthly_claimed || 0),
    quarterly_claimed: tier === "quarterly" ? 1 : Number(challenge.quarterly_claimed || 0),
    updated_at: nowMs(),
  });

  await emitWorkerEvent("challenge_awarded", {
    avatar,
    tier,
    reward,
  });
}

async function handleBattleResolve(event) {
  const p = event.payload || {};
  const winner = sanitizeAvatar(p.winner);
  const loser = sanitizeAvatar(p.loser);
  if (!winner || !loser || winner === loser) return;

  const winnerReward = 5;
  const loserReward = 2.5;

  await awardPentacles(winner, winnerReward, "battle_winner", {
    opponent: loser,
  });
  await awardPentacles(loser, loserReward, "battle_loser", {
    opponent: winner,
  });

  await emitWorkerEvent("battle_result", {
    winner,
    loser,
    winner_reward: winnerReward,
    loser_reward: loserReward,
  });
}

async function handlePurchase(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;
  const amount = Number(p.amount || 0);
  const type = String(p.type || "l").toLowerCase();
  if (amount <= 0) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  if (type === "l") {
    await db.addTreasury(amount);
  } else if (type === "pentacle") {
    player.pentacles = toNumber(player.pentacles, 0) + amount;
  }

  await savePlayer(avatar, {
    pentacles: player.pentacles,
    last_seen: nowMs(),
    last_action_at: nowMs(),
  });
  await emitWorkerEvent("purchase", {
    avatar,
    amount,
    type,
    pentacles: player.pentacles,
  });
}

async function handleHoneyUse(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  const type = String(p.type || p.honey || "dev").trim().toLowerCase();
  const now = nowSec();

  if (type === "inm" || type === "spunked") {
    const zone = sanitizeZone(p.zone || player.zone);
    const key = `${SURGE_PENDING_PREFIX}${zone}`;
    const pendingRaw = await redis.get(key);
    const pending = safeParseJson(pendingRaw);
    const nowMsValue = nowMs();

    if (
      pending &&
      pending.avatar &&
      pending.avatar !== avatar &&
      nowMsValue - toInt(pending.ts, 0) <= SURGE_WINDOW_MS
    ) {
      const avatars = [pending.avatar, avatar];
      await redis.del(key);

      for (const target of avatars) {
        await savePlayer(target, {
          surge_charge: 100,
          surge_ready: 1,
          last_seen: nowMsValue,
          last_action_at: nowMsValue,
        });
      }

      await emitWorkerEvent("surge", {
        avatars,
        type,
        zone,
      });
    } else {
      await redis.set(key, JSON.stringify({ avatar, ts: nowMsValue }), {
        PX: SURGE_WINDOW_MS,
      });
      await emitWorkerEvent("surge_pending", {
        avatar,
        type,
        zone,
        window_ms: SURGE_WINDOW_MS,
      });
    }
    return;
  }

  if (type === "dev") {
    const used = toInt(player.dev_uses_today, 0);
    if (used >= 3) {
      await emitWorkerEvent("honey_rejected", {
        avatar,
        type,
        reason: "daily_limit",
      });
      return;
    }

    const stage = Math.min(used + 1, 3);
    player.honey = "dev";
    player.honey_type = "dev";
    player.honey_stage = stage;
    player.honey_multiplier = HONEY_STAGES[stage - 1];
    player.honey_expire = now + 45 * 60;
    player.honey_cooldown = now + 24 * 60 * 60;
    player.dev_uses_today = used + 1;
    player.last_seen = nowMs();
    player.last_action_at = nowMs();

    await savePlayer(avatar, {
      honey: player.honey,
      honey_type: player.honey_type,
      honey_stage: player.honey_stage,
      honey_multiplier: player.honey_multiplier,
      honey_expire: player.honey_expire,
      honey_cooldown: player.honey_cooldown,
      dev_uses_today: player.dev_uses_today,
      last_seen: player.last_seen,
      last_action_at: player.last_action_at,
    });

    await emitWorkerEvent("honey_applied", {
      avatar,
      type: "dev",
      stage,
      multiplier: player.honey_multiplier,
      expires_at: player.honey_expire,
    });
    return;
  }

  if (type === "poison") {
    const used = toInt(player.poison_uses_today, 0);
    if (used >= 3) {
      await emitWorkerEvent("honey_rejected", {
        avatar,
        type,
        reason: "daily_limit",
      });
      return;
    }

    player.honey = "poison";
    player.honey_type = "poison";
    player.honey_stage = 1;
    player.honey_multiplier = HONEY_MULTIPLIERS.poison;
    player.honey_expire = now + 45 * 60;
    player.poison_expire = now + 45 * 60;
    player.honey_cooldown = now + 24 * 60 * 60;
    player.poison_uses_today = used + 1;
    player.last_seen = nowMs();
    player.last_action_at = nowMs();

    await savePlayer(avatar, {
      honey: player.honey,
      honey_type: player.honey_type,
      honey_stage: player.honey_stage,
      honey_multiplier: player.honey_multiplier,
      honey_expire: player.honey_expire,
      poison_expire: player.poison_expire,
      honey_cooldown: player.honey_cooldown,
      poison_uses_today: player.poison_uses_today,
      last_seen: player.last_seen,
      last_action_at: player.last_action_at,
    });

    await emitWorkerEvent("honey_applied", {
      avatar,
      type: "poison",
      multiplier: player.honey_multiplier,
      expires_at: player.honey_expire,
    });
    return;
  }

  if (type === "royal") {
    const rituals = toInt(player.rituals, 0);
    if (rituals < 25) {
      await emitWorkerEvent("honey_rejected", {
        avatar,
        type,
        reason: "not_enough_rituals",
      });
      return;
    }

    if (toInt(player.honey_cooldown, 0) > now) {
      await emitWorkerEvent("honey_rejected", {
        avatar,
        type,
        reason: "cooldown",
      });
      return;
    }

    player.rituals = rituals - 25;
    player.honey = "royal";
    player.honey_type = "royal";
    player.honey_stage = 1;
    player.honey_multiplier = HONEY_MULTIPLIERS.royal;
    player.honey_expire = now + 45 * 60;
    player.honey_cooldown = now + 24 * 60 * 60;
    player.royal_uses_today = toInt(player.royal_uses_today, 0) + 1;
    player.last_seen = nowMs();
    player.last_action_at = nowMs();

    await savePlayer(avatar, {
      rituals: player.rituals,
      honey: player.honey,
      honey_type: player.honey_type,
      honey_stage: player.honey_stage,
      honey_multiplier: player.honey_multiplier,
      honey_expire: player.honey_expire,
      honey_cooldown: player.honey_cooldown,
      royal_uses_today: player.royal_uses_today,
      last_seen: player.last_seen,
      last_action_at: player.last_action_at,
    });

    await emitWorkerEvent("honey_applied", {
      avatar,
      type: "royal",
      multiplier: player.honey_multiplier,
      expires_at: player.honey_expire,
    });
    return;
  }

  await emitWorkerEvent("honey_rejected", {
    avatar,
    type,
    reason: "unknown_type",
  });
}

async function handleArtifactSpawn(event) {
  const p = event.payload || {};
  const artifactId = sanitizeText(p.artifact_id || p.id || "", "").trim();
  if (!artifactId) return;

  const duration = toInt(p.duration, 48 * 60 * 60);
  const expiresAt = toInt(p.expires_at, 0) || nowSec() + duration;
  const artifact = {
    artifact_id: artifactId,
    type: sanitizeText(p.type || p.artifact_type || "", "").trim(),
    power_level: toNumber(p.power_level, 0),
    effect_type: sanitizeText(p.effect_type || "", "").trim(),
    duration,
    owner_id: sanitizeAvatar(p.owner || p.owner_id),
    location: sanitizeText(p.location || p.zone || "", "").trim(),
    expires_at: expiresAt,
    active: p.active !== undefined ? truthy(p.active) : true,
    created_at: nowMs(),
  };

  await db.saveArtifact(artifact);
  artifactCache.updatedAt = 0;
  artifactCache.items = [];
  await emitWorkerEvent("artifact_registered", {
    artifact_id: artifact.artifact_id,
    type: artifact.type,
    owner_id: artifact.owner_id,
    location: artifact.location,
    expires_at: artifact.expires_at,
  });
}

async function handleArtifactExpire(event) {
  const p = event.payload || {};
  const artifactId = sanitizeText(p.artifact_id || p.id || "", "").trim();
  if (!artifactId) return;

  const artifact = await db.expireArtifact(artifactId, nowMs());
  artifactCache.updatedAt = 0;
  artifactCache.items = [];

  if (!artifact) {
    await emitWorkerEvent("artifact_expire_missing", {
      artifact_id: artifactId,
    });
    return;
  }

  await emitWorkerEvent("artifact_expired", {
    artifact_id: artifact.artifact_id,
    type: artifact.type,
    owner_id: artifact.owner_id,
    location: artifact.location,
    expires_at: artifact.expires_at,
    active: false,
  });
}

async function handleGenericAction(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  const updates = {
    last_seen: nowMs(),
    last_action_at: nowMs(),
  };

  if (p.zone !== undefined) updates.zone = sanitizeZone(p.zone);
  if (p.order !== undefined) updates.order = String(p.order || "neutral");
  if (p.watchers !== undefined) updates.watchers = toInt(p.watchers, 0);
  if (p.group_tag !== undefined) updates.group_tag = toInt(p.group_tag, 0);
  if (p.x !== undefined) updates.x = toNumber(p.x, 0);
  if (p.y !== undefined) updates.y = toNumber(p.y, 0);
  if (p.z !== undefined) updates.z = toNumber(p.z, 0);

  await savePlayer(avatar, updates);
}

async function handleAdminCleanupSessions() {
  await cleanupStaleSessions();
  await emitWorkerEvent("admin_cleanup_complete", {
    ran_at: nowMs(),
  });
}

async function handleEvent(rawMessage) {
  const event = safeJsonParse(rawMessage);
  if (!event || typeof event !== "object") return;

  if (event.meta && event.meta.source === "worker") return;
  if (!event.id) {
    event.id = crypto.createHash("sha1").update(rawMessage).digest("hex");
  }

  const accepted = await claimEvent(event.id);
  if (!accepted) return;

  await db.logEvent(event);

  try {
    switch (event.type) {
      case "sync":
        await handleSyncEvent(event);
        break;

      case "session_start":
        await handleSessionStart(event);
        break;

      case "session_tick":
        await handleSessionTick(event);
        break;

      case "session_end":
        await handleSessionEnd(event);
        break;

      case "drip_request":
        await handleDripRequest(event);
        break;

      case "honey_used":
        await handleHoneyUse(event);
        break;

      case "battle_resolve":
        await handleBattleResolve(event);
        break;

      case "challenge_claim":
        await handleChallengeClaim(event);
        break;

      case "purchase":
        await handlePurchase(event);
        break;

      case "artifact_spawn":
        await handleArtifactSpawn(event);
        break;

      case "artifact_expire":
        await handleArtifactExpire(event);
        break;

      case "admin_cleanup_sessions":
        await handleAdminCleanupSessions(event);
        break;

      default:
        await handleGenericAction(event);
        break;
    }
  } catch (err) {
    logger.error({ err, eventType: event.type, eventId: event.id }, "worker event failed");
    await emitWorkerEvent("worker_error", {
      event_id: event.id,
      event_type: event.type,
      error: err.message,
    });
  }
}

async function gatherSessionKeys(pattern, count = 200) {
  const keys = [];
  let cursor = "0";
  while (true) {
    const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: count });
    const isArrayReply = Array.isArray(reply);
    const nextCursor = isArrayReply ? reply[0] : reply?.cursor;
    const batch = isArrayReply ? reply[1] : reply?.keys;
    if (Array.isArray(batch) && batch.length > 0) {
      keys.push(...batch);
    }
    if (!nextCursor || nextCursor === "0") {
      break;
    }
    cursor = nextCursor;
  }
  return keys;
}

async function cleanupStaleSessions() {
  try {
    const keys = await gatherSessionKeys(`${SESSION_PREFIX}*`, 200);

    const now = nowMs();

    for (const key of keys) {
      const sessionId = key.slice(SESSION_PREFIX.length);
      const hash = await redis.hGetAll(key);
      if (!hash || Object.keys(hash).length === 0) continue;

      const active = toInt(hash.active, 0);
      if (active !== 1) continue;

      const lastTick = toInt(hash.last_tick, 0);
      if (lastTick > 0 && now - lastTick <= SESSION_IDLE_TIMEOUT_MS) continue;

      const startedAt = toInt(hash.started_at, now);
      const duration = Math.max(0, now - startedAt);

      await redis.hSet(key, {
        active: "0",
        ended_at: String(now),
        duration: String(duration),
      });

      await db.saveSession(sessionId, {
        active: 0,
        ended_at: now,
        duration,
      });

      const avatarA = String(hash.avatar_a || "");
      const avatarB = String(hash.avatar_b || "");

      if (avatarA) await redis.del(`${AVATAR_SESSION_PREFIX}${avatarA}`);
      if (avatarB) await redis.del(`${AVATAR_SESSION_PREFIX}${avatarB}`);

      await emitWorkerEvent("session_timeout", {
        session_id: sessionId,
        avatar_a: avatarA,
        avatar_b: avatarB,
        duration,
      });
    }
  } catch (err) {
    logger.error({ err }, "stale session cleanup failed");
  }
}

function scheduleArtifactPrune() {
  setInterval(async () => {
    try {
      await db.expireArtifacts(nowSec());
      artifactCache.updatedAt = 0;
      artifactCache.items = [];
    } catch (err) {
      logger.error({ err }, "artifact prune failed");
    }
  }, ARTIFACT_PRUNE_INTERVAL_MS);
}

function scheduleZonePressure() {
  setInterval(async () => {
    try {
      const sessionKeys = await gatherSessionKeys(`${SESSION_PREFIX}*`, 200);
      const now = nowMs();
      const zoneTallies = new Map();

      for (const key of sessionKeys) {
        const hash = await redis.hGetAll(key);
        if (!hash || Object.keys(hash).length === 0) continue;
        if (toInt(hash.active, 0) !== 1) continue;
        if (now - toInt(hash.last_tick, now) > SESSION_IDLE_TIMEOUT_MS) continue;
        const zone = sanitizeZone(hash.zone || "");
        if (!zone) continue;
        const participants = [hash.avatar_a, hash.avatar_b].filter(Boolean).length;
        if (participants <= 0) continue;
        const order = String(hash.order || "neutral").toLowerCase() || "neutral";
        const tally = zoneTallies.get(zone) || { players: 0, orders: new Map() };
        tally.players += participants;
        tally.orders.set(order, (tally.orders.get(order) || 0) + participants);
        zoneTallies.set(zone, tally);
      }

      for (const [zone, tally] of zoneTallies.entries()) {
        const rankedOrders = [...tally.orders.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
        );
        const ownerHint = rankedOrders[0]?.[0] || "neutral";
        const orderMult = deriveOrderMultiplier(ownerHint);
        await applyZonePressureTick(zone, tally.players, orderMult, ownerHint);
      }
    } catch (err) {
      logger.error({ err, args: err?.args, command: err?.command }, "zone pressure tick failed");
    }
  }, ZONE_PRESSURE_TICK_MS);
}

async function boot() {
  await ensureRedisReady();
  await db.ensureSchema();

  await sub.subscribe(EVENT_CHANNEL, handleEvent);

  setInterval(() => {
    cleanupStaleSessions().catch((err) => logger.error({ err }, "cleanup interval error"));
  }, 60_000);

  scheduleArtifactPrune();
  scheduleZonePressure();

  logger.info({ redis: REDIS_URL }, "engine worker online");
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
  process.exit(0);
});

boot().catch((err) => {
  logger.error({ err }, "worker boot failed");
  process.exit(1);
});
