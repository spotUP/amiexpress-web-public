/**
 * What it would take to make conference DIRECTORIES sequential again.
 *
 * Removing a conference already renumbers everything keyed by POSITION -
 * `conference-removal.service.ts` shifts NAME.n/LOCATION.n down, renames the
 * Conf<n>.info icons, rewrites every account's access string and the conf_base
 * pointers. What it does not do is move the directory: LOCATION.n carries its
 * old value down with it, so conference 3 keeps pointing at `BBS:Conf5/`. On
 * the live board that is `1->Conf2, 2->Conf3, 3->Conf5, 4->Conf8, 5->Conf12`,
 * and the sysop asked for the directories to close up too.
 *
 * This module PLANS that and does not do it. A conference directory is named
 * in more places than the mapping - a file area's DLPATH, a screen's `~SS_`,
 * a door's LOCATION, and (the one that bites) the OBJECT KEY PREFIX of any
 * pooled storage area, which is built from the download path: renaming
 * `Conf12/` to `Conf5/` would leave every object already in the bucket under a
 * prefix nothing looks up any more. So the plan reports, the sysop reads, and
 * a mover can be written afterwards against a list somebody has seen.
 */
import * as fs from 'fs';
import * as path from 'path';

import { conferenceNumbers, conferenceDir } from './conference-paths';
import { parseInfoFile } from '../utils/info-file.util';

/** One directory that would be renamed, and what it holds. */
export interface DirectoryMove {
  conference: number;
  from: string;
  to: string;
  /** Files under the directory, so a sysop can see the weight of the move. */
  files: number;
}

/** A place the old directory name is written down. */
export interface DirectoryReference {
  /** Board-relative file that names it. */
  file: string;
  /** What names it: a tooltype key, or the kind of line. */
  key: string;
  value: string;
  /** True when nothing in this codebase would rewrite it automatically. */
  manual: boolean;
}

export interface DirectoryCompactionPlan {
  /** The mapping as it stands: conference number to directory name. */
  current: Array<{ conference: number; dir: string }>;
  /** Empty when the directories are already sequential. */
  moves: DirectoryMove[];
  references: DirectoryReference[];
  /** Reasons a sysop should not run the move yet. */
  blockers: string[];
  /**
   * The subset of `blockers` that `compactConferenceDirectories` already
   * deals with, listed here rather than recognised by their wording.
   *
   * Every blocker is still printed - a sysop reads all of them - but a mover
   * that refused on the whole list would refuse every board that needs
   * compacting at all: a skewed mapping collides with itself by definition
   * (`Conf2` is wanted by conference 2 while conference 1 still holds it),
   * and the entrypoint seeds `Conf1`..`Conf14` on every board, so the empty
   * seeds are always in the way. A blocker class added later is NOT in this
   * list and therefore stops the run, which is the safe default.
   */
  handledByMover: string[];
}

const isConfDir = (name: string) => /^Conf\d+$/i.test(name);

/**
 * The collision the mover handles for itself, by staging every rename through
 * a temporary name before renaming any temporary into its target.
 */
const STAGING_BLOCKER = 'the move has to stage through a temporary name, in dependency order';

function countFiles(dir: string): number {
  let n = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(d, entry.name), depth + 1);
      else n++;
    }
  };
  walk(dir, 0);
  return n;
}

/** Every tooltype of an .info file, flattened, with the length byte healed. */
function toolTypesOf(file: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const tooltype of parseInfoFile(file).tooltypes) {
      // The length byte some boards bake into a key ("6FTPDATAPORT") is
      // stripped, the same heal bbs-config-file.service applies on read.
      const key = String(tooltype.key ?? '').replace(/^[^A-Za-z]+/, '').toUpperCase();
      if (key) out.set(key, String(tooltype.value ?? ''));
    }
  } catch {
    /* not an icon, or unreadable - the caller reports what it could read */
  }
  return out;
}

/**
 * Files that could name a conference directory: the board's own icons, its
 * command registrations and its screens. Deliberately not the whole volume -
 * a conference's own message base names itself constantly and moves with it.
 */
function scanTargets(bbsRoot: string): string[] {
  const out: string[] = [];
  const add = (p: string) => { if (fs.existsSync(p)) out.push(p); };

  add(path.join(bbsRoot, 'ConfConfig.info'));
  add(path.join(bbsRoot, 'Drives.info'));
  for (const entry of fs.readdirSync(bbsRoot, { withFileTypes: true })) {
    if (entry.isFile() && /^Conf\d+\.info$/i.test(entry.name)) add(path.join(bbsRoot, entry.name));
  }
  for (const tree of ['Commands/BBSCmd', 'Commands/SysCmd', 'Commands/ConfCmd']) {
    const dir = path.join(bbsRoot, tree);
    try {
      for (const name of fs.readdirSync(dir)) if (name.toLowerCase().endsWith('.info')) out.push(path.join(dir, name));
    } catch { /* a board need not have every command tree */ }
  }
  const screens = path.join(bbsRoot, 'Screens');
  try {
    for (const name of fs.readdirSync(screens)) {
      if (/\.(txt|ans|gr|seq|rip)$/i.test(name)) out.push(path.join(screens, name));
    }
  } catch { /* no Screens */ }
  return out;
}

/**
 * The plan. `bbsRoot` is read, never written.
 *
 * A move is proposed only where the directory's name disagrees with the
 * conference's number, and only into a name no other conference is using -
 * `Conf5` cannot be freed while conference 3 still lives there, so the order
 * matters and a mover would have to stage through a temporary name. That is
 * called out as a blocker rather than solved here.
 */
