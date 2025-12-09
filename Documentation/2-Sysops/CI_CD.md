# CI/CD Pipeline Documentation

**Last Updated**: 2025-12-09

This document describes the continuous integration and deployment (CI/CD) pipeline for AmiExpress-Web using GitHub Actions.

## Overview

The CI/CD pipeline consists of three workflows:

1. **Docker Build and Test** - Validates Docker image builds and basic functionality
2. **TypeScript Type Check** - Ensures type safety across all TypeScript packages
3. **Deploy to Render** - Automatically deploys to Render.com on main branch push

## Workflows

### 1. Docker Build and Test

**File**: `.github/workflows/docker-build.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` branch

**Steps**:
1. Checkout code
2. Set up Docker Buildx (multi-platform builds)
3. Build Docker image with layer caching
4. Start container with test configuration
5. Health check on `http://localhost:3001/`
6. Verify container stays running
7. Cleanup test container

**Build Time**: 3-5 minutes (with caching)

**Why This Matters**:
- Catches Docker build failures before they reach production
- Validates multi-stage build process
- Ensures container starts successfully
- Uses GitHub Actions cache for faster builds

### 2. TypeScript Type Check

**File**: `.github/workflows/typescript-check.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` branch

**Steps**:
1. Checkout code
2. Setup Node.js 18 with npm cache
3. Install dependencies for each package
4. Run `npx tsc --noEmit` (type check without compilation)

**Matrix Strategy** (runs in parallel):
- `web/backend` - Backend TypeScript code
- `web/frontend` - Frontend React/TypeScript code
- `web/config-app` - Admin config UI TypeScript code
- `sdk` - Door Development Kit TypeScript code
- `packages/terminal` - Terminal package TypeScript code

**Build Time**: 2-3 minutes per package (parallel)

**Why This Matters**:
- Enforces zero-tolerance TypeScript error policy
- Catches type errors before merge
- Runs same check as pre-commit hook
- Validates all packages independently

### 3. Deploy to Render

**File**: `.github/workflows/deploy-render.yml`

**Triggers**:
- Push to `main` branch (automatic)
- Manual trigger via GitHub Actions UI (`workflow_dispatch`)

**Steps**:
1. Checkout code
2. Trigger Render deployment via API
3. Report deployment status

**Requirements**:
- `RENDER_API_KEY` - GitHub secret (get from Render dashboard)
- `RENDER_SERVICE_ID` - GitHub secret (get from Render service URL)

**Deploy Time**: 3-5 minutes on Render

**Why This Matters**:
- Automatic deployment on successful main branch push
- No manual intervention required
- Leverages Render's Docker deployment
- Can be triggered manually if needed

## Setup Instructions

### Prerequisites

- GitHub repository with Actions enabled
- Render.com account (for deployment workflow)
- Docker Desktop (for local testing)

### 1. Enable GitHub Actions

Actions are enabled by default for GitHub repositories. No setup required.

### 2. Configure Secrets (for Render deployment)

#### Get Render API Key

