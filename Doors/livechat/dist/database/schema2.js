"use strict";
/** Additional database schema */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVITES_TABLE = exports.EVENTS_TABLE = exports.PREFS_TABLE = exports.PRESENCE_TABLE = exports.PINNED_TABLE = void 0;
exports.PINNED_TABLE = `
CREATE TABLE IF NOT EXISTS chat_pinned_messages (
  channel_id TEXT,
  message_id TEXT,
  pinned_by INTEGER,
  pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, message_id)
)`;
exports.PRESENCE_TABLE = `
CREATE TABLE IF NOT EXISTS chat_user_presence (
  user_id INTEGER PRIMARY KEY,
  status TEXT DEFAULT 'online',
  custom_status TEXT,
  activity TEXT,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
)`;
exports.PREFS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_user_preferences (
  user_id INTEGER PRIMARY KEY,
  show_logins INTEGER DEFAULT 1,
  show_file_activity INTEGER DEFAULT 1,
  show_door_activity INTEGER DEFAULT 1,
  show_messages INTEGER DEFAULT 1,
  show_system INTEGER DEFAULT 1,
  mute_all INTEGER DEFAULT 0,
  compact_mode INTEGER DEFAULT 0,
  show_timestamps INTEGER DEFAULT 1,
  notification_sound INTEGER DEFAULT 1,
  mention_sound INTEGER DEFAULT 1
)`;
exports.EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS bbs_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  node_id INTEGER,
  details TEXT,
  visibility TEXT DEFAULT 'all',
  channel_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;
exports.INVITES_TABLE = `
CREATE TABLE IF NOT EXISTS chat_channel_invites (
  id TEXT PRIMARY KEY,
  channel_id TEXT,
  created_by INTEGER,
  expires_at DATETIME,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;
