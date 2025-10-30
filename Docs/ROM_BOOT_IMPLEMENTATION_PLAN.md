# ROM Boot Implementation Plan
## Complete Blueprint from vAmiga Sources

**Date:** 2025-10-30
**Status:** Planning Phase
**Goal:** Implement proper ROM code execution for Amiga doors

---

## Executive Summary

After analyzing vAmiga's source code, we have a complete blueprint for implementing proper ROM execution. The key insight: **vAmiga doesn't use trap mechanisms at all** - it simply loads ROM into memory and lets the 68k CPU execute it normally.

### What We Learned from vAmiga

1. **ROM is just memory** - Mapped at 0xF80000-0xFFFFFF, read via normal memory access
2. **No trap mechanism** - read16() just returns ROM bytes, no interception
3. **ROM boot is simple**:
   - Load ROM into memory buffer
   - CPU resets: reads SP from 0x000000-0x000003, PC from 0x000004-0x000007
   - Execution starts at ROM code
   - ROM initializes system structures (ExecBase, libraries, etc.)

4. **Our trap mechanism is broken** - Returning virtual RTS doesn't execute library logic

---

## Phase 1: Remove Trap Mechanism

### Current Broken Code (moira-wrapper.cpp:23-46)

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
        return 0x4E75;  // ❌ BROKEN: RTS executes before library function logic runs
    }

    // Normal memory read
    if (addr + 1 < memory.size()) {
        return (memory[addr] << 8) | memory[addr + 1];
    }

    return 0;
}
```

### New vAmiga-Style Code

```cpp
u16 read16(u32 addr) const override {
    // Just read from memory - no traps, no interception
    if (addr + 1 < memory.size()) {
        return (memory[addr] << 8) | memory[addr + 1];  // Big-endian
    }

    // Out of bounds
    return 0;
}

u8 read8(u32 addr) const override {
    if (addr < memory.size()) {
        return memory[addr];
    }
    return 0;
}

void write16(u32 addr, u16 value) override {
    if (addr + 1 < memory.size()) {
        memory[addr] = (value >> 8) & 0xFF;      // High byte
        memory[addr + 1] = value & 0xFF;          // Low byte
    }
}

void write8(u32 addr, u8 value) override {
    if (addr < memory.size()) {
        memory[addr] = value;
    }
}
```

**Result:** ROM code can execute naturally, library functions run as real 68k code.

---

## Phase 2: Proper Memory Mapping

### vAmiga's Memory Layout (Memory.h:23-102)

```
0x000000 - 0x0003FF : Exception vectors (read from ROM at boot)
0x000400 - 0x07FFFF : Chip RAM (512KB - 2MB)
0x080000 - 0x9FFFFF : Extended memory
0xA00000 - 0xBFFFFF : CIA chips (memory-mapped I/O)
0xC00000 - 0xDFFFFF : Slow RAM / Custom chips
0xE00000 - 0xE7FFFF : Reserved
0xE80000 - 0xE8FFFF : Autoconfig (Zorro)
0xF00000 - 0xF7FFFF : Reserved / Diagnostic cartridge
0xF80000 - 0xFFFFFF : Kickstart ROM (512KB)
```

### Implementation Strategy

**Option A: Single 16MB Memory Buffer (Simple)**
```cpp
class MoiraAmigaMemory {
private:
    std::vector<u8> memory;  // 16MB buffer (0x000000 - 0xFFFFFF)

public:
    MoiraAmigaMemory() {
        memory.resize(16 * 1024 * 1024);  // 16MB
        memset(memory.data(), 0, memory.size());
    }

    void loadROM(const std::vector<u8>& romData) {
        // Copy ROM to 0xF80000 - 0xFFFFFF
        const u32 ROM_BASE = 0xF80000;
        memcpy(memory.data() + ROM_BASE, romData.data(), romData.size());

        // ROM vectors also appear at 0x000000 during boot
        // Copy exception vectors (first 1KB) to start of memory
        memcpy(memory.data(), romData.data(), 1024);
    }

