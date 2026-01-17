/**
 * Database Connection
 *
 * Manages SQLite database connection for GRANDMASTER
 */
import Database from 'better-sqlite3';
export declare class DatabaseConnection {
    private db;
    private dbPath;
    constructor(dbPath?: string);
    /**
     * Open database connection
     */
    open(): void;
    /**
     * Get database instance
     */
    getDb(): Database.Database;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Initialize database schema
     */
    private initializeSchema;
    /**
     * Run migration
     */
    migrate(version: string, sql: string): void;
    /**
     * Begin transaction
     */
    begin(): void;
    /**
     * Commit transaction
     */
    commit(): void;
    /**
     * Rollback transaction
     */
    rollback(): void;
}
export declare function getDatabase(): DatabaseConnection;
export declare function closeDatabase(): void;
//# sourceMappingURL=connection.d.ts.map