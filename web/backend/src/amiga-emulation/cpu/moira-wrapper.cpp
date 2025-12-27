#include "moira-source/Moira/Moira.h"
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <cstdint>
#include <vector>
#include <cstring>
#include <map>
#include <algorithm>

using namespace emscripten;
using namespace moira;

// Custom CPU implementation following vAmiga's architecture
class MoiraCPU : public Moira {
private:
    // ========== Debug Flags (can be toggled at runtime from JavaScript) ==========
    // ========== Runtime Debug Flags ==========
    bool debugEnabled = false;         // Master debug switch (enables all below)
    bool debugInstructions = false;    // Log each instruction executed
    bool debugRegisters = false;       // Log register changes (D0-D7, A0-A7)
    bool debugPrefetch = false;        // Log prefetch queue operations
    bool debugMemory = false;          // Log memory read/write operations
    bool debugLibraryCalls = false;    // Log library calls (JSR to negative offsets)
    bool debugStack = false;           // Log stack push/pop operations
    bool debugBranches = false;        // Log branch/jump instructions
    bool debugAddressErrors = false;   // Log address error exceptions (odd word/long accesses)
    bool debugExceptions = false;      // Log all exception vectors
    bool debugWatchpoints = false;     // Log when watchpoints are hit
    bool debugMemoryAccess = false;    // Detailed memory access logging with stack traces

    // ========== Breakpoint Support ==========
    std::vector<uint32_t> breakpoints;  // PC addresses to break on
    bool breakpointHit = false;
    uint32_t lastBreakpoint = 0;

    // ========== Memory Watch Support ==========
    std::vector<uint32_t> watchAddresses;  // Memory addresses to watch
    uint32_t watchRangeStart = 0;
    uint32_t watchRangeEnd = 0;

    // ========== Instruction Counter ==========
    uint64_t instructionCount = 0;
    uint64_t maxInstructions = 0;  // 0 = unlimited

    // ========== Execution Trace Buffer (circular buffer of recent PCs) ==========
    static const int TRACE_BUFFER_SIZE = 256;
    uint32_t traceBuffer[TRACE_BUFFER_SIZE];
    int traceIndex = 0;
    bool traceEnabled = false;

    // ========== Memory Corruption Detection ==========
    bool memoryProtectionEnabled = false;
    uint32_t protectedRangeStart = 0;
    uint32_t protectedRangeEnd = 0;
    uint32_t lastCorruptedAddress = 0;
    bool corruptionDetected = false;

    // ========== Stack Monitoring ==========
    uint32_t stackBase = 0;       // Initial SP value
    uint32_t stackLimit = 0;      // Lowest allowed SP
    bool stackOverflow = false;
    uint32_t maxStackDepth = 0;   // Track deepest SP seen

    // ========== Jump/Call Tracking ==========
    static const int CALL_STACK_SIZE = 64;
    uint32_t callStack[CALL_STACK_SIZE];  // Return addresses
    uint32_t callSites[CALL_STACK_SIZE];  // Where JSR was called from
    int callStackDepth = 0;
    bool trackCalls = false;

    // ========== Wild Pointer Detection ==========
    uint32_t validMemoryStart = 0;
    uint32_t validMemoryEnd = 0x1000000;  // Default 16MB
    uint32_t lastWildAccess = 0;
    bool wildAccessDetected = false;

    // ========== Statistics ==========
    uint64_t readCount = 0;
    uint64_t writeCount = 0;
    uint64_t jsrCount = 0;
    uint64_t rtsCount = 0;
    uint64_t branchCount = 0;
    uint64_t trapCount = 0;

    // ========== Overclocking Support ==========
    int overclocking = 0;    // 0=disabled, 1=native, 2=2x, 10=10x, etc.
    i64 debt = 0;            // Accumulated CPU cycles (for sync)

public:
    // ========== Runtime Debug Control (callable from JavaScript) ==========
    void setDebug(bool enabled) { debugEnabled = enabled; }
    void setDebugInstructions(bool enabled) { debugInstructions = enabled; }
    void setDebugRegisters(bool enabled) { debugRegisters = enabled; }
    void setDebugPrefetch(bool enabled) { debugPrefetch = enabled; }
    void setDebugMemory(bool enabled) { debugMemory = enabled; }
    void setDebugLibraryCalls(bool enabled) { debugLibraryCalls = enabled; }
    void setDebugStack(bool enabled) { debugStack = enabled; }
    void setDebugBranches(bool enabled) { debugBranches = enabled; }
    void setDebugAddressErrors(bool enabled) { debugAddressErrors = enabled; }
    void setDebugExceptions(bool enabled) { debugExceptions = enabled; }
    void setDebugWatchpoints(bool enabled) { debugWatchpoints = enabled; }
    void setDebugMemoryAccess(bool enabled) { debugMemoryAccess = enabled; }

    bool getDebug() const { return debugEnabled; }
    bool getDebugInstructions() const { return debugInstructions; }
    bool getDebugAddressErrors() const { return debugAddressErrors; }
    bool getDebugExceptions() const { return debugExceptions; }

    // ========== Breakpoint Control ==========
    void addBreakpoint(uint32_t addr) { breakpoints.push_back(addr); }
    void removeBreakpoint(uint32_t addr) {
        breakpoints.erase(std::remove(breakpoints.begin(), breakpoints.end(), addr), breakpoints.end());
    }
    void clearBreakpoints() { breakpoints.clear(); }
    bool hasBreakpointHit() const { return breakpointHit; }
    uint32_t getLastBreakpoint() const { return lastBreakpoint; }
    void clearBreakpointHit() { breakpointHit = false; }

    // ========== Memory Watch Control ==========
    void addWatchAddress(uint32_t addr) { watchAddresses.push_back(addr); }
    void clearWatchAddresses() { watchAddresses.clear(); }
    void setWatchRange(uint32_t start, uint32_t end) { watchRangeStart = start; watchRangeEnd = end; }

    // ========== Instruction Limit (for runaway detection) ==========
    void setMaxInstructions(uint64_t max) { maxInstructions = max; }
    uint64_t getInstructionCount() const { return instructionCount; }
    void resetInstructionCount() { instructionCount = 0; }

    // ========== Debug Helpers ==========
    // Get current instruction disassembly (returns opcode for now)
    uint16_t getCurrentOpcode() const {
        return const_cast<MoiraCPU*>(this)->read16(reg.pc);
    }

    // Dump all registers to console
    void dumpRegisters() {
        EM_ASM({
            console.log('[MOIRA DUMP] D0-D7: ' +
                $0.toString(16) + ' ' + $1.toString(16) + ' ' +
                $2.toString(16) + ' ' + $3.toString(16) + ' ' +
                $4.toString(16) + ' ' + $5.toString(16) + ' ' +
                $6.toString(16) + ' ' + $7.toString(16));
        }, reg.d[0], reg.d[1], reg.d[2], reg.d[3], reg.d[4], reg.d[5], reg.d[6], reg.d[7]);
        EM_ASM({
            console.log('[MOIRA DUMP] A0-A7: ' +
                $0.toString(16) + ' ' + $1.toString(16) + ' ' +
                $2.toString(16) + ' ' + $3.toString(16) + ' ' +
                $4.toString(16) + ' ' + $5.toString(16) + ' ' +
                $6.toString(16) + ' ' + $7.toString(16));
        }, reg.a[0], reg.a[1], reg.a[2], reg.a[3], reg.a[4], reg.a[5], reg.a[6], reg.a[7]);
        EM_ASM({
            console.log('[MOIRA DUMP] PC=' + $0.toString(16) + ' SR=' + $1.toString(16));
        }, reg.pc, getSR());
    }

