/**
 * Database Connection
 *
 * Manages SQLite database connection for GRANDMASTER
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseConnection {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to project data directory
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'grandmaster.db');
  }

  /**
   * Open database connection
   */
  open(): void {
    if (this.db) {
      return; // Already open
    }

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrency
    this.db!.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db!.pragma('foreign_keys = ON');

    // Initialize schema
    this.initializeSchema();
  }

  /**
   * Get database instance
   */
  getDb(): Database.Database {
    if (!this.db) {
      this.open();
    }
    return this.db!;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    if (!this.db) return;

    try {
      // Read schema file
      const schemaPath = path.join(__dirname, 'schema.sql');
      console.log('[DatabaseConnection] Reading schema from:', schemaPath);

      if (!fs.existsSync(schemaPath)) {
        console.error('[DatabaseConnection] Schema file not found at:', schemaPath);
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');
      console.log('[DatabaseConnection] Schema file loaded, size:', schema.length, 'bytes');

      // Execute schema (SQLite supports multiple statements)
      this.db.exec(schema);
      console.log('[DatabaseConnection] Schema initialized successfully');
    } catch (error) {
      console.error('[DatabaseConnection] Failed to initialize schema:', error);
      throw error;
    }
  }

  /**
   * Run migration
   */
  migrate(version: string, sql: string): void {
    const db = this.getDb();

    // Create migrations table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Check if already applied
    const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
    if (existing) {
      return; // Already applied
    }

    // Run migration in transaction
    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    });

    transaction();
  }

  /**
   * Begin transaction
   */
  begin(): void {
    this.getDb().exec('BEGIN');
  }

  /**
   * Commit transaction
   */
  commit(): void {
    this.getDb().exec('COMMIT');
  }

  /**
   * Rollback transaction
   */
  rollback(): void {
    this.getDb().exec('ROLLBACK');
  }
}

// Singleton instance
let instance: DatabaseConnection | null = null;

export function getDatabase(): DatabaseConnection {
  if (!instance) {
    instance = new DatabaseConnection();
    instance.open();
  }
  return instance;
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
