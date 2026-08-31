/**
 * Deleting a door from DOORMAN's list: the whole flow, out of app.ts.
 *
 * Split out when app.ts reached the 2000-line ceiling, the same move
 * run-door.ts and installed-footer.ts already made. It earns its own file
 * for a second reason: three separate live reports came out of these ~60
 * lines - a delete that froze the board with no feedback, a delete that said
 * "deleted" over a door still in the list, and a panel that went on
 * describing a deleted door after the list had moved on.
 *
 * What the caller keeps: the confirmation, and the view it draws into.
 * Everything about WHAT a delete does, and what the sysop is told while it
 * happens, is here.
 */

import { ActionLog } from './action-log';
import { deleteOutcomeView } from './delete-outcome';

/** Only the fields the delete needs; the view passes its richer object. */
export interface DeletableDoor {
  command: string;
  name: string;
  type: string;
  location?: string;
}

export interface DeleteDoorDeps<T extends DeletableDoor = DeletableDoor> {
  door: T;
  /** where the list's cursor was, so it can land somewhere sensible after */
  selectedIndex: number;
  bbs: any;
  setInfo(text: string): void;
  render(): void;
  setStatus(message: string, colour: 'green' | 'red' | 'yellow', ms?: number): void;
  refreshRegistry(): Promise<unknown>;
  fetchDoors(): Promise<T[]>;
  onDoorsChanged(doors: T[], selectIndex: number): void;
  /** redraw the info panel for whatever door is selected now */
  showSelectedDoor(): void;
}

/** Escapes blessed's own tag syntax in text that came from disk. */
function sanitizeForTags(text: string): string {
  return String(text ?? '').replace(/[{}]/g, '');
}

/**
 * Which identifier the backend should be given.
 *
 * A TypeScript door is asked for by its DIRECTORY, an Amiga door by its
 * command. The backend now prefers whatever is registered either way (see
 * amigaDoorManager.deleteDoor), but passing the name it can actually resolve
 * keeps the log readable.
 */
export function deleteIdentifierFor(door: DeletableDoor): { id: string; isTS: boolean } {
  const isTS = ['TS', 'typescript', 'SDK'].includes(door.type);
  const id = isTS
    ? (door.location?.replace(/^Doors[\\/]/i, '').split(/[\\/]/)[0] || door.command)
    : door.command;
  return { id, isTS };
}

export async function performDoorDelete<T extends DeletableDoor>(
  deps: DeleteDoorDeps<T>,
): Promise<void> {
  const { door: d, bbs } = deps;
  const { id, isTS } = deleteIdentifierFor(d);

  // The delete used to run behind a single status line, and the backend did
  // its filesystem work synchronously - so the board froze and the sysop
  // watched a still screen with no idea how far along it was. The work is
  // asynchronous now; this shows each stage as it happens, in the same panel
  // an install reports into.
  const log = new ActionLog(`Deleting ${d.name}`);
  const paint = (extra = '') => {
    deps.setInfo(log.render() + extra);
    deps.render();
  };

  deps.setStatus(`Deleting ${d.name}...`, 'yellow', 30000);
  log.ok(`${d.command}: ${isTS ? `Doors/${id}` : `${id} (${d.type})`}`);
  paint('\n\n{yellow-fg}Working...{/yellow-fg}\n');

  try {
    // Each step is painted AS it happens. DOORMAN runs in the backend's own
    // process, so this callback is a direct call from the delete - and
    // because the filesystem work between steps is asynchronous, the repaint
    // actually reaches the terminal instead of arriving as one finished log
    // after the pause.
    const onStep = (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => {
      log.add(step.kind, step.text);
      paint('\n\n{yellow-fg}Working...{/yellow-fg}\n');
    };

    const result = await bbs.deleteDoor(id, isTS, onStep);

    if (!result.success) {
      log.fail(String(result.message ?? 'unknown error'));
      deps.setStatus(`Failed: ${result.message}`, 'red', 8000);
      const view = deleteOutcomeView({
        success: false,
        stillListed: true,
        command: sanitizeForTags(d.command),
        message: sanitizeForTags(String(result.message ?? '')),
      });
      if (view.kind === 'message') paint(view.text);
      console.log(`[DOORMAN] delete failed: ${d.name}: ${result.message}`);
      return;
    }

    // Belt and braces: deleteDoor refreshes backend caches itself, but a
    // stale registry here left deleted doors visible with no feedback
    // (2026-08-15). Refresh again from our side, re-fetch, and confirm.
    log.ok('reloading the door registry');
    paint('\n\n{yellow-fg}Reloading...{/yellow-fg}\n');
    await deps.refreshRegistry();
    const doors = await deps.fetchDoors();
    deps.onDoorsChanged(doors, Math.max(0, deps.selectedIndex - 1));

    // The door is only deleted when it has left the list the sysop is
    // looking at. Saying "deleted" while it is still on screen is the exact
    // report this check came from.
    const stillListed = doors.some(other => other.command === d.command);
    const view = deleteOutcomeView({
      success: true,
      stillListed,
      command: sanitizeForTags(d.command),
    });

    if (view.kind === 'message') {
      log.fail(`${d.command} is still registered - the BBS still lists it`);
      deps.setStatus(`${d.name} still listed`, 'red', 8000);
      paint(view.text);
      console.log(`[DOORMAN] delete incomplete: ${d.command} still in the registry after delete`);
      return;
    }

    // It worked, so the panel goes back to describing the door the list has
    // moved to - the log panel and the header flash carry the outcome.
    // Painting "Deleted" here left the panel describing a door that was gone
    // until the sysop moved the cursor.
    log.ok(`${d.command} is gone from the door list`);
    deps.setStatus(`${d.name} deleted`, 'green', 8000);
    deps.showSelectedDoor();
  } catch (e: any) {
    log.fail(e?.message ?? String(e));
    deps.setStatus(`Error: ${e?.message ?? e}`, 'red', 8000);
    paint('\n\n{red-fg}Delete failed{/red-fg}\n');
    console.log(`[DOORMAN] delete error: ${d.name}: ${e?.message ?? e}`);
  }
}
