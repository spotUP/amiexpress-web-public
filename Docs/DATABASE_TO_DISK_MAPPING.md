# Database to Disk File Mapping - AmiExpress 1:1 Port

## Purpose
This document maps PostgreSQL database tables to AmiExpress disk files. For 1:1 compatibility, we need both:
- **PostgreSQL**: Fast queries, web features (modern TypeScript doors can use this)
- **Disk Files**: Amiga door compatibility (real 68k doors need these)

## Strategy: Hybrid Architecture

**Keep PostgreSQL as primary storage** but **write disk files on every change** for Amiga door compatibility.

## Database Tables → Disk Files Mapping

### 1. Users Table → User Database Files

**Database Table:** `users` (25+ columns)
**Disk Files:**
- `BBS:user.data` - Main user database (binary, all user structs)
- `BBS:user.keys` - User keys/settings (binary, all userKeys structs)
- `BBS:user.misc` - Miscellaneous user data (binary, all userMisc structs)

**E Source References:**
- Lines 8045-8075: Read/write user.data, user.keys, user.misc
- Line 111-113: File path definitions
- axobjects.e:11-68: `user` struct definition
- axobjects.e:70-81: `userKeys` struct definition

**Write Triggers:**
- User registration → append to all 3 files
- User login → update last login, calls
- User profile update → update user.data
- User settings change → update user.keys
- File upload/download → update stats in user.misc

**Format:** Binary struct arrays
- Each record is SIZEOF(user), SIZEOF(userKeys), SIZEOF(userMisc)
- Must maintain exact E struct layout

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🔴 HIGH (needed by many doors)

---

### 2. Users Table → Node User Files

**Database Table:** `users` (current session data)
**Disk Files:**
- `BBS:node0.user` through `BBS:node7.user` (one per active node)
- `BBS:node0.userkeys` through `BBS:node7.userkeys`

**E Source References:**
- Lines 2935-2950: createNodeUserFiles()
- Creates on login, deletes on logoff

**Write Triggers:**
- User login → create node{n}.user, node{n}.userkeys
- User logoff → delete node{n}.user, node{n}.userkeys
- Node status change → update node{n}.user

**Format:** Binary single struct
- node{n}.user = SIZEOF(user) bytes
- node{n}.userkeys = SIZEOF(userKeys) bytes

**Implementation Status:** ✅ PARTIALLY IMPLEMENTED (NodeFileManager)
**Priority:** 🔴 HIGH (WHO door needs this)

---

### 3. Conferences Table → Conference Database

**Database Table:** `conferences` (id, name, description)
**Disk Files:**
- `BBS:Conf.DB` - Binary database of all conferences

**E Source References:**
- Line 171: `confDBName` variable
- Lines 2088-2111: setConfLocation(), loads/saves conf data

**Write Triggers:**
- Conference create → append to Conf.DB
- Conference update → modify Conf.DB record
- Conference delete → mark deleted in Conf.DB

**Format:** Binary struct array
- Each conference is a fixed-size struct
- Need to find conference struct in axobjects.e

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟡 MEDIUM

---

### 4. Message_Bases Table → Conference Message Directories

**Database Table:** `message_bases` (id, name, conferenceid)
**Disk Files:**
- `BBS:Conf01/Messages/` - Message base directory per conference
- `BBS:Conf02/Messages/`
- etc.

**E Source References:**
- Lines related to msgBaseLocation
- Message bases are per-conference directories

**Write Triggers:**
- Message base create → create Messages/ directory in conference

**Format:** Directory structure
- No direct file mapping, just directory creation

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟡 MEDIUM

---

### 5. Messages Table → Message Files

**Database Table:** `messages` (id, subject, body, author, timestamp, etc.)
**Disk Files:**
- `BBS:Conf01/Messages/1.msg`
- `BBS:Conf01/Messages/2.msg`
- Each message is a separate file

**E Source References:**
- Lines 10662-10695: Message writing
- Line 10662: `StringF(tempStr2,'\s/\d.msg',tempStr,i)` - message file pattern
- Lines 8953-8964: Message reading

