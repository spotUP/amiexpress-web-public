/**
 * Raw room ANSI never lands on a door's screen.
 *
 * Reported live with two users in LiveChat: the same message on screen
 * TWICE, in two colours, merged into one row - "messages are still not
 * ending up on their own lines".
 *
 * The door drew each message from the structured chat:message event, and the
 * backend ALSO broadcast the same message as raw ANSI, which the terminal
 * wrote at wherever the cursor happened to be - straight over the door's
 * blessed UI. Only OTHER people's messages doubled, because the sender is
 * excluded from that broadcast, which is exactly the asymmetry that was
 * reported.
 *
 * There has always been a guard against this. It looked the member's session
 * up with `sessions.get(socketId)` - and that map is keyed by NODE ID, so
 * the lookup always missed and the guard never fired once.
 */

import { doorOwnsTerminal } from '../../src/utils/door-owns-terminal';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { setGroupChatDependencies, handleRoomList } from '../../src/handlers/chat/group-chat.handler';

// The broadcast's own behaviour - a door member skipped, the sender left out,
// every transport reached - is driven in tests/chat/group-chat-door-terminal.test.ts
// since room members became sessions (src/server/session-rooms.ts, 2026-09-28).
// The source pins that stood here named socket.io lookups that no longer exist.

describe('what counts as a door owning the terminal', () => {
  // Behaviour, not source text: the predicate moved to
  // utils/door-owns-terminal.ts so the restart-notice broadcast could share it.
  it('recognises a door that is actually running', () => {
    expect(doorOwnsTerminal({ clientDoorActive: true } as any)).toBe(true);
    expect(doorOwnsTerminal({ doorInputHandler: () => {} } as any)).toBe(true);
    expect(doorOwnsTerminal({ subState: LoggedOnSubState.DOOR_RUNNING } as any)).toBe(true);
  });

  it('does not count a door that has already exited', () => {
    // currentDoorName is attribution, not liveness - door.handler.ts sets it
    // so a door's events carry its registered command, and no exit path
    // clears it. Treating it as "a door is running" made every session that
    // ever ran FRONTEND at the login screen door-owned for ever, which
    // silently suppressed room ANSI for that session from then on.
    expect(doorOwnsTerminal({
      currentDoorName: 'FRONTEND',
      subState: LoggedOnSubState.DISPLAY_MENU,
    } as any)).toBe(false);
  });

  it('an idle session owns its own terminal', () => {
    expect(doorOwnsTerminal({} as any)).toBe(false);
  });
});

// emitToTerminal is private; ROOM LIST is its simplest caller - a structured
// room:list event for doors, then the terminal copy through emitToTerminal.
describe('emitToTerminal, through the real ROOM LIST', () => {
  function listRooms(session: Record<string, unknown>) {
    setGroupChatDependencies({
      db: { listChatRooms: async () => [] },
      sessions: new Map(),
      io: {},
    } as never);
    const emitted: Array<[string, unknown]> = [];
    const socket = { id: 's1', emit: (e: string, d: unknown) => { emitted.push([e, d]); return true; } };
    return handleRoomList(socket as never, { user: { id: 1 }, ...session } as never).then(() => emitted);
  }

  it('emits instead of calling itself', async () => {
    // It called emitToTerminal(socket, session, data) - itself - so any
    // session without a door recursed until the stack gave out (the catch
    // below it would swallow the RangeError, so the proof is the output).
    // Door sessions returned on the line above, which is the only reason
    // this was survivable.
    const emitted = await listRooms({});
    const ansi = emitted.filter(([e]) => e === 'ansi-output').map(([, d]) => String(d)).join('');
    expect(ansi).toContain('Available Chat Rooms');
    expect(ansi).toContain('No rooms available');
  });

  it('still says nothing while a door owns the screen', async () => {
    const emitted = await listRooms({ clientDoorActive: true });
    expect(emitted.filter(([e]) => e === 'ansi-output')).toEqual([]);
    // The door still gets what it renders from.
    expect(emitted.map(([e]) => e)).toContain('room:list');
  });
});
