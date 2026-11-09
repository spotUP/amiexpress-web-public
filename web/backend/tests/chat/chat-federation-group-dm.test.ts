/**
 * REACHABILITY (LiveChat parity: group DM): the TS `chat:group-dm` socket event
 * reaches the hub as POST /dm-group with this board's @BOARD suffix on bare
 * names, and a hub `dm` event on a `dg` thread comes back as `chat:dm` with
 * isGroup, the other members (from dm.txt) and a sent/received direction.
 */
import { EventEmitter } from 'events';
import { setSession } from '../../src/server/session-manager';
import {
  setChatFederationDependencies,
  handleFederatedChatEvent,
  closeAllFederatedChats,
  FEDERATED_EVENTS,
} from '../../src/services/chat-federation/chat-session-bridge';
import { roomMember, clearRoomMembers } from '../helpers/room-members';
import { startChatStub, ChatStub } from '../helpers/chat-stub-server';

async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condition not reached');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('federated livechat group DM', () => {
  let stub: ChatStub;
  beforeAll(async () => { stub = await startChatStub(); });
  afterAll(async () => {
    await closeAllFederatedChats();
    await stub.close();
    clearRoomMembers();
  });

  it('forwards chat:group-dm to /dm-group and maps a dg event to chat:dm isGroup', async () => {
    setChatFederationDependencies({
      getConfig: () => ({ livechat_federated: true, achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never),
      pollWaitSeconds: 1,
    });
    expect(FEDERATED_EVENTS.has('chat:group-dm')).toBe(true);
    const member = roomMember(11, { user: { id: 11, username: 'caller', secLevel: 10 }, socketId: 'sock11' });
    setSession('sock11', member.session);
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'sock11';
    handleFederatedChatEvent(socket as never, member.session, 'room:join', { roomName: 'Lobby' });
    await until(() => stub.count('POST', '/rooms/room1/join') === 1);

    handleFederatedChatEvent(socket as never, member.session, 'chat:group-dm', { participants: ['@bob', 'carol@OTHER'], message: 'hello trio' });
    await until(() => stub.count('POST', '/dm-group') === 1);
    const body = JSON.parse(stub.calls.filter((c) => c.path === '/dm-group')[0].body);
    expect(body).toMatchObject({ participants: ['bob@TEST', 'carol@OTHER'], content: 'hello trio' });

    stub.push({ type: 'dm', room: 'dgstub000001', user: 'bob@OTHER', ref: 'd9', text: 'hi all' });
    await until(() => member.of('chat:dm').length === 1);
    expect(member.of('chat:dm')[0]).toMatchObject({
      isGroup: true, direction: 'received', from: 'bob@OTHER', message: 'hi all', threadId: 'dgstub000001',
      participants: ['bob@OTHER', 'carol@OTHER'],
    });
    stub.push({ type: 'dm', room: 'dgstub000001', user: 'caller@TEST', ref: 'd10', text: 'mine' });
    await until(() => member.of('chat:dm').length === 2);
    expect(member.of('chat:dm')[1]).toMatchObject({ isGroup: true, direction: 'sent', participants: ['bob@OTHER', 'carol@OTHER'] });
  });
});
