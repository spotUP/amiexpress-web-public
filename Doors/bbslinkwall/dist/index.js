"use strict";
/**
 * BBSLink Wall Door - Graffiti Wall Client
 *
 * Connects to BBSLink.net graffiti wall service.
 * Ported from Amiga E version.
 *
 * Features:
 * - Display global graffiti wall
 * - Post messages to the wall (64 chars max)
 * - Username registration for new users
 * - 10-minute posting cooldown
 *
 * Requirements:
 * - BBSLink.net account (free registration at http://www.bbslink.net/)
 * - syscode, authcode, and schemecode from BBSLink
 *
 * Original: dev/docs/AmiExpressEDoorSources/BBSLink/bbslinkwall.e
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
// Metadata
exports.metadata = {
    name: 'BBSLink Graffiti Wall',
    version: '1.1.0',
    description: 'Global Graffiti Wall Client',
    author: 'REBEL/QTX',
    command: 'LINKWALL',
};
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
 * URL encode a string
 */
function urlEncode(text) {
    return encodeURIComponent(text);
}
/**
 * Load BBSLink configuration
 */
function loadConfig() {
    const configPath = path.join(process.cwd(), 'Doors', 'bbslink', 'bbslink.cfg');
    const config = {
        serverHost: 'games.bbslink.net',
        httpPort: 80,
        timeout: 10,
        syscode: process.env.BBSLINK_SYSCODE || '',
        authcode: process.env.BBSLINK_AUTHCODE || '',
        schemecode: process.env.BBSLINK_SCHEMECODE || ''
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
                const key = trimmed.substring(0, eqIndex).trim().toLowerCase();
                const value = trimmed.substring(eqIndex + 1).trim();
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
    }
    catch (err) {
        console.error('[BBSLinkWall] Error loading config:', err);
    }
    return config;
}
/**
 * Make HTTP GET request to BBSLink server
 */
async function httpGet(host, port, path, timeout) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET',
            timeout: timeout * 1000,
            headers: {
                'Host': host,
                'Connection': 'close'
            }
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
                    resolve(data.substring(bodyStart + 4));
                }
                else {
                    resolve(data);
                }
            });
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('HTTP request timed out'));
        });
        req.end();
    });
}
/**
 * Show the wall
 */
async function showWall(socket, config) {
    try {
        const wallText = await httpGet(config.serverHost, config.httpPort, '/wall.php?action=show', config.timeout);
        socket.emit('ansi-output', '\x1b[2J\x1b[H');
        socket.emit('ansi-output', wallText);
        socket.emit('ansi-output', '\x1b[0m\r\n');
    }
    catch (err) {
        socket.emit('ansi-output', `\r\n\x1b[31mError loading wall: ${err.message}\x1b[0m\r\n`);
    }
}
/**
 * Send authenticated request to server
 */
async function sendToServer(action, data, config, userId) {
    const xkey = randomString(6);
    // Step 1: Get token
    const tokenPath = `/token.php?key=${xkey}`;
    const token = (await httpGet(config.serverHost, config.httpPort, tokenPath, config.timeout)).trim();
    // Step 2: Calculate MD5 hashes
    const authcodemd5 = getMD5(config.authcode + token);
    const schemecodemd5 = getMD5(config.schemecode + token);
    // Step 3: Build request with data
    const dataEncoded = urlEncode(data);
    const scripttype = 'amiexpress-web';
    const scriptver = '1.0.0';
    const requestPath = `/wall.php?action=${action}&key=${xkey}&user=${userId}` +
        `&system=${config.syscode}&auth=${authcodemd5}&scheme=${schemecodemd5}` +
        `&token=${token}&type=${scripttype}&version=${scriptver}&data=${dataEncoded}`;
    const result = await httpGet(config.serverHost, config.httpPort, requestPath, config.timeout);
    return result.trim();
}
/**
 * Get user input
 */
async function getUserInput(socket, bbsSession, prompt, maxLen) {
    return new Promise((resolve) => {
        socket.emit('ansi-output', prompt);
        let input = '';
        const handleInput = (data) => {
            // Handle backspace
            if (data === '\x7f' || data === '\b') {
                if (input.length > 0) {
                    input = input.slice(0, -1);
                    socket.emit('ansi-output', '\b \b');
                }
                return;
            }
            // Handle enter
            if (data === '\r' || data === '\n') {
                delete bbsSession.doorInputHandler;
                socket.emit('ansi-output', '\r\n');
                resolve(input);
                return;
            }
            // Handle regular characters
            if (data.length === 1 && input.length < maxLen) {
                const charCode = data.charCodeAt(0);
                if (charCode >= 32 && charCode <= 126) {
                    input += data;
                    socket.emit('ansi-output', data);
                }
            }
        };
        bbsSession.doorInputHandler = handleInput;
        // Timeout after 5 minutes
        setTimeout(() => {
            delete bbsSession.doorInputHandler;
            resolve(null);
        }, 300000);
    });
}
/**
 * Get yes/no answer
 */
