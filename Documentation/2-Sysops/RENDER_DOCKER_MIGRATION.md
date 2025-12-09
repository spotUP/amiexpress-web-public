# Render.com Docker Migration Guide

**Last Updated**: 2025-12-09

This guide covers migrating your Render.com deployment from the legacy Node.js build to the new Docker-based deployment.

## Why Migrate to Docker on Render?

### Benefits

✅ **Faster Builds**: Docker multi-stage build is 2-3x faster than npm install chain
✅ **Consistent Environment**: Exact same image locally and in production
✅ **Smaller Deployments**: Production-only dependencies reduce size
✅ **Better Caching**: Docker layer caching speeds up subsequent builds
✅ **Easier Debugging**: Test exact production image locally with `docker run`

### Comparison

| Metric | Legacy (Node) | Docker |
|--------|---------------|--------|
| Build Time | 8-12 minutes | 3-5 minutes |
| Build Steps | 7 separate npm ci calls | Multi-stage Docker build |
| Image Size | ~800MB | ~400MB (production deps only) |
| Cache Efficiency | Poor (npm cache) | Excellent (layer caching) |
| Local Testing | Complex setup | `docker-compose up` |

## Migration Steps

### Step 1: Backup Current Deployment

Before migrating, create a backup of your current deployment:

```bash
# 1. Note your current service URL
# Example: https://amiexpress-backend.onrender.com

# 2. Export environment variables
# Go to Render Dashboard → Service → Environment
# Copy all environment variables to a safe location

# 3. Download database (if using disk persistence)
# This requires SSH access to Render service
# Or use Render's backup feature
```

### Step 2: Update render.yaml

The new `render.yaml` is already updated in the repository. Key changes:

**Before** (Legacy):
```yaml
services:
  - type: web
    name: amiexpress-backend
    env: node
    buildCommand: |
      cd packages/terminal && npm ci && npm run build && cd ../..
      cd sdk && npm ci --include=dev && npm run build && cd ..
      # ... 7 more npm ci calls
    startCommand: cd web/backend && npx tsx src/index.ts
```

**After** (Docker):
```yaml
services:
  - type: web
    name: amiexpress-bbs
    env: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    # Docker handles all builds automatically
```

### Step 3: Update Disk Mount Path

Docker deployment uses a different mount path:

**Legacy Path**: `/opt/render/project/src/web/backend/data`
**Docker Path**: `/app/db`

The new render.yaml already has the correct path:
```yaml
disk:
  name: bbs-data
  mountPath: /app/db
  sizeGB: 10
```

### Step 4: Deploy to Render

#### Option A: New Service (Recommended for Testing)

Create a new service to test Docker deployment:

1. Go to Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will detect the updated `render.yaml`
5. Create service with name `amiexpress-bbs`
6. Wait for Docker build to complete (3-5 minutes)
7. Test the new deployment
8. Once verified, delete old services

#### Option B: In-Place Update (Advanced)

Update existing service to use Docker:

1. **IMPORTANT**: This will cause downtime during the switch
2. Go to Render Dashboard → Your Service
3. Settings → Environment → Change to "Docker"
4. Update Dockerfile path to `./Dockerfile`
5. Update Docker context to `.`
6. Click "Manual Deploy" → "Deploy latest commit"
7. Monitor build logs for any issues

### Step 5: Verify Deployment

After deployment completes:

```bash
# 1. Check health endpoint
curl https://your-service.onrender.com/

# 2. Check logs in Render Dashboard
# Look for:
# - [DI Container] Initialized with all dependencies
# - [OK] HTTP routes registered
# - Server listening on port 3001

# 3. Test WebSocket connection
# Visit your BBS URL in browser

# 4. Test Telnet (if enabled)
telnet your-service.onrender.com 2323

# 5. Verify database persistence
# Create a test user, restart service, verify user still exists
```

### Step 6: Clean Up Legacy Services (Optional)

Once Docker deployment is verified:

1. Go to Render Dashboard
2. Delete old services:
   - `amiexpress-frontend` (if using static site)
   - `amiexpress-backend-legacy` (old Node.js service)
3. Docker deployment now serves all frontends from one container

## Environment Variables

The Docker deployment requires these environment variables (all set in render.yaml):

