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
  chooserLayout,
  chooserLabels,
} = require('../../../../../Doors/grandmaster/ui/panels/chooser');
const {
  versusLayout,
  versusCentreLines,
  dangerBarRows,
} = require('../../../../../Doors/grandmaster/ui/panels/versus-layout');
const {
  AnsiToPetsciiTransducer,
} = require('../../../../../sdk/petscii/ansi-to-petscii');
const {
  UNICODE_TO_PETSCII,
  printablePetsciiToScreenCode,
} = require('../../../../../sdk/petscii');
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
  /**
   * The C64 gets the SAME menu as everyone else, and every row of it fits.
   *
   * This used to assert the opposite: that at 40 columns the door offered only
   * TETRIS ATTACK, the manual and the way out. That was honest at the time -
   * the TGM screens were 80-column compositions that painted black at 40, so
   * offering them promised something the door could not do.
   *
   * They adapt now (ui/game-screen.ts branches on isCompactWidth), so hiding
   * them would be the dishonest choice instead. What still has to hold is that
   * every row a C64 is offered actually fits on its screen.
   */
  it('at 40 columns the menu offers every mode, and every row fits', () => {
    const rows = menuRowsFor(40);
    expect(rows.selections).toContain('tetris_attack');
    expect(rows.selections).toContain('master');
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

/**
 * The PETSCII oracle.
 *
 * Every other assertion in this file measures WIDTHS. None of them would
 * notice a board painted entirely out of glyphs a C64 cannot draw: the rows
 * would still be twelve columns wide and the door would still be marked, and
 * the caller would see forty columns of "?".
 *
 * So this drives the door's real board through the real transducer into the
 * KERNAL oracle and asks what is actually on the glass.
 */
describe('TETRIS ATTACK on a real C64 screen', () => {
  /**
   * The screen BYTE a C64 shows for this glyph, reverse bit included, or null
   * if it cannot show it at all.
   *
   * The table has two forms of entry. A plain number is a PETSCII code; a
   * `{ rvs }` is a code printed in REVERSE VIDEO, which is how PETSCII draws
   * the solid blocks it has no upright glyph for - a full block is a reversed
   * space. Reading only the plain form reports the whole block-element family
   * as undrawable, which is the opposite of true.
   */
  const screenCodeFor = (ch: string): number | null => {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) return printablePetsciiToScreenCode(code);
    const mapped = UNICODE_TO_PETSCII.get(ch);
    if (typeof mapped === 'number') return printablePetsciiToScreenCode(mapped);
    if (mapped && typeof mapped.rvs === 'number') {
      return printablePetsciiToScreenCode(mapped.rvs) | 0x80;
    }
    return null;
  };

  /** Every distinct glyph the board paints, over enough frames to cycle animations. */
  const boardGlyphs = (variant: string): Set<string> => {
    const stack = makeStack();
    const glyphs = new Set<string>();
    for (let frame = 0; frame < 240; frame++) {
      stack.run();
      for (const row of buildBoard(stack, SHEET, frame, { variant })) {
        for (const cell of row) if (cell && cell.char) glyphs.add(cell.char);
      }
    }
    return glyphs;
  };

  it('every glyph the C64 board paints is one a C64 can draw', () => {
    const unmappable = [...boardGlyphs('c64')].filter((ch) => screenCodeFor(ch) === null);
    expect(unmappable).toEqual([]);
  });

  it('the danger bar Challenge Mode draws is a PETSCII glyph', () => {
    const layout = versusLayout(40, 25, 12, 13);
    const rows = dangerBarRows(layout, 0.5);
    const bar = rows.find((row: string) => row.includes('█'));
    expect(bar).toBeDefined();
    expect(screenCodeFor('█')).not.toBeNull();
  });

  /**
   * Not "the glyphs are mappable" but "they are ON THE SCREEN": the board is
   * painted at a cursor position through the transducer, and the oracle is
   * asked what it holds afterwards.
   */
  it('the painted board reaches the glass unchanged', () => {
    const stack = makeStack();
    const board = buildBoard(stack, SHEET, 0, { variant: 'c64' });
    const layout = panelsLayout(40, 25, 12, 13);

    const transducer = new AnsiToPetsciiTransducer();
    let ansi = '\x1b[2J';
    board.forEach((row: Array<{ char: string }>, y: number) => {
      const text = row.map((cell) => (cell && cell.char ? cell.char : ' ')).join('');
      ansi += `\x1b[${layout.board.top + y + 1};${layout.board.left + 1}H${text}`;
    });
    transducer.transduce(ansi);

    const { screen } = transducer.machine.state;
    board.forEach((row: Array<{ char: string }>, y: number) => {
      row.forEach((cell, x) => {
        const want = screenCodeFor(cell && cell.char ? cell.char : ' ');
        if (want === null) return;
        const at = (layout.board.top + y) * 40 + layout.board.left + x;
        // The bottom-right cell scrolls the KERNAL screen and is never painted.
        if (at === 40 * 25 - 1) return;
        expect(screen[at]).toBe(want);
      });
    });
  });
});

/**
 * Versus play at forty columns.
 *
 * Two live playfields on a C64 is the surprising claim this mode makes, so it
 * is asserted against the real boards rather than against the layout numbers
 * alone.
 */
describe('TETRIS ATTACK versus at 40 columns', () => {
  it('two boards and the centre column fit, with nothing folded', () => {
    const layout = versusLayout(40, 25, 12, 13);
    expect(layout.cramped).toBe(false);
    expect(layout.opponent.left + layout.opponent.width).toBeLessThanOrEqual(40);
    expect(layout.player.left + layout.player.width).toBeLessThanOrEqual(layout.centre.left);
    expect(layout.centre.left + layout.centre.width).toBeLessThanOrEqual(layout.opponent.left);
  });

  it('every row of a versus frame fits its slot', () => {
    const layout = versusLayout(40, 25, 12, 13);
    const player = buildBoard(makeStack(), SHEET, 0, { variant: 'c64' });
    const opponent = buildBoard(makeStack(), SHEET, 0, { variant: 'c64', showCursor: false });
    const centre = versusCentreLines(layout, {
      score: 99999, speed: 99, timeText: "9'59", chain: 13, stopped: true, incoming: 99,
    });

    for (const row of player) expect(row.length).toBeLessThanOrEqual(layout.player.width);
    for (const row of opponent) expect(row.length).toBeLessThanOrEqual(layout.opponent.width);
    for (const line of centre) expect(printable(line)).toBeLessThanOrEqual(layout.centre.width);

    const widest = layout.player.width + layout.centre.width + layout.opponent.width;
    expect(widest).toBeLessThanOrEqual(40);
  });

  it('the opponent board never draws a cursor - it is not yours to move', () => {
    const stack = makeStack();
    const withCursor = buildBoard(stack, SHEET, 0, { variant: 'c64' });
    const without = buildBoard(stack, SHEET, 0, { variant: 'c64', showCursor: false });
    expect(JSON.stringify(without)).not.toBe(JSON.stringify(withCursor));
  });
});

/**
 * The lists the mode asks its questions with.
 *
 * Written while looking at an eighty-column terminal, all four of them started
 * life as a box fifty-six columns wide on a door that is marked for forty - a
 * dialog wider than the screen it is drawn on. The width comes from the screen
 * now, and these say so.
 */
describe('TETRIS ATTACK choosers at 40 columns', () => {
  const MODE_ROWS = [
    { wide: 'ENDLESS      play until the stack tops out', compact: 'ENDLESS' },
    { wide: 'TIME ATTACK  two minutes, score as high as you can', compact: 'TIME ATTACK' },
    { wide: 'VS CPU       a real opponent on a real board', compact: 'VS CPU' },
    { wide: 'CHALLENGE    the stage ladder, eight difficulties', compact: 'CHALLENGE' },
    { wide: 'PUZZLE       235 arrangements, one right answer each', compact: 'PUZZLE' },
    { wide: 'STAGE CLEAR  thirty stages and two fights with Bowser', compact: 'STAGE CLEAR' },
    { wide: 'REPLAYS      watch a game back', compact: 'REPLAYS' },
    { wide: 'Back', compact: 'Back' },
  ];

  it('the box never exceeds the screen it is drawn on', () => {
    for (const [width, height] of [[40, 25], [80, 24], [132, 40]]) {
      const layout = chooserLayout(width, height, MODE_ROWS.length);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.height).toBeLessThanOrEqual(height);
      expect(layout.innerWidth).toBeLessThan(layout.width);
      expect(layout.innerHeight).toBeLessThan(layout.height);
    }
  });

  it('every row fits inside the list at 40 columns', () => {
    const layout = chooserLayout(40, 25, MODE_ROWS.length);
    expect(layout.compact).toBe(true);
    for (const label of chooserLabels(MODE_ROWS, layout)) {
      expect(label.length).toBeLessThanOrEqual(layout.innerWidth);
    }
  });

  it('the explanations survive at 80 columns', () => {
    const layout = chooserLayout(80, 24, MODE_ROWS.length);
    const labels = chooserLabels(MODE_ROWS, layout);
    expect(layout.compact).toBe(false);
    expect(labels[0]).toContain('play until the stack tops out');
    for (const label of labels) {
      expect(label.length).toBeLessThanOrEqual(layout.innerWidth);
    }
  });

  it('a list longer than the screen is capped rather than run off the bottom', () => {
    const layout = chooserLayout(40, 25, 39);  // the 39 shipped puzzle sets
    expect(layout.height).toBeLessThanOrEqual(23);
    expect(layout.innerHeight).toBeGreaterThan(0);
  });
});
