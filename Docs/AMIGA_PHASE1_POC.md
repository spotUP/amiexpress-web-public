# Amiga Door Execution - Phase 1: Proof of Concept

**Status:** IN PROGRESS
**Started:** October 16, 2025
**Goal:** Execute simple "Hello World" 68000 program using Moira + minimal AmigaDOS API

---

## Progress Summary

### ✅ Completed

1. **Project Structure Created**
   - `/backend/src/amiga-emulation/cpu` - CPU emulator
   - `/backend/src/amiga-emulation/api` - AmigaDOS API implementation
   - `/backend/src/amiga-emulation/filesystem` - File system bridge
   - `/backend/src/amiga-emulation/loader` - Hunk file loader
   - `/backend/src/amiga-emulation/test` - Test programs

2. **Moira Source Analyzed**
   - Cloned Moira repository (958 files)
   - Located at: `/backend/src/amiga-emulation/cpu/moira-source`
   - Analyzed build system (CMake-based)
   - Reviewed API (Moira.h, MoiraTypes.h)
   - Studied example usage (Sandbox.cpp, Testrunner.cpp)

---

## Moira Architecture Analysis

### Key Files

**Core:**
- `Moira/Moira.h` - Main CPU class
- `Moira/Moira.cpp` - Implementation
- `Moira/MoiraTypes.h` - Type definitions
- `Moira/MoiraConfig.h` - Configuration options

**Execution:**
- `Moira/MoiraExec_cpp.h` - Instruction execution
- `Moira/MoiraALU_cpp.h` - Arithmetic/logic operations
- `Moira/MoiraDataflow_cpp.h` - Data movement

**Other:**
- `Moira/MoiraDasm_cpp.h` - Disassembler
- `Moira/MoiraDebugger.cpp` - Debug support
- `Moira/MoiraExceptions_cpp.h` - Exception handling

### Moira API Overview

```cpp
namespace moira {
    class Moira {
        // Configuration
        Model cpuModel = Model::M68000;  // 68000, 68010, 68020, 68EC020

        // State
        i64 clock {};                     // Cycle counter
        Registers reg {};                 // CPU registers

        // Core Methods (to be determined from further analysis)
        // - execute(cycles)
        // - reset()
        // - read/write memory callbacks
        // - interrupt handling
    };
}
```

### Build System

- **CMake-based** build system
- Requires **C++20** compiler
- Links as library (`libmoira`)
- Example runner shows usage pattern

---

## Next Steps

### 1. Install Emscripten (REQUIRED)

Emscripten compiles C++ to WebAssembly.

**Installation:**
```bash
# macOS
brew install emscripten

# Or from source
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

**Verify:**
```bash
emcc --version  # Should show Emscripten version
```

### 2. Create Moira WASM Wrapper

**Goal:** Minimal C++ wrapper for WebAssembly compilation

**File:** `/backend/src/amiga-emulation/cpu/moira-wrapper.cpp`

```cpp
#include "moira-source/Moira/Moira.h"
#include <emscripten/bind.h>
#include <cstdint>
#include <vector>

using namespace emscripten;
using namespace moira;

// Custom CPU implementation with memory callbacks
class MoiraCPU : public Moira {
private:
    std::vector<uint8_t> memory;
    std::function<void(uint32_t, uint16_t)> trapHandler;

public:
    MoiraCPU(size_t memSize) : memory(memSize, 0) {
        cpuModel = Model::M68000;
    }

    // Set memory
    void setMemoryByte(uint32_t addr, uint8_t value) {
        if (addr < memory.size()) {
            memory[addr] = value;
        }
    }

    uint8_t getMemoryByte(uint32_t addr) {
        return (addr < memory.size()) ? memory[addr] : 0;
    }

    // Load program
    void loadProgram(const std::vector<uint8_t>& program, uint32_t address) {
        for (size_t i = 0; i < program.size() && (address + i) < memory.size(); i++) {
            memory[address + i] = program[i];
        }
    }

    // Set trap handler
    void setTrapHandler(val handler) {
        // Store JS callback
    }

    // Reset CPU
    void resetCPU() {
        reset();
    }

    // Execute cycles
    int executeCycles(int cycles) {
        return execute(cycles);
    }

    // Get registers
    uint32_t getRegister(int reg) {
        if (reg < 8) return this->reg.d[reg];
        if (reg < 16) return this->reg.a[reg - 8];
        if (reg == 16) return this->reg.pc;
        if (reg == 17) return this->reg.sr.reg;
        return 0;
    }

