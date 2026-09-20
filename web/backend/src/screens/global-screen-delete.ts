/**
 * Removing a screen from the board ENTIRELY - every variant, every scope,
 * every theme.
 *
 * "if the sysop changes his mind and wants to entirely remove a screen
 * entirely from the bbs he needs to be able to delete it globally from all
 * themes and the default theme" (sysop, 2026-09-20).
 *
 * A screen is not a file here. `BULL` is `BULL.TXT` and `BULL20.TXT` and
 * `BULL.SEQ` and `BULL250.RIP`, sitting in the board's own directory, in each
 * of 256 node directories, in every conference, and again under every theme
 * that has redrawn it. The existing delete takes one path, which is right for
 * "drop my version" and useless for "get rid of this screen" - a sysop doing
 * it by hand would have to find every one of them and would leave the ones he
 * did not know about, which is how a caller ends up served art nobody meant
 * to keep.
 *
 * WHAT IT DELIBERATELY LEAVES:
 *
 *   Archived themes. `Themes/ansiguy.removed-20260915` is a theme that was
 *   already deleted, kept as a record of what it held. Reaching into it would
 *   make that record a lie, so they are listed as skipped and not touched.
 *
 *   Backups. A file the index calls `generated: 'backup'` is somebody's undo,
 *   including the one THIS delete is about to write.
 *
 * WHAT IT REPORTS BEFORE IT RUNS, because a sysop cannot confirm what he
 * cannot see: every file by name, the themes affected, whether the login
 * sequence asks for this screen (deleting `BULL` changes what every caller
 * walks through), and every `~SS_` line in another screen that pulls it in.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  buildScreenIndex,
  variantOf,
  variantStem,
  type ScreenIndex,
} from './screen-index.service';
import { findScreenReferences, type ScreenReference } from './screen-references';
import { LOGIN_SEQUENCE, type LoginStep } from './login-sequence';
import { readThemeRegistry } from './theme-registry';

/** Where a copy of the screen lives, in the sysop's terms rather than the loader's. */
export type DeleteScope = 'board' | 'node' | 'conference' | 'door' | 'other';

export interface GlobalDeleteTarget {
  /** Board-relative path of the file that would go. */
  path: string;
  /** The theme it belongs to, absent for the board's own copy. */
  theme?: string;
  scope: DeleteScope;
  bytes: number;
}

export interface GlobalDeletePlan {
  /** The screen name as asked for, upper-cased the way the board names screens. */
  screen: string;
  targets: GlobalDeleteTarget[];
  /** Themes whose copy would go, by slug. */
  themes: string[];
  /** Archived theme directories left alone, and therefore still holding a copy. */
  archivedThemesSkipped: string[];
  /** Every `~SS_`/`~CC_` line in another screen that names one of the targets. */
  references: ScreenReference[];
  /** How many of those lines can be dropped without touching a drawing. */
  removableReferences: number;
  /** Set when the board asks for this screen on the way in. */
  loginStep: LoginStep | null;
}

export interface GlobalDeleteResult {
  screen: string;
  deleted: string[];
  backups: string[];
  failed: { path: string; error: string }[];
  fixed: { file: string; linesRemoved: number }[];
}

/**
 * A screen NAME, not a path. Anything with a separator or an extension is a
 * file, and a file has its own delete - taking one here would silently widen
 * to every variant of its stem.
 */
export function isPlainScreenName(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(name);
}

/**
 * The screen a file belongs to: `Themes/h7/Node/LOGON20.TXT` -> `LOGON`.
 *
 * Through the index's own `variantStem`, because the rule for what counts as
 * a security variant lives there and a second copy of it here would drift -
 * and this one decides what a delete takes.
 */
export function screenNameFromPath(relPath: string): string {
  return variantStem(path.basename(relPath)).toUpperCase();
}

/** `Themes/<slug>/...` -> slug, or null for the board's own files. */
export function themeSlugOf(relPath: string): string | null {
  const parts = relPath.replace(/\\/g, '/').split('/');
  return parts[0] === 'Themes' && parts.length > 2 ? parts[1] : null;
}

/**
 * A theme directory the sysop already deleted, kept as a record.
 *
 * Two tests, because either alone is wrong: the name carries the stamp the
 * remover gave it, and the registry is what the board actually serves. A
 * directory the registry does not know is not a live theme whatever it is
 * called.
 */
