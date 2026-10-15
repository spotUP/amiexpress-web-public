import { applyEnemyItem } from './items';
import type { Board, GameState } from './types';
import type { ItemEffectResult } from './items';
export interface ItemHandlers {
    /** Versus hands the item to the opponent's engine; single player has none. */
    toOpponent?: (itemId: number) => void;
    /** Applying an enemy item to this board, which the engine owns. */
    applyResult: (result: ReturnType<typeof applyEnemyItem>) => void;
}
/**
 * Collect an item.
 *
 * The single-player fallback is the reference's own: with no opponent to give
 * an attack item to, it lands on the collector (gamestart.c:14358-14365,
 * "enemy = 1 - player" falling back to "enemy = player"). Without it an item
 * outside versus was collected, named on the HUD, and then did nothing.
 */
export declare function collectItem(itemId: number, state: GameState, board: Board, handlers: ItemHandlers): void;
/**
 * Spend an item's effect on the run.
 *
 * Every field an `ItemEffectResult` can carry lands in exactly one place, and
 * they are all state or one callback - which is why this reads as a list and
 * belongs beside `collectItem` rather than inside the engine.
 */
export declare function applyItemEffect(result: ItemEffectResult, state: GameState, board: Board, insertHardBlockNext: () => void, resetRollRollFrame: () => void): void;
//# sourceMappingURL=item-effects.d.ts.map