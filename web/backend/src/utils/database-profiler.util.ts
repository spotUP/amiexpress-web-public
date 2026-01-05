/**
 * Database Query Profiler - Performance Monitoring
 *
 * Tracks database query performance to identify bottlenecks:
 * - Query execution time
 * - Slow query detection
 * - Query frequency
 * - Parameter patterns
 *
 * Performance Benefits:
 * - Identifies N+1 query problems
 * - Detects missing indexes
 * - Finds inefficient queries
 * - Guides optimization efforts
 *
 * Express.e Compatibility:
 * - Pure monitoring - no behavior changes
 * - Minimal overhead (<1ms per query)
 * - Can be disabled in production
 */

/**
 * Minimal Database interface for better-sqlite3
 * Using any for compatibility with better-sqlite3's CommonJS exports
 */
type Database = any;

/**
 * Query execution record
 */
interface QueryRecord {
  sql: string;
  params?: any[];
  duration: number;
  timestamp: number;
  stackTrace?: string;
}

/**
 * Query statistics
 */
interface QueryStats {
  sql: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  lastExecuted: number;
}

/**
 * Profiler configuration
 */
interface ProfilerConfig {
  enabled: boolean;
  slowQueryThreshold: number;  // Milliseconds
  captureStackTrace: boolean;
  maxRecords: number;           // Max slow queries to store
  logSlowQueries: boolean;
}

/**
 * Database Query Profiler
 */
export class DatabaseProfiler {
  private slowQueries: QueryRecord[] = [];
  private queryStats = new Map<string, QueryStats>();
  private config: ProfilerConfig;

  /**
   * Create database profiler
   *
   * @param config - Profiler configuration
   */
  constructor(config?: Partial<ProfilerConfig>) {
    this.config = {
      enabled: process.env.NODE_ENV !== 'production',
      slowQueryThreshold: 100, // 100ms
      captureStackTrace: false, // Expensive - only for debugging
      maxRecords: 100,
      logSlowQueries: true,
      ...config
    };
  }

  /**
   * Wrap database instance with profiling
   *
   * @param db - Better-sqlite3 database instance
   * @returns Profiled database
   */
  wrapDatabase(db: Database): Database {
    if (!this.config.enabled) {
      return db;
    }

    // Wrap prepare method to intercept all queries
    const originalPrepare = db.prepare.bind(db);

    db.prepare = ((sql: string) => {
      const stmt = originalPrepare(sql);

      // Wrap statement methods
      const originalRun = stmt.run.bind(stmt);
      const originalGet = stmt.get.bind(stmt);
      const originalAll = stmt.all.bind(stmt);

      stmt.run = ((...params: any[]) => {
        return this.profileQuery('run', sql, params, () => originalRun(...params));
      }) as any;

      stmt.get = ((...params: any[]) => {
        return this.profileQuery('get', sql, params, () => originalGet(...params));
      }) as any;

      stmt.all = ((...params: any[]) => {
        return this.profileQuery('all', sql, params, () => originalAll(...params));
      }) as any;

      return stmt;
    }) as any;

    return db;
  }

  /**
   * Profile query execution
   */
  private profileQuery<T>(
    method: string,
    sql: string,
    params: any[],
    execute: () => T
  ): T {
    const startTime = performance.now();
    let result: T;

    try {
      result = execute();
      return result;
    } finally {
      const duration = performance.now() - startTime;
      this.recordQuery(sql, params, duration);
    }
  }

  /**
   * Record query execution
   */
  private recordQuery(sql: string, params: any[], duration: number): void {
    const timestamp = Date.now();

    // Update statistics
    this.updateStats(sql, duration, timestamp);

    // Record slow query
    if (duration >= this.config.slowQueryThreshold) {
      const record: QueryRecord = {
        sql,
        params,
        duration,
        timestamp
      };

      if (this.config.captureStackTrace) {
        record.stackTrace = new Error().stack;
      }

      this.slowQueries.push(record);

      // Trim to max records
      if (this.slowQueries.length > this.config.maxRecords) {
        this.slowQueries.shift();
      }

      // Log slow query
      if (this.config.logSlowQueries) {
        console.warn(
          `[DB Profiler] Slow query (${duration.toFixed(2)}ms): ${sql.substring(0, 100)}...`
        );
      }
    }
  }

  /**
   * Update query statistics
   */
  private updateStats(sql: string, duration: number, timestamp: number): void {
    const existing = this.queryStats.get(sql);

    if (existing) {
      existing.count++;
      existing.totalDuration += duration;
      existing.avgDuration = existing.totalDuration / existing.count;
      existing.minDuration = Math.min(existing.minDuration, duration);
      existing.maxDuration = Math.max(existing.maxDuration, duration);
      existing.lastExecuted = timestamp;
    } else {
      this.queryStats.set(sql, {
        sql,
        count: 1,
        totalDuration: duration,
        avgDuration: duration,
        minDuration: duration,
        maxDuration: duration,
        lastExecuted: timestamp
      });
    }
  }

