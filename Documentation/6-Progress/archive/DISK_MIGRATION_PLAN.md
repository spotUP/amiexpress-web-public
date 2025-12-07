# Migration to 100% Disk-Based Storage

## Goal

Make AmiExpress-Web 100% disk-based like the original Amiga AmiExpress. Database should ONLY be used for modern web features (auth, sessions, chat, webhooks) - NOT for any BBS data that doors/AREXX need.

## Current State vs Target State

### Users

**Current**: SQLite `users` table
**Target**: Binary UserData files (like Amiga)
**Location**: `UserData/{username}` or `UserData.{slotNumber}`

**Actions**:
1. Create user file read/write utilities (binary format)
2. Load user from disk on login (cache in session)
3. Save user to disk on changes
4. Keep database ONLY for web authentication (JWT, bcrypt passwords)

### Messages

**Current**: SQLite `messages` table
**Target**: Individual .msg files
**Location**: `Conf{N}/Messages/{messageId}.msg`

**Actions**:
1. Create message file write utility (plain text format)
2. When user posts message, write to `Conf{N}/Messages/{id}.msg`
3. Create message file read utility for message reader
4. Keep database ONLY for search index (optional)

### File Entries

**Current**: SQLite `file_entries` table
**Target**: DIR files on disk
**Location**: `Conf{N}/DIR1`, `Conf{N}/DIR2`, etc.

**Actions**:
1. REMOVE all database reads for file listings ✅ DONE
2. REMOVE all database reads for downloads ✅ DONE
3. Keep writing DIR files ✅ ALREADY WORKS
4. Database `file_entries` is optional stats only

### Conferences

**Current**: SQLite `conferences` table
**Target**: .info files
**Location**: `Conf1.info`, `Conf2.info`, etc.

**Actions**:
1. Parse .info files on startup
2. Cache in memory during session
3. Database is just a cache, not source of truth

### Message Bases

**Current**: SQLite `message_bases` table
**Target**: Part of Conf.info files
**Location**: Within conference .info files

**Actions**:
1. Parse from .info TOOLTYPE_CONF
2. Keep in memory
3. Database cache optional

## What Database CAN Store

### Web-Only Features (OK to use database)

1. **Authentication**
   - JWT tokens, refresh tokens
   - Password hashes (bcrypt)
   - Session IDs

2. **Web Sessions**
   - Socket.IO session tracking
   - Multi-node session state
   - Online user list

3. **Modern Features**
   - Chat rooms, chat messages
   - Webhooks (Discord/Slack)
   - Vote/poll system
   - Command history

4. **Statistics** (derived from disk data)
   - Daily stats
   - Caller activity logs
   - Mail stats

5. **Search Indexes** (optional performance)
   - Message full-text search
   - File search index
   - User search index

## Implementation Priority

### Phase 1: CRITICAL (Doors Won't Work Without This)

1. **Messages to Disk** - HIGH PRIORITY
   - Create message file writer
   - Modify `message-entry.handler.ts` to write .msg files
   - Create message file reader for message reader
   - Test message doors (if any)

2. **Verify File Operations** - DONE ✅
   - File uploads to Conf{N}/Files/ ✅
   - File downloads from Conf{N}/Files/ ✅
   - DIR files written correctly ✅

### Phase 2: IMPORTANT (BBS Core Functionality)

3. **User Data to Disk** - MEDIUM PRIORITY
   - Create binary UserData file format
   - Write user save/load utilities
   - Migrate login to read from disk
   - Keep database for web auth only

4. **Conference Config from .info** - MEDIUM PRIORITY
   - Parse Conf.info files on startup
   - Use parsed data instead of database
   - Database becomes cache

### Phase 3: OPTIMIZATION (Nice to Have)

5. **Remove Unnecessary Tables**
   - Audit which tables are truly needed
   - Drop tables that duplicate disk data
   - Keep only web features

6. **Performance Tuning**
   - Add search indexes (optional)
   - Cache frequently accessed disk data
   - Optimize file I/O

## File Formats

### User Data Files (Binary)

Structure (from Amiga import code):
```
UserData.{slotNumber}:
  - username (32 bytes)
  - password hash (variable)
  - realname (26 bytes)
  - location (30 bytes)
  - phone (13 bytes)
  - security level (1 byte)
  - uploads (4 bytes)
  - downloads (4 bytes)
  - bytes upload (8 bytes BCD)
  - bytes download (8 bytes BCD)
  - ... (see import-validation.service.ts)
```

### Message Files (Plain Text)

```
Conf{N}/Messages/{messageId}.msg:
  Subject: {subject}
  From: {username}
  To: {recipient or ALL}
  Date: {timestamp}
  Status: P (public) or R (private)

  {message body}
  {line 2}
  {etc}
```

### DIR Files (Plain Text)

Already implemented correctly:
```
Conf{N}/DIR1:
  filename.lha P  72K  05-Dec-25  Description here
                                   Sent by: username
```

### MailStats Files (Binary)

```
Conf{N}/Messages/MailStats:
  - lowestKey (4 bytes)
  - lowestNotDel (4 bytes)
  - highMsgNum (4 bytes)
```

## Testing Checklist

After each phase:

- [ ] Login works (reads user from disk)
- [ ] Post message (writes .msg file to disk)
- [ ] Read messages (reads .msg files from disk)
- [ ] Upload file (writes to Conf{N}/Files/ and DIR file)
- [ ] Download file (reads from Conf{N}/Files/)
- [ ] File listing (reads DIR files)
- [ ] AquaScan finds files
- [ ] User stats update (writes back to UserData file)
- [ ] Logoff saves user data (writes to disk)

## Migration Strategy

1. **Keep database for now** - Don't drop tables yet
2. **Dual write** - Write to BOTH disk and database during migration
3. **Read from disk** - Always prefer disk as source of truth
4. **Gradual removal** - Remove database dependencies one at a time
5. **Final cleanup** - Drop unnecessary tables when fully disk-based

## Success Criteria

✅ All doors can access BBS data without database
✅ Messages readable by doors and AREXX
✅ Files accessible to doors and download commands
✅ User data accessible to doors via XIM protocol
✅ BBS works identically to Amiga AmiExpress
✅ Database ONLY used for web auth and modern features

## Notes

- User data can stay in memory during session (loaded at login, saved at logoff)
- XIM protocol already provides user data to doors from session object
- Messages should be written atomically (write to temp, then rename)
- DIR files append-only for performance
- MailStats critical for message base management
