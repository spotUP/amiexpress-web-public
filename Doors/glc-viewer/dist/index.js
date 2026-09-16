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
const logo_1 = require("./src/logo");
const skeleton_1 = require("./src/skeleton");
const fetch_deadline_1 = require("./src/fetch-deadline");
const narrow_1 = require("./src/narrow");
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
/**
 * Read a field the server might spell several ways.
 *
 * CASE-INSENSITIVELY, and that is the fix rather than a longer candidate
 * list. The wire sends `Timeon`; this asked for `TimeOn`, `timeOn` and
 * `timeon` and got none of them, so every caller's ON column came out blank
 * on a C64 screen (sysop's screenshot, 2026-09-16). A list of spellings that
 * has to be complete is a list that will be incomplete again - the server has
 * sent `Username`, `username` and `Handle` over the years - so the CANDIDATES
 * stay an order of preference and the MATCH stops caring about case.
 */
function getStringField(source, candidates, defaultValue = '') {
    if (!source) {
        return defaultValue;
    }
    const byLowerKey = new Map();
    for (const key of Object.keys(source))
        byLowerKey.set(key.toLowerCase(), source[key]);
    for (const candidate of candidates) {
        const value = byLowerKey.get(candidate.toLowerCase());
        if (value !== undefined && value !== null) {
            return String(value);
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
 * The board root, for the Studio's variant store, or null when it cannot be
 * found. A door that cannot see the board still draws - it just draws the
 * wide logo.
 */
function boardRoot() {
    try {
        const { resolveBbsRoot } = require('@amiexpress/bbs-door-sdk/settings');
        const root = resolveBbsRoot(__dirname);
        return typeof root === 'string' && root.length > 0 ? root : null;
    }
    catch {
        return null;
    }
}
/** What the admin saved for this door, or nothing at all. */
function settingValues() {
    try {
        const { readDoorSettings } = require('@amiexpress/bbs-door-sdk/settings');
        const values = readDoorSettings(__dirname);
        return values && typeof values === 'object' ? values : {};
    }
    catch {
        return {};
    }
}
/**
 * How wide the caller's screen is.
 *
 * Forty means a C64 or a teletext caller, and the narrow logo. The board
 * hands a door its session; a door that is handed nothing assumes the wide
 * screen, which is what every ANSI caller has.
 */
function columnsOf(ctx) {
    const session = ctx.bbsSession;
    const width = Number(session?.screenWidth ?? 80);
    return Number.isFinite(width) && width > 0 ? width : 80;
}
/**
 * Enough empty data to render a header.
 *
 * `renderGlcHeader` reads none of it, but the screen type is one object and
 * this keeps the door from inventing a second, narrower one that would then
 * drift from the renderer's.
 */
const EMPTY_DATA = {
    calls: [],
    yesterday: { statdate: '', calls: '', topcps: '', uploads: '', downloads: '' },
    previousDay: { statdate: '', calls: '', topcps: '', uploads: '', downloads: '' },
    records: {
        allcalls: '', recordcalls: '', calls: '', mostcalled: '',
        calls2: '', secondmostcalled: '', calls3: '', thirdmostcalled: '',
    },
};
/**
 * The half of the screen that needs no data, drawn at once.
 *
 * Returns the screen it drew from, so the caller can finish it with the same
 * style and the same columns once the scenewall answers.
 */
function drawHeader(socket, config, showLocation, callerColumns) {
    const base = {
        style: config.style,
        screenClear: config.screenClear,
        showLocation,
        centreName: config.centreName,
        // The artist's drawing when there is one, the original's when there is
        // not - and the narrow one for a caller on forty columns.
        logo: (0, logo_1.logoFor)({
            style: config.style,
            doorDir: DOOR_ROOT,
            bbsRoot: boardRoot(),
            columns: callerColumns,
            values: settingValues(),
            command: 'GLC',
        }),
        columns: callerColumns,
    };
    /*
     * A FORTY-COLUMN CALLER IS DRAWN FOR, not cut down.
     *
     * The board's frame adapter cannot help here - it narrows the 68K wire and
     * a TypeScript door's output never crosses it - so the whole screen is
     * drawn once, at the end, in `src/narrow.ts`. Nothing goes out first,
     * because a C64 has twenty-five rows and a header plus placeholders plus a
     * list would scroll the header off before the caller read it.
     */
    if (base.columns <= narrow_1.NARROW_WIDTH)
        return base;
    for (const line of (0, render_1.renderGlcHeader)({ ...base, ...EMPTY_DATA })) {
        socket.emit('ansi-output', line + '\r\n');
    }
    return base;
}
/**
 * Draw the calls and the totals over the placeholder rows.
 *
 * `skeletonCount` is how many rows are already on screen; the cursor walks
 * back over exactly those and each real row is written with the row cleared
 * first, so a short list cannot leave a placeholder showing under it.
 */
function drawData(socket, base, data, skeletonCount) {
    const screen = {
        ...base,
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
    };
    if (base.columns <= narrow_1.NARROW_WIDTH) {
        for (const line of (0, narrow_1.renderNarrowScreen)({
            logo: base.logo,
            showLocation: base.showLocation,
            screenClear: base.screenClear,
            calls: screen.calls,
            yesterday: screen.yesterday,
            records: screen.records,
        })) {
            socket.emit('ansi-output', line + '\r\n');
        }
        return;
    }
    const rows = (0, render_1.renderGlcRows)(screen);
    if (skeletonCount > 0)
        socket.emit('ansi-output', (0, skeleton_1.rewind)(skeletonCount));
    for (const row of rows) {
        socket.emit('ansi-output', (0, skeleton_1.overwrite)(row) + '\r\n');
    }
    // Any placeholder the real list did not reach is cleared rather than left
    // standing: the server can answer with fewer callers than were asked for.
    for (let i = rows.length; i < skeletonCount; i++) {
        socket.emit('ansi-output', (0, skeleton_1.overwrite)('') + '\r\n');
    }
    for (const line of (0, render_1.renderGlcFooter)(screen)) {
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
        const showLocation = config.viewBBS.length > 0;
        /*
         * THE SCREEN OPENS BEFORE THE NETWORK IS ASKED.
         *
         * Everything above the column rule depends on no data at all, so a caller
         * sees the logo immediately rather than a blank line while the scenewall
         * decides. The placeholder rows below it hold the table's shape - in the
         * calls' own column widths - and the real rows are written over them.
         */
        const base = drawHeader(socket, config, showLocation, columnsOf(ctx));
        /*
         * A FORTY-COLUMN LIST SIZES ITSELF.
         *
         * `LINES` is one number for both widths, and twenty of them do not fit a
         * C64's twenty-five rows beside the chrome and the board's own pause -
         * the header scrolls off before the caller reads it. So the narrow screen
         * asks the server for what is left under its logo instead, and the logo
         * is known by now because the header decided it.
         */
        if (base.columns <= narrow_1.NARROW_WIDTH) {
            config.lines = Math.min(config.lines, (0, narrow_1.narrowListRows)(base.logo.length));
        }
        // Placeholders belong to the wide screen: they hold a table's shape while
        // the network answers, and the narrow screen has no table on the wire yet.
        const placeholders = base.columns <= narrow_1.NARROW_WIDTH ? [] : (0, skeleton_1.skeletonRows)(config.lines);
        for (const row of placeholders)
            socket.emit('ansi-output', row + '\r\n');
        /*
         * ONE DEADLINE FOR THE WHOLE FETCH, not a socket timer that restarts on
         * every byte - that is how the 68K viewer held a login for 58 seconds
         * with `TIMEOUT=5` in its own config. When the scenewall misses it, the
         * door draws the LAST answer it got: yesterday's list beats a red line,
         * and a late answer is still written to the cache for the next caller.
         */
        const { body, source } = await (0, fetch_deadline_1.bodyForThisCall)(() => fetchGLCData(config), config.timeout, DOOR_ROOT);
        if (!body) {
            // Nothing from the network and nothing kept: say so where the calls
            // would have been, and still draw the rest of the screen.
            socket.emit('ansi-output', (0, skeleton_1.rewind)(placeholders.length));
            socket.emit('ansi-output', (0, skeleton_1.overwrite)('\x1b[31m  THE SCENEWALL DID NOT ANSWER') + '\r\n');
            for (let i = 1; i < placeholders.length; i++) {
                socket.emit('ansi-output', (0, skeleton_1.overwrite)('') + '\r\n');
            }
            drawData(socket, base, normalizeGLCData({}), 0);
            return;
        }
        let glcData;
        try {
            glcData = normalizeGLCData(JSON.parse(body));
        }
        catch (err) {
            socket.emit('ansi-output', (0, skeleton_1.rewind)(placeholders.length));
            socket.emit('ansi-output', (0, skeleton_1.overwrite)(`\x1b[31m  COULD NOT READ THE ANSWER: ${err.message}`) + '\r\n');
            for (let i = 1; i < placeholders.length; i++) {
                socket.emit('ansi-output', (0, skeleton_1.overwrite)('') + '\r\n');
            }
            drawData(socket, base, normalizeGLCData({}), 0);
            return;
        }
        drawData(socket, base, glcData, placeholders.length);
        if (source === 'cache') {
            // The caller should know the list is the last one that arrived rather
            // than the one that is true this second.
            socket.emit('ansi-output', '\x1b[33m  (the scenewall did not answer - this is the last list it sent)\x1b[0m\r\n');
        }
    }
    catch (err) {
        socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    }
});
exports.default = door;
//# sourceMappingURL=index.js.map