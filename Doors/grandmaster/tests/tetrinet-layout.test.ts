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
import { readFileSync } from 'fs';
import { join } from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { OpponentBoards } from '../ui/tetrinet/opponent-boards';
import { createTetriNetBoard } from '../core/tetrinet/tetrinet-board';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };

function rendered(): { rows: string[]; destroy: () => void; height: number } {
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
  // Screen clamps a BBS terminal to at most 25 rows, so the harness gets
  // 25 whatever it asks for.
  return { rows, destroy: () => screen.destroy(), height: screen.height };
}

/** Every painted row of a screen, as strings. */
function rowsOf(screen: any): string[] {
  const rows: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    const row = screen.buffer[y];
    rows.push(row ? row.map((c: [number, string]) => c[1]).join('') : '');
  }
  return rows;
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
  // row 25) and the stats bar at row 25 - so on a BBS terminal the field
  // looked bottomless and score/level/lines were nowhere at all.
  const { rows, destroy, height } = rendered();
  try {
    for (let y = height; y < rows.length; y++) {
      assert.strictEqual(rows[y], '',
        `row ${y} is off a ${height}-row terminal but something painted there: ${JSON.stringify(rows[y])}`);
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

export async function theLandingShadowIsDrawn(): Promise<void> {
  // Reported live: "there are no ghost blocks in tetrinet, it makes it hard
  // to aim". The engine has exposed getGhostY() all along - hardDrop uses
  // it - but the screen never drew one.
  const screen: any = new Screen({ title: 'tnet-ghost', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({} as any, { delayBeforeSuddenDeath: 0 } as any);
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: { on() {}, off() {}, setEnabled() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: null,
  } as any);
  try {
    engine.start();
    scr.render();

    const painted = screen.buffer.slice(0, 24)
      .map((row: any) => row.map((c: [number, string]) => c[1]).join(''))
      .join('\n');

    assert.ok(painted.includes('░░'),
      'the resting position of the falling piece must be shown on the field');
  } finally { screen.destroy(); }
}

export async function theShadowSitsWhereThePieceWillLand(): Promise<void> {
  const engine: any = new TetriNetEngine({} as any, { delayBeforeSuddenDeath: 0 } as any);
  engine.start();

  const piece = engine.getState().currentPiece;
  const ghostY = engine.getGhostY();

  assert.ok(ghostY !== null, 'a falling piece has a landing row');
  assert.ok(ghostY > piece.y, 'which is below the piece on an empty field');

  engine.hardDrop();
  const filledRows = engine.getBoard().grid
    .map((row: any, y: number) => ({ y, n: row.filter((c: any) => c.filled).length }))
    .filter((r: any) => r.n > 0)
    .map((r: any) => r.y);

  assert.ok(filledRows.includes(ghostY),
    `a hard drop must lock where the shadow was (row ${ghostY}), got rows ${JSON.stringify(filledRows)}`);
}

export async function bothScreensDrawTheSameEffects(): Promise<void> {
  // The TetriNET ghost started life as a lookalike ('::' in grey) with no
  // motion blur at all, while the main modes had both. They now draw from
  // ui/board-effects.ts; this guards against a second private copy.
  const dir = join(__dirname, '..', 'ui');
  const main = readFileSync(join(dir, 'game-screen.ts'), 'utf8');
  const tnet = readFileSync(join(dir, 'tetrinet-screen.ts'), 'utf8');

  for (const [name, src] of [['game-screen', main], ['tetrinet-screen', tnet]] as const) {
    assert.ok(/from '\.\/board-effects'/.test(src),
      `${name} must draw its shadow and blur from the shared module`);
    assert.ok(src.includes('GHOST_CHAR'),
      `${name} must use the shared landing-shadow character`);
    assert.ok(!/\{gray-fg\}(::|░░)\{\/gray-fg\}/.test(src),
      `${name} must not hardcode its own landing shadow`);
    assert.ok(src.includes('trailCharAt('),
      `${name} must draw the shared hard-drop blur`);
  }
}

export async function aHardDropLeavesAStreak(): Promise<void> {
  const screen: any = new Screen({ title: 'tnet-blur', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 } as any);
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: { on() {}, off() {}, setEnabled() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: null,
  } as any);
  try {
    engine.start();
    scr.recordHardDropTrail();

    assert.ok(scr.hardDropTrails.length > 0,
      'slamming a piece down must leave a streak behind it');

    engine.hardDrop();
    scr.render();
    const painted = screen.buffer.slice(0, 24)
      .map((row: any) => row.map((c: [number, string]) => c[1]).join(''))
      .join('\n');

    assert.ok(/░░|██/.test(painted), 'and the field still paints blocks');
  } finally { screen.destroy(); }
}

export async function theScreenDoesNotRepaintOnEveryTick(): Promise<void> {
  // Reported live: the motion blur stuttered. The loop repainted a 12x22
  // field on every 16ms tick - 60 full repaints a second, three times what
  // the versus screen sends - and the per-cell shadow and blur work pushed
  // it over what a BBS connection absorbs. Versus solved this long ago with
  // a 20fps background rate plus render-on-input.
  const source = readFileSync(join(__dirname, '..', 'ui', 'tetrinet-screen.ts'), 'utf8');

  assert.ok(/RENDER_INTERVAL\s*=\s*50/.test(source),
    'the background repaint rate must be throttled like the versus screen');
  assert.ok(/now - this\.lastRender >= TetriNetScreen\.RENDER_INTERVAL/.test(source),
    'and the loop must respect it');
  assert.ok(/private renderNow\(\)/.test(source) && /const act = /.test(source),
    'with input actions repainting immediately, so the throttle is invisible');
}

export async function noBlackBandOnATwentyFiveRowTerminal(): Promise<void> {
  // A BBS terminal is 24 or 25 rows. The layout is built for 24, so on a
  // 25-row terminal the last row was left unpainted and showed as a black
  // band under everything - reported live.
  const screen: any = new Screen({ title: 'tnet-25', width: 80, height: 25 });
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0 } as any);
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: { on() {}, off() {}, setEnabled() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: null,
  } as any);

  try {
    engine.start();
    scr.render();

    const rows: string[] = [];
    for (let y = 0; y < screen.height; y++) {
      rows.push((screen.buffer[y] || []).map((c: [number, string]) => c[1]).join('').trim());
    }

    for (let y = 0; y < screen.height; y++) {
      assert.notStrictEqual(rows[y], '',
        `row ${y} of ${screen.height} is blank - that is the black band`);
    }
  } finally { screen.destroy(); }
}

