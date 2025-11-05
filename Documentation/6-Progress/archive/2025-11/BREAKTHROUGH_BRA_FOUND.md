# BREAKTHROUGH: Found Why DoorStart Fails!

## Critical Discovery 🔍

**Date:** 2025-10-30
**Finding:** DoorStart SKIPS its entire initialization code with an unconditional branch!

## The Smoking Gun

With detailed instruction-level tracing enabled (instructions 408-422), we discovered:

```
Inst 415: JSR OpenLibrary("dos.library", 0)
         Returns: D0=0x20000 (success!)

Inst 418: BNE (branch if not zero)
         Check: D0 = 0x20000 (non-zero = success)
         Result: Branch NOT taken (continues to next instruction)

Inst 419-420: Sets D0=0x64 (error code 100)
              Then BRA 0x11e2 (UNCONDITIONAL BRANCH!)

Inst 421: Execution continues at 0x11e2
```

## What This Means

The code after OpenLibrary **EXPECTS IT TO FAIL**!

The logic is:
```c
if (OpenLibrary("dos.library", 0) != NULL) {
    // Success path - set error code and EXIT early
    error = 100;
    goto cleanup;
}
// Failure path - continue with initialization (NEVER REACHED!)
```

The skipped code (0x10f8 - 0x11e2) is where DoorStart would:
- Call FindPort("AEDoorPort0")
- Call CreateMsgPort()
- Initialize function pointers
- Set up door communication

**But this code is NEVER executed because dos.library opened successfully!**

## Why This Happens

The door expects **dos.library to FAIL to open**!

This is bizarre but makes sense in context:
1. Door was compiled for AmigaShell/CLI environment
2. Expected to run with real Amiga DOS
3. Opening dos.library from CLI might return NULL or different value
4. Our emulator correctly returns library base (0x20000)
5. Door interprets this as "wrong environment" and exits

## The Fix

Two options:

### Option 1: Make OpenLibrary Return NULL for dos.library
Simplest fix but wrong - dos.library is needed!

### Option 2: Understand the Real Check
The door might be checking if it's running in CLI vs Workbench.
Need to understand what the 0x10f8-0x11e2 code does when reached.

### Option 3: Patch the Binary
Change BNE at 0x10f2 to BEQ (branch if equal to zero)
This would invert the logic and execute initialization code

## Detailed Trace

```
408: PC=0x10d4 D0=0x0      A0=0x4bc8  - MOVEQ #0,D0
409: PC=0x10d6 D0=0x0      A0=0x4bc8  - MOVE.L #0x3000,D1
410: PC=0x10dc D1=0x3000   A0=0x4bc8  - JSR SetTaskPri()
412: PC=0x10e0             A1=0x0     - (returned)
413: PC=0x10e4             A1=0x1294  - LEA "dos.library",A1
414: PC=0x10e8 D0=0x0      A1=0x1294  - MOVEQ #0,D0
415: PC=0x10ea             A1=0x1294  - JSR OpenLibrary()
417: PC=0x10ee D0=0x20000             - (returned with success!)
418: PC=0x10f2 D0=0x20000             - BNE (check if opened)
419: PC=0x10f4 D0=0x20000             - MOVEQ #100,D0 (error!)
420: PC=0x10f6 D0=0x64                - BRA 0x11e2 (EXIT!)
421: PC=0x11e2 D0=0x64                - (cleanup code)
422: PC=0x11e6 D0=0x64                - MOVE.L D0,(A2)+
```

## Next Steps

1. ✅ Found the exact blocker
2. ⏳ Understand what code at 0x10f8-0x11e2 does
3. ⏳ Determine correct fix approach
4. ⏳ Implement fix
5. ⏳ Test door execution

## Files Modified

- `AmigaDoorSession.ts:406-421` - Added detailed DoorStart tracing

## Conclusion

We finally understand why DoorStart fails! It's not missing functionality - it's **wrong environment detection**. The door checks if dos.library opens and if it does, assumes it's in the wrong environment and exits early.

This is actually good news - the fix should be straightforward once we understand the intended behavior.
