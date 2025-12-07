# Database vs Disk Storage Audit

## Executive Summary

AmiExpress on Amiga stored EVERYTHING on disk (no SQL database). We're using SQLite for some things. This audit identifies what MUST be on disk vs what CAN be in database.

## CRITICAL ISSUES FOUND

### 1. MESSAGES - BROKEN (DATABASE ONLY)
**Status**: CRITICAL BUG
**Location**: `web/backend/src/handlers/message-entry.handler.ts:356`
**Problem**: Messages saved ONLY to database, NOT to disk as .msg files
**Impact**: Doors that read messages will find NOTHING
**Evidence**:
- `Conf2/Messages/` exists on disk with old .msg files
- New messages go to database table `messages` only
- No code writes .msg files to `Conf{N}/Messages/` directories

**Fix Required**: Write messages to BOTH:
1. Database (for web UI, stats, search)
2. Disk as .msg files (for doors, AREXX scripts, QWK packets)

---

### 2. FILE ENTRIES - PARTIALLY FIXED
**Status**: FIXED (just now)
**Location**: `web/backend/src/handlers/download.handler.ts`
**Problem**: Download search preferred database, then searched wrong directory
**Fix Applied**:
- Removed database search preference
- Now searches `Conf{N}/Files/` directory on disk ONLY
- File listings already read from DIR files correctly

---

### 3. USERS - ACCEPTABLE (DATABASE ONLY)
**Status**: OK
**Reasoning**:
- Doors get user data via XIM protocol (DT_* commands)
- XIM reads from session object in memory (loaded from database)
- Doors NEVER directly access user files
- Original AmiExpress had binary UserData files - we don't need them
- Web authentication requires database anyway

**Evidence**:
- XIM data-query.ts serves all user data to doors
- No doors directly read user files
- Import/export can handle Amiga UserData files when needed

---

### 4. CONFERENCES - ACCEPTABLE (DATABASE + .info files)
**Status**: OK
**Current State**:
- Conference metadata in database
- Conference .info files on disk (Conf1.info, Conf2.info, etc.)
- Doors read .info files via AmigaOS icon.library emulation

---

### 5. FILE AREAS - PROBLEMATIC
**Status**: SHOULD NOT USE DATABASE
**Problem**: `file_areas` table exists but shouldn't be primary source
**Correct Approach**:
- Conference .info files define directory count (NDIRS)
- DIR files on disk are source of truth (DIR1, DIR2, etc.)
- Database file_areas table should be DERIVED from disk, not authoritative

---

## WHAT DATABASE SHOULD STORE

### Legitimate Database Use Cases

1. **Authentication & Sessions**
   - JWT tokens, refresh tokens
   - Active sessions (multi-node tracking)
   - Password hashes (bcrypt)
   - WebSocket session state

2. **Statistics & Accounting**
   - User upload/download byte counts
   - Conference upload/download stats
   - Daily stats, caller activity
   - Mail stats

3. **Web UI Features**
   - Chat rooms (chat_rooms, chat_messages)
   - Webhooks (Discord/Slack notifications)
   - Online messages (inter-node chat history)
   - Vote system (polls/voting)
   - Command history

4. **Configuration Cache**
   - System config (parsed from .info files)
   - Node config (parsed from Node.info files)
   - Conference config (parsed from Conf.info files)
   - Protocol definitions

5. **Audit Logging**
   - Config changes (config_audit_log)
   - Caller activity logs
   - System logs

---

## WHAT MUST BE ON DISK

### Critical Disk Files (Doors Expect These)

1. **Messages** - `Conf{N}/Messages/{messageId}.msg`
   - Plain text message files
   - Doors read these directly
   - QWK packets generated from these
   - AREXX scripts access these

2. **Files** - `Conf{N}/Files/{filename}`
   - Actual uploaded files
   - Doors scan these directories
   - Users download from here

3. **DIR Files** - `Conf{N}/DIR1`, `Conf{N}/DIR2`, etc.
   - File listings in AmiExpress format
   - Doors like AquaScan read these
   - Format: filename, size, date, description

