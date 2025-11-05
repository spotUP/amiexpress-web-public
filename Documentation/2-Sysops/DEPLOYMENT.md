# Deployment Guide

## Architecture

```
Production Stack:
├─ Backend: Render.com (srv-d3naaffdiees73eebd0g)
│  ├─ SQLite database (file-based)
│  ├─ WebSocket server (Socket.io)
│  └─ REST API
│
└─ Frontend: Vercel (bbs.uprough.net)
   ├─ Static React app
   ├─ xterm.js terminal
   └─ Connects to backend via WebSocket
```

## 🚨 CRITICAL RULE: ALWAYS DEPLOY BOTH SERVICES

**The #1 cause of production errors is deploying only backend OR only frontend.**

## Deployment Steps

### 1. Test Locally
```bash
# Backend test:
cd backend && npm run dev
# Check console for errors

# Frontend test:
cd frontend && npm run build
# Check for TypeScript errors
```

### 2. Commit Changes
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

### 3. Deploy BOTH Services
```bash
# Use the unified deployment script
./Scripts/deployment/deploy.sh

# NEVER use these (removed):
# ./Scripts/deployment/deploy-render.sh  ✗ WRONG
# ./Scripts/deployment/deploy-vercel.sh  ✗ WRONG
```

### 4. Monitor Deployment
```bash
# Check Render logs:
render logs --resources srv-d3naaffdiees73eebd0g --limit 50 -o text

# Look for success messages:
# - "Database schema initialized"
# - "Database tables created successfully"
# - "Server running on port 10000"

# Check for errors:
# - "relation does not exist" = db not initialized
# - "column referenced in foreign key" = schema mismatch
# - "db.init is not a function" = missing init() method
```

### 5. Verify Production
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
# Look for: "Connected to BBS backend via websocket"
```

## Troubleshooting

### Backend won't start
1. Check Render logs
2. Look for database errors
3. Verify db.init() is called
4. Check DATABASE_URL environment variable

### Frontend build fails
1. Check Vercel build logs
2. Look for TypeScript errors
3. Test build locally: `cd frontend && npm run build`
4. Common fix: Remove unused imports

### WebSocket connection fails
1. Check CORS in `backend/src/config.ts`
2. Verify `https://bbs.uprough.net` is in corsOrigins
3. Check browser console for CORS errors
4. Verify backend is running (not 502)

## Pre-Deployment Checklist

```bash
# === MANDATORY CHECKS ===

# 1. DATABASE CHANGES
[ ] If modified database.ts, added DROP CASCADE?
[ ] Does initializeData() start with await db.init()?
[ ] Backend runs locally with "Database tables created successfully"?

# 2. BUILD TESTS
[ ] cd backend && npm run dev (no errors?)
[ ] cd frontend && npm run build (no TypeScript errors?)
[ ] Feature works locally?

# 3. CODE REVIEW
[ ] No async code in constructors?
[ ] No hardcoded CORS origins?
[ ] All database columns lowercase?

# 4. DEPLOYMENT
[ ] Using ./Scripts/deployment/deploy.sh (deploys BOTH)?
[ ] Committed all changes?
[ ] Pushed to GitHub?

# 5. POST-DEPLOYMENT
[ ] Backend curl returns API message?
[ ] Frontend curl returns 200?
[ ] Render logs show success messages?
[ ] WebSocket connected in browser?
```

## Emergency Rollback

If deployment breaks production:

```bash
# 1. Find last working commit
git log --oneline -10

# 2. Deploy that commit
./Scripts/deployment/deploy.sh <commit-sha>
```

## Rules to NEVER Break

1. **ALWAYS deploy BOTH services** - Use deploy.sh only
2. **NEVER commit without local testing**
3. **NEVER modify schema without DROP CASCADE**
4. **ALWAYS check Render logs after deployment**
5. **NEVER deploy during active user sessions**