    // Dump stack (show N words from current SP)
    void dumpStack(int words) {
        uint32_t sp = reg.a[7];
        EM_ASM({ console.log('[MOIRA STACK] SP=0x' + $0.toString(16) + ':'); }, sp);
        for (int i = 0; i < words && i < 16; i++) {
            // Read 4 bytes manually using getMemoryByte
            uint32_t addr = sp + i * 4;
            uint32_t val = (getMemoryByte(addr) << 24) |
                          (getMemoryByte(addr + 1) << 16) |
                          (getMemoryByte(addr + 2) << 8) |
                          getMemoryByte(addr + 3);
            EM_ASM({ console.log('  [SP+' + ($0*4) + '] = 0x' + $1.toString(16)); }, i, val);
        }
    }

    // ========== Execution Trace Buffer Control ==========
    void enableTrace(bool enabled) { traceEnabled = enabled; }
    bool isTraceEnabled() const { return traceEnabled; }
    void clearTrace() { traceIndex = 0; memset(traceBuffer, 0, sizeof(traceBuffer)); }

    // Get trace buffer as string (for debugging)
    void dumpTrace() {
        EM_ASM({ console.log('[MOIRA TRACE] Last ' + $0 + ' PCs:'); }, TRACE_BUFFER_SIZE);
        for (int i = 0; i < TRACE_BUFFER_SIZE; i++) {
            int idx = (traceIndex + i) % TRACE_BUFFER_SIZE;
            if (traceBuffer[idx] != 0) {
                EM_ASM({ console.log('  [' + $0 + '] PC=0x' + $1.toString(16)); }, i, traceBuffer[idx]);
            }
        }
    }

    // Get specific trace entry (for JavaScript inspection)
    uint32_t getTraceEntry(int index) const {
        if (index < 0 || index >= TRACE_BUFFER_SIZE) return 0;
        return traceBuffer[(traceIndex + index) % TRACE_BUFFER_SIZE];
    }

    // ========== Memory Corruption Detection Control ==========
    void enableMemoryProtection(uint32_t start, uint32_t end) {
        memoryProtectionEnabled = true;
        protectedRangeStart = start;
        protectedRangeEnd = end;
        corruptionDetected = false;
        EM_ASM({
            console.log('[MOIRA] Memory protection enabled: 0x' + $0.toString(16) + ' - 0x' + $1.toString(16));
        }, start, end);
    }
    void disableMemoryProtection() { memoryProtectionEnabled = false; }
    bool isMemoryProtectionEnabled() const { return memoryProtectionEnabled; }
    bool hasCorruptionDetected() const { return corruptionDetected; }
    uint32_t getLastCorruptedAddress() const { return lastCorruptedAddress; }
    void clearCorruptionFlag() { corruptionDetected = false; }

    // ========== Stack Monitoring Control ==========
    void setStackBounds(uint32_t base, uint32_t limit) {
        stackBase = base;
        stackLimit = limit;
        maxStackDepth = base;
        stackOverflow = false;
        EM_ASM({
            console.log('[MOIRA] Stack bounds set: base=0x' + $0.toString(16) + ' limit=0x' + $1.toString(16));
        }, base, limit);
    }
    bool hasStackOverflow() const { return stackOverflow; }
    uint32_t getMaxStackDepth() const { return maxStackDepth; }
    void clearStackOverflow() { stackOverflow = false; }

    // ========== Jump/Call Tracking Control ==========
    void enableCallTracking(bool enabled) { trackCalls = enabled; }
    bool isCallTrackingEnabled() const { return trackCalls; }
    int getCallStackDepth() const { return callStackDepth; }

    // Get call stack entry (return address)
    uint32_t getCallStackEntry(int index) const {
        if (index < 0 || index >= callStackDepth) return 0;
        return callStack[index];
    }

    // Get call site (where JSR was called from)
    uint32_t getCallSite(int index) const {
        if (index < 0 || index >= callStackDepth) return 0;
        return callSites[index];
    }

    // Dump call stack
    void dumpCallStack() {
        EM_ASM({ console.log('[MOIRA CALL STACK] Depth: ' + $0); }, callStackDepth);
        for (int i = 0; i < callStackDepth; i++) {
            EM_ASM({
                console.log('  [' + $0 + '] Called from 0x' + $1.toString(16) + ', return to 0x' + $2.toString(16));
            }, i, callSites[i], callStack[i]);
        }
    }

    void clearCallStack() { callStackDepth = 0; }

    // ========== Wild Pointer Detection Control ==========
    void setValidMemoryRange(uint32_t start, uint32_t end) {
        validMemoryStart = start;
        validMemoryEnd = end;
        wildAccessDetected = false;
        EM_ASM({
            console.log('[MOIRA] Valid memory range: 0x' + $0.toString(16) + ' - 0x' + $1.toString(16));
        }, start, end);
    }
    bool hasWildAccessDetected() const { return wildAccessDetected; }
    uint32_t getLastWildAccess() const { return lastWildAccess; }
    void clearWildAccessFlag() { wildAccessDetected = false; }

    // ========== Statistics Access ==========
    uint64_t getReadCount() const { return readCount; }
    uint64_t getWriteCount() const { return writeCount; }
    uint64_t getJsrCount() const { return jsrCount; }
    uint64_t getRtsCount() const { return rtsCount; }
    uint64_t getBranchCount() const { return branchCount; }
    uint64_t getTrapCount() const { return trapCount; }

    void resetStatistics() {
        readCount = writeCount = jsrCount = rtsCount = branchCount = trapCount = 0;
        instructionCount = 0;
    }

    void dumpStatistics() {
        EM_ASM({
            console.log('[MOIRA STATS] Instructions: ' + $0);
            console.log('[MOIRA STATS] Reads: ' + $1 + ', Writes: ' + $2);
            console.log('[MOIRA STATS] JSR: ' + $3 + ', RTS: ' + $4);
            console.log('[MOIRA STATS] Branches: ' + $5 + ', Traps: ' + $6);
        }, (int)instructionCount, (int)readCount, (int)writeCount,
           (int)jsrCount, (int)rtsCount, (int)branchCount, (int)trapCount);
    }

    // ========== Overclocking Control ==========
    void setOverclocking(int factor) {
        overclocking = factor;
        debt = 0;  // Reset debt when changing overclock factor
        EM_ASM({
            console.log('[MOIRA] Overclocking set to ' + $0 + 'x');
        }, factor);
    }

    int getOverclocking() const { return overclocking; }

    // Sync function - called after instruction execution
    // Implements vAmiga-style overclocking with debt counter
    void sync(int cycles) override {
        if (overclocking == 0) {
            // Overclocking disabled - no sync needed
            return;
        }

        // Add elapsed CPU cycles to debt
        debt += cycles;

        // Calculate how many DMA cycles we've accumulated
        // Formula from vAmiga: CPU_AS_DMA_CYCLES(cycles) = (cycles >> 1)
        // With overclocking: multiply CPU cycles by overclock factor first
        i64 microCycles = 2 * overclocking;  // Micro-cycles per DMA cycle

        // Process complete DMA cycles
        while (debt >= microCycles) {
            debt -= microCycles;
            // In vAmiga, this would call agnus.executeOneCycle()
            // For our purposes, we just track the timing
        }
    }

