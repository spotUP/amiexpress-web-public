// Load environment variables FIRST
require('dotenv').config({ override: true });

import { Pool as PoolConstructor } from 'pg';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

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
  // ACS (Access Control System) fields - express.e:8455-8497
  securityFlags?: string; // String of 'T'/'F'/'?' chars for each permission (87 total)
  secOverride?: string;   // String of 'T'/'F'/'?' chars to override permissions
  userFlags: number;      // Bitwise flags (e.g., USER_SCRNCLR)
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

// Helper function to convert camelCase field names to lowercase column names
function fieldToColumn(field: string): string {
  // Map of camelCase field names to lowercase column names
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
  private pool?: any;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000; // 5 seconds
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    // PostgreSQL connection configuration
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
      throw new Error('PostgreSQL connection string not found. Please set DATABASE_URL or POSTGRES_URL environment variable.');
    }

    console.log('Initializing PostgreSQL database connection...');

    // SSL configuration based on environment
    const sslConfig = process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false; // Explicitly disable SSL in development

    this.pool = new PoolConstructor({
      connectionString,
      ssl: sslConfig,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
      keepAlive: true, // Keep TCP connection alive
      keepAliveInitialDelayMillis: 10000, // Start keep-alive after 10 seconds
    });

    // Handle pool errors - DO NOT CRASH THE SERVER
    this.pool.on('error', (err: Error) => {
      console.error('⚠️ PostgreSQL pool error (connection may have dropped):', err.message);
      this.isConnected = false;
      // Attempt to reconnect instead of crashing
      this.attemptReconnection();
    });

    this.pool.on('connect', () => {
      console.log('✅ Connected to PostgreSQL database');
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset reconnection counter on successful connect
    });

    this.pool.on('remove', () => {
      console.log('🔌 Client removed from pool');
    });

    // Start health check monitoring
    this.startHealthCheck();

    // Initialize database schema
    this.initDatabase();
  }

  // Attempt to reconnect to database
  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting database reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        // Try to get a client from the pool
        const client = await this.pool.connect();
        await client.query('SELECT 1'); // Test query
        client.release();

        console.log('✅ Database reconnection successful');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error(`⚠️ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        // Try again
        this.attemptReconnection();
      }
    }, this.reconnectDelay);
  }

  // Health check to monitor database connection
  private startHealthCheck(): void {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();

        if (!this.isConnected) {
          console.log('✅ Database health check: Connection restored');
          this.isConnected = true;
          this.reconnectAttempts = 0;
        }
      } catch (error) {
        if (this.isConnected) {
          console.error('⚠️ Database health check failed:', error);
          this.isConnected = false;
          this.attemptReconnection();
        }
      }
    }, 30000);
  }

  // Check if database is connected
  public isHealthy(): boolean {
    return this.isConnected;
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
          passwordhash TEXT NOT NULL,
          realname TEXT NOT NULL,
          location TEXT,
          phone TEXT,
          email TEXT,
          seclevel INTEGER DEFAULT 10,
          uploads INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          bytesupload BIGINT DEFAULT 0,
          bytesdownload BIGINT DEFAULT 0,
          ratio INTEGER DEFAULT 0,
          ratiotype INTEGER DEFAULT 0,
          timetotal INTEGER DEFAULT 0,
          timelimit INTEGER DEFAULT 0,
          timeused INTEGER DEFAULT 0,
          chatlimit INTEGER DEFAULT 0,
          chatused INTEGER DEFAULT 0,
          lastlogin TIMESTAMPTZ,
          firstlogin TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          calls INTEGER DEFAULT 0,
          callstoday INTEGER DEFAULT 0,
          newuser BOOLEAN DEFAULT true,
          expert BOOLEAN DEFAULT false,
          ansi BOOLEAN DEFAULT true,
          linesperscreen INTEGER DEFAULT 23,
          computer TEXT,
          screentype TEXT DEFAULT 'Amiga Ansi',
          protocol TEXT DEFAULT '/X Zmodem',
          editor TEXT DEFAULT 'Prompt',
          zoomtype TEXT DEFAULT 'QWK',
          availableforchat BOOLEAN DEFAULT true,
          quietnode BOOLEAN DEFAULT false,
          autorejoin INTEGER DEFAULT 1,
          confaccess TEXT DEFAULT 'XXX',
          areaname TEXT DEFAULT 'Standard',
          uucp BOOLEAN DEFAULT false,
          topuploadcps INTEGER DEFAULT 0,
          topdownloadcps INTEGER DEFAULT 0,
          bytelimit BIGINT DEFAULT 0,
          securityflags TEXT DEFAULT NULL,
          secoverride TEXT DEFAULT NULL,
          userflags INTEGER DEFAULT 0,
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
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
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
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          messagebaseid INTEGER NOT NULL REFERENCES message_bases(id),
          isprivate BOOLEAN DEFAULT false,
          touser TEXT,
          parentid INTEGER,
          attachments JSONB,
          edited BOOLEAN DEFAULT false,
          editedby TEXT,
          editedat TIMESTAMPTZ
        )
      `);

      // File areas table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_areas (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          path TEXT NOT NULL,
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          maxfiles INTEGER DEFAULT 100,
          uploadaccess INTEGER DEFAULT 10,
          downloadaccess INTEGER DEFAULT 1,
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
          uploaddate TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          downloads INTEGER DEFAULT 0,
          areaid INTEGER NOT NULL REFERENCES file_areas(id),
          fileiddiz TEXT,
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
          userid TEXT REFERENCES users(id),
          socketid TEXT NOT NULL,
          state TEXT NOT NULL,
          substate TEXT,
          currentconf INTEGER DEFAULT 0,
          currentmsgbase INTEGER DEFAULT 0,
          timeremaining INTEGER DEFAULT 60,
          lastactivity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          confrjoin INTEGER DEFAULT 1,
          msgbaserjoin INTEGER DEFAULT 1,
          commandbuffer TEXT DEFAULT '',
          menupause BOOLEAN DEFAULT true,
          inputbuffer TEXT DEFAULT '',
          relconfnum INTEGER DEFAULT 0,
          currentconfname TEXT DEFAULT 'Unknown',
          cmdshortcuts BOOLEAN DEFAULT false,
          tempdata JSONB,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Bulletins table
      await client.query(`
        CREATE TABLE IF NOT EXISTS bulletins (
          id SERIAL PRIMARY KEY,
          conferenceid INTEGER NOT NULL REFERENCES conferences(id),
          filename TEXT NOT NULL,
          title TEXT NOT NULL,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Online messages table (OLM - Online Message system)
      await client.query(`
        CREATE TABLE IF NOT EXISTS online_messages (
          id SERIAL PRIMARY KEY,
          from_user_id TEXT NOT NULL REFERENCES users(id),
          to_user_id TEXT NOT NULL REFERENCES users(id),
          message TEXT NOT NULL,
          delivered BOOLEAN DEFAULT FALSE,
          read BOOLEAN DEFAULT FALSE,
          from_username TEXT NOT NULL,
          to_username TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          delivered_at TIMESTAMPTZ,
          read_at TIMESTAMPTZ
        )
      `);

      // Create index for efficient message lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_online_messages_to_user
        ON online_messages(to_user_id, delivered, read);
      `);

      // Chat sessions table (Internode chat system)
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id SERIAL PRIMARY KEY,
          session_id TEXT UNIQUE NOT NULL,
          initiator_id TEXT NOT NULL REFERENCES users(id),
          recipient_id TEXT NOT NULL REFERENCES users(id),
          initiator_username TEXT NOT NULL,
          recipient_username TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requesting',
          started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          ended_at TIMESTAMPTZ,
          initiator_socket TEXT NOT NULL,
          recipient_socket TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for chat sessions
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_status
        ON chat_sessions(status);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_users
        ON chat_sessions(initiator_id, recipient_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_active
        ON chat_sessions(status, started_at) WHERE status = 'active';
      `);

      // Chat messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          sender_id TEXT NOT NULL REFERENCES users(id),
          sender_username TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_chat_session
            FOREIGN KEY (session_id)
            REFERENCES chat_sessions(session_id)
            ON DELETE CASCADE
        )
      `);

      // Create indexes for chat messages
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session
        ON chat_messages(session_id, created_at);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
        ON chat_messages(sender_id);
      `);

      // Chat rooms table (multi-user chat rooms - extended feature)
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          topic TEXT,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT NOT NULL REFERENCES users(id),
          is_public BOOLEAN DEFAULT TRUE,
          max_users INTEGER DEFAULT 50,
          min_security_level INTEGER DEFAULT 0
        )
      `);

      // Chat room users (current users in rooms)
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_room_users (
          room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        )
      `);

      // Chat room messages (message history)
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_room_messages (
          id SERIAL PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id),
          sender_name TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for chat rooms
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_rooms_public
        ON chat_rooms(is_public, min_security_level);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_room_users_room
        ON chat_room_users(room_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_room_messages_room
        ON chat_room_messages(room_id, timestamp);
      `);

      // System logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          userid TEXT REFERENCES users(id),
          conferenceid INTEGER REFERENCES conferences(id),
          node INTEGER
        )
      `);

      // AREXX scripts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS arexx_scripts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          script TEXT NOT NULL,
          triggers JSONB,
          priority INTEGER DEFAULT 0,
          enabled BOOLEAN DEFAULT TRUE,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Node sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS node_sessions (
          id TEXT PRIMARY KEY,
          nodeId INTEGER NOT NULL,
          userId TEXT REFERENCES users(id),
          socketId TEXT NOT NULL,
          state TEXT NOT NULL,
          subState TEXT,
          currentConf INTEGER,
          currentMsgBase INTEGER,
          timeRemaining INTEGER,
          lastActivity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL,
          loadLevel INTEGER DEFAULT 0,
          currentUser TEXT,
          created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Flagged files table (express.e:2757)
      // Stores user's flagged files for batch download
      await client.query(`
        CREATE TABLE IF NOT EXISTS flagged_files (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conf_num INTEGER NOT NULL,
          file_name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, conf_num, file_name)
        )
      `);

      // Command history table (express.e:2669)
      // Stores user's command history for up-arrow recall
      await client.query(`
        CREATE TABLE IF NOT EXISTS command_history (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          history_num INTEGER DEFAULT 0,
          history_cycle INTEGER DEFAULT 0,
          commands JSONB DEFAULT '[]',
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Caller activity log table (express.e:9493 callersLog)
      // Stores all caller actions like express.e's BBS:Node{X}/CallersLog
      await client.query(`
        CREATE TABLE IF NOT EXISTS caller_activity (
          id SERIAL PRIMARY KEY,
          node_id INTEGER DEFAULT 1,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          username TEXT,
          action TEXT NOT NULL,
          details TEXT,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User statistics table for bytes/ratio tracking
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          bytes_uploaded BIGINT DEFAULT 0,
          bytes_downloaded BIGINT DEFAULT 0,
          files_uploaded INTEGER DEFAULT 0,
          files_downloaded INTEGER DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Phase 10: Message Pointer System tables (express.e:8672-8707, axobjects.e:192-197)
      // Mail statistics - tracks message ranges per conference/message base
      await client.query(`
        CREATE TABLE IF NOT EXISTS mail_stats (
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          message_base_id INTEGER NOT NULL REFERENCES message_bases(id) ON DELETE CASCADE,
          lowest_key INTEGER DEFAULT 1,
          high_msg_num INTEGER DEFAULT 1,
          lowest_not_del INTEGER DEFAULT 0,
          PRIMARY KEY (conference_id, message_base_id)
        )
      `);

      // Conference base - tracks per-user read pointers and scan flags
      await client.query(`
        CREATE TABLE IF NOT EXISTS conf_base (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          message_base_id INTEGER NOT NULL REFERENCES message_bases(id) ON DELETE CASCADE,
          last_new_read_conf INTEGER DEFAULT 0,
          last_msg_read_conf INTEGER DEFAULT 0,
          scan_flags INTEGER DEFAULT 12,
          messages_posted INTEGER DEFAULT 0,
          new_since_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          bytes_download BIGINT DEFAULT 0,
          bytes_upload BIGINT DEFAULT 0,
          upload INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, conference_id, message_base_id)
        )
      `);

      // Voting Booth System tables (express.e:20782-21036, vote() and voteMenu())
      // Vote topics - max 25 per conference
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_topics (
          id SERIAL PRIMARY KEY,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          topic_number INTEGER NOT NULL CHECK (topic_number >= 1 AND topic_number <= 25),
          title TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          is_active BOOLEAN DEFAULT TRUE,
          UNIQUE (conference_id, topic_number)
        )
      `);

      // Vote questions - multiple questions per topic
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_questions (
          id SERIAL PRIMARY KEY,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          question_number INTEGER NOT NULL,
          question_text TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (topic_id, question_number)
        )
      `);

      // Vote answers - multiple answer choices per question
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_answers (
          id SERIAL PRIMARY KEY,
          question_id INTEGER NOT NULL REFERENCES vote_questions(id) ON DELETE CASCADE,
          answer_letter CHAR(1) NOT NULL CHECK (answer_letter >= 'A' AND answer_letter <= 'Z'),
          answer_text TEXT NOT NULL,
          vote_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (question_id, answer_letter)
        )
      `);

      // Vote results - tracks individual user votes
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_results (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          question_id INTEGER NOT NULL REFERENCES vote_questions(id) ON DELETE CASCADE,
          answer_id INTEGER NOT NULL REFERENCES vote_answers(id) ON DELETE CASCADE,
          voted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, question_id)
        )
      `);

      // Vote status - tracks which users have completed voting on which topics
      await client.query(`
        CREATE TABLE IF NOT EXISTS vote_status (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic_id INTEGER NOT NULL REFERENCES vote_topics(id) ON DELETE CASCADE,
          conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
          completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, topic_id)
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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conference ON messages(conferenceid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_base ON messages(messagebaseid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_private ON messages(isprivate, touser)`);

    // File indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_area ON file_entries(areaid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_uploader ON file_entries(uploader)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_files_date ON file_entries(uploaddate)`);

    // Conference indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_file_areas_conference ON file_areas(conferenceid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_bases_conference ON message_bases(conferenceid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bulletins_conference ON bulletins(conferenceid)`);

    // User indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_seclevel ON users(seclevel)`);

    // Flagged files indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_flagged_files_user ON flagged_files(user_id)`);

    // Command history indexes (user_id is already primary key)

    // Caller activity indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_caller_activity_user ON caller_activity(user_id)`);

    // Phase 10: Message pointer indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conf_base_user ON conf_base(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conf_base_conference ON conf_base(conference_id, message_base_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_caller_activity_timestamp ON caller_activity(timestamp DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_caller_activity_node ON caller_activity(node_id, timestamp DESC)`);

    // User stats indexes (user_id is already primary key)

    // Voting booth indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_topics_conference ON vote_topics(conference_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_topics_active ON vote_topics(is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_questions_topic ON vote_questions(topic_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_answers_question ON vote_answers(question_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_results_user ON vote_results(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_results_topic ON vote_results(topic_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_status_user ON vote_status(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vote_status_conference ON vote_status(conference_id)`);
  }


  // User management methods
  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    const client = await this.pool.connect();
    try {
      const id = crypto.randomUUID();
      const sql = `
        INSERT INTO users (
          id, username, passwordhash, realname, location, phone, email,
          seclevel, uploads, downloads, bytesupload, bytesdownload, ratio,
          ratiotype, timetotal, timelimit, timeused, chatlimit, chatused,
          lastlogin, firstlogin, calls, callstoday, newuser, expert, ansi,
          linesperscreen, computer, screentype, protocol, editor, zoomtype,
          availableforchat, quietnode, autorejoin, confaccess, areaname, uucp,
          topuploadcps, topdownloadcps, bytelimit
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
          passwordHash: user.passwordhash,
          realname: user.realname,
          location: user.location,
          phone: user.phone,
          email: user.email,
          secLevel: safeNumber(user.seclevel, 10), // Default to 10 if NaN
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
          lastLogin: user.lastlogin,
          firstLogin: user.firstlogin,
          calls: safeNumber(user.calls, 0),
          callsToday: safeNumber(user.callstoday, 0),
          newUser: user.newuser,
          expert: user.expert,
          ansi: user.ansi,
          linesPerScreen: safeNumber(user.linesperscreen, 23),
          computer: user.computer,
          screenType: user.screentype,
          protocol: user.protocol,
          editor: user.editor,
          zoomType: user.zoomtype,
          availableForChat: user.availableforchat,
          quietNode: user.quietnode,
          autoRejoin: safeNumber(user.autorejoin, 1),
          confAccess: user.confaccess,
          areaName: user.areaname,
          uuCP: user.uucp,
          topUploadCPS: safeNumber(user.topuploadcps, 0),
          topDownloadCPS: safeNumber(user.topdownloadcps, 0),
          byteLimit: safeNumber(user.bytelimit, 0),
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
      if (result.rows[0]) {
        const user = result.rows[0] as any;
        // Helper function to safely convert to number with default
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
          lastLogin: user.lastlogin,
          firstLogin: user.firstlogin,
          calls: safeNumber(user.calls, 0),
          callsToday: safeNumber(user.callstoday, 0),
          newUser: user.newuser,
          expert: user.expert,
          ansi: user.ansi,
          linesPerScreen: safeNumber(user.linesperscreen, 23),
          computer: user.computer,
          screenType: user.screentype,
          protocol: user.protocol,
          editor: user.editor,
          zoomType: user.zoomtype,
          availableForChat: user.availableforchat,
          quietNode: user.quietnode,
          autoRejoin: safeNumber(user.autorejoin, 1),
          confAccess: user.confaccess,
          areaName: user.areaname,
          uuCP: user.uucp,
          topUploadCPS: safeNumber(user.topuploadcps, 0),
          topDownloadCPS: safeNumber(user.topdownloadcps, 0),
          byteLimit: safeNumber(user.bytelimit, 0),
          created: user.created,
          updated: user.updated,
        } as User;
      }
      return null;
    } finally {
      client.release();
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
      if (fields.length === 0) return;

      const sql = `UPDATE users SET ${fields.map((f, i) => `${fieldToColumn(f)} = $${i + 1}`).join(', ')}, updated = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`;
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
        sql += ` AND seclevel >= $${paramIndex++}`;
        params.push(filter.secLevel);
      }

      if (filter?.newUser !== undefined) {
        sql += ` AND newuser = $${paramIndex++}`;
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
          subject, body, author, timestamp, conferenceid, messagebaseid,
          isprivate, touser, parentid, attachments, edited, editedby, editedat
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
        JOIN message_bases mb ON m.messagebaseid = mb.id
        JOIN conferences c ON m.conferenceid = c.id
        WHERE m.conferenceid = $1 AND m.messagebaseid = $2
      `;
      const params: any[] = [conferenceId, messageBaseId];
      let paramIndex = 3;

      if (options?.privateOnly && options?.userId) {
        sql += ` AND (m.isprivate = false OR (m.isprivate = true AND (m.author = $${paramIndex++} OR m.touser = $${paramIndex++})))`;
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
          filename, description, size, uploader, uploaddate, downloads,
          areaid, fileiddiz, rating, votes, status, checked, comment
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
      let sql = `SELECT * FROM file_entries WHERE areaid = $1`;
      const params: any[] = [areaId];
      let paramIndex = 2;

      if (options?.status) {
        sql += ` AND status = $${paramIndex++}`;
        params.push(options.status);
      }

      if (options?.search) {
        sql += ` AND (filename ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++} OR fileiddiz ILIKE $${paramIndex++})`;
        const searchTerm = `%${options.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ` ORDER BY uploaddate DESC`;

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
          id, userid, socketid, state, substate, currentconf, currentmsgbase,
          timeremaining, lastactivity, confrjoin, msgbaserjoin, commandbuffer,
          menupause, inputbuffer, relconfnum, currentconfname, cmdshortcuts, tempdata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          userid = EXCLUDED.userid,
          socketid = EXCLUDED.socketid,
          state = EXCLUDED.state,
          substate = EXCLUDED.substate,
          currentconf = EXCLUDED.currentconf,
          currentmsgbase = EXCLUDED.currentmsgbase,
          timeremaining = EXCLUDED.timeremaining,
          lastactivity = EXCLUDED.lastactivity,
          confrjoin = EXCLUDED.confrjoin,
          msgbaserjoin = EXCLUDED.msgbaserjoin,
          commandbuffer = EXCLUDED.commandbuffer,
          menupause = EXCLUDED.menupause,
          inputbuffer = EXCLUDED.inputbuffer,
          relconfnum = EXCLUDED.relconfnum,
          currentconfname = EXCLUDED.currentconfname,
          cmdshortcuts = EXCLUDED.cmdshortcuts,
          tempdata = EXCLUDED.tempdata,
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
      const sql = `SELECT * FROM sessions WHERE lastactivity > NOW() - INTERVAL '30 minutes'`;
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
      const sql = `INSERT INTO message_bases (name, conferenceid) VALUES ($1, $2) RETURNING id`;
      const result = await client.query(sql, [mb.name, mb.conferenceId]);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM message_bases WHERE conferenceid = $1 ORDER BY id`;
      const result = await client.query(sql, [conferenceId]);
      // Map PostgreSQL column names to camelCase interface
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        conferenceId: row.conferenceid,
        created: row.created,
        updated: row.updated
      }));
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
          name, description, path, conferenceid, maxfiles, uploadaccess, downloadaccess
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
      const sql = `SELECT * FROM file_areas WHERE conferenceid = $1 ORDER BY id`;
      const result = await client.query(sql, [conferenceId]);
      return result.rows as FileArea[];
    } finally {
      client.release();
    }
  }

  async getFilesByArea(areaId: number): Promise<FileEntry[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT * FROM file_entries
        WHERE areaid = $1
        ORDER BY uploaddate DESC
      `;
      const result = await client.query(sql, [areaId]);
      return result.rows as FileEntry[];
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

  // OLM (Online Message) methods
  async sendOnlineMessage(fromUserId: string, fromUsername: string, toUserId: string, toUsername: string, message: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO online_messages (from_user_id, from_username, to_user_id, to_username, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      const result = await client.query(sql, [fromUserId, fromUsername, toUserId, toUsername, message]);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getUnreadMessages(userId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT id, from_user_id, from_username, message, created_at
        FROM online_messages
        WHERE to_user_id = $1 AND delivered = FALSE
        ORDER BY created_at ASC
      `;
      const result = await client.query(sql, [userId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getAllMessages(userId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT id, from_user_id, from_username, message, created_at, delivered, read, delivered_at, read_at
        FROM online_messages
        WHERE to_user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      const result = await client.query(sql, [userId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async markMessageDelivered(messageId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        UPDATE online_messages
        SET delivered = TRUE, delivered_at = NOW()
        WHERE id = $1
      `;
      await client.query(sql, [messageId]);
    } finally {
      client.release();
    }
  }

  async markMessageRead(messageId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        UPDATE online_messages
        SET read = TRUE, read_at = NOW()
        WHERE id = $1
      `;
      await client.query(sql, [messageId]);
    } finally {
      client.release();
    }
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT COUNT(*) as count
        FROM online_messages
        WHERE to_user_id = $1 AND delivered = FALSE
      `;
      const result = await client.query(sql, [userId]);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async deleteOLMMessage(messageId: number, userId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const sql = `
        DELETE FROM online_messages
        WHERE id = $1 AND to_user_id = $2
      `;
      const result = await client.query(sql, [messageId, userId]);
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async getUserByUsernameForOLM(username: string): Promise<{ id: string; username: string; availableforchat: boolean } | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT id, username, availableforchat FROM users WHERE LOWER(username) = LOWER($1)`;
      const result = await client.query(sql, [username]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    try {
      const sessionId = crypto.randomUUID();
      const sql = `
        INSERT INTO chat_sessions (
          session_id, initiator_id, initiator_username, initiator_socket,
          recipient_id, recipient_username, recipient_socket, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'requesting')
        RETURNING session_id
      `;
      const result = await client.query(sql, [
        sessionId, initiatorId, initiatorUsername, initiatorSocket,
        recipientId, recipientUsername, recipientSocket
      ]);
      return result.rows[0].session_id;
    } finally {
      client.release();
    }
  }

  async getChatSession(sessionId: string): Promise<InternodeChatSession | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM chat_sessions WHERE session_id = $1`;
      const result = await client.query(sql, [sessionId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  async getChatSessionBySocketId(socketId: string): Promise<InternodeChatSession | null> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT * FROM chat_sessions
        WHERE (initiator_socket = $1 OR recipient_socket = $1)
        AND status = 'active'
      `;
      const result = await client.query(sql, [socketId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  async updateChatSessionStatus(
    sessionId: string,
    status: 'requesting' | 'active' | 'ended' | 'declined'
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        UPDATE chat_sessions
        SET status = $2, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $1
      `;
      await client.query(sql, [sessionId, status]);
    } finally {
      client.release();
    }
  }

  async endChatSession(sessionId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        UPDATE chat_sessions
        SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $1
      `;
      await client.query(sql, [sessionId]);
    } finally {
      client.release();
    }
  }

  async getActiveChatSessions(): Promise<InternodeChatSession[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT * FROM chat_sessions
        WHERE status = 'active'
        ORDER BY started_at DESC
      `;
      const result = await client.query(sql);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async saveChatMessage(
    sessionId: string,
    senderId: string,
    senderUsername: string,
    message: string
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Save message
      const sql = `
        INSERT INTO chat_messages (session_id, sender_id, sender_username, message)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      const result = await client.query(sql, [sessionId, senderId, senderUsername, message]);

      // Update message count in session
      const updateSql = `
        UPDATE chat_sessions
        SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $1
      `;
      await client.query(updateSql, [sessionId]);

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getChatHistory(sessionId: string, limit: number = 50): Promise<InternodeChatMessage[]> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT * FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const result = await client.query(sql, [sessionId, limit]);
      return result.rows.reverse(); // Reverse to get chronological order
    } finally {
      client.release();
    }
  }

  async getChatMessageCount(sessionId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT COUNT(*) as count FROM chat_messages WHERE session_id = $1`;
      const result = await client.query(sql, [sessionId]);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async getAvailableUsersForChat(): Promise<Array<{
    id: string;
    username: string;
    realname: string;
    seclevel: number;
    currentAction?: string;
  }>> {
    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT id, username, realname, seclevel
        FROM users
        WHERE availableforchat = TRUE
        ORDER BY username
      `;
      const result = await client.query(sql);
      return result.rows;
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
    // Use bcrypt with 12 salt rounds (industry standard for security)
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Check if this is a legacy SHA-256 hash (64 hex characters)
    const isSHA256 = hash.length === 64 && /^[0-9a-f]{64}$/i.test(hash);

    if (isSHA256) {
      // Legacy SHA-256 hash - use direct comparison
      const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
      return sha256Hash === hash;
    }

    // Modern bcrypt hash - use bcrypt.compare()
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      // If bcrypt verification fails due to invalid hash format, return false
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

    // Access tokens expire in 1 hour
    return jwt.sign(payload, secret, { expiresIn: '1h' });
  }

  async generateRefreshToken(user: User): Promise<string> {
    const secret = process.env.JWT_REFRESH_SECRET || 'amiexpress-refresh-secret-change-in-production';
    const payload = {
      userId: user.id,
      username: user.username
    };

    // Refresh tokens expire in 7 days
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
    const client = await this.pool.connect();
    try {
      // Get user by username
      const result = await client.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      // Verify password with bcrypt
      const bcrypt = await import('bcrypt');
      const passwordMatch = await bcrypt.compare(password, user.passwordhash);

      if (!passwordMatch) {
        return null;
      }

      // Return user without password hash
      return {
        id: user.id,
        username: user.username,
        passwordHash: user.passwordhash,
        realname: user.realname,
        location: user.location,
        phone: user.phone,
        email: user.email,
        secLevel: user.seclevel,
        uploads: user.uploads,
        downloads: user.downloads,
        bytesUpload: user.bytesupload,
        bytesDownload: user.bytesdownload,
        ratio: user.ratio,
        ratioType: user.ratiotype,
        timeTotal: user.timetotal,
        timeLimit: user.timelimit,
        timeUsed: user.timeused,
        chatLimit: user.chatlimit,
        chatUsed: user.chatused,
        firstLogin: user.firstlogin,
        lastLogin: user.lastlogin || user.firstlogin,
        calls: user.calls,
        callsToday: user.callstoday,
        newUser: user.newuser,
        expert: user.expert,
        ansi: user.ansi,
        linesPerScreen: user.linesperscreen,
        computer: user.computer,
        screenType: user.screentype,
        protocol: user.protocol,
        editor: user.editor,
        zoomType: user.zoomtype,
        availableForChat: user.availableforchat,
        quietNode: user.quietnode,
        autoRejoin: user.autorejoin,
        confAccess: user.confaccess,
        areaName: user.areaname,
        uucp: user.uucp,
        topUploadCps: user.topuploadcps,
        topDownloadCps: user.topdownloadcps,
        byteLimit: user.bytelimit
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    console.log('🔌 Closing database connection pool...');
    await this.pool.end();
    this.isConnected = false;
    console.log('✅ Database connection pool closed');
  }

  // Initialize default data
  async initializeDefaultData(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Step 1: Create conferences and get their IDs
      let confIds: { [key: string]: number } = {};
      try {
        console.log('[DB Init Step 1/5] Creating default conferences...');
        const conferences = [
          { name: 'General', description: 'General discussion' },
          { name: 'Tech Support', description: 'Technical support' },
          { name: 'Announcements', description: 'System announcements' }
        ];

        for (const conf of conferences) {
          const existing = await client.query('SELECT id FROM conferences WHERE name = $1', [conf.name]);
          if (existing.rows.length === 0) {
            const result = await client.query('INSERT INTO conferences (name, description) VALUES ($1, $2) RETURNING id', [conf.name, conf.description]);
            confIds[conf.name] = result.rows[0].id;
            console.log(`  ✓ Created conference: ${conf.name} (ID: ${confIds[conf.name]})`);
          } else {
            confIds[conf.name] = existing.rows[0].id;
            console.log(`  • Conference already exists: ${conf.name} (ID: ${confIds[conf.name]})`);
          }
        }
        console.log('[DB Init Step 1/5] ✓ Conferences initialized');
      } catch (error) {
        console.error('[DB Init Step 1/5] ✗ Failed to create conferences:', error);
        throw error;
      }

      // Step 2: Create message bases using actual conference IDs
      try {
        console.log('[DB Init Step 2/5] Creating default message bases...');
        const messageBases = [
          { name: 'Main', conferenceName: 'General' },
          { name: 'Off Topic', conferenceName: 'General' },
          { name: 'Support', conferenceName: 'Tech Support' },
          { name: 'News', conferenceName: 'Announcements' }
        ];

        for (const mb of messageBases) {
          const conferenceId = confIds[mb.conferenceName];
          const existing = await client.query('SELECT id FROM message_bases WHERE name = $1 AND conferenceid = $2', [mb.name, conferenceId]);
          if (existing.rows.length === 0) {
            await client.query('INSERT INTO message_bases (name, conferenceid) VALUES ($1, $2)', [mb.name, conferenceId]);
            console.log(`  ✓ Created message base: ${mb.name} in conference ${mb.conferenceName}`);
          } else {
            console.log(`  • Message base already exists: ${mb.name} in conference ${mb.conferenceName}`);
          }
        }
        console.log('[DB Init Step 2/5] ✓ Message bases initialized');
      } catch (error) {
        console.error('[DB Init Step 2/5] ✗ Failed to create message bases:', error);
        throw error;
      }

      // Step 3: Create file areas using actual conference IDs
      try {
        console.log('[DB Init Step 3/5] Creating default file areas...');
        const fileAreas = [
          { name: 'General Files', description: 'General purpose file area', path: '/files/general', conferenceName: 'General', maxFiles: 100, uploadAccess: 10, downloadAccess: 1 },
          { name: 'Utilities', description: 'System utilities and tools', path: '/files/utils', conferenceName: 'General', maxFiles: 50, uploadAccess: 50, downloadAccess: 1 },
          { name: 'Games', description: 'BBS games and entertainment', path: '/files/games', conferenceName: 'Tech Support', maxFiles: 75, uploadAccess: 25, downloadAccess: 1 },
          { name: 'Tech Files', description: 'Technical documentation and tools', path: '/files/tech', conferenceName: 'Tech Support', maxFiles: 60, uploadAccess: 20, downloadAccess: 1 },
          { name: 'System News', description: 'System announcements and updates', path: '/files/news', conferenceName: 'Announcements', maxFiles: 30, uploadAccess: 100, downloadAccess: 1 }
        ];

        for (const area of fileAreas) {
          const conferenceId = confIds[area.conferenceName];
          const existing = await client.query('SELECT id FROM file_areas WHERE name = $1 AND conferenceid = $2', [area.name, conferenceId]);
          if (existing.rows.length === 0) {
            await client.query(`
              INSERT INTO file_areas (name, description, path, conferenceid, maxfiles, uploadaccess, downloadaccess)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [area.name, area.description, area.path, conferenceId, area.maxFiles, area.uploadAccess, area.downloadAccess]);
            console.log(`  ✓ Created file area: ${area.name} in conference ${area.conferenceName}`);
          } else {
            console.log(`  • File area already exists: ${area.name} in conference ${area.conferenceName}`);
          }
        }
        console.log('[DB Init Step 3/5] ✓ File areas initialized');
      } catch (error) {
        console.error('[DB Init Step 3/5] ✗ Failed to create file areas:', error);
        throw error;
      }

      // Step 4: Create sysop user
      try {
        console.log('[DB Init Step 4/5] Creating default sysop user...');
        console.log('  • Generating bcrypt password hash...');
        const hashedPassword = await this.hashPassword('sysop');
        console.log('  ✓ Password hash generated');

        // Try to update existing sysop user first
        console.log('  • Checking for existing sysop user...');
        const updateResult = await client.query(`
          UPDATE users SET passwordhash = $1, expert = $2 WHERE username = 'sysop'
        `, [hashedPassword, false]);

        if (updateResult.rowCount === 0) {
          // User doesn't exist, create it
          console.log('  • No existing sysop user found, creating new user...');
          await client.query(`
            INSERT INTO users (
              id, username, passwordhash, realname, location, phone, email, seclevel,
              uploads, downloads, bytesupload, bytesdownload, ratio, ratiotype,
              timetotal, timelimit, timeused, chatlimit, chatused, lastlogin, firstlogin,
              calls, callstoday, newuser, expert, ansi, linesperscreen, computer,
              screentype, protocol, editor, zoomtype, availableforchat, quietnode,
              autorejoin, confaccess, areaname, uucp, topuploadcps, topdownloadcps, bytelimit
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
              $39, $40, $41
            )
          `, [
            'sysop-user-id', 'sysop', hashedPassword, 'System Operator', 'Server Room', '', '',
            255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, new Date(),
            0, 0, false, false, true, 23, 'Server', 'Amiga Ansi', '/X Zmodem', 'Prompt',
            'QWK', true, false, 1, 'XXX', 'Sysop', false, 0, 0, 0
          ]);
          console.log('  ✓ Sysop user created successfully');
        } else {
          console.log(`  ✓ Sysop user password updated (affected ${updateResult.rowCount} rows)`);
        }
        console.log('[DB Init Step 4/5] ✓ Sysop user initialized');
      } catch (error) {
        console.error('[DB Init Step 4/5] ✗ CRITICAL: Failed to create sysop user:', error);
        console.error('  Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }

      // Step 5: Cleanup duplicates
      try {
        console.log('[DB Init Step 5/5] Cleaning up duplicate data...');
        await this.cleanupDuplicateConferences();
        console.log('[DB Init Step 5/5] ✓ Duplicate cleanup completed');
      } catch (error) {
        console.error('[DB Init Step 5/5] ✗ Failed to cleanup duplicates:', error);
        // Don't throw - this is non-critical
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✓ Database initialization completed successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('✗ CRITICAL: Database initialization failed');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      // Don't throw error - continue with server startup
      console.log('⚠️  Continuing with server startup despite database initialization error');
      console.log('⚠️  The BBS may not function correctly. Please check the error above.');
    } finally {
      client.release();
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
        WHERE conferenceid NOT IN (SELECT id FROM conferences)
      `);

      // Delete file areas that reference non-existent conferences
      const deletedFA = await client.query(`
        DELETE FROM file_areas
        WHERE conferenceid NOT IN (SELECT id FROM conferences)
      `);

      if (deletedMB.rowCount > 0 || deletedFA.rowCount > 0) {
        console.log(`Cleaned up ${deletedMB.rowCount} orphaned message bases and ${deletedFA.rowCount} orphaned file areas`);
      }
    } finally {
      client.release();
    }
  }

  // Clean up duplicate message bases by name + conferenceId, keeping only the first occurrence
  async cleanupDuplicateMessageBases(): Promise<void> {
    const client = await this.pool.connect();
    try {
      console.log('Cleaning up duplicate message bases...');

      // Find duplicate message base names within the same conference
      const duplicates = await client.query(`
        SELECT name, conferenceid, COUNT(*) as count
        FROM message_bases
        GROUP BY name, conferenceid
        HAVING COUNT(*) > 1
      `);

      if (duplicates.rows.length > 0) {
        console.log(`Found ${duplicates.rows.length} message base combinations with duplicates`);

        let totalDeleted = 0;
        for (const dup of duplicates.rows) {
          // Get all IDs for this message base name + conference combination, ordered by creation date
          const ids = await client.query(`
            SELECT id FROM message_bases
            WHERE name = $1 AND conferenceid = $2
            ORDER BY created ASC
          `, [dup.name, dup.conferenceid]);

          // Keep the first one, delete the rest
          const idsToDelete = ids.rows.slice(1).map((row: any) => row.id);

          if (idsToDelete.length > 0) {
            await client.query(
              `DELETE FROM message_bases WHERE id = ANY($1)`,
              [idsToDelete]
            );
            console.log(`Deleted ${idsToDelete.length} duplicate entries for message base: ${dup.name} in conference ${dup.conferenceid}`);
            totalDeleted += idsToDelete.length;
          }
        }

        console.log(`✅ Total duplicate message bases deleted: ${totalDeleted}`);
      } else {
        console.log('No duplicate message bases found');
      }
    } finally {
      client.release();
    }
  }

  // Bulletin management
  async createBulletin(bulletin: { conferenceId: number; filename: string; title: string }): Promise<number> {
    const client = await this.pool.connect();
    try {
      const sql = `
        INSERT INTO bulletins (conferenceid, filename, title)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const result = await client.query(sql, [bulletin.conferenceId, bulletin.filename, bulletin.title]);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getBulletins(conferenceId?: number): Promise<Bulletin[]> {
    const client = await this.pool.connect();
    try {
      let sql: string;
      let params: any[];

      if (conferenceId !== undefined) {
        sql = `SELECT * FROM bulletins WHERE conferenceid = $1 ORDER BY created DESC`;
        params = [conferenceId];
      } else {
        sql = `SELECT * FROM bulletins ORDER BY created DESC`;
        params = [];
      }

      const result = await client.query(sql, params);
      return result.rows.map((row: any) => ({
        id: row.id,
        conferenceId: row.conferenceid,
        filename: row.filename,
        title: row.title,
        created: row.created,
        updated: row.updated
      }));
    } finally {
      client.release();
    }
  }

  async getBulletinById(id: number): Promise<Bulletin | null> {
    const client = await this.pool.connect();
    try {
      const sql = `SELECT * FROM bulletins WHERE id = $1`;
      const result = await client.query(sql, [id]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        conferenceId: row.conferenceid,
        filename: row.filename,
        title: row.title,
        created: row.created,
        updated: row.updated
      };
    } finally {
      client.release();
    }
  }

  async deleteBulletin(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `DELETE FROM bulletins WHERE id = $1`;
      await client.query(sql, [id]);
    } finally {
      client.release();
    }
  }

}

// Export singleton instance
export const db = new Database();