    // Set registers
    void setRegister(int reg, uint32_t value) {
        if (reg < 8) this->reg.d[reg] = value;
        else if (reg < 16) this->reg.a[reg - 8] = value;
        else if (reg == 16) this->reg.pc = value;
        else if (reg == 17) this->reg.sr.reg = value;
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(moira_module) {
    class_<MoiraCPU>("MoiraCPU")
        .constructor<size_t>()
        .function("setMemoryByte", &MoiraCPU::setMemoryByte)
        .function("getMemoryByte", &MoiraCPU::getMemoryByte)
        .function("loadProgram", &MoiraCPU::loadProgram)
        .function("resetCPU", &MoiraCPU::resetCPU)
        .function("executeCycles", &MoiraCPU::executeCycles)
        .function("getRegister", &MoiraCPU::getRegister)
        .function("setRegister", &MoiraCPU::setRegister)
        ;

    register_vector<uint8_t>("VectorUint8");
}
```

### 3. Create Emscripten Build Script

**File:** `/backend/src/amiga-emulation/cpu/build-wasm.sh`

```bash
#!/bin/bash

# Ensure Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten not found. Please install emscripten."
    exit 1
fi

# Source directory
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOIRA_DIR="$SRC_DIR/moira-source/Moira"

# Output directory
OUT_DIR="$SRC_DIR/build"
mkdir -p "$OUT_DIR"

echo "Building Moira WASM..."
echo "Source: $MOIRA_DIR"
echo "Output: $OUT_DIR"

# Compile to WebAssembly
emcc \
    -std=c++20 \
    -O3 \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='createMoiraModule' \
    -s EXPORTED_FUNCTIONS='["_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    --bind \
    -I"$MOIRA_DIR" \
    "$SRC_DIR/moira-wrapper.cpp" \
    "$MOIRA_DIR/Moira.cpp" \
    "$MOIRA_DIR/MoiraDebugger.cpp" \
    -o "$OUT_DIR/moira.js"

if [ $? -eq 0 ]; then
    echo "✓ Build successful!"
    echo "Output files:"
    echo "  - $OUT_DIR/moira.js"
    echo "  - $OUT_DIR/moira.wasm"
else
    echo "✗ Build failed!"
    exit 1
fi
```

### 4. Create TypeScript Interface

**File:** `/backend/src/amiga-emulation/cpu/MoiraEmulator.ts`

```typescript
// TypeScript interface for Moira WebAssembly module

export interface MoiraModule {
  MoiraCPU: new (memSize: number) => MoiraCPU;
}

export interface MoiraCPU {
  setMemoryByte(addr: number, value: number): void;
  getMemoryByte(addr: number): number;
  loadProgram(program: Uint8Array, address: number): void;
  resetCPU(): void;
  executeCycles(cycles: number): number;
  getRegister(reg: number): number;
  setRegister(reg: number, value: number): void;
  delete(): void;
}

// CPU Register indices
export enum CPURegister {
  D0 = 0, D1 = 1, D2 = 2, D3 = 3,
  D4 = 4, D5 = 5, D6 = 6, D7 = 7,
  A0 = 8, A1 = 9, A2 = 10, A3 = 11,
  A4 = 12, A5 = 13, A6 = 14, A7 = 15,
  PC = 16,  // Program Counter
  SR = 17   // Status Register
}

export class MoiraEmulator {
  private module: MoiraModule | null = null;
  private cpu: MoiraCPU | null = null;

  constructor(private memorySize: number = 1024 * 1024) {} // Default 1MB

  async initialize(): Promise<void> {
    // Load the WASM module
    const createMoiraModule = require('./build/moira.js');
    this.module = await createMoiraModule();
    this.cpu = new this.module.MoiraCPU(this.memorySize);
    this.cpu.resetCPU();
  }

  loadProgram(binary: Uint8Array, address: number = 0x1000): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.loadProgram(binary, address);
  }

  execute(cycles: number = 1000): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.executeCycles(cycles);
  }

  reset(): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.resetCPU();
  }

  getRegister(reg: CPURegister): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.getRegister(reg);
  }

  setRegister(reg: CPURegister, value: number): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.setRegister(reg, value);
  }

  readMemory(address: number): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.getMemoryByte(address);
  }

  writeMemory(address: number, value: number): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.setMemoryByte(address, value);
  }

  cleanup(): void {
    if (this.cpu) {
      this.cpu.delete();
      this.cpu = null;
    }
  }
}
```

### 5. Create Test Program

**File:** `/backend/src/amiga-emulation/test/test-moira-basic.ts`

```typescript
import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

