# Session Continuation - Current Status

**Date:** 2025-11-01 (Continued Session)
**Status:** 🔍 IN PROGRESS - Deep investigation of stack alignment issues

---

## Summary

Continued from previous session where MOVEM.L and JSR interception were fixed (22.6x improvement achieved!).

**Current Focus:** Stack corruption at ~48,000 iterations

**Root Cause Identified:** Stack pointer loses 4-byte alignment due to 6-byte M68K exception frames

**Status:** Attempted fixes not yet successful - investigation ongoing

---

##  Key Discoveries This Session

### 1. A6 Register Preservation Attempted
- **Theory:** A6=0x0 was causing jump to invalid address 0xffffd6
- **Implementation:** Added A6 preservation in both `handleTrap()` and `handleTrapByOffset()`
- **Result:** Not the root cause - stack was already corrupted before A6 issues appeared

### 2. Stack Misalignment Identified as Root Cause
- **Discovery:** SP becomes 2-byte aligned instead of 4-byte aligned starting at iteration ~210
- **Cause:** M68K exception frames are 6 bytes (SR=2 bytes, PC=4 bytes)
- **Impact:** Once misaligned, SP never recovers - corruption accumulates over 48,000 iterations

### 3. Exception Handler Analysis
```m68k
; Exception handler at 0xf00080:
ADDQ.L #5,(A7)    ; Skip offending instruction
RTE               ; Pop 6-byte exception frame
```

**Problem:** RTE pops 6 bytes, changing SP alignment from 4-byte to 2-byte

### 4. Attempted Fixes

#### Fix #1: Realign SP After RTE
```typescript
// Detect when we return from exception handler
if (pcBeforeExecute >= 0xf00000 && pcAfter Execute < 0xf00000) {
  if (sp % 4 !== 0) {
    this.emulator.setRegister(15, sp + 2);  // Realign
  }
}
```

**Status:** Partially working - fixes SOME exceptions but not the first one

#### Fix #2: Initialize SP to Maintain Alignment
```typescript
const finalSP = 0xFDFFA;  // 4n+2 address
// Theory: After exception (-6), SP = 4n-4 = 4(n-1) (aligned!)
```

**Status:** Not working - still getting misalignment

---

## Current Issues

### Issue #1: SP Realignment Not Catching Early Exceptions
- First exception occurs around iteration 210
- Fix doesn't trigger for that exception
- Possible reasons:
  - Timing: Fix checks after execute(), but exception+RTE might happen in single cycle
  - Detection: pcBefore/pcAfter check might not catch all RTE executions
  - Moira behavior: Single-cycle execution might not separate exception from return

### Issue #2: Door Executes in ROM Space
- After changes, door gets stuck in ROM (PC in 0xfec00-0xfee00)
- Executes over 1,000 iterations in ROM before crash
- Suggests door is waiting for something (likely I/O)

### Issue #3: Stack Still Contains Corrupted Values
Even with alignment fixes attempted, stack shows:
```
SP+0: 0xfdf40 = 0x2b480000
```

Should be:
```
SP+0: 0xfdf40 = 0x00002b48
```

Pattern suggests endianness issue or wrong address being pushed

---

## Technical Details

### M68K Exception Frame Structure
```
Exception pushes (6 bytes total):
  [SP-6]: SR (Status Register) - 2 bytes
  [SP-4]: PC (Program Counter) - 4 bytes

RTE pops (6 bytes):
  SR ← (SP)+    ; 2 bytes
  PC ← (SP)+    ; 4 bytes

Net effect: SP += 6 bytes (breaks 4-byte alignment!)
```

### Stack Alignment Math
```
If SP starts 4-byte aligned (SP % 4 = 0):
  Exception: SP -= 6 → SP % 4 = 2 (MISALIGNED!)
  RTE: SP += 6 → SP % 4 = 0 (aligned again)

But if exception occurs DURING execution:
  SP might not return to same alignment

Solution attempted: Start SP at 4n+2
  Initial: SP % 4 = 2
  Exception: SP -= 6 → (4n+2) - 6 = 4n-4 = 4(n-1) (aligned!)
  RTE: SP += 6 → 4(n-1) + 6 = 4n+2 (back to 4n+2)
```

### Why This Matters
- M68K requires 4-byte alignment for optimal performance
- Misaligned stack operations can:
  - Read wrong values (off by 2 bytes)
  - Write to wrong addresses
  - Corrupt return addresses over time

---

## Files Modified This Session

### AmigaDoorSession.ts
- Lines 1318-1352: SP alignment check and realignment after RTE
- Line 366: Changed finalSP to 0xFDFFA for better alignment
- SP alignment verification added after execute()

### LibraryTraps.ts
- Lines 720-741 (`handleTrap`): A6 preservation logic
- Lines 865-886 (`handleTrapByOffset`): A6 preservation logic
- Both methods now restore A6 to library base after trap execution

