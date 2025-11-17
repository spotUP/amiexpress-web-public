"use strict";
/**
 * XIM Data Query Handler
 *
 * Handles all DT_* commands for querying and modifying user data.
 * From E sources (express.e:3494-3981)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XIMDataQueryHandler = void 0;
const types_1 = require("./types");
class XIMDataQueryHandler {
    constructor(emulator, execLibrary, messageParser, bbsSession) {
        this.emulator = emulator;
        this.execLibrary = execLibrary;
        this.messageParser = messageParser;
        this.bbsSession = bbsSession;
    }
    /**
     * Handle data query commands
     * Protocol:
     * - msg.data = direction flag:
     *   - IF msg.data != 0: READ mode - copy user data TO msg.string
     *   - IF msg.data == 0: WRITE mode - copy msg.string TO user data
     */
    handleDataQuery(msg) {
        console.log(`[XIMDataQuery] Door querying data: ${this.messageParser.getCommandName(msg.command)}`);
        console.log(`  msg.data (direction): ${msg.data} (${msg.data !== 0 ? 'READ' : 'WRITE'})`);
        // CRITICAL FIX: string[200] is embedded in jhMessage at offset 20, NOT a pointer
        // jhMessage structure: header(20) + string[200](20-219) + data(220-223) + command(224-227)
        const stringAddr = msg.msgAddr + 20;
        console.log(`  String address: 0x${stringAddr.toString(16)} (embedded in message)`);
        const isRead = msg.data !== 0;
        const user = this.bbsSession?.user;
        switch (msg.command) {
            case types_1.XIMCommand.DT_NAME:
                if (isRead) {
                    const username = user?.username || 'Guest';
                    this.messageParser.writeString(stringAddr, username, 31);
                    console.log(`  [READ] DT_NAME: "${username}"`);
                }
                else {
                    const newName = this.messageParser.readString(stringAddr, 31);
                    if (user)
                        user.username = newName;
                    console.log(`  [WRITE] DT_NAME: "${newName}"`);
                }
                break;
            case types_1.XIMCommand.DT_PASSWORD:
                if (isRead) {
                    this.messageParser.writeString(stringAddr, '', 40);
                    console.log(`  [READ] DT_PASSWORD: (blocked - security)`);
                }
                else {
                    console.log(`  [WRITE] DT_PASSWORD: (not implemented - needs hashing)`);
                }
                break;
            case types_1.XIMCommand.DT_LOCATION:
                if (isRead) {
                    const location = user?.location || 'Unknown';
                    this.messageParser.writeString(stringAddr, location, 30);
                    console.log(`  [READ] DT_LOCATION: "${location}"`);
                }
                else {
                    const newLocation = this.messageParser.readString(stringAddr, 30);
                    if (user)
                        user.location = newLocation;
                    console.log(`  [WRITE] DT_LOCATION: "${newLocation}"`);
                }
                break;
            case types_1.XIMCommand.DT_PHONENUMBER:
                if (isRead) {
                    const phone = user?.phone || '';
                    this.messageParser.writeString(stringAddr, phone, 13);
                    console.log(`  [READ] DT_PHONENUMBER: "${phone}"`);
                }
                else {
                    const newPhone = this.messageParser.readString(stringAddr, 13);
                    if (user)
                        user.phone = newPhone;
                    console.log(`  [WRITE] DT_PHONENUMBER: "${newPhone}"`);
                }
                break;
            case types_1.XIMCommand.DT_REALNAME:
                if (isRead) {
                    const realname = user?.realname || '';
                    this.messageParser.writeString(stringAddr, realname, 26);
                    console.log(`  [READ] DT_REALNAME: "${realname}"`);
                }
                else {
                    const newRealname = this.messageParser.readString(stringAddr, 26);
                    if (user)
                        user.realname = newRealname;
                    console.log(`  [WRITE] DT_REALNAME: "${newRealname}"`);
                }
                break;
            case types_1.XIMCommand.DT_SLOTNUMBER:
                if (isRead) {
                    const slotNum = user?.id || 1;
                    this.messageParser.writeString(stringAddr, slotNum.toString(), 200);
                    console.log(`  [READ] DT_SLOTNUMBER: ${slotNum}`);
                }
                else {
                    const newSlot = parseInt(this.messageParser.readString(stringAddr, 200));
                    if (user)
                        user.id = newSlot;
                    console.log(`  [WRITE] DT_SLOTNUMBER: ${newSlot}`);
                }
                break;
            case types_1.XIMCommand.DT_SECSTATUS:
                if (isRead) {
                    const secLevel = user?.secLevel || 10;
                    this.messageParser.writeString(stringAddr, secLevel.toString(), 200);
                    console.log(`  [READ] DT_SECSTATUS: ${secLevel}`);
                }
                else {
                    const newLevel = parseInt(this.messageParser.readString(stringAddr, 200));
                    if (user)
                        user.secLevel = newLevel;
                    console.log(`  [WRITE] DT_SECSTATUS: ${newLevel}`);
                }
                break;
            case types_1.XIMCommand.DT_SECBOARD:
                if (isRead) {
                    const secBoard = user?.secBoard || 0;
                    this.messageParser.writeString(stringAddr, secBoard.toString(), 200);
                    console.log(`  [READ] DT_SECBOARD: ${secBoard}`);
                }
                else {
                    const newSec = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secBoard = newSec;
                    console.log(`  [WRITE] DT_SECBOARD: ${newSec}`);
                }
                break;
            case types_1.XIMCommand.DT_SECLIBRARY:
                if (isRead) {
                    const secLibrary = user?.secLibrary || 0;
                    this.messageParser.writeString(stringAddr, secLibrary.toString(), 200);
                    console.log(`  [READ] DT_SECLIBRARY: ${secLibrary}`);
                }
                else {
                    const newSec = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secLibrary = newSec;
                    console.log(`  [WRITE] DT_SECLIBRARY: ${newSec}`);
                }
                break;
            case types_1.XIMCommand.DT_SECBULLETIN:
                if (isRead) {
                    const secBulletin = user?.secBulletin || 0;
                    this.messageParser.writeString(stringAddr, secBulletin.toString(), 200);
                    console.log(`  [READ] DT_SECBULLETIN: ${secBulletin}`);
                }
                else {
                    const newSec = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newSec))
                        user.secBulletin = newSec;
                    console.log(`  [WRITE] DT_SECBULLETIN: ${newSec}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMELIMIT:
                if (isRead) {
                    const timeLimit = user?.timeLimit || 60;
                    this.messageParser.writeString(stringAddr, timeLimit.toString(), 200);
                    console.log(`  [READ] DT_TIMELIMIT: ${timeLimit}`);
                }
                else {
                    const newLimit = parseInt(this.messageParser.readString(stringAddr, 200));
                    if (user)
                        user.timeLimit = newLimit;
                    console.log(`  [WRITE] DT_TIMELIMIT: ${newLimit}`);
                }
                break;
            case types_1.XIMCommand.DT_LINELENGTH:
                if (isRead) {
                    const lineLen = 80;
                    this.messageParser.writeString(stringAddr, lineLen.toString(), 200);
                    console.log(`  [READ] DT_LINELENGTH: ${lineLen}`);
                }
                else {
                    const newLen = parseInt(this.messageParser.readString(stringAddr, 200));
                    console.log(`  [WRITE] DT_LINELENGTH: ${newLen}`);
                }
                break;
            case types_1.XIMCommand.DT_EXPERT:
                if (isRead) {
                    const expert = user?.expert ? 'Y' : 'N';
                    this.messageParser.writeString(stringAddr, expert, 200);
                    console.log(`  [READ] DT_EXPERT: ${expert}`);
                }
                else {
                    const expertStr = this.messageParser.readString(stringAddr, 1);
                    if (user)
                        user.expert = (expertStr === 'Y' || expertStr === 'y');
                    console.log(`  [WRITE] DT_EXPERT: ${expertStr}`);
                }
                break;
            case types_1.XIMCommand.DT_MESSAGESPOSTED:
                if (isRead) {
                    const msgs = user?.messagesPosted || 0;
                    this.messageParser.writeString(stringAddr, msgs.toString(), 200);
                    console.log(`  [READ] DT_MESSAGESPOSTED: ${msgs}`);
                }
                break;
            case types_1.XIMCommand.DT_UPLOADS:
                if (isRead) {
                    const uploads = user?.uploads || 0;
                    this.messageParser.writeString(stringAddr, uploads.toString(), 200);
                    console.log(`  [READ] DT_UPLOADS: ${uploads}`);
                }
                break;
            case types_1.XIMCommand.DT_DOWNLOADS:
                if (isRead) {
                    const downloads = user?.downloads || 0;
                    this.messageParser.writeString(stringAddr, downloads.toString(), 200);
                    console.log(`  [READ] DT_DOWNLOADS: ${downloads}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMESCALLED:
                if (isRead) {
                    const calls = user?.timesCalled || 0;
                    this.messageParser.writeString(stringAddr, calls.toString(), 200);
                    console.log(`  [READ] DT_TIMESCALLED: ${calls}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMELASTON:
                if (isRead) {
                    const lastOn = user?.lastLoginAt ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0;
                    this.messageParser.writeString(stringAddr, lastOn.toString(), 200);
                    console.log(`  [READ] DT_TIMELASTON: ${lastOn}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMEUSED:
                if (isRead) {
                    const timeUsed = user?.timeUsed || 0;
                    this.messageParser.writeString(stringAddr, timeUsed.toString(), 200);
                    console.log(`  [READ] DT_TIMEUSED: ${timeUsed}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMETOTAL:
                if (isRead) {
                    const timeTotal = user?.timeTotal || 0;
                    this.messageParser.writeString(stringAddr, timeTotal.toString(), 200);
                    console.log(`  [READ] DT_TIMETOTAL: ${timeTotal}`);
                }
                break;
            case types_1.XIMCommand.DT_BYTESUPLOAD:
                if (isRead) {
                    const bytesUp = user?.bytesUpload || 0;
                    this.messageParser.writeString(stringAddr, bytesUp.toString(), 200);
                    console.log(`  [READ] DT_BYTESUPLOAD: ${bytesUp}`);
                }
                else {
                    const newBytes = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newBytes))
                        user.bytesUpload = newBytes;
                    console.log(`  [WRITE] DT_BYTESUPLOAD: ${newBytes}`);
                }
                break;
            case types_1.XIMCommand.DT_BYTEDOWNLOAD:
                if (isRead) {
                    const bytesDown = user?.bytesDownload || 0;
                    this.messageParser.writeString(stringAddr, bytesDown.toString(), 200);
                    console.log(`  [READ] DT_BYTEDOWNLOAD: ${bytesDown}`);
                }
                else {
                    const newBytes = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newBytes))
                        user.bytesDownload = newBytes;
                    console.log(`  [WRITE] DT_BYTEDOWNLOAD: ${newBytes}`);
                }
                break;
            case types_1.XIMCommand.DT_DAILYBYTELIMIT:
                if (isRead) {
                    const limit = user?.dailyBytesLimit || 0;
                    this.messageParser.writeString(stringAddr, limit.toString(), 200);
                    console.log(`  [READ] DT_DAILYBYTELIMIT: ${limit}`);
                }
                else {
                    const newLimit = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newLimit))
                        user.dailyBytesLimit = newLimit;
                    console.log(`  [WRITE] DT_DAILYBYTELIMIT: ${newLimit}`);
                }
                break;
            case types_1.XIMCommand.DT_DAILYBYTEDLD:
                if (isRead) {
                    const dailyDld = user?.dailyBytesDld || 0;
                    this.messageParser.writeString(stringAddr, dailyDld.toString(), 200);
                    console.log(`  [READ] DT_DAILYBYTEDLD: ${dailyDld}`);
                }
                else {
                    const newDld = parseInt(this.messageParser.readString(stringAddr));
                    if (user && !isNaN(newDld))
                        user.dailyBytesDld = newDld;
                    console.log(`  [WRITE] DT_DAILYBYTEDLD: ${newDld}`);
                }
                break;
            case types_1.XIMCommand.DT_HOSTNAME:
                if (isRead) {
                    const hostname = this.bbsSession?.hostname || 'localhost';
                    this.messageParser.writeString(stringAddr, hostname, 200);
                    console.log(`  [READ] DT_HOSTNAME: "${hostname}"`);
                }
                break;
            case types_1.XIMCommand.DT_HOSTIP:
                if (isRead) {
                    const hostip = this.bbsSession?.hostip || '127.0.0.1';
                    this.messageParser.writeString(stringAddr, hostip, 200);
                    console.log(`  [READ] DT_HOSTIP: "${hostip}"`);
                }
                break;
            case types_1.XIMCommand.DT_STAMP_LASTON:
                if (isRead) {
                    // Format as Amiga-style date: "DD-MMM-YY HH:MM:SS"
                    // Based on express.e:3769 formatCDateTime(loggedOnUser.timeLastOn,tempstring)
                    if (user?.lastLoginAt) {
                        const lastOn = new Date(user.lastLoginAt);
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const day = lastOn.getDate().toString().padStart(2, '0');
                        const month = months[lastOn.getMonth()];
                        const year = lastOn.getFullYear().toString().slice(-2);
                        const hours = lastOn.getHours().toString().padStart(2, '0');
                        const minutes = lastOn.getMinutes().toString().padStart(2, '0');
                        const seconds = lastOn.getSeconds().toString().padStart(2, '0');
                        const amigaDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
                        this.messageParser.writeString(stringAddr, amigaDate, 200);
                        console.log(`  [READ] DT_STAMP_LASTON: "${amigaDate}"`);
                    }
                    else {
                        this.messageParser.writeString(stringAddr, '01-Jan-70 00:00:00', 200);
                        console.log(`  [READ] DT_STAMP_LASTON: "01-Jan-70 00:00:00" (never logged in)`);
                    }
                }
                break;
            case types_1.XIMCommand.DT_STAMP_CTIME:
                if (isRead) {
                    // Format as Amiga-style date: "DD-MMM-YY HH:MM:SS"
                    // Based on express.e:3775 formatCDateTime(getSystemTime(),tempstring)
                    const now = new Date();
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const day = now.getDate().toString().padStart(2, '0');
                    const month = months[now.getMonth()];
                    const year = now.getFullYear().toString().slice(-2);
                    const hours = now.getHours().toString().padStart(2, '0');
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    const seconds = now.getSeconds().toString().padStart(2, '0');
                    const amigaDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
                    this.messageParser.writeString(stringAddr, amigaDate, 200);
                    console.log(`  [READ] DT_STAMP_CTIME: "${amigaDate}"`);
                }
                break;
            case types_1.XIMCommand.DT_CURR_TIME:
                if (isRead) {
                    const currTime = Math.floor(Date.now() / 1000);
                    this.messageParser.writeString(stringAddr, currTime.toString(), 200);
                    console.log(`  [READ] DT_CURR_TIME: ${currTime}`);
                }
                break;
            case types_1.XIMCommand.DT_TIMEOUT:
                if (isRead) {
                    const timeout = 300;
                    this.messageParser.writeString(stringAddr, timeout.toString(), 200);
                    console.log(`  [READ] DT_TIMEOUT: ${timeout}`);
                }
                break;
            case types_1.XIMCommand.DT_CONFACCESS:
                if (isRead) {
                    const confAccess = user?.confAccess || '';
                    this.messageParser.writeString(stringAddr, confAccess, 10);
                    console.log(`  [READ] DT_CONFACCESS: "${confAccess}"`);
                }
                else {
                    const newAccess = this.messageParser.readString(stringAddr, 10);
                    if (user)
                        user.confAccess = newAccess;
                    console.log(`  [WRITE] DT_CONFACCESS: "${newAccess}"`);
                }
                break;
            case types_1.XIMCommand.DT_LANGUAGE:
                if (isRead) {
                    const language = user?.language || 'txt';
                    this.messageParser.writeString(stringAddr, language, 200);
                    console.log(`  [READ] DT_LANGUAGE: "${language}"`);
                }
                break;
            case types_1.XIMCommand.DT_ANSICOLOR:
            case types_1.XIMCommand.DT_ISANSI:
                if (isRead) {
                    const isAnsi = user?.ansi || true;
                    this.messageParser.writeString(stringAddr, isAnsi ? '1' : '0', 200);
                    console.log(`  [READ] ${this.messageParser.getCommandName(msg.command)}: ${isAnsi}`);
                }
                break;
            case types_1.XIMCommand.DT_MSGCODE:
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                console.log('  DT_MSGCODE: 0');
                break;
            case types_1.XIMCommand.DT_FILECODE:
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                console.log('  DT_FILECODE: 0');
                break;
            case types_1.XIMCommand.DT_QUICKFLAG:
            case types_1.XIMCommand.DT_GOODFILE:
                if (isRead) {
                    this.messageParser.writeString(stringAddr, '0', 200);
                    console.log(`  [READ] ${this.messageParser.getCommandName(msg.command)}: 0`);
                }
                break;
            case types_1.XIMCommand.DT_DUMP:
                if (isRead) {
                    const dumpData = JSON.stringify(user || {}, null, 2);
                    this.messageParser.writeString(stringAddr, dumpData, 200);
                    console.log(`  [READ] DT_DUMP: User data dumped`);
                }
                break;
            case types_1.XIMCommand.ACTIVE_NODES:
                if (isRead) {
                    const { nodeFileManager } = require('../../../services/NodeFileManager');
                    let nodesStatus = '';
                    for (let i = 0; i < 32; i++) {
                        const isActive = nodeFileManager.nodeUserFilesExist(i);
                        nodesStatus += isActive ? 'X' : ' ';
                    }
                    this.messageParser.writeString(stringAddr, nodesStatus, 32);
                    console.log(`  [READ] ACTIVE_NODES: ${nodesStatus.replace(/ /g, '_')}`);
                }
                break;
            case types_1.XIMCommand.DT_ADDBIT:
            case types_1.XIMCommand.DT_REMBIT:
            case types_1.XIMCommand.DT_QUERYBIT:
                console.log(`  [TODO] ${this.messageParser.getCommandName(msg.command)}`);
                this.emulator.writeMemory32(msg.msgAddr + 22, 0);
                break;
            default:
                console.log(`  [UNHANDLED] ${this.messageParser.getCommandName(msg.command)}`);
        }
        this.sendReply(msg, 1);
    }
    /**
     * Send reply to door
     */
    sendReply(msg, data) {
        this.emulator.writeMemory32(msg.msgAddr + 22, data);
        this.execLibrary.replyMsg(msg.msgAddr);
    }
}
exports.XIMDataQueryHandler = XIMDataQueryHandler;
