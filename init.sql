CREATE TABLE IF NOT EXISTS players(
  avatar TEXT PRIMARY KEY,
  xp BIGINT DEFAULT 0,
  rituals INT DEFAULT 0,
  pentacles INT DEFAULT 0,
  bonds INT DEFAULT 0,
  watchers INT DEFAULT 0,
  honey TEXT DEFAULT '',
  honey_expire BIGINT DEFAULT 0,
  stacks INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events(
  id SERIAL PRIMARY KEY,
  type TEXT,
  avatar TEXT,
  meta JSONB,
  ts BIGINT
);
