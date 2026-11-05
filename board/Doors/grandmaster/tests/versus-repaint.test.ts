/**
 * An opponent board is only rebuilt when that opponent changed.
 *
 * "can gmasters battle royale be optimized? it's laggy with all the players
 * and action on screen" (2026-09-02).
 *
 * The screen repaints at 60 Hz and the tracker samples opponents at about 10,
 * so five frames in six every board was rebuilt from a state identical to the
 * one already on it. Measured before the fix: a full field on a 200x60
 * terminal cost 14.04 ms per render against a 16 ms tick - the frame budget,
 * spent redrawing what was already there. After: 1.63 ms.
 *
 * Counted, not timed: a timing assertion on a shared machine is a flake, and
 * what actually matters is that the work is SKIPPED.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { AttackManager } from '../network/attack-system';
import { VersusScreen } from '../ui/versus-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};
const appState: any = { settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

function emptyBoard(): any {
  const grid: any[] = [];
  for (let y = 0; y < 22; y++) {
    grid.push(Array.from({ length: 10 }, () => ({ filled: false, color: '' })));
  }
  return { width: 10, height: 22, grid };
}

function harness(width: number, height: number, count: number) {
  const screen: any = new Screen({ title: 'versus-repaint', responsive: true, width, height });
  const attacks = new AttackManager();
  const engine: any = new GameEngine('versus', settings, sounds, attacks);
  engine.start();
  const vs: any = new VersusScreen(screen, engine, inputStub, sounds, appState, null, attacks, undefined, null);

  for (let i = 0; i < count; i++) {
    vs.opponentTracker.updateOpponent(`b${i}`, {
      id: `b${i}`, name: `BT${i}`, board: emptyBoard(),
      level: 1, grade: '9', alive: true, isBot: true, rank: i + 1,
    });
  }

  // Count the expensive half: building one opponent board's content.
  let rebuilds = 0;
  const real = vs.renderOpponentBoard.bind(vs);
  vs.renderOpponentBoard = (box: any, opp: any) => { rebuilds++; return real(box, opp); };

  return {
    vs, screen,
    rebuilds: () => rebuilds,
    reset: () => { rebuilds = 0; },
    destroy: () => screen.destroy(),
  };
}

export async function anUnchangedFieldIsNotRebuilt(): Promise<void> {
  const h = harness(200, 60, 8);
  try {
    h.vs.render();          // the first paint draws everything
    const first = h.rebuilds();
    assert.ok(first > 0, 'the first render draws the boards');

    h.reset();
    for (let f = 0; f < 30; f++) h.vs.render();
    assert.strictEqual(h.rebuilds(), 0,
      'thirty frames with nothing moving rebuild nothing');
  } finally { h.destroy(); }
}

export async function anOpponentThatMovedIsRedrawn(): Promise<void> {
  const h = harness(200, 60, 8);
  try {
    h.vs.render();
    h.reset();

    h.vs.opponentTracker.updateOpponent('b3', { level: 7 });
    h.vs.render();

    assert.strictEqual(h.rebuilds(), 1, 'exactly the board that changed');
  } finally { h.destroy(); }
}

export async function areshuffleRedrawsWhoeverTookTheBox(): Promise<void> {
  const h = harness(200, 60, 8);
  try {
    h.vs.render();
    h.reset();

    // Danger ranks change constantly in a royale; a box keeps its position
    // and gets a different opponent, which must repaint even though that
    // opponent's own state did not change.
    h.vs.opponentTracker.updateOpponent('b7', { rank: 1 });
    h.vs.opponentTracker.updateOpponent('b0', { rank: 8 });
    h.vs.render();

    assert.ok(h.rebuilds() > 0,
      'a board showing a different opponent is redrawn, not left stale');
  } finally { h.destroy(); }
}
