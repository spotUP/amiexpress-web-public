"use strict";
/**
 * Telnet Connect Door
 *
 * Allows users to telnet to other BBSes from within this BBS.
 * Ported from Amiga E version.
 *
 * Features:
 * - Configure multiple destination BBSes
 * - Auto-login with saved credentials
 * - Manual connection mode
 *
 * Original: dev/docs/AmiExpressEDoorSources/telnetConnect/telnetdoor.e
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
exports.runDoor = runDoor;
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Load telnet configuration
 */
function loadConfig() {
    const configPath = path.join(process.cwd(), 'doors', 'telnet-connect', 'telnetdoor.cfg');
    const configs = [];
    try {
        if (fs.existsSync(configPath)) {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const lines = fileContent.split('\n');
            let currentConfig = {};
            for (const line of lines) {
                const trimmed = line.trim();
                // Skip comments and empty lines
                if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) {
                    continue;
                }
                // Check for section headers [BBSNAME]
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    // Save previous config if it has required fields
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
            // Add last config
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
/**
 * Display BBS selection menu
 */
function displayMenu(socket, configs) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m           \x1b[32mTELNET CONNECT\x1b[0m                     \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n\r\n');
    if (configs.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo BBSes configured!\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', 'Create doors/telnet-connect/telnetdoor.cfg\r\n');
        socket.emit('ansi-output', 'See telnetdoor.cfg.example for format.\r\n\r\n');
    }
    else {
        socket.emit('ansi-output', '\x1b[33mSelect a BBS to connect to:\x1b[0m\r\n\r\n');
        configs.forEach((config, index) => {
            socket.emit('ansi-output', `  \x1b[36m${index + 1}.\x1b[0m ${config.serverHost}:${config.telnetPort}\r\n`);
        });
        socket.emit('ansi-output', `  \x1b[36mM.\x1b[0m Manual connection\r\n`);
        socket.emit('ansi-output', `  \x1b[36mQ.\x1b[0m Quit\r\n\r\n`);
    }
    socket.emit('ansi-output', '\x1b[33mYour choice:\x1b[0m ');
}
/**
 * Connect to telnet server
 */
async function connectTelnet(ioSocket, config, currentUsername) {
    return new Promise((resolve) => {
        ioSocket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${config.serverHost}:${config.telnetPort}...\x1b[0m\r\n`);
        const telnetSocket = net.createConnection({
            host: config.serverHost,
            port: config.telnetPort,
            timeout: 30000
        });
        const conn = {
            socket: telnetSocket,
            buffer: '',
            connected: false,
            loginSent: false
        };
        // Handle connection established
        telnetSocket.on('connect', () => {
            conn.connected = true;
            ioSocket.emit('ansi-output', `\x1b[32mConnected to ${config.serverHost}!\x1b[0m\r\n\r\n`);
        });
        // Handle incoming data from telnet server
        telnetSocket.on('data', (data) => {
            const text = data.toString('binary');
            conn.buffer += text;
            // Send to user's terminal
            ioSocket.emit('ansi-output', text);
            // Auto-login if configured
            if (config.autoLogin && !conn.loginSent) {
                // Check for username prompt
                if (config.usernamePrompt && conn.buffer.includes(config.usernamePrompt)) {
                    const username = config.username === '#' ? currentUsername : config.username;
                    if (username) {
                        telnetSocket.write(username + '\r\n');
                    }
                }
                // Check for password prompt
                if (config.passwordPrompt && conn.buffer.includes(config.passwordPrompt)) {
                    if (config.password) {
                        telnetSocket.write(config.password + '\r\n');
                        conn.loginSent = true;
                    }
                }
            }
        });
        // Handle user input - forward to telnet server
        const handleInput = (data) => {
            if (conn.connected && !telnetSocket.destroyed) {
                telnetSocket.write(data);
            }
        };
        ioSocket.on('user-input', handleInput);
        // Handle disconnection
        telnetSocket.on('close', () => {
            ioSocket.off('user-input', handleInput);
            ioSocket.emit('ansi-output', '\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
            resolve();
        });
        telnetSocket.on('error', (err) => {
            ioSocket.off('user-input', handleInput);
            ioSocket.emit('ansi-output', `\r\n\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
            resolve();
        });
        telnetSocket.on('timeout', () => {
            ioSocket.off('user-input', handleInput);
            telnetSocket.destroy();
            ioSocket.emit('ansi-output', '\r\n\x1b[31mConnection timed out.\x1b[0m\r\n');
            resolve();
        });
    });
}
/**
 * Get manual connection details from user
 */
async function getManualConnection(socket, bbsSession) {
    return new Promise((resolve) => {
        const config = {};
        let step = 0;
        socket.emit('ansi-output', '\r\n\x1b[33mManual Telnet Connection\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', 'Enter hostname or IP: ');
        const handleInput = (data) => {
            const input = data.trim();
            switch (step) {
                case 0: // Get hostname
                    if (!input) {
                        delete bbsSession.doorInputHandler;
                        resolve(null);
                        return;
                    }
                    config.serverHost = input;
                    socket.emit('ansi-output', `\r\nEnter port (default 23): `);
                    step++;
                    break;
                case 1: // Get port
                    config.telnetPort = parseInt(input) || 23;
                    socket.off('user-input', handleInput);
                    resolve({
                        serverHost: config.serverHost,
                        telnetPort: config.telnetPort,
                        autoLogin: false
                    });
                    break;
            }
        };
        bbsSession.doorInputHandler = handleInput;
    });
}
/**
 * Run Telnet Connect door (TypeScript door interface)
 */
async function runDoor(doorSession) {
    const { socket, user, bbsSession } = doorSession;
    const configs = loadConfig();
    let running = true;
    while (running) {
        displayMenu(socket, configs);
        // Wait for user selection
        const choice = await new Promise((resolve) => {
            const handleInput = (data) => {
                delete bbsSession.doorInputHandler;
                resolve(data.trim().toUpperCase());
            };
            bbsSession.doorInputHandler = handleInput;
        });
        if (choice === 'Q' || !choice) {
            running = false;
            break;
        }
        if (choice === 'M') {
            // Manual connection
            const manualConfig = await getManualConnection(socket, bbsSession);
            if (manualConfig) {
                await connectTelnet(socket, manualConfig, user?.username || 'Guest');
            }
        }
        else {
            // Numeric selection
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < configs.length) {
                await connectTelnet(socket, configs[index], user?.username || 'Guest');
            }
            else {
                socket.emit('ansi-output', '\r\n\x1b[31mInvalid selection.\x1b[0m\r\n');
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }
    socket.emit('ansi-output', '\r\n\x1b[32mReturning to menu...\x1b[0m\r\n');
}
