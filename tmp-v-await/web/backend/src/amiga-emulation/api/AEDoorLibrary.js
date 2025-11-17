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
const AEDOOR_DIFACE_ADDR = 0x080000; // Fake diface pointer
const AEDOOR_STRING_BUFFER = 0x081000; // Shared string buffer (256 bytes)
const AEDOOR_INPUT_BUFFER = 0x081100; // Input buffer (256 bytes)
/**
 * AEDoor.library implementation
 *
 * This class implements the door interface functions that XIM doors use to
 * communicate with the BBS. Instead of using message ports (the original approach),
 * we trap the library functions and handle them directly.
 */
class AEDoorLibrary {
    constructor(socket, emulator, sessionData) {
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
    initializeBuffers() {
        // Clear string buffer (256 bytes)
        for (let i = 0; i < 256; i++) {
            this.emulator.writeMemory(AEDOOR_STRING_BUFFER + i, 0);
        }
        // Clear input buffer (256 bytes)
        for (let i = 0; i < 256; i++) {
            this.emulator.writeMemory(AEDOOR_INPUT_BUFFER + i, 0);
        }
        console.log('[AEDoorLibrary] Initialized buffers:');
        console.log(`  - String buffer at 0x${AEDOOR_STRING_BUFFER.toString(16)}`);
        console.log(`  - Input buffer at 0x${AEDOOR_INPUT_BUFFER.toString(16)}`);
    }
    /**
     * Set up input handler to receive user input for Prompt() function
     */
    setupInputHandler() {
        this.socket.on('door:input', (data) => {
            console.log(`[AEDoorLibrary] 🎹 door:input event received: "${data}" hasActivePrompt=${!!this.activePrompt}`);
            if (this.activePrompt) {
                console.log(`[AEDoorLibrary] Processing input for active prompt`);
                // Truncate to maxlen if needed
                let input = data;
                if (input.length > this.activePrompt.maxlen) {
                    input = input.substring(0, this.activePrompt.maxlen);
                }
                // Write to input buffer
                this.writeStringToMemory(AEDOOR_INPUT_BUFFER, input);
                console.log(`[AEDoorLibrary] Written "${input}" to buffer at 0x${AEDOOR_INPUT_BUFFER.toString(16)}`);
                // Resume emulator execution
                console.log(`[AEDoorLibrary] Resuming emulator after input received`);
                this.emulator.resume();
                // Resolve the promise
                const resolve = this.activePrompt.resolve;
                this.activePrompt = null;
                resolve(input);
            }
            else {
                console.log(`[AEDoorLibrary] ❌ No active prompt, input ignored`);
            }
        });
        console.log('[AEDoorLibrary] Input handler registered for door:input events');
    }
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
    createComm() {
        const nodeChar = this.emulator.getRegister(0); // D0
        // Convert ASCII character to node number (e.g., '0' = 48 -> 0)
        const nodeNum = nodeChar >= 48 && nodeChar <= 57 ? nodeChar - 48 : nodeChar;
        console.log(`[AEDoorLibrary] *** CreateComm() CALLED ***`);
        console.log(`[AEDoorLibrary]   Node: ${nodeNum} (D0=0x${nodeChar.toString(16)})`);
        console.log(`[AEDoorLibrary]   Returning diface pointer: 0x${AEDOOR_DIFACE_ADDR.toString(16)}`);
        console.log(`[AEDoorLibrary]   Door can now use AEDoor.library functions`);
        // Return fake diface pointer
        return AEDOOR_DIFACE_ADDR;
    }
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
    deleteComm() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        console.log(`[AEDoorLibrary] *** DeleteComm() CALLED ***`);
        console.log(`[AEDoorLibrary]   Diface: 0x${difaceAddr.toString(16)}`);
        console.log(`[AEDoorLibrary]   Door is terminating/cleaning up`);
        // No cleanup needed in our implementation
    }
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
    getString() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        console.log(`[AEDoorLibrary] GetString(diface=0x${difaceAddr.toString(16)})`);
        console.log(`  - Returning buffer address: 0x${AEDOOR_STRING_BUFFER.toString(16)}`);
        return AEDOOR_STRING_BUFFER;
    }
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
    writeStr() {
        const difaceAddr = this.emulator.getRegister(9); // A1 = diface
        const stringAddr = this.emulator.getRegister(8); // A0 = string (FIXED!)
        const mode = this.emulator.getRegister(1); // D1 = mode (FIXED!)
        console.log(`[AEDoorLibrary] *** WriteStr() CALLED ***`);
        console.log(`  - Register A1 (diface): 0x${difaceAddr.toString(16)}`);
        console.log(`  - Register A0 (string addr): 0x${stringAddr.toString(16)}`);
        console.log(`  - Register D1 (mode): ${mode}`);
        // Validate string address
        if (stringAddr === 0) {
            console.log(`  - ❌ ERROR: String address is NULL!`);
            return 0;
        }
        const str = this.emulator.readString(stringAddr);
        console.log(`  - String read from 0x${stringAddr.toString(16)}: "${str}"`);
        console.log(`  - String length: ${str.length} bytes`);
        console.log(`  - Mode: ${mode ? 'LF (add newline)' : 'NOLF (no newline)'}`);
        // Send to terminal
        const output = mode ? str + '\r\n' : str;
        console.log(`  - Final output to emit: "${output}"`);
        console.log(`  - Output length: ${output.length} bytes`);
        console.log(`  - Emitting to socket: ansi-output`);
        this.socket.emit('ansi-output', output);
        console.log(`  - ✅ WriteStr() completed successfully`);
        return 0; // Success
    }
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
    prompt() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const maxlen = this.emulator.getRegister(0); // D0
        const promptAddr = this.emulator.getRegister(10); // A2
        const promptStr = this.emulator.readString(promptAddr);
        console.log(`[AEDoorLibrary] Prompt(diface=0x${difaceAddr.toString(16)}, maxlen=${maxlen}, prompt="${promptStr}")`);
        // Send prompt to terminal
        this.socket.emit('ansi-output', promptStr);
        // CRITICAL: Pause emulator execution and wait for user input
        console.log(`[AEDoorLibrary] Pausing emulator (waiting for user input, maxlen=${maxlen})`);
        // Store active prompt state
        this.activePrompt = {
            maxlen: maxlen,
            resolve: (input) => {
                console.log(`[AEDoorLibrary] Prompt resolved with: "${input}"`);
            }
        };
        // Pause emulator - will resume when input handler receives 'door:input' event
        this.emulator.pause();
        // Return input buffer address
        // The actual input will be written when 'door:input' event fires
        return AEDOOR_INPUT_BUFFER;
    }
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
    getDT() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const dtCommand = this.emulator.getRegister(0); // D0
        const paramAddr = this.emulator.getRegister(10); // A2
        console.log(`[AEDoorLibrary] *** GetDT() CALLED ***`);
        console.log(`[AEDoorLibrary]   Diface: 0x${difaceAddr.toString(16)}`);
        console.log(`[AEDoorLibrary]   DT command: ${dtCommand}`);
        let result = 0;
        // Get user data based on DT_* constant
        switch (dtCommand) {
            case DTCommand.DT_NAME:
                result = this.sessionData.user?.username || 'Guest';
                console.log(`  - DT_NAME: "${result}"`);
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_LOCATION:
                result = this.sessionData.user?.location || 'Unknown';
                console.log(`  - DT_LOCATION: "${result}"`);
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_LEVEL:
                result = this.sessionData.user?.secLevel || 10;
                console.log(`  - DT_LEVEL: ${result}`);
                return result;
            case DTCommand.DT_NODE:
                result = this.sessionData.nodeId || 0;
                console.log(`  - DT_NODE: ${result}`);
                return result;
            case DTCommand.DT_BBSNAME:
                result = 'AmiExpress-Web BBS';
                console.log(`  - DT_BBSNAME: "${result}"`);
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_SYSOP:
                result = 'Sysop';
                console.log(`  - DT_SYSOP: "${result}"`);
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_CONFNAME:
                result = this.sessionData.currentConference?.name || 'General';
                console.log(`  - DT_CONFNAME: "${result}"`);
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, result);
                break;
            case DTCommand.DT_CONFNUM:
                result = this.sessionData.currentConference?.id || 1;
                console.log(`  - DT_CONFNUM: ${result}`);
                return result;
            case DTCommand.DT_TIMELEFT:
                result = 60; // Default 60 minutes
                console.log(`  - DT_TIMELEFT: ${result}`);
                return result;
            default:
                console.log(`  - Unknown DT command: ${dtCommand}`);
                result = '';
                this.writeStringToMemory(AEDOOR_STRING_BUFFER, '');
                break;
        }
        return 0;
    }
    /**
     * Helper: Write a string to emulated memory
     */
    writeStringToMemory(addr, str) {
        const bytes = Buffer.from(str + '\0', 'latin1');
        for (let i = 0; i < bytes.length; i++) {
            this.emulator.writeMemory(addr + i, bytes[i]);
        }
        console.log(`  - Wrote "${str}" to 0x${addr.toString(16)}`);
    }
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
    sendCmd() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const command = this.emulator.getRegister(0); // D0
        console.log(`[AEDoorLibrary] SendCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command})`);
        // Handle command (from aedoor.h lines 58-76)
        switch (command) {
            case 0: // JH_LI - Line Input
                console.log(`  - JH_LI: Line Input (stub - use Prompt() instead)`);
                break;
            case 1: // JH_REGISTER - Register door with BBS
                console.log(`  - JH_REGISTER: Door registration (no-op)`);
                break;
            case 2: // JH_SHUTDOWN - Shutdown door
                console.log(`  - JH_SHUTDOWN: Door shutdown (no-op)`);
                break;
            case 3: // JH_WRITE - Write string buffer to terminal
                {
                    const str = this.emulator.readString(AEDOOR_STRING_BUFFER);
                    console.log(`  - JH_WRITE: sending "${str}" to terminal`);
                    this.socket.emit('ansi-output', str + '\r\n');
                }
                break;
            case 4: // JH_SM - Show Message
                console.log(`  - JH_SM: Show Message (stub)`);
                break;
            case 5: // JH_PM - Prompt for Message
                console.log(`  - JH_PM: Prompt for Message (stub - use Prompt() instead)`);
                break;
            case 6: // JH_HK - Hot Key
                console.log(`  - JH_HK: Hot Key (stub - use HotKey() instead)`);
                break;
            case 7: // JH_SG - Show Graphics file
                console.log(`  - JH_SG: Show Graphics file (stub)`);
                break;
            case 8: // JH_SF - Show File
                console.log(`  - JH_SF: Show File (stub)`);
                break;
            case 9: // JH_EF - Edit File
                console.log(`  - JH_EF: Edit File (stub)`);
                break;
            case 10: // JH_CO - Carrier Online check
                console.log(`  - JH_CO: Carrier Online check (always online)`);
                // Could write 1 to data buffer to indicate online
                break;
            case 11: // JH_BBSName - Get BBS name
                {
                    const bbsName = 'AmiExpress-Web BBS';
                    console.log(`  - JH_BBSName: writing "${bbsName}" to string buffer`);
                    this.writeStringToMemory(AEDOOR_STRING_BUFFER, bbsName);
                }
                break;
            case 12: // JH_SYSOP - Get sysop name
                {
                    const sysopName = this.sessionData.user?.username || 'Sysop';
                    console.log(`  - JH_SYSOP: writing "${sysopName}" to string buffer`);
                    this.writeStringToMemory(AEDOOR_STRING_BUFFER, sysopName);
                }
                break;
            case 13: // JH_FLAGFILE - Flag file
                console.log(`  - JH_FLAGFILE: Flag file (stub)`);
                break;
            case 14: // JH_SHOWFLAGS - Show flags
                console.log(`  - JH_SHOWFLAGS: Show flags (stub)`);
                break;
            case 15: // JH_DL / JH_ExtHK - Download or Extended Hot Key
                console.log(`  - JH_DL/JH_ExtHK: Download/Extended HotKey (stub)`);
                break;
            case 16: // JH_SIGBIT - Get signal bit
                console.log(`  - JH_SIGBIT: Get signal bit (stub)`);
                break;
            case 17: // JH_FetchKey - Fetch key
                console.log(`  - JH_FetchKey: Fetch key (stub)`);
                break;
            default:
                console.log(`  - Unknown command: ${command}`);
                break;
        }
        return 0; // Success
    }
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
    sendStrCmd() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const command = this.emulator.getRegister(0); // D0
        const stringAddr = this.emulator.getRegister(10); // A2
        const str = this.emulator.readString(stringAddr);
        console.log(`[AEDoorLibrary] SendStrCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, str="${str}")`);
        console.log('  - Stub (no-op)');
        return 0; // Success
    }
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
    sendDataCmd() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const command = this.emulator.getRegister(0); // D0
        const data = this.emulator.getRegister(1); // D1
        console.log(`[AEDoorLibrary] SendDataCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, data=${data})`);
        console.log('  - Stub (no-op)');
        return 0; // Success
    }
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
    sendStrDataCmd() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const command = this.emulator.getRegister(0); // D0
        const stringAddr = this.emulator.getRegister(10); // A2
        const data = this.emulator.getRegister(1); // D1
        const str = this.emulator.readString(stringAddr);
        console.log(`[AEDoorLibrary] SendStrDataCmd(diface=0x${difaceAddr.toString(16)}, cmd=${command}, str="${str}", data=${data})`);
        console.log('  - Stub (no-op)');
        return 0; // Success
    }
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
    getData() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        console.log(`[AEDoorLibrary] GetData(diface=0x${difaceAddr.toString(16)})`);
        console.log('  - Returning 0');
        return 0;
    }
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
    showGFile() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const filenameAddr = this.emulator.getRegister(10); // A2
        const filename = this.emulator.readString(filenameAddr);
        console.log(`[AEDoorLibrary] ShowGFile(diface=0x${difaceAddr.toString(16)}, file="${filename}")`);
        console.log('  - Stub (no-op) - graphics files not supported');
        return 0; // Success
    }
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
    showFile() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const filenameAddr = this.emulator.getRegister(10); // A2
        const filename = this.emulator.readString(filenameAddr);
        console.log(`[AEDoorLibrary] ShowFile(diface=0x${difaceAddr.toString(16)}, file="${filename}")`);
        console.log('  - Stub (no-op) - file display not implemented');
        // TODO: Read file from BBS file area and send to socket
        return 0; // Success
    }
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
    setDT() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const dtCommand = this.emulator.getRegister(0); // D0
        const valueAddr = this.emulator.getRegister(10); // A2
        console.log(`[AEDoorLibrary] SetDT(diface=0x${difaceAddr.toString(16)}, dt=${dtCommand})`);
        console.log('  - Stub (no-op) - setting user data not implemented');
        // TODO: Update user data in sessionData based on DT_* constant
        return 0; // Success
    }
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
    getStr() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const maxlen = this.emulator.getRegister(0); // D0
        const defaultAddr = this.emulator.getRegister(10); // A2
        const defaultStr = this.emulator.readString(defaultAddr);
        console.log(`[AEDoorLibrary] GetStr(diface=0x${difaceAddr.toString(16)}, maxlen=${maxlen}, default="${defaultStr}")`);
        // Pre-fill input buffer with default
        this.writeStringToMemory(AEDOOR_INPUT_BUFFER, defaultStr);
        // Send default to terminal (user can edit it)
        this.socket.emit('ansi-output', defaultStr);
        console.log(`  - Waiting for user input (maxlen=${maxlen})`);
        // Store active prompt state
        this.activePrompt = {
            maxlen: maxlen,
            resolve: (input) => {
                console.log(`[AEDoorLibrary] GetStr resolved with: "${input}"`);
            }
        };
        return AEDOOR_INPUT_BUFFER;
    }
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
    copyStr() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const sourceAddr = this.emulator.getRegister(10); // A2
        const maxlen = this.emulator.getRegister(0); // D0
        const sourceStr = this.emulator.readString(sourceAddr);
        console.log(`[AEDoorLibrary] CopyStr(diface=0x${difaceAddr.toString(16)}, src="${sourceStr}", maxlen=${maxlen})`);
        // Copy to string buffer (truncate if needed)
        let str = sourceStr;
        if (str.length > maxlen) {
            str = str.substring(0, maxlen);
        }
        this.writeStringToMemory(AEDOOR_STRING_BUFFER, str);
        console.log(`  - Copied to buffer at 0x${AEDOOR_STRING_BUFFER.toString(16)}`);
        return AEDOOR_STRING_BUFFER;
    }
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
    hotKey() {
        const difaceAddr = this.emulator.getRegister(9); // A1
        const promptAddr = this.emulator.getRegister(10); // A2
        const promptStr = this.emulator.readString(promptAddr);
        console.log(`[AEDoorLibrary] HotKey(diface=0x${difaceAddr.toString(16)}, prompt="${promptStr}")`);
        // Send prompt to terminal
        this.socket.emit('ansi-output', promptStr);
        console.log('  - Waiting for single keypress');
        console.log('  - Stub: returning -1 (timeout)');
        // TODO: Implement actual hotkey input
        return -1; // Timeout
    }
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
    preCreateComm() {
        const nodeNum = this.emulator.getRegister(0); // D0
        console.log(`[AEDoorLibrary] PreCreateComm(node=${nodeNum})`);
        console.log('  - Pre-initialization (no-op)');
        return 0;
    }
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
    postDeleteComm() {
        const nodeNum = this.emulator.getRegister(0); // D0
        console.log(`[AEDoorLibrary] PostDeleteComm(node=${nodeNum})`);
        console.log('  - Post-cleanup (no-op)');
        return 0;
    }
    /**
     * Wait for user input (async helper for Prompt)
     */
    async waitForInput(maxlen) {
        return new Promise((resolve) => {
            this.activePrompt = {
                maxlen: maxlen,
                resolve: resolve
            };
        });
    }
    /**
     * Check if waiting for input
     */
    isWaitingForInput() {
        return this.activePrompt !== null;
    }
}
exports.AEDoorLibrary = AEDoorLibrary;