### Required (Auto-configured)
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3001`
- `DATABASE_DIR=/app/db`
- `BBS_DATA_DIR=/app/data/bbs`

### Auto-Generated Secrets
- `JWT_SECRET` (Render generates)
- `JWT_REFRESH_SECRET` (Render generates)
- `SESSION_SECRET` (Render generates)

### Optional
- `DEBUG=false` (enable for debug logging)
- `XIM_DEBUG=0` (XIM protocol debugging)

## Troubleshooting

### Build Fails

**Error**: "Dockerfile not found"
```bash
# Solution: Verify dockerfilePath in render.yaml
dockerfilePath: ./Dockerfile  # Must be relative to repo root
dockerContext: .
```

**Error**: "npm ci failed"
```bash
# Solution: Clear build cache in Render Dashboard
# Settings → Build & Deploy → Clear Build Cache → Deploy
```

### Service Won't Start

**Error**: "Container exited with code 1"
```bash
# Check logs in Render Dashboard
# Common issues:
# 1. Missing environment variables
# 2. Database connection failed
# 3. Port already in use

# Verify environment variables match render.yaml
```

### Database Migration

**Error**: "Database not found after migration"
```bash
# The disk mount path changed from:
# /opt/render/project/src/web/backend/data → /app/db

# Solution: Render should automatically migrate the disk
# If not, contact Render support to move the disk to new path
```

### Health Check Fails

**Error**: "Health check failed"
```bash
# Verify health check path in render.yaml:
healthCheckPath: /

# Check if server is actually running:
# Render Logs → Look for "Server listening on port 3001"

# Temporarily disable health check:
# Remove healthCheckPath from render.yaml
```

## Rollback Plan

If Docker deployment has issues, you can rollback to legacy deployment:

### Quick Rollback (Emergency)

1. Go to Render Dashboard → Service
2. Settings → Redeploy → Select previous successful deploy
3. Click "Redeploy"

### Full Rollback to Legacy

1. Uncomment legacy services in render.yaml:
```yaml
# Uncomment the legacy services section at bottom of file
```

2. Commit and push:
```bash
git add render.yaml
git commit -m "Rollback to legacy deployment"
git push
```

3. Render will detect the change and redeploy legacy services

## Performance Optimization

### Build Cache

Docker builds on Render benefit from layer caching:

```dockerfile
# Cached layer (changes rarely)
COPY web/backend/package*.json ./web/backend/
RUN npm ci --only=production

# Invalidated frequently (code changes)
COPY web/backend/src ./web/backend/src
```

### Multi-Stage Build

The Dockerfile uses multi-stage builds to reduce final image size:

- **Stage 1**: Build frontend (discarded after build)
- **Stage 2**: Build backend (discarded after build)
- **Stage 3**: Production image (only includes built artifacts)

Result: ~400MB final image vs ~800MB with full build

### Resource Limits

Render Starter plan limits:
- CPU: Shared (0.5 vCPU)
- RAM: 512 MB
- Disk: 10 GB (configurable in render.yaml)

Docker deployment is optimized for these limits with:
- Alpine Linux base (smaller image)
- Production-only dependencies
- Non-root user (security)

## Multi-Node Deployment (Future)

Render doesn't support docker-compose scaling, but you can:

1. Create multiple services from same repository
2. Set `NODE_ID` environment variable for each:
   - Service 1: `NODE_ID=0`
   - Service 2: `NODE_ID=1`
   - Service 3: `NODE_ID=2`

3. Use load balancer (Render's built-in or external)

For true multi-node scaling, consider:
- **Railway.com** (better docker-compose support)
- **Fly.io** (native Docker + scaling)
- **AWS ECS/Fargate** (production-grade)
- **Your own server** with docker-compose

## See Also

- [DOCKER.md](./DOCKER.md) - Complete Docker guide
- [INSTALLATION.md](./INSTALLATION.md) - Manual installation
- [Render Docker Docs](https://render.com/docs/docker) - Official Render Docker docs
- [Dockerfile](../../Dockerfile) - Our production Dockerfile

## Support

If you encounter issues:

1. Check Render build logs
2. Test Docker locally: `docker-compose up`
3. Review [DOCKER.md](./DOCKER.md) troubleshooting section
4. Open GitHub issue with logs

---

**Recommendation**: Test Docker deployment on a new Render service first, verify it works, then migrate production.
