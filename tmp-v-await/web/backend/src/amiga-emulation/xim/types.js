"use strict";
/**
 * XIM Protocol Type Definitions
 *
 * All interfaces and enums for the eXpress Interface Module (XIM) protocol.
 * Based on aedoor.h specification from AmiExpress sources.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XIMCommand = void 0;
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
    // PG_* commands (express.e/axconsts.e)
    XIMCommand[XIMCommand["PG_SM"] = 1] = "PG_SM";
    XIMCommand[XIMCommand["PG_UD"] = 13] = "PG_UD";
    XIMCommand[XIMCommand["PG_US"] = 14] = "PG_US";
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
