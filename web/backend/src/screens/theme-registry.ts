/**
 * Which screen themes this board has, who owns each, and which a caller may
 * wear.
 *
 * SP1 of docs/superpowers/specs/2026-09-06-screen-themes-design.md. This
 * module READS and WRITES the registry and nothing else consults it yet: the
 * resolver, the index, the preference and the admin surface are SP2-SP6. A
 * board that has this file and nothing else behaves exactly as it does today.
 *
 * WHY AN ICON AND NOT JSON. `Themes.info` is the exact analogue of
 * `ScreenTypes.info` - a board-level list of presentation variants with a
 * per-caller index into it - and the board already has a reader
 * (`readTooltypeMap`) and a writer (`applyTooltypes`) for that shape. The
 * argument `screen-flags.ts:11-15` makes for JSON ("nothing in AmiExpress
 * reads it, so there is no format to match") does not hold for a file that
 * mirrors one AmiExpress does read.
 */

import * as fs from 'fs';
import * as path from 'path';

import { readTooltypeMap, applyTooltypes } from '../utils/info-file.util';

export const REGISTRY_FILE = 'Themes.info';

/** Where a theme's files live, relative to the board root. */
export const THEMES_DIR = 'Themes';

/**
 * The theme's verbatim mirror of the board root.
 *
 * Beside `Node/`, `Conf/` and `Board/`, which are keyed on the SCOPE the
 * loader computed. `Files/` is keyed on the PATH instead, and it is for
 * path-shaped references only - a bulletin, a `~SS_` include, a `~SR_` pool
 * member. A screen resolved by name never looks there.
 */
export const THEME_FILES_DIR = 'Files';

/**
 * The theme every caller falls back to, and the only one whose directory may
 * be empty: the default theme is NOT a directory - it is the board's own
 * screens, exactly where they are today.
 */
export const DEFAULT_SLUG = 'default';

/**
 * A slug becomes a directory name on a case-insensitive Amiga volume and a
 * query parameter, so it is restricted where it is created and never
 * normalised afterwards.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

export type ThemeStatus = 'draft' | 'review' | 'live';

export interface ThemeEntry {
  slug: string;
  title: string;
  /** The artist's handle as they want it shown. Display only. */
  author: string;
  /** The BBS username whose admin account may write this directory. Empty: sysops only. */
  owner: string;
  /** Board-relative directory. Empty ONLY for `default`. */
  dir: string;
  /** 80, 40, or both - declared by the artist, checked by the validator (SP6). */
  widths: number[];
  /** Optional companion door theme id, applied when a caller selects this theme (SP4). */
  doorTheme: string;
  status: ThemeStatus;
}

export interface ThemeRegistry {
  themes: ThemeEntry[];
  /** The slug a caller with no preference gets. */
  defaultSlug: string;
}

const EMPTY: ThemeRegistry = Object.freeze({ themes: [], defaultSlug: DEFAULT_SLUG });

/** Cached until the file's own mtime or size moves - `screen-flags.ts:26-27`'s rule. */
let cache: { key: string; registry: ThemeRegistry } | null = null;

export function registryPath(bbsRoot: string): string {
  return path.join(bbsRoot, REGISTRY_FILE);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function parseWidths(raw: string | undefined): number[] {
  if (!raw) return [];
  const widths = raw
    .split(',')
    .map(part => parseInt(part.trim(), 10))
    .filter(width => width === 80 || width === 40);
  return [...new Set(widths)];
}

function parseStatus(raw: string | undefined): ThemeStatus {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'live' || value === 'review') return value;
  // Anything unrecognised is a DRAFT, not live: an unreadable status must not
  // put an unfinished theme in front of callers.
  return 'draft';
}

/**
 * Read the registry.
 *
 * A board with no `Themes.info` has no themes and a default of `default`,
 * which is what every board looks like until a sysop makes one. That is not an
 * error and does not deserve a log line on every screen load.
 */
