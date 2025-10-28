# AmiExpress Deployment Guide

> **CRITICAL:** This is a full-stack application with separate backend and frontend deployments. Both MUST be deployed together.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   PRODUCTION STACK                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend (Vercel)                                      │
│  ├─ URL: https://bbs.uprough.net                        │
│  ├─ Static React app with xterm.js                     │
│  └─ Connects to backend via WebSocket                  │
│                                                         │
│  Backend (Render.com)                                   │
│  ├─ URL: https://amiexpress-backend.onrender.com       │
│  ├─ Node.js + Express + Socket.io                      │
│  ├─ WebSocket server for real-time BBS                 │
│  └─ SQLite database (file-based)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. Install CLI Tools

```bash
# Install Render CLI
npm install -g @render/cli

# Install Vercel CLI
npm install -g vercel

# Verify installations
render --version
vercel --version
```

### 2. Authenticate

```bash
# Login to Render
render login

# Login to Vercel
vercel login
```

## Deployment Methods

### Method 1: Full-Stack Deployment (Recommended)

Deploy BOTH backend and frontend with a single command:

```bash
# Deploy everything
./Scripts/deployment/deploy.sh

# Deploy specific commit
./Scripts/deployment/deploy.sh abc1234
```

This script will:
1. ✅ Deploy backend to Render.com
2. ✅ Wait for backend build to complete
3. ✅ Deploy frontend to Vercel
4. ✅ Display deployment URLs and status

**Use this method every time you make changes to prevent deployment mismatches.**

### Method 2: Backend Only (Legacy)

Deploy only the backend to Render.com:

```bash
./Scripts/deployment/deploy-render.sh
```

**⚠️ WARNING:** This will NOT update the frontend on Vercel!

### Method 3: Manual Deployment

If the automated script fails, deploy manually:

#### Backend (Render):

```bash
# Get service ID
render services list -o json | jq '.[] | select(.service.name == "amiexpress-backend") | .service.id'

# Trigger deployment
render deploys create srv-<SERVICE_ID> --commit $(git rev-parse HEAD) --confirm

# Monitor logs
render logs --resources srv-<SERVICE_ID> --type build
```

#### Frontend (Vercel):

```bash
# Deploy to production
cd ~/Code/amiexpress-web
vercel --prod --yes
```

## Common Deployment Issues

### Issue 1: Frontend Connects to Old Backend

**Symptom:** Changes work locally but not in production.

**Cause:** Backend deployed but frontend not redeployed.

**Fix:**
```bash
# Always use full-stack deployment
./Scripts/deployment/deploy.sh
```

### Issue 2: CORS Errors in Production

**Symptom:** WebSocket connection blocked by CORS policy.

**Cause:** Backend CORS origins don't include Vercel domain.

**Fix:** Update `backend/src/config.ts`:
```typescript
corsOrigins: process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'https://bbs.uprough.net']
```

### Issue 3: WebSocket Connection Fails

**Symptom:** Frontend loads but shows "Connecting..." forever.

**Cause:**
- Backend not running on Render
- CORS misconfiguration
- Vercel deployment not complete

**Debug:**
```bash
# 1. Check backend health
curl https://amiexpress-backend.onrender.com/
# Should return: {"message":"AmiExpress Backend API"}

# 2. Check Render logs
render logs --resources srv-d3naaffdiees73eebd0g

# 3. Check Vercel deployment
vercel list
```

### Issue 4: Database Connection Errors

**Symptom:** Backend starts but crashes with database errors.

**Cause:** Missing or incorrect DATABASE_URL environment variable.

**Fix:**
1. Go to Render dashboard: https://dashboard.render.com/web/srv-d3naaffdiees73eebd0g
2. Click "Environment" tab
3. Verify DATABASE_URL is set correctly
4. Redeploy if needed

### Issue 5: Build Timeout

**Symptom:** Deployment script times out after 5 minutes.

**Cause:** Render free tier can have slow cold starts.

**Fix:**
```bash
# Check Render dashboard for actual status
# Build might still be running

# Monitor logs directly
render logs --resources srv-d3naaffdiees73eebd0g --type build
```

## Environment Variables

### Backend (Render.com)

Set these in Render dashboard under Environment tab:

```bash
# Required
DATABASE_DIR=./data
DATABASE_FILE=amiexpress.db
PORT=3001
NODE_ENV=production

# Optional - CORS configuration
CORS_ORIGINS=http://localhost:5173,https://bbs.uprough.net

# Session secrets (generate random strings)
SESSION_SECRET=<random-string-here>
JWT_SECRET=<random-string-here>
```

### Frontend (Vercel)

Set these in Vercel dashboard under Settings → Environment Variables:

```bash
# Optional - Backend URL override
VITE_API_URL=https://amiexpress-backend.onrender.com
```

