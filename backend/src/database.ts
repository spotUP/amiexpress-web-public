// Load environment variables FIRST
require('dotenv').config({ override: true });

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs';

// Import types from types.ts
import type {
  NodeSession,
  AREXXScript,
  AREXXContext,
  QWKPacket,
  QWKMessage,
  FTNMessage,
  TransferSession,
  InternodeChatSession,
  InternodeChatMessage
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
  ratioType: number;
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
  confAccess: string;
  areaName: string;
  uuCP: boolean;
  topUploadCPS: number;
  topDownloadCPS: number;
  byteLimit: number;
  securityFlags?: string;
  secOverride?: string;
  userFlags: number;
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
  checked: 'N' | 'P' | 'F';
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

export interface Webhook {
  id: number;
  name: string;
  url: string;
  type: 'discord' | 'slack';
  enabled: boolean;
  triggers: string[];
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
  tempData?: string;
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

// Helper function to convert camelCase field names to lowercase column names
function fieldToColumn(field: string): string {
  const fieldMap: { [key: string]: string } = {
    'passwordHash': 'passwordhash',
    'secLevel': 'seclevel',
    'bytesUpload': 'bytesupload',
    'bytesDownload': 'bytesdownload',
    'ratioType': 'ratiotype',
    'timeTotal': 'timetotal',
    'timeLimit': 'timelimit',
    'timeUsed': 'timeused',
    'chatLimit': 'chatlimit',
    'chatUsed': 'chatused',
    'lastLogin': 'lastlogin',
    'firstLogin': 'firstlogin',
    'callsToday': 'callstoday',
    'newUser': 'newuser',
    'linesPerScreen': 'linesperscreen',
    'screenType': 'screentype',
    'zoomType': 'zoomtype',
    'availableForChat': 'availableforchat',
    'quietNode': 'quietnode',
    'autoRejoin': 'autorejoin',
    'confAccess': 'confaccess',
    'areaName': 'areaname',
    'uuCP': 'uucp',
    'topUploadCPS': 'topuploadcps',
    'topDownloadCPS': 'topdownloadcps',
    'byteLimit': 'bytelimit'
  };

  return fieldMap[field] || field.toLowerCase();
}

export class Database {
  private db?: Database.Database;
  private isConnected: boolean = false;
  private dbPath: string;

  constructor() {
    // SQLite database path
    const dbDir = process.env.DATABASE_DIR || path.join(process.cwd(), 'data');
    const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
    this.dbPath = path.join(dbDir, dbFile);

    console.log('Initializing SQLite database connection...');
    console.log(`Database path: ${this.dbPath}`);

    // Ensure database directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.isConnected = true;
      console.log('✅ Connected to SQLite database');
    } catch (error) {
      console.error('❌ Failed to connect to SQLite database:', error);
      throw error;
    }
  }

  // Public initialization method - must be called before using database
  async init(): Promise<void> {
    await this.initDatabase();
  }

  // Check if database is connected
  public isHealthy(): boolean {
    return this.isConnected;
  }

  // Generic query method for custom SQL queries
  public async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return { rows };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  private async initDatabase(): Promise<void> {
    try {
      console.log('Creating database tables...');
      await this.createTables();
      console.log('Database tables created successfully');

      console.log('Running database migrations...');
      await this.runMigrations();
      console.log('Database migrations completed');

      await this.initializeDefaultData();
      console.log('Default data initialized');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      console.log('Continuing with server startup despite database initialization error');
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      console.log('Checking for missing columns in users table...');

      // Check and add columns if they don't exist
      const tableInfo = this.db.prepare('PRAGMA table_info(users)').all() as any[];
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('availableforchat')) {
        this.db.exec('ALTER TABLE users ADD COLUMN availableforchat INTEGER DEFAULT 1');
        console.log('✓ Added availableforchat column');
      }

      if (!columnNames.includes('quietnode')) {
        this.db.exec('ALTER TABLE users ADD COLUMN quietnode INTEGER DEFAULT 0');
        console.log('✓ Added quietnode column');
      }

      if (!columnNames.includes('autorejoin')) {
        this.db.exec('ALTER TABLE users ADD COLUMN autorejoin INTEGER DEFAULT 1');
        console.log('✓ Added autorejoin column');
      }

      if (!columnNames.includes('fontpreference')) {
        this.db.exec('ALTER TABLE users ADD COLUMN fontpreference TEXT DEFAULT \'mosoul\'');
        console.log('✓ Added fontpreference column');
      }

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Error running migrations:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Users table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          passwordhash TEXT NOT NULL,
          realname TEXT NOT NULL,
          location TEXT,
          phone TEXT,
          email TEXT,
          seclevel INTEGER DEFAULT 10,
          uploads INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          bytesupload INTEGER DEFAULT 0,
          bytesdownload INTEGER DEFAULT 0,
          ratio INTEGER DEFAULT 0,
          ratiotype INTEGER DEFAULT 0,
          timetotal INTEGER DEFAULT 0,
          timelimit INTEGER DEFAULT 0,
          timeused INTEGER DEFAULT 0,
          chatlimit INTEGER DEFAULT 0,
          chatused INTEGER DEFAULT 0,
          lastlogin INTEGER,
          firstlogin INTEGER DEFAULT (strftime('%s', 'now')),
          calls INTEGER DEFAULT 0,
          callstoday INTEGER DEFAULT 0,
          newuser INTEGER DEFAULT 1,
          expert INTEGER DEFAULT 0,
          ansi INTEGER DEFAULT 1,
          linesperscreen INTEGER DEFAULT 23,
          computer TEXT,
          screentype TEXT DEFAULT 'Amiga Ansi',
          protocol TEXT DEFAULT '/X Zmodem',
          editor TEXT DEFAULT 'Prompt',
          zoomtype TEXT DEFAULT 'QWK',
          availableforchat INTEGER DEFAULT 1,
          quietnode INTEGER DEFAULT 0,
          autorejoin INTEGER DEFAULT 1,
          confaccess TEXT DEFAULT 'XXX',
          areaname TEXT DEFAULT 'Standard',
          uucp INTEGER DEFAULT 0,
          topuploadcps INTEGER DEFAULT 0,
          topdownloadcps INTEGER DEFAULT 0,
          bytelimit INTEGER DEFAULT 0,
          securityflags TEXT DEFAULT NULL,
          secoverride TEXT DEFAULT NULL,
          userflags INTEGER DEFAULT 0,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Conferences table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Message bases table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS message_bases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(name, conferenceid)
        )
      `);

      // Messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          author TEXT NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now')),
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          messagebaseid INTEGER NOT NULL REFERENCES message_bases(id),
          isprivate INTEGER DEFAULT 0,
          touser TEXT,
          parentid INTEGER,
          attachments TEXT,
          edited INTEGER DEFAULT 0,
          editedby TEXT,
          editedat INTEGER
        )
      `);

      // File areas table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS file_areas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          path TEXT NOT NULL,
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          maxfiles INTEGER DEFAULT 100,
          uploadaccess INTEGER DEFAULT 10,
          downloadaccess INTEGER DEFAULT 1,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(name, conferenceid)
        )
      `);

      // File entries table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS file_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          description TEXT,
          size INTEGER NOT NULL,
          uploader TEXT NOT NULL,
          uploaddate INTEGER DEFAULT (strftime('%s', 'now')),
          downloads INTEGER DEFAULT 0,
          areaid INTEGER NOT NULL REFERENCES file_areas(id),
          fileiddiz TEXT,
          rating REAL DEFAULT 0,
          votes INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          checked TEXT DEFAULT 'N',
          comment TEXT,
          UNIQUE(filename, areaid)
        )
      `);

      // Sessions table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          userid TEXT REFERENCES users(id),
          socketid TEXT NOT NULL,
          state TEXT NOT NULL,
          substate TEXT,
          currentconf INTEGER DEFAULT 0,
          currentmsgbase INTEGER DEFAULT 0,
          timeremaining INTEGER DEFAULT 60,
          lastactivity INTEGER DEFAULT (strftime('%s', 'now')),
          confrjoin INTEGER DEFAULT 1,
          msgbaserjoin INTEGER DEFAULT 1,
          commandbuffer TEXT DEFAULT '',
          menupause INTEGER DEFAULT 1,
          inputbuffer TEXT DEFAULT '',
          relconfnum INTEGER DEFAULT 0,
          currentconfname TEXT DEFAULT 'Unknown',
          cmdshortcuts INTEGER DEFAULT 0,
          tempdata TEXT,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Bulletins table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS bulletins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          filename TEXT NOT NULL,
          title TEXT NOT NULL,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(filename, conferenceid)
        )
      `);

      // Online messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS online_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user_id TEXT NOT NULL REFERENCES users(id),
          to_user_id TEXT NOT NULL REFERENCES users(id),
          message TEXT NOT NULL,
          delivered INTEGER DEFAULT 0,
          read INTEGER DEFAULT 0,
          from_username TEXT NOT NULL,
          to_username TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          delivered_at INTEGER,
          read_at INTEGER
        )
      `);

      // Chat sessions table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT UNIQUE NOT NULL,
          initiator_id TEXT NOT NULL REFERENCES users(id),
          recipient_id TEXT NOT NULL REFERENCES users(id),
          initiator_username TEXT NOT NULL,
          recipient_username TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requesting',
          started_at INTEGER DEFAULT (strftime('%s', 'now')),
          ended_at INTEGER,
          initiator_socket TEXT NOT NULL,
          recipient_socket TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Chat messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          sender_id TEXT NOT NULL REFERENCES users(id),
          sender_username TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
        )
      `);

      // Chat rooms table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT UNIQUE NOT NULL,
          room_name TEXT NOT NULL,
          topic TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_by_username TEXT NOT NULL,
          is_public INTEGER DEFAULT 1,
          max_users INTEGER DEFAULT 50,
          is_persistent INTEGER DEFAULT 1,
          password TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Chat room members table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_room_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          socket_id TEXT NOT NULL,
          is_moderator INTEGER DEFAULT 0,
          is_muted INTEGER DEFAULT 0,
          joined_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(room_id, user_id)
        )
      `);

      // Chat room messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chat_room_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id),
          sender_username TEXT NOT NULL,
          message TEXT NOT NULL,
          message_type TEXT DEFAULT 'message',
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Node sessions table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS node_sessions (
          id TEXT PRIMARY KEY,
          nodeid INTEGER NOT NULL UNIQUE,
          userid TEXT REFERENCES users(id),
          socketid TEXT NOT NULL,
          state TEXT NOT NULL,
          substate TEXT,
          currentconf INTEGER,
          currentmsgbase INTEGER,
          timeremaining INTEGER,
          lastactivity INTEGER DEFAULT (strftime('%s', 'now')),
          status TEXT NOT NULL,
          loadlevel INTEGER DEFAULT 0,
          currentuser TEXT,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Additional tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS flagged_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conf_num INTEGER NOT NULL,
          file_name TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(user_id, conf_num, file_name)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS command_history (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          history_num INTEGER DEFAULT 0,
          history_cycle INTEGER DEFAULT 0,
          commands TEXT DEFAULT '[]',
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS caller_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          node_id INTEGER DEFAULT 1,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          username TEXT,
          action TEXT NOT NULL,
          details TEXT,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          bytes_uploaded INTEGER DEFAULT 0,
          bytes_downloaded INTEGER DEFAULT 0,
          files_uploaded INTEGER DEFAULT 0,
          files_downloaded INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mail_stats (
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          message_base_id INTEGER NOT NULL REFERENCES message_bases(id) ON DELETE CASCADE,
          lowest_key INTEGER DEFAULT 1,
          high_msg_num INTEGER DEFAULT 1,
          lowest_not_del INTEGER DEFAULT 0,
          PRIMARY KEY (conference_id, message_base_id)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conf_base (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          message_base_id INTEGER NOT NULL REFERENCES message_bases(id) ON DELETE CASCADE,
          last_new_read_conf INTEGER DEFAULT 0,
          last_msg_read_conf INTEGER DEFAULT 0,
          scan_flags INTEGER DEFAULT 12,
          messages_posted INTEGER DEFAULT 0,
          new_since_date INTEGER DEFAULT (strftime('%s', 'now')),
          bytes_download INTEGER DEFAULT 0,
          bytes_upload INTEGER DEFAULT 0,
          upload INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, conference_id, message_base_id)
        )
      `);

      // Voting system tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vote_topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          topic_number INTEGER NOT NULL CHECK (topic_number >= 1 AND topic_number <= 25),
          title TEXT NOT NULL,
          description TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          is_active INTEGER DEFAULT 1,
          UNIQUE (conference_id, topic_number)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vote_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          question_number INTEGER NOT NULL,
          question_text TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE (topic_id, question_number)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vote_answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id INTEGER NOT NULL REFERENCES vote_questions(id) ON DELETE CASCADE,
          answer_letter TEXT NOT NULL CHECK (length(answer_letter) = 1 AND answer_letter >= 'A' AND answer_letter <= 'Z'),
          answer_text TEXT NOT NULL,
          vote_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE (question_id, answer_letter)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vote_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          question_id INTEGER NOT NULL REFERENCES vote_questions(id) ON DELETE CASCADE,
          answer_id INTEGER NOT NULL REFERENCES vote_answers(id) ON DELETE CASCADE,
          voted_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE (user_id, question_id)
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vote_status (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          completed_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (user_id, topic_id)
        )
      `);

      // Webhooks table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          url TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('discord', 'slack')),
          enabled INTEGER DEFAULT 1,
          triggers TEXT DEFAULT '[]',
          created INTEGER DEFAULT (strftime('%s', 'now')),
          updated INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Create indexes
      await this.createIndexes();
    } catch (error) {
      console.error('Error creating tables:', error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Message indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conference ON messages(conferenceid)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_base ON messages(messagebaseid)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_private ON messages(isprivate, touser)');

      // File indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_area ON file_entries(areaid)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_uploader ON file_entries(uploader)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_files_date ON file_entries(uploaddate)');

      // Conference indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_file_areas_conference ON file_areas(conferenceid)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_message_bases_conference ON message_bases(conferenceid)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_bulletins_conference ON bulletins(conferenceid)');

      // User indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_seclevel ON users(seclevel)');

      // Online messages indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_online_messages_to_user ON online_messages(to_user_id, delivered, read)');

      // Chat indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_users ON chat_sessions(initiator_id, recipient_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id)');

      // Chat room indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_chat_rooms_public ON chat_rooms(is_public)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_room_members_room ON chat_room_members(room_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_room_members_user ON chat_room_members(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_room_messages_room ON chat_room_messages(room_id, created_at)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_room_messages_sender ON chat_room_messages(sender_id)');

      // Other indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_flagged_files_user ON flagged_files(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_caller_activity_user ON caller_activity(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conf_base_user ON conf_base(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conf_base_conference ON conf_base(conference_id, message_base_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_caller_activity_timestamp ON caller_activity(timestamp DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_caller_activity_node ON caller_activity(node_id, timestamp DESC)');

      // Voting indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_topics_conference ON vote_topics(conference_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_topics_active ON vote_topics(is_active)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_questions_topic ON vote_questions(topic_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_answers_question ON vote_answers(question_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_results_user ON vote_results(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_results_topic ON vote_results(topic_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_status_user ON vote_status(user_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vote_status_conference ON vote_status(conference_id)');
    } catch (error) {
      console.error('Error creating indexes:', error);
      // Don't throw - indexes are not critical
    }
  }

  // User management methods
  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, username, passwordhash, realname, location, phone, email,
        seclevel, uploads, downloads, bytesupload, bytesdownload, ratio,
        ratiotype, timetotal, timelimit, timeused, chatlimit, chatused,
        lastlogin, firstlogin, calls, callstoday, newuser, expert, ansi,
        linesperscreen, computer, screentype, protocol, editor, zoomtype,
        availableforchat, quietnode, autorejoin, confaccess, areaname, uucp,
        topuploadcps, topdownloadcps, bytelimit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, userData.username, userData.passwordHash, userData.realname,
      userData.location, userData.phone, userData.email, userData.secLevel,
      userData.uploads, userData.downloads, userData.bytesUpload, userData.bytesDownload,
      userData.ratio, userData.ratioType, userData.timeTotal, userData.timeLimit,
      userData.timeUsed, userData.chatLimit, userData.chatUsed,
      userData.lastLogin ? Math.floor(userData.lastLogin.getTime() / 1000) : null,
      Math.floor(userData.firstLogin.getTime() / 1000),
      userData.calls, userData.callsToday, userData.newUser ? 1 : 0,
      userData.expert ? 1 : 0, userData.ansi ? 1 : 0, userData.linesPerScreen, userData.computer,
      userData.screenType, userData.protocol, userData.editor, userData.zoomType,
      userData.availableForChat ? 1 : 0, userData.quietNode ? 1 : 0, userData.autoRejoin,
      userData.confAccess, userData.areaName, userData.uuCP ? 1 : 0, userData.topUploadCPS,
      userData.topDownloadCPS, userData.byteLimit
    );

    return id;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username) as any;

    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  async getUserById(id: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id) as any;

    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  private mapUserFromDb(user: any): User {
    const safeNumber = (value: any, defaultValue: number = 0): number => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    return {
      id: user.id,
      username: user.username,
      passwordHash: user.passwordhash,
      realname: user.realname,
      location: user.location,
      phone: user.phone,
      email: user.email,
      secLevel: safeNumber(user.seclevel, 10),
      uploads: safeNumber(user.uploads, 0),
      downloads: safeNumber(user.downloads, 0),
      bytesUpload: safeNumber(user.bytesupload, 0),
      bytesDownload: safeNumber(user.bytesdownload, 0),
      ratio: safeNumber(user.ratio, 0),
      ratioType: safeNumber(user.ratiotype, 0),
      timeTotal: safeNumber(user.timetotal, 0),
      timeLimit: safeNumber(user.timelimit, 0),
      timeUsed: safeNumber(user.timeused, 0),
      chatLimit: safeNumber(user.chatlimit, 0),
      chatUsed: safeNumber(user.chatused, 0),
      lastLogin: user.lastlogin ? new Date(user.lastlogin * 1000) : undefined,
      firstLogin: new Date(user.firstlogin * 1000),
      calls: safeNumber(user.calls, 0),
      callsToday: safeNumber(user.callstoday, 0),
      newUser: Boolean(user.newuser),
      expert: Boolean(user.expert),
      ansi: Boolean(user.ansi),
      linesPerScreen: safeNumber(user.linesperscreen, 23),
      computer: user.computer,
      screenType: user.screentype,
      protocol: user.protocol,
      editor: user.editor,
      zoomType: user.zoomtype,
      availableForChat: Boolean(user.availableforchat),
      quietNode: Boolean(user.quietnode),
      autoRejoin: safeNumber(user.autorejoin, 1),
      confAccess: user.confaccess,
      areaName: user.areaname,
      uuCP: Boolean(user.uucp),
      topUploadCPS: safeNumber(user.topuploadcps, 0),
      topDownloadCPS: safeNumber(user.topdownloadcps, 0),
      byteLimit: safeNumber(user.bytelimit, 0),
      userFlags: safeNumber(user.userflags, 0),
      created: new Date(user.created * 1000),
      updated: new Date(user.updated * 1000),
    } as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${fieldToColumn(f)} = ?`).join(', ');
    const values = fields.map(f => {
      const value = updates[f as keyof User];
      if (value instanceof Date) return Math.floor(value.getTime() / 1000);
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE users SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);
  }

  async getUsers(filter?: { secLevel?: number; newUser?: boolean; limit?: number }): Promise<User[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    if (filter?.secLevel !== undefined) {
      sql += ' AND seclevel >= ?';
      params.push(filter.secLevel);
    }

    if (filter?.newUser !== undefined) {
      sql += ' AND newuser = ?';
      params.push(filter.newUser ? 1 : 0);
    }

    sql += ' ORDER BY username';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(sql);
    const users = stmt.all(...params) as any[];
    return users.map(u => this.mapUserFromDb(u));
  }

  // Conference and message base management
  async createConference(conf: Omit<Conference, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT INTO conferences (name, description) VALUES (?, ?)');
    const result = stmt.run(conf.name, conf.description);
    return result.lastInsertRowid as number;
  }

  async getConferences(): Promise<Conference[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM conferences ORDER BY id');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getConferenceById(id: number): Promise<Conference | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM conferences WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async createMessageBase(mb: Omit<MessageBase, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT INTO message_bases (name, conferenceid) VALUES (?, ?)');
    const result = stmt.run(mb.name, mb.conferenceId);
    return result.lastInsertRowid as number;
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM message_bases WHERE conferenceid = ? ORDER BY id');
    const rows = stmt.all(conferenceId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      conferenceId: row.conferenceid,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getMessageBaseById(id: number): Promise<MessageBase | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM message_bases WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      conferenceId: row.conferenceid,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  // Message management methods
  async createMessage(message: Omit<Message, 'id'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        subject, body, author, timestamp, conferenceid, messagebaseid,
        isprivate, touser, parentid, attachments, edited, editedby, editedat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.subject, message.body, message.author,
      Math.floor(message.timestamp.getTime() / 1000),
      message.conferenceId, message.messageBaseId,
      message.isPrivate ? 1 : 0, message.toUser, message.parentId,
      JSON.stringify(message.attachments || []),
      message.edited ? 1 : 0, message.editedBy,
      message.editedAt ? Math.floor(message.editedAt.getTime() / 1000) : null
    );

    return result.lastInsertRowid as number;
  }

  async getMessages(conferenceId: number, messageBaseId: number, options?: {
    limit?: number;
    offset?: number;
    privateOnly?: boolean;
    userId?: string;
    search?: string;
  }): Promise<Message[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = `
      SELECT m.*, mb.name as messageBaseName, c.name as conferenceName
      FROM messages m
      JOIN message_bases mb ON m.messagebaseid = mb.id
      JOIN conferences c ON m.conferenceid = c.id
      WHERE m.conferenceid = ? AND m.messagebaseid = ?
    `;
    const params: any[] = [conferenceId, messageBaseId];

    if (options?.privateOnly && options?.userId) {
      sql += ' AND (m.isprivate = 0 OR (m.isprivate = 1 AND (m.author = ? OR m.touser = ?)))';
      params.push(options.userId, options.userId);
    }

    if (options?.search) {
      sql += ' AND (m.subject LIKE ? OR m.body LIKE ? OR m.author LIKE ?)';
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY m.timestamp DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      author: row.author,
      timestamp: new Date(row.timestamp * 1000),
      conferenceId: row.conferenceid,
      messageBaseId: row.messagebaseid,
      isPrivate: Boolean(row.isprivate),
      toUser: row.touser,
      parentId: row.parentid,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      edited: Boolean(row.edited),
      editedBy: row.editedby,
      editedAt: row.editedat ? new Date(row.editedat * 1000) : undefined
    }));
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'attachments') return JSON.stringify(updates.attachments || []);
      if (f === 'timestamp' || f === 'editedAt') {
        const date = updates[f as keyof Message] as Date;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      const value = updates[f as keyof Message];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE messages SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);
  }

  async deleteMessage(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
    stmt.run(id);
  }

  async updateReadPointer(userId: number, conferenceId: number, messageBaseId: number, lastRead: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conf_base (user_id, conference_id, message_base_id, last_msg_read_conf)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(userId.toString(), conferenceId, messageBaseId, lastRead);
  }

  // File management methods
  async createFileEntry(file: Omit<FileEntry, 'id'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO file_entries (
        filename, description, size, uploader, uploaddate, downloads,
        areaid, fileiddiz, rating, votes, status, checked, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      file.filename, file.description, file.size, file.uploader,
      Math.floor(file.uploadDate.getTime() / 1000),
      file.downloads, file.areaId, file.fileIdDiz, file.rating, file.votes,
      file.status, file.checked, file.comment
    );

    return result.lastInsertRowid as number;
  }

  async getFileEntries(areaId: number, options?: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
  }): Promise<FileEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM file_entries WHERE areaid = ?';
    const params: any[] = [areaId];

    if (options?.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.search) {
      sql += ' AND (filename LIKE ? OR description LIKE ? OR fileiddiz LIKE ?)';
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY uploaddate DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      filename: row.filename,
      description: row.description,
      size: row.size,
      uploader: row.uploader,
      uploadDate: new Date(row.uploaddate * 1000),
      downloads: row.downloads,
      areaId: row.areaid,
      fileIdDiz: row.fileiddiz,
      rating: row.rating,
      votes: row.votes,
      status: row.status as 'active' | 'held' | 'deleted',
      checked: row.checked as 'N' | 'P' | 'F',
      comment: row.comment
    }));
  }

  async updateFileEntry(id: number, updates: Partial<FileEntry>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'uploadDate') {
        const date = updates.uploadDate;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      return updates[f as keyof FileEntry];
    });

    const sql = `UPDATE file_entries SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);
  }

  async getFileEntry(id: number): Promise<FileEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT fe.*, fa.conferenceid as conferenceId
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fe.id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      filename: row.filename,
      description: row.description,
      size: row.size,
      uploader: row.uploader,
      uploadDate: new Date(row.uploaddate * 1000),
      downloads: row.downloads,
      areaId: row.areaid,
      fileIdDiz: row.fileiddiz,
      rating: row.rating,
      votes: row.votes,
      status: row.status as 'active' | 'held' | 'deleted',
      checked: row.checked as 'N' | 'P' | 'F',
      comment: row.comment
    };
  }

  async incrementDownloadCount(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE file_entries SET downloads = downloads + 1 WHERE id = ?');
    stmt.run(id);
  }

  // File area management
  async createFileArea(area: Omit<FileArea, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO file_areas (
        name, description, path, conferenceid, maxfiles, uploadaccess, downloadaccess
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      area.name, area.description, area.path, area.conferenceId,
      area.maxFiles, area.uploadAccess, area.downloadAccess
    );

    return result.lastInsertRowid as number;
  }

  async getFileAreas(conferenceId: number): Promise<FileArea[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM file_areas WHERE conferenceid = ? ORDER BY id');
    const rows = stmt.all(conferenceId) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      path: row.path,
      conferenceId: row.conferenceid,
      maxFiles: row.maxfiles,
      uploadAccess: row.uploadaccess,
      downloadAccess: row.downloadaccess,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getFilesByArea(areaId: number): Promise<FileEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM file_entries WHERE areaid = ? ORDER BY uploaddate DESC');
    const rows = stmt.all(areaId) as any[];

    return rows.map(row => ({
      id: row.id,
      filename: row.filename,
      description: row.description,
      size: row.size,
      uploader: row.uploader,
      uploadDate: new Date(row.uploaddate * 1000),
      downloads: row.downloads,
      areaId: row.areaid,
      fileIdDiz: row.fileiddiz,
      rating: row.rating,
      votes: row.votes,
      status: row.status as 'active' | 'held' | 'deleted',
      checked: row.checked as 'N' | 'P' | 'F',
      comment: row.comment
    }));
  }

  async getFileStatisticsByConference(conferenceId: number): Promise<{
    totalFiles: number;
    totalBytes: number;
    totalUploads: number;
    totalDownloads: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalfiles,
        COALESCE(SUM(fe.size), 0) as totalbytes,
        COALESCE(SUM(fe.downloads), 0) as totaldownloads
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = ?
    `);

    const row = stmt.get(conferenceId) as any;
    return {
      totalFiles: parseInt(row.totalfiles) || 0,
      totalBytes: parseInt(row.totalbytes) || 0,
      totalUploads: 0,
      totalDownloads: parseInt(row.totaldownloads) || 0
    };
  }

  // Session management methods
  async createSession(session: Omit<Session, 'created' | 'updated'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, userid, socketid, state, substate, currentconf, currentmsgbase,
        timeremaining, lastactivity, confrjoin, msgbaserjoin, commandbuffer,
        menupause, inputbuffer, relconfnum, currentconfname, cmdshortcuts, tempdata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.userId, session.socketId, session.state, session.subState,
      session.currentConf, session.currentMsgBase, session.timeRemaining,
      Math.floor(session.lastActivity.getTime() / 1000),
      session.confRJoin, session.msgBaseRJoin, session.commandBuffer,
      session.menuPause ? 1 : 0, session.inputBuffer, session.relConfNum,
      session.currentConfName, session.cmdShortcuts ? 1 : 0,
      session.tempData ? JSON.stringify(session.tempData) : null
    );
  }

  async getSession(id: string): Promise<Session | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      confRJoin: row.confrjoin,
      msgBaseRJoin: row.msgbaserjoin,
      commandBuffer: row.commandbuffer,
      menuPause: Boolean(row.menupause),
      inputBuffer: row.inputbuffer,
      relConfNum: row.relconfnum,
      currentConfName: row.currentconfname,
      cmdShortcuts: Boolean(row.cmdshortcuts),
      tempData: row.tempdata ? JSON.parse(row.tempdata) : undefined,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'tempdata') return updates.tempData ? JSON.stringify(updates.tempData) : null;
      if (f === 'lastactivity') {
        const date = updates.lastActivity;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      const value = updates[f as keyof Session];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE sessions SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  async getActiveSessions(): Promise<Session[]> {
    if (!this.db) throw new Error('Database not initialized');

    const thirtyMinutesAgo = Math.floor(Date.now() / 1000) - 1800;
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE lastactivity > ?');
    const rows = stmt.all(thirtyMinutesAgo) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      confRJoin: row.confrjoin,
      msgBaseRJoin: row.msgbaserjoin,
      commandBuffer: row.commandbuffer,
      menuPause: Boolean(row.menupause),
      inputBuffer: row.inputbuffer,
      relConfNum: row.relconfnum,
      currentConfName: row.currentconfname,
      cmdShortcuts: Boolean(row.cmdshortcuts),
      tempData: row.tempdata ? JSON.parse(row.tempdata) : undefined,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  // Node session management methods
  async createNodeSession(session: Omit<NodeSession, 'created' | 'updated'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO node_sessions (
        id, nodeid, userid, socketid, state, substate, currentconf, currentmsgbase,
        timeremaining, lastactivity, status, loadlevel, currentuser
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.nodeId, session.userId, session.socketId, session.state,
      session.subState, session.currentConf, session.currentMsgBase, session.timeRemaining,
      Math.floor(session.lastActivity.getTime() / 1000),
      session.status, session.loadLevel, session.currentUser
    );
  }

  async updateNodeSession(id: string, updates: Partial<NodeSession>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'lastActivity') {
        const date = updates.lastActivity;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      return updates[f as keyof NodeSession];
    });

    const sql = `UPDATE node_sessions SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);
  }

  async getNodeSessions(nodeId?: number): Promise<NodeSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM node_sessions';
    const params: any[] = [];

    if (nodeId !== undefined) {
      sql += ' WHERE nodeid = ?';
      params.push(nodeId);
    }

    sql += ' ORDER BY lastactivity DESC';
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      nodeId: row.nodeid,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      status: row.status,
      loadLevel: row.loadlevel,
      currentUser: row.currentuser,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  // OLM (Online Message) methods
  async sendOnlineMessage(fromUserId: string, fromUsername: string, toUserId: string, toUsername: string, message: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO online_messages (from_user_id, from_username, to_user_id, to_username, message)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(fromUserId, fromUsername, toUserId, toUsername, message);
    return result.lastInsertRowid as number;
  }

  async getUnreadMessages(userId: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, from_user_id, from_username, message, created_at
      FROM online_messages
      WHERE to_user_id = ? AND delivered = 0
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at * 1000)
    }));
  }

  async getAllMessages(userId: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, from_user_id, from_username, message, created_at, delivered, read, delivered_at, read_at
      FROM online_messages
      WHERE to_user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at * 1000),
      delivered: Boolean(row.delivered),
      read: Boolean(row.read),
      delivered_at: row.delivered_at ? new Date(row.delivered_at * 1000) : null,
      read_at: row.read_at ? new Date(row.read_at * 1000) : null
    }));
  }

  async markMessageDelivered(messageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE online_messages
      SET delivered = 1, delivered_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(messageId);
  }

  async markMessageRead(messageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE online_messages
      SET read = 1, read_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(messageId);
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM online_messages
      WHERE to_user_id = ? AND delivered = 0
    `);
    const row = stmt.get(userId) as any;
    return parseInt(row.count);
  }

  async deleteOLMMessage(messageId: number, userId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM online_messages
      WHERE id = ? AND to_user_id = ?
    `);
    const result = stmt.run(messageId, userId);
    return result.changes > 0;
  }

  async getUserByUsernameForOLMv2(username: string): Promise<{ id: string; username: string; availableForChat: boolean } | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT id, username, availableforchat FROM users WHERE LOWER(username) = LOWER(?)');
    const row = stmt.get(username) as any;
    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      availableForChat: Boolean(row.availableforchat)
    };
  }

  async getUserByUsernameForOLM(username: string): Promise<{ id: string; username: string; availableForChat: boolean } | null> {
    return this.getUserByUsernameForOLMv2(username);
  }

  // Internode Chat Methods
  async createChatSession(
    initiatorId: string,
    initiatorUsername: string,
    initiatorSocket: string,
    recipientId: string,
    recipientUsername: string,
    recipientSocket: string
  ): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const sessionId = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (
        session_id, initiator_id, initiator_username, initiator_socket,
        recipient_id, recipient_username, recipient_socket, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'requesting')
    `);
    stmt.run(sessionId, initiatorId, initiatorUsername, initiatorSocket, recipientId, recipientUsername, recipientSocket);
    return sessionId;
  }

  async getChatSession(sessionId: string): Promise<InternodeChatSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return {
      sessionId: row.session_id,
      initiatorId: row.initiator_id,
      initiatorUsername: row.initiator_username,
      initiatorSocket: row.initiator_socket,
      recipientId: row.recipient_id,
      recipientUsername: row.recipient_username,
      recipientSocket: row.recipient_socket,
      status: row.status,
      startedAt: new Date(row.started_at * 1000),
      createdAt: new Date(row.created_at * 1000),
      endedAt: row.ended_at ? new Date(row.ended_at * 1000) : undefined
    };
  }

  async getChatSessionBySocketId(socketId: string): Promise<InternodeChatSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM chat_sessions
      WHERE (initiator_socket = ? OR recipient_socket = ?)
      AND status = 'active'
    `);
    const row = stmt.get(socketId, socketId) as any;
    if (!row) return null;

    return {
      sessionId: row.session_id,
      initiatorId: row.initiator_id,
      initiatorUsername: row.initiator_username,
      initiatorSocket: row.initiator_socket,
      recipientId: row.recipient_id,
      recipientUsername: row.recipient_username,
      recipientSocket: row.recipient_socket,
      status: row.status,
      startedAt: new Date(row.started_at * 1000),
      createdAt: new Date(row.created_at * 1000),
      endedAt: row.ended_at ? new Date(row.ended_at * 1000) : undefined
    };
  }

  async getPendingChatInvitationForUser(userId: string): Promise<{ sessionId: string } | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT session_id
      FROM chat_sessions
      WHERE recipient_id = ?
      AND status = 'requesting'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(userId) as any;
    return row ? { sessionId: row.session_id } : null;
  }

  async updateChatSessionStatus(
    sessionId: string,
    status: 'requesting' | 'active' | 'ended' | 'declined'
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE chat_sessions
      SET status = ?, updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    stmt.run(status, sessionId);
  }

  async endChatSession(sessionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE chat_sessions
      SET status = 'ended', ended_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    stmt.run(sessionId);
  }

  async getActiveChatSessions(): Promise<InternodeChatSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE status = \'active\' ORDER BY started_at DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      sessionId: row.session_id,
      initiatorId: row.initiator_id,
      initiatorUsername: row.initiator_username,
      initiatorSocket: row.initiator_socket,
      recipientId: row.recipient_id,
      recipientUsername: row.recipient_username,
      recipientSocket: row.recipient_socket,
      status: row.status,
      startedAt: new Date(row.started_at * 1000),
      createdAt: new Date(row.created_at * 1000),
      endedAt: row.ended_at ? new Date(row.ended_at * 1000) : undefined
    }));
  }

  async saveChatMessage(
    sessionId: string,
    senderId: string,
    senderUsername: string,
    message: string
  ): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (session_id, sender_id, sender_username, message)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(sessionId, senderId, senderUsername, message);

    const updateStmt = this.db.prepare(`
      UPDATE chat_sessions
      SET message_count = message_count + 1, updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    updateStmt.run(sessionId);

    return result.lastInsertRowid as number;
  }

  async getChatHistory(sessionId: string, limit: number = 50): Promise<InternodeChatMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(sessionId, limit) as any[];

    return rows.reverse().map(row => ({
      id: row.id,
      sessionId: row.session_id,
      senderId: row.sender_id,
      senderUsername: row.sender_username,
      message: row.message,
      sentAt: new Date(row.created_at * 1000)
    }));
  }

  async getChatMessageCount(sessionId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    return parseInt(row.count);
  }

  async getAvailableUsersForChat(): Promise<Array<{
    id: string;
    username: string;
    realname: string;
    secLevel: number;
    currentAction?: string;
  }>> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, username, realname, seclevel
      FROM users
      WHERE availableforchat = 1
      ORDER BY username
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      username: row.username,
      realname: row.realname,
      secLevel: row.seclevel
    }));
  }

  // Logging methods
  async logSystemEvent(level: 'info' | 'warning' | 'error', message: string, context?: {
    userId?: string;
    conferenceId?: number;
    node?: number;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Since we don't have a system_logs table in the simplified version,
    // we'll just console.log for now
    console.log(`[${level.toUpperCase()}] ${message}`, context);
  }

  // Utility methods
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const isSHA256 = hash.length === 64 && /^[0-9a-f]{64}$/i.test(hash);

    if (isSHA256) {
      const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
      return sha256Hash === hash;
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.warn('Password verification error:', error);
      return false;
    }
  }

  // JWT Token Methods
  async generateAccessToken(user: User): Promise<string> {
    const secret = process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';
    const payload = {
      userId: user.id,
      username: user.username,
      secLevel: user.secLevel
    };

    return jwt.sign(payload, secret, { expiresIn: '1h' });
  }

  async generateRefreshToken(user: User): Promise<string> {
    const secret = process.env.JWT_REFRESH_SECRET || 'amiexpress-refresh-secret-change-in-production';
    const payload = {
      userId: user.id,
      username: user.username
    };

    return jwt.sign(payload, secret, { expiresIn: '7d' });
  }

  async verifyAccessToken(token: string): Promise<{ userId: string; username: string; secLevel: number }> {
    const secret = process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';

    try {
      const decoded = jwt.verify(token, secret) as any;
      return {
        userId: decoded.userId,
        username: decoded.username,
        secLevel: decoded.secLevel
      };
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string; username: string }> {
    const secret = process.env.JWT_REFRESH_SECRET || 'amiexpress-refresh-secret-change-in-production';

    try {
      const decoded = jwt.verify(token, secret) as any;
      return {
        userId: decoded.userId,
        username: decoded.username
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    const user = stmt.get(username) as any;

    if (!user) return null;

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);

    if (!passwordMatch) return null;

    return this.mapUserFromDb(user);
  }

  async close(): Promise<void> {
    if (this.db) {
      console.log('🔌 Closing database connection...');
      this.db.close();
      this.isConnected = false;
      console.log('✅ Database connection closed');
    }
  }

  // Initialize default data
  async initializeDefaultData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      console.log('[DB Init] Creating default data...');

      // Check if conferences already exist
      const confStmt = this.db.prepare('SELECT COUNT(*) as count FROM conferences');
      const confCount = (confStmt.get() as any).count;

      if (confCount > 0) {
        console.log('[DB Init] Default data already exists, skipping initialization');
        return;
      }

      // Create conferences
      const confIds: { [key: string]: number } = {};
      const conferences = [
        { name: 'General', description: 'General discussion' },
        { name: 'Tech Support', description: 'Technical support' },
        { name: 'Announcements', description: 'System announcements' }
      ];

      for (const conf of conferences) {
        const id = await this.createConference(conf);
        confIds[conf.name] = id;
        console.log(`  ✓ Created conference: ${conf.name} (ID: ${id})`);
      }

      // Create message bases
      const messageBases = [
        { name: 'Main', conferenceName: 'General' },
        { name: 'Off Topic', conferenceName: 'General' },
        { name: 'Support', conferenceName: 'Tech Support' },
        { name: 'News', conferenceName: 'Announcements' }
      ];

      for (const mb of messageBases) {
        const id = await this.createMessageBase({
          name: mb.name,
          conferenceId: confIds[mb.conferenceName]
        });
        console.log(`  ✓ Created message base: ${mb.name} in ${mb.conferenceName}`);
      }

      // Create file areas
      const fileAreas = [
        { name: 'General Files', description: 'General purpose file area', path: '/files/general', conferenceName: 'General', maxFiles: 100, uploadAccess: 10, downloadAccess: 1 },
        { name: 'Utilities', description: 'System utilities and tools', path: '/files/utils', conferenceName: 'General', maxFiles: 50, uploadAccess: 50, downloadAccess: 1 },
        { name: 'Games', description: 'BBS games and entertainment', path: '/files/games', conferenceName: 'Tech Support', maxFiles: 75, uploadAccess: 25, downloadAccess: 1 },
        { name: 'Tech Files', description: 'Technical documentation and tools', path: '/files/tech', conferenceName: 'Tech Support', maxFiles: 60, uploadAccess: 20, downloadAccess: 1 },
        { name: 'System News', description: 'System announcements and updates', path: '/files/news', conferenceName: 'Announcements', maxFiles: 30, uploadAccess: 100, downloadAccess: 1 }
      ];

      for (const area of fileAreas) {
        await this.createFileArea({
          name: area.name,
          description: area.description,
          path: area.path,
          conferenceId: confIds[area.conferenceName],
          maxFiles: area.maxFiles,
          uploadAccess: area.uploadAccess,
          downloadAccess: area.downloadAccess
        });
        console.log(`  ✓ Created file area: ${area.name}`);
      }

      // Create sysop user
      const hashedPassword = await this.hashPassword('sysop');
      await this.createUser({
        username: 'sysop',
        passwordHash: hashedPassword,
        realname: 'System Operator',
        location: 'Server Room',
        phone: '',
        email: '',
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
        expert: false,
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
        byteLimit: 0,
        userFlags: 0
      });
      console.log('  ✓ Created sysop user');

      console.log('✓ Database initialization completed successfully');
    } catch (error) {
      console.error('✗ Database initialization failed:', error);
    }
  }

  // Bulletin management
  async createBulletin(bulletin: { conferenceId: number; filename: string; title: string }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO bulletins (conferenceid, filename, title)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(bulletin.conferenceId, bulletin.filename, bulletin.title);
    return result.lastInsertRowid as number;
  }

  async getBulletins(conferenceId?: number): Promise<Bulletin[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql: string;
    let params: any[];

    if (conferenceId !== undefined) {
      sql = 'SELECT * FROM bulletins WHERE conferenceid = ? ORDER BY created DESC';
      params = [conferenceId];
    } else {
      sql = 'SELECT * FROM bulletins ORDER BY created DESC';
      params = [];
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      conferenceId: row.conferenceid,
      filename: row.filename,
      title: row.title,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getBulletinById(id: number): Promise<Bulletin | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM bulletins WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      conferenceId: row.conferenceid,
      filename: row.filename,
      title: row.title,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async deleteBulletin(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM bulletins WHERE id = ?');
    stmt.run(id);
  }

  // Chat room methods (stubs - implement as needed)
  async createChatRoom(room: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO chat_rooms (
        room_id, room_name, topic, created_by, created_by_username,
        is_public, max_users, is_persistent, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      room.roomId, room.roomName, room.topic || null, room.createdBy, room.createdByUsername,
      room.isPublic !== false ? 1 : 0, room.maxUsers || 50, room.isPersistent !== false ? 1 : 0, room.password || null
    );
  }

  async getChatRoom(roomId: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_rooms WHERE room_id = ?');
    return stmt.get(roomId);
  }

  async getChatRoomByName(roomName: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_rooms WHERE room_name = ?');
    return stmt.get(roomName);
  }

  async listChatRooms(onlyPublic: boolean = true): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = onlyPublic
      ? `SELECT r.*, (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
         FROM chat_rooms r WHERE is_public = 1 ORDER BY created_at DESC`
      : `SELECT r.*, (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
         FROM chat_rooms r ORDER BY created_at DESC`;
    const stmt = this.db.prepare(sql);
    return stmt.all();
  }

  async deleteChatRoom(roomId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_rooms WHERE room_id = ?');
    stmt.run(roomId);
  }

  async joinChatRoom(roomId: string, userId: string, username: string, socketId: string, isModerator: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(roomId, userId, username, socketId, isModerator ? 1 : 0);
  }

  async leaveChatRoom(roomId: string, userId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    stmt.run(roomId, userId);
  }

  async getRoomMembers(roomId: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_room_members WHERE room_id = ? ORDER BY joined_at ASC');
    return stmt.all(roomId);
  }

  async getRoomMemberCount(roomId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = ?');
    const row = stmt.get(roomId) as any;
    return parseInt(row.count);
  }

  async saveChatRoomMessage(message: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(message.roomId, message.senderId, message.senderUsername, message.message, message.messageType || 'message');
  }

  async getChatRoomHistory(roomId: string, limit: number = 50): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM chat_room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(roomId, limit);
    return (rows as any[]).reverse();
  }

  async updateRoomMember(roomId: string, userId: string, updates: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const values: any[] = [];

    if (updates.isMuted !== undefined) {
      sets.push('is_muted = ?');
      values.push(updates.isMuted ? 1 : 0);
    }
    if (updates.isModerator !== undefined) {
      sets.push('is_moderator = ?');
      values.push(updates.isModerator ? 1 : 0);
    }

    if (sets.length === 0) return;

    values.push(roomId, userId);
    const sql = `UPDATE chat_room_members SET ${sets.join(', ')} WHERE room_id = ? AND user_id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  async getUserRooms(userId: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT r.*, m.is_moderator, m.is_muted, m.joined_at
      FROM chat_rooms r
      INNER JOIN chat_room_members m ON r.room_id = m.room_id
      WHERE m.user_id = ?
      ORDER BY m.joined_at DESC
    `);
    return stmt.all(userId);
  }

  async isUserInRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    return stmt.get(roomId, userId) !== undefined;
  }

  async isUserModerator(roomId: string, userId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT is_moderator FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    const row = stmt.get(roomId, userId) as any;
    return row ? Boolean(row.is_moderator) : false;
  }

  async isUserMuted(roomId: string, userId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT is_muted FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    const row = stmt.get(roomId, userId) as any;
    return row ? Boolean(row.is_muted) : false;
  }

  async updateChatRoom(roomId: string, updates: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.topic !== undefined) {
      fields.push('topic = ?');
      values.push(updates.topic);
    }
    if (updates.isPublic !== undefined) {
      fields.push('is_public = ?');
      values.push(updates.isPublic ? 1 : 0);
    }
    if (updates.maxUsers !== undefined) {
      fields.push('max_users = ?');
      values.push(updates.maxUsers);
    }
    if (updates.password !== undefined) {
      fields.push('password = ?');
      values.push(updates.password);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(roomId);

    const sql = `UPDATE chat_rooms SET ${fields.join(', ')} WHERE room_id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  // Webhook methods
  async getWebhooks(): Promise<Webhook[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM webhooks ORDER BY id ASC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type,
      enabled: Boolean(row.enabled),
      triggers: JSON.parse(row.triggers || '[]'),
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getWebhook(id: number): Promise<Webhook | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM webhooks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type,
      enabled: Boolean(row.enabled),
      triggers: JSON.parse(row.triggers || '[]'),
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async createWebhook(data: { name: string; url: string; type: 'discord' | 'slack'; triggers: string[] }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO webhooks (name, url, type, enabled, triggers)
      VALUES (?, ?, ?, 1, ?)
    `);
    const result = stmt.run(data.name, data.url, data.type, JSON.stringify(data.triggers));
    return result.lastInsertRowid as number;
  }

  async updateWebhook(id: number, data: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.url !== undefined) {
      fields.push('url = ?');
      values.push(data.url);
    }
    if (data.type !== undefined) {
      fields.push('type = ?');
      values.push(data.type);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }
    if (data.triggers !== undefined) {
      fields.push('triggers = ?');
      values.push(JSON.stringify(data.triggers));
    }

    if (fields.length === 0) return;

    fields.push('updated = strftime(\'%s\', \'now\')');
    values.push(id);

    const sql = `UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  async deleteWebhook(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM webhooks WHERE id = ?');
    stmt.run(id);
  }

  async getWebhooksByTrigger(trigger: string): Promise<Webhook[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM webhooks WHERE enabled = 1 ORDER BY id ASC');
    const rows = stmt.all() as any[];

    return rows
      .filter(row => {
        const triggers = JSON.parse(row.triggers || '[]');
        return triggers.includes(trigger);
      })
      .map(row => ({
        id: row.id,
        name: row.name,
        url: row.url,
        type: row.type,
        enabled: Boolean(row.enabled),
        triggers: JSON.parse(row.triggers || '[]'),
        created: new Date(row.created * 1000),
        updated: new Date(row.updated * 1000)
      }));
  }

  // Stub methods for compatibility - implement as needed
  async getAREXXScripts(): Promise<AREXXScript[]> { return []; }
  async executeAREXXScript(scriptId: string, context: AREXXContext): Promise<any> { return { success: true }; }
  async createQWKPacket(packet: Omit<QWKPacket, 'id'>): Promise<string> { return crypto.randomUUID(); }
  async createQWKMessage(message: Omit<QWKMessage, 'id'>): Promise<number> { return 0; }
  async updateQWKPacket(id: string, updates: Partial<QWKPacket>): Promise<void> {}
  async getQWKPacket(id: string): Promise<QWKPacket | null> { return null; }
  async deleteQWKPacket(id: string): Promise<void> {}
  async createFTNMessage(message: Omit<FTNMessage, 'id'>): Promise<number> { return 0; }
  async getFTNMessages(conferenceId: number, messageBaseId: number): Promise<FTNMessage[]> { return []; }
  async updateFTNMessage(id: number, updates: Partial<FTNMessage>): Promise<void> {}
  async createTransferSession(session: Omit<TransferSession, 'id'>): Promise<string> { return crypto.randomUUID(); }
  async updateTransferSession(id: string, updates: Partial<TransferSession>): Promise<void> {}
}

// Export singleton instance
export const db = new Database();
