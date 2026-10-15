/**
 * Attack/garbage router regression tests.
 *
 * Symptom (reported live 2026-08-25): "I have never seen an attack; garbage
 * is enabled but I have never seen any garbage in a vs game."
 *
 * The whole attack pipeline existed and was internally correct — calculator,
 * queue, cancel logic, board insertion, UI strip — but the ROUTER connecting
 * engines to each other was never written: the human's only onAttackSent
 * listener played a sound effect (and in CPU battle wasn't registered at
 * all), AttackManager.receiveAttack() had zero callers repo-wide, and the AI
 * engines were constructed WITHOUT attack managers so they could neither
 * send nor receive. versusAI.allDead() also had zero callers, so a CPU
 * battle could only ever be lost.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { AttackManager, GarbageQueue } from '../network/attack-system';
import { VersusAI } from '../ai/versus-ai';
import { VersusScreen } from '../ui/versus-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};
const appState: any = { settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

function battle(garbageEnabled = true) {
  const screen: any = new Screen({ title: 'attack-test' });
  const human = new AttackManager();
  const humanEngine: any = new GameEngine('versus', settings, sounds, human);
  const ai: any = new VersusAI();
  const opponents = ai.createOpponents(1, 5, settings, sounds);
  humanEngine.start();
  const vs: any = new VersusScreen(screen, humanEngine, inputStub, sounds, appState, null, human, ai, null);
  vs.setGarbageEnabled(garbageEnabled);
  const done = () => screen.destroy();
  return { human, humanEngine, ai, opponents, vs, done };
}

export async function cancelGarbageIsPerExchangeNotCumulative(): Promise<void> {
  // The old code returned `outgoing - cancelledLines` with cancelledLines
  // CUMULATIVE for the whole game (resetCancelled had no callers), so the
  // second exchange under-counted.
  const q = new GarbageQueue();
  q.addGarbage('opp', 2);
  assert.strictEqual(q.cancelGarbage(4), 2, 'first exchange: cancel 2, send 2');
  q.addGarbage('opp', 1);
  assert.strictEqual(q.cancelGarbage(4), 3, 'second exchange: cancel 1, send 3 (old code sent 1)');
}

export async function humanTetrisReachesAiQueue(): Promise<void> {
  const b = battle();
  try {
    b.human.processLineClear(4, 'none', 0, false, false);
    assert.strictEqual(b.opponents[0].attackManager.getPendingGarbage(), 4);
  } finally { b.done(); }
}

export async function aiAppliesGarbageToBoardOnLock(): Promise<void> {
  const b = battle();
  try {
    b.human.processLineClear(4, 'none', 0, false, false);
    const before = b.opponents[0].engine.getState().board.grid.flat().filter((c: any) => c.filled).length;
    b.opponents[0].engine.hardDrop();
    const after = b.opponents[0].engine.getState().board.grid.flat().filter((c: any) => c.filled).length;
    assert.strictEqual(b.opponents[0].attackManager.getPendingGarbage(), 0, 'queue drained on lock');
    assert.ok(after > before + 4, `board grew by garbage rows (before ${before}, after ${after})`);
  } finally { b.done(); }
}

export async function aiAttackReachesHumanQueue(): Promise<void> {
  const b = battle();
  try {
    b.opponents[0].attackManager.processLineClear(2, 'none', 0, false, false);
    assert.strictEqual(b.human.getPendingGarbage(), 1, 'double sends 1 line');
  } finally { b.done(); }
}

export async function garbageSettingDisablesRouting(): Promise<void> {
  const b = battle(false);
  try {
    b.human.processLineClear(4, 'none', 0, false, false);
    assert.strictEqual(b.opponents[0].attackManager.getPendingGarbage(), 0);
  } finally { b.done(); }
}

export async function startLevelReachesEngine(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds, undefined, 7);
  assert.strictEqual(engine.getState().level, 7);
}

export async function allDeadReportsVictoryCondition(): Promise<void> {
  const b = battle();
  try {
    assert.strictEqual(b.ai.allDead(), false);
    b.opponents[0].alive = false;
    assert.strictEqual(b.ai.allDead(), true);
  } finally { b.done(); }
}
