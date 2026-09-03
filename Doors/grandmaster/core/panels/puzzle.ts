/**
 * Puzzle mode: a board somebody arranged, and one right answer.
 * Ports common/engine/Puzzle.lua and the rules half of its toGameMode.
 *
 * Every other mode here is a game of survival - the board rises, you keep it
 * down. A puzzle is the opposite: the board is frozen, there is no rise at all,
 * and you are given a fixed number of moves to leave it empty. That inversion
 * is expressed entirely in behaviours and end conditions; the engine
 * underneath is the same one, unmodified, which is the point.
 *
 * THREE TYPES, each with its own pair of conditions:
 *
 *   moves   clear every panel within N swaps. Lost when the swaps run out with
 *           panels still standing.
 *   chain   clear every panel, and it must be done as one chain. Lost the
 *           moment the chain drops.
 *   clear   clear all the garbage before the stack buries you. This one DOES
 *           rise, and is the only puzzle type that can be lost on health.
 *
 * A losing condition is only ever tested on a SETTLED board - nothing active,
 * no swap queued - because a puzzle mid-chain has not failed yet even when the
 * board momentarily looks unwinnable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Stack, type StackOptions, type SimulationDelay } from './stack';
import { PuzzleSource } from './puzzle-source';
import { getModern } from './level-data';
import { PUZZLE_WIDTH, PUZZLE_HEIGHT } from './puzzle-string';

/**
 * The level a puzzle is played at.
 *
 * Not a taste decision: the recorded solutions only work at the frame
 * constants they were recorded with. At modern 10 all 71 move puzzles and 83
 * of the 84 chain puzzles solve; one level either side and dozens fail.
 */
export const PUZZLE_LEVEL = 10;

export type PuzzleType = 'moves' | 'chain' | 'clear';
export type StartTiming = 'immediately' | 'countdown' | 'firstInput' | 'firstSwap';

export interface Puzzle {
  type: PuzzleType;
  /** The authored board, top row first. */
  stack: string;
  /** Swaps allowed; 0 means unlimited. */
  moves: number;
  startTiming: StartTiming;
  /** Stop time the board is handed at the start, in frames. */
  stopTime: number;
  shakeTime: number;
  /** Colours the player raises into view, for clear puzzles. */
  panelBuffer: string;
  /** Colours cleared garbage becomes. */
  garbageBuffer: string;
  /** Where the left half of the cursor starts, if the puzzle says. */
  cursorStartLeft?: { row: number; column: number };
  /** A recorded input string that solves it. The strongest test we have. */
  solution?: string;
  helpDescription?: string;
}

export interface PuzzleSet {
  name: string;
  description?: string;
  puzzles: Puzzle[];
}

/**
 * The start timing a puzzle gets when it does not say.
 *
 * Straight from the documented defaults: a clear or chain puzzle waits for the
 * player, and which wait depends on whether the cursor was placed for them - if
 * it was, moving it must not start the clock. A move puzzle starts at once,
 * because with no rise there is nothing for it to wait for.
 */
export function defaultStartTiming(type: PuzzleType, hasCursorStart: boolean): StartTiming {
  if (type === 'moves') return 'immediately';
  return hasCursorStart ? 'firstInput' : 'firstSwap';
}

/**
 * Pad an authored board out to a full playfield.
 *
 * A clear puzzle fills only the row it left half-written, because its board is
 * meant to be TALLER than the screen - the garbage above the top is the point
 * of the mode. Every other type is right-aligned into a full 6x12.
 */
export function fillPuzzleString(
  puzzleString: string,
  type: PuzzleType,
  width = PUZZLE_WIDTH,
  height = PUZZLE_HEIGHT,
): string {
  const stripped = puzzleString.replace(/\s/g, '');
  if (type === 'clear') {
    const partial = stripped.length % width;
    return partial > 0 ? '0'.repeat(width - partial) + stripped : stripped;
  }
  const target = width * height;
  if (stripped.length > target) {
    throw new Error(`puzzle string is longer than ${width}x${height}`);
  }
  return '0'.repeat(target - stripped.length) + stripped;
}

/** One puzzle, as the authoring format writes it. */
interface RawPuzzle {
  'Puzzle Type'?: string;
  Stack: string;
  Moves?: number;
  StartTiming?: string;
  Stop?: number;
  Shake?: number;
  PanelBuffer?: string;
  GarbagePanelBuffer?: string;
  CursorStartLeft?: { Row: number; Column: number };
  Solution?: string;
  'Help Description'?: string;
}

interface RawSet {
  'Set Name'?: string;
  Description?: string;
  Puzzles?: RawPuzzle[];
  'Puzzle Sets'?: RawSet[];
}

function toPuzzle(raw: RawPuzzle): Puzzle {
  const type = (raw['Puzzle Type'] ?? 'moves') as PuzzleType;
  const cursorStartLeft = raw.CursorStartLeft
    ? { row: raw.CursorStartLeft.Row, column: raw.CursorStartLeft.Column }
    : undefined;

  return {
    type,
    stack: raw.Stack.replace(/\s/g, ''),
    moves: raw.Moves ?? 0,
    startTiming: (raw.StartTiming as StartTiming | undefined)
      ?? defaultStartTiming(type, cursorStartLeft !== undefined),
    stopTime: raw.Stop ?? 0,
    shakeTime: raw.Shake ?? 0,
    panelBuffer: raw.PanelBuffer ?? '',
    garbageBuffer: raw.GarbagePanelBuffer ?? '',
    cursorStartLeft,
    solution: raw.Solution,
    helpDescription: raw['Help Description'],
  };
}

