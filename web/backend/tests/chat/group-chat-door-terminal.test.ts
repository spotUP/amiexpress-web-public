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
import { roomMember, clearRoomMembers, type Member } from '../helpers/room-members';

/**
 * The room's members are sessions standing in room 7 (src/server/session-rooms.ts),
 * each reached through its own emitter - so each member here records what it
 * was sent, by name.
 */
function environment(membersByName: Record<string, Record<string, unknown>>) {
  const members: Record<string, Member> = {};
  Object.entries(membersByName).forEach(([name, session], index) => {
    members[name] = roomMember(index + 1, session, name);
  });

  // Only what handleRoomMessage actually reaches for.
  const db = {
    isUserMuted: async () => false,
    getChatRoom: async () => ({ id: 7, room_name: 'general', is_moderated: 0 }),
    saveChatRoomMessage: async () => undefined,
  };

  setGroupChatDependencies({ db, sessions: new Map(), io: {} } as never);
  return { members };
}

function plainUser(id: number): Record<string, unknown> {
  return { user: { id, username: `user${id}` }, currentRoomId: 7, state: 'LOGGED_ON', subState: 'MENU' };
}

function doorUser(id: number): Record<string, unknown> {
  return { ...plainUser(id), clientDoorActive: true };
}

describe('chat output while a door owns the terminal', () => {
  afterEach(() => clearRoomMembers());

  it('sends room ANSI to plain terminals but not to a door', async () => {
    const env = environment({ plain: plainUser(1), door: doorUser(2) });
    const socket = { id: 'sender', emit: () => undefined } as never;

    await handleRoomMessage(socket, plainUser(3) as never, { message: 'hello' });

    expect(env.members.plain.of('ansi-output').length).toBeGreaterThan(0);
    expect(env.members.door.of('ansi-output')).toEqual([]);
  });

  it('does not send the sender his own line back', async () => {
    const env = environment({ sender: plainUser(1), other: plainUser(2) });
    // `socket.id` is the sender's emitter id, whatever his transport.
    const socket = { id: 'sender', emit: () => undefined } as never;

    await handleRoomMessage(socket, env.members.sender.session as never, { message: 'hello' });

    expect(env.members.sender.of('ansi-output')).toEqual([]);
    expect(env.members.sender.of('chat:message')).toEqual([]);
    expect(env.members.other.of('ansi-output').length).toBeGreaterThan(0);
  });

  it('still gives the door the structured event it renders from', async () => {
    const env = environment({ door: doorUser(2) });
    const socket = { id: 'sender', emit: () => undefined } as never;

    await handleRoomMessage(socket, plainUser(3) as never, { message: 'hello' });

    expect(env.members.door.of('chat:message').length).toBe(1);
  });
});
