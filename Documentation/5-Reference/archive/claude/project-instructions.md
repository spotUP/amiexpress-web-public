# AmiExpress-Web Project Instructions

## 🚀 Deployment Policy

### ALWAYS Use deploy-production.sh

**CRITICAL:** All production and staging deployments MUST use the automated deployment script.

```bash
# ✅ CORRECT - Use the deployment script
./deploy-production.sh

# ❌ WRONG - Never deploy manually
vercel --prod
render deploy
```

### Why?

The `deploy-production.sh` script provides:
- ✅ Pre-flight validation checks
- ✅ TypeScript compilation verification
- ✅ Build validation
- ✅ Security vulnerability scanning
- ✅ Automated testing
- ✅ Health checks
- ✅ Deployment logging
- ✅ Rollback capabilities
- ✅ Consistent deployment process

### Deployment Targets

The script deploys to **BOTH** platforms:
1. **Vercel** - Frontend + Serverless backend
2. **Render.com** - WebSocket backend (persistent connections)

### Standard Deployment Commands

```bash
# Production deployment (deploys to both Vercel + Render)
./deploy-production.sh

# Quick deployment (skip some checks)
./deploy-quick.sh

# Staging deployment
./deploy-production.sh --staging

# Test deployment (no actual deploy)
./deploy-production.sh --dry-run

# Emergency rollback
./deploy-production.sh --rollback

# Check deployment health
./deploy-status.sh

# View deployment logs (both Vercel + Render)
./deploy-logs.sh
```

## 📦 Project Architecture

### Deployment Infrastructure

```
AmiExpress-Web
│
├── Vercel (Primary)
│   ├── Frontend (React + xterm.js)
│   ├── Serverless Functions
│   └── PostgreSQL Database
│
└── Render.com (WebSocket Backend)
    ├── Persistent Node.js Service
    ├── Socket.io Server
    └── PostgreSQL Database (shared or separate)
```

### Why Two Platforms?

- **Vercel:** Excellent for static frontend and serverless functions, but limited WebSocket support
- **Render.com:** Full WebSocket support for real-time BBS connections

## 🔧 Development Workflow

### Making Changes

1. **Develop locally** - Test features
2. **Commit to Git** - Always commit before deploying
3. **Test deployment** - Run `./deploy-production.sh --dry-run`
4. **Deploy to staging** - Run `./deploy-production.sh --staging`
5. **Test staging** - Verify everything works
6. **Deploy to production** - Run `./deploy-production.sh`
7. **Monitor** - Run `./deploy-status.sh` and `./deploy-logs.sh`

### Never Skip Steps

The deployment script exists for a reason. Even if you're in a hurry:

```bash
# If urgent, use quick deploy (still safer than manual)
./deploy-quick.sh

# If really urgent, force deploy (still logged)
./deploy-production.sh --skip-tests --force
```

## 🛠️ CLI Tools Required

### Essential Tools

1. **Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Render CLI**
   ```bash
   npm install -g render
   render login
   ```

3. **Node.js + npm**
   ```bash
   node --version  # v18+
   npm --version   # v9+
   ```

### Authentication

Both CLIs must be authenticated before deployment:

```bash
# Check Vercel auth
vercel whoami

# Check Render auth
render whoami

# If not authenticated
vercel login
render login
```

## 📝 Logging and Monitoring

### Always Check Logs After Deployment

```bash
# View logs from both platforms
./deploy-logs.sh

# Check deployment health
./deploy-status.sh

# Follow live logs
./deploy-logs.sh follow
```

### Log Locations

- **Local logs:** `./logs/deploy_*.log`
- **Vercel logs:** Via Vercel dashboard or `vercel logs`
- **Render logs:** Via Render dashboard or `render logs`

## 🔐 Security

### Environment Variables

Never commit these files:
- `.env`
- `.env.local`
- `.env.production`

Set environment variables in:
- **Vercel:** Dashboard → Settings → Environment Variables
- **Render:** Dashboard → Environment → Environment Variables

