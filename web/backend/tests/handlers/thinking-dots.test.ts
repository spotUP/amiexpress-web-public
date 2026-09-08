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

import { startThinkingDots, THINKING_DOTS_AFTER_MS } from '../../src/handlers/operator-chat/thinking-dots';

describe('the dots the co-sysop types while it thinks', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  function armed(pageId = 'p1') {
    const seen: string[] = [];
    const chatSession = fakeChat(pageId);
    const stop = startThinkingDots((b) => seen.push(b), chatSession, pageId, { gapMs: () => 300 });
    return { seen, stop, chatSession };
  }

  it('says nothing at all before the threshold - most replies beat it', () => {
    const { seen } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS - 1);
    expect(seen.join('')).toBe('');
  });

  it('types dots once the wait is long enough', () => {
    const { seen } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 3);
    expect(seen.join('')).toContain('.');
    expect(seen.join('').replace(/\x1b\[[0-9;]*m/g, '').split('.').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('rubs out every dot it wrote when the reply is ready', () => {
    const { seen, stop } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 4);
    const dots = seen.join('').replace(/\x1b\[[0-9;]*m/g, '').split('.').length - 1;
    seen.length = 0;

    stop();

    expect(seen.join('')).toBe('\b \b'.repeat(dots));
  });

  it('writes nothing when the reply beats the threshold', () => {
    const { seen, stop } = armed();
    jest.advanceTimersByTime(500);
    stop();
    expect(seen.join('')).toBe('');
  });

  it('stops on its own when the chat is no longer live', () => {
    const { seen, chatSession } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300);
    seen.length = 0;
    (chatSession as any).ended = true;

    jest.advanceTimersByTime(300 * 10);

    expect(seen.join('')).toBe('');
  });

  it('can be stopped twice without erasing twice', () => {
    const { seen, stop } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300);
    seen.length = 0;
    stop();
    const afterFirst = seen.join('');
    stop();
    expect(seen.join('')).toBe(afterFirst);
  });
});
