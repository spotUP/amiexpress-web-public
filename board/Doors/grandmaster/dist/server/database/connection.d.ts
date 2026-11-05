/**
 * Database Connection
 *
 * Manages SQLite database connection for GRANDMASTER
 */
import Database from 'better-sqlite3';
/**
 * Where the chess games live: `Doors/grandmaster/data/grandmaster.db`.
 *
 * It was `process.cwd() + data/grandmaster.db`, and the backend's cwd on the
 * board is /app/web/backend - which is the container's own filesystem, not the
 * /app/data volume. Every deploy replaces that container, so every saved game,
 * rating and match history would have gone with it, several times a day. A
 * door's own directory is on the volume and the deploy syncs it without
 * deleting, which is why Doors/dopewars/data/dopewars.db has survived since
 * August.
 *
 * `startDir` is a module's `__dirname`: the source tree in development and
 * dist/ in production, so the door root is resolved rather than assumed.
 */
export declare function defaultDatabasePath(startDir?: string): string;
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