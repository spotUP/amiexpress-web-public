/**
 * One id per group-chat message: the DB row id. The live broadcast (chat:message)
 * carries it as a string, as room:joined history does, and the sender, who is
 * excluded from the broadcast, is told it with room:message:ack { clientId, id }.
 */

import { setGroupChatDependencies, handleRoomMessage } from '../../src/handlers/chat/group-chat.handler';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

function setup(savedId: number) {
  const other = roomMember(2, { user: { id: 2, username: 'user2' }, currentRoomId: 7, state: 'LOGGED_ON', subState: 'MENU', clientDoorActive: true }, 'other');
  const db = {
    isUserMuted: async () => false,
    getChatRoom: async () => ({ id: 7, room_name: 'general', is_moderated: 0 }),
    saveChatRoomMessage: async () => savedId,
  };
  setGroupChatDependencies({ db, sessions: new Map(), io: {} } as never);
  const acks: Array<{ event: string; payload: unknown }> = [];
  const socket = { id: 'sender', emit: (event: string, payload: unknown) => acks.push({ event, payload }) } as never;
  const sender = { user: { id: 1, username: 'user1' }, currentRoomId: 7, currentRoomName: 'general', state: 'LOGGED_ON', subState: 'MENU' };
  return { other, acks, socket, sender };
}

describe('group chat message id', () => {
  afterEach(() => clearRoomMembers());

  it('broadcasts the saved DB id and acks the sender with it', async () => {
    const env = setup(4242);
    await handleRoomMessage(env.socket, env.sender as never, { message: 'hello', clientId: 'c-1' });

    const live = env.other.of('chat:message') as Array<{ id: string }>;
    expect(live.length).toBe(1);
    expect(live[0].id).toBe('4242');
    expect(env.acks.filter(a => a.event === 'room:message:ack')).toEqual([
      { event: 'room:message:ack', payload: { clientId: 'c-1', id: '4242' } },
    ]);
  });

  it('sends no ack when the client gave no clientId', async () => {
    const env = setup(5);
    await handleRoomMessage(env.socket, env.sender as never, { message: 'hello' });
    expect(env.acks.filter(a => a.event === 'room:message:ack')).toEqual([]);
  });
});
