# Render.com Docker Migration - Quick Start

**Last Updated**: 2025-12-09

## What You Need to Do (3 Steps)

You currently have **two services** on Render.com. This guide migrates to **one unified Docker service**.

### Step 1: Get Your Backend Service URL

You'll need this for the migration:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Open your **backend service** (amiexpress-backend)
3. Copy the service URL
4. Example: `https://amiexpress-backend-xyz123.onrender.com`

Save this - you'll need it in Step 3.

### Step 2: Create New Docker Service on Render

I've already prepared the configuration in `render.yaml`. Here's what to do:

1. **Go to Render Dashboard** → Click "New +" → "Blueprint"
2. **Connect Repository**: Select `spotUP/amiexpress-web`
3. **Blueprint Name**: `AmiExpress BBS Docker`
4. **Branch**: `main`
5. Click **"Apply"**

Render will:
- ✅ Detect `render.yaml` automatically
- ✅ Create new service: `amiexpress-bbs`
- ✅ Build Docker image (3-5 minutes)
- ✅ Deploy automatically

**Wait for the build to complete** before Step 3.

### Step 3: Verify and Clean Up

Once the new service is deployed:

1. **Test the new service**:
   - Visit: `https://amiexpress-bbs.onrender.com/`
   - Should see BBS login screen
   - Test login with your credentials

2. **Delete old services** (only after verification):
   - Delete `amiexpress-frontend` (static site)
   - Delete `amiexpress-backend` (old Node.js)

3. **Done!** You're now running on Docker

**Cost Savings**: 2 services → 1 service

## What I Did For You

✅ **render.yaml**: Ready-to-use configuration (Option A: Unified)
✅ **Dockerfile**: Multi-stage build optimized for Render
✅ **Environment variables**: All configured with secure defaults
✅ **Database setup**: Disk mount configured at `/app/db`
✅ **Health checks**: Container health monitoring enabled
✅ **All frontends included**: BBS Terminal, Admin Config, SDK Preview

## What Gets Deployed

**One Docker service serves everything**:

- **BBS Terminal**: `https://amiexpress-bbs.onrender.com/`
- **Admin Config**: `https://amiexpress-bbs.onrender.com/admin/`
- **SDK Preview**: `https://amiexpress-bbs.onrender.com/sdk/`

No separate frontend service needed!

## Troubleshooting

### Build Fails

**Check**:
1. Render dashboard → Build Logs
2. Look for error message
3. Common issue: Dockerfile not found
   - **Fix**: Verify repository is connected correctly

### Service Won't Start

**Check**:
1. Render dashboard → Logs tab
2. Look for startup errors
3. Common issue: Database connection
   - **Fix**: Verify disk is attached (should be automatic)

### Need to Rollback?

If something goes wrong:

1. Render Dashboard → Your old backend service
2. Click "Manual Deploy" → Deploy latest commit
3. Your old services still work until you delete them

## Questions?

- **How do I migrate my database?** Render handles this automatically via disk mount
- **What about my environment variables?** They're all in render.yaml with secure defaults
- **Can I test locally first?** Yes: `docker-compose up` (see DOCKER.md)
- **Will my users see downtime?** No, old services run until you delete them

## See Also

- [render.yaml](../../render.yaml) - Deployment configuration (ready to use)
- [DOCKER.md](./DOCKER.md) - Local Docker testing guide
- [RENDER_SECRETS_SETUP.md](./RENDER_SECRETS_SETUP.md) - GitHub Actions auto-deploy

---

**Summary**: Create Blueprint → Wait 5 minutes → Test → Delete old services → Done!
