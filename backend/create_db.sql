CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  realname TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  email TEXT,
  secLevel INTEGER DEFAULT 10,
  uploads INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  bytesUpload INTEGER DEFAULT 0,
  bytesDownload INTEGER DEFAULT 0,
  ratio INTEGER DEFAULT 0,
  ratioType INTEGER DEFAULT 0,
  timeTotal INTEGER DEFAULT 0,
  timeLimit INTEGER DEFAULT 0,
  timeUsed INTEGER DEFAULT 0,
  chatLimit INTEGER DEFAULT 0,
  chatUsed INTEGER DEFAULT 0,
  lastLogin DATETIME,
  firstLogin DATETIME DEFAULT CURRENT_TIMESTAMP,
  calls INTEGER DEFAULT 0,
  callsToday INTEGER DEFAULT 0,
  newUser BOOLEAN DEFAULT 1,
  expert BOOLEAN DEFAULT 0,
  ansi BOOLEAN DEFAULT 1,
  linesPerScreen INTEGER DEFAULT 23,
  computer TEXT,
  screenType TEXT DEFAULT 'Amiga Ansi',
  protocol TEXT DEFAULT '/X Zmodem',
  editor TEXT DEFAULT 'Prompt',
  zoomType TEXT DEFAULT 'QWK',
  availableForChat BOOLEAN DEFAULT 1,
  quietNode BOOLEAN DEFAULT 0,
  autoRejoin INTEGER DEFAULT 1,
  confAccess TEXT DEFAULT 'XXX',
  areaName TEXT DEFAULT 'Standard',
  uuCP BOOLEAN DEFAULT 0,
  topUploadCPS INTEGER DEFAULT 0,
  topDownloadCPS INTEGER DEFAULT 0,
  byteLimit INTEGER DEFAULT 0,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conferences (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_bases (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  conferenceId INTEGER NOT NULL,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conferenceId) REFERENCES conferences(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  conferenceId INTEGER NOT NULL,
  messageBaseId INTEGER NOT NULL,
  isPrivate BOOLEAN DEFAULT 0,
  toUser TEXT,
  parentId INTEGER,
  attachments TEXT,
  edited BOOLEAN DEFAULT 0,
  editedBy TEXT,
  editedAt DATETIME,
  FOREIGN KEY (conferenceId) REFERENCES conferences(id),
  FOREIGN KEY (messageBaseId) REFERENCES message_bases(id)
);

CREATE TABLE IF NOT EXISTS file_areas (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  conferenceId INTEGER NOT NULL,
  maxFiles INTEGER DEFAULT 100,
  uploadAccess INTEGER DEFAULT 10,
  downloadAccess INTEGER DEFAULT 1,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conferenceId) REFERENCES conferences(id)
);

CREATE TABLE IF NOT EXISTS file_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  description TEXT,
  size INTEGER NOT NULL,
  uploader TEXT NOT NULL,
  uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  downloads INTEGER DEFAULT 0,
  areaId INTEGER NOT NULL,
  fileIdDiz TEXT,
  rating REAL DEFAULT 0,
  votes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  checked TEXT DEFAULT 'N',
  comment TEXT,
  FOREIGN KEY (areaId) REFERENCES file_areas(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT,
  socketId TEXT NOT NULL,
  state TEXT NOT NULL,
  subState TEXT,
  currentConf INTEGER DEFAULT 0,
  currentMsgBase INTEGER DEFAULT 0,
  timeRemaining INTEGER DEFAULT 60,
  lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
  confRJoin INTEGER DEFAULT 1,
  msgBaseRJoin INTEGER DEFAULT 1,
  commandBuffer TEXT DEFAULT '',
  menuPause BOOLEAN DEFAULT 1,
  inputBuffer TEXT DEFAULT '',
  relConfNum INTEGER DEFAULT 0,
  currentConfName TEXT DEFAULT 'Unknown',
  cmdShortcuts BOOLEAN DEFAULT 0,
  tempData TEXT,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bulletins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conferenceId INTEGER NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conferenceId) REFERENCES conferences(id)
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  userId TEXT,
  conferenceId INTEGER,
  node INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (conferenceId) REFERENCES conferences(id)
);

INSERT OR IGNORE INTO conferences (id, name, description) VALUES (1, 'General', 'General discussion');
INSERT OR IGNORE INTO conferences (id, name, description) VALUES (2, 'Tech Support', 'Technical support');
INSERT OR IGNORE INTO conferences (id, name, description) VALUES (3, 'Announcements', 'System announcements');

INSERT OR IGNORE INTO message_bases (id, name, conferenceId) VALUES (1, 'Main', 1);
INSERT OR IGNORE INTO message_bases (id, name, conferenceId) VALUES (2, 'Off Topic', 1);
INSERT OR IGNORE INTO message_bases (id, name, conferenceId) VALUES (3, 'Support', 2);
INSERT OR IGNORE INTO message_bases (id, name, conferenceId) VALUES (4, 'News', 3);

INSERT OR IGNORE INTO file_areas (id, name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess) VALUES (1, 'General Files', 'General purpose file area', '/files/general', 1, 100, 10, 1);
INSERT OR IGNORE INTO file_areas (id, name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess) VALUES (2, 'Utilities', 'System utilities and tools', '/files/utils', 1, 50, 50, 1);
INSERT OR IGNORE INTO file_areas (id, name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess) VALUES (3, 'Games', 'BBS games and entertainment', '/files/games', 2, 75, 25, 1);
INSERT OR IGNORE INTO file_areas (id, name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess) VALUES (4, 'Tech Files', 'Technical documentation and tools', '/files/tech', 2, 60, 20, 1);
INSERT OR IGNORE INTO file_areas (id, name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess) VALUES (5, 'System News', 'System announcements and updates', '/files/news', 3, 30, 100, 1);

INSERT OR IGNORE INTO users (
  id, username, passwordHash, realname, location, phone, secLevel,
  uploads, downloads, bytesUpload, bytesDownload, ratio, ratioType,
  timeTotal, timeLimit, timeUsed, chatLimit, chatUsed, firstLogin,
  calls, callsToday, newUser, expert, ansi, linesPerScreen, computer,
  screenType, protocol, editor, zoomType, availableForChat, quietNode,
  autoRejoin, confAccess, areaName, uuCP, topUploadCPS, topDownloadCPS, byteLimit
) VALUES (
  'sysop-user-id', 'sysop', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'System Operator', 'Server Room', '',
  255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, datetime('now'),
  0, 0, 0, 1, 1, 23, 'Server', 'Amiga Ansi', '/X Zmodem', 'Prompt',
  'QWK', 1, 0, 1, 'XXX', 'Sysop', 0, 0, 0, 0
);
