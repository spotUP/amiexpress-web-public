# Session 2025-10-31: Complete Investigation Summary

**Date:** October 31, 2025
**Duration:** Extended session
**Status:** Partial Success - Loop exits but corrupts state

## Session Overview

This session involved deep investigation into why the GetAnswer door gets stuck in a polling loop and crashes. Multiple breakthroughs were achieved, but the final solution still needs refinement.

## Major Achievements

### 1. ✅ Signal/Wait Mechanism Implemented (Early Session)
- Extended Task interface with signal fields (sigRecvd, sigWait, state)
- Implemented proper Signal() function in ExecLibrary
- Implemented proper Wait() function
- Added Signal() call to PutMsg()
- **Result:** Infrastructure complete and working

### 2. ✅ Startup Message Sending (Mid Session)
- Implemented sendStartupMessage() in polling loop handler
- Message successfully queued to AEDoorPort0
- Signal() called correctly
- **Result:** Message infrastructure proven functional

### 3. ✅ A1 Register Mystery Solved (Late Session)
- Discovered A1=0x1 is INTENTIONAL by door code
- Found instruction is `MOVE.B ($2000,A1),D0` not `MOVE.B (A1),D0`
- Effective address = 0x1 + 0x2000 = 0x2001
- **Result:** Understanding of memory access pattern

### 4. ✅ Polling Loop Mechanism Decoded (Late Session)
- Disassembled complete loop structure
- Found TWO DBRA loops (first uses D0, second uses D2)
- Identified D2 timeout pattern (starts at 0xDEADBEEC)
- **Result:** Complete understanding of timeout mechanism

### 5. ⚠️ Partial Success: Loop Exit (Final)
- Implemented D2=0xFFFF force-exit
- Door exits loop at iteration 1027 (vs crashing at 1165)
- **Issue:** Door jumps to invalid PC=0xe14f after exit
- **Result:** Loop exit achieved but state corrupted

## Technical Discoveries

### The Complete Polling Loop Structure

```assembly
; First delay loop (PC=0x1148 runtime)
0x160: MOVE.B (0x2002,A2),D0  ; Read byte
0x166: SUBQ.L #1,D2           ; Decrement D2
0x168: DBRA D0,-10            ; Loop on D0

; Setup between loops
0x16c: MOVE.B #$20,(0x2002,A0)
0x172: SUBQ.L #1,D2
0x174: MOVE.B #$22,(0x2002,A0)

; Second delay loop (PC=0x1156 runtime) - WHERE WE GET STUCK
0x17a: MOVE.B (0x2001,A1),D0  ; Read byte from A1+0x2000
0x17e: MOVE.L D1,D0           ; Overwrite with D1
0x180: DBRA D2,-8             ; Loop on D2

; Normal exit path
0x184: MOVE.B #$22,D0
0x188: MOVE.L A0,-(SP)
0x18a: BRA +74
```

### Register Behavior

**D2 Countdown Pattern:**
- Start: 0xDEADBEEC (3,735,924,972 - massive timeout!)
- Each iteration: D2 decrements by varying amounts
- Exit condition: D2.W == 0xFFFF
- Natural timeout: ~60,000 iterations to reach 0xFFFF

**Our Intervention:**
- At iteration 1000: Set D2=0xFFFF
- Loop continues modifying D2
- Loop exits at iteration 1027
- **Problem:** Registers corrupted, jumps to PC=0xe14f (invalid)

## Why D2=0xFFFF Causes Corruption

When we set D2=0xFFFF at iteration 1000:
1. Loop continues executing
2. Loop code modifies D2 with ADD and SUBQ operations
3. D2 value becomes unpredictable
4. DBRA exits based on corrupted D2
5. Register state is invalid
6. PC jumps to garbage address (0xe14f derived from D2!)

## Files Modified This Session

### ExecLibrary.ts
- Lines 55-62: Extended Task interface
- Lines 128-136: Task initialization with signal fields
- Lines 831-850: PutMsg() calls Signal()
- Lines 1033-1099: Signal() and Wait() implementations

### AmigaDoorSession.ts
- Lines 129-136: Memory initialization for 0x2001
- Lines 760-774: Enhanced logging (D1, D2 registers)
- Lines 787-803: Startup message + D2 force-exit (PROBLEMATIC)
- Lines 799-806: Corrected effective address logging

## Current Status

### What Works ✅
- Signal/Wait mechanism complete
- Startup message sending works
- Message queuing to ports works
- Loop structure fully understood
- Door DOES exit polling loop (iteration 1027)

### What Doesn't Work ❌
- Door jumps to invalid PC after loop exit
- Register state corrupted by D2 manipulation
- Door doesn't reach message processing phase
- No door command handlers called yet

## The Core Problem

**We're fighting the door's timeout mechanism instead of satisfying its actual requirement.**

The door is waiting for SOMETHING during the timeout loop. Options:
1. A specific memory value change
2. A library call to return specific data
3. Message port activity
4. Signal delivery

Simply forcing the timeout to expire causes corrupted state.

## Recommendations for Next Session

### Option 1: Let Loop Run Naturally (Recommended)
- Remove D2 force-exit
- Instead, deliver what the door is actually waiting for
- Check if startup message arrival should trigger memory change
- Monitor for library calls during loop

### Option 2: Skip Loop Entirely
- Change PC to 0x1160 (after DBRA instruction)
- Preserve register state
- Manually set up expected post-loop state

### Option 3: Try Different Door
- Test MultiTop to see if it has same pattern
- Validate our infrastructure with working door
- Come back to GetAnswer with more knowledge

### Option 4: Analyze Original BBS
- Check express.e for how BBS initializes doors
- Look for shared memory setup
- Find what door expects during startup

## Session Statistics

- **Iterations analyzed:** 0-1027
- **Code sections disassembled:** 5
- **Files modified:** 2 (ExecLibrary.ts, AmigaDoorSession.ts)
- **Breakthroughs:** 4 major
- **Bugs fixed:** Signal/Wait, Message sending
- **Bugs remaining:** Loop exit corruption
- **Documentation created:** 4 files

## Key Learnings

1. **Don't force CPU state** - Let code run naturally when possible
2. **DBRA loop exit** - Must preserve surrounding context
3. **Timeout mechanisms** - Indicate waiting for external event, not just delay
4. **68000 opcodes** - Effective addresses include displacement
5. **Register patterns** - 0xDEAD* values often indicate initialization/timeout values

## Conclusion

This session achieved significant progress in understanding the door execution mechanism. The Signal/Wait infrastructure is complete and correct. The polling loop structure is fully decoded.

The remaining challenge is to **properly satisfy the door's startup requirements** rather than forcing it past its timeout check.

The door IS capable of exiting the loop (proven at iteration 1027), but we need to do so in a way that preserves proper execution state.

---

**Next Session Priority:** Investigate what the door is actually waiting for during the timeout loop, rather than forcing premature exit.

**Estimated Completion:** 1-2 more sessions to achieve full door execution.
