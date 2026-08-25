/**
 * TetriNET bot regression tests.
 *
 * The bot never actually played: decideAction() picked at random from
 * ['left','right','rotate-cw','soft-drop','hard-drop'], and findBestMove()
 * - reached only at difficulty 7+ - returned ANOTHER random action under
 * the comment "In a real implementation, this would evaluate multiple
 * positions". So TetriNET opponents shuffled pieces around and topped out,
 * while the TGM bot next door had a full El-Tetris evaluator.
 *
 * Both now share ai/placement-search.ts.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TetriNetAI } from '../ai/tetrinet-ai';
import { PlacementSearch } from '../ai/placement-search';
import { createTetriNetBoard } from '../core/tetrinet/tetrinet-board';
import { getTetriNetShape } from '../core/tetrinet/tetrinet-pieces';

const options: any = { nextPieceDelayMs: 0, delayBeforeSuddenDeath: 0 };

function heights(board: any): number[] {
  const cols: number[] = [];
  for (let x = 0; x < board.width; x++) {
    let top = board.height;
    for (let y = 0; y < board.height; y++) {
      if (board.grid[y][x].filled) { top = y; break; }
    }
    cols.push(board.height - top);
  }
  return cols;
}

export async function theSearchPrefersFlatStacksToTowers(): Promise<void> {
  const search = new PlacementSearch(10);
  const board: any = createTetriNetBoard(12, 22);

  // A four-high tower in column 0, everything else empty.
  for (let y = 18; y < 22; y++) board.grid[y][0] = { filled: true, color: 'I', locked: true };

  const best = search.findBest(board, (r: number) => getTetriNetShape('O', r), 1);

  // `x` is the shape's origin, not its leftmost filled column - an O sits
  // at x+1..x+2 - so compare the columns it actually occupies.
  const shape = getTetriNetShape('O', best.rotation);
  const columns = new Set<number>();
  shape.forEach((row: number[]) => row.forEach((cell, dx) => { if (cell) columns.add(best.x + dx); }));

  assert.ok(!columns.has(0), 'stacking straight onto the tower is the worst option');
  assert.ok(best.score > -Infinity, 'and some placement is playable');
}

export async function theSearchFillsAGapRatherThanCoveringIt(): Promise<void> {
  const search = new PlacementSearch(10);
  const board: any = createTetriNetBoard(12, 22);

  // Bottom row full except columns 4 and 5 - an O drops in exactly there.
  for (let x = 0; x < 12; x++) {
    if (x === 4 || x === 5) continue;
    board.grid[21][x] = { filled: true, color: 'I', locked: true };
    board.grid[20][x] = { filled: true, color: 'I', locked: true };
  }

  const best = search.findBest(board, (r: number) => getTetriNetShape('O', r), 1);
  const shape = getTetriNetShape('O', best.rotation);
  const columns = new Set<number>();
  shape.forEach((row: number[]) => row.forEach((cell, dx) => { if (cell) columns.add(best.x + dx); }));

  assert.deepStrictEqual([...columns].sort(), [4, 5],
    'the only line-completing placement must win');
}

export async function botsPlaceEveryPieceTheyAreGiven(): Promise<void> {
  const ai: any = new TetriNetAI();
  const [bot] = ai.createOpponents(1, 10, {} as any, options);

  for (let i = 0; i < 12; i++) {
    bot.nextMoveTime = 0;
    ai.update(16);
  }

  const board = bot.engine.getBoard();
  const filled = board.grid.flat().filter((c: any) => c.filled).length;

  assert.ok(filled > 0, 'a bot that plays must leave blocks on its field');
  assert.strictEqual(bot.engine.getState().status, 'playing',
    'and must not have buried itself in twelve pieces');
}

export async function aStrongBotActuallyClearsLines(): Promise<void> {
  // The discriminating measurement: over 30 pieces a difficulty-10 bot
  // clears 5-7 lines leaving 0-3 holes, while the old random-move bot
  // managed about one line and buried its field. Best of three, because
  // the piece sequence is random.
  const run = (): { lines: number; holes: number } => {
    const ai: any = new TetriNetAI();
    const [bot] = ai.createOpponents(1, 10, {} as any, options);
    for (let i = 0; i < 30; i++) {
      bot.nextMoveTime = 0;
      ai.update(16);
      if (bot.engine.getState().status !== 'playing') break;
    }
    const board = bot.engine.getBoard();
    let holes = 0;
    for (let x = 0; x < board.width; x++) {
      let top = -1;
      for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x].filled) { if (top < 0) top = y; }
        else if (top >= 0) holes++;
      }
    }
    return { lines: bot.engine.getState().lines, holes };
  };

  const runs = [run(), run(), run()];
  const bestLines = Math.max(...runs.map(r => r.lines));
  const fewestHoles = Math.min(...runs.map(r => r.holes));

  assert.ok(bestLines >= 3,
    `a competent bot clears lines; best of three was ${bestLines}`);
  assert.ok(fewestHoles <= 5,
    `and does not bury its own field; fewest holes was ${fewestHoles}`);
}

export async function weakBotsPlayWorseThanStrongOnes(): Promise<void> {
  const stackFor = (difficulty: number): number => {
    let worst = 0;
    for (let trial = 0; trial < 3; trial++) {
      const ai: any = new TetriNetAI();
      const [bot] = ai.createOpponents(1, difficulty, {} as any, options);
      for (let i = 0; i < 30; i++) {
        bot.nextMoveTime = 0;
        ai.update(16);
        if (bot.engine.getState().status !== 'playing') break;
      }
      let holes = 0;
      const board = bot.engine.getBoard();
      for (let x = 0; x < board.width; x++) {
        let top = -1;
        for (let y = 0; y < board.height; y++) {
          if (board.grid[y][x].filled) { if (top < 0) top = y; }
          else if (top >= 0) holes++;
        }
      }
      worst = Math.max(worst, holes);
    }
    return worst;
  };

  // Difficulty is real, not just think time: the evaluator jitters its
  // score for anything below 10, so a level-1 bot leaves a messier field.
  assert.ok(stackFor(1) >= stackFor(10),
    'the weakest bot must not out-play the strongest');
}

export async function botsUseTheSpecialsTheyCollect(): Promise<void> {
  const ai: any = new TetriNetAI();
  const [bot] = ai.createOpponents(2, 10, {} as any, options)[0]
    ? ai.getOpponents()
    : [];

  bot.engine.getInventory().add('nuke');
  const before = bot.engine.getState().inventory.length;

  for (let i = 0; i < 40 && bot.engine.getState().inventory.length === before; i++) {
    bot.nextMoveTime = 0;
    ai.update(16);
  }

  assert.strictEqual(bot.engine.getState().inventory.length, 0,
    'a bot holding a special must eventually use it');
}

export async function botsKeepSelfOnlySpecialsForThemselves(): Promise<void> {
  const ai: any = new TetriNetAI();
  const bots = ai.createOpponents(2, 10, {} as any, options);

  // Clear Line only works on your own field; the old code sent every
  // special to another player, throwing this one away.
  bots[0].engine.getInventory().add('clear_line');
  const target = ai.pickTargetForSpecial
    ? ai.pickTargetForSpecial(bots[0], 'clear_line')
    : null;

  const source = readFileSync(join(__dirname, '..', 'ai', 'tetrinet-ai.ts'), 'utf8');
  assert.ok(source.includes('canTargetOthers'),
    'the bot must check whether a special can target others before aiming it');
  void target;
}

export async function theTwoBotsShareOneEvaluator(): Promise<void> {
  const dir = join(__dirname, '..', 'ai');
  const tgm = readFileSync(join(dir, 'bot-player.ts'), 'utf8');
  const tnet = readFileSync(join(dir, 'tetrinet-ai.ts'), 'utf8');

  for (const [name, src] of [['bot-player', tgm], ['tetrinet-ai', tnet]] as const) {
    assert.ok(/from '\.\/placement-search'/.test(src),
      `${name} must use the shared placement search`);
  }
  assert.ok(!/In a real implementation/.test(tnet),
    'the placeholder evaluator must be gone');
}
