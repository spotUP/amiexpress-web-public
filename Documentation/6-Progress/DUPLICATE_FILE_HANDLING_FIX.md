# Duplicate File Handling Fix - 1:1 with AmiExpress

## User Report
When uploading multiple files and one already exists, the BBS aborted the entire batch with error instead of skipping the duplicate and continuing with remaining files.

**Error Message:**
```
File selected: 5D_COM01.LHA
Size: 21KB

Checking for FILE_ID.DIZ...
[FILE_ID.DIZ found - using as description]

Testing... 5D_COM01.LHA...

Tested Ok...

Upload failed: File "5D_COM01.LHA" already exists in this area. Delete the old file first or choose a different filename.

Press any key to continue...
```

---

## Root Cause

**Location:** `file-socket-handlers.ts:442-444`

**Problem:** Code threw exception when duplicate was detected:
```typescript
if (existingFile.rows.length > 0) {
  throw new Error(`File "${currentFile.filename}" already exists in this area. Delete the old file first or choose a different filename.`);
}
```

This aborted the entire batch upload instead of continuing with remaining files.

---

## AmiExpress Reference (express.e:19371-19377, 19442-19448, 19466-19468)

### Duplicate Detection and Handling
```e
IF(status=RESULT_FAILURE)             /* Move to a Hold AREA */
  IF(foundDupe)
    StringF(tempstr,'\b\nFile already exists, moving to \s''s private directory\b\n',cmds.sysopName)
    aePuts(tempstr)
    hold:=1
  ENDIF
ENDIF
```

### Credits (NOT given for duplicates)
```e
/* Add Uploaded Bytes to Users Account */
IF((hold=NIL) AND (lcfile=NIL) AND (rzmsg=NIL))
  IF creditAccountTrackUploads(loggedOnUser)
    IF sopt.toggles[TOGGLES_CREDITBYKB] THEN fsize:=Shr(fsize,10) AND $003fffff
    addBCD(loggedOnUserMisc.uploadBytesBCD,fsize)
    loggedOnUser.bytesUpload:=convertFromBCD(loggedOnUserMisc.uploadBytesBCD)
  ENDIF
ENDIF
```

### DIR File Marker
```e
IF(foundDupe)
  fmtstr[13]:="D"
  foundDupe:=0
ENDIF
```

**Key Points:**
1. Duplicates set `foundDupe=TRUE` and `hold=1` (move to HOLD directory)
2. Show message: "File already exists, moving to [sysop]'s private directory"
3. Do NOT give user credits/stats (hold=1 prevents credit check at line 19442)
4. Mark with 'D' in DIR file (position 13)
5. Continue processing remaining files - no abort

---

## Fixes Applied

### Fix #1: Detect duplicates without aborting (Lines 442-452)

**Before:**
```typescript
if (existingFile.rows.length > 0) {
  throw new Error(`File "${currentFile.filename}" already exists...`);
}
```

