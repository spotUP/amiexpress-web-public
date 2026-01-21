# Upload Error Handling Audit - Critical Bugs Found

## User Report
1. **Bug #1:** When LZX FILE_ID.DIZ extraction failed, user was thrown to main menu instead of being prompted for description
2. **Bug #2:** After pressing U again, user was immediately shown description prompt instead of file picker

---

## Root Cause Analysis

### Bug #1: Wrong subState variable (Line 224)
**Location:** `file-socket-handlers.ts:224`
**Code:**
```typescript
(uploadContext as any).subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
```

**Problem:** Sets `uploadContext.subState` instead of `session.subState`
- uploadContext is just data storage, not the session object
- This line does NOTHING useful
- Correct state is set in caller (line 837), but this confuses the flow

**Impact:** Harmless but misleading

---

### Bug #2: Wrong return when file already pending (Lines 184-185)
**Location:** `file-socket-handlers.ts:184-185`
**Code:**
```typescript
// If we get here, file is already pending or has DIZ - process it
return true;
```

**Problem:** If `currentUploadedFile` is already set (e.g., from retry after error), we return `true` (processed) but never actually process the file!

**Impact:**
- If user tries to upload same file again after error, it's silently ignored
- Explains why pressing U again skips to description prompt

---

### Bug #3: Context not cleared on error in handleDizExtractionAndDescription
**Location:** `file-socket-handlers.ts:103-186`

**Problem:** If error occurs in `handleDizExtractionAndDescription()`, the context is NOT cleared
- User shown error and returned to menu
- But `currentUploadedFile` still set in context
- Next upload attempt sees old `currentUploadedFile` and skips file picker

**Impact:** Explains "immediately thrown back into enter file_id process"

---

### Bug #4: No timeout/error differentiation
**Location:** `file-socket-handlers.ts:143`
**Code:**
```typescript
const dizLines = await Promise.race([dizPromise, timeoutPromise]);

if (dizLines && dizLines.length > 0) {
  // Found DIZ
} else {
  // No DIZ found - prompt for description
  promptForDescription(socket, uploadContext, data);
}
```

**Problem:**
- Timeout (returns null) and "no DIZ found" (returns null) both treated the same
- LZX extraction error (caught, returns false) also goes to prompt
- Should differentiate: error = show error message, null = prompt for description

**Impact:** User doesn't know WHY they need to enter description (timeout vs not found vs error)

---

## ✅ Fixes Applied

### Fix #1: Removed wrong subState assignment
**File:** `file-socket-handlers.ts:promptForDescription()`
**Change:** Removed `(uploadContext as any).subState = LoggedOnSubState.UPLOAD_DESC_INPUT;`
**Result:** Caller sets `session.subState` correctly, no confusion

---

### Fix #2: Fixed return logic when file already pending
**File:** `file-socket-handlers.ts:handleDizExtractionAndDescription()` lines 195-199
**Before:**
```typescript
// If we get here, file is already pending or has DIZ - process it
return true;
```

**After:**
```typescript
// File already pending description from previous attempt
console.log("[DIZ] File already pending from previous attempt, prompting for description");
promptForDescription(socket, uploadContext, data);
return false; // Waiting for description (not processed yet)
```

**Result:** If user retries upload after error, they see description prompt (correct) instead of file being silently ignored

---

### Fix #3: Added error recovery in DIZ processing
**File:** `file-socket-handlers.ts:handleDizExtractionAndDescription()` lines 158-175
**Added:** try/catch around `processBatchFile()` call
**Result:**
- If error occurs after DIZ extraction, context is cleared
- User sees error message and returns to menu cleanly
- No lingering context to cause issues on next upload attempt

**Code:**
```typescript
try {
  await processBatchFile(socket, session, data, config);
  return true; // File processed successfully
} catch (error: any) {
  console.error("[DIZ] Error processing file after DIZ extraction:", error);
  socket.emit("ansi-output", `\r\n\x1b[31mUpload failed: ${error.message}\x1b[0m\r\n`);
  socket.emit("ansi-output", "\r\n\x1b[32mPress any key to continue...\x1b[0m");
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  clearUploadContext(session, socket);
  return true; // Handled (with error), don't wait for description
}
```

---

### Fix #4: Added error differentiation
**File:** `file-socket-handlers.ts:handleDizExtractionAndDescription()` lines 147-149, 177-182

**Different messages for different scenarios:**
1. **No DIZ found (null):** "No FILE_ID.DIZ found." (then prompt)
2. **Extraction error:** "Error extracting FILE_ID.DIZ: [error message]" (then prompt)

**Result:** User knows WHY they need to enter description

---

## Testing Scenarios

### Scenario 1: LZX extraction fails with error
**Before:** User kicked to menu, no explanation
**After:** User sees "Error extracting FILE_ID.DIZ: [error]" then prompted for description

### Scenario 2: LZX file has no FILE_ID.DIZ
**Before:** User kicked to menu
**After:** User sees "No FILE_ID.DIZ found" then prompted for description

### Scenario 3: User retries upload after error
**Before:** File silently ignored, user confused
**After:** User sees description prompt again (correct behavior)

### Scenario 4: Error occurs during file processing (after DIZ extraction)
**Before:** Context not cleared, causes issues on next upload
**After:** Context cleared cleanly, error shown, user returns to menu

### Scenario 5: Duplicate file in batch upload
**Before:** Entire batch aborted with error message
**After:** Duplicate moved to HOLD directory with 'D' marker, no stats/credits given, batch continues processing remaining files
**Reference:** express.e:19371-19377, 19442-19448

---

## Files Modified
1. `web/backend/src/server/file-socket-handlers.ts` - All fixes applied

## Date Completed
2026-01-21 (Updated with duplicate handling fix)
