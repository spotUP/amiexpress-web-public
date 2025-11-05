"use strict";
/**
 * AEDoor.library Implementation
 *
 * This implements the AmiExpress Door Interface library that doors use to communicate
 * with the BBS. Based on analysis of AmiExpress-Sources/express.e lines 3379-3500.
 *
 * ARCHITECTURE:
 * - Original: Doors send messages (JH_WRITE, JH_PM, DT_NAME, etc.) via Amiga message ports
 * - Our approach: Trap AEDoor.library functions and handle directly (skip message passing)
 *
 * CRITICAL FUNCTIONS (from AEDOOR_FUNCTION_OFFSETS.md):
 * - CreateComm (-30)   : Initialize door interface
 * - DeleteComm (-36)   : Cleanup door interface
 * - GetString (-72)    : Get pointer to shared string buffer
 * - Prompt (-78)       : Get user input with prompt
 * - WriteStr (-84)     : Output text to terminal
 * - GetDT (-108)       : Get user data (name, location, etc.)
 */
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
exports.AEDoorLibrary = exports.DTCommand = void 0;
/**
 * DT_* Constants - Data Type requests (from AEDOOR_API_REFERENCE.md)
 */
var DTCommand;
(function (DTCommand) {
    DTCommand[DTCommand["DT_NAME"] = 0] = "DT_NAME";
    DTCommand[DTCommand["DT_PASSWORD"] = 1] = "DT_PASSWORD";
    DTCommand[DTCommand["DT_LOCATION"] = 2] = "DT_LOCATION";
    DTCommand[DTCommand["DT_PHONE"] = 3] = "DT_PHONE";
    DTCommand[DTCommand["DT_DATAPHONE"] = 4] = "DT_DATAPHONE";
    DTCommand[DTCommand["DT_BIRTHDAY"] = 5] = "DT_BIRTHDAY";
    DTCommand[DTCommand["DT_GENDER"] = 6] = "DT_GENDER";
    DTCommand[DTCommand["DT_EMAIL"] = 7] = "DT_EMAIL";
    DTCommand[DTCommand["DT_MAILBOX"] = 8] = "DT_MAILBOX";
    DTCommand[DTCommand["DT_LEVEL"] = 9] = "DT_LEVEL";
    DTCommand[DTCommand["DT_DOWNLOADS"] = 10] = "DT_DOWNLOADS";
    DTCommand[DTCommand["DT_UPLOADS"] = 11] = "DT_UPLOADS";
    DTCommand[DTCommand["DT_TIMETODAY"] = 12] = "DT_TIMETODAY";
    DTCommand[DTCommand["DT_TIMELEFT"] = 13] = "DT_TIMELEFT";
    DTCommand[DTCommand["DT_LASTCALL"] = 14] = "DT_LASTCALL";
    DTCommand[DTCommand["DT_NUMCALLS"] = 15] = "DT_NUMCALLS";
    DTCommand[DTCommand["DT_CONFNUM"] = 16] = "DT_CONFNUM";
    DTCommand[DTCommand["DT_CONFNAME"] = 17] = "DT_CONFNAME";
    DTCommand[DTCommand["DT_NODE"] = 18] = "DT_NODE";
    DTCommand[DTCommand["DT_BBSNAME"] = 19] = "DT_BBSNAME";
    DTCommand[DTCommand["DT_SYSOP"] = 20] = "DT_SYSOP";
    DTCommand[DTCommand["DT_PORT"] = 21] = "DT_PORT";
})(DTCommand || (exports.DTCommand = DTCommand = {}));
/**
 * Memory addresses for AEDoor.library
 */
var AEDOOR_DIFACE_ADDR = 0x080000; // Fake diface pointer
var AEDOOR_STRING_BUFFER = 0x081000; // Shared string buffer (256 bytes)
var AEDOOR_INPUT_BUFFER = 0x081100; // Input buffer (256 bytes)
/**
 * AEDoor.library implementation
 *
 * This class implements the door interface functions that XIM doors use to
 * communicate with the BBS. Instead of using message ports (the original approach),
 * we trap the library functions and handle them directly.
 */
