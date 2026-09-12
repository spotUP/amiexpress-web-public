/**
 * The dots a sysop types while thinking.
 *
 * The co-sysop can take several seconds to answer and said nothing at all
 * while it did, which reads as a dead line. Sysops typed dots - unevenly,
 * because a person is not a metronome - and rubbed them out when they had
 * something to say.
 *
 * NOTHING happens for the first `THINKING_DOTS_AFTER_MS`: most replies beat
 * it, and a board that punctuates every answer with dots is worse than one
 * that does not.
 *
 * The dots do NOT go through `chatCharBytes`. That function mutates
 * `chatSession.line.text`, and a dot recorded as line text would corrupt the
 * reply's 78-column wrapping and sit in the transcript. These are raw bytes,
 * rubbed out with raw backspaces, and the line model never learns they
 * happened. A reply keeps them and types after (stop(true)); everything
 * else erases.
 *
 * COLOUR, SECOND ATTEMPT (2026-09-10): the sysop wants the dots cyan
 * like his texts, and the above failure was the MISSING RESET, not the
 * colour itself. Each dot carries its own reset, so the terminal is back
 * at default before the next key exists. Plain 0;36 (never bold) per the
 * BBS output rules. If keystrokes ever render cyan again, revert this
 * paragraph, not the dots.
 *
 * COUNT (same date): thinkingDotsShown reports how many dots are
 * standing, so the reply can start on a fresh line instead of wrapping
 * mid-line after them (screenshot: first line broke early).
 *
 * And the window ENDS at the caller's first key, because the line is shared:
 * see `setThinkingDotsCanceller` in `chat-stream.ts` for why counting dots
 * more cleverly is not the fix.
 */
import type { ChatSession } from '../../types/operator-chat.types';
import { chatIsLive, setThinkingDotsCanceller, clearThinkingDotsCanceller, cancelThinkingDots } from './chat-stream';

/** Under this, the caller sees nothing. */
export const THINKING_DOTS_AFTER_MS = 1200;

export interface ThinkingDotsOptions {
  afterMs?: number;
  /** The pause before the NEXT dot. Injectable so a test is not a coin toss. */
  gapMs?: () => number;
}

/** Uneven on purpose: 200-900 ms, and now and then two in quick succession. */
function humanGap(): number {
  if (Math.random() < 0.25) return 120 + Math.floor(Math.random() * 100);
  return 200 + Math.floor(Math.random() * 700);
}

/** Dots currently standing per chat, for the reply's first-line math. */
const shownBySession = new WeakMap<object, number>();

export function thinkingDotsShown(chatSession: ChatSession | null | undefined): number {
  if (!chatSession) return 0;
  return shownBySession.get(chatSession) ?? 0;
}

/** Consume the count after the reply accounts for it. */
export function clearThinkingDotsShown(chatSession: ChatSession | null | undefined): void {
  if (chatSession) shownBySession.delete(chatSession);
}

export function startThinkingDots(
  emit: (bytes: string) => void,
  chatSession: ChatSession,
  pageId: string,
  options: ThinkingDotsOptions = {}
): () => void {
  const afterMs = options.afterMs ?? THINKING_DOTS_AFTER_MS;
  const gapMs = options.gapMs ?? humanGap;

  let written = 0;
  let stopped = false;
  if (chatSession) shownBySession.delete(chatSession);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (keepDots = false): void => {
    if (stopped) return;
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    clearThinkingDotsCanceller(chatSession, stop);
    // A reply keeps the dots and types after them (sysop, 2026-09-10):
    // rubbing them out read as the bot taking its thinking back. Anything
    // else - the caller's key, a quit, the chat ending - still erases, so a
    // dead chat leaves no dots stranded on the line.
    if (!keepDots && written > 0 && chatIsLive(chatSession, pageId)) emit('\b \b'.repeat(written));
    if (!keepDots) shownBySession.delete(chatSession);
    written = 0;
  };

  const tick = (): void => {
    if (stopped) return;
    if (!chatIsLive(chatSession, pageId)) {
      // Nothing to erase into a chat that is over, but the slot must not keep
      // holding a stop() for a chat that has moved on.
      stopped = true;
      clearThinkingDotsCanceller(chatSession, stop);
      return;
    }
    emit('\x1b[0;36m.\x1b[0m');
    written++;
    shownBySession.set(chatSession, written);
    timer = setTimeout(tick, gapMs());
  };

  // ONE WINDOW AT A TIME. The slot holds a single `stop`, so a second window
  // opened on the same chat would strand the first: its dots left standing on
  // the line, and nothing holding the function that erases them. Stopping the
  // previous one first rubs its dots out and hands the slot over cleanly.
  cancelThinkingDots(chatSession);
  // Registered before the first dot: a caller who types inside the silent
  // threshold ends the window too, and erases the nothing it wrote.
  setThinkingDotsCanceller(chatSession, stop);
  timer = setTimeout(tick, afterMs);

  return stop;
}
