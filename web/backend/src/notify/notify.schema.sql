-- Notifications (NOTIFY door): who wants what, where, and when, plus the
-- outbox the dispatcher drains and the inbox the Board channel drains.
--
-- Applied at startup the way achievements/achievements.schema.sql is: read
-- from beside its reader and exec'd in createTables(). CREATE TABLE IF NOT
-- EXISTS throughout; a column added later is a PRAGMA step in database.ts.
-- Nothing but notify/repository.ts touches these tables.

CREATE TABLE IF NOT EXISTS notify_prefs (
  user_id    TEXT NOT NULL,
  event      TEXT NOT NULL,          -- catalogue name, e.g. 'msg.reply'
  channel    TEXT NOT NULL CHECK (channel IN ('email','push','board')),
  mode       TEXT NOT NULL CHECK (mode IN ('instant','digest','off')),
  PRIMARY KEY (user_id, event, channel)
);

CREATE TABLE IF NOT EXISTS notify_follow (       -- file.new per conference
  user_id TEXT NOT NULL, conference_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, conference_id)
);

CREATE TABLE IF NOT EXISTS notify_settings (
  user_id        TEXT PRIMARY KEY,
  quiet_from     TEXT, quiet_to TEXT,             -- 'HH:MM' or NULL
  time_zone      TEXT,                            -- IANA, NULL = board zone
  digest_kind    TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly'
  digest_hour    INTEGER NOT NULL DEFAULT 8,
  digest_weekday INTEGER,                         -- 0-6 when weekly
  paused         INTEGER NOT NULL DEFAULT 0,
  email_verified TEXT,                            -- the address that was verified
  email_verified_at INTEGER
);

CREATE TABLE IF NOT EXISTS notify_email_codes (
  user_id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notify_outbox (
  ref             TEXT PRIMARY KEY,   -- '<event>:<objectId>:<userId>:<channel>' idempotency
  user_id         TEXT NOT NULL,
  channel         TEXT NOT NULL,
  event           TEXT NOT NULL,
  payload         TEXT NOT NULL,      -- JSON NotifyItem
  created_at      INTEGER NOT NULL,
  deliver_after   INTEGER NOT NULL,   -- instant=now, quiet end, or digest slot
  digest          INTEGER NOT NULL DEFAULT 0,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_notify_outbox_due ON notify_outbox(deliver_after, next_attempt_at);

CREATE TABLE IF NOT EXISTS notify_inbox (         -- the Board channel
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  payload TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notify_sent_log (      -- per-user cap window
  user_id TEXT NOT NULL, channel TEXT NOT NULL, sent_at INTEGER NOT NULL
);