**Write Triggers:**
- Message post → create {msgnum}.msg file
- Message edit → update {msgnum}.msg file
- Message delete → delete {msgnum}.msg file (or mark deleted)

**Format:** Binary message struct
- Each .msg file contains message header + body
- Need message struct from axobjects.e

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟡 MEDIUM (message doors need this)

---

### 6. File_Areas Table → File Directory Databases

**Database Table:** `file_areas` (id, name, description, path, conferenceid)
**Disk Files:**
- `BBS:Conf01/Files/Area1.dir` - File directory database per area
- `BBS:Conf01/Files/Area1.idx` - Index file (optional)

**E Source References:**
- Search for ".dir" pattern in express.e
- File areas have .dir files listing all files in that area

**Write Triggers:**
- File upload → update area.dir
- File delete → update area.dir
- File description edit → update area.dir

**Format:** Binary struct array
- Each file entry is a fixed-size struct
- Contains: filename, size, uploader, date, description, downloads

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟡 MEDIUM (file doors need this)

---

### 7. File_Entries Table → Physical Files

**Database Table:** `file_entries` (filename, size, uploader, downloads, etc.)
**Disk Files:**
- `BBS:Conf01/Files/uploads/actual_file.zip`
- Plus metadata in .dir files (see above)

**E Source References:**
- File storage paths

**Write Triggers:**
- File upload → copy to conference files directory
- File delete → remove from disk

**Format:** Actual binary files (ZIPs, archives, etc.)

**Implementation Status:** ⚠️ PARTIAL (files uploaded but .dir not written)
**Priority:** 🟡 MEDIUM

---

### 8. Bulletins Table → Bulletin Files

**Database Table:** `bulletins` (id, conferenceid, filename, title)
**Disk Files:**
- `BBS:Conf01/Bulletins/BULLETIN1.TXT`
- `BBS:Conf01/Bulletins/BULLETIN2.TXT`

**E Source References:**
- Bulletin display code in express.e

**Write Triggers:**
- Bulletin create → write .TXT file
- Bulletin edit → update .TXT file
- Bulletin delete → remove .TXT file

**Format:** Text files (ANSI/ASCII)

**Implementation Status:** ⚠️ PARTIAL (bulletins exist on disk, not DB-synced)
**Priority:** 🟢 LOW (already working)

---

### 9. Node_Sessions Table → Node Working Directories

**Database Table:** `node_sessions` (nodeid, userid, status, location, etc.)
**Disk Files:**
- `BBS:Node0/` - Working directory for node 0
- `BBS:Node1/` - Working directory for node 1
- `BBS:Node{n}/CallersLog` - Activity log per node
- `BBS:Node{n}/Playpen/` - Temporary door files

**E Source References:**
- Lines 9499-9517: CallersLog operations
- Line 96-98: nodeScreenDir, nodeWorkDir

**Write Triggers:**
- Node start → create Node{n}/ directory
- User action → append to CallersLog
- Door execution → create Playpen/ temp files

**Format:** Directory structure + text logs

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟡 MEDIUM (door execution needs this)

---

### 10. Chat Sessions/Messages Tables → Chat Logs (Optional)

**Database Tables:** `chat_sessions`, `chat_messages`, `chat_rooms`, etc.
**Disk Files:** Probably none needed
- Chat is modern web feature
- Amiga doors don't access chat data

**Implementation Status:** N/A
**Priority:** 🟢 LOW (keep in DB only)

---

### 11. Sessions Table → Session State (Memory Only)

**Database Table:** `sessions` (socketId, state, currentConf, etc.)
**Disk Files:** None needed
- Session state is transient
- No Amiga doors read session data

**Implementation Status:** N/A
**Priority:** 🟢 LOW (DB only)

---

### 12. User_Stats / Mail_Stats Tables → Statistics Files

**Database Tables:** `user_stats`, `mail_stats`
**Disk Files:**
- `BBS:Stats/` - Various statistics files
- Daily/weekly/monthly stats

