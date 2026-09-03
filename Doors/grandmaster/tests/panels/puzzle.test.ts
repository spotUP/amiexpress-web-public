/**
 * Puzzle mode, proved against 235 recorded solutions.
 *
 * This is the strongest oracle in the port and it costs nothing to run: every
 * puzzle panel-attack ships carries a Solution - the exact input string that
 * solves it, recorded from a real game. Replaying one is an end-to-end test of
 * swapping, hovering, falling, matching, popping, chaining, garbage clearing,
 * the cursor, input decoding and the move limit at once, with a pass/fail the
 * engine cannot fake: the board is either empty at the end or it is not.
 *
 * They also PINNED two things no reading of the source would have caught:
 *
 *   The cursor starts at (7, 3). Solutions are recorded relative to it, so a
 *   board starting the cursor anywhere else quietly performs a different set of
 *   swaps. 3 of 71 move puzzles solved before that was fixed; 71 after.
 *
 *   Puzzles are played at MODERN 10. One level either side and dozens fail on
 *   frame timing alone, and the classic presets cannot run a clear puzzle at
 *   all - they have no GARBAGE_HOVER.
 */

import assert from 'assert';
import {
  loadShippedPuzzles,
  fillPuzzleString,
  defaultStartTiming,
  PuzzleGame,
  PUZZLE_LEVEL,
  type Puzzle,
} from '../../core/panels/puzzle';
import { buildPanels } from '../../core/panels/puzzle-source';
import { decompressInputString } from '../../core/panels/input-codec';

/**
 * The one puzzle whose recorded solution does not solve it here.
 *
 * Its board is unusually full of colour 9 - unmatchable grey panels - and the
 * recorded inputs perform all seven of their swaps on the right cells without
 * ever completing a match. Named rather than hidden: if a change makes it pass,
 * this test says so, and if a change breaks any of the other 234 it fails.
 */
const KNOWN_UNSOLVED = 'puzzle_set_name_novice_chains#3';

/** Play a puzzle with its recorded solution. Returns the outcome. */
function solve(puzzle: Puzzle): string {
  const game = new PuzzleGame(puzzle);
  let outcome = 'playing';

  for (const char of decompressInputString(puzzle.solution ?? '')) {
    game.stack.receiveConfirmedInput(char);
    outcome = game.run();
    if (outcome !== 'playing') break;
  }
  // The recording usually ends before the last chain has finished popping.
  for (let i = 0; i < 600 && outcome === 'playing'; i++) {
    game.stack.receiveConfirmedInput('A');
    outcome = game.run();
  }
  return outcome;
}

