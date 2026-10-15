/**
 * Every TetriNET board cell is two columns wide.
 *
 * Reported with a screenshot 2026-08-25: "TetriNET's line clearing is still
 * super weird, it offsets pieces sideways and the second row from the bottom
 * gets cleared and no pieces fall through it."
 *
 * None of that was the line clearing. Special blocks rendered as `[A]` -
 * THREE characters - while a normal block, an empty cell, the landing shadow
 * and the motion-blur trail are all two. Every special on a row pushed the
 * cells to its right one column further and ran the row past the board's
 * edge, so rows carrying specials looked shifted and the stack looked wrong.
 *
 * The board is drawn by concatenating one string per cell, so equal width is
 * the whole contract. This test walks every glyph the board can produce.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { GHOST_CHAR, hardDropTrailChar } from '../ui/board-effects';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };

/** Visible width, with blessed colour tags removed. */
function visibleWidth(cell: string): number {
  return cell.replace(/\{[^}]*\}/g, '').length;
}

function screenAndBoard(): { screen: any; board: any } {
  const screen: any = new Screen({ title: 'tnet-cells', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({});
  const board: any = new TetriNetScreen({
    screen, engine, inputHandler: inputStub, sounds, state: appState,
    network: null, playerName: 'sysop', aiController: null,
  } as any);
  return { screen, board };
}

/** Every special the game can place on the field. */
const SPECIALS = [
  'add_line', 'clear_line', 'nuke', 'random_clear', 'switch', 'clear_specials',
  'gravity', 'quake', 'block_bomb', 'clear_column', 'immunity', 'darkness',
  'confusion', 'mutation', 'zebra', 'left_gravity',
];

export async function everySpecialBlockIsTwoColumnsWide(): Promise<void> {
  const { screen, board } = screenAndBoard();
  try {
    for (const special of SPECIALS) {
      const cell = (board as any).getSpecialBlockChar(special);
      assert.strictEqual(
        visibleWidth(cell), 2,
        `special "${special}" renders ${visibleWidth(cell)} columns, not 2: ${JSON.stringify(cell)}`
      );
    }
  } finally {
    screen.destroy();
  }
}

export async function anUnknownSpecialIsStillTwoColumnsWide(): Promise<void> {
  const { screen, board } = screenAndBoard();
  try {
    const cell = (board as any).getSpecialBlockChar('something-new');
    assert.strictEqual(visibleWidth(cell), 2);
  } finally {
    screen.destroy();
  }
}

export async function normalBlocksAreTwoColumnsWide(): Promise<void> {
  const { screen, board } = screenAndBoard();
  try {
    for (const type of ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'unknown']) {
      const cell = (board as any).getBlockChar(type);
      assert.strictEqual(visibleWidth(cell), 2, `block "${type}" is not 2 columns`);
    }
  } finally {
    screen.destroy();
  }
}

export async function theShadowAndTheTrailMatchTheGrid(): Promise<void> {
  // A row mixing blocks, a shadow and a fading streak must still line up.
  assert.strictEqual(visibleWidth(GHOST_CHAR), 2, 'the landing shadow is not 2 columns');

  for (const strength of [1, 0.5, 0.1]) {
    const cell = hardDropTrailChar('red', strength);
    assert.strictEqual(visibleWidth(cell), 2, `the trail at strength ${strength} is not 2 columns`);
  }
}

export async function anEmptyCellIsTwoColumnsWide(): Promise<void> {
  // The renderer starts every cell as two spaces; if that ever changes the
  // whole grid shifts.
  assert.strictEqual(visibleWidth('  '), 2);
}
