"use strict";
/**
 * GLC Viewer Door - Global Last Callers Viewer
 *
 * Displays global last callers from scenewall.bbs.io.
 * Ported from Amiga E version.
 *
 * Features:
 * - Display last callers across all BBSes
 * - Multiple ANSI art styles (4 styles)
 * - Yesterday and previous day statistics
 * - All-time records display
 * - Top 3 most called BBSes
 * - Configurable display options
 *
 * Original: dev/docs/AmiExpressEDoorSources/Global Last Callers/GLCViewer.e
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const render_1 = require("./src/render");
// Metadata
exports.metadata = {
    name: 'Global Last Callers',
    version: '1.1.0',
    description: 'View last callers across all BBSes',
    author: 'REBEL/qUARTEX',
    command: 'GLC',
};
/**
 * This door's own directory, found from the file rather than from the process.
 *
 * `process.cwd()` is the BACKEND when a door runs on this board, not the door
 * - `tests/doors/doors-do-not-use-cwd.test.ts` exists because doors kept
 * reading the backend's files by accident. `__dirname` is `src/` in
 * development and `dist/` in production, so the door root is one level up
 * from either.
 */
const DOOR_ROOT = path.resolve(__dirname, '..');
function getStringField(source, candidates, defaultValue = '') {
    if (!source) {
        return defaultValue;
    }
    for (const key of candidates) {
        if (key in source && source[key] !== undefined && source[key] !== null) {
            return String(source[key]);
        }
    }
    return defaultValue;
}
function getNumberField(source, candidates, defaultValue = 0) {
    const str = getStringField(source, candidates, '');
    if (!str) {
        return defaultValue;
    }
    const value = Number(str);
    return Number.isFinite(value) ? value : defaultValue;
}
function normalizeCall(call) {
    const normalized = {
        Username: getStringField(call, ['Username', 'username', 'UserName', 'USER', 'Handle']),
        location: getStringField(call, ['location', 'Location', 'Origin', 'City', 'BbsLocation']),
        Bbsname: getStringField(call, ['Bbsname', 'BbsName', 'bbsname', 'BBS', 'System']),
        Dateon: getStringField(call, ['Dateon', 'DateOn', 'dateon', 'Date']),
        TimeOn: getStringField(call, ['TimeOn', 'timeOn', 'timeon', 'LoginTime', 'TimeIn']),
        TimeOff: getStringField(call, ['TimeOff', 'timeoff', 'LogoutTime', 'TimeOut']),
        Actions: getStringField(call, ['Actions', 'actions', 'ActionCodes']),
        Upload: getNumberField(call, ['Upload', 'upload', 'UpKB', 'UpKilobytes', 'UploadBytes']) || 0,
        Download: getNumberField(call, ['Download', 'download', 'DownKB', 'DownKilobytes', 'DownloadBytes']) || 0
    };
    return normalized;
}
function normalizeDayStats(stats) {
    const base = {
        statdate: '',
        calls: '0',
        topcps: '0',
        uploads: '0',
        downloads: '0'
    };
    if (!stats) {
        return base;
    }
    return {
        statdate: getStringField(stats, ['statdate', 'StatDate', 'Date']) || base.statdate,
        calls: getStringField(stats, ['calls', 'Calls']) || base.calls,
        topcps: getStringField(stats, ['topcps', 'TopCps', 'TopSpeed']) || base.topcps,
        uploads: getStringField(stats, ['uploads', 'Uploads', 'UploadKB']) || base.uploads,
        downloads: getStringField(stats, ['downloads', 'Downloads', 'DownloadKB']) || base.downloads
    };
}
function normalizeRecords(records) {
    const base = {
        allcalls: '0',
        recordcalls: '0',
        calls: '0',
        mostcalled: '',
        calls2: '0',
        secondmostcalled: '',
        calls3: '0',
        thirdmostcalled: ''
    };
    if (!records) {
        return base;
    }
    return {
        allcalls: getStringField(records, ['allcalls', 'AllCalls']) || base.allcalls,
        recordcalls: getStringField(records, ['recordcalls', 'RecordCalls']) || base.recordcalls,
        calls: getStringField(records, ['calls', 'Calls', 'MostCalls']) || base.calls,
        mostcalled: getStringField(records, ['mostcalled', 'MostCalled', 'TopSystem']) || base.mostcalled,
        calls2: getStringField(records, ['calls2', 'Calls2', 'SecondCalls']) || base.calls2,
        secondmostcalled: getStringField(records, ['secondmostcalled', 'SecondMostCalled']) || base.secondmostcalled,
        calls3: getStringField(records, ['calls3', 'Calls3', 'ThirdCalls']) || base.calls3,
        thirdmostcalled: getStringField(records, ['thirdmostcalled', 'ThirdMostCalled']) || base.thirdmostcalled
    };
}
function normalizeGLCData(raw) {
    const callsSource = Array.isArray(raw?.calls)
        ? raw.calls
        : Array.isArray(raw?.Calls)
            ? raw.Calls
            : [];
    return {
        calls: callsSource.map(normalizeCall),
        yesterdayStats: normalizeDayStats(raw?.yesterdayStats || raw?.YesterdayStats),
        previousDayStats: normalizeDayStats(raw?.previousDayStats || raw?.PreviousDayStats),
        records: normalizeRecords(raw?.records || raw?.Records)
    };
}
/**
 * Load GLC configuration
 */
