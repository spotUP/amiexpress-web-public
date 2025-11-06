// Load environment variables FIRST
require('dotenv').config({ override: true });

import BetterSqlite3 from 'better-sqlite3';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs';
import { userFileManager } from './services/UserFileManager';
import { messageFileManager } from './services/MessageFileManager';
import { conferenceFileManager } from './services/ConferenceFileManager';
import { fileAreaManager } from './services/FileAreaManager';
import { messageIndexManager } from './services/MessageIndexManager';
import { userDatabaseManager } from './services/UserDatabaseManager';

// Import types
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

// Import repository modules
import { UserRepository } from './database/user-repository';
import { ConferenceRepository } from './database/conference-repository';
import { MessageRepository } from './database/message-repository';
import { FileRepository } from './database/file-repository';
import { SessionRepository } from './database/session-repository';
import { ChatRepository } from './database/chat-repository';
import { BulletinRepository } from './database/bulletin-repository';
import { WebhookRepository } from './database/webhook-repository';

// Re-export types for backward compatibility
export type {
  User,
  Message,
  FileArea,
  FileEntry,
  Conference,
  MessageBase,
  Webhook,
  Session,
  Bulletin,
  SystemLog
} from './database/types';

export class Database {
  private db?: any;
  private isConnected: boolean = false;
  private dbPath: string;

  // Repository instances
  private userRepo?: UserRepository;
  private conferenceRepo?: ConferenceRepository;
  private messageRepo?: MessageRepository;
  private fileRepo?: FileRepository;
  private sessionRepo?: SessionRepository;
  private chatRepo?: ChatRepository;
  private bulletinRepo?: BulletinRepository;
  private webhookRepo?: WebhookRepository;

