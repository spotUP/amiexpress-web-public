/**
 * TetriNET board layout regression tests.
 *
 * Symptom (reported live 2026-08-25): "the tetrinet pieces land one row
 * below the bottom border".
 *
 * The sudden-death readout was created with createBox(), which draws a
 * border BY DEFAULT, positioned at row 23 - the board's last interior row -
 * and pushed to the front with setFront(). It was also created visible and
 * never hidden. So its border painted a second horizontal rule one row above
 * the board's real bottom border, permanently hiding the last playable row:
 * the field looked a row short and a piece resting on the floor appeared to
 * sit level with (or below) the frame.
 *
 * Sudden death is armed from the start of a match and counts down, so this
 * was not a rare end-game artefact - it covered a row for the whole game.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };

function rendered(): { rows: string[]; destroy: () => void } {
  const screen: any = new Screen({ title: 'tnet-layout', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({});
  const scr: any = new TetriNetScreen({
    screen, engine, inputHandler: inputStub, sounds, state: appState,
    network: null, playerName: 'sysop', aiController: null,
  } as any);

  engine.start?.();
  for (let i = 0; i < 3; i++) {
    engine.hardDrop?.();
    for (let f = 0; f < 30; f++) engine.update?.(16);
  }
  scr.render?.();
  screen.render();

  const rows: string[] = [];
  for (let y = 0; y < 28; y++) {
    const row = screen.buffer[y];
    rows.push(row ? row.slice(0, 30).map((c: [number, string]) => c[1]).join('').replace(/\s+$/, '') : '');
  }
  return { rows, destroy: () => screen.destroy() };
}

/** A row that is just the board's bottom frame. */
function isBottomBorder(row: string): boolean {
  return /^`-+'$/.test(row.trim());
}

export async function boardHasExactlyOneBottomBorder(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const borders = rows.filter(isBottomBorder);
    assert.strictEqual(borders.length, 1,
      `expected one bottom border, found ${borders.length} - a second rule means an overlay is covering a board row`);
  } finally { destroy(); }
}

export async function theLastPlayableRowIsVisible(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const bottomIdx = rows.findIndex(isBottomBorder);
    assert.ok(bottomIdx > 0, 'bottom border must be found');

    // The board is 22 rows tall and its top border sits at row 1, so the
    // last playable row must be the row immediately above the bottom frame,
    // and it must be board content (side walls), not another widget.
    const lastPlayable = rows[bottomIdx - 1];
    assert.ok(/^\|.*\|$/.test(lastPlayable.trim()),
      `row above the bottom border should be board content, got ${JSON.stringify(lastPlayable)}`);
    assert.strictEqual(bottomIdx, 24, 'board occupies rows 1..24 (22 interior rows)');
  } finally { destroy(); }
}

export async function suddenDeathReadoutDoesNotSitOnTheBoard(): Promise<void> {
  const { rows, destroy } = rendered();
  try {
    const sdIdx = rows.findIndex(r => /Sudden Death/i.test(r));
    if (sdIdx === -1) return; // not armed in this configuration
    assert.strictEqual(sdIdx, 0,
      `sudden-death readout must sit above the board (row 0), found at row ${sdIdx}`);
  } finally { destroy(); }
}