var AEDoorLibrary = /** @class */ (function () {
    function AEDoorLibrary(socket, emulator, sessionData) {
        this.activePrompt = null;
        this.socket = socket;
        this.emulator = emulator;
        this.sessionData = sessionData;
        // Initialize string buffers in emulated memory
        this.initializeBuffers();
        // Set up input handler for Prompt() function
        this.setupInputHandler();
    }
    /**
     * Initialize memory buffers for string data
     */
    AEDoorLibrary.prototype.initializeBuffers = function () {
        // Clear string buffer (256 bytes)
        for (var i = 0; i < 256; i++) {
            this.emulator.writeMemory(AEDOOR_STRING_BUFFER + i, 0);
        }
        // Clear input buffer (256 bytes)
        for (var i = 0; i < 256; i++) {
            this.emulator.writeMemory(AEDOOR_INPUT_BUFFER + i, 0);
        }
        console.log('[AEDoorLibrary] Initialized buffers:');
        console.log("  - String buffer at 0x".concat(AEDOOR_STRING_BUFFER.toString(16)));
        console.log("  - Input buffer at 0x".concat(AEDOOR_INPUT_BUFFER.toString(16)));
    };
    /**
     * Set up input handler to receive user input for Prompt() function
     */
    AEDoorLibrary.prototype.setupInputHandler = function () {
        var _this = this;
        this.socket.on('door:input', function (data) {
            console.log("[AEDoorLibrary] \uD83C\uDFB9 door:input event received: \"".concat(data, "\" hasActivePrompt=").concat(!!_this.activePrompt));
            if (_this.activePrompt) {
                console.log("[AEDoorLibrary] Processing input for active prompt");
                // Truncate to maxlen if needed
                var input = data;
                if (input.length > _this.activePrompt.maxlen) {
                    input = input.substring(0, _this.activePrompt.maxlen);
                }
                // Write to input buffer
                _this.writeStringToMemory(AEDOOR_INPUT_BUFFER, input);
                console.log("[AEDoorLibrary] Written \"".concat(input, "\" to buffer at 0x").concat(AEDOOR_INPUT_BUFFER.toString(16)));
                // Resume emulator execution
                console.log("[AEDoorLibrary] Resuming emulator after input received");
                _this.emulator.resume();
                // Resolve the promise
                var resolve = _this.activePrompt.resolve;
                _this.activePrompt = null;
                resolve(input);
            }
            else {
                console.log("[AEDoorLibrary] \u274C No active prompt, input ignored");
            }
        });
        console.log('[AEDoorLibrary] Input handler registered for door:input events');
    };
    /**
     * CreateComm() - LVO -30 (0xFFE2)
     *
     * Initializes the door interface.
     *
     * Parameters:
     *   D0 = Node number (ASCII value, e.g., '0' = 48, '1' = 49, etc.)
     *
     * Returns:
     *   D0 = diface pointer (or 0 on failure)
     *
     * From express.e: This creates a message port and finds the BBS port.
     * We skip message ports and just return a fake diface pointer.
     *
     * Pragma: #pragma libcall AEDBase CreateComm 1E 001
     *   - Offset 1E (hex) = 30 (decimal) = -30 LVO
     *   - Parameter mask 001 = D0 only
     */
    AEDoorLibrary.prototype.createComm = function () {
        var nodeChar = this.emulator.getRegister(0); // D0
        // Convert ASCII character to node number (e.g., '0' = 48 -> 0)
        var nodeNum = nodeChar >= 48 && nodeChar <= 57 ? nodeChar - 48 : nodeChar;
        console.log("[AEDoorLibrary] *** CreateComm() CALLED ***");
        console.log("[AEDoorLibrary]   Node: ".concat(nodeNum, " (D0=0x").concat(nodeChar.toString(16), ")"));
        console.log("[AEDoorLibrary]   Returning diface pointer: 0x".concat(AEDOOR_DIFACE_ADDR.toString(16)));
        console.log("[AEDoorLibrary]   Door can now use AEDoor.library functions");
        // Return fake diface pointer
        return AEDOOR_DIFACE_ADDR;
    };
    /**
     * DeleteComm() - LVO -36 (0xFFDC)
     *
     * Cleanup door interface.
     *
     * Parameters:
     *   A1 = diface pointer
     *
     * Returns:
     *   Nothing
     */
    AEDoorLibrary.prototype.deleteComm = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        console.log("[AEDoorLibrary] *** DeleteComm() CALLED ***");
        console.log("[AEDoorLibrary]   Diface: 0x".concat(difaceAddr.toString(16)));
        console.log("[AEDoorLibrary]   Door is terminating/cleaning up");
        // No cleanup needed in our implementation
    };
    /**
     * GetString() - LVO -72 (0xFFB8)
     *
     * Returns pointer to the shared string buffer.
     *
     * Parameters:
     *   A1 = diface pointer
     *
     * Returns:
     *   D0 = Pointer to string buffer
     *
     * This buffer is used by GetDT() and other functions to return string data.
     */
    AEDoorLibrary.prototype.getString = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        console.log("[AEDoorLibrary] GetString(diface=0x".concat(difaceAddr.toString(16), ")"));
        console.log("  - Returning buffer address: 0x".concat(AEDOOR_STRING_BUFFER.toString(16)));
        return AEDOOR_STRING_BUFFER;
    };
    /**
     * WriteStr() - LVO -84 (0xFFAC)
     *
     * Output text to the terminal.
     *
     * Parameters:
     *   A1 = diface pointer
     *   A0 = string address (CORRECT per Example.s line 37)
     *   D1 = mode (0 = NOLF, 1 = LF) (CORRECT per Example.s line 38)
     *
     * Returns:
     *   D0 = 0 (success)
     *
     * From express.e line 3386 (JH_WRITE case):
     *   IF (transfering=FALSE) AND (doorSilent=FALSE)
     *     aePuts(msg.string)
     *   ENDIF
     *
     * Assembly calling convention (from Example.s lines 37-40):
     *   lea MyString(PC),a0      ; A0 = string pointer
     *   moveq #NOLF,d1           ; D1 = mode (0 or 1)
     *   move.l _DIF(PC),a1       ; A1 = diface pointer
     *   jsr _LVOWriteStr(a6)     ; Call WriteStr
     */
    AEDoorLibrary.prototype.writeStr = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1 = diface
        var stringAddr = this.emulator.getRegister(8); // A0 = string (FIXED!)
        var mode = this.emulator.getRegister(1); // D1 = mode (FIXED!)
        console.log("[AEDoorLibrary] *** WriteStr() CALLED ***");
        console.log("  - Register A1 (diface): 0x".concat(difaceAddr.toString(16)));
        console.log("  - Register A0 (string addr): 0x".concat(stringAddr.toString(16)));
        console.log("  - Register D1 (mode): ".concat(mode));
        // Validate string address
        if (stringAddr === 0) {
            console.log("  - \u274C ERROR: String address is NULL!");
            return 0;
        }
        var str = this.emulator.readString(stringAddr);
        console.log("  - String read from 0x".concat(stringAddr.toString(16), ": \"").concat(str, "\""));
        console.log("  - String length: ".concat(str.length, " bytes"));
        console.log("  - Mode: ".concat(mode ? 'LF (add newline)' : 'NOLF (no newline)'));
        // Send to terminal
        var output = mode ? str + '\r\n' : str;
        console.log("  - Final output to emit: \"".concat(output, "\""));
        console.log("  - Output length: ".concat(output.length, " bytes"));
        console.log("  - Emitting to socket: ansi-output");
        this.socket.emit('ansi-output', output);
        console.log("  - \u2705 WriteStr() completed successfully");
        return 0; // Success
    };
    /**
     * Prompt() - LVO -78 (0xFFB2)
     *
     * Display prompt and get user input.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = maxlen (maximum input length)
     *   A2 = prompt string address
     *
     * Returns:
     *   D0 = Pointer to input buffer (or 0 on timeout)
     *
     * From express.e line 3404 (JH_PM case):
     *   IF(lineInput(msg.string,'',msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
     *     msg.data:=-1
     *   ELSE
     *     msg.data:=1
     *     AstrCopy(msg.string,tempstring,200)
     *   ENDIF
     *
     * NOTE: This is ASYNC in the original (waits for message reply).
     * We need to handle this carefully in the emulator loop.
     */
    AEDoorLibrary.prototype.prompt = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var maxlen = this.emulator.getRegister(0); // D0
        var promptAddr = this.emulator.getRegister(10); // A2
        var promptStr = this.emulator.readString(promptAddr);
        console.log("[AEDoorLibrary] Prompt(diface=0x".concat(difaceAddr.toString(16), ", maxlen=").concat(maxlen, ", prompt=\"").concat(promptStr, "\")"));
        // Send prompt to terminal
        this.socket.emit('ansi-output', promptStr);
        // CRITICAL: Pause emulator execution and wait for user input
        console.log("[AEDoorLibrary] Pausing emulator (waiting for user input, maxlen=".concat(maxlen, ")"));
        // Store active prompt state
        this.activePrompt = {
            maxlen: maxlen,
            resolve: function (input) {
                console.log("[AEDoorLibrary] Prompt resolved with: \"".concat(input, "\""));
            }
        };
        // Pause emulator - will resume when input handler receives 'door:input' event
        this.emulator.pause();
        // Return input buffer address
        // The actual input will be written when 'door:input' event fires
        return AEDOOR_INPUT_BUFFER;
    };
    /**
     * GetDT() - LVO -108 (0xFF94)
     *
     * Get user data based on DT_* constant.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = DT_* constant
     *   A2 = optional string parameter (for some DT_* types)
     *
     * Returns:
     *   D0 = Result (numeric for some types, string written to buffer for others)
     *
     * The result is written to the string buffer (accessed via GetString()).
     */
    AEDoorLibrary.prototype.getDT = function () {
        var _a, _b, _c, _d, _e;
        var difaceAddr = this.emulator.getRegister(9); // A1
        var dtCommand = this.emulator.getRegister(0); // D0
        var paramAddr = this.emulator.getRegister(10); // A2
        console.log("[AEDoorLibrary] *** GetDT() CALLED ***");
        console.log("[AEDoorLibrary]   Diface: 0x".concat(difaceAddr.toString(16)));
        console.log("[AEDoorLibrary]   DT command: ".concat(dtCommand));
        var result = 0;
        // Get user data based on DT_* constant
        switch (dtCommand) {
            case DTCommand.DT_NAME:
                result = ((_a = this.sessionData.user) === null || _a === void 0 ? void 0 : _a.username) || 'Guest';
                console.log("  - DT_NAME: \"".concat(result, "\""));
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_LOCATION:
                result = ((_b = this.sessionData.user) === null || _b === void 0 ? void 0 : _b.location) || 'Unknown';
                console.log("  - DT_LOCATION: \"".concat(result, "\""));
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_LEVEL:
                result = ((_c = this.sessionData.user) === null || _c === void 0 ? void 0 : _c.secLevel) || 10;
                console.log("  - DT_LEVEL: ".concat(result));
                return result;
            case DTCommand.DT_NODE:
                result = this.sessionData.nodeId || 0;
                console.log("  - DT_NODE: ".concat(result));
                return result;
            case DTCommand.DT_BBSNAME:
                result = 'AmiExpress-Web BBS';
                console.log("  - DT_BBSNAME: \"".concat(result, "\""));
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_SYSOP:
                result = 'Sysop';
                console.log("  - DT_SYSOP: \"".concat(result, "\""));
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_CONFNAME:
                result = ((_d = this.sessionData.currentConference) === null || _d === void 0 ? void 0 : _d.name) || 'General';
                console.log("  - DT_CONFNAME: \"".concat(result, "\""));
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_CONFNUM:
                result = ((_e = this.sessionData.currentConference) === null || _e === void 0 ? void 0 : _e.id) || 1;
                console.log("  - DT_CONFNUM: ".concat(result));
                return result;
            case DTCommand.DT_TIMELEFT:
                result = 60; // Default 60 minutes
                console.log("  - DT_TIMELEFT: ".concat(result));
                return result;
            default:
                console.log("  - Unknown DT command: ".concat(dtCommand));
                result = '';
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, '');
                break;
        }
        return 0;
    };
    /**
     * Helper: Write a string to emulated memory
     */
    AEDoorLibrary.prototype.writeStringToMemory = function (addr, str) {
        var bytes = Buffer.from(str + '\0', 'latin1');
        for (var i = 0; i < bytes.length; i++) {
            this.emulator.writeMemory(addr + i, bytes[i]);
        }
        console.log("  - Wrote \"".concat(str, "\" to 0x").concat(addr.toString(16)));
    };
    /**
     * SendCmd() - LVO -42 (0xFFD6)
     *
     * Send a BBS command without data.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = command code (JH_* constants from aedoor.h)
     *
     * Returns:
     *   D0 = result (0 = success, -1 = failure)
     *
     * From Example.s lines 42-46:
     *   move.l #JH_SYSOP,d0      ; Get sysop name
     *   jsr _LVOSendCmd(a6)      ; Result written to string buffer
     *   move.l #JH_WRITE,d0      ; Write buffer to terminal
     *   jsr _LVOSendCmd(a6)      ; Display the sysop name
     *
     * JH_* Commands (from aedoor.h lines 58-77):
     *   JH_WRITE = 3      - Write string buffer to terminal
     *   JH_SM = 4         - Show message
     *   JH_PM = 5         - Prompt for message
     *   JH_HK = 6         - Hot key
     *   JH_SYSOP = 12     - Get sysop name (writes to string buffer)
     *   JH_BBSName = 11   - Get BBS name (writes to string buffer)
     */
    AEDoorLibrary.prototype.sendCmd = function () {
        var _a;
        var difaceAddr = this.emulator.getRegister(9); // A1
        var command = this.emulator.getRegister(0); // D0
        console.log("[AEDoorLibrary] SendCmd(diface=0x".concat(difaceAddr.toString(16), ", cmd=").concat(command, ")"));
        // Handle command (from aedoor.h lines 58-76)
        switch (command) {
            case 0: // JH_LI - Line Input
                console.log("  - JH_LI: Line Input (stub - use Prompt() instead)");
                break;
            case 1: // JH_REGISTER - Register door with BBS
                console.log("  - JH_REGISTER: Door registration (no-op)");
                break;
            case 2: // JH_SHUTDOWN - Shutdown door
                console.log("  - JH_SHUTDOWN: Door shutdown (no-op)");
                break;
            case 3: // JH_WRITE - Write string buffer to terminal
                {
                    var str = this.emulator.readString(AEDOOR_STRING_BUFFER);
                    console.log("  - JH_WRITE: sending \"".concat(str, "\" to terminal"));
                    this.socket.emit('ansi-output', str + '\r\n');
                }
                break;
            case 4: // JH_SM - Show Message
                console.log("  - JH_SM: Show Message (stub)");
                break;
            case 5: // JH_PM - Prompt for Message
                console.log("  - JH_PM: Prompt for Message (stub - use Prompt() instead)");
                break;
            case 6: // JH_HK - Hot Key
                console.log("  - JH_HK: Hot Key (stub - use HotKey() instead)");
                break;
            case 7: // JH_SG - Show Graphics file
                console.log("  - JH_SG: Show Graphics file (stub)");
                break;
            case 8: // JH_SF - Show File
                console.log("  - JH_SF: Show File (stub)");
                break;
            case 9: // JH_EF - Edit File
                console.log("  - JH_EF: Edit File (stub)");
                break;
            case 10: // JH_CO - Carrier Online check
                console.log("  - JH_CO: Carrier Online check (always online)");
                // Could write 1 to data buffer to indicate online
                break;
            case 11: // JH_BBSName - Get BBS name
                {
                    var bbsName = 'AmiExpress-Web BBS';
                    console.log("  - JH_BBSName: writing \"".concat(bbsName, "\" to string buffer"));
                    this.writeStringToMemory(AEDOOR_STRING_BUFFER, bbsName);
                }
                break;
            case 12: // JH_SYSOP - Get sysop name
                {
                    var sysopName = ((_a = this.sessionData.user) === null || _a === void 0 ? void 0 : _a.username) || 'Sysop';
                    console.log("  - JH_SYSOP: writing \"".concat(sysopName, "\" to string buffer"));
                    this.writeStringToMemory(AEDOOR_STRING_BUFFER, sysopName);
                }
                break;
            case 13: // JH_FLAGFILE - Flag file
                console.log("  - JH_FLAGFILE: Flag file (stub)");
                break;
            case 14: // JH_SHOWFLAGS - Show flags
                console.log("  - JH_SHOWFLAGS: Show flags (stub)");
                break;
            case 15: // JH_DL / JH_ExtHK - Download or Extended Hot Key
                console.log("  - JH_DL/JH_ExtHK: Download/Extended HotKey (stub)");
                break;
            case 16: // JH_SIGBIT - Get signal bit
                console.log("  - JH_SIGBIT: Get signal bit (stub)");
                break;
            case 17: // JH_FetchKey - Fetch key
                console.log("  - JH_FetchKey: Fetch key (stub)");
                break;
            default:
                console.log("  - Unknown command: ".concat(command));
                break;
        }
        return 0; // Success
    };
    /**
     * SendStrCmd() - LVO -48 (0xFFD0)
     *
     * Send a BBS command with string parameter.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = command code
     *   A2 = string address
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.sendStrCmd = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var command = this.emulator.getRegister(0); // D0
        var stringAddr = this.emulator.getRegister(10); // A2
        var str = this.emulator.readString(stringAddr);
        console.log("[AEDoorLibrary] SendStrCmd(diface=0x".concat(difaceAddr.toString(16), ", cmd=").concat(command, ", str=\"").concat(str, "\")"));
        console.log('  - Stub (no-op)');
        return 0; // Success
    };
    /**
     * SendDataCmd() - LVO -54 (0xFFCA)
     *
     * Send a BBS command with numeric data parameter.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = command code
     *   D1 = data value
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.sendDataCmd = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var command = this.emulator.getRegister(0); // D0
        var data = this.emulator.getRegister(1); // D1
        console.log("[AEDoorLibrary] SendDataCmd(diface=0x".concat(difaceAddr.toString(16), ", cmd=").concat(command, ", data=").concat(data, ")"));
        console.log('  - Stub (no-op)');
        return 0; // Success
    };
    /**
     * SendStrDataCmd() - LVO -60 (0xFFC4)
     *
     * Send a BBS command with both string and numeric data.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = command code
     *   A2 = string address
     *   D1 = data value
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.sendStrDataCmd = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var command = this.emulator.getRegister(0); // D0
        var stringAddr = this.emulator.getRegister(10); // A2
        var data = this.emulator.getRegister(1); // D1
        var str = this.emulator.readString(stringAddr);
        console.log("[AEDoorLibrary] SendStrDataCmd(diface=0x".concat(difaceAddr.toString(16), ", cmd=").concat(command, ", str=\"").concat(str, "\", data=").concat(data, ")"));
        console.log('  - Stub (no-op)');
        return 0; // Success
    };
    /**
     * GetData() - LVO -66 (0xFFBE)
     *
     * Get numeric data from BBS.
     *
     * Parameters:
     *   A1 = diface pointer
     *
     * Returns:
     *   D0 = data value
     */
    AEDoorLibrary.prototype.getData = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        console.log("[AEDoorLibrary] GetData(diface=0x".concat(difaceAddr.toString(16), ")"));
        console.log('  - Returning 0');
        return 0;
    };
    /**
     * ShowGFile() - LVO -90 (0xFFA6)
     *
     * Display a graphics file.
     *
     * Parameters:
     *   A1 = diface pointer
     *   A2 = filename address
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.showGFile = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var filenameAddr = this.emulator.getRegister(10); // A2
        var filename = this.emulator.readString(filenameAddr);
        console.log("[AEDoorLibrary] ShowGFile(diface=0x".concat(difaceAddr.toString(16), ", file=\"").concat(filename, "\")"));
        console.log('  - Stub (no-op) - graphics files not supported');
        return 0; // Success
    };
    /**
     * ShowFile() - LVO -96 (0xFFA0)
     *
     * Display a text file.
     *
     * Parameters:
     *   A1 = diface pointer
     *   A2 = filename address
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.showFile = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var filenameAddr = this.emulator.getRegister(10); // A2
        var filename = this.emulator.readString(filenameAddr);
        console.log("[AEDoorLibrary] ShowFile(diface=0x".concat(difaceAddr.toString(16), ", file=\"").concat(filename, "\")"));
        console.log('  - Stub (no-op) - file display not implemented');
        // TODO: Read file from BBS file area and send to socket
        return 0; // Success
    };
    /**
     * SetDT() - LVO -102 (0xFF9A)
     *
     * Set user data.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = DT_* constant
     *   A2 = value address (string or number depending on DT_* type)
     *
     * Returns:
     *   D0 = result
     */
    AEDoorLibrary.prototype.setDT = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var dtCommand = this.emulator.getRegister(0); // D0
        var valueAddr = this.emulator.getRegister(10); // A2
        console.log("[AEDoorLibrary] SetDT(diface=0x".concat(difaceAddr.toString(16), ", dt=").concat(dtCommand, ")"));
        console.log('  - Stub (no-op) - setting user data not implemented');
        // TODO: Update user data in sessionData based on DT_* constant
        return 0; // Success
    };
    /**
     * GetStr() - LVO -114 (0xFF8E)
     *
     * Get input string with default value.
     *
     * Parameters:
     *   A1 = diface pointer
     *   D0 = maxlen
     *   A2 = default string address
     *
     * Returns:
     *   D0 = pointer to input buffer
     */
    AEDoorLibrary.prototype.getStr = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var maxlen = this.emulator.getRegister(0); // D0
        var defaultAddr = this.emulator.getRegister(10); // A2
        var defaultStr = this.emulator.readString(defaultAddr);
        console.log("[AEDoorLibrary] GetStr(diface=0x".concat(difaceAddr.toString(16), ", maxlen=").concat(maxlen, ", default=\"").concat(defaultStr, "\")"));
        // Pre-fill input buffer with default
        this.writeStringToMemory(AEDOOR_INPUT_BUFFER, defaultStr);
        // Send default to terminal (user can edit it)
        this.socket.emit('ansi-output', defaultStr);
        console.log("  - Waiting for user input (maxlen=".concat(maxlen, ")"));
        // Store active prompt state
        this.activePrompt = {
            maxlen: maxlen,
            resolve: function (input) {
                console.log("[AEDoorLibrary] GetStr resolved with: \"".concat(input, "\""));
            }
        };
        return AEDOOR_INPUT_BUFFER;
    };
    /**
     * CopyStr() - LVO -120 (0xFF88)
     *
     * Copy string from door to BBS buffer.
     *
     * Parameters:
     *   A1 = diface pointer
     *   A2 = source string address
     *   D0 = maxlen
     *
     * Returns:
     *   D0 = pointer to BBS buffer
     */
    AEDoorLibrary.prototype.copyStr = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var sourceAddr = this.emulator.getRegister(10); // A2
        var maxlen = this.emulator.getRegister(0); // D0
        var sourceStr = this.emulator.readString(sourceAddr);
        console.log("[AEDoorLibrary] CopyStr(diface=0x".concat(difaceAddr.toString(16), ", src=\"").concat(sourceStr, "\", maxlen=").concat(maxlen, ")"));
        // Copy to string buffer (truncate if needed)
        var str = sourceStr;
        if (str.length > maxlen) {
            str = str.substring(0, maxlen);
        }
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, str);
        console.log("  - Copied to buffer at 0x".concat(AEDOOR_STRING_BUFFER.toString(16)));
        return AEDOOR_STRING_BUFFER;
    };
    /**
     * HotKey() - LVO -126 (0xFF82)
     *
     * Get single keypress (hotkey).
     *
     * Parameters:
     *   A1 = diface pointer
     *   A2 = prompt string address
     *
     * Returns:
     *   D0 = character code (or -1 on timeout)
     */
    AEDoorLibrary.prototype.hotKey = function () {
        var difaceAddr = this.emulator.getRegister(9); // A1
        var promptAddr = this.emulator.getRegister(10); // A2
        var promptStr = this.emulator.readString(promptAddr);
        console.log("[AEDoorLibrary] HotKey(diface=0x".concat(difaceAddr.toString(16), ", prompt=\"").concat(promptStr, "\")"));
        // Send prompt to terminal
        this.socket.emit('ansi-output', promptStr);
        console.log('  - Waiting for single keypress');
        console.log('  - Stub: returning -1 (timeout)');
        // TODO: Implement actual hotkey input
        return -1; // Timeout
    };
    /**
     * PreCreateComm() - LVO -132 (0xFF7C)
     *
     * Pre-initialization before CreateComm().
     *
     * Parameters:
     *   D0 = node number
     *
     * Returns:
     *   D0 = result
     *
     * This is called before CreateComm() for doors that need early setup.
     */
    AEDoorLibrary.prototype.preCreateComm = function () {
        var nodeNum = this.emulator.getRegister(0); // D0
        console.log("[AEDoorLibrary] PreCreateComm(node=".concat(nodeNum, ")"));
        console.log('  - Pre-initialization (no-op)');
        return 0;
    };
    /**
     * PostDeleteComm() - LVO -138 (0xFF76)
     *
     * Post-cleanup after DeleteComm().
     *
     * Parameters:
     *   D0 = node number
     *
     * Returns:
     *   D0 = result
     *
     * This is called after DeleteComm() for doors that need late cleanup.
     */
    AEDoorLibrary.prototype.postDeleteComm = function () {
        var nodeNum = this.emulator.getRegister(0); // D0
        console.log("[AEDoorLibrary] PostDeleteComm(node=".concat(nodeNum, ")"));
        console.log('  - Post-cleanup (no-op)');
        return 0;
    };
    /**
     * Wait for user input (async helper for Prompt)
     */
    AEDoorLibrary.prototype.waitForInput = function (maxlen) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) {
                        _this.activePrompt = {
                            maxlen: maxlen,
                            resolve: resolve
                        };
                    })];
            });
        });
    };
    /**
     * Check if waiting for input
     */
    AEDoorLibrary.prototype.isWaitingForInput = function () {
        return this.activePrompt !== null;
    };
    return AEDoorLibrary;
}());
exports.AEDoorLibrary = AEDoorLibrary;
