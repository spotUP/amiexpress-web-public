/**
 * Global Last Callers Updater - a 1:1 port of GLCUpdater.e.
 *
 * Original: ~/Code/Reference/AmiExpressEDoorSources/
 *           Global Last Callers/GLCUpdater.e  (cited below as GLCUpdater.e:<line>)
 *
 * Run from a node's logoff batch:
 *
 *   GLCUpdater BBSNAME/A CALLERSLOG/A [STEALTH] [IGNORELOCAL] [IGNORESYSOP]
 *              [IGNORESYSOPUSER] [PROCESSALL]
 *
 * WHAT IT SENDS, AND WHEN
 *
 * The original keeps no record of what it already sent. In a logoff batch it
 * finds the LAST call in the CallersLog - the last divider line followed by a
 * call line carrying `(CONNECT `, `(SYSOP_LOCAL)` or `(F2_LOCAL)` - and posts
 * that one call (GLCUpdater.e:553-572, 762). PROCESSALL walks the whole log
 * from the top instead, posting every call; the readme says to use it once,
 * by hand, to back-fill history. An earlier port kept a `<log>.glc_last` line
 * counter and would have posted the entire log on its first run; that file
 * has no counterpart in the original and is gone.
 *
 * WHAT IT PARSES
 *
 * express.e's own CallersLog lines - the call line written by
 * displayUserToCallersLog (express.e:16039-16041,
 * `MM-DD-YY (HH:MM:SS) [slot] name (connectString) location`), logoffLog
 * (express.e:9467-9470), the tab-indented conference, transfer and upload
 * lines. Fixed column offsets (date at 0, time at 10, slot at 21, the logoff
 * name at 19) come straight from those formats.
 */

import * as net from 'net';
import * as path from 'path';
import * as amigafs from './amigafs';

/** GLCUpdater.e:485, 18 - the defaults when GLCViewer.cfg names none. */
export const GLC_DEFAULT_HOST = 'scenewall.bbs.io';
export const GLC_DEFAULT_PORT = 1541;

/** GLCUpdater.e:562 - `StrCmp(logLine,'********************',20)`. */
const DIVIDER = '********************';

export interface GLCArgs {
  bbsName: string;
  callersLog: string;
  stealth: boolean;
  ignoreLocal: boolean;
  ignoreSysop: boolean;
  ignoreSysopUser: boolean;
  processAll: boolean;
}

/** GLCUpdater.e:524-544 - the five GLCViewer.cfg keys the updater reads. */
export interface GLCSettings {
  serverHost: string;
  serverPort: number;
  timeout: number;
  retries: number;
  timeZone: string;
}

/** One call, as postdata() receives it (GLCUpdater.e:198, 758). */
export interface GLCCall {
  userName: string;
  location: string;
  userNum: number;
  dateOn: string;
  timeOn: string;
  timeOff: string;
  actions: string;
  uploads: number;
  downloads: number;
  topcps: number;
  confNums: number[];
  confUploads: number[];
  upFiles: string[];
  downFiles: string[];
  /** GLCUpdater.e:752-754 - TRUE: logged as "Skipping call", never posted. */
  skip: boolean;
}

/** Sends one raw request and answers with GLCUpdater.e's httpRequest rescode. */
export type GLCTransport = (request: string, settings: GLCSettings) => Promise<number>;

/**
 * GLCUpdater.e:488 - ReadArgs('BBSNAME/A,CALLERSLOG/A,STEALTH/S,IGNORELOCAL/S,
 * IGNORESYSOP/S,IGNORESYSOPUSER/S,PROCESSALL/S'). Keywords match in any case,
 * `KEY=value` and `KEY value` both fill a keyword, a bare word fills the next
 * empty /A slot. Anything ReadArgs would reject (a missing /A, a word too
 * many) returns null, and the original then RETURNs (GLCUpdater.e:511-512).
 */