function archivedThemes(baseDir: string): Set<string> {
  const live = new Set(readThemeRegistry(baseDir).themes.map(theme => theme.slug));
  const archived = new Set<string>();
  const themesDir = path.join(baseDir, 'Themes');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(themesDir, { withFileTypes: true });
  } catch {
    return archived;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (/\.removed[-.]/i.test(entry.name) || !live.has(entry.name)) {
      archived.add(entry.name);
    }
  }
  return archived;
}

/** Does any file under `dir` serve this screen? Used only for the archives. */
function holdsScreen(dir: string, wanted: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (holdsScreen(full, wanted)) return true;
    } else if (variantOf(wanted, entry.name)) {
      return true;
    }
  }
  return false;
}

function scopeOf(relPath: string): DeleteScope {
  const parts = relPath.replace(/\\/g, '/').split('/');
  const withinTheme = parts[0] === 'Themes' ? parts.slice(2) : parts;
  const head = withinTheme[0] ?? '';
  if (/^Node\d*$/i.test(head)) return 'node';
  if (/^Conf\d*/i.test(head)) return 'conference';
  if (/^Doors$/i.test(head)) return 'door';
  if (/^Screens$/i.test(head) || withinTheme.length === 1) return 'board';
  return 'other';
}

/**
 * Every file that serves `screen`, wherever it is.
 *
 * Driven off the screen index rather than a directory walk, so it sees
 * exactly the files the board can serve - including the theme copies, which
 * the index lists with the theme they belong to - and skips what the index
 * has already classified as a backup.
 */
export function planGlobalScreenDelete(
  baseDir: string,
  screen: string,
  index?: ScreenIndex,
): GlobalDeletePlan {
  const wanted = `${screen}.TXT`;
  const archived = archivedThemes(baseDir);
  const built = index ?? buildScreenIndex(baseDir);

  const targets: GlobalDeleteTarget[] = [];
  const themes = new Set<string>();
  const skipped = new Set<string>();

  for (const [relPath, facts] of Object.entries(built.files)) {
    if (facts.generated === 'backup') continue;
    if (!variantOf(wanted, path.basename(relPath))) continue;

    const slug = themeSlugOf(relPath);
    if (slug && archived.has(slug)) continue;

    if (slug) themes.add(slug);
    targets.push({
      path: relPath,
      ...(slug ? { theme: slug } : {}),
      scope: scopeOf(relPath),
      bytes: facts.bytes ?? 0,
    });
  }

  targets.sort((a, b) => a.path.localeCompare(b.path));

  /*
   * The archived themes are reported from DISK, not from the index.
   *
   * The index walks the themes the registry knows, so a removed theme's
   * directory is invisible to it - which would have made "skipped: none" mean
   * "there was nothing there" and "I cannot see it" at the same time. The
   * sysop is told which archives still hold a copy, because that is where the
   * screen survives this delete.
   */
  for (const slug of archived) {
    if (holdsScreen(path.join(baseDir, 'Themes', slug), wanted)) skipped.add(slug);
  }

  /*
   * References are gathered per target and then deduplicated: a screen that
   * includes `BULL.TXT` and `BULL20.TXT` names two of them on two lines, and
   * both lines go hollow when this runs.
   */
  const seen = new Set<string>();
  const references: ScreenReference[] = [];
  for (const target of targets) {
    for (const ref of findScreenReferences(baseDir, target.path)) {
      const key = `${ref.from}:${ref.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push(ref);
    }
  }

  return {
    screen: screen.toUpperCase(),
    targets,
    themes: [...themes].sort(),
    archivedThemesSkipped: [...skipped].sort(),
    references,
    removableReferences: references.filter(ref => ref.removable).length,
    loginStep: LOGIN_SEQUENCE.find(step => step.screen === screen.toUpperCase()) ?? null,
  };
}

/**
 * Deletes everything the plan names, each file backed up beside itself first.
 *
 * A failure on one file does not stop the others: a half-deleted screen with
 * a list of what could not go is recoverable, and a delete that stops at the
 * first permission error leaves a board serving the screen from wherever it
 * stopped, which reads as "the delete did nothing".
 */
export function performGlobalScreenDelete(
  baseDir: string,
  plan: GlobalDeletePlan,
): Omit<GlobalDeleteResult, 'fixed'> {
  const deleted: string[] = [];
  const backups: string[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const target of plan.targets) {
    const full = path.join(baseDir, target.path);
    try {
      fs.copyFileSync(full, `${full}.backup`);
      fs.unlinkSync(full);
      deleted.push(target.path);
      backups.push(`${target.path}.backup`);
    } catch (error) {
      failed.push({ path: target.path, error: (error as Error).message });
    }
  }

  return { screen: plan.screen, deleted, backups, failed };
}
