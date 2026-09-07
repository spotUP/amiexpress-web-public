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
export function writeTheme(bbsRoot: string, entry: ThemeEntry): void {
  if (!isValidSlug(entry.slug)) {
    throw new Error(`Not a usable theme slug: "${entry.slug}"`);
  }
  if (entry.slug !== DEFAULT_SLUG && entry.dir.trim() === '') {
    throw new Error(`Theme "${entry.slug}" must name a directory - only "${DEFAULT_SLUG}" may be the board's own screens`);
  }

  const file = registryPath(bbsRoot);
  const registry = readThemeRegistry(bbsRoot);
  const existing = registry.themes.findIndex(theme => theme.slug === entry.slug);
  const index = existing === -1 ? registry.themes.length : existing;

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
