"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuzzleGame = exports.PUZZLE_LEVEL = void 0;
exports.defaultStartTiming = defaultStartTiming;
exports.fillPuzzleString = fillPuzzleString;
exports.loadPuzzleFile = loadPuzzleFile;
exports.loadShippedPuzzles = loadShippedPuzzles;
exports.puzzleStackOptions = puzzleStackOptions;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stack_1 = require("./stack");
const puzzle_source_1 = require("./puzzle-source");
const level_data_1 = require("./level-data");
const puzzle_string_1 = require("./puzzle-string");
/**
 * The level a puzzle is played at.
 *
 * Not a taste decision: the recorded solutions only work at the frame
 * constants they were recorded with. At modern 10 all 71 move puzzles and 83
 * of the 84 chain puzzles solve; one level either side and dozens fail.
 */
exports.PUZZLE_LEVEL = 10;
/**
 * The start timing a puzzle gets when it does not say.
 *
 * Straight from the documented defaults: a clear or chain puzzle waits for the
 * player, and which wait depends on whether the cursor was placed for them - if
 * it was, moving it must not start the clock. A move puzzle starts at once,
 * because with no rise there is nothing for it to wait for.
 */
function defaultStartTiming(type, hasCursorStart) {
    if (type === 'moves')
        return 'immediately';
    return hasCursorStart ? 'firstInput' : 'firstSwap';
}
/**
 * Pad an authored board out to a full playfield.
 *
 * A clear puzzle fills only the row it left half-written, because its board is
 * meant to be TALLER than the screen - the garbage above the top is the point
 * of the mode. Every other type is right-aligned into a full 6x12.
 */
