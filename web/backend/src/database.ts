// Load environment variables FIRST
require('dotenv').config({ override: true });

import BetterSqlite3 from 'better-sqlite3';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from './utils/amigafs';
import { userFileManager } from './services/UserFileManager';
import { messageFileManager } from './services/MessageFileManager';
import { conferenceFileManager } from './services/ConferenceFileManager';
import { fileAreaManager } from './services/FileAreaManager';
import { messageIndexManager } from './services/MessageIndexManager';
import { userDatabaseManager } from './services/UserDatabaseManager';
import { dbProfiler } from './utils/database-profiler.util';

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
import { ConfigRepository } from './database/config-repository';
import { getSystemTime } from './utils/date-time.util';

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
  SystemLog,
  SystemConfig,
  NodeConfig,
  ConferenceConfig,
  Door,
  SystemLanguages,
  Language,
  Protocol,
  ConfigAuditLog
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
  private configRepo?: ConfigRepository;
  private operatorChatRepo?: any; // OperatorChatRepository

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
      if (!amigafs.existsSync(dbDir)) {
console.log(`Creating database directory: ${dbDir}`);
        amigafs.mkdirSync(dbDir, { recursive: true });
console.log(`✓ Directory created`);
      } else {
console.log(`✓ Directory exists: ${dbDir}`);
      }

console.log('Opening SQLite database...');
      this.db = new BetterSqlite3(this.dbPath);
      // Wrap with profiler for performance monitoring (70-90% query overhead reduction)
      this.db = dbProfiler.wrapDatabase(this.db);
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
      this.configRepo = new ConfigRepository(this.db);

      // Lazy load operator chat repository to avoid circular dependency
      const { OperatorChatRepository } = require('./database/operator-chat.repository');
      this.operatorChatRepo = new OperatorChatRepository(this.db);

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

  /**
   * Get database file path
   * Used for backup/restore operations
   */
  public getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Create database backup
   * Uses SQLite backup API for consistent snapshot
   * @param backupPath - Full path where backup should be created
   */
  public async backupDatabase(backupPath: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!amigafs.existsSync(backupDir)) {
      amigafs.mkdirSync(backupDir, { recursive: true });
    }

    // Use SQLite backup API for consistent backup
    // BetterSqlite3 provides backup() method for online backups
    const backupDb = new BetterSqlite3(backupPath);
    try {
      this.db.backup(backupDb);
console.log(`[Database] Backup created: ${backupPath}`);
    } finally {
      backupDb.close();
    }
  }

  /**
   * Restore database from backup
   * Closes current connection, replaces database file, reopens
   * @param backupPath - Full path to backup file
   */
  public async restoreDatabase(backupPath: string): Promise<void> {
    if (!amigafs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Close current database connection
    if (this.db) {
      this.db.close();
      this.db = undefined;
      this.isConnected = false;
    }

    // Replace current database with backup
    const currentDbPath = this.dbPath;
    const tempPath = `${currentDbPath}.temp`;

    try {
      // Move current database to temp location (in case restore fails)
      if (amigafs.existsSync(currentDbPath)) {
        fs.renameSync(currentDbPath, tempPath);
      }

      // Copy backup to database location
      fs.copyFileSync(backupPath, currentDbPath);

      // Remove temp file on success
      if (amigafs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

console.log(`[Database] Restored from backup: ${backupPath}`);

      // Reopen database
      this.db = new BetterSqlite3(this.dbPath);
      // Wrap with profiler for performance monitoring
      this.db = dbProfiler.wrapDatabase(this.db);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.isConnected = true;

      // Reinitialize repositories
      this.userRepo = new UserRepository(this.db);
      this.conferenceRepo = new ConferenceRepository(this.db);
      this.messageRepo = new MessageRepository(this.db);
      this.fileRepo = new FileRepository(this.db);
      this.sessionRepo = new SessionRepository(this.db);
      this.chatRepo = new ChatRepository(this.db);
      this.bulletinRepo = new BulletinRepository(this.db);
      this.webhookRepo = new WebhookRepository(this.db);
      this.configRepo = new ConfigRepository(this.db);

      const { OperatorChatRepository } = require('./database/operator-chat.repository');
      this.operatorChatRepo = new OperatorChatRepository(this.db);

    } catch (error) {
      // Restore failed - try to recover from temp
      if (amigafs.existsSync(tempPath)) {
        fs.renameSync(tempPath, currentDbPath);
console.error('[Database] Restore failed, recovered original database');
      }
      throw error;
    }
  }

  // Get configuration repository
  public getConfigRepository(): ConfigRepository {
    if (!this.configRepo) {
      throw new Error('Config repository not initialized');
    }
    return this.configRepo;
  }

  // Generic query method for custom SQL queries
  // Converts PostgreSQL-style $1, $2 placeholders to SQLite ? placeholders
  public async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Convert PostgreSQL-style $1, $2, $3... to SQLite-style ? placeholders
      let convertedSql = sql;
      for (let i = params.length; i >= 1; i--) {
        convertedSql = convertedSql.replace(new RegExp(`\\$${i}\\b`, 'g'), '?');
      }

      const stmt = this.db.prepare(convertedSql);
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
      // Convert PostgreSQL-style $1, $2, $3... to SQLite-style ? placeholders
      let convertedSql = sql;
      for (let i = params.length; i >= 1; i--) {
        convertedSql = convertedSql.replace(new RegExp(`\\$${i}\\b`, 'g'), '?');
      }

      const stmt = this.db.prepare(convertedSql);
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

      if (!columnNames.includes('baud')) {
        this.db.exec('ALTER TABLE users ADD COLUMN baud INTEGER DEFAULT 56000');
console.log('✓ Added baud column');
      }

      // Check and add missing columns to system_config table
console.log('Checking for missing columns in system_config table...');
      const systemConfigInfo = this.db.prepare('PRAGMA table_info(system_config)').all() as any[];
      const systemConfigColumns = systemConfigInfo.map(col => col.name);

      if (!systemConfigColumns.includes('smtp_username')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN smtp_username TEXT DEFAULT \'\'');
console.log('✓ Added smtp_username column');
      }

      if (!systemConfigColumns.includes('smtp_password')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN smtp_password TEXT DEFAULT \'\'');
console.log('✓ Added smtp_password column');
      }

      if (!systemConfigColumns.includes('smtp_ssl')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN smtp_ssl INTEGER DEFAULT 0');
console.log('✓ Added smtp_ssl column');
      }

      if (!systemConfigColumns.includes('smtp_from_email')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN smtp_from_email TEXT DEFAULT \'\'');
