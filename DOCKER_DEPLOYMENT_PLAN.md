# AmiExpress-Web Docker Deployment Plan
## Comprehensive Guide for ChatGPT to Complete Deployment

**Last Updated**: 2025-12-12
**Status**: Docker conversion complete, deployment NOT started
**Handover Target**: ChatGPT

---

## Executive Summary

The project has been **fully converted to Docker** but deployment to Render.com is **NOT complete**. All Docker files, configurations, and documentation are ready. This plan provides step-by-step instructions to:

1. Deploy the unified Docker service to Render.com
2. Set up GitHub Actions auto-deployment
3. Migrate data from old services (if needed)
4. Verify and clean up

**Time Estimate**: 30-45 minutes
**Cost Impact**: 2 services → 1 service (saves $7/month on Render)

---

## Current State

### ✅ What's Complete (100% Ready)

#### Docker Infrastructure
- ✅ **Dockerfile** - Multi-stage build (6 stages: terminal, frontend, config-app, sdk, backend, production)
- ✅ **docker-compose.yml** - Local development (single node)
- ✅ **docker-compose.multi-node.yml** - Multi-node scaling (2-8 nodes)
- ✅ **docker-entrypoint.sh** - Initialization script (preserves data across deployments)
- ✅ **render.yaml** - Render.com Blueprint configuration

#### GitHub Actions Workflows
- ✅ **.github/workflows/docker-build.yml** - Docker image build and test
- ✅ **.github/workflows/typescript-check.yml** - TypeScript type checking
- ✅ **.github/workflows/deploy-render.yml** - Auto-deploy to Render (needs secrets)

#### Documentation
- ✅ **Documentation/2-Sysops/DOCKER.md** - Complete Docker deployment guide (517 lines)
- ✅ **Documentation/2-Sysops/RENDER_DOCKER_MIGRATION.md** - Render.com migration guide (116 lines)
- ✅ **Documentation/2-Sysops/RENDER_SECRETS_SETUP.md** - GitHub secrets setup (78 lines)
- ✅ **Documentation/2-Sysops/CI_CD.md** - CI/CD pipeline documentation (395 lines)

### ❌ What's NOT Complete (Deployment Steps)

1. ❌ Create new Docker service on Render.com
2. ❌ Configure GitHub secrets (RENDER_API_KEY, RENDER_SERVICE_ID)
3. ❌ Test deployment and verify functionality
4. ❌ Migrate database/data (if needed)
5. ❌ Delete old services (after verification)
6. ❌ Update DNS/domains (if applicable)

---

## Deployment Architecture

### Current (Old) Architecture
```
Render.com:
├── amiexpress-frontend (Static Site)
│   └── Serves: BBS Terminal UI
│   └── Cost: $0 (Free tier)
│
└── amiexpress-backend (Node.js)
    └── Serves: Backend API
    └── Cost: $7/month (Starter)

Total Cost: $7/month
Total Services: 2
```

### Target (New) Architecture
```
Render.com:
└── amiexpress-bbs (Docker)
    ├── Serves: BBS Terminal (/)
    ├── Serves: Admin Config (/admin/)
    ├── Serves: SDK Preview (/sdk/)
    └── Backend API (all endpoints)
    └── Persistent Disk: /app/data (10GB)
    └── Cost: $7/month (Starter)

Total Cost: $7/month
Total Services: 1 (SAVES MONEY - eliminates need for separate frontend)
```

### Benefits of New Architecture
- **Unified Deployment**: One service, one build, one configuration
- **Cost Reduction**: Same cost, fewer services to manage
- **Persistent Data**: Disk mount at `/app/data` preserves data across deployments
- **Production Ready**: Health checks, auto-restart, zero-downtime deploys
- **Easy Rollback**: Git-based rollback in 30 seconds

---

## Step-by-Step Deployment Instructions

### Phase 1: Pre-Deployment Verification (5 minutes)

