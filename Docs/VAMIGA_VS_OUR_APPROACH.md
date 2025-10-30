# vAmiga vs Our Approach - Critical Differences (2025-10-30)

## Key Discovery

**vAmiga does NOT use trap handling in read16() - it just reads directly from ROM!**

## vAmiga's Approach

### 1. Memory Layout (Memory.h lines 64-66)

```cpp
// Reads a value from Boot ROM or Kickstart ROM in big endian format
#define READ_ROM_8(x)       R8BE (rom + ((x) & romMask))
#define READ_ROM_16(x)      R16BE(rom + ((x) & romMask))
```

ROM is real memory buffer, 512KB at addresses 0xF80000-0xFFFFFF.

### 2. CPU read16 (CPU.cpp line 75-77)

```cpp
u16
Moira::read16(u32 addr) const
{
    return mem.peek16<Accessor::CPU>(addr);
}
```

No trap handling! Just routes to memory.

### 3. ROM peek16 (Memory.cpp line 1351-1357)

```cpp
Memory::peek16 <Accessor::CPU, MemSrc::ROM> (u32 addr)
{
    ASSERT_ROM_ADDR(addr);

    stats.kickReads.raw++;
    return READ_ROM_16(addr);
}
```

**Just reads from ROM buffer - no special handling!**

## Our Approach (WRONG!)

### 1. Trap Handling in read16 (moira-wrapper.cpp lines 23-46)

```cpp
u16 read16(u32 addr) const override {
    // Check if this is a library trap (0xFF0000 or higher)
    if (addr >= 0xFF0000) {
        i32 offset;
        if (addr >= 0xFE000000) {
            offset = (i32)(addr | 0xFF000000);
        } else {
            offset = (i32)addr;
        }

        // Call the trap handler
        if (trapHandlerSet && !jsTrapHandler.isUndefined()) {
            jsTrapHandler(offset);
        }

        // Return RTS instruction so execution continues
        return 0x4E75;
    }

    // Normal memory read
    // ...
}
```

**We're intercepting ROM reads and returning virtual RTS instructions!**

### 2. The Problem

When the door does `JSR $FF0000`:

1. CPU pushes return address
2. CPU sets PC = 0xFF0000
3. CPU calls read16(0xFF0000) to fetch instruction
4. **Our read16() calls trapHandler and returns 0x4E75 (RTS)**
5. CPU executes RTS
6. **But then CPU calls read16(0xFF0002) for NEXT instruction**
7. We return 0x4E75 again
8. CPU executes another RTS
9. **INFINITE RTS LOOP!**

The issue is: **RTS doesn't actually return from JSR - it pops the stack and sets PC, but then Moira immediately fetches the next instruction at the NEW PC!**

## Why This Doesn't Work

### Scenario: Door calls library function

```asm
Door code at 0x1234:
    JSR $FF0000          ; Call dos.library function
    ; Return here
```

**What should happen (vAmiga way):**
1. JSR pushes 0x123A, sets PC=0xFF0000
2. read16(0xFF0000) returns ACTUAL ROM CODE (start of dos.library function)
3. Function executes (calls other functions, does work)
4. Function ends with RTS
5. RTS pops 0x123A, sets PC=0x123A
6. Execution continues at 0x123A

**What happens with our trap mechanism:**
1. JSR pushes 0x123A, sets PC=0xFF0000
2. read16(0xFF0000) calls trapHandler, returns 0x4E75 (virtual RTS)
3. CPU executes RTS: pops 0x123A, sets PC=0x123A
4. **BUT trapHandler is synchronous! It sets D0=result but CPU already executed RTS!**
5. Execution continues at 0x123A **WITHOUT the function actually running!**

## The REAL Problem

**Our trap mechanism is fundamentally broken!**

We're trying to:
- Intercept library calls via read16()
- Execute JavaScript handlers
- Return RTS to continue

But this doesn't work because:
- The RTS executes IMMEDIATELY (in the same instruction)
- The trapHandler runs synchronously
- By the time trapHandler finishes, RTS already returned
- The function never actually runs!

## What vAmiga Does (The Right Way)

vAmiga doesn't intercept library calls at the CPU level. Instead:

1. **ROM contains REAL library code**
2. **Libraries execute actual 68k instructions**
3. **System is fully initialized by ROM boot code**