/**
 * Read a puzzle file.
 *
 * Sets nest - version 3 of the format allows a set to contain sets - so this
 * flattens the tree into the list of leaf sets, which is what a menu wants.
 */
export function loadPuzzleFile(filePath: string): PuzzleSet[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    'Puzzle Sets'?: RawSet[];
  };
  const out: PuzzleSet[] = [];

  const walk = (set: RawSet, trail: string[]): void => {
    const name = set['Set Name'] ?? trail[trail.length - 1] ?? 'puzzles';
    if (set.Puzzles && set.Puzzles.length > 0) {
      out.push({
        name,
        description: set.Description,
        puzzles: set.Puzzles.map(toPuzzle),
      });
    }
    for (const child of set['Puzzle Sets'] ?? []) walk(child, [...trail, name]);
  };

  for (const set of parsed['Puzzle Sets'] ?? []) walk(set, []);
  return out;
}

/** The puzzles the door ships with. */
export function loadShippedPuzzles(directory?: string): PuzzleSet[] {
  const dir = directory ?? path.join(__dirname, '..', '..', 'puzzles');
  return loadPuzzleFile(path.join(dir, 'Puzzles.json'));
}

/**
 * Build the stack a puzzle is played on.
 *
 * Only a clear puzzle keeps the rise: the other two are still pictures, and a
 * board that crept upward while the player thought would make a one-move
 * puzzle unsolvable by hesitation.
 */
export function puzzleStackOptions(puzzle: Puzzle): StackOptions {
  const isClear = puzzle.type === 'clear';
  const delaySimulationUntil: SimulationDelay = puzzle.startTiming === 'countdown'
    ? 'countdownEnded'
    : (puzzle.startTiming === 'immediately' ? null : puzzle.startTiming);

  return {
    // Modern 10: the level the shipped solutions were recorded at, and the
    // only family with a GARBAGE_HOVER - a classic preset cannot run a clear
    // puzzle at all, because it has no frame count for garbage becoming panels.
    levelData: getModern(PUZZLE_LEVEL),
    panelSource: new PuzzleSource(
      fillPuzzleString(puzzle.stack, puzzle.type),
      puzzle.panelBuffer,
      puzzle.garbageBuffer,
    ),
    behaviours: {
      passiveRaise: isClear,
      allowManualRaise: isClear,
      delaySimulationUntil,
    },
    startingStopTime: isClear ? puzzle.stopTime : 0,
    startingShakeTime: isClear ? puzzle.shakeTime : 0,
    doCountdown: puzzle.startTiming === 'countdown',
    maxSwaps: puzzle.moves > 0 ? puzzle.moves : undefined,
    startingRow: puzzle.cursorStartLeft?.row,
    startingColumn: puzzle.cursorStartLeft?.column,
  };
}

export type PuzzleOutcome = 'playing' | 'won' | 'lost';

/**
 * A puzzle in progress: the stack, plus the rules that decide when it is over.
 *
 * Kept beside the stack rather than inside it because these conditions belong
 * to the MODE, not to the engine - the same Stack class runs Endless with none
 * of them.
 */
export class PuzzleGame {
  readonly stack: Stack;
  readonly puzzle: Puzzle;
  private outcome: PuzzleOutcome = 'playing';

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.stack = new Stack(puzzleStackOptions(puzzle));
    this.stack.startingState();
  }

  /** Moves left, or null when the puzzle does not limit them. */
  movesLeft(): number | null {
    if (this.puzzle.moves <= 0) return null;
    return Math.max(0, this.puzzle.moves - this.stack.swapCount);
  }

  /**
   * Has the player finished it?
   *
   * A move or chain puzzle is won when no matchable panel is left; a clear
   * puzzle when no garbage is.
   */
  hasWon(): boolean {
    if (this.puzzle.type === 'clear') return !this.stack.hasMatchableGarbage();
    return this.stack.matchablePanelCount() === 0;
  }

  /**
   * Has it been failed?
   *
   * Only ever asked of a SETTLED board. Mid-chain, a puzzle that looks lost is
   * often one link away from being won, and testing it there would fail every
   * chain puzzle in the set on its own solution.
   */
  hasLost(): boolean {
    const stack = this.stack;
    if (stack.gameEnded()) return true;
    if (!stack.stopWatchIsRunning) return false;
    if (stack.hasActivePanels() || stack.swapQueued()) return false;

    if (this.puzzle.type === 'clear') {
      // Health and the rise are the clear puzzle's whole threat; the engine
      // already owns that condition.
      return false;
    }

    if (this.puzzle.type === 'chain') {
      // The chain dropped: panels were cleared and nothing is chaining now.
      if (stack.panelsCleared > 0 && stack.chainCounter === 0) return true;
    }

    return this.puzzle.moves > 0 && stack.swapCount >= this.puzzle.moves;
  }

  /** One frame, and then the verdict. */
  run(): PuzzleOutcome {
    if (this.outcome !== 'playing') return this.outcome;
    this.stack.run();

    // Winning is checked first: a puzzle solved on the last move has been
    // solved, not failed for running out of moves.
    if (this.hasWon()) this.outcome = 'won';
    else if (this.hasLost()) this.outcome = 'lost';
    return this.outcome;
  }

  result(): PuzzleOutcome {
    return this.outcome;
  }
}
