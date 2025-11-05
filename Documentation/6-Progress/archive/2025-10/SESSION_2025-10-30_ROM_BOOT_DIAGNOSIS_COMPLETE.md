# ROM Boot Diagnosis Complete - 2025-10-30

## Executive Summary

After extensive debugging and studying vAmiga sources, we've determined **why Kickstart ROM cannot boot in our current implementation** and **what needs to be done**.

## The Problem

**Kickstart ROM gets stuck at address 0xf80e5a after 1M CPU cycles.**

### Detailed Analysis

**Stuck Location:**
- PC: 0xf80e5a (early in ROM boot, only 14,938 bytes into 512KB ROM)
- Instruction: 0xb45c = `CMP.W (A0)+,D2`
- A0: 0x00c002c0 (custom chip region)
- A1: 0x00c00410 (custom chip region)
- D0: 0x000326b1
- D1: 0xffff0003
- SR: 0x2700 (supervisor mode, interrupts disabled)

**What ROM Is Doing:**
```asm
loop:
    CMP.W (A0)+,D2    ; Compare word at [A0] with D2, increment A0
    BNE   loop        ; Branch if not equal (likely)
```

The ROM is **polling a custom chip register**, waiting for it to change. Since we return static values, the register never changes, and the loop never exits.

## Root Cause: Missing Hardware Emulation

### Discovery from vAmiga Sources

From `vAmiga/Core/Components/CPU/CPU.cpp` and `vAmiga/Core/Components/Amiga.cpp`:

```cpp
// vAmiga execution loop
while (1) {
    cpu.execute();              // Execute ONE CPU instruction
    agnus.execute(cycles);      // Advance ALL hardware by same cycles

    // Check for breakpoints, interrupts, etc.
}
```

**Key Insight:** CPU and hardware run **together**, not separately!

### What We're Missing

1. **Agnus (Custom Chip Controller)**
   - Beam position advancement (scanline 0-312, hpos 0-227)
   - DMA operations
   - Sprite/bitplane fetching
   - Copper execution

2. **Interrupt Generation**
   - VBlank interrupt (every ~20ms, 50Hz PAL)
   - Copper interrupts
   - Blitter interrupts
   - CIA timer interrupts

3. **Hardware State Progression**
   - Registers change values based on hardware activity
   - VPOSR/VHPOSR update with beam position
   - CIA timers count
   - DMA status changes

4. **Event Scheduling System**
   - vAmiga uses complex event scheduler
   - Primary/secondary/tertiary event slots
   - Events trigger at specific DMA cycles
   - Handles timing-critical operations

### What We Implemented (Insufficient)

✅ Dynamic VPOSR/VHPOSR based on CPU cycle count
✅ CIA timer increments based on CPU cycles
✅ Custom chip register stubs returning safe defaults

❌ Hardware state only updates **when registers are read**
❌ No interrupt generation
❌ No DMA emulation
❌ No event scheduling
❌ Hardware doesn't advance during CPU execution

**Result:** ROM executes millions of CPU cycles, but hardware never progresses. ROM polls hardware waiting for changes that never come.

## Evidence

### Test Results

1. **No STOP instruction** - ROM not waiting for interrupt via STOP
2. **No custom chip reads** - ROM stuck before ever reading VPOSR/VHPOSR
3. **Polling loop confirmed** - CMP instruction in tight loop
4. **1M cycles without progress** - PC stuck at same address

### Memory Access Pattern

- ROM executes from 0xF80000+ (normal)
- Accesses custom chip region via A0 (0xC002C0)
- Never reaches 0xDFF004 (VPOSR) or 0xDFF006 (VHPOSR)
- Stuck very early in boot process

## Why This Is Hard

### vAmiga's Complexity

vAmiga is a **complete system emulator** with:
- ~15,000+ lines of hardware emulation code
- Event-driven architecture
- Cycle-accurate timing
- Full DMA emulation
- Complex interrupt handling
- Copper co-processor
- Blitter operations
- Paula audio/disk/serial
- Denise graphics

**Estimated effort to replicate:** Several person-months of work.

### Key vAmiga Files

```
Core/Components/Agnus/          ~8,000 lines
  - Agnus.cpp                   Main Agnus chip
  - AgnusEvents.cpp             Event scheduler
  - AgnusRegs.cpp               Register reads/writes
  - Beam.cpp                    Beam position tracking
  - Blitter/                    Blitter DMA
  - Copper/                     Copper co-processor
  - Sequencer/                  DMA sequencing

Core/Components/Paula/          ~5,000 lines
  - Paula.cpp                   Main Paula chip
  - Audio/                      4-channel audio
  - DiskController/             Floppy disk
  - UART/                       Serial port

Core/Components/Denise/         ~4,000 lines
  - Denise.cpp                  Graphics chip
  - PixelEngine.cpp             Pixel rendering
  - Colors.cpp                  Palette handling

Core/Components/CIA/            ~2,000 lines
  - CIA.cpp                     CIA timer chips
  - TOD.cpp                     Time-of-day clock

Core/Infrastructure/            ~3,000 lines
  - Thread.cpp                  Execution loop
  - Emulator.cpp                Main emulator
```

