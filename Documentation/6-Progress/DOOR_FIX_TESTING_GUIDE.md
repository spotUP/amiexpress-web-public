# 68K Door Regression Fix - Testing Guide

## What Was Fixed

**Commit**: `6a8cd7609`
**File**: `web/backend/src/amiga-emulation/api/ExecLibrary.ts`
**Lines**: 635-643

### The Bug
After kickstart ROM refactor (commit `6a42affaa`), the library loader returned `address: 0` when ROM residents needed InitResident traps. This broke ALL XIM doors because AEDoor.library got a NULL address.

### The Fix
Changed lines 635-640 to NOT return early with address 0. Instead, schedule the trap and continue to load disk/stub libraries.

```typescript
// BEFORE (BROKEN):
if (this.hasPendingTrapJump()) {
  return { success: true, address: 0, isNative: true };  // ❌ NULL address!
}

// AFTER (FIXED):
if (this.hasPendingTrapJump()) {
  console.log(`InitResident trap scheduled, continuing with disk/stub loading`);
  // Fall through to load disk/stub libraries ✅
}
```

---

## Manual Testing Steps

### Prerequisites
1. Start BBS servers: `./dev/scripts/start-servers.sh`
2. Wait for servers to fully start (~30 seconds)
3. Open browser to `http://localhost:3001`
4. Login as a user (username: `spot`, password: `test`)

### Test 1: Bulletins (B Command)

**Expected BEFORE fix**:
- Lines appear one at a time
- Must press ENTER for each line
- Extremely slow display

**Expected AFTER fix**:
- Full bulletin displays instantly
- Smooth scrolling
- Normal screen buffering

**How to test**:
```
Command: B
```

**What to look for**:
- [ ] Bulletin text appears immediately (not line-by-line)
- [ ] No need to press ENTER repeatedly
- [ ] Full ANSI colors display correctly
- [ ] Can navigate with arrow keys
- [ ] Exits cleanly with Q

### Test 2: JoinConf (J Command)

**Expected BEFORE fix**:
- No output at all
- Command appears to hang
- Must kill session

**Expected AFTER fix**:
- Conference list displays immediately
- All conferences shown with numbers
- Can select conference with number

**How to test**:
```
Command: J
```

**What to look for**:
- [ ] Conference list appears immediately
- [ ] Shows all available conferences
- [ ] Each conference has:
  - [ ] Number
  - [ ] Name
  - [ ] Location
- [ ] Can select conference by number
- [ ] Can cancel with Q

### Test 3: FileRunner (FR Command)

**Expected BEFORE fix**:
- No output at all
- Command appears to hang

**Expected AFTER fix**:
- File browser displays
- Shows current directory
- Can navigate files

**How to test**:
```
Command: FR
```

**What to look for**:
- [ ] File list appears
- [ ] Directory path shown
- [ ] Files listed with sizes
- [ ] Can navigate with arrow keys
- [ ] Can exit with Q

---

## Log Verification

### Check Library Loading

Look for this in `logs/backend.log` (or door-specific logs):

**GOOD (Fixed)**:
```
[ExecLibrary] Hybrid OpenLibrary("aedoor.library", 0)
[ExecLibrary] InitResident trap scheduled for aedoor.library, continuing with disk/stub loading
[ExecLibrary] ✅ Loaded REAL aedoor.library at 0x0A1234
```

**BAD (Broken)**:
```
[ExecLibrary] Hybrid OpenLibrary("aedoor.library", 0)
[ExecLibrary] Awaiting InitResident trap for aedoor.library...
[ExecLibrary] ✅ Loaded REAL aedoor.library at 0x000000  ← NULL ADDRESS!
```

### Check XIM Messages

Look for XIM output messages in door logs (`logs/door-68k-*.log`):

**GOOD (Fixed)**:
```
[XIMProtocol] <<< XIM Command: 6 (JH_WRITE) data=0 string="Bulletin Title"
[XIMProtocol] <<< XIM Command: 6 (JH_WRITE) data=0 string="Line 1 of text"
[XIMProtocol] <<< XIM Command: 6 (JH_WRITE) data=0 string="Line 2 of text"
```

**BAD (Broken)**:
```
[No XIM messages - door hangs]
```

---

## Expected Results Summary

| Door | Before Fix | After Fix |
|------|-----------|-----------|
| **B** (Bulletins) | Line-by-line, press ENTER each | Full screen, instant |
| **J** (JoinConf) | No output, hangs | Conference list shown |
| **FR** (FileRunner) | No output, hangs | File browser works |

---

## Technical Verification

### Code Review Checklist

- [x] **ExecLibrary.ts lines 635-643**: No longer returns `address: 0`
- [x] **Fall-through logic**: Continues to disk/stub loading
- [x] **InitResident trap**: Still scheduled (via `requestTrapJump()`)
- [x] **TypeScript compiles**: No errors (`npx tsc --noEmit`)
- [x] **Comments added**: Explains why we don't return 0

### Runtime Verification

When a door executes, verify:

1. **Library loads with valid address**:
   ```
   AEDoor.library base = 0x0A1234 (NOT 0x000000)
   ```

2. **XIM messages flow**:
   ```
   Door sends: JH_WRITE messages
   BBS receives: BB_NONSTOPTEXT, BB_WRITE
   Output appears on screen
   ```

3. **No NULL pointer errors**:
   ```
   No "address 0x00000000" in logs
   No "invalid address" errors
   ```

---

## Quick Smoke Test

If you only have time for one test:

1. Start servers
2. Login to BBS
3. Type: `B` (Bulletins command)
4. **PASS**: Bulletin displays instantly with full text
5. **FAIL**: Lines appear one at a time, requires ENTER

If the smoke test passes, the fix is working!

---

## Troubleshooting

### If doors still don't work:

1. **Check servers restarted**:
   ```bash
   ./dev/scripts/kill-servers.sh
   ./dev/scripts/start-servers.sh
   ```

2. **Verify code deployed**:
   ```bash
   git log -1 --oneline
   # Should show: 6a8cd7609 fix(emulation): CRITICAL - Fix 68K door regression
   ```

3. **Check logs for errors**:
   ```bash
   tail -100 logs/backend.log | grep -i error
   ```

4. **Verify library base address**:
   ```bash
   grep "aedoor.library" logs/backend.log | tail -5
   # Should show non-zero address like 0x0A1234
   ```

---

## Reporting Results

After testing, report:

1. **B Command**: ✅ Pass / ❌ Fail
2. **J Command**: ✅ Pass / ❌ Fail
3. **FR Command**: ✅ Pass / ❌ Fail
4. **Logs**: Any errors seen?
5. **Performance**: Instant output or slow?

---

## Success Criteria

**The fix is successful if**:

- ✅ All three doors (B, J, FR) display output immediately
- ✅ No line-by-line ENTER pressing required
- ✅ AEDoor.library loads with non-zero address
- ✅ XIM messages flow normally in logs
- ✅ No NULL pointer or address 0x000000 errors

**The fix failed if**:

- ❌ Doors still have no output
- ❌ Still need to press ENTER per line
- ❌ AEDoor.library shows address 0x000000
- ❌ No XIM messages in logs

---

**Created**: 2024-12-22
**Fix Commit**: 6a8cd7609
**Related Issue**: Kickstart ROM refactor regression (commit 6a42affaa)
