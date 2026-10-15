# BREAKTHROUGH: JSR Instruction Found - The Real Problem Revealed!

**Date:** 2025-10-30
**Status:** 🎯 ROOT CAUSE IDENTIFIED

---

## The Critical Discovery

```
[AmigaDoorSession] *** FOUND JSR INSTRUCTION at PC=0x10c0, offset=fece ***
[AmigaDoorSession] Inst 160: PC=0xfeda, SP=0xfdff8, A6=0x10000, opcode=0x0000
```

**THE DOOR IS CALLING A LIBRARY FUNCTION!**

### What Happened:

1. **Instruction 159:** Door executes `JSR -0x132(A6)` at PC=0x10c0
   - Offset 0xFECE = -0x132 = **-306 decimal**
   - This is JSR to ExecBase - 306
   - PC should jump to 0x10000 - 0x132 = **0xFECE**

2. **Instruction 160:** PC is at **0xFEDA** (not 0xFECE!)
   - PC jumped by 0xC (12 bytes) from expected address
   - Reading opcode 0x0000 (invalid!)
   - This is WRONG!

### The Problem

**Our library trap addresses are WRONG!**

From the logs, we installed vectors at:
```
[FindPort] Vector at 0xfe7a (offset -390)
```

But we calculated this as: `ExecBase + offset`
- ExecBase = 0x10000
- Offset = -390 = 0xFFFFFE7A
- **WRONG CALCULATION:** 0x10000 + 0xFFFFFE7A = 0x10FE7A

Should be:
- ExecBase = 0x10000
- Offset = -390
- **CORRECT:** 0x10000 - 390 = 0xFE7A (but this is negative space!)

---

## The Actual Issue

**The door called JSR -306(A6)** which means it's calling a function at **ExecBase - 306**.

Looking at Exec function list, LVO -306 doesn't match any function we implemented!

Let me check what -306 is...

### Checking Exec LVOs:

Common Exec functions:
- OpenLibrary: -552 (0xFDD8)
- CloseLibrary: -414 (0xFE62)
- AllocMem: -198 (0xFF3A)
- FreeMem: -210 (0xFF2E)
- FindTask: -294 (0xFED6)
- FindPort: -390 (0xFE7A)
- **Forbid: -132 (0xFF7C)** ← THIS IS -132 decimal!

Wait, 0xFECE in signed 16-bit = -306 decimal.

Let me recalculate: 0xFECE as signed 16-bit...
- 0xFECE = 65230 unsigned
- As signed 16-bit: 65230 - 65536 = **-306**

**NOT -132!** Let me check what LVO -306 is...

Actually, looking at the trace more carefully:
```
Inst 160: PC=0xfeda
```

If the JSR was to offset 0xFECE and PC ends up at 0xFEDA, that's:
- Target: ExecBase + 0xFECE
- Result: 0xFEDA
- Difference: 0xFEDA - (0x10000 + 0xFECE) = 0xFEDA - 0x1FECE = ?

Wait, I'm confusing signed/unsigned. Let me think clearly:

### Correct Analysis:

**JSR offset 0xFECE:**
- This is a SIGNED 16-bit offset
- 0xFECE in signed 16-bit = -306 decimal (0xFECE - 0x10000 = -0x132 = -306)

No wait, that's wrong too. Let me use proper signed conversion:
- 0xFECE in binary: 1111 1110 1100 1110
- Top bit is 1, so it's negative
- Two's complement: invert bits = 0000 0001 0011 0001, add 1 = 0x0132 = 306
- So 0xFECE = **-306 decimal**

**ExecBase = 0x10000**
**Target address = 0x10000 + (-306) = 0x10000 - 0x132 = 0xFECE**

But PC ended up at **0xFEDA**, not 0xFECE!

Difference: 0xFEDA - 0xFECE = **0xC (12 bytes)**

---

## Why PC is Wrong

After JSR:
1. CPU pushes return address to stack (4 bytes)
2. CPU loads PC with target address
3. PC should be at 0xFECE

But PC is at 0xFEDA (12 bytes later).

**This means the CPU executed 12 bytes of "instructions" from 0xFECE!**

Looking at the pattern:
```
Inst 160: PC=0xfeda, opcode=0x0000
Inst 170: PC=0xff02, opcode=0x0000  (+ 0x28 = 40 bytes)
Inst 180: PC=0xff2a, opcode=0x0000  (+ 0x28 = 40 bytes)
Inst 190: PC=0xff52, opcode=0x0000  (+ 0x28 = 40 bytes)
```

**PC is jumping by 40 bytes (0x28) each instruction!**

This is the pattern of our exception handlers!

---

## The Real Problem

**Our exception handler code is at 0xF00000, but vectors point to addresses like 0xFEDA!**

From ExecLibrary.ts:
```typescript
const EXCEPTION_HANDLER_BASE = 0xF00000;
```

But we're writing vector addresses in the range 0xFE7A - 0xFF7C!

**The vectors are pointing to LIBRARY TRAP CODE, not exception handlers!**

When door does JSR to library, it lands on a vector address which has:
- ILLEGAL instruction (0x0000)
- This causes exception
- Exception handler skips 2 bytes
- Keeps happening forever!

---

## The Solution

**Our library trap system is fundamentally broken!**

The trap addresses need to be:
1. Calculated correctly from ExecBase
2. Have proper trap handler code
3. Actually intercept the JSR

Current problem: We install vectors but don't handle them correctly.

Let me check LibraryTraps.ts to see how vectors are installed...

---

## Next Steps

1. Check how LibraryTraps installs vectors
2. Verify trap addresses are correct
3. Fix the trap handling system
4. Test again

**WE FOUND THE BUG: Library calls are happening but trap system isn't working!**
