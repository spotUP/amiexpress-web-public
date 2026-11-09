/**
 * REACHABILITY (LiveChat D3): the caller's keystroke / submit / clear reach the
 * hub as POST /rooms/:id/typing snapshots (throttled, final "" at once), and a
 * hub `typing` event from another board comes back as chat:typing while one
 * from a session bridged on this board is dropped. The stub counts every call.
 */
import { EventEmitter } from 'events';
import { setSession } from '../../src/server/session-manager';
import {
  setChatFederationDependencies,
  handleFederatedChatEvent,
  closeAllFederatedChats,
  relayFederatedTyping,
  TYPING_THROTTLE_MS,
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('federated livechat typing indicator', () => {
  let stub: ChatStub;
  beforeAll(async () => { stub = await startChatStub(); });
  afterAll(async () => {
    await closeAllFederatedChats();
    await stub.close();
    clearRoomMembers();
  });

  it('sends throttled snapshots and a final empty text; maps foreign typing, drops own board', async () => {
    setChatFederationDependencies({
      getConfig: () => ({ livechat_federated: true, achievements_board_key: 'TEST.secret', achievements_server_url: stub.url } as never),
      pollWaitSeconds: 1,
    });
    const member = roomMember(9, { user: { id: 9, username: 'caller', secLevel: 10 }, socketId: 'sock9' });
    setSession('sock9', member.session);
    const socket = new EventEmitter() as EventEmitter & { id: string };
    socket.id = 'sock9';
    handleFederatedChatEvent(socket as never, member.session, 'room:join', { roomName: 'Lobby' });
    await until(() => stub.count('POST', '/rooms/room1/join') === 1);

    const bodies = () => stub.calls.filter((c) => c.path === '/rooms/room1/typing').map((c) => JSON.parse(c.body).text as string);
    for (const ch of ['h', 'i', '!']) relayFederatedTyping(member.session, 'keystroke', ch);
    await until(() => bodies().length === 2);
    expect(bodies()).toEqual(['h', 'hi!']);
    relayFederatedTyping(member.session, 'keystroke', 'BACKSPACE');
    relayFederatedTyping(member.session, 'submit');
    await until(() => bodies().length === 3);
    // the pending 'hi' snapshot is superseded by the final empty text, which goes out at once
    expect(bodies().slice(2)).toEqual(['']);
    await sleep(TYPING_THROTTLE_MS + 100);
    expect(bodies()).toHaveLength(3);

    stub.push({ type: 'typing', room: 'room1', user: 'bob@OTHER', text: 'hello wor' });
    await until(() => member.of('chat:typing').length === 1);
    expect(member.of('chat:typing')[0]).toMatchObject({ channelId: 'room1', username: 'bob@OTHER', text: 'hello wor' });
    stub.push({ type: 'typing', room: 'room1', user: 'caller@TEST', text: 'mine' });
    stub.push({ type: 'typing', room: 'room1', user: 'amy@OTHER', text: 'x' });
    await until(() => member.of('chat:typing').length === 2);
    expect(member.of('chat:typing')[1]).toMatchObject({ username: 'amy@OTHER' });
  });
});
