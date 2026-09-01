"use strict";
/**
 * The single table that drives a studio screen's hotkeys AND its
 * glyph-typing exclusion set - replacing two hand-maintained lists that
 * used to drift apart (the hand-written exclusion string was missing 'X'
 * for one review cycle: S-x was bound but its Shift+X keypress fell
 * through to setCell). One binding declares its keys once; everything
 * that needs to know about them (wiring, the exclusion set, and - for
 * later tasks - a menu) reads this table instead of re-listing keys by
 * hand.
 *
 * Studio 2c task 5 fix round 1: `buildBindingSet`'s optional `isBlocked`
 * predicate is the fourth attempt at the SAME bug class - a caller opens a
 * modal dialog (dialogs.ts) and something else fires anyway while it's up.
 * Round 1 (studio 2b) was every keyboard op; round 2 and 3 (studio 2c task
 * 4) were canvas click and drag; round 4 (studio 2c task 5, review-caught)
 * was a menu item's mouse click - `screen.key()`'s registered handlers and
 * a DropdownMenu item's `action` are two SEPARATE dispatch paths
 * (dropdown-menu.ts's `selectItem()` calls `item.action?.()` directly, and
 * mouse dispatch never consults `screen.dialogOpen` - traced against
 * screen.ts: `suppressGlobalKeys` only gates the KEYBOARD handler map),
 * so a guard added only to the keyboard side (edit-screen.ts's `opKey()`)
 * left the menu unguarded. Wrapping `binding.handler` HERE, once, before
 * either consumer ever sees it, means every current AND future consumer of
 * a StudioBinding's handler - `screen.key()` registration, a menu action,
 * anything added later - inherits the guard automatically; there is no
 * fifth call site left to forget it at.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBindingSet = buildBindingSet;
/**
 * A keyboard's shift+punctuation types a different symbol than the base
 * key, not the base key's "uppercase" (there is no such thing for a
 * comma). This door binds Shift+comma/period ('S-,' / 'S-.') to
 * frame-reorder actions, so those two need their real shifted symbol here
 * or the exclusion set silently regresses - typing '<'/'>' would start
 * painting them as cell art. Every other shifted key this door binds is a
 * letter, where uppercase IS the real shifted symbol.
 */
const SHIFTED_SYMBOL = {
    ',': '<',
    '.': '>',
};
/**
 * The literal character a bound key "spends" when a keyboard also fires
 * it as an ordinary typed character - the reason the glyph-typing path
 * must exclude it. Blessed names most keys after themselves ('n', '+'),
 * shifted keys with an 'S-' prefix on the unshifted name, and the
 * spacebar as the word 'space' rather than the character it types.
 * Multi-character key names with no printable meaning (arrows, tab,
 * enter, delete...) contribute nothing - they can never collide with a
 * typed glyph in the first place.
 */
function glyphForKey(key) {
    if (key === 'space')
        return ' ';
    if (key.startsWith('S-')) {
        const base = key.slice(2);
        if (base.length !== 1)
            return null;
        return SHIFTED_SYMBOL[base] ?? base.toUpperCase();
    }
    if (key.length === 1)
        return key;
    return null;
}
/**
 * @param bindings the table.
 * @param isBlocked called on every dispatch, from either consumer; a
 *   `true` result makes that dispatch a no-op. Defaults to `() => false`
 *   (nothing blocked) so every EXISTING caller that built a BindingSet
 *   before this parameter existed keeps compiling and behaving exactly as
 *   before - passing a guard is opt-in per screen, not a breaking change
 *   forced on every StudioBinding consumer in this door.
 */
function buildBindingSet(bindings, isBlocked = () => false) {
    const seenIds = new Set();
    for (const binding of bindings) {
        if (seenIds.has(binding.id)) {
            throw new Error(`buildBindingSet: duplicate binding id '${binding.id}'`);
        }
        seenIds.add(binding.id);
    }
    // The ONE wrap. `guardedBindings` carries every other field through
    // unchanged (id/keys/hotkeyHint/menu/label) - only `handler` changes -
    // and IS the `bindings` this function returns, so a caller that wires
    // screen.key() from `bindingSet.bindings` (not the raw table it passed
    // in) and menuItems() (built from this same array below) dispatch
    // through the identical guarded function. `keys` is untouched, so
    // menu-only bindings (empty keys - view.resetLayout) still register no
    // screen.key() binding, exactly as before.
    const guardedBindings = bindings.map(binding => ({
        ...binding,
        handler: () => {
            if (isBlocked())
                return;
            binding.handler();
        },
    }));
    const excludedGlyphKeys = new Set();
    for (const binding of guardedBindings) {
        for (const key of binding.keys) {
            const glyph = glyphForKey(key);
            if (glyph !== null)
                excludedGlyphKeys.add(glyph);
        }
    }
    function menuItems() {
        const menus = [];
        const indexByMenu = new Map();
        for (const binding of guardedBindings) {
            let index = indexByMenu.get(binding.menu);
            if (index === undefined) {
                index = menus.length;
                indexByMenu.set(binding.menu, index);
                menus.push({ label: binding.menu, items: [] });
            }
            const label = binding.hotkeyHint
                ? `${binding.label} (${binding.hotkeyHint})`
                : binding.label;
            menus[index].items.push({ label, action: binding.handler });
        }
        return menus;
    }
    return { bindings: guardedBindings, excludedGlyphKeys, menuItems };
}
