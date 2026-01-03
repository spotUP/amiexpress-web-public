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

import { Socket as SocketIOSocket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import * as net from 'net';

interface BBSLinkConfig {
  serverHost: string;
  httpPort: number;
  telnetPort: number;
  timeout: number;
  syscode: string;
  authcode: string;
  schemecode: string;
  doorcode?: string;
  [key: string]: string | number | undefined;
}

interface TelnetConnection {
  socket: net.Socket;
  buffer: string;
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
 * Trim spaces from both ends of string
 */
function fullTrim(str: string): string {
  let result = str.trim();

  // Remove trailing spaces
  while (result.length > 0 && result[result.length - 1] === ' ') {
    result = result.substring(0, result.length - 1);
  }

  return result;
}

/**
 * Parse bbslink.cfg file
 */
function parseConfigFile(configPath: string, config: BBSLinkConfig, doorCode?: string): void {
  try {
    if (!fs.existsSync(configPath)) {
      return;
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) {
        continue;
      }

      if (!trimmed.includes('=')) continue;

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
          // Check if it matches the doorCode parameter
          if (doorCode && upperKey === doorCode.toUpperCase()) {
            config.doorcode = value;
          }
          break;
      }
    }
  } catch (err) {
    console.error('[BBSLink] Error parsing config:', err);
  }
}

/**
 * HTTP GET request
 */
function httpGet(
  host: string,
  port: number,
  path: string,
  timeout: number
): Promise<string> {
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
        resolve(data);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Connect to BBSLink game server
 */
async function connectToGame(
  ioSocket: SocketIOSocket,
  config: BBSLinkConfig,
  userSlot: number
): Promise<void> {
  return new Promise((resolve) => {
    ioSocket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${config.serverHost}:${config.telnetPort}...\x1b[0m\r\n`);

    const telnetSocket = net.createConnection({
      host: config.serverHost,
      port: config.telnetPort,
      timeout: 30000
    });

    const conn: TelnetConnection = {
      socket: telnetSocket,
      buffer: '',
      connected: false
    };

    // Handle connection established
    telnetSocket.on('connect', () => {
      conn.connected = true;
      ioSocket.emit('ansi-output', `\x1b[32mConnected! Loading game...\x1b[0m\r\n\r\n`);
    });

    // Handle incoming data from game server
    telnetSocket.on('data', (data: Buffer) => {
      const text = data.toString('binary');
      conn.buffer += text;

      // Send to user's terminal
      ioSocket.emit('ansi-output', text);
    });

    // Handle errors
    telnetSocket.on('error', (err) => {
      console.error('[BBSLink] Telnet error:', err);
      ioSocket.emit('ansi-output', `\r\n\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
      resolve();
    });

    // Handle connection closed
    telnetSocket.on('close', () => {
      ioSocket.emit('ansi-output', '\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
      resolve();
    });

    // Forward user input to game server
    const inputHandler = (data: { text: string }) => {
      if (conn.connected && !telnetSocket.destroyed) {
        telnetSocket.write(data.text);
      }
    };

    ioSocket.on('door-input', inputHandler);

    // Cleanup on disconnect
    telnetSocket.on('close', () => {
      ioSocket.removeListener('door-input', inputHandler);
    });
  });
}

/**
 * Main door entry point
 */
export async function runDoor(session: any): Promise<void> {
  const socket = session.socket;
  const user = session.user;

  try {
    // Parse door parameters (e.g., "LINKMENU LUNA" -> doorCode = "LUNA")
    const params = session.params || [];
    let doorCodeParam: string | undefined;

    if (params.length > 0) {
      doorCodeParam = params[0].trim().toUpperCase();
    }

    // Load configuration
    const config: BBSLinkConfig = {
      serverHost: 'games.bbslink.net',
      httpPort: 80,
      telnetPort: 23,
      timeout: 10,
      syscode: '',
      authcode: '',
      schemecode: ''
    };

    // Try both config locations (PROGDIR: and current dir)
    const progdirConfig = path.join(process.cwd(), 'doors', 'bbslink', 'bbslink.cfg');
    const currentDirConfig = path.join(process.cwd(), 'bbslink.cfg');

    parseConfigFile(progdirConfig, config, doorCodeParam);
    parseConfigFile(currentDirConfig, config, doorCodeParam);

    // Use door code parameter if provided, otherwise use config or default to MENU
    const doorCode = (doorCodeParam || config.doorcode || 'MENU').toLowerCase();

    // Validate required config
    if (!config.syscode) {
      throw new Error('syscode entry missing from bbslink.cfg');
    }
    if (!config.authcode) {
      throw new Error('authcode entry missing from bbslink.cfg');
    }
    if (!config.schemecode) {
      throw new Error('schemecode entry missing from bbslink.cfg');
    }

    // Generate session key
    const xkey = randomString(6);
    const scripttype = 'ami-express';
    const scriptver = '0.1.beta';

    // Get authentication token
    socket.emit('ansi-output', '\x1b[36mAuthenticating with BBSLink...\x1b[0m\r\n');

    let token: string;
    try {
      const tokenResponse = await httpGet(
        config.serverHost,
        config.httpPort,
        `/token.php?key=${xkey}`,
        config.timeout
      );
      token = tokenResponse.trim();
    } catch (err: any) {
      throw new Error(`Failed to get authentication token: ${err.message}`);
    }

    // Calculate MD5 hashes
    const authcodemd5 = getMD5(config.authcode + token);
    const schemecodemd5 = getMD5(config.schemecode + token);

    // Get user slot number
    const userSlot = user?.nodeNumber || 1;

    // Get terminal rows (default to 24 if not available)
    const rows = 24;

    // Authenticate with BBSLink
    const authPath = `/auth.php?key=${xkey}&user=${userSlot}&system=${config.syscode}` +
      `&auth=${authcodemd5}&scheme=${schemecodemd5}&rows=${rows}` +
      `&door=${doorCode}&token=${token}&type=${scripttype}&version=${scriptver}`;

    try {
      await httpGet(config.serverHost, config.httpPort, authPath, config.timeout);
    } catch (err: any) {
      throw new Error(`Authentication failed: ${err.message}`);
    }

    socket.emit('ansi-output', '\x1b[32mAuthenticated!\x1b[0m\r\n');

    // Connect to game server via telnet
    await connectToGame(socket, config, userSlot);

  } catch (err: any) {
    console.error('[BBSLink] Error:', err);
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
  }
}

export const metadata = {
  name: 'BBSLink',
  version: '1.0.0',
  author: 'AmiExpress Team (port from Darren Coles)',
  description: 'InterBBS games client - play LORD, Trade Wars, and more!',
  minSecurityLevel: 10,
  command: 'LINKMENU',
  category: 'Games'
};

export default { runDoor, metadata };
