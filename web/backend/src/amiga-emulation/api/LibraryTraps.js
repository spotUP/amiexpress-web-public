"use strict";
/**
 * Library Call Trapping for Amiga Door Execution
 *
 * Amiga libraries use JSR to negative offsets from the library base.
 * Example: JSR -30(A6) calls OpenLibrary
 *
 * We intercept these calls by placing ILLEGAL instructions at the
 * vector addresses, which trigger exceptions that we can handle.
 *
 * This allows doors to call library functions without needing the
 * actual library code in memory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryTraps = void 0;
/**
 * AEDoor.library function vectors
 * Reference: AEDOOR_FUNCTION_OFFSETS.md & CRITICAL_AEDOOR_DISCOVERY.md
 * LVO = Library Vector Offset (in bytes from library base)
 */
var AEDOOR_VECTORS = [
    {
        offset: -30, // LVO -30 (0xFFE2)
        name: 'CreateComm',
        handler: function (emu, lib) {
            return lib.createComm();
        }
    },
    {
        offset: -36, // LVO -36 (0xFFDC)
        name: 'DeleteComm',
        handler: function (emu, lib) {
            lib.deleteComm();
            return 0;
        }
    },
    {
        offset: -42, // LVO -42 (0xFFD6)
        name: 'SendCmd',
        handler: function (emu, lib) {
            return lib.sendCmd();
        }
    },
    {
        offset: -48, // LVO -48 (0xFFD0)
        name: 'SendStrCmd',
        handler: function (emu, lib) {
            return lib.sendStrCmd();
        }
    },
    {
        offset: -54, // LVO -54 (0xFFCA)
        name: 'SendDataCmd',
        handler: function (emu, lib) {
            return lib.sendDataCmd();
        }
    },
    {
        offset: -60, // LVO -60 (0xFFC4)
        name: 'SendStrDataCmd',
        handler: function (emu, lib) {
            return lib.sendStrDataCmd();
        }
    },
    {
        offset: -66, // LVO -66 (0xFFBE)
        name: 'GetData',
        handler: function (emu, lib) {
            return lib.getData();
        }
    },
    {
        offset: -72, // LVO -72 (0xFFB8)
        name: 'GetString',
        handler: function (emu, lib) {
            return lib.getString();
        }
    },
    {
        offset: -78, // LVO -78 (0xFFB2)
        name: 'Prompt',
        handler: function (emu, lib) {
            return lib.prompt();
        }
    },
    {
        offset: -84, // LVO -84 (0xFFAC)
        name: 'WriteStr',
        handler: function (emu, lib) {
            return lib.writeStr();
        }
    },
    {
        offset: -90, // LVO -90 (0xFFA6)
        name: 'ShowGFile',
        handler: function (emu, lib) {
            return lib.showGFile();
        }
    },
    {
        offset: -96, // LVO -96 (0xFFA0)
        name: 'ShowFile',
        handler: function (emu, lib) {
            return lib.showFile();
        }
    },
    {
        offset: -102, // LVO -102 (0xFF9A)
        name: 'SetDT',
        handler: function (emu, lib) {
            return lib.setDT();
        }
    },
    {
        offset: -108, // LVO -108 (0xFF94)
        name: 'GetDT',
        handler: function (emu, lib) {
            return lib.getDT();
        }
    },
    {
        offset: -114, // LVO -114 (0xFF8E)
        name: 'GetStr',
        handler: function (emu, lib) {
            return lib.getStr();
        }
    },
    {
        offset: -120, // LVO -120 (0xFF88)
        name: 'CopyStr',
        handler: function (emu, lib) {
            return lib.copyStr();
        }
    },
    {
        offset: -126, // LVO -126 (0xFF82)
        name: 'HotKey',
        handler: function (emu, lib) {
            return lib.hotKey();
        }
    },
    {
        offset: -132, // LVO -132 (0xFF7C)
        name: 'PreCreateComm',
        handler: function (emu, lib) {
            return lib.preCreateComm();
        }
    },
    {
        offset: -138, // LVO -138 (0xFF76)
        name: 'PostDeleteComm',
        handler: function (emu, lib) {
            return lib.postDeleteComm();
        }
    },
];
/**
 * DOS.library function vectors
 * Reference: AROS dos.library & AmigaOS LVO tables
 * LVO = Library Vector Offset (in bytes from library base)
 */
