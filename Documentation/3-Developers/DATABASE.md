# Database Management Rules

## Column Names - ALWAYS USE LOWERCASE

### Rules:
1. ALL columns are lowercase (e.g., `availableforchat`, `seclevel`, `quietnode`)
2. NEVER use camelCase in SQL queries
3. Use aliases for TypeScript mapping:
   ```sql
   -- ✓ CORRECT:
   SELECT availableforchat as "availableForChat" FROM users

   -- ✗ WRONG:
   SELECT "availableForChat" FROM users
   ```

### UPSERT ON CONFLICT - CRITICAL:
```sql
-- ✗ WRONG - Will cause constraint error:
ON CONFLICT (nodeId) DO UPDATE SET ...

-- ✅ CORRECT - Use lowercase:
ON CONFLICT (nodeid) DO UPDATE SET ...
```

PostgreSQL stores unquoted columns as lowercase internally!

## UNIQUE Constraints - ALWAYS PREVENT DUPLICATES

### When Creating Tables:
```sql
CREATE TABLE IF NOT EXISTS table_name (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  -- OR for composite keys:
  UNIQUE(name, parent_id)
);
```

### Tables with UNIQUE constraints:
- `users(username)` - UNIQUE
- `conferences(name)` - UNIQUE
- `message_bases(name, conferenceid)` - UNIQUE composite
- `file_areas(name, conferenceid)` - UNIQUE composite
- `file_entries(filename, areaid)` - UNIQUE composite
- `node_sessions(nodeid)` - UNIQUE
- `webhooks(name)` - UNIQUE
- `bulletins(filename, conferenceid)` - UNIQUE composite

## Initialization Rules

### ALWAYS call db.init() first:
```typescript
// ✓ CORRECT:
async function initializeData() {
  await db.init();  // MUST be first!
  const conferences = await db.getConferences();
}

// ✗ WRONG:
async function initializeData() {
  const conferences = await db.getConferences(); // WILL CRASH!
}
```

### Schema Changes - Use DROP CASCADE:
```typescript
// ✓ CORRECT: Drop dependent tables first
await client.query(`DROP TABLE IF EXISTS chat_room_messages CASCADE`);
await client.query(`DROP TABLE IF EXISTS chat_room_members CASCADE`);
await client.query(`DROP TABLE IF EXISTS chat_rooms CASCADE`);

// Then create with new schema
await client.query(`CREATE TABLE IF NOT EXISTS chat_rooms ( ... )`);
```

## Common Errors & Fixes

### "relation does not exist"
- **Cause:** db.init() not called
- **Fix:** Add `await db.init()` in initializeData()

### "column referenced in foreign key constraint does not exist"
- **Cause:** Old table schema conflicts with new schema
- **Fix:** DROP CASCADE before CREATE

### "db.init is not a function"
- **Cause:** Missing init() method
- **Fix:** Add public `async init(): Promise<void>` method

### "duplicate key value violates unique constraint"
- **Cause:** ON CONFLICT using camelCase instead of lowercase
- **Fix:** Use lowercase column names in ON CONFLICT clause

## Testing Checklist

Before deploying database changes:
- [ ] Run `cd backend && npm run dev` locally
- [ ] Check console: "Database tables created successfully"
- [ ] Test the feature works
- [ ] Verify tables exist with sample query
