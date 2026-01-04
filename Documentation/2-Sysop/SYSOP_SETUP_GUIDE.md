# AmiExpress-Web Sysop Setup Guide

**Last Updated:** 2026-01-04
**Audience:** System Operators (Sysops)
**Prerequisites:** Basic Linux/macOS terminal knowledge, Docker basics

---

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Configuration](#configuration)
3. [User Management](#user-management)
4. [Content Management](#content-management)
5. [Door Installation](#door-installation)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Common Operations](#common-operations)

---

## Initial Setup

### 1. Install Prerequisites

**Linux/macOS:**
```bash
# Install Node.js 18+ and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Verify installations
node --version  # Should be v18.0.0+
npm --version
docker --version
docker-compose --version
```

**Windows (WSL2 recommended):**
- Install WSL2: `wsl --install`
- Follow Linux instructions above inside WSL2

### 2. Clone and Install

```bash
# Clone repository
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web

# Install dependencies
cd web/backend && npm install
cd ../frontend && npm install
cd ../../sdk && npm install
```

### 3. Generate Security Secrets

**CRITICAL:** Never use default secrets in production!

```bash
# Generate strong secrets (save these securely)
echo "JWT_SECRET=$(openssl rand -base64 64)"
echo "SESSION_SECRET=$(openssl rand -base64 64)"
echo "DATABASE_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

### 4. Create Environment File

```bash
# Copy example environment file
cp .env.example .env.local

# Edit with your secrets
nano .env.local
```

**Minimum required .env.local:**
```bash
# Security (REQUIRED - use values from step 3)
JWT_SECRET=<your-generated-jwt-secret>
SESSION_SECRET=<your-generated-session-secret>

# Database
DATABASE_DIR=./data
DATABASE_FILE=amiexpress.db

# BBS Configuration
BBS_DATA_DIR=./
BBS_NAME="Your BBS Name"
SYSOP_NAME="Your Name"

# Server
NODE_ENV=development
BACKEND_PORT=3001

# CORS (production only)
# ALLOWED_ORIGIN=https://yourbbs.example.com
```

### 5. Start the BBS

```bash
# From project root
./dev/scripts/start-servers.sh

# Or manually:
cd web/backend && npm run dev
```

**Access Points:**
- **Web Interface:** http://localhost:3001
- **Admin Panel:** http://localhost:3001/admin
- **Telnet:** telnet localhost 2323
- **SSH:** ssh -p 2222 localhost

### 6. Create Sysop Account

**First-time setup (database empty):**

1. Access web interface: http://localhost:3001
2. Click "New User" or connect via telnet
3. Create account with username "sysop" or your preferred name
4. Access admin panel: http://localhost:3001/admin
5. Login with sysop credentials
6. Navigate to Users → Find your account
7. Set Security Level to 255 (maximum)
8. Set Account Type to "Sysop"

**Verify sysop access:**
```bash
# Connect via telnet
telnet localhost 2323

# Login as sysop
# Run sysop command to verify
> /sysop
```

---

## Configuration

### BBS System Configuration

**Access:** Admin Panel → System Config

**Essential Settings:**

1. **BBS Information:**
   - BBS Name
   - Sysop Name
   - Location
   - Phone (optional)
   - Maximum Nodes (1-8)

2. **Security Settings:**
   - New User Security Level (10-50 recommended)
   - Auto-Validation Level
   - Maximum Password Fails (5 recommended)
   - Allow New Users (Yes/No)

3. **File Transfer:**
   - Default Protocol (ZModem recommended)
   - Upload Space Per User
   - Download Ratio Enforcement

4. **Message Settings:**
   - Default Message Base
   - Maximum Message Length
   - Allow Anonymous Posts

### Conference Configuration

**Access:** Admin Panel → Conferences

**Default Conferences:**
- Conference 1: Main (General Discussion)
- Conference 2-14: Create as needed

**Conference Settings:**
- Name (e.g., "General", "Programming", "Games")
- Description
- Security Level (who can access)
- Message Base Configuration
- File Area Configuration
- Conference Sysop

**Example Conference Structure:**
```
Conf 1: Main (General Discussion)
  - Message Base 1: General Chat
  - File Area 1: General Files

Conf 2: Programming
  - Message Base 2: Programming Talk
  - File Area 2: Source Code

Conf 3: Amiga
  - Message Base 3: Amiga Discussion
  - File Area 3: Amiga Software
```

### File Areas

**Location:** Each conference has File/ subdirectory

**Structure:**
```
Conf1/
  Files/
    Dir1/  - General uploads
    Dir2/  - Applications
    Dir3/  - Games
```

**Configure File Areas:**

1. Create directories:
```bash
mkdir -p Conf1/Files/Dir{1,2,3}
chmod 755 Conf1/Files/Dir*
```

2. Admin Panel → File Areas:
   - Set Upload Path (ULPATH)
   - Set Download Path (DLPATH)
   - Configure file descriptions

### Node Configuration

**Multi-Node Setup:**

1. Admin Panel → Node Config
2. For each node (1-8):
   - Set Status (Active/Inactive)
   - Set Maximum Baud Rate
   - Configure Node-Specific Screens

**Node Files:**
```
Node0/  - Global node files
Node1/  - Node 1 specific
Node2/  - Node 2 specific
...
Node8/  - Node 8 specific
```

---

## User Management

### Managing Users

**Access:** Admin Panel → Users

**Common Tasks:**

**1. View All Users:**
- Admin Panel → Users → User List
- Filter by security level, status, etc.

**2. Edit User Account:**
- Find user in list
- Click Edit
- Modify fields:
  - Username, Real Name, Location
  - Security Level (0-255)
  - Account Type (User/Sysop/Guest)
  - Upload/Download Limits
  - Credits, Time Bank
  - Conference Access

**3. Delete User:**
- Admin Panel → Users → Find User → Delete
- Confirm deletion (permanent!)

**4. Reset Password:**
- Admin Panel → Users → Find User → Reset Password
- User must create new password on next login

**5. Ban User:**
- Admin Panel → Users → Find User → Ban
- Or use IP ban: Security → IP Bans

### Security Levels

**Standard Levels:**
```
0-9:   Banned/Restricted
10-29: New User (limited access)
30-49: Validated User (normal access)
50-99: Trusted User (extended access)
100+:  Co-Sysop (elevated privileges)
255:   Sysop (full access)
```

**Access Control:**
- Set minimum security level for conferences
- Set minimum security level for doors
- Set minimum security level for file areas

### User Import

**Import from Amiga BBS:**

See `Documentation/1-Users/IMPORT_USER_GUIDE.md` for detailed instructions.

```bash
# Quick import
cd web/backend
npx tsx src/scripts/import-from-amiga.ts --users /path/to/User.data
```

---

## Content Management

### Bulletin Management

**Location:** `Bulletins/` directory

**Bulletin Files:**
```
bull1.txt - Bulletin 1
bull2.txt - Bulletin 2
...
bull10.txt - Bulletin 10
```

**Edit Bulletins:**

**Option 1: Direct File Edit**
```bash
nano Bulletins/bull1.txt
```

**Option 2: Admin Panel**
- Admin Panel → Content → Bulletins
- Select bulletin → Edit
- Supports ANSI codes and MCI codes

**Bulletin Display:**
- Users see bulletins on login
- Command: `B` to view bulletins
- Auto-display controlled by user preferences

### Screen Files

**Location:** `Screens/` and `Node*/Screens/`

**Common Screens:**
```
BBSTITLE.TXT  - BBS title/splash screen
LOGON.TXT     - Post-login screen
MENU.TXT      - Main menu
NEWUSER.TXT   - New user welcome
GOODBYE.TXT   - Logoff screen
```

**MCI Codes in Screens:**

MCI (Menu Command Interface) codes display dynamic content:

```
~UN - Username
~UF - User's full name
~UL - User's location
~CF - Conference number
~CN - Conference name
~TL - Time left
~CT - Current time
~CD - Current date
~BN - BBS name
~SN - Sysop name
```

**Example MENU.TXT:**
```
================================================================================
~BN                         Main Menu                    ~CT
================================================================================

Welcome ~UN (~UF)!

Conference: ~CN (~CF)                         Time Left: ~TL minutes

[M]essages  [F]iles  [D]oors  [C]hat  [U]ser  [G]oodbye

Command:
```

### Message Base Maintenance

**View Messages:**
- Admin Panel → Messages → Browse
- Filter by conference, date, user

**Delete Messages:**
- Admin Panel → Messages → Find → Delete
- Or use pack/maintain utilities

**Message Import:**
```bash
# Import messages from Amiga BBS
npx tsx src/scripts/import-from-amiga.ts --messages /path/to/Conf1/Messages
```

---

## Door Installation

### TypeScript SDK Doors

**Install Pre-Built Doors:**

1. Browse available doors: `sdk/doors/`
2. Build door:
```bash
cd sdk/doors/livechat
npm install
npm run build
```

3. Create command file: `Commands/BBSCmd/LIVECHAT.info`
```
COMMAND=LIVECHAT
TYPE=DOOR
DOORTYPE=SDK
LOCATION=sdk/doors/livechat
DESCRIPTION=Live Chat Room
SECURITY=10
```

4. Restart BBS or reload commands

**Available SDK Doors:**
- `livechat` - Multi-user chat rooms
- `neo-blessed-showcase` - UI widget demo
- `doors-menu` - Door launcher menu
- `bbs-dashboard` - Sysop monitoring

### Amiga 68K Doors

**Install Legacy Doors:**

1. Place door binary in `doors/` directory:
```bash
mkdir -p doors/AquaScan
cp AquaScan.020 doors/AquaScan/
```

2. Create `.info` file: `doors/AquaScan/AquaScan.info`
```
DOORNAME=AquaScan
VERSION=1.0
DOORTYPE=XIM
AUTHOR=Various
DESCRIPTION=File Scanner
```

3. Create command: `Commands/BBSCmd/N.info`
```
COMMAND=N
TYPE=DOOR
DOORTYPE=XIM
LOCATION=doors/AquaScan/AquaScan.020
DESCRIPTION=New Files Scan
SECURITY=10
ARGS=S U
```

**Supported Door Types:**
- **XIM** - XPR Interface Module (most common)
- **TIM** - Text Interface Module
- **SIM** - Serial Interface Module
- **AIM** - Amiga Interface Module
- **MCI** - MCI door (screen-based)
- **AREXX** - ARexx scripts
- **SDK** - TypeScript SDK doors

### Testing Doors

```bash
# Test 68K door directly
cd web/backend
npx tsx src/scripts/run-amiga-door.ts doors/AquaScan/AquaScan.020 1

# Test SDK door
cd sdk/doors/livechat
npm run dev
```

---

## Maintenance Tasks

### Daily Maintenance

**Automated Tasks (batch scheduler):**
- User session cleanup
- Message base maintenance
- File area updates
- Log rotation

**Manual Tasks:**
```bash
# View active users
# Admin Panel → Who's Online

# Check system logs
tail -f logs/backend.log

# Monitor disk space
df -h
du -sh data/
```

### Database Maintenance

**Backup Database:**
```bash
# Automated backup (recommended - see PRODUCTION_DEPLOYMENT.md)
./scripts/backup-bbs.sh

# Manual backup
cp data/amiexpress.db data/amiexpress.db.backup-$(date +%Y%m%d)
```

**Optimize Database:**
```bash
cd web/backend
npx tsx -e "
const db = require('better-sqlite3')('./data/amiexpress.db');
db.pragma('optimize');
db.pragma('vacuum');
db.close();
console.log('Database optimized');
"
```

**Check Database Integrity:**
```bash
sqlite3 data/amiexpress.db "PRAGMA integrity_check;"
```

### Log Management

**Log Locations:**
```
logs/backend.log      - Backend operations
logs/frontend.log     - Frontend errors
logs/access.log       - HTTP access log
logs/error.log        - HTTP error log
logs/xim-debug.log    - Door protocol debug
logs/door-68k-*.log   - Individual door logs
```

**Rotate Logs:**
```bash
# Archive old logs
mkdir -p logs/archive
mv logs/*.log logs/archive/
gzip logs/archive/*.log

# Or use logrotate (Linux)
sudo nano /etc/logrotate.d/amiexpress-web
```

**Example logrotate config:**
```
/path/to/amiexpress-web/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 username username
    sharedscripts
    postrotate
        /usr/bin/killall -HUP node
    endscript
}
```

### File Area Maintenance

**Check for Orphaned Files:**
```bash
# Files in Dir* without database entries
cd web/backend
npx tsx src/scripts/check-file-areas.ts
```

**Rebuild File Indexes:**
```bash
# Scan all file areas and update database
cd web/backend
npx tsx src/scripts/rebuild-file-index.ts
```

### User Cleanup

**Remove Inactive Users:**
```bash
# Find users inactive for 90+ days
# Admin Panel → Users → Filter → Last Login > 90 days
# Review and delete as needed

# Or via database:
sqlite3 data/amiexpress.db "
SELECT username, lastLogin FROM users
WHERE lastLogin < datetime('now', '-90 days')
ORDER BY lastLogin;
"
```

---

## Troubleshooting

### Common Issues

#### Users Can't Login

**Check:**
1. Database file exists and is writable
2. User account status is "Active"
3. Password is correct (reset if needed)
4. Security level allows login
5. Check logs: `tail -f logs/backend.log`

**Fix:**
```bash
# Reset user password
# Admin Panel → Users → Find User → Reset Password

# Or via database (username: testuser)
sqlite3 data/amiexpress.db
UPDATE users SET passwordHash = NULL WHERE username = 'testuser';
.quit
```

#### Door Won't Start

**Check:**
1. Door binary exists and is executable
2. .info file is correctly formatted
3. DOORTYPE matches door implementation
4. Door not already running (check processes)
5. Check door logs: `logs/door-68k-*`

**Fix:**
```bash
# Verify door file
ls -la doors/AquaScan/
file doors/AquaScan/AquaScan.020

# Check XIM debug logs
tail -f logs/xim-debug.log

# Test door directly
cd web/backend
npx tsx src/scripts/run-amiga-door.ts doors/AquaScan/AquaScan.020 1
```

#### Database Locked

**Cause:** Multiple processes accessing database simultaneously

**Fix:**
```bash
# Find processes using database
lsof data/amiexpress.db

# Kill zombie processes
pkill -f "tsx.*run-amiga-door"
pkill -f "node.*backend"

# Restart BBS
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

#### High Memory Usage

**Check:**
```bash
# Monitor processes
docker stats amiexpress-production

# Or without Docker
ps aux | grep node | awk '{print $2, $4, $11}'
```

**Fix:**
```bash
# Increase Node.js memory limit
# In .env.local:
NODE_OPTIONS="--max-old-space-size=2048"

# Restart BBS
```

#### Port Already in Use

**Check:**
```bash
# Find process using port 3001
lsof -i :3001
netstat -tlnp | grep 3001

# Or for telnet (2323)
lsof -i :2323
```

**Fix:**
```bash
# Kill process using port
kill <PID>

# Or change port in .env.local
BACKEND_PORT=3002
```

---

## Common Operations

### Backup and Restore

**Full Backup:**
```bash
# Backup script (recommended)
./scripts/backup-bbs.sh

# Manual full backup
tar czf bbs-backup-$(date +%Y%m%d).tar.gz \
  data/ \
  Bulletins/ \
  Screens/ \
  Conf*/ \
  doors/ \
  Commands/
```

**Restore from Backup:**
```bash
# Stop BBS
./dev/scripts/kill-servers.sh

# Restore
tar xzf bbs-backup-20260104.tar.gz

# Restart BBS
./dev/scripts/start-servers.sh
```

### Upgrade BBS

```bash
# Backup first!
./scripts/backup-bbs.sh

# Pull latest changes
git pull origin main

# Update dependencies
cd web/backend && npm install
cd ../frontend && npm install

# Run migrations (if any)
npx tsx src/scripts/migrate-database.ts

# Restart
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

### Monitor Active Users

**Via Admin Panel:**
- Admin Panel → Who's Online
- Shows: Username, Node, Activity, Time Connected

**Via Command Line:**
```bash
# Check node status
ls -la Node*/

# View session files
cat Node1/node1.user
```

### Broadcast Message to All Users

**Via Admin Panel:**
- Admin Panel → Broadcast Message
- Enter message text
- Click Send

**Via Telnet (as sysop):**
```
/sysop
/broadcast Hello everyone! System maintenance in 5 minutes.
```

### Export Data

**Export Users:**
```bash
cd web/backend
npx tsx src/scripts/export-users.ts --format csv --output users.csv
```

**Export Messages:**
```bash
npx tsx src/scripts/export-messages.ts --conference 1 --output messages.txt
```

**Export for Migration:**
```bash
# Export in Amiga format for migration to another BBS
npx tsx src/scripts/export-to-amiga.ts --output amiga-export/
```

---

## Additional Resources

- **Production Deployment:** See `PRODUCTION_DEPLOYMENT.md`
- **Security:** See `SECURITY_AUDIT.md`
- **User Guide:** See `Documentation/1-Users/USER_GUIDE.md`
- **Door Development:** See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`
- **Architecture:** See `Documentation/3-Developers/ARCHITECTURE.md`

---

## Support and Community

- **GitHub Issues:** Report bugs and request features
- **Discord:** Join the community (link in README)
- **Email:** sysop@yourbbs.example.com

---

**Last Updated:** 2026-01-04
**Version:** 1.0
**License:** See project LICENSE file