    // ========== File Operation Debug Logging ==========
    // Call this from JavaScript when a file operation occurs
    void logFileOperation(const char* op, uint32_t handle, uint32_t result) {
        if (debugEnabled || debugMemory) {
            EM_ASM({
                var opStr = UTF8ToString($0);
                console.log('[68K FILE] ' + opStr + ' handle=' + $1.toString(16) + ' result=' + $2);
            }, op, handle, result);
        }
    }

private:
    // ========== vAmiga-Style Memory Architecture ==========
    // Separate memory buffers for each region (like vAmiga)
    std::vector<uint8_t> chipRam;   // Chip RAM (typically 512KB-2MB)
    std::vector<uint8_t> slowRam;   // Slow RAM (optional)
    std::vector<uint8_t> fastRam;   // Fast RAM (optional)
    std::vector<uint8_t> rom;       // Kickstart ROM (512KB)

    // Memory masks (size - 1, for wrapping addresses)
    uint32_t chipMask;
    uint32_t slowMask;
    uint32_t fastMask;
    uint32_t romMask;

    // Memory source identifiers (following vAmiga's MemSrc enum)
    enum class MemSrc : uint8_t {
        NONE = 0,
        CHIP,
        SLOW,
        FAST,
        CIA,
        CUSTOM,
        ROM,
        UNMAPPED
    };

    // Page table: maps 256 pages (64KB each) to memory sources
    // Following vAmiga's cpuMemSrc[] architecture
    MemSrc cpuMemSrc[256];

    // Memory region boundaries (for I/O detection)
    static const uint32_t CIA_START = 0xA00000;     // CIA chips
    static const uint32_t CIA_END = 0xBFFFFF;
    static const uint32_t CUSTOM_START = 0xDFF000;  // Custom chips
    static const uint32_t CUSTOM_END = 0xDFFFFF;

    // Simulated hardware state (for dynamic register returns)
    // Following vAmiga's approach: track beam position for VPOSR/VHPOSR
    mutable uint32_t scanlineCounter;  // Current scanline (V position)
    mutable uint32_t hposCounter;      // Current horizontal position
    mutable uint32_t ciaTimerA;        // CIA Timer A counter
    mutable uint32_t ciaTimerB;        // CIA Timer B counter

    // PAL timing: 312 lines, 227 cycles per line
    static const uint32_t PAL_LINES = 312;
    static const uint32_t LINE_CYCLES = 227;

    // Helper: Update memory source page table (following vAmiga's updateCpuMemSrcTable)
    void updateMemSrcTable() {
        // Initialize all pages to NONE
        for (int i = 0; i < 256; i++) {
            cpuMemSrc[i] = MemSrc::NONE;
        }

        // Chip RAM: pages 0x00-0x1F (2MB max)
        if (!chipRam.empty()) {
            uint32_t chipPages = (chipRam.size() + 0xFFFF) / 0x10000;  // Round up to pages
            for (uint32_t i = 0; i < chipPages && i < 0x20; i++) {
                cpuMemSrc[i] = MemSrc::CHIP;
            }
        }

        // FAST RAM: map immediately after chip RAM, up to start of ROM/I/O
        if (!fastRam.empty()) {
            uint32_t fastPages = (fastRam.size() + 0xFFFF) / 0x10000;
            uint32_t startPage = 0x20; // page after 2MB chip
            for (uint32_t i = 0; i < fastPages && (startPage + i) < 0xF8; i++) {
                cpuMemSrc[startPage + i] = MemSrc::FAST;
            }
        }

        // ROM: pages 0xF8-0xFF (512KB)
        if (!rom.empty()) {
            for (int i = 0xF8; i <= 0xFF; i++) {
                cpuMemSrc[i] = MemSrc::ROM;
            }
        }

        // I/O regions (handled specially in read8/write8)
        // CIA: 0xA0-0xBF
        // CUSTOM: 0xDF

        EM_ASM({
            console.log('[MOIRA WASM] Memory page table updated');
            console.log('[MOIRA WASM]   Chip RAM pages: 0x00-0x' + ($0).toString(16));
            console.log('[MOIRA WASM]   Fast RAM pages: 0x20-0x' + ($1).toString(16));
            console.log('[MOIRA WASM]   ROM pages: 0xF8-0xFF');
        }, chipRam.empty() ? 0 : ((chipRam.size() + 0xFFFF) / 0x10000) - 1,
           fastRam.empty() ? 0x1F : (0x20 + ((fastRam.size() + 0xFFFF) / 0x10000) - 1));
    }

public:
    MoiraCPU(size_t memSize) : chipRam(2 * 1024 * 1024, 0),  // 2MB chip RAM
                                rom(512 * 1024, 0),            // 512KB ROM
                                chipMask(0),
                                slowMask(0),
                                fastMask(0),
                                romMask(0),
                                scanlineCounter(0),
                                hposCounter(0),
                                ciaTimerA(0),
                                ciaTimerB(0) {
        cpuModel = Model::M68020;  // Upgraded from M68000 for better performance

        // Allocate FAST RAM from requested memSize (after 2MB chip, before ROM)
        size_t fastSize = 0;
        if (memSize > chipRam.size()) {
            size_t maxFast = 0xF80000 - chipRam.size(); // stop before ROM region
            fastSize = std::min(memSize - chipRam.size(), maxFast);
        }
        if (fastSize > 0) {
            fastRam.assign(fastSize, 0);
            fastMask = fastRam.size() - 1;
        }

        // Calculate memory masks (size - 1)
        chipMask = chipRam.size() - 1;
        romMask = rom.size() - 1;

        // Initialize page table
        updateMemSrcTable();

        EM_ASM({
            console.log('[MOIRA WASM] MoiraCPU initialized with vAmiga-style memory architecture!');
            console.log('[MOIRA WASM]   Chip RAM: ' + ($0 / 1024) + ' KB (mask: 0x' + ($1).toString(16) + ')');
            console.log('[MOIRA WASM]   ROM: ' + ($2 / 1024) + ' KB (mask: 0x' + ($3).toString(16) + ')');
        }, chipRam.size(), chipMask, rom.size(), romMask);
    }

    // Update hardware state based on cycles executed
    // Called after each execute() to simulate hardware progression
    void updateHardwareState() const {
        // Get current cycle count
        i64 cycles = getClock();

        // Update beam position (VPOSR/VHPOSR registers)
        // Every 227 cycles = one scanline
        uint32_t totalLines = (cycles / LINE_CYCLES) % PAL_LINES;
        uint32_t hpos = cycles % LINE_CYCLES;

        const_cast<MoiraCPU*>(this)->scanlineCounter = totalLines;
        const_cast<MoiraCPU*>(this)->hposCounter = hpos;

        // Update CIA timers (they increment with each E clock cycle)
        // E clock = 0.715909 MHz, CPU = 7.09379 MHz, so timer increments every ~10 CPU cycles
        const_cast<MoiraCPU*>(this)->ciaTimerA = (cycles / 10) & 0xFFFF;
        const_cast<MoiraCPU*>(this)->ciaTimerB = (cycles / 10) & 0xFFFF;
    }

