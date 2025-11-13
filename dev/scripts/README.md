# Development Scripts

This directory contains scripts for developing, testing, and deploying AmiExpress BBS.

---

## Sysop Scripts (Setup & Deployment) ⭐ NEW

### Setup & Configuration

#### `sysop-setup.sh` ⭐
**Interactive setup wizard for first-time BBS deployment**

```bash
./dev/scripts/sysop-setup.sh
```

**What it does:**
- Collects BBS configuration (name, sysop, location)
- Creates admin account with secure password
- Generates JWT secret automatically
- Creates .env.local configuration file
- Installs all dependencies (backend, frontend, SDK)
- Initializes database and creates tables
- Optionally generates SSH host key
- Offers to start servers

**When to use**: First-time setup, clean installation

**Time**: 5-10 minutes

---

#### `health-check.sh` ⭐
**Comprehensive health check for deployed BBS**

```bash
./dev/scripts/health-check.sh

# Options:
./dev/scripts/health-check.sh --fast                    # Skip TypeScript checks
./dev/scripts/health-check.sh --backend-url=<URL>       # Test specific backend
./dev/scripts/health-check.sh --frontend-url=<URL>      # Test specific frontend
```

**What it checks:**
- Environment configuration
- Database connectivity
- File system structure
- Backend API health
- Frontend availability
- Port availability
- Door system
- TypeScript compilation
- Security configuration

**When to use**: After deployment, troubleshooting

**Time**: 30 seconds (fast) or 2-3 minutes (full)

---

#### `pre-deploy-check.sh` ⭐
**Pre-deployment validation checklist**

```bash
./dev/scripts/pre-deploy-check.sh
```

**What it validates:**
- Git status (committed, pushed)
- TypeScript compilation
- Production builds (backend, frontend, config-app, SDK)
- Configuration files
- Security checks
- Dependencies
- Documentation

**When to use**: Before every production deployment

**Exit codes**: 0 = Ready, 1 = Blocked

---

### Server Management

#### `start-servers.sh`
**Start all BBS services**

```bash
./dev/scripts/start-servers.sh

# Options:
--debug     # Show full debug logs
--sdk-only  # Only start SDK preview
```

**Starts**: Backend, Frontend, Config App, SDK Preview, Telnet, SSH

**Features**:
- Auto-installs dependencies
- Creates .env.local if missing
- Opens browser automatically
- Saves logs to logs/ directory

---

#### `kill-servers.sh`
**Stop all running BBS services**

```bash
./dev/scripts/kill-servers.sh
```

---

### Deployment

#### `push-and-deploy.sh`
**Push to GitHub and trigger Render deployment**

```bash
./dev/scripts/push-and-deploy.sh [git push arguments]
```

---

## Testing Scripts

### Comprehensive Testing

- `test-all-commands.js` - Test all BBS commands
- `test-all-commands-quick.sh` - Quick command tests
- `test-bbs-comprehensive.js` - Full system test
- `test-command-interactive.js` - Interactive tester

### Specialized Testing

- `test-door-install.js` - Door testing
- `test-example-doors.sh` - SDK example validation
- `test-deep-dive.js` - Deep system analysis
- `test-simple.js` - Quick smoke test

### Import/Export Testing

- `test-import-execution.js` - Import functionality
- `test-user-parsing.js` - User file parsing

### Configuration Testing

- `test-config-api.js` - Config API tests
- `verify-config-tables.js` - Database schema validation

---

## Common Workflows

### First-Time Setup
```bash
./dev/scripts/sysop-setup.sh
```

### Daily Development
```bash
# Start
./dev/scripts/start-servers.sh

# Stop
./dev/scripts/kill-servers.sh
```

### Before Deployment
```bash
# Validate
./dev/scripts/pre-deploy-check.sh

# Deploy
./dev/scripts/push-and-deploy.sh
```

### After Deployment
```bash
# Health check
./dev/scripts/health-check.sh --backend-url=https://your-bbs.com
```

---

## Quick Reference

| Task | Command |
|------|---------|
| **First-time setup** | `./dev/scripts/sysop-setup.sh` |
| **Start BBS** | `./dev/scripts/start-servers.sh` |
| **Stop BBS** | `./dev/scripts/kill-servers.sh` |
| **Health check** | `./dev/scripts/health-check.sh` |
| **Pre-deploy check** | `./dev/scripts/pre-deploy-check.sh` |
| **Deploy** | `./dev/scripts/push-and-deploy.sh` |
| **Test all** | `node dev/scripts/test-all-commands.js` |

---

## Documentation

For detailed information:

- **Sysop Quick Start**: [Documentation/2-Sysops/QUICK_START.md](../../Documentation/2-Sysops/QUICK_START.md)
- **Railway Deployment**: [Documentation/2-Sysops/RAILWAY_DEPLOYMENT.md](../../Documentation/2-Sysops/RAILWAY_DEPLOYMENT.md)
- **Deployment Guide**: [Documentation/2-Sysops/DEPLOYMENT.md](../../Documentation/2-Sysops/DEPLOYMENT.md)
- **Testing Guide**: [Documentation/3-Developers/TESTING.md](../../Documentation/3-Developers/TESTING.md)

---

**Last Updated**: 2025-11-13
**New Scripts**: sysop-setup.sh, health-check.sh, pre-deploy-check.sh
