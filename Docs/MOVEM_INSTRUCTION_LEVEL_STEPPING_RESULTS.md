# MOVEM.L Instruction-Level Stepping Results

**Date:** 2025-11-01
**Status:** ⚠️ MOVEM.L STILL NOT EXECUTING
**Moira WASM Issue Confirmed**

---

## What We Tried

Implemented Option C from MOVEM_RTS_BUG_ANALYSIS.md: Instruction-level stepping.

### Implementation

```typescript
// For MOVEM.L (SP)+,<register list> - opcode 0x4cdf
// Execute cycles until PC changes (instruction-level stepping)
if (opcode === 0x4cdf) {
  const registerMask = this.emulator.readMemory16(pcBeforeExecute + 2);
  const registerCount = this.countBits(registerMask);

  let cyclesExecuted = 0;
  let currentPC = pcBeforeExecute;
  const maxCycles = 200; // Safety limit

  while (currentPC === pcBeforeExecute && cyclesExecuted < maxCycles) {
    cyclesExecuted += this.emulator.execute(1);
    currentPC = this.emulator.getRegister(16);
  }

  console.log(`MOVEM.L completed: ${cyclesExecuted} cycles, PC now 0x${currentPC.toString(16)}`);
}
```

---

## Results

### Test Run (Iteration 2154-2156)

```
[AmigaDoorSession] [2154] MOVEM.L detected at PC=0x1744: 15 registers, using instruction-level stepping
[AmigaDoorSession] [2154] MOVEM.L completed: 8 cycles, PC now 0x1748
[AmigaDoorSession] [2155] PC=0x1748, SP=0xfdeca, A6=0x10000, D0=0x0, D1=0x0, D2=0x4, A0=0x0, A1=0x1ca4, opcode=0x4e75
[AmigaDoorSession] [2156] PC=0x3a, SP=0xfdece, A6=0x10000, D0=0x0, D1=0x0, D2=0x4, A0=0x0, A1=0x1ca4, opcode=0x01c0
```

### Analysis

**Iteration 2154 (MOVEM.L execution):**
- Starting PC: 0x1744
- Starting SP: 0xfdeca
- Executed 8 cycles until PC changed
- Ending PC: 0x1748 ✓ CORRECT (next instruction)
- Ending SP: 0xfdeca ✗ **UNCHANGED!**

**Iteration 2155 (RTS instruction):**
- PC: 0x1748
- Opcode: 0x4e75 (RTS)
- SP: 0xfdeca (still wrong!)
- Registers: D0=0, D1=0, D2=4 ✗ **NOT RESTORED!**

**Iteration 2156 (After RTS):**
- PC: 0x3a ✗ **CRASH!**
- SP: 0xfdece (only advanced 4 bytes from RTS)

---

## Key Finding: MOVEM.L Not Actually Executing

**The MOVEM.L instruction is being DECODED but NOT EXECUTED by Moira WASM.**

### Evidence

1. **PC advances correctly** (0x1744 → 0x1748) ✓
2. **SP does NOT advance** (stays at 0xfdeca) ✗
3. **Registers NOT restored** (D0 should be 0x3a, but is 0x0) ✗
4. **Only 8 cycles consumed** (should be ~132 for 15 registers) ✗

### Expected vs Actual

| Aspect | Expected | Actual |
|--------|----------|--------|
| PC after MOVEM.L | 0x1748 | 0x1748 ✓ |
| SP after MOVEM.L | 0xfdf06 (+60 bytes) | 0xfdeca (unchanged) ✗ |
| D0 after MOVEM.L | 0x3a (from SP+0) | 0x0 (not restored) ✗ |
| D1 after MOVEM.L | 0x0 (from SP+4) | 0x0 (coincidence?) |
| D2 after MOVEM.L | 0x4 (from SP+8) | 0x4 (coincidence?) |
| Cycles consumed | ~132 | 8 ✗ |

---

## Conclusion

