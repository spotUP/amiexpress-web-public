/**
 * How the game looks, and clearing a level.
 *
 * Reported live 2026-08-31: "the game seems to exit when i clear the level",
 * and a request to bring the field closer to the arcade - a blue playfield,
 * cyan outlines around claimed ground, and an animated marker rather than a
 * flat dot.
 *
 * The exit was not an exit: handleInput's `default` branch caught the
 * levelTransition state, so ANY keypress during the three-second hand-over
 * dropped the player back to the menu. Nothing rendered the transition
 * message either, so the field simply froze and then the game appeared to
 * quit.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { QixEngine } from '../game/qix-engine';
import { loadBackgroundForLevel } from '../game/background';
import { SuperQixData, Direction } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, SCREEN_WIDTH,
  BG_COLORS, MARKER_CYCLE, MARKER_CYCLE_FRAMES,
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
    activeEffects: [], borderPath: [], internalLines: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, timeMeter: 0, lastMultiplierAt: 0, lastMultiplier: 1,
    warp: null, transitionTimer: 0, transitionMessage: '',
  };
}

function startedEngine(): { engine: QixEngine; data: SuperQixData; frame: () => string } {
  const data = createData();
  let last = '';
  const engine = new QixEngine(data, c => { last = c; });
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];
  return { engine, data, frame: () => last };
}

function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/** The arcade playfield is a flat blue field, not black. */
export async function unclaimedGroundIsTheArcadeBlueField(): Promise<void> {
  const { engine, frame } = startedEngine();
  engine.render();

  assert.strictEqual(BG_COLORS.unclaimed, 'blue', 'the open field should be blue');
  assert.ok(frame().includes('{blue-bg}'), 'the rendered field should contain blue ground');
}

/** The marker animates rather than sitting there as one flat colour. */
export async function theMarkerCyclesThroughColours(): Promise<void> {
  const { engine, data, frame } = startedEngine();

  // startedEngine clears the enemies and there are no power-ups, so the
  // marker is the ONLY thing on the field painted in a cycle colour. That
  // is what makes searching the whole frame sound, and the per-frame count
  // below is what keeps it sound if anything else ever uses one.
  const seen = new Set<string>();
  for (let f = 0; f < MARKER_CYCLE.length * MARKER_CYCLE_FRAMES + 3; f++) {
    data.frameCount = f;
    engine.render();

    const present = MARKER_CYCLE.filter(colour => frame().includes(`{${colour}-bg}`));
    assert.strictEqual(
      present.length, 1,
      `frame ${f} painted ${present.length} cycle colours (${present.join(', ')}); ` +
      'the marker should be the only one'
    );
    seen.add(present[0]);
  }

  assert.strictEqual(
    seen.size, MARKER_CYCLE.length,
    `the marker showed ${seen.size} colours, expected all ${MARKER_CYCLE.length}: ${[...seen].join(', ')}`
  );
  for (const colour of MARKER_CYCLE) {
    assert.ok(seen.has(colour), `the marker never showed ${colour}`);
  }
}

/**
 * Clearing a level must SAY so. The field freezing silently for three
 * seconds is what made it look as though the game had quit.
 */
export async function clearingALevelShowsABanner(): Promise<void> {
  const { engine, data, frame } = startedEngine();

  data.state = 'levelTransition';
  data.transitionMessage = 'LEVEL 1 COMPLETE!';
  engine.render();

  const visible = frame().replace(/\{[^}]*\}/g, '');
  assert.ok(
    visible.includes('LEVEL 1 COMPLETE!'),
    'the level-clear message must actually be drawn on the field'
  );

  // And the banner must not break the layout.
  for (const row of frame().split('\n')) {
    assert.strictEqual(
      row.replace(/\{[^}]*\}/g, '').length, SCREEN_WIDTH,
      'the banner row must still be exactly the screen width'
    );
  }

  // While playing, no banner.
  data.state = 'playing';
  engine.render();
  assert.ok(
    !frame().replace(/\{[^}]*\}/g, '').includes('COMPLETE'),
    'the banner should only appear during the hand-over'
  );
}

/**
 * A keypress during the hand-over must not throw the player out of the game.
 */
export async function inputDuringTheLevelHandOverDoesNotReturnToTheMenu(): Promise<void> {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf-8');

  const handler = src.slice(src.indexOf('function handleInput('));
  const body = handler.slice(0, handler.indexOf('\n}'));

  assert.ok(
    /case "levelTransition":/.test(body),
    'handleInput must handle levelTransition, or the default branch sends the player to the menu'
  );
  assert.ok(
    !/default:\s*\n\s*showMenu\(\);/.test(body),
    'the default branch must not drop the player back to the menu on an unknown state'
  );
}

/**
 * A new level must start empty.
 *
 * Reported live: "levels should not have prefilled sections". The claim that
 * wins a level is a large one, and its remaining columns were still being
 * painted when initLevel built the next field - so the leftover coordinates
 * carried on filling in ground on a level the player had not touched.
 * Measured before the fix: 684 cells already claimed on a fresh level.
 */
export async function aNewLevelStartsWithNothingClaimed(): Promise<void> {
  const { engine, data } = startedEngine();

  // Queue a level-sized fill, as a winning claim does.
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
    for (let x = 1; x < FIELD_WIDTH - 1; x++) points.push({ x, y });
  }
  (engine as any).beginFill(points);
  assert.strictEqual(engine.isFilling(), true, 'the fill should be running');

  // The level is handed over while that paint is still in flight.
  engine.advanceLevel();
  assert.strictEqual(engine.isFilling(), false, 'the leftover paint must be abandoned');

  for (let tick = 0; tick < 30; tick++) engine.update();

  let claimed = 0;
  for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
    for (let x = 1; x < FIELD_WIDTH - 1; x++) {
      if (data.field[y][x] === 'claimed') claimed++;
    }
  }
  assert.strictEqual(claimed, 0, `the new level began with ${claimed} cells already claimed`);
}