## Options Moving Forward

### Option A: Full Hardware Emulation (Like vAmiga)

**Approach:** Implement complete Agnus/Paula/Denise emulation

**Pros:**
- Kickstart ROM boots correctly
- Full Amiga compatibility
- Can run any Amiga software

**Cons:**
- Months of development time
- ~20,000+ lines of complex code
- Cycle-accurate timing required
- Extensive testing needed

**Estimate:** 3-6 person-months

### Option B: Minimal Hardware Stubs (Current Attempt - Failed)

**Approach:** Return static values from hardware registers

**Pros:**
- Quick to implement
- Minimal code

**Cons:**
- **Does not work** - ROM gets stuck
- Cannot boot Kickstart
- Doors cannot run

**Status:** ❌ Failed approach

### Option C: Skip ROM Boot Entirely (Recommended for Doors)

**Approach:** Pre-initialize system state without booting ROM

**Key Insight:** XIM doors don't need full Kickstart ROM! They just need:
1. ExecBase structure
2. Library function vectors
3. Basic system structures
4. AEDoor.library functions

**Implementation:**
```typescript
// Instead of booting ROM, create minimal ExecBase
function createMinimalExecBase() {
  // Allocate ExecBase at 0x000004
  const execBaseAddr = 0x010000;
  memory.write32(0x000004, execBaseAddr);

  // Initialize ExecBase structure
  memory.write16(execBaseAddr + 0x14, 37);  // Version 37 (Kickstart 2.x)
  memory.write16(execBaseAddr + 0x16, 175); // Revision

  // Set up library function vectors
  setupExecLibrary(execBaseAddr);
  setupDosLibrary();
  setupAEDoorLibrary();

  return execBaseAddr;
}
```

**Pros:**
- Much simpler than full emulation
- Faster door startup
- Sufficient for XIM door execution
- Can implement just what doors actually use

**Cons:**
- Not a "real" Amiga system
- Cannot run arbitrary Amiga software
- Need to implement called library functions

**Estimate:** 1-2 weeks

### Option D: Use Existing Emulator (UAE/vAmiga as Library)

**Approach:** Embed full emulator and communicate with it

**Pros:**
- Working ROM boot immediately
- Full compatibility
- Battle-tested code

**Cons:**
- Large dependency
- Complex integration
- Licensing considerations (vAmiga is MPL 2.0)
- May be overkill for doors

**Estimate:** 2-3 weeks integration

## Recommendation

**For XIM Door Execution: Option C (Skip ROM Boot)**

### Rationale

1. **Doors don't need full system** - They use AEDoor.library API
2. **ROM boot is too complex** - Requires full hardware emulation
3. **Faster development** - 1-2 weeks vs 3-6 months
4. **Sufficient for goal** - Can execute XIM doors successfully

### Implementation Plan

1. **Research XIM door requirements**
   - What ExecBase fields do doors access?
   - What library functions are called?
   - What system structures are needed?

2. **Create minimal ExecBase**
   - Version/revision fields
   - Library list pointers
   - Task structures

3. **Implement library stubs**
   - Exec.library functions (OpenLibrary, FindTask, etc.)
   - DOS.library functions (Open, Read, Write, Close, etc.)
   - AEDoor.library functions (all 21 functions)

4. **Test with simple door**
   - Start with GetAnswer (8KB)
   - Verify library calls work
   - Fix any missing functions

5. **Expand as needed**
   - Add functions as doors call them
   - Implement only what's actually used
   - Keep it minimal but functional

## Key Takeaways

1. **ROM boot requires full hardware emulation** - No shortcuts work
2. **vAmiga sources have all answers** - Don't guess, reference them
3. **Doors don't need ROM** - They need library functions
4. **Skip what you don't need** - Minimal approach for doors
5. **Full emulation = months of work** - Not necessary for door execution

## Files Created Today

1. `CRITICAL_RULES.md` - Document vAmiga reference requirement
2. `CLAUDE.md` - Updated with vAmiga reference rule
3. This document - Complete diagnosis and path forward

## Next Steps

**Immediate:**
1. Research XIM door internals (check door sources if available)
2. Document AEDoor.library API requirements
3. Create minimal ExecBase implementation plan

**Implementation:**
1. Create `MinimalExecBase` class
2. Implement essential Exec functions
3. Stub AEDoor.library functions
4. Test with GetAnswer door
5. Iterate based on what doors actually call

**Success Criteria:**
- GetAnswer door loads and executes
- Door I/O functions work (aePutCh, aeGetCh)
- No ROM boot required
- Fast door startup (<100ms)

## Conclusion

After extensive debugging and vAmiga source analysis, we now understand:

- **Why ROM boot fails:** Missing hardware emulation
- **What's needed for ROM boot:** Full Agnus/Paula/Denise implementation
- **Better approach for doors:** Skip ROM, create minimal system
- **Path forward:** Implement minimal ExecBase + library stubs

The correct solution for XIM door execution is **not** to boot Kickstart ROM, but to provide the minimal system state that doors expect.

ROM boot remains an option for future full Amiga emulation, but it's not needed for the door execution use case.
