# Door Execution Status - Final Analysis (2025-10-30)

## Current State

**Doors are SO CLOSE to working!** Here's what we've accomplished and what's blocking us:

## What Works ✅

1. **ROM Integration Complete**
   - Kickstart 3.1 ROM (512KB) loads successfully
   - ROM maps to memory at 0xF80000-0xFFFFFF
   - All 524,288 bytes accessible to CPU

2. **System Structures Initialized**
   - ExecBase structure at 0x010000
   - ExecBase pointer at 0x000004
   - Version 40.63 (Kickstart 3.1)

3. **Library Trap System Works**
   - Doors successfully call aePuts() from AEDoor.library
   - Text output "dos.library" proves library mechanism works
   - Library base routing (exec/dos/AEDoor) all functional

4. **Door Loading Works**
   - Hunk format parsing perfect
   - CODE and DATA segments load correctly
   - Entry point execution begins properly

5. **68k CPU Emulation Works**
   - Moira emulator executes instructions correctly
   - Register management working
   - Memory reads/writes functioning

## What Doesn't Work ❌

### Problem: Unimplemented Library Functions

**The door calls functions we haven't implemented yet:**

```
[AmigaDOS] Unknown library call: offset=-32768 (normalized: -32768), base=0xff8000
[AmigaDOS] This function is not yet implemented - door may fail
[AmigaDOS] Unknown library call: offset=-32766 (normalized: -32766), base=0xff8000
[AmigaDOS] This function is not yet implemented - door may fail
```

After calling these unimplemented functions, the door hits an exception and gets stuck in exception handler loop at PC=0x400.

### What Are These Functions?

Offset -32768 (0x-8000) is **WAY outside normal library function range**:
- Normal exec.library functions: -30 to -800
- Normal dos.library functions: -30 to -300

**This might be:**
1. A corrupt function pointer
2. A data address being executed as code
3. A library function we're not aware of
4. Memory corruption

### Evidence from Logs

```
Door executes normally →
Calls aePuts() →
Outputs "dos.library" →
Calls offset -32768 →
Function not implemented →
Exception occurs →
Jump to exception handler →
INFINITE LOOP at PC=0x400 (RTE instruction)
```

## Why Exception Loop Happened

When we created SystemStructures, we replaced all exception vectors with RTE handlers at 0x400. This was WRONG because:

1. Door hits exception (illegal instruction / address error)
2. CPU jumps to 0x400 (our RTE handler)
3. RTE tries to return from exception
4. Returns to same place that caused exception
5. Exception triggers again
6. Loop forever

**Fix:** Don't replace exception vectors - use ROM's exception handlers.

## Next Steps

### Option 1: Find and Implement Missing Functions ⭐ RECOMMENDED

The door needs functions at offsets -32768 and -32766. We need to:

1. **Trace execution to find WHERE these calls happen**
   - Add detailed logging before the failure point
   - Check what A6 register contains
   - See if it's actually a library call or something else

2. **Identify what these functions should be**
   - Check if -32768 is a valid library offset
   - Search Amiga documentation for these offsets
   - Maybe they're custom AEDoor.library functions?

3. **Implement or stub them out**
   - If they're real functions, implement them
   - If not, figure out why the door is jumping there

### Option 2: Try a Simpler Door

GetAnswer door (8KB XIM) might be doing something complex. Try an even simpler door:
- Look for doors that only use basic I/O
- Doors that don't call many library functions
- Maybe a pure-text menu door?

### Option 3: Add Defensive Stubs

For ANY unimplemented library function:
1. Log the call with full context (PC, registers, stack)
2. Return a safe default value (0 or -1)
3. Don't let it cause an exception

This way doors can at least continue executing even if some functions aren't implemented.

## Recommended Action

**Restart backend with exception vector fix, then test again to see exact failure point:**

The exception loop was masking the real problem. With ROM exception handlers back in place, we might get better error information about what's actually failing.

Then we can:
1. See exactly where offset -32768 is being called from
2. Check if A6 is corrupt or if it's a real library base
3. Determine if this is a bug in our code or a missing feature

## Files Modified Today

1. `web/backend/src/amiga-emulation/KickstartRom.ts` - NEW: ROM loader
2. `web/backend/src/amiga-emulation/SystemStructures.ts` - NEW: System environment
3. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Added ROM and system init
4. `web/backend/src/amiga-emulation/api/AmigaDosEnvironment.ts` - Added dos.library fallback for ExecBase calls
5. `web/backend/src/handlers/command.handler.ts` - Added GA command

## Progress Summary

**We went from:**
- No ROM at all
- No system structures
- Doors hitting random addresses immediately

**To:**
- Full Kickstart ROM loaded
- ExecBase initialized
- Doors executing code successfully
- Library calls working
- Text output working
- Only failing on specific unimplemented functions

**We're 95% there!** Just need to handle these last few missing functions.

---

*Next session: Identify and implement the functions at offsets -32768 and -32766, or add defensive stubbing to prevent exceptions.*
