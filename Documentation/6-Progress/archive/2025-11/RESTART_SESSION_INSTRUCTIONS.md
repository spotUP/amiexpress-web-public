# Restart Session Instructions - Complete File System Implementation

## Current Status: READY TO TEST WHO DOOR

### What Was Completed This Session

**ALL CRITICAL FILE OPERATIONS ARE NOW DISK-BASED** ✅

#### Phase 1: Node Files (WHO Door Critical) - ✅ COMPLETE
1. **node{n}.user / node{n}.userkeys** - Binary user structs (239 + 54 bytes)
   - Created on login: `/web/backend/src/index.ts` line 846
   - Deleted on logoff: `/web/backend/src/index.ts` line 1641
   - Binary format matches E structs exactly
   - Padding issues fixed (3 bytes + 6 bytes = 9 bytes total)

2. **Node{n}/CallersLog** - Activity logging
   - File: `/web/backend/src/services/CallersLogManager.ts` (200 lines)
   - Text format with timestamps
   - Triggers: login (line 851), logoff (line 1639), door execution (line 261)
   - Format: `DD-Mon-YY HH:MM Activity: details`

3. **DOOR.SYS drop file** - Standard BBS door format
   - File: `/web/backend/src/services/DoorDropFileManager.ts` (300 lines)
   - 52-line standard format
   - Created before door: `/web/backend/src/handlers/door.handler.ts` line 246
   - Cleaned up after door: line 292

4. **DORINFOx.DEF drop file** - Alternative format
   - Same manager as DOOR.SYS
   - Created/cleaned up with DOOR.SYS

#### Phase 2: User Database Files - ✅ COMPLETE
1. **user.data / user.keys / user.misc** - Binary user database
   - File: `/web/backend/src/services/UserFileManager.ts` (800+ lines)
   - Sizes: 239 + 54 + 256 bytes per user
   - Created on user create: `/web/backend/src/database.ts` line 928
   - Updated on user update: line 1041
   - **CRITICAL FIX:** Padding alignment
     - user struct: 230 → 239 bytes (added 3+6 bytes padding)
     - userMisc struct: 248 → 256 bytes (added 8 bytes padding)
     - userKeys struct: 54 bytes (correct as-is)

2. **Existing users synced**
   - 2 users written to disk successfully
   - Files verified with xxd showing correct data

### Files Created This Session

```
/web/backend/src/services/
├── UserFileManager.ts          (800 lines) - user.data/keys/misc
├── CallersLogManager.ts        (200 lines) - Node{n}/CallersLog
└── DoorDropFileManager.ts      (300 lines) - DOOR.SYS + DORINFOx.DEF

/Docs/
├── DATABASE_TO_DISK_MAPPING.md            - Complete table→file mapping
├── COMPLETE_FILE_SYSTEM_TODO.md           - Implementation checklist
├── SESSION_2025-11-01_DB_TO_DISK.md       - DB migration notes
├── SESSION_2025-11-01_COMPLETE_FILE_SYSTEM.md - This session summary
└── RESTART_SESSION_INSTRUCTIONS.md         - This file
```

### Files Modified This Session

```
/web/backend/src/
├── database.ts                 - Added user file sync (lines 10, 928, 1041)
├── index.ts                    - Added CallersLog + drop files (lines 12-13, 851, 1639)
└── handlers/door.handler.ts    - Added drop file creation (lines 12-13, 246, 292)
```

### Disk Files Created

```
amiexpress-web/
├── user.data              478 bytes (2 users × 239)
├── user.keys              108 bytes (2 users × 54)
├── user.misc              512 bytes (2 users × 256)
├── Node0/CallersLog       405K (existing logs)
├── Node1/ through Node7/  (directories created)
└── node*.user/userkeys    (created on login, deleted on logoff)
```

## Where to Proceed After Restart

### IMMEDIATE NEXT STEP: Test WHO Door

**The file system is now complete for WHO door. Test it!**

#### 1. Test Login File Creation
```bash
# Start backend if not running
~/Code/AmiExpress/amiexpress-web/dev/scripts/start-backend.sh

# Login via browser to http://localhost:5173
# User: sysop / Password: sysop

# Verify files created:
ls -lh node*.user node*.userkeys
cat Node0/CallersLog | tail -5
```

