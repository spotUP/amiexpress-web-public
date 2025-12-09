# GitHub Actions Auto-Deploy Setup

**Quick Reference**: 2-minute setup for automatic deployment to Render.com

## What This Does

After setup, every time you push to the `main` branch:
- GitHub Actions automatically triggers Render deployment
- No manual "Deploy" button clicking needed
- Get notified if deployment fails

## Setup (2 Steps)

### Step 1: Get Render API Key

1. Go to [Render Dashboard → API Keys](https://dashboard.render.com/account/api-keys)
2. Click **"Create API Key"**
3. Name: `GitHub Actions`
4. **Copy the key** (starts with `rnd_`)
   - Save it immediately - you can't view it again!

### Step 2: Add to GitHub

1. Go to [GitHub Repository Settings → Secrets](https://github.com/spotUP/amiexpress-web/settings/secrets/actions)
2. Click **"New repository secret"**

**First Secret**:
- Name: `RENDER_API_KEY`
- Value: [paste your `rnd_...` key from Step 1]
- Click "Add secret"

**Second Secret**:
- Name: `RENDER_SERVICE_ID`
- Value: Get this from your Render service URL
  - Example URL: `https://dashboard.render.com/web/srv-abc123xyz`
  - Service ID: `srv-abc123xyz` (the part after `/web/`)
- Click "Add secret"

### Done!

That's it. Now when you push to `main`:

```bash
git push
# GitHub Actions will automatically deploy to Render
```

Watch it deploy: [GitHub Actions](https://github.com/spotUP/amiexpress-web/actions)

## Troubleshooting

**Error: "RENDER_API_KEY not set"**
- Secret name must be exactly `RENDER_API_KEY` (case-sensitive)
- Check GitHub Settings → Secrets to verify

**Error: "HTTP 401 Unauthorized"**
- API key is invalid or expired
- Generate new API key on Render dashboard
- Update `RENDER_API_KEY` secret on GitHub

**Error: "HTTP 404 Not Found"**
- Service ID is incorrect
- Verify service ID format: `srv-xxxxxxxxxxxxx`
- Get it from Render service URL

## Manual Deploy (Alternative)

Don't want auto-deploy? Just don't add the secrets. You can still deploy manually:

1. Push code to GitHub
2. Go to Render Dashboard
3. Click "Manual Deploy"

## See Also

- [RENDER_DOCKER_MIGRATION.md](./RENDER_DOCKER_MIGRATION.md) - Migrate to Docker first
- [CI_CD.md](./CI_CD.md) - Complete CI/CD documentation
