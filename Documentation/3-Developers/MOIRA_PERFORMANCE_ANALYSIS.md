# MOIRA 68K Emulator Performance Analysis

**Date**: December 26, 2024
**Purpose**: Analyze performance options for improving 68K door execution speed

## Executive Summary

MOIRA is a **cycle-exact interpreter** with no JIT compilation. Performance improvements are LIMITED to:
1. Switching from M68000 to M68020 (non-cycle-exact mode)
2. Increasing fast RAM allocation
3. Code-level optimizations in execution loop

**Critical Finding**: MultiTop door timing out after 5 minutes is NOT fixable via emulator configuration alone. The solution is to port MultiTop to TypeScript.

---

## Available Performance Options

### 1. CPU Model Selection

**Current**: M68000 (cycle-exact, slowest)

**Available Models** (from `MoiraTypes.h:48-59`):
- `M68000` - Cycle-exact emulation (CURRENT)
- `M68010` - Cycle-exact emulation (minimal improvement)
- `M68EC020` - Non-cycle-exact emulation (**FASTEST AVAILABLE**)
- `M68020` - Non-cycle-exact emulation (**FASTEST AVAILABLE**)
- `M68030/040` - Disassembler only (NOT executable)

**Speed Comparison**:
- M68000: 1.0x (baseline, cycle-accurate)
- M68010: ~1.05x (loop mode, minimal gain)
- M68020: ~1.5-2.0x (non-cycle-exact, estimated)

**Compatibility Risk**:
- Most Amiga doors target M68000
- M68020 has different instruction timings
- May break doors that rely on cycle-exact timing

**Recommendation**: Test with M68EC020 to see if doors still work correctly.

**Implementation** (in `moira-wrapper.cpp:386`):
```cpp
// CURRENT:
cpuModel = Model::M68000;

// PROPOSED:
cpuModel = Model::M68EC020;  // Non-cycle-exact, faster
```

**Rebuild Required**: Yes, need to recompile WASM module.

---

### 2. Memory Configuration

**Current** (from `MoiraEmulator.ts:179`):
- Total: 16MB (default)
- Chip RAM: 2MB (fixed)
- Fast RAM: 14MB (configurable)

**Maximum Possible**:
- Total: ~240MB
- Chip RAM: 2MB (fixed)
- Fast RAM: ~238MB (stops at 0xF80000)

**Impact**: NEGLIGIBLE for door performance
- Doors allocate minimal memory (< 1MB typically)
- More RAM doesn't make CPU faster
- Only helps if doors are hitting memory limits (none do)

**Recommendation**: Keep at 16MB. Increasing won't help.

---

### 3. JIT Compilation

**Status**: NOT AVAILABLE

MOIRA is a pure interpreter. There is NO JIT compiler.

**Why No JIT**:
- MOIRA focuses on cycle-exact accuracy
- JIT would break cycle timing
- WebAssembly compilation is already optimized

**Alternatives**:
- Port doors to TypeScript (native Node.js execution)
- Use vamos on server (native Linux ARM/x86 execution)

---

### 4. Overclocking / Speed Multiplier

**Status**: NOT AVAILABLE

MOIRA has no "speed multiplier" or "overclock" option.

**Why Not**:
- Cycle-exact emulation means real 68000 timing
- Breaking cycle timing breaks compatibility
- Non-cycle-exact M68020 is the only "fast mode"

---

### 5. Execution Loop Optimizations

**Current Overhead** (from previous debugging):
- XIM polling after EVERY instruction: 31+ million calls for MultiTop
- Function call overhead: ~100-200ns per instruction
- Memory bounds checking: every read/write

**Fixed**: XIM polling bug (SIM doors no longer poll)

**Remaining Overhead**:
- Library trap checks after every instruction
- Memory page table lookup (every memory access)
- Prefetch queue management

**Potential Optimizations**:
1. Batch instruction execution (10-100 instructions per trap check)
2. Inline memory access functions (reduce call overhead)
3. Cache library vectors (avoid repeated lookups)

**Estimated Gain**: 10-30% improvement

**Risk**: May break some doors that rely on frequent trap handling

---

## Performance Benchmarks

### MultiTop Execution Profile

**Test**: Process 1000 users from user.data (227KB)

**Current Performance** (M68000):
- Timeout: 300 seconds (5 minutes)
- Instructions executed: ~500M+ (estimated)
- Speed: ~1.6M instructions/second
- XIM polls: 31+ million (FIXED)

**Projected Performance** (M68EC020):
- Estimated time: 150-200 seconds (2.5-3.3 minutes)
- Speed: ~2.5M instructions/second (estimated)
- Still TOO SLOW for batch execution

**Projected Performance** (TypeScript port):
- Estimated time: < 1 second
- Speed: Native V8 JIT (1000x faster)

---

## Recommendations

### Immediate Actions

1. **Fix XIM polling bug**: COMPLETED
   - Prevented 31M+ unnecessary function calls
   - Estimated 10-20% speedup for SIM doors

2. **Test M68EC020 upgrade**: OPTIONAL
   - Edit `moira-wrapper.cpp:386`: `cpuModel = Model::M68EC020;`
   - Rebuild WASM: `cd web/backend/src/amiga-emulation/cpu && ./build-wasm.sh`
   - Test MultiTop and other doors
   - If doors break, revert to M68000

3. **Port MultiTop to TypeScript**: RECOMMENDED
   - Read MultiTop E sources with MCP tools
   - Implement 1:1 port using SDK
   - Use native Node.js file I/O (1000x faster)
   - Estimated dev time: 4-8 hours
   - Result: < 1 second execution time

