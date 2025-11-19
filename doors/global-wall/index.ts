import { Socket as SocketIOSocket } from 'socket.io';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import * as net from 'net';
import * as http from 'http';

// Constants
const BUFSIZE = 8192;
const MAXSTYLE = 4;
const MAXPRESET = 2;
const SYSOPLEVEL = 255;
const DEFAULTSTYLE = 4;
const COLOURPRESETLEN = 14;

enum DataPoint {
  DP_USERNAME = 0,
  DP_SOURCE = 1,
  DP_BBSSHORTCODE = 2,
  DP_COMMENT = 3
}

interface SettingsData {
  sysoplevel: number;
  style: number;
  screenheight: number;
  mybbsshortcode: string;
  coloursettings: string;
  gridcolour: string;
  titlecolour: string;
  headingcolour: string;
  authorcolour: string;
  sysoptitlecolour: string;
  sysopmenuitemscolour: string;
  bbsshortcodecolour: string;
  commentdefaultcolour: string;
  showbbskeycolour: string;
  bbskeymaincolour: string;
  textcolour: string;
  textcolourYN: string;
  choosecolourheader: string;
  radiationheadercolour: string;
  node: string;
}

interface BBSItem {
  bbsName: string;
  bbsShortCode: string;
}

interface WallItem {
  id: string;
  username: string;
  source: string;
  comment: string;
  bbsshortcode: string;
}

interface GlobalWallConfig {
  serverHost: string;
  serverPort: number;
  timeout: number;
  debugLog: string;
  tempFile: string;
}

let serverHost = 'scenewall.bbs.io';
let serverPort = 1541;
let timeout = 10;
let debugLogFile = '';
let tempFile = 'T:jsondata';

const colourpresets = ['42626717772363', '32656717772363'];
let settings: SettingsData;
let bbsList: BBSItem[] = [];
let wallItems: WallItem[] = [];

function fullTrim(src: string): string {
  let temp = src.trim();
  while (temp.length > 0 && temp[temp.length - 1] === ' ') {
    temp = temp.slice(0, -1);
  }
  return temp;
}

function getSystemTime(): number {
  return Math.floor(Date.now() / 1000);
}

function debugLog(str: string): void {
  if (debugLogFile.length > 0) {
    try {
      const currTime = getSystemTime();
      const logline = `${currTime} ${str}\n`;
      writeFileSync(debugLogFile, logline, { flag: 'a' });
    } catch (err) {
      // Ignore errors
    }
  }
}

function parseConfigFile(configFileName: string): GlobalWallConfig {
  const config: GlobalWallConfig = {
    serverHost: 'scenewall.bbs.io',
    serverPort: 1541,
    timeout: 10,
    debugLog: '',
    tempFile: 'T:jsondata'
  };

  if (existsSync(configFileName)) {
    try {
      const content = readFileSync(configFileName, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(';') || trimmed.length === 0) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx >= 0) {
          const key = fullTrim(trimmed.substring(0, eqIdx)).toUpperCase();
          const value = fullTrim(trimmed.substring(eqIdx + 1));

          if (key === 'SERVERHOST') config.serverHost = value;
          else if (key === 'SERVERPORT') config.serverPort = parseInt(value, 10);
          else if (key === 'TIMEOUT') config.timeout = parseInt(value, 10);
          else if (key === 'DEBUGLOG') config.debugLog = value;
          else if (key === 'TEMPFILE') config.tempFile = value;
        }
      }
    } catch (err) {
      console.error('Error parsing config file:', err);
    }
  }

  return config;
}

const repoRoot =
  process.env.BBS_ROOT ||
  path.resolve(process.cwd(), '..', '..');
const doorRoot = path.join(repoRoot, 'doors', 'global-wall');

