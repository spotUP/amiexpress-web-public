/**
 * A solid cell is a BACKGROUND COLOUR, not a block glyph.
 *
 * `█` is not an Amiga character. A real Amiga terminal has Topaz and nothing
 * else - "the amiga/telnet had no companion font" (sysop, 2026-09-14) -
 * RULES.md:492 says the board's own output is "Amiga ASCII only: `_/\|-`. No
 * PC box-drawing characters", and the telnet and SSH wires are Latin-1, where
 * iconv turns `██` into `??`. Every byte-transport caller has been reading
 * this door's pieces as question marks. The web only looked right because
 * xterm's canvas renderer draws U+2580-259F out of its own table rather than
 * out of the face - which is also why a face glyph beside it came out a
 * device pixel short.
 *
 * Driven through the real GameScreen and its real render, like the width
 * projection beside it: a unit test of the transform alone would pass whether
 * or not the board ever called it.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameEngine } from '../core/game';
import { GameScreen } from '../ui/game-screen';
import { fitCell, solidToBackground } from '../ui/block-width';
import { filledCells } from './painted';

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

/** A screen mid-game, and the panels it painted - what goes to the caller. */
function paintedPanels(width: number): { board: string; preview: string } {
  const screen: any = new Screen({
    title: 'solid-cells', responsive: width !== 80, width, height: 30,
  });
  try {
    const engine: any = new GameEngine('marathon', settings, sounds, null as any);
    engine.start();
    const game: any = new GameScreen(
      screen, engine, null, sounds, appState, null,
    );
    game.setupUI();
    game.render();
    return {
      board: String(game.boardBox.getContent()),
      preview: String(game.nextBox.getContent()),
    };
  } finally { screen.destroy(); }
}

/** Every codepoint the wire cannot carry. */
function beyondLatin1(text: string): string[] {
  return [...text].filter((c) => c.codePointAt(0)! > 0xff);
}

/**
 * The pieces are painted as their COLOUR, with nothing drawn in them.
 *
 * The preview is where a piece is always on screen, so this is the panel that
 * proves the projection ran: an empty well would satisfy "paints no block
 * glyph" without painting anything at all.
 */
export async function theNextPreviewIsPaintedAsColourNotGlyphs(): Promise<void> {
  for (const width of [80, 40]) {
    const { preview } = paintedPanels(width);
    assert.ok(
      filledCells(preview) > 0,
      `the preview painted no filled cell at ${width} columns - nothing to test`,
    );
    assert.ok(
      /\{[a-z-]+-bg\}\s+\{\/[a-z-]+-bg\}/.test(preview),
      `at ${width} columns the preview draws its pieces with something other `
      + 'than a background colour',
    );
  }
}

/** And nothing any panel paints turns into a question mark on the wire. */
export async function noPanelPaintsWhatTheWireCannotCarry(): Promise<void> {
  for (const width of [80, 40]) {
    const { board, preview } = paintedPanels(width);
    assert.ok(filledCells(preview) > 0, 'the preview painted nothing');
    for (const [name, painted] of [['board', board], ['preview', preview]] as const) {
      const bad = beyondLatin1(painted);
      assert.deepStrictEqual(
        [...new Set(bad)], [],
        `at ${width} columns the ${name} painted ${bad.length} character(s) `
        + 'outside Latin-1; iconv sends each to a telnet caller as "?"',
      );
    }
  }
}

/**
 * A PETSCII board keeps its ink, through the real screen.
 *
 * The C64 has one screen background and no per-cell one, so a `{x-bg}` tag is
 * dropped on the way to the glass: a piece painted as a fill would be a hole
 * in the stack, which is the bug this door already fixed once for the
 * TetriNET specials - "some random pieces disappeared when i played in
 * petscii mode" (2026-09-06). The question has to be asked at every cell, not
 * answered by a default.
 */
export async function aPetsciiBoardKeepsItsInk(): Promise<void> {
  const screen: any = new Screen({
    title: 'petscii-cells', responsive: true, width: 40, height: 30,
  });
  (screen as { petscii?: boolean }).petscii = true;
  try {
    const engine: any = new GameEngine('marathon', settings, sounds, null as any);
    engine.start();
    const game: any = new GameScreen(screen, engine, null, sounds, appState, null);
    game.setupUI();
    game.render();
    const preview = String(game.nextBox.getContent());

    assert.ok(filledCells(preview) > 0, 'the preview painted nothing to check');
    assert.ok(
      !/-bg\}/.test(preview),
      'a PETSCII screen was handed a background colour, which the C64 drops - '
      + 'the piece would render as a hole',
    );
    assert.ok(
      preview.includes('\u2588'),
      'and with the background gone the colour has to be in the INK',
    );
  } finally { screen.destroy(); }
}

/** The transform itself: a fill converts, a shape does not. */
export async function onlyASolidRunBecomesAFill(): Promise<void> {
  assert.strictEqual(
    solidToBackground('{red-fg}██{/red-fg}'), '{red-bg}  {/red-bg}',
    'a solid cell keeps its colour and loses its glyph',
  );
  assert.strictEqual(
    solidToBackground('{white-fg}{bold}██{/bold}{/white-fg}'),
    '{white-bg}{bold}  {/bold}{/white-bg}',
    'every tag carries over, bold and all',
  );
  for (const shaped of [
    '{white-fg}[]{/white-fg}',
    '{gray-fg}░░{/gray-fg}',
    '{cyan-fg}█x{/cyan-fg}',
    '  ',
  ]) {
    assert.strictEqual(
      solidToBackground(shaped), shaped,
      `${shaped} has shape in it, and half a shape is not a fill`,
    );
  }
}

/** PETSCII has no per-cell background, so it keeps its ink. */
export async function aScreenWithNoBackgroundKeepsItsInk(): Promise<void> {
  assert.strictEqual(
    fitCell('{red-fg}██{/red-fg}', 2, false), '{red-fg}██{/red-fg}',
    'PETSCII drops a {x-bg} tag on the way to the glass, so the colour must '
    + 'stay in the ink or the cell renders black on black',
  );
  assert.strictEqual(
    fitCell('{red-fg}██{/red-fg}', 1, false), '{red-fg}█{/red-fg}',
    'and it still halves for a square cell',
  );
}

/** The fill happens BEFORE the width, so a forty-column cell is one space. */
export async function theFillIsProjectedBeforeTheWidth(): Promise<void> {
  assert.strictEqual(fitCell('{red-fg}██{/red-fg}', 2), '{red-bg}  {/red-bg}');
  assert.strictEqual(fitCell('{red-fg}██{/red-fg}', 1), '{red-bg} {/red-bg}');
}
