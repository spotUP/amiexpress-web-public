/**
 * VS WIN TYPE - GOAL LV and GOAL LINE.
 *
 * This door only ever played SURVIVAL. HeborisCE's versus setup offers three
 * (gamestart.c:12755-12765) and ends a goal match the moment someone reaches
 * it, by setting the other player's status to game over (9489-9519).
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { VersusScreen } from '../ui/versus-screen';
import { AttackManager } from '../network/attack-system';
import {
  versusGoalReached, versusGoalTarget, DEFAULT_VERSUS_GOAL,
} from '../core/versus-goal';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
  blockGlow: false, glowIntensity: 0, clearStyle: 'instant',
};
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

export async function survivalHasNoGoalAtAll(): Promise<void> {
  assert.strictEqual(versusGoalTarget('survival', 200), null);
  assert.strictEqual(versusGoalReached('survival', 200, { level: 9999, lines: 9999 }), false);
  // vs_goal = 0 means "no goal" in the reference too (gamestart.c:9490).
  assert.strictEqual(versusGoalTarget('level', 0), null);
}

export async function goalLevelIsTheLevelAndGoalLineIsATenthOfIt(): Promise<void> {
  // gamestart.c:9491 `tc[player] >= vs_goal`, 9507 `li[player] >= vs_goal/10`.
  assert.strictEqual(versusGoalTarget('level', 200), 200);
  assert.strictEqual(versusGoalTarget('lines', 200), 20);
  assert.strictEqual(DEFAULT_VERSUS_GOAL, 200, 'init.c:115 def_vs_goal');

  assert.strictEqual(versusGoalReached('level', 200, { level: 199, lines: 999 }), false);
  assert.strictEqual(versusGoalReached('level', 200, { level: 200, lines: 0 }), true);
  assert.strictEqual(versusGoalReached('lines', 200, { level: 999, lines: 19 }), false);
  assert.strictEqual(versusGoalReached('lines', 200, { level: 0, lines: 20 }), true);
}

/** A versus screen with one bot opponent, wired the way the door wires it. */
function match(overrides: any): any {
  const screen: any = new Screen({ title: 'wintype' });
  const attackManager = new AttackManager();
  const engine: any = new GameEngine('versus', { ...settings, ...overrides }, sounds, attackManager);
  engine.start();
  const state: any = { settings: { ...settings, ...overrides } };
  const vs: any = new VersusScreen(
    screen, engine, inputStub, sounds, state, null, attackManager, undefined, null
  );
  return { screen, engine, vs, done: () => screen.destroy() };
}

export async function reachingTheLevelGoalWinsTheMatch(): Promise<void> {
  const m = match({ versusWinType: 'level', versusGoal: 200 });
  try {
    assert.strictEqual(m.vs.checkWinTypeGoal(), null, 'still open at the start');
    m.engine.getState().level = 200;
    assert.strictEqual(m.vs.checkWinTypeGoal(), true, 'reaching the goal wins');
  } finally { m.done(); }
}

export async function reachingTheLineGoalWinsTheMatch(): Promise<void> {
  const m = match({ versusWinType: 'lines', versusGoal: 200 });
  try {
    m.engine.getState().lines = 19;
    assert.strictEqual(m.vs.checkWinTypeGoal(), null, '19 lines is not 20');
    m.engine.getState().lines = 20;
    assert.strictEqual(m.vs.checkWinTypeGoal(), true, 'a tenth of vs_goal ends it');
  } finally { m.done(); }
}

export async function survivalMatchesAreNeverEndedByAGoal(): Promise<void> {
  const m = match({});   // no setting at all - the door's own default
  try {
    m.engine.getState().level = 9999;
    m.engine.getState().lines = 9999;
    assert.strictEqual(m.vs.checkWinTypeGoal(), null, 'survival ignores every counter');
  } finally { m.done(); }
}

export async function anOpponentReachingTheGoalLosesTheMatch(): Promise<void> {
  const m = match({ versusWinType: 'level', versusGoal: 200 });
  try {
    // A networked opponent the tracker knows about, past the goal.
    m.vs.opponentTracker.updateOpponent('rival', { name: 'RIVAL', level: 250, alive: true });
    assert.ok(
      m.vs.opponentTracker.getAliveOpponents().length > 0,
      'the tracker must be holding the opponent this test just added'
    );
    assert.strictEqual(m.vs.checkWinTypeGoal(), false, 'the opponent got there first');
  } finally { m.done(); }
}
