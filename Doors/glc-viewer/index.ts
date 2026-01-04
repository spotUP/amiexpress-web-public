/**
 * GLC Viewer Door - Global Last Callers Viewer
 *
 * Displays global last callers from scenewall.bbs.io.
 * Ported from Amiga E version.
 *
 * Features:
 * - Display last callers across all BBSes
 * - Multiple ANSI art styles (4 styles)
 * - Yesterday and previous day statistics
 * - All-time records display
 * - Top 3 most called BBSes
 * - Configurable display options
 *
 * Original: dev/docs/AmiExpressEDoorSources/Global Last Callers/GLCViewer.e
 */

import { Socket as SocketIOSocket } from 'socket.io';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

interface GLCConfig {
  serverHost: string;
  serverPort: number;
  timeout: number;
  retries: number;
  lines: number;
  screenClear: boolean;
  style: number;
  centreName: boolean;
  timeZone: string;
  viewBBS: string;
}

interface CallData {
  Username: string;
  location: string;
  Bbsname: string;
  Dateon: string;
  TimeOn: string;
  TimeOff: string;
  Actions: string;
  Upload: number;
  Download: number;
}

interface DayStats {
  statdate: string;
  calls: string;
  topcps: string;
  uploads: string;
  downloads: string;
}

interface Records {
  allcalls: string;
  recordcalls: string;
  calls: string;
  mostcalled: string;
  calls2: string;
  secondmostcalled: string;
  calls3: string;
  thirdmostcalled: string;
}

const padStat = (value?: number | string, width = 3) => String(value ?? '').padStart(width);