var DOS_VECTORS = [
    {
        offset: -30,
        name: 'Open',
        handler: function (emu, lib) {
            return lib.Open();
        }
    },
    {
        offset: -36,
        name: 'Close',
        handler: function (emu, lib) {
            return lib.Close();
        }
    },
    {
        offset: -42,
        name: 'Read',
        handler: function (emu, lib) {
            return lib.Read();
        }
    },
    {
        offset: -48,
        name: 'Write',
        handler: function (emu, lib) {
            return lib.Write();
        }
    },
    {
        offset: -54,
        name: 'Input',
        handler: function (emu, lib) {
            return lib.Input();
        }
    },
    {
        offset: -60,
        name: 'Output',
        handler: function (emu, lib) {
            return lib.Output();
        }
    },
    {
        offset: -66,
        name: 'Seek',
        handler: function (emu, lib) {
            return lib.Seek();
        }
    },
    {
        offset: -132,
        name: 'IoErr',
        handler: function (emu, lib) {
            return lib.IoErr();
        }
    },
    {
        offset: -192,
        name: 'DateStamp',
        handler: function (emu, lib) {
            return lib.DateStamp();
        }
    },
    {
        offset: -198,
        name: 'Delay',
        handler: function (emu, lib) {
            lib.Delay();
            return 0;
        }
    },
    {
        offset: -204,
        name: 'WaitForChar',
        handler: function (emu, lib) {
            return lib.WaitForChar();
        }
    },
    {
        offset: -144,
        name: 'Exit',
        handler: function (emu, lib) {
            lib.Exit();
            return 0; // Exit doesn't return in the normal sense
        }
    },
];
/**
 * Exec.library function vectors
 * Reference: Amiga ROM Kernel Reference Manual & exec.library FD file
 * LVO = Library Vector Offset (in bytes from library base)
 */