export function planDirectoryCompaction(bbsRoot: string): DirectoryCompactionPlan {
  const numbers = conferenceNumbers(bbsRoot);
  const current = numbers.map(n => ({ conference: n, dir: path.basename(conferenceDir(bbsRoot, n)) }));

  const moves: DirectoryMove[] = [];
  for (const { conference, dir } of current) {
    const want = `Conf${conference}`;
    if (dir.toLowerCase() === want.toLowerCase()) continue;
    moves.push({
      conference,
      from: dir,
      to: want,
      files: countFiles(path.join(bbsRoot, dir)),
    });
  }

  const references: DirectoryReference[] = [];
  const movedDirs = new Set(moves.map(m => m.from.toLowerCase()));
  if (movedDirs.size > 0) {
    for (const file of scanTargets(bbsRoot)) {
      const rel = path.relative(bbsRoot, file);
      if (file.toLowerCase().endsWith('.info')) {
        for (const [key, value] of toolTypesOf(file)) {
          const named = [...movedDirs].find(d => value.toLowerCase().includes(d));
          if (!named) continue;
          references.push({
            file: rel,
            key,
            value,
            // LOCATION.n in ConfConfig.info is the mapping itself and a mover
            // would rewrite it; everything else is somebody's own setting.
            manual: !(rel.toLowerCase() === 'confconfig.info' && /^LOCATION\.\d+$/.test(key)),
          });
        }
        continue;
      }
      let text = '';
      try { text = fs.readFileSync(file, 'latin1'); } catch { continue; }
      for (const dir of movedDirs) {
        const pattern = new RegExp(`[^\\s]*${dir}/[^\\s|]*`, 'gi');
        for (const hit of text.match(pattern) ?? []) {
          references.push({ file: rel, key: 'screen reference', value: hit, manual: true });
        }
      }
    }
  }

  const blockers: string[] = [];
  const handledByMover: string[] = [];
  const wanted = new Map(moves.map(m => [m.to.toLowerCase(), m.conference]));
  for (const { conference, dir } of current) {
    const holder = wanted.get(dir.toLowerCase());
    if (holder !== undefined && holder !== conference) {
      const blocker =
        `${dir} is wanted by conference ${holder} and still held by conference ${conference} - ` +
        STAGING_BLOCKER;
      blockers.push(blocker);
      handledByMover.push(blocker);
    }
  }
  const pooled = references.filter(r => /^DLPATH\.\d+$/i.test(r.key));
  if (pooled.length > 0 && fs.existsSync(path.join(bbsRoot, 'Drives.info'))) {
    blockers.push(
      `${pooled.length} file-area path(s) name a directory that would move, and a pooled area's ` +
      'OBJECT KEY PREFIX is built from that path - every object already in the bucket would be ' +
      'left under a prefix nothing looks up. Move the objects, or leave those areas local, before renaming.',
    );
  }
  const strays = fs.readdirSync(bbsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && isConfDir(e.name))
    .map(e => e.name)
    .filter(name => !current.some(c => c.dir.toLowerCase() === name.toLowerCase()));
  if (strays.length > 0) {
    // HANDLED, and only because the mover checks the thing that matters: a
    // stray standing on a wanted name is absorbed into the backup when it is
    // EMPTY - which the entrypoint's seeded `Conf1`..`Conf14` always are - and
    // refuses the whole run when it holds files. A stray nothing wants is not
    // in the way at all.
    const blocker =
      `${strays.join(', ')} look like conference directories but no conference points at them - ` +
      'a rename would collide with them or bury data nobody is reading. Settle them first.';
    blockers.push(blocker);
    handledByMover.push(blocker);
  }

  return { current, moves, references, blockers, handledByMover };
}

/**
 * The blockers that actually STOP `compactConferenceDirectories` - every one
 * the plan raised that `handledByMover` does not claim.
 *
 * On the live board that leaves exactly the pooled-area one, and it is the
 * right one to stop for: a pooled file area's object-key prefix is built from
 * the download path, so renaming the directory strands every object already in
 * the bucket, and the local backup this tool takes cannot bring those back.
 */
export function stoppingBlockers(plan: DirectoryCompactionPlan): string[] {
  const handled = new Set(plan.handledByMover ?? []);
  return plan.blockers.filter((blocker) => !handled.has(blocker));
}

/** The plan as a sysop would read it. */
export function describeCompactionPlan(plan: DirectoryCompactionPlan): string {
  const lines: string[] = [];
  lines.push('Conference directories, as they stand:');
  for (const c of plan.current) {
    lines.push(`  ${String(c.conference).padStart(2)} -> ${c.dir}${c.dir.toLowerCase() === `conf${c.conference}` ? '' : '   (does not match)'}`);
  }
  if (plan.moves.length === 0) {
    lines.push('', 'Nothing to do: every conference already lives in the directory its number names.');
    return lines.join('\n');
  }
  lines.push('', `${plan.moves.length} directory(ies) would move:`);
  for (const m of plan.moves) lines.push(`  conference ${m.conference}: ${m.from} -> ${m.to}   (${m.files} files)`);
  lines.push('', `${plan.references.length} place(s) name a moving directory:`);
  for (const r of plan.references.slice(0, 40)) {
    lines.push(`  ${r.manual ? '[by hand] ' : '[auto]    '}${r.file}  ${r.key}=${r.value}`);
  }
  if (plan.references.length > 40) lines.push(`  ... and ${plan.references.length - 40} more`);
  if (plan.blockers.length > 0) {
    lines.push('', 'Before any of it runs:');
    for (const b of plan.blockers) lines.push(`  - ${b}`);
  }
  return lines.join('\n');
}
