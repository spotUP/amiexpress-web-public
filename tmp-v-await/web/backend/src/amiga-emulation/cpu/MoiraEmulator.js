"use strict";
// TypeScript interface for Moira WebAssembly module
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoiraEmulator = exports.CPURegister = void 0;
// CPU Register indices
var CPURegister;
(function (CPURegister) {
    CPURegister[CPURegister["D0"] = 0] = "D0";
    CPURegister[CPURegister["D1"] = 1] = "D1";
    CPURegister[CPURegister["D2"] = 2] = "D2";
    CPURegister[CPURegister["D3"] = 3] = "D3";
    CPURegister[CPURegister["D4"] = 4] = "D4";
    CPURegister[CPURegister["D5"] = 5] = "D5";
    CPURegister[CPURegister["D6"] = 6] = "D6";
    CPURegister[CPURegister["D7"] = 7] = "D7";
    CPURegister[CPURegister["A0"] = 8] = "A0";
    CPURegister[CPURegister["A1"] = 9] = "A1";
    CPURegister[CPURegister["A2"] = 10] = "A2";
    CPURegister[CPURegister["A3"] = 11] = "A3";
    CPURegister[CPURegister["A4"] = 12] = "A4";
    CPURegister[CPURegister["A5"] = 13] = "A5";
    CPURegister[CPURegister["A6"] = 14] = "A6";
    CPURegister[CPURegister["A7"] = 15] = "A7";
    CPURegister[CPURegister["PC"] = 16] = "PC";
    CPURegister[CPURegister["SR"] = 17] = "SR"; // Status Register
})(CPURegister || (exports.CPURegister = CPURegister = {}));
class MoiraEmulator {
    constructor(memorySize = 16 * 1024 * 1024) {
        this.memorySize = memorySize;
        this.module = null;
        this.cpu = null;
        // Wait() blocking state
        this.waitingForSignal = false;
        this.waitingForSignalMask = 0;
        // Prompt() pause/resume state
        this.paused = false;
        this.resumeCallback = null;
    } // 16MB for full 24-bit address space (Amiga standard)
    /**
     * Check if CPU is blocked in Wait() call
     */
    isWaitingForSignal() {
        return this.waitingForSignal;
    }
    /**
     * Get the signal mask the CPU is waiting for
     */
    getWaitingSignalMask() {
        return this.waitingForSignalMask;
    }
    /**
     * Set Wait() blocking state
     * When true, execution loop should pause
     */
    setWaitingForSignal(waiting, signalMask) {
        this.waitingForSignal = waiting;
        this.waitingForSignalMask = signalMask;
        if (waiting) {
            console.log(`[MoiraEmulator] CPU now BLOCKED in Wait(0x${signalMask.toString(16)})`);
        }
        else {
            console.log(`[MoiraEmulator] CPU RESUMED from Wait()`);
        }
    }
    /**
     * Check if emulator is paused waiting for async input
     */
    isPaused() {
        return this.paused;
    }
    /**
     * Pause emulator execution (for async input handling)
     * @param resumeCallback Called when resume() is invoked
     */
    pause(resumeCallback) {
        this.paused = true;
        this.resumeCallback = resumeCallback || null;
        console.log('[MoiraEmulator] Emulator PAUSED (waiting for async input)');
    }
    /**
     * Resume emulator execution after pause
     */
    resume() {
        console.log('[MoiraEmulator] Emulator RESUMING from pause');
        this.paused = false;
        if (this.resumeCallback) {
            const callback = this.resumeCallback;
            this.resumeCallback = null;
            callback();
        }
    }
    async initialize() {
        // Load the WASM module
        const createMoiraModule = require('./build/moira.js');
        this.module = await createMoiraModule();
        if (!this.module)
            throw new Error('Failed to load Moira module');
        this.cpu = new this.module.MoiraCPU(this.memorySize);
        // Don't reset yet - wait until ROM is loaded
    }
    loadROM(romData) {
        if (!this.cpu || !this.module)
            throw new Error('Emulator not initialized');
        // Convert Uint8Array to Emscripten vector
        const vec = new this.module.VectorUint8();
        for (let i = 0; i < romData.length; i++) {
            vec.push_back(romData[i]);
        }
        this.cpu.loadROM(vec);
        vec.delete();
        console.log(`[MoiraEmulator] ROM loaded (${romData.length} bytes)`);
        console.log(`[MoiraEmulator] ROM mapped to 0xF80000-0xFFFFFF`);
        console.log(`[MoiraEmulator] Exception vectors copied to 0x000000`);
    }
    loadProgram(binary, address = 0x1000) {
        if (!this.cpu || !this.module)
            throw new Error('Emulator not initialized');
        // Convert Uint8Array to Emscripten vector
        const vec = new this.module.VectorUint8();
        for (let i = 0; i < binary.length; i++) {
            vec.push_back(binary[i]);
        }
        this.cpu.loadProgram(vec, address);
        vec.delete(); // Clean up the temporary vector
    }
    execute(cycles = 1000) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // Log first 5 execute calls to debug
        if (!this.executeCallCount)
            this.executeCallCount = 0;
        this.executeCallCount++;
        if (this.executeCallCount <= 5) {
            const pc = this.cpu.getRegister(16);
            const sp = this.cpu.getRegister(15);
            console.log(`[MoiraEmulator] execute() call #${this.executeCallCount}: PC=0x${pc.toString(16)}, SP=0x${sp.toString(16)}, cycles=${cycles}`);
        }
        return this.cpu.executeCycles(cycles);
    }
    /**
     * Execute exactly ONE instruction (returns cycles consumed)
     * CRITICAL: This is the proper way to execute instructions at instruction boundaries.
     * It calls MOIRA's execute() with NO parameters, which executes exactly one complete
     * instruction regardless of how many CPU cycles it requires.
     *
     * This is the ROOT solution for:
     * - Ensuring multi-cycle instructions (DBRA, MOVEM, MULU, etc.) complete fully
     * - Allowing library trap checks between every instruction
     * - Preventing mid-batch JSR execution bugs
     */
    executeInstruction() {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // DEBUG: Verify method exists
        if (typeof this.cpu.executeInstruction !== 'function') {
            console.error('[MoiraEmulator] CRITICAL: executeInstruction() method not found on WASM CPU!');
            console.error('[MoiraEmulator] Available methods:', Object.keys(this.cpu));
            console.error('[MoiraEmulator] Falling back to execute(20)');
            return this.cpu.executeCycles(20);
        }
        return this.cpu.executeInstruction();
    }
    reset() {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        this.cpu.resetCPU();
    }
    getRegister(reg) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        const value = this.cpu.getRegister(reg);
        // CRITICAL: Mask PC to 24-bit address space (0x000000 - 0xFFFFFF)
        // Moira can return values outside this range during batch execution
        if (reg === CPURegister.PC) {
            return value & 0xFFFFFF;
        }
        return value;
    }
    setRegister(reg, value) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // DEBUG: Log D0 sets
        if (reg === 0 && value === 0x20000) {
            console.log(`[MoiraEmulator.ts] setRegister(D0, 0x${value.toString(16)}) called`);
        }
        this.cpu.setRegister(reg, value);
        if (reg === 0 && value === 0x20000) {
            const verify = this.cpu.getRegister(0);
            console.log(`[MoiraEmulator.ts] After setRegister, getRegister(D0) returns: 0x${verify.toString(16)}`);
        }
    }
    readMemory(address) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        return this.cpu.getMemoryByte(address);
    }
    writeMemory(address, value) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // ULTRATHINK: Detect writes to ROM region (0xF80000-0xFFFFFF)
        // ROM should be READ-ONLY! Any writes indicate a bug
        if (address >= 0xF80000 && address <= 0xFFFFFF) {
            console.error(`!!! ROM WRITE DETECTED !!!`);
            console.error(`  Address: 0x${address.toString(16)}`);
            console.error(`  Value: 0x${value.toString(16)}`);
            console.error(`  Stack trace:`);
            console.trace();
            // Allow write for now to see what happens, but log it
        }
        this.cpu.setMemoryByte(address, value);
    }
    getCycles() {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        return this.cpu.getCycles();
    }
    // Helper methods for 16-bit and 32-bit memory access
    readMemory16(address) {
        const high = this.readMemory(address);
        const low = this.readMemory(address + 1);
        return (high << 8) | low;
    }
    readMemory32(address) {
        const high = this.readMemory16(address);
        const low = this.readMemory16(address + 2);
        return ((high << 16) | low) >>> 0; // Unsigned 32-bit
    }
    writeMemory16(address, value) {
        this.writeMemory(address, (value >> 8) & 0xFF);
        this.writeMemory(address + 1, value & 0xFF);
    }
    writeMemory32(address, value) {
        this.writeMemory16(address, (value >> 16) & 0xFFFF);
        this.writeMemory16(address + 2, value & 0xFFFF);
    }
    /**
     * Read a null-terminated string from memory
     * @param address Starting address
     * @param maxLength Maximum length to read (default 256)
     * @returns The string read from memory
     */
    readString(address, maxLength = 256) {
        const bytes = [];
        for (let i = 0; i < maxLength; i++) {
            const byte = this.readMemory(address + i);
            if (byte === 0)
                break; // Null terminator
            bytes.push(byte);
        }
        return String.fromCharCode(...bytes);
    }
    /**
     * Write a null-terminated string to memory
     * @param address Starting address
     * @param str String to write
     */
    writeString(address, str) {
        for (let i = 0; i < str.length; i++) {
            this.writeMemory(address + i, str.charCodeAt(i));
        }
        this.writeMemory(address + str.length, 0); // Null terminator
    }
    /**
     * Refill the instruction prefetch queue
     * CRITICAL: Must be called after changing PC to ensure Moira executes the correct instruction!
     */
    refillPrefetch() {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // Call refillPrefetch on WASM CPU if available
        // TypeScript doesn't have type definitions for this C++ method
        if (typeof this.cpu.refillPrefetch === 'function') {
            this.cpu.refillPrefetch();
        }
    }
    /**
     * Set trap handler for library calls
     * Called when CPU executes JSR to negative addresses (library function calls)
     */
    setTrapHandler(handler) {
        console.log('[MoiraEmulator] Trap handler registered');
        // Stub: Trap handler integration would go here
        // This would intercept library function calls and route to appropriate handlers
    }
    cleanup() {
        if (this.cpu) {
            this.cpu.delete();
            this.cpu = null;
        }
    }
}
exports.MoiraEmulator = MoiraEmulator;
