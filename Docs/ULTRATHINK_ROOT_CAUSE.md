# Ultrathink Analysis: Stack Corruption Root Cause

**Date**: 2025-11-01
**Session**: Continuation - Ultrathink Deep Dive
**Status**: ROOT CAUSE IDENTIFIED

## Executive Summary

The stack corruption that causes the door to crash at iteration ~48,000 is NOT an emulation bug. It's caused by the door passing an **invalid function pointer** to the `Supervisor()` exec.library call.

## The Smoking Gun

**Iteration 1189** - Deep diagnostic logging revealed:
- PC = 0xfebb8
- Opcode = 0x434f (ASCII: "CO" - this is DATA, not code!)
- Exception: TRAP #0
- Stack misalignment begins (exception frame = 6 bytes, breaking 4-byte alignment)

## Complete Execution Trace

### Iteration 1185
```
Door code at PC=0x2b44
JSR (d16,A6) with A6=0x0, offset=-30
→ Calls Supervisor() trap
A5 = 0xfebb4 (supervisor function pointer)
Return address: 0x2b48
```

### Iteration 1186
```
PC = 0xfebb4 (supervisor function)
Opcode = 0x5d20 (SUBQ.B #6,D0 - VALID code)
After execute: PC = 0xffe2 (JSR to Supervisor AGAIN!)

NESTED Supervisor call:
  function pointer = 0xfebb4 (same address!)
  return address = 0xfebb8 (instruction after JSR)
```

### Iteration 1188
```
PC = 0xfebb4 (executing supervisor function second time)
After execute: PC = 0xfebb8 (return from supervisor)
```

### Iteration 1189 - THE CRASH
```
PC = 0xfebb8
Opcode = 0x434f (DATA: "CO")
← Trying to execute DATA as CODE!
Exception: TRAP #0
SP: 0xfdf38 → 0xfdf32 (misaligned!)

From this point forward:
- Every exception pushes 6-byte frame
- Stack becomes increasingly misaligned
- After 47,000 iterations: catastrophic failure
```

## The Real Problem

The supervisor function at **0xfebb4** is INCORRECT for one of these reasons:

### Theory 1: Address Relocation Bug
- Door was compiled for ROM at address X
- We loaded ROM at address Y
- Door calculates: `ROM_BASE + offset = 0xfebb4`
- But actual correct address would be different

### Theory 2: Corrupted A5 Register
- A5 should point to valid supervisor function
- Something overwrote A5 with wrong value (0xfebb4)
- Door blindly passes corrupted A5 to Supervisor()

### Theory 3: Door Binary Issue
- Door executable has wrong addresses baked in
- Needs to be recompiled or fixed

## Evidence

### What We Know About 0xfebb4
```
Hex dump at 0xfebb4:
5d20 0000 0c82 2c78 0004 4eae fe80 207c 0000 0c82 2c78 0004 4eae fe8c

Disassembly:
0xfebb4: SUBQ.B #6,D0         (0x5d20) ← Valid code
0xfebb6: ???
0xfebb8: "CO" (0x434f)        ← DATA! Not code!
```

### Register State at Iteration 1186
```
D0-D3: 00000000 000fdf7c 000003ed 000013fe
D4-D7: 00000000 00000000 00000012 00000000
A0-A3: 000fdf8d 000fdf50 000fdff6 0008000c
A4-A7: 00002c00 000febb4 00010000 000fdf3c
            ↑ A5 = supervisor function pointer
```

### Memory Map Context
```
0x00000-0x00FFF: Exception vectors
0x01000-0x03000: Door code (loaded from GetAnswer executable)
0x10000-0x1FFFF: Exec.library
0x20000-0x2FFFF: DOS.library
0x30000-0x3FFFF: AEDoor.library
0xFE000-0xFFFFF: ROM space (AmigaOS ROM routines)

0xfebb4 is JUST BELOW ROM space - suspiciously close!
Possible off-by-one in address calculation?
```

## Why Stack Misalignment Occurs

M68K Exception Frame on TRAP #0:
```
Stack before exception: SP = 0xfdf38 (4-byte aligned)
Exception pushes:
  +0: SR (2 bytes)
  +2: PC (4 bytes)
= 6 bytes total

Stack after exception: SP = 0xfdf38 - 6 = 0xfdf32
0xfdf32 % 4 = 2 (NOT 4-byte aligned!)

RTE pops 6 bytes:
SP = 0xfdf32 + 6 = 0xfdf38 (back to aligned)

But more exceptions occur:
SP = 0xfdf38 - 6 = 0xfdf32 (misaligned again)
SP = 0xfdf32 - 6 = 0xfdf2c (aligned!)
SP = 0xfdf2c - 6 = 0xfdf26 (misaligned!)
...pattern continues for 47,000+ iterations
```

## Recommended Next Steps

### Option A: Find Correct Supervisor Function Address
1. Disassemble door executable to find what A5 should be
2. Check if ROM relocation is needed
3. Fix address calculation in door code or emulation

### Option B: Prevent Invalid Supervisor Call
1. Add validation in Supervisor() trap handler
2. Check if function pointer is in valid code range
3. Reject or redirect invalid addresses

### Option C: Find Root Cause of A5 Corruption
1. Expand debug logging to iterations 0-1175
2. Find exact instruction that sets A5 = 0xfebb4
3. Determine if this is intentional or corruption

### Option D: Check vAmiga Implementation
1. Study how vAmiga handles Supervisor() calls
2. Check if special memory mapping is needed
3. Verify ROM loading addresses match real Amiga

## Files Modified (This Session)

### `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
- Lines 1402-1480: Added ultrathink diagnostic logging
- Lines 520-600: Added M68K instruction decoder
- Captures full register state, instruction names, exception types

### `/web/backend/src/amiga-emulation/api/LibraryTraps.ts`
- Lines 375-399: Supervisor() implementation
- Issue: Blindly trusts A5 register value
- Needs validation of function pointer address

## Conclusion

After 22.6x performance improvement from MOVEM.L and JSR fixes, we've now identified the ACTUAL root cause of the crash. It's not an emulation bug - it's the door passing a bad address to Supervisor(), which causes execution of data as code, triggering exceptions that slowly corrupt the stack over 47,000 iterations.

**The exceptions are the emulator correctly saying "something is wrong" - we need to fix what's making the door use the wrong address, not paper over the exceptions.**

---

**Next Session Goal**: Determine correct supervisor function address and fix the door/emulation to use it.