**E Source References:**
- Search for stats writing in express.e

**Write Triggers:**
- Periodic updates (end of day, week, month)

**Format:** Text or binary stats files

**Implementation Status:** ❌ NOT IMPLEMENTED
**Priority:** 🟢 LOW

---

## Summary Table

| Database Table      | Disk Files                        | Priority | Status |
|---------------------|-----------------------------------|----------|--------|
| users               | user.data, user.keys, user.misc   | 🔴 HIGH  | ❌     |
| users (active)      | node{n}.user, node{n}.userkeys    | 🔴 HIGH  | ⚠️     |
| conferences         | Conf.DB                           | 🟡 MED   | ❌     |
| message_bases       | Conf{n}/Messages/ dirs            | 🟡 MED   | ❌     |
| messages            | {num}.msg files                   | 🟡 MED   | ❌     |
| file_areas          | {area}.dir, {area}.idx            | 🟡 MED   | ❌     |
| file_entries        | actual files + .dir metadata      | 🟡 MED   | ⚠️     |
| bulletins           | BULLETIN*.TXT                     | 🟢 LOW   | ⚠️     |
| node_sessions       | Node{n}/ dirs, CallersLog         | 🟡 MED   | ❌     |
| chat_* tables       | None (DB only)                    | 🟢 LOW   | N/A    |
| sessions            | None (DB only)                    | 🟢 LOW   | N/A    |
| user_stats          | Stats/ files                      | 🟢 LOW   | ❌     |

**Legend:**
- ✅ Fully implemented
- ⚠️ Partially implemented
- ❌ Not implemented
- N/A Not needed

---

## Implementation Plan

### Phase 1: Critical Files (WHO Door Support)
1. ✅ node{n}.user, node{n}.userkeys (NodeFileManager)
2. ❌ user.data, user.keys, user.misc (UserFileManager)
3. ❌ Node{n}/CallersLog (NodeFileManager)

### Phase 2: Message & File Support
4. ❌ Conference directories
5. ❌ Message .msg files
6. ❌ File area .dir files
7. ❌ Conf.DB

### Phase 3: Complete Compatibility
8. ❌ All remaining files
9. ❌ Statistics files
10. ❌ All sync triggers

---

## Implementation Guidelines

### For Each File Type:

1. **Create Manager Service**
   - `UserFileManager.ts` for user.data/keys/misc
   - `MessageFileManager.ts` for .msg files
   - `FileAreaManager.ts` for .dir files
   - etc.

2. **Implement Read/Write Methods**
   - `read{Type}File()` - Load from disk
   - `write{Type}File()` - Write to disk
   - `update{Type}File()` - Modify existing
   - `delete{Type}File()` - Remove from disk

3. **Add DB Triggers**
   - After INSERT → write to disk
   - After UPDATE → write to disk
   - After DELETE → delete from disk

4. **Match E Struct Format**
   - Reference axobjects.e for exact layouts
   - Calculate field offsets and sizes
   - Handle alignment and padding

5. **Test with Doors**
   - Verify door can read files
   - Verify data is correct
   - Test edge cases

---

## Key Insights

1. **Modern TypeScript Doors CAN Use Database**
   - New web-based doors we write can query PostgreSQL directly
   - They don't need disk files

2. **Amiga Doors MUST Use Disk Files**
   - They're 68k executables compiled for AmigaOS
   - They can't connect to PostgreSQL
   - They use Open()/Read() to access data

3. **Hybrid is Best Approach**
   - Keep PostgreSQL benefits (speed, queries, backups)
   - Add disk files for compatibility
   - Sync DB → disk on every change

4. **User Specifically Said:**
   > "our new typescript doors could keep using the database though"

   This confirms hybrid approach is correct!

---

## Next Steps

1. Continue with UserFileManager implementation
2. Map all E structs to TypeScript interfaces
3. Add write triggers to database operations
4. Test each file type with relevant doors
