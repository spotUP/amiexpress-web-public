# AmiExpress-Web Project Guidelines

## 🚨 CRITICAL: Task Completion Notifications 🚨

**WHEN YOU COMPLETE NEW TASKS, ALWAYS NOTIFY THE COMMUNITY:**

### Automatic Notifications Required:

1. **Discord Webhook** - Post summary to Discord channel
   - Use webhook URL: `https://discord.com/api/webhooks/REDACTED/REDACTED`
   - Format: Brief summary with achievement highlights
   - Include: What was completed, command coverage %, key stats

2. **BBS Bulletins** - Post daily changelogs to BBS bulletins
   - Location: `backend/data/bbs/BBS/Conf01/Bulletins/`
   - Format: DATE_CHANGELOG.TXT (e.g., `20251025_CHANGELOG.TXT`)
   - Include: Full technical details of changes
   - Add to bulletins database table for display

### When to Post:

- ✅ After completing major features (commands, systems, etc.)
- ✅ After achieving milestones (90%, 100% coverage, etc.)
- ✅ After fixing critical bugs
- ✅ After implementing requested features
- ✅ When daily work session concludes with meaningful changes

### Discord Webhook Format:

```bash
curl -X POST "https://discord.com/api/webhooks/REDACTED/REDACTED" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🎉 **AmiExpress-Web Update**\n\n**Achievement:** <milestone>\n**Coverage:** <percentage>%\n**Changes:** <summary>\n\nSee full details in BBS bulletins!"
  }'
```

### BBS Bulletin Format:

```
[36m-= AmiExpress-Web Development Update =-[0m
Date: October 25, 2025

[32mACHIEVEMENT:[0m <Major milestone>
[32mCOVERAGE:[0m <XX/XX commands (XX%)>

[33mCHANGES:[0m
- <Feature 1>
- <Feature 2>
- <Feature 3>

[33mCODE STATISTICS:[0m
- Lines added: <number>
- Files modified: <number>
- Commits: <number>

[33mNEXT STEPS:[0m
- <Future work>

[35mFull details in Docs/CHANGELOG_*.md[0m
```

### Implementation Example:

```bash
# After completing 100% coverage:
curl -X POST "https://discord.com/api/webhooks/REDACTED/REDACTED" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🏆 **TRUE 100% COVERAGE ACHIEVED!**\n\n**Achievement:** All 47/47 AmiExpress commands now functional!\n**Coverage:** 100% (47/47 commands)\n**Today:** W command (17 options), OLM completion, Door execution system\n\nThis is no longer \"100% of implementable\" - this is **100% PERIOD!**\n\nFull details in latest BBS bulletin!"
  }'

# Create BBS bulletin
echo "[36m-= AmiExpress-Web - TRUE 100% ACHIEVED! =-[0m
...
" > backend/data/bbs/BBS/Conf01/Bulletins/20251025_100PERCENT.TXT
```

**ALWAYS do both when completing tasks!**

---

## 🚨 CRITICAL: Documentation Location 🚨

**ALL new documentation files MUST be created in the `Docs/` directory.**

### Documentation Organization Rules:

1. **New documentation** - Always create in `Docs/` directory, NOT in project root
2. **Existing root docs** - Can be moved to `Docs/` over time (not urgent)
3. **README.md** - Exception: Main README.md stays in root
4. **Config files** - Exception: CLAUDE.md and similar config files stay in root

**Examples:**
- ✅ CORRECT: `Docs/WEBHOOK_INTEGRATION.md`
- ✅ CORRECT: `Docs/SYSOP_WEBHOOK_GUIDE.md`
- ✅ CORRECT: `Docs/DEPLOYMENT_WEBHOOKS.md`
- ✗ WRONG: `WEBHOOK_INTEGRATION.md` (in root)
- ✗ WRONG: `SYSOP_WEBHOOK_GUIDE.md` (in root)

**Why:** Keeps project root clean and organized. All user/developer documentation in one place.

---

## 🚨 CRITICAL: Database Column Names - ALWAYS USE LOWERCASE 🚨

**PostgreSQL column names are CASE-SENSITIVE when quoted!**

### Database Column Name Rules:

1. **ALL columns are lowercase** (e.g., `availableforchat`, `seclevel`, `quietnode`)
2. **NEVER use camelCase** in SQL queries (e.g., `"availableForChat"` will fail)
3. **Use aliases for TypeScript** mapping:
   ```sql
   -- ✓ CORRECT:
   SELECT availableforchat as "availableForChat" FROM users

   -- ✗ WRONG:
   SELECT "availableForChat" FROM users
   ```

4. **Common errors to avoid:**
   - `"availableForChat"` → use `availableforchat`
   - `"secLevel"` → use `seclevel`
   - `"quietNode"` → use `quietnode`
   - `"autoRejoin"` → use `autorejoin`
   - `"confAccess"` → use `confaccess`

5. **Before writing ANY SQL query:**
   - Check `backend/src/database.ts` for existing column mappings (line ~197)
   - Test the query in `psql` before adding to code
   - Remember: PostgreSQL treats `"column"` as case-sensitive, `column` as lowercase

