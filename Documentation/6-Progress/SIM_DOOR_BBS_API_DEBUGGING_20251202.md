# SIM Door BBS API Debugging Session - 2025-12-02

## Problem Summary

WHO door crashes before calling the BBS API dispatcher at 0x790.

## Implementation Status

### ✅ Completed:
1. **BbsApiLibrary.ts** created with stub dispatcher
2. **LibraryTraps.ts** enhanced with `registerCustomTrap()` method
3. **LibraryManager.ts** sets up BBS API for SIM doors
4. **Verified setup is correct**:
   - 0x790 contains 0x90d0 (trap address) ✓
   - 0x90d0 contains 0x4AFC (ILLEGAL instruction) ✓
   - Trap handler registered ✓

### ❌ Issue: WHO Crashes Before Dispatcher Called

**Crash details:**
```
PC out of code region: pc=0xf00160 (ROM exception handler)
A0 = 0xffec2f0b (WRONG! Should be 0x90d0)
lastPCs=[0x1174, 0x1178, 0x1364, 0x1366, 0x136a, 0x136e, 0xfffec8, 0xf00160]
```

**Expected execution at 0x1174-0x117c:**
```asm
0x1174: beq.b 0x117e          ; Branch if zero (should not branch)
0x1176: movea.l 0x790.l, a0   ; Load 0x90d0 into A0
0x117c: jsr (a0)               ; Call BBS API dispatcher at 0x90d0
```

**What's happening:**
- WHO reaches PC 0x1174 (the beq instruction)
- Somehow A0 ends up containing 0xffec2f0b (not 0x90d0)
- WHO crashes at ROM exception handler 0xf00160

## Analysis

### Theory 1: Memory Read Failure
- 0x790 is correctly set to 0x90d0 after setup
- But when WHO reads from 0x790, it gets wrong value
- Possible MOIRA memory read issue for low addresses?

### Theory 2: WHO Reads Wrong Address
- WHO uses absolute addressing (A4=0x0000)
- `movea.l 0x790.l, a0` should read absolute address 0x790
- Maybe WHO is reading from different location?

### Theory 3: Memory Corruption
- Something overwrites 0x790 between setup and WHO's read
- Watchpoints show no writes to 0x79x area
- Unlikely but possible

### Theory 4: Exception Handler Issue
- JSR to wrong address triggers address error exception
- Exception handler at 0xf00160 is called
- This is the symptom, not the cause

## Key Findings

1. **PC 0x1178 in lastPCs**: This is INSIDE the `movea.l` instruction (0x1176-0x117b). Suggests partial execution or unusual control flow.

2. **A0 value is wrong**: WHO's A0 contains 0xffec2f0b instead of expected 0x90d0.

3. **No corruption detected**: No writes to 0x790 area during execution.

4. **Setup is correct**: Verified immediately after initialization.

## Next Steps

### Debug Tasks:

1. **Add memory read logging for 0x790**
   - Log every time address 0x790 is read
   - Show PC, value read, and A0 after read
   - Verify WHO actually reads from 0x790

2. **Add execution logging near 0x1174**
   - Log PC, registers when WHO reaches first call site (0x1148)
   - Log PC, registers at second call site (0x1174)
   - Capture exact values before JSR

3. **Test simpler approach**
   - Instead of pointer at 0x790, try putting ILLEGAL directly at 0x790
   - Modify WHO call pattern to JSR directly to 0x790
   - See if direct approach works better

4. **Check MOIRA memory system**
   - Verify low-memory reads work correctly
   - Test reading from 0x790 in other contexts
   - Ensure chip RAM access is working

5. **Examine exception handling**
   - Check what exception is triggered
   - Log exception vector number
   - Verify exception handlers are correct

## Code Locations

**Setup code:**
- `web/backend/src/amiga-emulation/LibraryManager.ts:316-371`

**Dispatcher:**
- `web/backend/src/amiga-emulation/api/BbsApiLibrary.ts`

**Trap registration:**
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:932-962`

**WHO call sites:**
- First: 0x1148-0x115a (parameter block 0x794)
- Second: 0x116a-0x117c (parameter block 0x79c)

## Testing Commands

```bash
# Build backend
cd ~/Code/amiexpress-web/web/backend && npx tsc

# Test WHO door
cd ~/Code/amiexpress-web
BBS_DATA_DIR=~/Code/amiexpress-web \
AEDOOR_STDOUT=/tmp/who_test.out \
AEDOOR_ROM=kickstart \
timeout 5 node web/backend/dist/scripts/run-amiga-door.js doors/who/who 1

# Check logs
grep "BBS API" /tmp/who_test.out
grep "0x790" logs/backend.log
grep "PC out of code" logs/backend.log
```

## References

- **WHO Binary**: `doors/who/who`
- **WHO Analysis**: `Documentation/4-Door-Developers/WHO_BBS_API_ANALYSIS.md`
- **Implementation Plan**: `Documentation/4-Door-Developers/SIM_DOOR_0x790_IMPLEMENTATION_PLAN.md`
- **Discovery Session**: `Documentation/6-Progress/SIM_DOOR_ARCHITECTURE_DISCOVERY_20251202.md`
- **Handoff**: `handoff.md`

---

**Status**: Debugging in progress - setup works, execution fails
**Next Session**: Add detailed memory read/write logging to track 0x790 access