interface GLCData {
  calls: CallData[];
  yesterdayStats: DayStats;
  previousDayStats: DayStats;
  records: Records;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function truncateAnsi(input: string, maxCols: number): string {
  let visible = 0;
  let out = '';
  let i = 0;

  const line = input.replace(/\r?\n$/, '');

  while (i < line.length) {
    const ch = line[i];
    if (ch === '\x1b' && line[i + 1] === '[') {
      const end = line.indexOf('m', i);
      if (end === -1) break;
      out += line.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (visible >= maxCols) break;

    out += ch;
    visible += 1;
    i += 1;
  }

  return out;
}

function emitTrimmedLine(socket: SocketIOSocket, text: string, maxCols: number = 80): void {
  const visibleLen = stripAnsi(text).replace(/\r?\n$/, '').length;
  const payload = visibleLen > maxCols ? truncateAnsi(text, maxCols) : text.replace(/\r?\n$/, '');
  socket.emit('ansi-output', `${payload}\r\n`);
}

function getStringField(source: any, candidates: string[], defaultValue: string = ''): string {
  if (!source) {
    return defaultValue;
  }
  for (const key of candidates) {
    if (key in source && source[key] !== undefined && source[key] !== null) {
      return String(source[key]);
    }
  }
  return defaultValue;
}

function getNumberField(source: any, candidates: string[], defaultValue: number = 0): number {
  const str = getStringField(source, candidates, '');
  if (!str) {
    return defaultValue;
  }
  const value = Number(str);
  return Number.isFinite(value) ? value : defaultValue;
}

function normalizeCall(call: any): CallData {
  const normalized: CallData = {
    Username: getStringField(call, ['Username', 'username', 'UserName', 'USER', 'Handle']),
    location: getStringField(call, ['location', 'Location', 'Origin', 'City', 'BbsLocation']),
    Bbsname: getStringField(call, ['Bbsname', 'BbsName', 'bbsname', 'BBS', 'System']),
    Dateon: getStringField(call, ['Dateon', 'DateOn', 'dateon', 'Date']),
    TimeOn: getStringField(call, ['TimeOn', 'timeOn', 'timeon', 'LoginTime', 'TimeIn']),
    TimeOff: getStringField(call, ['TimeOff', 'timeoff', 'LogoutTime', 'TimeOut']),
    Actions: getStringField(call, ['Actions', 'actions', 'ActionCodes']),
    Upload: getNumberField(call, ['Upload', 'upload', 'UpKB', 'UpKilobytes', 'UploadBytes']) || 0,
    Download: getNumberField(call, ['Download', 'download', 'DownKB', 'DownKilobytes', 'DownloadBytes']) || 0
  };
  return normalized;
}

function normalizeDayStats(stats?: any): DayStats {
  const base: DayStats = {
    statdate: '',
    calls: '0',
    topcps: '0',
    uploads: '0',
    downloads: '0'
  };

  if (!stats) {
    return base;
  }

  return {
    statdate: getStringField(stats, ['statdate', 'StatDate', 'Date']) || base.statdate,
    calls: getStringField(stats, ['calls', 'Calls']) || base.calls,
    topcps: getStringField(stats, ['topcps', 'TopCps', 'TopSpeed']) || base.topcps,
    uploads: getStringField(stats, ['uploads', 'Uploads', 'UploadKB']) || base.uploads,
    downloads: getStringField(stats, ['downloads', 'Downloads', 'DownloadKB']) || base.downloads
  };
}

function normalizeRecords(records?: any): Records {
  const base: Records = {
    allcalls: '0',
    recordcalls: '0',
    calls: '0',
    mostcalled: '',
    calls2: '0',
    secondmostcalled: '',
    calls3: '0',
    thirdmostcalled: ''
  };

  if (!records) {
    return base;
  }

  return {
    allcalls: getStringField(records, ['allcalls', 'AllCalls']) || base.allcalls,
    recordcalls: getStringField(records, ['recordcalls', 'RecordCalls']) || base.recordcalls,
    calls: getStringField(records, ['calls', 'Calls', 'MostCalls']) || base.calls,
    mostcalled: getStringField(records, ['mostcalled', 'MostCalled', 'TopSystem']) || base.mostcalled,
    calls2: getStringField(records, ['calls2', 'Calls2', 'SecondCalls']) || base.calls2,
    secondmostcalled: getStringField(records, ['secondmostcalled', 'SecondMostCalled']) || base.secondmostcalled,
    calls3: getStringField(records, ['calls3', 'Calls3', 'ThirdCalls']) || base.calls3,
    thirdmostcalled: getStringField(records, ['thirdmostcalled', 'ThirdMostCalled']) || base.thirdmostcalled
  };
}

function normalizeGLCData(raw: any): GLCData {
  const callsSource = Array.isArray(raw?.calls)
    ? raw.calls
    : Array.isArray(raw?.Calls)
      ? raw.Calls
      : [];

  return {
    calls: callsSource.map(normalizeCall),
    yesterdayStats: normalizeDayStats(raw?.yesterdayStats || raw?.YesterdayStats),
    previousDayStats: normalizeDayStats(raw?.previousDayStats || raw?.PreviousDayStats),
    records: normalizeRecords(raw?.records || raw?.Records)
  };
}

/**
 * Load GLC configuration
 */
function loadConfig(): GLCConfig {
  const configPath = path.join(PROJECT_ROOT, 'doors', 'glc-viewer', 'glcviewer.cfg');

  const config: GLCConfig = {
    serverHost: process.env.GLC_SERVER_HOST || 'scenewall.bbs.io',
    serverPort: parseInt(process.env.GLC_SERVER_PORT || '1541'),
    timeout: 10,
    retries: 5,
    lines: 10,
    screenClear: false,
    style: 1,
    centreName: false,
    timeZone: '',
    viewBBS: ''
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

        const key = trimmed.substring(0, eqIndex).trim().toUpperCase();
        const value = trimmed.substring(eqIndex + 1).trim();

        switch (key) {
          case 'SERVERHOST':
            config.serverHost = value;
            break;
          case 'SERVERPORT':
            config.serverPort = parseInt(value) || 1541;
            break;
          case 'TIMEOUT':
            config.timeout = parseInt(value) || 10;
            break;
          case 'RETRIES':
            config.retries = parseInt(value) || 5;
            break;
          case 'LINES':
            config.lines = parseInt(value) || 10;
            break;
          case 'SCREENCLEAR':
            config.screenClear = value.toUpperCase() === 'YES';
            break;
          case 'STYLE':
            // Support comma-separated styles for random selection
            if (value.includes(',')) {
              const styles = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
              config.style = styles[Math.floor(Math.random() * styles.length)] || 1;
            } else {
              config.style = parseInt(value) || 1;
            }
            break;
          case 'CENTRENAME':
            config.centreName = value === '1';
            break;
          case 'TIMEZONE':
            config.timeZone = value;
            break;
          case 'VIEWBBS':
            config.viewBBS = value;
            break;
        }
      }
    }
  } catch (err) {
    console.error('[GLCViewer] Error loading config:', err);
  }

