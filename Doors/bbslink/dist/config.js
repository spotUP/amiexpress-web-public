"use strict";
/**
 * Where BBSLink's configuration comes from, and in what order.
 *
 * Three layers, lowest first:
 *
 *   1. the defaults in this file - what a board with nothing set up gets;
 *   2. `bbslink.cfg` - the file the 68K door read, kept working so a sysop
 *      who set the board up before the admin could edit doors loses nothing;
 *   3. `settings.json` - what the sysop set in the admin, and the only layer
 *      that can hold a secret the admin knows how to hide.
 *
 * Only keys the sysop actually SET come from layer 3
 * (`readDoorSettingOverrides`): a declared default arriving as a value would
 * quietly overwrite what bbslink.cfg says.
 *
 * The per-game door codes (LORD=lord and the thirty-odd others) stay in
 * bbslink.cfg. They are a map, not a fixed set of fields, and a manifest
 * cannot declare one.
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
exports.CONFIG_FILE = void 0;
exports.defaultConfig = defaultConfig;
exports.applyConfigText = applyConfigText;
exports.applyConfigFile = applyConfigFile;
exports.applyDoorSettings = applyDoorSettings;
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// The narrow subpath, not the package root: the root reaches the server
// bundle and its audio engine, and reading a JSON file has no business
// loading Tone.js.
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.CONFIG_FILE = 'bbslink.cfg';
function defaultConfig() {
    return {
        serverHost: 'games.bbslink.net',
        httpPort: 80,
        telnetPort: 23,
        timeout: 10,
        syscode: '',
        authcode: '',
        schemecode: '',
    };
}
/** Trim spaces from both ends of a string. */
function fullTrim(str) {
    let result = str.trim();
    while (result.length > 0 && result[result.length - 1] === ' ') {
        result = result.substring(0, result.length - 1);
    }
    return result;
}
/** Apply one bbslink.cfg's text to a config. Kept separate so it can be tested. */
function applyConfigText(text, config, doorCode) {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed)
            continue;
        if (!trimmed.includes('='))
            continue;
        const [key, ...valueParts] = trimmed.split('=');
        const value = fullTrim(valueParts.join('='));
        const upperKey = fullTrim(key).toUpperCase();
        switch (upperKey) {
            case 'SERVERHOST':
                config.serverHost = value;
                break;
            case 'TELNETPORT':
                config.telnetPort = parseInt(value) || 23;
                break;
            case 'HTTPPORT':
                config.httpPort = parseInt(value) || 80;
                break;
            case 'TIMEOUT':
                config.timeout = parseInt(value) || 10;
                break;
            case 'SYSCODE':
                config.syscode = value;
                break;
            case 'AUTHCODE':
                config.authcode = value;
                break;
            case 'SCHEMECODE':
                config.schemecode = value;
                break;
            case 'DOORCODE':
                config.doorcode = value;
                break;
            default:
                if (doorCode && upperKey === doorCode.toUpperCase())
                    config.doorcode = value;
                break;
        }
    }
}
/** Read bbslink.cfg if it is there. A board with no file is not an error. */
function applyConfigFile(configPath, config, doorCode) {
    try {
        if (!fs.existsSync(configPath))
            return;
        applyConfigText(fs.readFileSync(configPath, 'utf-8'), config, doorCode);
    }
    catch (err) {
        console.error('[BBSLink] Error parsing config:', err);
    }
}
/** What the sysop set in the admin, over everything below it. */
function applyDoorSettings(config, overrides) {
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === '')
            continue;
        config[key] = typeof value === 'boolean' ? String(value) : value;
    }
}
/**
 * The whole configuration, from wherever the door happens to be running.
 *
 * `startDir` is the door's `__dirname`, which is the door's own directory in
 * development and its `dist/` in production - the backend imports `index.ts`
 * in one and `dist/index.js` in the other. `resolveDoorRoot` finds the
 * directory the admin writes to, and bbslink.cfg is read from the same place;
 * before this, a production board looked for bbslink.cfg inside dist/, did not
 * find it, and the door died on "syscode/authcode/schemecode missing".
 */
function loadConfig(startDir, doorCodeParam) {
    const root = (0, settings_1.resolveDoorRoot)(startDir);
    const config = defaultConfig();
    applyConfigFile(path.join(root, exports.CONFIG_FILE), config, doorCodeParam);
    applyDoorSettings(config, (0, settings_1.readDoorSettingOverrides)(startDir));
    return config;
}
