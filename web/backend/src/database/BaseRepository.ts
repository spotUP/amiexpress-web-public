/**
 * BaseRepository - Abstract base class for database repositories
 *
 * Provides common database operation patterns to eliminate boilerplate
 * across the 9+ repository classes. All repositories should extend this
 * class to inherit standardized database interaction methods.
 *
 * Benefits:
 * - Eliminates ~150+ lines of duplicate boilerplate
 * - Standardizes error handling
 * - Consistent database null checking
 * - Type-safe query execution
 *
 * Usage:
 * ```typescript
 * export class UserRepository extends BaseRepository<User> {
 *   constructor(db: any) {
 *     super(db);
 *   }
 *
 *   async createUser(data: CreateUserData): Promise<number> {
 *     const result = this.run(
 *       'INSERT INTO users (name, email) VALUES (?, ?)',
 *       [data.name, data.email]
 *     );
 *     return result.lastInsertRowid as number;
 *   }
 * }
 * ```
 */

/**
 * Abstract base repository class providing common database operations
 *
 * @template T - The entity type this repository manages
 */
export abstract class BaseRepository<T> {
  /**
   * Create a new repository instance
   *
   * @param db - Database instance (better-sqlite3 database object)
   */
  constructor(protected db: any) {}

  /**
   * Ensure database is initialized before operations
   * Throws error if database is null/undefined
   *
   * @throws Error if database not initialized
   */
  protected requireDb(): void {
    if (!this.db) {
      throw new Error(`Database not initialized for ${this.constructor.name}`);
    }
  }

  /**
   * Prepare a SQL statement
   *
   * @param sql - SQL query string
   * @returns Prepared statement
   * @throws Error if database not initialized
   */
  protected prepare(sql: string) {
    this.requireDb();
    return this.db.prepare(sql);
  }

  /**
   * Execute a SQL statement that modifies data (INSERT, UPDATE, DELETE)
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Statement run result with lastInsertRowid and changes
   * @throws Error if database not initialized
   *
   * @example
   * ```typescript
   * const result = this.run(
   *   'INSERT INTO users (name) VALUES (?)',
   *   ['John']
   * );
   * const userId = result.lastInsertRowid;
   * ```
   */
  protected run(sql: string, params: any[] = []): any {
    const stmt = this.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * Execute a SQL statement that returns a single row (SELECT)
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Single result row or undefined if not found
   * @throws Error if database not initialized
   *
   * @example
   * ```typescript
   * const user = this.get<User>(
   *   'SELECT * FROM users WHERE id = ?',
   *   [userId]
   * );
   * ```
   */
  protected get<R = T>(sql: string, params: any[] = []): R | undefined {
    const stmt = this.prepare(sql);
    return stmt.get(...params);
  }

  /**
   * Execute a SQL statement that returns multiple rows (SELECT)
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Array of result rows (empty array if no results)
   * @throws Error if database not initialized
   *
   * @example
   * ```typescript
   * const users = this.all<User>(
   *   'SELECT * FROM users WHERE active = ?',
   *   [true]
   * );
   * ```
   */
  protected all<R = T>(sql: string, params: any[] = []): R[] {
    const stmt = this.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Execute multiple statements in a transaction
   *
   * @param callback - Function containing statements to execute
   * @returns Result of callback function
   * @throws Error if database not initialized or transaction fails
   *
   * @example
   * ```typescript
   * const result = this.transaction(() => {
   *   this.run('UPDATE users SET balance = balance - ? WHERE id = ?', [100, fromId]);
   *   this.run('UPDATE users SET balance = balance + ? WHERE id = ?', [100, toId]);
   *   return { success: true };
   * });
   * ```
   */
  protected transaction<R>(callback: () => R): R {
    this.requireDb();
    const txn = this.db.transaction(callback);
    return txn();
  }
}
