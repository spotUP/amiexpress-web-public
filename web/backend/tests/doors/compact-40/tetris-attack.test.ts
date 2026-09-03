/**
 * TETRIS ATTACK at 40x25 (C64/PETSCII XXS tier).
 *
 * This door is the FIRST animated door to be marked for 40 columns. Every other
 * marked door is a menu or a text screen and asserts zero animation there; this
 * one runs a 60Hz engine and repaints a board. That split has to be justified
 * rather than assumed, so it is stated here:
 *
 *   The effects ban (effectsAllowed) is about decorative CHROME - masthead
 *   rails, glitches, typewriter text, wipes - which is drawn against an assumed
 *   80-column line and leaves stray glyphs mid-row at 40. Every call site of
 *   effectsAllowed in this repo is one of those. It is not about a game board
 *   that IS the door's content. What actually constrains a game at 40 columns
 *   is BYTES, and the rule there is chrome.ts's: "anything full-screen ~13KB a
 *   second - never". This board is 12x13 cells and only the cells that change
 *   are repainted, so it stays far under that. Chrome is still gated off.
 *
 * The other thing worth stating: unlike every other adapted door, NOTHING here
 * is folded, stacked or dropped. Six panels at two characters is twelve
 * columns; twelve rows plus the incoming row is thirteen. The board is the same
 * size on a C64 as on an 80-column terminal. What changes is the chrome around
 * it and which modes the menu offers.
 */

import {
  getCompactProfile,
  effectsAllowed,
  isCompactWidth,
} from '../../../../../sdk/engines/ui/blessed/core/responsive-constants';

const {
  panelsLayout,
  hudLines,
} = require('../../../../../Doors/grandmaster/ui/panels/layout');
const { menuRowsFor } = require('../../../../../Doors/grandmaster/ui/menu');
const {
  buildBoard,
  boardSize,
} = require('../../../../../Doors/grandmaster/ui/panels/board-view');
const { Stack } = require('../../../../../Doors/grandmaster/core/panels/stack');
const {
  GeneratorSource,
} = require('../../../../../Doors/grandmaster/core/panels/generator-source');
const {
  getClassicEndless,
} = require('../../../../../Doors/grandmaster/core/panels/level-data');
const {
  loadSpriteSheet,
} = require('../../../../../sdk/engines/graphics/cell-art');
const path = require('path');

const SHEET = loadSpriteSheet(
  path.join(__dirname, '../../../../../Doors/grandmaster/sprites'),
);

/**
 * Printable width: ANSI escapes AND blessed tags removed.
 *
 * Both are needed. `{lightmagenta-fg}TETRIS ATTACK{/lightmagenta-fg}` is 48
 * characters of which 13 reach the screen, so measuring the raw string reports
 * a row three times too wide and fails a layout that is in fact correct.
 */
const printable = (s: string): number => s
  .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  .replace(/\{\/?[a-z-]+\}/gi, '')
  .length;

function makeStack() {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(20260903, true),
  });
  stack.startingState();
  return stack;
}

