CREATE TABLE IF NOT EXISTS players(
  avatar TEXT PRIMARY KEY,
  xp NUMERIC DEFAULT 0,
  rituals INT DEFAULT 0,
  pentacles NUMERIC DEFAULT 0,
  bonds INT DEFAULT 0,
  watchers INT DEFAULT 0,
  honey TEXT DEFAULT '',
  honey_expire BIGINT DEFAULT 0,
  stacks INT DEFAULT 0,
  level INT DEFAULT 0,
  rituals_today INT DEFAULT 0,
  rituals_week INT DEFAULT 0,
  rituals_month INT DEFAULT 0,
  rituals_quarter INT DEFAULT 0,
  order_type TEXT DEFAULT 'neutral',
  zone TEXT DEFAULT '0:0',
  x NUMERIC DEFAULT 0,
  y NUMERIC DEFAULT 0,
  z NUMERIC DEFAULT 0,
  honey_type TEXT DEFAULT '',
  honey_stage INT DEFAULT 0,
  honey_multiplier NUMERIC DEFAULT 1,
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
