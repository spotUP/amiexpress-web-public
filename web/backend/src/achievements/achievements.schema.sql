-- Achievements (SP2): what this board still owes the achievements server,
-- and what it still owes its callers.
--
-- Applied at startup the way doors/door-installs.schema.sql is: read from
-- beside its reader and exec'd in createTables(). CREATE TABLE IF NOT
-- EXISTS throughout; a column added later is a PRAGMA step in database.ts.

-- The outbox. One row per event, keyed by the board-scoped ref the server
-- treats as the idempotency key - so a resend after a crash is a duplicate
-- on the server, not a double count. A server outage delays unlocks; it
-- never loses events. Rows still unsent after fourteen days are purged.
CREATE TABLE IF NOT EXISTS achievement_outbox (
  ref             TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  payload         TEXT NOT NULL,          -- the JSON EventIn
  created_at      INTEGER NOT NULL,       -- epoch seconds
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_achievement_outbox_due ON achievement_outbox(next_attempt_at);

-- What a caller has not been shown yet: an unlock the server answered
-- with, or the one-time "link your account" explanation after the server
-- refused their events as not_linked. Drawn at the next command-prompt
-- boundary and deleted.
CREATE TABLE IF NOT EXISTS achievement_pending_notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('unlock', 'link')),
  payload    TEXT NOT NULL,               -- JSON: the UnlockOut, or {}
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_achievement_notices_user ON achievement_pending_notices(user_id);