describe('TETRIS ATTACK compact (40-column) layout', () => {
  it('the board is the same size on every screen - nothing is folded', () => {
    const stack = makeStack();
    const { cols, rows } = boardSize(stack);
    expect(cols).toBe(12);
    expect(rows).toBe(13);
    expect(cols).toBeLessThanOrEqual(40);
    expect(rows).toBeLessThanOrEqual(25);
  });

  it('board and HUD both fit inside 40 columns', () => {
    const layout = panelsLayout(40, 25, 12, 13);
    expect(layout.compact).toBe(true);
    expect(layout.board.left + layout.board.width).toBeLessThanOrEqual(40);
    expect(layout.hud.left + layout.hud.width).toBeLessThanOrEqual(40);
    expect(layout.board.top + layout.board.height).toBeLessThanOrEqual(25);
  });

  it('every painted row is at most 40 columns wide', () => {
    const stack = makeStack();
    const board = buildBoard(stack, SHEET, 0, { variant: 'c64' });
    for (const row of board) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });

  it('every HUD line fits the width it was given', () => {
    const layout = panelsLayout(40, 25, 12, 13);
    const lines = hudLines(layout, {
      score: 99999, speed: 99, timeText: "9'59", chain: 13, stopped: true,
    });
    for (const line of lines) {
      expect(printable(line)).toBeLessThanOrEqual(layout.hud.width);
    }
  });

  it('the HUD drops its labels at 40 and keeps them at 80', () => {
    const values = {
      score: 1234, speed: 7, timeText: "1'05", chain: 0, stopped: false,
    };
    const compact = hudLines(panelsLayout(40, 25, 12, 13), values).join('\n');
    const wide = hudLines(panelsLayout(80, 25, 12, 13), values).join('\n');

    expect(compact).not.toMatch(/POINT/);
    expect(compact).toMatch(/1234/);
    expect(wide).toMatch(/POINT/);
    expect(wide).toMatch(/1234/);
  });

  /**
   * The mark on GMASTER.info promises the door fits 40 columns. It keeps that
   * promise by offering FEWER MODES there, not by folding 80-column screens:
   * the TGM and TETRINET screens are compositions built for 80 and are hidden.
   */
  it('at 40 columns the menu offers only TETRIS ATTACK, the manual and quit', () => {
    const rows = menuRowsFor(40);
    expect(rows.selections).toEqual(['tetris_attack', 'manual', 'quit']);
    expect(rows.items).toHaveLength(rows.selections.length);
    for (const item of rows.items) {
      expect(printable(item)).toBeLessThanOrEqual(40);
    }
  });

  it('at 80 columns the menu still offers everything', () => {
    const rows = menuRowsFor(80);
    expect(rows.selections.length).toBeGreaterThan(10);
    expect(rows.selections).toContain('master');
    expect(rows.selections).toContain('tetrinet');
    expect(rows.selections).toContain('tetris_attack');
  });

  /**
   * PETSCII has no per-cell background, so one painted here is not a different
   * colour on a C64 - it is dropped, and the board silently stops matching the
   * sheet it was drawn from.
   */
  it('the C64 board paints no backgrounds', () => {
    const stack = makeStack();
    const board = buildBoard(stack, SHEET, 0, { variant: 'c64' });
    for (const row of board) {
      for (const cell of row) {
        if (cell) expect(cell.bg).toBe(0);
      }
    }
  });

  it('decorative effects are off at 40 and on at 80', () => {
    expect(effectsAllowed(40)).toBe(false);
    expect(effectsAllowed(80)).toBe(true);
    expect(isCompactWidth(40)).toBe(true);
    expect(isCompactWidth(80)).toBe(false);
    expect(panelsLayout(40, 25, 12, 13).effects).toBe(false);
    expect(panelsLayout(80, 25, 12, 13).effects).toBe(true);
  });

  it('the compact profile drops borders at 40 and keeps them at 80', () => {
    expect(getCompactProfile(40).borders).toBe(false);
    expect(getCompactProfile(80).borders).toBe(true);
    expect(panelsLayout(40, 25, 12, 13).border).toBe(false);
  });
});

describe('TETRIS ATTACK at 80 and wider', () => {
  it('the 80-column layout centres the board and keeps the labels', () => {
    const layout = panelsLayout(80, 25, 12, 13);
    expect(layout.compact).toBe(false);
    expect(layout.board.left).toBeGreaterThan(1);
    expect(layout.board.left + layout.board.width).toBeLessThanOrEqual(80);
    expect(layout.hud.left + layout.hud.width).toBeLessThanOrEqual(80);
  });

  it('a 132-column terminal is not clipped and grows from the width', () => {
    const layout = panelsLayout(132, 40, 12, 13);
    expect(layout.compact).toBe(false);
    expect(layout.hud.left + layout.hud.width).toBeLessThanOrEqual(132);
    // Wider screen, board sits further in: geometry comes from the width.
    expect(layout.board.left).toBeGreaterThan(panelsLayout(80, 25, 12, 13).board.left);
  });

  it('the wide board does paint coloured grounds', () => {
    const stack = makeStack();
    const board = buildBoard(stack, SHEET, 0, { variant: 'wide' });
    const anyBackground = board.some((row: any[]) =>
      row.some((cell: any) => cell && cell.bg !== 0));
    expect(anyBackground).toBe(true);
  });
});