export function parseGLCArgs(args: string[]): GLCArgs | null {
  const out: GLCArgs = {
    bbsName: '', callersLog: '', stealth: false, ignoreLocal: false,
    ignoreSysop: false, ignoreSysopUser: false, processAll: false,
  };
  const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1');
  const switches: Record<string, keyof GLCArgs> = {
    STEALTH: 'stealth', IGNORELOCAL: 'ignoreLocal', IGNORESYSOP: 'ignoreSysop',
    IGNORESYSOPUSER: 'ignoreSysopUser', PROCESSALL: 'processAll',
  };
  const keywords: Record<string, 'bbsName' | 'callersLog'> = { BBSNAME: 'bbsName', CALLERSLOG: 'callersLog' };

  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    const upper = word.toUpperCase();
    if (switches[upper]) {
      (out as unknown as Record<string, boolean>)[switches[upper]] = true;
      continue;
    }
    const eq = upper.indexOf('=');
    if (eq > 0 && keywords[upper.slice(0, eq)]) {
      out[keywords[upper.slice(0, eq)]] = unquote(word.slice(eq + 1));
      continue;
    }
    if (keywords[upper] && i + 1 < args.length) {
      out[keywords[upper]] = unquote(args[++i]);
      continue;
    }
    if (!out.bbsName) out.bbsName = unquote(word);
    else if (!out.callersLog) out.callersLog = unquote(word);
    else return null;
  }
  return out.bbsName && out.callersLog ? out : null;
}

/**
 * GLCUpdater.e:395-419 parseConfigFile, called for PROGDIR:GLCViewer.cfg and
 * then GLCViewer.cfg in the current directory (GLCUpdater.e:538-539) - the
 * second wins. Values fill the defaults only when non-empty
 * (GLCUpdater.e:540-544).
 */
export function readGLCSettings(configFiles: string[]): GLCSettings {
  const values: Record<string, string> = { SERVERHOST: '', SERVERPORT: '', TIMEOUT: '', RETRIES: '', TIMEZONE: '' };
  for (const file of configFiles) {
    if (!amigafs.existsSync(file)) continue;
    const text = amigafs.readFileSync(file, 'latin1') as string;
    for (const line of text.split('\n')) {
      const p = line.indexOf('=');
      if (p < 0) continue;
      const name = line.slice(0, p).trim().toUpperCase();
      if (name in values) values[name] = line.slice(p + 1).trim();
    }
  }
  return {
    serverHost: values.SERVERHOST || GLC_DEFAULT_HOST,
    serverPort: values.SERVERPORT ? valE(values.SERVERPORT) : GLC_DEFAULT_PORT,
    timeout: values.TIMEOUT ? valE(values.TIMEOUT) : 10, // GLCUpdater.e:463
    retries: values.RETRIES ? valE(values.RETRIES) : 5,  // GLCUpdater.e:464
    timeZone: values.TIMEZONE,
  };
}

/** Amiga E Val(): leading blanks, an optional sign, decimal digits; 0 if none. */
function valE(s: string): number {
  const m = /^[ \t]*(-?\d+)/.exec(s);
  return m ? parseInt(m[1], 10) : 0;
}

/** dos.library FilePart(): what follows the last `/` or `:`. */
function filePart(s: string): string {
  const cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf(':'));
  return cut >= 0 ? s.slice(cut + 1) : s;
}

/** E `StrCopy(dst,src)` into a `[n]:STRING` keeps at most n characters. */
const estr = (s: string, n: number) => s.slice(0, n);

/**
 * GLCUpdater.e:181-196 cleanstr - escape `\` and `"`, then write characters
 * 128-255 as `\uXXXX`.
 *
 * WEB_: the original formats the escape with `\h[4]` (GLCUpdater.e:191),
 * which pads with SPACES - `\u  E9` - and is not valid JSON, so the server
 * could not read any name with an accented letter. Zero-padded here. The
 * board also writes its CallersLog as UTF-8, so a character past 255 can
 * reach this; it is escaped the same way rather than sent raw.
 */
