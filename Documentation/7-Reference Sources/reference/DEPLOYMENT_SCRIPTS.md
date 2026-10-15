# 🚀 AmiExpress-Web Deployment Scripts

Complete deployment automation suite for AmiExpress-Web with pre-flight checks, health monitoring, and rollback capabilities.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Scripts Overview](#scripts-overview)
- [Main Deployment Script](#main-deployment-script)
- [Helper Scripts](#helper-scripts)
- [Common Workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## 🎯 Quick Start

### First Time Setup

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Test deployment (dry run)
./deploy-production.sh --dry-run
```

### Standard Deployment

```bash
# Deploy to production
./deploy-production.sh

# Quick deploy (skip some checks)
./deploy-quick.sh

# Deploy to staging
./deploy-production.sh --staging
```

---

## 📦 Scripts Overview

| Script | Purpose | Use When |
|--------|---------|----------|
| **deploy-production.sh** | Full deployment with all checks | Standard production deploys |
| **deploy-quick.sh** | Fast deployment, minimal checks | Quick hotfixes, confident changes |
| **deploy-status.sh** | Check deployment health | Verify deployment status |
| **deploy-logs.sh** | View deployment logs | Debugging, monitoring |

---

## 🎨 Main Deployment Script

### `deploy-production.sh`

The comprehensive deployment script with 8 phases:

#### Features

- ✅ **Pre-flight Checks** - Git status, auth, prerequisites
- ✅ **TypeScript Compilation** - Validate code compiles
- ✅ **Build Validation** - Test builds work
- ✅ **Security Audit** - Check for vulnerabilities
- ✅ **Deployment Summary** - Show what will be deployed
- ✅ **Confirmation** - Interactive approval
- ✅ **Vercel Deploy** - Deploy to production
- ✅ **Health Checks** - Verify deployment works

#### Usage

```bash
# Standard production deployment
./deploy-production.sh

# Deploy to staging
./deploy-production.sh --staging

# Dry run (test without deploying)
./deploy-production.sh --dry-run

# Skip tests (when confident)
./deploy-production.sh --skip-tests

# Force deploy (bypass safety checks)
./deploy-production.sh --force

# Rollback to previous deployment
./deploy-production.sh --rollback

# Verbose output
./deploy-production.sh --verbose
```

#### Options Reference

| Option | Description | When to Use |
|--------|-------------|-------------|
| `--skip-tests` | Skip TypeScript compilation | When you've already tested locally |
| `--skip-build` | Skip build validation | To save time on repeated deploys |
| `--force` | Bypass safety checks | Emergency deploys, known issues |
| `--dry-run` | Test without deploying | Verify what would happen |
| `--rollback` | Revert to previous | Deployment broke something |
| `--staging` | Deploy to staging | Test before production |
| `--verbose` | Show detailed output | Debugging deployment issues |

#### Example Workflows

**Standard Production Deploy:**
```bash
./deploy-production.sh
# Review summary, confirm, deploy
```

**Emergency Hotfix:**
```bash
./deploy-production.sh --skip-tests --force
# Deploys immediately, no questions
```

**Safe Testing:**
```bash
# 1. Test locally
./deploy-production.sh --dry-run

# 2. Deploy to staging
./deploy-production.sh --staging

# 3. If good, deploy to production
./deploy-production.sh
```

**Rollback:**
```bash
./deploy-production.sh --rollback
# Confirms, then rolls back
```

---

## 🛠️ Helper Scripts

### 1. `deploy-quick.sh`

Fast deployment for when you're confident.

```bash
# Quick production deploy
./deploy-quick.sh

# Quick staging deploy
./deploy-quick.sh staging
```

**What it does:**
- Skips build validation (faster)
- Bypasses confirmation prompts
- Runs essential checks only
- Perfect for iterative development

**When to use:**
- Hotfixes
- Quick iterations
- Configuration changes
- When you've already tested locally

---

### 2. `deploy-status.sh`

Check deployment health and status.

```bash
./deploy-status.sh
```

**Shows:**
- ✅ Latest deployment URL
- ✅ HTTP status code
- ✅ Response time
- ✅ Last deployment info
- ✅ Recent deployment history

**Example Output:**
```
═══════════════════════════════════════
  AmiExpress Deployment Status
═══════════════════════════════════════

Latest Deployment:
  URL: https://amiexpress-xyz.vercel.app

Health Check:
  ✓ Deployment is responding (HTTP 200)
  Response time: 0.245s

Last Deployment Info:
  Time:        2025-10-16T09:30:00Z
  Commit:      a1b2c3d
  Branch:      main
  Environment: production
```

---

### 3. `deploy-logs.sh`

View and analyze deployment logs.

```bash
# View remote logs (default)
./deploy-logs.sh

# View local logs
./deploy-logs.sh local

# List all log files
./deploy-logs.sh list

# Follow live logs
./deploy-logs.sh follow
```

**Modes:**

| Mode | Command | Description |
|------|---------|-------------|
| Remote | `./deploy-logs.sh` | Latest Vercel deployment logs |
| Local | `./deploy-logs.sh local` | Local script execution logs |
| List | `./deploy-logs.sh list` | All available log files |
| Follow | `./deploy-logs.sh follow` | Live tail of deployment logs |

**Example:**
```bash
# Debug a failed deployment
./deploy-logs.sh

# See what happened during last deploy
./deploy-logs.sh local

# Monitor live deployment
./deploy-logs.sh follow
```

---

## 🔄 Common Workflows

### Daily Development

```bash
# Morning: Check status
./deploy-status.sh

# After changes: Quick deploy
./deploy-quick.sh staging

# If good: Production
./deploy-quick.sh
```

### Pre-Release

```bash
# 1. Full validation
./deploy-production.sh --dry-run

# 2. Deploy to staging
./deploy-production.sh --staging

# 3. Test thoroughly
./deploy-status.sh

# 4. Deploy to production
./deploy-production.sh

# 5. Monitor
./deploy-logs.sh follow
```

### Emergency Rollback

```bash
# Something broke!

# Option 1: Quick rollback
./deploy-production.sh --rollback

# Option 2: Check status first
./deploy-status.sh
./deploy-production.sh --rollback

# Option 3: View logs to diagnose
./deploy-logs.sh
./deploy-production.sh --rollback
```

### Debugging Failed Deploy

```bash
# 1. Check deployment status
./deploy-status.sh

# 2. View remote logs
./deploy-logs.sh

# 3. View local logs
./deploy-logs.sh local

# 4. Check specific log file
cat logs/deploy_YYYYMMDD_HHMMSS.log

# 5. Try with verbose output
./deploy-production.sh --verbose

# 6. If still failing, force through
./deploy-production.sh --force --verbose
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Project not found" Error

**Problem:** Vercel can't find your project

**Solution:**
```bash
# Clear old config
rm -rf .vercel

# Let script re-link
./deploy-production.sh
```

#### 2. "Not logged in to Vercel"

**Problem:** Vercel authentication expired

**Solution:**
```bash
vercel login
```

#### 3. TypeScript Compilation Fails

**Problem:** Code has TypeScript errors

**Solutions:**
```bash
# Option 1: Fix the errors
npm run build

# Option 2: Deploy anyway (not recommended)
./deploy-production.sh --skip-tests --force
```

#### 4. Uncommitted Changes

**Problem:** Git working directory not clean

**Solutions:**
```bash
# Option 1: Commit changes
git add .
git commit -m "Your message"
./deploy-production.sh

# Option 2: Force deploy
./deploy-production.sh --force
```

#### 5. Security Vulnerabilities Found

**Problem:** npm audit finds issues

**Solutions:**
```bash
# Option 1: Fix vulnerabilities
cd backend && npm audit fix
cd ../frontend && npm audit fix

# Option 2: Force deploy
./deploy-production.sh --force
```

#### 6. Health Check Fails

**Problem:** Deployment doesn't respond

**What to check:**
```bash
# 1. View logs
./deploy-logs.sh

# 2. Check Vercel dashboard
# Visit: https://vercel.com/dashboard

# 3. Test manually
curl -I https://your-deployment-url.vercel.app

# 4. Wait and retry (may still be deploying)
sleep 30
./deploy-status.sh
```

---

## 🎓 Advanced Usage

### Environment Variables

Scripts respect these environment variables:

```bash
# Vercel token for CI/CD
export VERCEL_TOKEN="your-token"

# Custom timeout (seconds)
export DEPLOY_TIMEOUT=600

# Health check retries
export HEALTH_CHECK_RETRIES=20
```

### CI/CD Integration

For automated deployments:

```bash
# GitHub Actions example
- name: Deploy to Production
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  run: |
    ./deploy-production.sh --skip-tests --force
```

### Custom Log Location

```bash
# Change log directory
export LOGS_DIR="/custom/path/logs"
./deploy-production.sh
```

### Parallel Deployments

Deploy multiple environments:

```bash
# Terminal 1
./deploy-production.sh --staging

# Terminal 2 (after staging succeeds)
./deploy-production.sh
```

### Scheduled Deployments

Use cron for scheduled deploys:

```bash
# Deploy every night at 2 AM
0 2 * * * cd /path/to/project && ./deploy-quick.sh 2>&1 | tee -a logs/cron.log
```

---

## 📊 Logs and Monitoring

### Log Files

All logs are stored in `./logs/`:

```
logs/
├── deploy_20251016_093000.log        # Full deployment log
├── deploy_error_20251016_093000.log  # Error log (if errors occurred)
├── last_deployment.json               # Latest deployment metadata
└── cron.log                          # Cron deployment logs (if used)
```

### Log Format

```
[HH:MM:SS] Step description
✓ Success message
✗ ERROR: Error description
⚠ WARNING: Warning message
ℹ Info message
```

### Monitoring Dashboard

After deployment, monitor at:

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Analytics:** https://vercel.com/[your-project]/analytics
- **Logs:** https://vercel.com/[your-project]/logs

---

## 🎯 Best Practices

### 1. Always Test First

```bash
# Never skip this step for important deploys
./deploy-production.sh --dry-run
```

### 2. Use Staging

```bash
# Deploy to staging before production
./deploy-production.sh --staging
./deploy-status.sh
./deploy-production.sh
```

### 3. Monitor After Deploy

```bash
./deploy-production.sh
./deploy-status.sh
./deploy-logs.sh follow  # Watch for 5 minutes
```

### 4. Keep Logs

```bash
# Logs are precious for debugging
# Never delete logs/ directory
git add logs/.gitkeep
```

### 5. Document Deployments

```bash
# Use descriptive commit messages
git commit -m "feat: Add chat feature - deploying v2.1.0"
./deploy-production.sh
```

---

## 🔐 Security Notes

### Sensitive Data

- Never commit `.env` files
- Keep `VERCEL_TOKEN` secret
- Rotate tokens periodically
- Use environment variables in Vercel dashboard

### Deployment Security

```bash
# Always verify before production
./deploy-production.sh --dry-run

# Check what's being deployed
git diff origin/main

# Audit dependencies
npm audit
```

---

## 📚 Quick Reference

### Most Common Commands

```bash
# Standard deploy
./deploy-production.sh

# Quick deploy
./deploy-quick.sh

# Check status
./deploy-status.sh

# View logs
./deploy-logs.sh

# Rollback
./deploy-production.sh --rollback

# Deploy to staging
./deploy-production.sh --staging
```

### Emergency Commands

```bash
# Force deploy NOW
./deploy-production.sh --skip-tests --skip-build --force

# Rollback NOW
./deploy-production.sh --rollback

# Check if site is up
./deploy-status.sh
```

---

## 🎉 Success Criteria

After deployment, verify:

- ✅ `./deploy-status.sh` shows green
- ✅ Production URL loads
- ✅ Login works
- ✅ Key features work (chat, messages, files)
- ✅ No errors in browser console
- ✅ No errors in `./deploy-logs.sh`

---

## 💡 Tips & Tricks

### Faster Deploys

```bash
# Skip unnecessary checks
./deploy-quick.sh

# Or be specific
./deploy-production.sh --skip-build
```

### Better Debugging

```bash
# Verbose output
./deploy-production.sh --verbose

# Follow live logs
./deploy-logs.sh follow

# Check both logs
./deploy-logs.sh local
./deploy-logs.sh
```

### Alias for Speed

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
alias deploy='cd /path/to/AmiExpress-Web && ./deploy-quick.sh'
alias deployprod='cd /path/to/AmiExpress-Web && ./deploy-production.sh'
alias deploystatus='cd /path/to/AmiExpress-Web && ./deploy-status.sh'
alias deploylogs='cd /path/to/AmiExpress-Web && ./deploy-logs.sh'
```

Then just:
```bash
deploy            # Quick deploy
deployprod        # Full deploy
deploystatus      # Check status
deploylogs        # View logs
```

---

## 🆘 Getting Help

### Script Help

```bash
./deploy-production.sh --help
```

### Check Script Version

```bash
grep "SCRIPT_VERSION=" deploy-production.sh
```

### Report Issues

If you encounter issues:

1. Check logs: `./deploy-logs.sh local`
2. Check status: `./deploy-status.sh`
3. View verbose: `./deploy-production.sh --verbose`
4. Check GitHub Issues
5. Review Vercel documentation

---

## 📝 Changelog

**Version 2.0.0** (2025-10-16)
- ✨ Complete rewrite with 8-phase deployment
- ✅ Pre-flight validation checks
- ✅ Security vulnerability scanning
- ✅ Health check automation
- ✅ Rollback support
- ✅ Comprehensive logging
- ✅ Helper scripts (quick, status, logs)
- ✅ Beautiful terminal output
- ✅ Dry run mode
- ✅ Staging support

---

## 🎊 Conclusion

You now have a **professional-grade deployment system** for AmiExpress-Web!

**Key Takeaways:**
- `./deploy-production.sh` for safe, validated deploys
- `./deploy-quick.sh` for fast iteration
- `./deploy-status.sh` to check health
- `./deploy-logs.sh` for debugging

**Remember:**
- Test before deploying (`--dry-run`)
- Deploy to staging first (`--staging`)
- Monitor after deployment (`deploy-status.sh`)
- Keep logs for debugging

---

**Happy Deploying! 🚀**

*Questions? Check --help or review the logs!*
