"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.AmigaDoorSession = void 0;
var MoiraEmulator_1 = require("./cpu/MoiraEmulator");
var HunkLoader_1 = require("./loader/HunkLoader");
var ExecLibrary_1 = require("./api/ExecLibrary");
var AEDoorLibrary_1 = require("./api/AEDoorLibrary");
var DOSLibrary_1 = require("./api/DOSLibrary");
var LibraryTraps_1 = require("./api/LibraryTraps");
var XIMProtocol_1 = require("./XIMProtocol");
var KickstartRom_1 = require("./KickstartRom");
var NodeStatusManager_1 = require("../nodes/NodeStatusManager");
var fs = require("fs");
var path = require("path");
var AmigaDoorSession = /** @class */ (function () {
    function AmigaDoorSession(socket, config) {
        this.emulator = null;
        this.execLibrary = null;
        this.aedoorLibrary = null;
        this.dosLibrary = null;
        this.libraryTraps = null;
        this.ximProtocol = null;
        this.isRunning = false;
        this.executionTimer = null;
        this.iterationCount = 0;
        this.doorPortAddress = 0; // AEDoorPort message port address
        // Virtual time tracking (8MHz 68000 = 0.125 microseconds per cycle)
        this.totalCycles = 0;
        this.CYCLES_PER_MICROSECOND = 8; // 8MHz CPU
        // I/O loop detection
        this.lastPC = 0;
        this.samePCCount = 0;
        this.inIOLoop = false;
        this.inSecondLoop = false;
        this.skipNextExecute = false;
        this.startupMessageSent = false; // Flag to send startup message only once
        this.lastPCs = []; // Track last 20 PC values for debugging
        this.hitUnmapped = false; // Track if we've already logged unmapped PC
        // Memory change detection (for investigating what door expects)
        this.lastMemoryValue = 0; // Last value at 0x2001
        this.memoryChangeCount = 0; // How many times memory changed
        // Library call monitoring
        this.libraryCallsInLoop = 0; // Count of library calls during polling loop
        // CRITICAL FIX: Track last intercepted trap to prevent double interception
        // When JSR handler intercepts a call, store the target address. If the next
        // iteration tries to intercept the same address, skip it (we already handled it).
        this.lastInterceptedTrap = 0; // Last library trap address we intercepted
        this.lastInterceptedIteration = 0; // Iteration when we intercepted it
        this.loggedMoveaStack = false; // Instrumentation flag for movea.l D0,A7 logging
        /**
         * Monitor A0 register changes during door execution to find where port address gets overwritten
         * This helps us identify where the door reads the garbage 0x7500002f value
         */
        this.lastA0Value = 0;
        this.a0ChangeDetected = false;
        this.socket = socket;
        this.config = __assign({ timeout: 300 }, config);
        // Set up socket event handlers
        this.setupSocketHandlers();
    }
    /**
     * UNIFIED TRAP DETECTION AND HANDLING
     *
     * This is the SINGLE canonical method for detecting and handling library traps.
     * It consolidates all the scattered trap detection logic into one place.
     *
     * Returns: true if trap was handled (caller should continue to next iteration)
     *          false if no trap detected (caller should execute instruction normally)
     */
    AmigaDoorSession.prototype.checkAndHandleLibraryTrap = function (pc) {
        if (!this.libraryTraps) {
            return Promise.resolve(false);
        }
        // Read instruction at PC to check if it's JSR (d16,A6)
        var op0 = this.emulator.readMemory(pc);
        var op1 = this.emulator.readMemory(pc + 1);
        var opcode = (op0 << 8) | op1;
        var isJSR_A6 = (opcode === 0x4eae);
        var a6 = this.emulator.getRegister(14);
        // Calculate offset from A6
        var offset = pc - a6;
        // Handle 16-bit signed offset wrapping
        if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
            var low16 = offset & 0xFFFF;
            offset = (low16 >= 0x8000) ? (low16 - 0x10000) : low16;
        }
        else if (offset > 0x7FFFFFFF) {
            offset = offset - 0x100000000;
        }
        // Determine if this is a library trap
        var isTrapAddress = this.libraryTraps.isTrapAddress(pc);
        var isTrapOffset = (offset < 0 && offset >= -2000 && this.libraryTraps.isTrapOffset(offset));
        var isLibraryTrap = isTrapAddress || isTrapOffset;
        if (!isLibraryTrap) {
            return Promise.resolve(false);
        }
        // Check if we just handled this exact trap (prevent double interception)
        if (pc === this.lastInterceptedTrap &&
            this.iterationCount - this.lastInterceptedIteration <= 2) {
            console.log("[AmigaDoorSession] *** SKIPPING DUPLICATE TRAP at PC=0x".concat(pc.toString(16), " (already handled at iteration ").concat(this.lastInterceptedIteration, ") ***"));
            this.lastInterceptedTrap = 0;
            this.lastInterceptedIteration = 0;
            return Promise.resolve(true); // Skip but return true to continue iteration
        }
        // Handle JSR (d16,A6) specially - intercept BEFORE execution
        if (isJSR_A6) {
            var offset16 = this.emulator.readMemory16(pc + 2);
            var jsrOffset = (offset16 & 0x8000) ? (offset16 - 0x10000) : offset16;
            var targetAddr = (a6 + jsrOffset) & 0xFFFFFF;
            console.log("[AmigaDoorSession] *** JSR (d16,A6) TRAP at PC=0x".concat(pc.toString(16), " -> target=0x").concat(targetAddr.toString(16), " ***"));
            // Manually push return address (JSR is 4 bytes)
            var returnAddr = pc + 4;
            var sp = this.emulator.getRegister(15);
            this.emulator.writeMemory32(sp - 4, returnAddr);
            this.emulator.setRegister(15, sp - 4);
            // Handle the trap
            var handled_1 = this.libraryTraps.handleTrapByOffset(jsrOffset, a6);
            if (handled_1) {
                // Mark as intercepted to prevent duplicate handling
                this.lastInterceptedTrap = targetAddr;
                this.lastInterceptedIteration = this.iterationCount;
                return Promise.resolve(true);
            }
            return Promise.resolve(false);
        }
        // Handle trap at current PC (PC is already at library vector)
        console.log("[AmigaDoorSession] *** DIRECT TRAP at PC=0x".concat(pc.toString(16), " (offset=").concat(offset, ", A6=0x").concat(a6.toString(16), ") ***"));
        var handled = isTrapAddress
            ? this.libraryTraps.handleTrap(pc)
            : this.libraryTraps.handleTrapByOffset(offset, a6);
        if (handled) {
            // Mark as intercepted
            this.lastInterceptedTrap = pc;
            this.lastInterceptedIteration = this.iterationCount;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    };
    /**
     * Set up Socket.io event handlers for user input
     */
    AmigaDoorSession.prototype.setupSocketHandlers = function () {
        var _this = this;
        console.log('[AmigaDoorSession] Setting up socket handlers for door:input');
        // Handle user input (keystrokes)
        this.socket.on('door:input', function (data) {
            console.log("[AmigaDoorSession] \uD83C\uDFB9 door:input event received: \"".concat(data, "\" isRunning=").concat(_this.isRunning, " hasXIM=").concat(!!_this.ximProtocol));
            if (_this.isRunning && _this.ximProtocol) {
                console.log("[AmigaDoorSession] Received input from user: \"".concat(data, "\""));
                // Queue input for door to read via XIM GETKEY command
                _this.ximProtocol.queueInput(data);
            }
            else {
                console.log("[AmigaDoorSession] \u274C Input ignored: isRunning=".concat(_this.isRunning, " hasXIM=").concat(!!_this.ximProtocol));
            }
        });
        // Handle disconnection
        this.socket.on('disconnect', function () {
            console.log('[AmigaDoorSession] Socket disconnected, terminating door');
            _this.terminate();
        });
        // Handle explicit termination request
        this.socket.on('door:terminate', function () {
            console.log('[AmigaDoorSession] Termination requested by user');
            _this.terminate();
        });
    };
    /**
     * Initialize and start the door
     */
    AmigaDoorSession.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var kickstart, romData, doorDir, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        console.log("[AmigaDoorSession] Starting door: ".concat(this.config.executablePath));
                        this.socket.emit('door:status', { status: 'initializing' });
                        // Initialize emulator (16MB for full 24-bit address space)
                        this.emulator = new MoiraEmulator_1.MoiraEmulator(16 * 1024 * 1024);
                        return [4 /*yield*/, this.emulator.initialize()];
                    case 1:
                        _a.sent();
                        // Load Kickstart ROM to provide real library code at trap addresses
                        console.log('[AmigaDoorSession] Loading Kickstart ROM at 0xF80000...');
                        kickstart = new KickstartRom_1.KickstartRom();
                        romData = kickstart.getRomData();
                        this.emulator.loadROM(romData);
                        console.log("[AmigaDoorSession] Kickstart ROM loaded (".concat(romData.length, " bytes)"));
                        // Initialize Exec system (NO ROM BOOT - Option C Hybrid)
                        console.log('[AmigaDoorSession] Initializing Exec system (Option C Hybrid - no ROM boot)...');
                        return [4 /*yield*/, this.initializeExec()];
                    case 2:
                        _a.sent();
                        console.log('[AmigaDoorSession] Exec system initialized!');
                        console.log("[AmigaDoorSession] ExecBase at 0x".concat(this.execLibrary.getExecBaseAddress().toString(16)));
                        // Load the door executable
                        console.log('[AmigaDoorSession] Loading door executable...');
                        return [4 /*yield*/, this.loadDoor()];
                    case 3:
                        _a.sent();
                        doorDir = path.dirname(this.config.executablePath);
                        if (this.dosLibrary) {
                            this.dosLibrary.setDoorDirectory(doorDir);
                            console.log("[AmigaDoorSession] Set door directory: ".concat(doorDir));
                        }
                        // Set up timeout
                        if (this.config.timeout) {
                            this.executionTimer = setTimeout(function () {
                                console.log('[AmigaDoorSession] Execution timeout');
                                _this.socket.emit('door:error', { message: 'Execution timeout' });
                                _this.terminate();
                            }, this.config.timeout * 1000);
                        }
                        // Start door execution
                        this.isRunning = true;
                        console.log('[AmigaDoorSession] 🚪 Emitting door:status = running');
                        this.socket.emit('door:status', { status: 'running' });
                        console.log('[AmigaDoorSession] Starting door execution...');
                        // VERIFY registers one more time before starting execution loop
                        console.log('[AmigaDoorSession] === PRE-EXECUTION REGISTER CHECK ===');
                        console.log("  PC: 0x".concat(this.emulator.getRegister(16).toString(16)));
                        console.log("  SP: 0x".concat(this.emulator.getRegister(15).toString(16)));
                        console.log("  A6: 0x".concat(this.emulator.getRegister(14).toString(16)));
                        console.log("  SR: 0x".concat(this.emulator.getRegister(17).toString(16)));
                        // CRITICAL: Door polls address 0x2001 in a loop at PC=0x1156
                        // The instruction is: MOVE.B ($2000,A1),D0 where A1=0x1
                        // Effective address = 0x1 + 0x2000 = 0x2001
                        //
                        // The door reads byte at 0x2001 and uses DBRA to loop
                        // We set this to 0 initially - door should change it or we should signal completion
                        this.emulator.writeMemory(0x2001, 0);
                        console.log('[AmigaDoorSession] Set memory[0x2001] = 0 (polling flag)');
                        // CRITICAL: Must await the execution loop so start() doesn't return until door completes
                        return [4 /*yield*/, this.runExecutionLoop()];
                    case 4:
                        // CRITICAL: Must await the execution loop so start() doesn't return until door completes
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        error_1 = _a.sent();
                        console.error('[AmigaDoorSession] Error starting door:', error_1);
                        this.socket.emit('door:error', {
                            message: error_1 instanceof Error ? error_1.message : 'Unknown error'
                        });
                        this.terminate();
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Initialize Exec system with Kickstart ROM
     * Loads Kickstart ROM for proper exception handling and system initialization
     */
    AmigaDoorSession.prototype.initializeExec = function () {
        return __awaiter(this, void 0, void 0, function () {
            var romPath, romData, nodeId, portName, portAddr, userName, userLocation, i, serverPortName, serverPortAddr;
            var _this = this;
            var _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                if (!this.emulator)
                    throw new Error('Emulator not initialized');
                console.log('[AmigaDoorSession] Loading Kickstart ROM...');
                romPath = path.join(__dirname, '../../data/amiga-roms/Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom');
                romData = fs.readFileSync(romPath);
                this.emulator.loadROM(new Uint8Array(romData));
                console.log('[AmigaDoorSession] Kickstart ROM loaded - provides ROM routines');
                console.log('[AmigaDoorSession] Creating ExecBase structure...');
                this.execLibrary = new ExecLibrary_1.ExecLibrary(this.emulator);
                this.execLibrary.initialize();
                // CORRECT IMPLEMENTATION per express.e lines 4322-4324:
                // BBS checks if port exists (FindPort), creates it if not (CreatePort)
                // This handles both fresh start (port doesn't exist) and door already running (port exists)
                console.log('[AmigaDoorSession] Creating AEDoorPort for door communication...');
                nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
                portName = "AEDoorPort".concat(nodeId);
                portAddr = this.execLibrary.createPublicPort(portName);
                console.log("[AmigaDoorSession] Created ".concat(portName, " at 0x").concat(portAddr.toString(16)));
                // Store for message handling
                this.doorPortAddress = portAddr;
                console.log('[AmigaDoorSession] Creating XIM Protocol handler...');
                // Create XIM protocol handler for door communication
                this.ximProtocol = new XIMProtocol_1.XIMProtocol(this.emulator, this.execLibrary, this.socket, portAddr);
                console.log('[AmigaDoorSession] Creating DOS.library...');
                // Create DosLibrary for file I/O and console operations
                this.dosLibrary = new DOSLibrary_1.DosLibrary(this.emulator);
                this.dosLibrary.setInheritedHandles(1, 2);
                // CRITICAL FIX: Set output callback so DOS Write() sends to terminal
                // WHO door and other DOS-based doors use Write() instead of AEDoor WriteStr()
                this.dosLibrary.setOutputCallback(function (text) {
                    _this.socket.emit('ansi-output', text);
                });
                console.log('[AmigaDoorSession] DOS.library output callback configured');
                console.log('[AmigaDoorSession] Initializing node status semaphores for WHO doors...');
                // Initialize multiPort/singlePort semaphore structures for WHO door access
                // WHO doors (like RTW) search for node information via FindPort()
                NodeStatusManager_1.nodeStatusManager.initializeInEmulator(this.emulator, 0xB0000);
                userName = ((_c = (_b = this.config.bbsSession) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.username) || 'Unknown';
                userLocation = ((_e = (_d = this.config.bbsSession) === null || _d === void 0 ? void 0 : _d.user) === null || _e === void 0 ? void 0 : _e.location) || '';
                NodeStatusManager_1.nodeStatusManager.updateNode(this.emulator, nodeId, {
                    status: NodeStatusManager_1.NodeStatus.ENV_DOORS,
                    handle: userName,
                    location: userLocation,
                    misc1: path.basename(this.config.executablePath), // Door name
                    misc2: 1, // Available for chat
                    baud: '57600' // Default baud rate
                });
                console.log("[AmigaDoorSession] Node ".concat(nodeId, " status: ").concat(userName, " running ").concat(path.basename(this.config.executablePath)));
                // RTW and other WHO doors search for "AEServer.%d" ports to detect active nodes
                // Create AEServer ports for all nodes (WHO doors check which exist via FindPort)
                console.log('[AmigaDoorSession] Creating AEServer ports for node detection...');
                for (i = 0; i < 8; i++) {
                    serverPortName = "AEServer.".concat(i);
                    serverPortAddr = this.execLibrary.createPublicPort(serverPortName);
                    console.log("[AmigaDoorSession] Created ".concat(serverPortName, " at 0x").concat(serverPortAddr.toString(16)));
                }
                console.log('[AmigaDoorSession] AEServer ports created for WHO door node detection');
                console.log('[AmigaDoorSession] Creating AEDoor.library...');
                // Create AEDoorLibrary with socket and session data
                this.aedoorLibrary = new AEDoorLibrary_1.AEDoorLibrary(this.socket, this.emulator, this.config.bbsSession || {});
                console.log('[AmigaDoorSession] Installing library call traps...');
                this.libraryTraps = new LibraryTraps_1.LibraryTraps(this.emulator, this.execLibrary);
                this.libraryTraps.installExecVectors();
                // Set DOS.library reference
                this.libraryTraps.setDOSLibrary(this.dosLibrary);
                // Set AEDoorLibrary reference
                this.libraryTraps.setAEDoorLibrary(this.aedoorLibrary);
                // Set up callback to install library vectors when libraries are opened
                this.execLibrary.setLibraryOpenedCallback(function (name, addr) {
                    if (name.toLowerCase() === 'dos.library') {
                        console.log('[AmigaDoorSession] dos.library opened, installing vectors...');
                        _this.libraryTraps.installDOSVectors();
                    }
                    if (name.toLowerCase() === 'aedoor.library') {
                        console.log('[AmigaDoorSession] AEDoor.library opened, installing vectors...');
                        _this.libraryTraps.installAEDoorVectors();
                    }
                });
                // Set up callback for when door sends messages to AEDoorPort
                // This replaces polling GetMsg() with trap-based interception
                this.execLibrary.setDoorMessageCallback(function (portAddr, msgAddr) {
                    _this.handleDoorMessage(portAddr, msgAddr);
                });
                // Set up library call monitoring to track what door is doing during polling loop
                this.libraryTraps.setLibraryCallMonitor(function (functionName, pc) {
                    // Track library calls during polling loop
                    if (_this.startupMessageSent && _this.iterationCount >= 1000) {
                        _this.libraryCallsInLoop++;
                        console.log("[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***");
                        console.log("[AmigaDoorSession]   Function: ".concat(functionName));
                        console.log("[AmigaDoorSession]   PC: 0x".concat(pc.toString(16)));
                        console.log("[AmigaDoorSession]   Iteration: ".concat(_this.iterationCount));
                        console.log("[AmigaDoorSession]   Total calls in loop: ".concat(_this.libraryCallsInLoop));
                    }
                });
                console.log('[AmigaDoorSession] Exec system ready');
                return [2 /*return*/];
            });
        });
    };
    /**
     * Load door executable
     */
    AmigaDoorSession.prototype.loadDoor = function () {
        return __awaiter(this, void 0, void 0, function () {
            var binary, hunkLoader, hunkFile, i, seg, execBaseAddr, ARGV_BASE, ARGV_ARRAY, ARG0_STRING, ARG1_STRING, progName, i, nodeId, nodeStr, i, initialSP, finalSP, exitTrapAddress, offset, STACK_FN_OFFSET, offset, stubAddr, verifyFinalSP, verifyFinalPC, verifyFinalA0, verifyMemory;
            var _a;
            return __generator(this, function (_b) {
                if (!this.emulator)
                    throw new Error('Emulator not initialized');
                if (!this.execLibrary)
                    throw new Error('Exec system not initialized');
                binary = fs.readFileSync(this.config.executablePath);
                console.log("[AmigaDoorSession] Door binary size: ".concat(binary.length, " bytes"));
                hunkLoader = new HunkLoader_1.HunkLoader();
                hunkFile = hunkLoader.parse(Buffer.from(binary));
                console.log("[AmigaDoorSession] Parsed ".concat(hunkFile.segments.length, " segments:"));
                for (i = 0; i < hunkFile.segments.length; i++) {
                    seg = hunkFile.segments[i];
                    console.log("  Segment ".concat(i, ": ").concat(seg.type.toUpperCase(), " at 0x").concat(seg.address.toString(16), ", size=").concat(seg.size, " bytes"));
                }
                // Load segments into memory
                hunkLoader.load(this.emulator, hunkFile);
                console.log("[AmigaDoorSession] Door loaded at entry point: 0x".concat(hunkFile.entryPoint.toString(16)));
                // Set up CPU for door execution
                // CRITICAL: Set SR FIRST before other registers, as setSR might affect CPU state
                console.log('[AmigaDoorSession] Setting up CPU registers...');
                // Set CPU to SUPERVISOR MODE (bit 13 of SR) to allow privileged instructions
                // SR = 0x2700 = supervisor mode with interrupts disabled
                this.emulator.setRegister(17, 0x2700); // SR (Status Register)
                console.log("  SR: 0x2700 (supervisor mode)");
                execBaseAddr = this.execLibrary.getExecBaseAddress();
                this.emulator.setRegister(14, execBaseAddr); // A6 = ExecBase
                console.log("  A6 (ExecBase): 0x".concat(execBaseAddr.toString(16)));
                ARGV_BASE = 0x0F0000;
                ARGV_ARRAY = ARGV_BASE;
                ARG0_STRING = ARGV_BASE + 0x100;
                ARG1_STRING = ARGV_BASE + 0x200;
                progName = path.basename(this.config.executablePath);
                console.log("[AmigaDoorSession] Door program name: \"".concat(progName, "\""));
                // Write argv[0] = door program name
                for (i = 0; i < progName.length; i++) {
                    this.emulator.writeMemory(ARG0_STRING + i, progName.charCodeAt(i));
                }
                this.emulator.writeMemory(ARG0_STRING + progName.length, 0); // Null terminator
                this.emulator.writeMemory32(ARGV_ARRAY + 0, ARG0_STRING);
                nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
                nodeStr = nodeId.toString();
                for (i = 0; i < nodeStr.length; i++) {
                    this.emulator.writeMemory(ARG1_STRING + i, nodeStr.charCodeAt(i));
                }
                this.emulator.writeMemory(ARG1_STRING + nodeStr.length, 0); // Null terminator
                this.emulator.writeMemory32(ARGV_ARRAY + 4, ARG1_STRING);
                // Write argv[2] = NULL (end of array)
                this.emulator.writeMemory32(ARGV_ARRAY + 8, 0);
                // Set argc=2, argv in registers (SAS C calling convention)
                this.emulator.setRegister(0, 2); // D0 = argc
                this.emulator.setRegister(8, ARGV_ARRAY); // A0 = argv
                console.log("  D0 (argc): 2");
                console.log("  A0 (argv): 0x".concat(ARGV_ARRAY.toString(16)));
                console.log("    argv[0]: \"".concat(progName, "\" at 0x").concat(ARG0_STRING.toString(16)));
                console.log("    argv[1]: \"".concat(nodeStr, "\" at 0x").concat(ARG1_STRING.toString(16)));
                // Now set PC
                this.emulator.setRegister(16, hunkFile.entryPoint); // PC
                console.log("  PC: 0x".concat(hunkFile.entryPoint.toString(16)));
                initialSP = 0xFE000;
                finalSP = 0xFDFFC;
                exitTrapAddress = 0xFFFF00;
                // CRITICAL FIX: Push exit sentinel at multiple stack locations
                // Door may push/pop values during initialization, changing SP
                // WHO door exit sequence: MOVE.L (A7)+,D0; MOVEM.L (A7)+,D1-D7/A0-A6; RTS
                // This pops 1 + 13 registers = 56 bytes before RTS
                // Cover wider range: finalSP-16 to finalSP+64 to handle all variations
                for (offset = -16; offset <= 64; offset += 4) {
                    this.emulator.writeMemory32(finalSP + offset, exitTrapAddress);
                }
                console.log("  Exit trap address: 0x".concat(exitTrapAddress.toString(16), " at 0x").concat((finalSP - 16).toString(16), "-0x").concat((finalSP + 64).toString(16)));
                STACK_FN_OFFSET = 0xE62;
                // Write RTS instruction at multiple locations to cover SP variations
                // Door might have SP anywhere from finalSP-16 to finalSP+16
                for (offset = -16; offset <= 16; offset += 2) {
                    stubAddr = finalSP + STACK_FN_OFFSET + offset;
                    this.emulator.writeMemory16(stubAddr, 0x4E75); // RTS
                }
                console.log("  Stack function stubs (RTS): 0x".concat((finalSP + STACK_FN_OFFSET - 16).toString(16), " to 0x").concat((finalSP + STACK_FN_OFFSET + 16).toString(16)));
                // Set SP LAST
                this.emulator.setRegister(15, finalSP); // A7 (SP)
                console.log("  SP: 0x".concat(finalSP.toString(16)));
                // CRITICAL FIX: Set A0 to AEDoorPort0 address
                // Door expects this in A0 and doesn't call FindPort()!
                // Discovery: Door uses A0 value directly for GetMsg/WaitPort calls
                console.log("[AmigaDoorSession] ===============================================");
                console.log("[AmigaDoorSession] CRITICAL FIX: Setting A0 to AEDoorPort0 address");
                console.log("[AmigaDoorSession] ===============================================");
                this.emulator.setRegister(8, this.doorPortAddress); // A0 = AEDoorPort0
                console.log("  A0: 0x".concat(this.doorPortAddress.toString(16), " (AEDoorPort0)"));
                console.log("[AmigaDoorSession] Door will now use correct port address!");
                console.log("[AmigaDoorSession] CPU configured for door execution");
                console.log('[AmigaDoorSession] Door ready to execute!');
                verifyFinalSP = this.emulator.getRegister(15);
                verifyFinalPC = this.emulator.getRegister(16);
                verifyFinalA0 = this.emulator.getRegister(8);
                console.log("[AmigaDoorSession] END OF loadDoor(): SP=0x".concat(verifyFinalSP.toString(16), ", PC=0x").concat(verifyFinalPC.toString(16), ", A0=0x").concat(verifyFinalA0.toString(16)));
                this.emulator.refillPrefetch();
                console.log('[AmigaDoorSession] Prefetch queue primed for first instruction');
                // CRITICAL FIX: Write AEDoorPort0 address to memory location 0xac
                // Discovery from A0 monitoring: Door reads port address from 0xac at iteration 168
                // The door loads A0 from this memory location instead of using FindPort()
                console.log("[AmigaDoorSession] ===============================================");
                console.log("[AmigaDoorSession] CRITICAL FIX: Writing port address to memory[0xac]");
                console.log("[AmigaDoorSession] ===============================================");
                this.emulator.writeMemory32(0xac, this.doorPortAddress);
                verifyMemory = this.emulator.readMemory32(0xac);
                console.log("  Memory[0xac] = 0x".concat(verifyMemory.toString(16), " (AEDoorPort0 address)"));
                console.log("[AmigaDoorSession] Door will now read correct port address from memory!");
                console.log("[AmigaDoorSession] ===============================================\n");
                // Initialize A0 monitoring to track when it gets overwritten
                this.lastA0Value = verifyFinalA0;
                console.log("[AmigaDoorSession] Starting A0 monitoring - will detect when door overwrites 0x".concat(verifyFinalA0.toString(16)));
                return [2 /*return*/];
            });
        });
    };
    AmigaDoorSession.prototype.checkA0RegisterChange = function () {
        if (this.a0ChangeDetected || !this.emulator)
            return;
        var currentA0 = this.emulator.getRegister(8);
        // Check if A0 changed from our initialized value (0xa0000)
        if (this.lastA0Value === 0xa0000 && currentA0 !== 0xa0000) {
            this.a0ChangeDetected = true;
            console.log('\n[AmigaDoorSession] ===============================================');
            console.log('[AmigaDoorSession] *** A0 REGISTER CHANGED! ***');
            console.log('[AmigaDoorSession] ===============================================');
            console.log("[AmigaDoorSession] Old A0: 0x".concat(this.lastA0Value.toString(16)));
            console.log("[AmigaDoorSession] New A0: 0x".concat(currentA0.toString(16)));
            console.log("[AmigaDoorSession] PC: 0x".concat(this.emulator.getRegister(16).toString(16)));
            console.log("[AmigaDoorSession] SP: 0x".concat(this.emulator.getRegister(15).toString(16)));
            console.log("[AmigaDoorSession] Iteration: ".concat(this.iterationCount));
            console.log('[AmigaDoorSession]');
            console.log('[AmigaDoorSession] Reading memory around current PC:');
            var pc = this.emulator.getRegister(16);
            var bytes = [];
            for (var i = -8; i <= 16; i++) {
                bytes.push(this.emulator.readMemory(pc + i).toString(16).padStart(2, '0'));
            }
            console.log("[AmigaDoorSession] Memory at PC-8 to PC+16: ".concat(bytes.join(' ')));
            console.log('[AmigaDoorSession]');
            console.log('[AmigaDoorSession] Checking if A0 value was loaded from memory:');
            // Check common patterns:
            // 1. Direct load from absolute address
            // 2. Load from offset off A4, A5, A6 (base registers)
            // 3. Load from stack
            // Try to find memory location containing the new A0 value
            var searchValue = currentA0;
            var foundLocations = [];
            // Search in common areas
            var searchAreas = [
                { start: 0x0, end: 0x1000, name: 'Low memory (vectors/globals)' },
                { start: 0x8000, end: 0x9000, name: 'AllocMem area' },
                { start: 0xfdf00, end: 0xfe100, name: 'Stack area' }
            ];
            for (var _i = 0, searchAreas_1 = searchAreas; _i < searchAreas_1.length; _i++) {
                var area = searchAreas_1[_i];
                for (var addr = area.start; addr <= area.end - 4; addr += 2) {
                    var value = this.emulator.readMemory32(addr);
                    if (value === searchValue) {
                        foundLocations.push(addr);
                    }
                }
            }
            if (foundLocations.length > 0) {
                console.log("[AmigaDoorSession] Found A0 value (0x".concat(searchValue.toString(16), ") in memory at:"));
                foundLocations.forEach(function (addr) {
                    console.log("[AmigaDoorSession]   - 0x".concat(addr.toString(16)));
                });
            }
            else {
                console.log("[AmigaDoorSession] Value 0x".concat(searchValue.toString(16), " not found in searched memory areas"));
                console.log("[AmigaDoorSession] Might be computed or loaded from unmapped area");
            }
            console.log('[AmigaDoorSession] ===============================================\n');
        }
        this.lastA0Value = currentA0;
    };
    /**
     * Count the number of set bits in a 16-bit value
     * Used for determining register count in MOVEM instructions
     */
    AmigaDoorSession.prototype.countBits = function (value) {
        var count = 0;
        for (var i = 0; i < 16; i++) {
            if (value & (1 << i)) {
                count++;
            }
        }
        return count;
    };
    /**
     * Decode M68K instruction for debugging (basic decoder)
     */
    AmigaDoorSession.prototype.decodeInstruction = function (pc, opcode) {
        // Basic M68K instruction decoder for common opcodes
        var hi = (opcode >> 8) & 0xFF;
        var lo = opcode & 0xFF;
        // MOVE.L
        if ((hi & 0xC0) === 0x00 && (hi & 0x30) === 0x20) {
            return "MOVE.L (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // MOVEM
        if ((hi & 0xFB) === 0x48 && (lo & 0xC0) === 0xC0) {
            return "MOVEM (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // JSR
        if (opcode === 0x4EB9 || (hi === 0x4E && (lo & 0xC0) === 0x80)) {
            var target = this.emulator.readMemory32(pc + 2);
            return "JSR 0x".concat(target.toString(16));
        }
        // RTS
        if (opcode === 0x4E75) {
            return 'RTS';
        }
        // RTE
        if (opcode === 0x4E73) {
            return 'RTE';
        }
        // TRAP
        if ((opcode & 0xFFF0) === 0x4E40) {
            var trapNum = opcode & 0x0F;
            return "TRAP #".concat(trapNum);
        }
        // MOVE to/from SR
        if ((opcode & 0xFFC0) === 0x46C0) {
            return "MOVE to SR (opcode: 0x".concat(opcode.toString(16), ")");
        }
        if ((opcode & 0xFFC0) === 0x40C0) {
            return "MOVE from SR (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // LEA
        if ((hi & 0xF1) === 0x41 && (lo & 0xC0) === 0xC0) {
            return "LEA (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // TST
        if ((hi & 0xFF) === 0x4A) {
            return "TST (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // BRA/Bcc
        if ((hi & 0xF0) === 0x60) {
            var cond = (hi & 0x0F);
            var condNames = ['BRA', 'BSR', 'BHI', 'BLS', 'BCC', 'BCS', 'BNE', 'BEQ',
                'BVC', 'BVS', 'BPL', 'BMI', 'BGE', 'BLT', 'BGT', 'BLE'];
            return "".concat(condNames[cond] || 'Bxx', " (opcode: 0x").concat(opcode.toString(16), ")");
        }
        // DBcc
        if ((hi & 0xF0) === 0x50 && (lo & 0xC8) === 0xC8) {
            return "DBcc (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // ADD/SUB
        if ((hi & 0xF0) === 0xD0) {
            return "ADD (opcode: 0x".concat(opcode.toString(16), ")");
        }
        if ((hi & 0xF0) === 0x90) {
            return "SUB (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // CMP
        if ((hi & 0xF0) === 0xB0) {
            return "CMP (opcode: 0x".concat(opcode.toString(16), ")");
        }
        // AND/OR
        if ((hi & 0xF0) === 0xC0) {
            return "AND (opcode: 0x".concat(opcode.toString(16), ")");
        }
        if ((hi & 0xF0) === 0x80) {
            return "OR (opcode: 0x".concat(opcode.toString(16), ")");
        }
        return "Unknown (opcode: 0x".concat(opcode.toString(16), ")");
    };
    /**
     * Main execution loop - CLEAN REWRITE (2025-11-02)
     *
     * Simple architecture:
     *   1. Check if paused (async input)
     *   2. Get current PC
     *   3. Check exit conditions
     *   4. UNIFIED trap detection (single check, no duplicates)
     *   5. Execute one instruction
     *   6. Yield to event loop
     *
     * This eliminates:
     *   - Multiple scattered trap detection blocks
     *   - Iteration-based conditional logic (< 1000 vs >= 1000)
     *   - Duplicate logging and complex nesting
     */
    AmigaDoorSession.prototype.runExecutionLoop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var entryPoint, bytes, i, pc, returnCode, d0_1, d1_1, spBefore, trapHandled, totalSeconds, isWaitingForInput, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.emulator || !this.isRunning)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 14, , 15]);
                        // Log initial state
                        console.log('[AmigaDoorSession] === EXECUTION LOOP STARTING ===');
                        console.log("[AmigaDoorSession] Initial PC: 0x".concat(this.emulator.getRegister(16).toString(16)));
                        console.log("[AmigaDoorSession] Initial SP: 0x".concat(this.emulator.getRegister(15).toString(16)));
                        console.log("[AmigaDoorSession] Initial A6: 0x".concat(this.emulator.getRegister(14).toString(16)));
                        entryPoint = 0x1000;
                        bytes = [];
                        for (i = 0; i < 16; i++) {
                            bytes.push(this.emulator.readMemory(entryPoint + i).toString(16).padStart(2, '0'));
                        }
                        console.log("[AmigaDoorSession] Code at 0x1000: ".concat(bytes.join(' ')));
                        _a.label = 2;
                    case 2:
                        if (!this.isRunning) return [3 /*break*/, 13];
                        if (!this.emulator.isPaused()) return [3 /*break*/, 4];
                        return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 4:
                        pc = this.emulator.getRegister(16);
                        if (!this.loggedMoveaStack && (pc === 0x11b2 || pc === 0x1232)) {
                            d0_1 = this.emulator.getRegister(0);
                            d1_1 = this.emulator.getRegister(1);
                            spBefore = this.emulator.getRegister(15);
                            this.dumpInstruction(pc);
                            console.log("[AmigaDoorSession] movea.l D0,A7 at PC=0x".concat(pc.toString(16), " -> D0=0x").concat(d0_1.toString(16), ", D1=0x").concat(d1_1.toString(16), ", SP(before)=0x").concat(spBefore.toString(16)));
                            this.loggedMoveaStack = true;
                        }
                        // === STEP 3: Check exit conditions ===
                        // Exit trap: Door returned to our sentinel address
                        if (pc === 0xFFFF00) {
                            returnCode = this.emulator.getRegister(0);
                            console.log("[AmigaDoorSession] === DOOR EXITED CLEANLY ===");
                            console.log("[AmigaDoorSession] Return code (D0): ".concat(returnCode));
                            console.log("[AmigaDoorSession] Total iterations: ".concat(this.iterationCount));
                            this.terminate();
                            return [2 /*return*/];
                        }
                        // Low memory PC (crash/corruption)
                        if (pc < 0x100 && this.iterationCount > 100) {
                            console.log("[AmigaDoorSession] PC in low memory (0x".concat(pc.toString(16), ") - likely stack corruption"));
                            console.log("[AmigaDoorSession] Total iterations: ".concat(this.iterationCount));
                            this.terminate();
                            return [2 /*return*/];
                        }
                        // ROM polling loop (door jumped into Kickstart routine)
                        return [4 /*yield*/, this.checkAndHandleLibraryTrap(pc)];
                    case 5:
                        trapHandled = _a.sent();
                        if (!trapHandled) return [3 /*break*/, 7];
                        this.iterationCount++;
                        return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 7:
                        // === STEP 5: Execute one instruction ===
                        this.emulator.execute(1);
                        this.totalCycles += 1;
                        // === STEP 6: Track progress and yield ===
                        this.iterationCount++;
                        // Log progress every 10k iterations
                        if (this.iterationCount % 10000 === 0) {
                            totalSeconds = this.totalCycles / (this.CYCLES_PER_MICROSECOND * 1000000);
                            console.log("[AmigaDoorSession] Iteration ".concat(this.iterationCount, ": ").concat((this.totalCycles / 1000000).toFixed(1), "M cycles, ").concat(totalSeconds.toFixed(2), "s virtual time, PC=0x").concat(pc.toString(16)));
                            // Prevent infinite loops (safety limit)
                            if (this.iterationCount > 100000) {
                                console.log("[AmigaDoorSession] Door running for 100k iterations - likely stuck in polling loop");
                                console.log("[AmigaDoorSession] PC=0x".concat(pc.toString(16)));
                                console.log("[AmigaDoorSession] Terminating for testing purposes");
                                this.terminate();
                                return [2 /*return*/];
                            }
                        }
                        isWaitingForInput = (this.ximProtocol && this.ximProtocol.isWaitingForLineInput());
                        if (!isWaitingForInput) return [3 /*break*/, 10];
                        if (!(this.iterationCount % 10 === 0)) return [3 /*break*/, 9];
                        return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                    case 8:
                        _a.sent();
                        _a.label = 9;
                    case 9: return [3 /*break*/, 12];
                    case 10:
                        if (!(this.iterationCount % 10000 === 0)) return [3 /*break*/, 12];
                        return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                    case 11:
                        _a.sent();
                        _a.label = 12;
                    case 12: return [3 /*break*/, 2];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        error_2 = _a.sent();
                        console.error('[AmigaDoorSession] Error in execution loop:', error_2);
                        this.socket.emit('door:error', {
                            message: error_2 instanceof Error ? error_2.message : 'Execution error'
                        });
                        this.terminate();
                        return [3 /*break*/, 15];
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send a test message to the door to verify message port communication
     */
    AmigaDoorSession.prototype.sendTestMessage = function () {
        var _a;
        if (!this.execLibrary || !this.emulator) {
            console.error('[AmigaDoorSession] Cannot send message: libraries not initialized');
            return;
        }
        console.log('[AmigaDoorSession] === SENDING TEST MESSAGE TO DOOR ===');
        // Find the AEDoorPort that we created during initialization
        var nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
        var portName = "AEDoorPort".concat(nodeId);
        // Allocate memory for port name string
        var portNameSize = portName.length + 1; // +1 for null terminator
        var portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
        // Write port name to memory
        for (var i = 0; i < portName.length; i++) {
            this.emulator.writeMemory(portNameAddr + i, portName.charCodeAt(i));
        }
        this.emulator.writeMemory(portNameAddr + portName.length, 0); // Null terminator
        console.log("[AmigaDoorSession] Looking for port \"".concat(portName, "\" (addr 0x").concat(portNameAddr.toString(16), ")"));
        // Call FindPort with memory address
        var portAddr = this.execLibrary.findPort(portNameAddr);
        // Free the port name memory
        this.execLibrary.freeMem(portNameAddr, portNameSize);
        if (portAddr === 0) {
            console.error("[AmigaDoorSession] AEDoorPort".concat(nodeId, " not found!"));
            return;
        }
        console.log("[AmigaDoorSession] Found ".concat(portName, " at 0x").concat(portAddr.toString(16)));
        // Allocate memory for a test message
        // struct Message (20 bytes) + AEDoor extension (variable)
        var msgSize = 128; // Enough for struct Message + data
        var msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
        if (msgAddr === 0) {
            console.error('[AmigaDoorSession] Failed to allocate message memory');
            return;
        }
        console.log("[AmigaDoorSession] Allocated message at 0x".concat(msgAddr.toString(16), " (").concat(msgSize, " bytes)"));
        // Create a reply port for the door to send responses
        var replyPortAddr = this.execLibrary.createMsgPort();
        console.log("[AmigaDoorSession] Created reply port at 0x".concat(replyPortAddr.toString(16)));
        // Fill in struct Message (20 bytes)
        // struct Message {
        //   struct Node mn_Node;         // 14 bytes (offset 0)
        //   struct MsgPort *mn_ReplyPort; // 4 bytes (offset 14)
        //   UWORD mn_Length;             // 2 bytes (offset 18)
        // }
        // mn_Node (14 bytes)
        this.emulator.writeMemory32(msgAddr + 0, 0); // ln_Succ
        this.emulator.writeMemory32(msgAddr + 4, 0); // ln_Pred
        this.emulator.writeMemory(msgAddr + 8, 5); // ln_Type (NT_MESSAGE=5)
        this.emulator.writeMemory(msgAddr + 9, 0); // ln_Pri
        this.emulator.writeMemory32(msgAddr + 10, 0); // ln_Name
        // mn_ReplyPort
        this.emulator.writeMemory32(msgAddr + 14, replyPortAddr);
        // mn_Length
        this.emulator.writeMemory16(msgAddr + 18, msgSize);
        // AEDoor message extension (starts at offset 20)
        // For now, just send a simple test command
        var TEST_COMMAND = 1; // Some test command
        var testData = 0x12345678;
        this.emulator.writeMemory32(msgAddr + 20, TEST_COMMAND); // command
        this.emulator.writeMemory32(msgAddr + 24, testData); // data
        // Write test string
        var testString = "Hello from BBS!\n";
        for (var i = 0; i < testString.length; i++) {
            this.emulator.writeMemory(msgAddr + 28 + i, testString.charCodeAt(i));
        }
        this.emulator.writeMemory(msgAddr + 28 + testString.length, 0); // Null terminator
        console.log('[AmigaDoorSession] Message structure:');
        console.log("  mn_ReplyPort: 0x".concat(replyPortAddr.toString(16)));
        console.log("  mn_Length: ".concat(msgSize));
        console.log("  command: ".concat(TEST_COMMAND));
        console.log("  data: 0x".concat(testData.toString(16)));
        console.log("  string: \"".concat(testString.trim(), "\""));
        // Send the message using PutMsg()
        console.log("[AmigaDoorSession] Calling PutMsg(port=0x".concat(portAddr.toString(16), ", msg=0x").concat(msgAddr.toString(16), ")"));
        this.execLibrary.putMsg(portAddr, msgAddr);
        console.log('[AmigaDoorSession] === TEST MESSAGE SENT ===');
        console.log('[AmigaDoorSession] Door should now receive this message via WaitPort()/GetMsg()');
    };
    /**
     * Send startup/initialization message to door
     *
     * This is sent when the door enters its GetMsg() polling loop.
     * The door expects the BBS to send an initial message to trigger
     * the door to start its main request/reply communication loop.
     */
    AmigaDoorSession.prototype.sendStartupMessage = function () {
        var _a;
        if (!this.execLibrary || !this.emulator) {
            console.error('[AmigaDoorSession] Cannot send startup message: libraries not initialized');
            return;
        }
        console.log('[AmigaDoorSession] === SENDING STARTUP MESSAGE TO DOOR ===');
        // The door is polling AEDoorPort0 (created at 0xa0000 during init)
        var portAddr = this.doorPortAddress || 0xa0000;
        console.log("[AmigaDoorSession] Target port: AEDoorPort0 at 0x".concat(portAddr.toString(16)));
        // Allocate memory for startup message
        var msgSize = 128;
        var msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
        if (msgAddr === 0) {
            console.error('[AmigaDoorSession] Failed to allocate startup message memory');
            return;
        }
        console.log("[AmigaDoorSession] Allocated startup message at 0x".concat(msgAddr.toString(16), " (").concat(msgSize, " bytes)"));
        // Create reply port (door will reply to this)
        var replyPortAddr = this.execLibrary.createMsgPort();
        console.log("[AmigaDoorSession] Created reply port at 0x".concat(replyPortAddr.toString(16)));
        // Fill in struct Message (20 bytes)
        // mn_Node (14 bytes)
        this.emulator.writeMemory32(msgAddr + 0, 0); // ln_Succ
        this.emulator.writeMemory32(msgAddr + 4, 0); // ln_Pred
        this.emulator.writeMemory(msgAddr + 8, 5); // ln_Type (NT_MESSAGE=5)
        this.emulator.writeMemory(msgAddr + 9, 0); // ln_Pri
        this.emulator.writeMemory32(msgAddr + 10, 0); // ln_Name
        // mn_ReplyPort
        this.emulator.writeMemory32(msgAddr + 14, replyPortAddr);
        // mn_Length
        this.emulator.writeMemory16(msgAddr + 18, msgSize);
        // AEDoor message extension (starts at offset 20)
        // command = 0 (startup/init)
        // data = node ID
        var STARTUP_COMMAND = 0;
        var nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
        this.emulator.writeMemory32(msgAddr + 20, STARTUP_COMMAND); // command
        this.emulator.writeMemory32(msgAddr + 24, nodeId); // data
        // Empty string for startup
        this.emulator.writeMemory(msgAddr + 28, 0); // Null terminator
        console.log('[AmigaDoorSession] Startup message structure:');
        console.log("  mn_ReplyPort: 0x".concat(replyPortAddr.toString(16)));
        console.log("  mn_Length: ".concat(msgSize));
        console.log("  command: ".concat(STARTUP_COMMAND, " (STARTUP/INIT)"));
        console.log("  data: ".concat(nodeId, " (node ID)"));
        console.log("  string: \"\" (empty)");
        // Send the message using PutMsg()
        console.log("[AmigaDoorSession] Calling PutMsg(port=0x".concat(portAddr.toString(16), ", msg=0x").concat(msgAddr.toString(16), ")"));
        this.execLibrary.putMsg(portAddr, msgAddr);
        console.log('[AmigaDoorSession] === STARTUP MESSAGE SENT ===');
        console.log('[AmigaDoorSession] Door should receive this via GetMsg() and exit polling loop');
    };
    /**
     * Force door to return from ROM WaitPort loop
     *
     * When the door calls WaitPort() and the queue is empty, WaitPort returns 0.
     * The door then loops waiting. If it jumped into ROM code to do this waiting,
     * it gets stuck there.
     *
     * This method forces the door to return from WaitPort by:
     * 1. Setting D0 to the message address (or 0 if still no messages)
     * 2. Popping the return address from stack
     * 3. Setting PC to that return address
     * 4. Refilling the prefetch queue
     */
    AmigaDoorSession.prototype.forceROMReturn = function () {
        var _a;
        if (!this.emulator || !this.execLibrary) {
            console.error('[AmigaDoorSession] Cannot force ROM return: not initialized');
            return false;
        }
        console.log('[AmigaDoorSession] Attempting to return door from ROM...');
        // Check if there's a return address on stack
        var sp = this.emulator.getRegister(15); // A7 = Stack Pointer
        console.log("[AmigaDoorSession]   Current SP: 0x".concat(sp.toString(16)));
        // Read return address from stack
        var returnAddr = this.emulator.readMemory32(sp);
        console.log("[AmigaDoorSession]   Return address on stack: 0x".concat(returnAddr.toString(16)));
        // Validate return address (should be in door code range)
        if (returnAddr < 0x1000 || returnAddr > 0x100000) {
            console.error("[AmigaDoorSession]   Invalid return address: 0x".concat(returnAddr.toString(16)));
            return false;
        }
        // Check for messages in AEDoorPort0
        var nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
        var portName = "AEDoorPort".concat(nodeId);
        // Allocate memory for port name
        var portNameSize = portName.length + 1;
        var portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001);
        for (var i = 0; i < portName.length; i++) {
            this.emulator.writeMemory(portNameAddr + i, portName.charCodeAt(i));
        }
        this.emulator.writeMemory(portNameAddr + portName.length, 0);
        // Find port
        var portAddr = this.execLibrary.findPort(portNameAddr);
        this.execLibrary.freeMem(portNameAddr, portNameSize);
        if (portAddr === 0) {
            console.error('[AmigaDoorSession]   Port not found!');
            return false;
        }
        // Call WaitPort to get message (if any)
        var msgAddr = this.execLibrary.waitPort(portAddr);
        console.log("[AmigaDoorSession]   WaitPort returned: 0x".concat(msgAddr.toString(16)));
        // Set D0 to message address (WaitPort return value)
        this.emulator.setRegister(0, msgAddr);
        console.log("[AmigaDoorSession]   Set D0 = 0x".concat(msgAddr.toString(16)));
        // Pop return address from stack (RTS behavior)
        this.emulator.setRegister(15, sp + 4); // SP += 4
        console.log("[AmigaDoorSession]   Adjusted SP to 0x".concat((sp + 4).toString(16)));
        // Set PC to return address
        this.emulator.setRegister(16, returnAddr);
        console.log("[AmigaDoorSession]   Set PC = 0x".concat(returnAddr.toString(16)));
        // Refill prefetch queue (critical!)
        this.emulator.refillPrefetch();
        console.log("[AmigaDoorSession]   Refilled prefetch queue");
        console.log('[AmigaDoorSession] *** DOOR RETURNED FROM ROM ***');
        console.log("[AmigaDoorSession]   Door should now process message at 0x".concat(msgAddr.toString(16)));
        return true;
    };
    /**
     * Handle door message (trap-based, not polling)
     *
     * Called by ExecLibrary when door calls PutMsg() to send to AEDoorPort.
     * This is the CORRECT XIM protocol implementation.
     */
    AmigaDoorSession.prototype.handleDoorMessage = function (portAddr, msgAddr) {
        if (!this.emulator || !this.execLibrary)
            return;
        console.log("[AmigaDoorSession] ===============================================");
        console.log("[AmigaDoorSession] *** DOOR MESSAGE RECEIVED (via PutMsg trap) ***");
        console.log("[AmigaDoorSession] ===============================================");
        console.log("[AmigaDoorSession]   Port: 0x".concat(portAddr.toString(16)));
        console.log("[AmigaDoorSession]   Message: 0x".concat(msgAddr.toString(16)));
        // Parse message structure (same as processDoorMessages)
        var mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
        var mn_Length = this.emulator.readMemory16(msgAddr + 18);
        // AEDoor message extension (after struct Message)
        var command = this.emulator.readMemory32(msgAddr + 20);
        var data = this.emulator.readMemory32(msgAddr + 24);
        // Read string (first 128 bytes max)
        var str = '';
        for (var i = 0; i < 128; i++) {
            var ch = this.emulator.readMemory(msgAddr + 28 + i);
            if (ch === 0)
                break;
            str += String.fromCharCode(ch);
        }
        console.log("[AmigaDoorSession]   Command: ".concat(command));
        console.log("[AmigaDoorSession]   Data: ".concat(data));
        console.log("[AmigaDoorSession]   String: \"".concat(str, "\""));
        console.log("[AmigaDoorSession]   Reply port: 0x".concat(mn_ReplyPort.toString(16)));
        // Use XIM Protocol handler to process and respond
        if (this.ximProtocol) {
            var ximMessage = this.ximProtocol.parseMessage(msgAddr);
            this.ximProtocol.handleMessage(ximMessage);
        }
        else {
            console.log("[AmigaDoorSession] WARNING: XIM Protocol not initialized!");
            // Fall back to old handler
            this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
        }
        console.log("[AmigaDoorSession] ===============================================");
    };
    /**
     * Process messages from the door (OLD POLLING VERSION - DISABLED)
     *
     * The door sends messages TO the AEDoorPort requesting actions.
     * Based on express.e lines 4350-4400 (processXimMsg).
     *
     * NOTE: This is now replaced by handleDoorMessage() which is trap-based.
     */
    AmigaDoorSession.prototype.processDoorMessages = function () {
        var _a;
        if (!this.emulator || !this.execLibrary)
            return;
        // Find the AEDoorPort if we haven't already (door creates it, we find it)
        if (this.doorPortAddress === 0) {
            var nodeId = ((_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
            var portName = "AEDoorPort".concat(nodeId);
            // Allocate memory for port name
            var portNameSize = portName.length + 1;
            var portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001);
            for (var i = 0; i < portName.length; i++) {
                this.emulator.writeMemory(portNameAddr + i, portName.charCodeAt(i));
            }
            this.emulator.writeMemory(portNameAddr + portName.length, 0);
            // Find port
            this.doorPortAddress = this.execLibrary.findPort(portNameAddr);
            this.execLibrary.freeMem(portNameAddr, portNameSize);
            if (this.doorPortAddress === 0) {
                // Port not created yet, door hasn't started
                return;
            }
            console.log("[AmigaDoorSession] Found ".concat(portName, " at 0x").concat(this.doorPortAddress.toString(16), " (door created it!)"));
        }
        // Poll the AEDoorPort for messages
        var msgAddr = this.execLibrary.getMsg(this.doorPortAddress);
        if (msgAddr === 0) {
            // No message
            return;
        }
        console.log("[AmigaDoorSession] ===============================================");
        console.log("[AmigaDoorSession] *** DOOR MESSAGE RECEIVED! ***");
        console.log("[AmigaDoorSession] ===============================================");
        console.log("[AmigaDoorSession]   Message address: 0x".concat(msgAddr.toString(16)));
        // Parse message structure
        var mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
        var mn_Length = this.emulator.readMemory16(msgAddr + 18);
        // AEDoor message extension (after struct Message)
        var command = this.emulator.readMemory32(msgAddr + 20);
        var data = this.emulator.readMemory32(msgAddr + 24);
        // Read string (first 128 bytes max)
        var str = '';
        for (var i = 0; i < 128; i++) {
            var ch = this.emulator.readMemory(msgAddr + 28 + i);
            if (ch === 0)
                break;
            str += String.fromCharCode(ch);
        }
        console.log("[AmigaDoorSession]   Command: ".concat(command));
        console.log("[AmigaDoorSession]   Data: ".concat(data));
        console.log("[AmigaDoorSession]   String: \"".concat(str, "\""));
        console.log("[AmigaDoorSession]   Reply port: 0x".concat(mn_ReplyPort.toString(16)));
        // Process command based on type
        // Command constants from aedoor.h:
        // JH_WRITE = 3 (write text to terminal)
        // DT_NAME = 100 (get user name)
        // GETKEY = 500 (get user input)
        this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
        console.log("[AmigaDoorSession] ===============================================");
    };
    /**
     * Process a specific door command
     *
     * Based on express.e processXimMsg() and aedoor.h command constants
     */
    AmigaDoorSession.prototype.processCommand = function (command, data, str, msgAddr, replyPortAddr) {
        var _a, _b, _c, _d, _e, _f;
        console.log("[AmigaDoorSession] Processing command ".concat(command, "..."));
        // Command constants from aedoor.h
        var JH_LI = 0; // Line Input
        var JH_REGISTER = 1; // Register door with BBS
        var JH_SHUTDOWN = 2; // Shutdown door
        var JH_WRITE = 3; // Write text to terminal
        var JH_SM = 4; // Send Message
        var JH_PM = 5; // Post Message
        var JH_HK = 6; // HotKey
        var JH_SG = 7; // Show GFile
        var JH_SF = 8; // Show File
        var DT_NAME = 100;
        var DT_LOCATION = 102;
        var DT_PHONENUMBER = 103;
        var DT_SECLEVEL = 105;
        var GETKEY = 500;
        switch (command) {
            case JH_LI:
                // Line Input - door is requesting line input from user
                console.log("[AmigaDoorSession]   JH_LI: Door requesting line input");
                console.log("[AmigaDoorSession]   Max length: ".concat(data));
                // TODO: Pause door execution and wait for user input
                // For now, return empty string (user pressed Enter)
                this.writeStringToMessage(msgAddr, '');
                console.log("[AmigaDoorSession]   Returned empty string (simulated Enter key)");
                break;
            case JH_REGISTER:
                // Register door with BBS
                console.log("[AmigaDoorSession]   JH_REGISTER: Door registering with BBS");
                console.log("[AmigaDoorSession]   Door is now active and ready");
                // No response data needed, just reply
                break;
            case JH_SHUTDOWN:
                // Door is shutting down
                console.log("[AmigaDoorSession]   JH_SHUTDOWN: Door shutting down");
                console.log("[AmigaDoorSession]   Terminating door session");
                // Reply and then terminate
                this.execLibrary.putMsg(replyPortAddr, msgAddr);
                this.terminate();
                return; // Don't send reply again
            case JH_WRITE:
                // Write text to terminal
                console.log("[AmigaDoorSession]   JH_WRITE: \"".concat(str, "\""));
                console.log("[AmigaDoorSession]   Data (LF flag): ".concat(data));
                // Send text to user's terminal
                var output = str;
                if (data === 1) {
                    // LF flag set - add line feed
                    output += '\r\n';
                }
                this.socket.emit('ansi-output', output);
                console.log("[AmigaDoorSession]   Sent to terminal: \"".concat(output, "\""));
                break;
            case DT_NAME:
                // Get user name - write to message string field
                console.log("[AmigaDoorSession]   DT_NAME: Request for user name");
                var userName = ((_b = (_a = this.config.bbsSession) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.username) || 'Sysop';
                this.writeStringToMessage(msgAddr, userName);
                console.log("[AmigaDoorSession]   Replied with name: \"".concat(userName, "\""));
                break;
            case DT_LOCATION:
                // Get user location
                console.log("[AmigaDoorSession]   DT_LOCATION: Request for user location");
                var location_1 = ((_d = (_c = this.config.bbsSession) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.location) || 'Unknown';
                this.writeStringToMessage(msgAddr, location_1);
                console.log("[AmigaDoorSession]   Replied with location: \"".concat(location_1, "\""));
                break;
            case DT_SECLEVEL:
                // Get security level
                console.log("[AmigaDoorSession]   DT_SECLEVEL: Request for security level");
                var secLevel = ((_f = (_e = this.config.bbsSession) === null || _e === void 0 ? void 0 : _e.user) === null || _f === void 0 ? void 0 : _f.secLevel) || 100;
                // Write to data field (offset 24)
                this.emulator.writeMemory32(msgAddr + 24, secLevel);
                console.log("[AmigaDoorSession]   Replied with sec level: ".concat(secLevel));
                break;
            case GETKEY:
                // Get user input - this requires pausing execution
                console.log("[AmigaDoorSession]   GETKEY: Request for user input");
                console.log("[AmigaDoorSession]   TODO: Implement input handling (pause execution, wait for key)");
                // For now, just reply with Enter key (0x0D)
                this.emulator.writeMemory32(msgAddr + 24, 0x0D);
                break;
            default:
                console.log("[AmigaDoorSession]   Unknown command: ".concat(command));
                console.log("[AmigaDoorSession]   TODO: Implement handler for this command");
                break;
        }
        // Reply to the door by sending message back to its reply port
        this.execLibrary.putMsg(replyPortAddr, msgAddr);
        console.log("[AmigaDoorSession]   Sent reply to door at port 0x".concat(replyPortAddr.toString(16)));
    };
    /**
     * Write a string to the message string field (offset 28)
     */
    AmigaDoorSession.prototype.writeStringToMessage = function (msgAddr, str) {
        if (!this.emulator)
            return;
        // Write string to offset 28 (after Message header + command + data)
        for (var i = 0; i < str.length && i < 200; i++) {
            this.emulator.writeMemory(msgAddr + 28 + i, str.charCodeAt(i));
        }
        // Null terminate
        this.emulator.writeMemory(msgAddr + 28 + str.length, 0);
    };
    /**
     * Terminate the door session
     */
    AmigaDoorSession.prototype.terminate = function () {
        if (!this.isRunning)
            return;
        console.log('[AmigaDoorSession] Terminating door session');
        this.isRunning = false;
        if (this.executionTimer) {
            clearTimeout(this.executionTimer);
            this.executionTimer = null;
        }
        if (this.emulator) {
            this.emulator.cleanup();
            this.emulator = null;
        }
        console.log('[AmigaDoorSession] 🚪 Emitting door:status = terminated');
        this.socket.emit('door:status', { status: 'terminated' });
        console.log('[AmigaDoorSession] Door session terminated');
    };
    AmigaDoorSession.prototype.dumpInstruction = function (pc, count) {
        if (count === void 0) { count = 8; }
        if (!this.emulator) {
            return;
        }
        var words = [];
        for (var offset = 0; offset < count; offset += 2) {
            var value = this.emulator.readMemory16(pc + offset);
            words.push("0x".concat(value.toString(16).padStart(4, '0')));
        }
        console.log("[AmigaDoorSession] Instruction dump @0x".concat(pc.toString(16), ": ").concat(words.join(', ')));
    };
    return AmigaDoorSession;
}());
exports.AmigaDoorSession = AmigaDoorSession;