export function cleanstr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\u0080-￿]/g, ch => `\\u${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

/** GLCUpdater.e:351-374 processTransferLine - kb and cps of a transfer summary. */
function processTransferLine(line: string): { kb: number; cps: number } {
  let cps = 0;
  let kb = 0;
  let p = line.indexOf('second(s), ');
  if (p >= 0) cps = valE(line.slice(p + 11));
  p = line.indexOf('seconds ');
  if (p >= 0) cps = valE(line.slice(p + 8));
  p = line.indexOf('file(s), ');
  if (p >= 0) kb = valE(line.slice(p + 9));
  p = line.indexOf('files, ');
  if (p >= 0) kb = valE(line.slice(p + 7));
  return { kb, cps };
}

/** True for a transfer summary line (GLCUpdater.e:691, 699). */
function isTransferSummary(line: string): boolean {
  return line.includes(' file') && line.includes(' bytes, ') && line.includes(' minute')
    && line.includes(' second') && line.includes(' cps, ') && line.includes('% efficiency');
}

/** A CallersLog line and the byte offset just past its LF (Seek after ReadStr). */
interface LogLine { text: string; next: number }

/**
 * ReadStr() from byte `from` to end of file: LF-terminated lines, the LF
 * dropped, a last line without LF still returned, the empty tail after a
 * final LF not (GLCUpdater.e:561, 652 - `ReadStr<>-1 OR StrLen>0`).
 */
function readLines(buf: Buffer, from: number): LogLine[] {
  const out: LogLine[] = [];
  let start = from;
  while (start < buf.length) {
    let lf = buf.indexOf(0x0a, start);
    if (lf < 0) lf = buf.length;
    out.push({ text: buf.toString('utf8', start, lf), next: Math.min(lf + 1, buf.length) });
    start = lf + 1;
  }
  return out;
}

const isCallLine = (s: string) =>
  s.includes('(CONNECT ') || s.includes('(SYSOP_LOCAL)') || s.includes('(F2_LOCAL)');

/**
 * GLCUpdater.e:553-582 - where processing starts, or null for "Unable to
 * locate the last caller entry in the callers log" (GLCUpdater.e:764).
 *
 * Logoff mode reads the last 4096 bytes, then 8192, ... and stops at the
 * first window holding a divider whose NEXT line is a call line; the last
 * such divider in that window wins. Like the original, a file whose last call
 * start lies in the bytes before the largest whole multiple of 4096 is never
 * reached (the loop stops once offset passes the file length,
 * GLCUpdater.e:557-559, 571).
 */
export function findCallStart(buf: Buffer, processAll: boolean): number | null {
  const fileLength = buf.length;
  if (processAll) {
    // GLCUpdater.e:574-581
    const first = readLines(buf, 0)[0];
    return first && first.text.startsWith(DIVIDER) ? first.next : 0;
  }
  let offset = Math.min(4096, fileLength);
  while (offset <= fileLength) {
    const lines = readLines(buf, fileLength - offset);
    let found: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].text.startsWith(DIVIDER)) continue;
      const probableStart = lines[i].next;          // GLCUpdater.e:563
      const call = lines[i + 1];                    // GLCUpdater.e:564
      i++;                                          // that ReadStr consumed it
      if (call && isCallLine(call.text)) found = probableStart;
    }
    if (found !== null) return found;
    if (offset === 0) break; // an empty file: Seek(fh,-0,END) reads nothing, for ever
    offset += 4096;
  }
  return null;
}

/**
 * GLCUpdater.e:585-762 - every call from `start`: one call in logoff mode,
 * every call to end of file with PROCESSALL.
 */
export function parseCalls(buf: Buffer, start: number, args: Pick<GLCArgs, 'ignoreLocal' | 'ignoreSysop' | 'ignoreSysopUser' | 'processAll'>): GLCCall[] {
  const lines = readLines(buf, start);
  const calls: GLCCall[] = [];
  let pos = 0;
  let location = '';     // GLCUpdater.e:443 - never reset between calls
  let currentConf = 0;   // GLCUpdater.e:551 - set once, before the loop

  let foundEnd: boolean;
  do {
    const confNums: number[] = [];
    const confUploads: number[] = [];
    const upFiles: string[] = [];
    const downFiles: string[] = [];

    const logLine = pos < lines.length ? lines[pos++].text : '';                         // :594
    const dateOn = [3, 0, 6].map(o => logLine.substr(o, 2).padEnd(2, ' ')).join('-'); // :596
    const timeOn = logLine.substr(10, 5);                                               // :597

    let lostCarrier = false, uploadFail = false, uploadSuccess = false;
    let downloadFail = false, downloadSuccess = false, opPaged = false;
    let newUser = false, pwdFail = false, accountEdit = false, fileScan = false;
    const opChat = false, bulls = false, exRestr = false; // declared, never set (:453-458)
    let uploads = 0, downloads = 0, topcps = 0;

    // GLCUpdater.e:617-639 - name and location from the call line.
    let userName = 'UNKNOWN';
    let p = logLine.indexOf(']');
    if (p >= 0 && logLine.length > p + 2) {
      const tempStr = estr(logLine.slice(p + 2), 255);
      p = tempStr.indexOf(' (SYSOP_LOCAL) ');
      if (p >= 0) { userName = estr(tempStr.slice(0, p), 100); location = estr(tempStr.slice(p + 15), 200); }
      p = tempStr.indexOf(' (F2_LOCAL) ');
      if (p >= 0) { userName = estr(tempStr.slice(0, p), 100); location = estr(tempStr.slice(p + 12), 200); }
      p = tempStr.indexOf(' (CONNECT');
      if (p >= 0) {
        userName = estr(tempStr.slice(0, p), 100);
        const p2 = tempStr.slice(p).indexOf(') ');
        if (p2 >= 0) location = estr(tempStr.slice(p + p2 + 2), 200);
      }
    }
    // GLCUpdater.e:640-645 - `NEW [n]` (express.e:16039) shifts the slot by 4.
    if (logLine.length > 19 && logLine.substr(19, 5) === ' NEW ') newUser = true;
    const userNum = valE(logLine.slice(newUser ? 25 : 21));
    const connectLine = logLine;

    let pwFailCount = 0;
    let timeOff = '--:--';
    foundEnd = false;
    let previousLine = logLine;
    while (pos < lines.length) {                                                       // :652
      const line = lines[pos++].text;
      if (line.startsWith(DIVIDER)) foundEnd = true;                                   // :653
      // GLCUpdater.e:654-662 - logoffLog's line (express.e:9468-9470).
      if (line.length > 19 && line.slice(19) === ` ${userName} Off Normally`) timeOff = line.substr(10, 5);
      if (line.length > 19 && line.slice(19) === ` ${userName} Off Loss Carrier`) {
        timeOff = line.substr(10, 5);
        lostCarrier = true;
      }

      // GLCUpdater.e:664-689 - `\tConference n: ... Auto-ReJoined` and
      // `\tname (n) Conference Joined` (express.e:5071-5090).
      let newConf = -1;
      if (line.indexOf('\tConference ') === 0 && line.includes('Auto-ReJoined')) newConf = valE(line.slice(12));
      let tmp = line.indexOf(') Conference Joined');
      if (tmp >= 0) {
        while (tmp >= 0 && line[tmp] !== '(') tmp--;
        if (tmp >= 0) newConf = valE(line.slice(tmp + 1));
      }
      if (newConf !== -1) {
        currentConf = confNums.indexOf(newConf);
        if (currentConf === -1) {
          confNums.push(newConf);
          confUploads.push(0);
          currentConf = confNums.length - 1;
        }
      }

      // GLCUpdater.e:691-697 - an upload summary follows `Uploading ` or `Upload moved`.
      if (isTransferSummary(line) && (previousLine.includes('Uploading ') || previousLine.includes('Upload moved'))) {
        const { kb, cps } = processTransferLine(line);
        if (cps > topcps) topcps = cps;
        uploads += kb;
        // :695 writes confUploads[currentConf] unchecked; an index past the
        // list (no conference joined yet this call) lands outside it and is
        // never sent, which is what the guard reproduces.
        if (currentConf < confUploads.length) confUploads[currentConf] += kb;
        uploadSuccess = true;
      }
      // GLCUpdater.e:699-704
      if (isTransferSummary(line) && previousLine.includes('Downloading ')) {
        const { kb, cps } = processTransferLine(line);
        if (cps > topcps) topcps = cps;
        downloads += kb;
        downloadSuccess = true;
      }

      // GLCUpdater.e:706-714. `tmp:=InStr(...)>=0` assigns the comparison
      // (E has no operator precedence), so tmp is TRUE = -1 and the name is
      // read from logLine+16 whatever column the marker sits at.
      if (line.includes('\tUpload moved to ')) {
        if (!line.includes('LCFILES/') && !line.includes('PARTUPLOAD/') && !line.includes('HOLD/')) {
          const tmp2 = filePart(line.slice(16));
          const tempStr = cleanstr(estr(tmp2, 255).toUpperCase());
          // :712 compares the RAW name against the upper-cased, cleaned list,
          // so a lower-case name is listed again on every move.
          if (!upFiles.includes(tmp2)) upFiles.push(tempStr);
        }
      }
      // GLCUpdater.e:716-723 - same E quirk: logLine+(-1)+14 = logLine+13.
      if (line.includes('\tDownloading ')) {
        let tempStr = filePart(line.slice(13));
        const sp = tempStr.indexOf(' ');
        if (sp >= 0) tempStr = tempStr.slice(0, sp);
        tempStr = cleanstr(tempStr.toUpperCase());
        if (!downFiles.includes(tempStr)) downFiles.push(tempStr);
      }

      // GLCUpdater.e:725-732
      if (line.includes('Upload Failed..')) uploadFail = true;
      if (line.includes('Download Failed..')) downloadFail = true;
      // WEB_: GLCUpdater.e:727 and :731 look for `Operator Paged At ` and
      // `Account Editing`, but express.e writes `\tOperator Paged at (`
      // (20344) and `\tAccount editing.` / `\tAccount editing from mail.`
      // (24457, 11166, 12206) - the case differs, so on a real board the o
      // and A flags never lit. Matched without regard to case so the flags
      // say what the call did (sysop's decision, 2026-10-04).
      const lower = line.toLowerCase();
      if (lower.includes('operator paged at ')) opPaged = true;
      if (line.includes('Password Failure')) pwFailCount++;
      if (line.includes('Directory Scan ')) fileScan = true;
      if (line.includes('Conference Scan ')) fileScan = true;
      if (lower.includes('account editing')) accountEdit = true; // WEB_: see :727 above
      if (pwFailCount === 2) pwdFail = true;
      previousLine = line;
      if (foundEnd) break;                                                             // :734
    }

    // GLCUpdater.e:737-750
    const a = '----------'.split('');
    if (newUser) a[0] = '*';
    if (uploadFail) a[1] = 'u';
    if (uploadSuccess) a[1] = 'U';
    if (downloadFail) a[2] = 'd';
    if (downloadSuccess) a[2] = 'D';
    if (opPaged) a[3] = 'o';
    if (opChat) a[3] = 'O';
    if (fileScan) a[4] = 'F';
    if (bulls) a[5] = 'B';
    if (exRestr) a[6] = 'E';
    if (accountEdit) a[7] = 'A';
    if (pwdFail) a[8] = 'H';
    if (lostCarrier) a[9] = 'C';

    // GLCUpdater.e:752-754
    let skip = true;
    if (connectLine.includes('(CONNECT ')
      || (connectLine.includes('(SYSOP_LOCAL)') && !args.ignoreSysop)
      || (connectLine.includes('(F2_LOCAL)') && !args.ignoreLocal)) skip = false;
    if (userNum === 1 && args.ignoreSysopUser) skip = true;

    calls.push({
      userName, location, userNum, dateOn, timeOn, timeOff, actions: a.join(''),
      uploads, downloads, topcps, confNums, confUploads, upFiles, downFiles, skip,
    });
  } while (foundEnd && args.processAll);                                               // :762
  return calls;
}

/**
 * GLCUpdater.e:198-349 postdata - the exact bytes put on the wire.
 *
 * `\b` in an E string is CR, so the header lines and the body's tail are
 * CRLF, `Host:` has no space after the colon, and Content-Length counts the
 * body's own trailing CRLF (GLCUpdater.e:328, 333).
 */
export function buildGLCRequest(call: GLCCall, bbsName: string, stealth: boolean, settings: GLCSettings): string {
  // GLCUpdater.e:217-235. WEB_: the original appends `],` inside the FOR
  // loop, so a call whose conference list holds more than one entry after
  // its first upload sends `"confnums": [1],,2],` - invalid JSON the server
  // rejects. Here the arrays are closed once, after the loop: the same
  // conferences with uploads, in list order.
  const withUploads = call.confNums.map((n, i) => [n, call.confUploads[i]]).filter(([, kb]) => kb > 0);
  const confText = withUploads.length > 0
    ? `,"confnums": [${withUploads.map(([n]) => n).join(',')}],"confuploads": [${withUploads.map(([, kb]) => kb).join(',')}]`
    : '';

  // GLCUpdater.e:255-280 - the names were cleanstr'd when collected (:711, :721).
  const fileList = (key: string, files: string[]) =>
    files.length > 0 ? `,"${key}": [${files.map(f => `"${f}"`).join(',')}]` : `,"${key}": null`;

  // GLCUpdater.e:213-215, 311-328
  const linedata = `{"Id": 0,"Username": "${cleanstr(call.userName)}","location": "${cleanstr(call.location)}"`
    + `,"Bbsname": "${cleanstr(bbsName)}","Dateon": "${call.dateOn}","TimeOn": "${call.timeOn}"`
    + `,"TimeOff": "${call.timeOff}","Actions": "${call.actions}","Upload": ${call.uploads}`
    + `,"Download": ${call.downloads},"topcps": ${call.topcps},"stealth": ${stealth ? 'true' : 'false'}`
    + fileList('uploadfiles', call.upFiles) + fileList('downloadfiles', call.downFiles)
    + confText + '}\r\n';

  // GLCUpdater.e:330-336 - the time zone travels as a query parameter, spaces as `+`.
  const query = settings.timeZone.length > 0 ? `?tzname=${settings.timeZone.replace(/ /g, '+')}` : '';
  return `POST /GlobalLastCallers/api/GlobalLastCallers${query} HTTP/1.0\r\n`
    + `Host:${settings.serverHost}\r\n`
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${Buffer.byteLength(linedata, 'latin1')}\r\n\r\n`
    + linedata;
}

