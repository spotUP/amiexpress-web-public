import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import crypto from 'crypto';

// Database interfaces matching AmiExpress data structures
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  realname: string;
  location: string;
  phone: string;
  email?: string;
  secLevel: number;
  uploads: number;
  downloads: number;
  bytesUpload: number;
  bytesDownload: number;
  ratio: number;
  ratioType: number; // 0=bytes, 1=bytes+files, 2=files only
  timeTotal: number;
  timeLimit: number;
  timeUsed: number;
  chatLimit: number;
  chatUsed: number;
  lastLogin?: Date;
  firstLogin: Date;
  calls: number;
  callsToday: number;
  newUser: boolean;
  expert: boolean;
  ansi: boolean;
  linesPerScreen: number;
  computer: string;
  screenType: string;
  protocol: string;
  editor: string;
  zoomType: string;
  availableForChat: boolean;
  quietNode: boolean;
  autoRejoin: number;
  confAccess: string; // Conference access string (e.g., "XXX_XX_")
  areaName: string;
  uuCP: boolean;
  topUploadCPS: number;
  topDownloadCPS: number;
  byteLimit: number;
  created: Date;
  updated: Date;
}

export interface Message {
  id: number;
  subject: string;
  body: string;
  author: string;
  timestamp: Date;
  conferenceId: number;
  messageBaseId: number;
  isPrivate: boolean;
  toUser?: string;
  parentId?: number;
  attachments?: string[];
  edited?: boolean;
  editedBy?: string;
  editedAt?: Date;
}

export interface FileArea {
  id: number;
  name: string;
  description: string;
  path: string;
  conferenceId: number;
  maxFiles: number;
  uploadAccess: number;
  downloadAccess: number;
  created: Date;
  updated: Date;
}

export interface FileEntry {
  id: number;
  filename: string;
  description: string;
  size: number;
  uploader: string;
  uploadDate: Date;
  downloads: number;
  areaId: number;
  fileIdDiz?: string;
  rating?: number;
  votes?: number;
  status: 'active' | 'held' | 'deleted';
  checked: 'N' | 'P' | 'F'; // Not checked, Passed, Failed
  comment?: string;
}

export interface Conference {
  id: number;
  name: string;
  description: string;
  created: Date;
  updated: Date;
}

export interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
  created: Date;
  updated: Date;
}

export interface Session {
  id: string;
  userId?: string;
  socketId: string;
  state: string;
  subState?: string;
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: Date;
  confRJoin: number;
  msgBaseRJoin: number;
  commandBuffer: string;
  menuPause: boolean;
  inputBuffer: string;
  relConfNum: number;
  currentConfName: string;
  cmdShortcuts: boolean;
  tempData?: string; // JSON string
  created: Date;
  updated: Date;
}

export interface Bulletin {
  id: number;
  conferenceId: number;
  filename: string;
  title: string;
  created: Date;
  updated: Date;
}

export interface SystemLog {
  id: number;
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
  userId?: string;
  conferenceId?: number;
  node?: number;
}

export class Database {
  private db: sqlite3.Database;

  constructor(filename: string = 'amiexpress.db') {
    this.db = new sqlite3.Database(filename);
    this.initDatabase();
  }

  private initDatabase(): void {
    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');

    // Create tables
    this.createTables();
  }