var EXEC_VECTORS = [
    {
        offset: -552, // LVO -552 (0xFDD8)
        name: 'OpenLibrary',
        handler: function (emu, lib) {
            var nameAddr = emu.getRegister(9); // A1
            var version = emu.getRegister(0); // D0
            return lib.openLibrary(nameAddr, version);
        }
    },
    {
        offset: -414, // LVO -414 (0xFE62)
        name: 'CloseLibrary',
        handler: function (emu, lib) {
            var libAddr = emu.getRegister(9); // A1
            lib.closeLibrary(libAddr);
            return 0; // No return value
        }
    },
    {
        offset: -132, // LVO -132 (0xFF7C)
        name: 'Forbid',
        handler: function (emu, lib) {
            console.log('[ExecLibrary] Forbid() - stub (no-op)');
            return 0;
        }
    },
    {
        offset: -138, // LVO -138 (0xFF76)
        name: 'Permit',
        handler: function (emu, lib) {
            console.log('[ExecLibrary] Permit() - stub (no-op)');
            return 0;
        }
    },
    {
        offset: -198, // LVO -198 (0xFF3A)
        name: 'AllocMem',
        handler: function (emu, lib) {
            var size = emu.getRegister(0); // D0
            var flags = emu.getRegister(1); // D1
            return lib.allocMem(size, flags);
        }
    },
    {
        offset: -210, // LVO -210 (0xFF2E)
        name: 'FreeMem',
        handler: function (emu, lib) {
            var memAddr = emu.getRegister(9); // A1
            var size = emu.getRegister(0); // D0
            lib.freeMem(memAddr, size);
            return 0;
        }
    },
    {
        offset: -294, // LVO -294 (0xFED6)
        name: 'FindTask',
        handler: function (emu, lib) {
            var nameAddr = emu.getRegister(9); // A1
            return lib.findTask(nameAddr);
        }
    },
    {
        offset: -306, // LVO -306 (0xFECE)
        name: 'SetTaskPri',
        handler: function (emu, lib) {
            var taskAddr = emu.getRegister(9); // A1
            var newPri = emu.getRegister(0); // D0
            return lib.setTaskPri(taskAddr, newPri);
        }
    },
    {
        offset: -390, // LVO -390 (0xFFFFFE7A)
        name: 'FindPort',
        handler: function (emu, lib) {
            var nameAddr = emu.getRegister(9); // A1
            return lib.findPort(nameAddr);
        }
    },
    {
        offset: -366, // LVO -366 (0xFFFFFE72)
        name: 'PutMsg',
        handler: function (emu, lib) {
            var portAddr = emu.getRegister(8); // A0
            var msgAddr = emu.getRegister(9); // A1
            lib.putMsg(portAddr, msgAddr);
            return 0;
        }
    },
    {
        offset: -372, // LVO -372 (0xFFFFFE6C)
        name: 'GetMsg',
        handler: function (emu, lib) {
            var portAddr = emu.getRegister(8); // A0
            return lib.getMsg(portAddr);
        }
    },
    {
        offset: -318, // LVO -318 (0xFFFFFEC2)
        name: 'Wait',
        handler: function (emu, lib) {
            var signalMask = emu.getRegister(0); // D0
            return lib.wait(signalMask);
        }
    },
    {
        offset: -324, // LVO -324 (0xFFFFFEBC)
        name: 'Signal',
        handler: function (emu, lib) {
            var taskAddr = emu.getRegister(9); // A1
            var signals = emu.getRegister(0); // D0
            lib.signal(taskAddr, signals);
            return 0;
        }
    },
    {
        offset: -30, // LVO -30 (0xFFFFFFE2)
        name: 'Supervisor',
        handler: function (emu, lib, returnAddr) {
            // Supervisor() - Execute a function in supervisor mode
            // Input: A5 = function pointer to execute
            // The function is called with return address on stack
            // Returns: D0 = result from supervisor function
            var a5 = emu.getRegister(13); // A5 - supervisor function pointer
            console.log("[LibraryTraps] Supervisor: calling function at 0x".concat(a5.toString(16), ", returnAddr=0x").concat(returnAddr.toString(16)));
            // Set PC to the supervisor function address
            // The function will execute and eventually RTS back to returnAddr
            emu.setRegister(16, a5); // PC = supervisor function
            // CRITICAL: Do NOT push return address - it's already on stack from JSR to Supervisor
            // The supervisor function will RTS to returnAddr (which handleTrap already popped)
            // So we need to push returnAddr back for the supervisor function to RTS to
            var sp = emu.getRegister(15);
            emu.writeMemory32(sp - 4, returnAddr);
            emu.setRegister(15, sp - 4);
            console.log("[LibraryTraps] Supervisor: PC set to 0x".concat(a5.toString(16), ", return will go to 0x").concat(returnAddr.toString(16)));
            // Return 0 - actual return value will come from supervisor function via D0
            return 0;
        }
    },
    {
        offset: -330, // LVO -330 (0xFFFFFEB6)
        name: 'AllocSignal',
        handler: function (emu, lib) {
            var signalNum = emu.getRegister(0); // D0 (signed byte, -1 = any free signal)
            var result = lib.AllocSignal(signalNum);
            return result; // Return signal number or -1 in D0
        }
    },
    {
        offset: -354, // LVO -354 (0xFFFFFE9E)
        name: 'AddPort',
        handler: function (emu, lib) {
            var portAddr = emu.getRegister(9); // A1 - port pointer
            lib.addPort(portAddr);
            return 0; // AddPort has no return value
        }
    },
    {
        offset: -378, // LVO -378 (0xFFFFFE86)
        name: 'ReplyMsg',
        handler: function (emu, lib) {
            var msgAddr = emu.getRegister(9); // A1
            lib.replyMsg(msgAddr);
            return 0;
        }
    },
    {
        offset: -384, // LVO -384 (0xFFFFFE80)
        name: 'WaitPort',
        handler: function (emu, lib) {
            var portAddr = emu.getRegister(8); // A0
            return lib.waitPort(portAddr);
        }
    },
    {
        offset: -666, // LVO -666 (0xFFFFFD66)
        name: 'CreateMsgPort',
        handler: function (emu, lib) {
            return lib.createMsgPort();
        }
    },
    {
        offset: -672, // LVO -672 (0xFFFFFD60)
        name: 'DeleteMsgPort',
        handler: function (emu, lib) {
            var portAddr = emu.getRegister(8); // A0
            lib.deleteMsgPort(portAddr);
            return 0;
        }
    },
    {
        offset: -732, // LVO -732 (0xFFFFFD28)
        name: 'StackSwap',
        handler: function (emu, lib) {
            var structAddr = emu.getRegister(8); // A0
            lib.stackSwap(structAddr);
            return 0;
        }
    },
];
/**
 * Library trap handler
 *
 * Manages interception of library calls via ILLEGAL instructions
 * placed at library vector addresses.
 */
