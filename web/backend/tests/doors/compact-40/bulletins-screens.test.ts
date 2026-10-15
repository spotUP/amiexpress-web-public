/**
 * The BULLETINS door (Doors/BULLETINS/bulletins) on the three screens this board serves - the real 68K binary
 * under the real emulator against a TEMP board copied from fixtures/menu-board/ (Bulletins/, Bulls.CFG with a
 * mask, Menus/BULLETINS.json), never the repo board. Plan M17; the harness and the shape are mainmenu-screens.test.ts's.
 *
 * The 80-column first frame is a COMMITTED fixture, compared as a (glyph, SGR) grid, and a missing fixture FAILS.
 * To regenerate it deliberately (then read it with `cat -v` before committing):
 *   BULLETINS_WRITE_FIXTURE=1 npx jest --config dev-scripts/jest.config.ts --rootDir . \
 *     tests/doors/compact-40/bulletins-screens.test.ts -t 'writes the fixture'
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
const DOOR = path.join(REPO, 'Doors', 'BULLETINS', 'bulletins');
const BOARD = path.join(__dirname, 'fixtures', 'menu-board');
const EIGHTY = path.join(__dirname, 'fixtures', 'bulletins-80.ans');

(db as any).updateUser = async () => undefined;

/* driveDoor points the process at each run's temp board; put it back after the last (see mainmenu-screens.test.ts). */
const TEMP_ROOTS: string[] = [];
let ORIGINAL: { env: string | undefined; dataDir: unknown; bbscmd: Map<string, unknown>; syscmd: Map<string, unknown> } | undefined;
beforeAll(() => {
  const { config } = require('../../../src/config');
  const { commandCache } = require('../../../src/handlers/command-execution.handler');
  ORIGINAL = { env: process.env.BBS_DATA_DIR, dataDir: config.get('dataDir'), bbscmd: new Map(commandCache.bbscmd), syscmd: new Map(commandCache.syscmd) };
});
afterAll(() => {
  const { config } = require('../../../src/config');
  const { commandCache } = require('../../../src/handlers/command-execution.handler');
  if (ORIGINAL) {
    if (ORIGINAL.env === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = ORIGINAL.env;
    config.set('dataDir', ORIGINAL.dataDir);
    commandCache.bbscmd.clear(); ORIGINAL.bbscmd.forEach((v, k) => commandCache.bbscmd.set(k, v));
    commandCache.syscmd.clear(); ORIGINAL.syscmd.forEach((v, k) => commandCache.syscmd.set(k, v));
  }
  for (const dir of TEMP_ROOTS) fs.rmSync(dir, { recursive: true, force: true });
});

const DOWN = '\x1b[B', ESC = '\x1b';
const idle = (keys: string, paints = true, quietMs?: number): Step => ({ at: 'idle', keys, paints, quietMs });
const mouse = (button: number, col: number, row: number, up = false) => `\x1b[<${button};${col};${row}${up ? 'm' : 'M'}`;
const bytes = (chunks: string[]) => chunks.reduce((n, c) => n + Buffer.byteLength(c, 'latin1'), 0);
const answer = (r: DriveResult, i: number): string[] => r.chunks.slice(r.marks[i]!.at, r.marks[i + 1]?.at ?? r.chunks.length);

/** A temp copy of the fixture board, with `edit` applied to its root when given. */
function tempBoard(edit?: (root: string) => void): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletins-board-'));
  TEMP_ROOTS.push(root);
  fs.cpSync(BOARD, root, { recursive: true });
  if (edit) edit(root);
  return root;
}
/** The fixture's Bulls.CFG hides bull30 in conference 1 (a 30-character mask ending in `-`); this lifts the mask. */
const liftMask = (root: string) => {
  const cfg = path.join(root, 'Doors', 'emp_tools', 'Bulls.CFG');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'latin1').replace('XXXXXXXXXXXXXXXXXXXXXXXXXXXXX-', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'), 'latin1');
};

