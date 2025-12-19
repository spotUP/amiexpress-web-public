# Deployment Checklist for Render.com

This checklist helps prevent common deployment errors on Render.com.

## Before Every Deployment

### 1. Check TypeScript Compilation
```bash
# Backend
cd web/backend && npx tsc --noEmit

# Frontend
cd web/frontend && npm run build:check

# Config App
cd web/config-app && npx tsc --noEmit

# SDK
cd sdk && npm run build
```

### 2. Verify Docker Build Locally
```bash
# Test the full Docker build (takes 5-10 min)
docker build -t amiexpress-test .

# Quick check without cache
docker build --no-cache --target backend-builder -t amiexpress-backend-test .
```

### 3. Check .dockerignore Consistency
```bash
# Verify critical files are NOT excluded
grep -E "^(Node1|Node2|Node3|Doors|Commands|Screens|Bulletins|Conf)" .dockerignore

# Expected: Node1-3 should NOT appear in output
# If they do, they're excluded and build will fail
```

### 4. Verify File Existence
Before adding new COPY commands to Dockerfile, ensure files exist:
```bash
ls -la Node1 Node2 Node3 Doors Commands
```

### 5. Test Example Doors
```bash
cd sdk
npm run build
cd doors/neo-blessed-demo && npm run build
cd ../2048-game && npm run build
```

## Common Deployment Errors and Fixes

### Error: "not found" during COPY
**Symptom:** `failed to calculate checksum: "/SomeDir": not found`

**Causes:**
1. Directory is excluded in `.dockerignore`
2. Directory doesn't exist in git
3. Directory is in `.gitignore`

**Fix:**
```bash
# Check if excluded
grep "SomeDir" .dockerignore

# Check if tracked
git ls-files SomeDir

# If needed, remove from .dockerignore or add to git
```

### Error: TypeScript Build Fails
**Symptom:** Build fails during `npm run build` in Dockerfile

**Fix:**
```bash
# Test locally first
cd web/backend && npx tsc --noEmit
cd web/frontend && npm run build
cd web/config-app && npm run build
cd sdk && npm run build

# Fix all errors before committing
```

### Error: Vite Build Fails
**Symptom:** `Could not load /app/packages/terminal/src`

**Cause:** Missing dependency in Dockerfile COPY stages

**Fix:** Ensure all dependencies are copied in correct order in Dockerfile

### Error: npm ci Fails
**Symptom:** `npm ERR! Cannot read properties of null`

**Causes:**
1. package-lock.json is corrupted
2. package.json version mismatch
3. Private packages without access

**Fix:**
```bash
# Regenerate package-lock.json
rm package-lock.json
npm install
git add package-lock.json
git commit -m "fix: Regenerate package-lock.json"
```

## Dockerfile Best Practices

### 1. COPY Order Matters
Copy files in order of change frequency (least to most):
```dockerfile
# 1. Package files (rarely change)
COPY package*.json ./

# 2. Install dependencies
RUN npm ci

# 3. Source code (changes often)
COPY src ./src
```

### 2. Use Build Caching
Group related operations to maximize cache hits:
```dockerfile
# Good - separate layers
COPY package*.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Bad - single layer invalidates cache
COPY . .
RUN npm ci && npm run build
```

### 3. Multi-Stage Builds
Keep final image small by using multi-stage builds (already implemented)

### 4. .dockerignore Hygiene
- Keep .dockerignore minimal
- Only exclude what's truly unnecessary
- Document why files are excluded
- Test builds after modifying

## Pre-Commit Hooks (Recommended)

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash

echo "Running pre-commit checks..."

# TypeScript check
echo "Checking TypeScript..."
cd web/backend && npx tsc --noEmit || exit 1

# SDK build
echo "Building SDK..."
cd ../../sdk && npm run build || exit 1

echo "Pre-commit checks passed!"
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Emergency Fixes

### Skip TypeScript Check (Last Resort)
If deployment is blocked by TypeScript errors that are non-critical:
```bash
# In package.json, temporarily change:
"build": "tsc --noEmit && vite build"
# To:
"build": "vite build"

# REMEMBER TO REVERT AFTER DEPLOYMENT
```

### Skip Tests (Last Resort)
If tests are failing but code works:
```bash
# In Dockerfile, add --ignore-scripts:
RUN npm ci --ignore-scripts
```

## Monitoring Deployments

### Check Build Logs
Always review full build logs on Render dashboard, not just the summary.

### Check Runtime Logs
After deployment, check `/logs/backend.log` for startup errors.

### Verify Health Check
```bash
curl https://your-site.com/health
```

## When Things Go Wrong

### Rollback Process
1. In Render dashboard, go to "Deploys"
2. Find last successful deployment
3. Click "Redeploy"

### Debug Locally
```bash
# Build exact Docker image that Render uses
docker build -t amiexpress-debug .

# Run it
docker run -p 3001:3001 amiexpress-debug

# Check logs
docker logs <container-id>
```

### Contact Support
If deployment consistently fails:
1. Save full build log
2. Document what changed
3. Provide error message
4. Show local build success
5. Open Render support ticket

## Prevention Strategies

### 1. Test Before Push
```bash
# Run this before every git push
./dev/scripts/pre-push-check.sh
```

### 2. Use Feature Branches
```bash
# Never push directly to main
git checkout -b feature/my-feature
# ... make changes ...
git push origin feature/my-feature
# Create PR, review, then merge
```

### 3. Gradual Rollout
For major changes:
1. Deploy to staging first
2. Test thoroughly
3. Deploy to production

### 4. Keep Dependencies Updated
```bash
# Check for outdated packages
npm outdated

# Update carefully
npm update
npm run build
npm test
```

### 5. Document Changes
In commit messages, note if:
- Dockerfile changed
- Dependencies added/removed
- Build process modified
- Environment variables needed

## Current Known Issues

### Issue 1: Node Directories
**Status:** FIXED (removed from .dockerignore)
**Date:** 2024-12-19
**Fix:** Node1-3 now included in Docker build for questionnaire scripts

### Issue 2: SDK Build Order
**Status:** RESOLVED
**Date:** Previous
**Fix:** Terminal package built before SDK preview frontend

## Resources

- [Render Docker Documentation](https://render.com/docs/docker)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
