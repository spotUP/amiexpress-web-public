/**
 * BBSCmd watcher — notices a door installed while the BBS is running.
 *
 * Second half of the fix described in command-execution.handler.ts's
 * revalidateBbsCommandsIfChanged(). That check runs on a command MISS, so a
 * newly installed door becomes runnable the moment somebody types its name.
 * This watcher covers the other half: everything that reads the door list
 * WITHOUT going through a command lookup — the door menu, the sysop door
 * listing, DOORMAN's own installed view — would otherwise keep showing the
 * boot-time list until the next miss happened to refresh it.
 *
 * It deliberately does NOT reload anything itself. It clears the freshness
 * stamp, so the next command lookup does the reload, and refreshes the
 * AmigaDoorManager cache that the listing paths read. Doing the reload here
 * would mean parsing every .info file on the watcher's thread while nobody
 * is waiting for the result, and would race with a lookup already doing the
 * same work.
 *
 * fs.watch is best-effort by nature (it is unreliable over some network and
 * container filesystems, and can fire twice for one change). Nothing here
 * depends on it being reliable: if the watcher never fires, the mtime check
 * on the next command miss still catches the change. That is why this is
 * additive rather than the primary mechanism.
 */
import * as fs from 'fs';
import { CommandType, getCommandSearchPaths } from '../utils/amiga-command-parser.util';
import { invalidateBbsCommandFreshness } from './command-execution.handler';

/** Coalescing window: an editor or an extractor writing several files in a
 *  row produces a burst of events, and one invalidation covers all of them. */
const DEBOUNCE_MS = 300;

let watchers: fs.FSWatcher[] = [];
let debounceTimer: NodeJS.Timeout | null = null;

/** Exported for tests: the action a change triggers, with no fs.watch in the way. */
export async function onBbsCmdDirectoryChanged(): Promise<void> {
  invalidateBbsCommandFreshness();
  // Logged because this is otherwise an invisible event, and "was my door
  // picked up?" is the first question anyone asks after installing one.
  console.log('[BBSCmd watcher] command directory changed - door list will refresh');

  // The door listing paths read AmigaDoorManager's own cache, which is
  // populated once at startup and is not touched by the command cache.
  try {
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const mgr = getAmigaDoorManager?.();
    if (mgr?.refreshCache) {
      await mgr.refreshCache();
    }
  } catch {
    /* Listing cache is best-effort; the command path is the one that must work. */
  }
}

/**
 * Starts watching every BBSCmd directory the command scan reads. Returns how
 * many directories are being watched (0 is normal on a fresh install with no
 * Commands/BBSCmd yet, and is not an error).
 *
 * Calling this twice replaces the previous watchers rather than stacking a
 * second set on the same directories.
 */
export function startBbsCmdWatcher(
  baseDir: string,
  conferenceId?: number,
  nodeId: number = 0
): number {
  stopBbsCmdWatcher();

  const dirs = getCommandSearchPaths(baseDir, CommandType.BBSCMD, conferenceId, nodeId);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    try {
      const watcher = fs.watch(dir, () => {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void onBbsCmdDirectoryChanged();
        }, DEBOUNCE_MS);
      });
      // A watcher must never keep the process alive on its own.
      watcher.unref?.();
      watchers.push(watcher);
    } catch (err: any) {
      // Some filesystems refuse to watch. The mtime check still covers us.
      console.log(`[BBSCmd watcher] not watching ${dir}: ${err?.message ?? err}`);
    }
  }

  return watchers.length;
}

export function stopBbsCmdWatcher(): void {
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      /* already closed */
    }
  }
  watchers = [];
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
