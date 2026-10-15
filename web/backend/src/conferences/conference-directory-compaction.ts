/**
 * Make conference DIRECTORIES agree with conference numbers again.
 *
 * `conference-removal.service.ts` renumbers everything keyed by position, but
 * LOCATION.n carries its old value down, so a board that has had conferences
 * removed ends up like the live one: `1->Conf2, 2->Conf3, 3->Conf5, 4->Conf8,
 * 5->Conf12`. That is not only untidy. The deploy syncs the IMAGE's
 * `Conf<n>/Screens` into the volume's directory of the SAME NAME, so with the
 * mapping skewed the repo's conference 2 screens were landing in the board's
 * conference 1. Closing the gap aligns them for the first time.
 *
 * What moves, in one place so the pieces cannot drift apart:
 *
 *   the directories   staged through temporary names, because the chain
 *                     collides with itself - Conf2 is wanted by conference 2
 *                     while conference 1 still holds it
 *   ConfConfig.info   LOCATION.n rewritten to BBS:Conf<n>/
 *   Conf<n>.info      DLPATH.n / ULPATH.n that named a moved directory
 *
 * An EMPTY directory standing in the way is absorbed (the entrypoint seeds
 * `Conf1`..`Conf14` whether a board uses them or not). One with files in it
 * stops the whole run: that is somebody's conference, whatever the mapping
 * says about it.
 *
 * Everything is copied to `<bbsRoot>/_conf-backups/compact-<stamp>` first, and
 * a failed run rolls its renames back. The plan is `planDirectoryCompaction`;
 * this executes it and nothing else.
 */
import * as fs from 'fs';
import * as path from 'path';

import { planDirectoryCompaction, type DirectoryCompactionPlan } from './conference-directory-plan';
import { conferenceNumbers } from './conference-paths';
import { applyTooltypes, parseInfoFile } from '../utils/info-file.util';

export interface CompactionOptions {
  /** Report only. Nothing is renamed and nothing is written. */
  dryRun?: boolean;
}

export interface CompactionResult {
  moved: Array<{ conference: number; from: string; to: string }>;
  /** Empty directories that stood in the way and were put in the backup. */
  absorbed: string[];
  /** `<file> <KEY>=<old> -> <new>` for every tooltype rewritten. */
  rewrites: string[];
  backupDir: string | null;
  /** Present when nothing ran: the reason. */
  refused?: string;
}

const dirIsEmpty = (dir: string): boolean => {
  const walk = (d: string): boolean => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return true; }
    for (const entry of entries) {
      if (entry.isFile()) return false;
      if (entry.isDirectory() && !walk(path.join(d, entry.name))) return false;
    }
    return true;
  };
  return walk(dir);
};

/** `BBS:Conf12/Upload/` with Conf12 renamed to Conf5, case as written. */
export function rewriteConferencePath(value: string, moves: Map<string, string>): string {
  return value.replace(/(^|[:/])(Conf\d+)(?=[/]|$)/gi, (whole, lead: string, dir: string) => {
    const to = moves.get(dir.toLowerCase());
    return to ? `${lead}${to}` : whole;
  });
}

/**
 * Do it. `dryRun` answers the same shape without touching the board.
 *
 * The order is what makes it safe: back up the icons, absorb the empty
 * blockers, rename every source to a temporary name, then rename each
 * temporary into its target. A collision cannot happen in the second pass
 * because the first emptied every target name.
 */
