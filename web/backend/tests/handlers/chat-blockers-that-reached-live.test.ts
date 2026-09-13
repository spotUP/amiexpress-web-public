/**
 * Three defects that shipped to the live board and stayed there for five days.
 *
 * The whole-branch review found them on 2026-09-08, minutes after the branch
 * was merged on the sysop's instruction; the fixes were written but the
 * session was rate-limited before it could push them, and the branch sat in a
 * backup while 175 commits landed on top. These pin them so the next five days
 * cannot repeat.
 */
process.env.SKIP_DB_INIT = '1';

import {
  activeChatSessions,
  chatIsLive,
} from '../../src/handlers/operator-chat/chat-stream';
import {
  startThinkingDots,
  MAX_THINKING_DOTS,
  THINKING_DOTS_AFTER_MS,
} from '../../src/handlers/operator-chat/thinking-dots';

function fakeChat(pageId: string): any {
  const chatSession: any = { pageId, line: { text: '', lastSender: null }, messages: [] };
  activeChatSessions.set(pageId, chatSession);
  return chatSession;
}

afterEach(() => activeChatSessions.clear());

describe('a dot run is bounded by the line it sits on', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  /** Long enough to reach the cap several times over at a fixed gap. */
  const runFor = (ms: number, seen: string[]) => { jest.advanceTimersByTime(ms); return seen.join(''); };

  it('stops adding dots at the cap, instead of running to the model deadline', () => {
    // THE DEFECT. With tools enabled the deadline is 35s and humanGap averages
    // ~455ms, so an unbounded run reached ~75 dots - past a 78-column wrap,
    // which a backspace cannot follow back, and far enough that the board's
    // idea of the current column is wrong for the rest of the line. The dots
    // are raw bytes: chatCharBytes never sees them.
    const seen: string[] = [];
    const chatSession = fakeChat('cap');
    startThinkingDots((b) => seen.push(b), chatSession, 'cap', { gapMs: () => 100 });

    // 35 seconds of model deadline at a 100ms gap is 350 dots if unbounded.
    const dots = (runFor(THINKING_DOTS_AFTER_MS + 35000, seen).match(/\./g) ?? []).length;

    expect(dots).toBe(MAX_THINKING_DOTS);
    expect(MAX_THINKING_DOTS).toBeLessThan(78);
  });

  it('still erases exactly what it wrote once it has stopped adding', () => {
    // The cap must bound the dots, not orphan them: whatever reached the line
    // still has to come off it when the caller's key cancels the window.
    const seen: string[] = [];
    const chatSession = fakeChat('cap2');
    const stop = startThinkingDots((b) => seen.push(b), chatSession, 'cap2', { gapMs: () => 100 });

    const written = (runFor(THINKING_DOTS_AFTER_MS + 35000, seen).match(/\./g) ?? []).length;
    seen.length = 0;
    stop();

    expect(seen.join('')).toBe('\b \b'.repeat(written));
  });

  it('leaves no timer running once it has capped', () => {
    // Stopping at the cap must stop SCHEDULING too - a window that keeps
    // re-arming a timer to do nothing is a leak with a tidy screen.
    const seen: string[] = [];
    const chatSession = fakeChat('cap3');
    startThinkingDots((b) => seen.push(b), chatSession, 'cap3', { gapMs: () => 100 });

    jest.advanceTimersByTime(THINKING_DOTS_AFTER_MS + 35000);

    expect(jest.getTimerCount()).toBe(0);
    expect(chatIsLive(chatSession, 'cap3')).toBe(true);
  });
});
