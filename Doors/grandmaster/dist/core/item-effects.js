"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectItem = collectItem;
/**
 * What a collected TGM item does.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15) to keep it under its
 * cap. The decision here is which of three paths an item takes - applied to
 * yourself, handed to an opponent, or, outside versus, applied to the
 * collector - and that is a rule rather than engine machinery.
 */
const board_1 = require("./board");
const items_1 = require("./items");
/** How long an item's name stays on the HUD, in frames. */
const BANNER_FRAMES = 90;
/**
 * Collect an item.
 *
 * The single-player fallback is the reference's own: with no opponent to give
 * an attack item to, it lands on the collector (gamestart.c:14358-14365,
 * "enemy = 1 - player" falling back to "enemy = player"). Without it an item
 * outside versus was collected, named on the HUD, and then did nothing.
 */
function collectItem(itemId, state, board, handlers) {
    state.itemBanner = { name: items_1.ITEM_NAMES[itemId] ?? `ITEM ${itemId}`, ttl: BANNER_FRAMES };
    if ((0, items_1.isSelfTargetItem)(itemId)) {
        const result = (0, items_1.applySelfItem)(itemId, board);
        if (result.clearRows && result.clearRows.length > 0) {
            (0, board_1.clearLines)(board, result.clearRows);
        }
        return;
    }
    if (handlers.toOpponent) {
        handlers.toOpponent(itemId);
        return;
    }
    handlers.applyResult((0, items_1.applyEnemyItem)(itemId, board, board));
}
//# sourceMappingURL=item-effects.js.map