6. **🚨 CRITICAL: UPSERT ON CONFLICT clauses MUST use lowercase:**
   ```sql
   -- ✗ WRONG - Will cause "duplicate key value violates unique constraint" error:
   INSERT INTO node_sessions (id, nodeId, ...) VALUES (...)
   ON CONFLICT (nodeId) DO UPDATE SET ...

   -- ✅ CORRECT - Use lowercase to match PostgreSQL internal storage:
   INSERT INTO node_sessions (id, nodeId, ...) VALUES (...)
   ON CONFLICT (nodeid) DO UPDATE SET ...
   ```
   - PostgreSQL stores unquoted column names as lowercase internally
   - `nodeId` in CREATE TABLE becomes `nodeid` in PostgreSQL
   - ON CONFLICT target MUST match the internal lowercase name
   - This caused 502 errors on file upload (2025-10-25) - backend crashed on connection
   - **ALWAYS use lowercase column names in ON CONFLICT clauses**

**This error has occurred multiple times - ALWAYS verify column names!**

---

## 🚨 CRITICAL: Database UNIQUE Constraints - ALWAYS PREVENT DUPLICATES 🚨

**When creating or modifying database tables, ALWAYS add UNIQUE constraints to prevent duplicate data!**

### UNIQUE Constraint Rules:

1. **Identify natural unique keys** in your table design:
   - Usernames must be unique
   - File names must be unique within an area
   - Conference/area names must be unique
   - Node IDs must be unique

2. **Add UNIQUE constraints in two places:**
   ```sql
   -- In CREATE TABLE statement:
   CREATE TABLE IF NOT EXISTS table_name (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     -- OR for composite keys:
     UNIQUE(name, parent_id)
   );

   -- In migrations (for existing tables):
   ALTER TABLE table_name
   ADD CONSTRAINT table_name_field_key UNIQUE (field);
   ```

3. **Tables with UNIQUE constraints (2025-10-24):**
   - `users(username)` - UNIQUE
   - `conferences(name)` - UNIQUE
   - `message_bases(name, conferenceid)` - UNIQUE composite
   - `file_areas(name, conferenceid)` - UNIQUE composite
   - `file_entries(filename, areaid)` - UNIQUE composite
   - `node_sessions(nodeid)` - UNIQUE
   - `webhooks(name)` - UNIQUE
   - `bulletins(filename, conferenceid)` - UNIQUE composite

4. **Before creating ANY new table, ask yourself:**
   - What fields should NEVER have duplicates?
   - Are there composite keys (multiple fields together) that should be unique?
   - Add UNIQUE constraints for ALL such cases!

5. **History lesson (why this is critical):**
   - Production had 655 file areas when it should have had 5
   - Each area was duplicated 131 times
   - Without UNIQUE constraints, PostgreSQL allows unlimited duplicates
   - This breaks the BBS interface and wastes database space

**NEVER create a table without considering what should be UNIQUE!**

---

## 🚨 CRITICAL: Database Initialization & Schema Management 🚨

**Database errors WILL crash production. Follow these rules religiously.**

### Database Initialization Rules:

1. **The Database class uses a singleton pattern:**
   ```typescript
   // backend/src/database.ts exports:
   export const db = new Database();
   ```

2. **ALWAYS call `await db.init()` before ANY database operations:**
   ```typescript
   // ✓ CORRECT in backend/src/index.ts initializeData():
   async function initializeData() {
     await db.init();  // MUST be first!
     console.log('Database schema initialized');

     const conferences = await db.getConferences();
     // ... rest of initialization
   }

   // ✗ WRONG:
   async function initializeData() {
     const conferences = await db.getConferences(); // WILL CRASH!
   }
   ```

3. **The init() method creates ALL tables:**
   - It calls `initDatabase()` which calls `createTables()`
   - Tables are created using `CREATE TABLE IF NOT EXISTS`
   - Default data is inserted after tables are created

4. **init() must be idempotent (safe to call multiple times):**
   - First call: creates tables and inserts default data
   - Subsequent calls: safe, does nothing if tables exist

### Schema Change Rules:

**BEFORE adding any new tables or columns:**

1. **Test locally FIRST:**
   ```bash
   cd backend
   npm run dev
   # Check console for "Database tables created successfully"
   # Test the feature works locally
   ```

2. **Consider existing production data:**
   - Is there an old version of this table?
   - Will foreign keys break?
   - Do you need to DROP old tables first?

3. **Use proper DROP CASCADE for schema changes:**
   ```typescript
   // ✓ CORRECT: Drop dependent tables first
   await client.query(`DROP TABLE IF EXISTS chat_room_messages CASCADE`);
   await client.query(`DROP TABLE IF EXISTS chat_room_members CASCADE`);
   await client.query(`DROP TABLE IF EXISTS chat_rooms CASCADE`);

   // Then create with new schema
   await client.query(`CREATE TABLE IF NOT EXISTS chat_rooms ( ... )`);
   ```

4. **NEVER modify the Database constructor to call async code:**
   ```typescript
   // ✗ WRONG:
   constructor() {
     this.initDatabase(); // async call in constructor = BAD!
   }

   // ✓ CORRECT:
   constructor() {
     // Only synchronous setup
   }

   async init(): Promise<void> {
     await this.initDatabase(); // Proper async initialization
   }
   ```

### Common Database Errors & Fixes:

**Error:** `relation "table_name" does not exist`
- **Cause:** `db.init()` was not called before database queries
- **Fix:** Add `await db.init()` at the start of `initializeData()`

**Error:** `column "column_name" referenced in foreign key constraint does not exist`
- **Cause:** Old table schema conflicts with new schema
- **Fix:** Drop old tables CASCADE before creating new ones

