/**
 * The menu has to be navigable, and has to fit on the screen.
 *
 * Reported with a screenshot: "i cant navigate the menu in pengo and it's
 * offset to the left" - the title showed as "ngo" and every item was clipped.
 *
 * Two independent faults:
 *
 *   - The menu was a blessed List parented to gameArea. gameArea is only
 *     GRID_WIDTH * 2 columns - the width of the board - so a 40-column menu
 *     asking for left:"center" inside it resolved to left:-5 and hung five
 *     columns off the left edge.
 *
 *   - The screen is created with `input: null`: blessed never receives a real
 *     key, so the List's keys:true and focus() could never fire. Meanwhile
 *     handleMenuInput moved gameData.menuSelection, which the List ignored.
 *     Two competing menus, neither of them working.
 *
 * Pengo was the only arcade door still doing this; the other eight already
 * drive their menus from gameData.menuSelection.
 */
/** No screen may rely on blessed receiving keys, because it never does. */
export declare function nothingRelaysOnBlessedReceivingKeys(): Promise<void>;
/** The menu is driven by the door's own selection state. */
export declare function theMenuIsDrivenByMenuSelection(): Promise<void>;
/**
 * No popup is wider than what it is parented to.
 *
 * gameArea is the board's width, not the screen's, which is what pushed the
 * menu off the left edge.
 */
export declare function noPopupIsWiderThanItsParent(): Promise<void>;
/** Nothing may exceed the width it was asked for, or the box wraps. */
export declare function noMenuLineExceedsItsWidth(): Promise<void>;
/** The selected row is marked the way Arkanoid marks it. */
export declare function theSelectedRowIsPickedOut(): Promise<void>;
/** A settings row shows what it is set to. */
export declare function aSettingsRowShowsItsValue(): Promise<void>;
/**
 * The selection wraps at both ends, as a cabinet does.
 *
 * Several doors clamped instead, so holding down on the last row felt broken
 * when the row was merely last.
 */
export declare function theSelectionWrapsAtBothEnds(): Promise<void>;
/** Arkanoid's brick strip is NOT inherited by every door. */
export declare function noDoorInheritsArkanoidsBricks(): Promise<void>;
//# sourceMappingURL=menu.test.d.ts.map