#### 1.1 Verify Local Docker Build
```bash
# Test Docker build locally
cd ~/Code/amiexpress-web
docker build -t amiexpress-web:test .

# Expected: Successful build (3-5 minutes)
# If build fails: Check logs, fix errors, commit changes

# Test container startup
docker run -d --name test-bbs \
  -e NODE_ENV=production \
  -e DATABASE_DIR=/app/data/db \
  -e BBS_DATA_DIR=/app/data/bbs \
  -e JWT_SECRET=test-secret \
  -e JWT_REFRESH_SECRET=test-refresh \
  -e SESSION_SECRET=test-session \
  -p 3001:3001 \
  amiexpress-web:test

# Wait 30 seconds for startup
sleep 30

# Test health check
curl http://localhost:3001/
# Expected: HTML response (BBS login page)

# Check logs
docker logs test-bbs | tail -20
# Expected: No errors, "Server running on port 3001"

# Cleanup
docker stop test-bbs && docker rm test-bbs
```

**✅ Checkpoint**: Docker build works locally before proceeding to Render

#### 1.2 Verify GitHub Repository State
```bash
# Check all Docker files are committed
git status

# Expected files should be committed:
# - Dockerfile
# - docker-compose.yml
# - docker-compose.multi-node.yml
# - docker-entrypoint.sh
# - render.yaml
# - .github/workflows/*.yml

# If files are uncommitted:
git add .
git commit -m "chore: finalize Docker deployment configuration"
git push origin main
```

**✅ Checkpoint**: All Docker files pushed to GitHub before creating Render service

#### 1.3 Document Current Render Services
```bash
# Go to Render Dashboard: https://dashboard.render.com
# Document current services:

# Service 1: amiexpress-frontend
# - Type: Static Site
# - URL: https://amiexpress-frontend-xyz.onrender.com (RECORD THIS)
# - Branch: main
# - Build command: (record this)
# - Publish directory: (record this)

# Service 2: amiexpress-backend
# - Type: Web Service
# - URL: https://amiexpress-backend-xyz.onrender.com (RECORD THIS)
# - Branch: main
# - Build command: (record this)
# - Start command: (record this)
# - Disk mount: (check if exists)

# CRITICAL: Note if there's a persistent disk on backend service
# If yes: We need to migrate data to new service
# If no: Fresh start with new service
```

**✅ Checkpoint**: Current service URLs and configuration documented

---

### Phase 2: Create New Docker Service on Render (10 minutes)

#### 2.1 Create Service via Blueprint (Recommended Method)

**Why Blueprint?**: render.yaml is already configured with all settings

```
1. Go to Render Dashboard: https://dashboard.render.com
2. Click "New +" button (top right)
3. Select "Blueprint"
4. Connect Repository:
   - Repository: spotUP/amiexpress-web
   - Branch: main
5. Blueprint will be auto-detected from render.yaml
6. Review configuration:
   - Service Name: amiexpress-bbs
   - Region: Oregon
   - Plan: Starter ($7/month)
   - Disk: bbs-data (10GB) at /app/data
7. Click "Apply"
```

**What Happens**:
- Render clones repository
- Detects render.yaml configuration
- Creates service: amiexpress-bbs
- Builds Docker image (3-5 minutes)
- Creates persistent disk (10GB)
- Starts service with health checks

**Wait for**: Build to complete (watch logs in dashboard)

#### 2.2 Monitor First Build

```
1. Go to Render Dashboard → amiexpress-bbs service
2. Click "Logs" tab
3. Watch for:
   - ✅ "Building Docker image..."
   - ✅ "Stage 1/6: Build Terminal Package"
   - ✅ "Stage 2/6: Build Frontend"
   - ✅ "Stage 3/6: Build Config App"
   - ✅ "Stage 4/6: Build SDK Preview"
   - ✅ "Stage 5/6: Build Backend"
   - ✅ "Stage 6/6: Production Image"
   - ✅ "Docker image built successfully"
   - ✅ "Starting service..."
   - ✅ "[Entrypoint] Starting AmiExpress-Web..."
   - ✅ "[Entrypoint] First run detected - initializing BBS data..."
   - ✅ "Server running on port 3001"
```