function loadConfig() {
    // Beside the door, under its own name - the same file the 68K viewer reads
    // from PROGDIR: (`FileManager Open: "PROGDIR:GLCViewer.cfg"`).
    const configPath = path.join(DOOR_ROOT, 'GLCViewer.cfg');
    const config = {
        serverHost: process.env.GLC_SERVER_HOST || 'scenewall.bbs.io',
        serverPort: parseInt(process.env.GLC_SERVER_PORT || '1541'),
        timeout: 10,
        retries: 5,
        lines: 10,
        screenClear: false,
        style: 1,
        centreName: false,
        timeZone: '',
        viewBBS: ''
    };
    try {
        if (fs.existsSync(configPath)) {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const lines = fileContent.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
                    continue;
                }
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex === -1)
                    continue;
                const key = trimmed.substring(0, eqIndex).trim().toUpperCase();
                const value = trimmed.substring(eqIndex + 1).trim();
                switch (key) {
                    case 'SERVERHOST':
                        config.serverHost = value;
                        break;
                    case 'SERVERPORT':
                        config.serverPort = parseInt(value) || 1541;
                        break;
                    case 'TIMEOUT':
                        config.timeout = parseInt(value) || 10;
                        break;
                    case 'RETRIES':
                        config.retries = parseInt(value) || 5;
                        break;
                    case 'LINES':
                        config.lines = parseInt(value) || 10;
                        break;
                    case 'SCREENCLEAR':
                        config.screenClear = value.toUpperCase() === 'YES';
                        break;
                    case 'STYLE':
                        // Support comma-separated styles for random selection
                        if (value.includes(',')) {
                            const styles = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                            config.style = styles[Math.floor(Math.random() * styles.length)] || 1;
                        }
                        else {
                            config.style = parseInt(value) || 1;
                        }
                        break;
                    case 'CENTRENAME':
                        config.centreName = value === '1';
                        break;
                    case 'TIMEZONE':
                        config.timeZone = value;
                        break;
                    case 'VIEWBBS':
                        config.viewBBS = value;
                        break;
                }
            }
        }
    }
    catch (err) {
        console.error('[GLCViewer] Error loading config:', err);
    }
    // Validate style range
    if (config.style < 1 || config.style > 4) {
        config.style = 1;
    }
    return config;
}
/**
 * Fetch JSON data from GLC server
 */
