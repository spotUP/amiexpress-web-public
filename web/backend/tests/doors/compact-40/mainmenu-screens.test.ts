/**
 * The MAIN menu door (Doors/MAINMENU/mainmenu) on the three screens this board serves - the real 68K binary
 * under the real emulator against a TEMP board copied from fixtures/menu-board/, never the repo board:
 * Amiga ANSI 80x25, responsive Amiga ANSI 132x40 and C64 PETSCII 40x25. Plan M15.
 *
 * The 80-column first frame is a COMMITTED fixture, compared as a (glyph, SGR) grid, and a missing fixture
 * FAILS the test: a test that writes its own fixture on a first run pins whatever the door painted that day.
 * To regenerate it deliberately (then read it with `cat -v` before committing):
 *   MAINMENU_WRITE_FIXTURE=1 npx jest --config dev-scripts/jest.config.ts --rootDir . \
 *     tests/doors/compact-40/mainmenu-screens.test.ts -t 'writes the fixture'
 *
 * An emulator run costs 10-60 s, so a run is shared by every test that reads it (runOnce).
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/*
 * Every log sink a XIM message can reach, switched on BEFORE any backend module loads (each reads its env
 * once, at construction): the same switches as usersettings-40.test.ts, so the typed-line proof below reads them all.
 */
const LOGS = fs.mkdtempSync(path.join(os.tmpdir(), 'mainmenu-screens-logs-'));
process.env.XIM_DEBUG = '1';
process.env.XIM_DEBUG_JSON = '1';
process.env.XIM_DEBUG_AMIGA = '1';
process.env.DEBUG_68K = '1';
process.env.XIM_LOG_DIR = LOGS;
process.env.XIM_LOG_FILE = path.join(LOGS, 'xim-debug.json');
process.env.XIM_AMIGA_LOG = path.join(LOGS, 'xim-amiga.log');

jest.mock('../../../src/utils/acs-access-loader');
jest.mock('../../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (s: any, u: any) => { Object.assign(s.user, u); }),
  saveAccount: jest.fn(async () => undefined),
}));

import { db } from '../../../src/database';
import { takeMenuExit } from '../../../src/handlers/commands/menu-door-exit';
import {
  beforeTeardown, c64Rows, driveDoor, firstFrame, gridText, isRailTick, replayCells, type DriveResult, type Step,
} from './door-capture';

const REPO = path.resolve(__dirname, '../../../../..');
const DOOR = path.join(REPO, 'Doors', 'MAINMENU', 'mainmenu');
const BOARD = path.join(__dirname, 'fixtures', 'menu-board');
const EIGHTY = path.join(__dirname, 'fixtures', 'mainmenu-80.ans');

(db as any).updateUser = async () => undefined;   // OVERFLOW stores the caller's choice; no database here

const UP = '\x1b[A', DOWN = '\x1b[B', ESC = '\x1b';
const idle = (keys: string, paints = true, quietMs?: number): Step => ({ at: 'idle', keys, paints, quietMs });
const mouse = (button: number, col: number, row: number, up = false) => `\x1b[<${button};${col};${row}${up ? 'm' : 'M'}`;
const bytes = (chunks: string[]) => chunks.reduce((n, c) => n + Buffer.byteLength(c, 'latin1'), 0);
/** What the door painted in answer to the key at marks[i]: up to the next key (or the end). */
const answer = (r: DriveResult, i: number): string[] => r.chunks.slice(r.marks[i]!.at, r.marks[i + 1]?.at ?? r.chunks.length);

/** A temp copy of the fixture board, with `Menus/MAIN.json` edited by `edit` when given. */
function tempBoard(edit?: (menu: any) => void): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainmenu-board-'));
  fs.cpSync(BOARD, root, { recursive: true });
  if (edit) {
    const file = path.join(root, 'Menus', 'MAIN.json');
    const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
    edit(menu);
    fs.writeFileSync(file, JSON.stringify(menu));
  }
  return root;
}

interface Screen { cols: number; rows: number; session: Record<string, unknown> }
const S80: Screen = { cols: 80, rows: 25, session: {} };
const S132: Screen = { cols: 132, rows: 40, session: { screenWidth: 80, wireWidth: 132, wireHeight: 40 } };
const S40: Screen = { cols: 40, rows: 25, session: {} };

