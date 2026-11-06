/**
 * Internode chat reaches a telnet or SSH partner.
 *
 * The chat's lines went out with io.to(`chat:<id>`), a socket.io room a
 * telnet or SSH caller can never join - his connection emitter has no `join`,
 * so accepting a chat threw, and the lines and the end-of-chat screen never
 * reached him (web-vs-telnet audit item 3, 2026-09-28). The chat's members
 * are the two sessions carrying its chatSessionId, reached through their own
 * emitters: here both ends are registered the way a telnet connection is.
 */
process.env.SKIP_DB_INIT = '1';

import { setInternodeChatDependencies, handleChatMessage } from '../../src/handlers/chat/internode-chat.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { roomMember, clearRoomMembers } from '../helpers/room-members';
import type { Database } from '../../src/database';

afterEach(() => clearRoomMembers());

it('delivers a chat line to both ends, on byte transports', async () => {
  const chat = { id: 's1', status: 'active', initiatorId: 1, recipientId: 2 };
  setInternodeChatDependencies({
    db: { getChatSession: async () => chat, saveChatMessage: async () => undefined } as unknown as Database,
    sessions: new Map(),
    io: {},
  });
  const me = roomMember(1, { user: { id: 1, username: 'spot' }, subState: LoggedOnSubState.CHAT, chatSessionId: 's1', connectionType: 'telnet' });
  const partner = roomMember(2, { user: { id: 2, username: 'infant' }, subState: LoggedOnSubState.CHAT, chatSessionId: 's1', connectionType: 'telnet' });

  await handleChatMessage({ id: 'member-1', emit: () => true } as never, me.session, { message: 'hello there' });

  expect(partner.of('ansi-output').join('')).toContain('hello there');
  expect(me.of('ansi-output').join('')).toContain('hello there');
});