**Moira WASM has a bug with MOVEM.L (or we're using it incorrectly).**

The emulator:
1. Decodes the MOVEM.L instruction
2. Advances PC to the next instruction
3. **Does NOT actually restore registers from stack**
4. **Does NOT update SP**
5. Returns after only 8 cycles

This is a **fundamental emulation bug** that cannot be fixed with:
- More cycles (tried 132 cycles - didn't work)
- Instruction-level stepping (tried - didn't work)
- Any amount of cycle manipulation

---

## Options Going Forward

### Option 1: Manual MOVEM.L Implementation

**Implement MOVEM.L restoration ourselves in JavaScript:**

```typescript
if (opcode === 0x4cdf) {
  const registerMask = this.emulator.readMemory16(pcBeforeExecute + 2);
  let sp = this.emulator.getRegister(15);

  // Manually restore each register from stack
  for (let i = 0; i < 16; i++) {
    if (registerMask & (1 << i)) {
      const value = this.emulator.readMemory32(sp);
      this.emulator.setRegister(i, value);  // D0-D7, A0-A7
      sp += 4;
    }
  }

  // Update SP
  this.emulator.setRegister(15, sp);

  // Manually advance PC
  this.emulator.setRegister(16, pcBeforeExecute + 4);
}
```

**Pros:**
- Complete control over execution
- Can log each register restoration
- Guaranteed correct behavior

**Cons:**
- Need to implement for ALL multi-cycle instructions (MOVEM, MULS, DIVS, etc.)
- Bypasses Moira - defeats purpose of emulator
- Might miss subtle M68K behaviors

### Option 2: Fix Moira WASM Wrapper

**Investigate and fix the Moira WASM compilation:**
- Check if WASM is built correctly
- Check if we're calling Moira API correctly
- Check if Moira source has known MOVEM.L bugs
- Rebuild WASM with debug symbols

**Pros:**
- Proper fix at emulator level
- Benefits all instructions
- Maintains authentic M68K behavior

**Cons:**
- Requires Rust/WASM knowledge
- Time-consuming investigation
- May require Moira source code changes

### Option 3: Switch Emulators

**Use a different M68K emulator:**
- Musashi (C-based, widely used)
- vAmiga's CPU emulation (C++)
- UAE CPU core (C)

**Pros:**
- Battle-tested emulators
- Known to work correctly
- Active communities

**Cons:**
- Major refactoring required
- Need to compile C/C++ to WASM
- Learning new emulator API

### Option 4: Investigate Moira execute() API

**Check if there's a different API for completing instructions:**
- Maybe `execute(1)` is a "single step" that only advances PC?
- Maybe there's an `executeInstruction()` method?
- Maybe we need to call a different function to apply state changes?

**Pros:**
- Might be a simple API misunderstanding
- Quick fix if we find the right method

**Cons:**
- Moira documentation may be sparse
- May not exist

---

## Recommendation

**Try Option 4 first (investigate Moira API), then Option 1 (manual implementation).**

### Immediate Next Steps

1. **Check Moira WASM bindings** - Look at the WASM wrapper code:
   ```bash
   find . -name "*.js" -o -name "*.ts" | xargs grep -l "moira\|emulator"
   ```

2. **Check if setRegister() method exists:**
   ```typescript
   this.emulator.setRegister(0, 0x3a);  // Try to set D0
   const d0 = this.emulator.getRegister(0);  // Read it back
   console.log('D0 after set:', d0);
   ```

3. **If setRegister exists**, implement Option 1 (manual MOVEM.L)

4. **If setRegister doesn't exist**, we need Option 2 or 3

---

## Test Results Summary

- ✅ Instruction-level stepping works (PC advances correctly)
- ✗ MOVEM.L state changes don't apply (SP/registers unchanged)
- ✗ Door still crashes at PC=0x3a
- ✗ No progress beyond iteration 2156

**The MOVEM.L bug is a Moira WASM execution issue, not a timing issue.**
