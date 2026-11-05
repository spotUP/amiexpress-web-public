/**
 * The W door on the three screens - the real 68K binary under the real
 * emulator, as themec-40.test.ts proves THEMEC - and a typed password reaching
 * no log at runtime.
 *
 * The fake user carries no `computer` or screen-type fields, so the Computer and
 * Screen type rows are blank in the 80-column fixture; that is pinned as painted.
 *
 * The 80-column fixture is COMMITTED, and a missing fixture FAILS the test: a
 * test that writes its own fixture on a first run pins whatever the door
 * painted that day. To regenerate it deliberately (and then read it before
 * committing):
 *   USERSETTINGS_WRITE_FIXTURE=1 npx jest --config dev-scripts/jest.config.ts \
 *     --rootDir . tests/doors/compact-40/usersettings-40.test.ts -t 'writes the fixture'
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/*
 * Every log sink a XIM message can reach, switched on BEFORE any backend module
 * loads (each reads its env once, at construction): the XIM debug log and the
 * door log in <repo>/logs, the JSON log and the Amiga-format log in a temp dir,
 * and debugLog's console output. The password proof below reads them all.
 */
const LOGS = fs.mkdtempSync(path.join(os.tmpdir(), 'usersettings-40-logs-'));
process.env.XIM_DEBUG = '1';
process.env.XIM_DEBUG_JSON = '1';
process.env.XIM_DEBUG_AMIGA = '1';
process.env.DEBUG_68K = '1';
// every XIM sink (debug.log, door-68k-*.log, json, amiga) lives in the temp dir, never in the repo's logs/
process.env.XIM_LOG_DIR = LOGS;
process.env.XIM_LOG_FILE = path.join(LOGS, 'xim-debug.json');
process.env.XIM_AMIGA_LOG = path.join(LOGS, 'xim-amiga.log');

jest.mock('../../../src/utils/acs-access-loader');
jest.mock('../../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: jest.fn(async () => undefined),
}));

import { beforeTeardown, c64Rows, driveDoor, type Step } from './door-capture';

const REPO = path.resolve(__dirname, '../../../../..');
const DOOR = path.join(REPO, 'board', 'Doors', 'USERSETTINGS', 'usersettings');
const EIGHTY = path.join(__dirname, 'fixtures', 'usersettings-80.ans');

async function driveFull(cols: number, steps: Step[], rows = 25, caller?: Record<string, unknown>): Promise<{ ansi: string; user: any }> {
  const { ansi, user } = await driveDoor(DOOR, { cols, rows, steps, command: 'W', user: caller });
  return { ansi, user };
}

const drive = async (cols: number, steps: Step[], rows = 25): Promise<string> => (await driveFull(cols, steps, rows)).ansi;

const QUIT: Step[] = [{ at: 'idle', keys: 'q' }];
/** The fixture was frozen with Grid scroll; the board default at 80 columns is now Cover flow (decision 5, 2026-10-17). */
const SCROLL = { menuStyle: 'scroll' };

