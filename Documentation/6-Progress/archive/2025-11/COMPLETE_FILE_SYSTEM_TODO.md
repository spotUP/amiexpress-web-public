# Complete File System Implementation - 1:1 AmiExpress Compatibility

## Current Status Assessment

### ✅ COMPLETED
1. **DOS.library file I/O** - Full Open/Read/Write/Close/Seek implementation
2. **UserFileManager** - user.data, user.keys, user.misc (239+54+256 bytes)
3. **NodeFileManager** - Exists but needs verification
4. **Database sync triggers** - createUser/updateUser write to disk

### ❌ NOT VERIFIED / INCOMPLETE
All file operations need to be **triggered automatically** by BBS operations, not just available as functions.

## Phase 1: Node Files (WHO Door Critical)

### 1.1 node{n}.user and node{n}.userkeys ⚠️ PARTIALLY DONE
**Status:** NodeFileManager exists, but sync triggers need verification

**Files:**
- `BBS:node0.user` through `BBS:node7.user`
- `BBS:node0.userkeys` through `BBS:node7.userkeys`

**Triggers Needed:**
- ✅ On login → create node{n}.user, node{n}.userkeys (verify this works)
- ✅ On logoff → delete node{n}.user, node{n}.userkeys (verify this works)
- ❌ On status change → update node{n}.user (NOT IMPLEMENTED)

**Verification:**
```bash
# After login, should exist:
ls -lh node{0..7}.user node{0..7}.userkeys

# After logoff, should be deleted
```

### 1.2 Node{n}/CallersLog ❌ NOT IMPLEMENTED
**Files:** `BBS:Node0/CallersLog` through `BBS:Node7/CallersLog`

**Format:** Text file with timestamped actions
```
01-Nov-25 20:49 Login: sysop
01-Nov-25 20:50 Door: WHO
01-Nov-25 20:51 Logoff
```

**Triggers Needed:**
- On login → append login entry
- On command → append command entry
- On door → append door entry
- On logoff → append logoff entry

**Implementation:** Create `CallersLogManager.ts`

### 1.3 DOOR.SYS Drop File ❌ NOT IMPLEMENTED
**File:** `BBS:Node{n}/DOOR.SYS` (recreated for each door)

**Format:** Standard BBS door drop file (52 lines)
```
COM1:
2400
8
1
Sysop
Location
123-456-7890
...
```

**Triggers Needed:**
- Before door execution → create DOOR.SYS in Node{n}/
- After door exit → delete DOOR.SYS

**Implementation:** Create `DoorDropFileManager.ts`

## Phase 2: User Database Files

### 2.1 user.data, user.keys, user.misc ✅ DONE
**Status:** UserFileManager implemented and working

**Verification Needed:**
- ❌ Test createUser trigger writes to files
- ❌ Test updateUser trigger writes to files
- ❌ Test existing users are in files

### 2.2 DORINFOx.DEF Drop File ❌ NOT IMPLEMENTED
**File:** `BBS:Node{n}/DORINFO{n}.DEF`

**Format:** Alternative door drop file format
```
BBS Name
Sysop Name
...
```

**Triggers:** Same as DOOR.SYS

## Phase 3: Conference & Message Files

### 3.1 Conf.DB ❌ NOT IMPLEMENTED
**File:** `BBS:Conf.DB`

**Format:** Binary database of all conferences

**Triggers Needed:**
- On conference create → append to Conf.DB
- On conference update → update Conf.DB
- On conference delete → mark deleted in Conf.DB

**Implementation:** Create `ConferenceFileManager.ts`

### 3.2 Message Files (.msg) ❌ NOT IMPLEMENTED
**Files:** `BBS:Conf01/Messages/1.msg`, `BBS:Conf01/Messages/2.msg`, etc.

**Format:** Binary message structure
```
Header (mailHeader struct - 110 bytes)
Body (variable length text)
```

**Triggers Needed:**
- On message post → create {msgnum}.msg
- On message edit → update {msgnum}.msg
- On message delete → delete or mark deleted

**Implementation:** Create `MessageFileManager.ts`