**Error:** `db.init is not a function`
- **Cause:** The `init()` method doesn't exist in Database class
- **Fix:** Add public `async init(): Promise<void>` method

### Database Testing Checklist:

Before deploying database changes:

- [ ] Run `cd backend && npm run dev` locally
- [ ] Check console: "Database tables created successfully"
- [ ] Check console: "Default data initialized"
- [ ] Test the feature works
- [ ] Check for any database errors in console
- [ ] Verify tables exist: `SELECT * FROM <table_name> LIMIT 1`

### Real Errors We've Encountered (Learn From These!):

**Error 1: "relation does not exist"**
```
error: relation "node_sessions" does not exist
```
- **What Happened:** Backend crashed on startup, users couldn't connect
- **Root Cause:** `db.init()` was NOT called before database queries
- **The Code That Broke:**
  ```typescript
  async function initializeData() {
    const conferences = await db.getConferences(); // ❌ db.init() not called!
  }
  ```
- **The Fix:**
  ```typescript
  async function initializeData() {
    await db.init();  // ✅ MUST be first!
    console.log('Database schema initialized');
    const conferences = await db.getConferences();
  }
  ```
- **Prevention Rule:** ALWAYS check `backend/src/index.ts initializeData()` has `await db.init()` as the FIRST line

**Error 2: "column referenced in foreign key constraint does not exist"**
```
error: column "room_id" referenced in foreign key constraint does not exist
```
- **What Happened:** Database initialization failed, backend started but was broken
- **Root Cause:** Production had old `chat_rooms` table schema, code tried to create new schema with `CREATE TABLE IF NOT EXISTS` which didn't modify existing table
- **The Code That Broke:**
  ```typescript
  // Old table exists with different schema
  await client.query(`CREATE TABLE IF NOT EXISTS chat_rooms (...)`); // ❌ Didn't change existing table!
  ```
- **The Fix:**
  ```typescript
  // Drop old schema first
  await client.query(`DROP TABLE IF EXISTS chat_room_messages CASCADE`);
  await client.query(`DROP TABLE IF EXISTS chat_room_members CASCADE`);
  await client.query(`DROP TABLE IF EXISTS chat_rooms CASCADE`);

  // Then create with new schema
  await client.query(`CREATE TABLE IF NOT EXISTS chat_rooms (...)`); // ✅ Now it works!
  ```
- **Prevention Rule:** When changing table schema, ALWAYS use DROP CASCADE before CREATE

**Error 3: "column does not exist"**
```
error: column "availableforchat" of relation "users" does not exist
```
- **What Happened:** New user registration failed in production
- **Root Cause:** Production database had old schema without new columns we added
- **Why It Happened:** We added columns locally, they worked in dev, but production database wasn't updated
- **The Fix:** Manual SQL to add missing columns:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS availableforchat BOOLEAN DEFAULT true;
  ```
- **Prevention Rule:** Before deploying column additions, check if production needs ALTER TABLE

**Error 4: "db.init is not a function"**
```
TypeError: db.init is not a function
```
- **What Happened:** Backend crashed on startup
- **Root Cause:** We called `db.init()` but the Database class didn't have an `init()` method
- **Why It Happened:** Constructor was calling `this.initDatabase()` directly (async in constructor - bad!)
- **The Fix:**
  ```typescript
  class Database {
    constructor() {
      // ❌ WRONG: this.initDatabase();  // async in constructor!
      // ✅ CORRECT: Don't call async code in constructor
    }

    async init(): Promise<void> {  // ✅ Add public init method
      await this.initDatabase();
    }
  }
  ```
- **Prevention Rule:** NEVER call async code in constructors, always provide public `async init()` method

**Error 5: Frontend worked locally but not in production**
- **What Happened:** Changes worked in development but production was broken
- **Root Cause:** Deployed backend to Render but forgot to deploy frontend to Vercel
- **Why It Happened:** Used separate deployment scripts, easy to forget one
- **The Fix:** Created unified `./Scripts/deployment/deploy.sh` that deploys BOTH
- **Prevention Rule:** ALWAYS use `./Scripts/deployment/deploy.sh`, NEVER deploy only one service

**Error 6: TypeScript build error on Vercel**
```
error TS6133: 'React' is declared but its value is never read.
```
- **What Happened:** Vercel build failed, frontend deployment blocked
- **Root Cause:** Unused import in `frontend/src/main.tsx`
- **Why It Happened:** React 17+ JSX transform doesn't need explicit React import, but we had it
- **The Fix:** Remove unused import
- **Prevention Rule:** Always run `cd frontend && npm run build` locally before deploying

### Critical Deployment Lessons (2025-10-24 Session):

From today's session, we learned these patterns cause production crashes:

1. **Pattern: Database not initialized**
   - Symptom: "relation does not exist" errors
   - Always check: `initializeData()` starts with `await db.init()`
   - Test: Backend should log "Database tables created successfully"

2. **Pattern: Schema conflicts**
   - Symptom: "foreign key constraint" errors
   - Always use: DROP CASCADE before creating tables with schema changes
   - Test: Delete local database and run backend to verify clean creation

3. **Pattern: Deploying only one service**
   - Symptom: Changes work locally but not in production
   - Always use: `./Scripts/deployment/deploy.sh` (deploys both)
   - Never use: `deploy-render.sh` or `deploy-vercel.sh` (removed!)

4. **Pattern: Not testing builds locally**
   - Symptom: Build failures in Vercel/Render
   - Always run: `npm run build` in both backend and frontend
   - Test: Both should complete without errors

5. **Pattern: Async in constructors**
   - Symptom: "is not a function" or race conditions
   - Always provide: Public `async init()` method
   - Never do: Call async code in constructor

### Before Every Deployment - MANDATORY CHECKLIST:

Copy this and check EVERY item before deploying:

```bash
# === PRE-DEPLOYMENT CHECKLIST ===

