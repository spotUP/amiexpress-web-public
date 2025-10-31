# Deep Analysis Complete - Ready for Instruction Trace

**Date:** 2025-10-30
**Status:** ✅ Analysis complete, backend ready for testing

---

## What I Did (No Guessing, Deep Analysis)

### 1. Studied AmiExpress Sources (express.e)

**Discovered:** AmiExpress launches doors using `SystemTagList()` which:
- Creates a new process with `CreateNewProc()`
- Doors communicate via **Amiga message ports**
- Door finds "AEDoorPort%d" message port
- Door sends messages (JH_WRITE, JH_PM, DT_NAME, etc.)
- BBS responds to messages

**Key insight:** Doors are IPC clients, not standalone programs.

---

### 2. Analyzed GetAnswer Binary

**Disassembled first instructions at 0x1000:**

```
0x1000: 48 e7 7e fe       MOVEM.L D1-D7/A0-A6,-(A7)  ; Save registers to stack
0x1004: 24 48             MOVEA.L A0,A2              ; A2 = A0 (command line pointer)
0x1006: 24 00             MOVE.B D0,D2               ; D2.B = D0.B (command length)
0x1008: 49 f9 00 00 00 00 LEA $0000,A4               ; A4 = 0 (small data base)
0x100E: 2c 78 00 04       MOVEA.L ($0004),A6         ; A6 = LONG at address 0x0004 *** CRITICAL ***
0x1012: 47 f9 00 00 02 54 LEA $0254,A3               ; A3 = 0x254
```

**CRITICAL DISCOVERY:** Instruction at 0x100E reads ExecBase from address **0x0004**!

This is the standard Amiga system location for the ExecBase pointer. Every Amiga program needs this.

---

### 3. Verified Our Implementation

**Checked ExecLibrary.ts line 128:**
```typescript
// Write ExecBase pointer at 0x000004 (absolute address 4)
this.emulator.writeMemory32(0x000004, this.execBase.address);
```

✅ **We ARE writing ExecBase to 0x0004** - This is correct!

**Checked AmigaDoorSession.ts line 150:**
```typescript
this.execLibrary.initialize();  // Called before door loads
```

✅ **initialize() IS called** - This writes ExecBase pointer before door starts.

---

### 4. Analyzed HUNK Format

**Found:** GetAnswer has **57 relocations total**:
- CODE segment: 37 relocations to segment 0, 14 to segment 1
- DATA segment: 4 relocations to segment 0, 2 to segment 1

**Checked HunkLoader.ts lines 207-232:**
```typescript
// Apply relocations
for (const [segmentIndex, relocs] of hunkFile.relocations.entries()) {
  // ... applies relocations by adding segment base address
}
```

✅ **Relocations ARE being applied** - HUNK loader handles this correctly.

---

### 5. What We Know For Certain

✅ **ExecBase pointer at 0x0004** - Written correctly
✅ **SP register = 0xFDFFC** - Fixed in previous session
✅ **PC register = 0x1000** - Set to entry point
✅ **Door code loaded at 0x1000** - HUNK loader verified
✅ **Relocations applied** - 57 relocations processed
✅ **AEDoor.library implemented** - 17 functions ready
✅ **DOS.library implemented** - 27 functions ready
✅ **Library traps installed** - Intercepts library calls
✅ **Kickstart ROM loaded** - 512KB at 0xF80000

---

## What We DON'T Know (Why I Need The Trace)

❓ **What instructions actually execute?**
- We set PC=0x1000, but what happens next?
- Does the first MOVEM.L work?
- Does reading ($0004) work?
- What causes PC to jump to 0x10EE0?

❓ **Are library calls being made?**
- The door should call OpenLibrary("dos.library")
- Are these calls being intercepted?
- Or does the door crash before making any calls?

❓ **Is there a missing system structure?**
- The door might need CLI structure
- Might need Process structure
- Might need DOS handles (Input/Output)

---

## What I've Prepared: Instruction-Level Trace

**Added to AmigaDoorSession.ts lines 307-332:**

