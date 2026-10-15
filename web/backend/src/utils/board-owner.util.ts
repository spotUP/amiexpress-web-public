/**
 * Who owns a file the admin writes on the live volume.
 *
 * The board runs as uid 1001 (bbsuser). A write made as root - a one-off
 * script, an ssh session, a container started as root - leaves a root-owned
 * file the board can no longer rewrite, and the next admin save fails with
 * EACCES in a different feature (memory: root-owned-after-live-edit). So every
 * admin writer hands its result to the board after writing. A process that is
 * not root already writes as itself and has nothing to hand over.
 */
import * as fs from 'fs';
import * as path from 'path';

export const BOARD_UID = 1001;
export const BOARD_GID = 1001;

export function chownToBoard(target: string): void {
  if (process.getuid?.() === 0) fs.chownSync(target, BOARD_UID, BOARD_GID);
}

/** mkdir -p whose newly created directories belong to the board too. */
export function mkdirOwned(dir: string): void {
  const firstCreated = fs.mkdirSync(dir, { recursive: true });
  if (!firstCreated) return;
  // firstCreated is the topmost directory this call made; every one below it on the way to `dir` is new as well.
  let at = firstCreated;
  chownToBoard(at);
  for (const part of path.relative(firstCreated, dir).split(path.sep).filter(Boolean)) { at = path.join(at, part); chownToBoard(at); }
}
