/**
 * Where the marker is allowed to walk.
 *
 * Reported live 2026-08-30: "I can move freely in Qix, I should only be able
 * to move along the outer frame until I have drawn a path."
 *
 * FAQ 2.1: the marker moves "only along either the border (if no area has
 * been claimed in front of it) or the inside edges of any areas you have
 * successfully marked off", and FAQ 1: "internal lines become inaccessible".
 *
 * The door allowed ANY claimed cell, so once a region was claimed the player
 * could wander around inside it. Walkable is now: the outer frame, plus
 * claimed cells that still border unclaimed ground.
 *
 * Covers USER-1, FAQ-1f and FAQ-2.1a.
 */

import assert from 'assert';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData, Direction } from '../game/types';
import { FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES } from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false, drawSpeed: null,
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

function startedEngine(): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => {});
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];
  return { engine, data };
}

/** Bypasses the move-rate throttle so a test can step deterministically. */
function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/**
 * At the start of a level nothing is claimed, so the marker must be able to
 * walk the frame and nothing else.
 */
export async function beforeDrawingTheMarkerIsConfinedToTheOuterFrame(): Promise<void> {
  const { engine, data } = startedEngine();

  // FAQ-1c: "a small diamond-shaped marker which starts at the center of the
  // bottom border".
  assert.strictEqual(data.marker.y, FIELD_HEIGHT - 1, 'marker should start on the bottom border');
  assert.strictEqual(
    data.marker.x, Math.floor(FIELD_WIDTH / 2),
    'marker should start at the CENTRE of the bottom border'
  );
  assert.strictEqual(
    data.field[data.marker.y][data.marker.x], 'border',
    'the starting cell should be part of the frame'
  );

  // Along the frame: allowed.
  const startX = data.marker.x;
  move(engine, 'left');
  assert.strictEqual(data.marker.x, startX - 1, 'moving along the bottom frame should work');
  assert.strictEqual(data.marker.y, FIELD_HEIGHT - 1);

  // Off the frame into open field without drawing: refused.
  const before = { x: data.marker.x, y: data.marker.y };
  move(engine, 'up');
  assert.deepStrictEqual(
    { x: data.marker.x, y: data.marker.y }, before,
    'stepping off the frame into unclaimed area without drawing must be refused'
  );
}

/**
 * The whole frame is walkable, all the way round.
 */
export async function theEntireFrameIsWalkable(): Promise<void> {
  const { engine, data } = startedEngine();

  // Walk left along the bottom edge to the corner, then up the left edge.
  for (let i = 0; i < FIELD_WIDTH; i++) move(engine, 'left');
  assert.strictEqual(data.marker.x, 0, 'should reach the bottom-left corner');

  for (let i = 0; i < FIELD_HEIGHT; i++) move(engine, 'up');
  assert.strictEqual(data.marker.y, 0, 'should reach the top-left corner');

  for (let i = 0; i < FIELD_WIDTH; i++) move(engine, 'right');
  assert.strictEqual(data.marker.x, FIELD_WIDTH - 1, 'should reach the top-right corner');
}

/**
 * The reported bug: claimed ground is walkable only at its edge, never
 * through the middle.
 */
export async function theInteriorOfClaimedGroundIsNotWalkable(): Promise<void> {
  const { engine, data } = startedEngine();

  // Claim a solid block against the bottom frame, 5 wide and 5 tall.
  const x0 = 10, x1 = 14;
  const y0 = FIELD_HEIGHT - 6, y1 = FIELD_HEIGHT - 2;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) data.field[y][x] = 'claimed';
  }

  const drawing: any = (engine as any).drawingSystem;

  // The top row of the block borders unclaimed area: walkable.
  assert.strictEqual(
    drawing.isWalkable({ x: 12, y: y0 }), true,
    'the edge of claimed ground must be walkable'
  );

  // Its middle is surrounded by claimed ground: not walkable.
  assert.strictEqual(
    drawing.isWalkable({ x: 12, y: y0 + 2 }), false,
    'the inside of a claimed region must NOT be walkable'
  );

  // And the marker cannot actually step into it.
  data.marker.x = 12;
  data.marker.y = y0;
  move(engine, 'down');
  assert.strictEqual(
    data.marker.y, y0,
    'the marker walked into the interior of claimed ground'
  );
}

/**
 * A marker buried by its own claim must still be able to get out, or the
 * game would softlock.
 */
export async function aMarkerBuriedByItsOwnClaimCanEscape(): Promise<void> {
  const { engine, data } = startedEngine();

  for (let y = FIELD_HEIGHT - 6; y <= FIELD_HEIGHT - 2; y++) {
    for (let x = 10; x <= 14; x++) data.field[y][x] = 'claimed';
  }

  const drawing: any = (engine as any).drawingSystem;
  const buried = { x: 12, y: FIELD_HEIGHT - 4 };
  assert.strictEqual(drawing.isWalkable(buried), false, 'this cell should be buried');

  data.marker.x = buried.x;
  data.marker.y = buried.y;
  move(engine, 'up');

  assert.notStrictEqual(
    data.marker.y, buried.y,
    'a marker with no legal move must still be able to leave a buried cell'
  );
}

/**
 * The Sparx patrol path and the player must agree on what an edge is, or
 * enemies would walk where the player cannot follow.
 */
export async function theSparxPathUsesTheSameEdgeDefinition(): Promise<void> {
  const { engine, data } = startedEngine();

  for (let y = FIELD_HEIGHT - 6; y <= FIELD_HEIGHT - 2; y++) {
    for (let x = 10; x <= 14; x++) data.field[y][x] = 'claimed';
  }

  const path: Array<{ x: number; y: number }> = (engine as any).updateBorderPath();
  const drawing: any = (engine as any).drawingSystem;

  for (const point of path) {
    const cell = data.field[point.y][point.x];
    if (cell === 'border') continue;
    assert.strictEqual(
      drawing.touchesUnclaimed(point.x, point.y), true,
      `patrol path includes buried cell (${point.x}, ${point.y})`
    );
  }

  // The buried middle must not be on the patrol path either.
  const buried = path.find(p => p.x === 12 && p.y === FIELD_HEIGHT - 4);
  assert.strictEqual(buried, undefined, 'a buried cell must not be on the patrol path');
}
