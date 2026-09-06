/**
 * A block is SQUARE ON THE GLASS, so it is a different number of characters
 * on each screen.
 *
 * An xterm cell is about half as wide as it is tall, so two characters make a
 * square block - which is how every board in this door has always drawn one.
 * A PETSCII cell is square already (a real C64 stretches it slightly taller
 * than wide, which is nearer square still), so the same two characters are a
 * 2:1 rectangle: "its just the tetris games that have stretched blocks"
 * (2026-09-06).
 *
 * Driven through the real GameScreen and its real render, not through
 * `fitCell` alone: the width is applied where a row is assembled, and a unit
 * test of the projection would pass whether or not the board ever called it.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { GameScreen } from '../ui/game-screen';
import { blockCols, fitCell } from '../ui/block-width';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {}, connectedBlocks: true,
};
const appState: any = {
  settings: { ...settings, blockGlow: false, glowIntensity: 0, clearStyle: 'instant' },
};
const inputStub: any = { on() {}, off() {}, setEnabled() {} };

/** The board's painted rows, tags stripped - what the caller's screen shows. */
function boardRows(width: number): string[] {
  const screen: any = new Screen({
    title: 'block-width', responsive: width !== 80, width, height: 25,
  });
  const engine: any = new GameEngine('marathon', settings, sounds, null as any);
  engine.start();
  const game: any = new GameScreen(
    screen, engine, inputStub, sounds, appState, null, null,
  );
  game.setupUI();
  game.renderBoard(engine.getState());

  return String(game.boardBox.getContent())
    .split('\n')
    .map((row: string) => row.replace(/\{[^}]*\}/g, ''));
}

export async function aBlockIsTwoCharactersOnATerminal(): Promise<void> {
  const rows = boardRows(80);
  assert.ok(rows.length > 0, 'the board painted nothing at 80 columns');
  for (const row of rows) {
    assert.strictEqual(
      row.length, 20,
      `an 80-column row is ten blocks at two characters each, got ${row.length}`,
    );
  }
}

export async function aBlockIsOneCharacterOnASquareCelledScreen(): Promise<void> {
  const rows = boardRows(40);
  assert.ok(rows.length > 0, 'the board painted nothing at 40 columns');
  for (const row of rows) {
    assert.strictEqual(
      row.length, 10,
      `a PETSCII row is ten blocks at ONE character each, got ${row.length} `
      + '- two is the 2:1 smear the caller reported',
    );
  }
}

/** The well is sized to its blocks and centred, not stretched to the screen. */
export async function theWellIsAsWideAsTheBlocksInIt(): Promise<void> {
  const screen: any = new Screen({ title: 'well', responsive: true, width: 40, height: 25 });
  const engine: any = new GameEngine('marathon', settings, sounds, null as any);
  engine.start();
  const game: any = new GameScreen(screen, engine, inputStub, sounds, appState, null, null);
  game.setupUI();

  assert.strictEqual(game.boardBox.width, 12, 'ten one-character blocks plus a border');
  assert.strictEqual(game.boardBox.left, 14, 'centred in forty columns, not hugging the edge');
}

/** The projection itself: tags survive, the visible run halves. */
export async function fitCellKeepsTheColourAndHalvesTheGlyphs(): Promise<void> {
  assert.strictEqual(blockCols(80), 2);
  assert.strictEqual(blockCols(40), 1);

  assert.strictEqual(fitCell('{red-fg}██{/red-fg}', 2), '{red-fg}██{/red-fg}');
  assert.strictEqual(fitCell('{red-fg}██{/red-fg}', 1), '{red-fg}█{/red-fg}');
  assert.strictEqual(fitCell('  ', 1), ' ');
  assert.strictEqual(
    fitCell('{white-bg}{white-fg}██{/white-fg}{/white-bg}', 1),
    '{white-bg}{white-fg}█{/white-fg}{/white-bg}',
  );
  // A pair whose glyphs differ keeps its first half, not a mangled mix.
  assert.strictEqual(fitCell('{white-fg}[]{/white-fg}', 1), '{white-fg}[{/white-fg}');
}