### Long-Term Optimizations

1. **Batch instruction execution** (10-30% gain):
   - Execute 100 instructions per trap check instead of 1
   - Only check library traps at "safe points" (JSR, RTS, branch)
   - Risk: May break some doors

2. **Inline memory access** (5-10% gain):
   - Eliminate function call overhead for read/write
   - Requires C++ code changes in MOIRA wrapper

3. **Cache library vectors** (5% gain):
   - Pre-compute library trap addresses
   - Avoid repeated lookups

---

## CRITICAL FINDINGS FROM MOIRA DOCUMENTATION

### Overclocking Support (config.overclocking)

**MOIRA DOES SUPPORT OVERCLOCKING** - but it's NOT implemented in our codebase yet!

From the official documentation:
- `config.overclocking` parameter controls CPU speed multiplier
- Value 0 = native speed
- Value 1 = native using overclocking logic
- Value 2 = 2x speed (14.19 MHz)
- Value N = Nx speed

**How it works**:
- The `sync()` function converts CPU cycles to DMA cycles
- Overclocking multiplies the CPU cycles before sync
- Allows 2x, 4x, 10x speedup without breaking compatibility

**Our Implementation**: We do NOT have `config.overclocking` implemented!
- No `sync()` function in moira-wrapper.cpp
- No overclocking parameter exposed
- Need to implement this to enable speed boost

**Estimated Gain**: 2x-10x speedup (configurable)

---

### Compile-Time Performance Options (MoiraConfig.h)

**Current Settings** (in `moira-source/Moira/MoiraConfig.h`):
1. `MOIRA_PRECISE_TIMING false` - GOOD (disables cycle-exact timing)
2. `MOIRA_VIRTUAL_API true` - **BAD** (use virtual functions, slower)
3. `MOIRA_EMULATE_ADDRESS_ERROR false` - GOOD (skip address error checks)
4. `MOIRA_EMULATE_FC true` - **BAD** (emulates function code pins, slower)
5. `MOIRA_MIMIC_MUSASHI true` - **BAD** (compatibility mode, slower)

**Recommended Changes**:
```cpp
// File: moira-source/Moira/MoiraConfig.h

#define MOIRA_PRECISE_TIMING false        // KEEP (already optimized)
#define MOIRA_VIRTUAL_API false            // CHANGE (static linking is faster)
#define MOIRA_EMULATE_ADDRESS_ERROR false  // KEEP (already optimized)
#define MOIRA_EMULATE_FC false             // CHANGE (we don't use FC pins)
#define MOIRA_MIMIC_MUSASHI false          // CHANGE (we're not testing vs Musashi)
```

**Estimated Gain**: 10-20% speedup from these changes

---

## Conclusion

**MultiTop Performance Issue**: The 68K emulator is too slow for batch processing 1000+ users, BUT we have untapped performance options!

**Root Cause**:
- Pure interpreter (no JIT)
- Cycle-exact emulation (accurate but slow)
- **Missing overclocking implementation** (biggest issue!)
- Suboptimal compile-time config

**NEW Solution Path**:

1. **Immediate (5-10x speedup potential)**:
   - Implement `config.overclocking` parameter
   - Add `sync()` function to moira-wrapper.cpp
   - Allow configurable speed multiplier (2x, 4x, 10x)
   - This alone could make MultiTop complete in 30-60 seconds

2. **Quick wins (10-20% speedup)**:
   - Set `MOIRA_VIRTUAL_API false` (static linking)
   - Set `MOIRA_EMULATE_FC false` (no FC pin emulation)
   - Set `MOIRA_MIMIC_MUSASHI false` (no compatibility mode)
   - Rebuild WASM module

3. **Test M68EC020** (50% speedup):
   - Non-cycle-exact mode
   - May work with overclocking for 10x total

4. **Long-term (1000x speedup)**:
   - Port to TypeScript if overclocking isn't enough

**User Expectation**: Multitop should complete in seconds, not minutes.

**REVISED Verdict**: Implement overclocking FIRST. It's designed for exactly this use case and could solve the problem without porting to TypeScript.

---

## Technical Details

### MOIRA Source Files

- `MoiraTypes.h:48-59` - CPU model enum
- `Moira.h:31` - cpuModel variable
- `moira-wrapper.cpp:386` - Model selection
- `MoiraEmulator.ts:179` - Memory size configuration

### Build Process

```bash
cd web/backend/src/amiga-emulation/cpu
./build-wasm.sh  # Compiles moira-wrapper.cpp -> moira.wasm
```

### Configuration Changes

**To switch to M68EC020**:
```cpp
// File: moira-wrapper.cpp line 386
cpuModel = Model::M68EC020;  // Change from M68000
```

**To increase memory** (not recommended):
```typescript
// File: MoiraEmulator.ts line 179
constructor(private memorySize: number = 256 * 1024 * 1024) {}  // 256MB instead of 16MB
```

---

## References

- MOIRA GitHub: https://github.com/dirkwhoffmann/Moira
- vAmiga Emulator: https://dirkwhoffmann.github.io/vAmiga/
- Motorola M68000 Manual: NDK 3.2R4 Autodocs
- MultiTop E Sources: `express.e` (search with MCP tools)

---

**Report prepared by**: Claude Sonnet 4.5
**For**: AmiExpress-Web BBS Project
**Next Steps**: See task list in `handoff.md`
