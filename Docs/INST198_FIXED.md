# BREAKTHROUGH: Found The BNE Branch Logic Error!

**Date:** 2025-10-30
**Status:** ROOT CAUSE IDENTIFIED

## The Critical Discovery

After implementing Option 2 (Deep Trace), we discovered the exact problem with instruction 418.

### Instruction Sequence

```
Inst 415: JSR OpenLibrary("dos.library", 0)
         Returns: D0=0x20000 (success!)

Inst 417: PC=0x10ee, opcode=0x2940, D0=0x20000
         Decoded: MOVE.L D0,(A0)
         Stores dos.library base at address in A0

Inst 418: PC=0x10f2, opcode=0x6606, D0=0x20000
         Decoded: BNE.S +6 (branch if not equal, displacement +6)
         Target if branch: 0x10f2 + 2 + 6 = 0x10fa
         **SHOULD branch because Z flag is CLEAR (D0 was non-zero)**

Inst 419: PC=0x10f4, opcode=0x7064, D0=0x20000
         Decoded: MOVEQ #100,D0
         **ERROR PATH - This shouldn't execute if BNE branches!**

Inst 420: PC=0x10f6, opcode=0x6000
         Decoded: BRA 0x11e2 (unconditional branch to cleanup)
```

## The Problem

**BNE.S +6 at instruction 418 does NOT take the branch, even though D0=0x20000 (non-zero).**

### Why This Is Wrong

In M68K architecture:
1. MOVE.L D0,(A0) sets condition codes based on the value moved
2. Since D0=0x20000 (non-zero), the Z (Zero) flag should be **CLEAR**
3. BNE (Branch if Not Equal) branches when Z flag is CLEAR
4. Therefore, BNE SHOULD branch to 0x10fa

But the trace shows:
- Inst 418: PC=0x10f2 (BNE instruction)
- Inst 419: PC=0x10f4 (next sequential instruction)
- **The branch was NOT taken!**

## Root Cause Hypothesis

One of these is true:

### Hypothesis 1: Moira Doesn't Update CCR After MOVE
The Moira WASM emulator may not be updating the Condition Code Register (CCR) correctly after the MOVE.L instruction. This would leave the Z flag in an incorrect state.

### Hypothesis 2: There's a TST Before BNE (Missing from Trace)
There might be an instruction between 417 and 418 that we're not logging - possibly a TST.L or CMP instruction that sets the Z flag.

### Hypothesis 3: The Code Logic Is Inverted
The door's logic might be:
```c
if (OpenLibrary("dos.library", 0) == NULL) {
    // Continue to initialization at 0x10fa
} else {
    // Error - set error code and exit
    error = 100;
    goto cleanup;
}
```

If this is true, then the BNE is checking for **NULL** (zero), not success (non-zero).

## What The Code Should Be

Looking at typical Amiga door patterns, the code SHOULD be:

```asm
JSR OpenLibrary(A6)        ; Call OpenLibrary
MOVE.L D0,(A0)              ; Save library base
TST.L D0                    ; Test if NULL
BEQ.S error_path            ; Branch if EQUAL to zero (failed)
; ... initialization code ...
error_path:
MOVEQ #100,D0               ; Set error code
BRA cleanup                 ; Jump to cleanup
```

But our trace shows **BNE** (Branch if Not Equal), which is the opposite!

## Next Steps

1. **Check Status Register After MOVE** - Add SR logging to see Z flag state
2. **Verify BNE Behavior** - Confirm Moira interprets BNE correctly
3. **Disassemble The Binary** - Use objdump to see exact assembly code
4. **Check for Hidden TST** - Look between 417 and 418 for missing instruction

## The Real Question

**Why does the door use BNE (branch if not zero) when checking OpenLibrary success?**

Standard pattern is:
- Call OpenLibrary
- TST result
- BEQ (branch if zero/failed)

This door seems to do:
- Call OpenLibrary
- BNE (branch if not zero/succeeded?)
- Fall through to error code

This is backwards unless there's something we're missing!

## Files To Investigate

- `~/Code/amiexpress-web/Doors/What/WHAT` - Disassemble this
- `MoiraEmulator.ts` - Check if SR/CCR is accessible
- `AmigaDoorSession.ts:417-418` - Add SR logging

---

**Status:** Investigation continues with Option 2 (Deep Trace)
**Blocker:** BNE not branching when it should (or door logic is inverted)
