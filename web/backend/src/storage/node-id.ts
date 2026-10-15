/**
 * Which node this process is, when nobody said so explicitly.
 *
 * Review findings 2 and 3 on Task 12's boot wiring, together:
 *
 *   - `String(process.pid)` as the fallback orphans every pending upload on
 *     every restart, because a restart gets a NEW pid and therefore a NEW
 *     cache directory - the previous run's `.pending/` markers sit in a
 *     directory nothing will ever scan again.
 *   - On a BARE host with no `HOSTNAME` set, two separate backend processes
 *     both fell to the bare pid, which at least differed - but a bare host
 *     that DOES export `HOSTNAME` (common on non-containerised Linux) gave
 *     two processes the SAME value and therefore the SAME cache directory,
 *     which is exactly what CONFIGURATION.md says must never happen.
 *
 * A single persisted id file cannot fix the bare-host case alone:
 * read-or-create-once gives every process that ever asks the SAME answer,
 * which solves the restart problem by making the concurrency problem
 * permanent. The two requirements - stable across a restart of the only
 * process running, distinct for two processes alive at once - need a
 * mechanism that can tell "alive" apart from "was alive once", which a flat
 * file cannot do on its own.
 *
 * So, for the case nothing else can already get right:
 *
 *   1. `BBS_STORAGE_NODE_ID` - an explicit override always wins outright.
 *      An operator who sets it has taken responsibility for uniqueness, the
 *      same way CONFIGURATION.md always asked them to.
 *   2. `HOSTNAME` - trusted outright when set, no liveness check needed.
 *      This is the CONTAINER case, and it already worked before Task 12
 *      touched this file: Docker and every common orchestrator set a
 *      distinct `HOSTNAME` per container, so two containers sharing a board
 *      root already get different values with zero extra machinery. The
 *      Task 12 review round that added slot-claiming below DROPPED this
 *      priority by mistake and broke it - restored here.
 *   3. A claimed SLOT - the bare-host case neither of the above can cover.
 *      A small integer, claimed under `<bbsRoot>/Storage/nodes/<n>.pid`,
 *      the file holding the pid that currently owns it:
 *
 *        - A restart of the only process running re-asks for slot 1, finds
 *          its own former occupant's pid dead - the same `isProcessAlive`
 *          check `file-cache.ts` already trusts to reclaim orphaned
 *          `.tmp-<pid>-<n>` scratch - and reclaims it, so its cache
 *          directory (and the pending markers under it) survive the
 *          restart intact.
 *        - A second process starting while the first is still alive finds
 *          slot 1 held by a live pid and moves on to slot 2, so two
 *          instances against the same board root never share a directory,
 *          with no operator action required.
 *
 * MEMOISED PER PROCESS, PER BOARD ROOT. A process that calls this twice for
 * the same root must get the SAME answer both times - Task 12 review
 * Blocker A: `refreshStorageContext` rebuilds the whole storage subsystem on
 * every admin save, and an unmemoised claim reads its OWN prior claim back
 * as "held by a live pid" (it is - the very same process) and moves to the
 * next slot every single time, abandoning the previous directory - and
 * everything still staged under it - on the FIRST admin save after boot.
 * The slot is a fact about this process's lifetime, decided once.
 *
 * THE INVARIANT THIS FILE SERVES IS "NO PENDING MARKER IS EVER LEFT WHERE
 * NOTHING WILL SCAN IT" - NOT "the id is stable". Id stability can still
 * slip (a changed `BBS_STORAGE_NODE_ID`, a directory an older node-id
 * scheme left behind, pid reuse, the `MAX_SLOTS` fallback below), so this
 * module is not the last line of defence - `storage/index.ts`'s
 * `sweepOrphanedCacheDirs` is, and holds regardless of what happens here.
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

/** One claim per (process, board root) for this process's whole lifetime - see the module doc's Blocker A note. */
const claimedSlots = new Map<string, string>();

/**
 * Creates `lockPath` with `process.pid` as its ENTIRE, ALREADY-COMPLETE
 * content, or reports it already exists - atomically, with no window where
 * a concurrent reader can see the file part-written.
 *
 * `open('wx')` then `write()` is NOT atomic across that pair: between the
 * two calls the file exists but is empty, and a racing `tryClaim` that reads
 * it in that window sees no parseable pid, calls the slot stale, unlinks the
 * winner's own fresh lock and claims the same slot out from under it - two
 * processes then believe they hold one directory with nothing able to tell
 * afterwards. Writing the full content to a private temp file first and then
 * hard-linking it into place closes the window: `link()` fails with `EEXIST`
 * if the destination already exists and otherwise installs the
 * already-complete inode under that name in one step, so `lockPath` is never
 * observable as anything but "absent" or "fully written".
 */
function createExclusive(lockPath: string): boolean {
  const tempPath = `${lockPath}.tmp-${process.pid}-${process.hrtime.bigint()}`;
  fs.writeFileSync(tempPath, String(process.pid), { flag: 'wx' });
  try {
    fs.linkSync(tempPath, lockPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') return false;
    throw err;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort scratch cleanup - a leftover `.tmp-<pid>-<n>` here is
      // the same shape file-cache.ts's own sweep already tolerates.
    }
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
 * below; exactly one succeeds (`createExclusive`'s link is atomic), and the
 * loser reports the slot taken and moves on to the next one, rather than
 * believing it holds a slot it does not.
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
 * process lineage, distinct for two processes alive at once, and memoised
 * for the lifetime of THIS process - see the module doc for all three.
 */
export function claimNodeSlot(bbsRoot: string): string {
  const key = path.resolve(bbsRoot);
  const cached = claimedSlots.get(key);
  if (cached !== undefined) return cached;

  const dir = path.join(bbsRoot, 'Storage', NODES_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });

  for (let n = 1; n <= MAX_SLOTS; n++) {
    if (tryClaim(path.join(dir, `${n}.pid`))) {
      const slot = String(n);
      claimedSlots.set(key, slot);
      return slot;
    }
  }

  const fallback = `pid-${process.pid}`;
  console.warn(
    `[storage] every node slot up to ${MAX_SLOTS} under ${dir} is held by a live process; ` +
      `using pid ${process.pid} for this run - it will not survive a restart`
  );
  claimedSlots.set(key, fallback);
  return fallback;
}
