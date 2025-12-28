# Disk Write Audit - December 27, 2025

## Summary

Comprehensive audit of all user data write operations to ensure our TypeScript port matches express.e behavior for writing user statistics to disk (user.data, user.keys, user.misc files).

## express.e Reference

In express.e, `saveAccount()` function (line 8025) writes all three user files:
- user.data (user structure)
- user.keys (userKeys structure)
- user.misc (userMisc structure)

`saveAccount()` is called at these key points:
- **Line 8207**: During logoff (processLoggingOff) - CRITICAL
- **Lines 25893, 25928**: After profile edits (user settings)
- **Line 29741**: During carrier loss / unexpected disconnect
- **Line 30118**: After new user creation/script completion
- **Lines 21293+**: User editor operations

## Bugs Found and Fixed

### 1. **CRITICAL: Logoff Not Saving User Data** ✅ FIXED

**File**: `web/backend/src/server/socket-handlers.ts`

**Problem**:
- Disconnect handler (finalizeDisconnectCleanup) was NOT calling updateUserDataFile
- User data lost if BBS crashes or restarts before next logoff
- Contradicts express.e:8207 which calls saveAccount during processLoggingOff

**Fix** (Lines 854-878):
```typescript
// DISK-BASED: Write updated user stats to user.data/keys/misc files (express.e:8207)
try {
  const slotNumber = parseInt(session.user.id.split('-')[1], 10);
  if (isNaN(slotNumber)) {
    throw new Error(`Invalid user ID format: ${session.user.id}`);
  }
  userFileManager.updateUserDataFile(session.user, slotNumber);
  console.log(`[LOGOFF] Saved user ${session.user.username} to disk (timeUsed=${session.user.timeUsed}, messagesPosted=${session.user.messagesPosted}, slot=${slotNumber})`);
} catch (diskErr) {
  console.error('[LOGOFF] Error writing user disk files:', diskErr);
}
```

**Impact**: HIGH - Data persistence, prevents data loss

---

### 2. **CRITICAL: Message Posting Not Incrementing messagesPosted** ✅ FIXED

**File**: `web/backend/src/handlers/message/message-entry.handler.ts`

**Problem**:
- saveMessage() creates message in database but does NOT increment session.user.messagesPosted
- Does NOT write updated counter to disk
- Contradicts express.e:10127 which increments loggedOnUser.messagesPosted after successful post

**Fix** (Lines 376-392):
```typescript
// Increment messagesPosted counter (express.e:10127)
session.user!.messagesPosted = (session.user!.messagesPosted || 0) + 1;

// DISK-BASED: Write updated user stats to user.data/keys/misc files
try {
  const { userFileManager } = require('../../services/UserFileManager');
  const slotNumber = parseInt(session.user!.id.split('-')[1], 10);
  if (isNaN(slotNumber)) {
    throw new Error(`Invalid user ID format: ${session.user!.id}`);
  }
  userFileManager.updateUserDataFile(session.user!, slotNumber);
  console.log(`[Message] Updated user ${session.user!.username} disk files (messagesPosted=${session.user!.messagesPosted}, slot=${slotNumber})`);
} catch (diskErr) {
  console.error('[Message] Error writing user disk files:', diskErr);
}
```

**Impact**: HIGH - Bulletin MCI codes like ~SR_UPLOADER_TOP_UPLOADERS|| depend on accurate messagesPosted

---

## Operations Already Writing to Disk Correctly ✅

### 1. **File Uploads** ✅ CORRECT
- **File**: `web/backend/src/server/file-socket-handlers.ts:297`
- Increments uploads counter and writes to disk immediately
- Fixed in Session 5 (same session as download fix)

### 2. **File Downloads** ✅ CORRECT
- **File**: `web/backend/src/server/file-socket-handlers.ts:880`
- Increments downloads counter and writes to disk immediately
- Fixed in Session 5 (upload/download stats bug)

### 3. **User Login** ✅ CORRECT
- **File**: `web/backend/src/server/auth-socket-handlers.ts:336`
- Syncs user to disk files for 68K door compatibility
- Already implemented correctly

### 4. **User Profile Edits** ✅ CORRECT
- **File**: `web/backend/src/handlers/user/user-editor.handler.ts:291`
- Calls updateUserDataFile after database update
- Matches express.e:25893, 25928

### 5. **XIM Door Requests (DT_TIMEUSED, etc.)** ✅ CORRECT
- **File**: `web/backend/src/amiga-emulation/xim/data-query.ts:409`
- Uses userDatabaseManager.writeUserStatToDisk()
- Correctly updates disk on XIM write requests

---

## express.e Behavior Analysis

### When Does express.e Save User Data?

**Continuous Updates** (NOT saved immediately):
- Line 545: timeUsed updated every second
- Lines 10127, 10558, 10564: messagesPosted after posting
- Line 15459: downloads after download
- Line 19445: uploads/bytesUpload after upload

**Saved at Strategic Points** (performance optimization):
- Logoff (line 8207)
- Profile edits (lines 25893, 25928)
- Carrier loss (line 29741)
- New user creation (line 30118)

**Our Approach**:
We save more frequently than express.e for safety:
- ✅ Logoff (matches express.e)
- ✅ Profile edits (matches express.e)
- ✅ Uploads (MORE frequent than express.e - safer)
- ✅ Downloads (MORE frequent than express.e - safer)
- ✅ Message posting (MORE frequent than express.e - safer)

**Rationale**: Modern systems don't have the same disk I/O constraints as Amiga. Frequent saves prevent data loss in crashes/restarts.

---

## Verification Checklist

- [x] Logoff writes user data to disk
- [x] Message posting increments messagesPosted and writes to disk
- [x] Uploads write to disk immediately
- [x] Downloads write to disk immediately
- [x] Profile edits write to disk
- [x] Login syncs user to disk
- [x] XIM door requests write to disk
- [x] User slot number extracted correctly (user-3 -> 3)
- [x] All three files written (user.data, user.keys, user.misc)

---

## Testing

**Manual Test**:
1. Login to BBS
2. Post a message → check messagesPosted incremented
3. Upload a file → check uploads/bytesUpload incremented
4. Download a file → check downloads/bytesDownload incremented
5. Logoff → check all stats persisted to disk
6. Restart BBS server
7. Login again → verify all stats retained

**68K Door Test**:
1. Run mtop door → should show upload/download stats
2. Run Bulls door → should show message posting stats
3. Verify XIM doors can read user data correctly

---

## Related Issues Fixed

- Session 5: Upload/download stats not written to disk (parseInt bug)
- Session 4: AquaScan signal deadlock (BBS Handler Task)
- Session 3: MultiTop hang (TYPE=XIM -> TYPE=SIM)

---

## Files Modified

1. `web/backend/src/server/socket-handlers.ts`
   - Line 33: Added userFileManager import
   - Lines 854-878: Added disk write on logoff

2. `web/backend/src/handlers/message/message-entry.handler.ts`
   - Lines 376-392: Increment messagesPosted and write to disk

3. `web/backend/src/server/file-socket-handlers.ts` (Session 5)
   - Lines 290-302: Fixed upload disk write (user slot extraction)
   - Lines 873-885: Fixed download disk write (user slot extraction)

---

## Conclusion

All critical user data write operations now match express.e behavior:
- User data is written to disk at logoff (express.e:8207) ✅
- User data is written after profile edits (express.e:25893) ✅
- Stats are written MORE frequently than express.e for safety ✅
- 68K doors can read accurate user statistics from disk ✅

**CRITICAL BUG RESOLVED**: User data is now persisted to disk at logoff, preventing data loss on server restarts or crashes.