# 1. DATABASE CHANGES
[ ] If you modified database.ts createTables(), did you add DROP CASCADE?
[ ] Does initializeData() start with await db.init()?
[ ] Run backend locally and check console for "Database tables created successfully"

# 2. BUILD TESTS
[ ] cd backend && npm run dev (no errors?)
[ ] cd frontend && npm run build (no TypeScript errors?)
[ ] Test the feature works locally

# 3. CODE REVIEW
[ ] No async code in constructors?
[ ] No hardcoded CORS origins (should use config.corsOrigins)?
[ ] All database columns lowercase (not camelCase)?

# 4. DOCUMENTATION
[ ] Created/updated changelog entry documenting all changes?
[ ] Updated relevant documentation in Docs/ if needed?
[ ] Documented any breaking changes or new features?

# 5. DEPLOYMENT - CRITICAL: ALWAYS DEPLOY BOTH SERVICES
[ ] Using ./Scripts/deployment/deploy.sh (deploys BOTH backend AND frontend)?
[ ] NEVER use deploy-render.sh or deploy-vercel.sh alone
[ ] Committed all changes?
[ ] Pushed to GitHub?
[ ] Wait for BOTH backend and frontend to complete deployment
[ ] Verify deploy.sh completed successfully (no errors)

# 6. POST-DEPLOYMENT - VERIFY BOTH SERVICES
[ ] Backend: curl https://amiexpress-backend.onrender.com/ (returns API message?)
[ ] Frontend: curl https://bbs.uprough.net (returns 200?)
[ ] Check Render logs: render logs --resources srv-d3naaffdiees73eebd0g --limit 50 -o text
[ ] Look for "Database schema initialized" and "Server running on port 10000"
[ ] Test in browser - WebSocket connected?
[ ] Verify both services show new commit in production

# === IF ANY STEP FAILS, DO NOT DEPLOY ===
```

---

## 🚨 CRITICAL: Deployment Process - ALWAYS DEPLOY BOTH SERVICES 🚨

**The biggest cause of production errors is deploying only backend OR only frontend.**

### Deployment Architecture:

```
Production Stack:
├─ Backend: Render.com (srv-d3naaffdiees73eebd0g)
│  ├─ PostgreSQL database
│  ├─ WebSocket server (Socket.io)
│  └─ REST API
│
└─ Frontend: Vercel (bbs.uprough.net)
   ├─ Static React app
   ├─ xterm.js terminal
   └─ Connects to backend via WebSocket
```

### MANDATORY Deployment Steps:

**1. Test Locally Before Deploying:**
```bash
# Backend test:
cd backend && npm run dev
# Check console for errors, especially database init

# Frontend test:
cd frontend && npm run build
# Check for TypeScript/build errors
```

**2. Commit Changes:**
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

**3. Deploy BOTH Services:**
```bash
# Use the unified deployment script
./Scripts/deployment/deploy.sh

# NEVER use these (they're removed):
# ./Scripts/deployment/deploy-render.sh  ✗ WRONG
# ./Scripts/deployment/deploy-vercel.sh  ✗ WRONG
```

**4. Monitor Deployment:**
```bash
# Check Render logs for backend:
render logs --resources srv-d3naaffdiees73eebd0g --limit 50 -o text

# Look for these success messages:
# - "Database schema initialized"
# - "Database tables created successfully"
# - "✅ Server running on port 10000"

# Check for errors:
# - "relation does not exist" = database not initialized
# - "column referenced in foreign key" = schema mismatch
# - "db.init is not a function" = missing init() method
```

**5. Verify Production:**
```bash
# Backend health:
curl https://amiexpress-backend.onrender.com/
# Expected: {"message":"AmiExpress Backend API"}

# Frontend health:
curl -I https://bbs.uprough.net
# Expected: HTTP/2 200

# Test in browser:
# Visit https://bbs.uprough.net
# Open console (F12)
# Look for: "✅ Connected to BBS backend via websocket"
```

### Deployment Troubleshooting:

**Backend won't start:**
1. Check Render logs: `render logs --resources srv-d3naaffdiees73eebd0g --limit 50 -o text`
2. Look for database errors (relation/column not exist)
3. Check if `db.init()` is called in `initializeData()`
4. Verify DATABASE_URL is set in Render environment variables

**Frontend build fails:**
1. Check Vercel build logs
2. Look for TypeScript errors
3. Test build locally: `cd frontend && npm run build`
4. Common fix: Remove unused imports

**WebSocket connection fails:**
1. Check CORS configuration in `backend/src/config.ts`
2. Verify `https://bbs.uprough.net` is in `corsOrigins`
3. Check browser console for CORS errors
4. Verify backend is running (not 502 error)

### Deployment Rules to NEVER Break:

1. **🚨 CRITICAL: ALWAYS deploy BOTH backend AND frontend together - NO EXCEPTIONS 🚨**
   - **ALWAYS** use `./Scripts/deployment/deploy.sh` - it deploys both
   - **NEVER** use `deploy-render.sh` or `deploy-vercel.sh` alone
   - **NEVER** deploy only one service - this causes production errors
   - Backend changes may need frontend updates (API changes)
   - Frontend changes may need backend updates (WebSocket protocol)
   - Wait for BOTH deployments to complete before considering deployment done

