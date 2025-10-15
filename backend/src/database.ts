import { Pool as PoolConstructor } from 'pg';
import * as crypto from 'crypto';

// Import types from types.ts
import type {
  NodeSession,
  AREXXScript,
  AREXXContext,
  QWKPacket,
  QWKMessage,
  FTNMessage,
  TransferSession
} from './types';

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
  private pool?: any;

  constructor() {
    // PostgreSQL connection configuration
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
      throw new Error('PostgreSQL connection string not found. Please set DATABASE_URL or POSTGRES_URL environment variable.');
    }

    console.log('Initializing PostgreSQL database connection...');
    this.pool = new PoolConstructor({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    this.pool.on('connect', () => {
      console.log('Connected to PostgreSQL database');
    });

    // Initialize database schema
    this.initDatabase();
  }

  // SQLite methods removed - now using PostgreSQL only


  private async initDatabase(): Promise<void> {
    try {
      console.log('Creating database tables...');
      await this.createTables();
      console.log('Database tables created successfully');

      // Initialize default data
      await this.initializeDefaultData();
      console.log('Default data initialized');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // Don't throw error - continue with server startup
      console.log('Continuing with server startup despite database initialization error');
    }
  }

  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Users table - 1:1 with AmiExpress account editing fields
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          "passwordHash" TEXT NOT NULL,
          realname TEXT NOT NULL,
          location TEXT,
          phone TEXT,
          email TEXT,
          "secLevel" INTEGER DEFAULT 10,
          uploads INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          "bytesUpload" BIGINT DEFAULT 0,
          "bytesDownload" BIGINT DEFAULT 0,
          ratio INTEGER DEFAULT 0,
          "ratioType" INTEGER DEFAULT 0,
          "timeTotal" INTEGER DEFAULT 0,
          "timeLimit" INTEGER DEFAULT 0,
          "timeUsed" INTEGER DEFAULT 0,
          "chatLimit" INTEGER DEFAULT 0,
          "chatUsed" INTEGER DEFAULT 0,
          "lastLogin" TIMESTAMPTZ,
          "firstLogin" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          calls INTEGER DEFAULT 0,
          "callsToday" INTEGER DEFAULT 0,
          "newUser" BOOLEAN DEFAULT true,
          expert BOOLEAN DEFAULT false,
          ansi BOOLEAN DEFAULT true,
          "linesPerScreen" INTEGER DEFAULT 23,
          computer TEXT,
          "screenType" TEXT DEFAULT 'Amiga Ansi',
          protocol TEXT DEFAULT '/X Zmodem',
          editor TEXT DEFAULT 'Prompt',
          "zoomType" TEXT DEFAULT 'QWK',
          "availableForChat" BOOLEAN DEFAULT true,
          "quietNode" BOOLEAN DEFAULT false,
          "autoRejoin" INTEGER DEFAULT 1,
          "confAccess" TEXT DEFAULT 'XXX',
          "areaName" TEXT DEFAULT 'Standard',
          "uuCP" BOOLEAN DEFAULT false,
          "topUploadCPS" INTEGER DEFAULT 0,
          "topDownloadCPS" INTEGER DEFAULT 0,
          "byteLimit" BIGINT DEFAULT 0,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Conferences table
      await client.query(`
        CREATE TABLE IF NOT EXISTS conferences (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Message bases table
      await client.query(`
        CREATE TABLE IF NOT EXISTS message_bases (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          "conferenceId" INTEGER NOT NULL REFERENCES conferences(id),
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Messages table - supports threading and private messages
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          author TEXT NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          conferenceId INTEGER NOT NULL REFERENCES conferences(id),
          messageBaseId INTEGER NOT NULL REFERENCES message_bases(id),
          isPrivate BOOLEAN DEFAULT false,
          toUser TEXT,
          parentId INTEGER,
          attachments JSONB,
          edited BOOLEAN DEFAULT false,
          editedBy TEXT,
          editedAt TIMESTAMPTZ
        )
      `);

      // File areas table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_areas (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          path TEXT NOT NULL,
          conferenceId INTEGER NOT NULL REFERENCES conferences(id),
          maxFiles INTEGER DEFAULT 100,
          uploadAccess INTEGER DEFAULT 10,
          downloadAccess INTEGER DEFAULT 1,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // File entries table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_entries (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL,
          description TEXT,
          size BIGINT NOT NULL,
          uploader TEXT NOT NULL,
          uploadDate TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          downloads INTEGER DEFAULT 0,
          areaId INTEGER NOT NULL REFERENCES file_areas(id),
          fileIdDiz TEXT,
          rating REAL DEFAULT 0,
          votes INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          checked TEXT DEFAULT 'N',
          comment TEXT
        )
      `);

      // Sessions table for persistence
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          userId TEXT REFERENCES users(id),
          socketId TEXT NOT NULL,
          state TEXT NOT NULL,
          subState TEXT,
          currentConf INTEGER DEFAULT 0,
          currentMsgBase INTEGER DEFAULT 0,
          timeRemaining INTEGER DEFAULT 60,
          lastActivity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          confRJoin INTEGER DEFAULT 1,
          msgBaseRJoin INTEGER DEFAULT 1,
          commandBuffer TEXT DEFAULT '',
          menuPause BOOLEAN DEFAULT true,
          inputBuffer TEXT DEFAULT '',
          relConfNum INTEGER DEFAULT 0,
          currentConfName TEXT DEFAULT 'Unknown',
          cmdShortcuts BOOLEAN DEFAULT false,
          tempData JSONB,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Bulletins table
      await client.query(`
        CREATE TABLE IF NOT EXISTS bulletins (
          id SERIAL PRIMARY KEY,
          "conferenceId" INTEGER NOT NULL REFERENCES conferences(id),
          filename TEXT NOT NULL,
          title TEXT NOT NULL,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // System logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          userId TEXT REFERENCES users(id),
          conferenceId INTEGER REFERENCES conferences(id),
          node INTEGER
        )
      `);

      // Create indexes for performance
      await this.createIndexes(client);
    } finally {
      client.release();
    }
  }

  private async createIndexes(client: any): Promise<void> {
    // Message indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conference ON messages("conferenceId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_base ON messages("messageBaseId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_private ON messages("isPrivate", "toUser")`);

    // File indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_area ON file_entries("areaId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_uploader ON file_entries(uploader)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_date ON file_entries("uploadDate")`);

    // User indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_seclevel ON users("secLevel")`);
  }


  // User management methods
  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    const client = await this.pool.connect();
    try {
      const id = crypto.randomUUID();
      const sql = `
        INSERT INTO users (
          id, username, "passwordHash", realname, location, phone, email,
          "secLevel", uploads, downloads, "bytesUpload", "bytesDownload", ratio,
          "ratioType", "timeTotal", "timeLimit", "timeUsed", "chatLimit", "chatUsed",
          "lastLogin", "firstLogin", calls, "callsToday", "newUser", expert, ansi,
          "linesPerScreen", computer, "screenType", protocol, editor, "zoomType",
          "availableForChat", "quietNode", "autoRejoin", "confAccess", "areaName", "uuCP",
          "topUploadCPS", "topDownloadCPS", "byteLimit"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
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

      await client.query(sql, values);
      return id;
    } finally {
      client.release();
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM users WHERE username = $1`;
      const result = await client.query(sql, [username]);
      if (result.rows[0]) {
        const user = result.rows[0] as any;
        // Convert bigint fields to numbers for compatibility
        // Helper function to safely convert to number with default
        const safeNumber = (value: any, defaultValue: number = 0): number => {
          const num = Number(value);
          return isNaN(num) ? defaultValue : num;
        };

        return {
          id: user.id,
          username: user.username,
          passwordHash: user["passwordHash"],
          realname: user.realname,
          location: user.location,
          phone: user.phone,
          email: user.email,
          secLevel: safeNumber(user["secLevel"], 10), // Default to 10 if NaN
          uploads: safeNumber(user.uploads, 0),
          downloads: safeNumber(user.downloads, 0),
          bytesUpload: safeNumber(user["bytesUpload"], 0),
          bytesDownload: safeNumber(user["bytesDownload"], 0),
          ratio: safeNumber(user.ratio, 0),
          ratioType: safeNumber(user["ratioType"], 0),
          timeTotal: safeNumber(user["timeTotal"], 0),
          timeLimit: safeNumber(user["timeLimit"], 0),
          timeUsed: safeNumber(user["timeUsed"], 0),
          chatLimit: safeNumber(user["chatLimit"], 0),
          chatUsed: safeNumber(user["chatUsed"], 0),
          lastLogin: user["lastLogin"],
          firstLogin: user["firstLogin"],
          calls: safeNumber(user.calls, 0),
          callsToday: safeNumber(user["callsToday"], 0),
          newUser: user["newUser"],
          expert: user.expert,
          ansi: user.ansi,
          linesPerScreen: safeNumber(user["linesPerScreen"], 23),
          computer: user.computer,
          screenType: user["screenType"],
          protocol: user.protocol,
          editor: user.editor,
          zoomType: user["zoomType"],
          availableForChat: user["availableForChat"],
          quietNode: user["quietNode"],
          autoRejoin: safeNumber(user["autoRejoin"], 1),
          confAccess: user["confAccess"],
          areaName: user["areaName"],
          uuCP: user["uuCP"],
          topUploadCPS: safeNumber(user["topUploadCPS"], 0),
          topDownloadCPS: safeNumber(user["topDownloadCPS"], 0),
          byteLimit: safeNumber(user["byteLimit"], 0),
          created: user.created,
          updated: user.updated,
        } as User;
      }
      return null;
    } finally {
      client.release();
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM users WHERE id = $1`;
      const result = await client.query(sql, [id]);
      return result.rows[0] as User || null;
    } finally {
      client.release();
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
      if (fields.length === 0) return;

      const sql = `UPDATE users SET ${fields.map((f, i) => `"${f}" = $${i + 1}`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof User]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async getUsers(filter?: { secLevel?: number; newUser?: boolean; limit?: number }): Promise<User[]> {
    const client = await this.pool.connect();
    try {
      let sql = `SELECT * FROM users WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      if (filter?.secLevel !== undefined) {
        sql += ` AND "secLevel" >= $${paramIndex++}`;
        params.push(filter.secLevel);
      }

      if (filter?.newUser !== undefined) {
        sql += ` AND newUser = $${paramIndex++}`;
        params.push(filter.newUser);
      }

      sql += ` ORDER BY username`;

      if (filter?.limit) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(filter.limit);
      }

      const result = await client.query(sql, params);
      return result.rows as User[];
    } finally {
      client.release();
    }
  }

  // Message management methods
  async createMessage(message: Omit<Message, 'id'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO messages (
          subject, body, author, timestamp, "conferenceId", "messageBaseId",
          "isPrivate", "toUser", "parentId", attachments, edited, "editedBy", "editedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `;

      const values = [
        message.subject, message.body, message.author, message.timestamp,
        message.conferenceId, message.messageBaseId, message.isPrivate,
        message.toUser, message.parentId, JSON.stringify(message.attachments || []),
        message.edited, message.editedBy, message.editedAt
      ];

      const result = await client.query(sql, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getMessages(conferenceId: number, messageBaseId: number, options?: {
    limit?: number;
    offset?: number;
    privateOnly?: boolean;
    userId?: string;
    search?: string;
  }): Promise<Message[]> {
    const client = await this.pool.connect();
    try {
      let sql = `
        SELECT m.*, mb.name as messageBaseName, c.name as conferenceName
        FROM messages m
        JOIN message_bases mb ON m.messageBaseId = mb.id
        JOIN conferences c ON m.conferenceId = c.id
        WHERE m.conferenceId = $1 AND m.messageBaseId = $2
      `;
      const params: any[] = [conferenceId, messageBaseId];
      let paramIndex = 3;

      if (options?.privateOnly && options?.userId) {
        sql += ` AND (m.isPrivate = false OR (m.isPrivate = true AND (m.author = $${paramIndex++} OR m.toUser = $${paramIndex++})))`;
        params.push(options.userId, options.userId);
      }

      if (options?.search) {
        sql += ` AND (m.subject ILIKE $${paramIndex++} OR m.body ILIKE $${paramIndex++} OR m.author ILIKE $${paramIndex++})`;
        const searchTerm = `%${options.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ` ORDER BY m.timestamp DESC`;

      if (options?.limit) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options?.offset) {
        sql += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await client.query(sql, params);
      const messages = result.rows.map((row: any) => ({
        ...row,
        attachments: row.attachments || []
      }));

      return messages as Message[];
    } finally {
      client.release();
    }
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return;

      const sql = `UPDATE messages SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => {
        if (f === 'attachments') return JSON.stringify(updates.attachments || []);
        return updates[f as keyof Message];
      }), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async deleteMessage(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `DELETE FROM messages WHERE id = $1`;
      await client.query(sql, [id]);
    } finally {
      client.release();
    }
  }

  // File management methods
  async createFileEntry(file: Omit<FileEntry, 'id'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO file_entries (
          filename, description, size, uploader, "uploadDate", downloads,
          "areaId", "fileIdDiz", rating, votes, status, checked, comment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `;

      const values = [
        file.filename, file.description, file.size, file.uploader, file.uploadDate,
        file.downloads, file.areaId, file.fileIdDiz, file.rating, file.votes,
        file.status, file.checked, file.comment
      ];

      const result = await client.query(sql, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getFileEntries(areaId: number, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
  }): Promise<FileEntry[]> {
    const client = await this.pool.connect();
    try {
      let sql = `SELECT * FROM file_entries WHERE areaId = $1`;
      const params: any[] = [areaId];
      let paramIndex = 2;

      if (options?.status) {
        sql += ` AND status = $${paramIndex++}`;
        params.push(options.status);
      }

      if (options?.search) {
        sql += ` AND (filename ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++} OR fileIdDiz ILIKE $${paramIndex++})`;
        const searchTerm = `%${options.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ` ORDER BY uploadDate DESC`;

      if (options?.limit) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options?.offset) {
        sql += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await client.query(sql, params);
      return result.rows as FileEntry[];
    } finally {
      client.release();
    }
  }

  async updateFileEntry(id: number, updates: Partial<FileEntry>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return;

      const sql = `UPDATE file_entries SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof FileEntry]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async incrementDownloadCount(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `UPDATE file_entries SET downloads = downloads + 1 WHERE id = $1`;
      await client.query(sql, [id]);
    } finally {
      client.release();
    }
  }

  // Session management methods
  async createSession(session: Omit<Session, 'created' | 'updated'>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO sessions (
          id, "userId", "socketId", state, "subState", "currentConf", "currentMsgBase",
          "timeRemaining", "lastActivity", "confRJoin", "msgBaseRJoin", "commandBuffer",
          "menuPause", "inputBuffer", "relConfNum", "currentConfName", "cmdShortcuts", "tempData"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          "userId" = EXCLUDED."userId",
          "socketId" = EXCLUDED."socketId",
          state = EXCLUDED.state,
          "subState" = EXCLUDED."subState",
          "currentConf" = EXCLUDED."currentConf",
          "currentMsgBase" = EXCLUDED."currentMsgBase",
          "timeRemaining" = EXCLUDED."timeRemaining",
          "lastActivity" = EXCLUDED."lastActivity",
          "confRJoin" = EXCLUDED."confRJoin",
          "msgBaseRJoin" = EXCLUDED."msgBaseRJoin",
          "commandBuffer" = EXCLUDED."commandBuffer",
          "menuPause" = EXCLUDED."menuPause",
          "inputBuffer" = EXCLUDED."inputBuffer",
          "relConfNum" = EXCLUDED."relConfNum",
          "currentConfName" = EXCLUDED."currentConfName",
          "cmdShortcuts" = EXCLUDED."cmdShortcuts",
          "tempData" = EXCLUDED."tempData",
          updated = CURRENT_TIMESTAMP
      `;

      const values = [
        session.id, session.userId, session.socketId, session.state, session.subState,
        session.currentConf, session.currentMsgBase, session.timeRemaining,
        session.lastActivity, session.confRJoin, session.msgBaseRJoin,
        session.commandBuffer, session.menuPause, session.inputBuffer,
        session.relConfNum, session.currentConfName, session.cmdShortcuts,
        session.tempData ? JSON.stringify(session.tempData) : null
      ];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async getSession(id: string): Promise<Session | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM sessions WHERE id = $1`;
      const result = await client.query(sql, [id]);
      if (result.rows[0]) {
        const session = result.rows[0] as any;
        if (session.tempData) {
          session.tempData = JSON.parse(session.tempData);
        }
        return session as Session;
      }
      return null;
    } finally {
      client.release();
    }
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
      if (fields.length === 0) return;

      const sql = `UPDATE sessions SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => {
        if (f === 'tempData') return updates.tempData ? JSON.stringify(updates.tempData) : null;
        return updates[f as keyof Session];
      }), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async deleteSession(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `DELETE FROM sessions WHERE id = $1`;
      await client.query(sql, [id]);
    } finally {
      client.release();
    }
  }

  async getActiveSessions(): Promise<Session[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM sessions WHERE lastActivity > NOW() - INTERVAL '30 minutes'`;
      const result = await client.query(sql);
      const sessions = result.rows.map((row: any) => {
        const session = row as any;
        if (session.tempData) {
          session.tempData = JSON.parse(session.tempData);
        }
        return session as Session;
      });
      return sessions;
    } finally {
      client.release();
    }
  }

  // Conference and message base management
  async createConference(conf: Omit<Conference, 'id' | 'created' | 'updated'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `INSERT INTO conferences (name, description) VALUES ($1, $2) RETURNING id`;
      const result = await client.query(sql, [conf.name, conf.description]);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getConferences(): Promise<Conference[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM conferences ORDER BY id`;
      const result = await client.query(sql);
      return result.rows as Conference[];
    } finally {
      client.release();
    }
  }

  async createMessageBase(mb: Omit<MessageBase, 'id' | 'created' | 'updated'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `INSERT INTO message_bases (name, "conferenceId") VALUES ($1, $2) RETURNING id`;
      const result = await client.query(sql, [mb.name, mb.conferenceId]);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM message_bases WHERE "conferenceId" = $1 ORDER BY id`;
      const result = await client.query(sql, [conferenceId]);
      return result.rows as MessageBase[];
    } finally {
      client.release();
    }
  }

  // File area management
  async createFileArea(area: Omit<FileArea, 'id' | 'created' | 'updated'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO file_areas (
          name, description, path, "conferenceId", maxFiles, uploadAccess, downloadAccess
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      const values = [
        area.name, area.description, area.path, area.conferenceId,
        area.maxFiles, area.uploadAccess, area.downloadAccess
      ];

      const result = await client.query(sql, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getFileAreas(conferenceId: number): Promise<FileArea[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM file_areas WHERE "conferenceId" = $1 ORDER BY id`;
      const result = await client.query(sql, [conferenceId]);
      return result.rows as FileArea[];
    } finally {
      client.release();
    }
  }

  // Node session management methods
  async createNodeSession(session: Omit<NodeSession, 'created' | 'updated'>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO node_sessions (
          id, nodeId, userId, socketId, state, subState, currentConf, currentMsgBase,
          timeRemaining, lastActivity, status, loadLevel, currentUser
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          userId = EXCLUDED.userId,
          socketId = EXCLUDED.socketId,
          state = EXCLUDED.state,
          subState = EXCLUDED.subState,
          currentConf = EXCLUDED.currentConf,
          currentMsgBase = EXCLUDED.currentMsgBase,
          timeRemaining = EXCLUDED.timeRemaining,
          lastActivity = EXCLUDED.lastActivity,
          status = EXCLUDED.status,
          loadLevel = EXCLUDED.loadLevel,
          currentUser = EXCLUDED.currentUser,
          updated = CURRENT_TIMESTAMP
      `;

      const values = [
        session.id, session.nodeId, session.userId, session.socketId, session.state,
        session.subState, session.currentConf, session.currentMsgBase, session.timeRemaining,
        session.lastActivity, session.status, session.loadLevel, session.currentUser
      ];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async updateNodeSession(id: string, updates: Partial<NodeSession>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
      if (fields.length === 0) return;

      const sql = `UPDATE node_sessions SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof NodeSession]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async getNodeSessions(nodeId?: number): Promise<NodeSession[]> {
    const client = await this.pool.connect();
    try {
      let sql = `SELECT * FROM node_sessions`;
      const params: any[] = [];

      if (nodeId !== undefined) {
        sql += ` WHERE nodeId = $1`;
        params.push(nodeId);
      }

      sql += ` ORDER BY lastActivity DESC`;
      const result = await client.query(sql, params);
      return result.rows as NodeSession[];
    } finally {
      client.release();
    }
  }

  // AREXX script management methods
  async getAREXXScripts(): Promise<AREXXScript[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM arexx_scripts ORDER BY priority DESC, name`;
      const result = await client.query(sql);
      return result.rows as AREXXScript[];
    } finally {
      client.release();
    }
  }

  async executeAREXXScript(scriptId: string, context: AREXXContext): Promise<any> {
    // AREXX execution would be implemented here
    // For now, return a placeholder
    return { success: true, result: 'AREXX script executed' };
  }

  // QWK packet management methods
  async createQWKPacket(packet: Omit<QWKPacket, 'id'>): Promise<string> {
    const client = await this.pool.connect();
    try {
      const id = crypto.randomUUID();
      const sql = `
        INSERT INTO qwk_packets (
          id, filename, userId, status, messageCount, created, sent, size, path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        id, packet.filename, packet.userId, packet.status, packet.messageCount,
        packet.created, packet.sent, packet.size, packet.path
      ];

      await client.query(sql, values);
      return id;
    } finally {
      client.release();
    }
  }

  async createQWKMessage(message: Omit<QWKMessage, 'id'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO qwk_messages (
          packetId, subject, body, author, recipient, timestamp, conference,
          messageBase, isPrivate, status, from, to, date, isReply, parentId, attachments
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `;

      const values = [
        message.packetId, message.subject, message.body, message.author, message.recipient,
        message.timestamp, message.conference, message.messageBase, message.isPrivate,
        message.status, message.from, message.to, message.date, message.isReply,
        message.parentId, JSON.stringify(message.attachments || [])
      ];

      const result = await client.query(sql, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async updateQWKPacket(id: string, updates: Partial<QWKPacket>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return;

      const sql = `UPDATE qwk_packets SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof QWKPacket]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  async getQWKPacket(id: string): Promise<QWKPacket | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM qwk_packets WHERE id = $1`;
      const result = await client.query(sql, [id]);
      return result.rows[0] as QWKPacket || null;
    } finally {
      client.release();
    }
  }

  async deleteQWKPacket(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `DELETE FROM qwk_packets WHERE id = $1`;
      await client.query(sql, [id]);
    } finally {
      client.release();
    }
  }

  // FTN message management methods
  async createFTNMessage(message: Omit<FTNMessage, 'id'>): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO ftn_messages (
          subject, body, author, recipient, timestamp, originAddress, destinationAddress,
          conference, messageBase, isPrivate, status, attributes, fromAddress, toAddress,
          date, msgid, replyTo, area
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id
      `;

      const values = [
        message.subject, message.body, message.author, message.recipient, message.timestamp,
        message.originAddress, message.destinationAddress, message.conference, message.messageBase,
        message.isPrivate, message.status, message.attributes, message.fromAddress,
        message.toAddress, message.date, message.msgid, message.replyTo, message.area
      ];

      const result = await client.query(sql, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getFTNMessages(conferenceId: number, messageBaseId: number): Promise<FTNMessage[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT * FROM ftn_messages
        WHERE conference = $1 AND messageBase = $2
        ORDER BY timestamp DESC
      `;
      const result = await client.query(sql, [conferenceId, messageBaseId]);
      return result.rows as FTNMessage[];
    } finally {
      client.release();
    }
  }

  async updateFTNMessage(id: number, updates: Partial<FTNMessage>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return;

      const sql = `UPDATE ftn_messages SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof FTNMessage]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  // File transfer session management methods
  async createTransferSession(session: Omit<TransferSession, 'id'>): Promise<string> {
    const client = await this.pool.connect();
    try {
      const id = crypto.randomUUID();
      const sql = `
        INSERT INTO transfer_sessions (
          id, userId, type, protocol, filename, size, transferred, status,
          startTime, endTime, speed, error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      const values = [
        id, session.userId, session.type, session.protocol, session.filename,
        session.size, session.transferred, session.status, session.startTime,
        session.endTime, session.speed, session.error
      ];

      await client.query(sql, values);
      return id;
    } finally {
      client.release();
    }
  }

  async updateTransferSession(id: string, updates: Partial<TransferSession>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return;

      const sql = `UPDATE transfer_sessions SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')} WHERE id = $${fields.length + 1}`;
      const values = [...fields.map(f => updates[f as keyof TransferSession]), id];

      await client.query(sql, values);
    } finally {
      client.release();
    }
  }

  // Logging methods
  async logSystemEvent(level: 'info' | 'warning' | 'error', message: string, context?: {
    userId?: string;
    conferenceId?: number;
    node?: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `INSERT INTO system_logs (level, message, userId, conferenceId, node) VALUES ($1, $2, $3, $4, $5)`;
      const values = [level, message, context?.userId, context?.conferenceId, context?.node];
      await client.query(sql, values);
    } finally {
      client.release();
    }
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
    await this.pool.end();
  }

  // Initialize default data
  async initializeDefaultData(): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log('Creating default conferences...');
      // Create default conferences
      const conferences = [
        { name: 'General', description: 'General discussion' },
        { name: 'Tech Support', description: 'Technical support' },
        { name: 'Announcements', description: 'System announcements' }
      ];

      for (const conf of conferences) {
        // Check if conference already exists
        const existing = await client.query('SELECT id FROM conferences WHERE name = $1', [conf.name]);
        if (existing.rows.length === 0) {
          await client.query('INSERT INTO conferences (name, description) VALUES ($1, $2)', [conf.name, conf.description]);
          console.log(`Created conference: ${conf.name}`);
        } else {
          console.log(`Conference already exists: ${conf.name}`);
        }
      }

      console.log('Creating default message bases...');
      // Create default message bases
      const messageBases = [
        { name: 'Main', conferenceId: 1 },
        { name: 'Off Topic', conferenceId: 1 },
        { name: 'Support', conferenceId: 2 },
        { name: 'News', conferenceId: 3 }
      ];

      for (const mb of messageBases) {
        // Check if message base already exists
        const existing = await client.query('SELECT id FROM message_bases WHERE name = $1 AND "conferenceId" = $2', [mb.name, mb.conferenceId]);
        if (existing.rows.length === 0) {
          await client.query('INSERT INTO message_bases (name, "conferenceId") VALUES ($1, $2)', [mb.name, mb.conferenceId]);
          console.log(`Created message base: ${mb.name} in conference ${mb.conferenceId}`);
        } else {
          console.log(`Message base already exists: ${mb.name} in conference ${mb.conferenceId}`);
        }
      }

      console.log('Creating default file areas...');
      // Create default file areas
      const fileAreas = [
        { name: 'General Files', description: 'General purpose file area', path: '/files/general', conferenceId: 1, maxFiles: 100, uploadAccess: 10, downloadAccess: 1 },
        { name: 'Utilities', description: 'System utilities and tools', path: '/files/utils', conferenceId: 1, maxFiles: 50, uploadAccess: 50, downloadAccess: 1 },
        { name: 'Games', description: 'BBS games and entertainment', path: '/files/games', conferenceId: 2, maxFiles: 75, uploadAccess: 25, downloadAccess: 1 },
        { name: 'Tech Files', description: 'Technical documentation and tools', path: '/files/tech', conferenceId: 2, maxFiles: 60, uploadAccess: 20, downloadAccess: 1 },
        { name: 'System News', description: 'System announcements and updates', path: '/files/news', conferenceId: 3, maxFiles: 30, uploadAccess: 100, downloadAccess: 1 }
      ];

      for (const area of fileAreas) {
        // Check if file area already exists
        const existing = await client.query('SELECT id FROM file_areas WHERE name = $1 AND "conferenceId" = $2', [area.name, area.conferenceId]);
        if (existing.rows.length === 0) {
          await client.query(`
            INSERT INTO file_areas (name, description, path, conferenceid, maxFiles, uploadAccess, downloadAccess)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [area.name, area.description, area.path, area.conferenceId, area.maxFiles, area.uploadAccess, area.downloadAccess]);
          console.log(`Created file area: ${area.name} in conference ${area.conferenceId}`);
        } else {
          console.log(`File area already exists: ${area.name} in conference ${area.conferenceId}`);
        }
      }

      console.log('Creating default sysop user...');
      // Create default sysop user
      const hashedPassword = await this.hashPassword('sysop');
      console.log('Generated password hash for sysop:', hashedPassword);

      // First try to update existing sysop user if it exists
      const updateResult = await client.query(`
        UPDATE users SET "passwordHash" = $1 WHERE username = 'sysop'
      `, [hashedPassword]);

      if (updateResult.rowCount === 0) {
        // User doesn't exist, create it
        console.log('Creating new sysop user...');
        await client.query(`
          INSERT INTO users (
            id, username, "passwordHash", realname, location, phone, email, "secLevel",
            uploads, downloads, "bytesUpload", "bytesDownload", ratio, "ratioType",
            "timeTotal", "timeLimit", "timeUsed", "chatLimit", "chatUsed", "lastLogin", "firstLogin",
            calls, "callsToday", "newUser", expert, ansi, "linesPerScreen", computer,
            "screenType", protocol, editor, "zoomType", "availableForChat", "quietNode",
            "autoRejoin", "confAccess", "areaName", "uuCP", "topUploadCPS", "topDownloadCPS", "byteLimit"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
            $39, $40, $41, $42, $43
          )
        `, [
          'sysop-user-id', 'sysop', hashedPassword, 'System Operator', 'Server Room', '', '',
          255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, new Date(),
          0, 0, false, true, true, 23, 'Server', 'Amiga Ansi', '/X Zmodem', 'Prompt',
          'QWK', true, false, 1, 'XXX', 'Sysop', false, 0, 0, 0
        ]);
        console.log('Sysop user created successfully');
      } else {
        console.log('Sysop user updated with new password hash');
      }

      console.log('Default data initialization completed');

      // Clean up duplicate conferences (in case they exist from previous runs)
      await this.cleanupDuplicateConferences();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // Don't throw error - continue with server startup
      console.log('Continuing with server startup despite database initialization error');
    }
  }

  // Clean up duplicate conferences by name, keeping only the first occurrence
  async cleanupDuplicateConferences(): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log('Cleaning up duplicate conferences...');

      // Find duplicate conference names
      const duplicates = await client.query(`
        SELECT name, COUNT(*) as count
        FROM conferences
        GROUP BY name
        HAVING COUNT(*) > 1
      `);

      if (duplicates.rows.length > 0) {
        console.log(`Found ${duplicates.rows.length} conference names with duplicates`);

        for (const dup of duplicates.rows) {
          // Get all IDs for this conference name, ordered by creation date
          const ids = await client.query(`
            SELECT id FROM conferences
            WHERE name = $1
            ORDER BY created ASC
          `, [dup.name]);

          // Keep the first one, delete the rest
          const idsToDelete = ids.rows.slice(1).map((row: any) => row.id);

          if (idsToDelete.length > 0) {
            await client.query(
              `DELETE FROM conferences WHERE id = ANY($1)`,
              [idsToDelete]
            );
            console.log(`Deleted ${idsToDelete.length} duplicate entries for conference: ${dup.name}`);
          }
        }

        // Also clean up orphaned message bases and file areas
        await this.cleanupOrphanedData();
      } else {
        console.log('No duplicate conferences found');
      }
    } finally {
      client.release();
    }
  }

  // Clean up orphaned message bases and file areas after conference cleanup
  private async cleanupOrphanedData(): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log('Cleaning up orphaned message bases and file areas...');

      // Delete message bases that reference non-existent conferences
      const deletedMB = await client.query(`
        DELETE FROM message_bases
        WHERE "conferenceId" NOT IN (SELECT id FROM conferences)
      `);

      // Delete file areas that reference non-existent conferences
      const deletedFA = await client.query(`
        DELETE FROM file_areas
        WHERE "conferenceId" NOT IN (SELECT id FROM conferences)
      `);

      if (deletedMB.rowCount > 0 || deletedFA.rowCount > 0) {
        console.log(`Cleaned up ${deletedMB.rowCount} orphaned message bases and ${deletedFA.rowCount} orphaned file areas`);
      }
    } finally {
      client.release();
    }
  }

}

// Export singleton instance
export const db = new Database();