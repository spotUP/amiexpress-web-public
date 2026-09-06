/**
 * Changing the theme of a door that is already on screen.
 *
 * `setTheme` says a change "takes effect the next time a door draws", and
 * the THEME-PICKER door ends with "Open a door to see it" - because a door
 * reads its theme once, at startup, into widget styles and into tag strings
 * that are already inside `setContent`. The sysop asked for the other thing:
 * "all typescript doors with menus could have a theme menu that let's the
 * user change blessed theme inside the doors on the fly" (2026-09-02).
 *
 * A door could repaint itself from scratch, but that is a rewrite per door
 * and every door would have to remember to do it. The colour a door drew
 * with IS the old theme's token, so the change can be made where the colour
 * actually lives: walk the tree, and rewrite every value that came from the
 * old theme into the same role's value in the new one. Two carriers:
 *
 *   1. widget styles - `style.fg`, `style.border.fg`, `style.selected.bg`...
 *   2. blessed tags baked into content and into a list's items
 *
 * Both are handled here, so a door's part is one menu entry and a call.
 *
 * What this cannot reach: a colour a door computes after the switch from a
 * constant it captured at startup. Doors that keep their theme in a
 * `door-theme.ts` module re-point those bindings through `applyTheme(bbs)`,
 * which is why `onApply` runs before the tree is re-tinted.
 */

import { themeById, DEFAULT_THEME_ID, type Theme, type ThemeTokens } from './tokens.js';

/**
 * The token roles, in the order a value is claimed when two roles share one.
 *
 * `classic` reuses colours across roles - 'white' is `ink`, `barInk` and
 * `selectionInk`; 'blue' is both `bar` and `selectionBg`; 'cyan' is `chrome`
 * and `accentAlt`; 'yellow' is `accent` and `warn` - so a bare colour has to
 * be given to one role. The order below is the count tokens.ts measured
 * across three doors: `fg: 'white'` 44 times as body text, `fg: 'cyan'` 29
 * as borders, `bg: 'blue'` 20 as bars, `fg: 'yellow'` 12 as labels. The
 * commonest use of a colour wins it.
 *
 * The cost is visible and worth naming: on `classic` a `warn` yellow is
 * indistinguishable from an `accent` yellow, so it follows the accent into
 * the new theme rather than the new theme's warning colour. A door that
 * wants its warnings to stay warnings says so with `themeStyles(...).warn`,
 * which is a role rather than a colour and survives any switch.
 */
const ROLE_PRIORITY: Array<keyof ThemeTokens> = [
  'ground', 'ink', 'chrome', 'dim', 'bar', 'barInk',
  'accent', 'accentAlt', 'selectionBg', 'selectionInk', 'ok', 'warn', 'alert',
];

/**
 * Old colour to new colour, role by role.
 *
 * A role whose value does not change is left out, so an unchanged theme
 * produces an empty map and re-tinting is a no-op.
 */
export function tokenMap(from: Theme, to: Theme): Map<string, string> {
  const map = new Map<string, string>();
  for (const role of ROLE_PRIORITY) {
    const was = from.tokens[role];
    const now = to.tokens[role];
    if (!was || !now || was === now) continue;
    if (!map.has(was)) map.set(was, now);
  }
  return map;
}

/** Anything with children and, maybe, a style: a blessed element or a screen. */
interface TreeNode {
  style?: unknown;
  content?: string;
  items?: unknown;
  children?: unknown;
  selected?: number;
  setContent?: (value: string) => void;
  setItems?: (items: string[]) => void;
}

/** Rewrite every string leaf of a style object that the map knows about. */
function retintStyle(style: unknown, map: Map<string, string>): number {
  if (!style || typeof style !== 'object') return 0;
  let changed = 0;
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const next = map.get(value);
      if (next) {
        (style as Record<string, unknown>)[key] = next;
        changed += 1;
      }
    } else if (value && typeof value === 'object') {
      changed += retintStyle(value, map);
    }
  }
  return changed;
}

/**
 * Rewrite the blessed tags in a string: `{cyan-fg}` and its closing
 * `{/cyan-fg}`, `{blue-bg}`, and the `#rrggbb` forms the themes use.
 *
 * Only whole tags are touched. A door that prints the word "white" keeps it.
 */