### Documentation Created
- `STACK_CORRUPTION_ROOT_CAUSE_FOUND.md` - Initial A6 investigation
- `STACK_MISALIGNMENT_ROOT_CAUSE.md` - Exception frame analysis
- `SESSION_CONTINUATION_STATUS.md` - This document

---

## What We Know Works

✅ **MOVEM.L fix at 0x1744** - Working perfectly (from previous session)
✅ **JSR trap interception** - Working correctly (from previous session)
✅ **A6 preservation** - Implemented in trap handlers
✅ **Exception detection** - We can detect when exceptions occur
✅ **SP realignment code** - Logic is correct, catches SOME exceptions

---

## What's Not Working

❌ **Early exception alignment** - First exception at ~iteration 210 not caught
❌ **Consistent SP alignment** - Still getting STACK MISALIGNMENT warnings
❌ **Door I/O loop** - Door gets stuck in ROM waiting loop
❌ **Stack values** - Still seeing 0xXXXX0000 pattern instead of 0x0000XXXX

---

## Next Steps (Recommended)

### Option A: Deep Dive into First Exception
1. Add extensive logging around iterations 200-220
2. Log PC, SP, and all registers before/after EVERY execute()
3. Identify exact instruction that causes first exception
4. Understand why alignment fix doesn't trigger

### Option B: Different Approach - Prevent Exceptions
1. Find out WHY exceptions are happening
2. Fix the root cause (invalid memory access? illegal instruction?)
3. If no exceptions occur, no alignment issues!

### Option C: Emulate Real Amiga Exception Handling
1. Research how real AmigaOS handles exception frames
2. Implement proper exception stack management
3. Use separate supervisor stack vs user stack

### Option D: Revisit Moira Configuration
1. Check if Moira has settings for exception handling
2. Verify we're using Moira correctly for single-cycle execution
3. Consider if CYCLES_PER_ITERATION needs adjustment

---

## Key Lessons

### 1. Root Causes Are Often Deep
- Initial symptom: Crash at iteration 48,000
- A6 corruption: Red herring
- Stack corruption: Symptom
- Stack misalignment: True root cause (iteration 210!)
- **The bug is 47,790 iterations BEFORE the crash!**

### 2. M68K Architecture Quirks
- Exception frames are 6 bytes (not 4 or 8)
- This inherently breaks 4-byte alignment
- Real Amiga OS must handle this - we need to understand how

### 3. Timing Changes Everything
- Different logging levels change when exceptions occur
- Single-cycle execution might behave differently than multi-cycle
- Each change in timing reveals different bugs

### 4. Don't Blame the Emulator
- Moira is proven in vAmiga
- Our usage of Moira might be wrong
- Focus on OUR code, not Moira's correctness

---

## Questions to Answer

1. **Why does the first exception occur?**
   - What instruction triggers it?
   - Is it invalid memory access?
   - Is it an illegal instruction?

2. **Why doesn't our SP realignment catch it?**
   - Is the pcBefore/pcAfter check correct?
   - Does Moira execute exception+RTE atomically?
   - Are we checking at the wrong time?

3. **Why does door get stuck in ROM?**
   - What is it waiting for?
   - Is this normal behavior?
   - Should we be providing some signal/event?

4. **How does real AmigaOS handle this?**
   - Does it use 8-byte aligned stacks?
   - Does it realign after exceptions?
   - Are there supervisor vs user stack differences?

---

## Current Codebase State

**Stable Features:**
- MOVEM.L fix working
- JSR trap interception working
- Door loads and executes thousands of iterations
- Library traps functioning correctly

**Unstable:**
- Stack alignment
- Long-term execution (crashes after 48K-100K iterations depending on timing)
- Door I/O loop (gets stuck)

**Safe to Deploy:**
- No - door doesn't complete execution
- Stack issues need resolution first

---

## Resources Needed

1. **M68K Exception Handling Documentation**
   - Official Motorola 68000 Programmer's Manual
   - Section on exception processing
   - Stack frame formats

2. **vAmiga Source Code**
   - How does vAmiga handle exceptions?
   - Stack management in vAmiga
   - Exception frame handling

3. **Real Amiga OS Source**
   - exec.library exception handlers
   - Stack initialization code
   - How Kickstart sets up initial SP

---

## Status for Next Session

**Completed:**
- ✅ Identified root cause (stack misalignment from exceptions)
- ✅ Implemented SP realignment logic
- ✅ Implemented A6 preservation
- ✅ Added comprehensive logging
- ✅ Documented findings

**In Progress:**
- ⏳ Debugging why SP realignment doesn't catch first exception
- ⏳ Understanding door ROM loop behavior
- ⏳ Finding optimal initial SP value

**Blocked/Needs Decision:**
- ⚠️ Whether to prevent exceptions vs fix alignment
- ⚠️ Whether to research real Amiga exception handling
- ⚠️ Whether current approach is correct path

**Recommended Next Action:**
Deep dive into iterations 200-220 with instruction-level logging to understand first exception

---

## Last Updated

2025-11-01 - Stack misalignment investigation and attempted fixes
