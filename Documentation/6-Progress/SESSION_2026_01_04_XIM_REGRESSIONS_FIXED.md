# Session 2026-01-04: XIM Regressions Fixed (All Previous Fixes Restored)

**Date:** 2026-01-04
**Issue:** AquaScan still hanging after "fixes"
**Root Cause:** Two critical regressions - both previously fixed but reverted
**Status:** FIXED by reading previous markdown documentation

---

## Summary

Today's session introduced TWO regressions that were already fixed in December 2025. Both issues were documented in markdown files that weren't consulted before implementing "fixes".

**Lesson Learned:** ALWAYS read previous debug session markdowns BEFORE fixing something!

---

## Regression #1: AEDoorPort Task Ownership

**Documented in:** `Documentation/6-Progress/archive/2025-12/AQUASCAN_SIGNAL_FIX.md` (Dec 27)

### The Problem
AEDoorPort ownership had CORRECT/WRONG implementations backwards in today's XIM_CRITICAL_REQUIREMENTS.md.

**Dec 27 Fix (CORRECT):** AEDoorPort owned by **BBS Handler Task (0x88000)**
**Today's Regression (WRONG):** Changed to **Door Task (0x90000)**

### Why This Matters
Real Amiga has TWO tasks:
- **BBS Handler Task (0x88000)** - Owns AEDoorPort, handles messages from door
- **Door Task (0x90000)** - Runs door binary

When door calls `PutMsg(AEDoorPort, msg)`:
- Correct: Signals BBS task with bit 12
- Wrong: Door signals itself with bit 12, causing signal mismatch deadlock

### The Fix
```typescript
// web/backend/src/amiga-emulation/api/ExecLibrary.ts:4718
const portAddr = this.createPublicPort(
  name,
  this.bbsTask,  // BBS task, not Door task
  AEDOORPORT_SIGBIT
);
```

---

## Regression #2: BBS Sending INIT/STAT Messages

**Documented in:**
- `Documentation/6-Progress/archive/2025-12/XIM_INITIALIZATION_PROTOCOL.md`
- `Documentation/6-Progress/archive/2025-12/RTW_DEBUG_SESSION.md` (Change 4)

### The Problem
Today's XIM_CRITICAL_REQUIREMENTS.md stated that BBS MUST send INIT/STAT messages. This is **completely backwards**.

**XIM Protocol (CORRECT):** Door sends JH_REGISTER first, BBS waits and responds
**Today's Regression (WRONG):** BBS sends INIT/STAT first

### Why This Matters
Per express.e lines 4316-4370 and XIM_INITIALIZATION_PROTOCOL.md:

1. BBS creates AEDoorPort
2. BBS launches door
3. **BBS calls Wait(ximSig) - WAITS for door**
4. Door calls PutMsg with JH_REGISTER (cmd=1)
5. BBS GetMsg() receives it
6. BBS sends ReplyMsg() back
7. Door continues with requests

**Critical Rule**: "The BBS does NOT send any initial messages to XIM doors. The BBS creates the port, launches the door process, and WAITS for the door to send the first message."

### The Fix
```typescript
// web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:240
sendStartupMessage(): void {
  console.log("[DoorMessageHandler] XIM door started - waiting for door to send JH_REGISTER");
  this.sentInitialMessage = true;
  // DO NOT CALL: this.sendInitAndStatusMessages(); - BBS never sends first!
}
```

---

## Files Modified

### Code Fixes

1. **web/backend/src/amiga-emulation/api/ExecLibrary.ts**
   - Line 4718: Changed `this.currentTask` → `this.bbsTask`
   - Updated comments to reference AQUASCAN_SIGNAL_FIX.md
   - Console log now shows "owner=BBS Task 0x88000"

2. **web/backend/src/amiga-emulation/session/DoorMessageHandler.ts**
   - Lines 240-249: Removed sendInitAndStatusMessages() call
   - Added comment explaining BBS waits for door to send first
   - References XIM_INITIALIZATION_PROTOCOL.md

### Documentation Fixes

3. **Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md**
   - Requirement #1: Completely rewritten - "BBS Does NOT Send INIT/STAT"
   - Requirement #3: Fixed task ownership (BBS Task, not Door Task)
   - Added references to XIM_INITIALIZATION_PROTOCOL.md and AQUASCAN_SIGNAL_FIX.md
   - Fixed all code examples (swapped CORRECT/WRONG)
   - Updated verification commands