export function readThemeRegistry(bbsRoot: string): ThemeRegistry {
  const file = registryPath(bbsRoot);

  let key: string;
  try {
    const stat = fs.statSync(file);
    key = `${file}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    cache = null;
    return EMPTY;
  }

  if (cache && cache.key === key) return cache.registry;

  let registry: ThemeRegistry;
  try {
    const tooltypes = readTooltypeMap(file);
    const themes: ThemeEntry[] = [];

    for (const [entryKey, value] of tooltypes.entries()) {
      const match = /^TYPE\.(\d+)$/i.exec(entryKey);
      if (!match) continue;

      const index = match[1];
      const slug = value.trim().toLowerCase();
      // A slug that cannot be a directory name is not a theme. Skipping it
      // rather than throwing keeps one bad hand-edited line from taking the
      // whole registry - and every other theme - off the board.
      if (!isValidSlug(slug)) continue;
      if (themes.some(theme => theme.slug === slug)) continue;

      const get = (name: string) => tooltypes.get(`${name}.${index}`)?.trim() ?? '';
      const dir = get('DIR');

      // Only `default` may claim the board's own directories. Any other slug
      // with an empty DIR would resolve to the board's screens while calling
      // itself a theme, which is how an artist's draft becomes everyone's art.
      if (slug !== DEFAULT_SLUG && dir === '') continue;

      themes.push({
        slug,
        title: get('TITLE') || slug,
        author: get('AUTHOR'),
        owner: get('OWNER'),
        dir,
        widths: parseWidths(get('WIDTHS')),
        doorTheme: get('DOORTHEME'),
        status: parseStatus(get('STATUS')),
      });
    }

    const declared = tooltypes.get('DEFAULT')?.trim().toLowerCase() ?? '';
    const defaultSlug =
      declared && themes.some(theme => theme.slug === declared) ? declared : DEFAULT_SLUG;

    registry = { themes, defaultSlug };
  } catch {
    registry = EMPTY;
  }

  cache = { key, registry };
  return registry;
}

export function findTheme(bbsRoot: string, slug: string): ThemeEntry | null {
  const wanted = slug.trim().toLowerCase();
  return readThemeRegistry(bbsRoot).themes.find(theme => theme.slug === wanted) ?? null;
}

/**
 * Write one theme's entry, creating the registry if the board has none.
 *
 * Through `applyTooltypes`, which edits an icon IN PLACE: building a complete
 * Map and rewriting the file destroys the icon and produces something
 * AmiExpress cannot read (`info-file.util.ts:889-908`).
 */
/**
 * THE INDEX A THEME OCCUPIES IN THE FILE, which is not its place in the list.
 *
 * `TYPE.0`, `TYPE.4`, `TYPE.5`, `TYPE.6`, `TYPE.2` is a perfectly ordinary
 * registry: `removeTheme` leaves holes on purpose, and the parser walks the
 * keys rather than counting from zero. This used to write at the entry's
 * POSITION in the parsed array, and both branches were wrong.
 *
 * Publishing `h7` on the live board wrote `TYPE.2`/`STATUS.2=live` while the
 * real entry sat at `TYPE.5` with `STATUS.5=draft`. The reader takes the first
 * TYPE line for a slug, which was still the draft, so the theme never went
 * live: the sysop wore it and was served the board default instead - "i
 * switched to h7's theme on the live bbs, most screens show old ones"
 * (2026-09-18).
 *
 * A NEW theme was worse than wrong: `themes.length` on that same registry is
 * 4, and `TYPE.4` already belonged to `607080` - so the next artist's theme
 * would have overwritten theirs line for line.
 *
 * `removeTheme` has always found the index this way. One way of asking, now.
 */
function registryIndexFor(file: string, slug: string): string {
  // A board with no registry yet: the first theme takes index 0. `readTooltypeMap`
  // throws ENOENT rather than answering empty, and a theme is created before
  // the file it will live in exists.
  let tooltypes: Map<string, string>;
  try {
    tooltypes = readTooltypeMap(file);
  } catch {
    return '0';
  }
  let highest = -1;

  for (const [key, value] of tooltypes.entries()) {
    const match = /^TYPE\.(\d+)$/i.exec(key);
    if (!match) continue;
    if (value.trim().toLowerCase() === slug) return match[1];
    highest = Math.max(highest, Number(match[1]));
  }

  return String(highest + 1);
}

export function writeTheme(bbsRoot: string, entry: ThemeEntry): void {
  if (!isValidSlug(entry.slug)) {
    throw new Error(`Not a usable theme slug: "${entry.slug}"`);
  }
  if (entry.slug !== DEFAULT_SLUG && entry.dir.trim() === '') {
    throw new Error(`Theme "${entry.slug}" must name a directory - only "${DEFAULT_SLUG}" may be the board's own screens`);
  }

  const file = registryPath(bbsRoot);
  const index = registryIndexFor(file, entry.slug);

  applyTooltypes(file, [
    [`TYPE.${index}`, entry.slug],
    [`TITLE.${index}`, entry.title],
    [`AUTHOR.${index}`, entry.author],
    [`OWNER.${index}`, entry.owner],
    [`DIR.${index}`, entry.dir],
    [`WIDTHS.${index}`, entry.widths.join(',')],
    [`DOORTHEME.${index}`, entry.doorTheme],
    [`STATUS.${index}`, entry.status],
  ]);
  cache = null;
}

