/**
 * Give every theme ONE main menu, served to every conference.
 *
 * Themes were seeded with a MENU per conference - `Themes/<slug>/Conf/<n>/Menu.txt`
 * plus `MENU250.TXT` and `.GR` twins - so an artist who redrew one conference's
 * menu left the others serving the template, and the studio showed several
 * "main menu" cards (h7, 2026-10-02). The loader now falls back, for a caller
 * wearing a theme, to the theme's every-conference directory
 * (`Themes/<slug>/Conf/`, THEME_WIDE_SCREENS in screens/screen-tables.ts).
 * This moves existing themes onto it:
 *
 *   - the NEWEST per-conference base menu (by mtime) of each format - `Menu.txt`,
 *     and likewise `Menu.seq` / `.rip` / `.ttx` / `.tti` where the theme has
 *     them - is MOVED to `Themes/<slug>/Conf/<name>`;
 *   - every other per-conference MENU file, its level variants (`MENU250.TXT`)
 *     and its screen-type variants (`menu250.txt.GR`) is renamed aside to
 *     `<name>.per-conference-<date>.backup`. Nothing is deleted.
 *
 * A theme that already has a menu in `Conf/` is left alone, so a second run
 * changes nothing.
 *
 *     npx tsx src/scripts/promote-theme-main-menu.ts --dry-run
 *         Print what would happen to every theme, change nothing.
 *
 *     npx tsx src/scripts/promote-theme-main-menu.ts
 *         Do it.
 *
 *     --root <path>    the board, when it is not the configured data dir
 *     --theme <slug>   only this theme (repeatable)
 *     --date <stamp>   the date in the backup names (default: today)
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  THEME_WIDE_DIR,
  THEME_WIDE_SCREENS,
  getScreenFileName,
  isScreenFile,
} from '../screens/screen-tables';
import { readThemeRegistry, themeDirectory } from '../screens/theme-registry';

export interface MenuMigrationOptions {
  root?: string;
  dryRun: boolean;
  themes: string[];
  date?: string;
}

export function parseMenuMigrationArgs(argv: string[]): MenuMigrationOptions {
  const opts: MenuMigrationOptions = { dryRun: false, themes: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--theme') opts.themes.push(String(argv[++i]).toLowerCase());
    else if (argv[i] === '--date') opts.date = argv[++i];
  }
  return opts;
}

/** One file move, theme-relative. */
export interface MenuMove {
  from: string;
  to: string;
  kind: 'promote' | 'aside';
}

/** The base formats a theme-wide menu can be promoted in, by extension. */
const BASE_FORMATS = ['.txt', '.seq', '.rip', '.ttx', '.tti'];

/**
 * What a file in a conference directory is to `screen`: the base file of one
 * format, a level or screen-type variant, or not this screen at all.
 */
function classify(screen: string, name: string): { base: string } | 'variant' | null {
  if (!isScreenFile(name)) return null;
  const stem = getScreenFileName(screen).toLowerCase();
  const lower = name.toLowerCase();
  if (!lower.startsWith(stem)) return null;
  const match = /^(\d*)(\..+)$/.exec(lower.slice(stem.length));
  if (!match) return null;
  if (match[1] !== '') return 'variant';                     // MENU250.TXT
  return BASE_FORMATS.includes(match[2]) ? { base: match[2] } : 'variant';   // Menu.txt.GR, MENU.IBM
}

