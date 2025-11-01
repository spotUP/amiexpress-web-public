# PutMsg Return Address Issue - RTS to Invalid Address

**Date:** 2025-11-01
**Status:** INVESTIGATING
**Previous Success:** Offset collision handling COMPLETE ✅

---

## Problem Summary

Door successfully executes past Supervisor trap (iteration 1186) and continues through high memory (iterations 1289-1356), but crashes at iteration 2154 when returning from PutMsg().

### Crash Pattern

```
[AmigaDoorSession] Library trap detected at PC=0xfe92 (offset=-366, A6=0x10000)
[LibraryTraps] Intercepted: PutMsg() at PC=0xfe92
[LibraryTraps]   SP before pop: 0xfdec6, A6: 0x10000
[LibraryTraps]   Return address at SP: 0x1744
[LibraryTraps]   SP after pop: 0xfdeca
[ExecLibrary] PutMsg(port=0x0, msg=0x1ca4)
[LibraryTraps] PutMsg() returned 0x0
[AmigaDoorSession] *** AFTER TRAP HANDLER: PC=0x1744, SP=0xfdeca
[AmigaDoorSession] [2154] PC=0x3a, SP=0xfdece, A6=0x10000, D0=0x0...
[AmigaDoorSession] *** INVALID PC DETECTED! PC=0x3a is outside code range
```

**Key Observations:**
1. Trap handler correctly sets PC=0x1744 ✓
2. Trap handler correctly pops return address from stack ✓
3. SP increases by 4 bytes (0xfdeca → 0xfdece) = RTS executed ✓
4. PC jumps to 0x3a (value from stack) = WRONG ✗

---

## Root Cause Analysis

### What Happened

After `handleTrap()` returns:
1. PC = 0x1744 (return address) ✓
2. SP = 0xfdeca (after popping return address) ✓
3. Next iteration executes `emulator.execute(CYCLES_PER_ITERATION)`
4. **CPU executes RTS instruction at 0x1744**
5. RTS pops from SP=0xfdeca → gets 0x3a
6. RTS sets PC=0x3a
7. Crash!

### Why PC=0x3a?

Stack dump shows saved registers from MOVEM.L:
```
[LibraryTraps]     SP+0 (D0): 0x3a  ← This gets popped by RTS!
[LibraryTraps]     SP+4 (D1): 0x0
[LibraryTraps]     SP+8 (D2): 0x4
... (all registers saved)
```

The value 0x3a is the saved D0 register, NOT a return address!

### Why Is There an RTS at 0x1744?

**Hypothesis 1:** Wrong return address read from stack
- Stack had: [return_addr] [saved_registers...]
- We popped return_addr correctly (0x1744)
- But maybe 0x1744 is not the right place to return to?

**Hypothesis 2:** Door uses custom calling convention
- Maybe door manually pushes return address before saved registers?
- Stack layout: [saved_regs] [manual_return] [JSR_return]
- We popped JSR_return (0x1744) but should have popped manual_return?

**Hypothesis 3:** RTS at 0x1744 is intentional
- Maybe 0x1744 is a trampoline that does cleanup before final return?
- But it's popping from the wrong stack position

---

## Current Fix Status

### ✅ COMPLETED (Previous Session)

1. **Offset Collision** - Fixed with array-based offsetMap
2. **Sign Extension** - Fixed 16-bit offset extraction
3. **Trap Handler Selection** - Fixed to prefer isTrapAddress() over offset-based
4. **Supervisor Implementation** - Fixed inline logic
5. **High Memory Support** - Added 0xfe000-0xfffff range

### ❌ NEW ISSUE (This Session)

**PutMsg Return Address Corruption**
- Trap handler works correctly
- Return address (0x1744) is set correctly
- But instruction at 0x1744 is RTS that pops wrong value (0x3a)

---

## Investigation Needed

### 1. Check Instruction at 0x1744

Need to dump memory at 0x1744 to confirm it's really RTS:
- Opcode 0x4E75 = RTS
- If confirmed, need to understand WHY there's an RTS there

### 2. Check Door Calling Convention

Compare with working Amiga doors:
- Do they use JSR directly or custom trampolines?
- Do they manually manage stack beyond MOVEM.L?
- Check vAmiga sources for proper library call pattern

### 3. Check Stack Layout

Before PutMsg JSR:
- What exactly is on the stack?
- Is there MOVEM.L before JSR or after?
- Pattern should be:
  ```
  MOVEM.L D0-D7/A0-A6,-(SP)  ; Save registers
  ... setup parameters ...
  JSR -366(A6)                ; Call PutMsg (pushes 0x1744)
  ; Return here at 0x1744:
  MOVEM.L (SP)+,D0-D7/A0-A6  ; Restore registers
  ... continue ...
  ```

### 4. Check If 0x1744 Is Correct

Maybe the issue is we're setting PC to the WRONG address:
- JSR pushes PC+2 (address of next instruction)
- But what if the door expects PC to point BEFORE the MOVEM.L restore?

---

## Possible Solutions

### Option 1: Don't Pop Stack in Trap Handler

Instead of popping the return address:
- Leave it on stack
- Let door's code handle the RTS naturally
- But then we need to emulate JSR/RTS behavior completely

### Option 2: Check for RTS at Return Address

Before setting PC:
- Read instruction at return address
- If it's RTS, skip it and use the NEXT instruction
- Set PC to return_addr + 2 instead

### Option 3: Adjust SP After Setting PC

After setting PC to 0x1744:
- If instruction at PC is RTS, pre-pop the stack
- SP += 4 to skip the saved D0 value
- This way RTS will pop the correct return address

### Option 4: Investigate vAmiga Library Call Implementation

Check how vAmiga handles:
- JSR to library vectors
- RTS from library functions
- Stack management during traps

---

## Test Results So Far

**Progress:**
- Iteration 1-1186: Normal execution ✓
- Iteration 1186: Supervisor trap (A6=0) handled correctly ✓
- Iterations 1289-1356: High memory execution ✓
- Iteration 2154: PutMsg trap handled, but crashes on return ✗

**Current Crash:**
- PC jumps to 0x3a (saved D0 value)
- Should have returned to proper address after MOVEM.L restore

---

## Next Steps

1. Add logging to dump memory at return address
2. Check what instruction is at 0x1744 (confirm RTS)
3. Trace backwards to find where MOVEM.L save happened
4. Check vAmiga sources for correct library call convention
5. Test with Option 2 or Option 3 above

---

## Code Locations

**Fixed Code:**
- `AmigaDoorSession.ts:1117-1119` - Prefer isTrapAddress over offset
- `AmigaDoorSession.ts:632-634` - Same fix for pre-1000 path

**Issue Location:**
- `LibraryTraps.ts:754` - Sets PC to returnAddr (0x1744)
- Next execute() at 0x1744 hits RTS → pops 0x3a → crash

---

## Success Metrics

Door now reaches **968 iterations further** than before (1186 → 2154).

The offset collision fix is working perfectly. This is a NEW issue related to library return address handling.