**If Build Fails**:
```
Common Issues:
1. "npm ci failed" → Check package.json, may need npm install --legacy-peer-deps
2. "TypeScript errors" → Run npx tsc --noEmit locally, fix errors
3. "Dockerfile not found" → Verify repository connection
4. "Out of memory" → May need higher plan (unlikely)

Fix Steps:
1. Fix issue locally
2. Commit and push
3. Render auto-rebuilds (if autoDeploy: true)
4. Or click "Manual Deploy" in dashboard
```

#### 2.3 Get New Service URL

```
1. Once build succeeds, get service URL:
   - Format: https://amiexpress-bbs.onrender.com
   - Or: https://amiexpress-bbs-xyz123.onrender.com
2. Copy this URL - you'll need it for testing
```

**✅ Checkpoint**: New Docker service deployed and running

---

### Phase 3: Setup GitHub Actions Auto-Deploy (5 minutes)

#### 3.1 Get Render API Key

```
1. Go to Render Dashboard → Account Settings
   URL: https://dashboard.render.com/account/api-keys
2. Click "Create API Key"
3. Name: "GitHub Actions Auto-Deploy"
4. Copy the key (starts with rnd_)
   IMPORTANT: Save it immediately - you can't view it again!
```

#### 3.2 Get Render Service ID

```
1. Go to your new service: amiexpress-bbs
2. Copy Service ID from URL:
   - URL: https://dashboard.render.com/web/srv-abc123xyz
   - Service ID: srv-abc123xyz (the part after /web/)
```

#### 3.3 Add GitHub Secrets

```
1. Go to GitHub Repository Settings
   URL: https://github.com/spotUP/amiexpress-web/settings/secrets/actions
2. Click "New repository secret"

First Secret:
  - Name: RENDER_API_KEY
  - Value: rnd_xxxxxxxxxxxxxxxxxxxxxxxx (from step 3.1)
  - Click "Add secret"

Second Secret:
  - Name: RENDER_SERVICE_ID
  - Value: srv-xxxxxxxxxxxxx (from step 3.2)
  - Click "Add secret"
```

#### 3.4 Verify GitHub Actions

```
1. Make a small change to trigger deployment:
   echo "# Test deploy" >> README.md
   git add README.md
   git commit -m "test: verify GitHub Actions auto-deploy"
   git push origin main

2. Watch deployment:
   - GitHub: https://github.com/spotUP/amiexpress-web/actions
   - Should see 3 workflows run:
     ✅ Docker Build and Test
     ✅ TypeScript Type Check
     ✅ Deploy to Render

3. Wait for workflows to complete (2-3 minutes)

4. Verify deployment on Render:
   - Render Dashboard → amiexpress-bbs → Events
   - Should see "Deploy triggered by GitHub Actions"
```

**✅ Checkpoint**: Auto-deployment working

---

### Phase 4: Testing and Verification (10 minutes)

#### 4.1 Test All Frontends

**BBS Terminal**:
```
1. Visit: https://amiexpress-bbs.onrender.com/
2. Expected: BBS login screen with terminal
3. Test: Create account or login
4. Verify: Can navigate menus, read bulletins, etc.
```

**Admin Config**:
```
1. Visit: https://amiexpress-bbs.onrender.com/admin/
2. Expected: Admin configuration UI
3. Test: Login with sysop credentials
4. Verify: Can view/edit conferences, users, config
```

**SDK Preview**:
```
1. Visit: https://amiexpress-bbs.onrender.com/sdk/
2. Expected: SDK door preview interface
3. Test: Select a door and run it
4. Verify: Door loads and runs in preview terminal
```

#### 4.2 Test Protocols

**HTTP/WebSocket**:
```
# Already tested in 4.1
✅ BBS Terminal works via browser
```

**Telnet** (if exposed):
```
# Check Render service settings for Telnet port
# If port 2323 is exposed:
telnet amiexpress-bbs.onrender.com 2323

# Expected: BBS login prompt
# Note: Free Render plans may not expose custom ports
# May need paid plan for Telnet/SSH
```