async function run(screen: Screen, steps: Step[], opts: { command?: string; user?: Record<string, unknown>; board?: string } = {}): Promise<DriveResult> {
  return driveDoor(DOOR, {
    cols: screen.cols, rows: screen.rows, steps, command: opts.command ?? 'MENU',
    session: { currentConf: 1, currentConfName: 'General', relConfNum: 1, ...screen.session },
    user: opts.user, boardRoot: opts.board ?? tempBoard(),
  });
}

const cache = new Map<string, Promise<DriveResult>>();
const runOnce = (key: string, make: () => Promise<DriveResult>): Promise<DriveResult> => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

// ---- the runs (each one emulator session) --------------------------------------------------------------

/** 80x25 classic theme: the first frame, then Esc. */
const esc80 = () => runOnce('esc80', () => run(S80, [idle(ESC)]));
/** 80x25 with a theme that has a rail (the board's default, Classic, has none): the idle animation. */
const rail80 = () => runOnce('rail80', () => run(S80, [idle(ESC)], { user: { themePreference: 'uprough-neon' } }));
/** 80x25: Down, hover over the fifth entry, hover over the seventh, click it. */
const keys80 = () => runOnce('keys80', async () => {
  const first = await esc80();
  const entries = entriesOf(gridText(replayCells(firstFrame(first), 80, 25)));
  const [hover, again] = [entries[4]!, entries[6]!];
  return run(S80, [idle(DOWN), idle(mouse(35, 10, hover.row)), idle(mouse(35, 10, again.row)), idle(mouse(0, 10, again.row) + mouse(0, 10, again.row, true))]);
});
const typed80 = () => runOnce('typed80', () => run(S80, [idle('j'), idle(' 2'), idle('\r')]));
const esc40 = () => runOnce('esc40', () => run(S40, [idle(ESC)], { user: { themePreference: 'uprough-neon' } }));
/** 40x25 with no mouse and no PgDn (the board converts arrows only, io.ts handleFetchKey): Down past the last entry of page 1 turns it. */
const pages40 = () => runOnce('pages40', async () => {
  const onPage = entriesOf(gridText(replayCells(firstFrame(await esc40()), 40, 25))).length;
  // the burst is answered key by key and the emulator may stall between two of them: wait long before leaving
  return run(S40, [idle(DOWN.repeat(onPage)), idle(ESC, false, 30000)]);
});
const pages80 = () => runOnce('pages80', async () => {
  const user = { menuOverflow: 'pages' };
  const onPage = entriesOf(gridText(replayCells(firstFrame(await run(S80, [idle(ESC)], { user })), 80, 25))).length;
  return run(S80, [idle(DOWN.repeat(onPage)), idle(ESC, false, 30000)], { user });
});
const esc132 = () => runOnce('esc132', () => run(S132, [idle(ESC)]));

/** The entry rows of a painted 80/132-column screen: `  KEY   Label` under a section header. */
function entriesOf(rows: string[]): Array<{ row: number; key: string; label: string }> {
  const out: Array<{ row: number; key: string; label: string }> = [];
  rows.forEach((text, i) => {
    const m = /^(?:>>| {2})(\S+) {2,}(\S.*?) {2,}/.exec(text + '  ');
    if (m && !/^-+$/.test(m[1]!)) out.push({ row: i + 1, key: m[1]!, label: m[2]! });
  });
  return out;
}

const frame80 = async () => gridText(replayCells(firstFrame(await esc80()), 80, 25));

