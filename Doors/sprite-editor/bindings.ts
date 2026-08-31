/**
 * The single table that drives a studio screen's hotkeys AND its
 * glyph-typing exclusion set - replacing two hand-maintained lists that
 * used to drift apart (the hand-written exclusion string was missing 'X'
 * for one review cycle: S-x was bound but its Shift+X keypress fell
 * through to setCell). One binding declares its keys once; everything
 * that needs to know about them (wiring, the exclusion set, and - for
 * later tasks - a menu) reads this table instead of re-listing keys by
 * hand.
 */

export interface StudioBinding {
  id: string;                    // stable id, e.g. 'frame.new'
  keys: string[];                // blessed key names, e.g. ['n']
  hotkeyHint: string;            // shown in menu label, e.g. 'n' or 'S-x'
  menu: string;                  // top-level menu label, e.g. 'Frame'
  label: string;                 // menu item label, e.g. 'New Frame'
  handler: () => void;
}

export interface BindingSet {
  bindings: StudioBinding[];
  excludedGlyphKeys: Set<string>;   // derived: every key of every binding that is a single printable char
  menuItems(): { label: string; items: { label: string; action: () => void }[] }[];
}

/**
 * A keyboard's shift+punctuation types a different symbol than the base
 * key, not the base key's "uppercase" (there is no such thing for a
 * comma). This door binds Shift+comma/period ('S-,' / 'S-.') to
 * frame-reorder actions, so those two need their real shifted symbol here
 * or the exclusion set silently regresses - typing '<'/'>' would start
 * painting them as cell art. Every other shifted key this door binds is a
 * letter, where uppercase IS the real shifted symbol.
 */
const SHIFTED_SYMBOL: Record<string, string> = {
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
function glyphForKey(key: string): string | null {
  if (key === 'space') return ' ';
  if (key.startsWith('S-')) {
    const base = key.slice(2);
    if (base.length !== 1) return null;
    return SHIFTED_SYMBOL[base] ?? base.toUpperCase();
  }
  if (key.length === 1) return key;
  return null;
}

export function buildBindingSet(bindings: StudioBinding[]): BindingSet {
  const seenIds = new Set<string>();
  for (const binding of bindings) {
    if (seenIds.has(binding.id)) {
      throw new Error(`buildBindingSet: duplicate binding id '${binding.id}'`);
    }
    seenIds.add(binding.id);
  }

  const excludedGlyphKeys = new Set<string>();
  for (const binding of bindings) {
    for (const key of binding.keys) {
      const glyph = glyphForKey(key);
      if (glyph !== null) excludedGlyphKeys.add(glyph);
    }
  }

  function menuItems(): { label: string; items: { label: string; action: () => void }[] }[] {
    const menus: { label: string; items: { label: string; action: () => void }[] }[] = [];
    const indexByMenu = new Map<string, number>();
    for (const binding of bindings) {
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

  return { bindings, excludedGlyphKeys, menuItems };
}
