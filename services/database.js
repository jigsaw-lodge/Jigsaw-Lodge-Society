"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "jls",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
});

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS players(
  avatar TEXT PRIMARY KEY,
  xp NUMERIC DEFAULT 0,
  level INT DEFAULT 0,
  rituals INT DEFAULT 0,
  rituals_today INT DEFAULT 0,
  rituals_week INT DEFAULT 0,
  rituals_month INT DEFAULT 0,
  rituals_quarter INT DEFAULT 0,
  pentacles NUMERIC DEFAULT 0,
  bonds INT DEFAULT 0,
  order_type TEXT DEFAULT 'neutral',
  zone TEXT DEFAULT '0:0',
  x NUMERIC DEFAULT 0,
  y NUMERIC DEFAULT 0,
  z NUMERIC DEFAULT 0,
  honey TEXT DEFAULT '',
  honey_type TEXT DEFAULT '',
  honey_stage INT DEFAULT 0,
  honey_multiplier NUMERIC DEFAULT 1,
  honey_expire BIGINT DEFAULT 0,
  honey_cooldown BIGINT DEFAULT 0,
  poison_expire BIGINT DEFAULT 0,
  dev_uses_today INT DEFAULT 0,
  poison_uses_today INT DEFAULT 0,
  royal_uses_today INT DEFAULT 0,
  last_daily_reset TEXT DEFAULT '',
  last_weekly_reset TEXT DEFAULT '',
  last_monthly_reset TEXT DEFAULT '',
  last_quarterly_reset TEXT DEFAULT '',
  last_seen BIGINT DEFAULT 0,
  last_action_at BIGINT DEFAULT 0,
  watchers INT DEFAULT 0,
  stacks INT DEFAULT 0,
  surge_charge INT DEFAULT 0,
  surge_ready INT DEFAULT 0,
  surge_stacks INT DEFAULT 0,
  group_tag INT DEFAULT 0,
  last_zone TEXT DEFAULT '0:0',
  session_xp NUMERIC DEFAULT 0,
  total_l NUMERIC DEFAULT 0,
  challenge_boost_pct NUMERIC DEFAULT 0,
  challenge_boost_until BIGINT DEFAULT 0,
  equip_slot1 TEXT DEFAULT '',
  equip_slot2 TEXT DEFAULT '',
  equip_slot3 TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY,
  type TEXT,
  avatar TEXT,
  payload JSONB,
  meta JSONB,
  contract_version INT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS sessions(
  session_id TEXT PRIMARY KEY,
  avatar_a TEXT,
  avatar_b TEXT,
  object_id TEXT,
  zone TEXT,
  started_at BIGINT,
  last_tick BIGINT,
  last_reward_at BIGINT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  duration BIGINT DEFAULT 0,
  ended_at BIGINT DEFAULT 0,
  watchers INT DEFAULT 0,
  group_tag INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pairs(
  pair_key TEXT PRIMARY KEY,
  avatar_a TEXT,
  avatar_b TEXT,
  shared_xp NUMERIC DEFAULT 0,
  sessions INT DEFAULT 0,
  updated_at BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS artifact_registry(
  artifact_id TEXT PRIMARY KEY,
  type TEXT,
  power_level NUMERIC DEFAULT 0,
  effect_type TEXT,
  duration BIGINT DEFAULT 0,
  owner_id TEXT,
  location TEXT,
  expires_at BIGINT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at BIGINT DEFAULT 0,
  updated_at BIGINT DEFAULT 0
 );

CREATE TABLE IF NOT EXISTS zones(
  zone_id TEXT PRIMARY KEY,
  pressure NUMERIC DEFAULT 0,
  owner TEXT,
  last_flip BIGINT DEFAULT 0,
  updated_at BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS challenges(
  avatar TEXT PRIMARY KEY,
  daily_progress INT DEFAULT 0,
  weekly_progress INT DEFAULT 0,
  monthly_progress INT DEFAULT 0,
  quarterly_progress INT DEFAULT 0,
  daily_claimed INT DEFAULT 0,
  weekly_claimed INT DEFAULT 0,
  monthly_claimed INT DEFAULT 0,
  quarterly_claimed INT DEFAULT 0,
  updated_at BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS treasury(
  id INT PRIMARY KEY,
  total_l NUMERIC DEFAULT 0
);
`;

const PLAYER_COLUMNS = new Set([
  "xp",
  "level",
  "rituals",
  "rituals_today",
  "rituals_week",
  "rituals_month",
  "rituals_quarter",
  "pentacles",
  "bonds",
  "order_type",
  "zone",
  "x",
  "y",
  "z",
  "honey",
  "honey_type",
  "honey_stage",
  "honey_multiplier",
  "honey_expire",
  "honey_cooldown",
  "poison_expire",
  "dev_uses_today",
  "poison_uses_today",
  "royal_uses_today",
  "last_daily_reset",
  "last_weekly_reset",
  "last_monthly_reset",
  "last_quarterly_reset",
  "last_seen",
  "last_action_at",
  "watchers",
  "stacks",
  "surge_charge",
  "surge_ready",
  "surge_stacks",
  "group_tag",
  "last_zone",
  "session_xp",
  "total_l",
  "challenge_boost_pct",
  "challenge_boost_until",
  "equip_slot1",
  "equip_slot2",
  "equip_slot3",
]);

async function ensureSchema() {
  await pool.query(INIT_SQL);
  await pool.query(`ALTER TABLE IF EXISTS players ALTER COLUMN xp TYPE NUMERIC USING xp::numeric`);
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function ensurePlayer(avatar) {
  if (!avatar) return;
  await pool.query("INSERT INTO players(avatar) VALUES($1) ON CONFLICT DO NOTHING", [avatar]);
}

async function updatePlayer(avatar, fields) {
  if (!avatar || !fields || Object.keys(fields).length === 0) return;
  const entries = Object.entries(fields).filter(([key]) => PLAYER_COLUMNS.has(key));
  if (!entries.length) return;
  const assignments = entries.map(([key], idx) => `${key} = $${idx + 2}`);
  const values = [avatar, ...entries.map(([, value]) => value)];
  const sql = `UPDATE players SET ${assignments.join(", ")} WHERE avatar = $1`;
  await pool.query(sql, values);
}

async function saveSession(sessionId, data = {}) {
  if (!sessionId) return;
  const payload = {
    avatar_a: data.avatar_a || null,
    avatar_b: data.avatar_b || null,
    object_id: data.object_id || null,
    zone: data.zone || null,
    started_at: data.started_at || 0,
    last_tick: data.last_tick || 0,
    last_reward_at: data.last_reward_at || 0,
    active: !!data.active,
    duration: data.duration || 0,
    ended_at: data.ended_at || 0,
    watchers: data.watchers || 0,
    group_tag: data.group_tag || 0,
  };
  await pool.query(
    `INSERT INTO sessions(session_id, avatar_a, avatar_b, object_id, zone, started_at, last_tick, last_reward_at, active, duration, ended_at, watchers, group_tag)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (session_id) DO UPDATE SET
       avatar_a = EXCLUDED.avatar_a,
       avatar_b = EXCLUDED.avatar_b,
       object_id = EXCLUDED.object_id,
       zone = EXCLUDED.zone,
       started_at = EXCLUDED.started_at,
       last_tick = EXCLUDED.last_tick,
       last_reward_at = EXCLUDED.last_reward_at,
       active = EXCLUDED.active,
       duration = EXCLUDED.duration,
       ended_at = EXCLUDED.ended_at,
       watchers = EXCLUDED.watchers,
       group_tag = EXCLUDED.group_tag`,
    [
      sessionId,
      payload.avatar_a,
      payload.avatar_b,
      payload.object_id,
      payload.zone,
      payload.started_at,
      payload.last_tick,
      payload.last_reward_at,
      payload.active,
      payload.duration,
      payload.ended_at,
      payload.watchers,
      payload.group_tag,
    ]
  );
}

async function updatePair(pairKey, data = {}) {
  if (!pairKey) return;
  const payload = {
    avatar_a: data.avatar_a || null,
    avatar_b: data.avatar_b || null,
    shared_xp: data.shared_xp || 0,
    sessions: data.sessions || 0,
    updated_at: data.updated_at || Date.now(),
  };
  await pool.query(
    `INSERT INTO pairs(pair_key, avatar_a, avatar_b, shared_xp, sessions, updated_at)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (pair_key) DO UPDATE SET
       avatar_a = EXCLUDED.avatar_a,
       avatar_b = EXCLUDED.avatar_b,
       shared_xp = EXCLUDED.shared_xp,
       sessions = EXCLUDED.sessions,
       updated_at = EXCLUDED.updated_at`,
    [
      pairKey,
      payload.avatar_a,
      payload.avatar_b,
      payload.shared_xp,
      payload.sessions,
      payload.updated_at,
    ]
  );
}

async function logEvent(event) {
  if (!event || !event.id) return;
  await pool.query(
    `INSERT INTO events(id, type, avatar, payload, meta, contract_version, created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING`,
    [
      event.id,
      event.type,
      event.payload?.avatar || null,
      JSON.stringify(event.payload || {}),
      JSON.stringify(event.meta || {}),
      event.contract_version || null,
      event.created_at || Date.now(),
    ]
  );
}

async function saveArtifact(data = {}) {
  const artifactId = String(data.artifact_id || "").trim();
  if (!artifactId) return;
  const now = Date.now();
  const payload = {
    artifact_id: artifactId,
    type: data.type || "",
    power_level: data.power_level || 0,
    effect_type: data.effect_type || "",
    duration: data.duration || 0,
    owner_id: data.owner_id || "",
    location: data.location || "",
    expires_at: data.expires_at || 0,
    active: data.active !== undefined ? !!data.active : true,
    created_at: data.created_at || now,
    updated_at: now,
  };

  await pool.query(
    `INSERT INTO artifact_registry(artifact_id, type, power_level, effect_type, duration, owner_id, location, expires_at, active, created_at, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (artifact_id) DO UPDATE SET
       type = EXCLUDED.type,
       power_level = EXCLUDED.power_level,
       effect_type = EXCLUDED.effect_type,
       duration = EXCLUDED.duration,
       owner_id = EXCLUDED.owner_id,
       location = EXCLUDED.location,
       expires_at = EXCLUDED.expires_at,
       active = EXCLUDED.active,
       updated_at = EXCLUDED.updated_at`,
    [
      payload.artifact_id,
      payload.type,
      payload.power_level,
      payload.effect_type,
      payload.duration,
      payload.owner_id,
      payload.location,
      payload.expires_at,
      payload.active,
      payload.created_at,
      payload.updated_at,
    ]
  );
}

async function getActiveArtifacts() {
  const { rows } = await pool.query(
    `SELECT * FROM artifact_registry WHERE active = TRUE ORDER BY created_at DESC`
  );
  return rows;
}

async function listArtifacts(limit = 50, active = null) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  if (active === true || active === false) {
    const { rows } = await pool.query(
      `SELECT * FROM artifact_registry
       WHERE active = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [active, n]
    );
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT * FROM artifact_registry
     ORDER BY created_at DESC
     LIMIT $1`,
    [n]
  );
  return rows;
}

async function getArtifact(artifactId) {
  if (!artifactId) return null;
  const { rows } = await pool.query(
    `SELECT * FROM artifact_registry WHERE artifact_id = $1`,
    [artifactId]
  );
  return rows[0] || null;
}

async function expireArtifact(artifactId, updatedAt = Date.now()) {
  if (!artifactId) return null;
  const { rows } = await pool.query(
    `UPDATE artifact_registry
     SET active = FALSE, updated_at = $2
     WHERE artifact_id = $1
     RETURNING *`,
    [artifactId, Number(updatedAt) || Date.now()]
  );
  return rows[0] || null;
}

async function expireArtifacts(reference = Date.now()) {
  let limit = Number(reference) || 0;
  if (limit > 1_000_000_000_000) {
    limit = Math.floor(limit / 1000);
  }
  if (limit <= 0) {
    limit = Math.floor(Date.now() / 1000);
  }
  await pool.query(
    `UPDATE artifact_registry
     SET active = FALSE
     WHERE active = TRUE AND expires_at > 0 AND expires_at <= $1`,
    [limit]
  );
}

async function getZone(zoneId) {
  if (!zoneId) return null;
  const { rows } = await pool.query(`SELECT * FROM zones WHERE zone_id = $1`, [zoneId]);
  return rows[0] || null;
}

async function upsertZone(zoneId, fields = {}) {
  if (!zoneId) return;
  const payload = {
    pressure: Number(fields.pressure ?? 0),
    owner: fields.owner || null,
    last_flip: Number(fields.last_flip ?? 0),
    updated_at: Number(fields.updated_at ?? Date.now()),
  };
  await pool.query(
    `INSERT INTO zones(zone_id, pressure, owner, last_flip, updated_at)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (zone_id) DO UPDATE SET
       pressure = EXCLUDED.pressure,
       owner = EXCLUDED.owner,
       last_flip = EXCLUDED.last_flip,
       updated_at = EXCLUDED.updated_at`,
    [zoneId, payload.pressure, payload.owner, payload.last_flip, payload.updated_at]
  );
}

async function getChallenge(avatar) {
  if (!avatar) return null;
  const { rows } = await pool.query(`SELECT * FROM challenges WHERE avatar = $1`, [avatar]);
  return rows[0] || null;
}

async function upsertChallenge(avatar, fields = {}) {
  if (!avatar) return;
  const payload = {
    daily_progress: Number(fields.daily_progress ?? 0),
    weekly_progress: Number(fields.weekly_progress ?? 0),
    monthly_progress: Number(fields.monthly_progress ?? 0),
    quarterly_progress: Number(fields.quarterly_progress ?? 0),
    daily_claimed: Number(fields.daily_claimed ?? 0),
    weekly_claimed: Number(fields.weekly_claimed ?? 0),
    monthly_claimed: Number(fields.monthly_claimed ?? 0),
    quarterly_claimed: Number(fields.quarterly_claimed ?? 0),
    updated_at: Number(fields.updated_at ?? Date.now()),
  };
  await pool.query(
    `INSERT INTO challenges(avatar, daily_progress, weekly_progress, monthly_progress, quarterly_progress, daily_claimed, weekly_claimed, monthly_claimed, quarterly_claimed, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (avatar) DO UPDATE SET
       daily_progress = EXCLUDED.daily_progress,
       weekly_progress = EXCLUDED.weekly_progress,
       monthly_progress = EXCLUDED.monthly_progress,
       quarterly_progress = EXCLUDED.quarterly_progress,
       daily_claimed = EXCLUDED.daily_claimed,
       weekly_claimed = EXCLUDED.weekly_claimed,
       monthly_claimed = EXCLUDED.monthly_claimed,
       quarterly_claimed = EXCLUDED.quarterly_claimed,
       updated_at = EXCLUDED.updated_at`,
    [
      avatar,
      payload.daily_progress,
      payload.weekly_progress,
      payload.monthly_progress,
      payload.quarterly_progress,
      payload.daily_claimed,
      payload.weekly_claimed,
      payload.monthly_claimed,
      payload.quarterly_claimed,
      payload.updated_at,
    ]
  );
}

async function addTreasury(amount) {
  const value = Number(amount) || 0;
  await pool.query(
    `INSERT INTO treasury(id, total_l)
     VALUES(1,$1)
     ON CONFLICT (id) DO UPDATE SET total_l = treasury.total_l + EXCLUDED.total_l`,
    [value]
  );
}

async function getTreasuryTotal() {
  const { rows } = await pool.query(`SELECT total_l FROM treasury WHERE id = 1`);
  return rows[0]?.total_l ?? 0;
}

async function listPlayers(limit = 25) {
  const n = Math.max(1, Math.min(200, Number(limit) || 25));
  const { rows } = await pool.query(
    `SELECT avatar, xp, level, rituals, pentacles, bonds, order_type, zone, watchers, honey_type, honey_expire, surge_ready, last_seen
     FROM players
     ORDER BY last_seen DESC
     LIMIT $1`,
    [n]
  );
  return rows;
}

async function listPairs(limit = 25) {
  const n = Math.max(1, Math.min(200, Number(limit) || 25));
  const { rows } = await pool.query(
    `SELECT pair_key, avatar_a, avatar_b, shared_xp, sessions, updated_at
     FROM pairs
     ORDER BY updated_at DESC
     LIMIT $1`,
    [n]
  );
  return rows;
}

async function listActiveSessions(limit = 25) {
  const n = Math.max(1, Math.min(200, Number(limit) || 25));
  const { rows } = await pool.query(
    `SELECT session_id, avatar_a, avatar_b, object_id, zone, started_at, last_tick, last_reward_at, duration, ended_at, watchers, group_tag
     FROM sessions
     WHERE active = TRUE
     ORDER BY started_at DESC
     LIMIT $1`,
    [n]
  );
  return rows;
}

async function countActiveSessions() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM sessions WHERE active = TRUE`);
  return rows[0]?.count ?? 0;
}

async function countActivePlayersSince(sinceMs) {
  const cutoff = Number(sinceMs) || 0;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM players WHERE last_seen >= $1`, [
    cutoff,
  ]);
  return rows[0]?.count ?? 0;
}

module.exports = {
  pool,
  ensureSchema,
  query,
  ensurePlayer,
  updatePlayer,
  saveSession,
  updatePair,
  logEvent,
  saveArtifact,
  getActiveArtifacts,
  listArtifacts,
  getArtifact,
  expireArtifact,
  expireArtifacts,
  getZone,
  upsertZone,
  getChallenge,
  upsertChallenge,
  addTreasury,
  getTreasuryTotal,
  listPlayers,
  listPairs,
  listActiveSessions,
  countActiveSessions,
  countActivePlayersSince,
};
