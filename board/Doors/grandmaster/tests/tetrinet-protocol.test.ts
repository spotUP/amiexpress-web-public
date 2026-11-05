/**
 * TetriNET protocol conformance tests.
 *
 * Reference: the Jetrix developer guide (TetriNetProtocol.txt in the repo
 * root), which specifies the block generator used by the original client:
 *
 *   s(n+1) = (0x08088405 * s(n) + 1) mod 2^32
 *
 * with the seed carried by the 1.14 `newgame` command, and TWO draws per
 * piece - first the block (range 100, resolved through the frequency
 * table), then its orientation (range 4). Every client in a 1.14 game runs
 * this to get the same pieces, so a deviation desynchronises the table.
 */

import assert from 'assert';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TETRINET_PIECE_ORDER, getRotationCount } from '../core/tetrinet/tetrinet-pieces';

/** The generator exactly as the guide defines it. */
function referenceSequence(seed: number, count: number, cumulative: number[]): string[] {
  const M = 2 ** 32;
  let s = seed >>> 0;
  const draw = (range: number): number => {
    s = (Math.imul(s, 0x08088405) + 1) >>> 0;
    return Math.floor((s * range) / M);
  };

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const roll = draw(100);
    let index = cumulative.findIndex(threshold => roll < threshold);
    if (index < 0) index = 0;
    out.push(TETRINET_PIECE_ORDER[index]);
    draw(4);  // orientation - consumed even when unused
  }
  return out;
}

const SPEC_FREQUENCIES = [15, 30, 44, 58, 72, 86, 100];

function engineSequence(seed: number, count: number): string[] {
  const engine: any = new TetriNetEngine({} as any, {
    useSameBlocks: true,
    randomSeed: seed,
    pieceFrequency: SPEC_FREQUENCIES,
    nextPieceDelayMs: 0,
    delayBeforeSuddenDeath: 0,
  } as any);

  // The constructor draws the first block; each spawn then draws the
  // orientation of the current piece and the next block, in that order.
  const seq: string[] = [engine.getState().nextQueue[0]];
  engine.start();
  for (let i = 1; i < count; i++) {
    seq.push(engine.getState().nextQueue[0]);
    engine.hardDrop();
    for (let t = 0; t < 4; t++) engine.update(16);
  }
  return seq;
}

export async function theBlockSequenceMatchesTheProtocolGenerator(): Promise<void> {
  for (const seed of [0x00000000, 0xAABBCCDD, 0x12345678]) {
    const expected = referenceSequence(seed, 8, SPEC_FREQUENCIES);
    const actual = engineSequence(seed, 8);

    assert.deepStrictEqual(actual, expected,
      `seed 0x${seed.toString(16)}: our blocks must match the protocol's generator`);
  }
}

export async function theSeedDecidesTheSequence(): Promise<void> {
  const a = engineSequence(0x11111111, 8);
  const b = engineSequence(0x11111111, 8);
  const c = engineSequence(0x22222222, 8);

  assert.deepStrictEqual(a, b, 'the same seed gives the same blocks to every client');
  assert.notDeepStrictEqual(a, c, 'a different seed gives different blocks');
}

export async function orientationIsDrawnFromFourForEveryPiece(): Promise<void> {
  // The generator always draws the orientation from a range of 4 and the
  // client maps it onto the orientations that piece has. Drawing from the
  // piece's own rotation count consumed the same LCG step - so blocks
  // stayed in sync - but produced a DIFFERENT orientation for anything not
  // four-way, which is visible in a 1.14 same-blocks game.
  const M = 2 ** 32;
  const seed = 0x2A1C21B6;

  let s = seed >>> 0;
  const draw = (range: number): number => {
    s = (Math.imul(s, 0x08088405) + 1) >>> 0;
    return Math.floor((s * range) / M);
  };

  const expected: Array<{ type: string; rotation: number }> = [];
  let pending = draw(100);
  for (let i = 0; i < 6; i++) {
    let index = SPEC_FREQUENCIES.findIndex(threshold => pending < threshold);
    if (index < 0) index = 0;
    const type = TETRINET_PIECE_ORDER[index];
    const rotation = draw(4) % Math.max(1, getRotationCount(type));
    expected.push({ type, rotation });
    pending = draw(100);
  }

  const engine: any = new TetriNetEngine({} as any, {
    useSameBlocks: true, randomSeed: seed, pieceFrequency: SPEC_FREQUENCIES,
    nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0,
  } as any);
  engine.start();

  const actual: Array<{ type: string; rotation: number }> = [];
  for (let i = 0; i < expected.length; i++) {
    const piece = engine.getState().currentPiece;
    if (!piece) break;
    actual.push({ type: piece.type, rotation: piece.rotation });
    engine.hardDrop();
    for (let t = 0; t < 4; t++) engine.update(16);
  }

  assert.deepStrictEqual(actual, expected,
    'both the block AND its orientation must follow the protocol generator');
}

export async function unseededGamesStillGetBlocks(): Promise<void> {
  // Local play has no server and no seed; the generator falls back to
  // Math.random and must still produce valid pieces.
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0 } as any);
  engine.start();

  for (let i = 0; i < 20; i++) {
    const piece = engine.getState().currentPiece;
    assert.ok(piece && TETRINET_PIECE_ORDER.includes(piece.type),
      'every spawned piece must be one of the seven');
    engine.hardDrop();
    for (let t = 0; t < 4; t++) engine.update(16);
    if (engine.getState().status !== 'playing') break;
  }
}

export async function averageLevelsMakesTheTableClimbTogether(): Promise<void> {
  // TetriNET's "average levels" option was parsed off the newgame message,
  // stored in the options, and then read by nothing at all - a server that
  // asked for averaged levels got per-player levels anyway.
  const { Screen } = await import('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const { TetriNetScreen } = await import('../ui/tetrinet-screen');
  const { TetriNetAI } = await import('../ai/tetrinet-ai');

  const options: any = { levelAverage: true, nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 };
  const screen: any = new (Screen as any)({ title: 'tnet-avg', width: 80, height: 30 });
  const engine: any = new TetriNetEngine({} as any, options);
  const ai: any = new (TetriNetAI as any)();
  const bots = ai.createOpponents(2, 5, {} as any, options);
  const scr: any = new (TetriNetScreen as any)({
    screen, engine,
    inputHandler: { on() {}, off() {}, setEnabled() {}, getConfig() { return {}; }, updateConfig() {} } as any,
    sounds: { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} } as any,
    state: { settings: {} } as any, network: null, playerName: 'sysop', aiController: ai,
  } as any);

  try {
    engine.start();
    // Levels 12, 0, 0 -> everyone should sit at the average, 4.
    (engine as any).level = 12;
    (bots[0].engine as any).level = 0;
    (bots[1].engine as any).level = 0;

    scr.refreshOpponents();

    assert.strictEqual(engine.getState().level, 4, 'the fast player is pulled back');
    assert.strictEqual(bots[0].engine.getState().level, 4, 'and the slow ones are pulled up');
  } finally { screen.destroy(); }
}

export async function perPlayerLevelsAreUntouchedByDefault(): Promise<void> {
  const engine: any = new TetriNetEngine({} as any, { nextPieceDelayMs: 0 } as any);
  engine.start();
  (engine as any).level = 7;

  engine.applyAverageLevel(2);

  assert.strictEqual(engine.getState().level, 7,
    'without the option a player keeps their own level');
}
