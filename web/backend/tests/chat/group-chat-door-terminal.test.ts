/**
 * The BBS must not paint its own chat over a door's screen.
 *
 * Reported live 2026-08-25 with a paste showing TWO complete UIs stacked on
 * one 80x25 terminal: the LiveChat door's panel layout, and underneath it
 * the BBS's own ANSI chat room ("-= Chat Room: ... =-", topic, message
 * lines, a second status bar and input box).
 *
 * Both were real. handleRoomJoin clears the screen and paints a room view,
 * and room broadcasts went to every member with io.to(room) - including
 * anyone sitting in the door. Those clients already receive the structured
 * chat:message event and render it themselves, so the ANSI is duplication.
 */

import { setGroupChatDependencies, handleRoomMessage } from '../../src/handlers/chat/group-chat.handler';
import { setSession, deleteSession } from '../../src/server/session-manager';

interface Emitted { target: string; event: string; payload: unknown }

function environment(sessionsById: Record<string, Record<string, unknown>>) {
  const emitted: Emitted[] = [];
  const members = new Set(Object.keys(sessionsById));

  const io = {
    sockets: { adapter: { rooms: new Map([['room:7', members]]) } },
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ target, event, payload }),
      except: () => ({
        emit: (event: string, payload: unknown) => emitted.push({ target, event, payload }),
      }),
    }),
  };

  const sessions = new Map<string, unknown>(Object.entries(sessionsById));

  // Register each member the way the BBS does, through session-manager. The
  // guard resolves members with getSessionBySocketId, which reads
  // session-manager's own maps - a map injected here is never consulted, so
  // every member used to come back undefined and the guard could not fire
  // whatever the predicate said.
  Object.entries(sessionsById).forEach(([socketId, session], index) => {
    (session as Record<string, unknown>).nodeId = index + 1;
    setSession(socketId, session as never);
  });

  // Only what handleRoomMessage actually reaches for.
  const db = {
    isUserMuted: async () => false,
    getChatRoom: async () => ({ id: 7, room_name: 'general', is_moderated: 0 }),
    saveChatRoomMessage: async () => undefined,
  };

  setGroupChatDependencies({ db, sessions, io } as never);
  return { emitted, socketIds: Object.keys(sessionsById) };
}

function plainUser(id: number): Record<string, unknown> {
  return { user: { id, username: `user${id}` }, currentRoomId: 7, state: 'LOGGED_ON', subState: 'MENU' };
}

function doorUser(id: number): Record<string, unknown> {
  return { ...plainUser(id), clientDoorActive: true };
}

describe('chat output while a door owns the terminal', () => {
  const registered: string[] = [];
  afterEach(() => {
    registered.splice(0).forEach(deleteSession);
  });

  it('sends room ANSI to plain terminals but not to a door', async () => {
    const env = environment({ plain: plainUser(1), door: doorUser(2) });
    registered.push(...env.socketIds);
    const socket = { id: 'sender', emit: () => undefined } as never;

    await handleRoomMessage(socket, plainUser(3) as never, { message: 'hello' });

    const ansiTargets = env.emitted.filter(e => e.event === 'ansi-output').map(e => e.target);
    expect(ansiTargets).toContain('plain');
    expect(ansiTargets).not.toContain('door');
  });

  it('still gives the door the structured event it renders from', async () => {
    const env = environment({ door: doorUser(2) });
    registered.push(...env.socketIds);
    const socket = { id: 'sender', emit: () => undefined } as never;

    await handleRoomMessage(socket, plainUser(3) as never, { message: 'hello' });

    expect(env.emitted.some(e => e.event === 'chat:message')).toBe(true);
  });
});
