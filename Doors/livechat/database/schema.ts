/** Database schema SQL statements */

export const CHANNELS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  topic TEXT,
  type TEXT DEFAULT 'public',
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER DEFAULT 0,
  category TEXT,
  max_users INTEGER DEFAULT 100,
  slow_mode INTEGER DEFAULT 0,
  invite_only INTEGER DEFAULT 0,
  password_hash TEXT,
  motd TEXT
)`;

export const MEMBERS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id TEXT,
  user_id INTEGER,
  role TEXT DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_at DATETIME,
  notifications TEXT DEFAULT 'all',
  muted_until DATETIME,
  banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  PRIMARY KEY (channel_id, user_id)
)`;

export const MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT,
  user_id INTEGER,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME,
  thread_id TEXT,
  reply_count INTEGER DEFAULT 0,
  type TEXT DEFAULT 'message',
  metadata TEXT,
  deleted INTEGER DEFAULT 0
)`;

export const REACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  user_id INTEGER,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id, emoji)
)`;