2. **NEVER commit without testing locally first**
   - Run backend locally and check for errors
   - Build frontend locally and check for errors
   - Saves time vs debugging in production

3. **NEVER modify database schema without DROP CASCADE**
   - Production database may have old schema
   - Old schema + new code = crashes
   - Always DROP old tables before CREATE new ones

4. **NEVER skip checking Render logs after deployment**
   - Errors don't always show in curl test
   - Database errors appear in logs
   - Check logs EVERY deployment

5. **NEVER deploy during active user sessions**
   - Backend restart kills WebSocket connections
   - Users lose their session state
   - Deploy during low-traffic times

### Emergency Rollback:

If deployment breaks production:

```bash
# 1. Find last working commit
git log --oneline -10

# 2. Deploy that commit
./Scripts/deployment/deploy.sh <commit-sha>

# Example:
./Scripts/deployment/deploy.sh d796baf
```

---

## 🚨 MANDATORY: 1:1 PORT - ALWAYS CHECK E SOURCES FIRST 🚨

**THIS IS THE #1 RULE - FAILURE TO FOLLOW THIS WASTES EVERYONE'S TIME**

### BEFORE Writing or Modifying ANY Code:

**YOU MUST CHECK THE ORIGINAL AMIEXPRESS E SOURCES:**

1. **Find the original implementation:**
   ```bash
   # Search for the function/command in express.e
   grep -n "internalCommand<X>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   grep -n "PROC <functionName>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

2. **Read the original E code:**
   ```bash
   sed -n '<startLine>,<endLine>p' ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

3. **Check the original menu files:**
   ```bash
   cat ~/Code/AmiExpress-Web/backend/data/bbs/BBS/Conf01/Screens/MENU.TXT
   ```

4. **ONLY THEN implement the exact behavior - NO GUESSING, NO ASSUMPTIONS**

### Why This Is CRITICAL:

- This is a **1:1 port** of the original AmiExpress BBS software
- Every command, every flow, every behavior must match express.e EXACTLY
- The user has the E sources for a reason - USE THEM
- Making up features or guessing wastes time and breaks authenticity
- User has repeatedly emphasized this - DON'T FORGET

### Example of What NOT to Do:

❌ **WRONG:** "I'll change DOORS to X for door games"
- Did you check express.e? NO
- Did you check what X does? NO
- Result: X is expert mode toggle, you broke it

