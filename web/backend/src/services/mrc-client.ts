/**
 * MRC Client Multiplexer
 *
 * Background daemon that maintains persistent connection to MRC server
 * and relays messages between the server and connected BBS door clients.
 *
 * Port of mrc_client.e from MultiRelayChat by Stackfault/Phenom Productions
 * Ported to TypeScript for AmiExpress-Web
 *
 * Usage: node mrc-client.js <hostname> <port>
 * Example: node mrc-client.js mrc.bottomlessabyss.net 5000
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../utils/date-time.util';

const VERSION = '1.2.9';
const PLATFORM_NAME = 'AMIEXPRESS-WEB';
const SYSTEM_NAME = 'Node.js';
const MACHINE_ARCH = 'TypeScript';
const DEBUG_FLAG = false;

interface UserConnection {
  userName: string;
  socket: net.Socket;
}

interface Config {
  bbsName: string;
  infoWeb: string;
  infoTelnet: string;
  infoSSH: string;
  infoSysop: string;
  infoDesc: string;
}

let mrcserver: net.Socket | null = null;
let listenSock: net.Server | null = null;
let clients: UserConnection[] = [];
let config: Config;
let mrcStats = '';
let latency = '???';
let restart = false;

const versionString = `${PLATFORM_NAME}/${SYSTEM_NAME}.${MACHINE_ARCH}/${VERSION}`;
const clientVersion = `Multi Relay Chat Client v${VERSION} [sf]`;

function logger(message: string): void {
  const now = getSystemTime();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
console.log(`${timestamp}  ${message.trim()}`);

  if (DEBUG_FLAG) {
    const logFile = path.join(process.cwd(), 'mrcchat.dbg');
    fs.appendFileSync(logFile, `${timestamp} ${message.trim()}\n`);
  }
}

function strip(str: string): string {
  return str.trim();
}

function readConfiguration(): Config {
  const configPath = path.join(process.cwd(), 'doors', 'mrc-client', 'mrc_client.cfg');

  const cfg: Config = {
    bbsName: 'Unconfigured BBS',
    infoWeb: 'Unconfigured BBS',
    infoTelnet: 'Unconfigured BBS',
    infoSSH: 'Unconfigured BBS',
    infoSysop: 'Unconfigured BBS',
    infoDesc: 'Unconfigured BBS'
  };

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.includes('=')) {
        const [keyPart, valuePart] = line.split('=');
        const key = strip(keyPart).toUpperCase();
        const value = strip(valuePart);

        switch (key) {
          case 'BBSNAME': cfg.bbsName = value; break;
          case 'INFO_WEB': cfg.infoWeb = value; break;
          case 'INFO_TELNET': cfg.infoTelnet = value; break;
          case 'INFO_SSH': cfg.infoSSH = value; break;
          case 'INFO_SYSOP': cfg.infoSysop = value; break;
          case 'INFO_DESC': cfg.infoDesc = value; break;
        }
      }
    }
  }

  return cfg;
}

function checkSeparator(data: string): string {
  if (data.includes('\r\n')) return '\r\n';
  if (data.includes('\n\r')) return '\n\r';
  if (data.includes('\r')) return '\r';
  return '\n';
}

function splitBuffer(buffer: string, sep: string): string[] {
  if (buffer.length === 0) return [];
  return buffer.split(sep).filter(s => s.length > 0);
}

function chatlog(data: string): void {
  if (data.includes('CLIENT~') || data.includes('SERVER~')) return;

  const packet = splitBuffer(data, '~');
  if (packet.length > 6) {
    const message = packet[6];
    const now = getSystemTime();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const logFile = path.join(process.cwd(), 'mrcchat.log');
    fs.appendFileSync(logFile, `${timestamp} ${message}\n`);
  }
}

function sendServer(data: string): void {
  if (!mrcserver || !data) return;

  let dataToSend = data;
  if (!dataToSend.endsWith('\n')) {
    dataToSend += '\n';
  }

  try {
    mrcserver.write(dataToSend);
  } catch (err) {
    logger(`Connection error: ${err}`);
    if (mrcserver) {
      mrcserver.destroy();
      mrcserver = null;
    }
  }
}

function deliverMrc(serverData: string): void {
  const packet = splitBuffer(serverData, '~');
  if (packet.length < 7) {
    logger(`Bad packet: ${serverData}`);
    return;
  }

  const [fromuser, fromsite, fromroom, touser, tosite, toroom, message] = packet;

  if (DEBUG_FLAG) {
    logger(`IN: ${serverData}`);
  }

  const msgLower = message.toLowerCase();

  // Manage server PINGs
  if (fromuser === 'SERVER' && msgLower === 'ping') {
    sendImAlive();
    return;
  }

  // Manage update notifications
  if (fromuser === 'SERVER' && message.startsWith('NEWUPDATE:')) {
    logger('Upgrade is available, consider upgrading at your earliest convenience');
    logger(`You are using version ${VERSION}`);
    const parts = message.split(':');
    if (parts.length > 1) {
      logger(`Latest version is ${parts[1]}`);
    }
    return;
  }

  // Manage old clients
  if (fromuser === 'SERVER' && message.startsWith('OLDVERSION:')) {
    logger('Your client is too old and can no longer be used.');
    logger(`You are using version ${VERSION}`);
    const parts = message.split(':');
    if (parts.length > 1) {
      logger(`Latest version is ${parts[1]}`);
    }
    process.exit(1);
  }

  // Manage server stats
  if (fromuser === 'SERVER' && message.startsWith('STATS:')) {
    const statsFile = path.join(process.cwd(), 'mrcstats.dat');
    const parts = message.split(':');
    if (parts.length > 1) {
      fs.writeFileSync(statsFile, parts[1]);
      mrcStats = parts[1];
    }
  }

  chatlog(serverData);

  // Deliver to all connected clients
  for (const userConn of clients) {
    if (touser !== 'NOTME' || fromuser !== userConn.userName) {
      let dataToSend = serverData;
      if (!dataToSend.endsWith('\n')) {
        dataToSend += '\n';
      }
      try {
        userConn.socket.write(dataToSend);
      } catch (err) {
        // Socket write error, will be removed on next iteration
      }
    }
  }
}

function sendImAlive(): void {
  const data = `CLIENT~${config.bbsName}~~SERVER~~~IMALIVE:${config.bbsName}~`;
  sendServer(data);
}

function sendShutdown(): void {
  const data = `CLIENT~${config.bbsName}~~SERVER~~~SHUTDOWN~`;
  sendServer(data);
}

function requestStats(): void {
  const data = `CLIENT~${config.bbsName}~~SERVER~~~STATS~`;
  sendServer(data);
}

function sendBbsInfo(): void {
  const prefix = `CLIENT~${config.bbsName}~~SERVER~ALL~~`;
  let packet = '';
  packet += `${prefix}INFOWEB:${config.infoWeb}~\n`;
  packet += `${prefix}INFOTEL:${config.infoTelnet}~\n`;
  packet += `${prefix}INFOSSH:${config.infoSSH}~\n`;
  packet += `${prefix}INFOSYS:${config.infoSysop}~\n`;
  packet += `${prefix}INFODSC:${config.infoDesc}~\n`;
  sendServer(packet);
}

function removeClient(socket: net.Socket): void {
  const index = clients.findIndex(c => c.socket === socket);
  if (index !== -1) {
    const userConn = clients[index];
    if (userConn.userName.length > 0) {
      const data = `${userConn.userName}~~~SERVER~~~LOGOFF~`;
      deliverMrc(data);
      sendServer(data);
    }
    try {
      userConn.socket.destroy();
    } catch (err) {
      // Ignore
    }
    clients.splice(index, 1);
  }
}

function handleClientData(userConn: UserConnection, data: Buffer): void {
  const dataStr = data.toString('utf-8');
  const sep = checkSeparator(dataStr);
  const packets = splitBuffer(dataStr, sep);

  for (const packet of packets) {
    const tildeCount = (packet.match(/~/g) || []).length;
    if (tildeCount < 6) {
      if (DEBUG_FLAG) {
        logger(`invalid packet: ${packet}`);
      }
      continue;
    }

    const parts = splitBuffer(packet, '~');
    if (parts.length < 7) continue;

    const [fromuser, frombbs, , touser, , , message] = parts;

    if (userConn.userName.length === 0) {
      userConn.userName = fromuser;
    }

    if (message === 'VERSION') {
      const response = `CLIENT~~~${fromuser}~${frombbs}~~|07- ${clientVersion}~`;
      deliverMrc(response);
      sendServer(packet);
    } else if (touser === 'CLIENT' && message === 'LATENCY') {
      const response = `SERVER~~~CLIENT~${frombbs}~~LATENCY:${latency}~`;
      deliverMrc(response);
    } else if (touser === 'CLIENT' && message === 'STATS') {
      const response = `SERVER~~~CLIENT~${frombbs}~~STATS:${mrcStats}~`;
      deliverMrc(response);
    } else {
      sendServer(packet);
    }

    if (DEBUG_FLAG) {
      logger(`OUT: ${packet}`);
    }
  }
}

function openListenSocket(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('connection', (socket: net.Socket) => {
      if (clients.length >= 100) {
        logger('Max client connections reached. Not accepting connection');
        socket.destroy();
        return;
      }

      const userConn: UserConnection = {
        userName: '',
        socket
      };
      clients.push(userConn);

      socket.on('data', (data) => {
        handleClientData(userConn, data);
      });

      socket.on('error', (err) => {
        logger(`Client socket error: ${err.message}`);
        removeClient(socket);
      });

      socket.on('close', () => {
        removeClient(socket);
      });

      socket.on('end', () => {
        removeClient(socket);
      });
    });

    server.on('error', (err: any) => {
      logger(`Error creating listening socket: ${err.message}`);
      reject(err);
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}

async function mainproc(host: string, port: number, listenPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    mrcserver = new net.Socket();
    let readBuffer = '';
    let loop = 0;

    mrcserver.on('connect', () => {
      logger(`Connected to Multi Relay Chat host ${host} port ${port}`);

      const initMsg = `${config.bbsName}~${versionString}`;
      mrcserver!.write(initMsg);

      sendBbsInfo();
      sendImAlive();
    });

    mrcserver.on('data', (data) => {
      readBuffer += data.toString('utf-8');
      const sep = checkSeparator(readBuffer);
      const packets = splitBuffer(readBuffer, sep);

      if (readBuffer.endsWith(sep)) {
        readBuffer = '';
      } else {
        const lastNewline = readBuffer.lastIndexOf(sep);
        if (lastNewline !== -1) {
          readBuffer = readBuffer.substring(lastNewline + sep.length);
        }
      }

      for (const packet of packets) {
        if (packet.length > 0) {
          deliverMrc(packet);
        }
      }
    });

    mrcserver.on('error', (err) => {
      logger(`unexpected error reading server connection: ${err.message}`);
      restart = true;
      resolve();
    });

    mrcserver.on('close', () => {
      logger('Lost connection to server');
      restart = true;
      resolve();
    });

    mrcserver.on('end', () => {
      logger('Server ended connection');
      restart = true;
      resolve();
    });

    // Connect to MRC server
    mrcserver.connect(port, host, () => {
      // Connected - handler above will fire
    });

    // Periodic tasks
    const statsInterval = setInterval(() => {
      loop++;
      if (loop > 100) {
        requestStats();
        loop = 0;
      }
    }, 100);

    // Cleanup on exit
    const cleanup = () => {
      clearInterval(statsInterval);
      if (mrcserver) {
        mrcserver.destroy();
        mrcserver = null;
      }
    };

    process.on('SIGINT', () => {
      logger('Shutting down');
      sendShutdown();
      cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger('Shutting down');
      sendShutdown();
      cleanup();
      process.exit(0);
    });
  });
}

function checkStartup(): boolean {
  const params = [
    config.infoWeb,
    config.infoTelnet,
    config.infoSSH,
    config.infoSysop,
    config.infoDesc
  ];

  let failed = false;

  if (config.bbsName.length < 5) {
console.log("Config: 'bbsname' should be set to something sensible");
    failed = true;
  }

  if (config.bbsName.length > 40) {
console.log("Config: 'bbsname' cannot be longer than 40 characters after PIPE codes evaluation");
    failed = true;
  }

  for (const param of params) {
    if (param.length > 64) {
console.log(`Config: '${param}' cannot be longer than 64 characters`);
      failed = true;
    }
  }

  if (failed) {
console.log('This must be fixed in mrc_client.cfg');
  }

  return !failed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
console.log('run this with your machine hostname, port as a parameter');
console.log('node mrc-client.js <hostname> <port>');
    process.exit(1);
  }

  const host = args[0];
  const port = parseInt(args[1], 10);

  if (isNaN(port)) {
console.log('Port must be a number');
    process.exit(1);
  }

  logger(VERSION);

  config = readConfiguration();

  if (!checkStartup()) {
    process.exit(1);
  }

  const intv = [1, 2, 5, 10, 30, 60, 120, 180, 240, 300];
  let delay = 0;

  try {
    listenSock = await openListenSocket(5000);
    logger('Listening on port 5000 for door connections');
  } catch (err: any) {
    logger(`Failed to open listen socket: ${err.message}`);
    process.exit(1);
  }

  // Auto-restart loop
  while (true) {
    restart = false;
    await mainproc(host, port, 5000);

    if (restart) {
      logger(`Reconnecting in ${intv[delay]} seconds`);
      await new Promise(resolve => setTimeout(resolve, intv[delay] * 1000));
      delay++;
      if (delay > 9) delay = 0;
    } else {
      break;
    }
  }

  // Cleanup
  if (listenSock) {
    listenSock.close();
  }

  for (const client of clients) {
    try {
      client.socket.destroy();
    } catch (err) {
      // Ignore
    }
  }

  const statsFile = path.join(process.cwd(), 'mrcstats.dat');
  if (fs.existsSync(statsFile)) {
    fs.unlinkSync(statsFile);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    logger(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

export { main as runMrcClient };