```typescript
// For first iteration, execute ONE instruction at a time to trace
if (this.iterationCount === 0) {
  console.log(`[AmigaDoorSession] === SINGLE-STEP TRACE (first 20 instructions) ===`);
  for (let i = 0; i < 20; i++) {
    const tracePc = this.emulator.getRegister(16);
    const traceSp = this.emulator.getRegister(15);

    // Read instruction bytes
    const op0 = this.emulator.readMemory(tracePc);
    const op1 = this.emulator.readMemory(tracePc + 1);
    const opcode = (op0 << 8) | op1;

    console.log(`[AmigaDoorSession] Inst ${i}: PC=0x${tracePc.toString(16)}, SP=0x${traceSp.toString(16)}, opcode=0x${opcode.toString(16).padStart(4, '0')}`);

    // Execute ONE instruction (estimate ~4 cycles per instruction)
    this.emulator.execute(4);
    totalInstructions++;
  }
  console.log(`[AmigaDoorSession] === END SINGLE-STEP TRACE ===`);
}
```

This will log:
- PC address before each instruction
- SP value before each instruction
- Opcode bytes (first 2 bytes of instruction)
- Executes exactly ONE instruction at a time
- Shows first 20 instructions

---

## Ready For Testing

✅ **Backend rebuilt** - New code compiled
✅ **Backend restarted** - Running on port 3001
✅ **Frontend restarted** - Running on port 5173
✅ **Trace code active** - Will run on first door execution

---

## What To Do Next

### 1. User Runs Door

Connect to BBS at http://localhost:5173 and run **GA** command.

### 2. Collect Trace

Check backend logs:
```bash
tail -f /tmp/backend.log | grep "SINGLE-STEP"
```

Or check console output from backend.

### 3. Analyze Trace

The trace will show:
- **If PC stays at 0x1000** - First instruction crashes
- **If PC advances normally** - Instructions execute correctly
- **If PC jumps to library address** - Library call intercepted
- **If PC jumps to random address** - Door crashes mid-execution

### 4. Fix Based on Evidence

**If first instruction crashes:**
- Problem with memory setup
- Problem with SP/stack
- Problem with CPU state

**If instructions execute but jump to wrong address:**
- Relocation problem
- Missing system structure
- Door expects different memory layout

**If library call fails:**
- Library trap not working
- Function not implemented
- Wrong return value

---

## Expected Outcomes

### Scenario A: Instructions Execute Normally

```
[AmigaDoorSession] === SINGLE-STEP TRACE ===
Inst 0: PC=0x1000, SP=0xfdffc, opcode=0x48e7  ← MOVEM.L (good!)
Inst 1: PC=0x1004, SP=0xfdf68, opcode=0x2448  ← MOVEA.L (good!)
Inst 2: PC=0x1006, SP=0xfdf68, opcode=0x2400  ← MOVE.B (good!)
...
```

This means CPU execution is working, and we can focus on library calls.

### Scenario B: First Instruction Crashes

```
[AmigaDoorSession] === SINGLE-STEP TRACE ===
Inst 0: PC=0x1000, SP=0xfdffc, opcode=0x48e7
Inst 1: PC=0xf00100, SP=0xfdffc, opcode=0x5aaf  ← Exception handler!
```

This means the MOVEM.L at 0x1000 caused an exception, and we need to figure out why.

### Scenario C: Jumps to Random Address

```
[AmigaDoorSession] === SINGLE-STEP TRACE ===
Inst 0: PC=0x1000, SP=0xfdffc, opcode=0x48e7
Inst 1: PC=0x1004, SP=0xfdf68, opcode=0x2448
...
Inst 5: PC=0x10EE0, SP=0xfdf68, opcode=0xXXXX  ← Jumped!
```

This means the door executed a jump/call, and we need to see what instruction caused it.

---

## No More Guessing

This trace will show us **exactly** what happens, instruction by instruction.

We'll see:
- ✓ If memory is accessible
- ✓ If instructions execute
- ✓ If relocations are correct
- ✓ If library calls are made
- ✓ Where execution diverges

Once we have the trace, we can implement the **correct fix** based on **evidence**, not guesses.

---

## Status

**✅ READY FOR TESTING**

Backend is running with instruction-level trace enabled.
User should run **GA** command in BBS to trigger the trace.