  /**
   * Get slow queries
   *
   * @param limit - Max queries to return
   * @returns Slow queries sorted by duration
   */
  getSlowQueries(limit: number = 20): QueryRecord[] {
    return this.slowQueries
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get query statistics
   *
   * @param sortBy - Sort field (count, avgDuration, totalDuration)
   * @param limit - Max queries to return
   * @returns Query statistics sorted by specified field
   */
  getStats(sortBy: 'count' | 'avgDuration' | 'totalDuration' = 'totalDuration', limit: number = 20): QueryStats[] {
    const stats = Array.from(this.queryStats.values());

    stats.sort((a, b) => {
      switch (sortBy) {
        case 'count':
          return b.count - a.count;
        case 'avgDuration':
          return b.avgDuration - a.avgDuration;
        case 'totalDuration':
          return b.totalDuration - a.totalDuration;
        default:
          return 0;
      }
    });

    return stats.slice(0, limit);
  }

  /**
   * Get N+1 query candidates
   *
   * Identifies queries executed many times with similar patterns
   *
   * @returns Queries likely to be N+1 problems
   */
  getNPlusOneQueries(minCount: number = 10): QueryStats[] {
    return Array.from(this.queryStats.values())
      .filter(stat => stat.count >= minCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  /**
   * Get profiler summary
   */
  getSummary() {
    const stats = Array.from(this.queryStats.values());
    const totalQueries = stats.reduce((sum, s) => sum + s.count, 0);
    const totalDuration = stats.reduce((sum, s) => sum + s.totalDuration, 0);
    const avgDuration = totalQueries > 0 ? totalDuration / totalQueries : 0;

    return {
      enabled: this.config.enabled,
      totalQueries,
      uniqueQueries: stats.length,
      totalDuration: totalDuration.toFixed(2) + 'ms',
      avgDuration: avgDuration.toFixed(2) + 'ms',
      slowQueries: this.slowQueries.length,
      slowQueryThreshold: this.config.slowQueryThreshold + 'ms'
    };
  }

  /**
   * Clear all profiling data
   */
  clear(): void {
    this.slowQueries = [];
    this.queryStats.clear();
  }

  /**
   * Enable profiler
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable profiler
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Set slow query threshold
   *
   * @param ms - Threshold in milliseconds
   */
  setSlowQueryThreshold(ms: number): void {
    this.config.slowQueryThreshold = ms;
  }

  /**
   * Export profiling data for analysis
   */
  export() {
    return {
      config: this.config,
      slowQueries: this.slowQueries,
      stats: Array.from(this.queryStats.values()),
      summary: this.getSummary()
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const summary = this.getSummary();
    const slowQueries = this.getSlowQueries(10);
    const topByCount = this.getStats('count', 10);
    const topByDuration = this.getStats('totalDuration', 10);
    const nPlusOne = this.getNPlusOneQueries(10);

    let report = '=== Database Performance Report ===\n\n';

    report += '## Summary\n';
    report += `Total Queries: ${summary.totalQueries}\n`;
    report += `Unique Queries: ${summary.uniqueQueries}\n`;
    report += `Total Duration: ${summary.totalDuration}\n`;
    report += `Avg Duration: ${summary.avgDuration}\n`;
    report += `Slow Queries: ${summary.slowQueries} (>${summary.slowQueryThreshold})\n\n`;

    if (slowQueries.length > 0) {
      report += '## Slowest Queries\n';
      slowQueries.forEach((q, i) => {
        report += `${i + 1}. ${q.duration.toFixed(2)}ms - ${q.sql.substring(0, 80)}...\n`;
      });
      report += '\n';
    }

    if (topByCount.length > 0) {
      report += '## Most Frequent Queries\n';
      topByCount.forEach((s, i) => {
        report += `${i + 1}. ${s.count}x (avg: ${s.avgDuration.toFixed(2)}ms) - ${s.sql.substring(0, 60)}...\n`;
      });
      report += '\n';
    }

    if (nPlusOne.length > 0) {
      report += '## Potential N+1 Query Problems\n';
      nPlusOne.forEach((s, i) => {
        report += `${i + 1}. ${s.count}x executions - ${s.sql.substring(0, 60)}...\n`;
      });
      report += '\n';
    }

    if (topByDuration.length > 0) {
      report += '## Queries by Total Time\n';
      topByDuration.forEach((s, i) => {
        report += `${i + 1}. ${s.totalDuration.toFixed(2)}ms total (${s.count}x, avg: ${s.avgDuration.toFixed(2)}ms) - ${s.sql.substring(0, 50)}...\n`;
      });
      report += '\n';
    }

    return report;
  }
}

/**
 * Global profiler instance
 */
export const dbProfiler = new DatabaseProfiler({
  enabled: process.env.DB_PROFILING === 'true' || process.env.NODE_ENV === 'development',
  slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100'),
  captureStackTrace: process.env.DB_CAPTURE_STACK === 'true',
  maxRecords: 100,
  logSlowQueries: true
});

/**
 * Express.e compatibility note:
 *
 * This profiler is a pure monitoring tool with zero behavior changes:
 * - Queries execute exactly as before
 * - Results are identical
 * - Only adds timing measurements
 * - Minimal overhead (<1ms per query)
 * - Can be disabled in production
 */
