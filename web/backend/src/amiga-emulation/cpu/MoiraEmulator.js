"use strict";
// TypeScript interface for Moira WebAssembly module
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
var MoiraEmulator = /** @class */ (function () {
    function MoiraEmulator(memorySize) {
        if (memorySize === void 0) { memorySize = 16 * 1024 * 1024; }
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
    MoiraEmulator.prototype.isWaitingForSignal = function () {
        return this.waitingForSignal;
    };
    /**
     * Get the signal mask the CPU is waiting for
     */
    MoiraEmulator.prototype.getWaitingSignalMask = function () {
        return this.waitingForSignalMask;
    };
    /**
     * Set Wait() blocking state
     * When true, execution loop should pause
     */
    MoiraEmulator.prototype.setWaitingForSignal = function (waiting, signalMask) {
        this.waitingForSignal = waiting;
        this.waitingForSignalMask = signalMask;
        if (waiting) {
            console.log("[MoiraEmulator] CPU now BLOCKED in Wait(0x".concat(signalMask.toString(16), ")"));
        }
        else {
            console.log("[MoiraEmulator] CPU RESUMED from Wait()");
        }
    };
    /**
     * Check if emulator is paused waiting for async input
     */
    MoiraEmulator.prototype.isPaused = function () {
        return this.paused;
    };
    /**
     * Pause emulator execution (for async input handling)
     * @param resumeCallback Called when resume() is invoked
     */
    MoiraEmulator.prototype.pause = function (resumeCallback) {
        this.paused = true;
        this.resumeCallback = resumeCallback || null;
        console.log('[MoiraEmulator] Emulator PAUSED (waiting for async input)');
    };
    /**
     * Resume emulator execution after pause
     */
    MoiraEmulator.prototype.resume = function () {
        console.log('[MoiraEmulator] Emulator RESUMING from pause');
        this.paused = false;
        if (this.resumeCallback) {
            var callback = this.resumeCallback;
            this.resumeCallback = null;
            callback();
        }
    };
    MoiraEmulator.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var createMoiraModule, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        createMoiraModule = require('./build/moira.js');
                        _a = this;
                        return [4 /*yield*/, createMoiraModule()];
                    case 1:
                        _a.module = _b.sent();
                        if (!this.module)
                            throw new Error('Failed to load Moira module');
                        this.cpu = new this.module.MoiraCPU(this.memorySize);
                        return [2 /*return*/];
                }
            });
        });
    };
    MoiraEmulator.prototype.loadROM = function (romData) {
        if (!this.cpu || !this.module)
            throw new Error('Emulator not initialized');
        // Convert Uint8Array to Emscripten vector
        var vec = new this.module.VectorUint8();
        for (var i = 0; i < romData.length; i++) {
            vec.push_back(romData[i]);
        }
        this.cpu.loadROM(vec);
        vec.delete();
        console.log("[MoiraEmulator] ROM loaded (".concat(romData.length, " bytes)"));
        console.log("[MoiraEmulator] ROM mapped to 0xF80000-0xFFFFFF");
        console.log("[MoiraEmulator] Exception vectors copied to 0x000000");
    };
    MoiraEmulator.prototype.loadProgram = function (binary, address) {
        if (address === void 0) { address = 0x1000; }
        if (!this.cpu || !this.module)
            throw new Error('Emulator not initialized');
        // Convert Uint8Array to Emscripten vector
        var vec = new this.module.VectorUint8();
        for (var i = 0; i < binary.length; i++) {
            vec.push_back(binary[i]);
        }
        this.cpu.loadProgram(vec, address);
        vec.delete(); // Clean up the temporary vector
    };
    MoiraEmulator.prototype.execute = function (cycles) {
        if (cycles === void 0) { cycles = 1000; }
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // Log first 5 execute calls to debug
        if (!this.executeCallCount)
            this.executeCallCount = 0;
        this.executeCallCount++;
        if (this.executeCallCount <= 5) {
            var pc = this.cpu.getRegister(16);
            var sp = this.cpu.getRegister(15);
            console.log("[MoiraEmulator] execute() call #".concat(this.executeCallCount, ": PC=0x").concat(pc.toString(16), ", SP=0x").concat(sp.toString(16), ", cycles=").concat(cycles));
        }
        return this.cpu.executeCycles(cycles);
    };
    MoiraEmulator.prototype.reset = function () {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        this.cpu.resetCPU();
    };
    MoiraEmulator.prototype.getRegister = function (reg) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        var value = this.cpu.getRegister(reg);
        // CRITICAL: Mask PC to 24-bit address space (0x000000 - 0xFFFFFF)
        // Moira can return values outside this range during batch execution
        if (reg === CPURegister.PC) {
            return value & 0xFFFFFF;
        }
        return value;
    };
    MoiraEmulator.prototype.setRegister = function (reg, value) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // DEBUG: Log D0 sets
        if (reg === 0 && value === 0x20000) {
            console.log("[MoiraEmulator.ts] setRegister(D0, 0x".concat(value.toString(16), ") called"));
        }
        this.cpu.setRegister(reg, value);
        if (reg === 0 && value === 0x20000) {
            var verify = this.cpu.getRegister(0);
            console.log("[MoiraEmulator.ts] After setRegister, getRegister(D0) returns: 0x".concat(verify.toString(16)));
        }
    };
    MoiraEmulator.prototype.readMemory = function (address) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        return this.cpu.getMemoryByte(address);
    };
    MoiraEmulator.prototype.writeMemory = function (address, value) {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // ULTRATHINK: Detect writes to ROM region (0xF80000-0xFFFFFF)
        // ROM should be READ-ONLY! Any writes indicate a bug
        if (address >= 0xF80000 && address <= 0xFFFFFF) {
            console.error("!!! ROM WRITE DETECTED !!!");
            console.error("  Address: 0x".concat(address.toString(16)));
            console.error("  Value: 0x".concat(value.toString(16)));
            console.error("  Stack trace:");
            console.trace();
            // Allow write for now to see what happens, but log it
        }
        this.cpu.setMemoryByte(address, value);
    };
    MoiraEmulator.prototype.getCycles = function () {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        return this.cpu.getCycles();
    };
    // Helper methods for 16-bit and 32-bit memory access
    MoiraEmulator.prototype.readMemory16 = function (address) {
        var high = this.readMemory(address);
        var low = this.readMemory(address + 1);
        return (high << 8) | low;
    };
    MoiraEmulator.prototype.readMemory32 = function (address) {
        var high = this.readMemory16(address);
        var low = this.readMemory16(address + 2);
        return ((high << 16) | low) >>> 0; // Unsigned 32-bit
    };
    MoiraEmulator.prototype.writeMemory16 = function (address, value) {
        this.writeMemory(address, (value >> 8) & 0xFF);
        this.writeMemory(address + 1, value & 0xFF);
    };
    MoiraEmulator.prototype.writeMemory32 = function (address, value) {
        this.writeMemory16(address, (value >> 16) & 0xFFFF);
        this.writeMemory16(address + 2, value & 0xFFFF);
    };
    /**
     * Read a null-terminated string from memory
     * @param address Starting address
     * @param maxLength Maximum length to read (default 256)
     * @returns The string read from memory
     */
    MoiraEmulator.prototype.readString = function (address, maxLength) {
        if (maxLength === void 0) { maxLength = 256; }
        var bytes = [];
        for (var i = 0; i < maxLength; i++) {
            var byte = this.readMemory(address + i);
            if (byte === 0)
                break; // Null terminator
            bytes.push(byte);
        }
        return String.fromCharCode.apply(String, bytes);
    };
    /**
     * Write a null-terminated string to memory
     * @param address Starting address
     * @param str String to write
     */
    MoiraEmulator.prototype.writeString = function (address, str) {
        for (var i = 0; i < str.length; i++) {
            this.writeMemory(address + i, str.charCodeAt(i));
        }
        this.writeMemory(address + str.length, 0); // Null terminator
    };
    /**
     * Refill the instruction prefetch queue
     * CRITICAL: Must be called after changing PC to ensure Moira executes the correct instruction!
     */
    MoiraEmulator.prototype.refillPrefetch = function () {
        if (!this.cpu)
            throw new Error('Emulator not initialized');
        // Call refillPrefetch on WASM CPU if available
        // TypeScript doesn't have type definitions for this C++ method
        if (typeof this.cpu.refillPrefetch === 'function') {
            this.cpu.refillPrefetch();
        }
    };
    /**
     * Set trap handler for library calls
     * Called when CPU executes JSR to negative addresses (library function calls)
     */
    MoiraEmulator.prototype.setTrapHandler = function (handler) {
        console.log('[MoiraEmulator] Trap handler registered');
        // Stub: Trap handler integration would go here
        // This would intercept library function calls and route to appropriate handlers
    };
    MoiraEmulator.prototype.cleanup = function () {
        if (this.cpu) {
            this.cpu.delete();
            this.cpu = null;
        }
    };
    return MoiraEmulator;
}());
exports.MoiraEmulator = MoiraEmulator;
