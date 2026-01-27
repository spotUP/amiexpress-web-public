"use strict";
/**
 * BBSLink Door - InterBBS Games Client
 *
 * Connects to BBSLink.net to play classic InterBBS games.
 * Ported from Amiga E version.
 *
 * Features:
 * - Menu of available games (LORD, Trade Wars, etc.)
 * - Direct game launch via door code parameter
 * - MD5 authentication
 * - Telnet proxy to games.bbslink.net
 *
 * Requirements:
 * - BBSLink.net account (free at http://www.bbslink.net/)
 * - syscode, authcode, schemecode from BBSLink
 *
 * Original: Documentation/7-Reference Sources/AmiExpressEDoorSources/BBSLink/bbslink.e
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const http = __importStar(require("http"));
const net = __importStar(require("net"));
exports.metadata = {
    name: 'BBSLink',
    version: '1.0.0',
    author: 'AmiExpress Team (port from Darren Coles)',
    description: 'InterBBS games client - play LORD, Trade Wars, and more!',
    minSecurityLevel: 10,
    command: 'BBSLINK',
    category: 'Games'
};
/**
 * CP437 to Unicode translation table
 * Maps IBM PC CP437 bytes (0x00-0xFF) to Unicode codepoints
 * This allows proper display in xterm.js/web terminals
 */
const CP437_TO_UNICODE = [
    // 0x00-0x1F: Control characters and special symbols
    '\u0000', '\u263A', '\u263B', '\u2665', '\u2666', '\u2663', '\u2660', '\u2022',
    '\u25D8', '\u25CB', '\u25D9', '\u2642', '\u2640', '\u266A', '\u266B', '\u263C',
    '\u25BA', '\u25C4', '\u2195', '\u203C', '\u00B6', '\u00A7', '\u25AC', '\u21A8',
    '\u2191', '\u2193', '\u2192', '\u2190', '\u221F', '\u2194', '\u25B2', '\u25BC',
    // 0x20-0x7F: Standard ASCII (pass through)
    ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
    '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
    'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_',
    '`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
    'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~', '\u2302',
    // 0x80-0x9F: Extended Latin characters
    '\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7',
    '\u00EA', '\u00EB', '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5',
    '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
    '\u00FF', '\u00D6', '\u00DC', '\u00A2', '\u00A3', '\u00A5', '\u20A7', '\u0192',
    // 0xA0-0xAF: More Latin + special
    '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1', '\u00AA', '\u00BA',
    '\u00BF', '\u2310', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB',
    // 0xB0-0xBF: Shading and box drawing
    '\u2591', '\u2592', '\u2593', '\u2502', '\u2524', '\u2561', '\u2562', '\u2556',
    '\u2555', '\u2563', '\u2551', '\u2557', '\u255D', '\u255C', '\u255B', '\u2510',
    // 0xC0-0xCF: Box drawing continued
    '\u2514', '\u2534', '\u252C', '\u251C', '\u2500', '\u253C', '\u255E', '\u255F',
    '\u255A', '\u2554', '\u2569', '\u2566', '\u2560', '\u2550', '\u256C', '\u2567',
    // 0xD0-0xDF: Box drawing + blocks
    '\u2568', '\u2564', '\u2565', '\u2559', '\u2558', '\u2552', '\u2553', '\u256B',
    '\u256A', '\u2518', '\u250C', '\u2588', '\u2584', '\u258C', '\u2590', '\u2580',
    // 0xE0-0xEF: Greek and math symbols
    '\u03B1', '\u00DF', '\u0393', '\u03C0', '\u03A3', '\u03C3', '\u00B5', '\u03C4',
    '\u03A6', '\u0398', '\u03A9', '\u03B4', '\u221E', '\u03C6', '\u03B5', '\u2229',
    // 0xF0-0xFF: Math and misc symbols
    '\u2261', '\u00B1', '\u2265', '\u2264', '\u2320', '\u2321', '\u00F7', '\u2248',
    '\u00B0', '\u2219', '\u00B7', '\u221A', '\u207F', '\u00B2', '\u25A0', '\u00A0',
];
/**
 * Translate CP437 (IBM PC) encoded buffer to UTF-8 string for web terminal display
 */