function ensureDoorConfigDir(): void {
  try {
    mkdirSync(doorRoot, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function getDoorConfigPaths(): { progdirCfg: string; localCfg: string } {
  return {
    progdirCfg: path.join(doorRoot, 'GWALL.cfg'),
    localCfg: path.join(repoRoot, 'GWALL.cfg'),
  };
}

function loadConfig(): void {
  ensureDoorConfigDir();
  const { progdirCfg, localCfg } = getDoorConfigPaths();

  let config = parseConfigFile(progdirCfg);
  if (existsSync(localCfg)) {
    const localConfig = parseConfigFile(localCfg);
    if (localConfig.serverHost) config.serverHost = localConfig.serverHost;
    if (localConfig.serverPort) config.serverPort = localConfig.serverPort;
    if (localConfig.timeout) config.timeout = localConfig.timeout;
    if (localConfig.debugLog) config.debugLog = localConfig.debugLog;
    if (localConfig.tempFile) config.tempFile = localConfig.tempFile;
  }

  serverHost = config.serverHost;
  serverPort = config.serverPort;
  timeout = config.timeout;
  debugLogFile = config.debugLog;
  tempFile = config.tempFile;
}

function encodeAnsiColour(colourValue: string): string {
  const colourNum = parseInt(colourValue, 10) + 30;
  return `\x1b[${colourNum}m`;
}

function applyColours(): void {
  settings.gridcolour = encodeAnsiColour(settings.coloursettings[0] || '4');
  settings.titlecolour = encodeAnsiColour(settings.coloursettings[1] || '2');
  settings.headingcolour = encodeAnsiColour(settings.coloursettings[2] || '6');
  settings.authorcolour = encodeAnsiColour(settings.coloursettings[3] || '2');
  settings.sysoptitlecolour = encodeAnsiColour(settings.coloursettings[4] || '6');
  settings.sysopmenuitemscolour = encodeAnsiColour(settings.coloursettings[5] || '7');
  settings.bbsshortcodecolour = encodeAnsiColour(settings.coloursettings[6] || '1');
  settings.commentdefaultcolour = encodeAnsiColour(settings.coloursettings[7] || '7');
  settings.showbbskeycolour = encodeAnsiColour(settings.coloursettings[8] || '7');
  settings.bbskeymaincolour = encodeAnsiColour(settings.coloursettings[9] || '7');
  settings.textcolour = encodeAnsiColour(settings.coloursettings[10] || '2');
  settings.textcolourYN = encodeAnsiColour(settings.coloursettings[11] || '3');
  settings.choosecolourheader = encodeAnsiColour(settings.coloursettings[12] || '6');
  settings.radiationheadercolour = encodeAnsiColour(settings.coloursettings[13] || '3');
}

function calculateDisplayLines(): number {
  const style = settings.style;

  switch (style) {
    case 1: return settings.screenheight - 9;
    case 2: return settings.screenheight - 9;
    case 3: return settings.screenheight - 14;
    case 4: return settings.screenheight - 11;
    default: return settings.screenheight - 9;
  }
}

function readSettings(): void {
  ensureDoorConfigDir();
  const settingsPath = path.join(doorRoot, 'GWall.cfg');

  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      if (lines.length > 0) settings.style = parseInt(lines[0], 10);
      if (lines.length > 1) settings.mybbsshortcode = lines[1].substring(0, 3);
      if (lines.length > 2) settings.coloursettings = lines[2].substring(0, 14);
    } catch (err) {
      saveSettings();
    }
  } else {
    saveSettings();
  }
}

function saveSettings(): void {
    const settingsPath = path.join(doorRoot, 'GWall.cfg');
  const content = `${settings.style}\n${settings.mybbsshortcode}\n${settings.coloursettings}\n`;

  try {
    writeFileSync(settingsPath, content, 'utf-8');
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

function cleanstr(sourcestring: string): string {
  return sourcestring
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/,/g, '&#44;')
    .replace(/:/g, '&#58;')
    .replace(/"/g, '&#34;')
    .replace(/\\/g, '&#92;');
}

function uncleanstr(sourcestring: string): string {
  return sourcestring
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#123;/g, '{')
    .replace(/&#125;/g, '}')
    .replace(/&#44;/g, ',')
    .replace(/&#58;/g, ':')
    .replace(/&#34;/g, '"')
    .replace(/&#92;/g, '\\')
    .replace(/\\u001b/g, '');
}

function httpRequest(requestdata: string, tempFile: string | null): Promise<number> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: serverHost,
      port: serverPort,
      method: 'GET',
      path: '/',
      timeout: timeout * 1000,
    };

    console.debug(`[GLOBALWALL] HTTP request -> ${options.hostname}:${options.port}${options.path}`);

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const fullData = Buffer.concat(chunks);

        if (tempFile && res.statusCode === 200) {
          try {
            writeFileSync(tempFile, fullData);
          } catch (err) {
            console.error('Error writing temp file:', err);
          }
        }

        if (res.statusCode && res.statusCode !== 200) {
          const msg = `[GLOBALWALL] Received HTTP status ${res.statusCode} (HTTP)`;
          console.warn(msg);
          debugLog(msg);
          resolve(res.statusCode);
          return;
        }

        debugLog('httprequest - done');
        resolve(res.statusCode || 0);
      });
    });

    req.on('error', (err) => {
      const msg = `[GLOBALWALL] HTTP request error (HTTP): ${err.message}`;
      console.warn(msg);
      debugLog(msg);
      resolve(0);
    });

    req.on('timeout', () => {
      const msg = `[GLOBALWALL] HTTP request timed out (HTTP)`;
      console.warn(msg);
      debugLog(msg);
      req.destroy();
      resolve(0);
    });

    req.write(requestdata);
    req.end();
  });
}

