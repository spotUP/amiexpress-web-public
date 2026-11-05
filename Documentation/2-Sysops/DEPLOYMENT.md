# Deployment Guide

## Production Deployment: Hetzner VPS

AmiExpress-Web runs on a Hetzner Cloud VPS with automatic deployment via GitHub Actions.

### Current Setup

| Component | Value |
|-----------|-------|
| Provider | Hetzner Cloud |
| Plan | CX22 (4GB RAM, 2 vCPU, 40GB SSD) |
| Cost | ~€3.79/month |
| Server IP | <server-ip> |
| Auto-deploy | GitHub Actions on push to `main` |

### Access Points

- **Web:** http://<server-ip>:3001
- **Telnet:** `telnet <server-ip> 64128`
- **SSH (BBS):** `ssh -p 31337 user@<server-ip>`
- **Admin:** http://<server-ip>:3001/admin

### How Deployment Works

1. Push code to `main` branch
2. GitHub Actions runs `.github/workflows/deploy-hetzner.yml`
3. Action SSHs into server and runs:
   ```bash
   cd /app/amiexpress
   git pull origin main
   docker compose up -d --build
   ```
4. Container rebuilds and restarts automatically

### Server Management

**SSH into server:**
```bash
ssh root@<server-ip>
```

**Common commands:**
```bash
cd /app/amiexpress

# View logs
docker compose logs -f

# Restart BBS
docker compose restart

# Full rebuild
docker compose up -d --build

# Check status
docker compose ps

# Health check
./deploy/status.sh
```

### Environment Variables

Configured in `/app/amiexpress/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `EMULATOR_MEMORY_MB` | 8 | RAM per 68K door (MB) |
| `FILE_CACHE_MB` | 8 | Screen/bulletin cache (MB) |
| `AMIGA_FILE_CACHE_MB` | 4 | Amiga file cache (MB) |
| `CORS_ORIGINS` | - | Allowed origins for CORS |
| `DEBUG` | false | Enable debug logging |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET` | generated | Unset or `CHANGE_ME`: a random value is generated at first start and kept in `/app/data/.secrets` (mode 600). A value in `.env` wins. |
| `BBS_TIMEZONE` | UTC | The board's time zone, e.g. `Europe/Stockholm` |
| `FTP_PASSIVE_ADDRESS` | - | Public IP FTP passive mode advertises; without it PASV answers 425 |
| `FTP_TLS_DIR`, `FTP_TLS_CERT`, `FTP_TLS_KEY`, `FTP_TLS_HOSTS` | - | FTPS. Empty = FTPS off. Host directory with certificates, and the `/certs/...` paths inside the container |
| `DOOR_SERVER_URL` | - | Door server (e.g. `http://doorserver:3010`). Empty = none |

A host that shares a Docker network with a door server adds it in an untracked `docker-compose.override.yml` (see the comment at the end of `docker-compose.yml`).

### Persistent Data

Data is stored in Docker volume `amiexpress-bbs-data`:
- `/app/data/bbs` - BBS files (Screens, Commands, Doors, etc.)
- `/app/data/db` - SQLite database
- `/app/data/amiga-roms` - AROS ROM files for 68K emulation

### Force Reinit Flags

Set these in `.env` temporarily to re-copy default data:

```bash
FORCE_REINIT_SCREENS=1   # Re-copy screen files
FORCE_REINIT_DOORS=1     # Re-copy door files
FORCE_REINIT_ROMS=1      # Re-copy ROM files
FORCE_REINIT_CONFIG=1    # Re-copy .info config files
```

After deploy, set back to 0.

### Troubleshooting

**BBS won't start:**
```bash
docker compose logs --tail=100
```

**Out of memory:**
- Check `EMULATOR_MEMORY_MB` setting
- Consider upgrading to CX32 (8GB RAM)

**Can't connect via Telnet:**
- Check firewall allows port 64128
- Verify container is running: `docker compose ps`

### Backup

```bash
# Backup data volume
docker run --rm -v amiexpress-bbs-data:/data -v $(pwd):/backup alpine tar czf /backup/bbs-backup-$(date +%Y%m%d).tar.gz /data
```

### Initial Setup

See `deploy/README.md` for first-time VPS setup instructions.

---

## Merged from CI/CD Pipeline Documentation

### Overview

AmiExpress-Web uses GitHub Actions for automatic deployment to Hetzner VPS.


### Workflow

**File**: `.github/workflows/deploy-hetzner.yml`

**Triggers**:
- Push to `main` branch (automatic)
- Manual trigger via GitHub Actions UI (`workflow_dispatch`)

**Steps**:
1. SSH into Hetzner server
2. Pull latest code from GitHub
3. Rebuild and restart Docker container

**Deploy Time**: 3-5 minutes


### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Server IP address (203.0.113.10) |
| `HETZNER_SSH_KEY` | Private SSH key (no passphrase) |


### Setup Instructions

#### 1. Generate Deploy Key

```bash
# On your local machine
ssh-keygen -t ed25519 -f ~/.ssh/hetzner_deploy -N "" -C "github-deploy"

# Add public key to server
ssh root@203.0.113.10 "echo '$(cat ~/.ssh/hetzner_deploy.pub)' >> ~/.ssh/authorized_keys"
```

#### 2. Add GitHub Secrets

1. Go to: https://github.com/YOUR-ORG/amiexpress-web/settings/secrets/actions
2. Add `HETZNER_HOST`: `203.0.113.10`
3. Add `HETZNER_SSH_KEY`: contents of `~/.ssh/hetzner_deploy`

#### 3. Verify

