"use strict";
/**
 * GlobalStructures - Amiga BBS global data structures for shared memory
 *
 * These structures match the Amiga E definitions in axcommon.e
 * and are used to share BBS configuration and state with 68K doors.
 *
 * Based on: AmiExpress-Sources/axcommon.e
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedBBSData = exports.NodeStateGlobals = exports.StartOptionStructure = exports.CommandsStructure = void 0;
/**
 * Commands structure - BBS configuration and settings
 * Corresponds to axcommon.e lines 397-484
 *
 * TOTAL SIZE: 1976 bytes (0x7B8)
 *
 * Structure layout:
 * +0x00: acLvl[100] (100 bytes) - access levels
 * +0x64: serDevUnit (1 byte) - serial device unit
 * +0x65: serDev[40] (40 bytes) - serial device name
 * +0x8D: newUserPw[15] (15 bytes) - new user password
 * +0x9C: openingBaud (LONG = 4 bytes)
 * +0xA0: taskPri (CHAR = 1 byte)
 * +0xA1: confNames[540] (540 bytes) - 10 conference names @ 54 bytes each
 * +0x2BD: confLocs[540] (540 bytes) - 10 conference locations @ 54 bytes each
 * +0x4D9: bbsName[41] (41 bytes)
 * +0x502: bbsLoc[41] (41 bytes)
 * +0x52B: sysopName[41] (41 bytes)
 * +0x554: pSAcLvl[6] (6 bytes) - predefined security access levels
 * +0x55A: pSRType[6] (6 bytes) - ratio types
 * +0x560: pSRatio[6] (6 bytes) - ratios
 * +0x566: pSDBytes[6] (24 bytes = 6 LONGs) - daily bytes
 * +0x57E: pSTime[6] (24 bytes = 6 LONGs) - time limits
 * +0x596: pSCnfAc1-10[6] (60 bytes) - conference access per security level
 * +0x5D2: mInit[101] (101 bytes) - modem init string
 * +0x637: mReset[31] (31 bytes)
 * +0x656: mRing[31] (31 bytes)
 * +0x675: mAnswer[31] (31 bytes)
 * +0x694: mConnects[186] (186 bytes)
 * +0x74E: numConf (INT = 2 bytes)
 * +0x750: sysPass[31] (31 bytes)
 * +0x76F: remotePass[31] (31 bytes)
 * +0x78E: baudTimes[10] (20 bytes = 10 INTs)
 * +0x7A2: pad[22] (22 bytes)
 * TOTAL: 1976 bytes (0x7B8)
 */