  constructor() {
    // SQLite database path
    const dbDir = process.env.DATABASE_DIR || path.join(process.cwd(), 'data');
    const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
    this.dbPath = path.join(dbDir, dbFile);

    console.log('Initializing SQLite database connection...');
    console.log(`Database directory: ${dbDir}`);
    console.log(`Database file: ${dbFile}`);
    console.log(`Full path: ${this.dbPath}`);

    try {
      // Ensure database directory exists
      if (!fs.existsSync(dbDir)) {
        console.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✓ Directory created`);
      } else {
        console.log(`✓ Directory exists: ${dbDir}`);
      }

      console.log('Opening SQLite database...');
      this.db = new BetterSqlite3(this.dbPath);
      console.log('✓ Database opened');

      console.log('Setting WAL mode...');
      this.db.pragma('journal_mode = WAL');
      console.log('✓ WAL mode set');

      console.log('Enabling foreign keys...');
      this.db.pragma('foreign_keys = ON');
      console.log('✓ Foreign keys enabled');

      this.isConnected = true;

      // Initialize repositories
      this.userRepo = new UserRepository(this.db);
      this.conferenceRepo = new ConferenceRepository(this.db);
      this.messageRepo = new MessageRepository(this.db);
      this.fileRepo = new FileRepository(this.db);
      this.sessionRepo = new SessionRepository(this.db);
      this.chatRepo = new ChatRepository(this.db);
      this.bulletinRepo = new BulletinRepository(this.db);
      this.webhookRepo = new WebhookRepository(this.db);

      console.log('✅ Connected to SQLite database');
    } catch (error) {
      console.error('❌ Failed to connect to SQLite database:');
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack.substring(0, 500));
      }
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

  public async run(sql: string, params: any[] = []): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(sql);
      stmt.run(...params);
    } catch (error) {
      console.error('Database run error:', error);
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

      // CRITICAL: Initialize disk files for Amiga door compatibility
      console.log('Initializing user disk files...');
      userFileManager.initializeUserFiles();
      console.log('User disk files initialized');

      console.log('Initializing message directories...');
      messageFileManager.initializeMessageDirs();
      console.log('Message directories initialized');

      console.log('Initializing conference database...');
      conferenceFileManager.initializeConfDB();
      console.log('Conference database initialized');

      console.log('Initializing file area directories...');
      fileAreaManager.initializeFileAreaDirs();
      console.log('File area directories initialized');

      console.log('Initializing message index files (HeaderFile, MailStats, MailLock)...');
      // Initialize for conferences 1-10
      for (let i = 1; i <= 10; i++) {
        messageIndexManager.initializeMessageIndex(i);
      }
      console.log('Message index files initialized');

      console.log('Initializing user database files (user.data, user.keys, user.misc)...');
      userDatabaseManager.initializeUserDatabase();
      console.log('User database files initialized');
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

  // User management methods - delegate to UserRepository
  async createUser(...args: Parameters<UserRepository['createUser']>) {
    return this.userRepo!.createUser(...args);
  }

  async getUserByUsername(...args: Parameters<UserRepository['getUserByUsername']>) {
    return this.userRepo!.getUserByUsername(...args);
  }

  async getUserById(...args: Parameters<UserRepository['getUserById']>) {
    return this.userRepo!.getUserById(...args);
  }

  async updateUser(...args: Parameters<UserRepository['updateUser']>) {
    return this.userRepo!.updateUser(...args);
  }

  async getUsers(...args: Parameters<UserRepository['getUsers']>) {
    return this.userRepo!.getUsers(...args);
  }

  // Conference management methods - delegate to ConferenceRepository
  async createConference(...args: Parameters<ConferenceRepository['createConference']>) {
    return this.conferenceRepo!.createConference(...args);
  }

  async getConferences(...args: Parameters<ConferenceRepository['getConferences']>) {
    return this.conferenceRepo!.getConferences(...args);
  }

  async getConferenceById(...args: Parameters<ConferenceRepository['getConferenceById']>) {
    return this.conferenceRepo!.getConferenceById(...args);
  }

  async updateConference(...args: Parameters<ConferenceRepository['updateConference']>) {
    return this.conferenceRepo!.updateConference(...args);
  }

  async createMessageBase(...args: Parameters<ConferenceRepository['createMessageBase']>) {
    return this.conferenceRepo!.createMessageBase(...args);
  }

  async getMessageBases(...args: Parameters<ConferenceRepository['getMessageBases']>) {
    return this.conferenceRepo!.getMessageBases(...args);
  }

  async getMessageBaseById(...args: Parameters<ConferenceRepository['getMessageBaseById']>) {
    return this.conferenceRepo!.getMessageBaseById(...args);
  }

  // Message management methods - delegate to MessageRepository
  async createMessage(...args: Parameters<MessageRepository['createMessage']>) {
    return this.messageRepo!.createMessage(...args);
  }

  async getMessages(...args: Parameters<MessageRepository['getMessages']>) {
    return this.messageRepo!.getMessages(...args);
  }

  async updateMessage(...args: Parameters<MessageRepository['updateMessage']>) {
    return this.messageRepo!.updateMessage(...args);
  }

  async deleteMessage(...args: Parameters<MessageRepository['deleteMessage']>) {
    return this.messageRepo!.deleteMessage(...args);
  }

  async updateReadPointer(...args: Parameters<MessageRepository['updateReadPointer']>) {
    return this.messageRepo!.updateReadPointer(...args);
  }

  async sendOnlineMessage(...args: Parameters<MessageRepository['sendOnlineMessage']>) {
    return this.messageRepo!.sendOnlineMessage(...args);
  }

  async getUnreadMessages(...args: Parameters<MessageRepository['getUnreadMessages']>) {
    return this.messageRepo!.getUnreadMessages(...args);
  }

  async getAllMessages(...args: Parameters<MessageRepository['getAllMessages']>) {
    return this.messageRepo!.getAllMessages(...args);
  }

  async markMessageDelivered(...args: Parameters<MessageRepository['markMessageDelivered']>) {
    return this.messageRepo!.markMessageDelivered(...args);
  }

  async markMessageRead(...args: Parameters<MessageRepository['markMessageRead']>) {
    return this.messageRepo!.markMessageRead(...args);
  }

  async getUnreadMessageCount(...args: Parameters<MessageRepository['getUnreadMessageCount']>) {
    return this.messageRepo!.getUnreadMessageCount(...args);
  }

  async deleteOLMMessage(...args: Parameters<MessageRepository['deleteOLMMessage']>) {
    return this.messageRepo!.deleteOLMMessage(...args);
  }

  // File management methods - delegate to FileRepository
  async createFileEntry(...args: Parameters<FileRepository['createFileEntry']>) {
    return this.fileRepo!.createFileEntry(...args);
  }

  async getFileEntries(...args: Parameters<FileRepository['getFileEntries']>) {
    return this.fileRepo!.getFileEntries(...args);
  }

  async updateFileEntry(...args: Parameters<FileRepository['updateFileEntry']>) {
    return this.fileRepo!.updateFileEntry(...args);
  }

  async getFileEntry(...args: Parameters<FileRepository['getFileEntry']>) {
    return this.fileRepo!.getFileEntry(...args);
  }

  async deleteFileEntry(...args: Parameters<FileRepository['deleteFileEntry']>) {
    return this.fileRepo!.deleteFileEntry(...args);
  }

  async incrementDownloadCount(...args: Parameters<FileRepository['incrementDownloadCount']>) {
    return this.fileRepo!.incrementDownloadCount(...args);
  }

  async createFileArea(...args: Parameters<FileRepository['createFileArea']>) {
    return this.fileRepo!.createFileArea(...args);
  }

  async getFileAreas(...args: Parameters<FileRepository['getFileAreas']>) {
    return this.fileRepo!.getFileAreas(...args);
  }

  async getFileAreaById(...args: Parameters<FileRepository['getFileAreaById']>) {
    return this.fileRepo!.getFileAreaById(...args);
  }

  async getFilesByArea(...args: Parameters<FileRepository['getFilesByArea']>) {
    return this.fileRepo!.getFilesByArea(...args);
  }

  async getFileStatisticsByConference(...args: Parameters<FileRepository['getFileStatisticsByConference']>) {
    return this.fileRepo!.getFileStatisticsByConference(...args);
  }

  // Session management methods - delegate to SessionRepository
  async createSession(...args: Parameters<SessionRepository['createSession']>) {
    return this.sessionRepo!.createSession(...args);
  }

  async getSession(...args: Parameters<SessionRepository['getSession']>) {
    return this.sessionRepo!.getSession(...args);
  }

  async updateSession(...args: Parameters<SessionRepository['updateSession']>) {
    return this.sessionRepo!.updateSession(...args);
  }

  async deleteSession(...args: Parameters<SessionRepository['deleteSession']>) {
    return this.sessionRepo!.deleteSession(...args);
  }

  async getActiveSessions(...args: Parameters<SessionRepository['getActiveSessions']>) {
    return this.sessionRepo!.getActiveSessions(...args);
  }

  async createNodeSession(...args: Parameters<SessionRepository['createNodeSession']>) {
    return this.sessionRepo!.createNodeSession(...args);
  }

  async updateNodeSession(...args: Parameters<SessionRepository['updateNodeSession']>) {
    return this.sessionRepo!.updateNodeSession(...args);
  }

  async getNodeSessions(...args: Parameters<SessionRepository['getNodeSessions']>) {
    return this.sessionRepo!.getNodeSessions(...args);
  }

  // Chat management methods - delegate to ChatRepository
  async getUserByUsernameForOLM(...args: Parameters<ChatRepository['getUserByUsernameForOLM']>) {
    return this.chatRepo!.getUserByUsernameForOLM(...args);
  }

  async getUserByUsernameForOLMv2(...args: Parameters<ChatRepository['getUserByUsernameForOLM']>) {
    return this.chatRepo!.getUserByUsernameForOLM(...args);
  }

  async getAvailableUsersForChat(...args: Parameters<ChatRepository['getAvailableUsersForChat']>) {
    return this.chatRepo!.getAvailableUsersForChat(...args);
  }

  async createChatSession(...args: Parameters<ChatRepository['createChatSession']>) {
    return this.chatRepo!.createChatSession(...args);
  }

  async getChatSession(...args: Parameters<ChatRepository['getChatSession']>) {
    return this.chatRepo!.getChatSession(...args);
  }

  async getChatSessionBySocketId(...args: Parameters<ChatRepository['getChatSessionBySocketId']>) {
    return this.chatRepo!.getChatSessionBySocketId(...args);
  }

  async getPendingChatInvitationForUser(...args: Parameters<ChatRepository['getPendingChatInvitationForUser']>) {
    return this.chatRepo!.getPendingChatInvitationForUser(...args);
  }

  async updateChatSessionStatus(...args: Parameters<ChatRepository['updateChatSessionStatus']>) {
    return this.chatRepo!.updateChatSessionStatus(...args);
  }

  async endChatSession(...args: Parameters<ChatRepository['endChatSession']>) {
    return this.chatRepo!.endChatSession(...args);
  }

  async getActiveChatSessions(...args: Parameters<ChatRepository['getActiveChatSessions']>) {
    return this.chatRepo!.getActiveChatSessions(...args);
  }

  async saveChatMessage(...args: Parameters<ChatRepository['saveChatMessage']>) {
    return this.chatRepo!.saveChatMessage(...args);
  }

  async getChatHistory(...args: Parameters<ChatRepository['getChatHistory']>) {
    return this.chatRepo!.getChatHistory(...args);
  }

  async getChatMessageCount(...args: Parameters<ChatRepository['getChatMessageCount']>) {
    return this.chatRepo!.getChatMessageCount(...args);
  }

  async createChatRoom(...args: Parameters<ChatRepository['createChatRoom']>) {
    return this.chatRepo!.createChatRoom(...args);
  }

  async getChatRoom(...args: Parameters<ChatRepository['getChatRoom']>) {
    return this.chatRepo!.getChatRoom(...args);
  }

  async getChatRoomByName(...args: Parameters<ChatRepository['getChatRoomByName']>) {
    return this.chatRepo!.getChatRoomByName(...args);
  }

  async listChatRooms(...args: Parameters<ChatRepository['listChatRooms']>) {
    return this.chatRepo!.listChatRooms(...args);
  }

  async deleteChatRoom(...args: Parameters<ChatRepository['deleteChatRoom']>) {
    return this.chatRepo!.deleteChatRoom(...args);
  }

  async joinChatRoom(...args: Parameters<ChatRepository['joinChatRoom']>) {
    return this.chatRepo!.joinChatRoom(...args);
  }

  async leaveChatRoom(...args: Parameters<ChatRepository['leaveChatRoom']>) {
    return this.chatRepo!.leaveChatRoom(...args);
  }

  async getRoomMembers(...args: Parameters<ChatRepository['getRoomMembers']>) {
    return this.chatRepo!.getRoomMembers(...args);
  }

  async getRoomMemberCount(...args: Parameters<ChatRepository['getRoomMemberCount']>) {
    return this.chatRepo!.getRoomMemberCount(...args);
  }

  async saveChatRoomMessage(...args: Parameters<ChatRepository['saveChatRoomMessage']>) {
    return this.chatRepo!.saveChatRoomMessage(...args);
  }

  async getChatRoomHistory(...args: Parameters<ChatRepository['getChatRoomHistory']>) {
    return this.chatRepo!.getChatRoomHistory(...args);
  }

  async updateRoomMember(...args: Parameters<ChatRepository['updateRoomMember']>) {
    return this.chatRepo!.updateRoomMember(...args);
  }

  async getUserRooms(...args: Parameters<ChatRepository['getUserRooms']>) {
    return this.chatRepo!.getUserRooms(...args);
  }

  async isUserInRoom(...args: Parameters<ChatRepository['isUserInRoom']>) {
    return this.chatRepo!.isUserInRoom(...args);
  }

  async isUserModerator(...args: Parameters<ChatRepository['isUserModerator']>) {
    return this.chatRepo!.isUserModerator(...args);
  }

  async isUserMuted(...args: Parameters<ChatRepository['isUserMuted']>) {
    return this.chatRepo!.isUserMuted(...args);
  }

  async updateChatRoom(...args: Parameters<ChatRepository['updateChatRoom']>) {
    return this.chatRepo!.updateChatRoom(...args);
  }

  // Bulletin management methods - delegate to BulletinRepository
  async createBulletin(...args: Parameters<BulletinRepository['createBulletin']>) {
    return this.bulletinRepo!.createBulletin(...args);
  }

  async getBulletins(...args: Parameters<BulletinRepository['getBulletins']>) {
    return this.bulletinRepo!.getBulletins(...args);
  }

  async getBulletinById(...args: Parameters<BulletinRepository['getBulletinById']>) {
    return this.bulletinRepo!.getBulletinById(...args);
  }

  async deleteBulletin(...args: Parameters<BulletinRepository['deleteBulletin']>) {
    return this.bulletinRepo!.deleteBulletin(...args);
  }

  // Webhook management methods - delegate to WebhookRepository
  async getWebhooks(...args: Parameters<WebhookRepository['getWebhooks']>) {
    return this.webhookRepo!.getWebhooks(...args);
  }

  async getWebhook(...args: Parameters<WebhookRepository['getWebhook']>) {
    return this.webhookRepo!.getWebhook(...args);
  }

  async createWebhook(...args: Parameters<WebhookRepository['createWebhook']>) {
    return this.webhookRepo!.createWebhook(...args);
  }

  async updateWebhook(...args: Parameters<WebhookRepository['updateWebhook']>) {
    return this.webhookRepo!.updateWebhook(...args);
  }

  async deleteWebhook(...args: Parameters<WebhookRepository['deleteWebhook']>) {
    return this.webhookRepo!.deleteWebhook(...args);
  }

  async getWebhooksByTrigger(...args: Parameters<WebhookRepository['getWebhooksByTrigger']>) {
    return this.webhookRepo!.getWebhooksByTrigger(...args);
  }

  // Logging methods
  async logSystemEvent(level: 'info' | 'warning' | 'error', message: string, context?: {
    userId?: string;
    conferenceId?: number;
    node?: number;
  }): Promise<void> {
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
  async generateAccessToken(user: any): Promise<string> {
    const secret = process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';
    const payload = {
      userId: user.id,
      username: user.username,
      secLevel: user.secLevel
    };

    return jwt.sign(payload, secret, { expiresIn: '1h' });
  }

  async generateRefreshToken(user: any): Promise<string> {
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

  async authenticateUser(username: string, password: string): Promise<any> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const passwordMatch = await this.verifyPassword(password, user.passwordHash);
    if (!passwordMatch) return null;

    return user;
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

// Lazy singleton - initialized on first access
class DatabaseSingleton {
  private static instance: Database | null = null;

  static getInstance(): Database {
    if (!this.instance) {
      this.instance = new Database();
    }
    return this.instance;
  }
}

// Export lazy-initialized singleton
export const db = new Proxy({} as Database, {
  get(target, prop) {
    const instance = DatabaseSingleton.getInstance();
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});
