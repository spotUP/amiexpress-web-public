/**
 * Matching, chains, combos, stop time and score.
 * Ported from common/engine/checkMatches.lua (@ c80668e).
 *
 * Written as free functions over a MatchableStack rather than methods, so the
 * whole of this can be tested against a hand-built board without standing up a
 * game. Stack passes itself in; the shape is otherwise the Lua one.
 *
 * FOUR RULES HERE ARE EASY TO GET SUBTLY WRONG:
 *
 *  1. Only panels whose state CHANGED this frame seed a match check. A settled
 *     board is never rescanned, which is why `stateChanged` is load-bearing and
 *     not merely an optimisation.
 *
 *  2. Both axes are evaluated independently and both are kept, but a panel is
 *     added once - `matching` is the dedupe flag. So a cross of 3+3 is a combo
 *     of FIVE, not six.
 *
 *  3. A match is a chain link if ANY ONE of its panels carries `chaining`. The
 *     chain counter has no 1: the first link sets it straight to 2.
 *
 *  4. Chain flags are cleared at the END of every checkMatches, for any panel
 *     that has come back to rest without matching - UNLESS the panel directly
 *     below it is mid-swap, which is what keeps a chain alive across a swap the
 *     player is still performing.
 *
 * Garbage matching is declared here as optional hooks. It needs the garbage
 * queue, which arrives with the versus work; until then a stack simply does not
 * implement them and matching behaves exactly as it does in a solo game.
 */
import { Panel, PanelGrid } from './panel';
import type { LevelData } from './level-data';
/** A board position, used as the origin of the attack graphic. */
export interface Coordinate {
    row: number;
    column: number;
}
/** What checkMatches needs of a stack. Stack satisfies this. */
export interface MatchableStack {
    panels: PanelGrid;
    width: number;
    height: number;
    levelData: LevelData;
    chainCounter: number;
    /** Was the stack topped out at the START of this frame? Stop time reads this. */
    wasToppedOut: boolean;
    stopTime: number;
    preStopTime: number;
    score: number;
    manualRaise: boolean;
    riseLock: boolean;
    /** Optional until the garbage work lands. */
    getConnectedGarbagePanels?(matchingPanels: Panel[]): Panel[] | null;
    matchGarbagePanels?(garbagePanels: Panel[], garbageMatchTime: number, isChain: boolean, onScreenCount: number): void;
    pushGarbage?(origin: Coordinate, isChain: boolean, comboSize: number, metalCount: number): void;
    /** Optional observer, for sound and effects. */
    onMatched?(origin: Coordinate, isChainLink: boolean, comboSize: number, metalCount: number, garbagePanelCount: number): void;
}
/**
 * Can this panel take part in a match right now?
 *
 * Note `matchAnyway && hovering`: a panel that has just begun hovering above a
 * cell that popped is matchable for exactly one frame. That single clause is
 * what makes every skill chain in the game possible.
 */
export declare function canMatch(panel: Panel): boolean;
/**
 * Order a match for popping.
 *
 * Ordinary matches pop top to bottom, left to right within a row. Garbage pops
 * the other way on both axes: bottom to top, right to left.
 */
export declare function sortByPopOrder(panelList: Panel[], isGarbage: boolean): Panel[];
/** Shock panels in a match; three or more of them send shock garbage. */
export declare function getMetalCount(panels: Panel[]): number;
/** One chaining panel anywhere in the match promotes the whole match to a link. */
export declare function isNewChainLink(matchingPanels: Panel[]): boolean;
/** Garbage panels above the top of the stack do not count toward pop timing. */
export declare function getOnScreenCount(stackHeight: number, panels: Panel[]): number;
/**
 * Every panel that should match this frame, without duplicates.
 *
 * Candidates are only panels that changed state this frame. From each, walk out
 * in all four directions until the colour changes or an unmatchable panel is
 * hit; two or more in a direction pair means a match of three or more.
 */
export declare function getMatchingPanels(stack: MatchableStack): Panel[];
/** The first link sets the counter to 2; there is no chain 1. */
export declare function incrementChainCounter(stack: MatchableStack): void;
/** Put every panel of the match into matched state, in pop order. */
export declare function applyMatchToPanels(matchingPanels: Panel[], isChain: boolean, comboSize: number): Coordinate;
/**
 * How long the stack stops rising for this match.
 *
 * Four branches, and the "topped out" ones are the game being generous when you
 * are about to die - the in-game tutorial calls it out: "When you are in big
 * trouble, they'll stop a little longer. At that time, a 'Stop' mark appears."
 */
export declare function calculateStopTime(stack: MatchableStack, comboSize: number, toppedOut: boolean, isChain: boolean, chainCounter: number): number;
/** Stop time is taken, not accumulated: a bigger award replaces a smaller one. */
export declare function awardStopTime(stack: MatchableStack, isChain: boolean, comboSize: number): void;
/** Add to the score, capped. Upstream's comment on the cap is "lol owned". */
export declare function addScore(stack: MatchableStack, amount: number): void;
/**
 * Chain bonus.
 *
 * Deliberately NOT gated on this match being a chain link: while a chain is
 * live, every match scores the chain bonus again. A player noticed the same
 * thing from the outside - "At x13, just clear as many matches as possible, as
 * each clear gets you the points you would normally get for a x13 chain."
 *
 * And above 13 the bonus is zero, not 1800.
 */
export declare function updateScoreWithChain(stack: MatchableStack): void;
/** Combo bonus. Only 4 or more scores; the table tops out at 30. */
export declare function updateScoreWithCombo(stack: MatchableStack, comboSize: number): void;
/** Always call after the chain counter has been incremented. */
export declare function updateScoreWithBonus(stack: MatchableStack, comboSize: number): void;
/**
 * Drop the chain flag from panels that have settled without matching.
 *
 * The exception is the whole point: a panel keeps its chain flag while the
 * panel directly below it is mid-swap, because the player may still be building
 * the next link. Row 1 always loses it - there is nowhere left to fall from.
 */
export declare function clearChainingFlags(stack: MatchableStack): void;
/**
 * The whole match pass for one frame.
 *
 * Order matters throughout: the chain counter is incremented before stop time
 * and score are computed, because both read it.
 */
export declare function checkMatches(stack: MatchableStack): void;
//# sourceMappingURL=check-matches.d.ts.map