**After:**
```typescript
let foundDupe = false;
if (existingFile.rows.length > 0) {
  // Express.e:19372-19376 - Move duplicate to HOLD directory, don't abort
  foundDupe = true;
  socket.emit(
    "ansi-output",
    `\r\n\x1b[33mFile already exists, moving to ${config.get("sysopName")}'s private directory\x1b[0m\r\n`
  );
  fileStatus = "hold"; // Move to HOLD directory
  checkedMarker = "D"; // Mark as duplicate (express.e uses 'D' marker)
}
```

### Fix #2: Skip database insert for duplicates (Lines 454-477)

**Before:**
```typescript
// Always inserted regardless
await db.createFileEntry(fileEntry as any);
```

**After:**
```typescript
// Skip database insert for duplicates - file already exists in database
if (!foundDupe) {
  const fileEntry = { /* ... */ };
  await db.createFileEntry(fileEntry as any);
} else {
  // Duplicate file - skip database insert but still write to DIR file in HOLD
  console.log(`[Upload] Skipping database insert for duplicate file: ${currentFile.filename}`);
}
```

### Fix #3: Skip user stats/credits for duplicates (Line 547)

**Express.e Reference:** Lines 19442-19448 - Credits only given when `hold=NIL`

**Before:**
```typescript
const trackUploads = creditAccountTrackUploads(session.user!);
if (trackUploads) {
  // Update stats unconditionally
}
```

**After:**
```typescript
// Express.e: Stats ONLY updated when status=RESULT_SUCCESS (not for duplicates/failures)
const trackUploads = creditAccountTrackUploads(session.user!);
if (trackUploads && !foundDupe) {
  // Update user uploads count
  // Update user bytes uploaded
  // Update top CPS if applicable
  // Write to disk files
}
```

### Fix #4: Skip conference stats for duplicates (Line 623)

**Before:**
```typescript
if (target && trackUploads) {
  target.uploads = (target.uploads || 0) + 1;
  // ...
}
```

**After:**
```typescript
// Express.e: Conference stats ONLY updated for successful uploads (not duplicates)
if (target && trackUploads && !foundDupe) {
  target.uploads = (target.uploads || 0) + 1;
  target.bytesUpload = (target.bytesUpload || 0) + data.size;
  // ...
}
```

### Fix #5: Skip callers log for duplicates (Line 639)

**Before:**
```typescript
// Always logged
await callersLog(session.user!.id, session.user!.username, "Uploaded file", currentFile.filename);
```

**After:**
```typescript
// Express.e: Only log successful uploads (not duplicates)
if (!foundDupe) {
  await callersLog(session.user!.id, session.user!.username, "Uploaded file", currentFile.filename);
}
```

### Fix #6: Skip BBS events for duplicates (Line 648)

**Before:**
```typescript
// Always emitted
emitUpload({ /* ... */ });
```

**After:**
```typescript
// Express.e: Only emit events for successful uploads (not duplicates)
if (!foundDupe) {
  try {
    const conference = await db.getConferenceById(session.currentConf);
    emitUpload({ /* ... */ });
  } catch (error) { /* ... */ }
}
```

### Fix #7: Skip webhooks for duplicates (Line 667)

**Before:**
```typescript
// Always triggered
await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, { /* ... */ });
```

**After:**
```typescript
// Express.e: Only trigger webhooks for successful uploads (not duplicates)
if (!foundDupe) {
  try {
    await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, { /* ... */ });
  } catch (error) { /* ... */ }
}
```

### Fix #8: sysopULStats called for ALL uploads (Line 688)

**Express.e Reference:** Line 19440 - `sysopULStats(hold)` called unconditionally

**NO CHANGE NEEDED:**
```typescript
// Update sysop upload statistics (express.e:19440)
// Express.e: sysopULStats(hold) called for ALL uploads - function differentiates based on hold parameter
try {
  await updateSysopUploadStats(
    conferencePath,
    session.currentConf,
    config.get("dataDir"),
    fileStatus === "hold" || fileStatus === "private"  // Correct - matches express.e
  );
} catch (error: any) { /* ... */ }
```

---

## Testing Scenarios

### Scenario 1: Upload 4 files, one duplicate
**Before:** Entire batch aborted on duplicate
**After:**
1. File 1 (new) - Uploaded successfully, stats credited
2. File 2 (duplicate) - Moved to HOLD, marked 'D', no stats credited, message shown
3. File 3 (new) - Uploaded successfully, stats credited
4. File 4 (new) - Uploaded successfully, stats credited
5. Batch completes normally

### Scenario 2: Duplicate with FILE_ID.DIZ
**Before:** Aborted after DIZ extraction
**After:** DIZ extracted, file moved to HOLD, marked 'D', batch continues

### Scenario 3: User stats verification
**Before:** User got credits for duplicate uploads
**After:** User only gets credits for new uploads, not duplicates

### Scenario 4: DIR file verification
**Before:** Duplicate not written to DIR (aborted)
**After:** Duplicate written to HOLD DIR file with 'D' marker

---

## What Gets Skipped for Duplicates

| Action | Normal Upload | Duplicate Upload |
|--------|---------------|------------------|
| Database INSERT | ✅ Yes | ❌ No (file already exists) |
| User stats/credits | ✅ Yes | ❌ No (express.e:19442) |
| Conference stats | ✅ Yes | ❌ No |
| Callers log | ✅ Yes | ❌ No |
| BBS events (LiveChat) | ✅ Yes | ❌ No |
| Webhooks | ✅ Yes | ❌ No |
| Sysop stats | ✅ Yes (hold=0) | ✅ Yes (hold=1) |
| DIR file write | ✅ Yes (Upload dir) | ✅ Yes (HOLD dir) |
| Move file to HOLD | ❌ No | ✅ Yes |
| Batch continuation | ✅ Yes | ✅ Yes |

---

## Files Modified

1. `web/backend/src/server/file-socket-handlers.ts` - All duplicate handling fixes

## Date Completed

2026-01-21

---

## Summary

Duplicate files now behave exactly like AmiExpress:
- ✅ Show message "File already exists, moving to [sysop]'s private directory"
- ✅ Move to HOLD directory with 'D' marker in DIR file
- ✅ Skip database insert (file already exists)
- ✅ Skip all user stats/credits (no credit for duplicates)
- ✅ Skip events/webhooks/logs
- ✅ Call sysopULStats with hold=true (tracks hold uploads separately)
- ✅ Continue processing remaining files in batch - NO ABORT

**Reference:** AmiExpress express.e lines 19371-19377, 19440, 19442-19448, 19466-19468
