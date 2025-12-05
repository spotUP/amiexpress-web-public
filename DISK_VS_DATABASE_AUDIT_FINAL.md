# Final Disk vs Database Audit - December 2025

## Executive Summary

**Status**: PARTIALLY DISK-BASED - CRITICAL ISSUES REMAIN

AmiExpress on Amiga stored EVERYTHING on disk. We're using SQLite for some things. This audit verifies what's actually using disk vs database after the message-to-disk implementation.

## CRITICAL FINDINGS

### 1. MESSAGES - PARTIALLY FIXED ⚠️

**Writing**: ✅ FIXED
- Location: `web/backend/src/handlers/message-entry.handler.ts:358-371`
- NOW writes to disk FIRST: `Conf{N}/Messages/{msgNum}.msg`
- THEN writes to database (for web UI/search)
- Uses `message-file.util.ts` (315 lines)
- MailStats tracking implemented (binary format)

**Reading**: ❌ STILL BROKEN
- Location: `web/backend/src/handlers/message-scan.handler.ts:170`
- Location: `web/backend/src/handlers/messaging.handler.ts:75`
- CODE: `const messages = await _db.getMessages(confId, msgBaseId, ...)`
- **PROBLEM**: Message reading still goes to DATABASE, not disk
- **IMPACT**: Doors may read from disk, but BBS users see database messages only

**Fix Required**:
1. Modify `message-scan.handler.ts` to use `getAllMessageIds()` + `readMessageFile()`
2. Modify `messaging.handler.ts` to use `getAllMessageIds()` + `readMessageFile()`
3. Remove `_db.getMessages()` calls - use disk as source of truth

---

### 2. FILES - MIXED STATUS ⚠️

**File Listing (DIR files)**: ✅ CORRECT
- Uses: `dir-file-reader.util.ts` with `parseDirFile()`
- Reads from: `Conf{N}/DIR1`, `Conf{N}/DIR2`, etc.
- Location: `web/backend/src/handlers/file-listing.handler.ts`

**File Downloads**: ✅ CORRECT
- Uses: Direct filesystem access to `Conf{N}/Files/`
- Location: `web/backend/src/handlers/download.handler.ts:findFilesInConference()`
- Fixed in Session 46 - no longer searches database first

**File Uploads**: ✅ CORRECT
- Writes to: `Conf{N}/Files/` directory
- Updates: `Conf{N}/DIR{N}` files
- Location: `web/backend/src/utils/file-hold.util.ts`

**File Metadata**: ❌ PROBLEMATIC
- Location: `web/backend/src/handlers/display-file-commands.handler.ts:28`
- CODE: `const fileAreas = await _db.getFileAreas(conferenceId)`
- CODE: `const files = await _db.getFilesByArea(area.id)`
- **PROBLEM**: File area metadata from database, not .info files
- **CORRECT APPROACH**: Parse NDIRS from Conf.info, use DIR files as source

**File Maintenance**: ❌ DATABASE DEPENDENCIES
- Location: `web/backend/src/handlers/file-maintenance.handler.ts`
- CODE: `await _db.query('DELETE FROM file_entries WHERE id = $1'`
- CODE: `await _db.query('UPDATE file_entries SET areaid = $1'`
- **PROBLEM**: File operations update database, should only touch disk

---

### 3. USERS - ACCEPTABLE ✅

**Status**: OK (XIM Protocol)
- Doors get data via XIM protocol: `DT_NAME`, `DT_PASSWORD`, etc.
- XIM reads from session object (loaded from database at login)
- Location: `web/backend/src/amiga-emulation/xim/data-query.ts`
- Doors NEVER directly read user files
- Database authentication required for web access anyway

**Evidence**:
```typescript
case XIMCommand.DT_NAME:
  const username = user?.username || 'Guest';
  this.messageParser.writeString(stringAddr, username, 31);
```

No action required - this is the correct approach.

---

### 4. CONFERENCES - ACCEPTABLE ✅

**Status**: OK (Database + .info files)
- Conference .info files exist on disk: `Conf1.info`, `Conf2.info`
- Doors read .info files via icon.library emulation
- Database caches conference metadata for web UI
- No conflicts - .info files are source of truth