Required variables:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing key
- `REDIS_URL` - Redis connection (optional)
- `NODE_ENV` - Environment name

## 🎯 Best Practices

### Do's

✅ Always use `./deploy-production.sh`
✅ Test with `--dry-run` first
✅ Deploy to staging before production
✅ Monitor logs after deployment
✅ Keep deployment logs
✅ Commit before deploying
✅ Use descriptive commit messages

### Don'ts

❌ Never deploy manually with `vercel` or `render` commands
❌ Never skip the deployment script
❌ Never force push to main
❌ Never commit sensitive data
❌ Never skip staging for major changes
❌ Never ignore health check failures

## 🆘 Troubleshooting

### Deployment Failed?

```bash
# 1. Check what went wrong
./deploy-logs.sh

# 2. View local logs
./deploy-logs.sh local

# 3. Check status
./deploy-status.sh

# 4. If needed, rollback
./deploy-production.sh --rollback

# 5. Fix issue and redeploy
./deploy-production.sh
```

### Health Check Failed?

```bash
# Wait and check again (might still be deploying)
sleep 30
./deploy-status.sh

# Check logs for errors
./deploy-logs.sh

# Check both platforms manually
curl -I https://your-vercel-url.vercel.app
curl -I https://your-render-url.onrender.com
```

## 🎨 UI/UX Standards

### Amiga ASCII Compatibility - CRITICAL

**This is a BBS system for Amiga users. NEVER use PC-DOS specific characters.**

❌ **NEVER USE:**
- PC-DOS box drawing: `╔ ═ ║ ╗ ╚ ╝ ─ │ ├ ┤ ┬ ┴ ┼`
- Arrow symbols: `↑ ↓ ← → ↖ ↗ ↘ ↙`
- Block characters: `█ ▄ ▌ ▐ ░ ▒ ▓`
- Extended ASCII: Characters above ASCII 126

✅ **ALWAYS USE:**
- **Headers:** `-= Title =-` format (Amiga standard)
- **Borders:** Simple `-` and `|` characters
- **Boxes:** `+`, `-`, `|` for corners and sides
- **Key Display:** `[KEY]` bracket format (e.g., `[Q] Quit`)
- **Arrows:** Text like `UP`, `DN`, `LT`, `RT` or symbols `^`, `v`, `<`, `>`
- **Standard ASCII:** Only characters in ASCII 32-126 range

### Example Amiga-Compatible UI

```
-= DOOR MANAGER =-

Installed Doors:

 [*] [TS] DoorManager          23KB

--------------------------------------------------------------------------------
[UP/DN] Navigate  [ENTER] Info  [Q] Quit
```

### Why This Matters

Amiga systems use standard ASCII only. PC-DOS box drawing characters will appear as garbage characters on real Amiga terminals. The original AmiExpress used simple ASCII throughout, and this project must maintain that authentic Amiga aesthetic.

**See:** `backend/AMIGA_ASCII_FIXES.md` for complete guidelines

## 📚 Documentation

### Key Documents

- **DEPLOYMENT_SCRIPTS.md** - Complete deployment guide
- **DEPLOYMENT_SUCCESS.md** - Post-deployment reference
- **PROJECT_STATUS.md** - Project status and metrics
- **MASTER_PLAN.md** - Overall project plan
- **INTERNODE_CHAT_COMPLETE.md** - Chat system docs
- **AMIGA_ASCII_FIXES.md** - Amiga ASCII compatibility guide

### Getting Help

1. Check script help: `./deploy-production.sh --help`
2. Read documentation: `cat DEPLOYMENT_SCRIPTS.md`
3. Check logs: `./deploy-logs.sh`
4. Review project status: `cat PROJECT_STATUS.md`

## 🎓 Remember

> "The deployment script exists to make deployments safe, consistent, and reliable. Always use it, even when you're in a hurry. Future you will thank present you."

**When in doubt:**
```bash
./deploy-production.sh --dry-run
```

---

**Last Updated:** 2025-10-17
**Version:** 1.1.0 (Added Amiga ASCII compatibility guidelines)