Programs call libraries like this:
```asm
MOVE.L 4.W,A6          ; Get ExecBase from address 4
JSR    -552(A6)        ; Call OpenLibrary
```

This jumps to ROM code which:
- Validates parameters
- Looks up the library
- Returns library base in D0
- Uses RTS to return

**All of this is REAL 68k code running in ROM!**

## Why Our Doors Fail

1. **We have ROM but don't run ROM boot code**
   - ROM needs to initialize system
   - Set up ExecBase, library lists, etc.
   - We skip this!

2. **We intercept library calls with fake RTS**
   - Doesn't actually execute library functions
   - Just returns immediately
   - Function logic never runs!

3. **We stub out functions in JavaScript**
   - But the CPU has already moved on
   - Our stubs run "after the fact"
   - Too late to affect execution!

## Solutions

### Option 1: Run ROM Boot Code (HARD but CORRECT)

1. Load ROM at 0xF80000
2. Set PC to ROM initial PC (0x002000d2)
3. Set SP to ROM initial SSP (0x11164ef9)
4. Let ROM boot code run
5. **ROM will initialize everything**
6. Then somehow jump to our door code

**Problems:**
- ROM expects hardware (custom chips, drives, etc.)
- May try to access hardware we don't emulate
- Very complex to get right
- May take long time to boot

### Option 2: Minimal ROM + Stub Libraries (EASIER)

1. Keep ROM mapped at 0xF80000
2. DON'T run ROM boot code
3. Create minimal ExecBase structure (DONE!)
4. **Replace trap mechanism with proper 68k stubs**

Instead of returning virtual RTS, write actual 68k code to trap region:

```asm
; At 0xFF0000 (dos.library Open function):
    MOVE.L  D0,-(SP)        ; Save D0
    MOVE.L  D1,-(SP)        ; Save D1
    ; ... call our JavaScript handler somehow ...
    MOVE.L  (SP)+,D1        ; Restore D1
    MOVE.L  (SP)+,D0        ; Restore D0
    RTS                     ; Return to caller
```

**But how do we call JavaScript from 68k code?**
- We can't directly!
- Need a different approach...

### Option 3: Hardware Trap Instruction (BEST!)

Use 68k TRAP instruction which Moira supports:

```asm
; At 0xFF0000 (dos.library Open function):
    TRAP #0                 ; Triggers exception
    RTS
```

Moira has trap handlers! We can register a trap handler that:
1. Gets called on TRAP instruction
2. Runs our JavaScript library function
3. Returns control to Moira
4. Moira continues execution

**This is the proper way to intercept function calls!**

### Option 4: Just Fill ROM With NOPs (CURRENT)

We already tried writing RTS instructions. Maybe the issue is:
- We're writing to 0xFF0000-0xFFFFFF
- But ROM is actually at 0xF80000-0xFFFFFF!
- We're not overwriting the right region!

## Recommended Fix

### IMMEDIATE: Fix ROM region

Our ROM is at 0xF80000-0xFFFFFF. But we're writing RTS to 0xFF0000-0xFFFFFF.

**These overlap but aren't the same!**

```
ROM:          0xF80000 ─────────────────── 0xFFFFFF (512KB)
Our RTS region: 0xFF0000 ─────────────── 0xFFFFFF (64KB)
```

We're only filling the LAST 64KB of ROM!

**Fix:**
```typescript
// Write RTS to ENTIRE ROM region
for (let addr = 0xF80000; addr < 0x1000000; addr += 2) {
    this.emulator.writeMemory(addr, 0x4E);     // RTS high byte
    this.emulator.writeMemory(addr + 1, 0x75); // RTS low byte
}
```

But this will overwrite our ROM data!

### BETTER: Use TRAP Instructions

1. Write TRAP #0 instructions to library entry points
2. Register Moira trap handler
3. In trap handler, call our JavaScript functions
4. Return from trap handler
5. Execution continues

**This is how professional emulators do it!**

## Next Steps

1. Check if Moira supports TRAP instruction handling
2. If yes, replace RTS with TRAP instructions
3. Register trap handler in Moira
4. Test door execution

If TRAP doesn't work, we need to either:
- Run ROM boot code (very complex)
- Find another way to intercept function calls
- Give up on trap mechanism and just let ROM code run

---

**Bottom line: Our current approach is fundamentally broken. We need to rethink the entire library trap mechanism.**
