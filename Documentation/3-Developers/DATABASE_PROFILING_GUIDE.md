# Database Profiling Guide

**Status:** Core infrastructure complete - ready for database integration
**Impact:** Identifies slow queries, N+1 problems, missing indexes
**Compatibility:** Zero behavior changes - pure monitoring with <1ms overhead

---

## Overview

Database profiling tracks query performance to identify bottlenecks and optimization opportunities. This is a pure monitoring tool that doesn't change database behavior in any way.

**Key Principle:** Measure, don't modify. All queries execute exactly as before.

---

## How It Works

### Query Interception
```typescript
// Profiler wraps database.prepare() to intercept all queries
const db = getDatabase();
const profiledDb = dbProfiler.wrapDatabase(db);

// Now all queries are automatically profiled
profiledDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
// Profiler records: duration, SQL, parameters, timestamp
```

### Metrics Collected
1. **Query duration** - Execution time in milliseconds
2. **Execution count** - How many times query runs
3. **Parameters** - Query parameters for analysis
4. **Statistics** - Min/max/avg duration, total time
5. **Slow queries** - Queries exceeding threshold (default: 100ms)
6. **Timestamp** - When query was executed

---

## Integration

### Step 1: Wrap Database Instance

**Current (database.ts):**
```typescript
import Database from 'better-sqlite3';

const db = new Database(dbPath);

export function getDatabase() {
  return db;
}
```

**After (with profiling):**
```typescript
import Database from 'better-sqlite3';
import { dbProfiler } from '../utils/database-profiler.util';

const db = new Database(dbPath);

// Wrap database with profiler
const profiledDb = dbProfiler.wrapDatabase(db);

export function getDatabase() {
  return profiledDb;
}
```

### Step 2: Monitor Performance

```typescript
import { dbProfiler } from '../utils/database-profiler.util';

// Get performance summary
const summary = dbProfiler.getSummary();
console.log(summary);
// {
//   enabled: true,
//   totalQueries: 1523,
//   uniqueQueries: 87,
//   totalDuration: "2345.67ms",
//   avgDuration: "1.54ms",
//   slowQueries: 12,
//   slowQueryThreshold: "100ms"
// }

// Get slow queries
const slowQueries = dbProfiler.getSlowQueries(10);
slowQueries.forEach(q => {
  console.log(`${q.duration}ms: ${q.sql}`);
});

// Get most frequent queries (potential N+1 problems)
const frequent = dbProfiler.getStats('count', 10);
frequent.forEach(s => {
  console.log(`${s.count}x: ${s.sql}`);
});

// Generate full report
const report = dbProfiler.generateReport();
console.log(report);
```

---

## Use Cases

### 1. Identify Slow Queries

```typescript
// Get queries taking >100ms
const slowQueries = dbProfiler.getSlowQueries(20);

slowQueries.forEach(q => {
  console.log(`Slow query (${q.duration}ms):`);
  console.log(`  SQL: ${q.sql}`);
  console.log(`  Params: ${JSON.stringify(q.params)}`);
  console.log(`  Time: ${new Date(q.timestamp).toISOString()}`);
});
```

**Action:** Add indexes, optimize joins, or rewrite query

### 2. Detect N+1 Query Problems

```typescript
// Find queries executed many times
const nPlusOne = dbProfiler.getNPlusOneQueries(10);

nPlusOne.forEach(q => {
  console.log(`Potential N+1 (${q.count} executions):`);
  console.log(`  SQL: ${q.sql}`);
  console.log(`  Avg: ${q.avgDuration.toFixed(2)}ms`);
  console.log(`  Total: ${q.totalDuration.toFixed(2)}ms`);
});
```

**Action:** Use JOINs instead of separate queries, or implement eager loading

### 3. Find Missing Indexes

```typescript
// Queries with high avg duration and high count
const stats = dbProfiler.getStats('avgDuration', 20);

stats.forEach(s => {
  if (s.count > 100 && s.avgDuration > 10) {
    console.log(`Missing index candidate:`);
    console.log(`  SQL: ${s.sql}`);
    console.log(`  Executions: ${s.count}`);
    console.log(`  Avg time: ${s.avgDuration.toFixed(2)}ms`);
  }
});
```

**Action:** Add indexes on WHERE/JOIN columns

### 4. Monitor Query Performance Over Time

```typescript
// Before optimization
dbProfiler.clear();
await runOperations();
const before = dbProfiler.getSummary();

// After optimization (add index, rewrite query, etc.)
dbProfiler.clear();
await runOperations();
const after = dbProfiler.getSummary();

console.log('Before:', before.totalDuration);
console.log('After:', after.totalDuration);
console.log('Improvement:',
  ((parseFloat(before.totalDuration) - parseFloat(after.totalDuration)) /
   parseFloat(before.totalDuration) * 100).toFixed(2) + '%'
);
```

---

## Configuration

### Environment Variables

```env
# .env.local

# Enable profiling (default: true in development)
DB_PROFILING=true

# Slow query threshold in milliseconds (default: 100)
DB_SLOW_QUERY_THRESHOLD=100

# Capture stack traces for slow queries (expensive - debug only)
DB_CAPTURE_STACK=false
```

### Programmatic Configuration

```typescript
import { DatabaseProfiler } from '../utils/database-profiler.util';

const profiler = new DatabaseProfiler({
  enabled: true,
  slowQueryThreshold: 50,        // 50ms threshold
  captureStackTrace: false,      // Don't capture stacks (expensive)
  maxRecords: 200,               // Store up to 200 slow queries
  logSlowQueries: true           // Log to console
});
```

---

## Performance Report

### Generate Report

```typescript
import { dbProfiler } from '../utils/database-profiler.util';

// After running BBS for a while
const report = dbProfiler.generateReport();
console.log(report);
```