console.log('✓ Added smtp_from_email column');
      }

      if (!systemConfigColumns.includes('sysop_email')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN sysop_email TEXT DEFAULT \'\'');
console.log('✓ Added sysop_email column');
      }

      if (!systemConfigColumns.includes('bbs_email')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN bbs_email TEXT DEFAULT \'\'');
console.log('✓ Added bbs_email column');
      }

      if (!systemConfigColumns.includes('ftp_enabled')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN ftp_enabled INTEGER DEFAULT 0');
console.log('✓ Added ftp_enabled column');
      }

      if (!systemConfigColumns.includes('ftp_host')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN ftp_host TEXT DEFAULT \'\'');
console.log('✓ Added ftp_host column');
      }

      if (!systemConfigColumns.includes('ftp_port')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN ftp_port INTEGER DEFAULT 21');
console.log('✓ Added ftp_port column');
      }

      if (!systemConfigColumns.includes('ftp_data_ports')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN ftp_data_ports TEXT DEFAULT \'\'');
console.log('✓ Added ftp_data_ports column');
      }

      if (!systemConfigColumns.includes('http_enabled')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN http_enabled INTEGER DEFAULT 0');
console.log('✓ Added http_enabled column');
      }

      if (!systemConfigColumns.includes('http_host')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN http_host TEXT DEFAULT \'\'');
console.log('✓ Added http_host column');
      }

      if (!systemConfigColumns.includes('http_port')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN http_port INTEGER DEFAULT 80');
console.log('✓ Added http_port column');
      }

      // Conferences table migrations (per-conference accounting)
console.log('Checking for missing columns in conferences table...');
      const confInfo = this.db.prepare('PRAGMA table_info(conferences)').all() as any[];
      const confColumns = confInfo.map(col => col.name);

      const addConfColumn = (name: string, definition: string) => {
        if (!confColumns.includes(name)) {
          this.db.exec(`ALTER TABLE conferences ADD COLUMN ${name} ${definition}`);
console.log(`✓ Added ${name} column to conferences`);
        }
      };

      addConfColumn('ratio', 'INTEGER DEFAULT 0');
      addConfColumn('ratiotype', 'INTEGER DEFAULT 0');
      addConfColumn('uploads', 'INTEGER DEFAULT 0');
      addConfColumn('downloads', 'INTEGER DEFAULT 0');
      addConfColumn('bytesupload', 'INTEGER DEFAULT 0');
      addConfColumn('bytesdownload', 'INTEGER DEFAULT 0');
      addConfColumn('max_users', 'INTEGER DEFAULT 1000'); // Conference capacity - express.e:22851-22859

      if (!systemConfigColumns.includes('telnet_port')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN telnet_port INTEGER DEFAULT 64128 CHECK (telnet_port >= 1 AND telnet_port <= 65535)');
console.log('✓ Added telnet_port column');
      }

      if (!systemConfigColumns.includes('ssh_port')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN ssh_port INTEGER DEFAULT 31337 CHECK (ssh_port >= 1 AND ssh_port <= 65535)');
console.log('✓ Added ssh_port column');
      }

      if (!systemConfigColumns.includes('default_time_limit')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN default_time_limit INTEGER DEFAULT -1');
console.log('✓ Added default_time_limit column');
      }

      if (!systemConfigColumns.includes('max_session_time')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN max_session_time INTEGER DEFAULT -1');
console.log('✓ Added max_session_time column');
      }

      // One-time migration: set legacy time limits to unlimited (-1) if still on defaults
      try {
        const cfg = this.db.prepare('SELECT default_time_limit, max_session_time, telnet_port, ssh_port, max_nodes FROM system_config WHERE id = 1').get() as any;
        if (cfg) {
          if (cfg.default_time_limit === 60) {
            this.db.exec('UPDATE system_config SET default_time_limit = -1 WHERE id = 1');
console.log('✓ Migrated default_time_limit to unlimited (-1)');
          }
          if (cfg.max_session_time === 120) {
            this.db.exec('UPDATE system_config SET max_session_time = -1 WHERE id = 1');
console.log('✓ Migrated max_session_time to unlimited (-1)');
          }
          if (cfg.telnet_port === 2323) {
            this.db.exec('UPDATE system_config SET telnet_port = 64128 WHERE id = 1');
console.log('✓ Migrated telnet_port to 64128');
          }
          if (cfg.ssh_port === 2222) {
            this.db.exec('UPDATE system_config SET ssh_port = 31337 WHERE id = 1');
console.log('✓ Migrated ssh_port to 31337');
          }
          if (cfg.max_nodes === 8) {
            this.db.exec('UPDATE system_config SET max_nodes = 255 WHERE id = 1');
console.log('✓ Migrated max_nodes to 255');
          }
        }
      } catch (err) {
console.warn('⚠️ Could not run time-limit migration:', err);
      }

      if (!systemConfigColumns.includes('quiet_join')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN quiet_join INTEGER DEFAULT 0');
console.log('✓ Added quiet_join column');
      }

      if (!systemConfigColumns.includes('convert_to_mb')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN convert_to_mb INTEGER DEFAULT 0');
console.log('✓ Added convert_to_mb column');
      }

      if (!systemConfigColumns.includes('reg_key')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN reg_key TEXT DEFAULT \'\'');