1. Go to [Render Dashboard → Account → API Keys](https://dashboard.render.com/account/api-keys)
2. Click "Create API Key"
3. Copy the key (starts with `rnd_`)

#### Get Render Service ID

1. Go to your Render service dashboard
2. Copy the service ID from URL: `https://dashboard.render.com/web/srv-xxxxxxxxxxxxx`
3. Service ID format: `srv-xxxxxxxxxxxxx`

#### Add Secrets to GitHub

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add:
   - Name: `RENDER_API_KEY`
   - Value: `rnd_xxxxxxxxxxxxxxxxxxxx` (your Render API key)
5. Click "New repository secret" again
6. Add:
   - Name: `RENDER_SERVICE_ID`
   - Value: `srv-xxxxxxxxxxxxx` (your service ID)

### 3. Verify Workflows

After pushing workflows to your repository:

1. Go to GitHub repository → Actions tab
2. You should see three workflows:
   - Docker Build and Test
   - TypeScript Type Check
   - Deploy to Render
3. Push a commit to `main` or `develop` to trigger workflows

## Workflow Status

Check workflow status on GitHub:

```
https://github.com/YOUR-ORG/amiexpress-web/actions
```

**Green checkmark** = All checks passed
**Red X** = One or more checks failed
**Yellow circle** = Workflow running

## Local Testing

Test workflows locally before pushing:

### Docker Build

```bash
# Build Docker image
docker build -t amiexpress-web:test .

# Test container startup
docker run -d --name test-bbs \
  -e NODE_ENV=production \
  -e DATABASE_DIR=/app/db \
  -e BBS_DATA_DIR=/app/data/bbs \
  -e JWT_SECRET=test-secret \
  -e JWT_REFRESH_SECRET=test-refresh \
  -e SESSION_SECRET=test-session \
  -p 3001:3001 \
  amiexpress-web:test

# Wait for startup
sleep 10

# Health check
curl http://localhost:3001/

# Check logs
docker logs test-bbs

# Cleanup
docker stop test-bbs && docker rm test-bbs
```

### TypeScript Check

```bash
# Check all packages
for pkg in web/backend web/frontend web/config-app sdk packages/terminal; do
  echo "[OK] Checking $pkg..."
  cd $pkg
  npx tsc --noEmit
  cd -
done
```

## Troubleshooting

### Docker Build Fails

**Error**: `Dockerfile not found`
```bash
# Verify Dockerfile exists in repository root
ls -la Dockerfile
```

**Error**: `npm ci failed in Docker build`
```bash
# Clear local Docker cache
docker builder prune -a

# Rebuild without cache
docker build --no-cache -t amiexpress-web:test .
```

### TypeScript Check Fails

**Error**: `Type errors in web/backend`
```bash
# Run locally to see errors
cd web/backend
npx tsc --noEmit

# Fix errors, then commit
```

### Render Deployment Fails

**Error**: `RENDER_API_KEY not set`
```bash
# Verify secrets are configured
# GitHub → Settings → Secrets and variables → Actions
# Should see: RENDER_API_KEY, RENDER_SERVICE_ID
```

**Error**: `HTTP 401 Unauthorized`
```bash
# API key is invalid or expired
# 1. Generate new API key on Render dashboard
# 2. Update RENDER_API_KEY secret on GitHub
```

**Error**: `HTTP 404 Not Found`
```bash
# Service ID is incorrect
# 1. Verify service ID from Render service URL
# 2. Format: srv-xxxxxxxxxxxxx
# 3. Update RENDER_SERVICE_ID secret on GitHub
```

## Best Practices

### Branch Protection

Recommended settings for `main` branch:

1. GitHub → Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - Require status checks to pass before merging
   - Required checks:
     - Docker Build and Test
     - TypeScript Type Check (all 5 packages)
   - Require branches to be up to date before merging
   - Include administrators (enforce for everyone)

### Pull Request Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes, commit
3. Push: `git push origin feature/my-feature`
4. Create pull request on GitHub
5. Wait for CI checks to pass (green checkmarks)
6. Review and merge
7. Main branch auto-deploys to Render

### Skipping CI (Emergency)

To skip CI checks on a commit (emergency only):

```bash
git commit -m "fix: emergency fix [skip ci]"
```

This skips ALL workflows. Use sparingly.

## Monitoring

### GitHub Actions Dashboard

- View all workflow runs: Repository → Actions
- Filter by workflow, branch, status
- View logs for each step
- Re-run failed workflows

### Render Dashboard

- View deployments: https://dashboard.render.com
- Check deploy logs
- View service health
- Rollback to previous deploy

## Cost Optimization

### GitHub Actions

- **Free tier**: 2,000 minutes/month for public repos
- **Private repos**: 2,000 minutes/month on free plan
- Current usage: ~10 minutes per push (3 workflows)
- Estimated: 200 pushes/month fits in free tier

### Render

- **Starter plan**: $7/month
- Includes unlimited Docker deploys
- Auto-deploy from GitHub Actions is free

## Advanced Configuration

### Custom Docker Registry

To push Docker images to a registry (e.g., Docker Hub, GitHub Container Registry):

1. Add registry secrets to GitHub:
   - `DOCKER_USERNAME`
   - `DOCKER_PASSWORD`

2. Update `.github/workflows/docker-build.yml`:
```yaml
- name: Login to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: |
      your-org/amiexpress-web:latest
      your-org/amiexpress-web:${{ github.sha }}
```

### Deployment Environments

To use GitHub Environments for staging/production:

1. GitHub → Settings → Environments
2. Create environments: `staging`, `production`
3. Add environment secrets
4. Update deploy workflow:
```yaml
jobs:
  deploy:
    environment: production
    steps:
      - name: Deploy to production
        run: ...
```

### Slack Notifications

To send deployment notifications to Slack:

1. Create Slack webhook: https://api.slack.com/messaging/webhooks
2. Add `SLACK_WEBHOOK_URL` to GitHub secrets
3. Add to deploy workflow:
```yaml
- name: Notify Slack
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"Deployed to Render successfully"}'
```

## See Also

- [DOCKER.md](./DOCKER.md) - Docker deployment guide
- [RENDER_DOCKER_MIGRATION.md](./RENDER_DOCKER_MIGRATION.md) - Render.com migration
- [GitHub Actions Docs](https://docs.github.com/en/actions) - Official documentation
- [Render Deploy Hooks](https://render.com/docs/deploy-hooks) - Render API documentation

---

**Note**: CI/CD is optional but highly recommended for production deployments. Manual deployment is still supported via `./dev/scripts/push-and-deploy.sh`.
