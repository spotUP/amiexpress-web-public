# Render.com Deployment Guide

## Overview

This guide covers deploying AmiExpress Web to Render.com using SQLite as the database backend.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Render.com Services                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Frontend (Static Site)                             │
│  └─ React app built with Vite                       │
│  └─ Served from client/dist/                        │
│                                                      │
│  Backend (Web Service)                              │
│  ├─ Node.js + Express + Socket.io                   │
│  ├─ SQLite database (persistent disk)               │
│  └─ WebSocket server for real-time BBS              │
│                                                      │
│  Persistent Disk (1GB)                              │
│  └─ /opt/render/project/src/backend/data/           │
│     └─ amiexpress.db (SQLite database)              │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Render.com Account**
   - Sign up at https://render.com
   - Free tier available for testing

2. **GitHub Repository**
   - Code must be pushed to GitHub
   - Render.com will auto-deploy from your repo

## Deployment Steps

### Manual Deployment (Free Method)

1. **Connect Repository**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the `amiexpress-web` repository

2. **Configure Backend Service**
   - Name: `amiexpress-backend`
   - Region: Oregon (or nearest to your users)
   - Branch: `main`
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Starter ($7/month) or Free

3. **Add Environment Variables**
   ```
   NODE_ENV=production
   PORT=3001
   DATABASE_DIR=/opt/render/project/src/backend/data
   DATABASE_FILE=amiexpress.db
   JWT_SECRET=<generate-random-secret>
   JWT_REFRESH_SECRET=<generate-random-secret>
   ```

4. **Add Persistent Disk**
   - Click "Add Disk"
   - Name: `sqlite-data`
   - Mount Path: `/opt/render/project/src/backend/data`
   - Size: 1 GB
   - This ensures your SQLite database persists across deployments

5. **Deploy Backend**
   - Click "Create Web Service"
   - Wait for build to complete (~2-3 minutes)
   - Note the service URL (e.g., https://amiexpress-backend.onrender.com)

6. **Configure Frontend Service**
   - Click "New +" → "Static Site"
   - Name: `amiexpress-frontend`
   - Build Command: `cd client && npm install && npm run build`
   - Publish Directory: `client/dist`
   - Add Environment Variable:
     ```
     VITE_API_URL=https://amiexpress-backend.onrender.com
     ```

7. **Deploy Frontend**
   - Click "Create Static Site"
   - Wait for build to complete
   - Your frontend will be live at https://amiexpress-frontend.onrender.com

## Database Management

### SQLite on Render.com

**Storage:**
- Database file: `/opt/render/project/src/backend/data/amiexpress.db`
- Persistent disk ensures data survives deployments
- 1GB disk provides space for ~100,000 messages

**Backups:**
- SSH into your service: `render ssh amiexpress-backend`
- Copy database: `cp /opt/render/project/src/backend/data/amiexpress.db ./backup.db`
- Download via SFTP or create a backup endpoint

**Migrations:**
- Database auto-initializes on first run
- Schema updates handled by database.ts migrations
- No manual SQL required

### Database Access

To access your SQLite database:

```bash
# SSH into Render service
render ssh amiexpress-backend

# Navigate to data directory
cd /opt/render/project/src/backend/data

# Open SQLite database
sqlite3 amiexpress.db

# Run queries
.tables
SELECT * FROM users;
.exit
```

## Environment Variables

### Required Variables

```bash
# Application
NODE_ENV=production
PORT=3001

# Database (SQLite)
DATABASE_DIR=/opt/render/project/src/backend/data
DATABASE_FILE=amiexpress.db

# Authentication
JWT_SECRET=<your-secret-here>
JWT_REFRESH_SECRET=<your-refresh-secret-here>
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info

# CORS
ALLOWED_ORIGINS=https://amiexpress-frontend.onrender.com
```

### Generate Secrets

```bash
# Generate JWT secrets
openssl rand -base64 32
openssl rand -base64 32
```

## Monitoring

### Service Health

- Health check endpoint: `https://amiexpress-backend.onrender.com/health`
- Render Dashboard shows:
  - CPU usage
  - Memory usage
  - Request metrics
  - Error logs

### Logs

View real-time logs:
```bash
render logs amiexpress-backend --tail
```

Or in the dashboard:
- Go to your service
- Click "Logs" tab
- Filter by severity (info, warn, error)

## Troubleshooting

### Database Not Persisting

**Problem:** Data lost after deployment
**Solution:** Ensure persistent disk is mounted correctly
```bash
# Check disk mount
render ssh amiexpress-backend
df -h | grep data
```

### Build Failures

**Problem:** better-sqlite3 fails to install
**Solution:** Render uses compatible Node.js version with pre-built binaries
- Check Node version in render.yaml
- Ensure compatible with better-sqlite3

### Performance Issues

**Problem:** Slow database queries
**Solution:** SQLite is single-threaded
- Add indexes to frequently queried columns
- Use PRAGMA statements for optimization
- Consider upgrading to Render's higher tiers for better CPU

## Scaling Considerations

### SQLite Limitations

- **Concurrent Writes:** Limited compared to PostgreSQL
- **Size Limit:** Recommended < 1GB for optimal performance
- **No Replication:** Single file, no built-in replication

### When to Consider PostgreSQL

If you need:
- Multiple concurrent write connections (>10)
- Database size > 1GB
- Geographic replication
- Advanced analytics queries

Then migrate to Render's PostgreSQL add-on.

### Migration Path

To migrate from SQLite to PostgreSQL later:
1. Export SQLite data: `sqlite3 amiexpress.db .dump > backup.sql`
2. Convert SQL syntax for PostgreSQL
3. Import to PostgreSQL
4. Update DATABASE_URL to use PostgreSQL connection string
5. Redeploy

## Cost Estimate

### Free Tier (Testing)
- Frontend: Free static site
- Backend: Free web service (spins down after inactivity)
- Disk: Free 1GB

**Total:** $0/month (with limitations)

### Starter Tier (Production)
- Frontend: Free static site
- Backend: $7/month (always-on)
- Disk: Free 1GB included

**Total:** $7/month

### Pro Tier (High Traffic)
- Frontend: Free static site
- Backend: $25/month (better CPU/RAM)
- Disk: Free 10GB included

**Total:** $25/month

## Deployment Checklist

- [ ] Repository pushed to GitHub
- [ ] Environment variables configured
- [ ] Persistent disk created and mounted
- [ ] Backend service deployed and healthy
- [ ] Frontend service deployed and connected
- [ ] Health check endpoint responding
- [ ] Database initialized with default data
- [ ] Test login with sysop/sysop
- [ ] Verify WebSocket connection
- [ ] Check logs for errors

## Support

- Render.com Docs: https://render.com/docs
- Render.com Support: https://render.com/support
- Discord Community: https://discord.gg/render

## Auto-Deployment

Render.com automatically deploys when you push to GitHub:

1. Push changes to `main` branch
2. Render detects the push
3. Triggers build automatically
4. Deploys if build succeeds
5. Rolls back if deployment fails

No manual deployment needed!