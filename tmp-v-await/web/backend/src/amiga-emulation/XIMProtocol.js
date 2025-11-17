"use strict";
/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 *
 * This is the main coordinator that delegates to specialized modules:
 * - messages.ts: Message parsing and validation
 * - io.ts: Input/output operations (terminal, keyboard)
 * - data-query.ts: User data queries (DT_* commands)
 * - bbs-info.ts: BBS information queries (BB_* commands)
 * - system-commands.ts: System commands (registration, shutdown, etc)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XIMProtocol = exports.XIMCommand = void 0;
const types_1 = require("./xim/types");
const messages_1 = require("./xim/messages");
const io_1 = require("./xim/io");
const data_query_1 = require("./xim/data-query");
const bbs_info_1 = require("./xim/bbs-info");
const system_commands_1 = require("./xim/system-commands");
var types_2 = require("./xim/types");
Object.defineProperty(exports, "XIMCommand", { enumerable: true, get: function () { return types_2.XIMCommand; } });
class XIMProtocol {
    constructor(emulator, execLibrary, socket, doorPort, bbsSession) {
        this.doorReplyPort = 0;
        this.emulator = emulator;
        this.execLibrary = execLibrary;
        this.socket = socket;
        this.doorPort = doorPort;
        this.bbsSession = bbsSession || {};
        // Initialize specialized handlers
        this.messageParser = new messages_1.XIMMessageParser(emulator);
        this.ioHandler = new io_1.XIMIOHandler(emulator, execLibrary, socket, this.messageParser);
        this.dataQueryHandler = new data_query_1.XIMDataQueryHandler(emulator, execLibrary, this.messageParser, this.bbsSession);
        this.bbsInfoHandler = new bbs_info_1.XIMBBSInfoHandler(emulator, execLibrary, socket, this.messageParser, this.bbsSession);
        this.systemCommandsHandler = new system_commands_1.XIMSystemCommandsHandler(emulator, execLibrary, socket, this.messageParser, this.bbsSession);
        console.log('[XIMProtocol] Initialized');
        console.log(`  Door Port: 0x${doorPort.toString(16)}`);
        console.log(`  BBS Session: ${bbsSession ? 'Provided' : 'None'}`);
        if (bbsSession?.user) {
            console.log(`  User: ${bbsSession.user.username || 'Unknown'}`);
        }
    }
    /**
     * Check if waiting for line input from user
     */
    isWaitingForLineInput() {
        return this.ioHandler.isWaitingForLineInput();
    }
    /**
     * Queue input from terminal for door to read via GETKEY or JH_LI
     * Called from AmigaDoorSession when 'door:input' event received
     */
    queueInput(data) {
        this.ioHandler.queueInput(data);
    }
    /**
     * Update key state for simultaneous input (from keys:state event)
     * Called from AmigaDoorSession when 'keys:state' event received
     */
    updateKeyState(data) {
        this.ioHandler.updateKeyState(data);
    }
    /**
     * Get current key state (for doors that need to check multiple keys at once)
     */
    getKeyState() {
        return this.ioHandler.getKeyState();
    }
    /**
     * Check if a specific key is currently pressed
     */
    isKeyPressed(key) {
        return this.ioHandler.isKeyPressed(key);
    }
    /**
     * Parse XIM message from memory
     */
    parseMessage(msgAddr) {
        const msg = this.messageParser.parseMessage(msgAddr);
        // Save door's reply port for future responses
        if (msg.replyPort !== 0 && this.doorReplyPort === 0) {
            this.doorReplyPort = msg.replyPort;
            console.log('[XIMProtocol] Discovered door reply port: 0x' + msg.replyPort.toString(16));
        }
        return msg;
    }
    /**
     * Handle incoming XIM message from door
     * Routes to appropriate specialized handler based on command type
     */
    handleMessage(msg) {
        console.log(`[XIMProtocol] Handling command: ${this.messageParser.getCommandName(msg.command)}`);
        // I/O Commands - handled by XIMIOHandler
        if (this.isIOCommand(msg.command)) {
            this.handleIOCommand(msg);
            return;
        }
        // Data Query Commands (DT_*) - handled by XIMDataQueryHandler
        if (this.isDataQueryCommand(msg.command)) {
            this.dataQueryHandler.handleDataQuery(msg);
            return;
        }
        // BBS Info Commands (BB_*) - handled by XIMBBSInfoHandler
        if (this.isBBSInfoCommand(msg.command)) {
            this.handleBBSInfoCommand(msg);
            return;
        }
        // System Commands - handled by XIMSystemCommandsHandler
        if (this.isSystemCommand(msg.command)) {
            this.handleSystemCommand(msg);
            return;
        }
        // Unknown command
        console.log(`[XIMProtocol] Unhandled command: ${msg.command}`);
        this.sendReply(msg, 0);
    }
    /**
     * Check if command is an I/O command
     */
    isIOCommand(command) {
        return [
            types_1.XIMCommand.JH_LI,
            types_1.XIMCommand.JH_WRITE,
            types_1.XIMCommand.JH_SM,
            types_1.XIMCommand.JH_SMPTR,
            types_1.XIMCommand.JH_PM,
            types_1.XIMCommand.JH_HK,
            types_1.XIMCommand.JH_ExtHK,
            types_1.XIMCommand.JH_FetchKey,
            types_1.XIMCommand.JH_CO,
            types_1.XIMCommand.JH_SO,
            types_1.XIMCommand.JH_20,
            types_1.XIMCommand.QUICK_KEY,
            types_1.XIMCommand.GETKEY,
            types_1.XIMCommand.PG_SM,
            types_1.XIMCommand.PG_UD,
            types_1.XIMCommand.PG_US,
        ].includes(command);
    }
    /**
     * Handle I/O commands
     */
    handleIOCommand(msg) {
        switch (msg.command) {
            case types_1.XIMCommand.JH_LI:
                this.ioHandler.handleLineInput(msg);
                break;
            case types_1.XIMCommand.JH_WRITE:
                this.ioHandler.handleWrite(msg);
                break;
            case types_1.XIMCommand.JH_SM:
            case types_1.XIMCommand.JH_SMPTR:
                this.ioHandler.handleSendMessage(msg);
                break;
            case types_1.XIMCommand.JH_PM:
                this.ioHandler.handlePromptMessage(msg);
                break;
            case types_1.XIMCommand.JH_HK:
                this.ioHandler.handleHotkey(msg);
                break;
            case types_1.XIMCommand.JH_ExtHK:
                this.ioHandler.handleExtendedHotkey(msg);
                break;
            case types_1.XIMCommand.JH_FetchKey:
                this.ioHandler.handleFetchKey(msg);
                break;
            case types_1.XIMCommand.JH_CO:
                this.ioHandler.handleConsoleOutput(msg);
                break;
            case types_1.XIMCommand.JH_SO:
                this.ioHandler.handleSerialOutput(msg);
                break;
            case types_1.XIMCommand.JH_20:
            case types_1.XIMCommand.QUICK_KEY:
                this.ioHandler.handleQuickKey(msg);
                break;
            case types_1.XIMCommand.GETKEY:
                this.ioHandler.handleGetKey(msg);
                break;
            case types_1.XIMCommand.PG_SM:
                this.ioHandler.handleScreenMessage(msg);
                break;
            case types_1.XIMCommand.PG_UD:
                this.ioHandler.handleUserData(msg, this.bbsSession);
                break;
            case types_1.XIMCommand.PG_US:
                this.ioHandler.handleUserString(msg, this.bbsSession);
                break;
        }
    }
    /**
     * Check if command is a data query command
     */
    isDataQueryCommand(command) {
        return (command >= 100 && command <= 146) ||
            (command >= 527 && command <= 545) ||
            (command === 606) ||
            (command >= 700 && command <= 701) ||
            (command >= 1000 && command <= 1002);
    }
    /**
     * Check if command is a BBS info command
     */
    isBBSInfoCommand(command) {
        return [
            types_1.XIMCommand.JH_BBSNAME,
            types_1.XIMCommand.JH_SYSOP,
            types_1.XIMCommand.EXPRESS_VERSION,
            types_1.XIMCommand.BB_NODEID,
            types_1.XIMCommand.BB_CONFNAME,
            types_1.XIMCommand.BB_CONFLOCAL,
            types_1.XIMCommand.BB_LOCAL,
            types_1.XIMCommand.BB_CONFNUM,
            types_1.XIMCommand.BB_LOGONTYPE,
            types_1.XIMCommand.BB_SCRWIDTH,
            types_1.XIMCommand.BB_SCRHEIGHT,
            types_1.XIMCommand.BB_SCRLEFT,
            types_1.XIMCommand.BB_SCRTOP,
            types_1.XIMCommand.BB_PURGELINE,
            types_1.XIMCommand.BB_PURGELINESTART,
            types_1.XIMCommand.BB_PURGELINEEND,
            types_1.XIMCommand.BB_NONSTOPTEXT,
            types_1.XIMCommand.BB_LINECOUNT,
            types_1.XIMCommand.BB_PCONFNAME,
            types_1.XIMCommand.BB_PCONFLOCAL,
            types_1.XIMCommand.BB_MAINLINE,
            types_1.XIMCommand.BB_CALLERSLOG,
            types_1.XIMCommand.BB_UDLOG,
            types_1.XIMCommand.BB_TASKPRI,
            types_1.XIMCommand.BB_CHATFLAG,
            types_1.XIMCommand.BB_CHATSET,
            types_1.XIMCommand.BB_DROPDTR,
            types_1.XIMCommand.BB_GETTASK,
        ].includes(command);
    }
    /**
     * Handle BBS info commands
     */
    handleBBSInfoCommand(msg) {
        switch (msg.command) {
            case types_1.XIMCommand.JH_BBSNAME:
                this.bbsInfoHandler.handleBBSName(msg);
                break;
            case types_1.XIMCommand.JH_SYSOP:
                this.bbsInfoHandler.handleSysopName(msg);
                break;
            case types_1.XIMCommand.EXPRESS_VERSION:
                this.bbsInfoHandler.handleExpressVersion(msg);
                break;
            case types_1.XIMCommand.BB_NODEID:
                this.bbsInfoHandler.handleNodeID(msg);
                break;
            case types_1.XIMCommand.BB_CONFNAME:
            case types_1.XIMCommand.BB_CONFLOCAL:
            case types_1.XIMCommand.BB_LOCAL:
            case types_1.XIMCommand.BB_CONFNUM:
            case types_1.XIMCommand.BB_LOGONTYPE:
                this.bbsInfoHandler.handleBBSInfo(msg);
                break;
            case types_1.XIMCommand.BB_SCRWIDTH:
            case types_1.XIMCommand.BB_SCRHEIGHT:
            case types_1.XIMCommand.BB_SCRLEFT:
            case types_1.XIMCommand.BB_SCRTOP:
                this.bbsInfoHandler.handleScreenDimensions(msg);
                break;
            case types_1.XIMCommand.BB_PURGELINE:
            case types_1.XIMCommand.BB_PURGELINESTART:
            case types_1.XIMCommand.BB_PURGELINEEND:
                this.bbsInfoHandler.handlePurgeLine(msg);
                break;
            case types_1.XIMCommand.BB_NONSTOPTEXT:
                this.bbsInfoHandler.handleNonStopText(msg);
                break;
            case types_1.XIMCommand.BB_LINECOUNT:
                this.bbsInfoHandler.handleLineCount(msg);
                break;
            case types_1.XIMCommand.BB_PCONFNAME:
            case types_1.XIMCommand.BB_PCONFLOCAL:
                this.bbsInfoHandler.handlePConf(msg);
                break;
            case types_1.XIMCommand.BB_MAINLINE:
                this.bbsInfoHandler.handleMainLine(msg);
                break;
            case types_1.XIMCommand.BB_CALLERSLOG:
                this.bbsInfoHandler.handleCallersLog(msg);
                break;
            case types_1.XIMCommand.BB_UDLOG:
                this.bbsInfoHandler.handleUDLog(msg);
                break;
            case types_1.XIMCommand.BB_TASKPRI:
                this.bbsInfoHandler.handleTaskPri(msg);
                break;
            case types_1.XIMCommand.BB_CHATFLAG:
            case types_1.XIMCommand.BB_CHATSET:
                this.bbsInfoHandler.handleChat(msg);
                break;
            case types_1.XIMCommand.BB_DROPDTR:
                this.bbsInfoHandler.handleDropDTR(msg);
                break;
            case types_1.XIMCommand.BB_GETTASK:
                this.bbsInfoHandler.handleGetTask(msg);
                break;
        }
    }
    /**
     * Check if command is a system command
     */
    isSystemCommand(command) {
        return [
            types_1.XIMCommand.JH_REGISTER,
            types_1.XIMCommand.JH_SHUTDOWN,
            types_1.XIMCommand.JH_SIGBIT,
            types_1.XIMCommand.JH_MCI,
            types_1.XIMCommand.JH_SG,
            types_1.XIMCommand.JH_SF,
            types_1.XIMCommand.JH_EF,
            types_1.XIMCommand.JH_FLAGFILE,
            types_1.XIMCommand.RAWARROW,
            types_1.XIMCommand.RETURNCOMMAND,
            types_1.XIMCommand.RETURNCOMMAND2,
            types_1.XIMCommand.CHAIN,
            types_1.XIMCommand.ENVSTAT,
            types_1.XIMCommand.SV_NEWMSG,
            types_1.XIMCommand.PRV_COMMAND,
            types_1.XIMCommand.PRV_GROUP,
        ].includes(command);
    }
    /**
     * Handle system commands
     */
    handleSystemCommand(msg) {
        switch (msg.command) {
            case types_1.XIMCommand.JH_REGISTER:
                this.systemCommandsHandler.handleRegister(msg);
                break;
            case types_1.XIMCommand.JH_SHUTDOWN:
                this.systemCommandsHandler.handleShutdown(msg);
                break;
            case types_1.XIMCommand.JH_SIGBIT:
                this.systemCommandsHandler.handleSignalBit(msg);
                break;
            case types_1.XIMCommand.JH_MCI:
                this.systemCommandsHandler.handleMCI(msg);
                break;
            case types_1.XIMCommand.JH_SG:
                this.systemCommandsHandler.handleSecurityScreen(msg);
                break;
            case types_1.XIMCommand.JH_SF:
                this.systemCommandsHandler.handleShowFile(msg);
                break;
            case types_1.XIMCommand.JH_EF:
                this.systemCommandsHandler.handleEditFile(msg);
                break;
            case types_1.XIMCommand.JH_FLAGFILE:
                this.systemCommandsHandler.handleFlagFile(msg);
                break;
            case types_1.XIMCommand.RAWARROW:
                this.systemCommandsHandler.handleRawArrow(msg);
                break;
            case types_1.XIMCommand.RETURNCOMMAND:
            case types_1.XIMCommand.RETURNCOMMAND2:
                this.systemCommandsHandler.handleReturnCommand(msg);
                break;
            case types_1.XIMCommand.CHAIN:
                this.systemCommandsHandler.handleChain(msg);
                break;
            case types_1.XIMCommand.ENVSTAT:
                this.systemCommandsHandler.handleEnvStat(msg);
                break;
            case types_1.XIMCommand.SV_NEWMSG:
                this.systemCommandsHandler.handleSvNewMsg(msg);
                break;
            case types_1.XIMCommand.PRV_COMMAND:
                this.systemCommandsHandler.handlePrvCommand(msg);
                break;
            case types_1.XIMCommand.PRV_GROUP:
                this.systemCommandsHandler.handlePrvGroup(msg);
                break;
        }
    }
    /**
     * Send reply to door via ReplyMsg
     */
    sendReply(msg, data) {
        this.emulator.writeMemory32(msg.msgAddr + 22, data);
        this.execLibrary.replyMsg(msg.msgAddr);
    }
}
exports.XIMProtocol = XIMProtocol;
