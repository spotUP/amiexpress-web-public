# Sysop Quick Start Guide

Get your AmiExpress BBS up and running in 10 minutes!

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Setup (Local)](#quick-setup-local)
3. [Quick Deploy (Production)](#quick-deploy-production)
4. [First Login](#first-login)
5. [Essential Configuration](#essential-configuration)
6. [Import Existing BBS](#import-existing-bbs-optional)
7. [Next Steps](#next-steps)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional, for version control)
- **10 minutes** of your time

**Quick check:**
```bash
node --version  # Should be v18 or higher
npm --version   # Should be 9 or higher
```

---

## Quick Setup (Local)

### Option 1: Automated Setup Wizard (Recommended)

Run the setup wizard - it handles everything automatically:

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Run the setup wizard
./dev/scripts/sysop-setup.sh
```

**The wizard will:**
1. Collect your BBS information (name, sysop name, location)
2. Create your admin account
3. Generate secure credentials
4. Install all dependencies
5. Initialize the database
6. Optionally generate SSH keys
7. Start your BBS

**That's it!** Your BBS will be running at `http://localhost:5173`

---

### Option 2: Manual Setup

If you prefer manual control:

#### 1. Clone and Install

```bash
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Install backend dependencies
cd web/backend && npm install && cd ../..

# Install frontend dependencies
cd web/frontend && npm install && cd ../..

# Install SDK (optional, for door development)
cd sdk && npm install && cd ..
```

#### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env.local

# Edit configuration
nano .env.local  # or use your preferred editor
```

**Required settings in .env.local:**
```bash
# Generate JWT secret with: openssl rand -base64 32
JWT_SECRET=your_generated_secret_here

BBS_NAME=Your BBS Name
SYSOP_NAME=Your Name
BBS_LOCATION=Your City, State

DATABASE_DIR=./data
DATABASE_FILE=amiexpress.db
```

#### 3. Initialize Database

```bash
# Start servers (creates database automatically)
./dev/scripts/start-servers.sh
```

#### 4. Create Admin Account

Open your browser to `http://localhost:5173` and:
1. Click "New User" or "Register"
2. Create account with username: `sysop`
3. Email the sysop to request admin elevation OR manually edit database

**OR** use the database directly:
```bash
# Connect to SQLite database
sqlite3 data/amiexpress.db

# Update user to admin (security level 255)
UPDATE users SET security_level = 255 WHERE username = 'sysop';
```

---

## Quick Deploy (Production)

### Option 1: Railway.app (Easiest - Recommended)

**One-click deploy:**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/amiexpress)

**Manual Railway deployment:**

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Select your AmiExpress repository
5. Add volume: `/app/data` (1GB+)
6. Set environment variables:
   ```bash
   JWT_SECRET=generate_with_openssl_rand_base64_32
   BBS_NAME=Your BBS Name
   SYSOP_NAME=Your Name
   DATABASE_DIR=/app/data
   NODE_ENV=production
   ```
7. Deploy and wait 3-5 minutes
8. Access your BBS at the generated Railway URL

**Cost**: $3-8/month for small-medium BBS

**Full guide**: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)

---

### Option 2: Render.com

1. Push code to GitHub
2. Connect GitHub to Render.com
3. Create new Web Service
4. Add persistent disk (7GB minimum)
5. Set environment variables (same as Railway)
6. Deploy

**Cost**: $7+/month (requires paid disk)

**Full guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

### Option 3: Self-Hosted (VPS/Dedicated)

**Requirements:**
- Ubuntu 22.04+ or similar Linux
- 1GB+ RAM
- 10GB+ disk space
- Node.js 18+
- nginx (for reverse proxy)

**Quick setup:**
```bash
# On your server
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Run setup wizard
./dev/scripts/sysop-setup.sh

# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start dev/scripts/start-servers.sh --name amiexpress
pm2 save
pm2 startup  # Follow instructions to start on boot
```

**Configure nginx reverse proxy:**
```nginx
server {
    listen 80;
    server_name yourbbs.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

---

## First Login

After setup, access your BBS:

**Local:**
- Web Terminal: `http://localhost:5173`
- Telnet: `telnet localhost 2323`
- SSH: `ssh -p 2222 sysop@localhost`

**Production:**
- Use your Railway/Render URL
- Example: `https://your-project.railway.app`

**Login credentials:**
- Username: The admin username you created
- Password: The password you set during setup

---

## Essential Configuration

### 1. Verify BBS Settings

Login as admin and go to:
```
Admin Menu → System Configuration
```

Verify/update:
- [X] BBS Name
- [X] Sysop Name
- [X] Location
- [X] New user security level (typically 10-20)
- [X] Max session time (minutes)
- [X] Idle timeout (minutes)

### 2. Configure Conferences

```
Admin Menu → Conference Management → Add Conference
```

Create your first conference:
- **Name**: General
- **Description**: General discussion area
- **Access Level**: 10 (accessible to all users)
- **Read Security**: 0
- **Write Security**: 10

### 3. Set Up File Areas

```
Admin Menu → Conference Management → [Conference] → File Areas
```

Create file areas:
- **Name**: General Files
- **Path**: `/files/general`
- **Description**: General file uploads
- **Upload Access**: 20
- **Download Access**: 10

### 4. Customize Screens

Edit BBS screens to personalize your BBS:

```bash
# Main menu screen
nano data/bbs/BBS/Screens/MENU.TXT

# Login screen
nano data/bbs/BBS/Screens/LOGON.TXT

# Bulletin board
nano data/bbs/BBS/Screens/BBSTITLE.TXT
```

**Use ANSI codes or plain ASCII art**

### 5. Create Bulletins

```bash
# Create today's bulletin
nano data/bbs/BBS/Conf01/Bulletins/$(date +%Y%m%d)_WELCOME.TXT
```

Example bulletin:
```
Welcome to [Your BBS Name]!

Today is: ~D
Current Time: ~T

[X] Message Bases - Read and post messages
[X] File Areas - Upload and download files
[X] Doors & Games - Play online games
[X] User List - See who's online

For help, type: HELP
To logout, type: OFF

Enjoy your stay!
- ~SYSOPNAME
```

---

## Import Existing BBS (Optional)

If you're migrating from an Amiga BBS:

### 1. Export from Amiga

Create an archive containing:
- `User.data` (user database)
- `Conf1-Conf14/` (conference directories)
- `bbsConfig.info` (BBS configuration)
- `Commands/` (command definitions)
- `Screens/` (screen files)
- `Bulletins/` (bulletin files)

**Supported formats**: LHA, LZX, ZIP, TAR, TAR.GZ

### 2. Import to AmiExpress-Web

1. Login as admin
2. Navigate to: `Admin Menu → Import/Export`
3. Click "Upload Archive"
4. Drag and drop your archive or click to browse
5. Wait for validation (30 seconds - 2 minutes)
6. Review conflicts and choose resolution strategy:
   - **Skip**: Don't import conflicting items (safest)
   - **Replace**: Overwrite existing data
   - **Merge**: Combine statistics
   - **Rename**: Import with different name
7. Click "Execute Import"
8. Wait for completion (1-5 minutes)
9. Verify imported data

**Full guide**: [IMPORT_USER_GUIDE.md](../1-Users/IMPORT_USER_GUIDE.md)

---

## Next Steps

Now that your BBS is running:

### Customize Your BBS

1. **Install Doors/Games**
   ```bash
   cd sdk
   npm run create-door  # Create new door
   # OR
   # Install pre-made doors from community
   ```
   See: [Door Development Guide](../4-Door-Developers/DOOR_DEVELOPMENT.md)

2. **Create More Conferences**
   - Message conferences (discussions)
   - File conferences (downloads)
   - Specialized topics

3. **Configure User Access Levels**
   ```
   Admin → Access Level Management
   ```
   Define security levels:
   - 0-10: New users (limited access)
   - 10-50: Regular users
   - 50-100: Trusted users
   - 100-200: Moderators
   - 200-254: Co-sysops
   - 255: Full sysop

4. **Set Up Automated Tasks**
   - Daily maintenance scripts
   - Log rotation
   - Database backups
   - User cleanup (inactive users)

### Monitor Your BBS

**Health Check:**
```bash
./dev/scripts/health-check.sh
```

**Check Logs:**
```bash
# Backend log
tail -f logs/backend.log

# Frontend log
tail -f logs/frontend.log
```

**View Active Users:**
```
Admin → Node Activity
```

### Backup Strategy

**Automated Daily Backup:**
```bash
# Add to crontab (crontab -e)
0 2 * * * cd /path/to/amiexpress-web && ./dev/scripts/backup-database.sh
```

**Manual Backup:**
```bash
# Export full BBS data
Admin → Import/Export → Export → Download

# OR copy database directly
cp data/amiexpress.db backups/amiexpress-$(date +%Y%m%d).db
```

**Cloud Backup** (Production):
- Use Railway automatic backups
- OR sync to S3/Dropbox/Google Drive
- Keep 30 days of rolling backups

### Promote Your BBS

1. **Add to BBS Lists**
   - [Telnet BBS Guide](https://www.telnetbbsguide.com/)
   - [BBS Corner](https://www.bbscorner.com/)
   - [Synchronet BBS List](https://www.synchro.net/)

2. **Share on Social Media**
   - Reddit: r/bbs
   - Facebook: Vintage BBS groups
   - Twitter: #BBS hashtag

3. **Create Landing Page**
   - Link to your BBS
   - Show screenshots
   - Explain features
   - Provide connection info

---

## Troubleshooting

### BBS Won't Start

**Check logs:**
```bash
cat logs/backend.log
cat logs/frontend.log
```

**Common issues:**
- Port already in use → Change ports in .env.local
- Database locked → Kill zombie processes: `./dev/scripts/kill-servers.sh`
- Missing dependencies → Run: `cd web/backend && npm install`

### Can't Login as Admin

**Reset admin password:**
```bash
sqlite3 data/amiexpress.db
UPDATE users SET password_hash = '$2a$10$...' WHERE username = 'sysop';
# Generate hash with: node -e "console.log(require('bcryptjs').hashSync('newpassword', 10))"
```

### Database Corruption

**Restore from backup:**
```bash
cp backups/amiexpress-YYYYMMDD.db data/amiexpress.db
./dev/scripts/start-servers.sh
```

### Import Fails

**Check archive structure:**
```bash
# Extract and verify
unzip your-archive.zip -d temp/
ls -la temp/
# Should contain: User.data, Conf1/, bbsConfig.info, etc.
```

**Common issues:**
- Archive > 100MB → Compress more or split
- Invalid format → Re-archive as ZIP
- Missing User.data → Check archive structure

### WebSocket Connection Fails

**Check CORS settings:**
```bash
# In web/backend/src/config.ts
# Ensure your domain is in corsOrigins array
```

**Railway/Render:**
- Verify RAILWAY_PUBLIC_DOMAIN or RENDER_URL is set
- Check that WebSocket upgrade headers are allowed

### TypeScript Errors

**Fix compilation errors:**
```bash
cd web/backend
npx tsc --noEmit  # Shows all errors

# Fix errors in reported files
# Then verify:
npx tsc --noEmit  # Should show 0 errors
```

---

## Health Check

Before deploying to production, run:

```bash
./dev/scripts/pre-deploy-check.sh
```

This validates:
- [X] Git status (committed and pushed)
- [X] TypeScript compilation
- [X] Production builds
- [X] Configuration files
- [X] Security checks
- [X] Documentation

**100% pass = Ready to deploy!**

---

## Need Help?

**Documentation:**
- User Guide: [USER_GUIDE.md](../1-Users/USER_GUIDE.md)
- Deployment: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Railway: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)
- Door Development: [DOOR_DEVELOPMENT.md](../4-Door-Developers/DOOR_DEVELOPMENT.md)
- Architecture: [ARCHITECTURE.md](../3-Developers/ARCHITECTURE.md)

**Scripts:**
- Setup Wizard: `./dev/scripts/sysop-setup.sh`
- Health Check: `./dev/scripts/health-check.sh`
- Pre-Deploy Check: `./dev/scripts/pre-deploy-check.sh`
- Kill Servers: `./dev/scripts/kill-servers.sh`

**Community:**
- GitHub Issues: Report bugs and feature requests
- BBS Forums: Login and post in Sysop conference
- Discord: [Join our Discord](#) (if available)

---

## Quick Reference

**Start BBS:**
```bash
./dev/scripts/start-servers.sh
```

**Stop BBS:**
```bash
./dev/scripts/kill-servers.sh
```

**Health Check:**
```bash
./dev/scripts/health-check.sh
```

**Pre-Deploy Check:**
```bash
./dev/scripts/pre-deploy-check.sh
```

**Access Points:**
- Web: `http://localhost:5173`
- Admin: `http://localhost:5173/admin`
- Config: `http://localhost:8081` (config-app)
- Telnet: `telnet localhost 2323`
- SSH: `ssh -p 2222 user@localhost`

**Logs:**
- Backend: `logs/backend.log`
- Frontend: `logs/frontend.log`
- Config App: `logs/config.log`

---

## Welcome to the BBS Community!

You're now part of a vibrant community keeping the BBS tradition alive. Enjoy building your community, sharing files, hosting games, and connecting people the classic way!

**Happy SysOpping!**

---

*Last Updated: 2025-11-13*
*Version: 1.0*
