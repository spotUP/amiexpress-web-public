/**
 * Making the BBS notice that a door came or went.
 *
 * There are TWO caches between a .info on disk and the door list a sysop
 * sees, and refreshing the wrong one looks exactly like refreshing the
 * right one:
 *
 *   1. `commandCache.bbscmd` (command-execution.handler) - the parsed
 *      command definitions, reloaded from disk by
 *      revalidateBbsCommandsIfChanged();
 *   2. `doors` (door.handler) - the registry every list renders, rebuilt by
 *      initializeDoors() FROM commandCache.
 *
 * The delete path used to call refreshDoorCache() + initializeDoors().
 * refreshDoorCache refreshes a THIRD cache - amigaDoorManager's own
 * doorCache - which initializeDoors does not read at all, and nothing
 * invalidated commandCache. So initializeDoors dutifully rebuilt the
 * registry from stale definitions and the deleted door stayed in the list.
 *
 * Observed on the live board, 2026-08-31: DOORMAN removed
 * Commands/BBSCmd/SEC.info, logged "rescanning the door definitions" and
 * "reloading the door registry" as OK, then reported "SEC is still
 * registered - the BBS still lists it". The delete had worked; only the
 * verification was reading a stale list. The same staleness listed VSYS,
 * whose .info was not on disk at all.
 *
 * revalidateBbsCommandsIfChanged() is stamp-based - it compares directory
 * mtime and size - so a deletion CAN look unchanged to it on a coarse
 * filesystem. invalidateBbsCommandFreshness() exists for exactly that and
 * had no callers anywhere in the codebase; this is its caller.
 */

/**
 * Reload every cache between the .info files and the door list, in order.
 *
 * @param onStep optional progress reporter, so a caller streaming a delete
 *               log can show each stage rather than one long pause
 * @returns true when the registry was rebuilt
 */
export async function reloadDoorRegistry(
  onStep?: (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => void,
): Promise<boolean> {
  let ok = true;

  // 1. The command definitions. Forced, not stamp-checked: the caller has
  //    just changed a .info and knows something the stamp may not see.
  try {
    const cmdMod = require('../handlers/command-execution.handler');
    const baseDir = require('../config').config.get('dataDir');
    cmdMod.invalidateBbsCommandFreshness();
    cmdMod.revalidateBbsCommandsIfChanged(baseDir);
    onStep?.({ kind: 'ok', text: 'reloading the command definitions' });
  } catch (e) {
    ok = false;
    onStep?.({ kind: 'fail', text: `command definitions: ${(e as Error).message}` });
  }

  // 2. amigaDoorManager's own scan, which the installer and the door
  //    browser read.
  try {
    const { refreshDoorCache } = await import('./amigaDoorManager');
    await refreshDoorCache();
    onStep?.({ kind: 'ok', text: 'rescanning the door definitions' });
  } catch (e) {
    ok = false;
    onStep?.({ kind: 'fail', text: `door scan: ${(e as Error).message}` });
  }

  // 3. The registry every list renders - LAST, because it is built from
  //    what step 1 just reloaded.
  try {
    const { initializeDoors } = require('../handlers/door.handler');
    await initializeDoors();
    onStep?.({ kind: 'ok', text: 'reloading the door registry' });
  } catch (e) {
    ok = false;
    onStep?.({ kind: 'fail', text: `door registry: ${(e as Error).message}` });
  }

  return ok;
}
