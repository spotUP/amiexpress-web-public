# Production Deployment Checklist

## Critical Issue: Static Asset 500 Errors

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

## Full Deployment Process

### 1. Build Frontend

```bash
cd web/frontend
npm install          # Install dependencies
npm run build        # Build for production
```

**Result:** Creates `web/frontend/dist/` with:
- `index.html` (with hashed asset references)
- `assets/` (hashed JS/CSS files)
- `fonts/` (font files)

### 2. Verify Frontend Build

```bash
ls -la web/frontend/dist/
ls -la web/frontend/dist/assets/    # Should see JS/CSS with hashes
ls -la web/frontend/dist/fonts/     # Should see .ttf files
```

**Check:** Ensure files referenced in `index.html` exist in `assets/` and `fonts/`.

### 3. Build Backend

```bash
cd web/backend
npm install          # Install dependencies
npx tsc              # Compile TypeScript
```

**Result:** Creates `web/backend/dist/` with compiled JS.

### 4. Deploy

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

### 5. Install Production Dependencies

```bash
# On production server
cd /path/to/bbs/web/backend
npm install --production  # Install only production deps
```

### 6. Restart Server

```bash
# On production server
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

### 7. Verify

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

## Quick Fix for 500 Errors

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

## Common Issues

### Issue 1: "Cannot find module" errors

**Cause:** Missing dependencies on production server.

**Fix:**
```bash
cd web/backend
rm -rf node_modules
npm install --production
```

### Issue 2: 500 errors for static assets

**Cause:** Frontend dist out of sync.

**Fix:**
```bash
cd web/frontend
rm -rf dist
npm run build
# Restart backend
```

### Issue 3: "dist not found" warnings

**Cause:** Frontend not built before deploying.

**Fix:** Always run `npm run build` in `web/frontend` before deploying.

### Issue 4: Fonts/assets 404

**Cause:** Files exist but wrong permissions.

**Fix:**
```bash
chmod -R 755 web/frontend/dist
```

### Issue 5: Old assets still served

**Cause:** Browser cache or CDN cache.

**Fix:**
- Hard refresh: Ctrl+Shift+R (Chrome/Firefox)
- Clear browser cache
- OR wait for cache to expire (1 year in production)
- OR change asset hashes by rebuilding frontend

## Error Handler (Added 2026-01-17)

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

## Deployment Automation (Future)

Consider adding:
- GitHub Actions for automatic builds
- Deploy script that builds frontend + backend
- Health check endpoint
- Rollback mechanism

## References

- `web/backend/src/server/routes-setup.ts` - Static file serving
- `web/frontend/vite.config.ts` - Frontend build configuration
- `dev/scripts/start-servers.sh` - Server startup script
