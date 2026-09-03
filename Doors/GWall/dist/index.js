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
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const http = __importStar(require("http"));
// Metadata
exports.metadata = {
    name: 'Global Thermonuclear Wall',
    version: '1.1.0',
    description: 'Global Scene Wall for BBSes',
    author: 'REBEL/QTX',
    command: 'GWALL',
};
const PROJECT_ROOT = process.env.BBS_ROOT || path_1.default.resolve(process.cwd(), '../..');
function resolveGlobalWallDir() {
    return path_1.default.join(PROJECT_ROOT, 'doors', 'gwall');
}
function resolveGlobalWallFile(filename) {
    return path_1.default.join(resolveGlobalWallDir(), filename);
}
function resolveGwallConfig(...filenames) {
    return resolveGlobalWallFile(filenames[0]);
}
function resolveExistingSettingsFile(...filenames) {
    for (const filename of filenames) {
        const candidate = resolveGlobalWallFile(filename);
        if ((0, fs_1.existsSync)(candidate)) {
            return candidate;
        }
    }
    return resolveGlobalWallFile(filenames[0]);
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
    const progdirCfg = resolveGwallConfig('GWALL.cfg', 'gwall.cfg');
    const localCfg = resolveGlobalWallFile('GWALL.cfg');
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
    const settingsPath = resolveExistingSettingsFile('GWall.cfg', 'gwall.cfg');
    if ((0, fs_1.existsSync)(settingsPath)) {
        try {
            const content = (0, fs_1.readFileSync)(settingsPath, 'utf-8');
            const lines = content
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith(';'));
            // Support both the legacy positional format and a simple key=value format.
            for (const [idx, line] of lines.entries()) {
                if (line.includes('=')) {
                    const [rawKey, rawValue] = line.split('=');
                    const key = rawKey.trim().toUpperCase();
                    const value = rawValue.trim();
                    if (key === 'STYLE') {
                        const parsed = parseInt(value, 10);
                        if (!Number.isNaN(parsed))
                            settings.style = parsed;
                    }
                    else if (key === 'SHORTCODE' || key === 'BBS' || key === 'MYBBS' || key === 'CODE') {
                        settings.mybbsshortcode = value.substring(0, 3);
                    }
                    else if (key === 'COLOURS' || key === 'COLORS' || key === 'COLOURPRESET') {
                        settings.coloursettings = value.substring(0, 14);
                    }
                }
                else {
                    if (idx === 0) {
                        const parsed = parseInt(line, 10);
                        if (!Number.isNaN(parsed))
                            settings.style = parsed;
                    }
                    else if (idx === 1) {
                        settings.mybbsshortcode = line.substring(0, 3);
                    }
                    else if (idx === 2) {
                        settings.coloursettings = line.substring(0, 14);
                    }
                }
            }
        }
        catch (err) {
            saveSettings();
        }
    }
    else {
        saveSettings();
    }
    // Fall back to environment/defaults so the wall can run without manual setup.
    if (settings.mybbsshortcode === '???') {
        const envShort = process.env.GWALL_BBS_CODE ||
            process.env.GWALL_SHORTCODE ||
            process.env.BBS_SHORTCODE ||
            process.env.BBS_CODE;
        if (envShort && envShort.trim().length > 0) {
            settings.mybbsshortcode = envShort.trim().substring(0, 3);
        }
        else {
            settings.mybbsshortcode = 'AMI';
        }
    }
    if (Number.isNaN(settings.style)) {
        settings.style = DEFAULTSTYLE;
    }
    if (!settings.coloursettings || settings.coloursettings.length < COLOURPRESETLEN) {
        settings.coloursettings = colourpresets[0];
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
function httpRequest(requestPath, method, tempFile, body, extraHeaders = {}) {
    return new Promise((resolve) => {
        const headers = {
            Host: serverHost,
            Connection: 'close',
            ...extraHeaders
        };
        if (body && !headers['Content-Length']) {
            headers['Content-Length'] = Buffer.byteLength(body).toString();
        }
        const options = {
            hostname: serverHost,
            port: serverPort,
            method,
            path: requestPath,
            timeout: timeout * 1000,
            headers
        };
        debugLog(`httprequest - starting ${method} ${requestPath}`);
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
                debugLog(`httprequest - done (${res.statusCode})`);
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
        if (body) {
            req.write(body);
        }
        req.end();
    });
}
async function getwalljson(pagenum, maxitems, tempfile) {
    const requestPath = `/GlobalWall/api/WallItems?itemCount=${maxitems}&pagenum=${pagenum}`;
    return await httpRequest(requestPath, 'GET', tempfile);
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
    await httpRequest('/GlobalWall/api/WallItems', 'POST', null, linedata, {
        'Content-Type': 'application/json'
    });
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
    await httpRequest(`/GlobalWall/api/WallItems/${lineid}`, 'PUT', null, linedata, {
        'Content-Type': 'application/json'
    });
}
async function deletecomment(lineid) {
    await httpRequest(`/GlobalWall/api/WallItems/${lineid}`, 'DELETE', null);
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
    socket.emit('ansi-output', '\x1b[2J\x1b[H\x0c');
}
async function getDoorKey(bbs, promptText, echoChar = false) {
    const raw = await bbs.getKey(promptText || undefined);
    const key = (raw || '').charAt(0).toUpperCase();
    if (echoChar && key) {
        bbs.write(key);
    }
    return key;
}
async function queryLine(bbs, promptText, maxlen) {
    const line = await bbs.getLine(promptText, maxlen);
    return (line || '').trim().substring(0, maxlen);
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
    const sysopStr = sysopmode ? `[${settings.sysoptitlecolour}sYSOP mODE${settings.gridcolour}]` : '____________';
    transmit(socket, `${settings.gridcolour}   __________`);
    transmit(socket, `${settings.gridcolour} __\\        /_________________________________________${sysopStr}${settings.gridcolour}____________`);
    transmit(socket, `${settings.gridcolour}|   \\      /                                                                  |`);
    transmit(socket, `${settings.gridcolour}|    \\    /    ${settings.titlecolour}gLOBAL tHERMONUCLEAR WALL${settings.gridcolour}                                      |`);
    transmit(socket, `${settings.gridcolour}|_____\\  /____________________________________________________________________|`);
    transmit(socket, `${settings.gridcolour}       \\/`);
    transmit(socket, `${settings.gridcolour} _____________________________________________________________________________`);
    transmit(socket, `${settings.gridcolour}|${settings.headingcolour}cOMMENt${settings.gridcolour}\x1b[60C${settings.headingcolour}hANDLE${settings.gridcolour}|${settings.headingcolour}bBS${settings.gridcolour}|`);
    transmit(socket, `${settings.gridcolour}|------- -  -  - --- - --- ----------------------- ---------- ------------^---|`);
}
function footer3(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`-----[${settings.authorcolour}REbEL/QTX${settings.gridcolour}]----- - --    - -- --  -- - --         - -- [${settings.authorcolour}oRdYNe/NVX${settings.gridcolour}]-----''\x1b[0m`);
}
function header4(socket, sysopmode) {
    header3(socket, sysopmode);
}
function footer4(socket, sysopmode) {
    transmit(socket, `${settings.gridcolour}\`----[${settings.authorcolour}REbEL/QTX${settings.gridcolour}]-----\x1b[2C-\x1b[1C---\x1b[2C---[${settings.showbbskeycolour}K\x1b[1CsHOWS\x1b[1CbBS\x1b[1CkEY${settings.gridcolour}]----\x1b[1C-\x1b[2C----\x1b[1C---[${settings.authorcolour}oRdYNe${settings.gridcolour}]-\x1b[1C--''\x1b[0m`);
}
function displaywalldata(socket, displaylines, displayids) {
    if (settings.style === 3 || settings.style === 4) {
        displayCustomWall(socket, displaylines, displayids);
        return;
    }
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
function stripAnsiCodes(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}
function visibleLength(text) {
    return stripAnsiCodes(text).length;
}
function truncateAnsi(str, maxLen) {
    let visible = 0;
    let out = '';
    let i = 0;
    while (i < str.length) {
        const ch = str[i];
        if (ch === '\x1b' && str[i + 1] === '[') {
            const end = str.indexOf('m', i);
            if (end === -1)
                break;
            out += str.slice(i, end + 1);
            i = end + 1;
            continue;
        }
        if (visible >= maxLen)
            break;
        out += ch;
        visible += 1;
        i += 1;
    }
    return out;
}
function padAnsi(str, maxLen) {
    const truncated = truncateAnsi(str, maxLen);
    const paddingLength = Math.max(0, maxLen - visibleLength(truncated));
    return truncated + ' '.repeat(paddingLength);
}
function displayCustomWall(socket, displaylines, displayids) {
    for (let i = 0; i < Math.min(displaylines, wallItems.length); i++) {
        const item = wallItems[i];
        const rawComment = (item.comment || '').replace(/\r?\n/g, ' ');
        const commentBase = displayids ? `${item.id}: ${rawComment}` : rawComment;
        const usernameAnsi = item.username || '';
        const usernameField = padAnsi(usernameAnsi, 12);
        const maxCommentLen = Math.max(0, 72 - visibleLength(usernameField));
        const commentField = padAnsi(commentBase, maxCommentLen);
        const bbscode = (item.bbsshortcode || '???').substring(0, 3);
        const line = `${settings.gridcolour}|${settings.commentdefaultcolour}${commentField}${settings.gridcolour} -${settings.authorcolour}${usernameField}${settings.gridcolour}¦${settings.bbsshortcodecolour}${bbscode}${settings.gridcolour}|`;
        transmit(socket, line);
    }
}
function showBBSKey(socket) {
    transmit(socket, `${settings.gridcolour}.------- -  -  - --- - --- ----------------------- ---------- ----------------.`);
    if (bbsList.length === 0) {
        transmit(socket, `${settings.gridcolour}  Ś ${settings.bbskeymaincolour}???: No BBS data available${settings.gridcolour} Ś`);
    }
    else {
        for (const item of bbsList) {
            const code = (item.bbsShortCode || '???').padEnd(3);
            const name = (item.bbsName || 'Unknown').substring(0, 40);
            transmit(socket, `${settings.gridcolour}  Ś ${settings.bbskeymaincolour}${code}: ${name.padEnd(52, ' ')}${settings.gridcolour} Ś`);
        }
    }
    transmit(socket, `${settings.gridcolour}\`----- ----- - --------- ------------------------------- -- ---------------- -''`);
}
function findWallItemById(id) {
    return wallItems.find(item => item.id === id) || null;
}
async function sysopEdit(socket, bbs) {
    transmit(socket, '');
    const lineid = await queryLine(bbs, 'Enter the id of the line you wish to edit: ', 5);
    if (lineid.trim().length === 0)
        return;
    const item = findWallItemById(lineid.trim());
    if (!item) {
        transmit(socket, '\x1b[0mError: Item not found');
        return;
    }
    transmit(socket, '');
    transmit(socket, '1) Edit username');
    transmit(socket, '2) Edit source');
    transmit(socket, '3) Edit bbs code');
    transmit(socket, '4) Edit comment');
    transmit(socket, '5) Cancel edit');
    transmit(socket, '');
    const choice = await getDoorKey(bbs, 'Choose 1-5: ', true);
    transmit(socket, '');
    if (choice === '5')
        return;
    let dataPoint;
    let oldValue = '';
    switch (choice) {
        case '1':
            dataPoint = DataPoint.DP_USERNAME;
            oldValue = item.username;
            break;
        case '2':
            dataPoint = DataPoint.DP_SOURCE;
            oldValue = item.source;
            break;
        case '3':
            dataPoint = DataPoint.DP_BBSSHORTCODE;
            oldValue = item.bbsshortcode;
            break;
        case '4':
            dataPoint = DataPoint.DP_COMMENT;
            oldValue = item.comment;
            break;
        default:
            return;
    }
    sendStr(socket, 'OldValue: ');
    transmit(socket, oldValue);
    transmit(socket, '');
    // Extract color code if editing comment
    let colorCode = '';
    if (dataPoint === DataPoint.DP_COMMENT && oldValue.startsWith('\x1b[3') && oldValue[4] === 'm') {
        colorCode = oldValue.substring(0, 5);
    }
    const prompt = colorCode ? `\x1b[0mEnter new value: ${colorCode}` : '\x1b[0mEnter new value: ';
    const newValue = await queryLine(bbs, prompt, 255);
    if (newValue.trim().length === 0)
        return;
    // Build update parameters
    let newUsername = dataPoint === DataPoint.DP_USERNAME ? newValue : '';
    let newSource = dataPoint === DataPoint.DP_SOURCE ? newValue : '';
    let newComment = dataPoint === DataPoint.DP_COMMENT ? (colorCode + newValue) : '';
    let newShortCode = dataPoint === DataPoint.DP_BBSSHORTCODE ? newValue : '';
    await putcomment(lineid.trim(), newUsername, newSource, newComment, newShortCode);
    transmit(socket, '');
    transmit(socket, '\x1b[0mComment updated successfully');
}
async function sysopRemove(socket, bbs) {
    transmit(socket, '');
    const lineid = await queryLine(bbs, 'Enter the id of the line you wish to remove: ', 5);
    if (lineid.trim().length === 0)
        return;
    const item = findWallItemById(lineid.trim());
    if (!item) {
        transmit(socket, '\x1b[0mError: Item not found');
        return;
    }
    // Add confirmation for safety (not in original, but safer)
    transmit(socket, '');
    const confirm = await getDoorKey(bbs, `Remove "${item.comment.substring(0, 40)}"? [Y/N] `, true);
    transmit(socket, '');
    if (confirm === 'Y') {
        await deletecomment(lineid.trim());
        transmit(socket, '\x1b[0mComment removed successfully');
    }
    else {
        transmit(socket, '\x1b[0mCancelled');
    }
}
async function sysopShortCodeUpdate(socket, bbs) {
    transmit(socket, '');
    if (settings.mybbsshortcode !== '???') {
        sendStr(socket, 'OldValue: ');
        transmit(socket, settings.mybbsshortcode);
        transmit(socket, '');
    }
    const newValue = await queryLine(bbs, 'Enter the 3 digit code to use for your bbs: ', 3);
    if (newValue.trim().length > 0 && newValue.trim().length <= 3) {
        settings.mybbsshortcode = newValue.trim();
        saveSettings();
        transmit(socket, '\x1b[0mBBS code updated successfully');
    }
}
async function sysopStyleUpdate(socket, bbs) {
    transmit(socket, '');
    sendStr(socket, 'OldValue: ');
    transmit(socket, settings.style.toString());
    transmit(socket, '');
    const newValue = await queryLine(bbs, `Select new style (1-${MAXSTYLE}): `, 1);
    const newStyle = parseInt(newValue, 10);
    if (newStyle >= 1 && newStyle <= MAXSTYLE) {
        settings.style = newStyle;
        saveSettings();
        transmit(socket, '\x1b[0mStyle updated successfully');
    }
    else {
        transmit(socket, '\x1b[0mInvalid style number');
    }
}
async function sysopColourUpdate(socket, bbs) {
    transmit(socket, '');
    const newValue = await queryLine(bbs, `Select new colour preset (1-${MAXPRESET}): `, 1);
    const newColour = parseInt(newValue, 10);
    if (newColour >= 1 && newColour <= MAXPRESET) {
        settings.coloursettings = colourpresets[newColour - 1];
        applyColours();
        saveSettings();
        transmit(socket, '\x1b[0mColour preset updated successfully');
    }
    else {
        transmit(socket, '\x1b[0mInvalid preset number');
    }
}
async function sysopSettingsUpdate(socket, bbs) {
    const displaylines = calculateDisplayLines() - 4;
    let pagenum = 1;
    let inputBuffer = '';
    while (inputBuffer !== '4') {
        const rescode = await getwalljson(pagenum, displaylines, tempFile);
        if (rescode === 200) {
            try {
                const jsonBuffer = (0, fs_1.readFileSync)(tempFile, 'utf-8');
                decodejson(jsonBuffer);
            }
            catch (err) {
                transmit(socket, '\x1b[0mError loading wall data');
                return;
            }
            sendCLS(socket);
            // Show header
            switch (settings.style) {
                case 1:
                    header1(socket, true);
                    break;
                case 2:
                    header2(socket, true);
                    break;
                case 3:
                    header3(socket, true);
                    break;
                case 4:
                    header4(socket, true);
                    break;
                default:
                    header2(socket, true);
                    break;
            }
            displaywalldata(socket, displaylines, true);
            // Menu separator
            let sep1 = '', sep3 = '';
            if (settings.style === 3 || settings.style === 4) {
                sep1 = '|';
                sep3 = settings.style === 3 ? 'Ś' : '|';
            }
            else {
                sep1 = 'Ś';
                sep3 = 'Ś';
            }
            transmit(socket, `${settings.gridcolour}${sep1}------- -  -  - --- - --- ----------------------- ---------- ----------------${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}1) Edit BBS Short code\x1b[54C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}2) Edit Wall Style\x1b[58C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}3) Edit Colour Preset\x1b[55C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}4) Back to Sysop Page\x1b[55C${settings.gridcolour}${sep3}`);
            // Show footer
            switch (settings.style) {
                case 1:
                    footer1(socket, true);
                    break;
                case 2:
                    footer2(socket, true);
                    break;
                case 3:
                    footer3(socket, true);
                    break;
                case 4:
                    footer4(socket, true);
                    break;
                default:
                    footer2(socket, true);
                    break;
            }
        }
        else {
            transmit(socket, '\x1b[0mThe server is not currently responding');
            return;
        }
        inputBuffer = await getDoorKey(bbs, undefined, false);
        if (inputBuffer === '1')
            await sysopShortCodeUpdate(socket, bbs);
        else if (inputBuffer === '2')
            await sysopStyleUpdate(socket, bbs);
        else if (inputBuffer === '3')
            await sysopColourUpdate(socket, bbs);
        else if (inputBuffer === 'B')
            pagenum++;
        else if (inputBuffer === 'F' && pagenum > 1)
            pagenum--;
    }
}
async function sysopMode(socket, bbs) {
    const displaylines = calculateDisplayLines() - 4;
    let pagenum = 1;
    let key = '';
    while (key !== '4') {
        const rescode = await getwalljson(pagenum, displaylines, tempFile);
        if (rescode === 200) {
            try {
                const jsonBuffer = (0, fs_1.readFileSync)(tempFile, 'utf-8');
                decodejson(jsonBuffer);
            }
            catch (err) {
                transmit(socket, '\x1b[0mError loading wall data');
                return;
            }
            sendCLS(socket);
            // Show header with sysop mode indicator
            switch (settings.style) {
                case 1:
                    header1(socket, true);
                    break;
                case 2:
                    header2(socket, true);
                    break;
                case 3:
                    header3(socket, true);
                    break;
                case 4:
                    header4(socket, true);
                    break;
                default:
                    header2(socket, true);
                    break;
            }
            displaywalldata(socket, displaylines, true);
            // Menu separator
            let sep1 = '', sep3 = '';
            if (settings.style === 3 || settings.style === 4) {
                sep1 = '|';
                sep3 = settings.style === 3 ? 'Ś' : '|';
            }
            else {
                sep1 = 'Ś';
                sep3 = 'Ś';
            }
            transmit(socket, `${settings.gridcolour}${sep1}------- -  -  - --- - --- ----------------------- ---------- ----------------${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}1) Edit a comment\x1b[59C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}2) Remove a comment\x1b[57C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}3) Update settings\x1b[58C${settings.gridcolour}${sep3}`);
            transmit(socket, `${settings.gridcolour}${sep1} ${settings.sysopmenuitemscolour}4) Exit\x1b[69C${settings.gridcolour}${sep3}`);
            // Show footer
            switch (settings.style) {
                case 1:
                    footer1(socket, true);
                    break;
                case 2:
                    footer2(socket, true);
                    break;
                case 3:
                    footer3(socket, true);
                    break;
                case 4:
                    footer4(socket, true);
                    break;
                default:
                    footer2(socket, true);
                    break;
            }
        }
        else {
            transmit(socket, '\x1b[0mThe server is not currently responding');
            return;
        }
        key = await getDoorKey(bbs, undefined, false);
        if (key === '1')
            await sysopEdit(socket, bbs);
        else if (key === '2')
            await sysopRemove(socket, bbs);
        else if (key === '3')
            await sysopSettingsUpdate(socket, bbs);
        else if (key === 'B')
            pagenum++;
        else if (key === 'F' && pagenum > 1)
            pagenum--;
    }
}
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket, user, bbs } = ctx;
    if (!socket) {
        console.error('[Gwall] Socket missing from context!');
        return;
    }
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
        const accesslevel = user.accessLevel || 0;
        if (accesslevel >= settings.sysoplevel) {
            transmit(socket, '');
            transmit(socket, '\x1b[0mThe wall has not yet been configured, performing initial setup');
            const newcode = await queryLine(bbs, '\x1b[0mEnter the 3 digit code to use for your bbs:\x1b[0m ', 3);
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
        const pushPrompt = `${settings.textcolour}pUSH tHE bUTTON ? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolourYN}]\x1b[0m `;
        inputBuffer = await getDoorKey(bbs, pushPrompt, true);
        transmit(socket, '\x1b[0m');
        if (inputBuffer === 'S') {
            const accesslevel = user.accessLevel || 0;
            if (accesslevel >= settings.sysoplevel) {
                await sysopMode(socket, bbs);
                redo = true; // Refresh wall after sysop mode
            }
        }
        if (inputBuffer === 'K') {
            showBBSKey(socket);
            continue;
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
    const comment = await queryLine(bbs, `${settings.textcolour}Enter your comment:\x1b[0m `, 56);
    if (comment.length === 0) {
        transmit(socket, '');
        transmit(socket, '\x1b[0myou forgot to enter something...');
        transmit(socket, '');
        return;
    }
    debugLog('get anon details');
    transmit(socket, '');
    const anonPrompt = `${settings.textcolour}sTAY aNONYMOUS? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolour}]\x1b[0m `;
    const anonInput = await getDoorKey(bbs, anonPrompt, true);
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
        const colourInput = await getDoorKey(bbs, undefined, true);
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
});
exports.default = door;
