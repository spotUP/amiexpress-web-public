/**
 * Which node this process is, when nobody said so explicitly.
 *
 * Review findings 2 and 3 on Task 12's boot wiring, together:
 *
 *   - `String(process.pid)` as the fallback orphans every pending upload on
 *     every restart, because a restart gets a NEW pid and therefore a NEW
 *     cache directory - the previous run's `.pending/` markers sit in a
 *     directory nothing will ever scan again.
 *   - `HOSTNAME` is not reliably exported on a bare host, and even where it
 *     is, two separate backend processes on that SAME host - a rolling
 *     restart's brief overlap, a sysop testing two instances against one
 *     board root - get the SAME value and therefore the SAME cache
 *     directory, which is exactly what CONFIGURATION.md says must never
 *     happen and the plain default cannot prevent.
 *
 * A single persisted id file cannot fix both at once: read-or-create-once
 * gives every process that ever asks the SAME answer, which solves the
 * restart problem by making the concurrency problem permanent. The two
 * requirements - stable across a restart of the only process running,
 * distinct for two processes alive at once - need a mechanism that can tell
 * "alive" apart from "was alive once", which a flat file cannot do on its
 * own.
 *
 * So a node's identity is a small integer SLOT, claimed under
 * `<bbsRoot>/Storage/nodes/<n>.pid`, and the file holds the pid that
 * currently owns it:
 *
 *   - A restart of the only process running re-asks for slot 1, finds its
 *     own former occupant's pid dead - the same `isProcessAlive` check
 *     `file-cache.ts` already trusts to reclaim orphaned `.tmp-<pid>-<n>`
 *     scratch - and reclaims it, so its cache directory (and the pending
 *     markers under it) survive the restart intact.
 *   - A second process starting while the first is still alive finds slot 1
 *     held by a live pid and moves on to slot 2, so two instances against
 *     the same board root never share a directory, with no operator action
 *     required.
 *
 * `BBS_STORAGE_NODE_ID` bypasses this entirely: an operator who sets it has
 * already taken responsibility for uniqueness, the same way CONFIGURATION.md
 * always asked them to.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isProcessAlive } from './file-cache';

const NODES_DIRNAME = 'nodes';

/**
 * Slots this high are not a real deployment - they are a runaway spawn loop.
 * Refusing to search further and falling back to the pid keeps the board
 * booting rather than looping forever; it just loses the restart-survives
 * guarantee for that one run, the same posture every other "cannot happen"
 * branch in this module takes.
 */
const MAX_SLOTS = 64;

function createExclusive(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    try {
      fs.writeSync(fd, String(process.pid));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') return false;
    throw err;
  }
}

function readOwnerPid(lockPath: string): number | null {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Claims one slot's lock file, or reports it is genuinely in use.
 *
 * A slot whose owner cannot be read, or is no longer alive, is stale: it is
 * unlinked and re-created for this process. Two processes racing to reclaim
 * the SAME stale slot at the same instant both attempt the exclusive create
 * below; exactly one succeeds, and the loser reports the slot taken and
 * moves on to the next one, rather than believing it holds a slot it does
 * not.
 */
function tryClaim(lockPath: string): boolean {
  if (createExclusive(lockPath)) return true;

  const ownerPid = readOwnerPid(lockPath);
  if (ownerPid !== null && isProcessAlive(ownerPid)) return false; // genuinely in use

  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Gone already - fine, the create below still decides who gets it.
  }
  return createExclusive(lockPath);
}

/**
 * Claims a node slot under `bbsRoot`, stable across a restart of the same
 * process lineage and distinct for two processes alive at once. See the
 * module doc for why this is not just a persisted value.
 */
export function claimNodeSlot(bbsRoot: string): string {
  const dir = path.join(bbsRoot, 'Storage', NODES_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });

  for (let n = 1; n <= MAX_SLOTS; n++) {
    if (tryClaim(path.join(dir, `${n}.pid`))) return String(n);
  }

  console.warn(
    `[storage] every node slot up to ${MAX_SLOTS} under ${dir} is held by a live process; ` +
      `using pid ${process.pid} for this run - it will not survive a restart`
  );
  return `pid-${process.pid}`;
}