### 3.3 Message Base Directories ❌ NOT IMPLEMENTED
**Directories:** `BBS:Conf01/Messages/`, `BBS:Conf02/Messages/`, etc.

**Triggers:**
- On message base create → create Messages/ directory

## Phase 4: File Area Files

### 4.1 File Area .dir Files ❌ NOT IMPLEMENTED
**Files:** `BBS:Conf01/Files/Area1.dir`, etc.

**Format:** Binary file listing (each file entry is fixed size)
```
struct fileEntry {
  filename[255]
  description[255]
  size: LONG
  uploader[31]
  uploadDate: LONG
  downloads: INT
  ...
}
```

**Triggers Needed:**
- On file upload → append to area.dir
- On file delete → remove from area.dir or mark deleted
- On description edit → update in area.dir

**Implementation:** Create `FileAreaManager.ts`

### 4.2 Physical Files ⚠️ PARTIAL
**Status:** Files are uploaded to disk but .dir not updated

**Directories:** `BBS:Conf01/Files/uploads/`, etc.

**Triggers:**
- On upload → copy to conference files directory ✅ DONE
- On delete → remove from disk ❌ NOT IMPLEMENTED

## Phase 5: System Files

### 5.1 Node Working Directories ⚠️ EXIST BUT NOT MANAGED
**Directories:** `BBS:Node0/` through `BBS:Node7/`

**Contents:**
- `CallersLog` - Activity log ❌
- `Playpen/` - Temp door files ❌
- `DOOR.SYS` - Door drop file ❌
- `DORINFOx.DEF` - Alternative drop file ❌

**Triggers:**
- On node start → create Node{n}/ if not exists
- On door start → create Playpen/, DOOR.SYS
- On door exit → cleanup Playpen/

### 5.2 Statistics Files ❌ NOT IMPLEMENTED
**Files:** Various in `BBS:Stats/`

**Format:** Text or binary stats

**Triggers:** Periodic updates (daily, weekly, monthly)

**Priority:** LOW (Phase 4+)

## Implementation Priority

### CRITICAL (For WHO Door)
1. ✅ Verify node{n}.user/userkeys are created on login
2. ❌ Implement Node{n}/CallersLog
3. ❌ Implement DOOR.SYS drop file
4. ❌ Test WHO door with all files present

### HIGH (For Door Compatibility)
5. ❌ Implement DORINFOx.DEF
6. ✅ Verify user.data/keys/misc sync on create/update
7. ❌ Implement Conf.DB
8. ❌ Implement .msg files

### MEDIUM (For Full Compatibility)
9. ❌ Implement file area .dir files
10. ❌ Implement message base directories
11. ❌ Implement file delete triggers

### LOW (Future)
12. ❌ Statistics files
13. ❌ Voting/questionnaire files

## Verification Checklist

After each implementation, verify:

### Node Files
```bash
# Login as user
# Check files exist:
ls -lh node*.user node*.userkeys
ls -lh Node*/CallersLog
ls -lh Node*/DOOR.SYS

# Run door
# Check door can read files

# Logoff
# Check files deleted
```

### User Database Files
```bash
# Create new user
# Check user.data size increased by 239 bytes
ls -lh user.data user.keys user.misc

# Update user
# Check user.data modified timestamp updated

# Read with xxd
xxd user.data | grep -A5 "username"
```

### Message Files
```bash
# Post message
# Check .msg file created
ls -lh Conf01/Messages/*.msg

# Read message
# Verify message in file
```

### File Area Files
```bash
# Upload file
# Check .dir updated
xxd Conf01/Files/Area1.dir

# List files
# Verify shows uploaded file
```

## Next Steps

1. Verify login/logoff triggers for node files
2. Implement CallersLogManager
3. Implement DoorDropFileManager (DOOR.SYS)
4. Test WHO door
5. Continue with remaining phases

## Success Criteria

✅ **100% File Compatibility:**
- Every DB operation triggers corresponding file write
- All doors can read necessary files
- WHO door shows active users
- File doors see file listings
- Message doors see messages
- No door fails due to missing files

✅ **1:1 AmiExpress Compatibility:**
- Binary formats match E structs exactly
- File paths match original
- Directory structure matches
- File permissions correct