function translateCP437ToUnicode(data) {
    let result = '';
    let i = 0;
    while (i < data.length) {
        const byte = data[i];
        // Check for ANSI escape sequence - pass through unchanged
        if (byte === 0x1B && i + 1 < data.length && data[i + 1] === 0x5B) {
            // ESC [ sequence - find the end
            result += '\x1B[';
            i += 2;
            // Copy until we hit a letter (the command terminator)
            while (i < data.length) {
                const c = data[i];
                result += String.fromCharCode(c);
                i++;
                // ANSI sequences end with a letter (A-Z, a-z)
                if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
                    break;
                }
            }
        }
        else if (byte < 0x20) {
            // Control characters (0x00-0x1F) - pass through as-is for terminal handling
            // This includes: BEL (0x07), BS (0x08), TAB (0x09), LF (0x0A), CR (0x0D), ESC (0x1B)
            result += String.fromCharCode(byte);
            i++;
        }
        else if (byte === 0x7F) {
            // DEL character - pass through
            result += String.fromCharCode(byte);
            i++;
        }
        else {
            // Translate using CP437 table (0x20-0x7E standard ASCII, 0x80-0xFF extended)
            result += CP437_TO_UNICODE[byte] || String.fromCharCode(byte);
            i++;
        }
    }
    return result;
}
/**
 * Generate random string for session key
 */
function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
/**
 * Calculate MD5 hash
 */
function getMD5(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}
/**
 * Trim spaces from both ends of string
 */
function fullTrim(str) {
    let result = str.trim();
    while (result.length > 0 && result[result.length - 1] === ' ') {
        result = result.substring(0, result.length - 1);
    }
    return result;
}
/**
 * Parse bbslink.cfg file
 */
function parseConfigFile(configPath, config, doorCode) {
    try {
        if (!fs.existsSync(configPath))
            return;
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const lines = fileContent.split('\n');
        for (const line of lines) {
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
    catch (err) {
        console.error('[BBSLink] Error parsing config:', err);
    }
}
/**
 * HTTP GET request
 */
function httpGet(host, port, path, timeout) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host, port, path, method: 'GET',
            timeout: timeout * 1000,
            headers: { 'Host': host, 'Connection': 'close' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
    });
}
/**
 * Connect to BBSLink game server
 */
async function connectToGame(socket, config, userSlot, bbsSession) {
    return new Promise((resolve) => {
        socket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${config.serverHost}:${config.telnetPort}...\x1b[0m\r\n`);
        const telnetSocket = net.createConnection({ host: config.serverHost, port: config.telnetPort, timeout: 30000 });
        let connected = false;
        telnetSocket.on('connect', () => {
            connected = true;
            socket.emit('ansi-output', `\x1b[32mConnected! Loading game...\x1b[0m\r\n\r\n`);
        });
        telnetSocket.on('data', (data) => {
            // Translate CP437 (PC) characters to Unicode for proper web terminal display
            const translated = translateCP437ToUnicode(data);
            socket.emit('ansi-output', translated);
        });
        telnetSocket.on('error', (err) => {
            socket.emit('ansi-output', `\r\n\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
            resolve();
        });
        telnetSocket.on('close', () => {
            socket.emit('ansi-output', '\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
            resolve();
        });
        const inputHandler = (data) => {
            if (connected && !telnetSocket.destroyed)
                telnetSocket.write(data);
        };
        bbsSession.doorInputHandler = inputHandler;
    });
}
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket, user, bbsSession, params } = ctx;
    try {
        let doorCodeParam = params?.[0]?.trim().toUpperCase();
        const config = { serverHost: 'games.bbslink.net', httpPort: 80, telnetPort: 23, timeout: 10, syscode: '', authcode: '', schemecode: '' };
        // Find config file - same location as 68K door for compatibility
        // Config is in same directory as door (Doors/bbslink/bbslink.cfg)
        const configPath = path.resolve(__dirname, 'bbslink.cfg');
        parseConfigFile(configPath, config, doorCodeParam);
        const doorCode = (doorCodeParam || config.doorcode || 'MENU').toLowerCase();
        if (!config.syscode || !config.authcode || !config.schemecode) {
            throw new Error('syscode/authcode/schemecode missing from bbslink.cfg');
        }
        const xkey = randomString(6);
        socket.emit('ansi-output', '\x1b[36mAuthenticating with BBSLink...\x1b[0m\r\n');
        let token = (await httpGet(config.serverHost, config.httpPort, `/token.php?key=${xkey}`, config.timeout)).trim();
        const authcodemd5 = getMD5(config.authcode + token);
        const schemecodemd5 = getMD5(config.schemecode + token);
        const userSlot = ctx.nodeId || 1;
        const authPath = `/auth.php?key=${xkey}&user=${userSlot}&system=${config.syscode}&auth=${authcodemd5}&scheme=${schemecodemd5}&rows=24&door=${doorCode}&token=${token}&type=ami-express&version=0.1.beta`;
        await httpGet(config.serverHost, config.httpPort, authPath, config.timeout);
        socket.emit('ansi-output', '\x1b[32mAuthenticated!\x1b[0m\r\n');
        await connectToGame(socket, config, userSlot, bbsSession);
    }
    catch (err) {
        socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    }
});
exports.default = door;