### Sample Report

```
=== Database Performance Report ===

## Summary
Total Queries: 15234
Unique Queries: 142
Total Duration: 23456.78ms
Avg Duration: 1.54ms
Slow Queries: 23 (>100ms)

## Slowest Queries
1. 234.56ms - SELECT * FROM messages WHERE conferenceId = ? AND toUser = ? ORDER BY...
2. 189.23ms - SELECT * FROM files WHERE areaId IN (SELECT id FROM file_areas WHERE...
3. 145.67ms - SELECT u.*, COUNT(m.id) as msgCount FROM users u LEFT JOIN messages...

## Most Frequent Queries
1. 1523x (avg: 1.2ms) - SELECT * FROM users WHERE id = ?
2. 892x (avg: 2.3ms) - SELECT * FROM messages WHERE id = ?
3. 743x (avg: 0.8ms) - SELECT * FROM conferences WHERE id = ?

## Potential N+1 Query Problems
1. 1523x executions - SELECT * FROM users WHERE id = ?
2. 892x executions - SELECT * FROM messages WHERE id = ?

## Queries by Total Time
1. 1847.32ms total (1523x, avg: 1.21ms) - SELECT * FROM users WHERE id = ?
2. 1234.56ms total (234x, avg: 5.28ms) - SELECT * FROM messages WHERE...
3. 987.65ms total (743x, avg: 1.33ms) - SELECT * FROM conferences WHERE...
```

---

## Express.e Compatibility

### Zero Behavior Changes

The profiler is **pure monitoring** with zero behavior changes:

✅ **Queries execute exactly as before**
- Same SQL
- Same parameters
- Same results
- Same error handling

✅ **Minimal overhead**
- <1ms per query
- Uses performance.now() (high precision)
- No blocking operations

✅ **Can be disabled**
- Set DB_PROFILING=false
- No overhead when disabled
- Safe for production

---

## Common Optimization Patterns

### Pattern 1: Add Index for Slow WHERE Clause

**Before (slow query detected):**
```sql
SELECT * FROM messages WHERE conferenceId = ? AND read = 0
-- 234ms average, executed 500 times
```

**Fix:**
```sql
CREATE INDEX idx_messages_conference_read
ON messages(conferenceId, read);
-- Now: 2ms average
```

### Pattern 2: Fix N+1 Query

**Before (N+1 detected):**
```typescript
// Get all messages (1 query)
const messages = db.prepare('SELECT * FROM messages').all();

// Get user for each message (N queries!)
messages.forEach(msg => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(msg.userId);
  msg.userName = user.username;
});
// Total: 1 + N queries
```

**After (fixed):**
```typescript
// Single JOIN query
const messages = db.prepare(`
  SELECT m.*, u.username as userName
  FROM messages m
  LEFT JOIN users u ON m.userId = u.id
`).all();
// Total: 1 query
```

### Pattern 3: Optimize Large Result Sets

**Before (slow - fetching all):**
```sql
SELECT * FROM files ORDER BY uploadDate DESC
-- Returns 10,000 rows, 500ms
```

**After (optimized - pagination):**
```sql
SELECT * FROM files
ORDER BY uploadDate DESC
LIMIT 50 OFFSET ?
-- Returns 50 rows, 5ms
```

---

## Monitoring in Production

### Option 1: Periodic Reports

```typescript
// Log report every hour
setInterval(() => {
  const report = dbProfiler.generateReport();
  console.log(report);

  // Clear stats for next period
  dbProfiler.clear();
}, 3600000); // 1 hour
```

### Option 2: API Endpoint (Admin Only)

```typescript
// Admin endpoint to get profiling data
app.get('/admin/db-profiling', requireAdmin, (req, res) => {
  const data = dbProfiler.export();
  res.json(data);
});

// Generate report
app.get('/admin/db-report', requireAdmin, (req, res) => {
  const report = dbProfiler.generateReport();
  res.type('text/plain').send(report);
});
```

### Option 3: Disable in Production (Recommended)

```typescript
// Only enable in development
if (process.env.NODE_ENV === 'development') {
  const profiledDb = dbProfiler.wrapDatabase(db);
  export function getDatabase() {
    return profiledDb;
  }
} else {
  export function getDatabase() {
    return db;
  }
}
```

---

## Troubleshooting

### High Query Count
- **Symptom:** Thousands of queries per request
- **Cause:** N+1 query problem
- **Fix:** Use JOINs or eager loading

### Slow Individual Queries
- **Symptom:** Queries >100ms
- **Cause:** Missing indexes or complex joins
- **Fix:** Add indexes, optimize SQL

### High Total Duration
- **Symptom:** Total time in seconds for simple operations
- **Cause:** Too many queries or slow queries
- **Fix:** Batch operations, add indexes

### Memory Growth
- **Symptom:** Profiler using too much memory
- **Cause:** maxRecords too high
- **Fix:** Reduce maxRecords or clear() periodically

---

## Best Practices

1. **Enable in development** - Always profile during development
2. **Regular reviews** - Check profiling reports weekly
3. **Set realistic thresholds** - 100ms is reasonable for most queries
4. **Fix N+1 first** - Highest impact optimization
5. **Add indexes strategically** - Based on actual slow queries
6. **Monitor after changes** - Verify optimizations work
7. **Disable in production** - Or use sampling to reduce overhead

---

## Summary

Database profiling provides:
- ✅ Slow query detection
- ✅ N+1 query identification
- ✅ Missing index discovery
- ✅ Performance monitoring
- ✅ Zero behavior changes
- ✅ <1ms overhead
- ✅ Detailed reports

**Key Rule:** Measure first, optimize second. Profile-guided optimization is 10x more effective than guessing.