4. **NumULs** - `Conf{N}/NumULs`
   - File count for conference
   - Doors query this via DT_NAME

5. **Configuration** - `*.info` files
   - Conf1.info, Conf2.info (conference config)
   - Node.info (node configuration)
   - Command .info files in Commands/BBSCmd/, Commands/SysCmd/

6. **HOLD/LCFILES** - Special directories
   - `Conf{N}/HOLD/` - Files awaiting sysop approval
   - `Conf{N}/HOLD/HELD` - Count of held files
   - `Conf{N}/LCFILES/` - Lost carrier files

7. **Screens** - `Screens/*.txt`
   - ANSI/ASCII screen files
   - MENU.TXT, LOGON.TXT, etc.

8. **Bulletins** - `Bulletins/*.txt`
   - Daily bulletins, changelogs

9. **SysopStats** - `SysopStats/NumULs_{confId}`
   - Upload statistics per conference
   - Normal vs HOLD counts

---

## DUAL STORAGE (Database AND Disk)

Some data should exist in BOTH places:

### Messages
- **Disk**: Individual .msg files for doors/QWK
- **Database**: For fast search, web UI, threading

### File Entries
- **Disk**: DIR files for doors, actual files in Files/
- **Database**: For stats tracking (download counts, ratings)

### User Data
- **Memory/Database**: Active session data
- **XIM Protocol**: Doors get data via DT_* commands
- **Optional Disk**: Can export to Amiga UserData format

---

## CURRENT TABLES - VERDICT

| Table | Keep? | Purpose |
|-------|-------|---------|
| users | YES | Auth, stats, web UI |
| sessions | YES | Multi-node session tracking |
| user_sessions | YES | Login history |
| user_stats | YES | Per-user accounting |
| conferences | YES | Metadata cache |
| message_bases | YES | Message area definitions |
| **messages** | **YES BUT BROKEN** | **MUST ALSO WRITE TO DISK** |
| file_areas | MAYBE | Should be derived from DIR files |
| **file_entries** | **MAYBE** | **Stats only, NOT source of truth** |
| flagged_files | YES | User-specific flagged file list |
| bulletins | YES | Bulletin metadata/search |
| webhooks | YES | Discord/Slack integration |
| chat_* | YES | Multi-user chat system |
| online_messages | YES | Inter-node messaging |
| vote_* | YES | Voting/poll system |
| mail_stats | YES | QWK mail statistics |
| caller_activity | YES | Caller logs |
| daily_stats | YES | Usage statistics |
| protocols | YES | File transfer protocols |
| command_history | YES | User command history |

---

## FIXES NEEDED

### IMMEDIATE (CRITICAL)

1. **Fix message saving** - Write to Conf{N}/Messages/ as .msg files
2. **Fix message reading** - Read from .msg files, use database for search/index only
3. **Verify file_entries** - Ensure not used as source of truth for downloads

### SHORT TERM

1. **Message threading** - Use .msg files as source, database for pointers
2. **File area sync** - Scan DIR files to populate database, not vice versa
3. **QWK generation** - Read messages from disk, not database

### LONG TERM

1. **Conference sync** - Parse .info files to update database
2. **User export** - Support exporting to Amiga UserData format
3. **Import validation** - Verify disk files match database after import

---

## TESTING CHECKLIST

- [ ] Messages written to Conf{N}/Messages/ as .msg files
- [ ] Doors can read messages from disk
- [ ] Files downloadable from Conf{N}/Files/
- [ ] AquaScan finds files in DIR files
- [ ] NumULs updated on upload
- [ ] XIM DT_* commands return correct data
- [ ] QWK packets include all messages
- [ ] AREXX scripts can access messages

---

## CONCLUSION

**Database is a CACHE and WEB UI HELPER, not the source of truth.**

Doors expect everything on disk in AmiExpress format. We MUST maintain disk files as the primary data store for anything doors access.

Database provides:
- Fast search/indexing
- Web authentication
- Real-time stats
- Multi-user features (chat, webhooks)

But NEVER as the only copy of critical BBS data.