**SSH** (if exposed):
```
# Check Render service settings for SSH port
# If port 2222 is exposed:
ssh -p 2222 bbs@amiexpress-bbs.onrender.com

# Expected: BBS login prompt
# Note: Same limitation as Telnet
```

#### 4.3 Test Data Persistence

```
1. Create test data:
   - Login to BBS
   - Post a message in a conference
   - Upload a file (if supported)
   - Create a user account

2. Trigger a deployment:
   git commit --allow-empty -m "test: verify data persistence"
   git push origin main

3. Wait for deployment (3-5 minutes)

4. Verify data survived:
   - Login to BBS
   - Check message still exists
   - Check file still exists
   - Check user account still exists

Expected: All data persists across deployments
Reason: /app/data is on persistent disk, not in container
```

**✅ Checkpoint**: All functionality verified, data persists

---

### Phase 5: Data Migration (if needed) (5-10 minutes)

**Only needed if old backend service has existing user data you want to keep**

#### 5.1 Check if Migration Needed

```
Decision Tree:
- If old backend has database/users you want to keep: YES, migrate
- If starting fresh: NO, skip to Phase 6
- If old backend was just for testing: NO, skip to Phase 6
```

#### 5.2 Export Data from Old Service

```
Method 1: Via Render Dashboard (if disk exists)
1. Go to old backend service dashboard
2. Open "Shell" tab
3. Run:
   cd /path/to/database  # Find database location
   ls -la                # Verify database exists
   tar czf backup.tar.gz *.db users/ data/

4. Download backup:
   # May need to use Render's file download feature
   # Or upload to temporary storage (S3, Dropbox, etc.)

Method 2: Via Database Export (if using SQLite)
1. Access old backend shell
2. Export database:
   sqlite3 /app/db/amiexpress.db .dump > backup.sql
3. Download backup.sql

Method 3: Via API (if backend has export endpoint)
1. Check if /api/export or similar exists
2. Call endpoint, download data
```

#### 5.3 Import Data to New Service

```
Method 1: Via Render Shell
1. Go to new service (amiexpress-bbs) dashboard
2. Open "Shell" tab
3. Upload backup file (use Render's upload feature)
4. Extract:
   cd /app/data
   tar xzf backup.tar.gz
   # Or restore database:
   sqlite3 /app/data/db/amiexpress.db < backup.sql

Method 2: Via Temporary HTTP Upload
1. Create temporary upload endpoint in backend
2. Upload backup via HTTP POST
3. Extract in entrypoint script
4. Remove endpoint after migration

Method 3: Start Fresh (Recommended if no critical data)
- New Docker service starts with clean slate
- No migration needed
- Create new sysop account
- Re-upload any important files manually
```

**✅ Checkpoint**: Data migrated (or confirmed not needed)

---

### Phase 6: Cleanup and Finalization (5 minutes)

#### 6.1 Verify New Service Fully Functional

**Final Checklist**:
```
✅ BBS Terminal loads and works
✅ Admin Config loads and works
✅ SDK Preview loads and works
✅ Users can login
✅ Data persists across deployments
✅ GitHub Actions auto-deploy works
✅ No critical errors in logs
```

#### 6.2 Update DNS (if custom domain)

```
If using custom domain (e.g., bbs.example.com):

1. Get Render service URL:
   - Example: amiexpress-bbs.onrender.com

2. Update DNS records:
   - Type: CNAME
   - Name: bbs (or @ for apex)
   - Value: amiexpress-bbs.onrender.com
   - TTL: 3600 (or default)

3. Add custom domain in Render:
   - Dashboard → amiexpress-bbs → Settings → Custom Domain
   - Enter: bbs.example.com
   - Click "Add"
   - Render provisions SSL certificate automatically

4. Wait for DNS propagation (5-60 minutes)

5. Test: https://bbs.example.com
```

#### 6.3 Delete Old Services

**⚠️ CRITICAL: Only delete after 100% verification**