async function getwalljson(pagenum: number, maxitems: number, tempfile: string): Promise<number> {
  const getcmd = `GET /GlobalWall/api/WallItems?itemCount=${maxitems}&pagenum=${pagenum} HTTP/1.0\r\nHost:${serverHost}\r\n\r\n`;
  return await httpRequest(getcmd, tempfile);
}

async function postcomment(username: string, bbsname: string, comment: string): Promise<void> {
  const cleanUser = cleanstr(username);
  const cleanBBS = cleanstr(bbsname);
  const cleanComment = cleanstr(comment);

  const linedata = JSON.stringify({
    userName: cleanUser,
    source: cleanBBS,
    comment: cleanComment,
    bbsshortcode: settings.mybbsshortcode
  });

  const senddata = `POST /GlobalWall/api/WallItems HTTP/1.0\r\nHost:${serverHost}\r\nContent-Type: application/json\r\nContent-Length: ${linedata.length}\r\n\r\n${linedata}`;

  await httpRequest(senddata, null);
}

async function putcomment(lineid: string, username: string, bbsname: string, comment: string, bbsshortcode: string): Promise<void> {
  const cleanUser = cleanstr(username);
  const cleanBBS = cleanstr(bbsname);
  const cleanComment = cleanstr(comment);
  const cleanCode = cleanstr(bbsshortcode);

  const linedata = JSON.stringify({
    userName: cleanUser || null,
    source: cleanBBS || null,
    comment: cleanComment || null,
    bbsshortcode: cleanCode || null
  });

  const senddata = `PUT /GlobalWall/api/WallItems/${lineid} HTTP/1.0\r\nHost:${serverHost}\r\nContent-Type: application/json\r\nContent-Length: ${linedata.length}\r\n\r\n${linedata}`;

  await httpRequest(senddata, null);
}

async function deletecomment(lineid: string): Promise<void> {
  const senddata = `DELETE /GlobalWall/api/WallItems/${lineid} HTTP/1.0\r\nHost:${serverHost}\r\n\r\n`;
  await httpRequest(senddata, null);
}

