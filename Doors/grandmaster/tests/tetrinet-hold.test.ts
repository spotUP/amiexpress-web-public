/**
 * Hold-piece regression tests.
 *
 * Requested live 2026-08-25: "can we add hold block for our local server?
 * that makes the game so much better".
 *
 * TetriNetEngine.hold() was a stub that returned false, and spawnPiece()
 * set canHold to FALSE on every spawn, so even a real implementation could
 * never have fired. Hold is a LOCAL house rule: it stays off against real
 * TetriNET servers, whose other clients do not have it.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: {} };

function engine(allowHold: boolean): any {
  // nextPieceDelayMs 0: the default is a full second, and these tests care
  // about hold's bookkeeping, not about TetriNET's spawn pause.
  const e: any = new TetriNetEngine(
    {} as any,
    { delayBeforeSuddenDeath: 0, nextPieceDelayMs: 0, allowHold } as any
  );
  e.start();
  return e;
}

export async function holdIsRefusedWhenTheHouseRuleIsOff(): Promise<void> {
  const e = engine(false);

  assert.strictEqual(e.hold(), false, 'no hold on a server that has none');
  assert.strictEqual(e.getState().holdPiece, null, 'and nothing is stashed');
}

export async function holdStashesTheFallingPiece(): Promise<void> {
  const e = engine(true);
  const falling = e.getState().currentPiece.type;

  assert.strictEqual(e.hold(), true);
  assert.strictEqual(e.getState().holdPiece, falling, 'the piece that was falling is now held');
  assert.notStrictEqual(e.getState().currentPiece, null, 'and a new piece is falling');
}

export async function theHeldPieceComesBackOnTheNextHold(): Promise<void> {
  const e = engine(true);
  const first = e.getState().currentPiece.type;

  e.hold();                       // stash the first piece
  const second = e.getState().currentPiece.type;
  e.hardDrop();                   // locking re-arms hold
  for (let i = 0; i < 8; i++) e.update(16);

  assert.strictEqual(e.hold(), true, 'hold is available again after a lock');
  assert.strictEqual(e.getState().currentPiece.type, first,
    'the stashed piece comes back');
  assert.notStrictEqual(second, undefined);
}

export async function onlyOneHoldPerPiece(): Promise<void> {
  const e = engine(true);

  assert.strictEqual(e.hold(), true, 'first hold allowed');
  assert.strictEqual(e.hold(), false, 'second hold on the same piece refused');
  assert.strictEqual(e.getState().canHold, false, 'and the UI is told why');
}

export async function lockingAPieceReArmsHold(): Promise<void> {
  const e = engine(true);
  e.hold();
  assert.strictEqual(e.getState().canHold, false);

  e.hardDrop();
  for (let i = 0; i < 8; i++) e.update(16);

  assert.strictEqual(e.getState().canHold, true, 'a fresh piece may be held');
}

function rendered(allowHold: boolean): { rows: string[]; destroy: () => void } {
  const screen: any = new Screen({ title: 'tnet-hold', width: 80, height: 30 });
  const e: any = new TetriNetEngine({} as any, { delayBeforeSuddenDeath: 0, allowHold } as any);
  const scr: any = new TetriNetScreen({
    screen, engine: e, inputHandler: inputStub, sounds, state: appState,
    network: null, playerName: 'sysop', aiController: null,
  } as any);
  e.start();
  scr.render();
  const rows: string[] = [];
  for (let y = 0; y < 24; y++) {
    const row = screen.buffer[y];
    rows.push(row ? row.map((c: [number, string]) => c[1]).join('') : '');
  }
  return { rows, destroy: () => screen.destroy() };
}

export async function theHoldPanelAppearsOnlyWhenHoldIsOn(): Promise<void> {
  const on = rendered(true);
  try {
    assert.ok(on.rows.join('\n').includes('Hold'), 'a local game shows the Hold panel');
  } finally { on.destroy(); }

  const off = rendered(false);
  try {
    assert.ok(!off.rows.join('\n').includes('Hold'),
      'a server game must not advertise a hold it does not allow');
  } finally { off.destroy(); }
}

export async function realTetriNetServersNeverGetTheHouseRule(): Promise<void> {
  // The external path builds its engine from the server's own options.
  const source = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');
  const start = source.indexOf('private async runTetriNetExternalGame(');
  assert.ok(start >= 0, 'runTetriNetExternalGame not found');
  const body = source.slice(start, source.indexOf('\n  private ', start + 10));

  // Match an assignment, not the word: the comment in that method explains
  // why the rule is absent and would otherwise fail this.
  assert.ok(!/allowHold\s*:/.test(body),
    'the external server path must not switch on the local hold house rule');
}
