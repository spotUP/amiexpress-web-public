/**
 * REACHABILITY: livechat_federated on, a caller's socket event reaches the
 * door server's /chat/v1 service and a remote line comes back to the caller on
 * BOTH output paths (structured chat:message with the role colour, and raw
 * ANSI). Entry point: the real socket-guard onCaller gate, as socket.on wires
 * it. The stub server is an in-process http server counting calls.
 */
import { EventEmitter } from 'events';
import { onCaller, setLegacyChatGate } from '../../src/server/socket-guard';
import { setSession, sessions } from '../../src/server/session-manager';
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

describe('federated livechat reaches the door server', () => {
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

  function setup(federated: boolean) {
    setChatFederationDependencies({
      getConfig: () => ({ livechat_federated: federated, achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never),
      pollWaitSeconds: 1,
    });
    setLegacyChatGate((socket, session, event, data) => handleFederatedChatEvent(socket as never, session, event, data));
    const member = roomMember(7, { user: { id: 7, username: 'caller', secLevel: 10 }, socketId: 'sock7' });
    setSession('sock7', member.session);
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'sock7';
    const legacy = jest.fn();
    onCaller(socket as never, 'room:join', legacy);
    onCaller(socket as never, 'room:message', legacy);
    return { member, socket, legacy };
  }

  it('off: the in-process handler runs and the stub is never called', () => {
    const before = stub.calls.length;
    const { socket, legacy } = setup(false);
    socket.emit('room:join', { roomName: 'Lobby' });
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(stub.calls.length).toBe(before);
  });

  it('on: join and message hit the stub with the board key; a remote line arrives in role colour on both paths', async () => {
    const { member, socket, legacy } = setup(true);
    socket.emit('room:join', { roomName: 'Lobby' });
    await until(() => stub.count('POST', '/rooms/room1/join') === 1);
    socket.emit('room:message', { message: 'hello there' });
    await until(() => stub.count('POST', '/rooms/room1/messages') === 1);

    expect(legacy).not.toHaveBeenCalled();
    expect(stub.count('POST', '/sessions')).toBeGreaterThanOrEqual(1);
    expect(stub.calls.find((c) => c.path === '/sessions')?.auth).toBe('Board TEST.secret');
    expect(JSON.parse(stub.calls.find((c) => c.path.endsWith('/messages'))!.body).content).toBe('hello there');

    stub.push({ type: 'message', room: 'room1', user: 'bob@TEST', ref: 'm9', roleColor: '2', text: 'hi caller' });
    await until(() => member.of('chat:message').length === 1);
    expect(member.of('chat:message')[0]).toMatchObject({ username: 'bob@TEST', content: 'hi caller', roleColor: '2', channelId: 'room1' });
    const ansi = String(member.of('ansi-output').at(-1));
    expect(ansi).toContain('\x1b[32mbob@TEST\x1b[0m');
    expect(ansi).not.toMatch(/\x1b\[4\dm/);
    expect(sessions.size).toBeGreaterThan(0);
  });
});
