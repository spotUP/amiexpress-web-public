/**
 * The CPU player.
 *
 * The bot plays through the same door the player does - it emits an input mask
 * per frame and never touches the board - so the real test is simply to let it
 * play and check that it does something coherent.
 *
 * Its quality is deliberately modest: it does not search or evaluate, and the
 * player who described the original called the level 7 CPU "extremely
 * inefficient". These tests pin that it PLAYS, not that it plays well.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getClassicEndless } from '../../core/panels/level-data';
import { PanelAi, AI_LEVELS, MAX_AI_LEVEL } from '../../ai/panel-ai';
import { encodeInput, maskToInputState } from '../../core/panels/input-codec';

function makeStack(seed = 20260903): Stack {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(seed, true),
  });
  stack.startingState();
  return stack;
}

/** Play `frames` frames with the bot driving, and report what happened. */
function playWithAi(stack: Stack, ai: PanelAi, frames: number): {
  actions: number; frames: number;
} {
  let actions = 0;
  let played = 0;
  for (let i = 0; i < frames && !stack.gameEnded(); i++) {
    const mask = ai.update();
    if (mask !== 0) actions += 1;
    stack.receiveConfirmedInput(encodeInput(mask));
    stack.run();
    played += 1;
  }
  return { actions, frames: played };
}

export async function thereAreEightCpuLevels(): Promise<void> {
  assert.strictEqual(AI_LEVELS.length, 8, 'the original has CPU LEVEL 0 to 7');
  assert.strictEqual(MAX_AI_LEVEL, 7);
  assert.strictEqual(
    AI_LEVELS[5].thinkInterval, 5,
    "level 5 is panel-pop's own hardcoded speed, so it is the calibrated middle",
  );
}

/** Levels differ only in pace. The decision logic is identical throughout. */
export async function higherLevelsActMoreOften(): Promise<void> {
  for (let level = 1; level <= MAX_AI_LEVEL; level++) {
    assert.ok(
      AI_LEVELS[level].thinkInterval <= AI_LEVELS[level - 1].thinkInterval,
      `level ${level} should not think slower than level ${level - 1}`,
    );
  }
  assert.ok(AI_LEVELS[MAX_AI_LEVEL].thinkInterval < AI_LEVELS[0].thinkInterval);
}

export async function aSlowCpuActsLessOftenThanAFastOne(): Promise<void> {
  const slow = playWithAi(makeStack(), new PanelAi(makeStack(), 0), 0);
  assert.strictEqual(slow.frames, 0, 'sanity: the helper runs no frames when asked for none');

  const slowStack = makeStack();
  const slowActions = playWithAi(slowStack, new PanelAi(slowStack, 0), 600).actions;

  const fastStack = makeStack();
  const fastActions = playWithAi(fastStack, new PanelAi(fastStack, 7), 600).actions;

  assert.ok(
    fastActions > slowActions,
    `level 7 (${fastActions} actions) should act more than level 0 (${slowActions})`,
  );
}

/** Every mask it produces has to be a legal input character. */
export async function everyActionIsAValidInput(): Promise<void> {
  const stack = makeStack();
  const ai = new PanelAi(stack, 7);

  for (let i = 0; i < 900 && !stack.gameEnded(); i++) {
    const mask = ai.update();
    assert.ok(mask >= 0 && mask <= 63, `mask out of range: ${mask}`);
    // It must round-trip through the codec, since that is how it reaches the engine.
    const state = maskToInputState(mask);
    assert.strictEqual(typeof state.swap, 'boolean');
    stack.receiveConfirmedInput(encodeInput(mask));
    stack.run();
  }
}

/**
 * The real test: let it play. It should clear panels, which means its swaps are
 * landing real matches rather than flailing.
 */
export async function theCpuActuallyPlaysAndClearsPanels(): Promise<void> {
  const stack = makeStack();
  const ai = new PanelAi(stack, 5);

  playWithAi(stack, ai, 3000);

  assert.ok(stack.panelsCleared > 0, 'it cleared panels');
  assert.ok(stack.score > 0, 'and scored for them');
  assert.ok(stack.swapCount > 0, 'by swapping, like a player');
}

/** It plays every level without faulting, whatever the board throws at it. */
export async function everyLevelPlaysWithoutFaulting(): Promise<void> {
  for (let level = 0; level <= MAX_AI_LEVEL; level++) {
    const stack = makeStack(1000 + level);
    const ai = new PanelAi(stack, level);
    playWithAi(stack, ai, 1200);
    assert.ok(stack.clock > 0, `level ${level} ran`);
  }
}

/**
 * With nothing to build from, the bot feeds itself a new row rather than
 * standing still - which is what stops it stalling on a sparse board.
 */
export async function anEmptyBoardMakesItRaise(): Promise<void> {
  const stack = makeStack();
  // Clear the board completely: no colour appears on any three rows.
  for (let row = 1; row <= stack.height; row++) {
    for (let col = 1; col <= stack.width; col++) {
      stack.panels[row][col].color = 0;
      stack.panels[row][col].state = 'normal';
    }
  }

  const ai = new PanelAi(stack, 5);
  let sawRaise = false;
  for (let i = 0; i < 60 && !sawRaise; i++) {
    if (maskToInputState(ai.update()).raise) sawRaise = true;
    stack.receiveConfirmedInput(encodeInput(0));
    stack.run();
  }

  assert.ok(sawRaise, 'it pressed raise rather than idling');
}

/**
 * The bot is bound by the same rules as a player - it goes through the input
 * path, so it cannot swap while the countdown is running or on frame one.
 */
export async function theCpuIsBoundByTheSameRulesAsAPlayer(): Promise<void> {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(7, true),
    doCountdown: true,
  });
  stack.startingState();
  const ai = new PanelAi(stack, 7);

  // Through the whole countdown, no swap may be queued.
  for (let i = 0; i < 100; i++) {
    stack.receiveConfirmedInput(encodeInput(ai.update()));
    stack.run();
    assert.strictEqual(stack.swapCount, 0, 'no swaps during the countdown');
  }
}
