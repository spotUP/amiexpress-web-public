/**
 * BBSLink Door - InterBBS Games Client
 *
 * Connects to BBSLink.net server to play classic BBS door games.
 * Ported from Amiga E version.
 *
 * Features:
 * - Connect to BBSLink.net InterBBS games server
 * - Play classic doors: LORD, Trade Wars 2002, Operation Overkill, etc.
 * - MD5-based authentication
 * - Token-based session management
 *
 * Requirements:
 * - BBSLink.net account (free registration at http://www.bbslink.net/)
 * - syscode, authcode, and schemecode from BBSLink
 *
 * Original: dev/docs/AmiExpressEDoorSources/BBSLink/bbslink.e
 */

import { Socket as SocketIOSocket } from 'socket.io';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';

interface BBSLinkConfig {
  serverHost: string;
  httpPort: number;
  telnetPort: number;
  timeout: number;
  syscode: string;
  authcode: string;
  schemecode: string;
  doorcode: string;
  [key: string]: any;
}

interface TelnetConnection {
  socket: net.Socket;
  connected: boolean;
}

/**
 * Generate random string for session key
 */
function randomString(length: number): string {
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
function getMD5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Load BBSLink configuration
 */
function loadConfig(commandParam?: string): BBSLinkConfig {
  const configPath = path.join(process.cwd(), 'doors', 'bbslink', 'bbslink.cfg');

  const config: BBSLinkConfig = {
    serverHost: 'games.bbslink.net',
    httpPort: 80,
    telnetPort: 23,
    timeout: 10,
    syscode: process.env.BBSLINK_SYSCODE || '',
    authcode: process.env.BBSLINK_AUTHCODE || '',
    schemecode: process.env.BBSLINK_SCHEMECODE || '',
    doorcode: commandParam || 'MENU'
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
        if (eqIndex === -1) continue;

        const key = trimmed.substring(0, eqIndex).trim().toLowerCase();
        const value = trimmed.substring(eqIndex + 1).trim();

        switch (key) {
          case 'serverhost':
            config.serverHost = value;
            break;
          case 'telnetport':
            config.telnetPort = parseInt(value) || 23;
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
          case 'doorcode':
            if (!commandParam) config.doorcode = value;
            break;
          default:
            // Store game-specific codes (lord, tw2002, etc.)
            config[key] = value;
            break;
        }
      }
    }
  } catch (err) {
    console.error('[BBSLink] Error loading config:', err);
  }

  // Check if command param maps to a game code
  if (commandParam && config[commandParam.toLowerCase()]) {
    config.doorcode = config[commandParam.toLowerCase()];
  }

  return config;
}

/**
 * Make HTTP GET request to BBSLink server
 */
async function httpGet(host: string, port: number, path: string, timeout: number): Promise<string> {
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
        } else {
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
 * Connect to BBSLink telnet server
 */
async function connectTelnet(
  ioSocket: SocketIOSocket,
  host: string,
  port: number,
  timeout: number
): Promise<void> {
  return new Promise((resolve) => {
    ioSocket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${host}:${port}...\x1b[0m\r\n`);

    const telnetSocket = net.createConnection({
      host: host,
      port: port,
      timeout: timeout * 1000
    });

    const conn: TelnetConnection = {
      socket: telnetSocket,
      connected: false
    };

    // Handle connection established
    telnetSocket.on('connect', () => {
      conn.connected = true;
      ioSocket.emit('ansi-output', `\x1b[32mConnected to BBSLink!\\x1b[0m\r\n\r\n`);
    });

    // Handle incoming data from telnet server
    telnetSocket.on('data', (data: Buffer) => {
      const text = data.toString('binary');
      ioSocket.emit('ansi-output', text);
    });

    // Handle user input - forward to telnet server
    const handleInput = (data: string) => {
      if (conn.connected && !telnetSocket.destroyed) {
        telnetSocket.write(data);
      }
    };

    ioSocket.on('user-input', handleInput);

    // Handle disconnection
    telnetSocket.on('close', () => {
      ioSocket.off('user-input', handleInput);
      ioSocket.emit('ansi-output', '\r\n\x1b[33mDisconnected from BBSLink.\x1b[0m\r\n');
      resolve();
    });

    telnetSocket.on('error', (err: Error) => {
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
 * Run BBSLink door (TypeScript door interface)
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  try {
    // Get command parameter if provided
    const commandLine = bbsSession?.tempData?.commandLine || '';
    const parts = commandLine.split(' ');
    const commandParam = parts.length > 1 ? parts[1].toUpperCase() : undefined;

    // Load configuration
    const config = loadConfig(commandParam);

    // Validate required config
    if (!config.syscode) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: syscode missing from bbslink.cfg\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33mPlease configure your BBSLink account settings.\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33mSign up at: http://www.bbslink.net/\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
      await new Promise<void>((resolve) => {
        socket.once('user-input', () => resolve());
      });
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

    // Display connecting message
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m              \x1b[32mBBSLINK DOOR CLIENT\x1b[0m              \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', `\x1b[33mGame:\x1b[0m ${config.doorcode.toUpperCase()}\r\n`);
    socket.emit('ansi-output', `\x1b[33mServer:\x1b[0m ${config.serverHost}\r\n\r\n`);

    // Generate session key
    const xkey = randomString(6);
    const scripttype = 'amiexpress-web';
    const scriptver = '1.0.0';

    // Step 1: Get token
    socket.emit('ansi-output', '\x1b[36mAuthenticating with BBSLink...\x1b[0m\r\n');

    let token: string;
    try {
      const tokenPath = `/token.php?key=${xkey}`;
      token = await httpGet(config.serverHost, config.httpPort, tokenPath, config.timeout);
      token = token.trim();
    } catch (err: any) {
      socket.emit('ansi-output', `\r\n\x1b[31mError getting token: ${err.message}\x1b[0m\r\n`);
      return;
    }

    // Step 2: Calculate MD5 hashes
    const authcodemd5 = getMD5(config.authcode + token);
    const schemecodemd5 = getMD5(config.schemecode + token);

    // Step 3: Authenticate
    const userId = user?.id || 0;
    const rows = 24; // Terminal rows

    try {
      const authPath = `/auth.php?key=${xkey}&user=${userId}&system=${config.syscode}` +
        `&auth=${authcodemd5}&scheme=${schemecodemd5}&rows=${rows}` +
        `&door=${config.doorcode}&token=${token}&type=${scripttype}&version=${scriptver}`;

      const authResponse = await httpGet(config.serverHost, config.httpPort, authPath, config.timeout);

      // Check for error response
      if (authResponse.includes('ERROR')) {
        socket.emit('ansi-output', `\r\n\x1b[31mAuthentication failed: ${authResponse}\x1b[0m\r\n`);
        return;
      }
    } catch (err: any) {
      socket.emit('ansi-output', `\r\n\x1b[31mError authenticating: ${err.message}\x1b[0m\r\n`);
      return;
    }

    socket.emit('ansi-output', '\x1b[32mAuthentication successful!\x1b[0m\r\n');

    // Step 4: Connect via telnet
    await connectTelnet(socket, config.serverHost, config.telnetPort, config.timeout);

  } catch (err: any) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
  }

  socket.emit('ansi-output', '\r\n\x1b[32mReturning to menu...\x1b[0m\r\n');
}
