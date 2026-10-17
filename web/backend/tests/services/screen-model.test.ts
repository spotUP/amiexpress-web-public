/**
 * The board's per-caller screen model (services/screen-model, plan 2026-10-17
 * menu styles K1/K6): the terminal step it runs, and that a saved region
 * repainted onto a second screen reproduces the first one cell for cell.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { AnsiGrid } from '../../src/utils/screen-wipe.util';
import {
  feedScreenModel, dropScreenModel, screenModelFor, snapshotRegion, renderSnapshot,
  saveScreenRegion, takeScreenRestore,
} from '../../src/services/screen-model/screen-model';
import { observeOutput, stopObserving } from '../../src/server/session-observers';

const text = (g: AnsiGrid, y: number, from = 0, to = g.columns): string => {
  let s = '';
  for (let x = from; x < to; x++) s += g.cellAt(y, x).char;
  return s;
};

test('CUP and SGR: a glyph lands where it was addressed, carrying its full attribute state', () => {
  const g = new AnsiGrid(80, 25);
  g.feed('\x1b[1m\x1b[33m\x1b[5;10HX\x1b[0mY');
  expect(g.cellAt(4, 9)).toEqual({ char: 'X', ansi: '\x1b[0;1;33m' });
  expect(g.cellAt(4, 10)).toEqual({ char: 'Y', ansi: '\x1b[0m' });
  expect([g.row, g.col]).toEqual([4, 11]);
  // A CUP past the screen stays on it.
  g.feed('\x1b[99;200H');
  expect([g.row, g.col]).toEqual([24, 79]);
});

test('scroll: a line feed on the bottom row moves the screen up, a wrap on it too', () => {
  const g = new AnsiGrid(10, 3);
  g.feed('one\r\ntwo\r\nthree\r\nfour');
  expect([text(g, 0, 0, 5), text(g, 1, 0, 5), text(g, 2, 0, 5)]).toEqual(['two  ', 'three', 'four ']);
  g.feed('\x1b[3;1H0123456789AB');
  expect(text(g, 1)).toBe('0123456789');
  expect(text(g, 2, 0, 2)).toBe('AB');
  // Scroll region: only rows 2..3 move.
  const r = new AnsiGrid(10, 4);
  r.feed('\x1b[1;1Htop\x1b[2;4r\x1b[4;1Ha\nb\nc');
  expect(text(r, 0, 0, 3)).toBe('top');
  expect([text(r, 1, 0, 1), text(r, 2, 0, 1), text(r, 3, 0, 1)]).toEqual(['a', 'b', 'c']);
});

test('ED and EL: erases leave the current background, and only the part asked for', () => {
  const g = new AnsiGrid(10, 3);
  g.feed('abcdefghij\r\nklmnopqrst\x1b[1;4H\x1b[K');
  expect(text(g, 0)).toBe('abc       ');
  g.feed('\x1b[2;5H\x1b[1K');
  expect(text(g, 1)).toBe('     pqrst');
  g.feed('\x1b[44m\x1b[2J');
  expect(g.cellAt(2, 9)).toEqual({ char: ' ', ansi: '\x1b[0;44m' });
  expect(g.cellAt(0, 0)).toEqual({ char: ' ', ansi: '\x1b[0;44m' });
});

test('an escape split across two writes is finished by the second', () => {
  const g = new AnsiGrid(80, 25);
  g.feed('\x1b[3');
  g.feed(';7HZ');
  expect(g.cellAt(2, 6).char).toBe('Z');
});

test('a saved region repainted onto a second screen reproduces the cells that drew it', () => {
  const art = '\x1b[2J\x1b[H\x1b[0;1;36mAmiExpress\x1b[0m web\r\n\x1b[44m  menu  \x1b[0m\x1b[3;5H\x1b[38;5;196mred\x1b[4;1H\x1b[33mline four';
  const first = new AnsiGrid(80, 25);
  first.feed(art);
  const snap = snapshotRegion(first, 1, 1, 5, 20)!;
  expect(snap).not.toBeNull();

  // The overlay paints over the region of the second screen, then the restore goes on top.
  const second = new AnsiGrid(80, 25);
  second.feed(art);
  second.feed('\x1b[1;1H\x1b[41m' + '####################\r\n'.repeat(5));
  second.feed(renderSnapshot(snap, 80));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) expect(second.cellAt(y, x)).toEqual(first.cellAt(y, x));
  // Cursor and SGR are those of the moment of SAVE.
  expect([second.row, second.col, second.ansi]).toEqual([first.row, first.col, first.ansi]);
  // A region off the screen is refused.
  expect(snapshotRegion(first, 24, 1, 3, 10)).toBeNull();
  expect(snapshotRegion(first, 1, 75, 1, 10)).toBeNull();
});

test('restoring the palette box over the real main menu costs at most 12 bytes a cell (plan K5)', () => {
  const menu = readFileSync(join(__dirname, '../doors/compact-40/fixtures/mainmenu-80.ans'), 'latin1');
  const screen = new AnsiGrid(80, 25);
  screen.feed(menu);
  const snap = snapshotRegion(screen, 5, 11, 16, 60)!; // the box menudoor asks for at 80x25 (SAVE 5 11 16 60)
  expect(Buffer.byteLength(renderSnapshot(snap, 80), 'latin1')).toBeLessThanOrEqual(16 * 60 * 12);
});

test('per connection: fed by observeOutput at the caller size, released on RESTORE, dropped when the connection ends', () => {
  observeOutput('conn-sm', 1, '\x1b[2;3Hhi', { screenWidth: 80, wireWidth: 100, wireHeight: 30 } as never);
  const g = screenModelFor('conn-sm')!;
  expect([g.columns, g.height]).toEqual([100, 30]);
  expect(g.cellAt(1, 2).char).toBe('h');
  expect(saveScreenRegion('conn-sm', 1, 1, 3, 10)).toBe(true);
  expect(takeScreenRestore('conn-sm')).toContain('hi');
  expect(takeScreenRestore('conn-sm')).toBeNull();
  stopObserving('conn-sm');
  expect(screenModelFor('conn-sm')).toBeUndefined();
  expect(saveScreenRegion('conn-sm', 1, 1, 3, 10)).toBe(false);
  feedScreenModel('conn-x', null, 'x');
  dropScreenModel('conn-x');
  expect(screenModelFor('conn-x')).toBeUndefined();
});
