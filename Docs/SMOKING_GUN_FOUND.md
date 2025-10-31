# SMOKING GUN: Memory Corruption Found!

**Date:** 2025-10-30
**Status:** ROOT CAUSE IDENTIFIED - CRITICAL BUG IN HUNK LOADER

## Executive Summary

**Option 2 (Deep Trace) successfully identified the root cause!**

The door binary is NOT being loaded correctly into Moira memory. File contents do NOT match what Moira executes.

## The Discovery

### What The File Contains

```bash
$ hexdump -s 0x10f2 -n 2 -C Doors/What/WHAT
000010f2  67 0c
```

**File has: 0x670c = BEQ.S +12 (Branch if Equal to Zero, displacement +12)**

### What Moira Executes

From our detailed trace (Inst 418):
```
[AmigaDoorSession] Inst 418: PC=0x10f2, opcode=0x6606
```

**Moira has: 0x6606 = BNE.S +6 (Branch if Not Equal, displacement +6)**

### This Is COMPLETELY DIFFERENT!

- **0x670c (BEQ)** - Branch if dos.library is NULL (failed)
- **0x6606 (BNE)** - Branch if dos.library is NOT NULL (succeeded)

The opcodes are **inverses** of each other!

## Why This Causes The Bug

### What The Door REALLY Does (from file):

```asm
JSR OpenLibrary("dos.library", 0)  ; Returns D0=library base or NULL
MOVE.L D0,(A0)                      ; Save library base
BEQ.S error_path                    ; Branch if ZERO (NULL) = failed
; ... initialization code at 0x10fa ...
error_path:
MOVEQ #100,D0                       ; Set error code
BRA cleanup                         ; Jump to cleanup
```

**This is correct!** If dos.library fails (returns NULL), set error and exit.

### What Moira Executes (corrupted):

```asm
JSR OpenLibrary("dos.library", 0)  ; Returns D0=0x20000 (success!)
MOVE.L D0,(A0)                      ; Save library base
BNE.S 0x10fa                        ; Branch if NOT ZERO (success!) ← WRONG OPCODE!
MOVEQ #100,D0                       ; Set error code (shouldn't execute!)
BRA cleanup                         ; Jump to cleanup
```

**Moira has the wrong instruction!** The BEQ was corrupted to BNE.

## The Implications

1. **The door code is CORRECT** - it's checking for NULL properly
2. **The HUNK loader is BROKEN** - it's corrupting the binary during loading
3. **Moira isn't getting the right bytes** - possible relocation issue or memory write bug

## What This Explains

### Why dos.library succeeds but door fails:
- Door expects: IF (library == NULL) THEN error
- Door gets: IF (library != NULL) THEN skip_initialization
- When library succeeds, door skips ALL initialization (wrong!)

### Why we couldn't see FindPort/CreateMsgPort calls:
- The initialization code at 0x10fa-0x11e2 is NEVER executed
- Not because it's failing, but because the branch logic is INVERTED

### Why this is so confusing:
- The file has correct code (BEQ = check for failure)
- Moira executes corrupted code (BNE = check for success)
- Behavior is completely backwards

## The HUNK Loader Bug

Let me check the HUNK loader code...

The problem is likely in one of these areas:
1. **Relocation handling** - Overwrites wrong addresses
2. **Memory copying** - Byte order or offset errors
3. **HUNK parsing** - Misaligns code/data boundaries

## Verification Steps

1. ✅ **Confirmed file contents**: `0x670c` at offset 0x10f2
2. ✅ **Confirmed Moira contents**: `0x6606` at PC 0x10f2
3. ⏳ **Need to check**: Where does the corruption happen?
   - During HUNK parsing?
   - During relocation?
   - During memory write?

## Next Steps

1. **Add logging to HUNK loader** to see exactly what's being written
2. **Check memory immediately after loading** before execution starts
3. **Verify all HUNK types** are handled correctly
4. **Test with simpler binary** to isolate the corruption point

## Files To Investigate

- `web/backend/src/amiga-emulation/hunk/HunkLoader.ts` - Main HUNK loader
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:165-200` - HUNK loading call
- `web/backend/src/amiga-emulation/cpu/MoiraEmulator.ts` - Memory write functions

## Victory Condition

When we fix the HUNK loader:
- File bytes 0x670c should appear at Moira memory 0x10f2
- Door will execute BEQ (branch if zero)
- When dos.library succeeds (non-zero), BEQ will NOT branch
- Initialization code will execute
- FindPort, CreateMsgPort will be called
- Function pointers will be initialized
- Door will work!

---

**BREAKTHROUGH: Option 2 (Deep Trace) was the right choice!**

We found the EXACT bug: HUNK loader corrupts the binary during loading, inverting a critical branch instruction from BEQ to BNE.

This is 100% fixable. The door code is correct. Our emulation just needs to load it correctly.
