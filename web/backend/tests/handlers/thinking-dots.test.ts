/**
 * The rule that stops anything being typed into a chat that is over.
 *
 * `deliverToCaller` had this inline. The thinking dots need exactly the same
 * rule, and two copies of it would drift - the copy that drifts is the one
 * that leaks a dead chat's output into a live session.
 */
process.env.SKIP_DB_INIT = '1';

import { chatIsLive, activeChatSessions } from '../../src/handlers/operator-chat/chat-stream';

function fakeChat(pageId: string): any {
  const chatSession: any = { pageId, line: { text: '', lastSender: null }, messages: [] };
  activeChatSessions.set(pageId, chatSession);
  return chatSession;
}

afterEach(() => activeChatSessions.clear());

describe('chatIsLive', () => {
  it('is true for the chat the map is holding', () => {
    const chatSession = fakeChat('p1');
    expect(chatIsLive(chatSession, 'p1')).toBe(true);
  });

  it('is false once the chat has been replaced by another', () => {
    const first = fakeChat('p1');
    fakeChat('p1'); // a second page with the same id replaced it
    expect(chatIsLive(first, 'p1')).toBe(false);
  });

  it('is false once the chat is gone from the map', () => {
    const chatSession = fakeChat('p1');
    activeChatSessions.clear();
    expect(chatIsLive(chatSession, 'p1')).toBe(false);
  });

  it('is false for a chat marked ended, even while the map still holds it', () => {
    const chatSession = fakeChat('p1');
    chatSession.ended = true;
    expect(chatIsLive(chatSession, 'p1')).toBe(false);
  });
});
