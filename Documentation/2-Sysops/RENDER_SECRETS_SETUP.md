# Render Auto-Deploy Setup Guide

**Quick Reference**: 5-minute setup to enable automatic deployment to Render.com

## Prerequisites

- GitHub repository: `spotUP/amiexpress-web`
- Render.com account with active service
- Admin access to both GitHub and Render

## Step 1: Get Render API Key

1. Go to [Render Dashboard → API Keys](https://dashboard.render.com/account/api-keys)
2. Click **"Create API Key"**
3. Name: `GitHub Actions Auto-Deploy`
4. Copy the key (starts with `rnd_`)
   - **IMPORTANT**: Save this immediately - you can't view it again!

**Example**: `rnd_abc123xyz456def789ghi012jkl345`

## Step 2: Get Render Service ID

### If You Have Multiple Services

If you currently have **two separate Render services** (backend + frontend):

**Option 1: Unified Docker Service** (Recommended)
- Use the **Docker backend service ID** only
- GitHub Actions will deploy the unified service
- After migration, you can delete the old frontend service

**Option 2: Keep Separate Services**
- Use the **backend service ID** only
- Frontend deploys separately (static site)
- GitHub Actions only deploys backend

### Getting the Service ID

1. Go to your Render service dashboard
2. Open the **backend service** (or unified Docker service)
3. Look at the URL in your browser
4. Copy the service ID from the URL

**URL Format**: `https://dashboard.render.com/web/srv-xxxxxxxxxxxxx`

**Service ID**: `srv-xxxxxxxxxxxxx` (the part after `/web/`)

**Example**: `srv-cqb1234567890abcdef`

### Service Names to Look For

- Unified: `amiexpress-bbs` (Docker service)
- Separate: `amiexpress-backend` or `amiexpress-backend-docker`

**Note**: Do NOT use the frontend service ID - GitHub Actions deploys backend only.

## Step 3: Add Secrets to GitHub

1. Go to [GitHub Repository Settings](https://github.com/spotUP/amiexpress-web/settings/secrets/actions)
2. Click **"New repository secret"**

### First Secret: RENDER_API_KEY

- **Name**: `RENDER_API_KEY`
- **Value**: `rnd_abc123xyz456def789ghi012jkl345` (paste your key from Step 1)
- Click **"Add secret"**

### Second Secret: RENDER_SERVICE_ID

- **Name**: `RENDER_SERVICE_ID`
- **Value**: `srv-cqb1234567890abcdef` (paste your ID from Step 2)
- Click **"Add secret"**

## Step 4: Verify Setup

After adding both secrets, you should see:

```
Repository secrets (2)
- RENDER_API_KEY     Updated X seconds ago
- RENDER_SERVICE_ID  Updated X seconds ago
```

## Step 5: Test Auto-Deploy

1. Make a small change (e.g., edit README.md)
2. Commit and push to `main` branch
3. Go to [GitHub Actions](https://github.com/spotUP/amiexpress-web/actions)
4. Watch the "Deploy to Render" workflow
5. Should see: "[OK] Deployment triggered successfully"
6. Check [Render Dashboard](https://dashboard.render.com) for deployment progress

## Troubleshooting

### Error: "RENDER_API_KEY not set"

**Symptom**: Workflow runs but skips deployment
**Solution**: Verify secret name is exactly `RENDER_API_KEY` (case-sensitive)

### Error: "HTTP 401 Unauthorized"

**Symptom**: API call fails with 401 error
**Solutions**:
1. API key expired or invalid - generate new key
2. Check for extra spaces when pasting key
3. Regenerate API key on Render dashboard

### Error: "HTTP 404 Not Found"

**Symptom**: API call fails with 404 error
**Solutions**:
1. Service ID is incorrect
2. Verify service ID format: `srv-xxxxxxxxxxxxx`
3. Check service still exists on Render
4. Ensure service is a "Web Service" (not static site)

### Workflow Runs But No Deployment

**Check**:
1. GitHub Actions logs for errors
2. Render service is not paused
3. Service is using Docker (not legacy Node.js)
4. Branch is `main` (workflow only triggers on main)

## Security Best Practices

1. **Never commit secrets** to repository
2. **Rotate API keys** every 90 days
3. **Use separate keys** for different purposes (CI/CD, manual, etc.)
4. **Revoke unused keys** immediately
5. **Monitor deployments** for unauthorized changes

## What Happens on Deploy

When you push to `main`:

1. GitHub Actions runs all workflows:
   - Docker Build and Test (~3-5 min)
   - TypeScript Type Check (~2-3 min per package)
   - Deploy to Render (~1 min to trigger)

2. Render receives deploy trigger:
   - Pulls latest code from GitHub
   - Builds Docker image (~3-5 min)
   - Deploys new container
   - Health check
   - Routes traffic to new container

3. Total time: ~8-12 minutes from push to live

## Manual Deploy (Alternative)

If you prefer manual control:

1. Disable auto-deploy workflow:
   ```bash
   mv .github/workflows/deploy-render.yml .github/workflows/deploy-render.yml.disabled
   git add .github/workflows/
   git commit -m "chore: disable auto-deploy"
   git push
   ```

2. Deploy manually via Render dashboard or CLI

## Monitoring Deployments

### GitHub Actions Dashboard
```
https://github.com/spotUP/amiexpress-web/actions
```

### Render Dashboard
```
https://dashboard.render.com/web/YOUR-SERVICE-ID
```

### Render API (Check Status)
```bash
curl -H "Authorization: Bearer REDACTED" \
  https://api.render.com/v1/services/srv-YOUR_SERVICE_ID/deploys
```

## Cost

- **GitHub Actions**: Free (2,000 minutes/month on free plan)
- **Render API**: Free (included with all plans)
- **Deployments**: Unlimited (no extra cost)

## See Also

- [CI_CD.md](./CI_CD.md) - Complete CI/CD pipeline guide
- [DOCKER.md](./DOCKER.md) - Docker deployment guide
- [RENDER_DOCKER_MIGRATION.md](./RENDER_DOCKER_MIGRATION.md) - Migration from legacy
- [Render API Docs](https://render.com/docs/api) - Official API documentation

---

**Setup Time**: 5 minutes
**Maintenance**: Rotate API key every 90 days
**Benefit**: Automatic deployment on every push to main