function fillPuzzleString(puzzleString, type, width = puzzle_string_1.PUZZLE_WIDTH, height = puzzle_string_1.PUZZLE_HEIGHT) {
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
function toPuzzle(raw) {
    const type = (raw['Puzzle Type'] ?? 'moves');
    const cursorStartLeft = raw.CursorStartLeft
        ? { row: raw.CursorStartLeft.Row, column: raw.CursorStartLeft.Column }
        : undefined;
    return {
        type,
        stack: raw.Stack.replace(/\s/g, ''),
        moves: raw.Moves ?? 0,
        startTiming: raw.StartTiming
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
function loadPuzzleFile(filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const out = [];
    const walk = (set, trail) => {
        const name = set['Set Name'] ?? trail[trail.length - 1] ?? 'puzzles';
        if (set.Puzzles && set.Puzzles.length > 0) {
            out.push({
                name,
                description: set.Description,
                puzzles: set.Puzzles.map(toPuzzle),
            });
        }
        for (const child of set['Puzzle Sets'] ?? [])
            walk(child, [...trail, name]);
    };
    for (const set of parsed['Puzzle Sets'] ?? [])
        walk(set, []);
    return out;
}
/** The puzzles the door ships with. */
function loadShippedPuzzles(directory) {
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
function puzzleStackOptions(puzzle) {
    const isClear = puzzle.type === 'clear';
    const delaySimulationUntil = puzzle.startTiming === 'countdown'
        ? 'countdownEnded'
        : (puzzle.startTiming === 'immediately' ? null : puzzle.startTiming);
    return {
        // Modern 10: the level the shipped solutions were recorded at, and the
        // only family with a GARBAGE_HOVER - a classic preset cannot run a clear
        // puzzle at all, because it has no frame count for garbage becoming panels.
        levelData: (0, level_data_1.getModern)(exports.PUZZLE_LEVEL),
        panelSource: new puzzle_source_1.PuzzleSource(fillPuzzleString(puzzle.stack, puzzle.type), puzzle.panelBuffer, puzzle.garbageBuffer),
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
/**
 * A puzzle in progress: the stack, plus the rules that decide when it is over.
 *
 * Kept beside the stack rather than inside it because these conditions belong
 * to the MODE, not to the engine - the same Stack class runs Endless with none
 * of them.
 */
class PuzzleGame {
    constructor(puzzle) {
        this.outcome = 'playing';
        /** Every input this attempt has been given, in order. Undo replays it. */
        this.history = [];
        /** Index into history of each frame on which a swap was accepted. */
        this.swapFrames = [];
        this.puzzle = puzzle;
        this.stack = new stack_1.Stack(puzzleStackOptions(puzzle));
        this.stack.startingState();
    }
    /**
     * Feed one frame of input, remembering it.
     *
     * The remembering is what makes undo possible - see undo() for why a
     * recording beats a snapshot here.
     */
    receiveInput(char) {
        this.history.push(char);
        this.stack.receiveConfirmedInput(char);
    }
    canUndo() {
        return this.swapFrames.length > 0;
    }
    /**
     * Take back the last move, which the original binds to X and Y.
     *
     * By REPLAY, not by snapshot: the engine is deterministic - the same board
     * and the same inputs produce the same board, which the netplay tests pin -
     * so rebuilding from the start and stopping one frame before the swap gives
     * exactly the board that was there, with no state left over. A snapshot would
     * have to copy every panel, every timer, the queue, the source and the RNG,
     * and would go quietly stale the first time a field was added.
     *
     * A puzzle is at most a few thousand frames, so the replay is instant.
     */
    undo() {
        const frame = this.swapFrames.pop();
        if (frame === undefined)
            return false;
        // Everything up to, but not including, the frame the swap was made on.
        const replay = this.history.slice(0, frame);
        this.stack = new stack_1.Stack(puzzleStackOptions(this.puzzle));
        this.stack.startingState();
        this.history = [];
        this.swapFrames = [];
        this.outcome = 'playing';
        for (const char of replay) {
            this.receiveInput(char);
            this.step();
        }
        return true;
    }
    /** Moves left, or null when the puzzle does not limit them. */
    movesLeft() {
        if (this.puzzle.moves <= 0)
            return null;
        return Math.max(0, this.puzzle.moves - this.stack.swapCount);
    }
    /**
     * Has the player finished it?
     *
     * A move or chain puzzle is won when no matchable panel is left; a clear
     * puzzle when no garbage is.
     */
    hasWon() {
        if (this.puzzle.type === 'clear')
            return !this.stack.hasMatchableGarbage();
        return this.stack.matchablePanelCount() === 0;
    }
    /**
     * Has it been failed?
     *
     * Only ever asked of a SETTLED board. Mid-chain, a puzzle that looks lost is
     * often one link away from being won, and testing it there would fail every
     * chain puzzle in the set on its own solution.
     */
    hasLost() {
        const stack = this.stack;
        if (stack.gameEnded())
            return true;
        if (!stack.stopWatchIsRunning)
            return false;
        if (stack.hasActivePanels() || stack.swapQueued())
            return false;
        if (this.puzzle.type === 'clear') {
            // Health and the rise are the clear puzzle's whole threat; the engine
            // already owns that condition.
            return false;
        }
        if (this.puzzle.type === 'chain') {
            // The chain dropped: panels were cleared and nothing is chaining now.
            if (stack.panelsCleared > 0 && stack.chainCounter === 0)
                return true;
        }
        return this.puzzle.moves > 0 && stack.swapCount >= this.puzzle.moves;
    }
    /** One frame, and then the verdict. */
    run() {
        if (this.outcome !== 'playing')
            return this.outcome;
        this.step();
        // Winning is checked first: a puzzle solved on the last move has been
        // solved, not failed for running out of moves.
        if (this.hasWon())
            this.outcome = 'won';
        else if (this.hasLost())
            this.outcome = 'lost';
        return this.outcome;
    }
    /** One engine frame, recording whether a move was spent on it. */
    step() {
        const before = this.stack.swapCount;
        this.stack.run();
        if (this.stack.swapCount > before) {
            // The input that caused it is the one fed for this frame, which is the
            // last thing pushed onto the history.
            this.swapFrames.push(this.history.length - 1);
        }
    }
    result() {
        return this.outcome;
    }
}
exports.PuzzleGame = PuzzleGame;
//# sourceMappingURL=puzzle.js.map