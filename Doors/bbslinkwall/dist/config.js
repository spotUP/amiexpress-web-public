"use strict";
/**
 * Where the wall's BBSLink credentials come from, and in what order.
 *
 * The wall and the BBSLINK door talk to the same BBSLink account, so a sysop
 * who set the codes on one should not have to set them again on the other.
 * Four layers, lowest first:
 *
 *   1. the defaults here - host, port, timeout;
 *   2. `Doors/bbslink/bbslink.cfg` - the file the 68K doors read, still the
 *      truth on a board set up before the admin could edit doors;
 *   3. `Doors/bbslink/settings.json` - what the sysop set on BBSLINK;
 *   4. `Doors/bbslinkwall/settings.json` - what they set on the wall itself,
 *      for a board that wants the wall on a different account.
 *
 * Only keys actually SET come from layers 3 and 4, so a declared default
 * cannot overwrite what an earlier layer supplied.
 *
 * Before this, the wall read `process.cwd() + Doors/bbslink/bbslink.cfg` and
 * three BBSLINK_* environment variables. The backend's cwd on the board is
 * /app/web/backend, so that path resolved to a file that has never existed,
 * and nothing sets those variables - the wall had no credentials at all.
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
exports.SHARED_CONFIG_FILE = exports.SIBLING_DOOR = void 0;
exports.defaultConfig = defaultConfig;
exports.applyConfigText = applyConfigText;
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// The narrow subpath, not the package root: reading a JSON file has no
// business loading the SDK's audio engine.
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
/** The BBSLINK door's directory, beside this one. */
exports.SIBLING_DOOR = 'bbslink';
exports.SHARED_CONFIG_FILE = 'bbslink.cfg';
function defaultConfig() {
    return {
        serverHost: 'games.bbslink.net',
        httpPort: 80,
        timeout: 10,
        syscode: '',
        authcode: '',
        schemecode: '',
    };
}
/** Apply one bbslink.cfg's text. The wall reads the fixed fields only. */
function applyConfigText(text, config) {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';'))
            continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1)
            continue;
        const key = trimmed.substring(0, eq).trim().toLowerCase();
        const value = trimmed.substring(eq + 1).trim();
        switch (key) {
            case 'serverhost':
                config.serverHost = value;
                break;
            case 'httpport':
                config.httpPort = parseInt(value) || 80;
                break;
            case 'timeout':
                config.timeout = parseInt(value) || 10;
                break;
            case 'syscode':
                config.syscode = value;
                break;
            case 'authcode':
                config.authcode = value;
                break;
            case 'schemecode':
                config.schemecode = value;
                break;
        }
    }
}
function applyOverrides(config, overrides) {
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === '')
            continue;
        if (typeof value === 'boolean')
            continue; // the wall declares none
        config[key] = value;
    }
}
/**
 * The whole configuration, from wherever the door happens to be running.
 *
 * `startDir` is the door's `__dirname`: this directory in development, its
 * `dist/` in production, because the backend imports index.ts in one and
 * dist/index.js in the other.
 */
function loadConfig(startDir) {
    const root = (0, settings_1.resolveDoorRoot)(startDir);
    const siblingDir = path.join(path.dirname(root), exports.SIBLING_DOOR);
    const config = defaultConfig();
    const shared = path.join(siblingDir, exports.SHARED_CONFIG_FILE);
    try {
        if (fs.existsSync(shared))
            applyConfigText(fs.readFileSync(shared, 'utf-8'), config);
    }
    catch (err) {
        console.error('[BBSLinkWall] Error reading', shared, err);
    }
    // What the sysop set on BBSLINK, then what they set here.
    try {
        applyOverrides(config, (0, settings_1.readDoorSettingOverrides)(siblingDir));
    }
    catch (err) {
        console.error('[BBSLinkWall] Error reading the BBSLINK door settings:', err);
    }
    applyOverrides(config, (0, settings_1.readDoorSettingOverrides)(startDir));
    return config;
}