    u16 read16(u32 addr) const {
        if (addr + 1 < memory.size()) {
            return (memory[addr] << 8) | memory[addr + 1];
        }
        return 0;
    }
};
```

**Pros:**
- Simplest approach
- Fast memory access (no bounds checks needed)
- ROM just sits in memory naturally

**Cons:**
- Wastes memory (most of 16MB unused)
- No memory-mapped I/O differentiation

**Option B: Separate Memory Regions (vAmiga Style)**
```cpp
class MoiraAmigaMemory {
private:
    u8 *chip;        // Chip RAM (512KB - 2MB)
    u8 *rom;         // Kickstart ROM (512KB)
    u8 *slow;        // Slow RAM (optional)
    u8 *fast;        // Fast RAM (optional)

    u32 chipMask;    // Address mask for mirroring
    u32 romMask;

public:
    void loadROM(const std::vector<u8>& romData) {
        rom = new u8[romData.size()];
        romMask = romData.size() - 1;
        memcpy(rom, romData.data(), romData.size());
    }

    u16 read16(u32 addr) const {
        // Chip RAM (0x000000 - 0x1FFFFF)
        if (addr < 0x200000) {
            return READ_CHIP_16(addr);  // Macro: R16BE(chip + (addr & chipMask))
        }

        // ROM (0xF80000 - 0xFFFFFF)
        if (addr >= 0xF80000) {
            return READ_ROM_16(addr);   // Macro: R16BE(rom + (addr & romMask))
        }

        // CIA chips (0xA00000 - 0xBFFFFF)
        if (addr >= 0xA00000 && addr < 0xC00000) {
            return readCIA(addr);       // Memory-mapped I/O
        }

        // Custom chips (0xC00000 - 0xDFFFFF)
        if (addr >= 0xC00000 && addr < 0xE00000) {
            return readCustom(addr);    // Memory-mapped I/O
        }

        return 0;  // Unmapped memory
    }
};
```

**Pros:**
- Efficient memory usage
- Can handle memory-mapped I/O properly
- Matches vAmiga architecture

**Cons:**
- More complex
- Need to handle address mirroring

**Recommendation:** Start with Option A (single buffer), migrate to Option B if needed.

---

## Phase 3: CPU Boot Sequence

### vAmiga's Reset Sequence (Moira.cpp:201-236)

```cpp
template <Core C> void
Moira::reset()
{
    // 1. Clear CPU state
    flags = State::CHECK_IRQ;
    reg = { };
    reg.sr.s = 1;      // Supervisor mode
    reg.sr.ipl = 7;    // Interrupt priority level 7 (all masked)

    // 2. Read initial stack pointer from 0x000000-0x000003
    reg.sp = read16OnReset(0);              // High word at 0x000000
    reg.isp = reg.sp = (read16OnReset(2) & ~0x1) | reg.sp << 16;  // Low word at 0x000002

    // 3. Read initial program counter from 0x000004-0x000007
    reg.pc = read16OnReset(4);              // High word at 0x000004
    reg.pc = (read16OnReset(6) & ~0x1) | reg.pc << 16;  // Low word at 0x000006

    // 4. Fill prefetch queue
    queue.irc = read16OnReset(reg.pc);
    prefetch<C>();

    // 5. Start executing from ROM
}
```

### Our Implementation (MoiraEmulator.ts)

```typescript
export class MoiraEmulator {
  reset(): void {
    // 1. Clear CPU state
    this.setRegister(16, 0);  // PC = 0
    for (let i = 0; i < 16; i++) {
      this.setRegister(i, 0);
    }

    // 2. Read initial stack pointer from 0x000000-0x000003
    // NOTE: ROM vectors are at start of memory during boot
    const spHigh = this.readMemory16(0x000000);
    const spLow = this.readMemory16(0x000002) & ~0x1;  // Clear low bit
    const sp = (spHigh << 16) | spLow;
    this.setRegister(15, sp);  // A7 (SP)

    // 3. Read initial program counter from 0x000004-0x000007
    const pcHigh = this.readMemory16(0x000004);
    const pcLow = this.readMemory16(0x000006) & ~0x1;  // Clear low bit
    const pc = (pcHigh << 16) | pcLow;
    this.setRegister(16, pc);  // PC

    // 4. Set supervisor mode (SR register)
    this.setSupervisorMode(true);
    this.setInterruptMask(7);  // Mask all interrupts

    console.log(`[Moira] CPU Reset:`);
    console.log(`  SP: 0x${sp.toString(16).padStart(8, '0')}`);
    console.log(`  PC: 0x${pc.toString(16).padStart(8, '0')}`);
  }

