# Sysop Quick Start Guide

Get your AmiExpress BBS up and running.

---

## Table of Contents

1. [Install](#install)
2. [Create the sysop account](#create-the-sysop-account)
3. [First Login](#first-login)
4. [Essential Configuration](#essential-configuration)
5. [Import Existing BBS](#import-existing-bbs-optional)
6. [Next Steps](#next-steps)
7. [Troubleshooting](#troubleshooting)

---

## Install

Docker Compose is the supported way to run a board. The steps, the ports and
the Kickstart ROM are in the repository [README](../../README.md#quick-start-with-docker-compose)
and in [DOCKER.md](./DOCKER.md). Server deployment (firewall, TLS, the deploy
scripts) is in [DEPLOYMENT.md](./DEPLOYMENT.md) and
[deploy/README.md](../../deploy/README.md).

For development without Docker, see "Local development" in the README.

---

## Create the sysop account

A fresh board has no accounts. While it has no sysop, the board prints a
one-time setup code in the server log at every start:

```bash
docker compose logs | grep "Setup code"
# [SETUP] Setup code: ABCD-EFGH
```

(Without Docker, the code is in the console of `./dev/scripts/start-servers.sh`.)

1. Connect: web terminal at `http://localhost:3001/`, or `telnet localhost 64128`,
   or SSH on port 31337. The logon screen says the board has no sysop yet.
2. At the name prompt, type the sysop name you want.
3. Answer `C` to create the account.
4. Enter the setup code. Case and the dash do not matter.
5. Finish the normal registration (privacy notice, location, email, password).

That account gets security level 255 and the setup code stops working; the
next caller to register is an ordinary user. A wrong code disconnects the
caller and creates nothing, so a stranger who reaches the board first cannot
take it. A restart before setup makes a new code.

The BBS name and the other board settings are set in the admin afterwards.
The time zone is the `BBS_TIMEZONE` setting in `.env` (restart to apply).

---

## First Login

Log in with the sysop account you created:

- Web Terminal: `http://localhost:3001/`
- Admin Panel: `http://localhost:3001/admin/`
- SDK Preview: `http://localhost:3001/sdk/`
- Telnet: `telnet localhost 64128`
- SSH: `ssh -p 31337 <your sysop name>@localhost`

On a public server, replace `localhost` with your host name.

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
nano data/bbs/Screens/MENU.TXT

# Login screen
nano data/bbs/Screens/LOGON.TXT

# Bulletin board
nano data/bbs/Screens/BBSTITLE.TXT
```

**Use ANSI codes or plain ASCII art**

### 5. Create Bulletins

```bash
# Create today's bulletin
nano data/bbs/Conf01/Bulletins/$(date +%Y%m%d)_WELCOME.TXT
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

**Full guide**: [AMIGA_MIGRATION_GUIDE.md](./AMIGA_MIGRATION_GUIDE.md)

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
- Back up the `bbs-data` volume (see [BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md))
- Sync the copies to S3, Dropbox or Google Drive
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
- Port already in use: change the ports in `.env`
- Database locked → Kill zombie processes: `./dev/scripts/kill-servers.sh`
- Missing dependencies → Run: `cd web/backend && npm install`

### Can't Login as Admin

- No sysop account yet (setup never finished): the server log shows a
  `[SETUP] Setup code` line. Follow [Create the sysop account](#create-the-sysop-account).
  A restart prints a fresh code.
- A sysop exists but its password is lost, and the account has no email
  address (or the board sends no mail): use the one-time reset code.
  1. Add `SYSOP_PASSWORD_RESET=1` to `.env` and restart the board
     (`docker compose up -d`).
  2. Read the code from the log:
     `docker compose logs | grep "reset code"`
     (`[SETUP] Sysop password reset code: ABCD-EFGH`).
  3. Log in with the sysop name and type a wrong password three times.
  4. At `Reset code:`, enter the code (case and the dash do not matter),
     then type the new password twice.
  5. Remove `SYSOP_PASSWORD_RESET` from `.env` and restart.

  The code works once, and only for an account at level 200 or higher. A
  wrong code disconnects the caller and changes nothing. A sysop with an
  email address on a board that sends mail can use the emailed reset code
  instead, without the setting. A database edit alone does not help: the
  board takes accounts and access levels from its user files.

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
# Set CORS_ORIGINS in .env to your public URL (comma separated)
```

**Behind a reverse proxy:**
- Check that WebSocket upgrade headers are passed through

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
- Door Development: [DOOR_DEVELOPMENT.md](../4-Door-Developers/DOOR_DEVELOPMENT.md)
- Architecture: [ARCHITECTURE.md](../3-Developers/ARCHITECTURE.md)

**Scripts:**
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
- Web Terminal: `http://localhost:3001/`
- Admin Panel: `http://localhost:3001/admin/`
- SDK Preview: `http://localhost:3001/sdk/`
- Telnet: `telnet localhost 64128`
- SSH: `ssh -p 31337 user@localhost`

**Logs:**
- Backend: `logs/backend.log`
- SDK Preview: `logs/preview.log`

---

## Welcome to the BBS Community!

You're now part of a vibrant community keeping the BBS tradition alive. Enjoy building your community, sharing files, hosting games, and connecting people the classic way!

**Happy SysOpping!**

---

*Last Updated: 2025-11-13*
*Version: 1.0*

---

## Merged from System Administration Guide (Summary)

### 1. Daily Tasks
- Monitor call time limits, uploads, and downloads through the dashboard and the `/logs` directory; the system logs `upload.log`, `download.log`, and door output in `logs/door-68k.log` and `/tmp/*.out`.
- Review `bbsConfig.info` and security levels when granting access—levels still obey express.e bitmasks so sysops can open or lock conferences using the classic flags.
- Use `ADMIN` commands (most accessible through `S` for status, `M` for message overview) to confirm node counts, door statuses, and user reports.


### 2. File & Door Management
- When new files arrive, the BBS ensures each conference has a `Dir1` (or `DirX`) file; missing files are created with safe defaults so doors like AquaScan can read them 1:1.
- Use `FR` and `FM` commands to verify ASCII logos, file sizes, and flag bits; art lines are kept in the 33-char continuation block to match the classic look.
- For door runs, the log lives in `/logs/door-68k.log`, `/tmp/bulls.out`, and the harness output from `node web/backend/dist/scripts/run-amiga-door.js Doors/AquaScan/AquaScan.000 <node> <command>`.


### 3. Automation & Webhooks
- Configure deployment webhooks from `archive/WEBHOOK_INTEGRATION.md` to trigger node restarts or sync tasks; the same hooks feed `archive/SYSOP_WEBHOOK_GUIDE.md` where each hook maps to commands.
- Use `archive/DEPLOYMENT_SCRIPTS.md` to run sequential server start/stop scripts and capture telemetry.
- For automated imports/exports, monitor the `uploads/` directory and check log output for `Upload session invalid` errors; logs now capture more context so you can trace the root cause of missing DIR files exactly as express.e would.


### 4. Troubleshooting & Support
- When the BBS complains `Couldn't Open DirFile!` or `Upload session invalid`, confirm that the conference directories (`Conf1/Conf2/...`) exist and that `Dir1` file is present; the code now auto-creates them if missing.
- Validate door parsing issues (double line breaks, pauses) by reviewing the door logs and the `DEBUG_XIM_OUTPUT=1` harness flag.
- For misaligned ASCII or missing screens, compare to original express.e screen files preserved in `Screens/` and `~/Code/Reference/petscii-bbs-2.1/`.

**Sysops can find scripts, diagnostics, and advanced automation outlines in the archive folder; today’s summary keeps operations compact while referencing those resources.**

---

## Merged from Troubleshooting Guide (Summary)

### 1. Fresh Install Issues
- **Missing Dir Files**: When FR complains or doors fail because `Dir1`/`DirX` are absent, the server now auto-creates them. If you still see `Couldn't Open DirFile!`, inspect the conference directories for permission issues and check the `logs/backend.log` entry that notes the creation failure.
- **Upload Session Invalid**: Happens when the `upload` directory is missing or the session cookie expires. Confirm `storage/uploads/sessions` is writable and that the upload form's `sessionToken` matches the backend.


### 2. Door & FR Problems
- **Double Outputs/Line Breaks**: Old logs show ASCII art being appended twice; now the parser flags art lines and keeps them in the continuation block. To debug, enable `DEBUG_XIM_OUTPUT=1` and inspect `/tmp/*door*.log` and `logs/door-68k.log` for FR prompts.
- **Pauses Too Late**: The door now respects the user’s terminal height from their profile; verify the `users` table fields `screenHeight` and `pauseAfterLines` contain valid numbers.
- **ASCII Logos Trimmed**: If logos wrap early, ensure the `DirX` entry includes a `33-spaces` continuation block; the new parser stores art lines there.


### 3. Server & Networking
- **npm Access**: If `npx` fails due to `ENOTFOUND registry.npmjs.org`, check your network firewall or temporary offline caches; consider setting `npm config set registry https://registry.npmjs.org/` and ensure DNS resolves.
- **Homebrew `ps` Permission**: macOS Catalina+ may block `/bin/ps`; use `sudo` or disable restricted shell environment for `homebrew environ` scripts.


### 4. Logs & Diagnostics
- Always read `logs/backend.log` first—per the AGENT instructions. Follow it with `logs/door-68k.log` and `/tmp/bulls.out` whenever a door run fails.
- Additional per-run captures are stored via `node web/backend/dist/scripts/run-amiga-door.js ...`; the harness now outputs more context, including missing screen files and debug lines.

**Need more help?** Review the archived issue reports (`AQUASCAN_ROOT_CAUSE.md`, `AQUASCAN_SOLUTION.md`) or re-run the door manually with extra logging to preserve the output for future analysis.
