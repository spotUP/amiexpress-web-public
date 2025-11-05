"use strict";
/**
 * Exec.library Emulation for XIM Door Execution
 *
 * Following vAmiga's ExecBase structure and Amiga Exec.library API
 * Reference: Docs/vAmiga/Core/Misc/OSDebugger/OSDebuggerTypes.h
 *
 * This implements the core Exec.library functions that doors use,
 * WITHOUT full hardware emulation or ROM boot.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecLibrary = void 0;
var fs = require("fs");
var path = require("path");
/**
 * Exec.library implementation for door execution
 *
 * Phase 1 Implementation:
 * - ExecBase structure creation
 * - OpenLibrary/CloseLibrary
 * - FindTask
 * - AllocMem/FreeMem
 */
var ExecLibrary = /** @class */ (function () {
    function ExecLibrary(emulator) {
        this.libraries = new Map();
        // Memory allocation tracking
        this.allocations = new Map(); // address -> size
        this.nextFreeMemory = 0x080000; // Start allocating at 512KB
        // Message port tracking
        this.messagePorts = new Map(); // address -> port
        this.publicPorts = new Map(); // name -> address
        this.nextPortAddress = 0x0A0000; // Start at 640KB
        // Signal allocation tracking (32 signals, bits 0-31)
        this.allocatedSignals = 0; // Bitmask of allocated signals
        // Door message callback - called when door sends message to AEDoorPort
        this.doorMessageCallback = null;
        // Standard library addresses (for stubs)
        this.EXEC_BASE_ADDR = 0x010000; // ExecBase at 64KB
        this.DOS_LIB_ADDR = 0x020000; // DOS.library at 128KB
        this.AEDOOR_LIB_ADDR = 0x030000; // AEDoor.library at 192KB
        this.ICON_LIB_ADDR = 0x040000; // icon.library at 256KB
        this.INTUITION_LIB_ADDR = 0x050000; // intuition.library at 320KB
        this.UTILITY_LIB_ADDR = 0x070000; // utility.library at 448KB
        /**
         * OpenLibrary(name, version) -> library base or NULL
         *
         * Opens a library and returns its base address.
         * Returns NULL if library cannot be opened.
         *
         * Implementation: Return stub library structures for known libraries
         */
        // Callback for when a library is opened (used to install traps)
        this.onLibraryOpened = null;
        /**
         * StackSwap() - LVO -732 (0xFFFFFD28)
         *
         * Swap stacks with a new stack structure. This allows C programs to use
         * a larger stack than the default.
         *
         * Parameters:
         *   A0 = StackSwapStruct pointer
         *
         * Structure:
         *   APTR stk_Lower    (offset 0)  - Lowest byte of new stack
         *   ULONG stk_Upper   (offset 4)  - Upper end of stack (size + Lower)
         *   APTR stk_Pointer  (offset 8)  - Stack pointer at switch point
         *
         * Returns:
         *   Nothing (void)
         *
         * The structure is modified in-place to contain the OLD stack values,
         * allowing restoration by calling StackSwap again with the same structure.
         */
        // Track when we've allocated a separate stack to maintain symmetry
        this.separateStackAllocated = false;
        this.separateStackPointer = 0;
        this.emulator = emulator;
        // Initialize ExecBase structure
        this.execBase = {
            address: this.EXEC_BASE_ADDR,
            version: 37, // Kickstart 2.04+
            revision: 175, // Standard revision
            idString: 0, // TODO: Create version string
            softVer: 37, // Kickstart 2.04
            thisTask: 0, // Will be set when creating task
            libList: 0, // TODO: Create list
            taskReady: 0, // TODO: Create list
            eclockFrequency: 709379, // PAL E-clock frequency
        };
        // Create current task (the door itself)
        this.currentTask = {
            address: 0x070000, // Task structure at 448KB
            name: 'Door Task',
            node: 0x070000,
            sigRecvd: 0, // No signals received yet
            sigWait: 0, // Not waiting for signals (0 = TS_READY)
            state: 0, // TS_READY
        };
        this.execBase.thisTask = this.currentTask.address;
        console.log('[ExecLibrary] Initialized');
        console.log("[ExecLibrary] ExecBase at 0x".concat(this.execBase.address.toString(16)));
    }
    /**
     * Set callback for when door sends message to AEDoorPort
     * This allows AmigaDoorSession to process messages via trap interception
     * instead of polling GetMsg()
     */
    ExecLibrary.prototype.setDoorMessageCallback = function (callback) {
        this.doorMessageCallback = callback;
    };
    /**
     * Initialize the Exec system
     * - Create ExecBase structure in memory
     * - Set pointer at 0x000004
     * - Create initial task
     * - Override ROM exception vectors with simple handlers
     */
    ExecLibrary.prototype.initialize = function () {
        console.log('[ExecLibrary] Creating ExecBase structure...');
        // ROM loaded but its exception handlers expect fully booted system
        // Override with our simple handlers that skip instructions
        this.setupExceptionVectors();
        // Write ExecBase pointer at 0x000004 (absolute address 4)
        this.emulator.writeMemory32(0x000004, this.execBase.address);
        console.log("[ExecLibrary] Wrote ExecBase pointer at 0x000004 -> 0x".concat(this.execBase.address.toString(16)));
        // Create stub function for unknown system vectors
        // Some programs (like GetAnswer) load function pointers from low memory
        // We create a stub that just does RTS (return immediately)
        var STUB_FUNCTION_ADDR = 0xF00F00;
        this.emulator.writeMemory16(STUB_FUNCTION_ADDR, 0x4E75); // RTS instruction
        console.log("[ExecLibrary] Created stub function at 0x".concat(STUB_FUNCTION_ADDR.toString(16)));
        // Point common low memory vectors to stub function
        // These might be used by C runtime or BBS-specific code
        var LOW_MEMORY_VECTORS = [
            0x00F4, // Used by GetAnswer door
            0x00F8, // Potential related vector
            0x00FC, // Potential related vector
        ];
        for (var _i = 0, LOW_MEMORY_VECTORS_1 = LOW_MEMORY_VECTORS; _i < LOW_MEMORY_VECTORS_1.length; _i++) {
            var addr = LOW_MEMORY_VECTORS_1[_i];
            this.emulator.writeMemory32(addr, STUB_FUNCTION_ADDR);
            console.log("[ExecLibrary] Stub vector at 0x".concat(addr.toString(16).padStart(4, '0'), " -> 0x").concat(STUB_FUNCTION_ADDR.toString(16)));
        }
        // Write ExecBase structure to memory
        this.writeExecBaseToMemory();
        // Write current task structure
        this.writeTaskToMemory(this.currentTask);
        console.log('[ExecLibrary] ExecBase initialized successfully');
    };
    /**
     * Set up exception vector table (0x00-0xFF)
     *
     * The 68000 exception vector table contains pointers to exception handlers.
     * When an exception occurs, the CPU jumps to the address stored in the vector.
     *
     * We create handlers that skip the offending instruction to prevent infinite loops.
     */
    ExecLibrary.prototype.setupExceptionVectors = function () {
        console.log('[ExecLibrary] Setting up exception vectors...');
        // Exception handler code location (high memory, won't conflict with door)
        var EXCEPTION_HANDLER_BASE = 0xF00000;
        // Create exception handlers that skip the offending instruction
        for (var i = 0; i < 64; i++) {
            var handlerAddr = EXCEPTION_HANDLER_BASE + (i * 32);
            // Exception handler code:
            // ADDQ.L #2, 2(SP)    ; Skip 2 bytes (most 68000 instructions are 2+ bytes)
            // RTE                 ; Return from exception
            //
            // This increments the return PC by 2, skipping the instruction that caused the exception
            // ADDQ.L #2, 2(SP) = 0x5AAF 0x0002
            this.emulator.writeMemory16(handlerAddr + 0, 0x5AAF);
            this.emulator.writeMemory16(handlerAddr + 2, 0x0002);
            // RTE = 0x4E73
            this.emulator.writeMemory16(handlerAddr + 4, 0x4E73);
            // Write the handler address to the exception vector
            var vectorAddr = i * 4;
            this.emulator.writeMemory32(vectorAddr, handlerAddr);
        }
        console.log('[ExecLibrary] Exception vectors initialized (0x00-0xFF)');
        console.log("[ExecLibrary] Exception handlers at 0x".concat(EXCEPTION_HANDLER_BASE.toString(16)));
        console.log('[ExecLibrary] Handlers skip offending instruction (+2 bytes) and RTE');
    };
    /**
     * Write ExecBase structure to emulator memory
     * Following the structure from vAmiga
     */
    ExecLibrary.prototype.writeExecBaseToMemory = function () {
        var addr = this.execBase.address;
        // Library node header (34 bytes)
        // For now, minimal initialization
        this.emulator.writeMemory16(addr + 20, this.execBase.version); // lib_Version
        this.emulator.writeMemory16(addr + 22, this.execBase.revision); // lib_Revision
        this.emulator.writeMemory32(addr + 24, this.execBase.idString); // lib_IdString
        // ExecBase specific fields
        this.emulator.writeMemory16(addr + 34, this.execBase.softVer); // SoftVer
        this.emulator.writeMemory32(addr + 276, this.execBase.thisTask); // ThisTask
        this.emulator.writeMemory32(addr + 378, this.execBase.libList); // LibList
        // V36 additions
        this.emulator.writeMemory32(addr + 568, this.execBase.eclockFrequency); // ex_EClockFrequency
        console.log("[ExecLibrary] ExecBase structure written to 0x".concat(addr.toString(16)));
        console.log("[ExecLibrary]   Version: ".concat(this.execBase.version, ".").concat(this.execBase.revision));
        console.log("[ExecLibrary]   ThisTask: 0x".concat(this.execBase.thisTask.toString(16)));
    };
    /**
     * Write Task structure to memory
     */
    ExecLibrary.prototype.writeTaskToMemory = function (task) {
        // Minimal task structure for now
        // TODO: Implement full task structure when needed
        console.log("[ExecLibrary] Task structure at 0x".concat(task.address.toString(16), ": ").concat(task.name));
    };
    /**
     * Set callback for when a library is opened
     */
    ExecLibrary.prototype.setLibraryOpenedCallback = function (callback) {
        this.onLibraryOpened = callback;
    };
    ExecLibrary.prototype.openLibrary = function (nameAddr, version) {
        // Read library name from memory
        var name = this.emulator.readString(nameAddr);
        console.log("[ExecLibrary] OpenLibrary(\"".concat(name, "\", ").concat(version, ")"));
        // Check if library is already open
        var existing = this.libraries.get(name);
        if (existing) {
            existing.openCount++;
            console.log("[ExecLibrary]   Already open, count=".concat(existing.openCount));
            return existing.address;
        }
        // Create library structure based on name
        var libAddr = 0;
        var libVersion = 0;
        var libRevision = 0;
        switch (name.toLowerCase()) {
            case 'exec.library':
                libAddr = this.EXEC_BASE_ADDR;
                libVersion = 37;
                libRevision = 175;
                break;
            case 'dos.library':
                libAddr = this.DOS_LIB_ADDR;
                libVersion = 37;
                libRevision = 0;
                break;
            case 'aedoor.library':
                libAddr = this.AEDOOR_LIB_ADDR;
                libVersion = 2; // V-AWAIT door requires version 2+
                libRevision = 0;
                break;
            case 'icon.library':
                libAddr = this.ICON_LIB_ADDR;
                libVersion = 36;
                libRevision = 0;
                break;
            case 'intuition.library':
                libAddr = this.INTUITION_LIB_ADDR;
                libVersion = 36;
                libRevision = 0;
                break;
            case 'utility.library':
                libAddr = this.UTILITY_LIB_ADDR;
                libVersion = 37;
                libRevision = 0;
                break;
            default:
                console.log("[ExecLibrary]   Unknown library: ".concat(name));
                return 0; // NULL
        }
        // Check version requirement
        if (version > libVersion) {
            console.log("[ExecLibrary]   Version ".concat(version, " > available ").concat(libVersion, ", returning NULL"));
            return 0; // NULL
        }
        // Create library node
        var lib = {
            address: libAddr,
            name: name,
            version: libVersion,
            revision: libRevision,
            openCount: 1,
            negSize: 30, // Standard jump table size
            posSize: 34, // Standard library structure size
        };
        this.libraries.set(name, lib);
        // Write library structure to memory
        this.writeLibraryToMemory(lib);
        console.log("[ExecLibrary]   Opened at 0x".concat(libAddr.toString(16), ", v").concat(libVersion, ".").concat(libRevision));
        // Notify callback (used to install library traps)
        if (this.onLibraryOpened) {
            this.onLibraryOpened(name, libAddr);
        }
        return libAddr;
    };
    /**
     * CloseLibrary(library)
     *
     * Closes a library (decrements open count)
     */
    ExecLibrary.prototype.closeLibrary = function (libAddr) {
        // Find library by address
        for (var _i = 0, _a = this.libraries.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], name_1 = _b[0], lib = _b[1];
            if (lib.address === libAddr) {
                lib.openCount--;
                console.log("[ExecLibrary] CloseLibrary(".concat(name_1, "), count=").concat(lib.openCount));
                if (lib.openCount <= 0) {
                    this.libraries.delete(name_1);
                    console.log("[ExecLibrary]   Library ".concat(name_1, " fully closed"));
                }
                return;
            }
        }
        console.log("[ExecLibrary] CloseLibrary(0x".concat(libAddr.toString(16), ") - unknown library"));
    };
    /**
     * Load real AEDoor.library binary from disk
     * This loads the actual compiled Amiga library and copies it into emulated memory
     */
    ExecLibrary.prototype.loadRealAEDoorLibrary = function () {
        try {
            var libPath = path.join(process.cwd(), 'Libs', 'AEDoor.library');
            console.log("[ExecLibrary] Loading real AEDoor.library from: ".concat(libPath));
            if (!fs.existsSync(libPath)) {
                console.log("[ExecLibrary] ERROR: AEDoor.library not found at ".concat(libPath));
                return false;
            }
            var binary = fs.readFileSync(libPath);
            console.log("[ExecLibrary] Read ".concat(binary.length, " bytes from AEDoor.library"));
            // Parse Amiga hunk format
            var offset = 0;
            // Skip to HUNK_CODE (0x000003E9) after header
            // The library starts at offset 0x20 based on hexdump
            var codeStart = 0x20;
            var codeSize = 0x3F0; // ~1KB of code+data
            // Copy the library code to AEDOOR_LIB_ADDR
            var destAddr = this.AEDOOR_LIB_ADDR;
            console.log("[ExecLibrary] Copying library code to 0x".concat(destAddr.toString(16)));
            for (var i = 0; i < codeSize && (codeStart + i) < binary.length; i++) {
                this.emulator.writeMemory(destAddr + i, binary[codeStart + i]);
            }
            console.log("[ExecLibrary] AEDoor.library loaded successfully");
            console.log("[ExecLibrary]   Base address: 0x".concat(destAddr.toString(16)));
            console.log("[ExecLibrary]   Code size: ".concat(codeSize, " bytes"));
            // The library has a jump table at negative offsets from the base
            // LVO offsets are at: -30 (CreateComm), -36 (DeleteComm), etc.
            // These are RTS instructions (0x4E75) or JMP instructions
            return true;
        }
        catch (error) {
            console.log("[ExecLibrary] ERROR loading AEDoor.library:", error);
            return false;
        }
    };
    /**
     * FindTask(name) -> task pointer or NULL
     *
     * Finds a task by name.
     * If name is NULL, returns current task.
     */
    ExecLibrary.prototype.findTask = function (nameAddr) {
        if (nameAddr === 0) {
            // NULL name = return current task
            console.log("[ExecLibrary] FindTask(NULL) -> 0x".concat(this.currentTask.address.toString(16), " (current task)"));
            return this.currentTask.address;
        }
        var name = this.emulator.readString(nameAddr);
        console.log("[ExecLibrary] FindTask(\"".concat(name, "\")"));
        // For now, only support finding current task
        if (name === this.currentTask.name) {
            return this.currentTask.address;
        }
        console.log("[ExecLibrary]   Task not found");
        return 0; // NULL
    };
    /**
     * AllocMem(size, flags) -> memory address or NULL
     *
     * Allocates memory block of specified size
     */
    ExecLibrary.prototype.allocMem = function (size, flags) {
        // Align size to 4-byte boundary
        var alignedSize = (size + 3) & ~3;
        var addr = this.nextFreeMemory;
        this.nextFreeMemory += alignedSize;
        // Track allocation
        this.allocations.set(addr, alignedSize);
        // Clear memory if MEMF_CLEAR flag is set (bit 16)
        if (flags & (1 << 16)) {
            for (var i = 0; i < alignedSize; i++) {
                this.emulator.writeMemory(addr + i, 0);
            }
        }
        console.log("[ExecLibrary] AllocMem(".concat(size, ", 0x").concat(flags.toString(16), ") -> 0x").concat(addr.toString(16)));
        return addr;
    };
    /**
     * FreeMem(address, size)
     *
     * Frees previously allocated memory
     */
    ExecLibrary.prototype.freeMem = function (addr, size) {
        var allocation = this.allocations.get(addr);
        if (allocation) {
            this.allocations.delete(addr);
            console.log("[ExecLibrary] FreeMem(0x".concat(addr.toString(16), ", ").concat(size, ") - freed ").concat(allocation, " bytes"));
        }
        else {
            console.log("[ExecLibrary] FreeMem(0x".concat(addr.toString(16), ", ").concat(size, ") - not tracked"));
        }
    };
    /**
     * Write Library structure to memory
     */
    ExecLibrary.prototype.writeLibraryToMemory = function (lib) {
        var addr = lib.address;
        // Write library node header
        this.emulator.writeMemory16(addr + 16, lib.negSize); // lib_NegSize
        this.emulator.writeMemory16(addr + 18, lib.posSize); // lib_PosSize
        this.emulator.writeMemory16(addr + 20, lib.version); // lib_Version
        this.emulator.writeMemory16(addr + 22, lib.revision); // lib_Revision
        this.emulator.writeMemory16(addr + 32, lib.openCount); // lib_OpenCnt
        console.log("[ExecLibrary]   Library structure written: ".concat(lib.name, " v").concat(lib.version, ".").concat(lib.revision));
    };
    /**
     * Get ExecBase address
     */
    ExecLibrary.prototype.getExecBaseAddress = function () {
        return this.execBase.address;
    };
    /**
     * Get current task address
     */
    ExecLibrary.prototype.getCurrentTaskAddress = function () {
        return this.currentTask.address;
    };
    /**
     * Get library base address by name
     */
    ExecLibrary.prototype.getLibraryBase = function (name) {
        var lib = this.libraries.get(name);
        return lib ? lib.address : 0;
    };
    /**
     * SetTaskPri() - LVO -306 (0xFECE)
     *
     * Set the priority of a task.
     *
     * Parameters:
     *   A1 = Task pointer (0 = current task)
     *   D0 = New priority (-128 to +127)
     *
     * Returns:
     *   D0 = Old priority
     */
    ExecLibrary.prototype.setTaskPri = function (taskAddr, newPri) {
        // If task is 0, use current task
        if (taskAddr === 0) {
            taskAddr = this.currentTask.address;
        }
        console.log("[ExecLibrary] SetTaskPri(task=0x".concat(taskAddr.toString(16), ", newPri=").concat(newPri, ")"));
        // Read old priority from task structure (offset 9 in Task structure)
        var oldPri = this.emulator.readMemory(taskAddr + 9);
        // Write new priority
        this.emulator.writeMemory(taskAddr + 9, newPri & 0xFF);
        console.log("  Old priority: ".concat(oldPri, ", New priority: ").concat(newPri));
        return oldPri;
    };
    /**
     * AllocSignal() - LVO -330 (0xFFFFFEB6)
     *
     * Allocate a signal bit for inter-process communication.
     *
     * Parameters:
     *   D0 = Signal number to allocate (-1 = any free signal)
     *
     * Returns:
     *   D0 = Signal number (0-31) or -1 if none available
     *
     * On Amiga, signals are used for IPC and synchronization.
     * Each task has 32 signal bits (0-31).
     */
    ExecLibrary.prototype.AllocSignal = function (signalNum) {
        // Convert from signed byte (-1 = 0xFFFFFFFF in 32-bit register)
        var requestedSignal = (signalNum < 0) ? -1 : (signalNum & 0xFF);
        console.log("[ExecLibrary] AllocSignal(".concat(requestedSignal, ")"));
        // If specific signal requested
        if (requestedSignal >= 0 && requestedSignal < 32) {
            var mask = 1 << requestedSignal;
            // Check if already allocated
            if (this.allocatedSignals & mask) {
                console.log("  Signal ".concat(requestedSignal, " already allocated!"));
                return -1; // Already allocated
            }
            // Allocate the requested signal
            this.allocatedSignals |= mask;
            console.log("  Allocated signal ".concat(requestedSignal, ", mask=0x").concat(this.allocatedSignals.toString(16)));
            return requestedSignal;
        }
        // Otherwise, find any free signal (0-31)
        for (var i = 0; i < 32; i++) {
            var mask = 1 << i;
            if (!(this.allocatedSignals & mask)) {
                // Found a free signal
                this.allocatedSignals |= mask;
                console.log("  Allocated signal ".concat(i, ", mask=0x").concat(this.allocatedSignals.toString(16)));
                return i;
            }
        }
        // No free signals
        console.log("  No free signals available!");
        return -1;
    };
    /**
     * FindPort() - LVO -390 (0xFFFFFE7A)
     *
     * Find a public message port by name.
     *
     * Parameters:
     *   A1 = Name (C-string pointer)
     *
     * Returns:
     *   D0 = MsgPort pointer (0 if not found)
     *
     * On Amiga, message ports are used for IPC. Doors look for "AEDoorPort%d"
     * where %d is the node number. When found, the door can send messages to
     * the BBS and receive replies.
     */
    ExecLibrary.prototype.findPort = function (nameAddr) {
        var name = this.emulator.readString(nameAddr);
        console.log("[ExecLibrary] FindPort(\"".concat(name, "\")"));
        // CORRECT IMPLEMENTATION: Search for port in public registry
        // FindPort() should NOT create ports - it only searches for existing ones
        var portAddr = this.publicPorts.get(name);
        if (portAddr !== undefined) {
            console.log("[ExecLibrary]   Found \"".concat(name, "\" at 0x").concat(portAddr.toString(16)));
            return portAddr;
        }
        // Check for other known ports (libraries can act as ports)
        if (name.toLowerCase() === 'dos.library') {
            var dosLib = this.libraries.get('dos.library');
            if (dosLib) {
                console.log("[ExecLibrary]   Returning dos.library at 0x".concat(dosLib.address.toString(16)));
                return dosLib.address;
            }
        }
        console.log("[ExecLibrary]   Port \"".concat(name, "\" not found - returning NULL"));
        return 0;
    };
    /**
     * AddPort() - LVO -354 (0xFFFFFE9E)
     *
     * Add a message port to the public list.
     *
     * Parameters:
     *   A1 = MsgPort pointer
     *
     * Returns:
     *   None
     *
     * Makes a port publicly findable via FindPort().
     * The port name is read from the port structure.
     */
    ExecLibrary.prototype.addPort = function (portAddr) {
        if (portAddr === 0) {
            console.log('[ExecLibrary] AddPort(NULL) - ignoring');
            return;
        }
        // Read port structure to get name
        // MsgPort structure:
        //   +0:  ln_Succ (4 bytes)
        //   +4:  ln_Pred (4 bytes)
        //   +8:  ln_Type (1 byte)
        //   +9:  ln_Pri (1 byte)
        //   +10: ln_Name (4 bytes) - pointer to name string
        var namePtr = this.emulator.readMemory32(portAddr + 10);
        if (namePtr === 0) {
            console.log("[ExecLibrary] AddPort(0x".concat(portAddr.toString(16), ") - port has no name, not making public"));
            return;
        }
        var name = this.emulator.readString(namePtr);
        console.log("[ExecLibrary] AddPort(0x".concat(portAddr.toString(16), ") - adding public port \"").concat(name, "\""));
        // Add to public ports registry (for FindPort lookup)
        this.publicPorts.set(name, portAddr);
        // CRITICAL: Also add to message ports registry (for PutMsg/GetMsg/WaitPort)
        // Read port structure fields
        var sigBit = this.emulator.readMemory(portAddr + 15); // mp_SigBit
        var sigTask = this.emulator.readMemory32(portAddr + 16); // mp_SigTask
        var port = {
            address: portAddr,
            name: name,
            messages: [],
            sigBit: sigBit || 1,
            sigTask: sigTask || this.currentTask.address,
            signaled: false
        };
        this.messagePorts.set(portAddr, port);
        // Update port structure to mark it as public (ln_Type = NT_MSGPORT = 4)
        this.emulator.writeMemory(portAddr + 8, 4); // NT_MSGPORT
        console.log("[ExecLibrary]   Port \"".concat(name, "\" is now public and registered for messaging"));
    };
    /**
     * CreateMsgPort() - LVO -666 (0xFFFFFD66)
     *
     * Create a new message port.
     *
     * Parameters:
     *   None
     *
     * Returns:
     *   D0 = MsgPort pointer (0 on failure)
     *
     * Message ports are used for IPC. Doors create a reply port to receive
     * responses from the BBS.
     */
    ExecLibrary.prototype.createMsgPort = function () {
        console.log('[ExecLibrary] CreateMsgPort()');
        // Allocate memory for MsgPort structure (34 bytes)
        var portAddr = this.nextPortAddress;
        this.nextPortAddress += 0x100; // Space for port + message queue
        // Initialize MsgPort structure
        // struct MsgPort {
        //   struct Node mp_Node;      // 14 bytes
        //   UBYTE mp_Flags;           // 1 byte
        //   UBYTE mp_SigBit;          // 1 byte
        //   struct Task *mp_SigTask;  // 4 bytes
        //   struct List mp_MsgList;   // 14 bytes
        // }
        // mp_Node (14 bytes at offset 0)
        this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
        this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
        this.emulator.writeMemory(portAddr + 8, 0); // ln_Type (NT_MSGPORT=4)
        this.emulator.writeMemory(portAddr + 9, 0); // ln_Pri
        this.emulator.writeMemory32(portAddr + 10, 0); // ln_Name
        // mp_Flags (1 byte at offset 14)
        this.emulator.writeMemory(portAddr + 14, 0x02); // PA_SIGNAL
        // mp_SigBit (1 byte at offset 15)
        this.emulator.writeMemory(portAddr + 15, 1); // Signal bit 1
        // mp_SigTask (4 bytes at offset 16)
        this.emulator.writeMemory32(portAddr + 16, this.currentTask.address);
        // mp_MsgList (14 bytes at offset 20)
        // Initialize as empty list
        this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head (points to Tail)
        this.emulator.writeMemory32(portAddr + 24, 0); // lh_Tail (always NULL)
        this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred (points to Head)
        this.emulator.writeMemory(portAddr + 32, 0); // lh_Type
        this.emulator.writeMemory(portAddr + 33, 0); // l_pad
        // Track port in our registry
        var port = {
            address: portAddr,
            name: '', // Private port (no name)
            messages: [],
            sigBit: 1,
            sigTask: this.currentTask.address,
            signaled: false
        };
        this.messagePorts.set(portAddr, port);
        console.log("[ExecLibrary]   Created MsgPort at 0x".concat(portAddr.toString(16)));
        return portAddr;
    };
    /**
     * DeleteMsgPort() - LVO -672 (0xFFFFFD60)
     *
     * Delete a message port.
     *
     * Parameters:
     *   A0 = MsgPort pointer
     *
     * Returns:
     *   Nothing
     */
    ExecLibrary.prototype.deleteMsgPort = function (portAddr) {
        console.log("[ExecLibrary] DeleteMsgPort(port=0x".concat(portAddr.toString(16), ")"));
        // CRITICAL INSIGHT: portAddr might be in data segment (0x4000-0x5000 range)
        // If so, we need to READ THE POINTER from that address, not use the address directly!
        if (portAddr >= 0x4000 && portAddr < 0x5000) {
            var actualPortAddr = this.emulator.readMemory32(portAddr);
            console.log("[ExecLibrary]   Detected data segment address 0x".concat(portAddr.toString(16)));
            console.log("[ExecLibrary]   Reading port pointer from memory: 0x".concat(actualPortAddr.toString(16)));
            if (actualPortAddr === 0) {
                console.log("[ExecLibrary]   Port pointer is NULL - DoorStart() never initialized it");
                return;
            }
            // Recurse with actual port address
            return this.deleteMsgPort(actualPortAddr);
        }
        // Check if portAddr is NULL (0) or very small (likely NULL)
        if (portAddr === 0 || portAddr < 0x1000) {
            console.log("[ExecLibrary]   NULL or invalid port address: 0x".concat(portAddr.toString(16), " - ignoring"));
            return;
        }
        // Read the first few bytes of the port structure to see if it's valid
        var portData = {
            ln_Succ: this.emulator.readMemory32(portAddr + 0),
            ln_Pred: this.emulator.readMemory32(portAddr + 4),
            ln_Type: this.emulator.readMemory(portAddr + 8),
            mp_Flags: this.emulator.readMemory(portAddr + 14),
            mp_SigBit: this.emulator.readMemory(portAddr + 15)
        };
        console.log("[ExecLibrary]   Port structure at 0x".concat(portAddr.toString(16), ":"), portData);
        var port = this.messagePorts.get(portAddr);
        if (!port) {
            console.error("[ExecLibrary]   Port not tracked in messagePorts map (address: 0x".concat(portAddr.toString(16), ")"));
            console.error("[ExecLibrary]   Known ports:", Array.from(this.messagePorts.keys()).map(function (a) { return "0x".concat(a.toString(16)); }).join(', '));
            return;
        }
        // Remove from public registry if it has a name
        if (port.name) {
            this.publicPorts.delete(port.name);
            console.log("[ExecLibrary]   Removed public port \"".concat(port.name, "\""));
        }
        // Remove from port registry
        this.messagePorts.delete(portAddr);
        console.log("[ExecLibrary]   Deleted port at 0x".concat(portAddr.toString(16)));
    };
    /**
     * Create a public named message port
     * This is a helper method for BBS to create ports that doors can find
     *
     * @param name - Port name (e.g., "AEDoorPort0")
     * @returns Port address
     */
    ExecLibrary.prototype.createPublicPort = function (name) {
        console.log("[ExecLibrary] Creating public port: \"".concat(name, "\""));
        // Create port using standard CreateMsgPort
        var portAddr = this.createMsgPort();
        // Get the port from registry
        var port = this.messagePorts.get(portAddr);
        if (!port) {
            throw new Error("Failed to create public port \"".concat(name, "\""));
        }
        // Set the name
        port.name = name;
        // Write name to port structure (ln_Name at offset 10)
        // Allocate memory for name string
        var nameAddr = this.allocMem(name.length + 1, 0);
        this.emulator.writeString(nameAddr, name);
        this.emulator.writeMemory32(portAddr + 10, nameAddr);
        // Add to public registry
        this.publicPorts.set(name, portAddr);
        console.log("[ExecLibrary]   Public port \"".concat(name, "\" created at 0x").concat(portAddr.toString(16)));
        return portAddr;
    };
    /**
     * PutMsg() - LVO -366 (0xFFFFFE72)
     *
     * Send a message to a port.
     *
     * Parameters:
     *   A0 = MsgPort pointer
     *   A1 = Message pointer
     *
     * Returns:
     *   Nothing
     *
     * The message is queued on the port's message list and the port's task
     * is signaled (if PA_SIGNAL flag set).
     */
    ExecLibrary.prototype.putMsg = function (portAddr, msgAddr) {
        var _a;
        console.log("[ExecLibrary] PutMsg(port=0x".concat(portAddr.toString(16), ", msg=0x").concat(msgAddr.toString(16), ")"));
        var port = this.messagePorts.get(portAddr);
        if (!port) {
            console.error("[ExecLibrary]   Port not found: 0x".concat(portAddr.toString(16)));
            return;
        }
        // CRITICAL: Set message type to NT_MESSAGE (5) as per autodocs
        // Message.mn_Node.ln_Type is at offset 8
        var NT_MESSAGE = 5;
        this.emulator.writeMemory(msgAddr + 8, NT_MESSAGE);
        // Add message to port's queue
        port.messages.push(msgAddr);
        port.signaled = true;
        // CRITICAL: Write message to memory structure so door can see it!
        // MsgPort.mp_MsgList.lh_Head is at offset 20
        var listHeadOffset = 20;
        this.emulator.writeMemory32(portAddr + listHeadOffset, msgAddr);
        console.log("[ExecLibrary]   \u2713 Message queued to port memory structure");
        console.log("[ExecLibrary]   \u2713 Wrote message address 0x".concat(msgAddr.toString(16), " to port+20 (mp_MsgList.lh_Head)"));
        console.log("[ExecLibrary]   Port now has ".concat(port.messages.length, " message(s) in queue"));
        // *** CRITICAL: Signal the port's task (if PA_SIGNAL flag set) ***
        // This is the missing piece! The door is waiting for this signal.
        var mp_Flags = this.emulator.readMemory(portAddr + 14);
        var PA_SIGNAL = 0x02;
        if (mp_Flags & PA_SIGNAL) {
            console.log("[ExecLibrary]   Port has PA_SIGNAL flag - signaling task");
            console.log("[ExecLibrary]   Port sigTask: 0x".concat(port.sigTask.toString(16), ", sigBit: ").concat(port.sigBit));
            // Signal the task that owns this port
            if (port.sigTask !== 0) {
                var signalMask = 1 << port.sigBit; // Convert bit number to mask
                console.log("[ExecLibrary]   *** Calling Signal() to wake waiting task ***");
                this.signal(port.sigTask, signalMask);
            }
            else {
                console.warn("[ExecLibrary]   WARNING: Port has no sigTask set!");
            }
        }
        else {
            console.log("[ExecLibrary]   Port does not have PA_SIGNAL flag (no task to signal)");
        }
        // If this is an AEDoorPort, invoke callback for trap-based message processing
        // ONLY invoke for messages TO AEDoorPort (name check), not reply ports
        var isAEDoorPort = (_a = port.name) === null || _a === void 0 ? void 0 : _a.startsWith('AEDoorPort');
        if (isAEDoorPort) {
            console.log("[ExecLibrary]   *** This is ".concat(port.name, " - invoking door message callback ***"));
            if (this.doorMessageCallback) {
                this.doorMessageCallback(portAddr, msgAddr);
            }
            else {
                console.warn("[ExecLibrary]   WARNING: No door message callback set!");
                this.dumpAEDoorMessage(msgAddr);
            }
        }
    };
    /**
     * GetMsg() - LVO -372 (0xFFFFFE6C)
     *
     * Get a message from a port.
     *
     * Parameters:
     *   A0 = MsgPort pointer
     *
     * Returns:
     *   D0 = Message pointer (0 if no messages)
     *
     * Removes and returns the first message from the port's queue.
     */
    ExecLibrary.prototype.getMsg = function (portAddr) {
        console.log("[ExecLibrary] GetMsg(port=0x".concat(portAddr.toString(16), ")"));
        var port = this.messagePorts.get(portAddr);
        if (!port) {
            console.error("[ExecLibrary]   Port not found: 0x".concat(portAddr.toString(16)));
            return 0;
        }
        // Check if port has messages
        if (port.messages.length === 0) {
            console.log("[ExecLibrary]   No messages in port");
            return 0;
        }
        // Dequeue first message
        var msgAddr = port.messages.shift();
        console.log("[ExecLibrary]   Returning message at 0x".concat(msgAddr.toString(16), ", ").concat(port.messages.length, " remaining"));
        // Clear signaled flag if no more messages
        if (port.messages.length === 0) {
            port.signaled = false;
        }
        return msgAddr;
    };
    /**
     * WaitPort() - LVO -384 (0xFFFFFE80)
     *
     * Wait for a message to arrive at a port.
     *
     * Parameters:
     *   A0 = MsgPort pointer
     *
     * Returns:
     *   D0 = First message pointer (does not remove from queue)
     *
     * In real Amiga, this BLOCKS until a message arrives.
     * In our emulator, we can't block, so we return immediately.
     * If no messages, return 0 and door will loop/retry.
     */
    ExecLibrary.prototype.waitPort = function (portAddr) {
        var port = this.messagePorts.get(portAddr);
        if (!port) {
            // Port doesn't exist in registry - door must have created it statically
            // Auto-register it as a private port
            console.log("[ExecLibrary] WaitPort: Port at 0x".concat(portAddr.toString(16), " not in registry, auto-registering"));
            // Read port structure from memory to get details
            var sigBit = this.emulator.readMemory(portAddr + 15); // mp_SigBit
            var sigTask = this.emulator.readMemory32(portAddr + 16); // mp_SigTask
            port = {
                address: portAddr,
                name: '', // Private port
                messages: [],
                sigBit: sigBit || 1,
                sigTask: sigTask || this.currentTask.address,
                signaled: false
            };
            this.messagePorts.set(portAddr, port);
            console.log("[ExecLibrary]   Auto-registered port at 0x".concat(portAddr.toString(16)));
        }
        // Check if port has messages
        if (port.messages.length === 0) {
            // No message - would block on real Amiga, we return 0
            return 0;
        }
        // MESSAGE FOUND! Return first message WITHOUT removing it
        var msgAddr = port.messages[0];
        console.log("[ExecLibrary] ===============================================");
        console.log("[ExecLibrary] *** WaitPort RETURNS MESSAGE! ***");
        console.log("[ExecLibrary] ===============================================");
        console.log("[ExecLibrary]   Port: 0x".concat(portAddr.toString(16)));
        console.log("[ExecLibrary]   Message: 0x".concat(msgAddr.toString(16)));
        console.log("[ExecLibrary]   Queue length: ".concat(port.messages.length));
        console.log("[ExecLibrary] ===============================================");
        return msgAddr;
    };
    /**
     * ReplyMsg() - LVO -378 (0xFFFFFE86)
     *
     * Reply a message back to its sender via the ReplyPort
     *
     * From E sources (express.e:1096, 4368, 4379):
     * - BBS calls ReplyMsg(doormsg) to respond to door
     * - Message is sent back to mn_ReplyPort
     * - Door receives via GetMsg() on its reply port
     *
     * Parameters:
     *   A1 = Message address
     */
    ExecLibrary.prototype.replyMsg = function (msgAddr) {
        // Read reply port from message header
        var replyPortAddr = this.emulator.readMemory32(msgAddr + 14);
        if (replyPortAddr === 0) {
            console.log("[ExecLibrary] ReplyMsg: No reply port in message 0x".concat(msgAddr.toString(16)));
            return;
        }
        console.log("[ExecLibrary] ReplyMsg(msg=0x".concat(msgAddr.toString(16), ")"));
        console.log("[ExecLibrary]   Reply Port: 0x".concat(replyPortAddr.toString(16)));
        // CRITICAL: Set message type to NT_REPLYMSG (6) as per autodocs
        // This distinguishes replies from new messages
        // Message.mn_Node.ln_Type is at offset 8
        var NT_REPLYMSG = 6;
        this.emulator.writeMemory(msgAddr + 8, NT_REPLYMSG);
        // Send message back to reply port via PutMsg
        this.putMsg(replyPortAddr, msgAddr);
        console.log("[ExecLibrary] Reply sent");
    };
    /**
     * Helper: Dump AEDoor message structure for debugging
     */
    ExecLibrary.prototype.dumpAEDoorMessage = function (msgAddr) {
        // struct Message (20 bytes)
        var mn_Node = this.emulator.readMemory32(msgAddr + 0);
        var mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
        var mn_Length = this.emulator.readMemory16(msgAddr + 18);
        // AEDoor message extension
        var command = this.emulator.readMemory32(msgAddr + 20);
        var data = this.emulator.readMemory32(msgAddr + 24);
        // Read string (first 32 bytes)
        var str = '';
        for (var i = 0; i < 32; i++) {
            var ch = this.emulator.readMemory(msgAddr + 28 + i);
            if (ch === 0)
                break;
            str += String.fromCharCode(ch);
        }
        console.log("[ExecLibrary] AEDoor Message dump:");
        console.log("  mn_ReplyPort: 0x".concat(mn_ReplyPort.toString(16)));
        console.log("  mn_Length: ".concat(mn_Length));
        console.log("  command: ".concat(command));
        console.log("  data: ".concat(data));
        console.log("  string: \"".concat(str, "\""));
    };
    ExecLibrary.prototype.stackSwap = function (structAddr) {
        console.log("[ExecLibrary] StackSwap(struct=0x".concat(structAddr.toString(16), ")"));
        // Per Amiga NDK docs: "This function will swap the stack of your task with
        // the given values in StackSwap. The StackSwapStruct structure will then
        // contain the values of the old stack such that the old stack can be restored."
        // Read NEW stack values from structure (what caller wants)
        var newLower = this.emulator.readMemory32(structAddr + 0);
        var newUpper = this.emulator.readMemory32(structAddr + 4);
        var newPointer = this.emulator.readMemory32(structAddr + 8);
        // Get OLD stack values (current state)
        var oldPointer = this.emulator.getRegister(15); // Current SP
        var oldLower = 0xFD000; // Standard CLI stack lower bound
        var oldUpper = 0xFE000; // Standard CLI stack upper bound (4KB)
        console.log("[ExecLibrary]   OLD: Lower=0x".concat(oldLower.toString(16), ", Upper=0x").concat(oldUpper.toString(16), ", SP=0x").concat(oldPointer.toString(16)));
        console.log("[ExecLibrary]   NEW: Lower=0x".concat(newLower.toString(16), ", Upper=0x").concat(newUpper.toString(16), ", SP=0x").concat(newPointer.toString(16)));
        // CRITICAL: Detect dangerous overlap that would corrupt saved data
        // If NEW stack pointer is in same region as OLD and within 256 bytes, allocate separate stack
        var inSameRegion = (newLower === oldLower && newUpper === oldUpper);
        var tooClose = Math.abs(newPointer - oldPointer) < 256;
        if (inSameRegion && tooClose && !this.separateStackAllocated) {
            // First swap: Allocate truly separate stack to prevent corruption
            this.separateStackPointer = 0x53FFC; // 16KB separate stack at 0x50000-0x54000
            console.log("[ExecLibrary]   \u26A0\uFE0F  OVERLAP DANGER! OLD SP=0x".concat(oldPointer.toString(16), ", requested NEW SP=0x").concat(newPointer.toString(16)));
            console.log("[ExecLibrary]   Allocating separate stack at 0x".concat(this.separateStackPointer.toString(16), " to prevent corruption"));
            // Write OLD values to structure
            this.emulator.writeMemory32(structAddr + 0, oldLower);
            this.emulator.writeMemory32(structAddr + 4, oldUpper);
            this.emulator.writeMemory32(structAddr + 8, oldPointer);
            // Set SP to separate safe stack
            this.emulator.setRegister(15, this.separateStackPointer);
            this.separateStackAllocated = true;
            console.log("[ExecLibrary]   Stack swapped! SP now 0x".concat(this.separateStackPointer.toString(16), " (safe separate stack)"));
        }
        else if (this.separateStackAllocated) {
            // Second swap: Restore from separate stack
            // Per NDK docs: Structure ALREADY contains the old values from first swap!
            // We must swap them back (symmetric operation)
            console.log("[ExecLibrary]   Swapping back from separate stack");
            // Write CURRENT separate stack info to structure
            this.emulator.writeMemory32(structAddr + 0, 0x50000);
            this.emulator.writeMemory32(structAddr + 4, 0x54000);
            this.emulator.writeMemory32(structAddr + 8, oldPointer); // Current SP on separate stack
            // Restore to the SP that's IN the structure (from first swap)
            // This is the original stack pointer the door saved
            this.emulator.setRegister(15, newPointer); // newPointer is what door put in struct
            this.separateStackAllocated = false;
            console.log("[ExecLibrary]   Stack swapped! SP now 0x".concat(newPointer.toString(16), " (restored from struct)"));
        }
        else {
            // Normal symmetric swap
            this.emulator.writeMemory32(structAddr + 0, oldLower);
            this.emulator.writeMemory32(structAddr + 4, oldUpper);
            this.emulator.writeMemory32(structAddr + 8, oldPointer);
            this.emulator.setRegister(15, newPointer);
            console.log("[ExecLibrary]   Stack swapped! SP now 0x".concat(newPointer.toString(16)));
        }
    };
    /**
     * Wait() - Wait for one or more signals
     *
     * AmigaDOS function to block until signals are received.
     *
     * Parameters:
     *   D0 = Signal mask (bits to wait for)
     *
     * Returns:
     *   D0 = Signals received
     *
     * In real Amiga, this BLOCKS the calling task until one or more
     * of the specified signals are set by another task/interrupt.
     *
     * In our emulator, we can't truly block, so we implement a stub
     * that returns immediately with the signal mask, simulating success.
     * This allows the door to continue execution.
     */
    ExecLibrary.prototype.wait = function (signalMask) {
        console.log("[ExecLibrary] Wait(signalMask=0x".concat(signalMask.toString(16), ")"));
        console.log("[ExecLibrary]   Current sigRecvd: 0x".concat(this.currentTask.sigRecvd.toString(16)));
        // Check if any requested signals are already received
        var receivedSignals = this.currentTask.sigRecvd & signalMask;
        if (receivedSignals !== 0) {
            // Signals already present - return immediately
            console.log("[ExecLibrary]   *** Signals already received: 0x".concat(receivedSignals.toString(16), " ***"));
            console.log("[ExecLibrary]   Returning immediately (no need to wait)");
            // Clear the returned signals from sigRecvd
            this.currentTask.sigRecvd &= ~receivedSignals;
            console.log("[ExecLibrary]   Cleared signals from sigRecvd, new value: 0x".concat(this.currentTask.sigRecvd.toString(16)));
            return receivedSignals;
        }
        // No signals present - in real Amiga, task would block here
        // In our emulator, we can't truly block, so we mark the task as waiting
        // and return 0 to indicate "would block"
        console.log("[ExecLibrary]   No signals present - task would block on real Amiga");
        console.log("[ExecLibrary]   Setting sigWait=0x".concat(signalMask.toString(16), " (task is now waiting)"));
        this.currentTask.sigWait = signalMask;
        this.currentTask.state = 2; // TS_WAIT
        // In our emulator, we return immediately with the mask
        // The door's polling loop will continue until Signal() is called
        console.log("[ExecLibrary]   Returning mask=0x".concat(signalMask.toString(16), " (emulator: non-blocking)"));
        return signalMask;
    };
    /**
     * Signal() - Send signals to a task
     *
     * AmigaDOS function to set signal bits on a task, potentially
     * waking it up if it's Wait()ing.
     *
     * Parameters:
     *   A1 = Task address (or NULL for current task)
     *   D0 = Signal bits to set
     *
     * Returns:
     *   Nothing (void)
     *
     * This would normally set the signal bits in the task structure
     * and wake the task if it's blocked in Wait().
     *
     * Our stub implementation just logs the operation.
     */
    ExecLibrary.prototype.signal = function (taskAddr, signals) {
        console.log("[ExecLibrary] Signal(task=0x".concat(taskAddr.toString(16), ", signals=0x").concat(signals.toString(16), ")"));
        // If task is NULL (0), signal current task
        // For now, we only support signaling the current task (the door)
        if (taskAddr !== 0 && taskAddr !== this.currentTask.address) {
            console.warn("[ExecLibrary]   WARNING: Cannot signal task 0x".concat(taskAddr.toString(16), " (not current task)"));
            return;
        }
        console.log("[ExecLibrary]   Target task: 0x".concat(this.currentTask.address.toString(16), " (").concat(this.currentTask.name, ")"));
        console.log("[ExecLibrary]   Signal bits to set: 0x".concat(signals.toString(16)));
        console.log("[ExecLibrary]   Current sigRecvd: 0x".concat(this.currentTask.sigRecvd.toString(16)));
        // 1. OR signals into task's tc_SigRecvd field
        this.currentTask.sigRecvd |= signals;
        console.log("[ExecLibrary]   New sigRecvd: 0x".concat(this.currentTask.sigRecvd.toString(16)));
        // 2. Check if task is waiting (sigWait != 0 means TS_WAIT)
        if (this.currentTask.sigWait !== 0) {
            console.log("[ExecLibrary]   Task is waiting for signals: 0x".concat(this.currentTask.sigWait.toString(16)));
            // 3. Check if any of the received signals match what task is waiting for
            var matchedSignals = this.currentTask.sigRecvd & this.currentTask.sigWait;
            if (matchedSignals !== 0) {
                console.log("[ExecLibrary]   *** SIGNAL MATCH! Matched bits: 0x".concat(matchedSignals.toString(16), " ***"));
                console.log("[ExecLibrary]   *** Task should wake from Wait() now ***");
                // Task will wake when Wait() checks sigRecvd next
            }
            else {
                console.log("[ExecLibrary]   No match yet - task still waiting");
            }
        }
        else {
            console.log("[ExecLibrary]   Task not waiting (will receive signal when it calls Wait())");
        }
        console.log("[ExecLibrary]   Signal operation complete");
    };
    return ExecLibrary;
}());
exports.ExecLibrary = ExecLibrary;