**Note:** Frontend auto-detects backend URL based on environment, so VITE_API_URL is usually not needed.

## Deployment Workflow

### Standard Workflow

```bash
# 1. Make changes locally
git add .
git commit -m "feat: Add new feature"

# 2. Push to GitHub (triggers nothing - manual deploy only)
git push origin main

# 3. Deploy to production
./Scripts/deployment/deploy.sh

# 4. Verify deployment
curl https://amiexpress-backend.onrender.com/
# Visit https://bbs.uprough.net in browser
```

### Emergency Rollback

If a deployment breaks production:

```bash
# 1. Find previous working commit
git log --oneline -10

# 2. Deploy that commit
./Scripts/deployment/deploy.sh <commit-sha>

# Example:
./Scripts/deployment/deploy.sh d796baf
```

### Testing Before Production

```bash
# 1. Deploy to Vercel preview (not production)
vercel

# 2. Test preview URL
# Visit the preview URL shown in output

# 3. If good, promote to production
vercel --prod
```

## Monitoring

### Health Checks

```bash
# Backend health
curl https://amiexpress-backend.onrender.com/
# Expected: {"message":"AmiExpress Backend API"}

# Frontend health
curl -I https://bbs.uprough.net
# Expected: HTTP/2 200

# WebSocket connectivity (in browser console)
# 1. Open https://bbs.uprough.net
# 2. Press F12 for console
# 3. Look for: "✅ Connected to BBS backend via websocket"
```

### Logs

```bash
# Backend logs (real-time)
render logs --resources srv-d3naaffdiees73eebd0g --tail

# Backend build logs
render logs --resources srv-d3naaffdiees73eebd0g --type build

# Vercel logs
vercel logs bbs.uprough.net
```

### Dashboards

- **Render Backend:** https://dashboard.render.com/web/srv-d3naaffdiees73eebd0g
- **Vercel Frontend:** https://vercel.com/dashboard
- **GitHub Repo:** https://github.com/spotUP/amiexpress-web

## Deployment Checklist

Before deploying, ensure:

- [ ] All changes committed to git
- [ ] Backend tests pass locally
- [ ] Frontend builds without errors (`cd frontend && npm run build`)
- [ ] Database migrations are safe (if any)
- [ ] Environment variables are set correctly
- [ ] CORS origins include all production domains

After deploying:

- [ ] Backend returns 200 at root endpoint
- [ ] Frontend loads at https://bbs.uprough.net
- [ ] WebSocket connection established (check browser console)
- [ ] Can login and interact with BBS
- [ ] LIVECHAT functionality works
- [ ] No console errors in browser (F12)

## Troubleshooting Commands

```bash
# Check what's deployed on Render
render services list -o json | jq '.[] | select(.service.name == "amiexpress-backend")'

# Check latest Render deployment
render deploys list srv-d3naaffdiees73eebd0g -o json | jq '.[0]'

# Check Vercel deployments
vercel list

# Check Vercel production alias
vercel alias list

# Force Vercel rebuild
vercel --prod --force

# Check database connection
render shell srv-d3naaffdiees73eebd0g -c "echo \$DATABASE_URL | head -c 50"
```

## Performance Tips

### Render.com (Backend)

- Free tier has cold starts (~50 seconds)
- Service sleeps after 15 minutes of inactivity
- WebSocket connections keep service alive
- Consider upgrading to paid tier for production

### Vercel (Frontend)

- Static builds are instant
- CDN delivers content globally
- No cold starts
- Free tier is sufficient for most use cases

## Security Notes

### CORS Configuration

The backend MUST allow connections from the frontend domain:

```typescript
// backend/src/config.ts
corsOrigins: ['http://localhost:5173', 'https://bbs.uprough.net']
```

### Environment Variables

- **NEVER** commit secrets to git
- Use Render/Vercel dashboards for secrets
- Rotate JWT_SECRET and SESSION_SECRET periodically

### Database Access

- Only backend can access database
- Frontend connects via WebSocket only
- Database credentials stored in Render environment

## Support

If deployment fails:

1. Check this guide first
2. Check Render logs: `render logs --resources srv-d3naaffdiees73eebd0g`
3. Check Vercel logs: `vercel logs bbs.uprough.net`
4. Check GitHub issues: https://github.com/spotUP/amiexpress-web/issues
5. Contact support if persistent issues

## Quick Reference

```bash
# Full deployment
./Scripts/deployment/deploy.sh

# Check backend
curl https://amiexpress-backend.onrender.com/

# Check frontend
curl https://bbs.uprough.net

# View logs
render logs --resources srv-d3naaffdiees73eebd0g --tail

# Rollback
./Scripts/deployment/deploy.sh <previous-commit-sha>
```

---

**Last Updated:** 2025-10-24
**Deployment Script Version:** 1.0.0
**Author:** Claude Code