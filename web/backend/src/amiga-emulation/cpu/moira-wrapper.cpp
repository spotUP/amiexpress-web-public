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
    // Memory layout (24-bit address space = 16MB)
    static const uint32_t MEMORY_SIZE = 16 * 1024 * 1024;  // 16MB
    std::vector<uint8_t> memory;

    // Memory region boundaries
    static const uint32_t ROM_START = 0xF80000;     // ROM at 0xF80000-0xFFFFFF (512KB)
    static const uint32_t ROM_END = 0xFFFFFF;
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

public:
    MoiraCPU(size_t memSize) : memory(MEMORY_SIZE, 0),
                                scanlineCounter(0), hposCounter(0),
                                ciaTimerA(0), ciaTimerB(0) {
        cpuModel = Model::M68000;
        EM_ASM({
            console.log('[MOIRA WASM] MoiraCPU initialized with DYNAMIC hardware emulation!');
        });
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
    // Following vAmiga's approach: just read from memory, no trap mechanism

    u8 read8(u32 addr) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // Handle memory-mapped I/O regions
        if (addr >= CIA_START && addr <= CIA_END) {
            return readCIA(addr);
        }
        if (addr >= CUSTOM_START && addr <= CUSTOM_END) {
            return readCustom(addr);
        }

        // Normal memory read
        return (addr < memory.size()) ? memory[addr] : 0;
    }

    u16 read16(u32 addr) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // Handle memory-mapped I/O regions
        if (addr >= CIA_START && addr <= CIA_END) {
            return readCIA16(addr);
        }
        if (addr >= CUSTOM_START && addr <= CUSTOM_END) {
            return readCustom16(addr);
        }

        // Normal memory read (big-endian)
        if (addr + 1 < memory.size()) {
            return (memory[addr] << 8) | memory[addr + 1];
        }

        return 0;
    }

    void write8(u32 addr, u8 val) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // Handle memory-mapped I/O regions
        if (addr >= CIA_START && addr <= CIA_END) {
            writeCustom(addr, val);
            return;
        }
        if (addr >= CUSTOM_START && addr <= CUSTOM_END) {
            writeCustom(addr, val);
            return;
        }

        // ROM is read-only, ignore writes
        if (addr >= ROM_START && addr <= ROM_END) {
            return;
        }

        // Normal memory write
        if (addr < memory.size()) {
            const_cast<MoiraCPU*>(this)->memory[addr] = val;
        }
    }

    void write16(u32 addr, u16 val) const override {
        // Mask to 24-bit address space
        addr &= 0xFFFFFF;

        // DEBUG: Log ALL writes at PC near 0x10ee with register state
        int pc = this->reg.pc;
        if (pc >= 0x10e0 && pc <= 0x1100) {
            int d0 = this->reg.d[0];
            int a4 = this->reg.a[4];
            int sp = this->reg.a[7];
            EM_ASM({
                console.log('[MOIRA write16] PC=0x' + $0.toString(16) + ': Writing 0x' + $1.toString(16).padStart(4, '0') + ' to address 0x' + $2.toString(16));
                console.log('[MOIRA write16]   D0=0x' + $3.toString(16) + ', A4=0x' + $4.toString(16) + ', SP=0x' + $5.toString(16));
            }, pc, val, addr, d0, a4, sp);
        }

        // Handle memory-mapped I/O regions
        if (addr >= CIA_START && addr <= CIA_END) {
            writeCustom16(addr, val);
            return;
        }
        if (addr >= CUSTOM_START && addr <= CUSTOM_END) {
            writeCustom16(addr, val);
            return;
        }

        // ROM is read-only, ignore writes
        if (addr >= ROM_START && addr <= ROM_END) {
            return;
        }

        // Normal memory write (big-endian)
        if (addr + 1 < memory.size()) {
            const_cast<MoiraCPU*>(this)->memory[addr] = (val >> 8) & 0xFF;
            const_cast<MoiraCPU*>(this)->memory[addr + 1] = val & 0xFF;
        }
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
    void setMemoryByte(uint32_t addr, uint8_t value) {
        addr &= 0xFFFFFF;
        if (addr < memory.size()) {
            memory[addr] = value;
        }
    }

    uint8_t getMemoryByte(uint32_t addr) {
        addr &= 0xFFFFFF;
        return (addr < memory.size()) ? memory[addr] : 0;
    }

    // Load ROM into memory (0xF80000-0xFFFFFF)
    void loadROM(const std::vector<uint8_t>& romData) {
        uint32_t romSize = romData.size();
        if (romSize > (ROM_END - ROM_START + 1)) {
            romSize = ROM_END - ROM_START + 1;
        }

        // Copy ROM to 0xF80000-0xFFFFFF
        memcpy(&memory[ROM_START], romData.data(), romSize);

        // Copy exception vectors (first 1KB) to 0x000000
        // ROM vectors are at start of ROM during boot
        uint32_t vectorSize = (romSize < 1024) ? romSize : 1024;
        memcpy(&memory[0], romData.data(), vectorSize);
    }

    // Load program into memory
    void loadProgram(const std::vector<uint8_t>& program, uint32_t address) {
        address &= 0xFFFFFF;
        for (size_t i = 0; i < program.size() && (address + i) < memory.size(); i++) {
            memory[address + i] = program[i];
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
    void refillPrefetch() {
        // Read instruction at current PC
        u16 opcode = read16(this->reg.pc);
        // Set both IRC and IRD to the new instruction
        setIRC(opcode);
        setIRD(opcode);
        EM_ASM({
            console.log('[MOIRA] Prefetch queue refilled at PC=0x' + $0.toString(16) + ', opcode=0x' + $1.toString(16).padStart(4, '0'));
        }, this->reg.pc, opcode);
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
        .function("getRegister", &MoiraCPU::getRegister)
        .function("setRegister", &MoiraCPU::setRegister)
        .function("getCycles", &MoiraCPU::getCycles)
        .function("refillPrefetch", &MoiraCPU::refillPrefetch)
        ;

    register_vector<uint8_t>("VectorUint8");
}
