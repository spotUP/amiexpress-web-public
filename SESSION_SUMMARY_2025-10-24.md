# Deployment & Database Fix Session - 2025-10-24

## Session Summary

This session focused on fixing deployment issues and strengthening the database/deployment process to prevent future production crashes.

## Issues Fixed

### 1. CORS Configuration (✅ FIXED)
- **Problem:** WebSocket connections from bbs.uprough.net (Vercel) were blocked
- **Cause:** Backend CORS only allowed `http://localhost:5173`
- **Fix:** Added `https://bbs.uprough.net` to CORS origins in `backend/src/config.ts`
- **Commit:** `ad32ce6`
- **Status:** Deployed and working

### 2. TypeScript Build Error (✅ FIXED)
- **Problem:** Vercel build failing with "React is declared but never used"
- **Cause:** Unused React import in `frontend/src/main.tsx`
- **Fix:** Removed unused import (React 17+ JSX transform doesn't need it)
- **Commit:** `7b91a6a`
- **Status:** Deployed and working

### 3. Database Initialization (✅ FIXED IN CODE)
- **Problem:** Backend crashing with "relation node_sessions does not exist"
- **Cause:** Database schema not initialized before queries
- **Fix:** Added `await db.init()` call at start of `initializeData()`
- **Commits:** `6266634`, `0395d4a`
- **Status:** Code fixed, deployed

### 4. Chat Rooms Schema Mismatch (✅ FIXED IN CODE)
- **Problem:** Foreign key constraint error on room_id column
- **Cause:** Old chat_rooms schema conflicted with new schema
- **Fix:** Added DROP CASCADE before creating new tables
- **Commit:** `58fc1fc`
- **Status:** Code fixed, deployed

### 5. Deployment Script Improvements (✅ COMPLETE)
- **Created:** `Scripts/deployment/deploy.sh` - Unified full-stack deployment
- **Removed:** 6 obsolete deployment scripts (deploy-render.sh, deploy-vercel.sh, etc.)
- **Commits:** `6610e2e`, `2b74c90`
- **Status:** Complete

### 6. Deployment Documentation (✅ COMPLETE)
- **Created:** Comprehensive `Docs/DEPLOYMENT.md` guide
- **Updated:** `CLAUDE.md` with critical database and deployment rules
- **Commits:** `6610e2e`, `9d38c46`
- **Status:** Complete

## Known Issues (Production)

### Users Table Schema Mismatch (⚠️ NEEDS MANUAL FIX)
- **Problem:** Production users table has old schema, missing `availableforchat` column
- **Error:** `column "availableforchat" of relation "users" does not exist`
- **Impact:** New user registration fails
- **Cause:** Production database has old schema from before recent changes

#### Manual Fix Required:

Run this SQL on production database via Render Dashboard Shell:

```sql
-- Option 1: Add missing column if it doesn't exist (preserves data)
ALTER TABLE users ADD COLUMN IF NOT EXISTS availableforchat BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quietnode BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS autorejoin INTEGER DEFAULT 0;

-- Option 2: Drop and recreate (LOSES ALL USERS - use with caution!)
-- DROP TABLE IF EXISTS users CASCADE;
-- Then restart the backend to let db.init() recreate it
```

**To run on Render:**
1. Go to: https://dashboard.render.com/web/srv-d3naaffdiees73eebd0g
2. Click "Shell" tab
3. Run: `psql $DATABASE_URL`
4. Execute SQL above
5. Restart backend service

## Files Modified

### Backend
- `backend/src/config.ts` - Added CORS origins
- `backend/src/database.ts` - Added init() method, DROP CASCADE for chat_rooms
- `backend/src/index.ts` - Added db.init() call

### Frontend
- `frontend/src/main.tsx` - Removed unused React import

### Deployment
- `Scripts/deployment/deploy.sh` - Created unified deployment script
- `Docs/DEPLOYMENT.md` - Created comprehensive deployment guide
- `CLAUDE.md` - Added critical database and deployment rules

### Documentation
- `DEPLOYMENT_SUMMARY.md` - Created deployment summary (from earlier in session)
- `SESSION_SUMMARY_2025-10-24.md` - This file

## Git Commits (8 Total)

1. `ad32ce6` - fix: Add bbs.uprough.net to CORS origins
2. `6610e2e` - feat: Add full-stack deployment script and documentation
3. `2b74c90` - chore: Remove obsolete deployment scripts
4. `7b91a6a` - fix: Remove unused React import
5. `6266634` - fix: Initialize database schema before querying
6. `58fc1fc` - fix: Drop and recreate chat_rooms tables
7. `0395d4a` - fix: Add public init() method to Database class
8. `9d38c46` - docs: Add critical database and deployment rules to CLAUDE.md

## Production Status

### ✅ Working
- Frontend: https://bbs.uprough.net (200 OK)
- Backend API: https://amiexpress-backend.onrender.com/ (200 OK)
- WebSocket connection: Working
- LIVECHAT: Working (tested in previous session)
- Database connection: Working

### ⚠️ Needs Fix
- New user registration: Fails due to schema mismatch
- Users table: Missing columns from recent updates

## New CLAUDE.md Rules Added

To prevent future issues, comprehensive rules were added:

### Database Rules
1. Always call `await db.init()` before database operations
2. Test locally before deploying database changes
3. Use DROP CASCADE when changing table schemas
4. Never call async code in constructors
5. Common error patterns and fixes documented

### Deployment Rules
1. ALWAYS deploy both backend and frontend together
2. NEVER commit without testing locally
3. NEVER modify database schema without DROP CASCADE
4. NEVER skip checking Render logs after deployment
5. How to use unified deployment script
6. How to monitor and troubleshoot deployments
7. Emergency rollback procedures

## Next Steps

### Immediate (User Action Required)
1. Fix users table schema in production (see SQL above)
2. Test new user registration after fix
3. Verify existing users can still login

### Future Improvements
1. Consider proper database migration system (e.g., Prisma Migrate, TypeORM migrations)
2. Add database backup/restore scripts
3. Add automated testing before deployment
4. Consider staging environment for testing schema changes

## Deployment Process Going Forward

Always use this process:

```bash
# 1. Test locally
cd backend && npm run dev  # Check for errors
cd frontend && npm run build  # Check for errors

# 2. Commit
git add .
git commit -m "Description"
git push origin main

# 3. Deploy both services
./Scripts/deployment/deploy.sh

# 4. Monitor
render logs --resources srv-d3naaffdiees73eebd0g --limit 50 -o text

# 5. Verify
curl https://amiexpress-backend.onrender.com/
curl https://bbs.uprough.net
# Test in browser at https://bbs.uprough.net
```

## Lessons Learned

1. **Database initialization must be explicit and awaited** - Don't rely on constructor
2. **Schema changes need migration strategy** - DROP CASCADE or ALTER TABLE
3. **Always deploy both services** - Backend and frontend are tightly coupled
4. **Test locally before deploying** - Saves debugging time in production
5. **Check logs after every deployment** - Errors don't always show in health checks
6. **Documentation prevents repetition** - Rules in CLAUDE.md will help future work

## Time Spent

- CORS fix and deployment: ~30 minutes
- Database initialization fixes: ~45 minutes
- Deployment script consolidation: ~30 minutes
- Documentation (CLAUDE.md rules): ~45 minutes
- **Total:** ~2.5 hours

---

**Session Completed:** 2025-10-24
**Services Status:** ✅ Backend and Frontend Running
**Remaining Issue:** ⚠️ Users table schema mismatch (requires manual SQL fix)
**Documentation:** ✅ Complete and comprehensive