class CommandsStructure {
    static writeToMemory(emulator, addr, session) {
        console.log(`[CommandsStructure] Writing commands at 0x${addr.toString(16)}`);
        // +0x00: acLvl[100] - access levels (fill with defaults)
        for (let i = 0; i < 100; i++) {
            emulator.writeMemory(addr + 0x00 + i, i); // Simple linear access level
        }
        // +0x64: serDevUnit (CHAR)
        emulator.writeMemory(addr + 0x64, 0);
        // +0x65: serDev[40] - serial device name
        this.writeString(emulator, addr + 0x65, 'serial.device', 40);
        // +0x8D: newUserPw[15]
        this.writeString(emulator, addr + 0x8D, '', 15);
        // +0x9C: openingBaud (LONG)
        emulator.writeMemory32(addr + 0x9C, 57600);
        // +0xA0: taskPri (CHAR)
        emulator.writeMemory(addr + 0xA0, 0);
        // +0xA1: confNames[540] - 10 conferences @ 54 bytes each
        const confNames = [
            'Main Conference',
            'General Discussion',
            'Technical Support',
            'Games & Entertainment',
            'Files & Downloads',
            'Announcements',
            'Off Topic',
            'Development',
            'Trading Post',
            'Feedback'
        ];
        for (let i = 0; i < 10; i++) {
            const confName = i < confNames.length ? confNames[i] : `Conference ${i + 1}`;
            this.writeString(emulator, addr + 0xA1 + (i * 54), confName, 54);
        }
        // +0x2BD: confLocs[540] - 10 conference locations @ 54 bytes each
        for (let i = 0; i < 10; i++) {
            this.writeString(emulator, addr + 0x2BD + (i * 54), `BBS:Conf0${i + 1}`, 54);
        }
        // +0x4D9: bbsName[41]
        this.writeString(emulator, addr + 0x4D9, process.env.BBS_NAME || 'AmiExpress Web BBS', 41);
        // +0x502: bbsLoc[41]
        this.writeString(emulator, addr + 0x502, process.env.BBS_LOCATION || 'https://amiexpress.com', 41);
        // +0x52B: sysopName[41]
        this.writeString(emulator, addr + 0x52B, process.env.SYSOP_NAME || 'SysOp', 41);
        // +0x554: pSAcLvl[6] - predefined security levels
        const pSAcLvl = [10, 20, 50, 100, 150, 200];
        for (let i = 0; i < 6; i++) {
            emulator.writeMemory(addr + 0x554 + i, pSAcLvl[i]);
        }
        // +0x55A: pSRType[6] - ratio types
        for (let i = 0; i < 6; i++) {
            emulator.writeMemory(addr + 0x55A + i, 0);
        }
        // +0x560: pSRatio[6]
        for (let i = 0; i < 6; i++) {
            emulator.writeMemory(addr + 0x560 + i, 0);
        }
        // +0x566: pSDBytes[6] - daily bytes (6 LONGs)
        const dailyBytes = [0, 1048576, 10485760, 104857600, 0, 0]; // 0, 1MB, 10MB, 100MB, unlimited, unlimited
        for (let i = 0; i < 6; i++) {
            emulator.writeMemory32(addr + 0x566 + (i * 4), dailyBytes[i]);
        }
        // +0x57E: pSTime[6] - time limits (6 LONGs)
        const timeLimits = [1800, 3600, 7200, 14400, 28800, 0]; // 30min, 1hr, 2hr, 4hr, 8hr, unlimited
        for (let i = 0; i < 6; i++) {
            emulator.writeMemory32(addr + 0x57E + (i * 4), timeLimits[i]);
        }
        // +0x596: pSCnfAc1-10[6] - conference access (60 bytes total)
        for (let i = 0; i < 60; i++) {
            emulator.writeMemory(addr + 0x596 + i, 1); // All conferences accessible
        }
        // +0x5D2: mInit[101]
        this.writeString(emulator, addr + 0x5D2, 'AT&F', 101);
        // +0x637: mReset[31]
        this.writeString(emulator, addr + 0x637, 'ATZ', 31);
        // +0x656: mRing[31]
        this.writeString(emulator, addr + 0x656, 'RING', 31);
        // +0x675: mAnswer[31]
        this.writeString(emulator, addr + 0x675, 'ATA', 31);
        // +0x694: mConnects[186]
        this.writeString(emulator, addr + 0x694, 'CONNECT', 186);
        // +0x74E: numConf (INT)
        emulator.writeMemory16(addr + 0x74E, 10);
        // +0x750: sysPass[31]
        this.writeString(emulator, addr + 0x750, '', 31); // Don't expose sysop password
        // +0x76F: remotePass[31]
        this.writeString(emulator, addr + 0x76F, '', 31);
        // +0x78E: baudTimes[10] (10 INTs)
        const baudTimes = [300, 1200, 2400, 9600, 14400, 19200, 28800, 33600, 57600, 115200];
        for (let i = 0; i < 10; i++) {
            emulator.writeMemory16(addr + 0x78E + (i * 2), baudTimes[i]);
        }
        // +0x7A2: pad[22]
        for (let i = 0; i < 22; i++) {
            emulator.writeMemory(addr + 0x7A2 + i, 0);
        }
        console.log(`[CommandsStructure] Wrote BBS config: "${process.env.BBS_NAME || 'AmiExpress Web BBS'}"`);
    }
    static writeString(emulator, addr, str, maxLen) {
        const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
        for (let i = 0; i < maxLen; i++) {
            emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
        }
    }
}
exports.CommandsStructure = CommandsStructure;
CommandsStructure.SIZE = 1976; // 0x7B8 bytes
/**
 * StartOption structure - node configuration and settings
 * Corresponds to axcommon.e lines 496-527
 *
 * TOTAL SIZE: 888 bytes (0x378)
 *
 * Structure layout:
 * +0x00: leftEdge (INT = 2 bytes)
 * +0x02: topEdge (INT = 2 bytes)
 * +0x04: width (INT = 2 bytes)
 * +0x06: height (INT = 2 bytes)
 * +0x08: bitPlanes (LONG = 4 bytes)
 * +0x0C: statBar (INT = 2 bytes)
 * +0x0E: interlace (INT = 2 bytes)
 * +0x10: dupeCheck (INT = 2 bytes)
 * +0x12: qLogon (INT = 2 bytes)
 * +0x14: takeCredits (INT = 2 bytes)
 * +0x16: seenIt (INT = 2 bytes)
 * +0x18: trapDoor (INT = 2 bytes)
 * +0x1A: iconify (INT = 2 bytes)
 * +0x1C: eall_level (INT = 2 bytes)
 * +0x1E: a2232 (INT = 2 bytes)
 * +0x20: toggles[20] (40 bytes = 20 INTs)
 * +0x48: logoff[80] (80 bytes)
 * +0x98: shutDown[80] (80 bytes)
 * +0xE8: cycleLock[80] (80 bytes)
 * +0x138: ramPen[80] (80 bytes)
 * +0x188: namePrompt[80] (80 bytes)
 * +0x1D8: filesNot[80] (80 bytes)
 * +0x228: userData[80] (80 bytes)
 * +0x278: userKey[80] (80 bytes)
 * +0x2C8: offHook[80] (80 bytes)
 * +0x318: nodeScreens[80] (80 bytes)
 * +0x368: masterSemi (PTR = 4 bytes)
 * +0x36C: singleSemi (PTR = 4 bytes)
 * +0x370: translation (PTR = 4 bytes)
 * +0x374: acpWindow (PTR = 4 bytes)
 * TOTAL: 888 bytes (0x378)
 */