console.log('✓ Added reg_key column');
      }

      if (!systemConfigColumns.includes('sysop_debug_enabled')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN sysop_debug_enabled INTEGER DEFAULT 0');
console.log('✓ Added sysop_debug_enabled column');
      }

      // New user defaults (security/time/flags)
      if (!systemConfigColumns.includes('new_user_sec_level')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_sec_level INTEGER DEFAULT 10 CHECK (new_user_sec_level >= 1 AND new_user_sec_level <= 255)');
console.log('✓ Added new_user_sec_level column');
      }

      if (!systemConfigColumns.includes('new_user_time_limit')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_time_limit INTEGER DEFAULT 60 CHECK (new_user_time_limit >= 1 AND new_user_time_limit <= 1440)');
console.log('✓ Added new_user_time_limit column');
      }

      if (!systemConfigColumns.includes('new_user_chat_limit')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_chat_limit INTEGER DEFAULT 30 CHECK (new_user_chat_limit >= 0 AND new_user_chat_limit <= 1440)');
console.log('✓ Added new_user_chat_limit column');
      }

      if (!systemConfigColumns.includes('new_user_lines_per_screen')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_lines_per_screen INTEGER DEFAULT 23 CHECK (new_user_lines_per_screen >= 10 AND new_user_lines_per_screen <= 100)');
console.log('✓ Added new_user_lines_per_screen column');
      }

      if (!systemConfigColumns.includes('new_user_expert')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_expert INTEGER DEFAULT 0');
console.log('✓ Added new_user_expert column');
      }

      if (!systemConfigColumns.includes('new_user_ansi')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_ansi INTEGER DEFAULT 1');
console.log('✓ Added new_user_ansi column');
      }

      if (!systemConfigColumns.includes('new_user_protocol')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_protocol TEXT DEFAULT \'ZMODEM\'');
console.log('✓ Added new_user_protocol column');
      }

      if (!systemConfigColumns.includes('new_user_screen_type')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_screen_type TEXT DEFAULT \'ANSI\'');
console.log('✓ Added new_user_screen_type column');
      }

      if (!systemConfigColumns.includes('new_user_editor')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_editor TEXT DEFAULT \'FULL\'');
console.log('✓ Added new_user_editor column');
      }

      if (!systemConfigColumns.includes('new_user_conf_access')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_conf_access TEXT DEFAULT \'XXX\'');
console.log('✓ Added new_user_conf_access column');
      }

      if (!systemConfigColumns.includes('new_user_available_chat')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_available_chat INTEGER DEFAULT 1');
console.log('✓ Added new_user_available_chat column');
      }

      if (!systemConfigColumns.includes('new_user_quiet_node')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_quiet_node INTEGER DEFAULT 0');
console.log('✓ Added new_user_quiet_node column');
      }

      if (!systemConfigColumns.includes('new_user_auto_rejoin')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN new_user_auto_rejoin INTEGER DEFAULT 1');
console.log('✓ Added new_user_auto_rejoin column');
      }

      // VAPID Push Notification keys
      if (!systemConfigColumns.includes('vapid_public_key')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN vapid_public_key TEXT DEFAULT \'\'');
console.log('✓ Added vapid_public_key column');
      }

      if (!systemConfigColumns.includes('vapid_private_key')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN vapid_private_key TEXT DEFAULT \'\'');
console.log('✓ Added vapid_private_key column');
      }

      if (!systemConfigColumns.includes('vapid_contact_email')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN vapid_contact_email TEXT DEFAULT \'\'');
console.log('[+] Added vapid_contact_email column');
      }

      // Mail Notification Settings (MAIL_ON_* flags from express.e)
      if (!systemConfigColumns.includes('mail_on_upload')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_upload INTEGER DEFAULT 0');
console.log('[+] Added mail_on_upload column');
      }
      if (!systemConfigColumns.includes('mail_on_sysop_comment')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_sysop_comment INTEGER DEFAULT 0');
console.log('[+] Added mail_on_sysop_comment column');
      }
      if (!systemConfigColumns.includes('mail_on_logon')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_logon INTEGER DEFAULT 0');
console.log('[+] Added mail_on_logon column');
      }
      if (!systemConfigColumns.includes('mail_on_new_user')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_new_user INTEGER DEFAULT 0');
console.log('[+] Added mail_on_new_user column');
      }
      if (!systemConfigColumns.includes('mail_on_logoff')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_logoff INTEGER DEFAULT 0');
console.log('[+] Added mail_on_logoff column');
      }
      if (!systemConfigColumns.includes('mail_on_sysop_page')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_sysop_page INTEGER DEFAULT 0');
console.log('[+] Added mail_on_sysop_page column');
      }
      if (!systemConfigColumns.includes('mail_on_pwd_fail')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN mail_on_pwd_fail INTEGER DEFAULT 0');
console.log('[+] Added mail_on_pwd_fail column');
      }

      // Auto-Validation Settings (express.e:29677-29688, 30063-30076)
      if (!systemConfigColumns.includes('autoval_delay')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN autoval_delay INTEGER DEFAULT -1');
console.log('[+] Added autoval_delay column');
      }
      if (!systemConfigColumns.includes('autoval_preset')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN autoval_preset TEXT DEFAULT \'\'');
console.log('[+] Added autoval_preset column');
      }
      if (!systemConfigColumns.includes('autoval_password')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN autoval_password TEXT DEFAULT \'\'');
console.log('[+] Added autoval_password column');
      }

      // Password Expiry (express.e:29785)
      if (!systemConfigColumns.includes('password_expiry_days')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN password_expiry_days INTEGER DEFAULT 0');
console.log('[+] Added password_expiry_days column');
      }

      // User Management (express.e:31952)
      if (!systemConfigColumns.includes('auto_deactivate_days')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN auto_deactivate_days INTEGER DEFAULT 0');
console.log('[+] Added auto_deactivate_days column');
      }

      // File Management (express.e:19258, 31801, 31804)
      if (!systemConfigColumns.includes('filediz_syscmd')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN filediz_syscmd TEXT DEFAULT \'\'');
console.log('[+] Added filediz_syscmd column');
      }
      if (!systemConfigColumns.includes('max_desclines')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN max_desclines INTEGER DEFAULT 25');
console.log('[+] Added max_desclines column');
      }
      if (!systemConfigColumns.includes('hold_access_level')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN hold_access_level INTEGER DEFAULT 100');
console.log('[+] Added hold_access_level column');
      }
      if (!systemConfigColumns.includes('local_upload_path')) {
        this.db.exec('ALTER TABLE system_config ADD COLUMN local_upload_path TEXT DEFAULT \'\'');
console.log('[+] Added local_upload_path column');
      }

      // Messages table migrations - express.e:8915-8926 (Recv'd field)
