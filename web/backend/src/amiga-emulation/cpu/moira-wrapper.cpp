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
            console.log('[MOIRA WASM]   ROM pages: 0xF8-0xFF');
        }, chipRam.empty() ? 0 : ((chipRam.size() + 0xFFFF) / 0x10000) - 1);
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
        cpuModel = Model::M68000;

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
        return (int)(getClock() - startClock);
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
        // DEBUG: Log when D0 is being set
        if (reg == 0) {
            EM_ASM({
                console.log('[MOIRA setRegister] Setting D0 to 0x' + $0.toString(16));
            }, value);
        }

        if (reg < 8) this->reg.d[reg] = value;
        else if (reg < 16) this->reg.a[reg - 8] = value;
        else if (reg == 16) {
            // When setting PC, also sync pc0 to maintain Moira's invariant
            this->reg.pc = value;
            this->reg.pc0 = value;
        }
        else if (reg == 17) setSR(value);

        // DEBUG: Verify D0 was actually set
        if (reg == 0) {
            uint32_t verify = this->reg.d[0];
            EM_ASM({
                console.log('[MOIRA setRegister] Verified D0 is now: 0x' + $0.toString(16));
            }, verify);
        }
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

        EM_ASM({
            console.log('[MOIRA] Prefetch queue refilled at PC=0x' + $0.toString(16));
            console.log('  IRD (current) = 0x' + $1.toString(16).padStart(4, '0'));
            console.log('  IRC (next) = 0x' + $2.toString(16).padStart(4, '0'));
        }, this->reg.pc, ird_val, irc_val);
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
        ;

    register_vector<uint8_t>("VectorUint8");
}