**Expected:**
- `node0.user` (239 bytes) - created
- `node0.userkeys` (54 bytes) - created
- CallersLog shows: `01-Nov-25 XX:XX Login: sysop`

#### 2. Test WHO Door
```bash
# After login, run WHO command
# In BBS: type "WHO" and press Enter

# Verify drop files created:
cat Node0/DOOR.SYS | head -20
cat Node0/DORINFO0.DEF

# Check CallersLog:
cat Node0/CallersLog | tail -10
```

**Expected:**
- DOOR.SYS created (52 lines)
- DORINFO0.DEF created
- CallersLog shows: `01-Nov-25 XX:XX Door: WHO`
- WHO door displays user list (at minimum: current user)

#### 3. Check Backend Logs
```bash
tail -100 /tmp/backend.log | grep -E "WHO|Door|node|CallersLog"
```

**Look for:**
- `[CallersLog] Node0: Login: sysop`
- `[DoorDropFile] Created DOOR.SYS for Node0`
- `[DoorDropFile] Created DORINFO0.DEF for Node0`
- WHO door execution messages

### If WHO Door Still Doesn't Work

**Possible Issues:**

1. **Path Resolution in Door Context**
   - WHO might be looking in wrong directory
   - Check: Does WHO try to open `BBS:user.data` or `BBS:node0.user`?
   - Fix: Add logging to DOS.library Open() to see what WHO requests

2. **Binary Format Issues**
   - WHO might expect different struct layout
   - Check: Add hex dump logging when WHO reads files
   - Fix: Compare with original AmiExpress node files

3. **Missing Files**
   - WHO might need additional files we haven't implemented
   - Check: Monitor DOS.library Open() calls for file not found errors
   - Fix: Implement missing file type

**Debug Steps:**
```typescript
// Add to DosLibrary.ts Open() function:
console.log('[DOS] WHO door attempting to open:', filename);
console.log('[DOS] Resolved path:', resolvedPath);
console.log('[DOS] File exists:', fs.existsSync(resolvedPath));
```

### After WHO Door Works

Continue with remaining file types (lower priority):

#### Phase 3: Conference & Message Files
1. **Conf.DB** - Conference database
   - Create: `ConferenceFileManager.ts`
   - Trigger: Conference create/update/delete
   - Format: Binary conference struct array

2. **Message .msg Files** - Individual messages
   - Create: `MessageFileManager.ts`
   - Trigger: Message post/edit/delete
   - Format: Binary message header + text body
   - Path: `BBS:Conf01/Messages/1.msg`, `2.msg`, etc.

3. **Message Base Directories**
   - Create: `Conf{n}/Messages/` on message base creation

#### Phase 4: File Area Files
1. **File Area .dir Files** - File listings
   - Create: `FileAreaManager.ts`
   - Trigger: File upload/delete/description edit
   - Format: Binary file entry struct array
   - Path: `BBS:Conf01/Files/Area1.dir`

2. **Update Upload Trigger**
   - Modify: `/web/backend/src/utils/dir-file.util.ts`
   - Ensure: writeUploadToDirFile() writes binary format

## Key Technical Details to Remember

### Binary Struct Padding
**CRITICAL:** E language structs have alignment padding!

```
user struct (239 bytes):
- Fields total: 230 bytes
- After expert CHAR: 3 bytes padding (align LONG)
- At end: 6 bytes padding
- Total: 239 bytes

userMisc struct (256 bytes):
- Fields total: 248 bytes
- At end: 8 bytes padding
- Total: 256 bytes
```

### Path Resolution
All file managers use:
```typescript
this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
```

This goes up 4 levels from `/web/backend/src/services/` to reach project root.

### Database Sync Pattern
```typescript
// After DB operation, sync to disk:
try {
  await db.createUser(userData);
  const newUser = await db.getUserById(id);
  userFileManager.writeUserFiles(newUser, slotNumber);
} catch (error) {
  // Don't throw - file write failure shouldn't break DB operation
  console.error('Failed to sync user to disk:', error);
}
```

