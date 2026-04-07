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

const ACTIVE_REWARD_MS = 60_000;
const SESSION_IDLE_TIMEOUT_MS = 120_000;
const SESSION_RITUAL_MS = 45 * 60 * 1000;
const DRIP_BASE_XP = 5;

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

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
    last_seen: 0,
    last_action_at: 0,
    watchers: 0,
    stacks: 0,
    surge_charge: 0,
    surge_ready: 0,
    group_tag: 0,
    last_zone: "0:0",
    session_xp: 0,
    total_l$: 0,
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
  p.last_seen = toInt(p.last_seen, 0);
  p.last_action_at = toInt(p.last_action_at, 0);
  p.watchers = toInt(p.watchers, 0);
  p.stacks = toInt(p.stacks, 0);
  p.surge_charge = toInt(p.surge_charge, 0);
  p.surge_ready = toInt(p.surge_ready, 0);
  p.group_tag = toInt(p.group_tag, 0);
  p.last_zone = String(p.last_zone || p.zone || "0:0");
  p.session_xp = toNumber(p.session_xp, 0);
  p.total_l$ = toNumber(p.total_l$, 0);
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
  if (xp < 100) return 0;
  return Math.max(1, Math.floor(Math.log(xp / 100) / Math.log(1.12)) + 1);
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

  return Math.max(0, Math.round(raw * 100) / 100);
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
  await redis.hSet(`${PLAYER_PREFIX}${avatarId}`, hashFromObject(base));
  await db.ensurePlayer(avatarId);
  return base;
}

async function savePlayer(avatarId, updates) {
  const clean = hashFromObject(updates);
  if (Object.keys(clean).length === 0) return;
  await redis.hSet(`${PLAYER_PREFIX}${avatarId}`, clean);
  const dbFields = mapFieldsForDb(updates);
  if (Object.keys(dbFields).length > 0) {
    await db.ensurePlayer(avatarId);
    await db.updatePlayer(avatarId, dbFields);
  }
}