Push a commit to `main` and check:
https://github.com/YOUR-ORG/amiexpress-web/actions


### Workflow Status

- **Green checkmark** = Deploy successful
- **Red X** = Deploy failed (check logs)
- **Yellow circle** = Deploy in progress


### Manual Deployment

If needed, deploy manually:

```bash
ssh root@203.0.113.10
cd /app/amiexpress
git pull origin main
docker compose up -d --build
```


### Troubleshooting

#### SSH Authentication Failed

```
ssh: unable to authenticate
```

- Ensure SSH key has no passphrase
- Verify public key is in server's `~/.ssh/authorized_keys`
- Check `HETZNER_SSH_KEY` secret is the private key (not public)

#### Deploy Script Failed

Check server logs:
```bash
ssh root@203.0.113.10 "docker compose -f /app/amiexpress/docker-compose.yml logs --tail=50"
```

---

## Merged from Production Deployment Checklist

### Critical Issue: Static Asset 500 Errors

If you see 500 errors for fonts/JS/CSS files in production, it means the frontend build is out of sync with what `index.html` expects.

**Symptoms:**
```
PetMe64.ttf: 500
socket-BlgWwLEk.js: 500
terminal-D0r5lDjn.js: 500
index-B0JZ_FSy.css: 500
vendor-BIF_SMrh.js: 500
```

**Root Cause:**
- Frontend was rebuilt but backend is serving old dist folder
- OR backend build didn't include updated frontend dist
- OR frontend dist wasn't committed to repo (if deploying from git)


### Full Deployment Process

#### 1. Build Frontend

```bash
cd web/frontend
npm install          # Install dependencies
npm run build        # Build for production
```

**Result:** Creates `web/frontend/dist/` with:
- `index.html` (with hashed asset references)
- `assets/` (hashed JS/CSS files)
- `fonts/` (font files)

#### 2. Verify Frontend Build

```bash
ls -la web/frontend/dist/
ls -la web/frontend/dist/assets/    # Should see JS/CSS with hashes
ls -la web/frontend/dist/fonts/     # Should see .ttf files
```

**Check:** Ensure files referenced in `index.html` exist in `assets/` and `fonts/`.

#### 3. Build Backend

```bash
cd web/backend
npm install          # Install dependencies
npx tsc              # Compile TypeScript
```

**Result:** Creates `web/backend/dist/` with compiled JS.

#### 4. Deploy

**Option A: Deploy entire project (recommended)**
```bash
# From repo root
rsync -av --exclude node_modules --exclude .git . user@server:/path/to/bbs/
```

**Option B: Deploy specific directories**
```bash
# Frontend dist
rsync -av web/frontend/dist/ user@server:/path/to/bbs/web/frontend/dist/

# Backend dist
rsync -av web/backend/dist/ user@server:/path/to/bbs/web/backend/dist/

# Backend source (for node_modules)
rsync -av --exclude node_modules web/backend/ user@server:/path/to/bbs/web/backend/
```

#### 5. Install Production Dependencies

```bash
# On production server
cd /path/to/bbs/web/backend
npm install --production  # Install only production deps
```

#### 6. Restart Server

```bash
# On production server
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

#### 7. Verify

```bash
# Check backend logs
tail -f logs/backend.log

# Should see:
# [Static] Serving BBS Terminal at / from /path/to/bbs/web/frontend/dist
# [Static] Assets path exists: true
# [Static] Fonts path exists: true
# [Static] Assets count: X, first 5: ...
```

**Open browser:**
```
https://your-bbs.com/
```

**Check console:** Should see NO 500 errors.


### Quick Fix for 500 Errors

If you're seeing 500 errors in production:

```bash
# On production server
cd /path/to/bbs

# 1. Rebuild frontend
cd web/frontend
npm install
npm run build

# 2. Verify build
ls -la dist/assets/ | head -10
ls -la dist/fonts/

# 3. Restart backend
cd ../..
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh

# 4. Check logs
tail -f logs/backend.log | grep -E "Static|Error"
```


### Common Issues

#### Issue 1: "Cannot find module" errors

**Cause:** Missing dependencies on production server.

**Fix:**
```bash
cd web/backend
rm -rf node_modules
npm install --production
```

#### Issue 2: 500 errors for static assets

**Cause:** Frontend dist out of sync.

**Fix:**
```bash
cd web/frontend
rm -rf dist
npm run build
# Restart backend
```

#### Issue 3: "dist not found" warnings

**Cause:** Frontend not built before deploying.

**Fix:** Always run `npm run build` in `web/frontend` before deploying.

#### Issue 4: Fonts/assets 404

**Cause:** Files exist but wrong permissions.

**Fix:**
```bash
chmod -R 755 web/frontend/dist
```

#### Issue 5: Old assets still served

**Cause:** Browser cache or CDN cache.

**Fix:**
- Hard refresh: Ctrl+Shift+R (Chrome/Firefox)
- Clear browser cache
- OR wait for cache to expire (1 year in production)
- OR change asset hashes by rebuilding frontend


### Error Handler (Added 2026-01-17)

The backend now has a global error handler that:
- Returns 404 for missing files (instead of 500)
- Returns 403 for permission errors
- Logs detailed error info for debugging

**Before fix:**
```
socket-BlgWwLEk.js: 500 Internal Server Error
```

**After fix:**
```
socket-BlgWwLEk.js: 404 Not Found
```

**Still seeing 500s?** Check backend logs:
```bash
tail -f logs/backend.log | grep "Express Error"
```


### Deployment Automation (Future)

Consider adding:
- GitHub Actions for automatic builds
- Deploy script that builds frontend + backend
- Health check endpoint
- Rollback mechanism