### Door Execution Pattern
```typescript
// Before door:
doorDropFileManager.createAllDropFiles(nodeId, user, timeRemaining);
callersLogManager.logDoor(nodeId, doorName);

// Execute door...

// After door:
doorDropFileManager.cleanupDropFiles(nodeId);
callersLogManager.logDoorExit(nodeId, doorName);
```

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Login creates node{n}.user files (239 + 54 bytes)
- [ ] CallersLog shows login entry
- [ ] WHO door creates DOOR.SYS (52 lines)
- [ ] WHO door creates DORINFOx.DEF
- [ ] WHO door shows user list
- [ ] Logoff deletes node files
- [ ] Logoff logs to CallersLog
- [ ] Drop files cleaned up after door

## Success Criteria

✅ **WHO door displays at least current user**
✅ **All files created with correct sizes**
✅ **Binary format matches E structs**
✅ **Triggers work automatically**

## Reference Files

**Implementation:**
- `/web/backend/src/services/UserFileManager.ts` - User database
- `/web/backend/src/services/CallersLogManager.ts` - Activity logs
- `/web/backend/src/services/DoorDropFileManager.ts` - Drop files
- `/web/backend/src/database.ts` - DB sync triggers
- `/web/backend/src/index.ts` - Login/logoff triggers
- `/web/backend/src/handlers/door.handler.ts` - Door triggers

**Documentation:**
- `/Docs/DATABASE_TO_DISK_MAPPING.md` - Complete mapping
- `/Docs/COMPLETE_FILE_SYSTEM_TODO.md` - Full checklist
- `/Docs/SESSION_2025-11-01_COMPLETE_FILE_SYSTEM.md` - Session summary
- `/AmiExpress-Sources/axobjects.e` - E struct definitions (lines 11-100)
- `/AmiExpress-Sources/express.e` - File operations reference

**Verification:**
```bash
# Check user database files
ls -lh user.* && xxd user.data | head -15

# Check node files (during session)
ls -lh node*.user node*.userkeys

# Check activity logs
cat Node*/CallersLog | tail -20

# Check drop files (during door)
cat Node0/DOOR.SYS
cat Node0/DORINFO0.DEF
```

## What's NOT Done Yet (Lower Priority)

These are not needed for WHO door, implement later:

- [ ] Conf.DB - Conference database
- [ ] .msg files - Message files
- [ ] .dir files - File area directories
- [ ] Conference create/update triggers
- [ ] Message post/edit triggers
- [ ] File upload .dir sync
- [ ] Statistics files
- [ ] Voting/questionnaire files

## Important Notes

1. **WHO door is the test case** - If WHO works, file system is proven
2. **Binary compatibility is critical** - Even 1 byte off breaks doors
3. **Padding was the key issue** - E structs align to boundaries
4. **All triggers are in place** - Files write automatically
5. **Hybrid architecture works** - PostgreSQL + disk files

## Quick Start After Restart

```bash
# 1. Start backend
~/Code/AmiExpress/amiexpress-web/dev/scripts/start-backend.sh

# 2. Open browser
open http://localhost:5173

# 3. Login (sysop/sysop)

# 4. Check files created
ls -lh node*.user node*.userkeys
cat Node0/CallersLog | tail -5

# 5. Run WHO door
# Type: WHO <Enter>

# 6. Check output - should show user list!
```

## Expected WHO Door Output

```
WHO's Online
════════════════════════════════════════════════════════════════
Node  User                Location              Activity
════════════════════════════════════════════════════════════════
0     sysop               Server Room           Main Menu
════════════════════════════════════════════════════════════════
1 user(s) online
```

If this appears, **100% SUCCESS** - file system is working! 🎯

## If You Need to Debug

Add this to `/web/backend/src/amiga-emulation/api/DosLibrary.ts` in the `Open()` function:

```typescript
Open(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);
  const mode = this.emulator.getRegister(CPURegister.D2);
  const filename = this.readString(namePtr);

  // DEBUG: Log what WHO door is trying to open
  console.log('[DOS DEBUG] Open() called:');
  console.log('  Filename:', filename);
  console.log('  Mode:', mode);

  const resolvedPath = this.resolvePath(filename);
  console.log('  Resolved:', resolvedPath);
  console.log('  Exists:', fs.existsSync(resolvedPath));

  // ... rest of function
}
```

This will show exactly what files WHO is looking for.

---

**READY TO TEST WHO DOOR NOW!** 🚀