/**
 * Clearing a level wipes the picture in from the right, taking the player's
 * lines with it, and finishes showing the whole image.
 */
export async function clearingALevelWipesThePictureInFromTheRight(): Promise<void> {
  const { engine, data, frame } = startedEngine();
  engine.setBackground(await loadBackgroundForLevel(1));
  engine.initLevel(1);
  data.state = 'playing';

  // Some claimed ground, which carries cyan outlines.
  for (let y = 6; y <= 10; y++) {
    for (let x = 4; x <= 12; x++) data.field[y][x] = 'claimed';
  }

  const artGlyphs = () => (frame().replace(/\{[^}]*\}/g, '').match(/[▀-▟]/g) || []).length;
  const blueGround = () => (frame().match(/\{blue-bg\}/g) || []).length;

  data.claimedPercent = 80;
  engine.update();
  assert.strictEqual(data.state, 'levelTransition', 'crossing the target should hand the level over');

  const atStart = artGlyphs();
  assert.ok(
    blueGround() > 0,
    'the unclaimed field should still be showing as the wipe begins'
  );

  // Part way through, more picture is showing than at the start.
  let steps = 0;
  let midway = 0;
  while (engine.advanceLevelOutro()) {
    steps++;
    if (steps === 12) midway = artGlyphs();
  }

  assert.ok(steps > 5, `the sequence should take several frames, took ${steps}`);
  assert.ok(midway > atStart, 'the picture should be appearing progressively, not at once');

  // The sequence ends on the intro panel, with the picture wiped away again
  // and the field bare and ready for the next round.
  assert.strictEqual(
    artGlyphs(), 0,
    'the picture should have been wiped away by the end of the sequence'
  );
  assert.strictEqual(engine.isRevealing(), false, 'the sequence should finish');
}

/**
 * Losing the last life must SAY so.
 *
 * Reported live: "there is no game over screen". Nothing drew the gameover
 * state at all - the board simply froze - and the door's loop only painted
 * while playing or handing a level over.
 */
export async function losingTheLastLifeShowsAGameOverScreen(): Promise<void> {
  const { engine, data, frame } = startedEngine();
  data.score = 12345;
  data.lives = 1;

  // A Gremlin on the marker, with the player exposed.
  data.qixList = [{
    id: 1, x: data.marker.x, y: data.marker.y, vx: 0, vy: 0, speed: 0,
    segments: [{ x: data.marker.x, y: data.marker.y }], frozen: true, frozenTimer: 999999,
  }];
  engine.handleDraw();
  engine.update();

  assert.strictEqual(data.lives, 0, 'the last life should be gone');
  assert.strictEqual(data.state, 'gameover', 'and the game should be over');

  const visible = () => frame().replace(/\{[^}]*\}/g, '');
  engine.render();

  assert.ok(visible().includes('GAME OVER'), 'the game-over screen must be drawn');
  assert.ok(visible().includes('12345'), 'it should show the final score');

  // The prompt blinks rather than sitting there.
  let withPrompt = 0;
  for (let f = 0; f < 40; f++) {
    data.frameCount = f;
    engine.render();
    if (visible().includes('PRESS ENTER')) withPrompt++;
  }
  assert.ok(withPrompt > 0, 'the prompt should appear');
  assert.ok(withPrompt < 40, 'and should blink rather than being permanently on');

  // The layout must survive it.
  for (const row of frame().split('\n')) {
    assert.strictEqual(row.replace(/\{[^}]*\}/g, '').length, SCREEN_WIDTH);
  }
}

/**
 * Claimed ground shows the PICTURE, not an outline over it.
 *
 * A cyan outline on every claimed cell touching open field covered 75% of a
 * small claim - and small boxes are what players draw - so the artwork was
 * hidden behind its own border.
 */
export async function claimedGroundShowsThePictureRatherThanAnOutline(): Promise<void> {
  const { engine, data, frame } = startedEngine();
  engine.setBackground(await loadBackgroundForLevel(1));
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];

  // A small claim, the kind a player actually makes.
  for (let y = 3; y <= 6; y++) {
    for (let x = 5; x <= 8; x++) data.field[y][x] = 'claimed';
  }
  engine.render();

  const artGlyphs = (frame().replace(/\{[^}]*\}/g, '').match(/[▀-▟]/g) || []).length;
  assert.ok(
    artGlyphs > 0,
    'a small claim should uncover picture, not be covered by an outline'
  );
  assert.ok(
    !frame().includes('{cyan-bg}'),
    'claimed cells must not be painted over with an outline colour'
  );
}

/** The HUD carries what the arcade shows: round, the word, and the ratio. */
export async function theHudShowsRoundWordAndRatio(): Promise<void> {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf-8');
  const hud = src.slice(src.indexOf('function formatHUD('), src.indexOf('function showMenu('));

  for (const label of ['SCORE', 'ROUND', 'RATIO']) {
    assert.ok(hud.includes(label), `the HUD should show ${label}`);
  }
  assert.ok(
    hud.includes('collectedLetters.includes'),
    'the HUD should pick out the letters already collected, as the arcade does'
  );
  assert.ok(hud.includes('targetPercent'), 'the ratio should be shown against what the level needs');
}
