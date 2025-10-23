// Database Migration System for AmiExpress Web
// Handles schema updates, data transformations, and rollback capabilities

import * as fs from 'fs';
import * as path from 'path';
import { db } from './database';

export interface Migration {
  id: string;
  name: string;
  up: (db: any) => Promise<void>;
  down: (db: any) => Promise<void>;
  checksum: string;
  created: Date;
}

export interface MigrationRecord {
  id: string;
  name: string;
  checksum: string;
  executed_at: Date;
  execution_time: number;
}

class MigrationManager {
  private migrationsPath: string;
  private migrationsTable = 'schema_migrations';

  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');
    this.ensureMigrationsTable();
  }

  // Ensure migrations table exists
  private async ensureMigrationsTable(): Promise<void> {
    try {
      const client = await (db as any).pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            execution_time INTEGER
          )
        `);
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn('Could not create migrations table:', error);
    }
  }

  // Get all available migrations
  async getAvailableMigrations(): Promise<Migration[]> {
    const migrations: Migration[] = [];

    try {
      // Read migration files
      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
        .sort();

      for (const file of files) {
        const migrationPath = path.join(this.migrationsPath, file);
        const migration = await this.loadMigration(migrationPath);
        if (migration) {
          migrations.push(migration);
        }
      }
    } catch (error) {
      console.warn('Could not read migrations directory:', error);
    }

    return migrations;
  }

  // Load a single migration file
  private async loadMigration(filePath: string): Promise<Migration | null> {
    try {
      const migrationModule = require(filePath);

      if (!migrationModule.up || !migrationModule.down) {
        console.warn(`Migration ${filePath} missing up/down functions`);
        return null;
      }

      const id = path.basename(filePath, path.extname(filePath));
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = this.calculateChecksum(content);

      return {
        id,
        name: migrationModule.name || id,
        up: migrationModule.up,
        down: migrationModule.down,
        checksum,
        created: fs.statSync(filePath).mtime
      };
    } catch (error) {
      console.error(`Failed to load migration ${filePath}:`, error);
      return null;
    }
  }

  // Get executed migrations
  async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const client = await (db as any).pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.migrationsTable} ORDER BY executed_at ASC`
      );
      return result.rows || [];
    } catch (error) {
      console.warn('Could not fetch executed migrations:', error);
      return [];
    } finally {
      client.release();
    }
  }

  // Check for pending migrations
  async getPendingMigrations(): Promise<Migration[]> {
    const available = await this.getAvailableMigrations();
    const executed = await this.getExecutedMigrations();

    const executedIds = new Set(executed.map(m => m.id));

    return available.filter(migration => !executedIds.has(migration.id));
  }

  // Run pending migrations
  async migrate(): Promise<{ executed: MigrationRecord[], failed: string[] }> {
    const pending = await this.getPendingMigrations();
    const executed: MigrationRecord[] = [];
    const failed: string[] = [];

    console.log(`Found ${pending.length} pending migrations`);

    for (const migration of pending) {
      try {
        console.log(`Executing migration: ${migration.name}`);

        const startTime = Date.now();
        await migration.up(db);
        const executionTime = Date.now() - startTime;

        // Record successful migration
        await this.recordMigration(migration, executionTime);
        executed.push({
          id: migration.id,
          name: migration.name,
          checksum: migration.checksum,
          executed_at: new Date(),
          execution_time: executionTime
        });

        console.log(`✅ Migration ${migration.name} completed in ${executionTime}ms`);
      } catch (error) {
        console.error(`❌ Migration ${migration.name} failed:`, error);
        failed.push(migration.id);

        // Stop on first failure
        break;
      }
    }

    return { executed, failed };
  }

  // Rollback migrations
  async rollback(steps: number = 1): Promise<{ rolledBack: MigrationRecord[], failed: string[] }> {
    const executed = await this.getExecutedMigrations();
    const toRollback = executed.slice(-steps);
    const rolledBack: MigrationRecord[] = [];
    const failed: string[] = [];

    console.log(`Rolling back ${toRollback.length} migrations`);

    for (const record of toRollback.reverse()) {
      try {
        console.log(`Rolling back migration: ${record.name}`);

        // Load migration to get down function
        const migration = await this.loadMigrationById(record.id);
        if (!migration) {
          throw new Error(`Migration ${record.id} not found`);
        }

        const startTime = Date.now();
        await migration.down(db);
        const executionTime = Date.now() - startTime;

        // Remove migration record
        await this.removeMigrationRecord(record.id);
        rolledBack.push(record);

        console.log(`✅ Rollback ${record.name} completed in ${executionTime}ms`);
      } catch (error) {
        console.error(`❌ Rollback ${record.name} failed:`, error);
        failed.push(record.id);
        break;
      }
    }

    return { rolledBack, failed };
  }

  // Create new migration file
  async createMigration(name: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${timestamp}_${name}.ts`;
    const filePath = path.join(this.migrationsPath, filename);

    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsPath)) {
      fs.mkdirSync(this.migrationsPath, { recursive: true });
    }

    const template = `import { db } from '../database';

export const name = '${name}';

export async function up(db: any): Promise<void> {
  // Migration logic goes here
  // Example:
  // await db.query('ALTER TABLE users ADD COLUMN new_field TEXT');
}

export async function down(db: any): Promise<void> {
  // Rollback logic goes here
  // Example:
  // await db.query('ALTER TABLE users DROP COLUMN new_field');
}
`;

    fs.writeFileSync(filePath, template);
    console.log(`Created migration: ${filename}`);

    return filePath;
  }

  // Get migration status
  async status(): Promise<{
    available: Migration[];
    executed: MigrationRecord[];
    pending: Migration[];
  }> {
    const [available, executed] = await Promise.all([
      this.getAvailableMigrations(),
      this.getExecutedMigrations()
    ]);

    const executedIds = new Set(executed.map(m => m.id));
    const pending = available.filter(m => !executedIds.has(m.id));

    return { available, executed, pending };
  }

  // Validate migration checksums
  async validate(): Promise<{ valid: boolean; issues: string[] }> {
    const available = await this.getAvailableMigrations();
    const executed = await this.getExecutedMigrations();
    const issues: string[] = [];

    for (const record of executed) {
      const migration = available.find(m => m.id === record.id);
      if (!migration) {
        issues.push(`Migration ${record.id} executed but file not found`);
      } else if (migration.checksum !== record.checksum) {
        issues.push(`Migration ${record.id} checksum mismatch`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  // Private helper methods
  private async recordMigration(migration: Migration, executionTime: number): Promise<void> {
    const client = await (db as any).pool.connect();
    try {
      await client.query(
        `INSERT INTO ${this.migrationsTable} (id, name, checksum, execution_time) VALUES ($1, $2, $3, $4)`,
        [migration.id, migration.name, migration.checksum, executionTime]
      );
    } finally {
      client.release();
    }
  }

  private async removeMigrationRecord(id: string): Promise<void> {
    const client = await (db as any).pool.connect();
    try {
      await client.query(`DELETE FROM ${this.migrationsTable} WHERE id = $1`, [id]);
    } finally {
      client.release();
    }
  }

  private async loadMigrationById(id: string): Promise<Migration | null> {
    const available = await this.getAvailableMigrations();
    return available.find(m => m.id === id) || null;
  }

  private calculateChecksum(content: string): string {
    // Simple checksum calculation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Export singleton instance
export const migrationManager = new MigrationManager();

// CLI interface for migrations
export async function runMigrationsCLI(args: string[]): Promise<void> {
  const command = args[0] || 'status';

  switch (command) {
    case 'status':
      const status = await migrationManager.status();
      console.log('Migration Status:');
      console.log(`Available: ${status.available.length}`);
      console.log(`Executed: ${status.executed.length}`);
      console.log(`Pending: ${status.pending.length}`);

      if (status.pending.length > 0) {
        console.log('\nPending migrations:');
        status.pending.forEach(m => console.log(`  - ${m.id}: ${m.name}`));
      }
      break;

    case 'migrate':
      const result = await migrationManager.migrate();
      console.log(`Executed ${result.executed.length} migrations`);
      if (result.failed.length > 0) {
        console.log(`Failed: ${result.failed.join(', ')}`);
        process.exit(1);
      }
      break;

    case 'rollback':
      const steps = parseInt(args[1]) || 1;
      const rollbackResult = await migrationManager.rollback(steps);
      console.log(`Rolled back ${rollbackResult.rolledBack.length} migrations`);
      if (rollbackResult.failed.length > 0) {
        console.log(`Failed: ${rollbackResult.failed.join(', ')}`);
        process.exit(1);
      }
      break;

    case 'create':
      const name = args[1];
      if (!name) {
        console.error('Migration name required');
        process.exit(1);
      }
      await migrationManager.createMigration(name);
      break;

    case 'validate':
      const validation = await migrationManager.validate();
      if (validation.valid) {
        console.log('✅ All migrations valid');
      } else {
        console.log('❌ Migration validation failed:');
        validation.issues.forEach(issue => console.log(`  - ${issue}`));
        process.exit(1);
      }
      break;

    default:
      console.log('Usage: migrate <command>');
      console.log('Commands: status, migrate, rollback [steps], create <name>, validate');
      break;
  }
}