```
Before Deleting:
1. Verify new service works for at least 24-48 hours
2. Verify all data migrated (if needed)
3. Verify GitHub Actions auto-deploy works
4. Notify users of any URL changes

Delete Steps:
1. Go to Render Dashboard
2. Delete amiexpress-frontend:
   - Settings → Danger Zone → Delete Service
   - Type service name to confirm
   - Click "Delete"

3. Delete amiexpress-backend:
   - Settings → Danger Zone → Delete Service
   - Type service name to confirm
   - Click "Delete"

⚠️ WARNING: Deleting services is PERMANENT
⚠️ Make sure data is migrated before deleting
```

#### 6.4 Update Documentation

```
Update these files:
1. README.md - Update deployment URLs
2. CLAUDE.md - Update deployment commands (if any)
3. Documentation/2-Sysops/INSTALLATION.md - Update production deployment section

Changes:
- Old: "Two services: frontend + backend"
- New: "One unified Docker service"
- Old URLs → New URLs
```

**✅ Checkpoint**: Old services deleted, documentation updated

---

## Troubleshooting Guide

### Issue: Docker Build Fails on Render

**Symptoms**: Build fails with errors in Render logs

**Common Causes**:
1. npm ci fails (package.json issues)
2. TypeScript errors
3. Missing dependencies
4. Out of memory

**Solutions**:
```bash
# 1. Test build locally first
docker build -t test .

# 2. Check TypeScript errors
cd web/backend && npx tsc --noEmit
cd ../frontend && npm run build:check
cd ../config-app && npm run build:check
cd ../../sdk && npm run build

# 3. If "out of memory":
# - Split build into smaller stages (already done)
# - Or upgrade Render plan temporarily for build

# 4. Check Render build logs for specific error
# - Copy error message
# - Fix locally
# - Commit and push
# - Render auto-rebuilds
```

### Issue: Service Starts But No Data

**Symptoms**: BBS loads but shows empty screens, no bulletins

**Cause**: Data initialization failed

**Solution**:
```bash
# Check logs for entrypoint errors
# Render Dashboard → Logs → Search for "[Entrypoint]"

# Verify:
1. Check /app/data is mounted
2. Check docker-entrypoint.sh ran
3. Check .initialized marker exists
4. Check Screens/, Bulletins/, Commands/ copied

# Manual fix via Shell:
cd /app/data/bbs
ls -la  # Should see Screens/, Bulletins/, etc.

# If missing, copy from default:
cp -r /app/default-data/* /app/data/bbs/
```

### Issue: Data Lost After Deployment

**Symptoms**: Users/messages disappear after new deployment

**Cause**: Persistent disk not properly configured

**Solution**:
```bash
# Verify disk mount in render.yaml:
disk:
  name: bbs-data
  mountPath: /app/data
  sizeGB: 10

# Check Render dashboard:
# Service → Settings → Disks
# Should see: bbs-data (10GB) mounted at /app/data

# If disk missing:
1. Add disk in Render dashboard
2. Redeploy service
3. Restore data from backup
```

### Issue: GitHub Actions Deploy Fails

**Symptoms**: Deploy workflow fails with 401 or 404

**Solutions**:
```bash
# 401 Unauthorized:
# - API key invalid or expired
# - Generate new key: https://dashboard.render.com/account/api-keys
# - Update RENDER_API_KEY secret in GitHub

# 404 Not Found:
# - Service ID incorrect
# - Get correct ID from Render service URL
# - Update RENDER_SERVICE_ID secret in GitHub

# Check secrets exist:
# GitHub → Settings → Secrets → Actions
# Should see: RENDER_API_KEY, RENDER_SERVICE_ID
```

### Issue: Health Check Fails

**Symptoms**: Service keeps restarting, health check failing

**Cause**: Server not starting on port 3001 or health endpoint broken

**Solution**:
```bash
# Check logs for startup errors
# Look for: "Server running on port 3001"

# If missing:
1. Check PORT environment variable (should be 3001)
2. Check server starts correctly
3. Check / endpoint responds

# Test health check manually:
# Render Shell:
curl http://localhost:3001/
# Should return HTML

# If fails:
# - Check backend starts without errors
# - Check no port conflicts
# - Check environment variables set correctly
```

