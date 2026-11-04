/**
 * A door's logo, as an artist's file when there is one.
 *
 * ONE reader for every door that lets the ANSI Studio draw its title. It is
 * what `Doors/glc-viewer/src/logo.ts` did for GLC alone, extracted so the
 * arcade doors and GLC share one implementation. The door declares the logo
 * as an art SETTING in `door.settings.json` (`art: true`, `artVariants`), the
 * Studio lists it, and the backend files the narrow drawings outside the door
 * so they survive a re-install:
 *
 *   Screens/doors/<COMMAND>/setting:<key>.c64.ans   forty columns, C64
 *   Screens/doors/<COMMAND>/setting:<key>.ttx.ans   forty columns, teletext
 *
 * Order for a caller:
 *  1. Teletext on forty columns: the `.ttx.ans` variant, then the door's
 *     shipped `art/<shipped>.ttx.ans`; else it falls through to the C64 one.
 *  2. Forty columns: the `.c64.ans` variant, then the shipped
 *     `art/<shipped>.c64.ans`. Nothing found: `[]`. A narrow caller is NEVER
 *     given the wide drawing (it wraps across eight rows of a C64 screen).
 *  3. Everyone else: the file the setting names (default `defaultFile`),
 *     kept inside the door's folder. Nothing readable: `null`.
 *
 * `null` means "no artist file, draw the compiled-in original" and `[]` means
 * "a narrow caller with no drawing: use a plain text title".
 *
 * Files are read as latin1: Amiga ANSI (Topaz, ISO-8859-1), never UTF-8.
 */
import * as fs from 'fs';
import * as path from 'path';

import { readDoorSettings, resolveBbsRoot, resolveDoorRoot } from '../core/settings';

/** A caller on this many columns or fewer reads the narrow drawing. */
export const NARROW_COLUMNS = 40;

/** The section name the Studio files a setting's variants under. */
export const artSettingSection = (key: string): string => `setting:${key}`;

export interface DoorLogoRequest {
  /** The setting key that names the logo file, e.g. `logo`. */
  key: string;
  /** The door's own directory. */
  doorDir: string;
  /** The board root, for the Studio's variant store. Null when unknown. */
  bbsRoot: string | null;
  /** The caller's width: 40 or less takes the narrow drawing. */
  columns: number;
  /** Saved setting values; `values[key]` may name another file. */
  values?: Record<string, unknown>;
  /** The file used when the setting names none, relative to the door. */
  defaultFile?: string;
  /** The command the variants are filed under. */
  command: string;
  /** A teletext caller: forty columns, but a teletext page. */
  teletext?: boolean;
  /** Base name of the door's shipped narrow placeholders: `art/<shipped>.c64.ans`. */
  shipped?: string;
}