interface Screen { cols: number; rows: number; session: Record<string, unknown> }
const S80: Screen = { cols: 80, rows: 25, session: {} };
const S132: Screen = { cols: 132, rows: 40, session: { screenWidth: 80, wireWidth: 132, wireHeight: 40 } };
const S40: Screen = { cols: 40, rows: 25, session: {} };

async function run(screen: Screen, steps: Step[], opts: { user?: Record<string, unknown>; board?: string } = {}): Promise<DriveResult> {
  return driveDoor(DOOR, {
    cols: screen.cols, rows: screen.rows, steps, command: 'B',
    session: { currentConf: 1, currentConfName: 'General', relConfNum: 1, ...screen.session },
    user: opts.user, boardRoot: opts.board ?? tempBoard(),
  });
}

const cache = new Map<string, Promise<DriveResult>>();
const runOnce = (key: string, make: () => Promise<DriveResult>): Promise<DriveResult> => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

const esc80 = () => runOnce('esc80', () => run(S80, [idle(ESC)]));
const rail80 = () => runOnce('rail80', () => run(S80, [idle(ESC)], { user: { themePreference: 'uprough-neon' } }));
/** 80x25: Down, hover over the second entry, click it. */
const keys80 = () => runOnce('keys80', async () => {
  const rows = gridText(replayCells(firstFrame(await esc80()), 80, 25));
  const one = entry(rows, '1'), three = entry(rows, '3');
  return run(S80, [idle(DOWN), idle(mouse(35, one.col, one.row)), idle(mouse(35, three.col, three.row)), idle(mouse(0, three.col, three.row) + mouse(0, three.col, three.row, true))]);
});
/** With bull30 masked out, `3` is unique: it acts at once. */
const three = () => runOnce('three', () => run(S80, [idle('3')]));
/** With the mask lifted, `30` also starts with `3`: `3` waits, Enter then shows it. */
const threeLifted = () => runOnce('threeLifted', () => run(S80, [idle('3'), idle('\r')], { board: tempBoard(liftMask) }));
const esc40 = () => runOnce('esc40', () => run(S40, [idle(ESC)]));
const esc132 = () => runOnce('esc132', () => run(S132, [idle(ESC)]));

/** The entries of a painted screen, in reading order: several cells share a row, each `KEY  Label` (the selected cell has `>>`). */
function entriesOf(rows: string[]): Array<{ row: number; col: number; key: string; label: string }> {
  const out: Array<{ row: number; col: number; key: string; label: string }> = [];
  rows.forEach((text, i) => {
    for (const m of text.matchAll(/(?:>>| {2})(\d+) {2}(\S+(?: \S+)*)/g)) out.push({ row: i + 1, col: m.index! + 3, key: m[1]!, label: m[2]! });
  });
  return out;
}
const entry = (rows: string[], key: string) => entriesOf(rows).find(e => e.key === key)!;
const frame80 = async () => gridText(replayCells(firstFrame(await esc80()), 80, 25));

