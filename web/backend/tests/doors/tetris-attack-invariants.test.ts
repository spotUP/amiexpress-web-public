/**
 * THE THINGS ABOUT TETRIS ATTACK A MERGE MUST NOT BE ABLE TO UNDO.
 *
 * On 2026-09-04 a merge of `feat/tetris-attack` into main took the branch's
 * side for files that had already been fixed ON main, and four fixes made from
 * live reports went backwards at once: the panels lost their square pixels,
 * the empty board went back to being unpainted holes, the frame disappeared,
 * and the input went back to the character stream. Nothing went red, because
 * the tests for those fixes lived beside the code and were reverted WITH it.
 *
 * That is the whole reason this file is here and not in the door. It lives in
 * web/backend, a different tree, so a merge that rewinds Doors/grandmaster
 * cannot rewind its own guard at the same time - the same reasoning as
 * doors/command-registration-identity.test.ts, written after a merge undid a
 * crossed .info registration twice.
 *
 * Every assertion reads the REAL shipped artefact: the sprite JSON the door
 * loads, the board the renderer builds, the level table the engine runs on.
 * No fixtures, no source-text pins.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOOR = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'grandmaster');

const {
  buildBoard,
  boardSize,
  bufferRowFor,
  engineRowFor,
} = require(path.join(DOOR, 'ui/panels/board-view'));
const { Stack } = require(path.join(DOOR, 'core/panels/stack'));
const { GeneratorSource } = require(path.join(DOOR, 'core/panels/generator-source'));
const {
  getClassicEndless,
  getModern,
} = require(path.join(DOOR, 'core/panels/level-data'));
const { panelsLayout } = require(path.join(DOOR, 'ui/panels/layout'));
const { loadSpriteSheet } = require('../../../../sdk/engines/graphics/cell-art');

const SHEET = loadSpriteSheet(path.join(DOOR, 'sprites'));

function makeStack() {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(20260906, true),
  });
  stack.startingState();
  return stack;
}

/** Every cell of every animation in one sprite file. */
function cellsOf(sprite: unknown): Array<[string, number, number]> {
  const found: Array<[string, number, number]> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length === 3 && typeof node[0] === 'string' && typeof node[1] === 'number') {
        found.push(node as [string, number, number]);
        return;
      }
      for (const child of node) walk(child);
    } else if (node && typeof node === 'object') {
      for (const child of Object.values(node as Record<string, unknown>)) walk(child);
    }
  };
  walk(sprite);
  return found;
}

const wideSprites = () => fs.readdirSync(path.join(DOOR, 'sprites'))
  .filter(n => n.endsWith('.sprite.json') && !n.includes('-c64'));

describe('TETRIS ATTACK invariants a merge must not undo', () => {
  /**
   * Panels are drawn in SQUARE PIXELS, the convention every arcade door here
   * uses: an upper half block whose foreground is the top pixel and whose
   * background is the bottom one.
   *
   * Reverted once to the SNES symbols (not in an Amiga character set at all),
   * then re-cut as letters - S for heart, Z for diamond - which reads as text
   * on a game board.
   */
  it('draws panels as square pixels with no black in them', () => {
    const files = wideSprites();
    expect(files.length).toBe(8);

    for (const file of files) {
      const sprite = JSON.parse(fs.readFileSync(path.join(DOOR, 'sprites', file), 'utf8'));
      for (const [char, fg, bg] of cellsOf(sprite)) {
        expect(char).toBe('▀');
        // Black is the terminal showing through, not a colour a panel has.
        expect(fg).not.toBe(0);
        expect(bg).not.toBe(0);
      }
    }
  });

  /**
   * Empty board is PAINTED, not left unpainted. An unpainted cell is a hole in
   * the buffer, and the gaps in a ragged stack then read as holes punched in
   * space - reported live as "black holes in the playfield".
   */
  it('paints the empty board instead of leaving holes', () => {
    const stack = makeStack();
    const board = buildBoard(stack, SHEET, 0, { showCursor: false });

    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        expect(board[y][x]).not.toBeNull();
      }
    }
  });

  /** The layout asks for a frame at 80 columns; something must be able to draw it. */
  it('still asks for a frame where there is room for one', () => {
    expect(panelsLayout(80, 25, 12, 13).border).toBe(true);
    expect(panelsLayout(40, 25, 12, 13).border).toBe(false);
  });

  /**
   * A click maps to the row under the pointer. The board is drawn upside down
   * relative to the engine, and reading a click as `y + 1` mirrored it - so
   * clicking the stack asked to swap the empty rows above it and nothing
   * happened ("sometimes when I click to swap tiles it doesn't work").
   */
  it('maps a click to the row under the pointer', () => {
    const stack = makeStack();

    expect(engineRowFor(stack, 0)).toBe(stack.height);
    expect(engineRowFor(stack, stack.height - 1)).toBe(1);
    for (let row = 0; row <= stack.height; row++) {
      expect(engineRowFor(stack, bufferRowFor(stack, row))).toBe(row);
    }
  });

  /**
   * THE FRAME TABLE IS PANEL-ATTACK'S AND IS NOT OURS TO EDIT.
   *
   * The port is proved by two frame-exact replays and 234 recorded puzzle
   * solutions, all pinned to exactly these numbers. Shortening them to make
   * the game feel snappier would falsify every one of those oracles while
   * leaving the door's own tests green, because they would measure the new
   * numbers. A 2026-09-04 handoff records that being attempted; it never
   * reached main. The speed a player wants is a CHOICE, not an edit here.
   */
  it('keeps the engine frame table exactly as panel-attack ships it', () => {
    const normal = getClassicEndless('normal').frameConstants;
    expect([normal.FLASH, normal.FACE, normal.POP]).toEqual([36, 13, 8]);

    const hard = getClassicEndless('hard').frameConstants;
    expect([hard.FLASH, hard.FACE, hard.POP]).toEqual([22, 15, 7]);

    const modern10 = getModern(10).frameConstants;
    expect([modern10.FLASH, modern10.FACE, modern10.POP]).toEqual([28, 10, 7]);
  });

  /** The board is the same size on every screen; nothing is folded at 40. */
  it('keeps the board 12x13 on every screen', () => {
    const { cols, rows } = boardSize(makeStack());
    expect([cols, rows]).toEqual([12, 13]);
  });
});