✅ **CORRECT:**
1. Search express.e for door implementation
2. Read how internalCommandX works (it's expert mode)
3. Find how doors are actually accessed (BBS commands)
4. Implement exactly as the original

### Command Priority (from express.e:28228):
```
1. SysCommand (SYSCMD)
2. BbsCommand (BBSCMD)
3. InternalCommand (built-in)
```

**If you're implementing a feature and haven't looked at express.e, STOP and look at it first.**

---

## 🚨 CRITICAL: NEVER OVERWRITE ORIGINAL AMIEXPRESS COMMANDS 🚨

**THIS IS EQUALLY AS IMPORTANT AS THE 1:1 PORT RULE**

### SACRED RULE: Command Namespace Preservation

**ALL original AmiExpress commands are SACRED and must NEVER be overwritten, replaced, or modified to do something different.**

### Rules for Commands:

1. **Original AmiExpress Commands - UNTOUCHABLE:**
   - If a command exists in express.e, it is **SACRED**
   - You MUST implement it exactly as express.e specifies
   - You CANNOT change its behavior
   - You CANNOT replace it with something else
   - You CANNOT remove it

2. **New/Web-Specific Commands - Use Different Names:**
   - If you need a new feature for the web version, create a NEW command name
   - NEVER use a name that conflicts with express.e commands
   - Use descriptive names like: WEB_*, MODERN_*, CUSTOM_*, etc.
   - Document all custom commands in a separate file

3. **Before Creating ANY Command:**
   ```bash
   # Check if command name exists in express.e
   grep -i "ELSEIF.*StrCmp(cmdcode,'YOUR_COMMAND')" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e

   # If found: YOU MUST implement it exactly as express.e shows
   # If not found: You CAN create it as a custom command
   ```

### Example of WRONG vs CORRECT:

❌ **WRONG - Overwriting Original Command:**
```typescript
case 'X':  // X is expert mode toggle in express.e
  displayDoorMenu(socket, session);  // WRONG! Changing X's behavior
  return;
```

✅ **CORRECT - Preserving Original + Adding Custom:**
```typescript
case 'X':  // Expert Mode Toggle - express.e:26113
  // ... implement exactly as express.e shows
  return;

case 'WEB_DOORS':  // Custom web-specific command
  displayDoorMenu(socket, session);
  return;
```

### Custom Command Naming Convention:

**For web-specific features, use these prefixes:**
- `WEB_*` - Web interface features
- `MODERN_*` - Modern enhancements
- `CUSTOM_*` - Custom additions
- `ADMIN_*` - Administrative tools

**Examples:**
- `WEB_DOORS` - Web door menu (if needed)
- `WEB_SETTINGS` - Web-specific settings
- `MODERN_SEARCH` - Enhanced search features
- `CUSTOM_STATS` - Custom statistics

### Verification Checklist:

Before adding/modifying ANY command:
- [ ] Did I check if this command exists in express.e?
- [ ] If it exists in express.e, am I implementing it EXACTLY as shown?
- [ ] If it doesn't exist, am I using a non-conflicting name?
- [ ] Have I documented this as a custom command?

### Command Registry:

**Keep an updated list of:**
1. **Original AmiExpress Commands** - From express.e (NEVER modify)
2. **Custom Web Commands** - Our additions (clearly marked)

**Location:** See `COMMANDS.md` for the complete registry.

---

## ⚠️ CRITICAL: Server Restart Checklist (ALWAYS READ THIS FIRST)

**BEFORE restarting backend or frontend servers, YOU MUST follow this checklist:**

### Step 1: Check for Startup Scripts
```bash
ls -la start-*.sh stop-all.sh
```

### Step 2: If Scripts Exist - Use Them!
```bash
# ✓ CORRECT - Use atomic startup scripts
./start-all.sh      # Start both servers
./start-backend.sh  # Backend only
./start-frontend.sh # Frontend only
./stop-all.sh       # Stop all servers

# ✗ WRONG - NEVER do this:
npm run dev &
npm run dev 2>&1 &
cd backend/backend && npm run dev &
```

### Step 3: Never Use Manual Commands
**YOU MUST NOT use these commands in this project:**
- `npm run dev &`
- `npm run dev 2>&1 &`
- Any variant of manual npm commands for servers

### Step 4: Why This Matters
- User has reported this issue MULTIPLE times
- Manual commands create duplicate server instances
- Duplicate instances = stale code = wasted time
- Startup scripts guarantee exactly ONE server per port
- You keep forgetting - THIS TIME DON'T FORGET!

### Step 5: After Starting
Verify exactly ONE server per port:
```bash
lsof -ti:3001 | xargs ps -p | grep "node"  # Should show 1 line
lsof -ti:5173 | xargs ps -p | grep "node"  # Should show 1 line
```

**📋 Read this section EVERY TIME before restarting servers!**

---

## Text Styling Rules

### NEVER Use Bold Text Styles
**IMPORTANT**: This BBS must NEVER use bold text styles in any ANSI screen files or terminal output.

- ❌ **DO NOT** use `\x1b[1;XXm` or `[1;XXm` (bold text codes)
- ✅ **USE** `\x1b[0;XXm` or `[XXm` (normal text codes)
- ❌ **DO NOT** use any ANSI bold attributes (attribute 1)

### Rationale
Classic Amiga terminals and the authentic AmiExpress BBS experience did not use bold text styling. All text should use normal weight for historical accuracy and authentic appearance.

### Screen File Guidelines
When creating or editing screen files (`.TXT` files in `backend/data/bbs/BBS/Node0/Screens/`):
- Use traditional Amiga ASCII art (characters: `_`, `/`, `\`, `|`, `-`)
- NO PC DOS box-drawing characters (e.g., `█`, `╔`, `═`, `╗`)
- NO bold text styles
- Keep all screens within 80x24 terminal dimensions
- Use `\r\n` line endings for proper BBS display
- Remove built-in pause prompts (handled by `doPause()` function)

### Color Codes Reference (Without Bold)
```
[30m  - Black
[31m  - Red
[32m  - Green
[33m  - Yellow
[34m  - Blue
[35m  - Magenta
[36m  - Cyan
[37m  - White
[0m   - Reset
```

## Implementation Details

### 1:1 AmiExpress Port
This project is a 1:1 port of the original AmiExpress BBS software. Every implementation must match the original E sources exactly (found in `AmiExpress-Sources/express.e`).

### Screen Display Flow
The screen display system follows express.e lines 28555-28648:
1. BBSTITLE (on connect, no pause)
2. LOGON (after login, with pause)
3. BULL (system bulletins, with pause if shown)
4. NODE_BULL (node-specific bulletins, with pause if shown)
5. confScan (scanning for new messages)
6. CONF_BULL (conference bulletins, with pause if shown)
7. MENU (main menu, with pause if needed)

### State Machine
The BBS uses proper substates:
- `DISPLAY_BULL` - Shows BULL and NODE_BULL screens
- `DISPLAY_CONF_BULL` - Joins conference and shows CONF_BULL
- `DISPLAY_MENU` - Shows menu with respect to menuPause flag
- `READ_COMMAND` - Waits for line input
- `READ_SHORTCUTS` - Waits for hotkey input (expert mode)
- always post daily changelogs to the bbs bulletins if there are any

### 🚨 CRITICAL: Main Menu Updates

**ALWAYS update the main menu when implementing new commands:**

1. **After implementing a new command** - You MUST add it to the main menu
2. **Main menu location** - `backend/BBS/Screens/MENU.TXT`
3. **Check express.e first** - Verify the command doesn't already exist in the original
4. **Custom commands** - If it's a custom command (not in express.e), clearly mark it
5. **Use appropriate section** - Place commands in the correct category (MESSAGES, FILES, CONFERENCE, SYSTEM)
6. **Test in BBS** - Verify the command appears and works correctly

**Example:**
If you implement a new `WEBHOOK` admin command:
- Add it to the SYSTEM section or create an ADMIN section
- Use format: `[WEBHOOK] Manage Hooks` or similar
- Verify it's accessible only to sysops (security level check)

## Backend Architecture & Modularization

### MANDATORY: Modular Code Structure
**All future development MUST follow the modular architecture established in Phase 1.**

#### Required Structure
```
backend/backend/src/
├── constants/          - ANSI codes, enums, static values
├── utils/              - Reusable utility functions
├── middleware/         - Express/Socket.IO middleware
├── handlers/           - Request/socket handlers
├── services/           - Business logic layer
└── repositories/       - Database access layer (future)
```

#### Use Existing Utilities - DO NOT Duplicate Code
**ALWAYS use these utilities instead of hardcoding:**

```typescript
// ✅ CORRECT - Use AnsiUtil
import { AnsiUtil } from './utils/ansi.util';
socket.emit('ansi-output', AnsiUtil.errorLine('Invalid input'));
socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

// ❌ WRONG - DO NOT hardcode ANSI
socket.emit('ansi-output', '\r\n\x1b[31mInvalid input\x1b[0m\r\n');
socket.emit('ansi-output', '\r\n\x1b[32mPress any key...\x1b[0m');
```

```typescript
// ✅ CORRECT - Use ErrorHandler
import { ErrorHandler } from './utils/error-handling.util';
ErrorHandler.permissionDenied(socket, 'delete files', {
  nextState: LoggedOnSubState.DISPLAY_CONF_BULL
});

// ❌ WRONG - DO NOT duplicate error handling
socket.emit('ansi-output', '\r\n\x1b[31mPermission denied\x1b[0m\r\n');
session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
```

```typescript
// ✅ CORRECT - Use PermissionsUtil
import { PermissionsUtil } from './utils/permissions.util';
if (!PermissionsUtil.canDeleteFiles(session.user)) {
  return ErrorHandler.permissionDenied(socket, 'delete files');
}

// ❌ WRONG - DO NOT duplicate permission checks
if (session.user.secLevel < 100) {
  socket.emit('ansi-output', 'Permission denied\r\n');
}
```

```typescript
// ✅ CORRECT - Use ParamsUtil
import { ParamsUtil } from './utils/params.util';
const params = ParamsUtil.parse(paramString);
const hasNonStop = ParamsUtil.hasFlag(params, 'NS');
const range = ParamsUtil.extractRange(params);

// ❌ WRONG - DO NOT manually parse params
const params = paramString.split(' ').map(p => p.toUpperCase());
```

#### Available Utilities (37 methods total)

**AnsiUtil** (13 methods in `utils/ansi.util.ts`):
- `colorize(text, color)` - Apply color to text
- `error(text)` - Red error text
- `success(text)` - Green success text
- `warning(text)` - Yellow warning text
- `header(text)` - Cyan header text
- `clearScreen()` - Clear terminal
- `line(text?)` - Add line with CRLF
- `pressKeyPrompt()` - Standard "Press any key..." prompt
- `errorLine(text)` - Error with line ending
- `successLine(text)` - Success with line ending
- `headerBox(text)` - Header with decorative border
- `menuOption(key, description)` - Formatted menu option
- `complexPrompt(parts)` - Multi-color prompt

**ErrorHandler** (6 methods in `utils/error-handling.util.ts`):
- `sendError(socket, message, options)` - Send error with optional state change
- `sendSuccess(socket, message, options)` - Send success message
- `sendWarning(socket, message, options)` - Send warning message
- `permissionDenied(socket, action, options)` - Permission denied error
- `invalidInput(socket, field, options)` - Invalid input error
- `notFound(socket, item, options)` - Not found error

**ParamsUtil** (5 methods in `utils/params.util.ts`):
- `parse(paramString)` - Parse space-separated params
- `hasFlag(params, flag)` - Check for specific flag
- `extractRange(params)` - Extract numeric range (e.g., "1-10")
- `extractNumber(params)` - Extract single number
- `extractDate(params)` - Extract date (MM/DD/YY)

**PermissionsUtil** (13 methods in `utils/permissions.util.ts`):
- `canDeleteFiles(user)` - Check file deletion permission
- `canMoveFiles(user)` - Check file move permission
- `canAccessFileMaintenance(user)` - Check maintenance access
- `canEditFileDescriptions(user)` - Check edit permission
- `canPostMessages(user)` - Check message posting permission
- `canDeleteMessage(user, messageAuthor)` - Check message deletion
- `isSysop(user)` - Check if full sysop (level 255)
- `isCoSysop(user)` - Check if co-sysop (level 100+)
- `hasSecurityLevel(user, level)` - Check specific security level
- `canUploadFiles(user)` - Check upload permission
- `canDownloadFiles(user)` - Check download permission
- `canAccessDoors(user)` - Check door access
- `canPageSysop(user)` - Check paging permission

#### Constants to Use

**ANSI Codes** (`constants/ansi-codes.ts`):
```typescript
import { ANSI, LINE_ENDING } from './constants/ansi-codes';
// Use ANSI.RED, ANSI.GREEN, ANSI.CYAN, etc.
// Use ANSI.CLEAR_SCREEN, ANSI.RESET, etc.
```

**BBS States** (`constants/bbs-states.ts`):
```typescript
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
// Use LoggedOnSubState.DISPLAY_MENU, LoggedOnSubState.READ_COMMAND, etc.
```

### Code Optimization Rules

#### 1. NO Duplicate Code
- **Before adding new code**, check if similar functionality exists
- **Use existing utilities** from `utils/` directory
- **Centralize common patterns** - don't copy/paste

#### 2. Separation of Concerns
- **Handlers** - Handle socket/HTTP requests, orchestrate calls
- **Services** - Contain business logic (future)
- **Repositories** - Database access only (future)
- **Utils** - Pure functions, no side effects

#### 3. Single Responsibility Principle
- Each function should do ONE thing
- If a function exceeds 50 lines, consider breaking it up
- Extract complex logic into separate functions

#### 4. DRY (Don't Repeat Yourself)
- If code appears 3+ times, create a utility function
- Parameter parsing, error handling, ANSI formatting are all centralized
- **Check existing utilities before writing new code**

#### 5. File Size Limits
- Handler files: Keep under 500 lines
- Utility files: Keep under 200 lines
- If file grows too large, split into logical modules

### New Feature Development Process

When adding new features:

1. **Check Documentation**
   - Read `backend/backend/MODULARIZATION_GUIDE.md` for architecture overview
   - Review existing handlers for patterns

2. **Use Existing Utilities**
   - Import from `utils/` for common operations
   - Import from `constants/` for enums and codes
   - DO NOT duplicate functionality

3. **Create New Handlers**
   - Place in `handlers/` directory
   - Follow naming convention: `feature.handler.ts`
   - Export a class with methods

4. **Keep It Modular**
   - Separate presentation (socket output) from logic
   - Use dependency injection where possible
   - Make functions testable

5. **Document Complex Logic**
   - Add comments explaining "why", not "what"
   - Update MODULARIZATION_GUIDE.md if adding major features

### Examples

#### ✅ GOOD - Modular, reusable
```typescript
import { AnsiUtil } from './utils/ansi.util';
import { ErrorHandler } from './utils/error-handling.util';
import { PermissionsUtil } from './utils/permissions.util';
import { LoggedOnSubState } from './constants/bbs-states';

function handleFileDelete(socket: any, session: any) {
  // Check permissions
  if (!PermissionsUtil.canDeleteFiles(session.user)) {
    return ErrorHandler.permissionDenied(socket, 'delete files', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
  }

  // Business logic here...
  socket.emit('ansi-output', AnsiUtil.headerBox('Delete Files'));
  socket.emit('ansi-output', AnsiUtil.successLine('Files deleted successfully'));
}
```

#### ❌ BAD - Hardcoded, duplicated
```typescript
function handleFileDelete(socket: any, session: any) {
  // Hardcoded permission check (duplicated 20+ times)
  if (session.user.secLevel < 100) {
    socket.emit('ansi-output', '\r\n\x1b[31mPermission denied\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key...\x1b[0m');
    session.subState = 'display_conf_bull';
    return;
  }

  // Hardcoded ANSI (duplicated everywhere)
  socket.emit('ansi-output', '\x1b[36m-= Delete Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mFiles deleted successfully\x1b[0m\r\n');
}
```

### Future Modularization Roadmap

See `backend/backend/MODULARIZATION_GUIDE.md` and `backend/backend/FILE_HANDLER_PLAN.md` for:
- Phase 2: File operations handler (~1,100 lines to extract)
- Phase 3: Message & conference handlers (~400 lines)
- Phase 4: Door, chat & account handlers (~650 lines)
- Phase 5: Database repository pattern (~1,900 lines)

**Goal:** Reduce monolithic files to focused, testable modules:
- index.ts: 3,618 → ~800 lines (78% reduction)
- database.ts: 2,264 → ~300 lines (87% reduction)

## Development Server Management

### MANDATORY: Use Startup Scripts ONLY
**CRITICAL: NEVER manually start servers with `npm run dev` or background commands.**

**Problem:** Manual server startup causes multiple instances to run, leading to stale code and development issues.

**Solution:** Always use the dedicated startup scripts that ensure exactly ONE instance runs.

### Available Scripts

**Start All Servers (Recommended):**
```bash
./start-all.sh
```
- Kills any existing servers on both ports
- Starts backend on port 3001
- Starts frontend on port 5173
- Verifies exactly ONE process per port
- Shows success/failure status

**Start Individual Servers:**
```bash
./start-backend.sh    # Backend only (port 3001)
./start-frontend.sh   # Frontend only (port 5173)
```

**Stop All Servers:**
```bash
./stop-all.sh
```
- Kills all servers on both ports
- Use before starting if you're unsure about current state

### When to Restart Servers

**After Backend Changes:**
- TypeScript files in `backend/backend/src/`
- Database schema changes
- Environment variables (.env)
- Dependencies (package.json)
- **Action:** Run `./start-backend.sh`

**After Frontend Changes:**
- Usually hot-reloads automatically
- If changes don't appear, run `./start-frontend.sh`

**When in Doubt:**
- Run `./stop-all.sh` then `./start-all.sh`
- Better safe than running stale code

### Verification Commands

**Check server status:**
```bash
# Count servers (should be 1 each)
lsof -ti:3001 | wc -l    # Backend (expect: 1)
lsof -ti:5173 | wc -l    # Frontend (expect: 1)

# Test endpoints
curl http://localhost:3001/    # Should return: {"message":"AmiExpress Backend API"}
curl http://localhost:5173/    # Should return HTML
```

### Default Ports
- Backend API: `http://localhost:3001`
- Frontend BBS: `http://localhost:5173` ← Users access this
- **NEVER** change these ports without user approval

### Critical Rules for Claude Code

1. **NEVER run `npm run dev` or `npm run dev &` manually**
2. **ALWAYS use `./start-backend.sh` or `./start-all.sh`**
3. **ALWAYS verify exactly 1 process per port after starting**
4. **If multiple processes detected, STOP and use `./stop-all.sh` first**
5. **Report to user if scripts fail** - don't fall back to manual commands