async function getYesNo(socket, bbsSession) {
    return new Promise((resolve) => {
        const handleInput = (data) => {
            const key = data.toLowerCase();
            if (key === 'y') {
                delete bbsSession.doorInputHandler;
                socket.emit('ansi-output', 'Y\r\n');
                resolve(true);
            }
            else if (key === 'n') {
                delete bbsSession.doorInputHandler;
                socket.emit('ansi-output', 'N\r\n');
                resolve(false);
            }
        };
        bbsSession.doorInputHandler = handleInput;
    });
}
/**
 * Wait for key press
 */
async function pause(bbs, promptText = 'press ANY KEY to continue: ') {
    await bbs.getKey(promptText);
}
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket, user, bbsSession, bbs } = ctx;
    try {
        // Load configuration
        const config = loadConfig();
        // Validate required config
        if (!config.syscode) {
            socket.emit('ansi-output', '\r\n\x1b[31mError: syscode missing from bbslink.cfg\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33mPlease configure your BBSLink account settings.\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[33mSign up at: http://www.bbslink.net/\x1b[0m\r\n\r\n');
            await pause(bbs, '\x1b[32mPress any key to continue...\x1b[0m');
            return;
        }
        if (!config.authcode) {
            socket.emit('ansi-output', '\r\n\x1b[31mError: authcode missing from bbslink.cfg\x1b[0m\r\n');
            return;
        }
        if (!config.schemecode) {
            socket.emit('ansi-output', '\r\n\x1b[31mError: schemecode missing from bbslink.cfg\x1b[0m\r\n');
            return;
        }
        const userId = parseInt(user?.id || '0');
        // Display header
        socket.emit('ansi-output', '\x1b[2J\x1b[H');
        socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36m|\\x1b[0m            \\x1b[32mBBSLINK GRAFFITI WALL\\x1b[0m             \\x1b[36m|\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '\r\nReading the wall...\r\n');
        // Show the wall
        await showWall(socket, config);
        // Ask if user wants to write
        socket.emit('ansi-output', '\r\nWrite on the wall (y/n) ');
        const wantsToWrite = await getYesNo(socket, bbsSession);
        if (wantsToWrite) {
            socket.emit('ansi-output', '\x1b[2J\x1b[H');
            socket.emit('ansi-output', '\r\nLooking for your pen - it\'s around here somewhere...\r\n');
            // Get username from server
            let username = await sendToServer('username', '', config, userId);
            // Check for errors
            if (username.startsWith('*xx')) {
                socket.emit('ansi-output', '\r\nSorry, I looked everywhere. Can\'t find it.\r\n');
                socket.emit('ansi-output', 'Oh, and this happened:\r\n    ');
                socket.emit('ansi-output', username.substring(3));
                socket.emit('ansi-output', '\r\n\r\n');
                return;
            }
            // New user registration
            if (username === '*notexist') {
                socket.emit('ansi-output', '\r\n\r\nSo you\'re new here! Choose a name (max 12 characters)\r\n');
                let registered = false;
                while (!registered) {
                    const newUsername = await getUserInput(socket, bbsSession, '\r\n', 12);
                    if (!newUsername) {
                        return; // User disconnected or timed out
                    }
                    socket.emit('ansi-output', '\r\n');
                    const result = await sendToServer('newuser', newUsername, config, userId);
                    if (result === '*created') {
                        socket.emit('ansi-output', `Welcome to the wall, ${newUsername}\r\n`);
                        registered = true;
                    }
                    else if (result === '*inuse') {
                        socket.emit('ansi-output', 'That user name is already in use, choose another!\r\n');
                    }
                    else if (result === '*inval') {
                        socket.emit('ansi-output', 'That user name is invalid, choose another!\r\n');
                    }
                    else {
                        socket.emit('ansi-output', `Unexpected response: ${result}\r\n`);
                        return;
                    }
                }
                // Get username again after registration
                username = await sendToServer('username', '', config, userId);
            }
            // Check username again
            if (username.startsWith('*')) {
                socket.emit('ansi-output', `\r\nSorry, I can't find it :-(\r\n(An error occurred [${username}])\r\n\r\n`);
                return;
            }
            // Get wall post
            socket.emit('ansi-output', `\r\n\r\nWhat's on your mind, ${username} (max 64 characters)\r\n`);
            const wallPost = await getUserInput(socket, bbsSession, '', 64);
            if (!wallPost) {
                return; // User disconnected or timed out
            }
            if (wallPost.length <= 2) {
                socket.emit('ansi-output', '\r\nYour post was too short!\r\n');
            }
            else {
                const postResult = await sendToServer('post', wallPost, config, userId);
                if (postResult === '*post') {
                    socket.emit('ansi-output', 'Post successful!\r\n');
                }
                else if (postResult === '*int') {
                    socket.emit('ansi-output', '\r\nSorry, you have to wait 10 minutes between posts.\r\n');
                }
                else if (postResult === '*inval') {
                    socket.emit('ansi-output', '\r\nYour post contained too many characters (max length 64 chars).\r\n');
                }
                else {
                    socket.emit('ansi-output', '\r\nPost failed :-(\r\n');
                }
            }
            socket.emit('ansi-output', '\r\n\r\n');
            await pause(bbs);
            // Show updated wall
            await showWall(socket, config);
            await pause(bbs);
        }
    }
    catch (err) {
        socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    }
    socket.emit('ansi-output', '\r\n\x1b[32mReturning to menu...\x1b[0m\r\n');
});
exports.default = door;