export async function everyShippedPuzzleLoads(): Promise<void> {
  const sets = loadShippedPuzzles();
  const puzzles = sets.flatMap((set) => set.puzzles);

  assert.strictEqual(puzzles.length, 235, 'the shipped file holds 235 puzzles');
  assert.ok(sets.length > 30, 'across many sets');
  assert.ok(puzzles.every((p) => p.solution), 'every one of them carries a solution');

  const byType = puzzles.reduce<Record<string, number>>((counts, puzzle) => {
    counts[puzzle.type] = (counts[puzzle.type] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepStrictEqual(byType, { moves: 71, chain: 84, clear: 80 });
}

/**
 * The whole suite, played. Slow by the standards of this file and worth every
 * frame of it.
 */
export async function everyRecordedSolutionSolvesItsPuzzle(): Promise<void> {
  const failures: string[] = [];

  for (const set of loadShippedPuzzles()) {
    set.puzzles.forEach((puzzle, index) => {
      const name = `${set.name}#${index + 1}`;
      let outcome: string;
      try {
        outcome = solve(puzzle);
      } catch (error) {
        outcome = `threw: ${(error as Error).message}`;
      }
      if (outcome !== 'won') failures.push(`${name} -> ${outcome}`);
    });
  }

  assert.deepStrictEqual(
    failures.map((line) => line.split(' ->')[0]),
    [KNOWN_UNSOLVED],
    `unexpected puzzle failures:\n  ${failures.join('\n  ')}`,
  );
}

export async function puzzlesArePlayedAtModernTen(): Promise<void> {
  assert.strictEqual(PUZZLE_LEVEL, 10);
  const puzzle = loadShippedPuzzles()[0].puzzles[0];
  const game = new PuzzleGame(puzzle);
  assert.ok(
    game.stack.levelData.frameConstants.GARBAGE_HOVER !== undefined,
    'a puzzle level must be able to turn garbage into panels',
  );
}

/** The cursor default the recorded solutions are written against. */
export async function theCursorStartsAtRowSevenColumnThree(): Promise<void> {
  const puzzle = loadShippedPuzzles()[0].puzzles[0];
  const game = new PuzzleGame(puzzle);
  assert.strictEqual(game.stack.curRow, 7);
  assert.strictEqual(game.stack.curCol, 3);
}

export async function aPuzzleMayPlaceTheCursorItself(): Promise<void> {
  const puzzle: Puzzle = {
    type: 'moves', stack: '000000111000', moves: 1, startTiming: 'immediately',
    stopTime: 0, shakeTime: 0, panelBuffer: '', garbageBuffer: '',
    cursorStartLeft: { row: 2, column: 4 },
  };
  const game = new PuzzleGame(puzzle);
  assert.strictEqual(game.stack.curRow, 2);
  assert.strictEqual(game.stack.curCol, 4);
}

/**
 * A move puzzle REFUSES the swap that would exceed the limit rather than
 * accepting it and declaring a loss afterwards - which is what the player sees
 * on the original.
 */
export async function aSpentMovePuzzleRefusesFurtherSwaps(): Promise<void> {
  const puzzle: Puzzle = {
    type: 'moves', stack: '000000000000000000000000000000000000000000000000000000000000000000010110',
    moves: 1, startTiming: 'immediately', stopTime: 0, shakeTime: 0,
    panelBuffer: '', garbageBuffer: '',
  };
  const game = new PuzzleGame(puzzle);
  game.stack.curRow = 1;
  game.stack.curCol = 1;

  // Two frames first: swapping is refused on the opening frame.
  game.stack.receiveConfirmedInput('A');
  game.run();
  game.stack.receiveConfirmedInput('A');
  game.run();

  game.stack.receiveConfirmedInput('Q');
  game.run();
  assert.strictEqual(game.stack.swapCount, 1, 'the one move is spent');

  for (let i = 0; i < 30; i++) {
    game.stack.receiveConfirmedInput('Q');
    game.run();
  }
  assert.strictEqual(game.stack.swapCount, 1, 'and no further swap is accepted');
}

/**
 * A puzzle is a still picture until it is touched. Without this, a one-move
 * puzzle could be lost by reading it.
 */
export async function physicsWaitForThePlayer(): Promise<void> {
  const puzzle: Puzzle = {
    type: 'chain', stack: '000000000000000000000000000000000000000000000000000000000000000000010110',
    moves: 0, startTiming: 'firstSwap', stopTime: 0, shakeTime: 0,
    panelBuffer: '', garbageBuffer: '',
  };
  const game = new PuzzleGame(puzzle);

  for (let i = 0; i < 120; i++) {
    game.stack.receiveConfirmedInput('A');
    game.run();
  }
  assert.strictEqual(game.stack.stopWatch, 0, 'not one frame of play has happened');
  assert.strictEqual(game.stack.stopWatchIsRunning, false);

  game.stack.curRow = 1;
  game.stack.curCol = 2;
  game.stack.receiveConfirmedInput('Q');
  game.run();
  assert.strictEqual(game.stack.stopWatchIsRunning, true, 'the swap wakes the board');
  assert.strictEqual(
    game.stack.stopWatch, 0,
    'and the waking frame itself does not simulate - the swap gets to queue first',
  );
}

export async function theDefaultStartTimingFollowsTheType(): Promise<void> {
  assert.strictEqual(defaultStartTiming('moves', false), 'immediately');
  assert.strictEqual(defaultStartTiming('moves', true), 'immediately');
  assert.strictEqual(defaultStartTiming('chain', false), 'firstSwap');
  assert.strictEqual(
    defaultStartTiming('chain', true), 'firstInput',
    'a placed cursor means moving it must not start the clock',
  );
  assert.strictEqual(defaultStartTiming('clear', true), 'firstInput');
}

/**
 * A clear puzzle's board is taller than the screen ON PURPOSE - the garbage
 * above the top is where the mode's difficulty comes from - so it is not padded
 * out to a full playfield the way the other types are.
 */
export async function onlyClearPuzzlesKeepBoardsTallerThanTheScreen(): Promise<void> {
  assert.strictEqual(fillPuzzleString('1234', 'moves').length, 72);
  assert.strictEqual(fillPuzzleString('1234', 'moves').slice(-4), '1234');

  const tall = '1'.repeat(6 * 15 + 2);
  assert.strictEqual(fillPuzzleString(tall, 'clear').length, 6 * 16, 'rounded up to a row');
  assert.throws(() => fillPuzzleString('1'.repeat(73), 'moves'));
}

/** The garbage notation, which is the only part of the format that has shape. */
export async function garbageNotationBuildsOneBlock(): Promise<void> {
  const stack = { width: 6, height: 12, nextGarbageId: () => 1 };
  const panels = buildPanels('[====]', stack);

  assert.strictEqual(panels.length, 6);
  assert.ok(panels.every((panel) => panel.isGarbage), 'the whole row is garbage');
  assert.ok(panels.every((panel) => panel.color === 9));
  assert.deepStrictEqual(panels.map((panel) => panel.xOffset), [0, 1, 2, 3, 4, 5]);
  assert.ok(panels.every((panel) => panel.yOffset === 0));
  assert.ok(panels.every((panel) => panel.width === 6 && panel.height === 1));
  assert.ok(panels.every((panel) => panel.metal === false));
}

export async function braceNotationIsMetalGarbage(): Promise<void> {
  const stack = { width: 6, height: 12, nextGarbageId: () => 7 };
  const panels = buildPanels('{====}', stack);
  assert.ok(panels.every((panel) => panel.metal === true));
  assert.ok(panels.every((panel) => panel.garbageId === 7));
}

/**
 * A block spanning two rows opens on the row BELOW and closes on the row above,
 * because the string is read bottom-up and right-to-left. Getting this backwards
 * builds a board that looks plausible and is upside down.
 */
export async function aGarbageBlockMaySpanRows(): Promise<void> {
  const stack = { width: 6, height: 12, nextGarbageId: () => 3 };
  // Two rows: the top row of the string is the top of the block.
  const panels = buildPanels('[=====' + '=====]', stack);

  assert.strictEqual(panels.length, 12);
  assert.ok(panels.every((panel) => panel.garbageId === 3), 'one block, not two');
  assert.ok(panels.every((panel) => panel.height === 2));
  // Panels are handed out top row first, so the first six are the TOP row,
  // which is the one further from the block's origin.
  assert.ok(panels.slice(0, 6).every((panel) => panel.yOffset === 1));
  assert.ok(panels.slice(6).every((panel) => panel.yOffset === 0));
}

export async function anUnclosedGarbageBlockIsRejected(): Promise<void> {
  const stack = { width: 6, height: 12, nextGarbageId: () => 1 };
  assert.throws(() => buildPanels('0000=]', stack), /never closed/);
  assert.throws(() => buildPanels('0000=[', stack), /stray/);
}

/** Colours and garbage in the same board, which is what a clear puzzle is. */
export async function anAuthoredBoardMixesPanelsAndGarbage(): Promise<void> {
  const stack = { width: 6, height: 12, nextGarbageId: () => 2 };
  const panels = buildPanels('[====]' + '123456', stack);

  const top = panels.slice(0, 6);
  const bottom = panels.slice(6);
  assert.ok(top.every((panel) => panel.isGarbage), 'garbage on top');
  assert.deepStrictEqual(bottom.map((panel) => panel.color), [1, 2, 3, 4, 5, 6]);
  assert.ok(bottom.every((panel) => !panel.isGarbage));
}

/**
 * Undo, which the original binds to X and Y and which neither open-source
 * implementation has.
 *
 * It works by REPLAY rather than by snapshot: the engine is deterministic, so
 * rebuilding from the start and stopping one frame short of the swap gives back
 * exactly the board that was there. A snapshot would have to copy every panel,
 * every timer, the queue, the source and the RNG, and would go stale the first
 * time a field was added.
 */
function boardString(game: PuzzleGame): string {
  const rows: string[] = [];
  for (let row = 12; row >= 1; row--) {
    let line = '';
    for (let col = 1; col <= 6; col++) line += String(game.stack.panels[row][col].color);
    rows.push(line);
  }
  return rows.join('');
}

/** A one-row board with a swap that matches nothing, so undo can be seen. */
function undoFixture(): PuzzleGame {
  const puzzle: Puzzle = {
    type: 'moves',
    stack: '123456',
    moves: 5,
    startTiming: 'immediately',
    stopTime: 0, shakeTime: 0, panelBuffer: '', garbageBuffer: '',
    cursorStartLeft: { row: 1, column: 2 },
  };
  const game = new PuzzleGame(puzzle);
  // Swapping is refused on the opening frames.
  for (let i = 0; i < 3; i++) { game.receiveInput('A'); game.run(); }
  return game;
}

export async function undoTakesBackTheLastMove(): Promise<void> {
  const game = undoFixture();
  const before = boardString(game);
  assert.strictEqual(game.canUndo(), false, 'nothing to take back yet');

  game.receiveInput('Q');
  game.run();
  // Let the swap animation finish.
  for (let i = 0; i < 10; i++) { game.receiveInput('A'); game.run(); }

  assert.strictEqual(game.stack.swapCount, 1);
  assert.notStrictEqual(boardString(game), before, 'the swap changed the board');
  assert.strictEqual(game.canUndo(), true);

  assert.strictEqual(game.undo(), true);
  assert.strictEqual(game.stack.swapCount, 0, 'the move is given back');
  assert.strictEqual(boardString(game), before, 'and so is the board, exactly');
  assert.strictEqual(game.canUndo(), false);
}

export async function undoDoesNothingBeforeTheFirstMove(): Promise<void> {
  const game = undoFixture();
  assert.strictEqual(game.undo(), false);
  assert.strictEqual(game.stack.swapCount, 0);
}

/** Two moves back, one at a time, each landing on the right board. */
export async function undoUnwindsMoveByMove(): Promise<void> {
  const game = undoFixture();
  const boards: string[] = [boardString(game)];

  for (let move = 0; move < 2; move++) {
    game.receiveInput('Q');
    game.run();
    for (let i = 0; i < 10; i++) { game.receiveInput('A'); game.run(); }
    boards.push(boardString(game));
  }
  assert.strictEqual(game.stack.swapCount, 2);

  game.undo();
  assert.strictEqual(game.stack.swapCount, 1);
  assert.strictEqual(boardString(game), boards[1]);

  game.undo();
  assert.strictEqual(game.stack.swapCount, 0);
  assert.strictEqual(boardString(game), boards[0]);
}

/** An undone move is spendable again - that is the whole point in a move puzzle. */
export async function undoGivesTheMoveBackToSpend(): Promise<void> {
  const puzzle: Puzzle = {
    type: 'moves', stack: '123456', moves: 1, startTiming: 'immediately',
    stopTime: 0, shakeTime: 0, panelBuffer: '', garbageBuffer: '',
    cursorStartLeft: { row: 1, column: 2 },
  };
  const game = new PuzzleGame(puzzle);
  for (let i = 0; i < 3; i++) { game.receiveInput('A'); game.run(); }

  game.receiveInput('Q');
  game.run();
  for (let i = 0; i < 10; i++) { game.receiveInput('A'); game.run(); }
  assert.strictEqual(game.movesLeft(), 0, 'the only move is spent');

  game.undo();
  assert.strictEqual(game.movesLeft(), 1, 'and handed back');

  game.receiveInput('Q');
  game.run();
  assert.strictEqual(game.stack.swapCount, 1, 'the board accepts a swap again');
}