class StartOptionStructure {
    static writeToMemory(emulator, addr, session) {
        console.log(`[StartOptionStructure] Writing startOption at 0x${addr.toString(16)}`);
        // +0x00: leftEdge (INT)
        emulator.writeMemory16(addr + 0x00, 0);
        // +0x02: topEdge (INT)
        emulator.writeMemory16(addr + 0x02, 0);
        // +0x04: width (INT)
        emulator.writeMemory16(addr + 0x04, 640);
        // +0x06: height (INT)
        emulator.writeMemory16(addr + 0x06, 400);
        // +0x08: bitPlanes (LONG)
        emulator.writeMemory32(addr + 0x08, 3);
        // +0x0C: statBar (INT)
        emulator.writeMemory16(addr + 0x0C, 1);
        // +0x0E: interlace (INT)
        emulator.writeMemory16(addr + 0x0E, 0);
        // +0x10: dupeCheck (INT)
        emulator.writeMemory16(addr + 0x10, 1);
        // +0x12: qLogon (INT)
        emulator.writeMemory16(addr + 0x12, 0);
        // +0x14: takeCredits (INT)
        emulator.writeMemory16(addr + 0x14, 0);
        // +0x16: seenIt (INT)
        emulator.writeMemory16(addr + 0x16, 0);
        // +0x18: trapDoor (INT)
        emulator.writeMemory16(addr + 0x18, 0);
        // +0x1A: iconify (INT)
        emulator.writeMemory16(addr + 0x1A, 0);
        // +0x1C: eall_level (INT)
        emulator.writeMemory16(addr + 0x1C, 100);
        // +0x1E: a2232 (INT)
        emulator.writeMemory16(addr + 0x1E, 0);
        // +0x20: toggles[20] (20 INTs)
        for (let i = 0; i < 20; i++) {
            emulator.writeMemory16(addr + 0x20 + (i * 2), 0);
        }
        // +0x48: logoff[80]
        this.writeString(emulator, addr + 0x48, '', 80);
        // +0x98: shutDown[80]
        this.writeString(emulator, addr + 0x98, '', 80);
        // +0xE8: cycleLock[80]
        this.writeString(emulator, addr + 0xE8, '', 80);
        // +0x138: ramPen[80]
        this.writeString(emulator, addr + 0x138, '', 80);
        // +0x188: namePrompt[80]
        this.writeString(emulator, addr + 0x188, 'Enter your name: ', 80);
        // +0x1D8: filesNot[80]
        this.writeString(emulator, addr + 0x1D8, '', 80);
        // +0x228: userData[80]
        this.writeString(emulator, addr + 0x228, 'BBS:UserData/', 80);
        // +0x278: userKey[80]
        this.writeString(emulator, addr + 0x278, 'BBS:UserKeys/', 80);
        // +0x2C8: offHook[80]
        this.writeString(emulator, addr + 0x2C8, '', 80);
        // +0x318: nodeScreens[80]
        this.writeString(emulator, addr + 0x318, 'BBS:Screens/Node/', 80);
        // +0x368: masterSemi (PTR) - null pointer
        emulator.writeMemory32(addr + 0x368, 0);
        // +0x36C: singleSemi (PTR) - null pointer
        emulator.writeMemory32(addr + 0x36C, 0);
        // +0x370: translation (PTR) - null pointer
        emulator.writeMemory32(addr + 0x370, 0);
        // +0x374: acpWindow (PTR) - null pointer
        emulator.writeMemory32(addr + 0x374, 0);
        console.log(`[StartOptionStructure] Wrote node settings`);
    }
    static writeString(emulator, addr, str, maxLen) {
        const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
        for (let i = 0; i < maxLen; i++) {
            emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
        }
    }
}
exports.StartOptionStructure = StartOptionStructure;
StartOptionStructure.SIZE = 888; // 0x378 bytes
/**
 * Node state globals - simple variables doors need access to
 * These are individual LONGs/INTs scattered in memory that doors check
 */