function decodejson(jsondata: string): void {
  try {
    const data = JSON.parse(jsondata);

    wallItems = [];
    bbsList = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        const wallItem: WallItem = {
          id: item.id?.toString() || '',
          username: uncleanstr(item.userName || ''),
          source: uncleanstr(item.source || ''),
          comment: uncleanstr(item.comment || ''),
          bbsshortcode: item.bbsshortcode || ''
        };
        wallItems.push(wallItem);

        // Add to BBS list if not already there
        if (wallItem.bbsshortcode && wallItem.source) {
          const exists = bbsList.some(b => b.bbsShortCode === wallItem.bbsshortcode);
          if (!exists) {
            bbsList.push({
              bbsName: wallItem.source,
              bbsShortCode: wallItem.bbsshortcode
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error decoding JSON:', err);
  }
}

function transmit(socket: SocketIOSocket, textLine: string): void {
  socket.emit('ansi-output', textLine + '\r\n');
}

function sendStr(socket: SocketIOSocket, textLine: string): void {
  socket.emit('ansi-output', textLine);
}

function sendCLS(socket: SocketIOSocket): void {
  socket.emit('ansi-output', '\x0c');
}

async function getChar(socket: SocketIOSocket, echoChar: boolean): Promise<string> {
  return new Promise((resolve) => {
    const handleInput = (data: string) => {
      socket.off('user-input', handleInput);
      const key = data.trim().toUpperCase();
      if (echoChar) {
        transmit(socket, key);
      }
      resolve(key);
    };
    socket.on('user-input', handleInput);
  });
}

async function query(socket: SocketIOSocket, promptText: string, maxlen: number): Promise<string> {
  return new Promise((resolve) => {
    sendStr(socket, promptText + ' ');

    const handleInput = (data: string) => {
      socket.off('user-input', handleInput);
      resolve(data.trim().substring(0, maxlen));
    };
    socket.on('user-input', handleInput);
  });
}

// Display functions for 4 styles - implementing headers/footers
function header1(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}�-[� ${settings.radiationheadercolour}RADIATION WALL ${settings.gridcolour}�]----- -- ------ --------------------- ---------- -----------------.`);
}

function footer1(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}\`--------- -- ---- ---  -- - -- ----- ------ --- -                  - -- ---- ---''`);
}

function header2(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}+-[+ ${settings.radiationheadercolour}RADIATION WALL ${settings.gridcolour}+]----- -- ------ --------------------- ---------- -----------------.`);
}

function footer2(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}\`--------- -- ---- ---  -- - -- ----- ------ --- -                  - -- ---- ---''`);
}

function header3(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}|------- -  -  - --- - --- ----------------------- ---------- -----------------|`);
  if (sysopmode) {
    transmit(socket, `${settings.gridcolour}| ${settings.sysoptitlecolour}SysOp Menu                                                                      ${settings.gridcolour}|`);
  } else {
    transmit(socket, `${settings.gridcolour}| ${settings.titlecolour}*** GLOBAL THERMONUCLEAR WALL ***                                              ${settings.gridcolour}|`);
  }
  transmit(socket, `${settings.gridcolour}|------- -  -  - --- - --- ----------------------- ---------- -----------------|`);
  transmit(socket, `${settings.gridcolour}| ${settings.headingcolour}Id ${settings.gridcolour}| ${settings.headingcolour}BBC ${settings.gridcolour}| ${settings.headingcolour}Username        ${settings.gridcolour}| ${settings.headingcolour}Comment                                        ${settings.gridcolour}|`);
  transmit(socket, `${settings.gridcolour}|----|----|-----------------|-----------------------------------------------|`);
}

function footer3(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'`);
}

function header4(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}�------- -  -  - --- - --- ----------------------- ---------- ----------------�`);
  if (sysopmode) {
    transmit(socket, `${settings.gridcolour}� ${settings.sysoptitlecolour}SysOp Menu                                                                      ${settings.gridcolour}�`);
  } else {
    transmit(socket, `${settings.gridcolour}� ${settings.titlecolour}*** GLOBAL THERMONUCLEAR WALL ***                                              ${settings.gridcolour}�`);
  }
  transmit(socket, `${settings.gridcolour}�------- -  -  - --- - --- ----------------------- ---------- ----------------�`);
  transmit(socket, `${settings.gridcolour}� ${settings.headingcolour}Id ${settings.gridcolour}� ${settings.headingcolour}BBC ${settings.gridcolour}� ${settings.headingcolour}Username        ${settings.gridcolour}� ${settings.headingcolour}Comment                                        ${settings.gridcolour}�`);
  transmit(socket, `${settings.gridcolour}�----�----�-----------------�-----------------------------------------------�`);
}

function footer4(socket: SocketIOSocket, sysopmode: boolean): void {
  transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'`);
}