/**
 * Retire a theme: its registry entry goes, its DIRECTORY does not.
 *
 * The board told artists to do this and gave them no way. `POST /themes`
 * refuses a sixth theme with "retire one before starting another", and until
 * now nothing could - the router had no DELETE at all.
 *
 * WHY THE INDICES ARE NOT RENUMBERED. The registry is `TYPE.0`, `TITLE.0`,
 * `DIR.0` and so on, and `readThemeRegistry` scans every key matching
 * `TYPE.<n>` rather than walking 0 upwards. So dropping one theme's block
 * leaves a hole that costs nothing, and renumbering would rewrite every
 * LATER theme's lines to fix a problem that does not exist - each one a
 * chance to lose somebody's entry.
 *
 * THE DIRECTORY IS LEFT ALONE, deliberately. It holds an artist's drawings,
 * and what to do with them - move aside, keep, delete - is a decision for the
 * caller that has a sysop in front of it, made once and visibly. A function
 * that quietly removed a directory could not be called from a test, let alone
 * from an admin button.
 */
export function removeTheme(bbsRoot: string, slug: string): void {
  const wanted = slug.trim().toLowerCase();

  if (wanted === DEFAULT_SLUG) {
    throw new Error(`"${DEFAULT_SLUG}" is the board's own screens, not a theme that can be retired`);
  }

  const registry = readThemeRegistry(bbsRoot);
  const entry = registry.themes.find(theme => theme.slug === wanted);
  if (!entry) throw new Error(`No such theme: "${slug}"`);

  if (registry.defaultSlug === wanted) {
    throw new Error(
      `"${wanted}" is the board default - name another default before retiring it`
    );
  }

  // The INDEX this theme occupies, found by its own TYPE line rather than by
  // its position in the parsed list: the parser skips entries it cannot use,
  // so the two can disagree.
  const file = registryPath(bbsRoot);
  const tooltypes = readTooltypeMap(file);
  let index: string | null = null;
  for (const [key, value] of tooltypes.entries()) {
    const match = /^TYPE\.(\d+)$/i.exec(key);
    if (match && value.trim().toLowerCase() === wanted) {
      index = match[1];
      break;
    }
  }
  if (index === null) throw new Error(`No such theme: "${slug}"`);

  const mine = new RegExp(`^(TYPE|TITLE|AUTHOR|OWNER|DIR|WIDTHS|DOORTHEME|STATUS)\\.${index}$`, 'i');
  applyTooltypes(file, [], { removeKeys: key => mine.test(key) });
  cache = null;
}

/** Name the board default. The slug must already be a theme. */
export function setDefaultTheme(bbsRoot: string, slug: string): void {
  const wanted = slug.trim().toLowerCase();
  if (wanted !== DEFAULT_SLUG && !findTheme(bbsRoot, wanted)) {
    throw new Error(`No such theme: "${slug}"`);
  }
  applyTooltypes(registryPath(bbsRoot), [['DEFAULT', wanted]]);
  cache = null;
}

/** The directory a theme's files live in, or null for the board's own screens. */
export function themeDirectory(bbsRoot: string, entry: ThemeEntry): string | null {
  if (entry.dir.trim() === '') return null;
  return path.join(bbsRoot, entry.dir);
}

/** Only for tests and for a caller that has just rewritten the file itself. */
export function clearThemeRegistryCache(): void {
  cache = null;
}