describe('BULLETINS on three screens', () => {
  jest.setTimeout(175000);

  describe('80x25 Amiga ANSI', () => {
    test('the first frame paints what it painted when the fixture was frozen', async () => {
      const first = firstFrame(await esc80());
      expect(fs.existsSync(EIGHTY)).toBe(true);
      expect(replayCells(first, 80, 25)).toEqual(replayCells(fs.readFileSync(EIGHTY, 'latin1'), 80, 25));
    });

    (process.env.BULLETINS_WRITE_FIXTURE ? test : test.skip)('writes the fixture (deliberate, flagged)', async () => {
      fs.writeFileSync(EIGHTY, firstFrame(await esc80()), 'latin1');
    });

    test('the masthead reads BULLETINS; 1 carries Bulls.CFG\'s title and 3 the sysop\'s override; 30 is masked out', async () => {
      const rows = await frame80();
      expect(rows[0]!.trim()).toBe('BULLETINS');
      const entries = entriesOf(rows);
      expect(entries.map(e => e.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      expect([entry(rows, '1').label, entry(rows, '3').label]).toEqual(['Top Uploaders', 'Hot Tips']);   // Bulls.CFG says "Message Writers" for 3
      expect(rows.join('\n')).not.toMatch(/Held Back|Bulletin 30/);
    });

    test('the bottom row is a hint in full words with the key bar at its right', async () => {
      const rows = await frame80();
      expect(rows[24]).toContain('Arrows and Enter, or type a number');
      expect(rows[24]).toContain('Arrows Move  Enter Read  Esc/q Leave');
    });

    test('no row is longer than 80 and no cursor address is past column 80 or row 25', async () => {
      for (const m of firstFrame(await esc80()).matchAll(/\x1b\[(\d+);(\d+)H/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(25);
        expect(Number(m[2])).toBeLessThanOrEqual(80);
      }
      for (const row of await frame80()) expect(row.length).toBe(80);
    });

    test('with the board\'s default theme (Classic, no rail) nothing animates while the caller is idle', async () => {
      const r = await esc80();
      expect(r.chunks.slice(0, r.marks[0]!.at).filter(isRailTick)).toEqual([]);
    });

    test('Esc leaves with nothing to run or show', async () => {
      expect(takeMenuExit((await esc80()).session)).toEqual({});
    });
  });

  describe('typing a number', () => {
    test('3 acts at once when no other bulletin starts with 3 (bull30 is masked out): the board is asked to show it', async () => {
      const r = await three();
      expect(r.marks.length).toBe(1);                                               // no Enter was needed: the door left on the digit
      expect(takeMenuExit(r.session)).toEqual({ show: { kind: 'BULLETINS', key: '3', command: 'B' } });
    });

    test('with the mask lifted 3 waits (30 also starts with 3), and Enter shows it', async () => {
      const r = await threeLifted();
      expect(r.marks.length).toBe(2);                                               // the door was still there to take the Enter
      expect(takeMenuExit(r.session)).toEqual({ show: { kind: 'BULLETINS', key: '3', command: 'B' } });
    });
  });

  describe('keys and the mouse at 80x25', () => {
    test('Down repaints at most 300 bytes in at most 2 XIM messages, the selection colours moving with it', async () => {
      const r = await keys80();
      const first = replayCells(firstFrame(r), 80, 25);
      const rows = gridText(first);
      const down = answer(r, 0);
      expect(down.join('')).not.toContain('\x1b[2J');
      expect(bytes(down)).toBeLessThanOrEqual(300);
      expect(down.length).toBeLessThanOrEqual(2);
      const after = replayCells(r.chunks.slice(0, r.marks[1]!.at).join(''), 80, 25);
      const sgrOf = (cells: typeof first, key: string) => { const e = entry(rows, key); return cells[e.row - 1]![e.col - 1]!.sgr; };
      const selected = sgrOf(first, '1'), plain = sgrOf(first, '2');
      expect(selected).not.toBe(plain);
      expect(sgrOf(after, '1')).toBe(plain);                                          // the bar left 1 ...
      expect(['2', '4'].filter(k => sgrOf(after, k) === selected).length).toBe(1);    // ... and sits on exactly one neighbour
    });

    test('a mouse report over another bulletin moves the selection to it in at most 300 bytes', async () => {
      const r = await keys80();
      const first = replayCells(firstFrame(r), 80, 25);
      const e1 = entry(gridText(first), '1');
      const selected = first[e1.row - 1]![e1.col - 1]!.sgr;
      // Down moved the bar off 1; the hover onto 1 moves it back
      const now = replayCells(r.chunks.slice(0, r.marks[2]!.at).join(''), 80, 25);
      expect(now[e1.row - 1]![e1.col - 1]!.sgr).toBe(selected);
      expect(bytes(answer(r, 1))).toBeLessThanOrEqual(300);
      expect(answer(r, 1).join('')).not.toContain('\x1b[2J');
    });

    test('a click on a bulletin asks the board to show it', async () => {
      const r = await keys80();
      expect(takeMenuExit(r.session)).toEqual({ show: { kind: 'BULLETINS', key: '3', command: 'B' } });
    });
  });

  describe('idle animation (sibling parity: a rail theme ticks the divider, nothing else moves)', () => {
    test('with no key for a second the rail ticks at least twice, as one message per tick, and no other row changes', async () => {
      const r = await rail80();
      const before = r.chunks.slice(0, r.marks[0]!.at);
      const first = firstFrame(r);
      const afterFirst = before.slice(before.findIndex(isRailTick));
      const ticks = afterFirst.filter(c => c.startsWith('\x1b7'));
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(afterFirst.every(isRailTick)).toBe(true);
      for (const t of ticks) { expect(t.endsWith('\x1b8')).toBe(true); expect(t.match(/\x1b7/g)!.length).toBe(1); }
      const rowsTouched = new Set(ticks.flatMap(t => [...t.matchAll(/\x1b\[(\d+);\d+H/g)].map(m => Number(m[1]))));
      expect(rowsTouched.size).toBe(1);
      const row = [...rowsTouched][0]! - 1;
      const was = gridText(replayCells(first, 80, 25)), now = gridText(replayCells(before.join(''), 80, 25));
      expect(now.filter((_, i) => i !== row)).toEqual(was.filter((_, i) => i !== row));
      expect(now[row]).not.toBe(was[row]);
    });
  });

  describe('a caller the board refuses (the door leaves at once; the board speaks)', () => {
    test('without ACS_READ_BULLETINS the capture holds the board\'s permission text and no menu', async () => {
      const r = await run(S80, [], { user: { securityFlags: 'T' + 'F' + 'T'.repeat(126) } });
      expect(r.ansi).toContain('Command requires higher access.');
      expect(r.ansi).not.toContain('BULLETINS');
      expect(takeMenuExit(r.session)).toEqual({});
    });

    test('a conference with no BullHelp: the capture holds "No bulletins are available in this conference!"', async () => {
      const board = tempBoard(root => fs.rmSync(path.join(root, 'Bulletins', 'BullHelp.txt')));
      const r = await run(S80, [], { board });
      expect(r.ansi).toContain('No bulletins are available in this conference!');
      expect(r.ansi).not.toContain('Top Uploaders');
      expect(takeMenuExit(r.session)).toEqual({});
    });
  });

  describe('132x40 responsive Amiga ANSI', () => {
    test('the masthead spans 132 columns on one bar colour, the bulletins are listed, nothing is addressed past column 132', async () => {
      const r = await esc132();
      const cells = replayCells(firstFrame(r), 132, 40);
      expect(cells[0]!.map(c => c.sgr).every(s => s === cells[0]![0]!.sgr)).toBe(true);
      expect(cells[0]![0]!.sgr.split('|')[1]).not.toBe('');
      const rows = gridText(cells);
      expect(rows[0]!.trim()).toBe('BULLETINS');
      expect(entriesOf(rows).map(e => e.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      expect(rows[39]).toContain('Arrows and Enter, or type a number');
      for (const m of firstFrame(r).matchAll(/\x1b\[(\d+);(\d+)H/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(40);
        expect(Number(m[2])).toBeLessThanOrEqual(132);
      }
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
      expect(rows[0]!.trim()).toBe('BULLETINS');
      expect(rows.filter(l => l.startsWith('>>')).length).toBe(1);
      expect(rows.find(l => l.startsWith('>>'))).toMatch(/^>>1 +TOP UPLOADERS/);
      expect(rows.some(l => /^ {2}3 +HOT TIPS\s*$/.test(l))).toBe(true);
      expect(rows.join('')).not.toContain('?');
    });

    test('no rail animation even for a theme that has one: no cursor save and every cell unchanged while idle', async () => {
      const r = await runOnce('rail40', () => run(S40, [idle(ESC)], { user: { themePreference: 'uprough-neon' } }));
      const before = r.chunks.slice(0, r.marks[0]!.at);
      expect(before.filter(c => c.includes('\x1b7'))).toEqual([]);
      expect(replayCells(before.join(''), 40, 25)).toEqual(replayCells(firstFrame(r), 40, 25));
    });
  });
});