export async function anIncomingHitNeverCoversTheField(): Promise<void> {
  // Reported live: "a black band in the middle of the playfield, as if a
  // line was cleared". showIncomingWarning built a 30x5 black box in the
  // CENTRE of the screen - wider than the 26-column board - for a second at
  // a time, and once specials and garbage were actually routed it fired on
  // every hit. Against three bots it was on screen almost permanently.
  const screen: any = new Screen({ title: 'tnet-notice', width: 80, height: 25 });
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 } as any);
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: { on() {}, off() {}, setEnabled() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: null,
  } as any);

  try {
    engine.start();
    scr.render();
    const boardBefore = rowsOf(screen).slice(1, 23).map(r => r.slice(0, 26));

    scr.effectOverlay.showIncomingWarning('Nuke Field');
    scr.render();

    const boardAfter = rowsOf(screen).slice(1, 23).map(r => r.slice(0, 26));
    assert.deepStrictEqual(boardAfter, boardBefore,
      'announcing a hit must not paint over the playfield');

    const right = rowsOf(screen).map(r => r.slice(26)).join('\n');
    assert.ok(/Nuke Field/.test(right), 'it is announced beside the board instead');
  } finally { screen.destroy(); }
}

export async function aBlockedSpecialIsAnnouncedTheSameWay(): Promise<void> {
  const screen: any = new Screen({ title: 'tnet-blocked', width: 80, height: 25 });
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 } as any);
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: { on() {}, off() {}, setEnabled() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: null,
  } as any);

  try {
    engine.start();
    scr.render();
    const before = rowsOf(screen).slice(1, 23).map(r => r.slice(0, 26));

    scr.effectOverlay.showImmunityBlocked();
    scr.render();

    assert.deepStrictEqual(
      rowsOf(screen).slice(1, 23).map(r => r.slice(0, 26)), before,
      'a blocked special must not cover the field either');
  } finally { screen.destroy(); }
}