class NodeStateGlobals {
    /**
     * Write node state globals to memory
     */
    static writeToMemory(emulator, baseAddr, session) {
        // currentConf (LONG) - current conference number
        const currentConfAddr = baseAddr;
        emulator.writeMemory32(currentConfAddr, session.currentConference || 0);
        // node (LONG) - node number
        const nodeAddr = baseAddr + 4;
        emulator.writeMemory32(nodeAddr, session.nodeId || 1);
        // onlineBaud (LONG) - connection baud rate
        const onlineBaudAddr = baseAddr + 8;
        emulator.writeMemory32(onlineBaudAddr, 57600);
        // timeLimit (LONG) - time limit in seconds
        const timeLimitAddr = baseAddr + 12;
        emulator.writeMemory32(timeLimitAddr, session.user?.timeLimit || 3600);
        // logonTime (LONG) - logon timestamp
        const logonTimeAddr = baseAddr + 16;
        const logonTime = session.user?.lastLoginAt ? Math.floor(new Date(session.user.lastLoginAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
        emulator.writeMemory32(logonTimeAddr, logonTime);
        // ansi flag (CHAR) - ANSI enabled
        const ansiAddr = baseAddr + 20;
        emulator.writeMemory(ansiAddr, session.user?.ansiEnabled ? 1 : 0);
        // expert flag (CHAR) - expert mode
        const expertAddr = baseAddr + 21;
        emulator.writeMemory(expertAddr, session.user?.expert ? 1 : 0);
        console.log(`[NodeStateGlobals] Wrote node state at 0x${baseAddr.toString(16)}`);
        console.log(`  currentConf: ${session.currentConference || 0}`);
        console.log(`  node: ${session.nodeId || 1}`);
        console.log(`  timeLimit: ${session.user?.timeLimit || 3600}`);
    }
}
exports.NodeStateGlobals = NodeStateGlobals;
/**
 * Shared BBS Data Manager
 * Manages all BBS-wide shared structures
 */
class SharedBBSData {
    constructor(emulator, baseAddr = 0xF00300 // Start after user structures
    ) {
        this.emulator = emulator;
        this.baseAddr = baseAddr;
        this.cmdsAddr = 0;
        this.soptAddr = 0;
        this.nodeStateAddr = 0;
        // Allocate memory for all structures
        this.cmdsAddr = baseAddr;
        this.soptAddr = baseAddr + CommandsStructure.SIZE;
        this.nodeStateAddr = baseAddr + CommandsStructure.SIZE + StartOptionStructure.SIZE;
        console.log('[SharedBBSData] Allocated shared BBS memory:');
        console.log(`  cmds:       0x${this.cmdsAddr.toString(16)} (${CommandsStructure.SIZE} bytes)`);
        console.log(`  sopt:       0x${this.soptAddr.toString(16)} (${StartOptionStructure.SIZE} bytes)`);
        console.log(`  nodeState:  0x${this.nodeStateAddr.toString(16)} (32 bytes)`);
    }
    /**
     * Write all BBS data structures to shared memory
     */
    writeBBSData(session) {
        CommandsStructure.writeToMemory(this.emulator, this.cmdsAddr, session);
        StartOptionStructure.writeToMemory(this.emulator, this.soptAddr, session);
        NodeStateGlobals.writeToMemory(this.emulator, this.nodeStateAddr, session);
    }
    /**
     * Get address of commands structure
     */
    getCmdsAddr() {
        return this.cmdsAddr;
    }
    /**
     * Get address of startOption structure
     */
    getSoptAddr() {
        return this.soptAddr;
    }
    /**
     * Get address of node state globals
     */
    getNodeStateAddr() {
        return this.nodeStateAddr;
    }
}
exports.SharedBBSData = SharedBBSData;