4. **dev/scripts/verify-xim-critical.sh**
   - Check #1: Now verifies "waiting for door to send JH_REGISTER"
   - Check #1: Rejects sendInitAndStatusMessages() calls
   - Check #3: Now checks for `bbsTask` (not `currentTask`)
   - Updated all error messages

5. **Documentation/6-Progress/SESSION_2026_01_04_TASK_OWNERSHIP_REGRESSION.md**
   - NEW - Documents the AEDoorPort task ownership regression

6. **Documentation/6-Progress/SESSION_2026_01_04_XIM_REGRESSIONS_FIXED.md**
   - NEW - This file, comprehensive summary

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
[DoorMessageHandler] XIM door started - waiting for door to send JH_REGISTER
```

**NOT:**
```
[ExecLibrary] Created AEDoorPort "AEDoorPort1" at 0x100000
  (sigBit=12, owner=Door Task 0x90000)
[DoorMessageHandler] Sending INIT/STAT startup messages for XIM door
```

---

## Key Insights

### Why These Regressions Happened

1. **Created XIM_CRITICAL_REQUIREMENTS.md without reading previous sessions**
   - Dec 27 already documented correct behavior
   - XIM_INITIALIZATION_PROTOCOL.md had full explanation
   - Assumed current broken code was correct

2. **Contradictory symptoms led to wrong conclusions**
   - AquaScan hung in polling loop
   - Assumed it was waiting for INIT/STAT from BBS
   - Reality: Door was waiting to START because port ownership was wrong

3. **Didn't cross-reference with working implementations**
   - RTW_DEBUG_SESSION.md explicitly said "Remove BBS-initiated INIT/STAT"
   - AQUASCAN_SIGNAL_FIX.md explained the two-task architecture
   - XIM_INITIALIZATION_PROTOCOL.md had express.e source analysis

### Prevention Going Forward

**BEFORE implementing any "fix":**

1. Search `Documentation/6-Progress/archive/` for related sessions
   ```bash
   grep -r "AEDoorPort\|INIT.*STAT\|XIM.*protocol" Documentation/6-Progress/
   ```

2. Read relevant markdown files in full
   - Don't skim
   - Don't assume current code is correct
   - Trust documented fixes over broken code

3. Check for contradictions
   - If two docs say opposite things, investigate which is newer/correct
   - Look for express.e source references

4. Verify claims against reference logs
   - `Documentation/4-Door-Developers/*.log` - Real Amiga behavior
   - Compare actual vs expected message sequences

5. Test before documenting
   - Don't document "fixes" that don't work
   - Restart servers and verify behavior

---

## Related Documentation

### Previous Fixes (That Were Regressed)
- `Documentation/6-Progress/archive/2025-12/AQUASCAN_SIGNAL_FIX.md` - Task ownership fix
- `Documentation/6-Progress/archive/2025-12/XIM_INITIALIZATION_PROTOCOL.md` - Protocol sequence
- `Documentation/6-Progress/archive/2025-12/RTW_DEBUG_SESSION.md` - Remove INIT/STAT

### Updated Documentation
- `Documentation/3-Developers/XIM_CRITICAL_REQUIREMENTS.md` - Now correct
- `dev/scripts/verify-xim-critical.sh` - Now checks correct patterns

### Reference Material
- `express.e` lines 4316-4370 - BBS XIM message loop (via MCP)
- `Documentation/4-Door-Developers/REAL_AMIGA_XIM_SEQUENCES.md` - Real logs

---

## Next Steps

1. **Restart servers** to pick up fixes
2. **Test AquaScan (N, NSU, CS, F, FR commands)**
3. **Test other XIM doors (J, RTW, Bulls, WALL)**
4. **Verify logs show:**
   - "owner=BBS Task 0x88000"
   - "waiting for door to send JH_REGISTER"
   - Door sends JH_REGISTER (cmd=1)
   - No INIT/STAT from BBS

---

**Session completed by:** Claude Sonnet 4.5

**Critical lesson:** Read the fucking markdowns before "fixing" things!