---

## WHAT MUST BE ON DISK (Doors Expect These)

### Critical Disk Files

1. **Messages** - `Conf{N}/Messages/{messageId}.msg`
   - ✅ Writing: FIXED (message-file.util.ts)
   - ❌ Reading: BROKEN (still uses database)
   - Plain text format: from/to/subject/date/msgnum/body
   - Doors read these directly

2. **MailStats** - `Conf{N}/Messages/MailStats`
   - ✅ WORKING (message-file.util.ts)
   - Binary format: 3 x 4-byte integers (lowestKey, lowestNotDel, highMsgNum)

3. **Files** - `Conf{N}/Files/{filename}`
   - ✅ WORKING (upload/download correct)
   - Actual uploaded files

4. **DIR Files** - `Conf{N}/DIR1`, `Conf{N}/DIR2`, etc.
   - ✅ WORKING (dir-file-reader.util.ts)
   - File listings in AmiExpress format

5. **NumULs** - `Conf{N}/NumULs`
   - ✅ WORKING (XIM DT_NAME context-aware)
   - File count for conference

6. **Configuration** - `*.info` files
   - ✅ WORKING (icon.library emulation)
   - Conf.info, Node.info, command .info files

7. **Screens** - `Screens/*.txt`
   - ✅ WORKING
   - ANSI/ASCII screen files

8. **Bulletins** - `Bulletins/*.txt`
   - ✅ WORKING
   - Daily bulletins

---

## WHAT DATABASE SHOULD STORE

### Legitimate Database Use Cases

1. **Authentication & Sessions** ✅
   - JWT tokens, password hashes
   - Active sessions, WebSocket state

2. **Statistics & Accounting** ✅
   - Upload/download byte counts
   - Daily stats, caller activity

3. **Web UI Features** ✅
   - Chat rooms, webhooks
   - Vote system, command history

4. **Configuration Cache** ✅
   - Parsed .info data (cache only)
   - Protocol definitions

5. **Search Indexes** ✅ (Optional)
   - Message full-text search
   - File search index

---

## FIXES REQUIRED - PRIORITY ORDER

### CRITICAL (Breaks Door Compatibility)

1. **Message Reading - HIGH PRIORITY**
   - File: `web/backend/src/handlers/message-scan.handler.ts:170`
   - File: `web/backend/src/handlers/messaging.handler.ts:75`
   - Change: Replace `_db.getMessages()` with disk reads
   - Use: `getAllMessageIds()` + `readMessageFile()` from `message-file.util.ts`

### IMPORTANT (Database Pollution)

2. **File Metadata Display**
   - File: `web/backend/src/handlers/display-file-commands.handler.ts:28`
   - Change: Parse NDIRS from Conf.info instead of database
   - Read: DIR files for file listings, not database

3. **File Maintenance Database Updates**
   - File: `web/backend/src/handlers/file-maintenance.handler.ts`
   - Change: Remove database DELETE/UPDATE operations
   - Only update: DIR files on disk

### OPTIONAL (Nice to Have)

4. **Conference Config Sync**
   - Parse .info files on startup to populate database cache
   - Ensure database never overrides .info files

---

## TESTING CHECKLIST

After implementing fixes:

- [ ] Post message via BBS
- [ ] Read message via BBS (should come from disk)
- [ ] Read message via door (AquaScan, etc.)
- [ ] Upload file (check DIR file and Files/ directory)
- [ ] Download file (verify reads from Files/ directory)
- [ ] File listing (verify reads from DIR files)
- [ ] Door reads NumULs correctly
- [ ] XIM DT_* commands return correct user data
- [ ] .info files readable by doors

---

## CONCLUSION

**Current State**: 60% disk-based
- ✅ Message writing to disk
- ❌ Message reading from database
- ✅ File uploads/downloads to/from disk
- ⚠️ File metadata mixed (disk + database)
- ✅ User data via XIM protocol (OK)
- ✅ Configuration on disk (.info files)

**Target State**: 100% disk-based for all BBS data
**Database Role**: Auth, stats, web UI, search indexing ONLY

**Priority**: Fix message reading handlers IMMEDIATELY - this is critical for door compatibility.
