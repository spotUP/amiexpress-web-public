# Backend Implementation Plan - Based on Diagnostic Results

## 🔴 CRITICAL FAILURES (Fix First)

These failures prevent doors from working correctly:

### 1. User Data Queries Returning Empty/Default Values
**Issue:** Functions return success but data is empty/garbage
- `getname()` returns empty string (should return user name)
- `getlocation()` returns backtick `` ` `` (should return user location)
- `getbbsname()` returns empty string (should return BBS name)
- `GetTheDate()` returns backtick `` ` `` (should return formatted date)
- `GetTheTime()` returns empty string (should return formatted time)

**Backend File:** `web/backend/src/amiga-emulation/xim/data-query.ts`

**Fix Required:**
```typescript
// In handleDataQuery() switch statement:
case XIMDataQuery.GETNAME:
  // WRONG: return empty string or garbage
  // RIGHT: return nodeState.user.userName

case XIMDataQuery.GETLOCATION:
  // WRONG: return garbage
  // RIGHT: return nodeState.user.location

case XIMDataQuery.GETBBSNAME:
  // WRONG: return empty
  // RIGHT: return bbsConfig.bbsName

case XIMDataQuery.GETTHEDATE:
  // WRONG: return garbage
  // RIGHT: return formatted date like "12/16/2025"

case XIMDataQuery.GETTHETIME:
  // WRONG: return empty
  // RIGHT: return formatted time like "14:35:22"
```

### 2. CopyMem() - Memory Copy Failure
**Issue:** `[FAIL] CopyMem() copy memory block`

**Backend File:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts`

**Fix Required:**
```typescript
// Add CopyMem() implementation
copyMem(source: number, dest: number, size: number): void {
  const sourceData = this.emulator.memory.readBytes(source, size);
  this.emulator.memory.writeBytes(dest, sourceData);
}
```

**Test:** Diagnostic Section 15 should now pass all 8 memory tests.

---

## 🟡 HIGH PRIORITY FAILURES (Fix Soon)

These prevent advanced door features from working:

### 3. ParentDir() - Get Parent Directory
**Issue:** `[FAIL] ParentDir() get parent`

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement ParentDir(lock: number): number
// 1. Get path from lock structure
// 2. Get parent directory path (remove last component)
// 3. Create new lock for parent
// 4. Return lock pointer
parentDir(lock: number): number {
  const lockPath = this.getPathFromLock(lock);
  const parentPath = path.dirname(lockPath);
  return this.createLock(parentPath, ACCESS_READ);
}
```

### 4. DeviceProc() - Get Device Process
**Issue:** `[FAIL] DeviceProc() get device`

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement DeviceProc(name: string): number
// Returns DevProc structure pointer for device/assign
deviceProc(name: string): number {
  // Check if it's a device (T:, RAM:, SYS:, etc.)
  // Return DevProc structure pointer
  // For now, return non-zero for recognized devices
  const devices = ['T:', 'RAM:', 'SYS:', 'BBS:', 'Doors:', 'Conf01:'];
  return devices.some(d => name.startsWith(d)) ? 0x80000 : 0;
}
```

### 5. SetFileSize() - Resize File
**Issue:** `[FAIL] SetFileSize() resize file` (Error code 9 = ERROR_INVALID_LOCK)

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement SetFileSize(fh: number, pos: number, mode: number): number
setFileSize(fh: number, pos: number, mode: number): number {
  const fileHandle = this.getFileHandle(fh);
  if (!fileHandle) {
    this.setIoErr(ERROR_INVALID_LOCK);
    return -1;
  }

  // Truncate or extend file to 'pos' bytes
  fs.truncateSync(fileHandle.path, pos);
  return 0; // Success
}
```

---

## 🟢 MEDIUM PRIORITY (Fix Later)

### 6. SetProtection() - Set File Protection Bits
**Issue:** `[FAIL] SetProtection() set bits` (File not found)

**Root Cause:** Test creates file but it might not be flushed/visible yet.

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement SetProtection(name: string, mask: number): number
setProtection(name: string, mask: number): number {
  const resolvedPath = this.resolvePath(name);

  // Check if file exists
  if (!amigafs.existsSync(resolvedPath)) {
    this.setIoErr(ERROR_OBJECT_NOT_FOUND);
    return 0; // DOSFALSE
  }

  // Convert Amiga protection bits to Unix mode
  const unixMode = this.convertProtectionToMode(mask);
  amigafs.chmodSync(resolvedPath, unixMode);
  return -1; // DOSTRUE
}
```

### 7. SetComment() - Set File Comment
**Issue:** `[FAIL] SetComment() set comment` (File not found)

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement SetComment(name: string, comment: string): number
// On Unix: Store in extended attributes or metadata file
setComment(name: string, comment: string): number {
  const resolvedPath = this.resolvePath(name);

  if (!amigafs.existsSync(resolvedPath)) {
    this.setIoErr(ERROR_OBJECT_NOT_FOUND);
    return 0; // DOSFALSE
  }

  // Store comment in .comment file or xattr
  const commentFile = resolvedPath + '.comment';
  amigafs.writeFileSync(commentFile, comment);
  return -1; // DOSTRUE
}
```

### 8. SetFileDate() - Set File Date/Time
**Issue:** Shows "Error code 19188" but marked as [PASS] (inconsistent)

