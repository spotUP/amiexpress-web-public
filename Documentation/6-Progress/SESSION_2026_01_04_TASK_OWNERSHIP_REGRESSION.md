# Session 2026-01-04: AEDoorPort Task Ownership Regression

**Date:** 2026-01-04
**Issue:** AquaScan still hanging after INIT/STAT and EXPRESS_VERSION fixes
**Root Cause:** AEDoorPort ownership regressed from BBS Task to Door Task
**Status:** FIXED

---

## Problem

After fixing two XIM regressions (INIT/STAT messages and EXPRESS_VERSION), AquaScan was STILL hanging. The log showed:

```
[ExecLibrary] >>> GetMsg(port=0x100000)
[ExecLibrary]   No door messages in port (403 replies waiting for door)
```

GetMsg was returning 0 even though messages were in the queue. They were all classified as "replies" instead of regular messages.

---

## Root Cause

**AEDoorPort task ownership had the CORRECT/WRONG implementations backwards!**

**Introduced in:** Today's fix (commit d789b75cd)
**Original correct fix:** Dec 27, 2025 (see AQUASCAN_SIGNAL_FIX.md)

### What Happened

1. **Dec 27 Fix (CORRECT):** AQUASCAN_SIGNAL_FIX.md documented that AEDoorPort should be owned by **BBS Handler Task (0x88000)**
   - Prevents door from signaling itself
   - Real Amiga has TWO tasks: BBS task owns port, Door task runs binary

2. **Jan 4 Regression (WRONG):** Today's XIM_CRITICAL_REQUIREMENTS.md incorrectly stated AEDoorPort should be owned by **Door Task (0x90000)**
   - This caused the Dec 27 fix to be REVERTED
   - Code changed from `this.bbsTask` → `this.currentTask`
   - Created signal bit mismatch deadlock

### The Signal Mismatch Deadlock

When AEDoorPort is owned by Door Task (WRONG):

1. Door calls `PutMsg(AEDoorPort1, message)`
2. PutMsg calls `Signal(port->mp_SigTask, 1 << port->mp_SigBit)`
3. Door signals **itself** with signal bit 12 (mask 0x1000)
4. Door then calls `Wait(0x11000)` - waiting for bits 12 & 16
5. But it has bit 12 set from signaling itself - wrong timing!
6. Messages get classified as "replies" instead of regular messages
7. GetMsg(skipReplies=true) skips them all
8. Door hangs in infinite polling loop

When AEDoorPort is owned by BBS Task (CORRECT):

1. Door calls `PutMsg(AEDoorPort1, message)`
2. PutMsg calls `Signal(port->mp_SigTask, 1 << port->mp_SigBit)`
3. Signals **BBS Task** (0x88000) with bit 12
4. Door runs separately, retrieves messages normally
5. No signal bit conflicts
6. Messages are regular messages, not replies
7. GetMsg returns them successfully

---

## The Fix

### 1. Corrected ExecLibrary.ts (Line 4712-4720)

**BEFORE (WRONG - today's regression):**
```typescript
// CRITICAL: Use DOOR task as owner
const portAddr = this.createPublicPort(
  name,
  this.currentTask,  // Door task, not BBS task
  AEDOORPORT_SIGBIT
);
```

**AFTER (CORRECT - restored Dec 27 fix):**
```typescript
// CRITICAL FIX (Dec 27): Create AEDoorPort with BBS Handler Task as owner
// This prevents the door from signaling itself when it sends messages.
// Real Amiga has TWO tasks: BBS task owns AEDoorPort, Door task runs binary.
const portAddr = this.createPublicPort(
  name,
  this.bbsTask,  // BBS task, not Door task
  AEDOORPORT_SIGBIT
);
```

### 2. Corrected XIM_CRITICAL_REQUIREMENTS.md

**Fixed Requirement #3:**
- Title: "AEDoorPort Must Be Owned by BBS Task" (was "Door Task")
- Correct: `this.bbsTask` (was `this.currentTask`)
- Wrong: `this.currentTask` (was `this.bbsTask`)
- Test: "owner=BBS Task 0x88000" (was "Door Task 0x90000")
- Added reference to AQUASCAN_SIGNAL_FIX.md

### 3. Corrected verify-xim-critical.sh

**Fixed Check #3:**
- Now checks for `this.bbsTask` (was `this.currentTask`)
- Rejects `this.currentTask` (was `this.bbsTask`)
- Error messages explain signal bit mismatch deadlock

---

## Verification

```bash
./dev/scripts/verify-xim-critical.sh
# [SUCCESS] All XIM critical requirements verified!
```

**Expected backend log:**
```
[ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000
  (sigBit=12, owner=BBS Task 0x88000)
```

**NOT:**
```
[ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000
  (sigBit=12, owner=Door Task 0x90000)
```

---

## Files Modified

1. **web/backend/src/amiga-emulation/api/ExecLibrary.ts**
   - Line 4718: Changed `this.currentTask` → `this.bbsTask`
   - Lines 4712-4716: Updated comment to explain BBS task ownership
   - Line 4727: Console log shows "BBS Task" instead of "Door Task"

2. **Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md**
   - Requirement #3: Completely rewritten with correct information
   - Added reference to AQUASCAN_SIGNAL_FIX.md
   - Fixed all code examples (swapped CORRECT/WRONG)
   - Updated test cases and verification commands
   - Added regression history entry

3. **dev/scripts/verify-xim-critical.sh**
   - Check #3: Now checks for `bbsTask` (not `currentTask`)
   - Updated error messages to explain signal deadlock
   - Swapped positive/negative checks

---

## Lesson Learned

**ALWAYS cross-reference with previous debug sessions before "fixing" something!**

The Dec 27 session (AQUASCAN_SIGNAL_FIX.md) had the CORRECT fix with detailed explanation:
- Signal bit mismatch deadlock
- Two-task architecture (BBS Task + Door Task)
- Why BBS task ownership is required

Today's session created XIM_CRITICAL_REQUIREMENTS.md WITHOUT checking AQUASCAN_SIGNAL_FIX.md, resulting in backwards documentation that caused the regression.

**Going forward:**
1. ALWAYS read `Documentation/6-Progress/archive/` before documenting "new" fixes
2. Search for related sessions: `grep -r "AEDoorPort" Documentation/6-Progress/`
3. Cross-reference with working code from previous fixes
4. Verify claims against reference Amiga logs
5. Test before documenting as "correct"

---

## Related Documentation

- **Original fix:** `Documentation/6-Progress/archive/2025-12/AQUASCAN_SIGNAL_FIX.md`
- **Requirements:** `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md` (now corrected)
- **Verification:** `dev/scripts/verify-xim-critical.sh` (now corrected)

---

## Next Steps

1. Test AquaScan with servers restarted
2. Verify "owner=BBS Task 0x88000" in logs
3. Confirm door completes without hanging
4. Test other XIM doors (J, WALL, Bulls, RTW)

---

**Session completed by:** Claude Sonnet 4.5
**Critical fix:** Restored Dec 27 BBS task ownership fix that was regressed today