    // Implement pure virtual memory access methods
    // Following vAmiga's page table architecture

    u8 read8(u32 addr) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // General memory access tracking (debugMemoryAccess flag)
        if (debugMemoryAccess) {
            EM_ASM({
                console.log('[MEMORY READ8] addr=0x' + $0.toString(16).padStart(6, '0') +
                           ' PC=0x' + $1.toString(16).padStart(6, '0'));
            }, addr, reg.pc);
        }

        // Get page number (each page = 64KB)
        uint8_t page = (addr >> 16) & 0xFF;

        // DEBUG: Track reads from 0xf0080-0xf0084 (CLI program name area)
        if (addr >= 0xf0080 && addr <= 0xf0084) {
            static int read_count = 0;
            if (++read_count <= 50) {  // Only log first 50 reads
                EM_ASM({
                    console.log('[READ8] addr=0x' + $0.toString(16).padStart(6, '0') +
                                ' page=0x' + $1.toString(16).padStart(2, '0') +
                                ' memSrc=' + $2);
                }, addr, page, (int)cpuMemSrc[page]);
            }
        }

        // Page table lookup (following vAmiga's peek8 implementation)
        switch (cpuMemSrc[page]) {
            case MemSrc::CHIP: {
                // Read from chip RAM with mask
                u8 value = chipRam[addr & chipMask];

                // DEBUG: Log value from CLI program name area
                if (addr >= 0xf0080 && addr <= 0xf0084) {
                    static int value_log_count = 0;
                    if (++value_log_count <= 50) {
                        EM_ASM({
                            console.log('[READ8] CHIP: addr=0x' + $0.toString(16).padStart(6, '0') +
                                        ' offset=0x' + $1.toString(16).padStart(6, '0') +
                                        ' value=0x' + $2.toString(16).padStart(2, '0') +
                                        ' (' + String.fromCharCode($2) + ')');
                        }, addr, addr & chipMask, value);
                    }
                }

                return value;
            }

            case MemSrc::ROM: {
                // Read from ROM with mask
                u8 value = rom[addr & romMask];

                // DEBUG: Log if trying to read CLI area from ROM (this would be wrong!)
                if (addr >= 0xf0080 && addr <= 0xf0084) {
                    EM_ASM({
                        console.error('[READ8] ERROR: Reading CLI area from ROM! addr=0x' + $0.toString(16).padStart(6, '0') +
                                    ' offset=0x' + $1.toString(16).padStart(6, '0') +
                                    ' value=0x' + $2.toString(16).padStart(2, '0'));
                    }, addr, addr & romMask, value);
                }

                return value;
            }

            case MemSrc::SLOW:
                if (!slowRam.empty()) {
                    return slowRam[addr & slowMask];
                }
                return 0;

            case MemSrc::FAST:
                if (!fastRam.empty()) {
                    return fastRam[addr & fastMask];
                }
                return 0;

            case MemSrc::CIA:
                return readCIA(addr);

            case MemSrc::CUSTOM:
                return readCustom(addr);

            case MemSrc::NONE:
            case MemSrc::UNMAPPED:
            default:
                // Unmapped memory returns 0
                return 0;
        }
    }

    u16 read16(u32 addr) const override {
        // Use read8 for page table logic, combine bytes big-endian
        u8 high = read8(addr);
        u8 low = read8(addr + 1);
        return (high << 8) | low;
    }

    void write8(u32 addr, u8 val) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // General memory access tracking (debugMemoryAccess flag)
        if (debugMemoryAccess) {
            EM_ASM({
                console.log('[MEMORY WRITE8] addr=0x' + $0.toString(16).padStart(6, '0') +
                           ' val=0x' + $1.toString(16).padStart(2, '0') +
                           ' PC=0x' + $2.toString(16).padStart(6, '0'));
            }, addr, val, reg.pc);
        }

        // Check watchpoints (runtime watchpoint addresses)
        if (debugWatchpoints) {
            for (uint32_t watchAddr : const_cast<MoiraCPU*>(this)->watchAddresses) {
                if (addr == watchAddr) {
                    EM_ASM({
                        console.log('[WATCHPOINT HIT] Write to 0x' + $0.toString(16).padStart(6, '0') +
                                   ' val=0x' + $1.toString(16).padStart(2, '0') +
                                   ' PC=0x' + $2.toString(16).padStart(6, '0'));
                    }, addr, val, reg.pc);
                    break;
                }
            }

            // Check watchpoint range
            if (watchRangeStart != 0 && addr >= watchRangeStart && addr <= watchRangeEnd) {
                EM_ASM({
                    console.log('[WATCHPOINT RANGE] Write to 0x' + $0.toString(16).padStart(6, '0') +
                               ' val=0x' + $1.toString(16).padStart(2, '0') +
                               ' PC=0x' + $2.toString(16).padStart(6, '0') +
                               ' (in range 0x' + $3.toString(16) + '-0x' + $4.toString(16) + ')');
                }, addr, val, reg.pc, watchRangeStart, watchRangeEnd);
            }
        }

        // WATCHPOINT: Detect writes to corruption range 0x1250-0x125F
        if (addr >= 0x1250 && addr <= 0x125F) {
            u32 pc = this->getPC();
            fprintf(stderr, "\n*** WATCHPOINT: Write to 0x%X ***\n", addr);
            fprintf(stderr, "  Value: 0x%02X ('%c')\n", val, (val >= 32 && val < 127) ? val : '.');
            fprintf(stderr, "  PC at time of write: 0x%X\n", pc);
            fprintf(stderr, "  This address should contain JSR instruction!\n\n");
            fflush(stderr);
        }

        // Get page number
        uint8_t page = (addr >> 16) & 0xFF;

        // Page table lookup for writes
        switch (cpuMemSrc[page]) {
            case MemSrc::CHIP:
                // Write to chip RAM with mask
                const_cast<MoiraCPU*>(this)->chipRam[addr & chipMask] = val;
                return;

            case MemSrc::SLOW:
                if (!slowRam.empty()) {
                    const_cast<MoiraCPU*>(this)->slowRam[addr & slowMask] = val;
                }
                return;

            case MemSrc::FAST:
                if (!fastRam.empty()) {
                    const_cast<MoiraCPU*>(this)->fastRam[addr & fastMask] = val;
                }
                return;

            case MemSrc::ROM:
                // ROM is read-only, ignore writes
                return;

            case MemSrc::CIA:
            case MemSrc::CUSTOM:
                // I/O writes (mostly ignored for door execution)
                writeCustom(addr, val);
                return;

            case MemSrc::NONE:
            case MemSrc::UNMAPPED:
            default:
                // Ignore writes to unmapped memory
                return;
        }
    }

    void write16(u32 addr, u16 val) const override {
        // Use write8 for page table logic, split bytes big-endian
        write8(addr, (val >> 8) & 0xFF);
        write8(addr + 1, val & 0xFF);
    }

    // Memory-mapped I/O stubs following vAmiga's approach
    // Return DYNAMIC values based on simulated hardware state
    u8 readCIA(u32 addr) const {
        // Update hardware state first (simulate hardware progression)
        updateHardwareState();

        // CIA registers - following vAmiga's CIARegs.cpp
        switch (addr & 0xF) {
            case 0x0:  // Port A data
            case 0x1:  // Port B data
                return 0xFF;  // All bits high (no keys pressed)

            case 0x2:  // Data direction A
            case 0x3:  // Data direction B
                return 0x00;

            case 0x4:  // Timer A low byte - MUST INCREMENT!
                return (ciaTimerA & 0xFF);

            case 0x5:  // Timer A high byte - MUST INCREMENT!
                return (ciaTimerA >> 8) & 0xFF;

            case 0x6:  // Timer B low byte - MUST INCREMENT!
                return (ciaTimerB & 0xFF);

            case 0x7:  // Timer B high byte - MUST INCREMENT!
                return (ciaTimerB >> 8) & 0xFF;

            case 0x8:  // TOD (Time of Day) 1/10 seconds
            case 0x9:  // TOD seconds
            case 0xA:  // TOD minutes
                return 0x00;

            case 0xD:  // Interrupt control register
                return 0x00;  // No interrupts pending

            case 0xE:  // Control register A
            case 0xF:  // Control register B
                return 0x00;

            default:
                return 0x00;
        }
    }

    u16 readCIA16(u32 addr) const {
        // CIA uses 8-bit registers, but allow 16-bit reads
        u8 high = readCIA(addr);
        u8 low = readCIA(addr + 1);
        return (high << 8) | low;
    }

    u8 readCustom(u32 addr) const {
        // Custom chip registers - return safe defaults
        return 0x00;
    }

    u16 readCustom16(u32 addr) const {
        // Update hardware state first (simulate hardware progression)
        updateHardwareState();

        // Log all custom chip reads to understand what ROM is polling
        static uint32_t total_reads = 0;
        static std::map<uint32_t, uint32_t> read_counts;

        total_reads++;
        read_counts[addr & 0x1FE]++;

        // Log every 1M reads with breakdown
        if (total_reads % 1000000 == 0) {
            int million = total_reads / 1000000;
            EM_ASM({
                console.log('[CUSTOM] Read #' + $0 + 'M custom chip registers');
            }, million);

            // Log top 5 most-read registers
            std::vector<std::pair<uint32_t, uint32_t>> sorted(read_counts.begin(), read_counts.end());
            std::sort(sorted.begin(), sorted.end(), [](auto &a, auto &b) { return a.second > b.second; });

            for (int i = 0; i < std::min(5, (int)sorted.size()); i++) {
                int reg = sorted[i].first;
                int count = sorted[i].second;
                EM_ASM({
                    console.log('  0xDFF' + ('000' + $0.toString(16)).slice(-3).toUpperCase() + ': ' + $1 + ' reads');
                }, reg, count);
            }
        }

        // Custom chip registers - following vAmiga's Memory.cpp peekCustom16()
        switch (addr & 0x1FE) {  // Mask to even addresses
            case 0x002:  // DMACONR (DMA control read)
                return 0x0000;  // All DMA disabled

            case 0x004:  // VPOSR (Vertical position) - CRITICAL FOR ROM BOOT!
                // Following vAmiga's AgnusRegs.cpp peekVPOSR()
                // 15 14 13 12 11 10 09 08 07 06 05 04 03 02 01 00
                // LF I6 I5 I4 I3 I2 I1 I0 LL -- -- -- -- -- -- V8
                {
                    uint16_t result = 0x0000;

                    // Chip ID bits (I6-I0): 0x20 = OCS, 0x30 = ECS
                    result |= (0x20 << 8);  // OCS Agnus

                    // V8: High bit of vertical position
                    result |= (scanlineCounter >> 8) & 0x01;

                    // LF bit (bit 15): Long frame flag
                    if (scanlineCounter > 255) result |= 0x8000;

                    // Log every 1M reads to verify dynamic values
                    static int vposr_reads = 0;
                    if (++vposr_reads % 1000000 == 0) {
                        int million = vposr_reads / 1000000;
                        int scanline = scanlineCounter;
                        int res = result;
                        EM_ASM({
                            console.log('[VPOSR] Read #' + $0 + 'M: scanline=' + $1 + ', result=0x' + $2.toString(16));
                        }, million, scanline, res);
                    }

                    return result;
                }

            case 0x006:  // VHPOSR (Horizontal and vertical position) - CRITICAL!
                // Following vAmiga's AgnusRegs.cpp peekVHPOSR()
                // 15 14 13 12 11 10 09 08 07 06 05 04 03 02 01 00
                // V7 V6 V5 V4 V3 V2 V1 V0 H8 H7 H6 H5 H4 H3 H2 H1
                {
                    uint16_t result = 0x0000;

                    // V7-V0: Lower 8 bits of vertical position
                    result |= (scanlineCounter & 0xFF) << 8;

                    // H8-H1: Horizontal position (bits 8-1, not 7-0!)
                    result |= (hposCounter >> 1) & 0xFF;

                    return result;
                }

            case 0x016:  // POTGOR (Pot and joystick)
                return 0xFFFF;  // Nothing connected

            case 0x018:  // SERDATR (Serial data)
                return 0x0000;  // No data

            case 0x01C:  // INTENAR (Interrupt enable read)
                return 0x0000;  // All disabled

            case 0x01E:  // INTREQR (Interrupt request read)
                return 0x0000;  // No interrupts pending

            default:
                return 0x0000;
        }
    }

    void writeCustom(u32 addr, u8 val) const {
        // Most writes can be ignored for door execution
        // ROM is just initializing hardware we don't have
    }

    void writeCustom16(u32 addr, u16 val) const {
        // Most writes can be ignored for door execution
    }

    // Set memory byte (from JavaScript)
    // CRITICAL FIX: Route through write8() to respect memory mapping
    void setMemoryByte(uint32_t addr, uint8_t value) {
        write8(addr, value);
    }

    // Get memory byte (from JavaScript)
    // CRITICAL FIX: Route through read8() to respect memory mapping
    // This ensures ROM, I/O, and other memory regions are accessed correctly
    uint8_t getMemoryByte(uint32_t addr) {
        return read8(addr);
    }

    // Load ROM into ROM buffer (following vAmiga architecture)
    void loadROM(const std::vector<uint8_t>& romData) {
        // Resize ROM buffer to match ROM size (typically 512KB)
        rom.resize(romData.size());

        // Copy ROM data to ROM buffer
        memcpy(rom.data(), romData.data(), romData.size());

        // Update ROM mask
        romMask = rom.size() - 1;

        // Copy exception vectors (first 1KB) to chip RAM at 0x000000
        // This is how real Amiga boots - ROM vectors copied to low memory
        uint32_t vectorSize = (romData.size() < 1024) ? romData.size() : 1024;
        memcpy(chipRam.data(), romData.data(), vectorSize);

        // Update page table with new ROM configuration
        updateMemSrcTable();

        EM_ASM({
            console.log('[MOIRA WASM] ROM loaded: ' + $0 + ' bytes');
            console.log('[MOIRA WASM]   ROM buffer size: ' + $1 + ' bytes');
            console.log('[MOIRA WASM]   ROM mask: 0x' + $2.toString(16));
            console.log('[MOIRA WASM]   Exception vectors copied to chip RAM: ' + $3 + ' bytes');
        }, (int)romData.size(), (int)rom.size(), romMask, vectorSize);
    }

    // Load program into chip RAM (door code goes here)
    void loadProgram(const std::vector<uint8_t>& program, uint32_t address) {
        address &= 0xFFFFFF;

        // Programs load into chip RAM (address < 2MB)
        if (address < chipRam.size()) {
            uint32_t copySize = std::min((uint32_t)program.size(),
                                        (uint32_t)(chipRam.size() - address));
            memcpy(&chipRam[address], program.data(), copySize);

            EM_ASM({
                console.log('[MOIRA WASM] Program loaded: ' + $0 + ' bytes at address 0x' + $1.toString(16));
            }, copySize, address);
        }
    }

    // Override willExecute - currently only called for STOP, TAS, BKPT
    void willExecute(const char *func, Instr I, Mode M, Size S, u16 opcode) override {
        // Log special instructions that might cause ROM boot to fail
        if (I == Instr::STOP) {
            int pc = this->reg.pc;
            int sr = getSR();
            EM_ASM({
                console.log('[CPU] STOP instruction at PC=0x' + $0.toString(16) + ', SR=0x' + $1.toString(16));
                console.log('[CPU] ROM waiting for interrupt - this will cause infinite loop!');
            }, pc, sr);
        }
    }

    // Reset CPU following vAmiga's approach
    // Reads SP from 0x000000-0x000003, PC from 0x000004-0x000007
    void resetCPU() {
        reset();  // Moira's reset() handles this properly
    }

    // Execute cycles (returns cycles executed via getClock)
    int executeCycles(int cycles) {
        i64 startClock = getClock();
        execute(cycles);
        return (int)(getClock() - startClock);
    }

    // Execute exactly ONE instruction (returns cycles consumed)
    // CRITICAL: This calls MOIRA's execute() with NO parameters,
    // which executes exactly one complete instruction, regardless of
    // how many CPU cycles it requires. This is the ROOT solution for
    // proper instruction-boundary execution.
    int executeInstruction() {
        i64 startClock = getClock();
        execute();  // MOIRA's execute() with no parameters - one instruction
        int cycles = (int)(getClock() - startClock);

        // Call sync for overclocking support
        sync(cycles);

        return cycles;
    }

    // Get registers
    uint32_t getRegister(int reg) {
        if (reg < 8) return this->reg.d[reg];
        if (reg < 16) return this->reg.a[reg - 8];
        if (reg == 16) return this->reg.pc;
        if (reg == 17) return getSR();
        return 0;
    }

    // Set registers
    void setRegister(int reg, uint32_t value) {
        if (reg < 8) this->reg.d[reg] = value;
        else if (reg < 16) this->reg.a[reg - 8] = value;
        else if (reg == 16) {
            // When setting PC, also sync pc0 to maintain Moira's invariant
            this->reg.pc = value;
            this->reg.pc0 = value;
        }
        else if (reg == 17) setSR(value);
    }

    // Get total cycles executed
    int64_t getCycles() {
        return getClock();
    }

    // Prefetch queue access (critical for proper PC changes!)
    uint16_t getIRC() {
        return Moira::getIRC();
    }

    void setIRC(uint16_t val) {
        Moira::setIRC(val);
    }

    uint16_t getIRD() {
        return Moira::getIRD();
    }

    void setIRD(uint16_t val) {
        Moira::setIRD(val);
    }

    // Refill prefetch queue after changing PC
    // CRITICAL FIX: Properly emulate M68K prefetch behavior
    void refillPrefetch() {
        // IRD = instruction at PC (will be executed next)
        u16 ird_val = read16(this->reg.pc);
        setIRD(ird_val);

        // IRC = instruction at PC+2 (will be executed after IRD)
        u16 irc_val = read16(this->reg.pc + 2);
        setIRC(irc_val);
    }

    // ========================================================================
    // MOIRA NATIVE DEBUGGER INTEGRATION
    // Using Moira's built-in debugger for breakpoints, watchpoints, logging
    // ========================================================================

    // ---------- Native Breakpoint Control (uses Moira's debugger.breakpoints) ----------
    void nativeSetBreakpoint(uint32_t addr) {
        debugger.breakpoints.setAt(addr);
    }
    void nativeRemoveBreakpoint(uint32_t addr) {
        debugger.breakpoints.removeAt(addr);
    }
    void nativeEnableBreakpoint(uint32_t addr) {
        debugger.breakpoints.enableAt(addr);
    }
    void nativeDisableBreakpoint(uint32_t addr) {
        debugger.breakpoints.disableAt(addr);
    }
    void nativeClearAllBreakpoints() {
        debugger.breakpoints.removeAll();
    }
    int nativeBreakpointCount() {
        return debugger.breakpoints.elements();
    }

    // ---------- Native Watchpoint Control (uses Moira's debugger.watchpoints) ----------
    void nativeSetWatchpoint(uint32_t addr) {
        debugger.watchpoints.setAt(addr);
    }
    void nativeRemoveWatchpoint(uint32_t addr) {
        debugger.watchpoints.removeAt(addr);
    }
    void nativeEnableWatchpoint(uint32_t addr) {
        debugger.watchpoints.enableAt(addr);
    }
    void nativeDisableWatchpoint(uint32_t addr) {
        debugger.watchpoints.disableAt(addr);
    }
    void nativeClearAllWatchpoints() {
        debugger.watchpoints.removeAll();
    }
    int nativeWatchpointCount() {
        return debugger.watchpoints.elements();
    }

    // ---------- Native Catchpoint Control (for exception catching) ----------
    void nativeSetCatchpoint(uint32_t vector) {
        debugger.catchpoints.setAt(vector);
    }
    void nativeRemoveCatchpoint(uint32_t vector) {
        debugger.catchpoints.removeAt(vector);
    }
    void nativeClearAllCatchpoints() {
        debugger.catchpoints.removeAll();
    }
    int nativeCatchpointCount() {
        return debugger.catchpoints.elements();
    }

    // ---------- Native Step Control ----------
    void nativeStepInto() {
        debugger.stepInto();
    }
    void nativeStepOver() {
        debugger.stepOver();
    }

    // ---------- Native Instruction Logging (256-entry circular buffer) ----------
    void nativeEnableLogging() {
        debugger.enableLogging();
    }
    void nativeDisableLogging() {
        debugger.disableLogging();
    }
    int nativeLoggedInstructions() {
        return debugger.loggedInstructions();
    }
    void nativeClearLog() {
        debugger.clearLog();
    }

    // Get logged register state (returns PC of logged instruction)
    uint32_t nativeGetLogEntryPC(int index) {
        if (index < 0 || index >= debugger.loggedInstructions()) return 0;
        return debugger.logEntryAbs(index).pc;
    }

    // ---------- Native Disassembler ----------
    std::string nativeDisassemble(uint32_t addr) {
        char buf[256];
        disassemble(buf, addr);
        return std::string(buf);
    }

    int nativeDisassembleSize(uint32_t addr) {
        char buf[256];
        return disassemble(buf, addr);
    }

    std::string nativeDisassembleSR() {
        char buf[64];
        disassembleSR(buf);
        return std::string(buf);
    }

    // ---------- Callback Overrides (notify JavaScript of debug events) ----------

    // Flag to track if we hit a native breakpoint/watchpoint/catchpoint
    bool nativeBreakpointHitFlag = false;
    uint32_t nativeBreakpointAddr = 0;
    bool nativeWatchpointHitFlag = false;
    uint32_t nativeWatchpointAddr = 0;
    bool nativeCatchpointHitFlag = false;
    uint8_t nativeCatchpointVector = 0;

    void didReachBreakpoint(u32 addr) override {
        nativeBreakpointHitFlag = true;
        nativeBreakpointAddr = addr;
        if (debugEnabled) {
            EM_ASM({
                console.log('[MOIRA DBG] Breakpoint hit at PC=0x' + $0.toString(16));
            }, addr);
        }
    }

    void didReachWatchpoint(u32 addr) override {
        nativeWatchpointHitFlag = true;
        nativeWatchpointAddr = addr;
        if (debugEnabled) {
            EM_ASM({
                console.log('[MOIRA DBG] Watchpoint hit at addr=0x' + $0.toString(16));
            }, addr);
        }
    }

    void didReachCatchpoint(u8 vector) override {
        nativeCatchpointHitFlag = true;
        nativeCatchpointVector = vector;
        if (debugEnabled) {
            EM_ASM({
                console.log('[MOIRA DBG] Catchpoint hit for vector ' + $0);
            }, vector);
        }
    }

    void didReachSoftstop(u32 addr) override {
        if (debugEnabled) {
            EM_ASM({
                console.log('[MOIRA DBG] Softstop (step) at PC=0x' + $0.toString(16));
            }, addr);
        }
    }

    void didJumpToVector(int nr, u32 addr) override {
        if (debugEnabled || debugExceptions) {
            // Map exception vector numbers to names for clarity
            const char* exceptionName = "Unknown";
            switch (nr) {
                case 2: exceptionName = "Bus Error"; break;
                case 3: exceptionName = "Address Error"; break;
                case 4: exceptionName = "Illegal Instruction"; break;
                case 5: exceptionName = "Divide by Zero"; break;
                case 6: exceptionName = "CHK Instruction"; break;
                case 7: exceptionName = "TRAPV Instruction"; break;
                case 8: exceptionName = "Privilege Violation"; break;
                case 9: exceptionName = "Trace"; break;
                case 10: exceptionName = "Line 1010 Emulator"; break;
                case 11: exceptionName = "Line 1111 Emulator"; break;
                default:
                    if (nr >= 32 && nr <= 47) exceptionName = "TRAP";
                    else if (nr >= 24 && nr <= 31) exceptionName = "Interrupt";
                    break;
            }

            EM_ASM({
                console.log('[MOIRA EXCEPTION] Vector ' + $0 + ' (' + UTF8ToString($1) + ') -> PC=0x' + $2.toString(16) +
                           ' [SR=0x' + $3.toString(16) + ', SP=0x' + $4.toString(16) + ']');
            }, nr, exceptionName, addr, getSR(), reg.a[7]);
        }

        // Log address errors specifically if that flag is enabled
        if (debugAddressErrors && nr == 3) {
            EM_ASM({
                console.log('[MOIRA ADDRESS ERROR] Odd address access detected! PC=0x' + $0.toString(16) + ', SP=0x' + $1.toString(16));
            }, addr, reg.a[7]);
        }
    }

    // Check and clear flags for JavaScript
    bool hasNativeBreakpointHit() { return nativeBreakpointHitFlag; }
    uint32_t getNativeBreakpointAddr() { return nativeBreakpointAddr; }
    void clearNativeBreakpointHit() { nativeBreakpointHitFlag = false; }

    bool hasNativeWatchpointHit() { return nativeWatchpointHitFlag; }
    uint32_t getNativeWatchpointAddr() { return nativeWatchpointAddr; }
    void clearNativeWatchpointHit() { nativeWatchpointHitFlag = false; }

    bool hasNativeCatchpointHit() { return nativeCatchpointHitFlag; }
    uint8_t getNativeCatchpointVector() { return nativeCatchpointVector; }
    void clearNativeCatchpointHit() { nativeCatchpointHitFlag = false; }

    // ---------- Instruction Info (for advanced debugging) ----------
    uint16_t getInstrInfo(uint16_t opcode) {
        InstrInfo info = Moira::getInstrInfo(opcode);
        // Pack instruction info into 16-bit value:
        // bits 0-7: Instr enum, bits 8-11: Mode enum, bits 12-15: Size enum
        return ((uint16_t)info.I & 0xFF) | (((uint16_t)info.M & 0xF) << 8) | (((uint16_t)info.S & 0xF) << 12);
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(moira_module) {
    class_<MoiraCPU>("MoiraCPU")
        .constructor<size_t>()
        .function("setMemoryByte", &MoiraCPU::setMemoryByte)
        .function("getMemoryByte", &MoiraCPU::getMemoryByte)
        .function("loadProgram", &MoiraCPU::loadProgram)
        .function("loadROM", &MoiraCPU::loadROM)
        .function("resetCPU", &MoiraCPU::resetCPU)
        .function("executeCycles", &MoiraCPU::executeCycles)
        .function("executeInstruction", &MoiraCPU::executeInstruction)
        .function("getRegister", &MoiraCPU::getRegister)
        .function("setRegister", &MoiraCPU::setRegister)
        .function("getCycles", &MoiraCPU::getCycles)
        .function("refillPrefetch", &MoiraCPU::refillPrefetch)
        // ========== Debug Control Functions (toggle at runtime without rebuild) ==========
        .function("setDebug", &MoiraCPU::setDebug)
        .function("setDebugInstructions", &MoiraCPU::setDebugInstructions)
        .function("setDebugRegisters", &MoiraCPU::setDebugRegisters)
        .function("setDebugPrefetch", &MoiraCPU::setDebugPrefetch)
        .function("setDebugMemory", &MoiraCPU::setDebugMemory)
        .function("setDebugLibraryCalls", &MoiraCPU::setDebugLibraryCalls)
        .function("setDebugStack", &MoiraCPU::setDebugStack)
        .function("setDebugBranches", &MoiraCPU::setDebugBranches)
        .function("setDebugAddressErrors", &MoiraCPU::setDebugAddressErrors)
        .function("setDebugExceptions", &MoiraCPU::setDebugExceptions)
        .function("setDebugWatchpoints", &MoiraCPU::setDebugWatchpoints)
        .function("setDebugMemoryAccess", &MoiraCPU::setDebugMemoryAccess)
        .function("getDebug", &MoiraCPU::getDebug)
        .function("getDebugInstructions", &MoiraCPU::getDebugInstructions)
        .function("getDebugAddressErrors", &MoiraCPU::getDebugAddressErrors)
        .function("getDebugExceptions", &MoiraCPU::getDebugExceptions)
        // ========== Breakpoint Control ==========
        .function("addBreakpoint", &MoiraCPU::addBreakpoint)
        .function("removeBreakpoint", &MoiraCPU::removeBreakpoint)
        .function("clearBreakpoints", &MoiraCPU::clearBreakpoints)
        .function("hasBreakpointHit", &MoiraCPU::hasBreakpointHit)
        .function("getLastBreakpoint", &MoiraCPU::getLastBreakpoint)
        .function("clearBreakpointHit", &MoiraCPU::clearBreakpointHit)
        // ========== Memory Watch Control ==========
        .function("addWatchAddress", &MoiraCPU::addWatchAddress)
        .function("clearWatchAddresses", &MoiraCPU::clearWatchAddresses)
        .function("setWatchRange", &MoiraCPU::setWatchRange)
        // ========== Instruction Counting ==========
        .function("setMaxInstructions", &MoiraCPU::setMaxInstructions)
        .function("getInstructionCount", &MoiraCPU::getInstructionCount)
        .function("resetInstructionCount", &MoiraCPU::resetInstructionCount)
        // ========== Debug Helpers ==========
        .function("getCurrentOpcode", &MoiraCPU::getCurrentOpcode)
        .function("dumpRegisters", &MoiraCPU::dumpRegisters)
        .function("dumpStack", &MoiraCPU::dumpStack)
        // ========== Execution Trace Buffer ==========
        .function("enableTrace", &MoiraCPU::enableTrace)
        .function("isTraceEnabled", &MoiraCPU::isTraceEnabled)
        .function("clearTrace", &MoiraCPU::clearTrace)
        .function("dumpTrace", &MoiraCPU::dumpTrace)
        .function("getTraceEntry", &MoiraCPU::getTraceEntry)
        // ========== Memory Corruption Detection ==========
        .function("enableMemoryProtection", &MoiraCPU::enableMemoryProtection)
        .function("disableMemoryProtection", &MoiraCPU::disableMemoryProtection)
        .function("isMemoryProtectionEnabled", &MoiraCPU::isMemoryProtectionEnabled)
        .function("hasCorruptionDetected", &MoiraCPU::hasCorruptionDetected)
        .function("getLastCorruptedAddress", &MoiraCPU::getLastCorruptedAddress)
        .function("clearCorruptionFlag", &MoiraCPU::clearCorruptionFlag)
        // ========== Stack Monitoring ==========
        .function("setStackBounds", &MoiraCPU::setStackBounds)
        .function("hasStackOverflow", &MoiraCPU::hasStackOverflow)
        .function("getMaxStackDepth", &MoiraCPU::getMaxStackDepth)
        .function("clearStackOverflow", &MoiraCPU::clearStackOverflow)
        // ========== Jump/Call Tracking ==========
        .function("enableCallTracking", &MoiraCPU::enableCallTracking)
        .function("isCallTrackingEnabled", &MoiraCPU::isCallTrackingEnabled)
        .function("getCallStackDepth", &MoiraCPU::getCallStackDepth)
        .function("getCallStackEntry", &MoiraCPU::getCallStackEntry)
        .function("getCallSite", &MoiraCPU::getCallSite)
        .function("dumpCallStack", &MoiraCPU::dumpCallStack)
        .function("clearCallStack", &MoiraCPU::clearCallStack)
        // ========== Wild Pointer Detection ==========
        .function("setValidMemoryRange", &MoiraCPU::setValidMemoryRange)
        .function("hasWildAccessDetected", &MoiraCPU::hasWildAccessDetected)
        .function("getLastWildAccess", &MoiraCPU::getLastWildAccess)
        .function("clearWildAccessFlag", &MoiraCPU::clearWildAccessFlag)
        // ========== Statistics ==========
        .function("getReadCount", &MoiraCPU::getReadCount)
        .function("getWriteCount", &MoiraCPU::getWriteCount)
        .function("getJsrCount", &MoiraCPU::getJsrCount)
        .function("getRtsCount", &MoiraCPU::getRtsCount)
        .function("getBranchCount", &MoiraCPU::getBranchCount)
        .function("getTrapCount", &MoiraCPU::getTrapCount)
        .function("resetStatistics", &MoiraCPU::resetStatistics)
        .function("dumpStatistics", &MoiraCPU::dumpStatistics)
        // ========== Overclocking ==========
        .function("setOverclocking", &MoiraCPU::setOverclocking)
        .function("getOverclocking", &MoiraCPU::getOverclocking)
        // ========== MOIRA NATIVE DEBUGGER ==========
        // Native Breakpoints (uses Moira's built-in debugger)
        .function("nativeSetBreakpoint", &MoiraCPU::nativeSetBreakpoint)
        .function("nativeRemoveBreakpoint", &MoiraCPU::nativeRemoveBreakpoint)
        .function("nativeEnableBreakpoint", &MoiraCPU::nativeEnableBreakpoint)
        .function("nativeDisableBreakpoint", &MoiraCPU::nativeDisableBreakpoint)
        .function("nativeClearAllBreakpoints", &MoiraCPU::nativeClearAllBreakpoints)
        .function("nativeBreakpointCount", &MoiraCPU::nativeBreakpointCount)
        // Native Watchpoints (memory access monitoring)
        .function("nativeSetWatchpoint", &MoiraCPU::nativeSetWatchpoint)
        .function("nativeRemoveWatchpoint", &MoiraCPU::nativeRemoveWatchpoint)
        .function("nativeEnableWatchpoint", &MoiraCPU::nativeEnableWatchpoint)
        .function("nativeDisableWatchpoint", &MoiraCPU::nativeDisableWatchpoint)
        .function("nativeClearAllWatchpoints", &MoiraCPU::nativeClearAllWatchpoints)
        .function("nativeWatchpointCount", &MoiraCPU::nativeWatchpointCount)
        // Native Catchpoints (exception catching)
        .function("nativeSetCatchpoint", &MoiraCPU::nativeSetCatchpoint)
        .function("nativeRemoveCatchpoint", &MoiraCPU::nativeRemoveCatchpoint)
        .function("nativeClearAllCatchpoints", &MoiraCPU::nativeClearAllCatchpoints)
        .function("nativeCatchpointCount", &MoiraCPU::nativeCatchpointCount)
        // Native Step Control
        .function("nativeStepInto", &MoiraCPU::nativeStepInto)
        .function("nativeStepOver", &MoiraCPU::nativeStepOver)
        // Native Instruction Logging (256-entry circular buffer)
        .function("nativeEnableLogging", &MoiraCPU::nativeEnableLogging)
        .function("nativeDisableLogging", &MoiraCPU::nativeDisableLogging)
        .function("nativeLoggedInstructions", &MoiraCPU::nativeLoggedInstructions)
        .function("nativeClearLog", &MoiraCPU::nativeClearLog)
        .function("nativeGetLogEntryPC", &MoiraCPU::nativeGetLogEntryPC)
        // Native Disassembler
        .function("nativeDisassemble", &MoiraCPU::nativeDisassemble)
        .function("nativeDisassembleSize", &MoiraCPU::nativeDisassembleSize)
        .function("nativeDisassembleSR", &MoiraCPU::nativeDisassembleSR)
        // Debug Event Flags (check after execution)
        .function("hasNativeBreakpointHit", &MoiraCPU::hasNativeBreakpointHit)
        .function("getNativeBreakpointAddr", &MoiraCPU::getNativeBreakpointAddr)
        .function("clearNativeBreakpointHit", &MoiraCPU::clearNativeBreakpointHit)
        .function("hasNativeWatchpointHit", &MoiraCPU::hasNativeWatchpointHit)
        .function("getNativeWatchpointAddr", &MoiraCPU::getNativeWatchpointAddr)
        .function("clearNativeWatchpointHit", &MoiraCPU::clearNativeWatchpointHit)
        .function("hasNativeCatchpointHit", &MoiraCPU::hasNativeCatchpointHit)
        .function("getNativeCatchpointVector", &MoiraCPU::getNativeCatchpointVector)
        .function("clearNativeCatchpointHit", &MoiraCPU::clearNativeCatchpointHit)
        // Instruction Info
        .function("getInstrInfo", &MoiraCPU::getInstrInfo)
        ;

    register_vector<uint8_t>("VectorUint8");
}