/** Read a drawing's rows, or null when absent, unreadable or blank. */
export function readLogoLines(file: string): string[] | null {
  try {
    const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
    // Trailing blank lines are the file's, not the drawing's.
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

function variantFile(request: DoorLogoRequest, alphabet: 'c64' | 'ttx'): string | null {
  if (!request.bbsRoot) return null;
  return path.join(
    request.bbsRoot, 'Screens', 'doors', request.command.toUpperCase(),
    `${artSettingSection(request.key).toLowerCase()}.${alphabet}.ans`,
  );
}

/** The logo rows an artist supplied, `[]` for a narrow caller with none, `null` for "use the original". */
export function readDoorLogo(request: DoorLogoRequest): string[] | null {
  const narrow = request.columns <= NARROW_COLUMNS;

  if (narrow && request.teletext) {
    const file = variantFile(request, 'ttx');
    const drawn = file ? readLogoLines(file) : null;
    if (drawn) return drawn;
    if (request.shipped) {
      const shipped = readLogoLines(path.join(request.doorDir, 'art', `${request.shipped}.ttx.ans`));
      if (shipped) return shipped;
    }
  }

  if (narrow) {
    const file = variantFile(request, 'c64');
    const drawn = file ? readLogoLines(file) : null;
    if (drawn) return drawn;
    const shipped = request.shipped
      ? readLogoLines(path.join(request.doorDir, 'art', `${request.shipped}.c64.ans`))
      : null;
    return shipped ?? [];
  }

  const named = request.values?.[request.key];
  const value = typeof named === 'string' && named.length > 0 ? named : request.defaultFile;
  if (!value) return null;
  // Inside the door's folder and nowhere else: the value is a setting an admin can type into.
  const root = path.resolve(request.doorDir);
  const resolved = path.resolve(root, value);
  if (!resolved.startsWith(root + path.sep)) return null;
  return readLogoLines(resolved);
}

/** blessed reads `{` as the start of a tag. */
export function escapeBlessedBraces(text: string): string {
  return text.replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}

const ESCAPE = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;

/**
 * One art row made safe for a blessed box with tags on: SGR colours kept,
 * every other escape (cursor moves, clears) dropped, braces escaped, clipped
 * to `maxCols` visible cells. Ends with a reset so a colour never leaks into
 * the next row.
 */
export function blessedArtRow(row: string, maxCols: number): string {
  let out = '';
  let cells = 0;
  let last = 0;
  const emit = (text: string): void => {
    for (const ch of text) {
      if (cells >= maxCols) return;
      out += escapeBlessedBraces(ch);
      cells++;
    }
  };
  for (const m of row.matchAll(ESCAPE)) {
    emit(row.slice(last, m.index));
    if (m[0].endsWith('m')) out += m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  emit(row.slice(last));
  return out + '\x1b[0m';
}

export interface DoorLogoSpec extends DoorLogoRequest {
  /** Blessed-tagged rows of the door's own logo, drawn when no artist file exists. */
  original: readonly string[];
  /** The plain text title a forty-column caller with no drawing gets. */
  title: string;
  /** The widest row the menu box can hold. */
  maxCols: number;
}

/**
 * The rows to draw above a door's menu: the artist's drawing (colours kept,
 * braces escaped, clipped), else the door's own logo, or for a narrow caller
 * with no drawing a short plain title. Never wrapped wide art.
 */
export function doorLogoRows(spec: DoorLogoSpec): string[] {
  const art = readDoorLogo(spec);
  if (art === null) return [...spec.original];
  if (art.length === 0) return [`{cyan-fg}${escapeBlessedBraces(spec.title)}{/}`];
  return art.map((row) => blessedArtRow(row, spec.maxCols));
}

export interface SessionLogoSpec {
  /** The door's `__dirname`: source or `dist`, both resolve to the door folder. */
  dirname: string;
  /** The BBS command, used when the session does not say which one launched the door. */
  command: string;
  /** The setting key of the logo slot. Default `logo`. */
  key?: string;
  /** The door's own blessed-tagged logo. */
  original: readonly string[];
  /** Plain title for a narrow caller with no drawing. */
  title: string;
  /** The widest row the menu box holds. */
  maxCols: number;
}

/**
 * `doorLogoRows` for a door that has a context: the caller's width, graphics
 * mode and launching command come from the session, the board root and saved
 * settings from the SDK. A door with no manifest or no board still draws
 * its own logo.
 */
export function sessionLogoRows(ctx: unknown, spec: SessionLogoSpec): string[] {
  const session = (ctx as { bbsSession?: { screenWidth?: number; texttvMode?: boolean; doorCommand?: string } } | null)?.bbsSession;
  const width = Number(session?.screenWidth ?? 80);
  const launched = session?.doorCommand;
  const doorDir = resolveDoorRoot(spec.dirname);
  let values: Record<string, unknown> = {};
  try { values = readDoorSettings(doorDir) as unknown as Record<string, unknown>; } catch { /* no manifest */ }
  let bbsRoot: string | null = null;
  try { bbsRoot = resolveBbsRoot(spec.dirname) || null; } catch { /* no board */ }
  const key = spec.key ?? 'logo';
  return doorLogoRows({
    key,
    doorDir,
    bbsRoot,
    columns: Number.isFinite(width) && width > 0 ? width : 80,
    teletext: session?.texttvMode === true,
    command: typeof launched === 'string' && launched.trim() ? launched.trim().toUpperCase() : spec.command,
    values,
    defaultFile: `art/${key}.ans`,
    original: spec.original,
    title: spec.title,
    maxCols: spec.maxCols,
  });
}
