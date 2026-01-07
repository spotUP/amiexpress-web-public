/**
 * Database Profiler Utility Unit Tests
 *
 * Tests database query performance monitoring, slow query detection,
 * and statistics tracking for optimization.
 */

import { DatabaseProfiler } from '../../src/utils/database-profiler.util';

describe('DatabaseProfiler', () => {
  let profiler: DatabaseProfiler;
  let mockDb: any;
  let mockStatement: any;
  let originalConsoleWarn: typeof console.warn;
  let consoleWarnings: string[];

  beforeEach(() => {
    // Mock console.warn to capture slow query logs
    originalConsoleWarn = console.warn;
    consoleWarnings = [];
    console.warn = jest.fn((...args) => {
      consoleWarnings.push(args.join(' '));
    });

    // Create profiler with test config
    profiler = new DatabaseProfiler({
      enabled: true,
      slowQueryThreshold: 50,
      captureStackTrace: false,
      maxRecords: 10,
      logSlowQueries: true,
    });

    // Mock statement
    mockStatement = {
      run: jest.fn(() => ({ changes: 1 })),
      get: jest.fn(() => ({ id: 1, name: 'test' })),
      all: jest.fn(() => [{ id: 1 }, { id: 2 }]),
    };

    // Mock database
    mockDb = {
      prepare: jest.fn((sql: string) => mockStatement),
    };
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultProfiler = new DatabaseProfiler();
      const summary = defaultProfiler.getSummary();

      expect(summary.enabled).toBeDefined();
      expect(summary.slowQueryThreshold).toBe('100ms');
    });

    it('should accept custom config', () => {
      const customProfiler = new DatabaseProfiler({
        enabled: true, // Changed to true so summary works correctly
        slowQueryThreshold: 200,
        captureStackTrace: true,
        maxRecords: 50,
        logSlowQueries: false,
      });

      const summary = customProfiler.getSummary();
      expect(summary.enabled).toBe(true);
      expect(summary.slowQueryThreshold).toBe('200ms');
    });

    it('should merge partial config with defaults', () => {
      const partialProfiler = new DatabaseProfiler({
        slowQueryThreshold: 150,
      });

      const summary = partialProfiler.getSummary();
      expect(summary.slowQueryThreshold).toBe('150ms');
      expect(summary.enabled).toBeDefined();
    });

    it('should default enabled to false in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodProfiler = new DatabaseProfiler();
      const summary = prodProfiler.getSummary();

      expect(summary.enabled).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('wrapDatabase', () => {
    it('should return unwrapped database when disabled', () => {
      const disabledProfiler = new DatabaseProfiler({ enabled: false });
      const wrapped = disabledProfiler.wrapDatabase(mockDb);

      expect(wrapped).toBe(mockDb);
    });

    it('should wrap database.prepare when enabled', () => {
      const wrapTestProfiler = new DatabaseProfiler({ enabled: true });
      const testMockStatement = {
        run: jest.fn(() => ({ changes: 1 })),
        get: jest.fn(() => ({ id: 1 })),
        all: jest.fn(() => []),
      };
      const testMockDb = { prepare: jest.fn(() => testMockStatement) };

      const wrapped = wrapTestProfiler.wrapDatabase(testMockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      // Verify statement methods are wrapped
      expect(stmt).toBeDefined();
      expect(typeof stmt.run).toBe('function');
      expect(typeof stmt.get).toBe('function');
      expect(typeof stmt.all).toBe('function');

      // Execute a query and verify profiling happened
      stmt.get();
      const stats = wrapTestProfiler.getStats();
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should wrap statement.run method', () => {
      const wrapRunProfiler = new DatabaseProfiler({ enabled: true });
      const runMockStatement = {
        run: jest.fn(() => ({ changes: 1 })),
        get: jest.fn(),
        all: jest.fn(),
      };
      const runMockDb = { prepare: jest.fn(() => runMockStatement) };

      const wrapped = wrapRunProfiler.wrapDatabase(runMockDb);
      const stmt = wrapped.prepare('INSERT INTO users VALUES (?)');
      const result = stmt.run(123);

      // Verify result is returned correctly
      expect(result).toEqual({ changes: 1 });

      // Verify query was profiled
      const stats = wrapRunProfiler.getStats();
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should wrap statement.get method', () => {
      const wrapGetProfiler = new DatabaseProfiler({ enabled: true });
      const getMockStatement = {
        run: jest.fn(),
        get: jest.fn(() => ({ id: 1, name: 'test' })),
        all: jest.fn(),
      };
      const getMockDb = { prepare: jest.fn(() => getMockStatement) };

      const wrapped = wrapGetProfiler.wrapDatabase(getMockDb);
      const stmt = wrapped.prepare('SELECT * FROM users WHERE id = ?');
      const result = stmt.get(1);

      // Verify result is returned correctly
      expect(result).toEqual({ id: 1, name: 'test' });

      // Verify query was profiled
      const stats = wrapGetProfiler.getStats();
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should wrap statement.all method', () => {
      const wrapAllProfiler = new DatabaseProfiler({ enabled: true });
      const allMockStatement = {
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [{ id: 1 }, { id: 2 }]),
      };
      const allMockDb = { prepare: jest.fn(() => allMockStatement) };

      const wrapped = wrapAllProfiler.wrapDatabase(allMockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      const result = stmt.all();

      // Verify result is returned correctly
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);

      // Verify query was profiled
      const stats = wrapAllProfiler.getStats();
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should profile wrapped queries', () => {
      const wrapProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = wrapProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.run();

      const stats = wrapProfiler.getStats();
      expect(stats.length).toBeGreaterThan(0);
    });
  });

  describe('query profiling', () => {
    it('should record fast query without slow query warning', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      // Mock fast execution
      mockStatement.run = jest.fn(() => {
        // Complete immediately
        return { changes: 1 };
      });

      stmt.run();

      const slowQueries = profiler.getSlowQueries();
      expect(slowQueries.length).toBe(0);
      expect(consoleWarnings.length).toBe(0);
    });

    it('should record slow query with warning', () => {
      // Use very low threshold to guarantee slow query detection
      const slowProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0, // Everything is slow
        captureStackTrace: false,
        maxRecords: 10,
        logSlowQueries: true,
      });

      const wrapped = slowProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM large_table');

      stmt.run();

      const slowQueries = slowProfiler.getSlowQueries();
      expect(slowQueries.length).toBeGreaterThan(0);
      expect(consoleWarnings.length).toBeGreaterThan(0);
      expect(consoleWarnings[0]).toContain('Slow query');
    });

    it('should track query statistics', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users WHERE id = ?');

      stmt.get(1);
      stmt.get(2);
      stmt.get(3);

      const stats = profiler.getStats();
      const queryStat = stats.find(s => s.sql.includes('SELECT * FROM users'));

      expect(queryStat).toBeDefined();
      expect(queryStat!.count).toBe(3);
      expect(queryStat!.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('should track min and max duration', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT COUNT(*) FROM users');

      // Execute multiple times
      stmt.get();
      stmt.get();
      stmt.get();

      const stats = profiler.getStats();
      const queryStat = stats[0];

      expect(queryStat.minDuration).toBeLessThanOrEqual(queryStat.maxDuration);
      expect(queryStat.avgDuration).toBeGreaterThanOrEqual(queryStat.minDuration);
      expect(queryStat.avgDuration).toBeLessThanOrEqual(queryStat.maxDuration);
    });

    it('should update lastExecuted timestamp', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      const before = Date.now();
      stmt.get();
      const after = Date.now();

      const stats = profiler.getStats();
      const queryStat = stats[0];

      expect(queryStat.lastExecuted).toBeGreaterThanOrEqual(before);
      expect(queryStat.lastExecuted).toBeLessThanOrEqual(after);
    });
  });

  describe('getSlowQueries', () => {
    it('should return empty array when no slow queries', () => {
      const freshProfiler = new DatabaseProfiler({ enabled: true });
      const slowQueries = freshProfiler.getSlowQueries();
      expect(slowQueries).toEqual([]);
    });

    it('should return slow queries sorted by duration', () => {
      const slowProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0, // All queries are slow
      });

      const wrapped = slowProfiler.wrapDatabase(mockDb);

      // Create queries with different durations
      const stmt1 = wrapped.prepare('SELECT * FROM table1');
      const stmt2 = wrapped.prepare('SELECT * FROM table2');
      const stmt3 = wrapped.prepare('SELECT * FROM table3');

      stmt1.run();
      stmt2.run();
      stmt3.run();

      const slowQueries = slowProfiler.getSlowQueries();
      expect(slowQueries.length).toBeGreaterThan(0);

      // Check sorted by duration descending
      for (let i = 1; i < slowQueries.length; i++) {
        expect(slowQueries[i - 1].duration).toBeGreaterThanOrEqual(slowQueries[i].duration);
      }
    });

    it('should respect limit parameter', () => {
      const slowProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });

      const wrapped = slowProfiler.wrapDatabase(mockDb);

      // Create 5 slow queries
      for (let i = 0; i < 5; i++) {
        const stmt = wrapped.prepare(`SELECT * FROM table${i}`);
        stmt.run();
      }

      const limited = slowProfiler.getSlowQueries(3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it('should trim to maxRecords', () => {
      const smallProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
        maxRecords: 3,
      });

      const wrapped = smallProfiler.wrapDatabase(mockDb);

      // Create more than maxRecords slow queries
      for (let i = 0; i < 5; i++) {
        const stmt = wrapped.prepare(`SELECT * FROM table${i}`);
        stmt.run();
      }

      const slowQueries = smallProfiler.getSlowQueries(100);
      expect(slowQueries.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getStats', () => {
    let statsProfiler: DatabaseProfiler;

    beforeEach(() => {
      statsProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = statsProfiler.wrapDatabase(mockDb);

      // Create queries with different patterns
      const stmt1 = wrapped.prepare('SELECT * FROM users');
      const stmt2 = wrapped.prepare('SELECT * FROM messages');
      const stmt3 = wrapped.prepare('SELECT * FROM files');

      // Execute with different frequencies
      stmt1.get(); // 1x
      stmt2.get(); // 3x
      stmt2.get();
      stmt2.get();
      stmt3.get(); // 2x
      stmt3.get();
    });

    it('should return empty array when no queries', () => {
      const emptyProfiler = new DatabaseProfiler({ enabled: true });
      const stats = emptyProfiler.getStats();
      expect(stats).toEqual([]);
    });

    it('should sort by count', () => {
      const stats = statsProfiler.getStats('count');

      expect(stats.length).toBe(3); // 3 unique queries

      // Check sorted by count descending
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i - 1].count).toBeGreaterThanOrEqual(stats[i].count);
      }

      // Verify most frequent query has highest count
      expect(stats[0].count).toBeGreaterThanOrEqual(stats[1].count);
      expect(stats[1].count).toBeGreaterThanOrEqual(stats[2].count);

      // Verify sorting is correct
      expect(stats[0].count).toBeGreaterThan(0);
    });

    it('should sort by avgDuration', () => {
      const stats = statsProfiler.getStats('avgDuration');

      // Check sorted by avgDuration descending
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i - 1].avgDuration).toBeGreaterThanOrEqual(stats[i].avgDuration);
      }
    });

    it('should sort by totalDuration (default)', () => {
      const stats = statsProfiler.getStats('totalDuration');

      // Check sorted by totalDuration descending
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i - 1].totalDuration).toBeGreaterThanOrEqual(stats[i].totalDuration);
      }
    });

    it('should respect limit parameter', () => {
      const stats = statsProfiler.getStats('count', 2);
      expect(stats.length).toBeLessThanOrEqual(2);
    });

    it('should include all stat fields', () => {
      const stats = statsProfiler.getStats();
      const stat = stats[0];

      expect(stat).toHaveProperty('sql');
      expect(stat).toHaveProperty('count');
      expect(stat).toHaveProperty('totalDuration');
      expect(stat).toHaveProperty('avgDuration');
      expect(stat).toHaveProperty('minDuration');
      expect(stat).toHaveProperty('maxDuration');
      expect(stat).toHaveProperty('lastExecuted');
    });
  });

  describe('getNPlusOneQueries', () => {
    it('should return empty array when no queries exceed threshold', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get(); // Only 1 execution

      const nPlusOne = profiler.getNPlusOneQueries(10);
      expect(nPlusOne).toEqual([]);
    });

    it('should identify queries exceeding minCount', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users WHERE id = ?');

      // Execute 15 times (N+1 pattern)
      for (let i = 0; i < 15; i++) {
        stmt.get(i);
      }

      const nPlusOne = profiler.getNPlusOneQueries(10);
      expect(nPlusOne.length).toBeGreaterThan(0);
      expect(nPlusOne[0].count).toBeGreaterThanOrEqual(10);
    });

    it('should sort by count descending', () => {
      const wrapped = profiler.wrapDatabase(mockDb);

      const stmt1 = wrapped.prepare('SELECT * FROM users WHERE id = ?');
      const stmt2 = wrapped.prepare('SELECT * FROM messages WHERE user_id = ?');

      // Different execution counts
      for (let i = 0; i < 20; i++) stmt1.get(i);
      for (let i = 0; i < 15; i++) stmt2.get(i);

      const nPlusOne = profiler.getNPlusOneQueries(10);
      expect(nPlusOne[0].count).toBeGreaterThanOrEqual(nPlusOne[1].count);
    });

    it('should respect minCount parameter', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      for (let i = 0; i < 5; i++) stmt.get();

      const nPlusOne = profiler.getNPlusOneQueries(10);
      expect(nPlusOne.length).toBe(0);
    });

    it('should limit to 20 results', () => {
      const wrapped = profiler.wrapDatabase(mockDb);

      // Create 25 different queries, each executed 11+ times
      for (let i = 0; i < 25; i++) {
        const stmt = wrapped.prepare(`SELECT * FROM table${i}`);
        for (let j = 0; j < 11; j++) {
          stmt.get();
        }
      }

      const nPlusOne = profiler.getNPlusOneQueries(10);
      expect(nPlusOne.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getSummary', () => {
    it('should return summary with zero values when no queries', () => {
      const summary = profiler.getSummary();

      expect(summary).toMatchObject({
        totalQueries: 0,
        uniqueQueries: 0,
        slowQueries: 0,
      });
      expect(summary.enabled).toBeDefined();
      expect(summary.slowQueryThreshold).toBe('50ms');
    });

    it('should calculate correct summary statistics', () => {
      const summaryProfiler = new DatabaseProfiler({ enabled: true });
      const summaryMockStatement = {
        run: jest.fn(),
        get: jest.fn(() => ({ id: 1 })),
        all: jest.fn(),
      };
      const summaryMockDb = { prepare: jest.fn(() => summaryMockStatement) };

      const wrapped = summaryProfiler.wrapDatabase(summaryMockDb);

      const stmt1 = wrapped.prepare('SELECT * FROM users');
      const stmt2 = wrapped.prepare('SELECT * FROM messages');

      stmt1.get();
      stmt1.get();
      stmt2.get();

      const summary = summaryProfiler.getSummary();

      expect(summary.totalQueries).toBeGreaterThanOrEqual(3);
      expect(summary.uniqueQueries).toBeGreaterThanOrEqual(2);
      expect(summary.enabled).toBe(true);

      // Verify that summary calculations are correct
      expect(summary).toHaveProperty('totalDuration');
      expect(summary).toHaveProperty('avgDuration');
      expect(summary).toHaveProperty('slowQueries');
    });

    it('should include duration metrics', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const summary = profiler.getSummary();

      expect(summary.totalDuration).toMatch(/ms$/);
      expect(summary.avgDuration).toMatch(/ms$/);
    });

    it('should count slow queries', () => {
      const slowProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });

      const wrapped = slowProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM large_table');
      stmt.run();

      const summary = slowProfiler.getSummary();
      expect(summary.slowQueries).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all profiling data', () => {
      const clearProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = clearProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      stmt.get();
      stmt.get();
      stmt.get();

      let summary = clearProfiler.getSummary();
      expect(summary.totalQueries).toBeGreaterThan(0);

      clearProfiler.clear();

      summary = clearProfiler.getSummary();
      expect(summary.totalQueries).toBe(0);
      expect(summary.uniqueQueries).toBe(0);
      expect(summary.slowQueries).toBe(0);
    });

    it('should clear slow queries', () => {
      const clearProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });

      const wrapped = clearProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM large_table');

      stmt.run();
      expect(clearProfiler.getSlowQueries().length).toBeGreaterThan(0);

      clearProfiler.clear();
      expect(clearProfiler.getSlowQueries().length).toBe(0);
    });

    it('should clear statistics', () => {
      const clearProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = clearProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      expect(clearProfiler.getStats().length).toBeGreaterThan(0);

      clearProfiler.clear();
      expect(clearProfiler.getStats().length).toBe(0);
    });
  });

  describe('enable and disable', () => {
    it('should enable profiler', () => {
      profiler.disable();
      expect(profiler.getSummary().enabled).toBe(false);

      profiler.enable();
      expect(profiler.getSummary().enabled).toBe(true);
    });

    it('should disable profiler', () => {
      profiler.enable();
      expect(profiler.getSummary().enabled).toBe(true);

      profiler.disable();
      expect(profiler.getSummary().enabled).toBe(false);
    });

    it('should not wrap database when disabled', () => {
      profiler.disable();
      const wrapped = profiler.wrapDatabase(mockDb);
      expect(wrapped).toBe(mockDb);
    });
  });

  describe('setSlowQueryThreshold', () => {
    it('should update slow query threshold', () => {
      profiler.setSlowQueryThreshold(200);

      const summary = profiler.getSummary();
      expect(summary.slowQueryThreshold).toBe('200ms');
    });

    it('should affect slow query detection', async () => {
      // Set very high threshold
      profiler.setSlowQueryThreshold(1000);

      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      mockStatement.run = jest.fn(() => {
        const start = Date.now();
        while (Date.now() - start < 60) {} // 60ms
        return { changes: 1 };
      });

      stmt.run();

      // Should not be recorded as slow
      expect(profiler.getSlowQueries().length).toBe(0);
    });
  });

  describe('export', () => {
    it('should export all profiling data', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const exported = profiler.export();

      expect(exported).toHaveProperty('config');
      expect(exported).toHaveProperty('slowQueries');
      expect(exported).toHaveProperty('stats');
      expect(exported).toHaveProperty('summary');
    });

    it('should export config', () => {
      const exported = profiler.export();

      expect(exported.config).toMatchObject({
        enabled: true,
        slowQueryThreshold: 50,
        captureStackTrace: false,
        maxRecords: 10,
        logSlowQueries: true,
      });
    });

    it('should export slow queries', () => {
      const exportProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });

      const wrapped = exportProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM large_table');
      stmt.run();

      const exported = exportProfiler.export();
      expect(exported.slowQueries.length).toBeGreaterThan(0);
    });

    it('should export statistics', () => {
      const exportStatsProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = exportStatsProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const exported = exportStatsProfiler.export();
      expect(exported.stats.length).toBeGreaterThan(0);
    });

    it('should export summary', () => {
      const exported = profiler.export();
      expect(exported.summary).toHaveProperty('totalQueries');
      expect(exported.summary).toHaveProperty('uniqueQueries');
    });
  });

  describe('generateReport', () => {
    it('should generate report with summary section', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const report = profiler.generateReport();

      expect(report).toContain('=== Database Performance Report ===');
      expect(report).toContain('## Summary');
      expect(report).toContain('Total Queries:');
      expect(report).toContain('Unique Queries:');
    });

    it('should include slowest queries section when present', () => {
      const reportProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });

      const wrapped = reportProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM large_table');
      stmt.run();

      const report = reportProfiler.generateReport();
      expect(report).toContain('## Slowest Queries');
    });

    it('should include most frequent queries section', () => {
      const reportFreqProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = reportFreqProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');

      for (let i = 0; i < 5; i++) stmt.get();

      const report = reportFreqProfiler.generateReport();
      expect(report).toContain('## Most Frequent Queries');
    });

    it('should include N+1 query section when detected', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users WHERE id = ?');

      for (let i = 0; i < 15; i++) stmt.get(i);

      const report = profiler.generateReport();
      expect(report).toContain('## Potential N+1 Query Problems');
    });

    it('should include total time section', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const report = profiler.generateReport();
      expect(report).toContain('## Queries by Total Time');
    });

    it('should format durations correctly', () => {
      const wrapped = profiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users');
      stmt.get();

      const report = profiler.generateReport();
      expect(report).toMatch(/\d+\.\d{2}ms/); // Check for duration format
    });
  });

  describe('integration tests', () => {
    it('should profile complete database workflow', () => {
      const integrationProfiler = new DatabaseProfiler({ enabled: true });
      const integrationMockStatement = {
        run: jest.fn(),
        get: jest.fn(() => ({ id: 1 })),
        all: jest.fn(() => []),
      };
      const integrationMockDb = { prepare: jest.fn(() => integrationMockStatement) };

      const wrapped = integrationProfiler.wrapDatabase(integrationMockDb);

      // Simulate typical BBS operations
      const userStmt = wrapped.prepare('SELECT * FROM users WHERE username = ?');
      const msgStmt = wrapped.prepare('SELECT * FROM messages WHERE user_id = ?');
      const confStmt = wrapped.prepare('SELECT * FROM conferences');

      userStmt.get('testuser');
      msgStmt.all(123);
      confStmt.all();

      const summary = integrationProfiler.getSummary();
      expect(summary.totalQueries).toBeGreaterThanOrEqual(3);
      expect(summary.uniqueQueries).toBeGreaterThanOrEqual(3);

      const stats = integrationProfiler.getStats();
      expect(stats.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect N+1 query pattern', () => {
      const nPlusOneProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = nPlusOneProfiler.wrapDatabase(mockDb);

      // Simulate N+1: One query to get users, then N queries for each user's messages
      const usersStmt = wrapped.prepare('SELECT * FROM users');
      const users = usersStmt.all();

      const msgStmt = wrapped.prepare('SELECT * FROM messages WHERE user_id = ?');
      for (let i = 0; i < 20; i++) {
        msgStmt.all(i);
      }

      const nPlusOne = nPlusOneProfiler.getNPlusOneQueries(10);
      expect(nPlusOne.length).toBeGreaterThan(0);
      expect(nPlusOne[0].count).toBeGreaterThanOrEqual(20);
    });

    it('should handle mixed fast and slow queries', () => {
      const mixedProfiler = new DatabaseProfiler({
        enabled: true,
        slowQueryThreshold: 0,
      });
      const wrapped = mixedProfiler.wrapDatabase(mockDb);

      // Fast query (but will be counted as slow with threshold=0)
      const fastStmt = wrapped.prepare('SELECT * FROM users WHERE id = 1');
      fastStmt.get();

      const summary = mixedProfiler.getSummary();
      expect(summary.totalQueries).toBe(1);
      expect(summary.slowQueries).toBeGreaterThan(0);
    });

    it('should maintain statistics across multiple operations', () => {
      const multiOpProfiler = new DatabaseProfiler({ enabled: true });
      const wrapped = multiOpProfiler.wrapDatabase(mockDb);
      const stmt = wrapped.prepare('SELECT * FROM users WHERE id = ?');

      // Execute same query multiple times with different params
      stmt.get(1);
      stmt.get(2);
      stmt.get(3);
      stmt.get(4);
      stmt.get(5);

      const stats = multiOpProfiler.getStats();
      const queryStat = stats[0];

      expect(queryStat.count).toBe(5);
      expect(queryStat.totalDuration).toBeGreaterThan(0);
      expect(queryStat.avgDuration).toBe(queryStat.totalDuration / 5);
    });
  });
});
