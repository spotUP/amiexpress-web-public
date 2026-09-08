/**
 * The rule that stops anything being typed into a chat that is over.
 *
 * `deliverToCaller` had this inline. The thinking dots need exactly the same
 * rule, and two copies of it would drift - the copy that drifts is the one
 * that leaks a dead chat's output into a live session.
 */
process.env.SKIP_DB_INIT = '1';

import { chatIsLive, activeChatSessions, callerTypedChar, cancelThinkingDots, CHAT_COLOR_USER }
  from '../../src/handlers/operator-chat/chat-stream';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';
import { userSessions } from '../../src/server/session-manager';

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

  /**
   * THE COLOUR IS GONE ON PURPOSE. It used to emit `\x1b[36m` with the first
   * dot, straight to the wire - which left the terminal in sysop cyan while
   * `line.lastSender` still said `user`, and the caller's next keystroke then
   * rendered cyan. Bare dots, and no SGR of any kind.
   */
  it('types no colour of its own - the line model would never learn of it', () => {
    const { seen } = armed();
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 2);
    expect(seen.join('')).toBe('...');
    expect(seen.join('')).not.toContain('\x1b');
  });

  it('leaves no timer running once it is stopped', () => {
    const { stop } = armed();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300);
    stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  /**
   * ONE SLOT PER CHAT, so two windows on one chat cannot both be live.
   *
   * The slot was single-shot and unguarded while nothing called
   * `startThinkingDots` at all. The handler calls it now, once per model call,
   * and `botBusy` is what keeps those one at a time - but a slot that strands
   * a window the moment that guard is wrong leaves dots on the caller's line
   * with nothing holding the function that erases them.
   */
  describe('a second window on the same chat', () => {
    it("rubs out the first one's dots instead of stranding them", () => {
      const seen: string[] = [];
      const chatSession = fakeChat('p1');
      startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });
      jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 2);
      expect(seen.join('')).toBe('...');
      seen.length = 0;

      startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });

      // The first window's three dots come off the line as the second opens.
      expect(seen.join('')).toBe('\b \b'.repeat(3));
      // And only the second one is still ticking.
      expect(jest.getTimerCount()).toBe(1);
    });

    it('is the one the chat can still cancel afterwards', () => {
      const seen: string[] = [];
      const chatSession = fakeChat('p1');
      const first = startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });
      startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });
      // The stranded window's stop, arriving late, must not empty the slot the
      // live window is registered in.
      first();
      jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 2);
      seen.length = 0;

      cancelThinkingDots(chatSession);

      expect(seen.join('')).toBe('\b \b'.repeat(3));
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  /**
   * THE LINE IS SHARED, so a caller who types during the thinking window would
   * have had the dots' backspaces rub out his OWN characters - off the screen
   * but still in `line.text`. His first key ends the window instead. Driven
   * through the real `callerTypedChar` so what is proved is the wiring.
   */
  describe('the caller types while it is thinking', () => {
    function caller(pageId: string, seen: string[]) {
      const session: any = { user: { id: 'u-dots' }, tempData: { pageId } };
      registerConnectionEmitter(session, {
        emit: (event: string, data: unknown) => { if (event === 'ansi-output') seen.push(String(data)); },
      } as any);
      userSessions.set('u-dots', session);
      return session;
    }
    afterEach(() => userSessions.delete('u-dots'));

    it('rubs the dots out before the echo, and keeps the caller his character', () => {
      const seen: string[] = [];
      const chatSession = fakeChat('p1');
      const session = caller('p1', seen);
      startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });

      jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 2);
      expect(seen.join('')).toBe('...');

      callerTypedChar({}, session, 'a');

      // Three dots, three erases, THEN the caller's own character in his own
      // colour. Erase first or the backspaces eat the 'a'.
      expect(seen.join('')).toBe('...' + '\b \b'.repeat(3) + `\x1b[${CHAT_COLOR_USER}ma`);
      expect(chatSession.line.text).toBe('a');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('types no further dots, and does not erase a second time', () => {
      const seen: string[] = [];
      const chatSession = fakeChat('p1');
      const session = caller('p1', seen);
      const stop = startThinkingDots((b) => seen.push(b), chatSession, 'p1', { gapMs: () => 300 });

      jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 300 * 2);
      callerTypedChar({}, session, 'a');
      seen.length = 0;

      jest.advanceTimersByTime(300 * 10);
      stop();
      callerTypedChar({}, session, 'b');

      // Nothing but the second key's echo: no dot, and no second rub-out.
      expect(seen.join('')).toBe('b');
    });
  });
});