async function testMoiraBasic() {
  console.log('Testing Moira WebAssembly emulator...');

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  console.log('✓ Emulator initialized');

  // Simple test program: MOVE.W #$1234,D0; RTS
  // This moves 0x1234 into D0 register and returns
  const testProgram = new Uint8Array([
    0x30, 0x3C,       // MOVE.W #$1234,D0
    0x12, 0x34,       // Immediate value 0x1234
    0x4E, 0x75        // RTS (return)
  ]);

  // Load program at 0x1000
  emulator.loadProgram(testProgram, 0x1000);
  console.log('✓ Test program loaded at 0x1000');

  // Set PC to program start
  emulator.setRegister(CPURegister.PC, 0x1000);

  // Set stack pointer (A7)
  emulator.setRegister(CPURegister.A7, 0x2000);

  console.log('✓ Registers initialized');

  // Execute
  const cyclesExecuted = emulator.execute(100);
  console.log(`✓ Executed ${cyclesExecuted} cycles`);

  // Check D0 register
  const d0Value = emulator.getRegister(CPURegister.D0);
  console.log(`D0 = 0x${d0Value.toString(16)}`);

  if (d0Value === 0x1234) {
    console.log('✅ TEST PASSED: D0 contains expected value 0x1234');
  } else {
    console.log(`❌ TEST FAILED: Expected 0x1234, got 0x${d0Value.toString(16)}`);
  }

  // Cleanup
  emulator.cleanup();
  console.log('✓ Cleanup complete');
}

// Run test
testMoiraBasic().catch(console.error);
```

---

## Phase 1 Milestones

### Milestone 1: WASM Compilation ⏳
- [ ] Install Emscripten
- [ ] Create moira-wrapper.cpp
- [ ] Create build-wasm.sh
- [ ] Compile successfully
- [ ] Generate moira.js and moira.wasm

**Success Criteria:**
- Build completes without errors
- WASM files generated
- File sizes reasonable (< 1MB)

### Milestone 2: TypeScript Integration ⏳
- [ ] Create MoiraEmulator.ts
- [ ] Load WASM module in Node.js
- [ ] Access CPU functions
- [ ] Read/write memory
- [ ] Get/set registers

**Success Criteria:**
- Module loads successfully
- Can create MoiraCPU instance
- All API functions accessible

### Milestone 3: Basic Execution ⏳
- [ ] Load test program into memory
- [ ] Set PC and SP registers
- [ ] Execute instruction
- [ ] Verify register changes
- [ ] Read memory after execution

**Success Criteria:**
- Test program executes
- D0 register contains 0x1234
- No crashes or errors

### Milestone 4: Library Traps (Next)
- [ ] Detect JSR to negative offset
- [ ] Trap handler callback
- [ ] Extract function parameters
- [ ] Return values to CPU

---

## Technical Notes

### Memory Layout (Initial)

```
0x0000 - 0x0003: Supervisor stack pointer (SSP)
0x0004 - 0x0007: Initial PC
0x0008 - 0x03FF: Exception vectors
0x0400 - 0x0FFF: System area
0x1000 - 0xEFFF: Program area
0xF000 - 0xFFFF: Stack area
```

### 68000 Instruction Format

**Example: MOVE.W #$1234,D0**
```
Opcode: 0x303C (MOVE.W immediate to D0)
Data:   0x1234 (immediate value)
```

**Assembly to Machine Code:**
```asm
MOVE.W #$1234,D0  →  30 3C 12 34
RTS               →  4E 75
```

### Emscripten Compilation Flags

- `-std=c++20` - Use C++20 standard
- `-O3` - Optimize for speed
- `-s WASM=1` - Generate WebAssembly
- `-s ALLOW_MEMORY_GROWTH=1` - Dynamic memory
- `-s MODULARIZE=1` - Export as module
- `--bind` - Enable Embind for C++/JS interop

---

## Troubleshooting

### Issue: Emscripten not found
**Solution:** Install via Homebrew or emsdk

### Issue: C++20 features not supported
**Solution:** Update Emscripten to latest version

### Issue: WASM file too large
**Solution:** Use `-O3` optimization, strip debug info

### Issue: Module not loading in Node.js
**Solution:** Check Node version (need 16+), enable WASM support

---

## Resources

- **Moira Documentation:** https://dirkwhoffmann.github.io/Moira/
- **Emscripten Docs:** https://emscripten.org/docs/
- **68000 Programmer's Manual:** https://www.nxp.com/docs/en/reference-manual/M68000PRM.pdf
- **Embind Tutorial:** https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html

---

## Next Phase Preview

**Phase 2: Core AmigaDOS Functions**
- Implement exec.library basics (memory, libraries)
- Implement dos.library basics (file I/O)
- Create Hunk file loader
- Add I/O redirection
- Run real Amiga door binary

---

**Status:** Phase 1 setup complete, awaiting Emscripten installation and first WASM build

**Last Updated:** October 16, 2025
