-- GRANDMASTER Database Schema
-- Version: 1.0.0
-- Date: 2025-12-25

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_played INTEGER,

  -- Statistics
  games_played INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  total_playtime INTEGER NOT NULL DEFAULT 0, -- milliseconds

  -- Best achievements
  best_grade TEXT NOT NULL DEFAULT '9',
  best_level INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_mode TEXT,

  -- Settings
  settings_json TEXT, -- JSON blob of PlayerSettings

  UNIQUE(username)
);

CREATE INDEX IF NOT EXISTS idx_gm_users_username ON gm_users(username);
CREATE INDEX IF NOT EXISTS idx_gm_users_best_grade ON gm_users(best_grade);

-- =============================================================================
-- MATCHES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_matches (
  match_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL, -- 'master', 'death', 'sprint', 'marathon', etc.
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration INTEGER NOT NULL, -- milliseconds

  -- Final stats
  final_score INTEGER NOT NULL,
  final_level INTEGER NOT NULL,
  final_grade TEXT NOT NULL,
  final_lines INTEGER NOT NULL,

  -- Gameplay stats
  pieces_placed INTEGER NOT NULL DEFAULT 0,
  holds_used INTEGER NOT NULL DEFAULT 0,
  finesse_rate REAL, -- 0.0-1.0
  finesse_errors INTEGER,
  max_combo INTEGER NOT NULL DEFAULT 0,

  -- Validation
  validation_score INTEGER NOT NULL DEFAULT 100, -- 0-100
  validation_flags TEXT, -- JSON array of flags

  -- Replay
  replay_id TEXT, -- Foreign key to gm_replays

  FOREIGN KEY (user_id) REFERENCES gm_users(user_id),
  FOREIGN KEY (replay_id) REFERENCES gm_replays(replay_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gm_matches_user ON gm_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_matches_mode ON gm_matches(mode);
CREATE INDEX IF NOT EXISTS idx_gm_matches_score ON gm_matches(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_gm_matches_grade ON gm_matches(final_grade);
CREATE INDEX IF NOT EXISTS idx_gm_matches_date ON gm_matches(started_at DESC);

-- =============================================================================
-- LEADERBOARDS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_leaderboards (
  entry_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  mode TEXT NOT NULL,

  -- Score details
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,
  grade TEXT NOT NULL,
  lines INTEGER NOT NULL,
  time INTEGER, -- NULL for incomplete games

  -- Advanced stats
  finesse_rate REAL,
  finesse_errors INTEGER,

  -- Validation
  validation_score INTEGER NOT NULL DEFAULT 100,
  validation_flags TEXT, -- JSON array

  -- Metadata
  submitted_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  replay_id TEXT,

  FOREIGN KEY (user_id) REFERENCES gm_users(user_id),
  FOREIGN KEY (replay_id) REFERENCES gm_replays(replay_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gm_leaderboards_mode_score ON gm_leaderboards(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_gm_leaderboards_user_mode ON gm_leaderboards(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_gm_leaderboards_grade ON gm_leaderboards(grade);
CREATE INDEX IF NOT EXISTS idx_gm_leaderboards_validation ON gm_leaderboards(validation_score);

-- =============================================================================
-- REPLAYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_replays (
  replay_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  mode TEXT NOT NULL,

  -- Metadata
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  duration INTEGER NOT NULL, -- milliseconds
  version TEXT NOT NULL DEFAULT '1.0.0',
  seed INTEGER, -- RNG seed for deterministic playback

  -- Final state
  final_score INTEGER NOT NULL,
  final_level INTEGER NOT NULL,
  final_grade TEXT NOT NULL,
  final_lines INTEGER NOT NULL,

  -- Replay data (compressed)
  inputs_data BLOB NOT NULL, -- JSON compressed with gzip
  snapshots_data BLOB NOT NULL, -- JSON compressed with gzip
  compressed INTEGER NOT NULL DEFAULT 1, -- 1 = compressed, 0 = uncompressed

  -- Stats
  input_count INTEGER NOT NULL DEFAULT 0,
  snapshot_count INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (user_id) REFERENCES gm_users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_gm_replays_user ON gm_replays(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_replays_mode ON gm_replays(mode);
CREATE INDEX IF NOT EXISTS idx_gm_replays_score ON gm_replays(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_gm_replays_date ON gm_replays(created_at DESC);

-- =============================================================================
-- ACHIEVEMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_achievements (
  achievement_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL, -- 'first_tetris', 'grade_s1', etc.
  unlocked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  progress INTEGER NOT NULL DEFAULT 0, -- For progressive achievements

  FOREIGN KEY (user_id) REFERENCES gm_users(user_id),
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_gm_achievements_user ON gm_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_achievements_key ON gm_achievements(achievement_key);

-- =============================================================================
-- SEASONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_seasons (
  season_id TEXT PRIMARY KEY,
  season_number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = ended

  -- Season config
  name TEXT NOT NULL,
  description TEXT,

  UNIQUE(season_number)
);

CREATE INDEX IF NOT EXISTS idx_gm_seasons_active ON gm_seasons(active);
CREATE INDEX IF NOT EXISTS idx_gm_seasons_number ON gm_seasons(season_number DESC);

-- =============================================================================
-- SEASON RANKINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS gm_season_rankings (
  ranking_id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,

  -- Ranking
  rank INTEGER,
  rating INTEGER NOT NULL DEFAULT 1500, -- Glicko-2 rating
  rating_deviation REAL NOT NULL DEFAULT 350.0,
  volatility REAL NOT NULL DEFAULT 0.06,

  -- Stats
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_grade TEXT NOT NULL DEFAULT '9',

  FOREIGN KEY (season_id) REFERENCES gm_seasons(season_id),
  FOREIGN KEY (user_id) REFERENCES gm_users(user_id),
  UNIQUE(season_id, user_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_gm_season_rankings_season_mode ON gm_season_rankings(season_id, mode, rating DESC);
CREATE INDEX IF NOT EXISTS idx_gm_season_rankings_user ON gm_season_rankings(user_id);

-- =============================================================================
-- STATISTICS VIEWS
-- =============================================================================

-- User stats summary view
CREATE VIEW IF NOT EXISTS gm_user_stats AS
SELECT
  u.user_id,
  u.username,
  u.games_played,
  u.total_lines,
  u.total_score,
  u.best_grade,
  u.best_level,
  COUNT(DISTINCT l.entry_id) as leaderboard_entries,
  COUNT(DISTINCT r.replay_id) as replays_saved,
  COUNT(DISTINCT a.achievement_id) as achievements_unlocked
FROM gm_users u
LEFT JOIN gm_leaderboards l ON u.user_id = l.user_id
LEFT JOIN gm_replays r ON u.user_id = r.user_id
LEFT JOIN gm_achievements a ON u.user_id = a.user_id
GROUP BY u.user_id;

-- Mode leaderboard view (top 100 per mode)
CREATE VIEW IF NOT EXISTS gm_mode_leaderboards AS
SELECT
  mode,
  user_id,
  username,
  score,
  grade,
  level,
  lines,
  validation_score,
  ROW_NUMBER() OVER (PARTITION BY mode ORDER BY score DESC) as rank
FROM gm_leaderboards
WHERE validation_score >= 50
ORDER BY mode, score DESC;

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Create default season
INSERT OR IGNORE INTO gm_seasons (season_id, season_number, started_at, name, description)
VALUES (
  'season_1',
  1,
  strftime('%s', 'now'),
  'Season 1: Grand Opening',
  'The inaugural season of GRANDMASTER competitive play'
);