  // Validate style range
  if (config.style < 1 || config.style > 4) {
    config.style = 1;
  }

  return config;
}

/**
 * Fetch JSON data from GLC server
 */
async function fetchGLCData(config: GLCConfig, page: number = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = ((page - 1) * config.lines) + 1;
    let queryPath = `/GlobalLastCallers/api/GlobalLastCallers?start=${start}&count=${config.lines}`;

    if (config.timeZone) {
      const tz = config.timeZone.replace(/ /g, '+');
      queryPath = `/GlobalLastCallers/api/GlobalLastCallers?tzname=${tz}&start=${start}&count=${config.lines}`;
    }

    if (config.viewBBS) {
      const bbsEncoded = encodeURIComponent(config.viewBBS);
      queryPath += `&bbsname=${bbsEncoded}`;
    }

    const options = {
      hostname: config.serverHost,
      port: config.serverPort,
      path: queryPath,
      method: 'GET',
      timeout: config.timeout * 1000,
      headers: {
        'Host': config.serverHost,
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
 * Format file size for display
 */
function formatSize(kb: number): string {
  if (kb < 0 || kb > 9999) {
    const mb = Math.floor(kb / 1024);
    if (mb > 999) {
      const gb = Math.floor(mb / 1024);
      const gbFrac = Math.floor(((mb % 1024) * 10) / 1024);
      if (gb > 9) {
        return `${gb}G`.padStart(4);
      } else {
        return `${gb}.${gbFrac}G`.padStart(4);
      }
    } else {
      return `${mb}M`.padStart(4);
    }
  } else {
    return kb.toString().padStart(4);
  }
}

/**
 * Center a string
 */
function centre(text: string, width: number): string {
  const trimmed = text.trim();
  if (trimmed.length >= width) {
    return trimmed.substring(0, width);
  }
  const padding = Math.floor((width - trimmed.length) / 2);
  return ' '.repeat(padding) + trimmed + ' '.repeat(width - padding - trimmed.length);
}

/**
 * Display GLC data with ANSI art
 */
function displayData(socket: SocketIOSocket, data: GLCData, config: GLCConfig, showLocation: boolean): void {
  const style = config.style;

  // Screen clear
  if (config.screenClear) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
  }

  // Header - Style 1 or 3
  if (style === 1 || style === 3) {
    socket.emit('ansi-output', '\x1b[0;40;37m   \x1b[35m   ___   ___________________________________   ___   __________________\r\n');
    socket.emit('ansi-output', '\x1b[37m  \x1b[35m   /  /\\ / _   /  ___/__   __/  ___/ _   /  /\\ /  /\\ /  ___/ _  _/  ___/\\\r\n');
    socket.emit('ansi-output', '\x1b[37m  \x1b[35m  /  /_//     /\\__  /\\_/  /\\/  /\\_/     /  /_//  /_//  ___/     )\\__  /\\/\r\n');
    socket.emit('ansi-output', '\x1b[37m  \x1b[35m /_____/__/__/_____/ //__/ /_____/__/__/_____/_____/_____/__/__/_____/ /\r\n');
    socket.emit('ansi-output', '\x1b[37m  \x1b[35m \\_____\\__\\__\\_____\\/ \\__\\/\\_____\\__\\__\\_____\\_____\\_____\\__\\__\\_____\\/\x1b[34mSdN\r\n');
    socket.emit('ansi-output', '\x1b[1;44;33m                   GLOBAL LASTCALLERS! - (C) REBEL/qUARTEX                     \x1b[0m\r\n');
    if (showLocation) {
      socket.emit('ansi-output', '\x1b[36mUSERNAME          \x1b[34m:\x1b[37mLOCATION             \x1b[34m:\x1b[37mDATE \x1b[34m:\x1b[37mTIME ON BBS\x1b[34m:\x1b[36mACTIONS   \x1b[34m:\x1b[37mUPL \x1b[34m:\x1b[37mDWNL\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[36mUSERNAME          \x1b[34m:\x1b[37mBBS                  \x1b[34m:\x1b[37mDATE \x1b[34m:\x1b[37mTIME ON BBS\x1b[34m:\x1b[36mACTIONS   \x1b[34m:\x1b[37mUPL \x1b[34m:\x1b[37mDWNL\r\n');
    }
  }

  // Header - Style 2 or 4
  if (style === 2 || style === 4) {
    socket.emit('ansi-output', '\x1b[0;40;34m \x1b[35m  \x1b[37m \x1b[35m_______  \x1b[37m    .........  ........    ......\x1b[35m_______\x1b[37m      .........  ......\r\n');
    socket.emit('ansi-output', '\x1b[35m   \x1b[37m \x1b[35m\\_     |___\x1b[37m   ....::::::::::.....  :::::: \x1b[35m\\_     l___\x1b[37m :::::.:::: ::: ::::\r\n');
    socket.emit('ansi-output', '\x1b[35m   _/      | \x1b[37m \x1b[35m \\_\x1b[37m:::: :::::..... ::::: ::::::\x1b[35m_/       __/_\x1b[37m::::: .... ::: ::::\r\n');
    socket.emit('ansi-output', '\x1b[35m   \\____  \x1b[37m \x1b[35ml \x1b[37m  \x1b[35m /\x1b[37m:::: :::::::::: ::::::::::::\x1b[35m\\____  \x1b[37m  \x1b[35ml\x1b[37m   \x1b[35m /\x1b[37m:::: :::::::: ::::\r\n');
    socket.emit('ansi-output', '\x1b[35m   \x1b[37m     \x1b[35m\\______/\x1b[37m:::::.::::::::::::::::::::::     \x1b[35m\\______/\x1b[37m:::::::::::::: ::::\r\n');
    socket.emit('ansi-output', '\x1b[1;44;33m                   GLOBAL LASTCALLERS! - (C) REBEL/qUARTEX                     \x1b[0m\r\n');
    if (showLocation) {
      socket.emit('ansi-output', '\x1b[36mUSERNAME          \x1b[34m:\x1b[37mLOCATION             \x1b[34m:\x1b[37mDATE \x1b[34m:\x1b[37mTIME ON BBS\x1b[34m:\x1b[36mACTIONS   \x1b[34m:\x1b[37mUPL \x1b[34m:\x1b[37mDWNL\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[36mUSERNAME          \x1b[34m:\x1b[37mBBS                  \x1b[34m:\x1b[37mDATE \x1b[34m:\x1b[37mTIME ON BBS\x1b[34m:\x1b[36mACTIONS   \x1b[34m:\x1b[37mUPL \x1b[34m:\x1b[37mDWNL\r\n');
    }
  }

  socket.emit('ansi-output', '\x1b[34m------------------v---------------------v-----v-----------v----------v----v----\r\n');

  // Display callers
  for (const call of data.calls) {
    // E source line 260: \l\s[18] = left-aligned 18 chars
    const username = call.Username.substring(0, 18).padEnd(18);
    let locationOrBBS = showLocation ? call.location : call.Bbsname;

    if (config.centreName) {
      locationOrBBS = centre(locationOrBBS, 21);
    } else {
      // E source: \l\s[21] = left-aligned 21 chars
      locationOrBBS = locationOrBBS.substring(0, 21).padEnd(21);
    }

    // E source: \l\s[5] = left-aligned 5 chars (MUST pad even if empty)
    const dateon = call.Dateon.substring(0, 5).padEnd(5);
    // E source: \l\s[5]-\l\s[5] = "TIMEON-TIMEOFF" (11 chars total)
    const timeon = call.TimeOn.substring(0, 5).padEnd(5);
    const timeoff = call.TimeOff.substring(0, 5).padEnd(5);
    // E source: \l\s[10] = left-aligned 10 chars
    const actions = call.Actions.substring(0, 10).padEnd(10);

    const upload = formatSize(call.Upload);
    const download = formatSize(call.Download);

    // E source line 258-259: if too long, use 'LOTS'
    const uploadDisplay = upload.length > 8 ? 'LOTS' : upload;
    const downloadDisplay = download.length > 8 ? 'LOTS' : download;

    // E source: \r\s[4] = right-aligned 4 chars (last 4 of formatted size)
    const line = `\x1b[36m${username}\x1b[34m:\x1b[32m${locationOrBBS}\x1b[34m:\x1b[37m${dateon}\x1b[34m:\x1b[37m${timeon}-${timeoff}\x1b[34m:\x1b[36m${actions}\x1b[34m:\x1b[37m${uploadDisplay.padStart(4)}\x1b[34m:\x1b[37m${downloadDisplay.padStart(4)}`;
    emitTrimmedLine(socket, line);
  }

  socket.emit('ansi-output', '\x1b[34m------------------^---------------------^-----^-----------^----------^----^----\r\n');

  // Action legend
  socket.emit('ansi-output', '\x1b[35m \x1b[1;33m[\x1b[0;36mD\x1b[1;33m]\x1b[0;35mOWNLOAD   \x1b[1;33m[\x1b[0;36md\x1b[1;33m]\x1b[0;35mOWNLOAD FAIL  \x1b[1;33m[\x1b[0;36mo\x1b[1;33m]\x1b[0;35mPERATOR PAGED!  \x1b[1;33m[\x1b[0;36mF\x1b[1;33m]\x1b[0;35mILE SCAN   \x1b[1;33m[\x1b[0;36mA\x1b[1;33m]\x1b[0;35mCCOUNT EDIT!\r\n');
  socket.emit('ansi-output', ' \x1b[1;33m[\x1b[0;36mU\x1b[1;33m]\x1b[0;35mPLOAD \x1b[1;33m[\x1b[0;36mu\x1b[1;33m]\x1b[0;35mPLOAD FAIL    \x1b[1;33m[\x1b[0;36mO\x1b[1;33m]\x1b[0;35mPERATOR CHAT !  \x1b[1;33m[\x1b[0;36mH\x1b[1;33m]\x1b[0;35mACK TRY!   \x1b[1;33m[\x1b[0;36mL\x1b[1;33m]\x1b[0;35mOST CARRIER!\r\n');
  socket.emit('ansi-output', ' \x1b[1;33m[\x1b[0;36m*\x1b[1;33m]\x1b[0;35mNEW-USER  \x1b[1;33m[\x1b[0;36mB\x1b[1;33m]\x1b[0;35mULLETINS      \x1b[1;33m[\x1b[0;36mE\x1b[1;33m]\x1b[0;35mX. RESTR. FILE\r\n');
  socket.emit('ansi-output', '\x1b[34m-------------------------------------------------------------------------------\r\n');

  // Statistics - Style 1 or 2 (side by side days)
  if (style === 1 || style === 2) {
    const stat1 = `\x1b[35mSTATUS \x1b[32m${data.yesterdayStats.statdate.padEnd(8)}\x1b[35m: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.yesterdayStats.calls,3)}\x1b[34m] \x1b[1;33mTOP-CPS \x1b[0;34m[\x1b[36m${padStat(data.yesterdayStats.topcps,5)}\x1b[34m] \x1b[1;33mUL \x1b[0;34m[\x1b[36m${padStat(data.yesterdayStats.uploads,7)} \x1b[1;33mKB\x1b[0;34m] \x1b[1;33mDL \x1b[0;34m[\x1b[36m${padStat(data.yesterdayStats.downloads,7)} \x1b[1;33mKB\x1b[0;34m]`;
    emitTrimmedLine(socket, stat1);

    const stat2 = `\x1b[35mSTATUS \x1b[32m${data.previousDayStats.statdate.padEnd(8)}\x1b[35m: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.previousDayStats.calls,3)}\x1b[34m] \x1b[1;33mTOP-CPS \x1b[0;34m[\x1b[36m${padStat(data.previousDayStats.topcps,5)}\x1b[34m] \x1b[1;33mUL \x1b[0;34m[\x1b[36m${padStat(data.previousDayStats.uploads,7)} \x1b[1;33mKB\x1b[0;34m] \x1b[1;33mDL \x1b[0;34m[\x1b[36m${padStat(data.previousDayStats.downloads,7)} \x1b[1;33mKB\x1b[0;34m]`;
    emitTrimmedLine(socket, stat2);

    const records = `\x1b[35mALLTIME RECORDS: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.records.recordcalls,3)}\x1b[34m] \x1b[35mMOST CALLED SYSTEM \x1b[34m[\x1b[36m${padStat(data.records.calls,3)}\x1b[34m]\x1b[35m: \x1b[32m${data.records.mostcalled.substring(0, 21).padEnd(21)}`;
    emitTrimmedLine(socket, records);
  }

  // Statistics - Style 3 or 4 (with top 3 systems)
  if (style === 3 || style === 4) {
    const stat1 = `\x1b[35mSTATUS \x1b[32m${data.yesterdayStats.statdate.padEnd(8)}\x1b[35m: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.yesterdayStats.calls,3)}\x1b[34m] \x1b[35mTOP 3 MOST \x1b[37m1\x1b[0;34m[\x1b[36m${padStat(data.records.calls,7)}\x1b[34m] \x1b[37m${data.records.mostcalled.substring(0, 20).padEnd(20)}`;
    emitTrimmedLine(socket, stat1);

    const stat2 = `\x1b[35mSTATUS \x1b[32m${data.previousDayStats.statdate.padEnd(8)}\x1b[35m: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.previousDayStats.calls,3)}\x1b[34m] \x1b[37m2\x1b[0;34m[\x1b[36m${padStat(data.records.calls2,7)}\x1b[34m] \x1b[37m${data.records.secondmostcalled.substring(0, 20).padEnd(20)}`;
    emitTrimmedLine(socket, stat2);

    const records = `\x1b[35mALLTIME RECORDS: \x1b[1;33mCALLS \x1b[0;34m[\x1b[36m${padStat(data.records.recordcalls,3)}\x1b[34m] \x1b[35mCALLED SYSTEMS \x1b[37m3\x1b[0;34m[\x1b[36m${padStat(data.records.calls3,7)}\x1b[34m] \x1b[37m${data.records.thirdmostcalled.substring(0, 20).padEnd(20)}`;
    emitTrimmedLine(socket, records);
  }

  socket.emit('ansi-output', '\x1b[34m-------------------------------------------------------------------------------\x1b[0m\r\n');
}

/**
 * Run GLC Viewer door (TypeScript door interface)
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  try {
    const config = loadConfig();

    // Fetch JSON data
    const jsonText = await fetchGLCData(config);

    if (!jsonText || jsonText.length === 0) {
      socket.emit('ansi-output', '\x1b[31mError: Could not get data from server\x1b[0m\r\n');
      return;
    }

    // Parse JSON
    let glcData: GLCData;
    try {
      const parsed = JSON.parse(jsonText);
      glcData = normalizeGLCData(parsed);
    } catch (err: any) {
      socket.emit('ansi-output', `\x1b[31mError: Could not parse JSON data: ${err.message}\x1b[0m\r\n`);
      return;
    }

    // Display data
    const showLocation = config.viewBBS.length > 0;
    displayData(socket, glcData, config, showLocation);

  } catch (err: any) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
  }

  // BBS framework handles pause prompt - no need to emit here
}
