# CRITICAL DEVELOPMENT RULES

## 🚨 ALWAYS Reference vAmiga Sources 🚨

**BEFORE implementing ANY Amiga emulation or door functionality:**

1. **Find the equivalent code in vAmiga sources**
   - Location: `~/Code/amiexpress-web/Docs/vAmiga/`
   - vAmiga is a complete, working Amiga emulator
   - It has ALL the answers for correct implementation

2. **Read how vAmiga does it**
   - Don't guess
   - Don't make assumptions
   - Don't try random fixes
   - READ THE SOURCE FIRST

3. **Implement exactly as vAmiga shows**
   - Follow their architecture
   - Use their register handling
   - Match their timing
   - Copy their approach

## Why This Matters

vAmiga successfully:
- Boots Kickstart ROM
- Runs Amiga software
- Emulates all hardware correctly
- Has been tested and debugged extensively

Every minute spent guessing is wasted. Every answer is in vAmiga.

## Key vAmiga Files

### Hardware Emulation
- `Core/Components/Agnus/` - Custom chip controller, DMA, beam position
- `Core/Components/Paula/` - Audio, disk, serial, interrupts
- `Core/Components/Denise/` - Display, sprites, graphics
- `Core/Components/CIA/` - Timers, ports, keyboard

### CPU Emulation
- `Core/Components/CPU/CPU.cpp` - CPU execution loop
- `Core/Components/CPU/Moira/` - 68000 emulator

### Memory & I/O
- `Core/Components/Memory/Memory.cpp` - Memory mapping, I/O
- `Core/Components/Memory/MemoryRegs.cpp` - Register reads/writes

### System
- `Core/Components/Amiga.cpp` - Main emulation loop
- `Core/Infrastructure/Thread.cpp` - Execution threading

## Recent Example (2025-10-30)

**Problem:** ROM getting stuck during boot
**Wrong approach:** Guessing at hardware register values, trying random fixes
**Right approach:** Check vAmiga sources

**Discovery from vAmiga:**
```cpp
// From CPU.cpp - CPU and hardware run TOGETHER
cpu.execute();              // Execute one instruction
agnus.execute(cycles);      // Advance hardware by same cycles
```

**Lesson:** Hardware must advance continuously alongside CPU, not just when registers are read.

## How to Search vAmiga Sources

```bash
# Find files related to a topic
find Docs/vAmiga -name "*.cpp" -o -name "*.h" | xargs grep -l "topic"

# Read a specific implementation
grep -A50 "functionName" Docs/vAmiga/path/to/file.cpp

# Check register handling
grep -n "VPOSR\|VHPOSR" Docs/vAmiga/Core/Components/Agnus/AgnusRegs.cpp
```

## User Reminder

User has emphasized multiple times: **"reference the vAmiga sources, they should have all answers"**

This is not a suggestion - it's a requirement. Always check vAmiga first.
