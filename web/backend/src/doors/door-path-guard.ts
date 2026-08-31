/**
 * What a door-admin read is allowed to touch.
 *
 * `GET /api/door-admin/installed/:cmd/file?p=` takes a path from a query
 * string on a route that other people's boards can reach - `RepoHost` ships
 * baked to `bbs.uprough.net` in the DoorRepo doors handed out to sysops. An
 * escape from the named door's directory is an arbitrary-file-read of the BBS
 * host: `user.data`, `Access/ACS.*.info`, the launch token itself.
 *
 * Related to, but not the same as, `Doors/door-manager/safe-install-dir.ts`.
 * That module decides which stored `install_dir` an uninstall may *delete*,
 * contained to `<root>/Doors/`. This one decides which caller-supplied
 * relative path may be *read*, contained to one door's own directory.
 * Different input, different base, different result. The technique - resolve,
 * then test `path.relative` for empty / `..` / absolute - is the same, and is
 * taken from there deliberately.
 *
 * It is not enough on its own. `path.relative` compares strings, and a
 * symlink inside a door's directory pointing at `/etc/passwd` passes that test
 * while reading something else entirely. So every resolution is re-checked
 * after `realpath`, and the directory walk uses `lstat` and never descends
 * into a link.
 */

import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { resolveDoorDirectory } from './door-list';

export interface ResolvedPath {
  /** The absolute path the request may read. */
  path: string;
}

export interface RejectedPath {
  /** Why the read must not go ahead, in words a sysop can act on. */
  reason: string;
  /** 404 when the thing does not exist, 403 when it exists but is out of bounds. */
  status: 403 | 404;
}

export type PathDecision = ResolvedPath | RejectedPath;

export function isAllowed(decision: PathDecision): decision is ResolvedPath {
  return (decision as ResolvedPath).path !== undefined;
}

/** True when `target` is `base` itself or something strictly inside it. */
function isInside(base: string, target: string, allowBaseItself: boolean): boolean {
  const relative = path.relative(base, target);
  if (relative === '') return allowBaseItself;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** `realpath`, or the input unchanged when it does not resolve. */
function realOrSelf(p: string): string {
  try {
    return amigafs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Resolve a BBS command to the directory its files live in.
 *
 * Reads the registered commands from `door.handler`'s in-memory list - no
 * database - and resolves the directory through the same
 * `resolveDoorDirectory` the door list uses, so a route and the list can never
 * disagree about where a door is.
 */
export function resolveDoorDir(bbsRoot: string, command: string): PathDecision {
  const { getDoors } = require('../handlers/door.handler');
  const wanted = command.toUpperCase();
  const door = (getDoors() as any[]).find(
    (d) => String(d.command || d.id || '').toUpperCase() === wanted,
  );
  if (!door) {
    return { reason: `no command named ${wanted}`, status: 404 };
  }

  const { resolvedPath } = resolveDoorDirectory(bbsRoot, door);
  if (!resolvedPath) {
    // The DD and BROADCAST shape: a registration whose files are not there.
    return { reason: `${wanted} has no directory on disk`, status: 404 };
  }

  // A LOCATION tooltype is sysop-editable and can name anywhere at all.
  const rootReal = realOrSelf(path.resolve(bbsRoot));
  const dirReal = realOrSelf(path.resolve(resolvedPath));
  if (!isInside(rootReal, dirReal, false)) {
    return { reason: `${wanted} resolves outside the BBS root`, status: 403 };
  }

  return { path: dirReal };
}

/**
 * Resolve a caller-supplied relative path inside a door's directory.
 *
 * @param doorDir absolute, already realpath'd, from resolveDoorDir
 * @param requested the raw `p` query parameter
 */
export function resolveDoorFile(doorDir: string, requested: unknown): PathDecision {
  if (typeof requested !== 'string' || requested.trim() === '') {
    return { reason: 'no path given', status: 404 };
  }

  const raw = requested.trim();

  if (path.isAbsolute(raw) || raw.includes('\0')) {
    return { reason: `"${raw}" is not a path inside this door`, status: 403 };
  }

  const target = path.resolve(doorDir, raw);
  if (!isInside(doorDir, target, false)) {
    return { reason: `"${raw}" is outside this door's directory`, status: 403 };
  }

  // The string test above is satisfied by a symlink that points anywhere.
  const targetReal = realOrSelf(target);
  if (!isInside(doorDir, targetReal, false)) {
    return { reason: `"${raw}" links outside this door's directory`, status: 403 };
  }

  if (!amigafs.existsSync(targetReal)) {
    return { reason: `"${raw}" does not exist`, status: 404 };
  }

  return { path: targetReal };
}

export interface DoorFileEntry {
  /** Path relative to the door's directory, with '/' separators. */
  path: string;
  size: number;
  isDir: boolean;
}

/**
 * Walk a door's directory, depth-first, parents before their contents.
 *
 * `lstat`, not `stat`: a symlink is reported as the link it is, with its own
 * size, and is never descended into. That keeps the listing inside the door
 * even when the door contains a link out of it.
 *
 * Stops at `limit` entries. The caller reports how many were emitted, never
 * how many exist, so a client always knows how many rows follow.
 */
export function walkDoorDir(doorDir: string, limit: number): DoorFileEntry[] {
  const out: DoorFileEntry[] = [];

  const visit = (absolute: string, relative: string): void => {
    if (out.length >= limit) return;

    let names: string[];
    try {
      names = amigafs.readdirSync(absolute).sort();
    } catch {
      return;
    }

    for (const name of names) {
      if (out.length >= limit) return;
      const childAbs = path.join(absolute, name);
      const childRel = relative === '' ? name : `${relative}/${name}`;

      let stats;
      try {
        stats = amigafs.lstatSync(childAbs);
      } catch {
        continue;
      }

      const isDir = stats.isDirectory();
      out.push({ path: childRel, size: isDir ? 0 : stats.size, isDir });
      if (isDir) visit(childAbs, childRel);
    }
  };

  visit(doorDir, '');
  return out;
}