async function fetchGLCData(config, page = 1) {
    return new Promise((resolve, reject) => {
        const start = ((page - 1) * config.lines) + 1;
        let queryPath = `/GlobalLastCallers/api/GlobalLastCallers?start=${start}&count=${config.lines}`;
        if (config.timeZone) {
            const tz = config.timeZone.replace(/ /g, '+');
            queryPath = `/GlobalLastCallers/api/GlobalLastCallers?tzname=${tz}&start=${start}&count=${config.lines}`;
        }
        if (config.viewBBS) {
            const bbsEncoded = encodeURIComponent(config.viewBBS);
            queryPath += `&bbsname=${bbsEncoded}`;
        }
        const options = {
            hostname: config.serverHost,
            port: config.serverPort,
            path: queryPath,
            method: 'GET',
            timeout: config.timeout * 1000,
            headers: {
                'Host': config.serverHost,
                'Connection': 'close'
            }
        };
        let settled = false;
        const safeReject = (err) => {
            if (settled)
                return;
            settled = true;
            reject(err);
        };
        const safeResolve = (data) => {
            if (settled)
                return;
            settled = true;
            resolve(data);
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                // Extract body after double CRLF
                const bodyStart = data.indexOf('\r\n\r\n');
                if (bodyStart !== -1) {
                    safeResolve(data.substring(bodyStart + 4));
                }
                else {
                    safeResolve(data);
                }
            });
            // CRITICAL: response streams emit 'error' on mid-download disconnects.
            // Without this listener it propagates as an uncaught exception and crashes the process.
            res.on('error', (err) => {
                safeReject(err);
            });
        });
        req.on('error', (err) => {
            safeReject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            safeReject(new Error('HTTP request timed out'));
        });
        req.end();
    });
}
/**
 * Display GLC data with ANSI art
 */
/**
 * Draw the screen, through the renderer that is pinned to the E source.
 *
 * This function used to BE the renderer, and it drew an approximation: five
 * literal spaces where `GLCViewer.e` writes `ESC[5C`, and a column header of
 * its own invention. The art now comes from `src/art.generated.ts`, lifted out
 * of the E source by `dev/extract-art.py` and compared against it on every
 * test run, so what reaches a caller is what the 68K door put on the wire.
 *
 * All this does is map the door's normalised data onto the renderer's shapes
 * and write the lines. `transmit()` in the original is
 * `WriteStr(diface, textLine, LF)` - one line, one terminator.
 */
function displayData(socket, data, config, showLocation) {
    const lines = (0, render_1.renderGlcScreen)({
        style: config.style,
        screenClear: config.screenClear,
        showLocation,
        centreName: config.centreName,
        calls: data.calls.map((call) => ({
            Username: call.Username,
            Location: call.location,
            Bbsname: call.Bbsname,
            Dateon: call.Dateon,
            Timeon: call.TimeOn,
            Timeoff: call.TimeOff,
            Actions: call.Actions,
            // Kilobytes on the wire; `transferField` does the rest.
            Upload: String(call.Upload),
            Download: String(call.Download),
        })),
        yesterday: data.yesterdayStats,
        previousDay: data.previousDayStats,
        records: data.records,
    });
    for (const line of lines) {
        socket.emit('ansi-output', line + '\r\n');
    }
}
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket } = ctx;
    if (!socket) {
        console.error('[glc-viewer] Socket missing from context!');
        return;
    }
    try {
        const config = loadConfig();
        // Fetch JSON data
        const jsonText = await fetchGLCData(config);
        if (!jsonText || jsonText.length === 0) {
            socket.emit('ansi-output', '\x1b[31mError: Could not get data from server\x1b[0m\r\n');
            return;
        }
        // Parse JSON
        let glcData;
        try {
            const parsed = JSON.parse(jsonText);
            glcData = normalizeGLCData(parsed);
        }
        catch (err) {
            socket.emit('ansi-output', `\x1b[31mError: Could not parse JSON data: ${err.message}\x1b[0m\r\n`);
            return;
        }
        // Display data
        const showLocation = config.viewBBS.length > 0;
        displayData(socket, glcData, config, showLocation);
    }
    catch (err) {
        socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    }
});
exports.default = door;
//# sourceMappingURL=index.js.map