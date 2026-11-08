/**
 * REACHABILITY (A8 J2): a hub board_joined event reaches the room member's
 * chat log as one system line through the real bridge poll path.
 */
import { EventEmitter } from 'events';
import { onCaller, setLegacyChatGate } from '../../src/server/socket-guard';
import { setSession } from '../../src/server/session-manager';
import {
  setChatFederationDependencies,
  handleFederatedChatEvent,
  closeAllFederatedChats,
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

describe('federated livechat board_joined', () => {
  let stub: ChatStub;
  beforeAll(async () => {
    stub = await startChatStub();
  });
  afterAll(async () => {
    await closeAllFederatedChats();
    await stub.close();
    setLegacyChatGate(null);
    clearRoomMembers();
  });

  it('shows one system line naming the board', async () => {
    setChatFederationDependencies({
      getConfig: () => ({ livechat_federated: true, achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never),
      pollWaitSeconds: 1,
    });
    setLegacyChatGate((socket, session, event, data) => handleFederatedChatEvent(socket as never, session, event, data));
    const member = roomMember(9, { user: { id: 9, username: 'caller', secLevel: 10 }, socketId: 'sock9' });
    setSession('sock9', member.session);
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'sock9';
    onCaller(socket as never, 'room:join', jest.fn());
    socket.emit('room:join', { roomName: 'Lobby' });
    await until(() => stub.count('POST', '/rooms/room1/join') === 1);

    stub.push({ type: 'board_joined', room: '', user: '', text: 'Night Owl BBS' });
    await until(() => member.of('chat:message').length >= 1);
    const sys = member.of('chat:message').filter((m: any) => m.type === 'system');
    expect(sys).toHaveLength(1);
    expect((sys[0] as any).message).toBe('Night Owl BBS joined the federation');
  });
});
