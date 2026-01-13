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

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import * as net from 'net';

export const metadata = {
  name: 'BBSLink',
  version: '1.0.0',
  author: 'AmiExpress Team (port from Darren Coles)',
  description: 'InterBBS games client - play LORD, Trade Wars, and more!',
  minSecurityLevel: 10,
  command: 'LINKMENU',
  category: 'Games'
};

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
    if (!fs.existsSync(configPath)) return;
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const lines = fileContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) continue;
      if (!trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const value = fullTrim(valueParts.join('='));
      const upperKey = fullTrim(key).toUpperCase();
      switch (upperKey) {
        case 'SERVERHOST': config.serverHost = value; break;
        case 'TELNETPORT': config.telnetPort = parseInt(value) || 23; break;
        case 'HTTPPORT': config.httpPort = parseInt(value) || 80; break;
        case 'TIMEOUT': config.timeout = parseInt(value) || 10; break;
        case 'SYSCODE': config.syscode = value; break;
        case 'AUTHCODE': config.authcode = value; break;
        case 'SCHEMECODE': config.schemecode = value; break;
        case 'DOORCODE': config.doorcode = value; break;
        default:
          if (doorCode && upperKey === doorCode.toUpperCase()) config.doorcode = value;
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
function httpGet(host: string, port: number, path: string, timeout: number): Promise<string> {
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
async function connectToGame(socket: any, config: BBSLinkConfig, userSlot: number, bbsSession: any): Promise<void> {
  return new Promise((resolve) => {
    socket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${config.serverHost}:${config.telnetPort}...\x1b[0m\r\n`);
    const telnetSocket = net.createConnection({ host: config.serverHost, port: config.telnetPort, timeout: 30000 });
    let connected = false;
    telnetSocket.on('connect', () => {
      connected = true;
      socket.emit('ansi-output', `\x1b[32mConnected! Loading game...\x1b[0m\r\n\r\n`);
    });
    telnetSocket.on('data', (data: Buffer) => socket.emit('ansi-output', data.toString('binary')));
    telnetSocket.on('error', (err) => {
      socket.emit('ansi-output', `\r\n\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
      resolve();
    });
    telnetSocket.on('close', () => {
      socket.emit('ansi-output', '\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
      resolve();
    });
    const inputHandler = (data: string) => {
      if (connected && !telnetSocket.destroyed) telnetSocket.write(data);
    };
    bbsSession.doorInputHandler = inputHandler;
  });
}

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const { socket, user, bbsSession, params } = ctx;
  try {
    let doorCodeParam = params?.[0]?.trim().toUpperCase();
    const config: BBSLinkConfig = { serverHost: 'games.bbslink.net', httpPort: 80, telnetPort: 23, timeout: 10, syscode: '', authcode: '', schemecode: '' };
    const progdirConfig = path.join(process.cwd(), 'Doors', 'bbslink', 'bbslink.cfg');
    parseConfigFile(progdirConfig, config, doorCodeParam);
    const doorCode = (doorCodeParam || config.doorcode || 'MENU').toLowerCase();
    if (!config.syscode || !config.authcode || !config.schemecode) throw new Error('syscode/authcode/schemecode missing from bbslink.cfg');
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
  } catch (err: any) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
  }
});

export default door;
