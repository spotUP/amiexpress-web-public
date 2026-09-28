/**
 * Joining a room announces it once; leaving announces it once, to the others.
 *
 * Same screenshot as the doubled login events: every join and leave appeared
 * twice in the chat log -
 *
 *   *** infant joined the room ***
 *   [21:51] infant joined
 *   *** infant joined the room ***
 *   [21:51] infant joined
 *
 * handleRoomJoin emitted room:user-joined twice: once to the room except the
 * joiner, and then again to the WHOLE room "for SDK doors". This used to be
 * pinned by counting emit lines in the source; the members are sessions now
 * (src/server/session-rooms.ts), so it is counted where it lands - in each
 * member's own emitter, whatever his transport.
 */
process.env.SKIP_DB_INIT = '1';

import { setGroupChatDependencies, handleRoomJoin, handleRoomLeave } from '../../src/handlers/chat/group-chat.handler';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

const ROOM = { room_id: 'r7', room_name: 'general', topic: 'hi', is_public: 1, is_invite_only: 0, password: null, max_users: 100 };

const db: any = {
  getChatRoom: async () => ROOM,
  getChatRoomByName: async () => ROOM,
  getRoomMembers: async () => [],
  getRoomMemberCount: async () => 1,
  isUserInRoom: async () => false,
  hasInvite: async () => false,
  joinChatRoom: async () => undefined,
  revokeInvite: async () => undefined,
  getChatRoomHistory: async () => [],
  leaveChatRoom: async () => undefined,
};

beforeEach(() => setGroupChatDependencies({ db, sessions: new Map(), io: {} } as never));
afterEach(() => clearRoomMembers());

describe('room membership announcements', () => {
  it('announces a join once to everyone in the room, the joiner included', async () => {
    const already = roomMember(1, { user: { id: 1, username: 'spot' }, currentRoomId: 'r7' });
    const joiner = roomMember(2, { user: { id: 2, username: 'infant' } });

    await handleRoomJoin({ id: 'member-2', emit: () => true } as never, joiner.session, { roomId: 'r7' });

    expect(already.of('room:user-joined')).toHaveLength(1);
    expect(joiner.of('room:user-joined')).toHaveLength(1);
  });

  it('announces a leave once, to the others and not to the one leaving', async () => {
    const staying = roomMember(1, { user: { id: 1, username: 'spot' }, currentRoomId: 'r7', currentRoomName: 'general' });
    const leaving = roomMember(2, { user: { id: 2, username: 'infant' }, currentRoomId: 'r7', currentRoomName: 'general' });

    await handleRoomLeave({ id: 'member-2', emit: () => true } as never, leaving.session);

    expect(staying.of('room:user-left')).toHaveLength(1);
    expect(leaving.of('room:user-left')).toHaveLength(0);
  });
});