/**
 * GLCUpdater.e:33-150 httpRequest - a raw TCP request, not an HTTP client.
 * Rescode: the number after the first space of the response's first 20
 * bytes; -1 no host, -2 every connect timed out, -3 send failed, -5 the reply
 * timed out (and the whole exchange is retried, up to `retries` times).
 */
export const tcpTransport: GLCTransport = async (request, settings) => {
  const { serverHost: host, serverPort: port, timeout, retries } = settings;
  let rescode = 0;
  for (let try2 = 1; try2 <= Math.max(1, retries); try2++) {
    // GLCUpdater.e:73-104 - up to `retries` connects of `timeout` seconds each.
    let socket: net.Socket | null = null;
    for (let attempt = 1; attempt <= Math.max(1, retries) && !socket; attempt++) {
      const outcome = await new Promise<net.Socket | 'nohost' | 'timeout'>(resolve => {
        const s = net.createConnection({ host, port });
        s.setTimeout(timeout * 1000);
        s.once('connect', () => { s.setTimeout(0); resolve(s); });
        s.once('timeout', () => { s.destroy(); resolve('timeout'); });
        s.once('error', (err: NodeJS.ErrnoException) => {
          s.destroy();
          resolve(err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' ? 'nohost' : 'timeout');
        });
      });
      if (outcome === 'nohost') return -1;                       // GLCUpdater.e:59-64
      if (outcome !== 'timeout') socket = outcome;
      else console.log(`[GLCUpdater] connect ${attempt}: timeout`);
    }
    if (!socket) {
      console.log('[GLCUpdater] all retries failed');           // GLCUpdater.e:98
      return -2;
    }
    const s = socket;
    rescode = await new Promise<number>(resolve => {
      let first = true;
      let code = 0;
      s.setTimeout(timeout * 1000);
      s.on('data', (chunk: Buffer) => {
        if (!first) return;
        first = false;                                            // GLCUpdater.e:131-136
        const head = chunk.toString('latin1', 0, 20);
        const sp = head.indexOf(' ');
        if (sp >= 0) code = valE(head.slice(sp + 1));
      });
      s.once('timeout', () => {
        console.log(`[GLCUpdater] receive ${try2}: timeout`);    // GLCUpdater.e:127
        s.destroy();
        resolve(-5);
      });
      s.once('error', () => resolve(first ? -3 : code));
      s.once('close', () => resolve(code));
      s.write(Buffer.from(request, 'latin1'));                   // GLCUpdater.e:106
    });
    if (rescode !== -5) break;                                    // GLCUpdater.e:145
  }
  return rescode;
};

export interface GLCRunContext {
  /** Amiga path -> host path (assigns resolved). */
  resolvePath: (amigaPath: string) => string;
  /** The program's own directory, for PROGDIR:GLCViewer.cfg - null if absent. */
  progDir: string | null;
  /** The batch's current directory, for GLCViewer.cfg. */
  cwd: string;
  transport?: GLCTransport;
}

/** What one run did - the original's WriteF lines, as data. */
export interface GLCRunResult {
  status: 'bad-args' | 'no-log' | 'no-call-found' | 'done';
  calls: GLCCall[];
  posted: number;
  requests: string[];
}

/** GLCUpdater.e:428-769 main. */
export async function runGLCUpdater(argv: string[], ctx: GLCRunContext): Promise<GLCRunResult> {
  const result: GLCRunResult = { status: 'bad-args', calls: [], posted: 0, requests: [] };
  const args = parseGLCArgs(argv);
  if (!args) return result;                                       // GLCUpdater.e:511-512

  console.log('[GLCUpdater] Global Last Callers Updater v1.0');
  const logPath = amigafs.resolvePath(ctx.resolvePath(args.callersLog));
  if (!logPath || !amigafs.existsSync(logPath)) {
    console.log(`[GLCUpdater] Unable to open callers log: ${args.callersLog}`); // :518
    result.status = 'no-log';
    return result;
  }

  const settings = readGLCSettings([
    ...(ctx.progDir ? [path.join(ctx.progDir, 'GLCViewer.cfg')] : []),
    path.join(ctx.cwd, 'GLCViewer.cfg'),
  ]);
  const buf = amigafs.readFileSync(logPath) as Buffer;
  const start = findCallStart(buf, args.processAll);
  if (start === null) {
    console.log('[GLCUpdater] Unable to locate the last caller entry in the callers log'); // :764
    result.status = 'no-call-found';
    return result;
  }

  const send = ctx.transport ?? tcpTransport;
  result.status = 'done';
  result.calls = parseCalls(buf, start, args);
  for (const call of result.calls) {
    const who = `${call.dateOn} at ${call.timeOn} from ${call.userName}[${call.userNum}]`;
    if (call.skip) {
      console.log(`[GLCUpdater] Skipping call on ${who}`);       // GLCUpdater.e:760
      continue;
    }
    const request = buildGLCRequest(call, args.bbsName, args.stealth, settings);
    result.requests.push(request);
    const res = await send(request, settings);
    const ok = res >= 200 && res < 300;                           // GLCUpdater.e:349
    if (ok) result.posted++;
    else console.log(`[GLCUpdater] rescode=${res}`);              // GLCUpdater.e:344
    console.log(`[GLCUpdater] Processing call on ${who}....${ok ? 'success' : 'failed'}`); // :757-758
  }
  return result;
}