describe('the W door on three screens', () => {
  jest.setTimeout(90000);

  test('80 columns paints what it painted when the fixture was frozen', async () => {
    const ansi = beforeTeardown((await driveFull(80, QUIT, 25, SCROLL)).ansi);
    expect(fs.existsSync(EIGHTY)).toBe(true);   // never written by this test: see the header
    expect(ansi).toBe(fs.readFileSync(EIGHTY, 'latin1'));
    expect(ansi).toContain('USER CONFIGURATION');
    expect(ansi).toContain('Group');
  });

  (process.env.USERSETTINGS_WRITE_FIXTURE ? test : test.skip)('writes the fixture (deliberate, flagged)', async () => {
    fs.writeFileSync(process.env.USERSETTINGS_WRITE_FIXTURE_TO || EIGHTY, beforeTeardown((await driveFull(80, QUIT, 25, SCROLL)).ansi), 'latin1');
  });

  test('40 columns: nothing is addressed off a C64 screen, the value sits under its label, no "?" glyph', async () => {
    const ansi = beforeTeardown(await drive(40, QUIT));
    // The door addressed nothing past row 25 or column 40 (c64Rows always yields 40-cell rows, so the
    // raw cursor addressing is what can overflow).
    const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    for (const m of cups) {
      expect(Number(m[1])).toBeLessThanOrEqual(25);
      expect(Number(m[2])).toBeLessThanOrEqual(40);
    }
    const rows = c64Rows(ansi);
    const label = rows.findIndex(r => r.includes('GROUP'));
    expect(label).toBeGreaterThanOrEqual(0);
    expect(rows[label + 1]).toContain('OLD TOWN');
    expect(rows.join('')).not.toContain('?');
  });

  /*
   * What "responsive" means for a 68K door on THIS board (see subs-40.test.ts): a 132-column ANSI caller is
   * told the screen is 80 wide on purpose (BB_SCRWIDTH answers doorScreenWidth(), xim/bbs-info.ts), so the
   * door cannot grow in WIDTH and must not paint past it. HEIGHT is not clamped: the list is sized from
   * screen.rows, so a 40-row caller gets rows a 25-row caller never does - that is the growth asserted here.
   */
  test('132x40: the extra rows are used, and nothing is painted wider than the 80 the board reported', async () => {
    const ansi = beforeTeardown(await drive(132, QUIT, 40));
    expect(ansi).toContain('spot@example.com');
    const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    // A 25-row caller is never addressed below row 25; this one is, and never below 40.
    const lastRow = Math.max(...cups.map(m => Number(m[1])));
    expect(lastRow).toBeGreaterThan(25);
    expect(lastRow).toBeLessThanOrEqual(40);
    // Columns: nothing past 132 (ruling C4), and no painted run wider than the board's 80.
    expect(ansi).not.toMatch(/\x1b\[\d+;(13[3-9]|1[4-9]\d|[2-9]\d\d)H/);
    const longestRun = Math.max(...ansi.split(/\x1b\[[0-9;?]*[A-Za-z]/).map(run => run.length));
    expect(longestRun).toBeLessThanOrEqual(80);
  });

  // W2/W3: the caller's menu style reaches W through STYLE?; cover flow shows one header run per page.
  test('a cover flow caller turns W\'s pages with Right, and the key bar and indicator say so', async () => {
    const { ansi } = await driveFull(80, [{ at: 'idle', keys: '\x1b[C' }, { at: 'idle', keys: 'q' }], 25, { menuStyle: 'coverflow' });
    expect(ansi).toContain('Left/Right: Page');
    expect(ansi).toMatch(/< 1\/\d+ /);
    expect(ansi).toMatch(/< 2\/\d+ /);
  });

  test('a cover flow caller turns W\'s pages with the mouse wheel (W3: mouse is on only in cover flow)', async () => {
    const { ansi } = await driveFull(80, [{ at: 'idle', keys: '\x1b[<65;10;10M' }, { at: 'idle', keys: 'q' }], 25, { menuStyle: 'coverflow' });
    expect(ansi).toMatch(/< 2\/\d+ /);
  });

  test('a scroll caller keeps the one long list: no page indicator', async () => {
    const ansi = beforeTeardown((await driveFull(80, QUIT, 25, { menuStyle: 'scroll' })).ansi);
    expect(ansi).not.toContain('Left/Right: Page');
    expect(ansi).not.toMatch(/< 1\/\d+ /);
  });

  /*
   * The paths W9 never ran at runtime, driven through the real binary. Keys are
   * paced 600+ ms apart: the door settles two ticks after each key.
   */
  test('a refused login name says why, keeps the editor open, and the retry is stored', async () => {
    const { changeAccount } = require('../../../src/services/account.service');
    (changeAccount as jest.Mock).mockClear();
    const { ansi } = await driveFull(80, [
      { at: 'idle', keys: '\r' }, { at: 'idle', keys: '\x7f\x7f\x7f\x7f' }, { at: 'idle', keys: 'NEW\r' },
      { at: 'idle', keys: '\x7f\x7f\x7f' }, { at: 'idle', keys: 'Ziggy\r' }, { at: 'idle', keys: 'q' },
    ]);
    const refused = ansi.indexOf('Username not allowed!!');
    expect(refused).toBeGreaterThan(0);
    expect(ansi.indexOf('Ok!', refused)).toBeGreaterThan(refused);              // the retry went through
    expect(changeAccount).toHaveBeenCalledWith(expect.anything(), { username: 'Ziggy' });
    expect(changeAccount).not.toHaveBeenCalledWith(expect.anything(), { username: 'NEW' });
  });

  test('the Computer row opens a pick list; Down and Enter store the second title', async () => {
    const { changeAccount } = require('../../../src/services/account.service');
    (changeAccount as jest.Mock).mockClear();
    const ansi = await drive(80, [
      { at: 'idle', keys: '8' }, { at: 'idle', keys: '\r' }, { at: 'idle', keys: '\x1b[B' }, { at: 'idle', keys: '\r' },
      { at: 'idle', keys: 'q' },
    ]);
    expect(ansi).toContain('AMiGA 500');        // the list drew
    expect(ansi).toContain('Up/Down: Move  Enter: Pick');
    expect(changeAccount).toHaveBeenCalledTimes(1);
    expect(changeAccount).toHaveBeenCalledWith(expect.anything(), { computer: 'AMiGA 2000', computerIndex: 1 });
    expect(ansi).toMatch(/Computer\s+\[ 8\] AMiGA 2000/);
  });

  test('Lines per screen counts 70 down to 2, asks on the line after, and stores the answer', async () => {
    const { ansi, user } = await driveFull(80, [
      { at: 'idle', keys: '7' }, { at: 'idle', keys: '\r' }, { at: 'idle', keys: '30\r' }, { at: 'idle', keys: 'q' },
    ]);
    expect(ansi).toContain(' 70\r\n 69\r\n');
    expect(ansi).toContain(' 3\r\n 2\r\n\r\nEnter the number you see at the top of your screen (or 0 for Auto): ');
    expect(user.linesPerScreen).toBe(30);
  });

  /**
   * Drives the password entry once and returns every log the board writes.
   * `traces` is the keystroke echo (door-input-router.ts:84 console.log, plus
   * the two debugLog lines in AmigaDoorSession.ts:274 and xim/io.ts:248); `console`
   * is everything else the console said.
   */
  async function passwordSinks(secret: string): Promise<{ sinks: Record<string, string>; traces: string; hotkeyLines: string[] }> {
    const started = Date.now() - 1000;
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level =>
      jest.spyOn(console, level).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
    try {
      await drive(80, [
        { at: 'idle', keys: '6' }, { at: 'idle', keys: '\r' },
        { at: 'idle', keys: `${secret}\r` }, { at: 'idle', keys: `${secret}\r` }, { at: 'idle', keys: 'q' },
      ]);
    } finally { spies.forEach(s => s.mockRestore()); }
    await new Promise(r => setTimeout(r, 500));   // the JSON and Amiga logs are write streams

    const isTrace = (l: string) => /^\[(DoorInput|XIMIOHandler\] queueInput|AmigaDoorSession\] door:input)/.test(l);
    const logsDir = LOGS;
    const doorLogs = fs.readdirSync(logsDir)
      .filter(f => /^door-68k-W-.*\.log$/.test(f) && fs.statSync(path.join(logsDir, f)).mtimeMs >= started)
      .map(f => path.join(logsDir, f));
    const ximDebug = fs.readFileSync(path.join(logsDir, 'xim-debug.log'), 'utf8').split('\n');
    return {
      // every hotkey-read trace line from the console and the XIM debug log (the per-key JH_HK traces)
      hotkeyLines: [...lines, ...ximDebug].filter(l => /JH_HK|JH_ExtHK|Input char|Processed keyData|\[READ\]/.test(l)),
      traces: lines.filter(isTrace).join('\n'),
      sinks: {
        console: lines.filter(l => !isTrace(l)).join('\n'),
        'xim-debug.log': fs.readFileSync(path.join(logsDir, 'xim-debug.log'), 'utf8'),
        'xim-debug.json': fs.readFileSync(process.env.XIM_LOG_FILE!, 'utf8'),
        'xim-amiga.log': fs.readFileSync(process.env.XIM_AMIGA_LOG!, 'utf8'),
        'door log': doorLogs.map(f => fs.readFileSync(f, 'utf8')).join('\n'),
      },
    };
  }

  test('the password typed into the door reaches no log: console, XIM debug log, JSON log, Amiga log, door log', async () => {
    const { sinks } = await passwordSinks('Zebra7!x');
    // Each sink must have RECORDED this session - an empty or disabled sink proves nothing.
    for (const [name, text] of Object.entries(sinks)) {
      expect({ name, recorded: /PASSWORD/.test(text) }).toEqual({ name, recorded: true });
    }
    for (const [name, text] of Object.entries(sinks)) {
      expect({ name, leaked: text.includes('Zebra7') }).toEqual({ name, leaked: false });
      // The parser's raw hex dump of the String ("5a 65 62 72 61" = "Zebra").
      expect({ name, hex: /5a\s?65\s?62\s?72\s?61/i.test(text) }).toEqual({ name, hex: false });
    }
  });

  /*
   * Closed 2026-10-14 (W10 fix round 1): the per-keystroke input traces
   * (door-input-router.ts console.log, AmigaDoorSession.ts onDoorInput, xim/io.ts
   * queueInput) used to echo what a caller typed into ANY door, a password
   * included. The W door now sends AEW_USERFIELD `SECRET 1` before a masked entry
   * and `SECRET 0` after; while set, the three traces say how many bytes arrived.
   */
  test('the keystroke traces withhold the password, say so, and still show a key typed outside the entry', async () => {
    const { traces } = await passwordSinks('Zebra7!x');
    expect(traces).not.toContain('Zebra7');
    // "Zebra7!x" + Enter is 9 bytes, and each of the three traces says so.
    for (const prefix of ['[DoorInput] <9 bytes withheld>', '[AmigaDoorSession] door:input event received: "<9 bytes withheld>"', '[XIMIOHandler] queueInput: data="<9 bytes withheld>"']) {
      expect(traces).toContain(prefix);
    }
    expect(traces).toContain('[DoorInput] "6"');            // the field jump typed before the entry is traced with content
  });

  /*
   * Closed 2026-10-15 (W fix wave I1): the JH_HK hotkey traces (xim/io.ts handleHotkey,
   * completeHotkey, the extended and quick readers, hotkey-trace.ts) printed each typed key
   * ONE CHARACTER PER LINE, so the contiguous-substring check above could not see them.
   * Asserted per character, with DEBUG_68K on (set at the top of this file).
   */
  test('no single key of the password appears in any JH_HK hotkey trace while SECRET is on', async () => {
    const secret = 'Zebra7!x';
    const { hotkeyLines } = await passwordSinks(secret);
    // control: the trace is live and shows the key typed outside the entry ('6' jumps to the row)
    expect(hotkeyLines.some(l => /char '6'|"6"/.test(l))).toBe(true);
    for (const c of new Set(secret.split(''))) {
      const code = c.charCodeAt(0);
      const leaks = hotkeyLines.filter(l =>
        l.includes(`char '${c}'`) || l.includes(`char: ${JSON.stringify(c)}`) || l.includes(`Input char: ${JSON.stringify(c)}`) ||
        l.includes(`with ${JSON.stringify(c)}`) || l.includes(`replied ${JSON.stringify(c)}`) || l.includes(`'${c}' (code`) ||
        new RegExp(`(charCode|keyCode|key code|code)[= ]${code}\\b`).test(l) ||
        l.toLowerCase().includes(`(0x${code.toString(16)})`) || l.toLowerCase().includes(`-> 0x${code.toString(16)} `));
      expect({ char: c, leaks }).toEqual({ char: c, leaks: [] });
    }
  });
});