  private createTables(): void {
    // Users table - 1:1 with AmiExpress account editing fields
    this.db.run(`
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
      )
    `);

    // Conferences table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conferences (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Message bases table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS message_bases (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        conferenceId INTEGER NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conferenceId) REFERENCES conferences(id)
      )
    `);

    // Messages table - supports threading and private messages
    this.db.run(`
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
        attachments TEXT, -- JSON array
        edited BOOLEAN DEFAULT 0,
        editedBy TEXT,
        editedAt DATETIME,
        FOREIGN KEY (conferenceId) REFERENCES conferences(id),
        FOREIGN KEY (messageBaseId) REFERENCES message_bases(id),
        FOREIGN KEY (parentId) REFERENCES messages(id)
      )
    `);

    // File areas table
    this.db.run(`
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
      )
    `);

    // File entries table
    this.db.run(`
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
      )
    `);

    // Sessions table for persistence
    this.db.run(`
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
      )
    `);

    // Bulletins table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS bulletins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conferenceId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conferenceId) REFERENCES conferences(id)
      )
    `);

    // System logs table
    this.db.run(`
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
      )
    `);

    // Create indexes for performance
    this.createIndexes();
  }

  private createIndexes(): void {
    // Message indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_conference ON messages(conferenceId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_base ON messages(messageBaseId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_private ON messages(isPrivate, toUser)`);

    // File indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_area ON file_entries(areaId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_uploader ON file_entries(uploader)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_date ON file_entries(uploadDate)`);

    // User indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_seclevel ON users(secLevel)`);
  }

  // User management methods
  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO users (
        id, username, passwordHash, realname, location, phone, email,
        secLevel, uploads, downloads, bytesUpload, bytesDownload, ratio,
        ratioType, timeTotal, timeLimit, timeUsed, chatLimit, chatUsed,
        lastLogin, firstLogin, calls, callsToday, newUser, expert, ansi,
        linesPerScreen, computer, screenType, protocol, editor, zoomType,
        availableForChat, quietNode, autoRejoin, confAccess, areaName, uuCP,
        topUploadCPS, topDownloadCPS, byteLimit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      id, userData.username, userData.passwordHash, userData.realname,
      userData.location, userData.phone, userData.email, userData.secLevel,
      userData.uploads, userData.downloads, userData.bytesUpload, userData.bytesDownload,
      userData.ratio, userData.ratioType, userData.timeTotal, userData.timeLimit,
      userData.timeUsed, userData.chatLimit, userData.chatUsed, userData.lastLogin,
      userData.firstLogin, userData.calls, userData.callsToday, userData.newUser,
      userData.expert, userData.ansi, userData.linesPerScreen, userData.computer,
      userData.screenType, userData.protocol, userData.editor, userData.zoomType,
      userData.availableForChat, userData.quietNode, userData.autoRejoin,
      userData.confAccess, userData.areaName, userData.uuCP, userData.topUploadCPS,
      userData.topDownloadCPS, userData.byteLimit
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const sql = `SELECT * FROM users WHERE username = ?`;
    return new Promise((resolve, reject) => {
      this.db.get(sql, [username], (err, row) => {
        if (err) reject(err);
        else resolve(row as User || null);
      });
    });
  }

  async getUserById(id: string): Promise<User | null> {
    const sql = `SELECT * FROM users WHERE id = ?`;
    return new Promise((resolve, reject) => {
      this.db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row as User || null);
      });
    });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const sql = `UPDATE users SET ${fields.map(f => `${f} = ?`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = ?`;
    const values = [...fields.map(f => updates[f as keyof User]), id];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getUsers(filter?: { secLevel?: number; newUser?: boolean; limit?: number }): Promise<User[]> {
    let sql = `SELECT * FROM users WHERE 1=1`;
    const params: any[] = [];

    if (filter?.secLevel !== undefined) {
      sql += ` AND secLevel >= ?`;
      params.push(filter.secLevel);
    }

    if (filter?.newUser !== undefined) {
      sql += ` AND newUser = ?`;
      params.push(filter.newUser ? 1 : 0);
    }

    sql += ` ORDER BY username`;

    if (filter?.limit) {
      sql += ` LIMIT ?`;
      params.push(filter.limit);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as User[]);
      });
    });
  }

  // Message management methods
  async createMessage(message: Omit<Message, 'id'>): Promise<number> {
    const sql = `
      INSERT INTO messages (
        subject, body, author, timestamp, conferenceId, messageBaseId,
        isPrivate, toUser, parentId, attachments, edited, editedBy, editedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      message.subject, message.body, message.author, message.timestamp,
      message.conferenceId, message.messageBaseId, message.isPrivate,
      message.toUser, message.parentId, JSON.stringify(message.attachments || []),
      message.edited, message.editedBy, message.editedAt
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getMessages(conferenceId: number, messageBaseId: number, options?: {
    limit?: number;
    offset?: number;
    privateOnly?: boolean;
    userId?: string;
    search?: string;
  }): Promise<Message[]> {
    let sql = `
      SELECT m.*, mb.name as messageBaseName, c.name as conferenceName
      FROM messages m
      JOIN message_bases mb ON m.messageBaseId = mb.id
      JOIN conferences c ON m.conferenceId = c.id
      WHERE m.conferenceId = ? AND m.messageBaseId = ?
    `;
    const params: any[] = [conferenceId, messageBaseId];

    if (options?.privateOnly && options?.userId) {
      sql += ` AND (m.isPrivate = 0 OR (m.isPrivate = 1 AND (m.author = ? OR m.toUser = ?)))`;
      params.push(options.userId, options.userId);
    }

    if (options?.search) {
      sql += ` AND (m.subject LIKE ? OR m.body LIKE ? OR m.author LIKE ?)`;
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ` ORDER BY m.timestamp DESC`;

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else {
          const messages = rows.map((row: any) => ({
            ...row,
            attachments: JSON.parse(row.attachments || '[]')
          }));
          resolve(messages as Message[]);
        }
      });
    });
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const sql = `UPDATE messages SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
    const values = [...fields.map(f => {
      if (f === 'attachments') return JSON.stringify(updates.attachments || []);
      return updates[f as keyof Message];
    }), id];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteMessage(id: number): Promise<void> {
    const sql = `DELETE FROM messages WHERE id = ?`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // File management methods
  async createFileEntry(file: Omit<FileEntry, 'id'>): Promise<number> {
    const sql = `
      INSERT INTO file_entries (
        filename, description, size, uploader, uploadDate, downloads,
        areaId, fileIdDiz, rating, votes, status, checked, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      file.filename, file.description, file.size, file.uploader, file.uploadDate,
      file.downloads, file.areaId, file.fileIdDiz, file.rating, file.votes,
      file.status, file.checked, file.comment
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getFileEntries(areaId: number, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
  }): Promise<FileEntry[]> {
    let sql = `SELECT * FROM file_entries WHERE areaId = ?`;
    const params: any[] = [areaId];

    if (options?.status) {
      sql += ` AND status = ?`;
      params.push(options.status);
    }

    if (options?.search) {
      sql += ` AND (filename LIKE ? OR description LIKE ? OR fileIdDiz LIKE ?)`;
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ` ORDER BY uploadDate DESC`;

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as FileEntry[]);
      });
    });
  }

  async updateFileEntry(id: number, updates: Partial<FileEntry>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const sql = `UPDATE file_entries SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
    const values = [...fields.map(f => updates[f as keyof FileEntry]), id];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async incrementDownloadCount(id: number): Promise<void> {
    const sql = `UPDATE file_entries SET downloads = downloads + 1 WHERE id = ?`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Session management methods
  async createSession(session: Omit<Session, 'created' | 'updated'>): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO sessions (
        id, userId, socketId, state, subState, currentConf, currentMsgBase,
        timeRemaining, lastActivity, confRJoin, msgBaseRJoin, commandBuffer,
        menuPause, inputBuffer, relConfNum, currentConfName, cmdShortcuts, tempData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      session.id, session.userId, session.socketId, session.state, session.subState,
      session.currentConf, session.currentMsgBase, session.timeRemaining,
      session.lastActivity, session.confRJoin, session.msgBaseRJoin,
      session.commandBuffer, session.menuPause, session.inputBuffer,
      session.relConfNum, session.currentConfName, session.cmdShortcuts,
      session.tempData ? JSON.stringify(session.tempData) : null
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getSession(id: string): Promise<Session | null> {
    const sql = `SELECT * FROM sessions WHERE id = ?`;
    return new Promise((resolve, reject) => {
      this.db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else if (row) {
          const session = row as any;
          if (session.tempData) {
            session.tempData = JSON.parse(session.tempData);
          }
          resolve(session as Session);
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const sql = `UPDATE sessions SET ${fields.map(f => `${f} = ?`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = ?`;
    const values = [...fields.map(f => {
      if (f === 'tempData') return updates.tempData ? JSON.stringify(updates.tempData) : null;
      return updates[f as keyof Session];
    }), id];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteSession(id: string): Promise<void> {
    const sql = `DELETE FROM sessions WHERE id = ?`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getActiveSessions(): Promise<Session[]> {
    const sql = `SELECT * FROM sessions WHERE lastActivity > datetime('now', '-30 minutes')`;
    return new Promise((resolve, reject) => {
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else {
          const sessions = rows.map(row => {
            const session = row as any;
            if (session.tempData) {
              session.tempData = JSON.parse(session.tempData);
            }
            return session as Session;
          });
          resolve(sessions);
        }
      });
    });
  }

  // Conference and message base management
  async createConference(conf: Omit<Conference, 'id' | 'created' | 'updated'>): Promise<number> {
    const sql = `INSERT INTO conferences (name, description) VALUES (?, ?)`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [conf.name, conf.description], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getConferences(): Promise<Conference[]> {
    const sql = `SELECT * FROM conferences ORDER BY id`;
    return new Promise((resolve, reject) => {
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as Conference[]);
      });
    });
  }

  async createMessageBase(mb: Omit<MessageBase, 'id' | 'created' | 'updated'>): Promise<number> {
    const sql = `INSERT INTO message_bases (name, conferenceId) VALUES (?, ?)`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [mb.name, mb.conferenceId], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {
    const sql = `SELECT * FROM message_bases WHERE conferenceId = ? ORDER BY id`;
    return new Promise((resolve, reject) => {
      this.db.all(sql, [conferenceId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as MessageBase[]);
      });
    });
  }

  // File area management
  async createFileArea(area: Omit<FileArea, 'id' | 'created' | 'updated'>): Promise<number> {
    const sql = `
      INSERT INTO file_areas (
        name, description, path, conferenceId, maxFiles, uploadAccess, downloadAccess
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      area.name, area.description, area.path, area.conferenceId,
      area.maxFiles, area.uploadAccess, area.downloadAccess
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async getFileAreas(conferenceId: number): Promise<FileArea[]> {
    const sql = `SELECT * FROM file_areas WHERE conferenceId = ? ORDER BY id`;
    return new Promise((resolve, reject) => {
      this.db.all(sql, [conferenceId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as FileArea[]);
      });
    });
  }

  // Logging methods
  async logSystemEvent(level: 'info' | 'warning' | 'error', message: string, context?: {
    userId?: string;
    conferenceId?: number;
    node?: number;
  }): Promise<void> {
    const sql = `INSERT INTO system_logs (level, message, userId, conferenceId, node) VALUES (?, ?, ?, ?, ?)`;
    const values = [level, message, context?.userId, context?.conferenceId, context?.node];

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Utility methods
  async hashPassword(password: string): Promise<string> {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const hashed = await this.hashPassword(password);
    return hashed === hash;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Initialize default data
  async initializeDefaultData(): Promise<void> {
    // Create default conferences
    const conferences = [
      { name: 'General', description: 'General discussion' },
      { name: 'Tech Support', description: 'Technical support' },
      { name: 'Announcements', description: 'System announcements' }
    ];

    for (const conf of conferences) {
      await this.createConference(conf);
    }

    // Create default message bases
    const messageBases = [
      { name: 'Main', conferenceId: 1 },
      { name: 'Off Topic', conferenceId: 1 },
      { name: 'Support', conferenceId: 2 },
      { name: 'News', conferenceId: 3 }
    ];

    for (const mb of messageBases) {
      await this.createMessageBase(mb);
    }

    // Create default file areas
    const fileAreas = [
      { name: 'General Files', description: 'General purpose file area', path: '/files/general', conferenceId: 1, maxFiles: 100, uploadAccess: 10, downloadAccess: 1 },
      { name: 'Utilities', description: 'System utilities and tools', path: '/files/utils', conferenceId: 1, maxFiles: 50, uploadAccess: 50, downloadAccess: 1 },
      { name: 'Games', description: 'BBS games and entertainment', path: '/files/games', conferenceId: 2, maxFiles: 75, uploadAccess: 25, downloadAccess: 1 },
      { name: 'Tech Files', description: 'Technical documentation and tools', path: '/files/tech', conferenceId: 2, maxFiles: 60, uploadAccess: 20, downloadAccess: 1 },
      { name: 'System News', description: 'System announcements and updates', path: '/files/news', conferenceId: 3, maxFiles: 30, uploadAccess: 100, downloadAccess: 1 }
    ];

    for (const area of fileAreas) {
      await this.createFileArea(area);
    }

    // Create default sysop user
    const hashedPassword = await this.hashPassword('sysop');
    await this.createUser({
      username: 'sysop',
      passwordHash: hashedPassword,
      realname: 'System Operator',
      location: 'Server Room',
      phone: '',
      secLevel: 255,
      uploads: 0,
      downloads: 0,
      bytesUpload: 0,
      bytesDownload: 0,
      ratio: 0,
      ratioType: 0,
      timeTotal: 0,
      timeLimit: 0,
      timeUsed: 0,
      chatLimit: 0,
      chatUsed: 0,
      firstLogin: new Date(),
      calls: 0,
      callsToday: 0,
      newUser: false,
      expert: true,
      ansi: true,
      linesPerScreen: 23,
      computer: 'Server',
      screenType: 'Amiga Ansi',
      protocol: '/X Zmodem',
      editor: 'Prompt',
      zoomType: 'QWK',
      availableForChat: true,
      quietNode: false,
      autoRejoin: 1,
      confAccess: 'XXX',
      areaName: 'Sysop',
      uuCP: false,
      topUploadCPS: 0,
      topDownloadCPS: 0,
      byteLimit: 0
    });
  }
}

// Export singleton instance
export const db = new Database();