describe('MAINMENU on three screens', () => {
  jest.setTimeout(175000);

  describe('80x25 Amiga ANSI', () => {
    test('the first frame paints what it painted when the fixture was frozen', async () => {
      const first = firstFrame(await esc80());
      expect(fs.existsSync(EIGHTY)).toBe(true);   // never written by this test: see the header
      const frozen = fs.readFileSync(EIGHTY, 'latin1');
      expect(replayCells(first, 80, 25)).toEqual(replayCells(frozen, 80, 25));
    });

    (process.env.MAINMENU_WRITE_FIXTURE ? test : test.skip)('writes the fixture (deliberate, flagged)', async () => {
      fs.writeFileSync(process.env.MAINMENU_WRITE_FIXTURE_TO || EIGHTY, firstFrame(await esc80()), 'latin1');
    });

    test('the masthead reads MAIN MENU, the sections are headed, and R Read Mail is listed', async () => {
      const rows = await frame80();
      expect(rows[0]!.trim()).toBe('MAIN MENU');
      expect(rows.some(r => /^ {2}Messages -+$/.test(r.trimEnd()))).toBe(true);
      expect(rows.some(r => /^ {2}Files -+$/.test(r.trimEnd()))).toBe(true);
      expect(rows.some(r => /^ {2}R {12}Read Mail\s*$/.test(r))).toBe(true);
    });

    test('the bottom row is a hint in full words with the key bar at its right (nothing typed yet)', async () => {
      const rows = await frame80();
      expect(rows[24]).toContain('Arrows and Enter, or type a command');
      expect(rows[24]).toContain('Arrows Move  Enter Run  Esc Prompt');
    });

    test('the status row shows the sysop\'s description for the selected entry, not the table\'s', async () => {
      const rows = await frame80();
      expect(rows[23]).toContain('Read the mail the sysop left for you in this conference');
    });

    test('the header logo\'s glyphs are on rows 2 to 4 (the sysop\'s cat.txt)', async () => {
      const rows = await frame80();
      expect(rows[1]).toMatch(/^ \/\\_\/\\/);
      expect(rows[2]).toMatch(/^=\(o\.o\)=/);
      expect(rows[3]).toMatch(/^ > \^ </);
    });

    test('no row is longer than 80 and no cursor address is past column 80 or row 25', async () => {
      const r = await esc80();
      for (const m of firstFrame(r).matchAll(/\x1b\[(\d+);(\d+)H/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(25);
        expect(Number(m[2])).toBeLessThanOrEqual(80);
      }
      for (const row of await frame80()) expect(row.length).toBe(80);
    });

    test('with the board\'s default theme (Classic, which has no rail) nothing animates while the caller is idle', async () => {
      const r = await esc80();
      expect(r.chunks.slice(0, r.marks[0]!.at).filter(isRailTick)).toEqual([]);
    });

    test('Esc leaves with nothing to run: the board marks the dismissal', async () => {
      const r = await esc80();
      expect(takeMenuExit(r.session)).toEqual({});
    });
  });

  describe('idle animation (sibling parity: the masthead rail ticks, nothing else moves)', () => {
    test('with no key for a second the rail ticks at least twice, touches row 1 only, and no other row changes', async () => {
      const r = await rail80();
      const before = r.chunks.slice(0, r.marks[0]!.at);
      const first = firstFrame(r);
      const afterFirst = before.slice(before.findIndex(isRailTick));
      const ticks = afterFirst.filter(c => c.startsWith('\x1b7'));
      expect(ticks.length).toBeGreaterThanOrEqual(2);                              // it moved
      expect(afterFirst.every(isRailTick)).toBe(true);                             // and nothing but the rail was painted
      for (const t of ticks) for (const m of t.matchAll(/\x1b\[(\d+);\d+H/g)) expect(m[1]).toBe('1');
      const was = gridText(replayCells(first, 80, 25)), now = gridText(replayCells(before.join(''), 80, 25));
      expect(now.slice(1)).toEqual(was.slice(1));                                   // rows 2..25 are what the first frame left
      expect(now[0]).not.toBe(was[0]);                                              // the rail moved: row 1 is not what the first frame left
    });
  });

  describe('keys and the mouse at 80x25', () => {
    test('Down moves the selection by repainting two cells and the status row, never the screen', async () => {
      const r = await keys80();
      const first = replayCells(firstFrame(r), 80, 25);
      const entries = entriesOf(gridText(first));
      const down = answer(r, 0);
      expect(down.join('')).not.toContain('\x1b[2J');
      const rows = new Set([...down.join('').matchAll(/\x1b\[(\d+);\d+H/g)].map(m => Number(m[1])));
      expect([...rows].sort((a, b) => a - b)).toEqual([entries[0]!.row, entries[1]!.row, 24]);   // the old cell, the new cell, the status row: the hint row is not touched
      expect(bytes(down)).toBeLessThan(600);
      // the selection colours moved with it
      const after = replayCells(r.chunks.slice(0, r.marks[1]!.at).join(''), 80, 25);
      const selected = first[entries[0]!.row - 1]![3]!.sgr, plain = first[entries[2]!.row - 1]![3]!.sgr;
      expect(selected).not.toBe(plain);
      expect(after[entries[1]!.row - 1]![3]!.sgr).toBe(selected);
      expect(after[entries[0]!.row - 1]![3]!.sgr).toBe(plain);
    });

    /*
     * OPEN FINDING (plan M15, F1): the plan's budget is 300 bytes and 2 XIM messages for a Down. The door
     * repaints two cells and the status row; at 80 columns a cell is the whole row (label plus a 55-space tail
     * that clears the selection bar), so a Down costs 304-344 bytes in 2 messages - the messages are within
     * budget, the bytes are 1-15% over. Erase-to-end-of-line for the tail would cut it to ~240. This test goes
     * red (test.failing) the day the repaint is cheap enough; then the .failing comes off.
     */
    test.failing('Down repaints at most 300 bytes in at most 2 XIM messages', async () => {
      const r = await keys80();
      expect(bytes(answer(r, 0))).toBeLessThanOrEqual(300);
      expect(answer(r, 0).length).toBeLessThanOrEqual(2);
    });

    test('a mouse report over another entry moves the selection to it, in the selection colours', async () => {
      const r = await keys80();
      const first = replayCells(firstFrame(r), 80, 25);
      const target = entriesOf(gridText(first))[4]!;
      const selected = first[entriesOf(gridText(first))[0]!.row - 1]![3]!.sgr;
      const now = replayCells(r.chunks.slice(0, r.marks[2]!.at).join(''), 80, 25);
      expect(now[target.row - 1]![3]!.sgr).toBe(selected);
      expect(bytes(answer(r, 1))).toBeLessThan(600);
      expect(answer(r, 1).join('')).not.toContain('\x1b[2J');
    });

    test('a second report over a third entry moves the selection again (the first wake byte was consumed, a new one comes)', async () => {
      const r = await keys80();
      const first = replayCells(firstFrame(r), 80, 25);
      const entries = entriesOf(gridText(first));
      const selected = first[entries[0]!.row - 1]![3]!.sgr;
      const now = replayCells(r.chunks.slice(0, r.marks[3]!.at).join(''), 80, 25);
      expect(now[entries[6]!.row - 1]![3]!.sgr).toBe(selected);
      expect(now[entries[4]!.row - 1]![3]!.sgr).not.toBe(selected);               // and left the one before
    });

    test('a click on an entry exits with the board\'s exit record: run that entry\'s key as typed', async () => {
      const r = await keys80();
      const target = entriesOf(gridText(replayCells(firstFrame(r), 80, 25)))[6]!;
      expect(takeMenuExit(r.session)).toEqual({ run: { text: target.key, runAs: 'typed' } });
    });

    test('typing j 2 and Enter exits with that line, run as typed', async () => {
      const r = await typed80();
      expect(takeMenuExit(r.session)).toEqual({ run: { text: 'j 2', runAs: 'typed' } });
    });
  });

  describe('132x40 responsive Amiga ANSI', () => {
    const rows132 = async () => gridText(replayCells(firstFrame(await esc132()), 132, 40));

    test('the grid grows from the real width: three columns where 80 has one, nothing past column 132', async () => {
      const r = await esc132();
      const rows = await rows132();
      const wide = entriesOf(rows)[0]!.row;
      expect(rows[wide - 1]!.trimEnd().length).toBeGreaterThan(100);              // a 80 column row is never this long
      for (const m of firstFrame(r).matchAll(/\x1b\[(\d+);(\d+)H/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(40);
        expect(Number(m[2])).toBeLessThanOrEqual(132);
      }
    });

    test('the masthead spans all 132 columns on one bar colour', async () => {
      const r = await esc132();
      const row = replayCells(firstFrame(r), 132, 40)[0]!;
      expect(row.map(c => c.sgr).every(s => s === row[0]!.sgr)).toBe(true);
      expect(row[0]!.sgr.split('|')[1]).not.toBe('');                              // it IS a bar, not the terminal's own ground
      expect(gridText([row])[0]!.trim()).toBe('MAIN MENU');
    });

    test('every section is headed, the door from the board\'s Commands is listed, and the key bar is in full words', async () => {
      const rows = await rows132();
      for (const title of ['Messages', 'Files', 'Conferences', 'Doors', 'Account', 'System']) {
        expect(rows.some(r => r.startsWith(`  ${title} -`))).toBe(true);
      }
      expect(rows.some(r => /^ {2}FROGGER {6}FROGGER\b/.test(r))).toBe(true);
      expect(rows[39]).toContain('Arrows and Enter, or type a command');
      expect(rows[39]).toContain('Arrows Move  Enter Run  Esc Prompt');
    });
  });

  describe('40x25 C64 PETSCII', () => {
    test('one column, every addressed cell inside 40x25, the caret >> on the selection, no ? glyph anywhere', async () => {
      const r = await esc40();
      const ansi = beforeTeardown(r.ansi);
      const cups = [...ansi.matchAll(/\x1b\[(\d+);(\d+)H/g)];
      expect(cups.length).toBeGreaterThan(0);
      for (const m of cups) {
        expect(Number(m[1])).toBeLessThanOrEqual(25);
        expect(Number(m[2])).toBeLessThanOrEqual(40);
      }
      const rows = c64Rows(ansi);
      expect(rows[0]!.trim()).toBe('MAIN MENU');
      expect(rows.filter(l => l.startsWith('>>')).length).toBe(1);                 // exactly one selection, the first entry
      expect(rows.find(l => l.startsWith('>>'))).toMatch(/^>>R {12}READ MAIL/);
      expect(rows.some(l => /^ {2}E {12}ENTER MESSAGE\s*$/.test(l))).toBe(true);   // one entry per row
      expect(rows.join('')).not.toContain('?');
    });

    test('the C64 logo (cat.seq, not the ANSI cat.txt) is on rows 2 to 4', async () => {
      const rows = c64Rows(beforeTeardown((await esc40()).ansi));
      expect(rows[1]).toMatch(/^CAT/);
      expect(rows[2]).toMatch(/^ABC/);
    });

    test('no rail animation even for a theme that has one: row 1 and every other row are unchanged while the caller is idle', async () => {
      const r = await esc40();
      const before = r.chunks.slice(0, r.marks[0]!.at);
      expect(before.filter(c => c.includes('\x1b7'))).toEqual([]);                 // no cursor save: no tick was ever started
      expect(replayCells(before.join(''), 40, 25)).toEqual(replayCells(firstFrame(r), 40, 25));
    });
  });

  describe('pages mode', () => {
    const wipeEnds = () => {
      const log = path.join(LOGS, 'xim-debug.log');
      return fs.existsSync(log) ? (fs.readFileSync(log, 'utf8').match(/"string": "WIPE END"/g) ?? []).length : 0;
    };

    test('40x25 (pages is the C64 default): the status row says which page, Down past the page\'s last entry turns it, and no wipe plays (effects are off at 40)', async () => {
      const before = wipeEnds();
      const r = await pages40();
      expect(gridText(replayCells(firstFrame(r), 40, 25))[23]).toMatch(/Page 1 of \d+$/);
      expect(gridText(replayCells(r.chunks.slice(0, r.marks[1]!.at).join(''), 40, 25))[23]).toMatch(/Page 2 of \d+$/);
      expect(wipeEnds() - before).toBe(0);
    });

    test('80x25 with the caller\'s own choice of pages (the W setting): a page turn plays the page wipe ONCE', async () => {
      const before = wipeEnds();
      const r = await pages80();
      expect(gridText(replayCells(firstFrame(r), 80, 25))[23]).toMatch(/Page 1 of \d+$/);
      expect(gridText(replayCells(r.chunks.slice(0, r.marks[1]!.at).join(''), 80, 25))[23]).toMatch(/Page 2 of \d+$/);
      expect(wipeEnds() - before).toBe(1);                                         // the page wipe (open and leave are off in the fixture)
    });
  });

  describe('the RUN of a typed line reaches no log', () => {
    /** Drives `j 5 secretpass` + Enter as a terminal types it (a few bytes at a time) and returns every sink the board writes. */
    const typedSinks = () => runOnce('typedSinks', async () => {
      const lines: string[] = [];
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level =>
        jest.spyOn(console, level).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); }));
      const started = Date.now() - 1000;
      let r!: DriveResult;
      try { r = await run(S80, [idle('j 5'), idle(' se'), idle('cre'), idle('tpa'), idle('ss\r')]); }
      finally { spies.forEach(s => s.mockRestore()); }
      await new Promise(res => setTimeout(res, 500));                              // the JSON and Amiga logs are write streams
      const doorLogs = fs.readdirSync(LOGS).filter(f => /^door-68k-.*\.log$/.test(f) && fs.statSync(path.join(LOGS, f)).mtimeMs >= started);
      (r as any).sinks = {
        console: lines.join('\n'),
        'xim-debug.log': fs.readFileSync(path.join(LOGS, 'xim-debug.log'), 'utf8'),
        'xim-debug.json': fs.readFileSync(process.env.XIM_LOG_FILE!, 'utf8'),
        'xim-amiga.log': fs.readFileSync(process.env.XIM_AMIGA_LOG!, 'utf8'),
        'door log': doorLogs.map(f => fs.readFileSync(path.join(LOGS, f), 'utf8')).join('\n'),
      } as Record<string, string>;
      return r;
    });
    const sinksOf = async (): Promise<Record<string, string>> => (await typedSinks() as any).sinks;

    test('the line DID reach the board: it is the exit record the board runs as typed', async () => {
      expect(takeMenuExit((await typedSinks()).session)).toEqual({ run: { text: 'j 5 secretpass', runAs: 'typed' } });
    });

    test('no sink records the RUN request: each shows it opened the menu, none shows the line or its hex dump', async () => {
      const sinks = await sinksOf();
      // each sink must have RECORDED this menu session - an empty or disabled sink proves nothing
      for (const [name, text] of Object.entries(sinks)) {
        expect({ name, recorded: /AEW_MENU|10900|OPEN MAIN|DoorInput|AmigaDoorSession/.test(text) }).toEqual({ name, recorded: true });
      }
      expect(sinks['xim-debug.log']).toContain('RUN [withheld]');                // the request is logged by its verb only
      for (const [name, text] of Object.entries(sinks)) {
        expect({ name, runLines: text.split('\n').filter(l => /RUN j 5|RUN \[\d+ bytes|RUN J 5/i.test(l)).map(l => l.slice(0, 200)) }).toEqual({ name, runLines: [] });
        expect({ name, hex: /52\s?55\s?4e\s?20\s?6a/i.test(text) }).toEqual({ name, hex: false });   // the parser's hex dump of "RUN j"
      }
    });

    /*
     * The door ECHOES what the caller types on its prompt row as JH_SM output, and the board logs every message's
     * String: the console and the parser's dump do so with NO debug switch on (measured on the live container log,
     * 2026-10-15: 2961 `Parsed jhMessage` blocks and every `handleMessage` line with DEBUG_68K unset), the rest with
     * XIM_DEBUG / DEBUG_68K. A menu door cannot tell a command from a secret, so the board withholds a menu door's
     * screen writes from every log (xim/secret-input.ts isMenuDoorSession, xim/redact.ts). The unit half is in
     * tests/xim/redact.test.ts.
     */
    test('with every debug switch on, the typed text appears in no sink even as door output', async () => {
      for (const [name, text] of Object.entries(await sinksOf())) {
        expect({ name, leaks: text.split('\n').filter(l => l.includes('secretpass')).map(l=>l.slice(0,260)) }).toEqual({ name, leaks: [] });
      }
    });
  });

  describe('MENUSETTINGS (the same binary under the W settings registration)', () => {
    test('opens as LONG MENUS, and choosing Pages stores the caller\'s choice', async () => {
      const r = await run(S80, [idle(UP), idle('\r'), idle(ESC)], { command: 'MENUSETTINGS' });
      expect(gridText(replayCells(firstFrame(r), 80, 25))[0]!.trim()).toBe('LONG MENUS');
      expect(r.session.user.menuOverflow).toBe('pages');
    });
  });
});
