/**
 * What a collected TGM item does.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15) to keep it under its
 * cap. The decision here is which of three paths an item takes - applied to
 * yourself, handed to an opponent, or, outside versus, applied to the
 * collector - and that is a rule rather than engine machinery.
 */
import { clearLines } from './board';
import {
  ITEM_NAMES, isSelfTargetItem, applySelfItem, applyEnemyItem,
} from './items';
import type { Board, GameState } from './types';

/** How long an item's name stays on the HUD, in frames. */
const BANNER_FRAMES = 90;

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
export function collectItem(
  itemId: number,
  state: GameState,
  board: Board,
  handlers: ItemHandlers,
): void {
  state.itemBanner = { name: ITEM_NAMES[itemId] ?? `ITEM ${itemId}`, ttl: BANNER_FRAMES };

  if (isSelfTargetItem(itemId)) {
    const result = applySelfItem(itemId, board);
    if (result.clearRows && result.clearRows.length > 0) {
      clearLines(board, result.clearRows);
    }
    return;
  }

  if (handlers.toOpponent) {
    handlers.toOpponent(itemId);
    return;
  }

  handlers.applyResult(applyEnemyItem(itemId, board, board));
}