var LibraryTraps = /** @class */ (function () {
    function LibraryTraps(emulator, execLibrary) {
        this.aedoorLibrary = null;
        this.dosLibrary = null;
        // Map of trap address -> vector entry
        this.trapMap = new Map();
        // Map of trap address -> library instance
        this.libraryMap = new Map();
        // NEW: Map of offset -> array of vector entries (for offset-based trap detection)
        // Multiple libraries can use the same offset (e.g., -30 for Supervisor in Exec, Open in DOS)
        this.offsetMap = new Map();
        // NEW: Map of offset -> array of library instances (parallel to offsetMap)
        this.offsetLibraryMap = new Map();
        this.emulator = emulator;
        this.execLibrary = execLibrary;
    }
    /**
     * Set callback for monitoring library calls
     */
    LibraryTraps.prototype.setLibraryCallMonitor = function (callback) {
        this.onLibraryCall = callback;
    };
    /**
     * Set the AEDoor.library instance
     */
    LibraryTraps.prototype.setAEDoorLibrary = function (lib) {
        this.aedoorLibrary = lib;
    };
    /**
     * Set the DOS.library instance
     */
    LibraryTraps.prototype.setDOSLibrary = function (lib) {
        this.dosLibrary = lib;
    };
    /**
     * Install trap vectors for a library
     *
     * Builds a map of vector addresses to handlers.
     * No memory modification needed - we intercept at execution time.
     */
    LibraryTraps.prototype.installExecVectors = function () {
        var execBase = this.execLibrary.getExecBaseAddress();
        console.log("[LibraryTraps] Installing Exec.library vectors at base 0x".concat(execBase.toString(16)));
        for (var _i = 0, EXEC_VECTORS_1 = EXEC_VECTORS; _i < EXEC_VECTORS_1.length; _i++) {
            var vector = EXEC_VECTORS_1[_i];
            var trapAddr = execBase + vector.offset;
            // Store mapping of address to handler
            this.trapMap.set(trapAddr, vector);
            this.libraryMap.set(trapAddr, this.execLibrary);
            // NEW: Also store mapping by offset (array-based to handle collisions)
            if (!this.offsetMap.has(vector.offset)) {
                this.offsetMap.set(vector.offset, []);
                this.offsetLibraryMap.set(vector.offset, []);
            }
            this.offsetMap.get(vector.offset).push(vector);
            this.offsetLibraryMap.get(vector.offset).push(this.execLibrary);
            console.log("  [".concat(vector.name, "] Vector at 0x").concat(trapAddr.toString(16), " (offset ").concat(vector.offset, ")"));
        }
        console.log("[LibraryTraps] Installed ".concat(EXEC_VECTORS.length, " Exec.library vectors"));
    };
    /**
     * Install DOS.library vectors
     */
    LibraryTraps.prototype.installDOSVectors = function () {
        if (!this.dosLibrary) {
            console.error('[LibraryTraps] Cannot install DOS vectors: library not set');
            return;
        }
        var dosBase = this.execLibrary.getLibraryBase('dos.library');
        if (dosBase === 0) {
            console.error('[LibraryTraps] Cannot install DOS vectors: library not opened');
            return;
        }
        console.log("[LibraryTraps] Installing dos.library vectors at base 0x".concat(dosBase.toString(16)));
        for (var _i = 0, DOS_VECTORS_1 = DOS_VECTORS; _i < DOS_VECTORS_1.length; _i++) {
            var vector = DOS_VECTORS_1[_i];
            var trapAddr = dosBase + vector.offset;
            // Store mapping of address to handler
            this.trapMap.set(trapAddr, vector);
            this.libraryMap.set(trapAddr, this.dosLibrary);
            // NEW: Also store mapping by offset (array-based to handle collisions)
            if (!this.offsetMap.has(vector.offset)) {
                this.offsetMap.set(vector.offset, []);
                this.offsetLibraryMap.set(vector.offset, []);
            }
            this.offsetMap.get(vector.offset).push(vector);
            this.offsetLibraryMap.get(vector.offset).push(this.dosLibrary);
            console.log("  [".concat(vector.name, "] Vector at 0x").concat(trapAddr.toString(16), " (offset ").concat(vector.offset, ")"));
        }
        console.log("[LibraryTraps] Installed ".concat(DOS_VECTORS.length, " dos.library vectors"));
    };
    /**
     * Install AEDoor.library vectors
     */
    LibraryTraps.prototype.installAEDoorVectors = function () {
        if (!this.aedoorLibrary) {
            console.error('[LibraryTraps] Cannot install AEDoor vectors: library not set');
            return;
        }
        var aedoorBase = this.execLibrary.getLibraryBase('AEDoor.library');
        if (aedoorBase === 0) {
            console.error('[LibraryTraps] Cannot install AEDoor vectors: library not opened');
            return;
        }
        console.log("[LibraryTraps] Installing AEDoor.library vectors at base 0x".concat(aedoorBase.toString(16)));
        for (var _i = 0, AEDOOR_VECTORS_1 = AEDOOR_VECTORS; _i < AEDOOR_VECTORS_1.length; _i++) {
            var vector = AEDOOR_VECTORS_1[_i];
            var trapAddr = aedoorBase + vector.offset;
            // Store mapping of address to handler
            this.trapMap.set(trapAddr, vector);
            this.libraryMap.set(trapAddr, this.aedoorLibrary);
            // NEW: Also store mapping by offset (array-based to handle collisions)
            if (!this.offsetMap.has(vector.offset)) {
                this.offsetMap.set(vector.offset, []);
                this.offsetLibraryMap.set(vector.offset, []);
            }
            this.offsetMap.get(vector.offset).push(vector);
            this.offsetLibraryMap.get(vector.offset).push(this.aedoorLibrary);
            console.log("  [".concat(vector.name, "] Vector at 0x").concat(trapAddr.toString(16), " (offset ").concat(vector.offset, ")"));
        }
        console.log("[LibraryTraps] Installed ".concat(AEDOOR_VECTORS.length, " AEDoor.library vectors"));
    };
    /**
     * Handle a trapped library call
     *
     * Called when PC is at a library vector address BEFORE execution.
     * We execute our handler instead of the (nonexistent) library code.
     *
     * @param pc - Current program counter
     * @returns true if this is a library call and was handled
     */
    LibraryTraps.prototype.handleTrap = function (pc) {
        var vector = this.trapMap.get(pc);
        if (!vector) {
            // Check if this looks like a library vector (near a known library base)
            var execBase = this.emulator.readMemory32(0x4);
            var dosBase = this.execLibrary.getLibraryBase('dos.library');
            if (pc >= execBase - 1000 && pc < execBase) {
                var offset = pc - execBase;
                console.error("[LibraryTraps] *** UNIMPLEMENTED EXEC FUNCTION ***");
                console.error("[LibraryTraps]   PC: 0x".concat(pc.toString(16)));
                console.error("[LibraryTraps]   ExecBase: 0x".concat(execBase.toString(16)));
                console.error("[LibraryTraps]   LVO offset: ".concat(offset));
                console.error("[LibraryTraps]   This is likely a missing Exec.library function!");
                // Continue execution anyway (simulate RTS with D0=0)
                this.emulator.setRegister(0, 0); // D0 = 0 (failure)
                var sp_1 = this.emulator.getRegister(15);
                var returnAddr_1 = this.emulator.readMemory32(sp_1);
                this.emulator.setRegister(15, sp_1 + 4);
                this.emulator.setRegister(16, returnAddr_1);
                console.error("[LibraryTraps]   Simulated RTS with D0=0, returning to 0x".concat(returnAddr_1.toString(16)));
                return true;
            }
            if (dosBase && pc >= dosBase - 500 && pc < dosBase) {
                var offset = pc - dosBase;
                console.error("[LibraryTraps] *** UNIMPLEMENTED DOS FUNCTION ***");
                console.error("[LibraryTraps]   PC: 0x".concat(pc.toString(16), ", LVO: ").concat(offset));
                // Simulate RTS with D0=0
                this.emulator.setRegister(0, 0);
                var sp_2 = this.emulator.getRegister(15);
                var returnAddr_2 = this.emulator.readMemory32(sp_2);
                this.emulator.setRegister(15, sp_2 + 4);
                this.emulator.setRegister(16, returnAddr_2);
                return true;
            }
            return false; // Not a library trap
        }
        console.log("[LibraryTraps] *** INTERCEPTED: ".concat(vector.name, "() at PC=0x").concat(pc.toString(16), " ***"));
        // Highlight output-related AEDoor functions
        if (vector.name === 'WriteStr' || vector.name === 'Prompt' || vector.name === 'SendCmd') {
            console.log("[LibraryTraps] \u26A0\uFE0F  OUTPUT FUNCTION: ".concat(vector.name, "() - THIS SHOULD PRODUCE TERMINAL OUTPUT"));
        }
        // Notify monitor if callback is set
        if (this.onLibraryCall) {
            this.onLibraryCall(vector.name, pc);
        }
        // CRITICAL: Save return address AND pop stack BEFORE calling handler!
        // Some handlers (like StackSwap) modify the stack pointer. We must read
        // and pop the return address from the ORIGINAL stack before the handler runs.
        var sp = this.emulator.getRegister(15); // A7 (stack pointer)
        var a6 = this.emulator.getRegister(14); // A6 (library base)
        var a6Before = a6; // CRITICAL: Save A6 before trap handler
        console.log("[LibraryTraps]   SP before pop: 0x".concat(sp.toString(16), ", A6: 0x").concat(a6.toString(16)));
        var returnAddr = this.emulator.readMemory32(sp);
        console.log("[LibraryTraps]   Return address at SP: 0x".concat(returnAddr.toString(16)));
        this.emulator.setRegister(15, sp + 4); // Pop return address from ORIGINAL stack
        var spAfter = this.emulator.getRegister(15);
        console.log("[LibraryTraps]   SP after pop: 0x".concat(spAfter.toString(16)));
        // DEBUG: Dump stack contents where A6 should be saved
        // MOVEM.L (SP)+,D0-D7/A0-A6 reads A6 from SP+56
        // (D0-D7 = 8 regs = 32 bytes, A0-A5 = 6 regs = 24 bytes, total offset = 56)
        var a6OnStack = this.emulator.readMemory32(spAfter + 56);
        console.log("[LibraryTraps]   A6 value saved on stack at SP+56 (0x".concat((spAfter + 56).toString(16), "): 0x").concat(a6OnStack.toString(16)));
        // Also dump the surrounding stack to see the pattern
        console.log("[LibraryTraps]   Stack dump (after return address pop):");
        for (var i = 0; i < 15; i++) {
            var regValue = this.emulator.readMemory32(spAfter + (i * 4));
            var regName = i < 8 ? "D".concat(i) : "A".concat(i - 8);
            console.log("[LibraryTraps]     SP+".concat(i * 4, " (").concat(regName, "): 0x").concat(regValue.toString(16)));
        }
        // Get the library instance for this trap
        var library = this.libraryMap.get(pc);
        // Call the handler with the correct library instance
        // Note: Handler may now modify SP (e.g., StackSwap), but we've already popped the return address
        // Pass returnAddr to handler for functions like Supervisor() that need it
        var result = vector.handler(this.emulator, library, returnAddr);
        // Set return value in D0
        this.emulator.setRegister(0, result);
        // CRITICAL FIX: Restore A6 register after trap handler
        // M68K calling convention requires A6 to be preserved across function calls
        // For library calls, A6 MUST contain the library base address
        // Determine which library this offset belongs to and restore A6 to that library's base
        // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
        var properA6 = a6Before; // Default: restore to original value
        // Determine library base from the library instance
        if (library === this.execLibrary) {
            properA6 = this.execLibrary.getLibraryBase('exec.library') || 0x10000;
        }
        else if (library === this.dosLibrary) {
            properA6 = this.execLibrary.getLibraryBase('dos.library') || 0x20000;
        }
        else if (library === this.aedoorLibrary) {
            properA6 = this.execLibrary.getLibraryBase('AEDoor.library') || 0x30000;
        }
        this.emulator.setRegister(14, properA6);
        var a6AfterRestore = this.emulator.getRegister(14);
        console.log("[LibraryTraps]   A6 restored: 0x".concat(a6Before.toString(16), " -> 0x").concat(properA6.toString(16), " (").concat(vector.name, " library base)"));
        if (a6AfterRestore !== properA6) {
            console.log("[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x".concat(properA6.toString(16), ", Got: 0x").concat(a6AfterRestore.toString(16)));
        }
        // CRITICAL FIX: Update Status Register condition codes after setting D0
        // Library functions return values in D0, and the calling code expects
        // the Z and N flags to be set based on the return value (like TST.L D0 would do)
        //
        // M68K SR format: Bits 15-8 = system byte, Bits 4-0 = CCR (X N Z V C)
        var sr = this.emulator.getRegister(17); // Get current SR
        var newSr = sr & 0xFFF0; // Clear N, Z, V, C flags (bits 0-3), preserve X flag (bit 4)
        // Set Z flag if result is zero
        if (result === 0) {
            newSr |= 0x04; // Set Z flag (bit 2)
        }
        // Set N flag if result is negative (bit 31 set for 32-bit value)
        if (result & 0x80000000) {
            newSr |= 0x08; // Set N flag (bit 3)
        }
        // V (overflow) and C (carry) are cleared for library returns
        this.emulator.setRegister(17, newSr); // Update SR
        // Verify SR was actually set
        var verifySr = this.emulator.getRegister(17);
        console.log("[LibraryTraps] ".concat(vector.name, "() returned 0x").concat(result.toString(16)));
        console.log("[LibraryTraps]   Set SR to: 0x".concat(newSr.toString(16).padStart(4, '0'), " (Z=").concat((newSr & 0x04) ? 1 : 0, " N=").concat((newSr & 0x08) ? 1 : 0, ")"));
        console.log("[LibraryTraps]   Verified SR: 0x".concat(verifySr.toString(16).padStart(4, '0'), " (Z=").concat((verifySr & 0x04) ? 1 : 0, ")"));
        // Set PC to return address
        // EXCEPTIONS: Supervisor() and Exit() set PC themselves, so check if it was changed
        var currentPC = this.emulator.getRegister(16);
        if (vector.name === 'Supervisor') {
            // Supervisor already set PC to the supervisor function, don't overwrite it
            console.log("[LibraryTraps] Supervisor: PC already set to 0x".concat(currentPC.toString(16), ", not setting return address"));
        }
        else if (vector.name === 'Exit') {
            // Exit() already set PC to exit trap address (0xFFFF00), don't overwrite it
            console.log("[LibraryTraps] Exit: PC already set to 0x".concat(currentPC.toString(16), " (exit trap), not setting return address"));
        }
        else {
            console.log("[LibraryTraps] Setting PC to return address 0x".concat(returnAddr.toString(16)));
            this.emulator.setRegister(16, returnAddr);
            var verifyPC = this.emulator.getRegister(16);
            console.log("[LibraryTraps] Verified PC is now: 0x".concat(verifyPC.toString(16)));
            // Also check what instruction is at return address
            var op0 = this.emulator.readMemory(returnAddr);
            var op1 = this.emulator.readMemory(returnAddr + 1);
            var opcode = (op0 << 8) | op1;
            console.log("[LibraryTraps] Instruction at return address: 0x".concat(opcode.toString(16).padStart(4, '0')));
        }
        // CRITICAL FIX: Refill instruction prefetch queue!
        // After setting PC, we MUST refill the prefetch queue to synchronize
        // queue.ird and queue.irc with the new PC location.
        // The fixed refillPrefetch() now properly sets IRD and IRC without executing.
        this.emulator.refillPrefetch();
        // Verify final register state and ENFORCE 4-byte SP alignment
        var finalSp = this.emulator.getRegister(15);
        var finalA6 = this.emulator.getRegister(14);
        // CRITICAL FIX: Ensure SP is 4-byte aligned (M68K requirement)
        // If SP is misaligned, round DOWN to nearest 4-byte boundary
        var misalignment = finalSp % 4;
        if (misalignment !== 0) {
            var originalSp = finalSp;
            finalSp = finalSp - misalignment; // Round down to 4-byte boundary
            this.emulator.setRegister(15, finalSp);
            console.log("[LibraryTraps] *** SP MISALIGNMENT DETECTED AND CORRECTED ***");
            console.log("[LibraryTraps]   Original SP: 0x".concat(originalSp.toString(16), " (misaligned by ").concat(misalignment, " bytes)"));
            console.log("[LibraryTraps]   Corrected SP: 0x".concat(finalSp.toString(16), " (4-byte aligned)"));
        }
        console.log("[LibraryTraps] Returning to 0x".concat(returnAddr.toString(16)));
        console.log("[LibraryTraps]   Final SP: 0x".concat(finalSp.toString(16), ", Final A6: 0x").concat(finalA6.toString(16)));
        return true; // Trap handled
    };
    /**
     * Check if an address is a library trap
     */
    LibraryTraps.prototype.isTrapAddress = function (addr) {
        return this.trapMap.has(addr);
    };
    /**
     * NEW: Check if an offset matches a known library vector
     */
    LibraryTraps.prototype.isTrapOffset = function (offset) {
        return this.offsetMap.has(offset);
    };
    /**
     * NEW: Handle a trap by offset (when A6 is corrupted)
     * @param offset - Library vector offset (e.g., -30 for Supervisor)
     * @param baseAddr - The A6 value (library base address, may be corrupted)
     */
    LibraryTraps.prototype.handleTrapByOffset = function (offset, baseAddr) {
        var vectors = this.offsetMap.get(offset);
        var libraries = this.offsetLibraryMap.get(offset);
        if (!vectors || vectors.length === 0) {
            console.error("[LibraryTraps] *** NO HANDLER for offset ".concat(offset, " ***"));
            return false;
        }
        // Multiple vectors can share the same offset (collision)
        // For now, use the first one (Exec.library functions installed first)
        // TODO: More sophisticated collision resolution if needed
        var vector = vectors[0];
        var library = libraries[0];
        console.log("[LibraryTraps] Intercepted: ".concat(vector.name, "() at offset ").concat(offset, " (A6=0x").concat(baseAddr.toString(16), ")"));
        // Notify monitor if callback is set
        if (this.onLibraryCall) {
            this.onLibraryCall(vector.name, baseAddr + offset);
        }
        // Pop return address from stack (same as handleTrap)
        var sp = this.emulator.getRegister(15); // A7 (stack pointer)
        var a6 = this.emulator.getRegister(14); // A6 (library base)
        var a6Before = a6; // CRITICAL: Save A6 before trap handler
        console.log("[LibraryTraps]   SP before pop: 0x".concat(sp.toString(16), ", A6: 0x").concat(a6.toString(16)));
        var returnAddr = this.emulator.readMemory32(sp);
        console.log("[LibraryTraps]   Return address at SP: 0x".concat(returnAddr.toString(16)));
        this.emulator.setRegister(15, sp + 4); // Pop return address
        var spAfter = this.emulator.getRegister(15);
        console.log("[LibraryTraps]   SP after pop: 0x".concat(spAfter.toString(16)));
        // Call the handler
        var result = vector.handler(this.emulator, library, returnAddr);
        // Set return value in D0
        this.emulator.setRegister(0, result);
        // CRITICAL FIX: Restore A6 register after trap handler
        // M68K calling convention requires A6 to be preserved across function calls
        // For library calls, A6 MUST contain the library base address
        // Determine which library this offset belongs to and restore A6 to that library's base
        // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
        var properA6 = a6Before; // Default: restore to original value
        // Determine library base from the library instance
        if (library === this.execLibrary) {
            properA6 = this.execLibrary.getLibraryBase('exec.library') || 0x10000;
        }
        else if (library === this.dosLibrary) {
            properA6 = this.execLibrary.getLibraryBase('dos.library') || 0x20000;
        }
        else if (library === this.aedoorLibrary) {
            properA6 = this.execLibrary.getLibraryBase('AEDoor.library') || 0x30000;
        }
        this.emulator.setRegister(14, properA6);
        var a6After = this.emulator.getRegister(14);
        console.log("[LibraryTraps]   A6 restored: 0x".concat(a6Before.toString(16), " -> 0x").concat(properA6.toString(16), " (").concat(vector.name, " library base)"));
        if (a6After !== properA6) {
            console.log("[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x".concat(properA6.toString(16), ", Got: 0x").concat(a6After.toString(16)));
        }
        // Update Status Register condition codes
        var sr = this.emulator.getRegister(17);
        var newSr = sr & 0xFFF0; // Clear N, Z, V, C flags
        // Set Z flag if result is zero
        if (result === 0) {
            newSr |= 0x04; // Set Z flag (bit 2)
        }
        // Set N flag if result is negative (bit 31 set)
        if (result & 0x80000000) {
            newSr |= 0x08; // Set N flag (bit 3)
        }
        this.emulator.setRegister(17, newSr);
        console.log("[LibraryTraps] ".concat(vector.name, "() returned 0x").concat(result.toString(16)));
        console.log("[LibraryTraps]   Set SR to: 0x".concat(newSr.toString(16).padStart(4, '0'), " (Z=").concat((newSr & 0x04) ? 1 : 0, " N=").concat((newSr & 0x08) ? 1 : 0, ")"));
        // Set PC to return address
        // EXCEPTIONS: Supervisor() and Exit() set PC themselves
        var currentPC = this.emulator.getRegister(16);
        if (vector.name === 'Supervisor') {
            console.log("[LibraryTraps] Supervisor: PC already set to 0x".concat(currentPC.toString(16), ", not setting return address"));
        }
        else if (vector.name === 'Exit') {
            console.log("[LibraryTraps] Exit: PC already set to 0x".concat(currentPC.toString(16), " (exit trap), not setting return address"));
        }
        else {
            this.emulator.setRegister(16, returnAddr);
        }
        return true;
    };
    return LibraryTraps;
}());
exports.LibraryTraps = LibraryTraps;