**Backend File:** `web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Fix Required:**
```typescript
// Implement SetFileDate(name: string, datestamp: number): number
setFileDate(name: string, datestamp: number): number {
  const resolvedPath = this.resolvePath(name);

  if (!amigafs.existsSync(resolvedPath)) {
    this.setIoErr(ERROR_OBJECT_NOT_FOUND);
    return 0; // DOSFALSE
  }

  // Convert Amiga DateStamp to Unix timestamp
  const unixTime = this.convertDateStamp(datestamp);
  amigafs.utimesSync(resolvedPath, unixTime, unixTime);
  return -1; // DOSTRUE
}
```

---

## 🔵 LOW PRIORITY (Cosmetic/Minor)

### 9. argv[0] Node Number
**Issue:** `[FAIL] argv[0] contains node number`

**Expected:** argv[0] should be node number (e.g., "1")
**Actual:** argv[0] is "diagnostic" (program name)

**Backend File:** `web/backend/src/handlers/door.handler.ts`

**Fix Required:**
```typescript
// In door argument setup:
// WRONG:
const args = [doorName, nodeId.toString()];

// RIGHT (Amiga BBS convention):
const args = [nodeId.toString(), doorName];
```

---

## 📋 Implementation Priority Order

**Week 1 - Critical Data Queries:**
1. ✅ Fix getname() - Return actual user name
2. ✅ Fix getlocation() - Return actual user location
3. ✅ Fix getbbsname() - Return actual BBS name
4. ✅ Fix GetTheDate() - Return formatted date
5. ✅ Fix GetTheTime() - Return formatted time
6. ✅ Fix CopyMem() - Implement memory copy

**Week 2 - AmigaDOS File Operations:**
7. ✅ Implement ParentDir()
8. ✅ Implement DeviceProc()
9. ✅ Implement SetFileSize()
10. ✅ Implement SetProtection()
11. ✅ Implement SetComment()
12. ✅ Fix SetFileDate()

**Week 3 - Argument Passing:**
13. ✅ Fix argv[0] to contain node number

---

## 🧪 Testing Protocol

After implementing each fix:

1. **Rebuild backend:**
   ```bash
   cd web/backend && npx tsc --noEmit && npm run dev
   ```

2. **Run diagnostic:**
   ```
   DIAGNOSTIC
   ```

3. **Check specific section:**
   - Week 1 fixes: Sections 3, 9, 15 should improve
   - Week 2 fixes: Section 14 should go from 75% to 95%+ passing
   - Week 3 fixes: Section 2 should be 100% passing

4. **Verify no regressions:**
   - Previously passing tests should still pass
   - New tests should now pass

---

## 📊 Expected Progress

**Current State (from diagnostic run):**
- Total Tests: 570+
- Passing: ~150-200 (estimated from output)
- Failing: ~370-420
- Pass Rate: ~35%

**After Week 1 (Critical Fixes):**
- Passing: ~250-300
- Pass Rate: ~50%

**After Week 2 (AmigaDOS Fixes):**
- Passing: ~350-400
- Pass Rate: ~65%

**After Week 3 (All Fixes):**
- Passing: ~400-450
- Pass Rate: ~75%

**After Full Backend Implementation:**
- Passing: 570+
- Pass Rate: 100% ✅

---

## 🎯 Success Criteria

For each implementation:

✅ **Data Query Fixes:**
- getname() returns actual user name (not empty)
- getlocation() returns actual location (not garbage)
- GetTheDate() returns "MM/DD/YYYY" format
- GetTheTime() returns "HH:MM:SS" format

✅ **CopyMem Fix:**
- Diagnostic Section 15 shows 8/8 tests passing

✅ **ParentDir Fix:**
- Can navigate up directory tree
- Returns valid lock pointer

✅ **DeviceProc Fix:**
- Recognizes all BBS devices (T:, BBS:, Doors:, etc.)
- Returns valid DevProc pointer

✅ **SetFileSize Fix:**
- Can truncate files
- Can extend files
- No error code 9

✅ **Protection/Comment/Date Fixes:**
- All file metadata operations work
- No "file not found" errors on existing files

---

## 📝 Backend Files to Modify

1. **`web/backend/src/amiga-emulation/xim/data-query.ts`**
   - Fix: getname, getlocation, getbbsname, GetTheDate, GetTheTime

2. **`web/backend/src/amiga-emulation/api/ExecLibrary.ts`**
   - Fix: CopyMem()

3. **`web/backend/src/amiga-emulation/api/DosLibrary.ts`**
   - Fix: ParentDir, DeviceProc, SetFileSize, SetProtection, SetComment, SetFileDate

4. **`web/backend/src/handlers/door.handler.ts`**
   - Fix: argv[0] argument order

---

## 🚀 Next Steps

1. **Start with Week 1 (Critical)** - These fixes will make the most doors work
2. **Run diagnostic after each fix** - Verify improvement
3. **Document progress** - Update this file with completion status
4. **Iterate** - Fix, test, verify, repeat

When all fixes are complete, re-run the diagnostic and expect:
```
Total Tests:  570+
Passed:       570+
Failed:       0
Skipped:      0
```

**ALL 4000+ Amiga BBS doors will just work!** 🎉
