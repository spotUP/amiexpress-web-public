"use strict";
/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XIMProtocol = exports.XIMCommand = void 0;
// XIM Protocol Command Codes (from aedoor.h and axcommon.e)
var XIMCommand;
(function (XIMCommand) {
    // Terminal I/O commands (JH_*)
    XIMCommand[XIMCommand["JH_LI"] = 0] = "JH_LI";
    XIMCommand[XIMCommand["JH_REGISTER"] = 1] = "JH_REGISTER";
    XIMCommand[XIMCommand["JH_SHUTDOWN"] = 2] = "JH_SHUTDOWN";
    XIMCommand[XIMCommand["JH_WRITE"] = 3] = "JH_WRITE";
    XIMCommand[XIMCommand["JH_SM"] = 4] = "JH_SM";
    XIMCommand[XIMCommand["JH_PM"] = 5] = "JH_PM";
    XIMCommand[XIMCommand["JH_HK"] = 6] = "JH_HK";
    XIMCommand[XIMCommand["JH_SG"] = 7] = "JH_SG";
    XIMCommand[XIMCommand["JH_SF"] = 8] = "JH_SF";
    XIMCommand[XIMCommand["JH_EF"] = 9] = "JH_EF";
    XIMCommand[XIMCommand["JH_CO"] = 10] = "JH_CO";
    XIMCommand[XIMCommand["JH_BBSNAME"] = 11] = "JH_BBSNAME";
    XIMCommand[XIMCommand["JH_SYSOP"] = 12] = "JH_SYSOP";
    XIMCommand[XIMCommand["JH_FLAGFILE"] = 13] = "JH_FLAGFILE";
    XIMCommand[XIMCommand["JH_SHOWFLAGS"] = 14] = "JH_SHOWFLAGS";
    XIMCommand[XIMCommand["JH_ExtHK"] = 15] = "JH_ExtHK";
    XIMCommand[XIMCommand["JH_SIGBIT"] = 16] = "JH_SIGBIT";
    XIMCommand[XIMCommand["JH_FetchKey"] = 17] = "JH_FetchKey";
    XIMCommand[XIMCommand["JH_SO"] = 18] = "JH_SO";
    XIMCommand[XIMCommand["JH_SMPTR"] = 19] = "JH_SMPTR";
    XIMCommand[XIMCommand["JH_20"] = 20] = "JH_20";
    XIMCommand[XIMCommand["JH_MCI"] = 507] = "JH_MCI";
    // Data query commands (DT_*)
    XIMCommand[XIMCommand["DT_NAME"] = 100] = "DT_NAME";
    XIMCommand[XIMCommand["DT_PASSWORD"] = 101] = "DT_PASSWORD";
    XIMCommand[XIMCommand["DT_LOCATION"] = 102] = "DT_LOCATION";
    XIMCommand[XIMCommand["DT_PHONENUMBER"] = 103] = "DT_PHONENUMBER";
    XIMCommand[XIMCommand["DT_SLOTNUMBER"] = 104] = "DT_SLOTNUMBER";
    XIMCommand[XIMCommand["DT_SECSTATUS"] = 105] = "DT_SECSTATUS";
    XIMCommand[XIMCommand["DT_SECBOARD"] = 106] = "DT_SECBOARD";
    XIMCommand[XIMCommand["DT_SECLIBRARY"] = 107] = "DT_SECLIBRARY";
    XIMCommand[XIMCommand["DT_SECBULLETIN"] = 108] = "DT_SECBULLETIN";
    XIMCommand[XIMCommand["DT_MESSAGESPOSTED"] = 109] = "DT_MESSAGESPOSTED";
    XIMCommand[XIMCommand["DT_UPLOADS"] = 110] = "DT_UPLOADS";
    XIMCommand[XIMCommand["DT_DOWNLOADS"] = 111] = "DT_DOWNLOADS";
    XIMCommand[XIMCommand["DT_TIMESCALLED"] = 112] = "DT_TIMESCALLED";
    XIMCommand[XIMCommand["DT_TIMELASTON"] = 113] = "DT_TIMELASTON";
    XIMCommand[XIMCommand["DT_TIMEUSED"] = 114] = "DT_TIMEUSED";
    XIMCommand[XIMCommand["DT_TIMELIMIT"] = 115] = "DT_TIMELIMIT";
    XIMCommand[XIMCommand["DT_TIMETOTAL"] = 116] = "DT_TIMETOTAL";
    XIMCommand[XIMCommand["DT_BYTESUPLOAD"] = 117] = "DT_BYTESUPLOAD";
    XIMCommand[XIMCommand["DT_BYTEDOWNLOAD"] = 118] = "DT_BYTEDOWNLOAD";
    XIMCommand[XIMCommand["DT_DAILYBYTELIMIT"] = 119] = "DT_DAILYBYTELIMIT";
    XIMCommand[XIMCommand["DT_DAILYBYTEDLD"] = 120] = "DT_DAILYBYTEDLD";
    XIMCommand[XIMCommand["DT_EXPERT"] = 121] = "DT_EXPERT";
    XIMCommand[XIMCommand["DT_LINELENGTH"] = 122] = "DT_LINELENGTH";
    XIMCommand[XIMCommand["ACTIVE_NODES"] = 123] = "ACTIVE_NODES";
    XIMCommand[XIMCommand["DT_DUMP"] = 124] = "DT_DUMP";
    XIMCommand[XIMCommand["DT_TIMEOUT"] = 125] = "DT_TIMEOUT";
    XIMCommand[XIMCommand["DT_STAMP_LASTON"] = 143] = "DT_STAMP_LASTON";
    XIMCommand[XIMCommand["DT_CURR_TIME"] = 145] = "DT_CURR_TIME";
    XIMCommand[XIMCommand["DT_STAMP_CTIME"] = 144] = "DT_STAMP_CTIME";
    XIMCommand[XIMCommand["DT_CONFACCESS"] = 146] = "DT_CONFACCESS";
    XIMCommand[XIMCommand["DT_LANGUAGE"] = 527] = "DT_LANGUAGE";
    XIMCommand[XIMCommand["DT_QUICKFLAG"] = 528] = "DT_QUICKFLAG";
    XIMCommand[XIMCommand["DT_GOODFILE"] = 529] = "DT_GOODFILE";
    XIMCommand[XIMCommand["DT_ANSICOLOR"] = 530] = "DT_ANSICOLOR";
    XIMCommand[XIMCommand["DT_ISANSI"] = 541] = "DT_ISANSI";
    XIMCommand[XIMCommand["DT_MSGCODE"] = 543] = "DT_MSGCODE";
    XIMCommand[XIMCommand["DT_FILECODE"] = 545] = "DT_FILECODE";
    XIMCommand[XIMCommand["DT_REALNAME"] = 606] = "DT_REALNAME";
    XIMCommand[XIMCommand["DT_HOSTNAME"] = 700] = "DT_HOSTNAME";
    XIMCommand[XIMCommand["DT_HOSTIP"] = 701] = "DT_HOSTIP";
    XIMCommand[XIMCommand["DT_ADDBIT"] = 1000] = "DT_ADDBIT";
    XIMCommand[XIMCommand["DT_REMBIT"] = 1001] = "DT_REMBIT";
    XIMCommand[XIMCommand["DT_QUERYBIT"] = 1002] = "DT_QUERYBIT";
    // BBS information commands (BB_*)
    XIMCommand[XIMCommand["BB_CONFNAME"] = 126] = "BB_CONFNAME";
    XIMCommand[XIMCommand["BB_CONFLOCAL"] = 127] = "BB_CONFLOCAL";
    XIMCommand[XIMCommand["BB_LOCAL"] = 128] = "BB_LOCAL";
    XIMCommand[XIMCommand["BB_MAINLINE"] = 131] = "BB_MAINLINE";
    XIMCommand[XIMCommand["BB_TASKPRI"] = 140] = "BB_TASKPRI";
    XIMCommand[XIMCommand["BB_CHATFLAG"] = 142] = "BB_CHATFLAG";
    XIMCommand[XIMCommand["BB_CHATSET"] = 162] = "BB_CHATSET";
    XIMCommand[XIMCommand["BB_PCONFNAME"] = 148] = "BB_PCONFNAME";
    XIMCommand[XIMCommand["BB_PCONFLOCAL"] = 147] = "BB_PCONFLOCAL";
    XIMCommand[XIMCommand["BB_NODEID"] = 149] = "BB_NODEID";
    XIMCommand[XIMCommand["BB_CALLERSLOG"] = 150] = "BB_CALLERSLOG";
    XIMCommand[XIMCommand["BB_UDLOG"] = 151] = "BB_UDLOG";
    XIMCommand[XIMCommand["BB_CONFNUM"] = 510] = "BB_CONFNUM";
    XIMCommand[XIMCommand["BB_LOGONTYPE"] = 517] = "BB_LOGONTYPE";
    XIMCommand[XIMCommand["BB_SCRLEFT"] = 518] = "BB_SCRLEFT";
    XIMCommand[XIMCommand["BB_SCRTOP"] = 519] = "BB_SCRTOP";
    XIMCommand[XIMCommand["BB_SCRWIDTH"] = 520] = "BB_SCRWIDTH";
    XIMCommand[XIMCommand["BB_SCRHEIGHT"] = 521] = "BB_SCRHEIGHT";
    XIMCommand[XIMCommand["BB_PURGELINE"] = 522] = "BB_PURGELINE";
    XIMCommand[XIMCommand["BB_PURGELINESTART"] = 523] = "BB_PURGELINESTART";
    XIMCommand[XIMCommand["BB_PURGELINEEND"] = 524] = "BB_PURGELINEEND";
    XIMCommand[XIMCommand["BB_NONSTOPTEXT"] = 525] = "BB_NONSTOPTEXT";
    XIMCommand[XIMCommand["BB_LINECOUNT"] = 526] = "BB_LINECOUNT";
    XIMCommand[XIMCommand["BB_DROPDTR"] = 161] = "BB_DROPDTR";
    XIMCommand[XIMCommand["BB_GETTASK"] = 164] = "BB_GETTASK";
    // System commands
    XIMCommand[XIMCommand["EXPRESS_VERSION"] = 152] = "EXPRESS_VERSION";
    XIMCommand[XIMCommand["GETKEY"] = 500] = "GETKEY";
    XIMCommand[XIMCommand["RAWARROW"] = 501] = "RAWARROW";
    XIMCommand[XIMCommand["CHAIN"] = 502] = "CHAIN";
    XIMCommand[XIMCommand["RETURNCOMMAND"] = 136] = "RETURNCOMMAND";
    XIMCommand[XIMCommand["RETURNCOMMAND2"] = 628] = "RETURNCOMMAND2";
    XIMCommand[XIMCommand["QUICK_KEY"] = 608] = "QUICK_KEY";
    XIMCommand[XIMCommand["ENVSTAT"] = 163] = "ENVSTAT";
    XIMCommand[XIMCommand["SV_NEWMSG"] = 135] = "SV_NEWMSG";
    XIMCommand[XIMCommand["PRV_COMMAND"] = 133] = "PRV_COMMAND";
    XIMCommand[XIMCommand["PRV_GROUP"] = 134] = "PRV_GROUP";
})(XIMCommand || (exports.XIMCommand = XIMCommand = {}));
var XIMProtocol = /** @class */ (function () {
    function XIMProtocol(emulator, execLibrary, socket, doorPort, bbsSession) {
        this.doorReplyPort = 0; // Door's reply port (will be discovered)
        this.inputQueue = []; // Queue for keyboard input from terminal
        // Line input state (for JH_LI command)
        this.waitingForLineInput = false;
        this.lineInputMessage = null;
        this.lineInputBuffer = '';
        this.emulator = emulator;
        this.execLibrary = execLibrary;
        this.socket = socket;
        this.doorPort = doorPort;
        this.bbsSession = bbsSession || {};
        console.log('[XIMProtocol] Initialized');
        console.log("  Door Port: 0x".concat(doorPort.toString(16)));
        console.log("  BBS Session: ".concat(bbsSession ? 'Provided' : 'None'));
        if (bbsSession === null || bbsSession === void 0 ? void 0 : bbsSession.user) {
            console.log("  User: ".concat(bbsSession.user.username || 'Unknown'));
        }
    }
    /**
     * Queue input from terminal for door to read via GETKEY or JH_LI
     * Called from AmigaDoorSession when 'door:input' event received
     */
    /**
     * Check if waiting for line input from user
     */
    XIMProtocol.prototype.isWaitingForLineInput = function () {
        return this.waitingForLineInput;
    };
    XIMProtocol.prototype.queueInput = function (data) {
        console.log("[XIMProtocol] Queuing input: \"".concat(data, "\""));
        // If waiting for line input, handle specially
        if (this.waitingForLineInput) {
            for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
                var char = data_1[_i];
                if (char === '\r' || char === '\n') {
                    // User pressed Enter - complete the line input
                    console.log("[XIMProtocol] Enter pressed, completing line input: \"".concat(this.lineInputBuffer, "\""));
                    this.completeLineInput();
                    return;
                }
                else if (char === '\b' || char === '\x7f') {
                    // Backspace - remove last character
                    if (this.lineInputBuffer.length > 0) {
                        this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
                        console.log("[XIMProtocol] Backspace, buffer now: \"".concat(this.lineInputBuffer, "\""));
                    }
                }
                else {
                    // Normal character - add to buffer
                    this.lineInputBuffer += char;
                    console.log("[XIMProtocol] Character added, buffer now: \"".concat(this.lineInputBuffer, "\""));
                }
            }
        }
        else {
            // Not waiting for line input - queue for GETKEY
            for (var _a = 0, data_2 = data; _a < data_2.length; _a++) {
                var char = data_2[_a];
                this.inputQueue.push(char);
            }
            console.log("[XIMProtocol] Input queue size: ".concat(this.inputQueue.length));
        }
    };
    /**
     * Parse XIM message from memory
     */
    XIMProtocol.prototype.parseMessage = function (msgAddr) {
        // jhMessage structure from axcommon.e (express.e:543-557):
        // OBJECT jhMessage
        //   <mn_Node + mn_ReplyPort + mn_Length>  // 20 bytes (standard Message header)
        //   string[200]: ARRAY OF CHAR            // 200 bytes (offset 20-219)
        //   data: LONG                            // 4 bytes (offset 220-223)
        //   command: LONG                         // 4 bytes (offset 224-227)
        // ENDOBJECT
        //
        // CRITICAL: Command is at offset 224, NOT offset 20!
        // The string field comes FIRST after the message header.
        var replyPort = this.emulator.readMemory32(msgAddr + 14);
        var command = this.emulator.readMemory32(msgAddr + 224); // LONG at offset 224
        var data = this.emulator.readMemory32(msgAddr + 220); // LONG at offset 220
        var stringPtr = msgAddr + 20; // String starts at offset 20
        // Read the string (200 bytes starting at offset 20)
        var messageString = this.emulator.readString(stringPtr, 200);
        console.log('[XIMProtocol] Parsed jhMessage:');
        console.log("  Address: 0x".concat(msgAddr.toString(16)));
        console.log("  Reply Port: 0x".concat(replyPort.toString(16)));
        console.log("  Command: ".concat(command, " (").concat(this.getCommandName(command), ")"));
        console.log("  Data: ".concat(data, " (0x").concat(data.toString(16), ")"));
        console.log("  String: \"".concat(messageString, "\""));
        // Save door's reply port for future responses
        if (replyPort !== 0 && this.doorReplyPort === 0) {
            this.doorReplyPort = replyPort;
            console.log('[XIMProtocol] Discovered door reply port: 0x' + replyPort.toString(16));
        }
        return {
            msgAddr: msgAddr,
            command: command,
            data: data,
            replyPort: replyPort,
            string: messageString,
        };
    };
    /**
     * Handle incoming XIM message from door
     */
    XIMProtocol.prototype.handleMessage = function (msg) {
        console.log("[XIMProtocol] Handling command: ".concat(this.getCommandName(msg.command)));
        switch (msg.command) {
            case XIMCommand.JH_REGISTER:
                this.handleRegister(msg);
                break;
            case XIMCommand.JH_LI:
                this.handleLineInput(msg);
                break;
            case XIMCommand.JH_WRITE:
                this.handleWrite(msg);
                break;
            case XIMCommand.JH_SM:
                this.handleSendMessage(msg);
                break;
            case XIMCommand.JH_SMPTR:
                this.handleSendMessagePointer(msg);
                break;
            case XIMCommand.JH_PM:
                this.handlePromptMessage(msg);
                break;
            case XIMCommand.JH_HK:
                this.handleHotkey(msg);
                break;
            case XIMCommand.JH_ExtHK:
                this.handleExtendedHotkey(msg);
                break;
            case XIMCommand.JH_FetchKey:
                this.handleFetchKey(msg);
                break;
            case XIMCommand.JH_SIGBIT:
                this.handleSignalBit(msg);
                break;
            case XIMCommand.JH_MCI:
                this.handleMCI(msg);
                break;
            case XIMCommand.JH_SG:
                this.handleSecurityScreen(msg);
                break;
            case XIMCommand.JH_SF:
                this.handleShowFile(msg);
                break;
            case XIMCommand.JH_EF:
                this.handleEditFile(msg);
                break;
            case XIMCommand.JH_FLAGFILE:
                this.handleFlagFile(msg);
                break;
            case XIMCommand.JH_20:
            case XIMCommand.QUICK_KEY:
                this.handleQuickKey(msg);
                break;
            case XIMCommand.JH_CO:
                this.handleConsoleOutput(msg);
                break;
            case XIMCommand.JH_SO:
                this.handleSerialOutput(msg);
                break;
            case XIMCommand.GETKEY:
                this.handleGetKey(msg);
                break;
            case XIMCommand.JH_SHUTDOWN:
                this.handleShutdown(msg);
                break;
            // BBS Information commands (BB_*)
            case XIMCommand.JH_BBSNAME:
                this.handleBBSName(msg);
                break;
            case XIMCommand.JH_SYSOP:
                this.handleSysopName(msg);
                break;
            case XIMCommand.EXPRESS_VERSION:
                this.handleExpressVersion(msg);
                break;
            case XIMCommand.BB_NODEID:
                this.handleNodeID(msg);
                break;
            case XIMCommand.BB_CONFNAME:
            case XIMCommand.BB_CONFLOCAL:
            case XIMCommand.BB_LOCAL:
            case XIMCommand.BB_CONFNUM:
            case XIMCommand.BB_LOGONTYPE:
                this.handleBBSInfo(msg);
                break;
            case XIMCommand.BB_SCRWIDTH:
            case XIMCommand.BB_SCRHEIGHT:
            case XIMCommand.BB_SCRLEFT:
            case XIMCommand.BB_SCRTOP:
                this.handleScreenDimensions(msg);
                break;
            case XIMCommand.BB_PURGELINE:
            case XIMCommand.BB_PURGELINESTART:
            case XIMCommand.BB_PURGELINEEND:
                this.handlePurgeLine(msg);
                break;
            case XIMCommand.BB_NONSTOPTEXT:
                this.handleNonStopText(msg);
                break;
            case XIMCommand.BB_LINECOUNT:
                this.handleLineCount(msg);
                break;
            case XIMCommand.BB_PCONFNAME:
            case XIMCommand.BB_PCONFLOCAL:
                this.handlePConf(msg);
                break;
            case XIMCommand.BB_MAINLINE:
                this.handleMainLine(msg);
                break;
            case XIMCommand.BB_CALLERSLOG:
                this.handleCallersLog(msg);
                break;
            case XIMCommand.BB_UDLOG:
                this.handleUDLog(msg);
                break;
            case XIMCommand.BB_TASKPRI:
                this.handleTaskPri(msg);
                break;
            case XIMCommand.BB_CHATFLAG:
            case XIMCommand.BB_CHATSET:
                this.handleChat(msg);
                break;
            case XIMCommand.BB_DROPDTR:
                this.handleDropDTR(msg);
                break;
            case XIMCommand.BB_GETTASK:
                this.handleGetTask(msg);
                break;
            // System commands
            case XIMCommand.RAWARROW:
                this.handleRawArrow(msg);
                break;
            case XIMCommand.RETURNCOMMAND:
            case XIMCommand.RETURNCOMMAND2:
                this.handleReturnCommand(msg);
                break;
            case XIMCommand.CHAIN:
                this.handleChain(msg);
                break;
            case XIMCommand.ENVSTAT:
                this.handleEnvStat(msg);
                break;
            case XIMCommand.SV_NEWMSG:
                this.handleSvNewMsg(msg);
                break;
            case XIMCommand.PRV_COMMAND:
                this.handlePrvCommand(msg);
                break;
            case XIMCommand.PRV_GROUP:
                this.handlePrvGroup(msg);
                break;
            // Data query commands (DT_*)
            case XIMCommand.DT_NAME:
            case XIMCommand.DT_PASSWORD:
            case XIMCommand.DT_LOCATION:
            case XIMCommand.DT_PHONENUMBER:
            case XIMCommand.DT_REALNAME:
            case XIMCommand.DT_SLOTNUMBER:
            case XIMCommand.DT_SECSTATUS:
            case XIMCommand.DT_SECBOARD:
            case XIMCommand.DT_SECLIBRARY:
            case XIMCommand.DT_SECBULLETIN:
            case XIMCommand.DT_TIMELIMIT:
            case XIMCommand.DT_LINELENGTH:
            case XIMCommand.DT_EXPERT:
            case XIMCommand.DT_MESSAGESPOSTED:
            case XIMCommand.DT_UPLOADS:
            case XIMCommand.DT_DOWNLOADS:
            case XIMCommand.DT_TIMESCALLED:
            case XIMCommand.DT_TIMELASTON:
            case XIMCommand.DT_TIMEUSED:
            case XIMCommand.DT_TIMETOTAL:
            case XIMCommand.DT_BYTESUPLOAD:
            case XIMCommand.DT_BYTEDOWNLOAD:
            case XIMCommand.DT_DAILYBYTELIMIT:
            case XIMCommand.DT_DAILYBYTEDLD:
            case XIMCommand.DT_TIMEOUT:
            case XIMCommand.DT_DUMP:
            case XIMCommand.DT_MSGCODE:
            case XIMCommand.DT_FILECODE:
            case XIMCommand.DT_LANGUAGE:
            case XIMCommand.DT_QUICKFLAG:
            case XIMCommand.DT_GOODFILE:
            case XIMCommand.DT_ANSICOLOR:
            case XIMCommand.DT_ISANSI:
            case XIMCommand.DT_STAMP_LASTON:
            case XIMCommand.DT_STAMP_CTIME:
            case XIMCommand.DT_CURR_TIME:
            case XIMCommand.DT_CONFACCESS:
            case XIMCommand.DT_ADDBIT:
            case XIMCommand.DT_REMBIT:
            case XIMCommand.DT_QUERYBIT:
            case XIMCommand.ACTIVE_NODES:
                this.handleDataQuery(msg);
                break;
            default:
                console.log("[XIMProtocol] Unhandled command: ".concat(msg.command));
                // Reply with success anyway to keep door moving
                this.sendReply(msg, 0);
        }
    };
    /**
     * Handle door registration
     *
     * From E sources (express.e:3379):
     * - CASE JH_REGISTER
     * - msg.command:=IF loggedOnUser<>NIL THEN userLineLen ELSE 29
     * - nodesPtr[]:=nodesPtr[]+1
     *
     * Door expects: Line length in response (80 columns for us)
     */
    XIMProtocol.prototype.handleRegister = function (msg) {
        console.log('[XIMProtocol] Door registering with BBS');
        // Reply with terminal line length (80 columns)
        // Following E sources: msg.command gets the line length
        this.sendReply(msg, 80);
        console.log('[XIMProtocol] Registration acknowledged, line length=80');
    };
    /**
     * Handle line input request (JH_LI)
     *
     * From E sources (express.e:3425):
     * - CASE JH_LI
     * - IF(lineInput('',msg.string,msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
     * -   msg.data:=-1
     * - ELSE
     * -   msg.data:=1
     * -   AstrCopy(msg.string,tempstring,200)
     *
     * Protocol:
     * - msg.string = prompt to display (if any)
     * - msg.data = max length
     * - Response: msg.data=1 (success) or -1 (timeout/failure)
     * - Response: msg.string = the input line
     */
    XIMProtocol.prototype.handleLineInput = function (msg) {
        var promptAddr = msg.data;
        console.log('[XIMProtocol] Door requesting line input');
        // Display prompt if provided
        if (promptAddr !== 0) {
            var prompt_1 = this.readString(promptAddr);
            if (prompt_1.length > 0) {
                console.log("[XIMProtocol] Prompt: \"".concat(prompt_1, "\""));
                this.socket.emit('ansi-output', prompt_1);
            }
        }
        // Don't reply immediately - wait for user to type line and press Enter
        console.log('[XIMProtocol] Waiting for user to type line and press Enter...');
        this.waitingForLineInput = true;
        this.lineInputMessage = msg;
        this.lineInputBuffer = '';
        // Reply will be sent when user presses Enter (via completeLineInput)
    };
    /**
     * Complete line input and send reply to door
     * Called when user presses Enter while waiting for line input
     */
    XIMProtocol.prototype.completeLineInput = function () {
        if (!this.lineInputMessage) {
            console.log('[XIMProtocol] ERROR: completeLineInput called but no pending message!');
            return;
        }
        var msg = this.lineInputMessage;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 22 + 4); // Get string pointer
        console.log("[XIMProtocol] Completing line input with: \"".concat(this.lineInputBuffer, "\""));
        if (stringAddr !== 0) {
            // Write the buffered line to memory
            for (var i = 0; i < this.lineInputBuffer.length; i++) {
                this.emulator.writeMemory(stringAddr + i, this.lineInputBuffer.charCodeAt(i));
            }
            // Null terminate
            this.emulator.writeMemory(stringAddr + this.lineInputBuffer.length, 0);
            console.log("[XIMProtocol] Wrote ".concat(this.lineInputBuffer.length, " characters to memory at 0x").concat(stringAddr.toString(16)));
        }
        // Reply with success (1)
        this.sendReply(msg, 1);
        // Reset state
        this.waitingForLineInput = false;
        this.lineInputMessage = null;
        this.lineInputBuffer = '';
        console.log('[XIMProtocol] Line input completed, waiting for next command');
    };
    /**
     * Handle door write request (door wants to display text)
     *
     * From E sources (express.e:1085):
     * - CASE JH_WRITE
     * - aePuts(servermsg.string)
     * - servermsg.command:=currentStat
     * - ReplyMsg(servermsg)
     */
    XIMProtocol.prototype.handleWrite = function (msg) {
        // msg.data contains pointer to string
        var stringAddr = msg.data;
        var text = '';
        var bytesWritten = 0;
        if (stringAddr !== 0) {
            text = this.readString(stringAddr);
            console.log('[XIMProtocol] Door writing to terminal:', JSON.stringify(text));
            // Send to terminal - Following E sources: aePuts(servermsg.string)
            console.log("\uD83D\uDD0A [XIM OUTPUT] Emitting ".concat(text.length, " chars: \"").concat(text.substring(0, 80), "\""));
            this.socket.emit('ansi-output', text);
            bytesWritten = text.length;
            console.log("[XIMProtocol] Sent ".concat(bytesWritten, " bytes to terminal"));
        }
        // Reply with bytes written count (following E sources: servermsg.command:=currentStat)
        this.sendReply(msg, bytesWritten);
    };
    /**
     * Handle keyboard input request
     *
     * From E sources (express.e:3811):
     * - CASE GETKEY
     * - IF checkInput() THEN msg.string[0]:="1" ELSE msg.string[0]:="0"
     * - msg.string[1]:=0
     * - ReplyMsg(msg)
     *
     * Protocol:
     * - msg.data points to string buffer
     * - If key available: write "1<key>\0" (e.g., "1A\0")
     * - If no key: write "0\0"
     */
    XIMProtocol.prototype.handleGetKey = function (msg) {
        var stringAddr = msg.data;
        if (stringAddr === 0) {
            console.log('[XIMProtocol] GETKEY: No string buffer provided');
            this.sendReply(msg, 0);
            return;
        }
        // Check if we have queued input
        if (this.inputQueue.length > 0) {
            var char = this.inputQueue.shift();
            var charCode = char.charCodeAt(0);
            console.log("[XIMProtocol] GETKEY: Returning key '".concat(char, "' (0x").concat(charCode.toString(16), ")"));
            // Write "1<char>\0" to string buffer (E sources format)
            this.emulator.writeMemory(stringAddr, 0x31); // '1' - key available
            this.emulator.writeMemory(stringAddr + 1, charCode); // the key character
            this.emulator.writeMemory(stringAddr + 2, 0); // null terminator
            // Reply with 1 (key available)
            this.sendReply(msg, 1);
        }
        else {
            console.log('[XIMProtocol] GETKEY: No input queued');
            // Write "0\0" to string buffer
            this.emulator.writeMemory(stringAddr, 0x30); // '0' - no key
            this.emulator.writeMemory(stringAddr + 1, 0); // null terminator
            // Reply with 0 (no key available)
            this.sendReply(msg, 0);
        }
    };
    /**
     * Handle door shutdown request
     */
    XIMProtocol.prototype.handleShutdown = function (msg) {
        console.log('[XIMProtocol] Door requesting shutdown');
        // Acknowledge shutdown
        this.sendReply(msg, 1);
        // TODO: Signal door manager that door completed
        console.log('[XIMProtocol] Door completed execution');
    };
    /**
     * Handle JH_SM (Send Message)
     *
     * From E sources (express.e:3406-3411):
     * - CASE JH_SM
     * - aePuts(msg.string)
     * - IF msg.data
     * -   aePuts('\b\n')
     * -   checkForPause()
     *
     * Protocol:
     * - msg.string (offset 26) = pointer to string to display
     * - msg.data = if non-zero, add newline and check for pause
     */
    XIMProtocol.prototype.handleSendMessage = function (msg) {
        // jhMessage structure has string embedded at offset 20-219
        // We already parsed it in parseMessage() and stored in msg.string
        var text = msg.string || '';
        console.log("[XIMProtocol] JH_SM: \"".concat(text, "\""));
        // Send text to terminal
        if (text) {
            this.socket.emit('ansi-output', text);
        }
        // If msg.data is non-zero, add newline and check for pause
        if (msg.data !== 0) {
            this.socket.emit('ansi-output', '\r\n');
            // TODO: checkForPause() - implement pause checking
            console.log('[XIMProtocol] JH_SM: Added newline (msg.data non-zero)');
        }
        // Reply with success
        this.sendReply(msg, 1);
    };
    /**
     * Handle JH_SMPTR (Send Message Pointer)
     *
     * From E sources (express.e:3412-3417):
     * - CASE JH_SMPTR
     * - aePuts(msg.strptr)
     * - IF msg.data
     * -   aePuts('\b\n')
     * -   checkForPause()
     *
     * Same as JH_SM but uses msg.strptr instead of msg.string
     * In our implementation, they work the same way
     */
    XIMProtocol.prototype.handleSendMessagePointer = function (msg) {
        // Same implementation as JH_SM - both use string pointer
        this.handleSendMessage(msg);
    };
    /**
     * Handle JH_PM (Prompt Message)
     *
     * From E sources (express.e:3418-3424):
     * - CASE JH_PM
     * - IF(lineInput(msg.string,'',msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
     * -   msg.data:=-1
     * - ELSE
     * -   msg.data:=1
     * -   AstrCopy(msg.string,tempstring,200)
     *
     * Protocol:
     * - msg.string = prompt to display
     * - msg.data = max length for input
     * - Response: msg.data=1 (success) or -1 (timeout/failure)
     * - Response: msg.string = the input line
     *
     * Similar to JH_LI but displays a prompt first
     */
    XIMProtocol.prototype.handlePromptMessage = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var maxLength = msg.data;
        console.log('[XIMProtocol] JH_PM: Prompt message with line input');
        // Display prompt if provided
        if (stringAddr !== 0) {
            var prompt_2 = this.readString(stringAddr);
            if (prompt_2.length > 0) {
                console.log("[XIMProtocol] JH_PM: Prompt: \"".concat(prompt_2, "\""));
                this.socket.emit('ansi-output', prompt_2);
            }
        }
        // Wait for line input (same as JH_LI)
        console.log("[XIMProtocol] JH_PM: Waiting for user input (max ".concat(maxLength, " chars)..."));
        this.waitingForLineInput = true;
        this.lineInputMessage = msg;
        this.lineInputBuffer = '';
        // Reply will be sent when user presses Enter
    };
    /**
     * Handle JH_HK (Hotkey)
     *
     * From E sources (express.e:3436-3447):
     * - CASE JH_HK
     * - lineCount:=0
     * - aePuts(msg.string)
     * - ch:=readChar(doorTimeout)
     * - IF (ch<0)
     * -   msg.data:=-1
     * - ELSE
     * -   msg.data:=1
     * - ENDIF
     * - msg.string[0]:=ch
     * - msg.string[1]:=0
     * - msg.command:=ximPort
     *
     * Protocol:
     * - msg.string = prompt to display
     * - Waits for single character input
     * - Response: msg.data=1 (got key) or -1 (timeout)
     * - Response: msg.string[0] = character pressed
     * - Response: msg.command = ximPort (1=console, 2=serial)
     */
    XIMProtocol.prototype.handleHotkey = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        console.log('[XIMProtocol] JH_HK: Hotkey input request');
        // Display prompt if provided
        if (stringAddr !== 0) {
            var prompt_3 = this.readString(stringAddr);
            if (prompt_3.length > 0) {
                console.log("[XIMProtocol] JH_HK: Prompt: \"".concat(prompt_3, "\""));
                this.socket.emit('ansi-output', prompt_3);
            }
        }
        // Check if we have queued input
        if (this.inputQueue.length > 0) {
            var char = this.inputQueue.shift();
            var charCode = char.charCodeAt(0);
            console.log("[XIMProtocol] JH_HK: Got hotkey '".concat(char, "' (0x").concat(charCode.toString(16), ")"));
            // Write character to msg.string
            if (stringAddr !== 0) {
                this.emulator.writeMemory(stringAddr, charCode);
                this.emulator.writeMemory(stringAddr + 1, 0); // Null terminator
            }
            // Update msg.command with ximPort (1 = console)
            this.emulator.writeMemory16(msg.msgAddr + 20, 1);
            // Reply with success (1)
            this.sendReply(msg, 1);
        }
        else {
            // No input available - timeout
            console.log('[XIMProtocol] JH_HK: No input available (timeout)');
            // Reply with timeout (-1)
            this.sendReply(msg, -1);
        }
    };
    /**
     * Handle JH_CO (Console Output)
     *
     * From E sources (express.e:3395-3400):
     * - CASE JH_CO
     * - conPuts(msg.string,-1)
     * - IF msg.data
     * -   conPuts('\b\n',-1)
     * -   checkForPause()
     *
     * Protocol:
     * - msg.string = text to output to console
     * - msg.data = if non-zero, add newline and check for pause
     * - Console output (not serial)
     */
    XIMProtocol.prototype.handleConsoleOutput = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        if (stringAddr === 0) {
            console.log('[XIMProtocol] JH_CO: No string address provided');
            this.sendReply(msg, 0);
            return;
        }
        var text = this.readString(stringAddr);
        // Send to terminal (console output)
        this.socket.emit('ansi-output', text);
        // If msg.data is non-zero, add newline and check for pause
        if (msg.data !== 0) {
            this.socket.emit('ansi-output', '\r\n');
            console.log('[XIMProtocol] JH_CO: Added newline');
        }
        // Reply with success
        this.sendReply(msg, 1);
    };
    /**
     * Handle JH_SO (Serial Output)
     *
     * From E sources (express.e:3401-3405):
     * - CASE JH_SO
     * - serPuts(msg.string,-1)
     * - IF msg.data
     * -   serPuts('\b\n',-1)
     *
     * Protocol:
     * - msg.string = text to output to serial port
     * - msg.data = if non-zero, add newline
     * - Serial output (not console)
     * - In web version, we treat this same as console output
     */
    XIMProtocol.prototype.handleSerialOutput = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        if (stringAddr === 0) {
            console.log('[XIMProtocol] JH_SO: No string address provided');
            this.sendReply(msg, 0);
            return;
        }
        var text = this.readString(stringAddr);
        console.log("[XIMProtocol] JH_SO (Serial): \"".concat(text, "\""));
        // In web version, serial and console output both go to terminal
        this.socket.emit('ansi-output', text);
        // If msg.data is non-zero, add newline
        if (msg.data !== 0) {
            this.socket.emit('ansi-output', '\r\n');
            console.log('[XIMProtocol] JH_SO: Added newline');
        }
        // Reply with success
        this.sendReply(msg, 1);
    };
    /**
     * Handle JH_BBSNAME (Get BBS Name)
     *
     * From E sources (express.e:3486-3487):
     * - CASE JH_BBSNAME
     * - AstrCopy(msg.string,cmds.bbsName,41)
     */
    XIMProtocol.prototype.handleBBSName = function (msg) {
        var _a;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var bbsName = ((_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.bbsName) || 'AmiExpress-Web';
        console.log("[XIMProtocol] JH_BBSNAME: \"".concat(bbsName, "\""));
        if (stringAddr !== 0) {
            this.writeString(stringAddr, bbsName, 41);
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle JH_SYSOP (Get Sysop Name)
     *
     * From E sources (express.e:3488-3489):
     * - CASE JH_SYSOP
     * - AstrCopy(msg.string,cmds.sysopName,41)
     */
    XIMProtocol.prototype.handleSysopName = function (msg) {
        var _a;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var sysopName = ((_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.sysopName) || 'Sysop';
        console.log("[XIMProtocol] JH_SYSOP: \"".concat(sysopName, "\""));
        if (stringAddr !== 0) {
            this.writeString(stringAddr, sysopName, 41);
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle EXPRESS_VERSION (Get BBS Version)
     *
     * From E sources (express.e:3808-3810):
     * - CASE EXPRESS_VERSION
     * - getExpressMajorVer(tempstring)
     * - AstrCopy(msg.string,tempstring,200)
     */
    XIMProtocol.prototype.handleExpressVersion = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        // Return version in format from express.e:4599 getExpressMajorVer()
        // Format: "v<major>.<minor>" (e.g., "v5.6")
        // RTW requires "AmiExpress V3.xx or higher"
        // We are porting AmiExpress v5.6.1
        var version = 'v5.6';
        console.log("[XIMProtocol] EXPRESS_VERSION: \"".concat(version, "\""));
        if (stringAddr !== 0) {
            this.writeString(stringAddr, version, 200);
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle BB_NODEID (Get Node ID)
     *
     * From E sources (express.e:3801-3803):
     * - CASE BB_NODEID
     * - StringF(tempstring,'\d',node)
     * - AstrCopy(msg.string,tempstring,200)
     */
    XIMProtocol.prototype.handleNodeID = function (msg) {
        var _a;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var nodeId = ((_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.nodeId) || 0;
        console.log("[XIMProtocol] BB_NODEID: ".concat(nodeId));
        if (stringAddr !== 0) {
            this.writeString(stringAddr, nodeId.toString(), 200);
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle BB_* BBS Info commands
     */
    XIMProtocol.prototype.handleBBSInfo = function (msg) {
        var _a, _b, _c, _d, _e;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var value = '';
        switch (msg.command) {
            case XIMCommand.BB_CONFNAME:
                // Conference name
                value = ((_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.conferenceName) || 'Main';
                console.log("[XIMProtocol] BB_CONFNAME: \"".concat(value, "\""));
                break;
            case XIMCommand.BB_CONFLOCAL:
                // Conference local path
                value = ((_b = this.bbsSession) === null || _b === void 0 ? void 0 : _b.conferencePath) || '/BBS/Conf01';
                console.log("[XIMProtocol] BB_CONFLOCAL: \"".concat(value, "\""));
                break;
            case XIMCommand.BB_LOCAL:
                // BBS local path
                value = ((_c = this.bbsSession) === null || _c === void 0 ? void 0 : _c.bbsPath) || '/BBS';
                console.log("[XIMProtocol] BB_LOCAL: \"".concat(value, "\""));
                break;
            case XIMCommand.BB_CONFNUM:
                // Conference number
                value = (((_d = this.bbsSession) === null || _d === void 0 ? void 0 : _d.conferenceId) || 1).toString();
                console.log("[XIMProtocol] BB_CONFNUM: ".concat(value));
                break;
            case XIMCommand.BB_LOGONTYPE:
                // Logon type (0=off, 1=sysop, 2=local, 3=remote)
                var logonType = ((_e = this.bbsSession) === null || _e === void 0 ? void 0 : _e.logonType) || 3;
                console.log("[XIMProtocol] BB_LOGONTYPE: ".concat(logonType));
                // Reply in msg.data, not msg.string
                this.sendReply(msg, logonType);
                return;
        }
        if (stringAddr !== 0 && value) {
            this.writeString(stringAddr, value, 200);
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle RAWARROW (Toggle Raw Arrow Keys)
     *
     * From E sources (express.e:3814-3815):
     * - CASE RAWARROW
     * - IF(rawArrow) THEN rawArrow:=FALSE ELSE rawArrow:=TRUE
     */
    XIMProtocol.prototype.handleRawArrow = function (msg) {
        // Toggle raw arrow key mode
        // In web version, we always process arrow keys
        console.log('[XIMProtocol] RAWARROW: Toggle raw arrow mode (no-op in web)');
        this.sendReply(msg, 1);
    };
    /**
     * Handle RETURNCOMMAND / RETURNCOMMAND2 (Return Command to BBS)
     *
     * From E sources (express.e:3492-3493, 4064-4065):
     * - CASE RETURNCOMMAND
     * - StrCopy(runOnExit,msg.string,200)
     *
     * Door can tell BBS to run a command after door exits
     */
    XIMProtocol.prototype.handleReturnCommand = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        if (stringAddr !== 0) {
            var command = this.readString(stringAddr, 200);
            console.log("[XIMProtocol] RETURNCOMMAND: \"".concat(command, "\""));
            // Store command to run after door exits
            // TODO: Pass this to door manager
            this.bbsSession.returnCommand = command;
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle CHAIN (Chain to Another Door)
     *
     * From E sources (express.e:3386-3387):
     * - CASE CHAIN
     * - nodesPtr[]:=nodesPtr[]-1
     *
     * Door wants to exit and chain to another door
     */
    XIMProtocol.prototype.handleChain = function (msg) {
        console.log('[XIMProtocol] CHAIN: Door requesting chain to another door');
        // Decrement node count (door is exiting)
        // Reply with success
        this.sendReply(msg, 1);
        // Door will shutdown after this
    };
    /**
     * Handle data query (user info, time remaining, etc)
     *
     * From E sources (express.e:3494-3981):
     * Protocol:
     * - msg.data = direction flag:
     *   - IF msg.data != 0: READ mode - copy user data TO msg.string (door is reading)
     *   - IF msg.data == 0: WRITE mode - copy msg.string TO user data (door is writing)
     * - msg.string (offset 26) = pointer to string buffer in memory
     * - For numeric values: convert to/from string format
     */
    XIMProtocol.prototype.handleDataQuery = function (msg) {
        var _a, _b, _c;
        console.log("[XIMProtocol] Door querying data: ".concat(this.getCommandName(msg.command)));
        console.log("  msg.data (direction): ".concat(msg.data, " (").concat(msg.data !== 0 ? 'READ' : 'WRITE', ")"));
        // Read string pointer from message (offset 26 in jhMessage structure)
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        console.log("  String address: 0x".concat(stringAddr.toString(16)));
        var isRead = msg.data !== 0;
        var user = (_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.user;
        switch (msg.command) {
            case XIMCommand.DT_NAME:
                // User's username (31 bytes max)
                if (isRead) {
                    var username = (user === null || user === void 0 ? void 0 : user.username) || 'Guest';
                    this.writeString(stringAddr, username, 31);
                    console.log("  [READ] DT_NAME: \"".concat(username, "\""));
                }
                else {
                    var newName = this.readString(stringAddr, 31);
                    if (user)
                        user.username = newName;
                    console.log("  [WRITE] DT_NAME: \"".concat(newName, "\""));
                }
                break;
            case XIMCommand.DT_PASSWORD:
                // Password - E sources: never allow doors to grab password
                if (isRead) {
                    this.writeString(stringAddr, '', 40);
                    console.log("  [READ] DT_PASSWORD: (blocked - security)");
                }
                else {
                    // Door setting new password - we'd need to hash it
                    console.log("  [WRITE] DT_PASSWORD: (not implemented - needs hashing)");
                }
                break;
            case XIMCommand.DT_LOCATION:
                // User's location (30 bytes max)
                if (isRead) {
                    var location_1 = (user === null || user === void 0 ? void 0 : user.location) || 'Unknown';
                    this.writeString(stringAddr, location_1, 30);
                    console.log("  [READ] DT_LOCATION: \"".concat(location_1, "\""));
                }
                else {
                    var newLocation = this.readString(stringAddr, 30);
                    if (user)
                        user.location = newLocation;
                    console.log("  [WRITE] DT_LOCATION: \"".concat(newLocation, "\""));
                }
                break;
            case XIMCommand.DT_PHONENUMBER:
                // User's phone number (13 bytes max)
                if (isRead) {
                    var phone = (user === null || user === void 0 ? void 0 : user.phone) || '';
                    this.writeString(stringAddr, phone, 13);
                    console.log("  [READ] DT_PHONENUMBER: \"".concat(phone, "\""));
                }
                else {
                    var newPhone = this.readString(stringAddr, 13);
                    if (user)
                        user.phone = newPhone;
                    console.log("  [WRITE] DT_PHONENUMBER: \"".concat(newPhone, "\""));
                }
                break;
            case XIMCommand.DT_REALNAME:
                // User's real name (26 bytes max)
                if (isRead) {
                    var realname = (user === null || user === void 0 ? void 0 : user.realname) || '';
                    this.writeString(stringAddr, realname, 26);
                    console.log("  [READ] DT_REALNAME: \"".concat(realname, "\""));
                }
                else {
                    var newRealname = this.readString(stringAddr, 26);
                    if (user)
                        user.realname = newRealname;
                    console.log("  [WRITE] DT_REALNAME: \"".concat(newRealname, "\""));
                }
                break;
            case XIMCommand.DT_SLOTNUMBER:
                // User's slot/account number
                if (isRead) {
                    var slotNum = (user === null || user === void 0 ? void 0 : user.id) || 1;
                    this.writeString(stringAddr, slotNum.toString(), 200);
                    console.log("  [READ] DT_SLOTNUMBER: ".concat(slotNum));
                }
                else {
                    var newSlot = parseInt(this.readString(stringAddr, 200));
                    if (user)
                        user.id = newSlot;
                    console.log("  [WRITE] DT_SLOTNUMBER: ".concat(newSlot));
                }
                break;
            case XIMCommand.DT_SECSTATUS:
                // Security level / Access level
                if (isRead) {
                    var secLevel = (user === null || user === void 0 ? void 0 : user.secLevel) || 10;
                    this.writeString(stringAddr, secLevel.toString(), 200);
                    console.log("  [READ] DT_SECSTATUS: ".concat(secLevel));
                }
                else {
                    var newLevel = parseInt(this.readString(stringAddr, 200));
                    if (user)
                        user.secLevel = newLevel;
                    console.log("  [WRITE] DT_SECSTATUS: ".concat(newLevel));
                }
                break;
            case XIMCommand.DT_TIMELIMIT:
                // Time limit in minutes
                if (isRead) {
                    var timeLimit = (user === null || user === void 0 ? void 0 : user.timeLimit) || 60;
                    this.writeString(stringAddr, timeLimit.toString(), 200);
                    console.log("  [READ] DT_TIMELIMIT: ".concat(timeLimit));
                }
                else {
                    var newLimit = parseInt(this.readString(stringAddr, 200));
                    if (user)
                        user.timeLimit = newLimit;
                    console.log("  [WRITE] DT_TIMELIMIT: ".concat(newLimit));
                }
                break;
            case XIMCommand.DT_LINELENGTH:
                // Terminal line length (80 columns standard)
                if (isRead) {
                    var lineLen = 80;
                    this.writeString(stringAddr, lineLen.toString(), 200);
                    console.log("  [READ] DT_LINELENGTH: ".concat(lineLen));
                }
                else {
                    var newLen = parseInt(this.readString(stringAddr, 200));
                    console.log("  [WRITE] DT_LINELENGTH: ".concat(newLen));
                }
                break;
            case XIMCommand.DT_EXPERT:
                // Expert mode (Y/N character)
                if (isRead) {
                    var expert = (user === null || user === void 0 ? void 0 : user.expert) ? 'Y' : 'N';
                    this.writeString(stringAddr, expert, 200);
                    console.log("  [READ] DT_EXPERT: ".concat(expert));
                }
                else {
                    var expertStr = this.readString(stringAddr, 1);
                    if (user)
                        user.expert = (expertStr === 'Y' || expertStr === 'y');
                    console.log("  [WRITE] DT_EXPERT: ".concat(expertStr));
                }
                break;
            case XIMCommand.DT_MESSAGESPOSTED:
                if (isRead) {
                    var msgs = (user === null || user === void 0 ? void 0 : user.messagesPosted) || 0;
                    this.writeString(stringAddr, msgs.toString(), 200);
                    console.log("  [READ] DT_MESSAGESPOSTED: ".concat(msgs));
                }
                break;
            case XIMCommand.DT_UPLOADS:
                if (isRead) {
                    var uploads = (user === null || user === void 0 ? void 0 : user.uploads) || 0;
                    this.writeString(stringAddr, uploads.toString(), 200);
                    console.log("  [READ] DT_UPLOADS: ".concat(uploads));
                }
                break;
            case XIMCommand.DT_DOWNLOADS:
                if (isRead) {
                    var downloads = (user === null || user === void 0 ? void 0 : user.downloads) || 0;
                    this.writeString(stringAddr, downloads.toString(), 200);
                    console.log("  [READ] DT_DOWNLOADS: ".concat(downloads));
                }
                break;
            case XIMCommand.DT_TIMESCALLED:
                if (isRead) {
                    var calls = (user === null || user === void 0 ? void 0 : user.timesCalled) || 0;
                    this.writeString(stringAddr, calls.toString(), 200);
                    console.log("  [READ] DT_TIMESCALLED: ".concat(calls));
                }
                break;
            case XIMCommand.DT_TIMELASTON:
                if (isRead) {
                    var lastOn = (user === null || user === void 0 ? void 0 : user.lastLoginAt) ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0;
                    this.writeString(stringAddr, lastOn.toString(), 200);
                    console.log("  [READ] DT_TIMELASTON: ".concat(lastOn));
                }
                break;
            case XIMCommand.DT_TIMEUSED:
                if (isRead) {
                    var timeUsed = (user === null || user === void 0 ? void 0 : user.timeUsed) || 0;
                    this.writeString(stringAddr, timeUsed.toString(), 200);
                    console.log("  [READ] DT_TIMEUSED: ".concat(timeUsed));
                }
                break;
            case XIMCommand.DT_TIMETOTAL:
                if (isRead) {
                    var timeTotal = (user === null || user === void 0 ? void 0 : user.timeTotal) || 0;
                    this.writeString(stringAddr, timeTotal.toString(), 200);
                    console.log("  [READ] DT_TIMETOTAL: ".concat(timeTotal));
                }
                break;
            case XIMCommand.DT_HOSTNAME:
                if (isRead) {
                    var hostname = ((_b = this.bbsSession) === null || _b === void 0 ? void 0 : _b.hostname) || 'localhost';
                    this.writeString(stringAddr, hostname, 200);
                    console.log("  [READ] DT_HOSTNAME: \"".concat(hostname, "\""));
                }
                break;
            case XIMCommand.DT_HOSTIP:
                if (isRead) {
                    var hostip = ((_c = this.bbsSession) === null || _c === void 0 ? void 0 : _c.hostip) || '127.0.0.1';
                    this.writeString(stringAddr, hostip, 200);
                    console.log("  [READ] DT_HOSTIP: \"".concat(hostip, "\""));
                }
                break;
            // Security commands
            case XIMCommand.DT_SECBOARD:
                if (isRead) {
                    var secBoard = (user === null || user === void 0 ? void 0 : user.secBoard) || 0;
                    this.writeString(stringAddr, secBoard.toString(), 200);
                    console.log("  [READ] DT_SECBOARD: ".concat(secBoard));
                }
                else {
                    var newSec = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secBoard = newSec;
                    console.log("  [WRITE] DT_SECBOARD: ".concat(newSec));
                }
                break;
            case XIMCommand.DT_SECLIBRARY:
                if (isRead) {
                    var secLibrary = (user === null || user === void 0 ? void 0 : user.secLibrary) || 0;
                    this.writeString(stringAddr, secLibrary.toString(), 200);
                    console.log("  [READ] DT_SECLIBRARY: ".concat(secLibrary));
                }
                else {
                    var newSec = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secLibrary = newSec;
                    console.log("  [WRITE] DT_SECLIBRARY: ".concat(newSec));
                }
                break;
            case XIMCommand.DT_SECBULLETIN:
                if (isRead) {
                    var secBulletin = (user === null || user === void 0 ? void 0 : user.secBulletin) || 0;
                    this.writeString(stringAddr, secBulletin.toString(), 200);
                    console.log("  [READ] DT_SECBULLETIN: ".concat(secBulletin));
                }
                else {
                    var newSec = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secBulletin = newSec;
                    console.log("  [WRITE] DT_SECBULLETIN: ".concat(newSec));
                }
                break;
            // Byte counts
            case XIMCommand.DT_BYTESUPLOAD:
                if (isRead) {
                    var bytesUp = (user === null || user === void 0 ? void 0 : user.bytesUpload) || 0;
                    this.writeString(stringAddr, bytesUp.toString(), 200);
                    console.log("  [READ] DT_BYTESUPLOAD: ".concat(bytesUp));
                }
                else {
                    var newBytes = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newBytes))
                        user.bytesUpload = newBytes;
                    console.log("  [WRITE] DT_BYTESUPLOAD: ".concat(newBytes));
                }
                break;
            case XIMCommand.DT_BYTEDOWNLOAD:
                if (isRead) {
                    var bytesDown = (user === null || user === void 0 ? void 0 : user.bytesDownload) || 0;
                    this.writeString(stringAddr, bytesDown.toString(), 200);
                    console.log("  [READ] DT_BYTEDOWNLOAD: ".concat(bytesDown));
                }
                else {
                    var newBytes = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newBytes))
                        user.bytesDownload = newBytes;
                    console.log("  [WRITE] DT_BYTEDOWNLOAD: ".concat(newBytes));
                }
                break;
            case XIMCommand.DT_DAILYBYTELIMIT:
                if (isRead) {
                    var limit = (user === null || user === void 0 ? void 0 : user.dailyBytesLimit) || 0;
                    this.writeString(stringAddr, limit.toString(), 200);
                    console.log("  [READ] DT_DAILYBYTELIMIT: ".concat(limit));
                }
                else {
                    var newLimit = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newLimit))
                        user.dailyBytesLimit = newLimit;
                    console.log("  [WRITE] DT_DAILYBYTELIMIT: ".concat(newLimit));
                }
                break;
            case XIMCommand.DT_DAILYBYTEDLD:
                if (isRead) {
                    var dailyDld = (user === null || user === void 0 ? void 0 : user.dailyBytesDld) || 0;
                    this.writeString(stringAddr, dailyDld.toString(), 200);
                    console.log("  [READ] DT_DAILYBYTEDLD: ".concat(dailyDld));
                }
                else {
                    var newDld = parseInt(this.readString(stringAddr));
                    if (user && !isNaN(newDld))
                        user.dailyBytesDld = newDld;
                    console.log("  [WRITE] DT_DAILYBYTEDLD: ".concat(newDld));
                }
                break;
            // Timestamps
            case XIMCommand.DT_STAMP_LASTON:
                if (isRead) {
                    var stampLastOn = (user === null || user === void 0 ? void 0 : user.lastLoginAt) ? new Date(user.lastLoginAt).toISOString() : '';
                    this.writeString(stringAddr, stampLastOn, 200);
                    console.log("  [READ] DT_STAMP_LASTON: \"".concat(stampLastOn, "\""));
                }
                break;
            case XIMCommand.DT_STAMP_CTIME:
                if (isRead) {
                    var now = new Date().toISOString();
                    this.writeString(stringAddr, now, 200);
                    console.log("  [READ] DT_STAMP_CTIME: \"".concat(now, "\""));
                }
                break;
            case XIMCommand.DT_CURR_TIME:
                if (isRead) {
                    var currTime = Math.floor(Date.now() / 1000);
                    this.writeString(stringAddr, currTime.toString(), 200);
                    console.log("  [READ] DT_CURR_TIME: ".concat(currTime));
                }
                break;
            // Configuration
            case XIMCommand.DT_TIMEOUT:
                if (isRead) {
                    var timeout = 300; // 5 minutes default
                    this.writeString(stringAddr, timeout.toString(), 200);
                    console.log("  [READ] DT_TIMEOUT: ".concat(timeout));
                }
                break;
            case XIMCommand.DT_CONFACCESS:
                if (isRead) {
                    var confAccess = (user === null || user === void 0 ? void 0 : user.confAccess) || '';
                    this.writeString(stringAddr, confAccess, 10);
                    console.log("  [READ] DT_CONFACCESS: \"".concat(confAccess, "\""));
                }
                else {
                    var newAccess = this.readString(stringAddr, 10);
                    if (user)
                        user.confAccess = newAccess;
                    console.log("  [WRITE] DT_CONFACCESS: \"".concat(newAccess, "\""));
                }
                break;
            case XIMCommand.DT_LANGUAGE:
                if (isRead) {
                    var language = (user === null || user === void 0 ? void 0 : user.language) || 'txt';
                    this.writeString(stringAddr, language, 200);
                    console.log("  [READ] DT_LANGUAGE: \"".concat(language, "\""));
                }
                break;
            case XIMCommand.DT_ANSICOLOR:
            case XIMCommand.DT_ISANSI:
                if (isRead) {
                    var isAnsi = (user === null || user === void 0 ? void 0 : user.ansi) || true;
                    this.writeString(stringAddr, isAnsi ? '1' : '0', 200);
                    console.log("  [READ] ".concat(this.getCommandName(msg.command), ": ").concat(isAnsi));
                }
                break;
            // Flags and codes
            case XIMCommand.DT_MSGCODE:
                // Message code flag (used by doors)
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                console.log('  DT_MSGCODE: 0');
                break;
            case XIMCommand.DT_FILECODE:
                // File code flag (used by doors)
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                console.log('  DT_FILECODE: 0');
                break;
            case XIMCommand.DT_QUICKFLAG:
            case XIMCommand.DT_GOODFILE:
                if (isRead) {
                    this.writeString(stringAddr, '0', 200);
                    console.log("  [READ] ".concat(this.getCommandName(msg.command), ": 0"));
                }
                break;
            case XIMCommand.DT_DUMP:
                // Dump active user data (for debugging)
                if (isRead) {
                    var dumpData = JSON.stringify(user || {}, null, 2);
                    this.writeString(stringAddr, dumpData, 200);
                    console.log("  [READ] DT_DUMP: User data dumped");
                }
                break;
            case XIMCommand.ACTIVE_NODES:
                if (isRead) {
                    // Return list of active nodes (32 chars, 'X' = active, ' ' = inactive)
                    // Check which nodes have node{n}.user files
                    var nodeFileManager = require('../../../services/NodeFileManager').nodeFileManager;
                    var nodesStatus = '';
                    for (var i = 0; i < 32; i++) {
                        var isActive = nodeFileManager.nodeUserFilesExist(i);
                        nodesStatus += isActive ? 'X' : ' ';
                    }
                    this.writeString(stringAddr, nodesStatus, 32);
                    console.log("  [READ] ACTIVE_NODES: ".concat(nodesStatus.replace(/ /g, '_')));
                }
                break;
            // Security bit operations
            case XIMCommand.DT_ADDBIT:
            case XIMCommand.DT_REMBIT:
            case XIMCommand.DT_QUERYBIT:
                // TODO: Implement security bit operations
                console.log("  [TODO] ".concat(this.getCommandName(msg.command)));
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                break;
            default:
                console.log("  [UNHANDLED] ".concat(this.getCommandName(msg.command)));
        }
        // Reply with success (1)
        this.sendReply(msg, 1);
    };
    /**
     * Handle extended hotkey (JH_ExtHK)
     * From E sources (express.e:3432-3435):
     * - CASE JH_ExtHK
     * - lineCount:=0
     * - msg.command:=readChar(doorTimeout,Shl(1,msg.signal))
     * - IF (msg.command<0) THEN msg.data:=-1 ELSE msg.data:=1
     *
     * Extended hotkey with signal mask support
     * msg.signal contains the signal number to monitor
     */
    XIMProtocol.prototype.handleExtendedHotkey = function (msg) {
        console.log('[XIMProtocol] JH_ExtHK - Extended hotkey with signal');
        // Check if we have input available
        if (this.inputQueue.length > 0) {
            var char = this.inputQueue.shift();
            var charCode = char.charCodeAt(0);
            // Set msg.command to the character code
            this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
            // Set msg.data to 1 (success)
            this.emulator.writeMemory32(msg.msgAddr + 22, 1);
            console.log("  [READ] Extended hotkey: '".concat(char, "' (code ").concat(charCode, ")"));
        }
        else {
            // Timeout - no input available
            this.emulator.writeMemory16(msg.msgAddr + 20, -1);
            this.emulator.writeMemory32(msg.msgAddr + 22, -1);
            console.log('  [TIMEOUT] No input available');
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle fetch key (JH_FetchKey)
     * From E sources (express.e:3465-3472):
     * - IF checkInput()
     * -   msg.command:=readChar(doorTimeout)
     * -   IF (msg.command<0) THEN msg.data:=-1 ELSE msg.data:=1
     * - ELSE
     * -   msg.command:=0
     * -   msg.data:=1
     *
     * Non-blocking key check - returns immediately
     */
    XIMProtocol.prototype.handleFetchKey = function (msg) {
        console.log('[XIMProtocol] JH_FetchKey - Non-blocking key check');
        if (this.inputQueue.length > 0) {
            // Input available - read it
            var char = this.inputQueue.shift();
            var charCode = char.charCodeAt(0);
            this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
            this.emulator.writeMemory32(msg.msgAddr + 22, 1);
            console.log("  [READ] Key available: '".concat(char, "' (code ").concat(charCode, ")"));
        }
        else {
            // No input - return 0
            this.emulator.writeMemory16(msg.msgAddr + 20, 0);
            this.emulator.writeMemory32(msg.msgAddr + 22, 1);
            console.log('  [NO INPUT] No key available');
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle signal bit query (JH_SIGBIT)
     * From E sources (express.e:3463-3464):
     * - CASE JH_SIGBIT
     * - msg.data:=doorExtSig
     *
     * Returns the current door signal bits
     */
    XIMProtocol.prototype.handleSignalBit = function (msg) {
        console.log('[XIMProtocol] JH_SIGBIT - Query signal bits');
        // Return signal bits (0 for now - no signals pending)
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        this.sendReply(msg, 1);
    };
    /**
     * Handle MCI processing (JH_MCI)
     * From E sources (express.e:3456-3462):
     * - CASE JH_MCI
     * - StrCopy(tempstring,msg.string)
     * - processMci(tempstring)
     * - IF msg.data
     * -   aePuts('\b\n')
     * -   checkForPause()
     *
     * Process MCI codes in string and display
     * msg.data: if non-zero, add CR/LF and check for pause
     */
    XIMProtocol.prototype.handleMCI = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var text = this.readString(stringAddr);
        console.log('[XIMProtocol] JH_MCI - Process MCI codes');
        console.log("  Text: \"".concat(text, "\""));
        // For now, just output the text without MCI processing
        // TODO: Implement full MCI code processing (colors, variables, etc.)
        this.socket.emit('ansi-output', text);
        // If msg.data is non-zero, add CR/LF
        if (msg.data !== 0) {
            this.socket.emit('ansi-output', '\r\n');
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle security screen display (JH_SG)
     * From E sources (express.e:3473-3474):
     * - IF (findSecurityScreen(msg.string,tempstring)) THEN displayFile(tempstring)
     *
     * Display a security-level specific screen file
     */
    XIMProtocol.prototype.handleSecurityScreen = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var screenName = this.readString(stringAddr);
        console.log('[XIMProtocol] JH_SG - Display security screen');
        console.log("  Screen: \"".concat(screenName, "\""));
        // TODO: Implement security screen lookup and display
        // For now, just acknowledge
        this.socket.emit('ansi-output', "\r\n[Security screen: ".concat(screenName, "]\r\n"));
        this.sendReply(msg, 1);
    };
    /**
     * Handle show file (JH_SF)
     * From E sources (express.e:3475-3476):
     * - displayFile(msg.string)
     *
     * Display a file to the user
     */
    XIMProtocol.prototype.handleShowFile = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var fileName = this.readString(stringAddr);
        console.log('[XIMProtocol] JH_SF - Show file');
        console.log("  File: \"".concat(fileName, "\""));
        // TODO: Implement file display
        // For now, just acknowledge
        this.socket.emit('ansi-output', "\r\n[Display file: ".concat(fileName, "]\r\n"));
        this.sendReply(msg, 1);
    };
    /**
     * Handle edit file (JH_EF)
     * From E sources (express.e:3477-3485, 1145-1154):
     * - CASE JH_EF
     * - fileattach:=FALSE
     * - loadMsg(msg.string)
     * - IF(edit()=RESULT_SUCCESS)
     * -   saveMsg(msg.string)
     * -   msg.data:=1
     * - ELSE
     * -   msg.data:=-1
     *
     * Edit a message/file
     */
    XIMProtocol.prototype.handleEditFile = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var fileName = this.readString(stringAddr);
        console.log('[XIMProtocol] JH_EF - Edit file');
        console.log("  File: \"".concat(fileName, "\""));
        // TODO: Implement file editing
        // For now, return success
        this.emulator.writeMemory32(msg.msgAddr + 22, 1);
        console.log('  [SUCCESS] File edit acknowledged');
        this.sendReply(msg, 1);
    };
    /**
     * Handle flag file (JH_FLAGFILE)
     * From E sources (express.e:3490-3491, 1160-1161):
     * - addFlagToList(msg.string)
     *
     * Add a file to the flagged files list
     */
    XIMProtocol.prototype.handleFlagFile = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var fileName = this.readString(stringAddr);
        console.log('[XIMProtocol] JH_FLAGFILE - Flag file for download');
        console.log("  File: \"".concat(fileName, "\""));
        // TODO: Add to flagged files list
        console.log('  [TODO] Add to download queue');
        this.sendReply(msg, 1);
    };
    /**
     * Handle quick key (JH_20, QUICK_KEY)
     * From E sources (express.e:3448-3455):
     * - CASE JH_20 / QUICK_KEY
     * - ch:=readChar(doorTimeout)
     * - msg.data:=ch
     * - msg.command:=ximPort
     *
     * Quick key input with port indication
     */
    XIMProtocol.prototype.handleQuickKey = function (msg) {
        console.log('[XIMProtocol] QUICK_KEY - Quick key input');
        if (this.inputQueue.length > 0) {
            var char = this.inputQueue.shift();
            var charCode = char.charCodeAt(0);
            // Set msg.data to character
            this.emulator.writeMemory32(msg.msgAddr + 22, charCode);
            // Set msg.command to ximPort (1 = console, 2 = serial)
            this.emulator.writeMemory16(msg.msgAddr + 20, 1); // Console
            console.log("  [READ] Quick key: '".concat(char, "' (code ").concat(charCode, ")"));
        }
        else {
            // Timeout
            this.emulator.writeMemory32(msg.msgAddr + 22, -1);
            this.emulator.writeMemory16(msg.msgAddr + 20, 1);
            console.log('  [TIMEOUT] No input available');
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle screen dimension queries (BB_SCRWIDTH, BB_SCRHEIGHT, BB_SCRLEFT, BB_SCRTOP)
     * From E sources (express.e:3861-3868):
     * - CASE BB_SCRLEFT: msg.data:=screen.leftedge
     * - CASE BB_SCRTOP: msg.data:=screen.topedge
     * - CASE BB_SCRWIDTH: msg.data:=screen.width
     * - CASE BB_SCRHEIGHT: msg.data:=screen.height
     */
    XIMProtocol.prototype.handleScreenDimensions = function (msg) {
        console.log('[XIMProtocol] Screen dimension query');
        var value = 0;
        switch (msg.command) {
            case XIMCommand.BB_SCRWIDTH:
                value = 80; // Terminal width
                console.log('  BB_SCRWIDTH: 80');
                break;
            case XIMCommand.BB_SCRHEIGHT:
                value = 24; // Terminal height
                console.log('  BB_SCRHEIGHT: 24');
                break;
            case XIMCommand.BB_SCRLEFT:
                value = 0; // Left edge
                console.log('  BB_SCRLEFT: 0');
                break;
            case XIMCommand.BB_SCRTOP:
                value = 0; // Top edge
                console.log('  BB_SCRTOP: 0');
                break;
        }
        // Set msg.data to the dimension value
        this.emulator.writeMemory32(msg.msgAddr + 22, value);
        this.sendReply(msg, 1);
    };
    /**
     * Handle purge line (BB_PURGELINE, BB_PURGELINESTART, BB_PURGELINEEND)
     * From E sources (express.e:3869-3874):
     * - CASE BB_PURGELINE: purgeLine()
     * - CASE BB_PURGELINESTART: purgeLineStart()
     * - CASE BB_PURGELINEEND: purgeLineEnd()
     *
     * Clear current line or parts of it
     */
    XIMProtocol.prototype.handlePurgeLine = function (msg) {
        console.log('[XIMProtocol] Purge line command');
        switch (msg.command) {
            case XIMCommand.BB_PURGELINE:
                // Clear entire line
                this.socket.emit('ansi-output', '\r\x1b[K');
                console.log('  BB_PURGELINE: Clear entire line');
                break;
            case XIMCommand.BB_PURGELINESTART:
                // Clear from start to cursor
                this.socket.emit('ansi-output', '\x1b[1K');
                console.log('  BB_PURGELINESTART: Clear to cursor');
                break;
            case XIMCommand.BB_PURGELINEEND:
                // Clear from cursor to end
                this.socket.emit('ansi-output', '\x1b[K');
                console.log('  BB_PURGELINEEND: Clear from cursor');
                break;
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle non-stop text flag (BB_NONSTOPTEXT)
     * From E sources (express.e:3875-3876):
     * - IF (msg.data=0) THEN nonStopDisplayFlag:=FALSE ELSE nonStopDisplayFlag:=TRUE
     *
     * Enable/disable pause prompts
     */
    XIMProtocol.prototype.handleNonStopText = function (msg) {
        var enable = msg.data !== 0;
        console.log("[XIMProtocol] BB_NONSTOPTEXT: ".concat(enable ? 'Enable' : 'Disable', " non-stop text"));
        // TODO: Store this flag and use it to control pause prompts
        // For now, just acknowledge
        this.sendReply(msg, 1);
    };
    /**
     * Handle line count (BB_LINECOUNT)
     * From E sources (express.e:3877-3883):
     * - IF(msg.data)
     * -   StringF(tempstring,'\d',lineCount)
     * -   AstrCopy(msg.string,tempstring,200)
     * - ELSE
     * -   lineCount:=Val(msg.string)
     *
     * Get or set current line count for pause tracking
     */
    XIMProtocol.prototype.handleLineCount = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        console.log('[XIMProtocol] BB_LINECOUNT');
        if (msg.data !== 0) {
            // READ - return current line count
            var lineCount = 0; // TODO: Track actual line count
            this.writeString(stringAddr, lineCount.toString(), 200);
            console.log("  [READ] Line count: ".concat(lineCount));
        }
        else {
            // WRITE - set line count
            var newCount = this.readString(stringAddr);
            console.log("  [WRITE] Set line count: ".concat(newCount));
            // TODO: Store this value
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle conference by number (BB_PCONFNAME, BB_PCONFLOCAL)
     * From E sources (express.e:3779-3793):
     * - Get conference name or location by number (1-9)
     */
    XIMProtocol.prototype.handlePConf = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var confNum = parseInt(this.readString(stringAddr));
        console.log("[XIMProtocol] ".concat(msg.command === XIMCommand.BB_PCONFNAME ? 'BB_PCONFNAME' : 'BB_PCONFLOCAL'));
        console.log("  Conference number: ".concat(confNum));
        if (confNum < 1 || confNum > 9) {
            this.writeString(stringAddr, 'ERROR', 10);
            console.log('  [ERROR] Invalid conference number');
        }
        else {
            // TODO: Look up actual conference name/location
            var value = msg.command === XIMCommand.BB_PCONFNAME ? "Conference ".concat(confNum) : "/bbs/conf".concat(confNum);
            this.writeString(stringAddr, value, 200);
            console.log("  [RESULT] ".concat(value));
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle main line command (BB_MAINLINE)
     * From E sources (express.e:3794-3800):
     * - Return the current command and parameters
     */
    XIMProtocol.prototype.handleMainLine = function (msg) {
        var _a;
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        console.log('[XIMProtocol] BB_MAINLINE - Get main command line');
        // TODO: Return actual command and params from session
        var mainLine = ((_a = this.bbsSession) === null || _a === void 0 ? void 0 : _a.currentCommand) || '';
        this.writeString(stringAddr, mainLine, 200);
        console.log("  Command line: \"".concat(mainLine, "\""));
        this.sendReply(msg, 1);
    };
    /**
     * Handle callers log (BB_CALLERSLOG)
     * From E sources (express.e:3804-3805):
     * - Write to callers log file
     */
    XIMProtocol.prototype.handleCallersLog = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var logText = this.readString(stringAddr);
        console.log('[XIMProtocol] BB_CALLERSLOG - Write to callers log');
        console.log("  Log text: \"".concat(logText, "\""));
        // TODO: Implement callers log writing
        this.sendReply(msg, 1);
    };
    /**
     * Handle UD log (BB_UDLOG)
     * From E sources (express.e:3806-3807):
     * - Write to upload/download log
     */
    XIMProtocol.prototype.handleUDLog = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var logText = this.readString(stringAddr);
        console.log('[XIMProtocol] BB_UDLOG - Write to U/D log');
        console.log("  Log text: \"".concat(logText, "\""));
        // TODO: Implement U/D log writing
        this.sendReply(msg, 1);
    };
    /**
     * Handle task priority (BB_TASKPRI)
     * From E sources: Get/set task priority
     */
    XIMProtocol.prototype.handleTaskPri = function (msg) {
        console.log('[XIMProtocol] BB_TASKPRI - Task priority query');
        // Return default priority (0)
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        this.sendReply(msg, 1);
    };
    /**
     * Handle chat flag (BB_CHATFLAG, BB_CHATSET)
     * From E sources: Get/set chat availability
     */
    XIMProtocol.prototype.handleChat = function (msg) {
        console.log("[XIMProtocol] ".concat(msg.command === XIMCommand.BB_CHATFLAG ? 'BB_CHATFLAG' : 'BB_CHATSET', " - Chat status"));
        if (msg.command === XIMCommand.BB_CHATFLAG) {
            // Return chat availability (0 = no chat pending)
            this.emulator.writeMemory32(msg.msgAddr + 22, 0);
            console.log('  Chat flag: 0 (no chat)');
        }
        else {
            // Set chat availability
            var chatEnabled = msg.data !== 0;
            console.log("  Set chat: ".concat(chatEnabled ? 'enabled' : 'disabled'));
            // TODO: Store chat flag
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle drop DTR (BB_DROPDTR)
     * From E sources (express.e:3834-3839):
     * - Drop carrier / hang up modem
     */
    XIMProtocol.prototype.handleDropDTR = function (msg) {
        console.log('[XIMProtocol] BB_DROPDTR - Drop DTR (hangup)');
        // In web version, this would disconnect the socket
        // For now, just acknowledge
        console.log('  [TODO] Implement actual disconnect');
        this.sendReply(msg, 1);
    };
    /**
     * Handle get task (BB_GETTASK)
     * From E sources (express.e:3840-3841):
     * - Get current task pointer (Amiga-specific)
     */
    XIMProtocol.prototype.handleGetTask = function (msg) {
        console.log('[XIMProtocol] BB_GETTASK - Get task pointer');
        // Return dummy task pointer (not applicable in web version)
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        this.sendReply(msg, 1);
    };
    /**
     * Handle environment status (ENVSTAT)
     * From E sources (express.e:3677-3683):
     * - Get/set environment status
     */
    XIMProtocol.prototype.handleEnvStat = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        console.log('[XIMProtocol] ENVSTAT - Environment status');
        if (msg.data !== 0) {
            // READ - return current status
            var status_1 = 0; // TODO: Track actual status
            this.writeString(stringAddr, status_1.toString(), 10);
            console.log("  [READ] Status: ".concat(status_1));
        }
        else {
            // WRITE - set status
            var newStatus = this.readString(stringAddr);
            console.log("  [WRITE] Set status: ".concat(newStatus));
            // TODO: Store status
        }
        this.sendReply(msg, 1);
    };
    /**
     * Handle server new message (SV_NEWMSG)
     * From E sources (express.e:3684-3685):
     * - Set environment message
     */
    XIMProtocol.prototype.handleSvNewMsg = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var message = this.readString(stringAddr);
        console.log('[XIMProtocol] SV_NEWMSG - Set server message');
        console.log("  Message: \"".concat(message, "\""));
        // TODO: Store server message for display
        this.sendReply(msg, 1);
    };
    /**
     * Handle private command (PRV_COMMAND)
     * From E sources (express.e:3816-3818):
     * - Execute a BBS command from the door
     */
    XIMProtocol.prototype.handlePrvCommand = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var command = this.readString(stringAddr);
        console.log('[XIMProtocol] PRV_COMMAND - Execute BBS command');
        console.log("  Command: \"".concat(command, "\""));
        // TODO: Execute BBS command
        this.sendReply(msg, 1);
    };
    /**
     * Handle private group (PRV_GROUP)
     * From E sources (express.e:3819-3830):
     * - Modify conference/group settings
     */
    XIMProtocol.prototype.handlePrvGroup = function (msg) {
        var stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
        var groupData = this.readString(stringAddr);
        console.log('[XIMProtocol] PRV_GROUP - Modify group settings');
        console.log("  Group data: \"".concat(groupData, "\""));
        // TODO: Implement group modification
        this.sendReply(msg, 1);
    };
    /**
     * Write null-terminated string to memory
     */
    XIMProtocol.prototype.writeString = function (addr, str, maxLength) {
        var bytes = [];
        for (var i = 0; i < Math.min(str.length, maxLength - 1); i++) {
            bytes.push(str.charCodeAt(i));
        }
        bytes.push(0); // Null terminator
        for (var i = 0; i < bytes.length; i++) {
            this.emulator.writeMemory(addr + i, bytes[i]);
        }
    };
    /**
     * Send reply to door via ReplyMsg
     * Following E sources (express.e:1096, 4368) - BBS uses ReplyMsg()
     */
    XIMProtocol.prototype.sendReply = function (msg, data) {
        console.log('[XIMProtocol] Sending reply to door:');
        console.log("  Message: 0x".concat(msg.msgAddr.toString(16)));
        console.log("  Data: ".concat(data));
        // Update message data field with response
        this.emulator.writeMemory32(msg.msgAddr + 22, data);
        // Send message back to door via ReplyMsg (not PutMsg!)
        // ReplyMsg reads mn_ReplyPort from message and sends it there
        this.execLibrary.replyMsg(msg.msgAddr);
        console.log('[XIMProtocol] Reply sent via ReplyMsg');
    };
    /**
     * Read null-terminated string from memory
     */
    XIMProtocol.prototype.readString = function (addr, maxLength) {
        if (maxLength === void 0) { maxLength = 200; }
        var bytes = [];
        for (var i = 0; i < maxLength; i++) {
            var byte = this.emulator.readMemory(addr + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode.apply(String, bytes);
    };
    /**
     * Get human-readable command name
     */
    XIMProtocol.prototype.getCommandName = function (command) {
        var _a;
        var names = (_a = {},
            _a[XIMCommand.JH_LI] = 'JH_LI (Line Input)',
            _a[XIMCommand.JH_REGISTER] = 'JH_REGISTER',
            _a[XIMCommand.JH_SHUTDOWN] = 'JH_SHUTDOWN',
            _a[XIMCommand.JH_WRITE] = 'JH_WRITE',
            _a[XIMCommand.JH_SM] = 'JH_SM (Send Message)',
            _a[XIMCommand.JH_PM] = 'JH_PM (Prompt Message)',
            _a[XIMCommand.JH_HK] = 'JH_HK (Hotkey)',
            _a[XIMCommand.JH_CO] = 'JH_CO (Console Output)',
            _a[XIMCommand.JH_SO] = 'JH_SO (Serial Output)',
            _a[XIMCommand.GETKEY] = 'GETKEY',
            _a[XIMCommand.DT_NAME] = 'DT_NAME',
            _a[XIMCommand.DT_PASSWORD] = 'DT_PASSWORD',
            _a[XIMCommand.DT_LOCATION] = 'DT_LOCATION',
            _a[XIMCommand.DT_PHONENUMBER] = 'DT_PHONENUMBER',
            _a[XIMCommand.DT_REALNAME] = 'DT_REALNAME',
            _a[XIMCommand.DT_SLOTNUMBER] = 'DT_SLOTNUMBER',
            _a[XIMCommand.DT_SECSTATUS] = 'DT_SECSTATUS',
            _a[XIMCommand.DT_TIMELIMIT] = 'DT_TIMELIMIT',
            _a[XIMCommand.DT_LINELENGTH] = 'DT_LINELENGTH',
            _a[XIMCommand.DT_EXPERT] = 'DT_EXPERT',
            _a[XIMCommand.DT_MESSAGESPOSTED] = 'DT_MESSAGESPOSTED',
            _a[XIMCommand.DT_UPLOADS] = 'DT_UPLOADS',
            _a[XIMCommand.DT_DOWNLOADS] = 'DT_DOWNLOADS',
            _a[XIMCommand.DT_TIMESCALLED] = 'DT_TIMESCALLED',
            _a[XIMCommand.DT_TIMELASTON] = 'DT_TIMELASTON',
            _a[XIMCommand.DT_TIMEUSED] = 'DT_TIMEUSED',
            _a[XIMCommand.DT_TIMETOTAL] = 'DT_TIMETOTAL',
            _a[XIMCommand.DT_HOSTNAME] = 'DT_HOSTNAME',
            _a[XIMCommand.DT_HOSTIP] = 'DT_HOSTIP',
            _a[XIMCommand.EXPRESS_VERSION] = 'EXPRESS_VERSION',
            _a);
        return names[command] || "Unknown (".concat(command, ")");
    };
    return XIMProtocol;
}());
exports.XIMProtocol = XIMProtocol;
