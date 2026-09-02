/**
 * HIDDEN - locked blocks vanish while staying solid.
 *
 * HeborisCE's shadow timer: p_shadow_timer frames on lock (init.c:732 = 300,
 * gamestart.c:16224-16225), counted down once a frame at 1, 2 or 3 per tick
 * depending on the hidden level (gamestart.c:4794-4803). A block at zero is
 * invisible and still there.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { GameScreen } from '../ui/game-screen';
import { createBoard } from '../core/board';
import { SHADOW_TIMER_FRAMES, shadowDecayRate, isCellHidden } from '../core/hidden';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
  blockGlow: false, glowIntensity: 0, clearStyle: 'instant', clearDirection: 'in',
  clearAnimationSpeed: 1, placementEffects: false, floatTextMode: 'off',
  b2bGlowEnabled: false, connectedBlocks: false, animationIntensity: 'normal',
};

function lockedCells(engine: any): any[] {
  const cells: any[] = [];
  for (const row of engine.getState().board.grid) {
    for (const cell of row) if (cell.filled) cells.push(cell);
  }
  return cells;
}

export async function theRatesAreTheReferencesOwn(): Promise<void> {
  assert.strictEqual(SHADOW_TIMER_FRAMES, 300, 'init.c:732 p_shadow_timer');
  assert.strictEqual(shadowDecayRate('OFF'), 0);
  assert.strictEqual(shadowDecayRate(undefined), 0, 'no setting at all is off');
  assert.strictEqual(shadowDecayRate('SLOW'), 1, 'gamestart.c:4801');
  assert.strictEqual(shadowDecayRate('FAST'), 2, 'UNDER M2, gamestart.c:4799');
  assert.strictEqual(shadowDecayRate('FASTEST'), 3, 'UNDER M3, gamestart.c:4797');
}

export async function hiddenOffLeavesCellsWithNoTimerAtAll(): Promise<void> {
  const engine: any = new GameEngine('marathon', settings, sounds);
  engine.start();
  engine.hardDrop();
  for (const cell of lockedCells(engine)) {
    assert.strictEqual(cell.shadowFrames, undefined, 'no HIDDEN, no timer');
    assert.strictEqual(isCellHidden(cell), false);
  }
}

export async function aLockedBlockRunsOutAndGoesInvisible(): Promise<void> {
  const engine: any = new GameEngine('marathon', { ...settings, hiddenMode: 'SLOW' }, sounds);
  engine.start();
  engine.hardDrop();

  const cells = lockedCells(engine);
  assert.ok(cells.length > 0, 'the piece must have locked');
  for (const cell of cells) assert.strictEqual(cell.shadowFrames, SHADOW_TIMER_FRAMES);

  for (let frame = 0; frame < SHADOW_TIMER_FRAMES - 1; frame++) engine.update(1000 / 60);
  assert.ok(!isCellHidden(cells[0]), 'still visible one frame short of the timer');

  engine.update(1000 / 60);
  assert.ok(isCellHidden(cells[0]), 'and invisible when it runs out');
  assert.strictEqual(cells[0].filled, true, 'but the block is still there');
}

export async function theFasterModesRunOutSooner(): Promise<void> {
  for (const [mode, frames] of [['FAST', 150], ['FASTEST', 100]] as const) {
    const engine: any = new GameEngine('marathon', { ...settings, hiddenMode: mode }, sounds);
    engine.start();
    engine.hardDrop();
    const cell = lockedCells(engine)[0];

    for (let frame = 0; frame < frames - 1; frame++) engine.update(1000 / 60);
    assert.ok(!isCellHidden(cell), `${mode} must still be visible at ${frames - 1} frames`);
    engine.update(1000 / 60);
    assert.ok(isCellHidden(cell), `${mode} must be hidden by ${frames} frames`);
  }
}

export async function theBoardStopsDrawingAHiddenBlock(): Promise<void> {
  // Through the real renderer: the same board, painted before and after the
  // timer runs out, must lose the block from the content it produces.
  const screen: any = new Screen({ title: 'hidden', width: 80, height: 30 });
  try {
    const appState: any = { currentMode: 'marathon', playerName: 'sysop',
      settings: { ...settings, hiddenMode: 'SLOW' } };
    const engine: any = new GameEngine('marathon', appState.settings, sounds);
    engine.start();
    const gameScreen: any = new GameScreen(screen, engine, null, sounds, appState, null);
    gameScreen.setupUI();

    engine.getState().board.grid =
      createBoard(engine.getState().board.width, engine.getState().board.height).grid;
    engine.hardDrop();

    // Only the LOCKED stack is under test - a falling piece would put its own
    // blocks back into the count and hide the difference.
    engine.getState().currentPiece = null;
    gameScreen.render();
    const painted = gameScreen.boardBox.getContent();

    for (let frame = 0; frame < SHADOW_TIMER_FRAMES; frame++) engine.update(1000 / 60);
    engine.getState().currentPiece = null;
    gameScreen.render();
    const faded = gameScreen.boardBox.getContent();

    assert.notStrictEqual(painted, faded, 'the board must repaint without the block');
    const blocks = (s: string) => (s.match(/█/g) ?? []).length;
    assert.ok(blocks(faded) < blocks(painted),
      `hidden board still draws ${blocks(faded)} blocks against ${blocks(painted)} before`);
  } finally { screen.destroy(); }
}
