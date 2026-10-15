/**
 * TetriNET special/garbage router regression tests.
 *
 * Same disease the versus mode had (see attack-routing.test.ts): both halves
 * of the exchange existed and were correct, and NOTHING connected them.
 *
 * - The human's onSpecialUsed listener played a sound and animated an
 *   arrow. It never touched an opponent engine.
 * - The human's onLinesAdded listener's only outgoing branch was
 *   `if (this.network) { ... // TODO: Send garbage to target via network }`,
 *   and in local play `network` is null anyway.
 * - Both receive-side methods, applyIncomingSpecial() and addGarbage(), had
 *   exactly one caller repo-wide: the EXTERNAL TetriNET server path.
 * - The bots' pickTarget() returned 'player' only when every other bot was
 *   already dead, so while any bot lived the human could not be hit at all.
 * - useSpecial() popped self-only specials off the inventory and applied
 *   nothing, so Clear Line was a slot that deleted itself.
 * - Switch Fields reached applySpecialEffect without the sender's board and
 *   returned 'Switch requires two boards'.
 * - TetriNetAI.allDead() had zero callers, so a local game could only be
 *   lost.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from '../ui/tetrinet-screen';
import { TetriNetAI, HUMAN_TARGET_ID } from '../ai/tetrinet-ai';
import { getTetriNetShape } from '../core/tetrinet/tetrinet-pieces';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const inputStub: any = { on() {}, off() {}, setEnabled() {} };
const appState: any = { settings: { blockGlow: false, glowIntensity: 0, clearStyle: 'instant' } };
const options: any = { classicMode: true, delayBeforeSuddenDeath: 0 };

function filled(engine: any): number {
  return engine.getBoard().grid.flat().filter((c: any) => c.filled).length;
}

/** Fill row `y` on `engine`'s board, skipping the listed columns. */
function fillRow(engine: any, y: number, skip: number[] = []): void {
  const board = engine.getBoard();
  for (let x = 0; x < board.width; x++) {
    if (skip.includes(x)) continue;
    board.grid[y][x] = { filled: true, color: 'I', locked: true };
  }
}

/** Columns a piece occupies at its current position (O sits at x+1, x+2). */
function footprint(piece: any): number[] {
  const shape = getTetriNetShape(piece.type, piece.rotation ?? 0);
  const columns = new Set<number>();
  for (const row of shape) {
    row.forEach((cell: number, dx: number) => {
      if (cell) columns.add(piece.x + dx);
    });
  }
  return [...columns];
}

/**
 * A started engine whose CURRENT piece is an O, so a hard drop lands in a
 * known 2x2 footprint and completes exactly the rows we prepared.
 */
function engineWithSquarePiece(): any {
  for (let attempt = 0; attempt < 500; attempt++) {
    const engine: any = new TetriNetEngine({} as any, options);
    engine.start();
    if (engine.getState().currentPiece?.type === 'O') return engine;
  }
  throw new Error('never spawned an O piece in 500 tries');
}

function match(botCount = 3, engine: any = null): any {
  const screen: any = new Screen({ title: 'tnet-routing', width: 80, height: 30 });
  const human: any = engine ?? new TetriNetEngine({} as any, options);
  const ai: any = new TetriNetAI();
  const bots = ai.createOpponents(botCount, 5, {} as any, options);
  const scr: any = new TetriNetScreen({
    screen, engine: human, inputHandler: inputStub, sounds, state: appState,
    network: null, playerName: 'sysop', aiController: ai,
  } as any);
  if (!engine) human.start();
  scr.updateOpponents(bots.map((bot: any) => ({
    id: bot.id, name: bot.name, board: bot.engine.getBoard(),
    level: 0, alive: true, hasImmunity: false,
  })));
  return { screen, human, ai, bots, scr, done: () => screen.destroy() };
}

export async function humanSpecialReachesTheTargetedBot(): Promise<void> {
  const m = match();
  try {
    fillRow(m.bots[1].engine, 21);
    const before = filled(m.bots[1].engine);
    assert.ok(before > 0, 'test setup: target board must have blocks to nuke');

    m.human.getInventory().add('nuke');
    m.human.useSpecial('ai-2');

    assert.strictEqual(filled(m.bots[1].engine), 0,
      'nuke used on ai-2 must clear ai-2\'s board');
  } finally { m.done(); }
}

export async function aSpecialOnlyHitsThePlayerItWasAimedAt(): Promise<void> {
  const m = match();
  try {
    fillRow(m.bots[0].engine, 21);
    fillRow(m.bots[2].engine, 21);
    const untouched = filled(m.bots[2].engine);

    m.human.getInventory().add('nuke');
    m.human.useSpecial('ai-1');

    assert.strictEqual(filled(m.bots[0].engine), 0, 'ai-1 was the target');
    assert.strictEqual(filled(m.bots[2].engine), untouched, 'ai-3 must be untouched');
  } finally { m.done(); }
}

export async function botSpecialReachesTheHuman(): Promise<void> {
  const m = match();
  try {
    fillRow(m.human, 21);
    assert.ok(filled(m.human) > 0, 'test setup');

    m.bots[0].engine.getInventory().add('nuke');
    m.bots[0].engine.useSpecial(HUMAN_TARGET_ID);

    assert.strictEqual(filled(m.human), 0, 'a bot nuke must clear the human board');
  } finally { m.done(); }
}

