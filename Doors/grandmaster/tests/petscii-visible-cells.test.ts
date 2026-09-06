/**
 * Nothing a C64 caller is shown may be black on black.
 *
 * PETSCII has ONE screen background and no per-cell one, so a `{x-bg}` tag is
 * dropped on the way to the glass. Anything that put its ink in `{black-fg}`
 * and its colour in the background rendered black on black - invisible, while
 * still occupying the cell and still counting to the engine. TetriNET's
 * specials and the versus item cells were both written that way: "some random
 * pieces disappeared when i played in petscii mode" (2026-09-06). Random,
 * because which specials fall is.
 *
 * This pins the RULE, not the three cells that broke it: a cell that reaches
 * a PETSCII screen must carry its colour in the foreground, and that
 * foreground must not be the background colour.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { VersusScreen } from '../ui/versus-screen';
import { cellsCanCarryBackground } from '../ui/block-width';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};
const appState: any = { settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

function petsciiScreen(): any {
  const screen: any = new Screen({ title: 'flat', width: 40, height: 25, responsive: true } as any);
  screen.petscii = true;
  return screen;
}

/** A cell nobody can see: black ink, or ink that only a background would show. */
function isInvisible(cell: string): boolean {
  const hasBlackInk = /\{black-fg\}/.test(cell);
  const visible = cell.replace(/\{[^}]*\}/g, '').trim();
  return hasBlackInk && visible.length > 0;
}

export async function aPetsciiScreenAnswersThatItHasNoCellBackground(): Promise<void> {
  const flat = petsciiScreen();
  assert.strictEqual(cellsCanCarryBackground(flat), false);
  assert.strictEqual(cellsCanCarryBackground({ }), true, 'an ANSI screen keeps its backgrounds');
}

export async function everyTetrinetSpecialIsVisibleOnAC64(): Promise<void> {
  const screen = petsciiScreen();
  const tn: any = Object.create(TetriNetScreen.prototype);
  tn.screen = screen;

  const specials = [
    'add_line', 'clear_line', 'nuke', 'random_clear', 'switch', 'clear_specials',
    'gravity', 'quake', 'block_bomb', 'clear_column', 'immunity', 'darkness',
    'confusion', 'mutation', 'zebra', 'left_gravity',
  ];

  for (const special of specials) {
    const cell = tn.getSpecialBlockChar(special);
    assert.ok(
      !isInvisible(cell),
      `${special} is black ink on a background a C64 cannot draw: ${cell}`,
    );
    assert.ok(
      /\{[a-z-]+-fg\}/.test(cell),
      `${special} must carry its colour in the ink: ${cell}`,
    );
  }
}

export async function anAnsiScreenKeepsTheSpecialsItAlwaysHad(): Promise<void> {
  const screen: any = new Screen({ title: 'ansi', width: 80, height: 25 } as any);
  const tn: any = Object.create(TetriNetScreen.prototype);
  tn.screen = screen;

  const cell = tn.getSpecialBlockChar('add_line');
  assert.match(cell, /\{red-bg\}/, 'the 80-column special is unchanged - letter on a block');
  assert.match(cell, /\{black-fg\}/);
}

export async function everyVersusItemCellIsVisibleOnAC64(): Promise<void> {
  const screen = petsciiScreen();
  const vs: any = Object.create(VersusScreen.prototype);
  vs.screen = screen;

  for (const [item, colour] of [[25, null], [1, 'cyan'], [7, 'red'], [3, null]] as Array<[number, string | null]>) {
    const cell = vs.getItemCellChar(item, colour);
    assert.ok(!isInvisible(cell), `item ${item} is invisible on a C64: ${cell}`);
  }
}

/** And the well is as wide as the blocks in it, like every other board. */
export async function theTetrinetWellFitsItsBlocks(): Promise<void> {
  for (const [width, expected] of [[80, 26], [40, 14]] as Array<[number, number]>) {
    const screen: any = new Screen({
      title: 'well', width, height: 25, responsive: width !== 80,
    } as any);

    // The real setupUI, with the one thing it asks the engine for.
    const tn: any = Object.create(TetriNetScreen.prototype);
    tn.screen = screen;
    tn.engine = { isHoldEnabled: () => true };
    tn.state = appState;
    tn.appState = appState;
    tn.setupUI();

    assert.strictEqual(
      tn.boardBox.width, expected,
      `at ${width} columns a twelve-wide field is ${expected} characters with its border`,
    );
    screen.destroy();
  }
}
