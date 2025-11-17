"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = runDoor;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const http = __importStar(require("http"));
const door_path_util_1 = require("../door-path.util");
const PROJECT_ROOT = process.env.BBS_ROOT || path_1.default.resolve(process.cwd(), '../..');
function resolveGlobalWallDir() {
    return (0, door_path_util_1.resolveDoorResourcePath)('doors', 'global-wall') || path_1.default.join(PROJECT_ROOT, 'doors', 'global-wall');
}
function resolveGlobalWallFile(filename) {
    return (0, door_path_util_1.resolveDoorResourcePath)('doors', 'global-wall', filename) || path_1.default.join(resolveGlobalWallDir(), filename);
}
// Constants
const BUFSIZE = 8192;
const MAXSTYLE = 4;
const MAXPRESET = 2;
const SYSOPLEVEL = 255;
const DEFAULTSTYLE = 4;
const COLOURPRESETLEN = 14;
var DataPoint;
(function (DataPoint) {
    DataPoint[DataPoint["DP_USERNAME"] = 0] = "DP_USERNAME";
    DataPoint[DataPoint["DP_SOURCE"] = 1] = "DP_SOURCE";
    DataPoint[DataPoint["DP_BBSSHORTCODE"] = 2] = "DP_BBSSHORTCODE";
    DataPoint[DataPoint["DP_COMMENT"] = 3] = "DP_COMMENT";
})(DataPoint || (DataPoint = {}));
let serverHost = 'scenewall.bbs.io';
let serverPort = 1541;
let timeout = 10;
let debugLogFile = '';
let tempFile = 'T:jsondata';
const colourpresets = ['42626717772363', '32656717772363'];
let settings;
let bbsList = [];
let wallItems = [];
function fullTrim(src) {
    let temp = src.trim();
    while (temp.length > 0 && temp[temp.length - 1] === ' ') {
        temp = temp.slice(0, -1);
    }
    return temp;
}
function getSystemTime() {
    return Math.floor(Date.now() / 1000);
}
function debugLog(str) {
    if (debugLogFile.length > 0) {
        try {
            const currTime = getSystemTime();
            const logline = `${currTime} ${str}\n`;
            (0, fs_1.writeFileSync)(debugLogFile, logline, { flag: 'a' });
        }
        catch (err) {
            // Ignore errors
        }
    }
}
function parseConfigFile(configFileName) {
    const config = {
        serverHost: 'scenewall.bbs.io',
        serverPort: 1541,
        timeout: 10,
        debugLog: '',
        tempFile: 'T:jsondata'
    };
    if ((0, fs_1.existsSync)(configFileName)) {
        try {
            const content = (0, fs_1.readFileSync)(configFileName, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith(';') || trimmed.length === 0)
                    continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx >= 0) {
                    const key = fullTrim(trimmed.substring(0, eqIdx)).toUpperCase();
                    const value = fullTrim(trimmed.substring(eqIdx + 1));
                    if (key === 'SERVERHOST')
                        config.serverHost = value;
                    else if (key === 'SERVERPORT')
                        config.serverPort = parseInt(value, 10);
                    else if (key === 'TIMEOUT')
                        config.timeout = parseInt(value, 10);
                    else if (key === 'DEBUGLOG')
                        config.debugLog = value;
                    else if (key === 'TEMPFILE')
                        config.tempFile = value;
                }
            }
        }
        catch (err) {
            console.error('Error parsing config file:', err);
        }
    }
    return config;
}
function loadConfig() {
    const progdirCfg = resolveGlobalWallFile('GWALL.cfg');
    const localCfg = (0, door_path_util_1.resolveDoorResourcePath)('GWALL.cfg') || path_1.default.join(PROJECT_ROOT, 'GWALL.cfg');
    let config = parseConfigFile(progdirCfg);
    if ((0, fs_1.existsSync)(localCfg)) {
        const localConfig = parseConfigFile(localCfg);
        if (localConfig.serverHost)
            config.serverHost = localConfig.serverHost;
        if (localConfig.serverPort)
            config.serverPort = localConfig.serverPort;
        if (localConfig.timeout)
            config.timeout = localConfig.timeout;
        if (localConfig.debugLog)
            config.debugLog = localConfig.debugLog;
        if (localConfig.tempFile)
            config.tempFile = localConfig.tempFile;
    }
    serverHost = config.serverHost;
    serverPort = config.serverPort;
    timeout = config.timeout;
    debugLogFile = config.debugLog;
    tempFile = config.tempFile;
}
function encodeAnsiColour(colourValue) {
    const colourNum = parseInt(colourValue, 10) + 30;
    return `\x1b[${colourNum}m`;
}
function applyColours() {
    settings.gridcolour = encodeAnsiColour(settings.coloursettings[0] || '4');
    settings.titlecolour = encodeAnsiColour(settings.coloursettings[1] || '2');
    settings.headingcolour = encodeAnsiColour(settings.coloursettings[2] || '6');
    settings.authorcolour = encodeAnsiColour(settings.coloursettings[3] || '2');
    settings.sysoptitlecolour = encodeAnsiColour(settings.coloursettings[4] || '6');
    settings.sysopmenuitemscolour = encodeAnsiColour(settings.coloursettings[5] || '7');
    settings.bbsshortcodecolour = encodeAnsiColour(settings.coloursettings[6] || '1');
    settings.commentdefaultcolour = encodeAnsiColour(settings.coloursettings[7] || '7');
    settings.showbbskeycolour = encodeAnsiColour(settings.coloursettings[8] || '7');
    settings.bbskeymaincolour = encodeAnsiColour(settings.coloursettings[9] || '7');
    settings.textcolour = encodeAnsiColour(settings.coloursettings[10] || '2');
    settings.textcolourYN = encodeAnsiColour(settings.coloursettings[11] || '3');
    settings.choosecolourheader = encodeAnsiColour(settings.coloursettings[12] || '6');
    settings.radiationheadercolour = encodeAnsiColour(settings.coloursettings[13] || '3');
}
function calculateDisplayLines() {
    const style = settings.style;
    switch (style) {
        case 1: return settings.screenheight - 9;
        case 2: return settings.screenheight - 9;
        case 3: return settings.screenheight - 14;
        case 4: return settings.screenheight - 11;
        default: return settings.screenheight - 9;
    }
}
function readSettings() {
    const settingsPath = resolveGlobalWallFile('GWall.cfg');
    if ((0, fs_1.existsSync)(settingsPath)) {
        try {
            const content = (0, fs_1.readFileSync)(settingsPath, 'utf-8');
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length > 0)
                settings.style = parseInt(lines[0], 10);
            if (lines.length > 1)
                settings.mybbsshortcode = lines[1].substring(0, 3);
            if (lines.length > 2)
                settings.coloursettings = lines[2].substring(0, 14);
        }
        catch (err) {
            saveSettings();
        }
    }
    else {
        saveSettings();
    }
}
function saveSettings() {
    const settingsPath = resolveGlobalWallFile('GWall.cfg');
    const content = `${settings.style}\n${settings.mybbsshortcode}\n${settings.coloursettings}\n`;
    try {
        const dir = path_1.default.dirname(settingsPath);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        (0, fs_1.writeFileSync)(settingsPath, content, 'utf-8');
    }
    catch (err) {
        console.error('Error saving settings:', err);
    }
}
function cleanstr(sourcestring) {
    return sourcestring
        .replace(/\[/g, '&#91;')
        .replace(/\]/g, '&#93;')
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;')
        .replace(/,/g, '&#44;')
        .replace(/:/g, '&#58;')
        .replace(/"/g, '&#34;')
        .replace(/\\/g, '&#92;');
}
function uncleanstr(sourcestring) {
    return sourcestring
        .replace(/&#91;/g, '[')
        .replace(/&#93;/g, ']')
        .replace(/&#123;/g, '{')
        .replace(/&#125;/g, '}')
        .replace(/&#44;/g, ',')
        .replace(/&#58;/g, ':')
        .replace(/&#34;/g, '"')
        .replace(/&#92;/g, '\\')
        .replace(/\\u001b/g, '');
}
function httpRequest(requestdata, tempFile) {
    return new Promise((resolve) => {
        const options = {
            hostname: serverHost,
            port: serverPort,
            method: 'GET',
            path: '/',
            timeout: timeout * 1000
        };
        debugLog('httprequest - starting');
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            res.on('end', () => {
                const fullData = Buffer.concat(chunks);
                if (tempFile) {
                    try {
                        (0, fs_1.writeFileSync)(tempFile, fullData);
                    }
                    catch (err) {
                        console.error('Error writing temp file:', err);
                    }
                }
                debugLog('httprequest - done');
                resolve(res.statusCode || 0);
            });
        });
        req.on('error', (err) => {
            debugLog(`httprequest - error: ${err.message}`);
            resolve(0);
        });
        req.on('timeout', () => {
            debugLog('httprequest - timeout');
            req.destroy();
            resolve(0);
        });
        req.write(requestdata);
        req.end();
    });
}
async function getwalljson(pagenum, maxitems, tempfile) {
    const getcmd = `GET /GlobalWall/api/WallItems?itemCount=${maxitems}&pagenum=${pagenum} HTTP/1.0\r\nHost:${serverHost}\r\n\r\n`;
    return await httpRequest(getcmd, tempfile);
}
async function postcomment(username, bbsname, comment) {
    const cleanUser = cleanstr(username);
    const cleanBBS = cleanstr(bbsname);
    const cleanComment = cleanstr(comment);
    const linedata = JSON.stringify({
        userName: cleanUser,
        source: cleanBBS,
        comment: cleanComment,
        bbsshortcode: settings.mybbsshortcode
    });
    const senddata = `POST /GlobalWall/api/WallItems HTTP/1.0\r\nHost:${serverHost}\r\nContent-Type: application/json\r\nContent-Length: ${linedata.length}\r\n\r\n${linedata}`;
    await httpRequest(senddata, null);
}
async function putcomment(lineid, username, bbsname, comment, bbsshortcode) {
    const cleanUser = cleanstr(username);
    const cleanBBS = cleanstr(bbsname);
    const cleanComment = cleanstr(comment);
    const cleanCode = cleanstr(bbsshortcode);
    const linedata = JSON.stringify({
        userName: cleanUser || null,
        source: cleanBBS || null,
        comment: cleanComment || null,
        bbsshortcode: cleanCode || null
    });
    const senddata = `PUT /GlobalWall/api/WallItems/${lineid} HTTP/1.0\r\nHost:${serverHost}\r\nContent-Type: application/json\r\nContent-Length: ${linedata.length}\r\n\r\n${linedata}`;
    await httpRequest(senddata, null);
}
async function deletecomment(lineid) {
    const senddata = `DELETE /GlobalWall/api/WallItems/${lineid} HTTP/1.0\r\nHost:${serverHost}\r\n\r\n`;
    await httpRequest(senddata, null);
}
function decodejson(jsondata) {
    try {
        const data = JSON.parse(jsondata);
        wallItems = [];
        bbsList = [];
        if (Array.isArray(data)) {
            for (const item of data) {
                const wallItem = {
                    id: item.id?.toString() || '',
                    username: uncleanstr(item.userName || ''),
                    source: uncleanstr(item.source || ''),
                    comment: uncleanstr(item.comment || ''),
                    bbsshortcode: item.bbsshortcode || ''
                };
                wallItems.push(wallItem);
                // Add to BBS list if not already there
                if (wallItem.bbsshortcode && wallItem.source) {
                    const exists = bbsList.some(b => b.bbsShortCode === wallItem.bbsshortcode);
                    if (!exists) {
                        bbsList.push({
                            bbsName: wallItem.source,
                            bbsShortCode: wallItem.bbsshortcode
                        });
                    }
                }
            }
        }
    }
    catch (err) {
        console.error('Error decoding JSON:', err);
    }
}
function transmit(socket, textLine) {
    socket.emit('ansi-output', textLine + '\r\n');
}
function sendStr(socket, textLine) {
    socket.emit('ansi-output', textLine);
}
function sendCLS(socket) {
    socket.emit('ansi-output', '\x0c');
}
async function getChar(socket, echoChar) {
    return new Promise((resolve) => {
        const handleInput = (data) => {
            socket.off('user-input', handleInput);
            const key = data.trim().toUpperCase();
            if (echoChar) {
                transmit(socket, key);
            }
            resolve(key);
        };
        socket.on('user-input', handleInput);
    });
}
async function query(socket, promptText, maxlen) {
    return new Promise((resolve) => {
        sendStr(socket, promptText + ' ');
        const handleInput = (data) => {
            socket.off('user-input', handleInput);
            resolve(data.trim().substring(0, maxlen));
        };
        socket.on('user-input', handleInput);
    });
}
// Display functions for 4 styles - implementing headers/footers
function header1(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}�-[� ${settings.radiationheadercolour}RADIATION WALL ${settings.gridcolour}�]----- -- ------ --------------------- ---------- -----------------.`);
}
function footer1(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`--------- -- ---- ---  -- - -- ----- ------ --- -                  - -- ---- ---''`);
}
function header2(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}+-[+ ${settings.radiationheadercolour}RADIATION WALL ${settings.gridcolour}+]----- -- ------ --------------------- ---------- -----------------.`);
}
function footer2(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`--------- -- ---- ---  -- - -- ----- ------ --- -                  - -- ---- ---''`);
}
function header3(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}|------- -  -  - --- - --- ----------------------- ---------- -----------------|`);
    if (sysopmode) {
        transmit(socket, `${settings.gridcolour}| ${settings.sysoptitlecolour}SysOp Menu                                                                      ${settings.gridcolour}|`);
    }
    else {
        transmit(socket, `${settings.gridcolour}| ${settings.titlecolour}*** GLOBAL THERMONUCLEAR WALL ***                                              ${settings.gridcolour}|`);
    }
    transmit(socket, `${settings.gridcolour}|------- -  -  - --- - --- ----------------------- ---------- -----------------|`);
    transmit(socket, `${settings.gridcolour}| ${settings.headingcolour}Id ${settings.gridcolour}| ${settings.headingcolour}BBC ${settings.gridcolour}| ${settings.headingcolour}Username        ${settings.gridcolour}| ${settings.headingcolour}Comment                                        ${settings.gridcolour}|`);
    transmit(socket, `${settings.gridcolour}|----|----|-----------------|-----------------------------------------------|`);
}
function footer3(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'`);
}
function header4(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}�------- -  -  - --- - --- ----------------------- ---------- ----------------�`);
    if (sysopmode) {
        transmit(socket, `${settings.gridcolour}� ${settings.sysoptitlecolour}SysOp Menu                                                                      ${settings.gridcolour}�`);
    }
    else {
        transmit(socket, `${settings.gridcolour}� ${settings.titlecolour}*** GLOBAL THERMONUCLEAR WALL ***                                              ${settings.gridcolour}�`);
    }
    transmit(socket, `${settings.gridcolour}�------- -  -  - --- - --- ----------------------- ---------- ----------------�`);
    transmit(socket, `${settings.gridcolour}� ${settings.headingcolour}Id ${settings.gridcolour}� ${settings.headingcolour}BBC ${settings.gridcolour}� ${settings.headingcolour}Username        ${settings.gridcolour}� ${settings.headingcolour}Comment                                        ${settings.gridcolour}�`);
    transmit(socket, `${settings.gridcolour}�----�----�-----------------�-----------------------------------------------�`);
}
function footer4(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'`);
}
function displaywalldata(socket, displaylines, displayids) {
    const style = settings.style;
    let seperator1 = '�';
    let seperator2 = '�';
    let seperator3 = '�';
    if (style === 3 || style === 4) {
        seperator1 = '|';
        seperator2 = style === 3 ? '�' : '�';
        seperator3 = style === 3 ? '�' : '|';
    }
    for (let i = 0; i < Math.min(displaylines, wallItems.length); i++) {
        const item = wallItems[i];
        const id = displayids ? item.id.padEnd(4).substring(0, 4) : '    ';
        const bbs = item.bbsshortcode.padEnd(3).substring(0, 3);
        const username = item.username.padEnd(15).substring(0, 15);
        const comment = item.comment.substring(0, 46);
        const line = `${settings.gridcolour}${seperator1} ${settings.authorcolour}${id} ${settings.gridcolour}${seperator2} ${settings.bbsshortcodecolour}${bbs} ${settings.gridcolour}${seperator2} ${settings.authorcolour}${username} ${settings.gridcolour}${seperator2} ${settings.commentdefaultcolour}${comment}${settings.gridcolour}${' '.repeat(Math.max(0, 46 - comment.length))} ${seperator3}`;
        transmit(socket, line);
    }
}
async function runDoor(doorSession) {
    const { socket, user } = doorSession;
    // Initialize settings
    settings = {
        sysoplevel: SYSOPLEVEL,
        style: DEFAULTSTYLE,
        screenheight: 29,
        mybbsshortcode: '???',
        coloursettings: colourpresets[0],
        gridcolour: '',
        titlecolour: '',
        headingcolour: '',
        authorcolour: '',
        sysoptitlecolour: '',
        sysopmenuitemscolour: '',
        bbsshortcodecolour: '',
        commentdefaultcolour: '',
        showbbskeycolour: '',
        bbskeymaincolour: '',
        textcolour: '',
        textcolourYN: '',
        choosecolourheader: '',
        radiationheadercolour: '',
        node: '0'
    };
    loadConfig();
    debugLog('wall door started');
    readSettings();
    debugLog('settings file read');
    applyColours();
    const displaylines = calculateDisplayLines();
    // Check if configured
    if (settings.mybbsshortcode === '???') {
        const accesslevel = user.secStatus || 0;
        if (accesslevel >= settings.sysoplevel) {
            transmit(socket, '');
            transmit(socket, '\x1b[0mThe wall has not yet been configured, performing initial setup');
            const newcode = await query(socket, 'Enter the 3 digit code to use for your bbs:', 3);
            if (newcode.length === 3) {
                settings.mybbsshortcode = newcode;
                saveSettings();
            }
        }
        else {
            transmit(socket, '');
            transmit(socket, '\x1b[0mThe wall has not been configured, please advice your sysop to configure this wall');
            transmit(socket, '');
            return;
        }
    }
    let pagenum = 1;
    let rep = true;
    let redo = true;
    let inputBuffer = '';
    while (rep) {
        if (redo) {
            const rescode = await getwalljson(pagenum, displaylines, tempFile);
            debugLog('wall data downloaded');
            if (rescode === 200) {
                try {
                    const jsonBuffer = (0, fs_1.readFileSync)(tempFile, 'utf-8');
                    decodejson(jsonBuffer);
                    debugLog('wall data decoded');
                }
                catch (err) {
                    transmit(socket, '\x1b[0mThe server is not currently responding. Please try again later');
                    return;
                }
                sendCLS(socket);
                switch (settings.style) {
                    case 1:
                        header1(socket, false);
                        break;
                    case 2:
                        header2(socket, false);
                        break;
                    case 3:
                        header3(socket, false);
                        break;
                    case 4:
                        header4(socket, false);
                        break;
                    default:
                        header2(socket, false);
                        break;
                }
                displaywalldata(socket, displaylines, false);
                debugLog('wall data display');
                switch (settings.style) {
                    case 1:
                        footer1(socket, false);
                        break;
                    case 2:
                        footer2(socket, false);
                        break;
                    case 3:
                        footer3(socket, false);
                        break;
                    case 4:
                        footer4(socket, false);
                        break;
                    default:
                        footer2(socket, false);
                        break;
                }
                redo = false;
            }
            else {
                transmit(socket, '\x1b[0mThe server is not currently responding. Please try again later');
                return;
            }
        }
        transmit(socket, '');
        sendStr(socket, `${settings.textcolour}pUSH tHE bUTTON ? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolourYN}]\x1b[0m `);
        inputBuffer = await getChar(socket, true);
        transmit(socket, '\x1b[0m');
        if (inputBuffer === 'S') {
            const accesslevel = user.secStatus || 0;
            if (accesslevel >= settings.sysoplevel) {
                // Sysop mode - not fully implemented due to complexity
                transmit(socket, '');
                transmit(socket, '\x1b[0mSysop mode not yet implemented in this version');
                transmit(socket, '');
                return;
            }
        }
        if (inputBuffer === 'K') {
            // Show BBS key - not fully implemented
            transmit(socket, '');
            transmit(socket, '\x1b[0mBBS Key display not yet implemented');
            transmit(socket, '');
        }
        else if (inputBuffer === 'B') {
            pagenum++;
            redo = true;
        }
        else if (inputBuffer === 'F') {
            if (pagenum > 1)
                pagenum--;
            redo = true;
        }
        else {
            rep = false;
        }
    }
    debugLog('main loop done');
    if (inputBuffer !== 'Y') {
        debugLog('no comment, shutdown');
        transmit(socket, '');
        transmit(socket, '\x1b[0mok be like that...');
        transmit(socket, '');
        return;
    }
    debugLog('get user comment');
    const comment = await query(socket, 'Enter your comment:', 56);
    if (comment.length === 0) {
        transmit(socket, '');
        transmit(socket, '\x1b[0myou forgot to enter something...');
        transmit(socket, '');
        return;
    }
    debugLog('get anon details');
    transmit(socket, '');
    sendStr(socket, `${settings.textcolour}sTAY aNONYMOUS? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolour}]\x1b[0m `);
    const anonInput = await getChar(socket, true);
    let username = user.username || 'guest';
    const bbsname = process.env.BBS_NAME || 'AmiExpress-Web';
    if (anonInput === 'Y') {
        username = 'somebody';
    }
    // Color selection
    let colour = '';
    while (colour.length === 0) {
        transmit(socket, '');
        transmit(socket, `${settings.gridcolour}.-[� ${settings.choosecolourheader}cHOOSE yOUR cOLOUR${settings.gridcolour} �]----- -- ------ --------------------- -  - ---------.`);
        transmit(socket, `${settings.gridcolour}�     \x1b[37m[W]HITE ${settings.gridcolour}- \x1b[31m[R]ED ${settings.gridcolour}- \x1b[33m[Y]ELLOW ${settings.gridcolour}- \x1b[34m[D]ARKBLUE ${settings.gridcolour}- \x1b[35m[P]INK ${settings.gridcolour}- \x1b[36m[C]YAN ${settings.gridcolour}- \x1b[32m[G]REEN${settings.gridcolour}     �`);
        transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'\x1b[0m`);
        const colourInput = await getChar(socket, true);
        if (colourInput === 'W' || colourInput === '7')
            colour = '7';
        else if (colourInput === 'R' || colourInput === '1')
            colour = '1';
        else if (colourInput === 'Y' || colourInput === '3')
            colour = '3';
        else if (colourInput === 'D' || colourInput === '4')
            colour = '4';
        else if (colourInput === 'P' || colourInput === '5')
            colour = '5';
        else if (colourInput === 'C' || colourInput === '6')
            colour = '6';
        else if (colourInput === 'G' || colourInput === '2')
            colour = '2';
    }
    debugLog('check and post');
    if (colour.length > 0) {
        const displaytext = encodeAnsiColour(colour) + comment;
        await postcomment(username, bbsname, displaytext);
        transmit(socket, '');
        transmit(socket, '\x1b[0myour comment has been posted');
        transmit(socket, '');
    }
    debugLog('shutdown');
}
