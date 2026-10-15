/**
 * View History filters a chatter's own messages out of the room's message list.
 */
import { chatMessagesFrom } from '../../../../Doors/livechat/features/message-history';
import type { Message } from '../../../../Doors/livechat/types';

function msg(username: string, content: string, type: Message['type'] = 'message'): Message {
  return { id: Math.random().toString(36), channelId: 'c', userId: username, username, content, type, createdAt: new Date(), replyCount: 0 };
}

describe('chatMessagesFrom (View History)', () => {
  const messages: Message[] = [
    msg('alice', 'hello'),
    msg('bob', 'hi'),
    msg('alice', 'how are you'),
    msg('alice', 'joined', 'join'),   // not a chat message
    msg('ALICE', 'shouting'),         // case-insensitive
  ];

  it('returns only the user\'s actual chat messages, case-insensitive', () => {
    const out = chatMessagesFrom(messages, 'alice');
    expect(out.map(m => m.content)).toEqual(['hello', 'how are you', 'shouting']);
  });

  it('excludes system/join/leave lines and other users', () => {
    expect(chatMessagesFrom(messages, 'bob').map(m => m.content)).toEqual(['hi']);
    expect(chatMessagesFrom(messages, 'nobody')).toEqual([]);
  });
});
