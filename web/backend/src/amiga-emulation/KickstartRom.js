"use strict";
/**
 * Kickstart ROM Loader
 * Loads and maps Amiga Kickstart ROM into emulated memory
 *
 * Reference: vAmiga Memory.cpp ROM loading
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KickstartRom = void 0;
var fs = require("fs");
var path = require("path");
var KickstartRom = /** @class */ (function () {
    function KickstartRom() {
        this.romData = null;
        this.romSize = 0;
        // Amiga ROM is mapped to 0xF80000 - 0xFFFFFF (512KB)
        this.ROM_START = 0xF80000;
        this.ROM_END = 0xFFFFFF;
        this.ROM_SIZE = 512 * 1024; // 512KB
        this.loadRom();
    }
    /**
     * Load Kickstart 3.1 ROM from disk
     */
    KickstartRom.prototype.loadRom = function () {
        // Try multiple paths for ROM (supports running from different directories)
        var romFilename = 'Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom';
        var possiblePaths = [
            path.join(process.cwd(), 'data/amiga-roms', romFilename), // From web/backend/
            path.join(process.cwd(), 'web/backend/data/amiga-roms', romFilename), // From project root
            path.join(__dirname, '../../data/amiga-roms', romFilename), // Relative to source
        ];
        var romPath = null;
        for (var _i = 0, possiblePaths_1 = possiblePaths; _i < possiblePaths_1.length; _i++) {
            var testPath = possiblePaths_1[_i];
            if (fs.existsSync(testPath)) {
                romPath = testPath;
                break;
            }
        }
        if (!romPath) {
            console.error('[ROM] Tried paths:');
            possiblePaths.forEach(function (p) { return console.error("  - ".concat(p)); });
            throw new Error("Kickstart ROM not found in any known location");
        }
        console.log("[ROM] Loading Kickstart ROM from: ".concat(romPath));
        // Read ROM file
        var romBuffer = fs.readFileSync(romPath);
        this.romSize = romBuffer.length;
        console.log("[ROM] Loaded ".concat(this.romSize, " bytes (").concat(this.romSize / 1024, "KB)"));
        if (this.romSize !== this.ROM_SIZE) {
            console.warn("[ROM] Warning: ROM size ".concat(this.romSize, " doesn't match expected ").concat(this.ROM_SIZE));
        }
        // Convert to Uint8Array for easy access
        this.romData = new Uint8Array(romBuffer);
        console.log("[ROM] Kickstart 3.1 loaded successfully");
        console.log("[ROM] Mapped to memory range: 0x".concat(this.ROM_START.toString(16).toUpperCase(), " - 0x").concat(this.ROM_END.toString(16).toUpperCase()));
    };
    /**
     * Check if address is in ROM range
     */
    KickstartRom.prototype.isRomAddress = function (address) {
        return address >= this.ROM_START && address <= this.ROM_END;
    };
    /**
     * Read byte from ROM
     */
    KickstartRom.prototype.readByte = function (address) {
        if (!this.romData) {
            throw new Error('ROM not loaded');
        }
        if (!this.isRomAddress(address)) {
            throw new Error("Address 0x".concat(address.toString(16), " is not in ROM range"));
        }
        var offset = address - this.ROM_START;
        if (offset >= this.romSize) {
            // Address beyond ROM size, return 0 (mirroring behavior)
            return 0;
        }
        return this.romData[offset];
    };
    /**
     * Read word (16-bit) from ROM in big-endian format
     */
    KickstartRom.prototype.readWord = function (address) {
        var high = this.readByte(address);
        var low = this.readByte(address + 1);
        return (high << 8) | low;
    };
    /**
     * Read long (32-bit) from ROM in big-endian format
     */
    KickstartRom.prototype.readLong = function (address) {
        var high = this.readWord(address);
        var low = this.readWord(address + 2);
        return (high << 16) | low;
    };
    /**
     * Get exception vector from ROM
     * Exception vectors are at the start of ROM (0x000000-0x0003FF)
     * But they're actually stored in ROM and copied to low memory on boot
     */
    KickstartRom.prototype.getExceptionVector = function (vectorNumber) {
        if (vectorNumber < 0 || vectorNumber > 255) {
            throw new Error("Invalid exception vector number: ".concat(vectorNumber));
        }
        // Each vector is 4 bytes (long word)
        var vectorAddress = vectorNumber * 4;
        // Read from start of ROM (these get copied to low memory on real Amiga)
        return this.readLong(this.ROM_START + vectorAddress);
    };
    /**
     * Get initial stack pointer from ROM
     */
    KickstartRom.prototype.getInitialSSP = function () {
        // First long in ROM is initial stack pointer
        return this.readLong(this.ROM_START);
    };
    /**
     * Get initial program counter from ROM
     */
    KickstartRom.prototype.getInitialPC = function () {
        // Second long in ROM is initial program counter
        return this.readLong(this.ROM_START + 4);
    };
    /**
     * Dump ROM info for debugging
     */
    KickstartRom.prototype.dumpInfo = function () {
        if (!this.romData) {
            console.log('[ROM] No ROM loaded');
            return;
        }
        console.log('[ROM] ===== Kickstart ROM Info =====');
        console.log("[ROM] Size: ".concat(this.romSize, " bytes (").concat(this.romSize / 1024, "KB)"));
        console.log("[ROM] Mapped: 0x".concat(this.ROM_START.toString(16), " - 0x").concat(this.ROM_END.toString(16)));
        console.log("[ROM] Initial SSP: 0x".concat(this.getInitialSSP().toString(16).padStart(8, '0')));
        console.log("[ROM] Initial PC:  0x".concat(this.getInitialPC().toString(16).padStart(8, '0')));
        // Show first few exception vectors
        console.log('[ROM] Exception Vectors:');
        for (var i = 0; i < 8; i++) {
            var vector = this.getExceptionVector(i);
            var vectorNames = [
                'Initial SSP',
                'Initial PC',
                'Bus Error',
                'Address Error',
                'Illegal Instruction',
                'Division by Zero',
                'CHK Instruction',
                'TRAPV Instruction'
            ];
            console.log("[ROM]   Vector ".concat(i, " (").concat(vectorNames[i], "): 0x").concat(vector.toString(16).padStart(8, '0')));
        }
        // Show ROM version string (typically at 0xFC0000 + 12)
        var versionOffset = 12;
        var versionBytes = [];
        for (var i = 0; i < 32; i++) {
            var byte = this.readByte(this.ROM_START + versionOffset + i);
            if (byte === 0)
                break;
            versionBytes.push(byte);
        }
        var versionString = String.fromCharCode.apply(String, versionBytes);
        console.log("[ROM] Version: ".concat(versionString));
        console.log('[ROM] ================================');
    };
    /**
     * Get ROM data for direct memory mapping
     */
    KickstartRom.prototype.getRomData = function () {
        if (!this.romData) {
            throw new Error('ROM not loaded');
        }
        return this.romData;
    };
    /**
     * Get ROM size
     */
    KickstartRom.prototype.getSize = function () {
        return this.romSize;
    };
    return KickstartRom;
}());
exports.KickstartRom = KickstartRom;