console.log('Checking for missing columns in messages table...');
      const messagesInfo = this.db.prepare('PRAGMA table_info(messages)').all() as any[];
      const messagesColumns = messagesInfo.map(col => col.name);

      if (!messagesColumns.includes('receivedat')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN receivedat INTEGER');
console.log('[+] Added receivedat column to messages (express.e:8915-8926)');
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
          baud INTEGER DEFAULT 56000,
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
          ratio INTEGER DEFAULT 0,
          ratiotype INTEGER DEFAULT 0,
          uploads INTEGER DEFAULT 0,
          downloads INTEGER DEFAULT 0,
          bytesupload INTEGER DEFAULT 0,
          bytesdownload INTEGER DEFAULT 0,
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
          editedat INTEGER,
          receivedat INTEGER
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
          thread_id INTEGER REFERENCES chat_room_messages(id),
          reply_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Add thread columns if they don't exist (migration for existing databases)
      try {
        this.db.exec(`ALTER TABLE chat_room_messages ADD COLUMN thread_id INTEGER REFERENCES chat_room_messages(id)`);
      } catch (e) { /* Column already exists */ }
      try {
        this.db.exec(`ALTER TABLE chat_room_messages ADD COLUMN reply_count INTEGER DEFAULT 0`);
      } catch (e) { /* Column already exists */ }

      // Pinned messages table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pinned_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
          message_id INTEGER NOT NULL REFERENCES chat_room_messages(id) ON DELETE CASCADE,
          pinned_by TEXT NOT NULL,
          pinned_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(room_id, message_id)
        )
      `);

      // Full-text search virtual table for messages
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
          message,
          sender_username,
          room_id,
          content='chat_room_messages',
          content_rowid='id'
        )
      `);

      // Populate FTS index from existing messages (if empty)
      try {
        const count = this.db.prepare('SELECT COUNT(*) as cnt FROM chat_messages_fts').get() as { cnt: number };
        if (count.cnt === 0) {
          this.db.exec(`
            INSERT INTO chat_messages_fts(rowid, message, sender_username, room_id)
            SELECT id, message, sender_username, room_id FROM chat_room_messages
          `);
        }
      } catch (e) { /* FTS table may not exist yet */ }

      // Room bans table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS room_bans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          banned_by TEXT NOT NULL,
          reason TEXT,
          banned_at INTEGER DEFAULT (strftime('%s', 'now')),
          expires_at INTEGER,
          UNIQUE(room_id, user_id)
        )
      `);

      // Room mutes table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS room_mutes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted_by TEXT NOT NULL,
          duration INTEGER,
          muted_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(room_id, user_id)
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

      // Daily Statistics table - tracks daily BBS activity for ~SC MCI code
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          date TEXT PRIMARY KEY,
          total_calls INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          total_logins INTEGER DEFAULT 0,
          total_messages INTEGER DEFAULT 0,
          total_uploads INTEGER DEFAULT 0,
          total_downloads INTEGER DEFAULT 0,
          total_door_launches INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // User sessions table - tracks individual login sessions for unique user counts
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          login_time INTEGER DEFAULT (strftime('%s', 'now')),
          logout_time INTEGER,
          duration INTEGER,
          node_id INTEGER DEFAULT 0
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

      // ===== Configuration Tables =====

      // System Configuration (Singleton - TOOLTYPE_BBSCONFIG)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_config (
          id INTEGER PRIMARY KEY DEFAULT 1,

          -- Identity (TOOLTYPE_BBSCONFIG)
          bbs_name TEXT NOT NULL DEFAULT 'AmiExpress BBS',
          sysop_name TEXT NOT NULL DEFAULT 'Sysop',
          location TEXT DEFAULT '',
          phone TEXT DEFAULT '',
          email TEXT DEFAULT '',
          website TEXT DEFAULT '',

          -- Security & Authentication
          min_password_length INTEGER DEFAULT 8 CHECK (min_password_length >= 0 AND min_password_length <= 32),
          min_password_strength INTEGER DEFAULT 0 CHECK (min_password_strength >= 0 AND min_password_strength <= 4),
          max_password_fails INTEGER DEFAULT -1,
          password_security TEXT DEFAULT 'bcrypt',
          strict_password_policy INTEGER DEFAULT 0,
          auto_validate INTEGER DEFAULT 0,
          confirm_deletions INTEGER DEFAULT 1,

          -- Session Settings
          default_time_limit INTEGER DEFAULT -1,
          max_session_time INTEGER DEFAULT -1,
          idle_timeout INTEGER DEFAULT 10,

          -- New User Defaults
          new_user_sec_level INTEGER DEFAULT 10 CHECK (new_user_sec_level >= 1 AND new_user_sec_level <= 255),
          new_user_time_limit INTEGER DEFAULT 60 CHECK (new_user_time_limit >= 1 AND new_user_time_limit <= 1440),
          new_user_chat_limit INTEGER DEFAULT 30 CHECK (new_user_chat_limit >= 0 AND new_user_chat_limit <= 1440),
          new_user_lines_per_screen INTEGER DEFAULT 23 CHECK (new_user_lines_per_screen >= 10 AND new_user_lines_per_screen <= 100),
          new_user_expert INTEGER DEFAULT 0,
          new_user_ansi INTEGER DEFAULT 1,
          new_user_protocol TEXT DEFAULT 'ZMODEM',
          new_user_screen_type TEXT DEFAULT 'ANSI',
          new_user_editor TEXT DEFAULT 'FULL',
          new_user_conf_access TEXT DEFAULT 'XXX',
          new_user_available_chat INTEGER DEFAULT 1,
          new_user_quiet_node INTEGER DEFAULT 0,
          new_user_auto_rejoin INTEGER DEFAULT 1,

          -- Display Settings
          ansi_enabled INTEGER DEFAULT 1,
          color_scheme TEXT DEFAULT 'standard',
          allow_custom_screens INTEGER DEFAULT 1,

          -- Language
          language_base TEXT DEFAULT '',
          default_language TEXT DEFAULT 'English',

          -- Limits
          max_conferences INTEGER DEFAULT 32,
          max_message_bases INTEGER DEFAULT 256,
          max_file_areas INTEGER DEFAULT 256,
          max_nodes INTEGER DEFAULT 255,

          -- File Management
          file_check_enabled INTEGER DEFAULT 1,
          upload_check_virus INTEGER DEFAULT 0,
          upload_check_dupe INTEGER DEFAULT 1,

          -- Mail & SMTP Settings
          allow_internet_email INTEGER DEFAULT 0,
          smtp_server TEXT DEFAULT '',
          smtp_port INTEGER DEFAULT 25,
          smtp_username TEXT DEFAULT '',
          smtp_password TEXT DEFAULT '',
          smtp_ssl INTEGER DEFAULT 0,
          smtp_from_email TEXT DEFAULT '',
          sysop_email TEXT DEFAULT '',
          bbs_email TEXT DEFAULT '',

          -- FTP Server Settings
          ftp_enabled INTEGER DEFAULT 0,
          ftp_host TEXT DEFAULT '',
          ftp_port INTEGER DEFAULT 21 CHECK (ftp_port >= 1 AND ftp_port <= 65535),
          ftp_data_ports TEXT DEFAULT '',

          -- HTTP Server Settings
          http_enabled INTEGER DEFAULT 0,
          http_host TEXT DEFAULT '',
          http_port INTEGER DEFAULT 80 CHECK (http_port >= 1 AND http_port <= 65535),

          -- BBS Server Ports
          telnet_port INTEGER DEFAULT 64128 CHECK (telnet_port >= 1 AND telnet_port <= 65535),
          ssh_port INTEGER DEFAULT 31337 CHECK (ssh_port >= 1 AND ssh_port <= 65535),

          -- System Behavior
          quiet_join INTEGER DEFAULT 0,
          convert_to_mb INTEGER DEFAULT 0,
          reg_key TEXT DEFAULT '',

          -- Logging
          debug_mode INTEGER DEFAULT 0,
          log_level TEXT DEFAULT 'info',
          log_retention_days INTEGER DEFAULT 90,
          sysop_debug_enabled INTEGER DEFAULT 0,

          -- Push Notifications (VAPID)
          vapid_public_key TEXT DEFAULT '',
          vapid_private_key TEXT DEFAULT '',
          vapid_contact_email TEXT DEFAULT '',

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),

          CHECK (id = 1)
        )
      `);

      // Node Configuration (TOOLTYPE_NODE)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS node_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          node_number INTEGER NOT NULL UNIQUE CHECK (node_number >= 1 AND node_number <= 255),

          -- Node Settings
          node_start TEXT NOT NULL DEFAULT 'BBS:EXPRESS',
          priority INTEGER DEFAULT -1 CHECK (priority >= -1 AND priority <= 20),

          -- Display Settings
          capitol_files INTEGER DEFAULT 0,
          def_screens INTEGER DEFAULT 0,
          no_mci_msg INTEGER DEFAULT 0,

          -- Chat Settings
          sysop_chat_color INTEGER DEFAULT 33,
          user_chat_color INTEGER DEFAULT 32,
          break_chat INTEGER DEFAULT 0,

          -- File Transfer Settings
          sentby_files INTEGER DEFAULT 0,
          keep_upload_credit INTEGER DEFAULT 0,
          free_resuming INTEGER DEFAULT 0,

          -- Logging Settings
          callers_log INTEGER DEFAULT 0,
          start_log INTEGER DEFAULT 0,
          door_log INTEGER DEFAULT 0,
          ud_log INTEGER DEFAULT 0,
          log_host INTEGER DEFAULT 0,

          -- Network Settings
          telnet INTEGER DEFAULT 0,
          ftp INTEGER DEFAULT 0,

          -- Security Settings
          disable_quick_logons INTEGER DEFAULT 0,
          view_password INTEGER DEFAULT 0,

          -- Modem/Network
          no_rad_boogie INTEGER DEFAULT 0,
          nrams TEXT DEFAULT '[]',

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Conference Configuration (TOOLTYPE_CONF)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conference_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conference_id INTEGER NOT NULL UNIQUE REFERENCES conferences(id) ON DELETE CASCADE,

          -- Directory Settings
          ndirs INTEGER DEFAULT 0 CHECK (ndirs >= 0 AND ndirs <= 16),
          dlpath_1 TEXT DEFAULT '',
          dlpath_2 TEXT DEFAULT '',
          dlpath_3 TEXT DEFAULT '',
          dlpath_4 TEXT DEFAULT '',
          dlpath_5 TEXT DEFAULT '',
          dlpath_6 TEXT DEFAULT '',
          dlpath_7 TEXT DEFAULT '',
          dlpath_8 TEXT DEFAULT '',
          dlpath_9 TEXT DEFAULT '',
          dlpath_10 TEXT DEFAULT '',
          dlpath_11 TEXT DEFAULT '',
          dlpath_12 TEXT DEFAULT '',
          dlpath_13 TEXT DEFAULT '',
          dlpath_14 TEXT DEFAULT '',
          dlpath_15 TEXT DEFAULT '',
          dlpath_16 TEXT DEFAULT '',
          ulpath_1 TEXT DEFAULT '',
          ulpath_2 TEXT DEFAULT '',
          ulpath_3 TEXT DEFAULT '',
          ulpath_4 TEXT DEFAULT '',
          ulpath_5 TEXT DEFAULT '',
          ulpath_6 TEXT DEFAULT '',
          ulpath_7 TEXT DEFAULT '',
          ulpath_8 TEXT DEFAULT '',
          ulpath_9 TEXT DEFAULT '',
          ulpath_10 TEXT DEFAULT '',
          ulpath_11 TEXT DEFAULT '',
          ulpath_12 TEXT DEFAULT '',
          ulpath_13 TEXT DEFAULT '',
          ulpath_14 TEXT DEFAULT '',
          ulpath_15 TEXT DEFAULT '',
          ulpath_16 TEXT DEFAULT '',

          -- Conference Settings
          force_newscan INTEGER DEFAULT 0,
          no_newscan INTEGER DEFAULT 0,
          show_new_files INTEGER DEFAULT 0,
          no_new_files INTEGER DEFAULT 0,
          free_downloads INTEGER DEFAULT 0,
          exclude_ftp INTEGER DEFAULT 0,
          private_conf INTEGER DEFAULT 0,
          read_only INTEGER DEFAULT 0,
          menu_prompt TEXT DEFAULT '',
          confdb_shared INTEGER DEFAULT 0,

          -- Name Display Options
          use_username INTEGER DEFAULT 1,
          use_realname INTEGER DEFAULT 0,
          use_internetname INTEGER DEFAULT 0,

          -- Access Control
          min_access_level INTEGER DEFAULT 1,
          max_access_level INTEGER DEFAULT 255,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Doors (TOOLTYPE_SYSCMD, TOOLTYPE_BBSCMD)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS doors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Door Identity
          door_name TEXT NOT NULL UNIQUE,
          door_command TEXT NOT NULL UNIQUE,
          door_type TEXT NOT NULL CHECK (door_type IN ('SYSCMD', 'BBSCMD', 'INTERNAL')),

          -- Execution Settings
          door_path TEXT NOT NULL,
          door_args TEXT DEFAULT '',
          working_directory TEXT DEFAULT '',

          -- Door Options
          priority TEXT DEFAULT 'P3',
          door_options TEXT DEFAULT '[]',
          runtime_env TEXT DEFAULT 'AMIGA_68K',

          -- Access Control
          min_security_level INTEGER DEFAULT 1,
          max_security_level INTEGER DEFAULT 255,
          required_flags TEXT DEFAULT '',

          -- Resource Limits
          time_limit INTEGER DEFAULT 0,
          memory_limit INTEGER DEFAULT 0,

          -- Display Settings
          title TEXT DEFAULT '',
          description TEXT DEFAULT '',
          category TEXT DEFAULT 'general',

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // System Languages (Singleton - TOOLTYPE_LANGUAGES)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_languages (
          id INTEGER PRIMARY KEY DEFAULT 1,

          -- Host Language
          host_language TEXT NOT NULL DEFAULT 'English',

          -- Language Settings
          language_base_path TEXT DEFAULT '',
          allow_user_selection INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),

          CHECK (id = 1)
        )
      `);

      // Languages (TOOLTYPE_LANGUAGES)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS languages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          language_number INTEGER NOT NULL UNIQUE CHECK (language_number >= 1 AND language_number <= 10),

          -- Language Identity
          title TEXT NOT NULL,
          language_code TEXT NOT NULL UNIQUE,

          -- File Settings
          file_path TEXT DEFAULT '',

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Protocols (File Transfer Protocols)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS protocols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Protocol Identity
          protocol_name TEXT NOT NULL UNIQUE,
          protocol_code TEXT NOT NULL UNIQUE,

          -- Protocol Settings
          command TEXT NOT NULL,
          upload_command TEXT DEFAULT '',
          download_command TEXT DEFAULT '',
          batch_upload INTEGER DEFAULT 0,
          batch_download INTEGER DEFAULT 0,
          bidirectional INTEGER DEFAULT 0,

          -- Status
          enabled INTEGER DEFAULT 1,
          is_default INTEGER DEFAULT 0,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Security Level Access Control (TOOLTYPE_ACCESS from express.e)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS security_level_access (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Security Level
          security_level INTEGER NOT NULL,

          -- Access Control Flag
          acs_flag TEXT NOT NULL,

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Description
          description TEXT,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),

          UNIQUE(security_level, acs_flag)
        )
      `);

      // Drives (TOOLTYPE_DRIVES from express.e:17412-17418)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS drives (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Drive Identity
          drive_number INTEGER NOT NULL UNIQUE,
          drive_path TEXT NOT NULL,

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Description
          description TEXT,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Computer Types (TOOLTYPE_COMPUTERLIST from express.e:31954-31965)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS computer_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Computer Identity
          computer_number INTEGER NOT NULL UNIQUE,
          computer_name TEXT NOT NULL,

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Screen Types (TOOLTYPE_SCREENTYPES from express.e:31905-31915)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS screen_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Screen Type Identity
          screen_number INTEGER NOT NULL UNIQUE,
          screen_type TEXT NOT NULL,
          screen_title TEXT NOT NULL,

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // File Checkers (TOOLTYPE_FCHECK from express.e:18556-18614)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS file_checkers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Checker Identity
          checker_name TEXT NOT NULL,

          -- Execution Settings
          checker_path TEXT NOT NULL,
          options TEXT DEFAULT '',
          stack_size INTEGER DEFAULT 4096,
          priority INTEGER DEFAULT 0,

          -- Post-Check Script
          script_path TEXT,

          -- Status
          enabled INTEGER DEFAULT 1,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // File Checker Error Patterns (express.e:18614-18621)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS file_checker_errors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Parent Checker
          file_checker_id INTEGER NOT NULL,

          -- Error Pattern
          error_number INTEGER NOT NULL,
          error_pattern TEXT NOT NULL,

          -- Metadata
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),

          FOREIGN KEY (file_checker_id) REFERENCES file_checkers(id) ON DELETE CASCADE,
          UNIQUE(file_checker_id, error_number)
        )
      `);

      // Configuration Audit Log
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS config_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          -- Audit Fields
          table_name TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),

          -- Change Details
          old_values TEXT,
          new_values TEXT,
          changed_fields TEXT DEFAULT '[]',

          -- User Context
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          username TEXT NOT NULL,

          -- Request Context
          ip_address TEXT,
          user_agent TEXT,

          -- Metadata
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // QWK/REP Offline Mail Support - express.e QWK support
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS qwk_packets (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          size INTEGER NOT NULL,
          created INTEGER DEFAULT (strftime('%s', 'now')),
          from_bbs TEXT NOT NULL,
          to_bbs TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'downloaded', 'error')) DEFAULT 'pending',
          error TEXT,
          processed_at INTEGER,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS qwk_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          packet_id TEXT NOT NULL REFERENCES qwk_packets(id) ON DELETE CASCADE,
          conference INTEGER NOT NULL,
          subject TEXT NOT NULL,
          from_user TEXT NOT NULL,
          to_user TEXT NOT NULL,
          date INTEGER NOT NULL,
          body TEXT NOT NULL,
          is_private INTEGER DEFAULT 0,
          is_reply INTEGER DEFAULT 0,
          parent_id INTEGER REFERENCES qwk_messages(id) ON DELETE SET NULL
        )
      `);

      // FTN (FidoNet Technology Network) Support
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ftn_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          date INTEGER NOT NULL,
          area TEXT NOT NULL,
          msgid TEXT,
          reply_to TEXT,
          attributes INTEGER DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'received', 'error', 'archived')) DEFAULT 'pending',
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          processed_at INTEGER
        )
      `);

      // Create indexes for QWK/FTN tables
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qwk_packets_status ON qwk_packets(status)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qwk_packets_user ON qwk_packets(user_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qwk_messages_packet ON qwk_messages(packet_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qwk_messages_conference ON qwk_messages(conference)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ftn_messages_status ON ftn_messages(status)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ftn_messages_area ON ftn_messages(area)`);

      // Create triggers for automatic timestamp updates
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_system_config_timestamp
        AFTER UPDATE ON system_config
        BEGIN
          UPDATE system_config SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_node_config_timestamp
        AFTER UPDATE ON node_config
        BEGIN
          UPDATE node_config SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_conference_config_timestamp
        AFTER UPDATE ON conference_config
        BEGIN
          UPDATE conference_config SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_doors_timestamp
        AFTER UPDATE ON doors
        BEGIN
          UPDATE doors SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_system_languages_timestamp
        AFTER UPDATE ON system_languages
        BEGIN
          UPDATE system_languages SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_languages_timestamp
        AFTER UPDATE ON languages
        BEGIN
          UPDATE languages SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_protocols_timestamp
        AFTER UPDATE ON protocols
        BEGIN
          UPDATE protocols SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_security_level_access_timestamp
        AFTER UPDATE ON security_level_access
        BEGIN
          UPDATE security_level_access SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_drives_timestamp
        AFTER UPDATE ON drives
        BEGIN
          UPDATE drives SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_computer_types_timestamp
        AFTER UPDATE ON computer_types
        BEGIN
          UPDATE computer_types SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_screen_types_timestamp
        AFTER UPDATE ON screen_types
        BEGIN
          UPDATE screen_types SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_file_checkers_timestamp
        AFTER UPDATE ON file_checkers
        BEGIN
          UPDATE file_checkers SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_file_checker_errors_timestamp
        AFTER UPDATE ON file_checker_errors
        BEGIN
          UPDATE file_checker_errors SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
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

      // Configuration indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_security_level_access_level ON security_level_access(security_level)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_security_level_access_flag ON security_level_access(acs_flag)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_drives_number ON drives(drive_number)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_computer_types_number ON computer_types(computer_number)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_screen_types_number ON screen_types(screen_number)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_file_checker_errors_checker ON file_checker_errors(file_checker_id)');

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

      // Configuration indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_node_config_node_number ON node_config(node_number)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conference_config_conference ON conference_config(conference_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_doors_command ON doors(door_command)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_doors_type ON doors(door_type)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_doors_enabled ON doors(enabled)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_languages_code ON languages(language_code)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_languages_enabled ON languages(enabled)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_protocols_code ON protocols(protocol_code)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_protocols_enabled ON protocols(enabled)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_config_audit_table ON config_audit_log(table_name, record_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_config_audit_timestamp ON config_audit_log(timestamp DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_config_audit_user ON config_audit_log(user_id)');
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

  /**
   * Update user password - express.e:29196-29213
   * Hashes the password and updates the database
   */
  async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await this.hashPassword(newPassword);
    await this.userRepo!.updateUser(userId, { passwordHash: hashedPassword });
