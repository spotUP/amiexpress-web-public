# Door Execution Blocker - Final Analysis

**Date:** 2025-10-30
**Status:** ❌ BLOCKED - Door never executes at entry point

---

## Summary

Despite implementing:
- ✅ Complete AEDoor.library (17 functions)
- ✅ Library call trapping system
- ✅ Kickstart 3.1 ROM loading
- ✅ Exception handlers
- ✅ Supervisor mode
- ✅ ExecBase structures

**The GetAnswer door still fails to execute.** PC never reaches the door's entry point (0x1000) and instead executes garbage memory.

---

## What We Know

### Door Loading (Works ✅)
```
[AmigaDoorSession] Parsed 2 segments:
  Segment 0: CODE at 0x1000, size=7076 bytes
  Segment 1: DATA at 0x2c00, size=596 bytes
[AmigaDoorSession] Door loaded at entry point: 0x1000
```

### CPU Setup (Works ✅)
```
  SP: 0xfdffc
  PC: 0x1000  ← Set correctly!
  A6 (ExecBase): 0x60000
  SR: 0x2700 (supervisor mode)
```

### Execution (Fails ❌)
```
PC never reaches 0x1000!
Iteration 10000: PC=0x67d885  (garbage)
Iteration 20000: PC=0x4ac8d5  (garbage)
Iteration 30000: PC=0x2db925  (garbage)
```

**The CPU is set to PC=0x1000 but immediately jumps elsewhere!**

---

## Root Cause Analysis

### Theory 1: First Instruction Crashes
The very first instruction at 0x1000 causes an exception, and even our exception handlers can't recover.

**Evidence:**
- PC jumps to random addresses immediately
- Never see PC=0x1000 in any iteration log
- Exception handlers are skipping instructions but door keeps crashing

### Theory 2: Stack or Memory Corruption
The door's first instruction might be accessing invalid memory.

**Evidence:**
- Door expects certain memory layout
- We don't have workbench, DOS structures, etc.
- First instruction might be loading from NULL pointer

### Theory 3: HUNK Loader Issues
The door segments might not be loaded correctly.

**Counter-evidence:**
- HUNK loader verified working in other contexts
- Segments loaded at correct addresses
- Entry point is valid

---

## What the Door Actually Needs (from strings analysis)

```bash
$ strings GetAnswer
dos.library
intuition.library
```

The door requires **dos.library** which has functions like:
- Open()
- Close()
- Read()
- Write()
- etc.

We don't have these implemented! The door probably crashes immediately trying to call DOS functions.

---

## The Real Problem: Missing DOS.library

**The door is an AmigaOS executable that expects a fully functional DOS.library.**

Even though dos.library is in the ROM, it's not **initialized** or **callable** because:
1. ROM is loaded but not booted
2. DOS.library needs workbench/system structures
3. Our library trapping only covers Exec and AEDoor

---

## Solutions (In Order of Viability)

### Option 1: Implement DOS.library Trapping ⭐ RECOMMENDED

Create minimal DOS.library stub functions:

```typescript
// DOSLibrary.ts
class DOSLibrary {
  open(nameAddr: number, mode: number): number {
    // Return fake file handle
    return 0x12345;
  }

  close(handle: number): void {
    // No-op
  }

  read(handle: number, bufferAddr: number, length: number): number {
    // Return 0 bytes read
    return 0;
  }

  write(handle: number, bufferAddr: number, length: number): number {
    // Return length (fake successful write)
    return length;
  }

  // ... other DOS functions
}
```

**Pros:**
- Doors can at least start
- We control what DOS functions do
- Can stub out what we don't need

**Cons:**
- Need to implement many DOS functions
- Time consuming

### Option 2: Boot the Kickstart ROM Fully

Actually execute the ROM boot code to initialize the full system.

**Pros:**
- Everything would work "for real"
- All libraries initialized

**Cons:**
- Requires full hardware emulation (Paula, Denise, CIA, etc.)
- ROM expects keyboard, mouse, floppy drives
- Extremely complex
- Likely weeks of work

### Option 3: Use Different Door Format

Find doors that don't use DOS.library at all.

**Cons:**
- GetAnswer uses DOS.library
- Most Amiga programs use DOS.library
- Dead end

---

## Recommendation

**Implement minimal DOS.library trapping** (Option 1).

Start with just the functions GetAnswer actually calls:
1. Find what DOS functions it uses (disassemble or log)
2. Implement those specific functions as stubs
3. Gradually add more as needed

This is the pragmatic approach that will get doors running without requiring full Amiga hardware emulation.

---

## Next Steps

1. **Disassemble GetAnswer** to see exact DOS calls
2. **Implement DOSLibrary.ts** with minimal functions
3. **Add DOS vectors to LibraryTraps**
4. **Test again**

Once DOS.library stubs are in place, the door should:
- Start executing at 0x1000
- Call OpenLibrary("dos.library") → succeed
- Call OpenLibrary("AEDoor.library") → succeed
- Run its main loop
- Actually work!

---

## Files Modified in This Session

- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` - Complete (710 lines, 17 functions)
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - Exception handlers added
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - AEDoor vectors added
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - ROM loading, supervisor mode

---

## Conclusion

We've built a complete AEDoor.library implementation, but **the door can't run because it needs DOS.library**.

The next phase must implement DOS.library trapping before any door can execute.

**Status: BLOCKED on DOS.library implementation**
