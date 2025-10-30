# CRITICAL DISCOVERY: Door Execution Flow Broken (2025-10-30)

## The Real Problem

**The door is NOT calling library functions with offset from A6 - it's doing ABSOLUTE JSR calls to the 0xFF0000 region!**

## Evidence

```
[AmigaDOS] ⚠️ UNIMPLEMENTED FUNCTION CALL
[AmigaDOS]   Offset: 16711682 (normalized: 16711682)
[AmigaDOS]   Library base: 0xffff0000
[AmigaDOS]   Trap address: 0xff0002
[AmigaDOS]   PC: 0xff0002, A6: 0x0, D0: 0x0, SP: 0xfe084
```

**Key observations:**
1. **PC = 0xFF0002** ← CPU is INSIDE the trap region!
2. **A6 = 0** ← No library base in A6!
3. **Trap address = 0xFF0002** ← Door did JSR $FF0002 (absolute)

## What This Means

The door is doing:
```asm
JSR $FF0000   ; Absolute jump
JSR $FF0002   ; Absolute jump
JSR $FF0004   ; Absolute jump
```

NOT:
```asm
MOVE.L DosBase,A6  ; Load library base into A6
JSR -54(A6)        ; Call function at offset -54
```

## Why This Breaks

1. Door does `JSR $FF0000`
2. CPU pushes return address onto stack
3. CPU sets PC = 0xFF0000
4. CPU calls read16(0xFF0000) to fetch instruction
5. moira-wrapper.cpp detects trap, calls trapHandler, returns 0x4E75 (RTS)
6. CPU executes RTS
7. RTS should pop return address and jump back to door
8. **BUT** the CPU is still at PC=0xFF0002!

## Hypothesis: RTS Not Working

Either:
1. Stack is corrupted (return address wrong)
2. RTS isn't executing properly
3. CPU is continuing to fetch next instruction after RTS

## What Should Happen

```
Door code at 0x1234:
    JSR $FF0000          ; Pushes 0x123A (next instruction), sets PC=0xFF0000

At 0xFF0000:
    read16(0xFF0000) → returns 0x4E75 (RTS)
    RTS executes → pops 0x123A from stack, sets PC=0x123A

Back to door code at 0x123A:
    ; Continue execution
```

## What's Actually Happening

```
Door code:
    JSR $FF0000          ; Pushes return, sets PC=0xFF0000

At 0xFF0000:
    read16(0xFF0000) → 0x4E75 (RTS)
    RTS executes...

Still at 0xFF0000 region:
    PC = 0xFF0002        ; Didn't return!
    read16(0xFF0002) → 0x4E75 (RTS again)
    RTS executes...

Still at 0xFF0000 region:
    PC = 0xFF0004        ; STILL didn't return!
```

## Possible Causes

### 1. Moira Doesn't Execute RTS When read16() Returns It

Maybe Moira expects RTS to be in REAL memory, not returned on-the-fly?

### 2. Stack Pointer Is Wrong

Stack pointer: 0xFE084

Is this valid? Should check if:
- Stack exists at this address
- Return address was actually pushed
- RTS can pop it

### 3. read16() Gets Called Multiple Times

Maybe read16(0xFF0000) is called multiple times:
- Once for instruction fetch → returns RTS
- Once for next instruction fetch → returns RTS again
- CPU thinks there are MULTIPLE RTS instructions in a row?

### 4. PC Increment Happens After read16()

Maybe Moira increments PC BEFORE executing the instruction:
1. PC = 0xFF0000
2. read16(0xFF0000) → 0x4E75
3. Moira increments PC to 0xFF0002
4. Moira executes RTS (which should set PC from stack)
5. But maybe the PC increment "wins"?

## Solution Ideas

### Option 1: Don't Return RTS - Manually Set PC

Instead of returning RTS instruction, directly manipulate the CPU state:

```cpp
if (is trap address) {
    trapHandler(offset);

    // Pop return address from stack and set PC
    u32 sp = getRegister(15);  // Stack pointer
    u32 returnAddr = read32(sp);  // Pop return address
    setRegister(15, sp + 4);   // Adjust stack
    setRegister(16, returnAddr); // Set PC

    return 0x4E71;  // NOP - just in case
}
```

### Option 2: Write RTS to Actual Memory

Write RTS instructions to 0xFF0000-0xFFFFFF region so Moira can execute them normally:

```typescript
// In AmigaDoorSession initialization:
for (let addr = 0xFF0000; addr < 0xFF0100; addr += 2) {
    this.emulator.writeMemory(addr, 0x4E);
    this.emulator.writeMemory(addr + 1, 0x75);
}
```

### Option 3: Check Why A6=0

The door should be loading A6 with a library base before calling functions. Why is A6=0?

Maybe the door expects us to SET A6 somehow? Like:
- ExecBase at 0x000004 should point to a structure
- That structure should contain library base pointers
- Door reads from that structure to get A6 value

## Recommended Next Step

**Try Option 2 first** - write actual RTS instructions to the trap region. This is simplest and most likely to work.

If that doesn't work, try Option 1 - manually manipulate PC and SP.

---

*This is the core issue blocking door execution!*
