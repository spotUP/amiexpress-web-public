/**
 * Which screen theme a caller is actually wearing.
 *
 * SP4 of the screen-themes spec. One function, because the answer has to be
 * the same everywhere it is asked: the loader (what the caller sees), the
 * picker (what they may choose), and the admin's preview (what it renders).
 * Three copies of "is this theme selectable" would drift, and the failure
 * would be a caller wearing a theme the picker says they cannot have.
 */

import { DEFAULT_SLUG, readThemeRegistry, type ThemeEntry } from './theme-registry';

/** What this needs to know about the caller. Deliberately not a BBSSession. */
export interface ThemeCaller {
  username?: string;
  /** The board's own level - 255 is the sysop. */
  secLevel?: number;
  /** The caller's stored preference, if they have made one. */
  screenTheme?: string | null;
}

/** Sysops see everything. express.e's own threshold for "may administer". */
const SYSOP_LEVEL = 255;

function isSysop(caller: ThemeCaller): boolean {
  return (caller.secLevel ?? 0) >= SYSOP_LEVEL;
}

/**
 * Whether this caller may WEAR this theme.
 *
 * A `live` theme is for everybody. A `draft` or `review` theme is for its
 * owner and for sysops - that is what makes a draft safe to keep on the board
 * while it is being drawn, and it is why the picker and the loader must ask
 * the same function: a caller who could select a theme the loader then refuses
 * would see the board flicker back to default with no explanation.
 */
export function canWearTheme(caller: ThemeCaller, theme: ThemeEntry): boolean {
  if (theme.status === 'live') return true;
  if (isSysop(caller)) return true;
  const owner = theme.owner.trim().toLowerCase();
  const username = (caller.username ?? '').trim().toLowerCase();
  return owner !== '' && owner === username;
}

/** Every theme this caller may choose, in registry order. */
export function selectableThemes(bbsRoot: string, caller: ThemeCaller): ThemeEntry[] {
  return readThemeRegistry(bbsRoot).themes.filter(theme => canWearTheme(caller, theme));
}

/**
 * The slug the loader should resolve with.
 *
 * Falls back in one direction only: the caller's preference, then the board
 * default, then `default` - which is not a directory and resolves exactly as
 * this board did before themes existed. Every failure lands there, so a
 * deleted theme, a retired one, or a preference for something the caller may
 * no longer wear all end in the board's own art rather than in no screen at
 * all.
 */
export function resolveCallerTheme(bbsRoot: string, caller: ThemeCaller): string {
  const registry = readThemeRegistry(bbsRoot);

  const wanted = (caller.screenTheme ?? '').trim().toLowerCase();

  // `default` is not a theme - it is the ABSENCE of one, the board's own
  // screens - so it needs no registry entry and is always available. Looking
  // it up like any other slug found nothing and fell through to the board
  // default, so a caller who had deliberately turned the shipped theme OFF
  // was handed it straight back and had no way to refuse it.
  if (wanted === DEFAULT_SLUG) return DEFAULT_SLUG;

  if (wanted) {
    const theme = registry.themes.find(entry => entry.slug === wanted);
    if (theme && canWearTheme(caller, theme)) return theme.slug;
  }

  const fallback = registry.themes.find(entry => entry.slug === registry.defaultSlug);
  // The board default is not exempt from the rule: a sysop who sets the board
  // default to a draft must not put it in front of callers who cannot wear it.
  if (fallback && canWearTheme(caller, fallback)) return fallback.slug;

  return DEFAULT_SLUG;
}

/**
 * The door theme a screen theme asks to be worn with, if it names one.
 *
 * Null means "leave the caller's door theme alone", which is the default and
 * what the shipped default theme does. The reverse never happens: picking a
 * door theme in THEMEC never changes screen art, because a door theme is
 * offered by the board and a screen theme may be one artist's work.
 */
export function companionDoorTheme(bbsRoot: string, slug: string): string | null {
  const theme = readThemeRegistry(bbsRoot).themes.find(entry => entry.slug === slug);
  const id = theme?.doorTheme.trim() ?? '';
  return id === '' ? null : id;
}
