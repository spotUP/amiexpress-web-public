"use strict";
/**
 * The BBSes this door can dial, and where that list lives.
 *
 * `Doors/telnet/telnetdoor.cfg`, which is what the door's own empty menu tells
 * a sysop to create. It used to be read from `process.cwd()` plus that path,
 * and the backend's cwd on the board is /app/web/backend - so the file a sysop
 * created by following that instruction exactly was never opened, with no
 * error to explain the empty menu.
 *
 * The list stays a file rather than becoming declared settings: a manifest
 * declares fields, and this is a list of hosts with per-host logins.
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
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// The narrow subpath, not the package root: this needs one path helper, not
// the SDK's audio engine.
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.CONFIG_FILE = 'telnetdoor.cfg';
/**
 * Load telnet configuration
 */
function loadConfig(startDir = __dirname) {
    // The door's own directory, not the process's. The backend's cwd on the
    // board is /app/web/backend, so cwd + Doors/telnet/telnetdoor.cfg named a
    // path that has never existed - a sysop who followed the door's own
    // instruction and created the file got the empty menu anyway. __dirname is
    // this directory in development and dist/ in production, so it is resolved.
    const configPath = path.join((0, settings_1.resolveDoorRoot)(startDir), exports.CONFIG_FILE);
    const configs = [];
    try {
        if (fs.existsSync(configPath)) {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const lines = fileContent.split('\n');
            let currentConfig = {};
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) {
                    continue;
                }
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    if (currentConfig.serverHost) {
                        configs.push({
                            serverHost: currentConfig.serverHost,
                            telnetPort: currentConfig.telnetPort || 23,
                            usernamePrompt: currentConfig.usernamePrompt,
                            passwordPrompt: currentConfig.passwordPrompt,
                            username: currentConfig.username,
                            password: currentConfig.password,
                            autoLogin: currentConfig.autoLogin !== false
                        });
                    }
                    currentConfig = {};
                    continue;
                }
                if (!trimmed.includes('='))
                    continue;
                const [key, ...valueParts] = trimmed.split('=');
                const value = valueParts.join('=').trim();
                const upperKey = key.trim().toUpperCase();
                switch (upperKey) {
                    case 'SERVERHOST':
                        currentConfig.serverHost = value;
                        break;
                    case 'TELNETPORT':
                        currentConfig.telnetPort = parseInt(value) || 23;
                        break;
                    case 'USERNAMEPROMPT':
                        currentConfig.usernamePrompt = value;
                        break;
                    case 'PASSWORDPROMPT':
                        currentConfig.passwordPrompt = value;
                        break;
                    case 'USERNAME':
                        currentConfig.username = value;
                        break;
                    case 'PASSWORD':
                        currentConfig.password = value;
                        break;
                    case 'AUTOLOGIN':
                        currentConfig.autoLogin = value.toUpperCase() === 'YES' || value === '1';
                        break;
                }
            }
            if (currentConfig.serverHost) {
                configs.push({
                    serverHost: currentConfig.serverHost,
                    telnetPort: currentConfig.telnetPort || 23,
                    usernamePrompt: currentConfig.usernamePrompt,
                    passwordPrompt: currentConfig.passwordPrompt,
                    username: currentConfig.username,
                    password: currentConfig.password,
                    autoLogin: currentConfig.autoLogin !== false
                });
            }
        }
    }
    catch (err) {
        console.error('[TelnetConnect] Error loading config:', err);
    }
    return configs;
}
