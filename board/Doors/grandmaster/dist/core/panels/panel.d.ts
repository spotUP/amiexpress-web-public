/**
 * Panel, ported from common/engine/Panel.lua (@ c80668e).
 *
 * A panel is a small state machine with ten states, and almost everything that
 * makes this game feel like this game lives in how those states hand off to one
 * another. The frame counts come from the level tables; the TRANSITIONS come
 * from here.
 *
 * The grid is Lua-indexed on purpose: `panels[row][column]` with rows starting
 * at 0 and columns at 1. Row 0 is the dimmed row below the floor - the one you
 * can see waiting at the bottom of the screen - and it exists so that no panel
 * in play ever has to bounds-check the panel below it. Renumbering to 0-based
 * would mean touching every comparison in the file, which is exactly how a port
 * like this acquires an off-by-one it never finds again.
 *
 * THREE ONE-FRAME SIGNALS carry all the chain behaviour, and they are reset at
 * the top of every update:
 *
 *   propagatesChaining  set by a panel that has just popped for good. Panels are
 *                       updated bottom to top, so the panel above reads it in
 *                       the same sweep and inherits `chaining`. This is the root
 *                       of every chain in the game.
 *   propagatesFalling   set by garbage that has just dropped out from under a
 *                       stack, so the panels above fall immediately instead of
 *                       hovering.
 *   matchAnyway         the one-frame window in which a freshly hovering panel
 *                       is still matchable. Hovering panels normally cannot
 *                       match; this flag is what makes the skill chains work.
 *
 * The asymmetry between how a SWAP and a FALL enter hover is deliberate and is
 * the difference between a chain continuing and dying:
 *   - a panel that finishes a swap over a gap gets FULL hover time and does NOT
 *     take the chaining flag, only propagates it
 *   - a falling panel inherits the hover time of the panel below and explicitly
 *     does not gain a chaining flag it did not already have
 */
import type { FrameConstants } from './level-data';
/** The ten states a panel can be in. */
export type PanelState = 'normal' | 'swapping' | 'matched' | 'popping' | 'popped' | 'hovering' | 'falling' | 'landing' | 'dimmed' | 'dead';
/**
 * Colour indices, as the original numbers them.
 * 0 empty, 1-7 ordinary colours, 8 shock ([!]), 9 garbage/colourless.
 */
export declare const PANEL_COLORS: {
    readonly EMPTY: 0;
    readonly HEARTS: 1;
    readonly CIRCLES: 2;
    readonly TRIANGLES: 3;
    readonly STARS: 4;
    readonly DIAMONDS: 5;
    readonly INVERSE_TRIANGLES: 6;
    readonly SQUARES: 7;
    readonly SHOCK: 8;
    readonly GARBAGE: 9;
};
/** The six colours the stock presets use. */
export declare function regularColorsArray(): number[];
/** The six, plus squares. */
export declare function extendedRegularColorsArray(): number[];
/** Everything, including shock and colourless. */
export declare function allPossibleColorsArray(): number[];
/** `panels[row][column]`, rows from 0, columns from 1. */
export type PanelGrid = Panel[][];
export declare class Panel {
    row: number;
    column: number;
    readonly id: number;
    frameTimes: FrameConstants;
    state: PanelState;
    /** Did this panel change state on the previous update (or by an outside act)? */
    stateChanged: boolean;
    color: number;
    /** Frames left in the current state; 0 in states with no fixed duration. */
    timer: number;
    matching: boolean;
    matchesMetal: boolean;
    matchesGarbage: boolean;
    propagatesFalling: boolean;
    propagatesChaining: boolean;
    /** A hovering panel that is matchable for this one frame. */
    matchAnyway: boolean;
    /** Will this panel make a chain if it is matched right now? */
    chaining: boolean;
    isSwappingFromLeft?: boolean;
    /** Set when a swap must not be taken back, because the panel is about to fall. */
    dontSwap?: boolean;
    /** Set when a panel is swapping above something that just popped. */
    queuedHover?: boolean;
    isGarbage: boolean;
    garbageId?: number;
    metal?: boolean;
    /** 0 at the garbage's left edge. */
    xOffset?: number;
    /** 0 at the garbage's bottom edge; -1 once the bottom row has been consumed. */
    yOffset?: number;
    width?: number;
    height?: number;
    initialTime?: number;
    popTime?: number;
    popIndex?: number;
    shakeTime?: number;
    comboSize?: number;
    comboIndex?: number;
    /** Bounce animation after dropping out of cleared garbage. */
    fellFromGarbage?: number;
    /** Assigned by the Stack; upstream errors if they are not implemented. */
    onPop: () => void;
    onPopped: () => void;
    onLand: () => void;
    constructor(row: number, column: number, id: number, frameTimes: FrameConstants);
    toString(): string;
    /** Reset to defaults. `clearColor` also empties the cell. */
    clear(clearChaining?: boolean, clearColor?: boolean): void;
    setTimer(frames: number): void;
    /**
     * May this panel take part in a swap at all?
     *
     * Garbage never can. Everything settled or in motion horizontally can;
     * everything mid-clear or hovering cannot. Stack.canSwap adds the rules that
     * depend on neighbours.
     */
    allowsSwap(): boolean;
    /**
     * Does this panel count as occupying its cell for the top-out check?
     *
     * Garbage still falling does not; anything else with a colour does.
     */
    dangerous(): boolean;
    /** Begin a swap. The chaining flag deliberately survives it. */
    startSwap(isSwappingFromLeft: boolean): void;
    /**
     * Put this panel into the matched state.
     *
     * The +1 on the timer is upstream's, and it is load-bearing: a match is
     * always found before the timer decrements on the same frame.
     */
    match(isChainLink: boolean, comboIndex: number, comboSize: number): void;
    /** Advance one frame. */
    update(panels: PanelGrid): void;
    /**
     * Exchange the positions of two adjacent panels.
     *
     * A switch is not a swap: it is the mechanical act of moving two panels past
     * each other, used by falling as well as by swapping.
     */
    static switch(panel1: Panel, panel2: Panel, panels: PanelGrid): void;
}
//# sourceMappingURL=panel.d.ts.map