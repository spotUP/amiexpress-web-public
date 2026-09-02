/**
 * The chat-only auto-launch of LiveChat: the web /chat/ page connects with
 * ?chatOnly=true (with or without an SSO token) and the board opens the
 * LiveChat door for it instead of the login sequence.
 *
 * EXTRACTED from index.ts's two connection-handler branches (the SSO one and
 * the anonymous one). index.ts boots a server on import, so nothing in its
 * listener bodies can be driven by a test - the same reason
 * xim/screen-width.util.ts and server/admin-socket.ts exist.
 *
 * What was wrong: both branches handed executeDoor a hand-built Door
 * literal. The MIN_COLUMNS gate inside executeDoor DID run on it, but it
 * judged a door that carried no registration at all - whatever
 * Commands/BBSCmd/LIVECHAT.info declares (MIN_COLUMNS, C64_ADAPT) never
 * reached the gate on this path, so a PETSCII chat caller stayed refused
 * after the sysop marked the door, and the Enter path and the auto-launch
 * could answer differently for the same door. initializeDoors() resolves
 * MIN_COLUMNS / C64_ADAPT ONCE onto the registered Door
 * (door.handler.ts, `Door.minColumns` / `Door.c64Adapt`) and the gate reads
 * those fields first; this takes exactly those two off the registered Door
 * and nothing else. The literal's own fields (name, command, type, path, no
 * toolTypes) are unchanged, so an ANSI caller's launch is byte-for-byte what
 * it was: the registered record's PRELOADER=YES, for one, must not start
 * painting a preloader at chat callers because of a gate fix.
 *
 * There is deliberately NO predicate here. doorOpensForC64 / sessionColumns /
 * resolveDoorMinColumns are asked by executeDoor's gate clause, once, for
 * every launch on the board; this module only makes sure the gate is asked
 * about the door the sysop actually registered.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import type { Door } from '../handlers/door.handler';

/** The command LIVECHAT.info registers; matched the way the Enter path matches (case-insensitively). */
export const LIVECHAT_COMMAND = 'LIVECHAT';

/**
 * The Door the chat-only launch hands executeDoor.
 *
 * `registered` is the board's door registry (getDoors()); the LiveChat entry
 * is found by command the way command.handler's Enter dispatch finds it.
 * When the board has no LIVECHAT registration the literal launches exactly
 * as it always did, and the gate applies its closed default to it.
 */
export function chatOnlyLiveChatDoor(registered: readonly Door[]): Door {
  const registration = registered.find(
    (d) => String(d.command ?? '').toLowerCase() === LIVECHAT_COMMAND.toLowerCase(),
  );
  // The exact object index.ts always launched - five fields, nothing added
  // (executeDoor reads none of Door's other required fields; the door list
  // does, and this door is never in it).
  const door = {
    id: 'livechat',
    name: 'LiveChat',
    command: 'livechat',
    type: 'typescript',
    path: 'Doors/livechat',
  } as Door;
  if (registration?.minColumns !== undefined) door.minColumns = registration.minColumns;
  if (registration?.c64Adapt !== undefined) door.c64Adapt = registration.c64Adapt;
  return door;
}

/**
 * Open LiveChat for a chat-only socket through the board's one door entry
 * point, executeDoor - gate included.
 *
 * door.handler is required lazily, as index.ts always did at these two
 * sites: door.handler imports BBSState from index.ts, and index.ts imports
 * this module, so a static import here would close that cycle during boot.
 */
export async function launchChatOnlyLiveChat(socket: Socket, session: BBSSession): Promise<void> {
  const { executeDoor, getDoors } = require('../handlers/door.handler') as typeof import('../handlers/door.handler');
  await executeDoor(socket, session, chatOnlyLiveChatDoor(getDoors()));
}
