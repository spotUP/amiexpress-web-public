/**
 * A reply is a room message with a parent. Live, "/reply" sent nothing and
 * "/thread" was lost in the door wrapper. handleRoomMessage takes replyTo, saves
 * thread_id, and the broadcast carries { id, username, content } of the parent.
 * sendChatRoomMessage (what the door wrapper's room:message route calls) must
 * pass clientId and replyTo through, or room:message:ack never fires for doors.
 */

import { setGroupChatDependencies, handleRoomMessage } from '../../src/handlers/chat/group-chat.handler';
import { sendChatRoomMessage } from '../../src/doors/door-chat-rooms';
import { roomMember, clearRoomMembers } from '../helpers/room-members';

function setup(parent: unknown) {
  const other = roomMember(2, { user: { id: 2, username: 'user2' }, currentRoomId: 7, state: 'LOGGED_ON', subState: 'MENU', clientDoorActive: true }, 'other');
  const saved: any[] = [];
  const counted: number[] = [];
  const db = {
    isUserMuted: async () => false,
    getChatRoom: async () => ({ id: 7, room_name: 'general', is_moderated: 0 }),
    getMessageById: async () => parent,
    saveChatRoomMessage: async (m: any) => { saved.push(m); return 99; },
    updateThreadReplyCount: async (id: number) => { counted.push(id); },
  };
  setGroupChatDependencies({ db, sessions: new Map(), io: {} } as never);
  const emits: Array<{ event: string; payload: any }> = [];
  const socket = { id: 'sender', emit: (event: string, payload: unknown) => emits.push({ event, payload }) } as never;
  const sender = { user: { id: 1, username: 'user1' }, currentRoomId: 7, currentRoomName: 'general', state: 'LOGGED_ON', subState: 'MENU' };
  return { other, saved, counted, emits, socket, sender };
}

describe('reply is a room message', () => {
  afterEach(() => clearRoomMembers());

  it('saves thread_id, counts the reply and broadcasts the parent', async () => {
    const env = setup({ id: 12, room_id: 7, sender_username: 'bob', message: 'x'.repeat(80), deleted: 0 });
    await handleRoomMessage(env.socket, env.sender as never, { message: 'answer', replyTo: '12', clientId: 'c-1' });

    expect(env.saved[0].threadId).toBe(12);
    expect(env.counted).toEqual([12]);
    const live = env.other.of('chat:message') as any[];
    expect(live[0].replyTo).toEqual({ id: '12', username: 'bob', content: 'x'.repeat(60) });
    expect(env.emits.find(e => e.event === 'room:message:ack')?.payload).toEqual({ clientId: 'c-1', id: '99' });
  });

  it('rejects a parent from another room, a deleted one and a non-number', async () => {
    for (const [parent, replyTo] of [
      [{ id: 12, room_id: 8, sender_username: 'bob', message: 'hi' }, '12'],
      [{ id: 12, room_id: 7, sender_username: 'bob', message: 'hi', deleted: 1 }, '12'],
      [undefined, '12'],
      [{ id: 12, room_id: 7, sender_username: 'bob', message: 'hi' }, '12-345'],
    ] as Array<[unknown, string]>) {
      const env = setup(parent);
      await handleRoomMessage(env.socket, env.sender as never, { message: 'answer', replyTo });
      expect(env.saved).toEqual([]);
      expect(env.emits.some(e => e.event === 'room:error')).toBe(true);
    }
  });

  it('the door API path passes clientId and replyTo, so the sender is acked', async () => {
    const env = setup({ id: 12, room_id: 7, sender_username: 'bob', message: 'hi', deleted: 0 });
    await sendChatRoomMessage(env.socket, env.sender as never, 'answer', { clientId: 'c-9', replyTo: 12 });
    expect(env.saved[0].threadId).toBe(12);
    expect(env.emits.find(e => e.event === 'room:message:ack')?.payload).toEqual({ clientId: 'c-9', id: '99' });
  });
});
