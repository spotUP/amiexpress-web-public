/**
 * The TETRIS ATTACK screen: the board, the HUD, and the loop that drives them.
 *
 * Modelled on ui/tetrinet-screen.ts - a 16ms interval that advances the engine
 * and repaints at a slower rate - with one deliberate difference.
 *
 * THE ENGINE IS FED THE SAME WAY A REPLAY IS. Every frame this screen builds a
 * single input character from the held keys and hands it to the stack, exactly
 * as a recorded replay or a netplay opponent would. So the live game, a replay
 * and a networked game all run through one code path: the cursor's auto-repeat,
 * the every-other-frame swap rule and the raise gating are the engine's, not a
 * second implementation living in the UI that could drift from it.
 *
 * TIMING. The engine is frame-exact at 60Hz and the terminal is not. The two
 * are decoupled: a fixed-timestep accumulator runs whole engine frames, capped
 * at eight per tick so a slow repaint cannot run thirty frames back to back
 * with no input sampled between them, and the repaint is throttled separately.
 * That cap is the same one core/game.ts uses, for the same reason.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Stack } from '../core/panels/stack';
import { BoardVariant } from './panels/board-view';
import type { PuzzleGame, PuzzleOutcome } from '../core/panels/puzzle';
import { INPUT_CHARS } from '../core/panels/input-codec';
import type { SoundEngine } from '../audio/sounds';
/** What the screen needs to know about which keys are down right now. */
export interface HeldInput {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    swap: boolean;
    raise: boolean;
}
export interface PanelsScreenOptions {
    screen: Screen;
    /** The board to play. Omit when a puzzle is given - it owns its own. */
    stack?: Stack;
    /**
     * A puzzle instead of a free game.
     *
     * The same loop drives both: a puzzle is an ordinary board with different
     * end conditions and an undo, and duplicating three hundred lines of
     * fixed-timestep loop to say so would be the wrong kind of faithful. The
     * board is read through the puzzle because undo REPLACES it.
     */
    puzzle?: PuzzleGame;
    /**
     * Run one engine frame, when the mode owns the frame rather than the board.
     *
     * STAGE CLEAR uses this: the board is an ordinary stack, but the frame has
     * to go through the stage so it can test its clear line. The screen still
     * feeds the input; only the stepping is handed over.
     */
    onStep?: () => void;
    /** Is the mode finished? Asked alongside the board's own end conditions. */
    isOver?: () => boolean;
    /**
     * Records the game as it is played, one character per frame.
     *
     * Given the input the engine was ACTUALLY fed, at the point it is fed, so a
     * replay cannot drift from the game it claims to be - there is no second
     * path that could disagree.
     */
    recorder?: {
        record(inputCharacter: string): void;
    };
    /**
     * Watching rather than playing.
     *
     * A replay's inputs are already in the stack's buffer, so the screen must
     * not add the watcher's keypresses on top - that would append live input to
     * a recorded game and play a third thing that never happened.
     */
    playback?: boolean;
    sheet: Record<string, Sprite>;
    sounds?: SoundEngine;
    /** Read the currently held keys. Called once per engine frame. */
    readInput: () => HeldInput;
    /** Which sprite variant to draw. Defaults to the screen's width. */
    variant?: BoardVariant;
    /** Called when the player asks to leave. */
    onQuit?: () => void;
}
export interface PanelsResult {
    score: number;
    /** Frames of actual play. */
    frames: number;
    toppedOut: boolean;
    /** How a puzzle ended, when one was being played. */
    puzzleOutcome?: PuzzleOutcome;
}
export declare class PanelsScreen {
    private readonly screen;
    private readonly puzzle?;
    private readonly soloStack?;
    private readonly onStep?;
    private readonly isOver?;
    private readonly recorder?;
    private readonly playback;
    private readonly sheet;
    private readonly sounds?;
    private readonly readInput;
    private readonly variant;
    private frameBox?;
    /** The well's vertical edges where a full frame has no rows to spare. */
    private railBoxes;
    /** Does the HUD draw a frame? Only where it sits beside the board. */
    private hudFramed;
    private boardBox?;
    private hudBox?;
    private loop?;
    private lastTick;
    private frameAccumulator;
    private lastRender;
    private quitting;
    private layout?;
    /** Set by the caller's undo key; acted on at the top of the next frame. */
    private undoRequested;
    /**
     * The board being played.
     *
     * A getter, not a field, because undo rebuilds the puzzle's stack from its
     * input history - a captured reference would keep drawing the board the
     * player just took back.
     */
    private get stack();
    constructor(options: PanelsScreenOptions);
    /** Lay the board and HUD out, centred in whatever room there is. */
    private setupUI;
    /** The single input character for this frame. */
    private inputCharacter;
    private renderHud;
    /**
     * What the board IS on this screen - the same answer for its size and for
     * its paint, or the two disagree and the stack draws a row out of place.
     *
     * The C64 does not draw the incoming row. Twelve panel rows at double
     * height need 24 of its 25 rows, and a thirteenth would need 26: the choice
     * is a 12x24 board a player can read or a 6x13 one with a row of warning
     * under it. The sysop asked for the bigger tile, and this is what it costs -
     * the rising row is felt rather than seen there.
     */
    private boardOptions;
    private renderBoard;
    private repaint;
    /** Play until the stack tops out or the player leaves. */
    run(): Promise<PanelsResult>;
    /** Take back the last move, on the next frame. The original binds X and Y. */
    requestUndo(): void;
    /** Ask the loop to stop at the end of this frame. */
    quit(): void;
    cleanup(): void;
}
/** No keys held; the idle input character is 'A'. */
export declare function noInput(): HeldInput;
export { INPUT_CHARS };
//# sourceMappingURL=panels-screen.d.ts.map