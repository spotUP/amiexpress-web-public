/**
 * The W door on the three screens - the real 68K binary under the real
 * emulator, as themec-40.test.ts proves THEMEC - and a typed password reaching
 * no log at runtime.
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
process.env.XIM_LOG_FILE = path.join(LOGS, 'xim-debug.json');
process.env.XIM_AMIGA_LOG = path.join(LOGS, 'xim-amiga.log');

jest.mock('../../../src/utils/acs-access-loader');
jest.mock('../../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: jest.fn(async () => undefined),
}));

import { CaptureSocket, beforeTeardown, c64Rows } from './door-capture';

const REPO = path.resolve(__dirname, '../../../../..');
const DOOR = path.join(REPO, 'Doors', 'USERSETTINGS', 'usersettings');
const EIGHTY = path.join(__dirname, 'fixtures', 'usersettings-80.ans');

interface Step { at: number; keys: string }

async function driveFull(cols: number, steps: Step[], rows = 25): Promise<{ ansi: string; user: any }> {
  const { AmigaDoorSession } = require('../../../src/amiga-emulation/AmigaDoorSession');
  const socket = new CaptureSocket();
  const petscii = cols < 80;
  const user = {
    id: 7, username: 'Spot', realname: 'Johan', internetName: 'spot', email: 'spot@example.com',
    location: 'Old Town', phone: '555-1234', secLevel: 255, securityFlags: 'T'.repeat(128), userFlags: 0,
    editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem', linesPerScreen: 0 };
  const session = new AmigaDoorSession(socket as any, {
    executablePath: DOOR, doorType: 'XIM', timeout: 30, args: ['1'], assigns: {}, toolTypes: {},
    bbsSession: {
      user,
      nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop', timeRemaining: 60,
      doorCommand: 'W', doorId: 'W', petsciiMode: petscii, terminalType: petscii ? 'c64' : 'modern',
      screenWidth: cols, screenHeight: rows,
    },
  });
  const timers = steps.map(s => setTimeout(() => socket.emit('door:input', s.keys), s.at));
  try { await session.start(); } finally { timers.forEach(clearTimeout); }
  return { ansi: socket.ansi.join(''), user };
}

const drive = async (cols: number, steps: Step[], rows = 25): Promise<string> => (await driveFull(cols, steps, rows)).ansi;

const QUIT: Step[] = [{ at: 5000, keys: 'q' }];

describe('the W door on three screens', () => {
  jest.setTimeout(90000);

  test('80 columns paints what it painted when the fixture was frozen', async () => {
    const ansi = beforeTeardown(await drive(80, QUIT));
    expect(fs.existsSync(EIGHTY)).toBe(true);   // never written by this test: see the header
    expect(ansi).toBe(fs.readFileSync(EIGHTY, 'latin1'));
    expect(ansi).toContain('USER CONFIGURATION');
    expect(ansi).toContain('Group');
  });

  (process.env.USERSETTINGS_WRITE_FIXTURE ? test : test.skip)('writes the fixture (deliberate, flagged)', async () => {
    fs.writeFileSync(EIGHTY, beforeTeardown(await drive(80, QUIT)), 'latin1');
  });

  test('40 columns: every row a C64 shows is 40 cells, the value under its label, no "?" glyph', async () => {
    const rows = c64Rows(beforeTeardown(await drive(40, QUIT)));
    expect(rows.every(r => r.length <= 40)).toBe(true);
    const label = rows.findIndex(r => r.includes('GROUP'));
    expect(label).toBeGreaterThanOrEqual(0);
    expect(rows[label + 1]).toContain('OLD TOWN');
    expect(rows.join('')).not.toContain('?');
  });

  test('132 columns: the value column grows and nothing folds', async () => {
    const ansi = beforeTeardown(await drive(132, QUIT, 40));
    expect(ansi).toContain('spot@example.com');
    // Columns 130-132 are the screen; only past 132 is overflow (ruling C4).
    expect(ansi).not.toMatch(/\x1b\[\d+;(13[3-9]|1[4-9]\d|[2-9]\d\d)H/);
  });

  /*
   * The paths W9 never ran at runtime, driven through the real binary. Keys are
   * paced 600+ ms apart: the door settles two ticks after each key.
   */
  test('a refused login name says why, keeps the editor open, and the retry is stored', async () => {
    const { changeAccount } = require('../../../src/services/account.service');
    (changeAccount as jest.Mock).mockClear();
    const { ansi } = await driveFull(80, [
      { at: 5000, keys: '\r' }, { at: 5800, keys: '\x7f\x7f\x7f\x7f' }, { at: 6600, keys: 'NEW\r' },
      { at: 8500, keys: '\x7f\x7f\x7f' }, { at: 9300, keys: 'Ziggy\r' }, { at: 11500, keys: 'q' },
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
      { at: 5000, keys: '8' }, { at: 5800, keys: '\r' }, { at: 7000, keys: '\x1b[B' }, { at: 7800, keys: '\r' },
      { at: 9500, keys: 'q' },
    ]);
    expect(ansi).toContain('AMiGA 500');        // the list drew
    expect(ansi).toContain('Up/Down: Move  Enter: Pick');
    expect(changeAccount).toHaveBeenCalledTimes(1);
    expect(ansi).toMatch(/Computer\s+\[ 8\] AMiGA 2000/);
  });

  test('Lines per screen counts 70 down to 2, asks on the line after, and stores the answer', async () => {
    const { ansi, user } = await driveFull(80, [
      { at: 5000, keys: '7' }, { at: 5800, keys: '\r' }, { at: 7200, keys: '30\r' }, { at: 9000, keys: 'q' },
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
  async function passwordSinks(secret: string): Promise<{ sinks: Record<string, string>; traces: string }> {
    const started = Date.now() - 1000;
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level =>
      jest.spyOn(console, level).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
    try {
      await drive(80, [
        { at: 5000, keys: '6' }, { at: 5800, keys: '\r' },
        { at: 6600, keys: `${secret}\r` }, { at: 8200, keys: `${secret}\r` }, { at: 10000, keys: 'q' },
      ]);
    } finally { spies.forEach(s => s.mockRestore()); }
    await new Promise(r => setTimeout(r, 500));   // the JSON and Amiga logs are write streams

    const isTrace = (l: string) => /^\[(DoorInput|XIMIOHandler\] queueInput|AmigaDoorSession\] door:input)/.test(l);
    const logsDir = path.join(REPO, 'logs');
    const doorLogs = fs.readdirSync(logsDir)
      .filter(f => /^door-68k-W-.*\.log$/.test(f) && fs.statSync(path.join(logsDir, f)).mtimeMs >= started)
      .map(f => path.join(logsDir, f));
    return {
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
   * OPEN, found by W10 on 2026-10-14: the per-keystroke INPUT traces write what a
   * caller types into ANY door to the console, a password included.
   * door-input-router.ts:84 is an unconditional console.log (production stdout);
   * the other two are debugLog (DEBUG_68K). The host has no signal that a door is
   * reading a secret, so this needs a design ruling (see the W10 report). test.failing
   * turns red the day the leak is closed, which is the cue to make it a plain test.
   */
  test.failing('KNOWN LEAK: the keystroke traces echo the typed password', async () => {
    const { traces } = await passwordSinks('Zebra7!x');
    expect(traces).not.toContain('Zebra7');
  });
});
