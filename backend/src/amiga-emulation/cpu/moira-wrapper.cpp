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
    val jsTrapHandler;
    bool trapHandlerSet = false;

public:
    MoiraCPU(size_t memSize) : memory(memSize, 0), jsTrapHandler(val::undefined()) {
        cpuModel = Model::M68000;
    }

    // Implement pure virtual memory access methods
    u8 read8(u32 addr) const override {
        return (addr < memory.size()) ? memory[addr] : 0;
    }

    u16 read16(u32 addr) const override {
        // 68000 has 24-bit address bus, library addresses are in upper 24-bit space
        // Library addresses: 0x00FF0000 - 0x00FFFFFF (top 1MB of 24-bit address space)
        if (addr >= 0x00FF0000 && addr <= 0x00FFFFFF) {
            // Sign-extend to get the library offset
            // E.g., 0x00FFFFC4 -> 0xFFFFFFC4 -> -60
            i32 offset;
            if (addr >= 0x00FF8000) {
                // Upper half: sign-extend from 24-bit to 32-bit
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
        if (addr + 1 < memory.size()) {
            return (memory[addr] << 8) | memory[addr + 1];
        }

        // Out of bounds - return 0
        return 0;
    }

    void write8(u32 addr, u8 val) const override {
        if (addr < memory.size()) {
            const_cast<MoiraCPU*>(this)->memory[addr] = val;
        }
    }

    void write16(u32 addr, u16 val) const override {
        if (addr + 1 < memory.size()) {
            const_cast<MoiraCPU*>(this)->memory[addr] = (val >> 8) & 0xFF;
            const_cast<MoiraCPU*>(this)->memory[addr + 1] = val & 0xFF;
        }
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

    // Override willExecute - currently only called for STOP, TAS, BKPT
    void willExecute(const char *func, Instr I, Mode M, Size S, u16 opcode) override {
        // No-op for now - can be used for debugging if needed
    }

    // Set trap handler
    void setTrapHandler(val handler) {
        jsTrapHandler = handler;
        trapHandlerSet = true;
    }

    // Reset CPU
    void resetCPU() {
        reset();
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
        if (reg < 8) this->reg.d[reg] = value;
        else if (reg < 16) this->reg.a[reg - 8] = value;
        else if (reg == 16) this->reg.pc = value;
        else if (reg == 17) setSR(value);
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
        .function("setTrapHandler", &MoiraCPU::setTrapHandler)
        ;

    register_vector<uint8_t>("VectorUint8");
}
