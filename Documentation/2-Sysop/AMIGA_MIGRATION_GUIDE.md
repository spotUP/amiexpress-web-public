# Amiga BBS to AmiExpress-Web Migration Guide

**Last Updated:** 2026-01-04
**Audience:** Amiga BBS Sysops migrating to AmiExpress-Web
**Prerequisites:** Running Amiga BBS (AmiExpress, C-Net, Excelsior, etc.)

---

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Data Export from Amiga](#data-export-from-amiga)
4. [Data Import to AmiExpress-Web](#data-import-to-amiexpress-web)
5. [Configuration Migration](#configuration-migration)
6. [Door Migration](#door-migration)
7. [Testing and Validation](#testing-and-validation)
8. [Cutover Strategy](#cutover-strategy)
9. [Post-Migration Tasks](#post-migration-tasks)
10. [Troubleshooting](#troubleshooting)

---

## Migration Overview

### What Gets Migrated

**Fully Supported:**
- ✅ User accounts (User.data, User.keys, User.misc)
- ✅ Messages (all conferences and message bases)
- ✅ File descriptions and metadata
- ✅ Conference structure
- ✅ Bulletins and screens
- ✅ Command configurations (.info files)
- ✅ Most 68K doors (via MOIRA emulation)

**Partially Supported:**
- ⚠️ File areas (structure preserved, paths may need adjustment)
- ⚠️ ARexx scripts (may need adaptation)
- ⚠️ Custom modifications (case-by-case basis)

**Not Supported:**
- ❌ Amiga-specific hardware features (modems, serial ports)
- ❌ Direct filesystem access (security restriction)
- ❌ Some door types (IIM, custom protocols)

### Migration Timeline

**Typical Migration:**
- Small BBS (< 100 users): 4-8 hours
- Medium BBS (100-1000 users): 1-2 days
- Large BBS (1000+ users): 2-5 days

**Phases:**
1. **Planning & Backup** (1-2 hours)
2. **Data Export** (1-4 hours)
3. **Setup AmiExpress-Web** (2-4 hours)
4. **Data Import** (1-8 hours depending on size)
5. **Configuration** (2-4 hours)
6. **Testing** (2-8 hours)
7. **Cutover** (1-2 hours)

---

## Pre-Migration Checklist

### Amiga BBS Preparation

**1. Create Full Backup:**
```
// On Amiga
LHEX >RAM:backup.lha BBS: ALL QUIET
COPY RAM:backup.lha DF1:
```

**2. Document Current Configuration:**
- BBS name and sysop info
- Number of nodes
- Conference structure
- Door list (with versions)
- File area layout
- Custom modifications

**3. Verify Data Integrity:**
```
// Check user file
TYPE User.data
DIR User.data

// Check message bases
DIR Conf#?/Messages

// Check file areas
DIR Conf#?/Files
```

**4. Export Critical Data:**
See [Data Export from Amiga](#data-export-from-amiga) section

### AmiExpress-Web Preparation

**1. Set Up Server:**
- Linux/macOS server (or WSL2 on Windows)
- Node.js 18+
- Docker (optional but recommended)
- Sufficient disk space (2x Amiga BBS size minimum)

**2. Install AmiExpress-Web:**
```bash
git clone https://github.com/yourusername/amiexpress-web.git
cd amiexpress-web
cd web/backend && npm install
cd ../frontend && npm install
```

**3. Configure Environment:**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

---

## Data Export from Amiga

### Method 1: Amiga Filesystem Access (Recommended)

**Requirements:**
- Amiga emulator (WinUAE, FS-UAE)
- Or physical Amiga with network share
- Or Amiga disk image mounted on modern system

**Export Process:**

**1. Mount Amiga Disk:**
```bash
# On Linux with FS-UAE
mkdir -p /mnt/amiga
# Mount .adf or .hdf image
```

**2. Copy BBS Directory:**
```bash
# Copy entire BBS directory
cp -r /mnt/amiga/BBS /path/to/export/BBS

# Or via network (if Amiga has network card)
smbclient //amiga/BBS -U guest
```

### Method 2: Serial Transfer

**For Physical Amiga without Network:**

**1. Install Serial Transfer Tool:**
- ZModem
- XModem
- Or Amiga-to-PC serial cable software

**2. Transfer Files:**
```
// On Amiga
SEND User.data ZMODEM
SEND User.keys ZMODEM
SEND User.misc ZMODEM

// Repeat for each critical file
```

### Method 3: Archive Export

**Create Single Archive:**

```
// On Amiga
CD BBS:
LHEX >RAM:export.lha User.data User.keys User.misc Conf#? ALL QUIET
COPY RAM:export.lha DF1:export.lha
```

Transfer .lha file to modern system, then extract:
```bash
# On modern system
sudo apt-get install lhasa
lha x export.lha
```

### Critical Files to Export

**User Data:**
```
User.data    - User accounts (232 bytes per user)
User.keys    - User encryption keys (56 bytes per user)
User.misc    - User preferences (248 bytes per user)
```

**Messages:**
```
Conf1/Messages/   - Conference 1 messages
Conf2/Messages/   - Conference 2 messages
...
Conf14/Messages/  - Conference 14 messages
```

**Files:**
```
Conf1/Files/      - Conference 1 file areas
Conf2/Files/      - Conference 2 file areas
...
```

**Configuration:**
```
bbsConfig.info    - Main BBS configuration
ConfConfig.info   - Conference configuration
Commands/BBSCmd/  - BBS command .info files
Commands/SysCmd/  - Sysop command .info files
doors/            - Door programs
```

**Screens:**
```
BBS/Screens/      - Global screens
Node0/Screens/    - Node 0 screens
```

**Bulletins:**
```
BBS/Bulletins/    - Bulletin files
```

---

## Data Import to AmiExpress-Web

### Automated Import Tool

**Location:** `web/backend/src/scripts/import-from-amiga.ts`

**Basic Usage:**
```bash
cd web/backend

# Import everything
npx tsx src/scripts/import-from-amiga.ts \
  --all /path/to/amiga/export

# Or import selectively
npx tsx src/scripts/import-from-amiga.ts \
  --users /path/to/User.data \
  --messages /path/to/Conf1/Messages \
  --files /path/to/Conf1/Files \
  --config /path/to/bbsConfig.info
```

### Step-by-Step Import

**1. Import User Accounts:**

```bash
npx tsx src/scripts/import-from-amiga.ts \
  --users /path/to/User.data \
  --user-keys /path/to/User.keys \
  --user-misc /path/to/User.misc
```

**Expected Output:**
```
[IMPORT] Parsing User.data (68K aligned, big-endian)
[IMPORT] Found 250 user records
[IMPORT] Importing user 1/250: JohnDoe
[IMPORT] Importing user 2/250: JaneSmith
...
[IMPORT] Successfully imported 250 users
[IMPORT] Failed: 0
```

**2. Import Messages:**

```bash
# Import all conferences
for conf in /path/to/Conf*/Messages; do
  confnum=$(echo $conf | grep -oP 'Conf\K\d+')
  npx tsx src/scripts/import-from-amiga.ts \
    --messages $conf \
    --conference $confnum
done
```

**3. Import Files:**

```bash
# Import file metadata (not actual files - copy separately)
for conf in /path/to/Conf*/Files; do
  confnum=$(echo $conf | grep -oP 'Conf\K\d+')
  npx tsx src/scripts/import-from-amiga.ts \
    --files $conf \
    --conference $confnum
done

# Copy actual files
cp -r /path/to/Conf*/Files ./Conf*/Files/
```

**4. Import Configuration:**

```bash
npx tsx src/scripts/import-from-amiga.ts \
  --config /path/to/bbsConfig.info \
  --conf-config /path/to/ConfConfig.info
```

### Validation

**Verify Import:**

```bash
# Check user count
sqlite3 data/amiexpress.db "SELECT COUNT(*) FROM users;"

# Check message count
sqlite3 data/amiexpress.db "SELECT COUNT(*) FROM messages;"

# Check conference configuration
sqlite3 data/amiexpress.db "SELECT * FROM conferences;"

# List imported users
sqlite3 data/amiexpress.db "SELECT username, realName, securityLevel FROM users LIMIT 10;"
```

---

## Configuration Migration

### BBS Settings

**Manual Configuration (if automated import doesn't work):**

1. **Access Admin Panel:** http://localhost:3001/admin
2. **Login as sysop**
3. **System Config → BBS Information:**
   - BBS Name
   - Sysop Name
   - Location
   - Phone (optional in web version)

4. **System Config → Security:**
   - New User Security Level
   - Max Password Fails
   - Allow New Users

5. **Node Config:**
   - Set number of nodes (web version supports 1-8)
   - Configure node-specific settings

### Conference Configuration

**Option 1: Automated (via import tool)**
```bash
npx tsx src/scripts/import-from-amiga.ts \
  --conf-config /path/to/ConfConfig.info
```

**Option 2: Manual (Admin Panel)**

For each conference:
1. Admin Panel → Conferences → Add Conference
2. Configure:
   - Number (1-14)
   - Name
   - Description
   - Security Level
   - Conference Sysop
3. Save

### Screen Files

**Copy Screen Files:**

```bash
# Global screens
cp /path/to/amiga/BBS/Screens/*.TXT ./Screens/
cp /path/to/amiga/BBS/Screens/*.SEQ ./Screens/

# Node screens
cp /path/to/amiga/Node0/Screens/* ./Node0/Screens/
```

**Critical Screen Files:**
```
BBSTITLE.TXT  - BBS title screen
LOGON.TXT     - Post-login screen
MENU.TXT      - Main menu
GOODBYE.TXT   - Logoff screen
```

**Note:** AmiExpress-Web supports original Amiga screen files with MCI codes.

### Bulletin Migration

```bash
# Copy bulletins
cp /path/to/amiga/BBS/Bulletins/*.txt ./Bulletins/

# Verify bulletins exist
ls -la Bulletins/bull*.txt
```

---

## Door Migration

### 68K Door Compatibility

**Supported Door Types:**
- **XIM** (XPR Interface Module) - ✅ Full support via MOIRA
- **TIM** (Text Interface Module) - ✅ Full support
- **SIM** (Serial Interface Module) - ✅ Full support
- **MCI** (Menu Command Interface) - ✅ Full support
- **AREXX** - ✅ Supported (may need minor adjustments)
- **AIM** (Amiga Interface Module) - ⚠️ Partial support
- **IIM** (Intuition Interface Module) - ❌ Not supported (GUI-based)

### Door Migration Process

**1. Copy Door Binaries:**

```bash
# Copy door directory
cp -r /path/to/amiga/doors ./doors/

# Verify doors copied
ls -la doors/
```

**2. Copy Door .info Files:**

```bash
# Copy door info files
cp /path/to/amiga/doors/*/*.info ./doors/*/

# Verify
ls -la doors/*/*.info
```

**3. Copy Command Files:**

```bash
# Copy door command definitions
cp /path/to/amiga/Commands/BBSCmd/*.info ./Commands/BBSCmd/
cp /path/to/amiga/Commands/SysCmd/*.info ./Commands/SysCmd/
```

**4. Test Each Door:**

```bash
# Test door execution
cd web/backend
npx tsx src/scripts/run-amiga-door.ts doors/AquaScan/AquaScan.020 1

# Check logs
tail -f logs/door-68k-*.log
```

### Common Door Issues

**Issue 1: Door Won't Start**

**Symptoms:** Door exits immediately or hangs

**Check:**
```bash
# Verify door file exists and is executable
file doors/AquaScan/AquaScan.020

# Check door type in .info file
cat doors/AquaScan/AquaScan.info
```

**Fix:**
- Ensure DOORTYPE matches door implementation (XIM/TIM/SIM)
- Verify door binary is not corrupted
- Check logs for error messages

**Issue 2: Door Crashes**

**Symptoms:** "Illegal instruction" or memory access errors

**Check:**
```bash
# Enable debug logging
export DEBUG_68K=1
npx tsx src/scripts/run-amiga-door.ts doors/MyDoor/mydoor 1
```

**Fix:**
- Update door to latest version
- Check if door requires specific libraries
- Report issue with debug logs

**Issue 3: ARexx Door Needs Adjustment**

**Common Changes:**
```
// Amiga ARexx
ADDRESS 'AESERVER'
'WRITELN "Hello"'

// AmiExpress-Web ARexx
ADDRESS AESERVER
WRITELN("Hello")
```

See `Documentation/4-Door-Developers/AREXX_GUIDE.md` for full ARexx port details.

### SDK Door Migration

**For Doors Being Ported to TypeScript:**

1. Create new SDK door:
```bash
cd sdk
npm run create-door
```

2. Port door logic from Amiga E/C to TypeScript
3. Use SDK APIs instead of direct Amiga system calls
4. Test with SDK preview tool

See `Documentation/4-Door-Developers/SDK_V2_COMPREHENSIVE.md` for SDK documentation.

---

## Testing and Validation

### Pre-Production Testing

**1. User Account Testing:**
```bash
# Login as various user types
# Test security levels
# Verify preferences preserved
```

**2. Message Testing:**
```bash
# Read messages in all conferences
# Post new messages
# Reply to messages
# Verify threading
```

**3. File Area Testing:**
```bash
# Browse files
# Download files
# Upload files
# Verify file descriptions
```

**4. Door Testing:**
```bash
# Test each door individually
# Verify door exit/return to menu
# Check for memory leaks (long sessions)
```

### Parallel Running

**Strategy:** Run both systems simultaneously during testing

**Amiga BBS:**
- Keep running on original hardware
- Use for production traffic
- Telnet port: 23 (or custom)

**AmiExpress-Web:**
- Run on test server
- Use for testing only
- Telnet port: 2323 (different from Amiga)

**Testing Period:** 1-2 weeks recommended

---

## Cutover Strategy

### Cutover Options

**Option 1: Hard Cutover (Recommended for Small BBS)**

**Process:**
1. Announce cutover date to users (1-2 weeks notice)
2. On cutover day:
   - Shut down Amiga BBS
   - Perform final data export
   - Import to AmiExpress-Web
   - Start AmiExpress-Web
   - Update DNS/port forwarding
3. Monitor for issues

**Downtime:** 1-4 hours

**Option 2: Gradual Migration (Recommended for Large BBS)**

**Process:**
1. Run both systems in parallel
2. Gradually move users to new system
3. Keep Amiga BBS read-only for reference
4. After 30 days, decommission Amiga BBS

**Downtime:** Minimal (a few minutes for DNS change)

### DNS and Port Forwarding

**Update DNS:**
```bash
# Old: Amiga IP
yourbbs.com → 192.168.1.100:23

# New: AmiExpress-Web server
yourbbs.com → your-new-server.com:2323
```

**Port Forwarding:**
- Forward port 2323 (telnet) to AmiExpress-Web
- Forward port 2222 (SSH) to AmiExpress-Web
- Forward port 80/443 (HTTP/HTTPS) to AmiExpress-Web

### User Communication

**Pre-Cutover Announcement:**
```
BULLETIN: BBS MIGRATION NOTICE

On [DATE], we will be migrating to a new BBS system!

What's Changing:
- New web-based access (https://yourbbs.com)
- Telnet still available (telnet yourbbs.com 2323)
- All user accounts and messages preserved
- All doors migrated

What's NOT Changing:
- Your username and password
- Your messages and files
- The BBS feel and experience

Downtime: Approximately 2 hours on [DATE] from [TIME]

Questions? Page the sysop or email sysop@yourbbs.com
```

---

## Post-Migration Tasks

### Immediate Tasks (Day 1)

**1. Monitor Logs:**
```bash
# Watch for errors
tail -f logs/backend.log
tail -f logs/error.log
```

**2. Test Critical Functions:**
- User login
- Message posting
- File downloads
- Door execution

**3. User Support:**
- Be available for user questions
- Monitor feedback
- Address issues quickly

### Short-Term Tasks (Week 1)

**1. Performance Tuning:**
- Monitor resource usage
- Optimize database if needed
- Adjust node limits if needed

**2. User Feedback:**
- Collect feedback from users
- Address common issues
- Update documentation based on feedback

**3. Documentation:**
- Update user guides with new features
- Create FAQ based on questions
- Update sysop procedures

### Long-Term Tasks (Month 1)

**1. Feature Additions:**
- Enable web-only features (web push notifications, etc.)
- Add new doors
- Customize look and feel

**2. Optimization:**
- Review and optimize file areas
- Clean up old/unused content
- Implement automation scripts

**3. Decommission Amiga:**
- Archive Amiga BBS data
- Preserve Amiga system for nostalgia
- Or donate to vintage computing community

---

## Troubleshooting

### Common Migration Issues

**Issue: User Passwords Don't Work**

**Cause:** Password format incompatibility

**Fix:**
```bash
# Reset passwords for affected users
# Admin Panel → Users → Reset Password

# Or bulk reset (users set new password on next login)
sqlite3 data/amiexpress.db "UPDATE users SET passwordHash = NULL;"
```

**Issue: Messages Import Incomplete**

**Cause:** Corrupted message files or encoding issues

**Fix:**
```bash
# Re-import with verbose logging
npx tsx src/scripts/import-from-amiga.ts \
  --messages /path/to/Messages \
  --verbose \
  --continue-on-error
```

**Issue: Doors Don't Load**

**Cause:** Missing dependencies or incorrect paths

**Fix:**
```bash
# Check door configuration
cat doors/MyDoor/MyDoor.info

# Verify paths
ls -la doors/MyDoor/

# Test door directly
npx tsx src/scripts/run-amiga-door.ts doors/MyDoor/MyDoor 1 --verbose
```

**Issue: File Downloads Fail**

**Cause:** File paths not updated

**Fix:**
```bash
# Update file paths in database
sqlite3 data/amiexpress.db
UPDATE file_entries SET path = REPLACE(path, '/old/path', '/new/path');
.quit
```

### Getting Help

**Resources:**
- Documentation: `Documentation/` folder
- GitHub Issues: https://github.com/yourusername/amiexpress-web/issues
- Discord Community: [link]
- Email Support: support@amiexpress-web.com

**When Reporting Issues:**
1. Describe what you were doing
2. Include error messages
3. Attach relevant log files
4. Specify Amiga BBS version you're migrating from
5. Include system details (OS, Node.js version, etc.)

---

## Success Stories

**Community feedback and migration experiences will be added here as they come in.**

---

**Good luck with your migration!**

**Last Updated:** 2026-01-04
**Version:** 1.0
**Maintainer:** AmiExpress-Web Development Team