  readMemory16(addr: number): number {
    const high = this.readMemory(addr);
    const low = this.readMemory(addr + 1);
    return (high << 8) | low;
  }
}
```

---

## Phase 4: Memory-Mapped I/O Stubs

### What ROM Code Expects

The Kickstart ROM will try to access hardware registers during initialization:

1. **CIA Chips (0xA00000 - 0xBFFFFF)**
   - Timer registers
   - Parallel/serial ports
   - Keyboard

2. **Custom Chips (0xC00000 - 0xDFFFFF)**
   - Denise (video)
   - Agnus (DMA)
   - Paula (audio, floppy, ports)

### Minimal Stub Strategy

For door execution, we don't need full hardware emulation - just enough to satisfy ROM initialization:

```cpp
u16 readCIA(u32 addr) const {
    // CIA-A: 0xBFE001, 0xBFE101, etc. (odd addresses)
    // CIA-B: 0xBFD000, 0xBFD100, etc. (even addresses)

    // Return safe defaults
    switch (addr & 0xF00) {
        case 0x000:  // Port A/B data
        case 0x100:
            return 0xFF;  // All bits high (no keys pressed, etc.)

        case 0x800:  // Interrupt control
        case 0x900:
            return 0x00;  // No interrupts pending

        default:
            return 0x00;
    }
}

u16 readCustom(u32 addr) const {
    // Custom chip registers (0xDFF000 - 0xDFFFFF)

    switch (addr & 0xFFFF) {
        case 0x000:  // BLTDDAT (Blitter dest data)
        case 0x002:  // DMACONR (DMA control read)
            return 0x0000;

        case 0x004:  // VPOSR (Vertical position)
            return 0x0000;  // Line 0

        case 0x006:  // VHPOSR (Horizontal position)
            return 0x0000;  // Column 0

        case 0x016:  // POTGOR (Pot and joystick)
            return 0xFFFF;  // Nothing connected

        case 0x018:  // SERDATR (Serial data)
            return 0x0000;  // No data

        case 0x01C:  // INTENAR (Interrupt enable read)
            return 0x0000;  // All disabled

        case 0x01E:  // INTREQR (Interrupt request read)
            return 0x0000;  // No requests

        default:
            return 0x0000;
    }
}