function listNames(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * The moves for one theme. Empty when the theme already has an
 * every-conference menu or has no per-conference one.
 */
export function planThemeMenuMigration(
  themeRoot: string,
  date: string,
): { moves: MenuMove[]; skipped?: string; ties: string[] } {
  const wideDir = path.join(themeRoot, THEME_WIDE_DIR);
  const conferences = fs.existsSync(wideDir)
    ? fs.readdirSync(wideDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+$/.test(e.name))
      .map(e => e.name)
      .sort((a, b) => Number(a) - Number(b))
    : [];

  const moves: MenuMove[] = [];
  /** Formats whose newest file was not the only one that new - said, not guessed past. */
  const ties: string[] = [];
  for (const screen of THEME_WIDE_SCREENS) {
    const already = listNames(wideDir).filter(name => classify(screen, name) !== null);
    if (already.length > 0) {
      return { moves: [], ties: [], skipped: `already has ${already.map(n => path.join(THEME_WIDE_DIR, n)).join(', ')}` };
    }

    /** Per format: the newest base file across every conference. */
    const newest = new Map<string, { rel: string; name: string; mtimeMs: number; tied: string[] }>();
    const all: string[] = [];
    for (const conf of conferences) {
      for (const name of listNames(path.join(wideDir, conf))) {
        const kind = classify(screen, name);
        if (kind === null) continue;
        const rel = path.join(THEME_WIDE_DIR, conf, name);
        all.push(rel);
        if (kind === 'variant') continue;
        const { mtimeMs } = fs.statSync(path.join(themeRoot, rel));
        const best = newest.get(kind.base);
        // Conferences are walked in number order, so a tie keeps the lowest.
        if (!best || mtimeMs > best.mtimeMs) newest.set(kind.base, { rel, name, mtimeMs, tied: [] });
        else if (mtimeMs === best.mtimeMs) best.tied.push(rel);
      }
    }
    for (const best of newest.values()) {
      if (best.tied.length > 0) ties.push(`${best.rel} is no newer than ${best.tied.join(', ')} - the lowest conference was taken`);
    }

    const promoted = new Set<string>();
    for (const { rel, name } of newest.values()) {
      moves.push({ kind: 'promote', from: rel, to: path.join(THEME_WIDE_DIR, name) });
      promoted.add(rel);
    }
    for (const rel of all) {
      if (promoted.has(rel)) continue;
      moves.push({ kind: 'aside', from: rel, to: `${rel}.per-conference-${date}.backup` });
    }
  }
  return { moves, ties };
}

/** Carry the moves out. Refuses a move whose destination exists rather than overwrite it. */
export function applyThemeMenuMigration(themeRoot: string, moves: MenuMove[]): string[] {
  const refused: string[] = [];
  for (const move of moves) {
    const to = path.join(themeRoot, move.to);
    if (fs.existsSync(to)) {
      refused.push(`${move.to} already exists - ${move.from} left where it is`);
      continue;
    }
    // A rename, never a copy: the bytes and the mtime are the artist's.
    fs.renameSync(path.join(themeRoot, move.from), to);
  }
  return refused;
}

/**
 * The whole script, as a function, so a test can drive it without a process.
 *
 * @returns the exit code: 0 when it reported or moved, 1 when a move was refused.
 */
export function runThemeMenuMigration(
  argv: string[],
  out: (line: string) => void,
  defaultRoot: string,
): number {
  const opts = parseMenuMigrationArgs(argv);
  const root = path.resolve(opts.root ?? defaultRoot);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  out(`Board: ${root}${opts.dryRun ? '   (dry run - nothing is changed)' : ''}`);
  let code = 0;

  for (const theme of readThemeRegistry(root).themes) {
    if (opts.themes.length > 0 && !opts.themes.includes(theme.slug.toLowerCase())) continue;
    const themeRoot = themeDirectory(root, theme);
    if (!themeRoot || !fs.existsSync(themeRoot)) continue;   // `default` is the board itself

    const { moves, skipped, ties } = planThemeMenuMigration(themeRoot, date);
    out('');
    if (skipped) { out(`${theme.slug}: left alone - ${skipped}`); continue; }
    if (moves.length === 0) { out(`${theme.slug}: no per-conference main menu`); continue; }

    for (const tie of ties) out(`${theme.slug}: NOTE ${tie}`);
    for (const move of moves) {
      out(`${theme.slug}: ${move.kind === 'promote' ? 'promote' : 'aside  '} ${move.from} -> ${move.to}`);
    }
    if (opts.dryRun) continue;

    const refused = applyThemeMenuMigration(themeRoot, moves);
    for (const line of refused) out(`${theme.slug}: REFUSED ${line}`);
    if (refused.length > 0) code = 1;
  }

  if (opts.dryRun) {
    out('');
    out('Nothing was changed. Re-run without --dry-run to do it.');
  }
  return code;
}

if (require.main === module) {
  // Loaded HERE so importing this module in a test does not drag the board's
  // configuration in with it.
  const { config } = require('../config');
  process.exit(runThemeMenuMigration(
    process.argv.slice(2),
    (line: string) => console.log(line),
    config.get('dataDir'),
  ));
}
