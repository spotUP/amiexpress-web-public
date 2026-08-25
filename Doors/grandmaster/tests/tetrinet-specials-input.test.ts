/**
 * Special-key regression tests.
 *
 * Reported live 2026-08-25: specials could not be used, and the Target
 * panel advertised "TAB: Next  1-5: Select" for a selector that did
 * nothing.
 *
 * Cause: those keys were bound with screen.key(), i.e. blessed keypress
 * events - but in game mode the door receives input through
 * bbs.onKeyDown/onKeyUp instead, so none of them ever fired. Movement
 * worked because it goes through InputHandler.
 *
 * The model now follows the reference client
 * (TetriNET2.Client.ConsoleApp): 1-6 use the first special on that slot,
 * Enter on yourself, Tab on a random opponent, D discards. There is no
 * select-then-fire step.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { TetriNetAI } from '../ai/tetrinet-ai';
import { keyToAction, TETRINET_KEYS, DEFAULT_KEYS } from '../input/config';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const options: any = { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 };

/** Records the actions a screen binds, the way InputHandler would. */
function recordingInput(): any {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    config: DEFAULT_KEYS,
    on(action: string, fn: () => void) { handlers.set(action, fn); },
    off() {},
    setEnabled() {},
    getConfig() { return this.config; },
    updateConfig(cfg: any) { this.config = cfg; },
    press(action: string) {
      const fn = handlers.get(action);
      assert.ok(fn, `nothing is bound to ${action}`);
      fn!();
    },
  };
}

function match(botCount = 3): any {
  const screen: any = new Screen({ title: 'tnet-keys', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({} as any, options);
  const ai: any = new TetriNetAI();
  const bots = ai.createOpponents(botCount, 5, {} as any, options);
  const input = recordingInput();
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: input, sounds, state: { settings: {} } as any,
    network: null, playerName: 'sysop', aiController: ai,
  } as any);
  engine.start();
  scr.setupInput();
  scr.refreshOpponents();
  return { screen, engine, ai, bots, scr, input, done: () => screen.destroy() };
}

function filled(engine: any): number {
  return engine.getBoard().grid.flat().filter((c: any) => c.filled).length;
}

function fillRow(engine: any, y: number): void {
  const board = engine.getBoard();
  for (let x = 0; x < board.width; x++) board.grid[y][x] = { filled: true, color: 'I', locked: true };
}

export async function theSpecialKeysAreBoundToTheRealInputPath(): Promise<void> {
  const m = match();
  try {
    for (const action of [
      'use_special_1', 'use_special_2', 'use_special_3', 'use_special_4',
      'use_special_5', 'use_special_6', 'use_special_self',
      'use_special_random', 'discard_special',
    ]) {
      assert.ok(m.input.handlers.has(action),
        `${action} must go through InputHandler - screen.key() never fires in game mode`);
    }
  } finally { m.done(); }
}

export async function aNumberKeyUsesTheSpecialOnThatSlot(): Promise<void> {
  const m = match();
  try {
    fillRow(m.bots[1].engine, 21);
    m.engine.getInventory().add('nuke');

    m.input.press('use_special_2');   // second opponent in the panel

    assert.strictEqual(filled(m.bots[1].engine), 0, 'slot 2 took the nuke');
    assert.strictEqual(m.engine.getState().inventory.length, 0, 'and it left the inventory');
  } finally { m.done(); }
}

export async function enterUsesTheSpecialOnYourself(): Promise<void> {
  const m = match();
  try {
    fillRow(m.engine, 21);
    const before = filled(m.engine);
    m.engine.getInventory().add('nuke');

    m.input.press('use_special_self');

    assert.ok(filled(m.engine) < before, 'your own field takes it - Enter in the reference client');
  } finally { m.done(); }
}

export async function tabHitsSomebodyWhoIsStillPlaying(): Promise<void> {
  const m = match();
  try {
    for (const bot of m.bots) fillRow(bot.engine, 21);
    m.engine.getInventory().add('nuke');

    m.input.press('use_special_random');

    const cleared = m.bots.filter((b: any) => filled(b.engine) === 0).length;
    assert.strictEqual(cleared, 1, 'exactly one opponent is hit');
  } finally { m.done(); }
}

export async function discardThrowsTheSpecialAway(): Promise<void> {
  const m = match();
  try {
    for (const bot of m.bots) fillRow(bot.engine, 21);
    m.engine.getInventory().add('nuke');

    m.input.press('discard_special');

    assert.strictEqual(m.engine.getState().inventory.length, 0, 'the special is gone');
    assert.ok(m.bots.every((b: any) => filled(b.engine) > 0), 'and nobody was hit by it');
  } finally { m.done(); }
}

export async function anEmptyInventoryHitsNobody(): Promise<void> {
  const m = match();
  try {
    for (const bot of m.bots) fillRow(bot.engine, 21);

    m.input.press('use_special_1');

    assert.ok(m.bots.every((b: any) => filled(b.engine) > 0), 'nothing to use, nothing happens');
  } finally { m.done(); }
}

export async function theTetriNetKeyLayoutIsInstalledWhilePlaying(): Promise<void> {
  const m = match();
  try {
    assert.strictEqual(m.input.config, TETRINET_KEYS,
      'the game installs the TetriNET layout');
    m.scr.cleanup();
    assert.strictEqual(m.input.config, DEFAULT_KEYS,
      'and hands the TGM layout back when it ends');
  } finally { m.done(); }
}

export async function theReferenceKeysMapToTheRightActions(): Promise<void> {
  assert.strictEqual(keyToAction('1', TETRINET_KEYS), 'use_special_1');
  assert.strictEqual(keyToAction('6', TETRINET_KEYS), 'use_special_6');
  assert.strictEqual(keyToAction('return', TETRINET_KEYS), 'use_special_self');
  assert.strictEqual(keyToAction('tab', TETRINET_KEYS), 'use_special_random');
  assert.strictEqual(keyToAction('d', TETRINET_KEYS), 'discard_special');
  assert.strictEqual(keyToAction('space', TETRINET_KEYS), 'hard_drop');
  assert.strictEqual(keyToAction('h', TETRINET_KEYS), 'hold');

  // And the TGM layout is untouched by any of it.
  assert.strictEqual(keyToAction('d', DEFAULT_KEYS), 'right');
  assert.strictEqual(keyToAction('space', DEFAULT_KEYS), 'rotate_180');
}

export async function thePanelDescribesKeysThatExist(): Promise<void> {
  const src = readFileSync(join(__dirname, '..', 'ui', 'tetrinet', 'target-selector.ts'), 'utf8');

  assert.ok(!/TAB: Next/.test(src),
    'the panel must not advertise a Tab-cycling selector that no longer exists');
  assert.ok(/1-6 use/.test(src), 'it describes the reference keys instead');
}