void writeCustom(u32 addr, u16 value) {
    // Most writes can be ignored for door execution
    // ROM is just initializing hardware we don't have

    // Could log for debugging:
    // console.log(`[Custom] Write 0x${value.toString(16)} to 0x${addr.toString(16)}`);
}
```

**Strategy:** Return safe defaults that make ROM think hardware is idle/not present. ROM will continue initializing software structures (ExecBase, libraries) which is what we need.

---

## Phase 5: Execution Control

### Problem: ROM Will Run Forever

If we just boot ROM, it will:
1. Initialize system structures ✓ (what we want)
2. Try to start Workbench ✗ (don't want)
3. Wait for user input ✗ (don't want)

### Solution: Hook into ROM Initialization

**Strategy A: Execute Until ExecBase Created**

```typescript
class AmigaDoorSession {
  async bootROM(): Promise<void> {
    // 1. Reset CPU
    this.emulator.reset();

    // 2. Execute ROM code until ExecBase initialized
    let maxCycles = 10000000;  // 10 million cycles (safety limit)
    let cycles = 0;

    while (cycles < maxCycles) {
      // Execute one instruction
      this.emulator.executeInstruction();
      cycles++;

      // Check if ExecBase pointer is set
      const execBasePtr = this.readLong(0x000004);
      if (execBasePtr !== 0 && execBasePtr >= 0x010000) {
        // ExecBase is initialized!
        console.log(`[Boot] ExecBase initialized at 0x${execBasePtr.toString(16)}`);

        // Verify it's valid
        const version = this.readWord(execBasePtr + 0x14);
        const revision = this.readWord(execBasePtr + 0x16);
        console.log(`[Boot] Kickstart version ${version}.${revision}`);

        break;
      }

      // Check every 1000 cycles to avoid slowdown
      if (cycles % 1000 !== 0) continue;
    }

    if (cycles >= maxCycles) {
      throw new Error('ROM boot timeout - ExecBase not initialized');
    }

    // 3. ROM has initialized system, now load door
    this.loadDoorBinary();
  }
}
```

**Strategy B: Patch ROM to Jump to Door**

```typescript
class AmigaDoorSession {
  async bootROM(): Promise<void> {
    // 1. Let ROM initialize system structures
    this.emulator.reset();

    // 2. Execute until specific ROM address (known point after init)
    // From Kickstart 3.1 analysis, initialization completes around 0xFC0400
    const POST_INIT_ADDRESS = 0xFC0400;

    while (this.emulator.getPC() !== POST_INIT_ADDRESS) {
      this.emulator.executeInstruction();

      // Safety check
      if (this.emulator.getCycles() > 50000000) {
        throw new Error('ROM boot timeout');
      }
    }

    // 3. Patch ROM to jump to door
    const doorEntryPoint = this.loadDoorBinary();

    // Write JSR instruction to jump to door
    // JSR $<doorEntryPoint>: 4EB9 xxxx xxxx
    this.emulator.writeMemory16(POST_INIT_ADDRESS, 0x4EB9);  // JSR
    this.emulator.writeMemory32(POST_INIT_ADDRESS + 2, doorEntryPoint);

    // 4. Continue execution - ROM will jump to door
  }
}
```

**Recommendation:** Start with Strategy A (detect ExecBase), as it's less fragile.

---

## Phase 6: Door I/O Interception

### Problem: Door Calls AEDoor.library Functions

Once door is running, it will call BBS functions like:
- `aePutCh()` - Output character to BBS terminal
- `aeGetCh()` - Read character from BBS terminal
- `aePuts()` - Output string
- `aeGetAnswer()` - Read input with prompt

### Solution: Patch AEDoor.library Function Table

```typescript
class AmigaDoorSession {
  setupAEDoorLibrary(): void {
    // 1. Find AEDoor.library in system library list
    // (ROM has already opened it, or we create stub)

    const AEDOOR_BASE = 0xFF4000;  // Our chosen base address

    // 2. Create library structure
    this.writeLong(AEDOOR_BASE + 0x00, 0);  // ln_Succ
    this.writeLong(AEDOOR_BASE + 0x04, 0);  // ln_Pred
    this.writeByte(AEDOOR_BASE + 0x08, 9);  // ln_Type = NT_LIBRARY
    this.writeByte(AEDOOR_BASE + 0x09, 0);  // ln_Pri
    this.writeLong(AEDOOR_BASE + 0x0A, this.createString("AEDoor.library"));

    // 3. Create function jump table
    // Each entry is: TRAP #0 instruction followed by function ID
    const functionOffsets = [
      -54,   // aePutCh
      -60,   // aeGetCh
      -66,   // aePuts
      -72,   // aeGetAnswer
      // ... etc
    ];

    functionOffsets.forEach((offset, index) => {
      const addr = AEDOOR_BASE + offset;

      // Write TRAP #0 instruction: 0x4E40
      this.emulator.writeMemory16(addr, 0x4E40);

      // Write function ID in next word
      this.emulator.writeMemory16(addr + 2, index);

      // Write RTS instruction: 0x4E75
      this.emulator.writeMemory16(addr + 4, 0x4E75);
    });

    // 4. Register TRAP #0 handler in Moira
    this.emulator.setTrapHandler(0, (functionId: number) => {
      this.handleAEDoorCall(functionId);
    });
  }