export function retintTags(content: string, map: Map<string, string>): string {
  if (!content || map.size === 0) return content;
  return content.replace(/\{(\/?)([^}]+?)-(fg|bg)\}/g, (whole, slash, colour, channel) => {
    const next = map.get(colour);
    return next ? `{${slash}${next}-${channel}}` : whole;
  });
}

/** What a re-tint touched, for a caller that wants to prove it ran. */
export interface RetintResult {
  /** Style fields rewritten. */
  styles: number;
  /** Elements whose content or items were rewritten. */
  contents: number;
}

/**
 * Re-tint a tree from one theme to another, in place.
 *
 * Safe on any node: an element with no style, no content and no children
 * costs one call and changes nothing. Call `screen.render()` afterwards -
 * this does not, so a caller can re-tint several roots and paint once.
 */
export function retintTree(root: unknown, from: Theme, to: Theme): RetintResult {
  const map = tokenMap(from, to);
  const result: RetintResult = { styles: 0, contents: 0 };
  if (map.size === 0) return result;

  const visit = (node: TreeNode | undefined): void => {
    if (!node || typeof node !== 'object') return;

    result.styles += retintStyle(node.style, map);

    // A list paints from `items`, so rewriting its content alone would be
    // undone by the widget's next repaint.
    if (Array.isArray(node.items) && node.items.every((item) => typeof item === 'string')) {
      const items = node.items as string[];
      const next = items.map((item) => retintTags(item, map));
      if (next.some((item, index) => item !== items[index])) {
        const selected = node.selected ?? 0;
        if (typeof node.setItems === 'function') {
          node.setItems(next);
          node.selected = selected;
        } else {
          node.items = next;
        }
        result.contents += 1;
      }
    } else if (typeof node.content === 'string') {
      const next = retintTags(node.content, map);
      if (next !== node.content) {
        if (typeof node.setContent === 'function') node.setContent(next);
        else node.content = next;
        result.contents += 1;
      }
    }

    const children = node.children;
    if (Array.isArray(children)) for (const child of children) visit(child as TreeNode);
  };

  visit(root as TreeNode);
  return result;
}

/**
 * What a door was handed: a theme, a BBS handle that knows one, or a theme
 * id. Returns null when none of those is true - an older host, a test
 * double, a board with no theme - which is a door's cue to keep the classic
 * default rather than fail.
 *
 * Eight doors each carried their own copy of this resolution, all reading
 * `bbs.getTheme` and nothing else, which is why a door could not be handed
 * the theme the user is PREVIEWING - only the one already saved. One copy
 * here, and `applyTheme(theme)` works in every door.
 */
export function resolveTheme(source: unknown): Theme | null {
  if (!source) return null;

  const asTheme = source as Theme;
  if (asTheme.tokens && asTheme.id) return asTheme;

  const getTheme = (source as { getTheme?: () => Theme }).getTheme;
  if (typeof getTheme === 'function') {
    try {
      const theme = getTheme.call(source);
      if (theme?.tokens) return theme;
    } catch {
      // A theme that will not resolve is not worth failing a door over.
    }
  }

  return null;
}

/**
 * The theme this door is running under, for widgets that have to pick a
 * colour before anyone hands them one.
 *
 * The SDK's own widgets used to default to literals - MenuBar was
 * `bg: 'gray', fg: 'black'` - so a door's menu bar looked the same under
 * every theme, which is what the sysop saw: "the menu bg color should be the
 * primary theme color" (2026-09-03). A widget cannot ask the door what its
 * theme is, so the door says it once and every widget built afterwards
 * follows.
 *
 * Classic until told otherwise, which is what a door that never sets it
 * always drew.
 */
let current: Theme | null = null;

/** Tell the SDK which theme this door is running. */
export function setActiveTheme(theme: Theme | null | undefined): void {
  if (theme?.tokens) current = theme;
}

/** The active theme, or classic. Never null, so a widget can just read it. */
export function activeTheme(): Theme {
  return current ?? themeById(DEFAULT_THEME_ID);
}
