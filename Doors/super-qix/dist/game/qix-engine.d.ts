/**
 * Super Qix - Core Game Engine
 * Main game logic and state management
 */
import { SuperQixData, Direction } from './types';
import { Background } from './background';
type RenderCallback = (content: string) => void;
/**
 * Main game engine for Super Qix
 */
export declare class QixEngine {
    private data;
    private renderCallback;
    private drawingSystem;
    private enemySystem;
    private powerUpSystem;
    private lastMoveTime;
    /**
     * The picture hidden behind the playfield, revealed as area is claimed.
     * Null when the board has no art, in which case claimed area is drawn as
     * a flat colour and the game plays exactly as before.
     */
    private background;
    /**
     * A claim that is still being painted in.
     *
     * The area is won the instant the shape closes - the score and the
     * percentage are credited then - but the ground is filled in over several
     * frames, sweeping RIGHT TO LEFT, so the player sees the area being taken
     * rather than it appearing all at once. `columns` holds the cells grouped
     * by x, ordered right to left, and each tick consumes a slice of them.
     */
    private pendingFill;
    constructor(data: SuperQixData, renderCallback: RenderCallback);
    /**
     * Set the picture revealed as area is claimed.
     *
     * Loading it reads a file, so the door does that and hands the result in
     * rather than initLevel blocking on I/O.
     */
    setBackground(background: Background | null): void;
    /**
     * Initialize a new level
     */
    initLevel(levelNum: number): void;
    /**
     * Create initial field with borders
     */
    private createField;
    /**
     * Create border path for Sparx patrol
     */
    private createBorderPath;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Fill the border Time Meter, and release Skulls when it tops out.
     *
     * FAQ 1: "The outside border of the playing field is composed of squares
     * which serve as a Time Meter. As you play, they change colour two at a
     * time, until the whole border is red at which point two more Skulls are
     * released onto the field and the counter resets and starts again." Later
     * levels fill it faster (FAQ 1: "the timer counts down more quickly").
     */
    private advanceTimeMeter;
    /**
     * Queue a won area to be painted in, sweeping right to left.
     *
     * Grouped by column and reversed so the highest x is filled first. The
     * number of columns taken per tick is set so that any claim, from a
     * two-cell sliver to most of the board, finishes in about the same time -
     * a fixed per-column rate would make a big claim crawl.
     */
    private beginFill;
    /**
     * Has the Time Meter consumed this border square yet?
     *
     * The meter runs along the border path, and squares are consumed in pairs
     * (FAQ 1: "they change colour two at a time"), so the boundary is rounded
     * down to an even number of squares.
     */
    private isMeterFilled;
    /** Paint the next slice of a sweeping claim. */
    private advanceFill;
    /** Is a claim still sweeping across the field? */
    isFilling(): boolean;
    /**
     * Handle direction input
     */
    handleDirection(dir: Direction): void;
    /**
     * Detach from the edge and start drawing.
     *
     * Super Qix has a single Draw button - there is no slow/fast choice
     * (FAQ 2.5.3: "There's no longer an option to complete lines quickly
     * for safety or slowly for extra points"), so one entry point.
     */
    handleDraw(): void;
    /**
     * Start drawing in the current direction
     */
    private startDrawing;
    /**
     * Stop drawing (release key)
     */
    handleStopDraw(): void;
    /**
     * Update border path to include claimed area edges
     */
    private updateBorderPath;
    /**
     * Check all collisions
     */
    private checkCollisions;
    /**
     * Handle player death
     */
    private handleDeath;
    /**
     * Check if word is complete
     */
    private checkWordComplete;
    /**
     * Level complete
     */
    private levelComplete;
    /**
     * Advance to next level
     */
    advanceLevel(): void;
    /**
     * Main render function
     */
    render(): void;
}
export {};
//# sourceMappingURL=qix-engine.d.ts.map