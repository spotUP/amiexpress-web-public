# Flagged Files Persistence Fix

## User Report
User flagged a file with 'F' command while listing files with FR (AquaScan), then quit FR and pressed 'D' to download the flagged file, but it wasn't flagged.

**Expected:** File flagged in FR should remain flagged after exiting door
**Actual:** Flagged file was lost when door exited

---

## Root Causes

### Issue #1: Flagged files stored in separate `bbsSession` object

**Problem:** Flagged files stored in separate `bbsSession` object, not main `session` object

### Data Flow Issue:

1. **FR Door Flags File:**
   - Door sends `JH_FLAGFILE` XIM command with filename
   - XIM handler receives command in `system-commands.ts:655`
   - Stores in `bbsSession.flaggedFiles` array (line 663-673)

2. **Door Exits:**
   - `bbsSession` object discarded
   - Flagged files lost

3. **User Presses 'D' to Download:**
   - Download handler checks `session.flaggedFiles` (download.handler.ts:108)
   - File not found (it's in the discarded `bbsSession.flaggedFiles`)

### Why This Happens:

**`bbsSession` is NOT the main `session` object!**

When launching a 68K door (door.handler.ts:647-674), a **new bbsSession object** is created:

```typescript
const amigaSession = new AmigaDoorSession(socket, {
  executablePath: doorInfo.resolvedPath,
  bbsSession: {           // NEW OBJECT - not a reference to session!
    user: session.user,
    nodeNumber: session.nodeId || 0,
    currentConference: session.currentConference || 1,
    // ... other properties copied
  }
});
```

This is a **copy of data**, not a reference to the main session object. Changes to `bbsSession` inside the door don't affect the main `session` object.

---

### Issue #2: Download handler only searched Files/ directory

**Problem:** After fixing Issue #1, flagged files were successfully copied to `session.flaggedFiles`, but download handler couldn't find the files on disk.

**Symptoms:**
```
[Download] DEBUG: session.flaggedFiles=2
[Download] DEBUG: Searching for flagged file "AD-KMHH1.LHA" in conf 2
[Download] DEBUG: findFilesInConference returned 0 matches for "AD-KMHH1.LHA"
```

**Root Cause:** `findFilesInConference()` in download.handler.ts only searched `Conf{N}/Files/` directory, but newly uploaded files are stored in `Conf{N}/Upload/` directory.

**File Location:**
- Newly uploaded files: `Conf{N}/Upload/`
- Organized/older files: `Conf{N}/Files/`
- AquaScan (FR door) scans BOTH directories
- Download handler was only searching Files/ directory

**Impact:**
- Files flagged from newly uploaded files couldn't be found for download
- Files flagged from Files/ directory worked fine
- User couldn't download files they just uploaded and flagged

---

## Fixes Applied

### Fix #1: Copy flagged files from bbsSession to session

**Location:** `web/backend/src/handlers/door.handler.ts:794-803`

**Solution:** Copy flagged files from `bbsSession` back to `session` when door exits

**Code Added:**
```typescript
// Copy flagged files from door bbsSession back to main session
// Doors flag files via JH_FLAGFILE which stores in bbsSession.flaggedFiles
// Main BBS download handler checks session.flaggedFiles
if (Array.isArray((exitState as any).bbsSession?.flaggedFiles) && (exitState as any).bbsSession.flaggedFiles.length > 0) {
  if (!Array.isArray((session as any).flaggedFiles)) {
    (session as any).flaggedFiles = [];
  }
  (session as any).flaggedFiles.push(...(exitState as any).bbsSession.flaggedFiles);
  console.log(`[launchAmigaDoor] Copied ${(exitState as any).bbsSession.flaggedFiles.length} flagged files from door to session`);
}
```

**Placement:** Added after door exit, alongside existing code that copies:
- `returnCommand` (line 773-776)
- `chainCommand` (line 777-780)
- `prvCommand` (line 781-784)
- `acpCommand` (line 785-792)

---

### Fix #2: Search both Upload/ and Files/ directories

**Location:** `web/backend/src/handlers/file/download.handler.ts:540-543`

**Solution:** Modified `findFilesInConference()` to search BOTH directories where files can be stored

**Code Changed:**
```typescript
// OLD: Only searched Files/ directory
const filesDir = path.join(confPath, 'Files');

// NEW: Search both directories
const searchDirs = [
  path.join(confPath, 'Upload'),  // Newly uploaded files
  path.join(confPath, 'Files')    // Older/organized files
];

for (const filesDir of searchDirs) {
  if (!fs.existsSync(filesDir)) {
    continue;
  }
  // ... search logic for both exact match and wildcards
}
```

**Why Both Directories:**
- AmiExpress stores newly uploaded files in `Upload/` directory
- Organized/moved files go to `Files/` directory
- File request doors (AquaScan/FR) scan both directories
- Download handler must match this behavior
- express.e searches both locations for file downloads

---

## How It Works

### Before Fixes:

```
1. User flags AD-KMHH1.LHA in FR door (file is in Conf2/Upload/)
   └─> Stored in bbsSession.flaggedFiles = [{filename: "AD-KMHH1.LHA", confNum: 2}]

2. User quits FR
   └─> Door exits
   └─> bbsSession object discarded ❌ (Issue #1)
   └─> session.flaggedFiles = [] (empty)

3. User presses D to download
   └─> Download handler checks session.flaggedFiles
   └─> Result: No files flagged ❌
```

### After Fix #1 (but before Fix #2):

```
1. User flags AD-KMHH1.LHA in FR door (file is in Conf2/Upload/)
   └─> Stored in bbsSession.flaggedFiles = [{filename: "AD-KMHH1.LHA", confNum: 2}]

2. User quits FR
   └─> Door exits
   └─> getExitState() returns { bbsSession: {...}, ximState: {...} }
   └─> Copy bbsSession.flaggedFiles → session.flaggedFiles ✅
   └─> session.flaggedFiles = [{filename: "AD-KMHH1.LHA", confNum: 2}]

3. User presses D to download
   └─> Download handler checks session.flaggedFiles
   └─> Finds flagged file: "AD-KMHH1.LHA"
   └─> Calls findFilesInConference(dataDir, 2, "AD-KMHH1.LHA")
   └─> Only searches Conf2/Files/ directory ❌ (Issue #2)
   └─> File is in Conf2/Upload/, not Files/
   └─> Result: 0 matches, no download ❌
```

### After Both Fixes:

```
1. User flags AD-KMHH1.LHA in FR door (file is in Conf2/Upload/)
   └─> Stored in bbsSession.flaggedFiles = [{filename: "AD-KMHH1.LHA", confNum: 2}]

2. User quits FR
   └─> Door exits
   └─> getExitState() returns { bbsSession: {...}, ximState: {...} }
   └─> Copy bbsSession.flaggedFiles → session.flaggedFiles ✅
   └─> session.flaggedFiles = [{filename: "AD-KMHH1.LHA", confNum: 2}]

3. User presses D to download
   └─> Download handler checks session.flaggedFiles
   └─> Finds flagged file: "AD-KMHH1.LHA"
   └─> Calls findFilesInConference(dataDir, 2, "AD-KMHH1.LHA")
   └─> Searches Conf2/Upload/ AND Conf2/Files/ ✅ (Fix #2)
   └─> Finds file in Conf2/Upload/AD-KMHH1.LHA ✅
   └─> Result: File ready for download ✅
```

---

## Data Structure

### JH_FLAGFILE Storage (system-commands.ts:670-673):
```typescript
(this.bbsSession as any).flaggedFiles.push({
  filename: fileName,
  confNum: confNum
});
```

### Download Handler Retrieval (download.handler.ts:108-112):
```typescript
if (Array.isArray((session as any).flaggedFiles)) {
  (session as any).flaggedFiles.forEach((f: any) => {
    const name = f.filename || f.fileName || f.name;
    if (name) {
      flagged.push({ confNum: f.confNum || -1, filename: name });
    }
  });
}
```

**Format:** `{ filename: string, confNum: number }`

---

## Testing

### Test Case 1: Single file from Upload/ directory
1. Run `FR` (AquaScan)
2. Press `F` and enter filename from Upload/ directory (e.g., AD-KMHH1.LHA)
3. Quit FR with `Q`
4. Press `D` to download
5. Press Enter (use flagged files)
6. **Expected:** File appears in download list
7. **Actual:** ✅ Works (Fix #1 persists flagging, Fix #2 finds file in Upload/)

### Test Case 2: File from Files/ directory
1. Run `FR`
2. Flag file from Files/ directory
3. Quit FR
4. Press `D` and Enter
5. **Expected:** File appears in download list
6. **Actual:** ✅ Works (searches both directories)

### Test Case 3: Multiple files from both directories
1. Run `FR`
2. Flag 2 files from Upload/, 1 file from Files/
3. Quit FR
4. Press `D` and Enter
5. **Expected:** All 3 files in download list
6. **Actual:** ✅ Works (array spread operator copies all, both directories searched)

### Test Case 4: Flag in different conferences
1. Join Conf1, run FR, flag file in Upload/
2. Quit FR
3. Join Conf2, run FR, flag file in Upload/
4. Quit FR
5. Press `D` and Enter
6. **Expected:** Both files shown with correct conference numbers
7. **Actual:** ✅ Works (confNum preserved, both Upload/ directories searched)

### Test Case 5: Flag files, then flag more in another door
1. Run FR, flag 2 files, quit
2. Run another door that flags files, flag 1 file, quit
3. Press `D` and Enter
4. **Expected:** All 3 files flagged
5. **Actual:** ✅ Works (push appends to existing array)

---

## Code Path Reference

### Flagging Flow:
1. `doors/AquaScan/AquaScan.020` sends JH_FLAGFILE XIM command
2. `amiga-emulation/xim/XIMProtocol.ts` receives message
3. `amiga-emulation/xim/system-commands.ts:655` handleFlagFile()
4. Stores in `bbsSession.flaggedFiles` (line 670-673)

### Door Exit Flow:
1. `handlers/door.handler.ts:744` `await amigaSession.start()` completes
2. `amiga-emulation/AmigaDoorSession.ts:1001` getExitState() called
3. Returns `{ ximState, bbsSession }` (line 1005-1008)
4. `handlers/door.handler.ts:770-803` processes exitState
5. **NEW:** Copies flaggedFiles from bbsSession to session (line 794-803)

### Download Flow:
1. User presses `D` command
2. `handlers/file/download.handler.ts:58` handleDownloadCommand()
3. Checks `session.flaggedFiles` (line 108-112)
4. Lists flagged files for download

---

## Similar Patterns

This fix follows the existing pattern for copying door state back to session:

| Data | Source | Destination | Line |
|------|--------|-------------|------|
| returnCommand | ximState.returnCommand | session.returnCommand | 773-776 |
| chainCommand | ximState.chainCommand | session.chainCommand | 777-780 |
| prvCommand | ximState.prvCommand | session.prvCommand | 781-784 |
| acpCommand | bbsSession.acpCommand | session.acpCommand | 785-792 |
| **flaggedFiles** | **bbsSession.flaggedFiles** | **session.flaggedFiles** | **794-803** |

---

## Files Modified

1. `web/backend/src/handlers/door.handler.ts` - Added flaggedFiles copy on door exit (lines 794-803, 2414-2425)
2. `web/backend/src/handlers/file/download.handler.ts` - Modified findFilesInConference() to search both Upload/ and Files/ directories (lines 540-586)

## Date Completed

2026-01-21

---

## Summary

Flagged files now persist correctly and can be found for download:

**Issue #1 - Persistence (FIXED):**
- ✅ Files flagged via JH_FLAGFILE XIM command stored in bbsSession
- ✅ When door exits, flaggedFiles copied to main session object
- ✅ Download handler finds flagged files in session.flaggedFiles
- ✅ Follows existing pattern for copying door state (returnCommand, chainCommand, etc.)

**Issue #2 - File Location (FIXED):**
- ✅ Download handler now searches both Upload/ and Files/ directories
- ✅ Newly uploaded files in Upload/ can be found and downloaded
- ✅ Older organized files in Files/ can still be found and downloaded
- ✅ Matches AquaScan/FR door behavior (searches both directories)
- ✅ Follows express.e pattern for file location searches

**Result:**
- ✅ User can flag files in doors (F command)
- ✅ Files persist after exiting door
- ✅ Files found in both Upload/ and Files/ directories
- ✅ User can download flagged files with D command
- ✅ Complete end-to-end file flagging workflow functional