export function compactConferenceDirectories(
  bbsRoot: string,
  options: CompactionOptions = {},
): CompactionResult {
  const plan: DirectoryCompactionPlan = planDirectoryCompaction(bbsRoot);
  const result: CompactionResult = { moved: [], absorbed: [], rewrites: [], backupDir: null };

  if (plan.moves.length === 0) return result;

  // A directory in the way with FILES in it is somebody's conference.
  const targets = new Map(plan.moves.map(m => [m.to.toLowerCase(), m]));
  const sources = new Set(plan.moves.map(m => m.from.toLowerCase()));
  const blockingDirs: string[] = [];
  for (const [name, move] of targets) {
    const full = path.join(bbsRoot, move.to);
    if (!fs.existsSync(full) || sources.has(name)) continue;
    if (!dirIsEmpty(full)) {
      return { ...result, refused: `${move.to} already exists and is not empty - it holds files no conference points at. Settle it before compacting.` };
    }
    blockingDirs.push(move.to);
  }

  if (options.dryRun) {
    return {
      moved: plan.moves.map(m => ({ conference: m.conference, from: m.from, to: m.to })),
      absorbed: blockingDirs,
      rewrites: plan.references
        .filter(r => /^(DL|UL)PATH\.\d+$/i.test(r.key) || /^LOCATION\.\d+$/i.test(r.key))
        .map(r => `${r.file} ${r.key}=${r.value}`),
      backupDir: null,
    };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(bbsRoot, '_conf-backups', `compact-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  result.backupDir = backupDir;

  // The icons, before anything is written to them.
  for (const name of fs.readdirSync(bbsRoot)) {
    if (name === 'ConfConfig.info' || /^Conf\d+\.info$/i.test(name)) {
      try { fs.copyFileSync(path.join(bbsRoot, name), path.join(backupDir, name)); } catch { /* unreadable, reported by the verify below */ }
    }
  }

  // The empty blockers go into the backup rather than the bin.
  for (const name of blockingDirs) {
    fs.renameSync(path.join(bbsRoot, name), path.join(backupDir, `absorbed-${name}`));
    result.absorbed.push(name);
  }

  // Two passes through temporary names: the chain collides with itself.
  const staged: Array<{ temp: string; move: typeof plan.moves[number] }> = [];
  const undo: Array<[string, string]> = [];
  try {
    for (const move of plan.moves) {
      const temp = path.join(bbsRoot, `.compact-${move.conference}-${stamp}`);
      fs.renameSync(path.join(bbsRoot, move.from), temp);
      undo.push([temp, path.join(bbsRoot, move.from)]);
      staged.push({ temp, move });
    }
    for (const { temp, move } of staged) {
      const to = path.join(bbsRoot, move.to);
      fs.renameSync(temp, to);
      undo.pop();
      undo.push([to, path.join(bbsRoot, move.from)]);
      result.moved.push({ conference: move.conference, from: move.from, to: move.to });
    }
  } catch (error) {
    for (const [from, to] of undo.reverse()) {
      try { fs.renameSync(from, to); } catch { /* best effort; the backup holds the icons */ }
    }
    return { ...result, moved: [], refused: `renaming failed and was rolled back: ${(error as Error).message}` };
  }

  // The mapping, and every path that named a moved directory.
  const renames = new Map(plan.moves.map(m => [m.from.toLowerCase(), m.to]));
  const confConfig = path.join(bbsRoot, 'ConfConfig.info');
  if (fs.existsSync(confConfig)) {
    const assignments: Array<readonly [string, string]> = [];
    for (const n of conferenceNumbers(bbsRoot)) assignments.push([`LOCATION.${n}`, `BBS:Conf${n}/`] as const);
    applyTooltypes(confConfig, assignments);
    for (const [key, value] of assignments) result.rewrites.push(`ConfConfig.info ${key}=${value}`);
  }

  for (const name of fs.readdirSync(bbsRoot)) {
    if (!/^Conf\d+\.info$/i.test(name)) continue;
    const full = path.join(bbsRoot, name);
    let tooltypes: Array<{ key: string; value: string }> = [];
    try {
      tooltypes = parseInfoFile(full).tooltypes.map(t => ({ key: String(t.key ?? ''), value: String(t.value ?? '') }));
    } catch { continue; }
    const changes: Array<readonly [string, string]> = [];
    for (const { key, value } of tooltypes) {
      const clean = key.replace(/^[^A-Za-z]+/, '').toUpperCase();
      if (!/^(DL|UL)PATH\.\d+$/.test(clean)) continue;
      const next = rewriteConferencePath(value, renames);
      if (next !== value) {
        changes.push([clean, next] as const);
        result.rewrites.push(`${name} ${clean}=${value} -> ${next}`);
      }
    }
    if (changes.length > 0) applyTooltypes(full, changes);
  }

  return result;
}