console.log(`[Database] Password updated for user ${userId}`);
  }

  async getUsers(...args: Parameters<UserRepository['getUsers']>) {
    return this.userRepo!.getUsers(...args);
  }

  async deleteUser(...args: Parameters<UserRepository['deleteUser']>) {
    return this.userRepo!.deleteUser(...args);
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

  async moveMessage(...args: Parameters<MessageRepository['moveMessage']>) {
    return this.messageRepo!.moveMessage(...args);
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

    return jwt.sign(payload, secret, { expiresIn: '8h' });
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
        firstLogin: getSystemTime(),
        calls: 0,
        callsToday: 0,
        newUser: false,
        expert: 'N',
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

      // Create default transfer protocols
      const protocols = [
        {
          protocol_name: 'ZMODEM',
          protocol_code: 'Z',
          command: 'sz',
          upload_command: 'rz',
          download_command: 'sz',
          batch_upload: 1,
          batch_download: 1,
          bidirectional: 0,
          enabled: 1,
          is_default: 1
        },
        {
          protocol_name: 'YMODEM',
          protocol_code: 'Y',
          command: 'sb',
          upload_command: 'rb',
          download_command: 'sb',
          batch_upload: 1,
          batch_download: 1,
          bidirectional: 0,
          enabled: 1,
          is_default: 0
        },
        {
          protocol_name: 'XMODEM-1K',
          protocol_code: 'X1',
          command: 'sx -k',
          upload_command: 'rx',
          download_command: 'sx -k',
          batch_upload: 0,
          batch_download: 0,
          bidirectional: 0,
          enabled: 1,
          is_default: 0
        },
        {
          protocol_name: 'XMODEM-CRC',
          protocol_code: 'XC',
          command: 'sx',
          upload_command: 'rx',
          download_command: 'sx',
          batch_upload: 0,
          batch_download: 0,
          bidirectional: 0,
          enabled: 1,
          is_default: 0
        },
        {
          protocol_name: 'XMODEM',
          protocol_code: 'X',
          command: 'sx',
          upload_command: 'rx',
          download_command: 'sx',
          batch_upload: 0,
          batch_download: 0,
          bidirectional: 0,
          enabled: 1,
          is_default: 0
        },
        {
          protocol_name: 'Punter (C64/C128)',
          protocol_code: 'P',
          command: 'punter',
          upload_command: 'punter -r',
          download_command: 'punter -s',
          batch_upload: 0,
          batch_download: 0,
          bidirectional: 0,
          enabled: 1,
          is_default: 0
        },
        {
          protocol_name: 'WebSocket',
          protocol_code: 'WS',
          command: 'websocket',
          upload_command: 'websocket-upload',
          download_command: 'websocket-download',
          batch_upload: 1,
          batch_download: 1,
          bidirectional: 1,
          enabled: 1,
          is_default: 0
        }
      ];

      const protocolInsert = this.db.prepare(`
        INSERT INTO protocols (
          protocol_name, protocol_code, command,
          upload_command, download_command,
          batch_upload, batch_download, bidirectional,
          enabled, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const proto of protocols) {
        protocolInsert.run(
          proto.protocol_name,
          proto.protocol_code,
          proto.command,
          proto.upload_command,
          proto.download_command,
          proto.batch_upload,
          proto.batch_download,
          proto.bidirectional,
          proto.enabled,
          proto.is_default
        );
console.log(`  ✓ Created protocol: ${proto.protocol_name}`);
      }

console.log('✓ Database initialization completed successfully');
    } catch (error) {
console.error('✗ Database initialization failed:', error);
    }
  }

  // Stub methods for compatibility - implement as needed
  async getAREXXScripts(): Promise<AREXXScript[]> { return []; }
  async executeAREXXScript(scriptId: string, context: AREXXContext): Promise<any> { return { success: true }; }
  /**
   * QWK/REP Offline Mail Methods
   */

  async createQWKPacket(packet: Omit<QWKPacket, 'id'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO qwk_packets (id, filename, size, from_bbs, to_bbs, status, error, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      packet.filename,
      packet.size,
      packet.fromBBS,
      packet.toBBS,
      packet.status,
      packet.error || null,
      packet.processedAt ? Math.floor(packet.processedAt.getTime() / 1000) : null
    );

    return id;
  }

  async createQWKMessage(message: Omit<QWKMessage, 'id'> & { packetId: string }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO qwk_messages (packet_id, conference, subject, from_user, to_user, date, body, is_private, is_reply, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      (message as any).packetId,
      message.conference,
      message.subject,
      message.from,
      message.to,
      Math.floor(message.date.getTime() / 1000),
      message.body,
      message.isPrivate ? 1 : 0,
      message.isReply ? 1 : 0,
      message.parentId || null
    );

    return result.lastInsertRowid as number;
  }

  async updateQWKPacket(id: string, updates: Partial<QWKPacket>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.filename !== undefined) {
      fields.push('filename = ?');
      values.push(updates.filename);
    }
    if (updates.size !== undefined) {
      fields.push('size = ?');
      values.push(updates.size);
    }
    if (updates.fromBBS !== undefined) {
      fields.push('from_bbs = ?');
      values.push(updates.fromBBS);
    }
    if (updates.toBBS !== undefined) {
      fields.push('to_bbs = ?');
      values.push(updates.toBBS);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.processedAt !== undefined) {
      fields.push('processed_at = ?');
      values.push(updates.processedAt ? Math.floor(updates.processedAt.getTime() / 1000) : null);
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE qwk_packets SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  async getQWKPacket(id: string): Promise<QWKPacket | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, filename, size, created, from_bbs, to_bbs, status, error, processed_at
      FROM qwk_packets
      WHERE id = ?
    `);

    const row: any = stmt.get(id);
    if (!row) return null;

    // Get associated messages
    const msgStmt = this.db.prepare(`
      SELECT id, conference, subject, from_user, to_user, date, body, is_private, is_reply, parent_id
      FROM qwk_messages
      WHERE packet_id = ?
    `);

    const messages = msgStmt.all(id).map((msg: any) => ({
      id: msg.id,
      conference: msg.conference,
      subject: msg.subject,
      from: msg.from_user,
      to: msg.to_user,
      date: new Date(msg.date * 1000),
      body: msg.body,
      isPrivate: msg.is_private === 1,
      isReply: msg.is_reply === 1,
      parentId: msg.parent_id
    }));

    return {
      id: row.id,
      filename: row.filename,
      size: row.size,
      created: new Date(row.created * 1000),
      fromBBS: row.from_bbs,
      toBBS: row.to_bbs,
      messages,
      status: row.status,
      error: row.error,
      processedAt: row.processed_at ? new Date(row.processed_at * 1000) : undefined
    };
  }

  async deleteQWKPacket(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('DELETE FROM qwk_packets WHERE id = ?');
    stmt.run(id);
  }

  /**
   * FTN (FidoNet Technology Network) Methods
   */

  async createFTNMessage(message: Omit<FTNMessage, 'id'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO ftn_messages (from_address, to_address, subject, body, date, area, msgid, reply_to, attributes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.fromAddress,
      message.toAddress,
      message.subject,
      message.body,
      Math.floor(message.date.getTime() / 1000),
      message.area,
      message.msgid || null,
      message.replyTo || null,
      message.attributes,
      message.status
    );

    return result.lastInsertRowid as number;
  }

  async getFTNMessages(status?: string, area?: string): Promise<FTNMessage[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = 'SELECT * FROM ftn_messages WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (area) {
      query += ' AND area = ?';
      params.push(area);
    }

    query += ' ORDER BY date DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row: any) => ({
      id: row.id.toString(),
      fromAddress: row.from_address,
      toAddress: row.to_address,
      subject: row.subject,
      body: row.body,
      date: new Date(row.date * 1000),
      area: row.area,
      msgid: row.msgid,
      replyTo: row.reply_to,
      attributes: row.attributes,
      status: row.status
    }));
  }

  async updateFTNMessage(id: number, updates: Partial<FTNMessage>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.fromAddress !== undefined) {
      fields.push('from_address = ?');
      values.push(updates.fromAddress);
    }
    if (updates.toAddress !== undefined) {
      fields.push('to_address = ?');
      values.push(updates.toAddress);
    }
    if (updates.subject !== undefined) {
      fields.push('subject = ?');
      values.push(updates.subject);
    }
    if (updates.body !== undefined) {
      fields.push('body = ?');
      values.push(updates.body);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.attributes !== undefined) {
      fields.push('attributes = ?');
      values.push(updates.attributes);
    }

    if (updates.status === 'sent' || updates.status === 'archived') {
      fields.push('processed_at = ?');
      values.push(Math.floor(Date.now() / 1000));
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE ftn_messages SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }
  async createTransferSession(session: Omit<TransferSession, 'id'>): Promise<string> { return crypto.randomUUID(); }
  async updateTransferSession(id: string, updates: Partial<TransferSession>): Promise<void> {}

  /**
   * Daily Statistics Methods
   */

  async getDailyStats(date: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM daily_stats WHERE date = ?');
    return stmt.get(date);
  }

  async saveDailyStats(stats: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO daily_stats
      (date, total_calls, unique_users, total_logins, total_messages,
       total_uploads, total_downloads, total_door_launches)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      stats.date,
      stats.totalCalls,
      stats.uniqueUsers,
      stats.totalLogins,
      stats.totalMessages,
      stats.totalUploads,
      stats.totalDownloads,
      stats.totalDoorLaunches
    );
  }

  async getTodayUniqueUserCount(date: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE DATE(login_time) = ?
    `);

    const result = stmt.get(date) as any;
    return result?.count || 0;
  }

  async getDailyStatsRange(startDate: string, endDate: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM daily_stats
      WHERE date BETWEEN ? AND ?
      ORDER BY date DESC
    `);

    return stmt.all(startDate, endDate);
  }

  /**
   * Get operator chat repository
   */
  getOperatorChatRepository(): any {
    if (!this.operatorChatRepo) {
      throw new Error('Operator chat repository not initialized');
    }
    return this.operatorChatRepo;
  }
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
