/**
 * REACHABILITY (LiveChat B4): presence, whois and ignore socket events reach
 * the door server's /chat/v1 endpoints through the real onCaller gate, and the
 * server's answers come back as chat:profile, chat:ignore-list and an incoming
 * chat:presence event. The stub counts every call (sentinel).
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

describe('federated livechat presence, whois and ignore', () => {
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

  it('each event reaches its endpoint and the reply returns to the caller', async () => {
    setChatFederationDependencies({
      getConfig: () => ({ livechat_federated: true, achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never),
      pollWaitSeconds: 1,
    });
    setLegacyChatGate((socket, session, event, data) => handleFederatedChatEvent(socket as never, session, event, data));
    const member = roomMember(8, { user: { id: 8, username: 'caller', secLevel: 10 }, socketId: 'sock8' });
    setSession('sock8', member.session);
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'sock8';
    const legacy = jest.fn();
    // (A real socket's emit goes to the client; this stand-in loops it back, so the reply event is not registered inbound.) Direct replies go to the caller's own socket; broadcasts go to the room member.
    const replies: Record<string, unknown[]> = { 'chat:profile': [], 'chat:ignore-list': [] };
    for (const ev of Object.keys(replies)) socket.on(ev, (d: unknown) => replies[ev].push(d));
    for (const ev of ['room:join', 'chat:presence', 'chat:whois', 'chat:ignore', 'chat:unignore']) onCaller(socket as never, ev, legacy);

    socket.emit('room:join', { roomName: 'Lobby' });
    await until(() => stub.count('POST', '/rooms/room1/join') === 1);

    socket.emit('chat:presence', { status: 'away', custom: 'at lunch' });
    await until(() => stub.count('PUT', '/presence') === 1);
    expect(JSON.parse(stub.calls.find((c) => c.path === '/presence')!.body)).toMatchObject({ status: 'away', text: 'at lunch' });
    socket.emit('chat:presence', { status: 'online' });
    await until(() => stub.count('DELETE', '/presence') === 1);

    socket.emit('chat:whois', { username: 'bob' });
    await until(() => replies['chat:profile'].length === 1);
    expect(stub.count('GET', '/users/bob%40TEST/profile.txt')).toBe(1);
    expect(replies['chat:profile'][0]).toMatchObject({ found: true, user: 'bob@TEST' });

    socket.emit('chat:ignore', { user: 'bob' });
    await until(() => stub.count('POST', '/ignores') === 1);
    await until(() => replies['chat:ignore-list'].length === 1);
    expect(replies['chat:ignore-list'][0]).toMatchObject({ users: ['bob@TEST'] });
    socket.emit('chat:unignore', { user: 'bob' });
    await until(() => stub.count('DELETE', '/ignores/') === 1);
    await until(() => replies['chat:ignore-list'].length === 2);
    expect(replies['chat:ignore-list'][1]).toMatchObject({ users: [] });

    stub.push({ type: 'presence', room: 'room1', user: 'bob@TEST', text: 'away!at lunch' });
    await until(() => member.of('chat:presence').length === 1);
    expect(member.of('chat:presence')[0]).toMatchObject({ username: 'bob@TEST', status: 'away', custom: 'at lunch' });
    expect(legacy).not.toHaveBeenCalled();
  });
});