async function refreshPlayerLifecycle(player) {
  const today = utcDate();
  const now = nowSec();
  const updates = {
    last_seen: nowMs(),
  };

  if (player.last_daily_reset !== today) {
    updates.rituals_today = 0;
    updates.dev_uses_today = 0;
    updates.poison_uses_today = 0;
    updates.royal_uses_today = 0;
    updates.last_daily_reset = today;
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

  if (Object.keys(updates).length > 0) {
    await savePlayer(player.avatar_id, updates);
    Object.assign(player, updates);
  }

  return player;
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
  await redis.hSet(`${SESSION_PREFIX}${sessionId}`, clean);
  await db.saveSession(sessionId, fields);
}

async function clearAvatarSessionLinks(session) {
  if (!session) return;
  const delArgs = [];
  if (session.avatar_a) delArgs.push(`${AVATAR_SESSION_PREFIX}${session.avatar_a}`);
  if (session.avatar_b) delArgs.push(`${AVATAR_SESSION_PREFIX}${session.avatar_b}`);
  if (delArgs.length > 0) {
    await redis.del(delArgs);
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

  const session = {
    session_id: sessionId,
    avatar_a: avatarA,
    avatar_b: avatarB,
    object_id: objectId,
    zone,
    started_at: startedAt,
    last_tick: startedAt,
    last_reward_at: startedAt,
    active: 1,
    ended_at: 0,
    duration: 0,
    group_tag: toInt(p.group_tag, 0),
    watchers: toInt(p.watchers, 0),
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
  const elapsedSinceTick = now - toInt(session.last_tick, session.started_at || now);
  if (elapsedSinceTick > SESSION_IDLE_TIMEOUT_MS) return;

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
  }

  await saveSession(session.session_id, {
    last_tick: now,
    last_reward_at: now,
    watchers: toInt(p.watchers, session.watchers),
    group_tag: toInt(p.group_tag, session.group_tag),
    zone: sanitizeZone(p.zone || session.zone),
  });

  const pair = await redis.hGetAll(`${PAIR_PREFIX}${session.session_id}`);
  const currentShared = toNumber(pair.shared_xp, 0);
  await redis.hSet(`${PAIR_PREFIX}${session.session_id}`, {
    pair_key: session.session_id,
    avatar_a: avatarA,
    avatar_b: avatarB,
    shared_xp: String(currentShared + totalGain),
    sessions: String(toNumber(pair.sessions, 0)),
    updated_at: String(nowMs()),
  });
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
}

async function handleSessionEnd(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const session = await getSessionByAvatar(avatar);
  if (!session) return;

  const now = nowMs();
  const startedAt = toInt(session.started_at, now);
  const duration = Math.max(0, toInt(p.duration, now - startedAt));
  const avatarA = session.avatar_a;
  const avatarB = session.avatar_b;

  await saveSession(session.session_id, {
    active: 0,
    ended_at: now,
    duration,
    last_tick: now,
    last_reward_at: toInt(session.last_reward_at, startedAt),
  });

  await clearAvatarSessionLinks(session);

  let ritualComplete = false;
  let ritualXp = 0;

  if (duration >= SESSION_RITUAL_MS) {
    ritualComplete = true;
    ritualXp = 75;

    for (const participant of [avatarA, avatarB].filter(Boolean)) {
      await awardXp(participant, ritualXp, "ritual_complete", {
        session_id: session.session_id,
        duration,
      });

      const player = await ensurePlayer(participant);
      await refreshPlayerLifecycle(player);
      player.rituals = toInt(player.rituals, 0) + 1;
      player.rituals_today = toInt(player.rituals_today, 0) + 1;
      player.pentacles = toNumber(player.pentacles, 0) + 0.01;
      player.bonds = toInt(player.bonds, 0) + 1;
      player.last_seen = nowMs();
      player.last_action_at = nowMs();
      player.level = calculateLevel(player.xp);

      await savePlayer(participant, {
        rituals: player.rituals,
        rituals_today: player.rituals_today,
        pentacles: player.pentacles,
        bonds: player.bonds,
        level: player.level,
        last_seen: player.last_seen,
        last_action_at: player.last_action_at,
      });
    }

    await addBond(avatarA, avatarB);

    const pair = await redis.hGetAll(`${PAIR_PREFIX}${session.session_id}`);
    const currentSessions = toNumber(pair.sessions, 0);
    const currentShared = toNumber(pair.shared_xp, 0);

    await redis.hSet(`${PAIR_PREFIX}${session.session_id}`, {
      pair_key: session.session_id,
      avatar_a: avatarA,
      avatar_b: avatarB,
      shared_xp: String(currentShared + ritualXp * 2),
      sessions: String(currentSessions + 1),
      updated_at: String(nowMs()),
    });
    await db.updatePair(session.session_id, {
      avatar_a: avatarA,
      avatar_b: avatarB,
      shared_xp: currentShared + ritualXp * 2,
      sessions: currentSessions + 1,
      updated_at: nowMs(),
    });
  }

  await emitWorkerEvent("session_ended", {
    session_id: session.session_id,
    avatar_a: avatarA,
    avatar_b: avatarB,
    duration,
    ritual_complete: ritualComplete ? 1 : 0,
    ritual_xp: ritualXp,
  });
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

async function handleHoneyUse(event) {
  const p = event.payload || {};
  const avatar = sanitizeAvatar(p.avatar);
  if (!avatar) return;

  const player = await ensurePlayer(avatar);
  await refreshPlayerLifecycle(player);

  const type = String(p.type || p.honey || "dev").trim().toLowerCase();
  const now = nowSec();

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
  await emitWorkerEvent("artifact_registered", {
    artifact_id: artifact.artifact_id,
    type: artifact.type,
    owner_id: artifact.owner_id,
    location: artifact.location,
    expires_at: artifact.expires_at,
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

      case "artifact_spawn":
        await handleArtifactSpawn(event);
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

async function cleanupStaleSessions() {
  try {
    const keys = [];
    for await (const key of redis.scanIterator({ MATCH: `${SESSION_PREFIX}*`, COUNT: 200 })) {
      keys.push(key);
    }

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

async function boot() {
  await ensureRedisReady();
  await db.ensureSchema();

  await sub.subscribe(EVENT_CHANNEL, handleEvent);

  setInterval(() => {
    cleanupStaleSessions().catch((err) => logger.error({ err }, "cleanup interval error"));
  }, 60_000);

  scheduleArtifactPrune();

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