---

## Rollback Plan

If deployment fails and you need to rollback:

### Immediate Rollback (Within 24 Hours)

```
Option 1: Keep Old Services Running
1. Don't delete old services immediately
2. Old services continue running
3. Fix issues with new service
4. Switch back to old services if needed
5. Delete new service if unfixable

Option 2: Rollback via Git
1. Find last working commit:
   git log --oneline
2. Rollback:
   git revert <commit-hash>
   git push origin main
3. Render auto-deploys old version
4. Or manually deploy from Render dashboard

Option 3: Delete New Service
1. Render Dashboard → amiexpress-bbs
2. Settings → Danger Zone → Delete Service
3. Keep old services running
4. Fix issues locally
5. Try deployment again
```

### Long-term Rollback (After Deleting Old Services)

```
1. Restore from backup:
   - Database backup from Phase 5
   - Code backup from Git

2. Recreate old services:
   - Use old service configurations (documented in Phase 1)
   - Restore database
   - Redeploy

3. Or fix forward:
   - Usually faster than rollback
   - Fix issues in new Docker service
   - Deploy fixes via GitHub Actions
```

---

## Post-Deployment Checklist

### Immediate (Day 1)
- [ ] New service deployed and accessible
- [ ] All frontends work (BBS, Admin, SDK)
- [ ] GitHub Actions auto-deploy configured
- [ ] Health checks passing
- [ ] No critical errors in logs
- [ ] Old services still running (backup)

### Short-term (Week 1)
- [ ] Monitor service for 7 days
- [ ] Verify data persists across deployments
- [ ] Test multiple deployments (via git push)
- [ ] Verify no performance issues
- [ ] Collect user feedback (if applicable)
- [ ] Delete old services after verification

### Long-term (Month 1)
- [ ] Update documentation (README, etc.)
- [ ] Setup monitoring/alerts (optional)
- [ ] Configure backups (automated)
- [ ] Review resource usage (upgrade plan if needed)
- [ ] Update CI/CD workflow (if needed)

---

## Cost Analysis

### Before Docker Migration
```
Service 1: amiexpress-frontend (Static Site)
  Cost: $0/month (Free tier)

Service 2: amiexpress-backend (Node.js)
  Cost: $7/month (Starter)

Total: $7/month
Services: 2
```

### After Docker Migration
```
Service: amiexpress-bbs (Docker)
  Cost: $7/month (Starter)
  Includes: Frontend + Backend + Admin + SDK
  Disk: 10GB persistent storage

Total: $7/month
Services: 1
```

### Savings
- **Monthly Cost**: Same ($7)
- **Management**: 1 service vs 2 (50% reduction)
- **Deployment Time**: 1 build vs 2 (faster)
- **Complexity**: Unified vs separated (simpler)

---

## Success Criteria

Deployment is considered successful when:

1. ✅ New Docker service deploys without errors
2. ✅ All three frontends accessible and functional:
   - BBS Terminal: https://amiexpress-bbs.onrender.com/
   - Admin Config: https://amiexpress-bbs.onrender.com/admin/
   - SDK Preview: https://amiexpress-bbs.onrender.com/sdk/
3. ✅ GitHub Actions auto-deploy works (push to main triggers deployment)
4. ✅ Data persists across deployments (test by creating data, deploying, verifying)
5. ✅ Health checks pass consistently
6. ✅ No critical errors in logs for 24+ hours
7. ✅ Old services deleted (after 7-day verification period)
8. ✅ Documentation updated

---

## Timeline Estimate

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1: Pre-Deployment Verification | 5 min | Test build locally, verify GitHub state |
| Phase 2: Create Docker Service | 10 min | Create service via Blueprint, monitor build |
| Phase 3: Setup GitHub Actions | 5 min | Add API key and service ID secrets |
| Phase 4: Testing | 10 min | Test all frontends, protocols, persistence |
| Phase 5: Data Migration | 5-10 min | Export/import data (if needed) |
| Phase 6: Cleanup | 5 min | Delete old services, update docs |
| **Total** | **30-45 min** | Full deployment start to finish |

