/**
 * TetriNET board layout regression tests.
 *
 * Symptom (reported live 2026-08-25): "the tetrinet pieces land one row
 * below the bottom border".
 *
 * The sudden-death readout was created with createBox(), which draws a
 * border BY DEFAULT, positioned at row 23 - the board's last interior row -
 * and pushed to the front with setFront(). It was also created visible and
 * never hidden. So its border painted a second horizontal rule one row above
 * the board's real bottom border, permanently hiding the last playable row:
 * the field looked a row short and a piece resting on the floor appeared to
 * sit level with (or below) the frame.
 *
 * Sudden death is armed from the start of a match and counts down, so this
 * was not a rare end-game artefact - it covered a row for the whole game.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { OpponentBoards } from '../ui/tetrinet/opponent-boards';
import { createTetriNetBoard } from '../core/tetrinet/tetrinet-board';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };

function rendered(): { rows: string[]; destroy: () => void } {
  const screen: any = new Screen({ title: 'tnet-layout', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({});
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: inputStub, sounds, state: appState,
    network: null, playerName: 'sysop', aiController: null,
  } as any);

  engine.start?.();
  for (let i = 0; i < 3; i++) {
    engine.hardDrop?.();
    for (let f = 0; f < 30; f++) engine.update?.(16);
  }
  scr.render?.();
  screen.render();

  const rows: string[] = [];
  for (let y = 0; y < 28; y++) {
    const row = screen.buffer[y];
    rows.push(row ? row.map((c: [number, string]) => c[1]).join('').replace(/\s+$/, '') : '');
  }
  return { rows, destroy: () => screen.destroy() };
}

/** A row whose first 26 columns are the board's bottom frame. */
function isBottomBorder(row: string): boolean {
  return /^`-{24}'/.test(row);
}

export async function boardHasExactlyOneBottomBorder(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const borders = rows.filter(isBottomBorder);
    assert.strictEqual(borders.length, 1,
      `expected one bottom border, found ${borders.length} - a second rule means an overlay is covering a board row`);
  } finally { destroy(); }
}

export async function theLastPlayableRowIsVisible(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const bottomIdx = rows.findIndex(isBottomBorder);
    assert.ok(bottomIdx > 0, 'bottom border must be found');

    // The board is 22 interior rows with a frame around it, occupying rows
    // 0..23 of a 24-row terminal, so the last playable row is the one
    // immediately above the bottom frame and must be board content.
    const lastPlayable = rows[bottomIdx - 1];
    assert.ok(/^\|.{24}\|/.test(lastPlayable),
      `row above the bottom border should be board content, got ${JSON.stringify(lastPlayable.slice(0, 26))}`);
    assert.strictEqual(bottomIdx, 23, 'board occupies rows 0..23 (22 interior rows)');
  } finally { destroy(); }
}

export async function suddenDeathReadoutDoesNotSitOnTheBoard(): Promise<void> {
  // The original bug: this readout was parked ON the board's last interior
  // row with a default border, hiding a playable row for the whole match.
  // The invariant is about overlap, not about one specific row - it now
  // lives in the right-hand column.
  const { rows, destroy } = rendered();
  try {
    const sdIdx = rows.findIndex(r => /Sudden Death/i.test(r));
    if (sdIdx === -1) return; // not armed in this configuration

    const column = rows[sdIdx].search(/Sudden Death/i);
    assert.ok(column >= 26,
      `sudden-death readout must start right of the board (column >= 26), found at column ${column}`);
    assert.ok(/^\|.{24}\|/.test(rows[sdIdx]),
      'and the board frame on that row must be intact');
  } finally { destroy(); }
}

export async function nothingIsPaintedBelowTheTerminal(): Promise<void> {
  // The old layout put the board at top 1 with height 24 (bottom border on
  // row 25) and the stats bar at row 25 - so on a 24-row BBS terminal the
  // field looked bottomless and score/level/lines were nowhere at all.
  const { rows, destroy } = rendered();
  try {
    for (let y = 24; y < rows.length; y++) {
      assert.strictEqual(rows[y], '',
        `row ${y} is off a 24-row terminal but something painted there: ${JSON.stringify(rows[y])}`);
    }
  } finally { destroy(); }
}

export async function theScoreReadoutIsOnScreen(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const visible = rows.slice(0, 24).join('\n');
    assert.ok(/Score:/.test(visible), 'the score readout must be visible');
    assert.ok(/Level:/.test(visible) && /Lines:/.test(visible), 'so must level and lines');
  } finally { destroy(); }
}

export async function everyPanelFitsInEightyColumns(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    for (let y = 0; y < 24; y++) {
      assert.ok(rows[y].length <= 80,
        `row ${y} is ${rows[y].length} columns wide, past the 80-column terminal`);
    }
  } finally { destroy(); }
}

/** Visible characters of a tagged line. */
function visible(line: string): string {
  return line.replace(/\{[^}]*\}/g, '');
}

function miniBoardLines(fill: (board: any) => void): string[] {
  const screen: any = new Screen({ title: 'tnet-mini', width: 80, height: 30 });
  const boards: any = new OpponentBoards({ parent: screen, top: 0, left: 52, width: 28, height: 24 });
  const board: any = createTetriNetBoard(12, 22);
  fill(board);
  try {
    return boards.renderScaledBoard(board, true).split('\n');
  } finally {
    screen.destroy();
  }
}

export async function theMiniBoardFitsItsBox(): Promise<void> {
  // The scaler wrote board.width (12) characters into a SIX column box.
  const lines = miniBoardLines((b: any) => { b.grid[21][0].filled = true; });

  assert.strictEqual(lines.length, 8, 'eight scaled rows');
  for (const line of lines) {
    assert.strictEqual(visible(line).length, 6,
      `each scaled row must be six columns wide, got ${JSON.stringify(visible(line))}`);
  }
}

export async function theBottomOfTheStackIsVisible(): Promise<void> {
  // The old sampler started at row 4 and stepped 3 rows eight times, reading
  // rows 5..28 of a 22-row field: the bottom of the stack - the part that
  // says how close an opponent is to dying - was never drawn.
  const lines = miniBoardLines((b: any) => {
    for (let x = 0; x < 12; x++) b.grid[21][x].filled = true;
  });

  assert.ok(visible(lines[lines.length - 1]).includes('#'),
    'a filled bottom row must appear in the last scaled row');
}

export async function anEmptyFieldScalesToBlanks(): Promise<void> {
  const lines = miniBoardLines(() => {});

  assert.ok(lines.every(line => visible(line).trim() === ''),
    'an untouched field must scale to blanks, not noise');
}
