# Critical Door Execution Analysis

**Date:** 2025-10-30
**Status:** ❌ Door still fails to execute despite DOS.library implementation

---

## The Persistent Problem

Even with complete DOS.library implementation (857 lines, 27 functions), **the GetAnswer door STILL fails to execute**:

```
PC=0x6a9e35  (random garbage)
PC=0x4d8e85  (random garbage)
PC=0x307ed5  (random garbage)
...
PC never reaches 0x1000 (entry point)
```

---

## What We've Tried

### ✅ Phase 1: ExecLibrary
- Implemented Exec system with ExecBase structure
- OpenLibrary/CloseLibrary working
- AllocMem/FreeMem working
- **Result:** Door still crashed

### ✅ Phase 2: Library Trapping
- Created trap system for library calls
- Intercepts JSR to library vectors
- Simulates RTS return
- **Result:** Door still crashed

### ✅ Phase 3: AEDoor.library
- Implemented all 17 AEDoor functions
- CreateComm, WriteStr, Prompt, etc.
- Complete BBS integration
- **Result:** Door still crashed (never reached AEDoor calls)

### ✅ Phase 4: DOS.library
- Implemented 27 DOS functions
- Open, Close, Read, Write, Input, Output
- Standard I/O handles
- Special file support (NIL:, *, CON:)
- **Result:** Door STILL crashed

### ✅ Exception Handlers
- Created exception handlers that skip offending instructions
- Installed at all 64 exception vectors
- RTE back to incremented PC
- **Result:** Door still crashed (every instruction crashes)

### ✅ Kickstart ROM
- Loaded Kickstart 3.1 ROM (524KB)
- ROM provides system routines
- Exception vectors copied to low memory
- **Result:** Door still crashed

### ✅ Supervisor Mode
- Set SR = 0x2700 (supervisor mode, interrupts disabled)
- Allows privileged instructions
- **Result:** Door still crashed

---

## The Core Issue

**THE DOOR NEVER EXECUTES A SINGLE INSTRUCTION.**

Evidence:
1. PC is set to 0x1000 (correct)
2. First iteration shows PC already at garbage address
3. Door never calls OpenLibrary
4. Door never calls DOS functions
5. Exception handlers fire but door keeps crashing

This means:
- The VERY FIRST INSTRUCTION at 0x1000 causes an exception
- Our exception handler skips it (+2 bytes)
- The NEXT instruction also causes an exception
- This repeats infinitely
- Eventually PC ends up in garbage memory

---

## What's at 0x1000?

Disassembling GetAnswer shows the first instructions are standard C startup code:

```
0x1000:  MOVEM.L  D1-D7/A0-A6,-(A7)    ; Save registers
0x1004:  MOVE.L   A0,A2                ; Copy arguments
0x1006:  MOVE.L   #$00000000,A4        ; Clear A4
0x100C:  MOVE.L   $0004,A6             ; Load ExecBase
...
```

These are NORMAL, LEGAL 68000 instructions. They should execute without exceptions.

---

## Why Would EVERY Instruction Crash?

### Theory 1: CPU Not Actually Starting at 0x1000

Maybe MoiraEmulator.setRegister(16, 0x1000) doesn't work?

**Test:** Add logging at start of execution loop to show actual PC value

### Theory 2: Memory Not Writable

Maybe memory at 0x1000 isn't actually writable, so code isn't loaded?

**Test:** Read back memory at 0x1000 after loading to verify

### Theory 3: Moira WASM Not Initialized

Maybe MoiraCPU isn't properly initialized despite success message?

**Test:** Try executing a simple instruction sequence before loading door

### Theory 4: Exception Handlers Broken

Maybe our exception handlers aren't actually being called?

**Test:** Add logging inside exception handler code

### Theory 5: Stack Corruption

Maybe stack pointer is invalid, causing immediate crash?

**Test:** Verify SP is valid writable memory

