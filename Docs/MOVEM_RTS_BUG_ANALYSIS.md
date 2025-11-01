# MOVEM.L/RTS Bug Analysis

## Problem Summary

Door crashes at PC=0x3a after PutMsg trap returns to address 0x1744 which contains:
```
0x1744: 4cdf 7fff   MOVEM.L (SP)+,D0-D7/A0-A6  ; Restore 15 registers
0x1748: 4e75        RTS                         ; Return from subroutine
```

## Root Cause

**MOVEM.L does not execute correctly with CYCLES_PER_ITERATION=1.**

### Expected Behavior

1. MOVEM.L pops 15 longwords (60 bytes) from stack into registers D0-D7/A0-A6
2. SP advances by 60 bytes: 0xfdeca → 0xfdf06
3. RTS pops return address from new SP (0xfdf06) = 0x18b0
4. PC jumps to 0x18b0 (correct return address)

### Actual Behavior

1. MOVEM.L opcode is decoded but **NOT executed**
2. PC advances to 0x1748 (RTS) but SP remains at 0xfdeca
3. RTS pops from original SP (0xfdeca) = **0x3a** (wrong value!)
4. PC jumps to 0x3a (crash - this is the D0 value that should have been restored)

### Evidence

```
[AmigaDoorSession] *** AFTER TRAP HANDLER: PC=0x1744, SP=0xfdeca
[AmigaDoorSession]   Stack contents:
[AmigaDoorSession]     SP+0:  0xfdeca = 0x3a        <- Should load into D0
[AmigaDoorSession]     SP+4:  0xfdece = 0x0         <- Should load into D1
[AmigaDoorSession]     SP+8:  0xfded2 = 0x4         <- Should load into D2
[AmigaDoorSession]     ...
[AmigaDoorSession]     SP+60: 0xfdf06 = 0x18b0      <- RTS should pop THIS
[AmigaDoorSession] [2154] PC=0x1744, SP=0xfdeca     <- Before MOVEM.L
[AmigaDoorSession] [2155] PC=0x1748, SP=0xfdeca     <- After MOVEM.L (SP UNCHANGED!)
[AmigaDoorSession] [2156] PC=0x3a, SP=0xfdece       <- After RTS (popped wrong value)
```

## Analysis

### MOVEM.L Timing

M68K MOVEM.L (SP)+,D0-D7/A0-A6 takes approximately:
- Base: 12 cycles
- Per register: 8 cycles
- Total: 12 + (15 × 8) = **132 cycles**

### Cycle Budget

With `CYCLES_PER_ITERATION = 1`, we only execute 1 cycle per loop iteration.

MOVEM.L needs 132 cycles to complete, but we only give it 1 cycle!

### Moira Behavior

When `execute(1)` is called with PC at MOVEM.L:
1. Moira decodes the instruction
2. Advances PC to next instruction (0x1748)
3. But **does NOT complete the register restoration or SP update**
4. Returns after 1 cycle with instruction partially executed

This creates a desynchronization:
- **PC thinks** MOVEM.L is done (points to RTS)
- **SP and registers** don't reflect MOVEM.L execution
- RTS pops from wrong stack location

## Attempted Solutions

### 1. Increase CYCLES_PER_ITERATION to 150

**Result:** Door crashes earlier (iteration 1020) due to Supervisor/RTE timing issues.

**Why:** Changing cycle count affects ALL instruction timing, causing other timing-dependent bugs to manifest.

### 2. Increase CYCLES_PER_ITERATION to 100

**Result:** Door crashes at PC=0x1d (different location).

**Why:** Same timing sensitivity issue.

### 3. Keep CYCLES_PER_ITERATION = 1

**Result:** Door reaches iteration 2156 consistently, crashes at MOVEM.L/RTS.

**Why:** This timing happens to avoid the Supervisor/RTE bugs but exposes the MOVEM.L bug.

## Possible Fixes

### Option A: Fix Moira Wrapper

Modify the Moira WASM wrapper to:
1. Detect multi-cycle instructions (MOVEM, MULS, DIVS, etc.)
2. Force execution of enough cycles to complete the instruction
3. Return actual cycles consumed

**Complexity:** HIGH (requires Moira internals knowledge)
**Risk:** MEDIUM (may break other instructions)

### Option B: Detect MOVEM.L and Execute Full Instruction

Add special handling in AmigaDoorSession:
```typescript
if (opcode === 0x4cdf) {
  // MOVEM.L detected - execute enough cycles to complete it
  this.emulator.execute(132);
} else {
  this.emulator.execute(CYCLES_PER_ITERATION);
}
```

**Complexity:** MEDIUM (need to detect all multi-cycle instructions)
**Risk:** LOW (isolated change)

### Option C: Use Instruction-Level Stepping

Instead of cycle-level stepping, use instruction-level stepping:
```typescript
// Execute until PC changes (one complete instruction)
const pcBefore = this.emulator.getRegister(16);
let cyclesExecuted = 0;
while (this.emulator.getRegister(16) === pcBefore && cyclesExecuted < 200) {
  cyclesExecuted += this.emulator.execute(1);
}
```

**Complexity:** MEDIUM
**Risk:** MEDIUM (may infinite loop on some instructions)

### Option D: Increase Cycle Budget Universally

Set `CYCLES_PER_ITERATION = 200` and accept timing changes.

**Complexity:** LOW
**Risk:** HIGH (breaks other timing-sensitive code paths)

## Recommendation

**Option B** is the best short-term solution:
1. Detect multi-cycle instructions before execution
2. Execute sufficient cycles to complete them
3. Minimal code changes
4. Low risk

**Long-term:** Option A (fix Moira wrapper) is the proper solution but requires deeper investigation.

## Current Status

- Door executes to iteration 2156
- MOVEM.L at 0x1744 does not execute correctly
- PC becomes 0x3a (should be 0x18b0)
- Root cause: Moira executes 1 cycle of 132-cycle instruction

## Next Steps

1. Implement Option B: Detect MOVEM.L and execute 132+ cycles
2. Test if door progresses past RTS at 0x1748
3. Monitor for next crash location