export async function botsCanTargetTheHumanWhileOtherBotsLive(): Promise<void> {
  const ai: any = new TetriNetAI();
  const bots = ai.createOpponents(3, 5, {} as any, options);
  const picks = new Set<string>();
  for (let i = 0; i < 300; i++) {
    picks.add(ai.pickTarget(bots[0]));
  }
  assert.ok(picks.has(HUMAN_TARGET_ID),
    'the human must be a candidate target while other bots are alive');
  assert.ok(picks.has('ai-2') && picks.has('ai-3'), 'other bots stay candidates');
  assert.ok(!picks.has('ai-1'), 'a bot must not target itself');
}

export async function humanClassicClearGarbagesEveryBot(): Promise<void> {
  const engine = engineWithSquarePiece();
  const m = match(3, engine);
  try {
    const skip = footprint(m.human.getState().currentPiece);
    fillRow(m.human, 20, skip);
    fillRow(m.human, 21, skip);

    m.human.hardDrop();

    for (const bot of m.bots) {
      assert.ok(filled(bot.engine) > 0,
        `bot ${bot.id} must receive classic garbage from a double clear`);
    }
  } finally { m.done(); }
}

export async function garbageSkipsTheSenderAndTheDead(): Promise<void> {
  const engine = engineWithSquarePiece();
  const m = match(2, engine);
  try {
    m.bots[0].alive = false;
    const skip = footprint(m.human.getState().currentPiece);
    fillRow(m.human, 20, skip);
    fillRow(m.human, 21, skip);
    const humanBefore = filled(m.human);

    m.human.hardDrop();

    assert.strictEqual(filled(m.bots[0].engine), 0, 'a dead bot takes no garbage');
    assert.ok(filled(m.bots[1].engine) > 0, 'the living bot takes the garbage');
    assert.ok(filled(m.human) < humanBefore, 'the sender does not garbage itself');
  } finally { m.done(); }
}

export async function immunityBlocksAnIncomingSpecial(): Promise<void> {
  const m = match();
  try {
    // Positive control first: without immunity the nuke must land, otherwise
    // this test would also pass with the router removed entirely.
    fillRow(m.human, 21);
    m.bots[0].engine.getInventory().add('nuke');
    m.bots[0].engine.useSpecial(HUMAN_TARGET_ID);
    assert.strictEqual(filled(m.human), 0, 'control: an unprotected human takes the nuke');

    fillRow(m.human, 21);
    const before = filled(m.human);

    m.human.getInventory().add('immunity');
    m.human.useSpecial();

    m.bots[0].engine.getInventory().add('nuke');
    m.bots[0].engine.useSpecial(HUMAN_TARGET_ID);

    assert.strictEqual(filled(m.human), before, 'immunity must block the incoming nuke');
  } finally { m.done(); }
}

export async function switchFieldsSwapsBothBoards(): Promise<void> {
  const m = match();
  try {
    fillRow(m.human, 21);
    fillRow(m.bots[0].engine, 20);
    fillRow(m.bots[0].engine, 21);
    const humanBefore = filled(m.human);
    const botBefore = filled(m.bots[0].engine);
    assert.notStrictEqual(humanBefore, botBefore, 'test setup: boards must differ');

    m.human.getInventory().add('switch');
    m.human.useSpecial('ai-1');

    assert.strictEqual(filled(m.human), botBefore, 'human received the bot\'s field');
    assert.strictEqual(filled(m.bots[0].engine), humanBefore, 'bot received the human\'s field');
  } finally { m.done(); }
}

export async function clearLineActsOnTheUsersOwnBoard(): Promise<void> {
  const engine: any = new TetriNetEngine({} as any, options);
  engine.start();
  fillRow(engine, 21);
  const before = filled(engine);

  engine.getInventory().add('clear_line');
  engine.useSpecial('ai-1');  // target id is irrelevant: Clear Line is self-only

  assert.ok(filled(engine) < before,
    'Clear Line must remove a row from the user\'s own board, not vanish');
}

export async function outlivingEveryBotWinsTheMatch(): Promise<void> {
  const m = match(2);
  try {
    m.scr.checkVictory();
    assert.strictEqual(m.human.getState().status, 'playing', 'bots alive: no win yet');

    for (const bot of m.bots) bot.alive = false;
    m.scr.checkVictory();

    assert.strictEqual(m.human.getState().status, 'won',
      'outliving every bot must end the match as a win');
  } finally { m.done(); }
}

export async function networkedGamesAreNotRoutedLocally(): Promise<void> {
  // The external server fans out specials itself and app.ts applies what
  // comes back; routing locally as well would apply every hit twice.
  const screen: any = new Screen({ title: 'tnet-routing-net', width: 80, height: 30 });
  const human: any = new TetriNetEngine({} as any, options);
  const ai: any = new TetriNetAI();
  const bots = ai.createOpponents(1, 5, {} as any, options);
  const network: any = { onUpdate: () => () => {}, sendUpdate() {}, sendAttack() {} };
  const scr: any = new TetriNetScreen({
    screen, engine: human, inputHandler: inputStub, sounds, state: appState,
    network, playerName: 'sysop', aiController: ai,
  } as any);
  try {
    human.start();
    fillRow(bots[0].engine, 21);
    const before = filled(bots[0].engine);

    human.getInventory().add('nuke');
    human.useSpecial('ai-1');

    assert.strictEqual(filled(bots[0].engine), before,
      'networked play must not double-apply through the local router');
    assert.ok(scr, 'screen constructed');
  } finally { screen.destroy(); }
}