function displaywalldata(socket: SocketIOSocket, displaylines: number, displayids: boolean): void {
  const style = settings.style;
  let seperator1 = '�';
  let seperator2 = '�';
  let seperator3 = '�';

  if (style === 3 || style === 4) {
    seperator1 = '|';
    seperator2 = style === 3 ? '�' : '�';
    seperator3 = style === 3 ? '�' : '|';
  }

  for (let i = 0; i < Math.min(displaylines, wallItems.length); i++) {
    const item = wallItems[i];
    const id = displayids ? item.id.padEnd(4).substring(0, 4) : '    ';
    const bbs = item.bbsshortcode.padEnd(3).substring(0, 3);
    const username = item.username.padEnd(15).substring(0, 15);
    const comment = item.comment.substring(0, 46);

    const line = `${settings.gridcolour}${seperator1} ${settings.authorcolour}${id} ${settings.gridcolour}${seperator2} ${settings.bbsshortcodecolour}${bbs} ${settings.gridcolour}${seperator2} ${settings.authorcolour}${username} ${settings.gridcolour}${seperator2} ${settings.commentdefaultcolour}${comment}${settings.gridcolour}${' '.repeat(Math.max(0, 46 - comment.length))} ${seperator3}`;
    transmit(socket, line);
  }
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user } = doorSession;

  // Initialize settings
  settings = {
    sysoplevel: SYSOPLEVEL,
    style: DEFAULTSTYLE,
    screenheight: 29,
    mybbsshortcode: '???',
    coloursettings: colourpresets[0],
    gridcolour: '',
    titlecolour: '',
    headingcolour: '',
    authorcolour: '',
    sysoptitlecolour: '',
    sysopmenuitemscolour: '',
    bbsshortcodecolour: '',
    commentdefaultcolour: '',
    showbbskeycolour: '',
    bbskeymaincolour: '',
    textcolour: '',
    textcolourYN: '',
    choosecolourheader: '',
    radiationheadercolour: '',
    node: '0'
  };

  loadConfig();
  debugLog('wall door started');

  readSettings();
  debugLog('settings file read');

  applyColours();

  const displaylines = calculateDisplayLines();

  // Check if configured
  if (settings.mybbsshortcode === '???') {
    const accesslevel = user.secStatus || 0;
    if (accesslevel >= settings.sysoplevel) {
      transmit(socket, '');
      transmit(socket, '\x1b[0mThe wall has not yet been configured, performing initial setup');
      const newcode = await query(socket, 'Enter the 3 digit code to use for your bbs:', 3);
      if (newcode.length === 3) {
        settings.mybbsshortcode = newcode;
        saveSettings();
      }
    } else {
      transmit(socket, '');
      transmit(socket, '\x1b[0mThe wall has not been configured, please advice your sysop to configure this wall');
      transmit(socket, '');
      return;
    }
  }

  let pagenum = 1;
  let rep = true;
  let redo = true;
  let inputBuffer = '';

  while (rep) {
    if (redo) {
      const rescode = await getwalljson(pagenum, displaylines, tempFile);
      debugLog('wall data downloaded');

      if (rescode === 200) {
        try {
          const jsonBuffer = readFileSync(tempFile, 'utf-8');
          decodejson(jsonBuffer);
          debugLog('wall data decoded');
        } catch (err) {
          transmit(socket, '\x1b[0mThe server is not currently responding. Please try again later');
          return;
        }

        sendCLS(socket);

        switch (settings.style) {
          case 1: header1(socket, false); break;
          case 2: header2(socket, false); break;
          case 3: header3(socket, false); break;
          case 4: header4(socket, false); break;
          default: header2(socket, false); break;
        }

        displaywalldata(socket, displaylines, false);
        debugLog('wall data display');

        switch (settings.style) {
          case 1: footer1(socket, false); break;
          case 2: footer2(socket, false); break;
          case 3: footer3(socket, false); break;
          case 4: footer4(socket, false); break;
          default: footer2(socket, false); break;
        }

        redo = false;
      } else {
        transmit(socket, '\x1b[0mThe server is not currently responding. Please try again later');
        return;
      }
    }

    transmit(socket, '');
    sendStr(socket, `${settings.textcolour}pUSH tHE bUTTON ? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolourYN}]\x1b[0m `);

    inputBuffer = await getChar(socket, true);
    transmit(socket, '\x1b[0m');

    if (inputBuffer === 'S') {
      const accesslevel = user.secStatus || 0;
      if (accesslevel >= settings.sysoplevel) {
        // Sysop mode - not fully implemented due to complexity
        transmit(socket, '');
        transmit(socket, '\x1b[0mSysop mode not yet implemented in this version');
        transmit(socket, '');
        return;
      }
    }

    if (inputBuffer === 'K') {
      // Show BBS key - not fully implemented
      transmit(socket, '');
      transmit(socket, '\x1b[0mBBS Key display not yet implemented');
      transmit(socket, '');
    } else if (inputBuffer === 'B') {
      pagenum++;
      redo = true;
    } else if (inputBuffer === 'F') {
      if (pagenum > 1) pagenum--;
      redo = true;
    } else {
      rep = false;
    }
  }

  debugLog('main loop done');

  if (inputBuffer !== 'Y') {
    debugLog('no comment, shutdown');
    transmit(socket, '');
    transmit(socket, '\x1b[0mok be like that...');
    transmit(socket, '');
    return;
  }

  debugLog('get user comment');

  const comment = await query(socket, 'Enter your comment:', 56);
  if (comment.length === 0) {
    transmit(socket, '');
    transmit(socket, '\x1b[0myou forgot to enter something...');
    transmit(socket, '');
    return;
  }

  debugLog('get anon details');

  transmit(socket, '');
  sendStr(socket, `${settings.textcolour}sTAY aNONYMOUS? [${settings.textcolourYN}y${settings.textcolour}/${settings.textcolourYN}N${settings.textcolour}]\x1b[0m `);

  const anonInput = await getChar(socket, true);

  let username = user.username || 'guest';
  const bbsname = process.env.BBS_NAME || 'AmiExpress-Web';

  if (anonInput === 'Y') {
    username = 'somebody';
  }

  // Color selection
  let colour = '';
  while (colour.length === 0) {
    transmit(socket, '');
    transmit(socket, `${settings.gridcolour}.-[� ${settings.choosecolourheader}cHOOSE yOUR cOLOUR${settings.gridcolour} �]----- -- ------ --------------------- -  - ---------.`);
    transmit(socket, `${settings.gridcolour}�     \x1b[37m[W]HITE ${settings.gridcolour}- \x1b[31m[R]ED ${settings.gridcolour}- \x1b[33m[Y]ELLOW ${settings.gridcolour}- \x1b[34m[D]ARKBLUE ${settings.gridcolour}- \x1b[35m[P]INK ${settings.gridcolour}- \x1b[36m[C]YAN ${settings.gridcolour}- \x1b[32m[G]REEN${settings.gridcolour}     �`);
    transmit(socket, `${settings.gridcolour}\`----------- -- ----- - --    - -- --  ---- - -----        - -- -------- -- --'\x1b[0m`);

    const colourInput = await getChar(socket, true);

    if (colourInput === 'W' || colourInput === '7') colour = '7';
    else if (colourInput === 'R' || colourInput === '1') colour = '1';
    else if (colourInput === 'Y' || colourInput === '3') colour = '3';
    else if (colourInput === 'D' || colourInput === '4') colour = '4';
    else if (colourInput === 'P' || colourInput === '5') colour = '5';
    else if (colourInput === 'C' || colourInput === '6') colour = '6';
    else if (colourInput === 'G' || colourInput === '2') colour = '2';
  }

  debugLog('check and post');

  if (colour.length > 0) {
    const displaytext = encodeAnsiColour(colour) + comment;
    await postcomment(username, bbsname, displaytext);

    transmit(socket, '');
    transmit(socket, '\x1b[0myour comment has been posted');
    transmit(socket, '');
  }

  debugLog('shutdown');
}