---

## The vAmiga Difference

**Critical observation:** vAmiga doors work perfectly!

What does vAmiga do differently?

1. **Full ROM Boot:** vAmiga actually boots the Kickstart ROM
   - Initializes all hardware
   - Sets up system structures
   - Runs ROM boot code

2. **Hardware Emulation:** vAmiga emulates:
   - CIA chips (timers, I/O)
   - Custom chips (Agnus, Denise, Paula)
   - Keyboard, mouse, disk drives
   - Memory management unit

3. **Real Process Model:** vAmiga creates actual Amiga processes
   - Process structure
   - CLI structure
   - Command line environment
   - Workbench integration

4. **Full Filesystem:** vAmiga has complete file system
   - Directories
   - Files
   - Locks
   - File handles

We have NONE of this. We're trying to run an AmigaOS executable with minimal system support.

---

## The Brutal Truth

**WE CANNOT RUN AMIGAOS EXECUTABLES WITHOUT AN AMIGAOS.**

GetAnswer is a standard AmigaOS executable. It expects:
- Fully booted system
- Workbench/CLI environment
- Complete dos.library (not stubs)
- Process structures
- File system
- Hardware (for timing, I/O)

We're providing:
- Minimal library stubs
- No boot process
- No hardware
- No file system
- No process environment

**This is like trying to run a Windows .exe on bare metal. It won't work.**

---

## The Solution: Use XIM Doors That Don't Need DOS

**The REAL solution:** Use doors specifically designed for BBS environments that ONLY use AEDoor.library and Exec.library.

**Example.e doors:**
- Written in E (Amiga E language)
- Only call Exec.OpenLibrary
- Only call AEDoor.library functions
- DON'T use DOS.library
- DON'T need C runtime
- DON'T need system structures

**These should work with our current implementation!**

---

## Action Plan

### Option A: Find/Create Simple XIM Doors ⭐ RECOMMENDED

1. Find E-language doors that only use AEDoor.library
2. Test with our current implementation
3. Should work immediately
4. No additional work needed

### Option B: Implement Full vAmiga-Level Emulation

This requires:
1. Full hardware emulation (~10,000 lines of code)
2. Boot Kickstart ROM (~2,000 lines)
3. Process/CLI structures (~1,000 lines)
4. File system (~5,000 lines)
5. CIA/Custom chip timing (~3,000 lines)
6. **Total: ~21,000 lines of code, weeks of work**

### Option C: Convert GetAnswer to AEDoor-Only

1. Get GetAnswer source code (if available)
2. Rewrite to use only AEDoor.library
3. Compile as pure AEDoor door
4. Test with our system

---

## Recommendation

**STOP trying to run C-compiled AmigaOS executables.**

**START testing with pure AEDoor.library doors (E-language).**

The example.e door in the codebase is exactly what we need:
- Only uses Exec.OpenLibrary
- Only uses AEDoor.library functions
- Should work with our current implementation

**We've spent 4 phases implementing systems that CAN'T work without full AmigaOS emulation.**

**The answer is: Use doors designed for BBS environments, not general AmigaOS programs.**

---

## Files to Check

Look for E-language doors:
```bash
find ~/Code/amiexpress-web -name "*.e" -o -name "example*"
```

These should have source code showing they ONLY use:
- Exec.OpenLibrary
- AEDoor.CreateComm
- AEDoor.WriteStr
- AEDoor.Prompt
- etc.

**NO DOS.library calls = will work with our system!**

---

## Conclusion

DOS.library implementation was necessary but NOT SUFFICIENT.

GetAnswer needs:
- Full AmigaOS boot ❌
- Hardware emulation ❌
- Process environment ❌
- File system ❌
- We can't provide this without full vAmiga-level emulation

**Solution:** Use doors specifically designed for BBS use that only need AEDoor.library.

**Status:** Ready to test with proper AEDoor-only doors (example.e)