  handleAEDoorCall(functionId: number): void {
    const d0 = this.emulator.getRegister(0);
    const d1 = this.emulator.getRegister(1);
    const a0 = this.emulator.getRegister(8);

    switch (functionId) {
      case 0:  // aePutCh (offset -54)
        const ch = String.fromCharCode(d0 & 0xFF);
        this.socket.emit('ansi-output', ch);
        this.emulator.setRegister(0, 0);  // Success
        break;

      case 1:  // aeGetCh (offset -60)
        // Queue input request
        this.waitingForInput = true;
        this.emulator.pause();  // Pause execution until input arrives
        break;

      case 2:  // aePuts (offset -66)
        const strAddr = a0;
        const str = this.readString(strAddr);
        this.socket.emit('ansi-output', str);
        this.emulator.setRegister(0, 0);  // Success
        break;

      // ... etc
    }
  }
}
```

**This is how we intercept BBS I/O without breaking library execution!**

---

## Implementation Timeline

### Week 1: Core Architecture
- [ ] Remove trap mechanism from moira-wrapper.cpp
- [ ] Implement simple 16MB memory buffer
- [ ] Test basic memory read/write
- [ ] Implement proper CPU reset sequence

### Week 2: ROM Boot
- [ ] Load ROM into memory (0xF80000-0xFFFFFF)
- [ ] Copy exception vectors to 0x000000
- [ ] Execute ROM code until ExecBase initialized
- [ ] Verify system structures are created

### Week 3: Hardware Stubs
- [ ] Implement CIA register stubs
- [ ] Implement Custom chip register stubs
- [ ] Test ROM completes initialization without crashing
- [ ] Measure cycles needed for boot

### Week 4: Door Integration
- [ ] Load door binary after ROM boot
- [ ] Set up AEDoor.library with TRAP handlers
- [ ] Test aePutCh() output
- [ ] Test aeGetCh() input

### Week 5: Full Door Execution
- [ ] Test GetAnswer door (8KB XIM)
- [ ] Test Bulls door
- [ ] Implement remaining AEDoor functions
- [ ] Performance optimization

---

## Success Criteria

### Milestone 1: ROM Boots
- ✓ ROM code executes without crashes
- ✓ ExecBase pointer is set at 0x000004
- ✓ ExecBase structure is valid (correct version/revision)
- ✓ Library lists are initialized

### Milestone 2: Door Loads
- ✓ Door binary loads into memory
- ✓ Door entry point jumps to correct address
- ✓ First door instruction executes

### Milestone 3: Door Outputs
- ✓ aePutCh() calls reach our handler
- ✓ Text appears in BBS terminal
- ✓ ANSI codes are processed correctly

### Milestone 4: Door Interacts
- ✓ aeGetCh() waits for user input
- ✓ User input reaches door
- ✓ Door responds to input
- ✓ Full door session works end-to-end

---

## Risk Assessment

### Low Risk
- **Removing trap mechanism** - Straightforward, vAmiga blueprint is clear
- **Memory mapping** - Simple buffer approach works for doors
- **CPU reset** - Well-documented in vAmiga sources

### Medium Risk
- **Hardware register stubs** - Need to return correct values for ROM to continue
- **ExecBase detection** - Need to identify when initialization is complete
- **Door loading** - Need to find correct memory location

### High Risk
- **ROM boot timeout** - ROM might enter infinite loop waiting for hardware
- **Library initialization** - ROM might not create AEDoor.library (we may need to create it)
- **Memory conflicts** - Door code might conflict with ROM memory usage

### Mitigation Strategies
- **Start simple** - Get basic ROM execution working first
- **Add debugging** - Log every memory access during boot to understand ROM behavior
- **Safety timeouts** - Abort if ROM runs too long without progress
- **Incremental testing** - Test each phase independently before integrating

---

## Alternative Approaches (If ROM Boot Fails)

### Option 1: Minimal ROM Boot
- Don't run full ROM initialization
- Create ExecBase structure manually (like we did before)
- Just execute library functions from ROM
- Patch door to call ROM functions directly

### Option 2: Hybrid Approach
- Boot ROM to initialize system
- But implement AEDoor functions in JavaScript (not ROM)
- Use TRAP mechanism ONLY for AEDoor (not for dos/exec)

### Option 3: Pure JavaScript Implementation
- Give up on ROM execution entirely
- Implement all library functions in JavaScript
- But THIS time, do it properly:
  - Execute JavaScript handlers BEFORE returning from function
  - Use async/await to pause CPU during I/O
  - Return real results to door

---

## Conclusion

We have a complete blueprint from vAmiga. The path forward is clear:

1. **Remove broken trap mechanism** ✓ Simple
2. **Implement proper memory mapping** ✓ Well-documented
3. **Boot ROM code naturally** ✓ vAmiga shows exactly how
4. **Intercept I/O with TRAP handlers** ✓ Standard technique

**This WILL work** - we're following proven architecture used by a production Amiga emulator.

The only question is: How far do we need to go? Can we stop after ExecBase initialization, or do we need to let ROM run further?

**Let's find out!** 🚀
