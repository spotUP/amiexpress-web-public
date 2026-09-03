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
    stack: Stack;
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
}
export declare class PanelsScreen {
    private readonly screen;
    private readonly stack;
    private readonly sheet;
    private readonly sounds?;
    private readonly readInput;
    private readonly variant;
    private boardBox?;
    private hudBox?;
    private loop?;
    private lastTick;
    private frameAccumulator;
    private lastRender;
    private quitting;
    constructor(options: PanelsScreenOptions);
    /** Lay the board and HUD out, centred in whatever room there is. */
    private setupUI;
    /** The single input character for this frame. */
    private inputCharacter;
    private renderHud;
    private renderBoard;
    private repaint;
    /** Play until the stack tops out or the player leaves. */
    run(): Promise<PanelsResult>;
    /** Ask the loop to stop at the end of this frame. */
    quit(): void;
    cleanup(): void;
}
/** No keys held; the idle input character is 'A'. */
export declare function noInput(): HeldInput;
export { INPUT_CHARS };
//# sourceMappingURL=panels-screen.d.ts.map