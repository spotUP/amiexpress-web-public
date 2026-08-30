/**
 * Drawing a line, and the fill that follows it.
 *
 * Covers USER-2 (the drawn line must be visible), USER-3 (a completed fill
 * sweeps right to left rather than appearing at once), FAQ-2.1d (the line is
 * yellow while it is being drawn), FAQ-2.1e (it becomes safe ground once it
 * reconnects) and FAQ-2.5.3d (Super Qix has ONE draw button, not a slow and
 * a fast one).
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData, Direction } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, BG_COLORS, FILL_ANIMATION_FRAMES,
} from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,
    qixList: [], sparxList: [], fuse: null, qixIdCounter: 0, sparxIdCounter: 0,
    powerUps: [], powerUpIdCounter: 0, collectedLetters: [], levelWord: '',
    activeEffects: [], borderPath: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, transitionTimer: 0, transitionMessage: '',
  };
}

function startedEngine(): { engine: QixEngine; data: SuperQixData; frame: () => string } {
  const data = createData();
  let last = '';
  const engine = new QixEngine(data, content => { last = content; });
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  // One frozen Qix well away from the drawing, so a closed shape has a
  // region to exclude - without one, closing anything claims the whole board.
  data.qixList = [{
    id: 1, x: 5, y: 5, vx: 0, vy: 0, speed: 0,
    segments: [{ x: 5, y: 5 }], frozen: true, frozenTimer: 999999,
  }];
  return { engine, data, frame: () => last };
}

function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/** Draw out from the bottom frame and back to it, closing a small box. */
function drawSmallBox(engine: QixEngine): void {
  engine.handleDraw();
  move(engine, 'up'); move(engine, 'up'); move(engine, 'up');
  move(engine, 'right'); move(engine, 'right'); move(engine, 'right');
  move(engine, 'down'); move(engine, 'down'); move(engine, 'down');
}

/**
 * USER-2 / FAQ-2.1d: the line has to be visible while it is being drawn,
 * and it is yellow.
 */
export async function theLineBeingDrawnIsVisibleAndYellow(): Promise<void> {
  const { engine, data, frame } = startedEngine();

  engine.handleDraw();
  move(engine, 'up');
  move(engine, 'up');
  engine.render();

  assert.ok(data.currentStix, 'a stix should exist while drawing');
  assert.ok(data.currentStix!.points.length >= 2, 'the stix should have length');

  const painted = frame();
  assert.ok(
    painted.includes(`{${BG_COLORS.stix}-bg}`),
    `the drawn line must be painted in ${BG_COLORS.stix}; it was not in the frame at all`
  );
  assert.strictEqual(BG_COLORS.stix, 'yellow', 'FAQ 2.1: the line you draw is yellow');
}

/**
 * FAQ-2.1e: once the shape closes the line stops being a stix and becomes
 * safe ground the marker can stand on.
 */
export async function aClosedLineBecomesSafeGround(): Promise<void> {
  const { engine, data } = startedEngine();

  drawSmallBox(engine);

  assert.strictEqual(data.marker.isDrawing, false, 'closing the shape ends drawing');
  assert.strictEqual(data.currentStix, null, 'the stix is consumed when it closes');

  // No cell anywhere may still be in the transient 'stix' state.
  let remaining = 0;
  for (let y = 0; y < FIELD_HEIGHT; y++) {
    for (let x = 0; x < FIELD_WIDTH; x++) if (data.field[y][x] === 'stix') remaining++;
  }
  assert.strictEqual(remaining, 0, `${remaining} cells were left as unfinished stix`);

  const drawing: any = (engine as any).drawingSystem;
  assert.strictEqual(
    drawing.isWalkable({ x: data.marker.x, y: data.marker.y }), true,
    'the marker must be standing on safe ground after closing a shape'
  );
}

/**
 * USER-3: the won area is painted in over several frames, sweeping from the
 * RIGHT edge of the claim towards the left, rather than appearing at once.
 */
export async function aCompletedFillSweepsFromRightToLeft(): Promise<void> {
  const { engine, data } = startedEngine();

  // A wide box, so the enclosed area spans enough columns for the sweep to
  // be observable. The stix itself becomes safe ground the moment the shape
  // closes - only the area INSIDE it is painted in over time, so the sweep
  // has to be measured on the cells that change per tick, not on the total.
  engine.handleDraw();
  for (let i = 0; i < 6; i++) move(engine, 'up');
  for (let i = 0; i < 14; i++) move(engine, 'right');
  for (let i = 0; i < 6; i++) move(engine, 'down');

  assert.strictEqual(engine.isFilling(), true, 'a claim should still be filling in');

  const snapshot = () => {
    const claimed = new Set<string>();
    for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
      for (let x = 1; x < FIELD_WIDTH - 1; x++) {
        if (data.field[y][x] === 'claimed') claimed.add(`${x},${y}`);
      }
    }
    return claimed;
  };

  // Mean x of the cells that turn claimed on each tick.
  const meanXPerTick: number[] = [];
  let previous = snapshot();

  for (let tick = 0; tick < FILL_ANIMATION_FRAMES + 6 && engine.isFilling(); tick++) {
    engine.update();
    const current = snapshot();

    const added: number[] = [];
    for (const key of current) {
      if (!previous.has(key)) added.push(Number(key.split(',')[0]));
    }
    if (added.length > 0) {
      meanXPerTick.push(added.reduce((a, b) => a + b, 0) / added.length);
    }
    previous = current;
  }

  assert.ok(
    meanXPerTick.length >= 2,
    `the fill should paint over several frames; it painted on ${meanXPerTick.length}`
  );

  const first = meanXPerTick[0];
  const last = meanXPerTick[meanXPerTick.length - 1];
  assert.ok(
    first > last,
    `the fill must sweep right to left: it started at mean column ${first.toFixed(1)} ` +
    `and ended at ${last.toFixed(1)}`
  );

  assert.strictEqual(engine.isFilling(), false, 'the fill should finish');
}

/** The score is credited when the shape closes, not when the paint catches up. */
export async function theAreaIsScoredImmediatelyEvenThoughItPaintsSlowly(): Promise<void> {
  const { engine, data } = startedEngine();

  drawSmallBox(engine);

  assert.ok(data.claimedPercent > 0, 'the percentage should be credited on closing');
  assert.strictEqual(engine.isFilling(), true, 'and the paint should still be running');
}

/**
 * FAQ-2.5.3d: "There's no longer an option to complete lines quickly for
 * safety or slowly for extra points." One draw button, one rate.
 */
export async function thereIsOnlyOneDrawButton(): Promise<void> {
  const engine: any = new QixEngine(createData(), () => {});

  assert.strictEqual(typeof engine.handleDraw, 'function', 'the door needs a single draw entry point');
  assert.strictEqual(engine.handleSlowDraw, undefined, 'slow draw must be gone');
  assert.strictEqual(engine.handleFastDraw, undefined, 'fast draw must be gone');

  const { engine: running, data } = startedEngine();
  running.handleDraw();
  assert.strictEqual(data.marker.isDrawing, true, 'the draw button should detach the marker');
  assert.ok(data.currentStix, 'and start a stix');
  assert.ok(
    !('speed' in (data.currentStix as any)),
    'a stix should no longer carry a draw speed'
  );
}
