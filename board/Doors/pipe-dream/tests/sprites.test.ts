/**
 * Pipe Dream is drawn with sprites, and the water is visible.
 *
 * It drew flat ASCII on the terminal's own background: a pipe was a yellow
 * '|' and a pipe full of water was a cyan '|'. Empty and flooded differed by
 * the colour of one character - and that is the single most important thing
 * on the board, because the whole game is a race against water you can watch
 * coming. The water is the cell's background now, so a flooded run reads as
 * a channel of water with the pipe drawn through it.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CELL_WIDTH, FILLED_ABOVE, cellSprite, paint, asCursor, fillStage,
  BG_COLORS, PIPE_GLYPHS,
} from '../game/sprites';
import { PipeType } from '../game/types';

function visible(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

const ALL_PIPES = Object.keys(PIPE_GLYPHS) as PipeType[];

/** Every cell is exactly the grid's cell width - the grid depends on it. */
export async function everyCellIsExactlyThreeColumns(): Promise<void> {
  const cells = [
    cellSprite(null, 0, false),
    cellSprite(null, 0, true),
    ...ALL_PIPES.map(p => cellSprite(p, 0, false)),
    ...ALL_PIPES.map(p => cellSprite(p, 100, false)),
  ];

  for (const sprite of cells) {
    assert.strictEqual(
      sprite.text.length, CELL_WIDTH,
      `a cell is ${sprite.text.length} columns, not ${CELL_WIDTH}: ${JSON.stringify(sprite.text)}`
    );
    assert.strictEqual(visible(paint(sprite)).length, CELL_WIDTH, 'painted width must match');
    assert.strictEqual(visible(asCursor(sprite)).length, CELL_WIDTH, 'the cursor must not resize a cell');
  }
}

/**
 * A flooded pipe is a different BACKGROUND, not just a different letter
 * colour. This is the regression that matters: the old board showed the
 * water only as a foreground colour change.
 */
export async function waterFillsTheCellNotJustTheGlyph(): Promise<void> {
  const dry = cellSprite('vertical', 0, false);
  const partial = cellSprite('vertical', FILLED_ABOVE, false);
  const flooded = cellSprite('vertical', 100, false);

  assert.notStrictEqual(dry.bg, flooded.bg, 'a flooded pipe must not share a background with a dry one');
  assert.notStrictEqual(dry.bg, partial.bg, 'water on its way must be visible too');
  assert.notStrictEqual(partial.bg, flooded.bg, 'part-full and full must be distinguishable');
  assert.strictEqual(flooded.bg, BG_COLORS.flooded);
}

/** The fill threshold is honoured exactly as the engine states it. */
export async function theFillThresholdIsHonoured(): Promise<void> {
  assert.strictEqual(fillStage(0), 'dry');
  assert.strictEqual(fillStage(1), 'partial');
  assert.strictEqual(fillStage(FILLED_ABOVE), 'partial', 'exactly at the threshold is not yet flooded');
  assert.strictEqual(fillStage(FILLED_ABOVE + 1), 'flooded');
}

/** An obstacle can never be mistaken for open grid. */
export async function anObstacleIsUnmistakable(): Promise<void> {
  const obstacle = cellSprite(null, 0, true);
  const empty = cellSprite(null, 0, false);

  assert.notStrictEqual(obstacle.bg, empty.bg);
  assert.notStrictEqual(obstacle.text, empty.text);
}

/** The source shows which way it will push water. */
export async function theStartCellShowsItsDirection(): Promise<void> {
  for (const arrow of ['>', '<', '^', 'v']) {
    const sprite = cellSprite('start', 0, false, arrow);
    assert.ok(
      sprite.text.includes(arrow),
      `the start cell should show ${arrow}, got ${JSON.stringify(sprite.text)}`
    );
    assert.strictEqual(sprite.text.length, CELL_WIDTH);
  }
}

/**
 * Every pipe is drawn ASCII.
 *
 * The board goes down a BBS line where a high-bit box-drawing character is a
 * different glyph depending on the client's font. A pipe that renders as an
 * accented letter on somebody's terminal is worse than a plain one.
 */
export async function everyPipeIsPlainAscii(): Promise<void> {
  for (const pipe of ALL_PIPES) {
    for (const ch of PIPE_GLYPHS[pipe]) {
      const code = ch.charCodeAt(0);
      assert.ok(
        code >= 0x20 && code <= 0x7e,
        `${pipe} uses a non-ASCII character (0x${code.toString(16)}) that will not render the same everywhere`
      );
    }
  }
}

/** Corners are drawn as bends, not as letters. */
export async function cornersAreDrawnAsBendsNotLetters(): Promise<void> {
  for (const corner of ['cornerNE', 'cornerNW', 'cornerSE', 'cornerSW'] as PipeType[]) {
    assert.ok(
      !/[A-Za-z]/.test(PIPE_GLYPHS[corner]),
      `${corner} is drawn as ${JSON.stringify(PIPE_GLYPHS[corner])} - a letter is not a pipe bend`
    );
  }
}

/** The renderer paints sprites rather than hand-built strings. */
export async function theRendererUsesTheSpriteLayer(): Promise<void> {
  const game = readFileSync(join(__dirname, '..', 'game', 'pipe-dream-game.ts'), 'utf8');

  assert.ok(/cellSprite\(/.test(game), 'the renderer should ask for a cell sprite');
  assert.ok(/asCursor\(/.test(game), 'and draw the cursor through the same layer');
  assert.ok(
    !/cellStr = '\{gray-fg\}XXX\{\/\}'/.test(game),
    'the old hand-built cell strings should be gone'
  );
}
