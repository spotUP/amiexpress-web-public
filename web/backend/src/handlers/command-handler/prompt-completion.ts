/**
 * Ghost-text completion at the main prompt, supplied by an installed door.
 *
 * "Just a discreet auto fill/complete with dark grey that you can tab to
 * complete words in the prompt", covering every door and every internal
 * command, at the main prompt and nowhere else.
 *
 * ## Why a door supplies it
 *
 * So it is optional. Nothing here decides what to complete: it asks
 * whichever installed door declares `PROMPTCOMPLETE=YES` in its .info, and
 * asks nobody when none is installed - in which case every function here
 * returns "no suggestion" and the prompt behaves exactly as it did before.
 * Deleting the door turns the feature off, which is what installing and
 * deleting a door should mean.
 *
 * ## Why this cannot break a 68K door
 *
 * A running door owns the session's input: socket-handlers routes every
 * keystroke to `session.doorInputHandler` and returns before the BBS
 * command path is reached at all. Nothing here is on that route. This code
 * runs only in READ_COMMAND, which by definition is the BBS's own prompt
 * with no door running.
 *
 * ## Why it is not the same on a real Amiga
 *
 * It cannot be a door there. `express.e:28620` reads the whole line with
 * `lineInput()` and only reaches a door at `processCommand`
 * (`express.e:28647`), so a door is handed a finished command and never a
 * keystroke. The Amiga version is a change to `lineInput` itself, where
 * TAB is unused today and so would be additive.
 */
import * as path from 'path';

import { commandCache } from '../command-execution.handler';
import { INTERNAL_COMMAND_NAMES } from './internal-command-names';

/** What a completer door has to export. Names in, text out; no BBS access. */
export interface PromptCompleter {
  ghost(buffer: string, names: readonly string[]): string;
  complete(buffer: string, names: readonly string[]): string;
}

/** The tooltype a door sets to declare itself the prompt's completer. */
export const COMPLETER_TOOLTYPE = 'PROMPTCOMPLETE';

/**
 * Resolved completer, or null when none is installed. `undefined` means
 * "not looked yet"; null means "looked, found nothing" and is cached too,
 * so a board without the door does not re-scan on every keystroke.
 */
let cached: PromptCompleter | null | undefined;

/** Drop the cache. Called when the command cache is rebuilt, and by tests. */
export function resetPromptCompleter(): void {
  cached = undefined;
}

/**
 * The door that declares itself the completer, if it is installed.
 *
 * Read from `commandCache`, which is what dispatch itself reads - so a
 * door that has been deleted or whose registration is dead is not found
 * here either.
 */
function findCompleterDoor(): { location: string } | null {
  for (const cmd of commandCache.bbscmd.values()) {
    const flag = cmd.toolTypes?.[COMPLETER_TOOLTYPE];
    if (flag && /^(YES|1|TRUE)$/i.test(flag.trim())) {
      return { location: cmd.location };
    }
  }
  return null;
}

/**
 * Load the completer once. Failure is not an error worth interrupting a
 * keystroke for: a door that will not import means no suggestions, not a
 * broken prompt, so this reports and returns null.
 */
async function loadCompleter(bbsRoot: string): Promise<PromptCompleter | null> {
  if (cached !== undefined) return cached;

  const door = findCompleterDoor();
  if (!door) {
    cached = null;
    return null;
  }

  try {
    const dir = path.isAbsolute(door.location)
      ? door.location
      : path.join(bbsRoot, door.location);
    const entry = dir.endsWith('.js') ? dir : path.join(dir, 'dist', 'index.js');
    const mod: any = await import(`file://${entry}`);
    const completer: PromptCompleter | undefined =
      mod?.promptCompleter ?? mod?.default?.promptCompleter;

    if (!completer || typeof completer.ghost !== 'function') {
      console.warn(`[PromptCompletion] ${entry} does not export promptCompleter; ignoring`);
      cached = null;
      return null;
    }
    cached = completer;
    return completer;
  } catch (error: any) {
    console.warn(`[PromptCompletion] completer door failed to load: ${error?.message}`);
    cached = null;
    return null;
  }
}

/**
 * Every name the prompt can complete to: every door and command the board
 * has registered, plus the internal commands, which are not files at all
 * and so appear in no directory.
 *
 * Taken from `commandCache` because that is what dispatch reads - anything
 * offered here is something that would actually run. Sorted so the offer is
 * stable between keystrokes rather than following map insertion order.
 */
export function promptCommandNames(): string[] {
  const names = new Set<string>();
  for (const name of commandCache.bbscmd.keys()) names.add(name.toUpperCase());
  for (const name of INTERNAL_COMMAND_NAMES) names.add(name.toUpperCase());
  return [...names].sort();
}

/** The grey tail for what has been typed, or '' when there is nothing. */
export async function promptGhost(bbsRoot: string, buffer: string): Promise<string> {
  if (!buffer) return '';
  const completer = await loadCompleter(bbsRoot);
  if (!completer) return '';
  try {
    return completer.ghost(buffer, promptCommandNames()) || '';
  } catch {
    return '';
  }
}

/** The line after TAB, or the line unchanged. */
export async function promptComplete(bbsRoot: string, buffer: string): Promise<string> {
  const completer = await loadCompleter(bbsRoot);
  if (!completer) return buffer;
  try {
    return completer.complete(buffer, promptCommandNames()) || buffer;
  } catch {
    return buffer;
  }
}

/**
 * Draw the ghost after the cursor and put the cursor back where it was.
 *
 * `ESC[K` first because the previous suggestion may have been longer than
 * this one; nothing else is ever to the right of the cursor on the prompt
 * line, so erasing to end-of-line is safe here and is far fewer bytes than
 * painting spaces.
 *
 * Dark grey is `ESC[90m` - the bright-black the sysop asked for. It has to
 * read as an offer rather than as text that was typed.
 */
export function renderGhost(ghost: string): string {
  if (!ghost) return '\x1b[K';
  return `\x1b[K\x1b[90m${ghost}\x1b[0m\x1b[${ghost.length}D`;
}