**Plus**:
- Monitoring period: 7 days (passive, no action needed)
- Old service deletion: 5 min (after monitoring period)

---

## Questions for User (Ask Before Starting)

1. **Do you have existing user data to migrate?**
   - If YES: Need to export from old backend before deletion
   - If NO: Fresh start, skip Phase 5

2. **Do you need Telnet/SSH access?**
   - If YES: May need paid Render plan for custom ports
   - If NO: HTTP/WebSocket only (works on free/starter)

3. **Do you have a custom domain?**
   - If YES: Need DNS configuration (Phase 6.2)
   - If NO: Use Render-provided URL

4. **What's your rollback preference?**
   - Option A: Keep old services for 7 days (safe, costs $7 extra)
   - Option B: Delete immediately (saves money, higher risk)

5. **Who should be notified about URL changes?**
   - Provide list of users/stakeholders

---

## Contact Points

If issues arise during deployment:

1. **GitHub Repository**: https://github.com/spotUP/amiexpress-web
2. **Render Dashboard**: https://dashboard.render.com
3. **Documentation**:
   - DOCKER.md - Complete Docker guide
   - RENDER_DOCKER_MIGRATION.md - Migration guide
   - CI_CD.md - GitHub Actions setup
4. **Logs**:
   - Render: Dashboard → Logs
   - GitHub Actions: Repository → Actions → Workflow runs

---

## Final Notes for ChatGPT

**DO**:
- ✅ Follow phases in order (don't skip verification steps)
- ✅ Test locally before deploying to Render
- ✅ Keep old services running until new service verified (7 days minimum)
- ✅ Document any issues encountered
- ✅ Take screenshots of Render dashboard for reference
- ✅ Verify data persistence before deleting old services

**DON'T**:
- ❌ Delete old services immediately (wait 7 days)
- ❌ Skip local Docker testing
- ❌ Deploy without GitHub secrets configured
- ❌ Proceed if health checks fail
- ❌ Ignore errors in logs (investigate before continuing)
- ❌ Deploy on Friday (wait until Monday for monitoring)

**KEY PRINCIPLE**: "Measure twice, cut once"
- Verify at each checkpoint before proceeding
- Keep rollback options open
- Document everything
- Test thoroughly before cleanup

---

## Appendix A: Quick Command Reference

```bash
# Local Testing
docker build -t amiexpress-web:test .
docker-compose up -d
docker-compose logs -f
docker-compose down

# GitHub
git status
git add .
git commit -m "message"
git push origin main

# Render API (if needed)
curl -X POST https://api.render.com/deploy/srv-xxxxx \
  -H "Authorization: Bearer $RENDER_API_KEY"

# Health Check
curl http://localhost:3001/
curl https://amiexpress-bbs.onrender.com/
```

---

## Appendix B: File Checklist

Ensure these files exist and are committed:

```
Core Docker Files:
✅ Dockerfile
✅ docker-compose.yml
✅ docker-compose.multi-node.yml
✅ docker-entrypoint.sh
✅ render.yaml
✅ .dockerignore (optional)

GitHub Actions:
✅ .github/workflows/docker-build.yml
✅ .github/workflows/typescript-check.yml
✅ .github/workflows/deploy-render.yml

Documentation:
✅ Documentation/2-Sysops/DOCKER.md
✅ Documentation/2-Sysops/RENDER_DOCKER_MIGRATION.md
✅ Documentation/2-Sysops/RENDER_SECRETS_SETUP.md
✅ Documentation/2-Sysops/CI_CD.md
✅ DOCKER_DEPLOYMENT_PLAN.md (this file)
```

---

**End of Deployment Plan**

This document provides complete, step-by-step instructions for ChatGPT (or any developer) to complete the Docker deployment to Render.com. All technical work is done - only deployment execution remains.

**Good luck with the deployment!** 🚀
