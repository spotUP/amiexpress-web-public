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
 * happened.
 *
 * WHICH IS ALSO WHY THEY CARRY NO COLOUR. A raw `\x1b[36m` would leave the
 * terminal in sysop cyan while `line.lastSender` still said `user`, so the
 * caller's next key would take the "same sender, no SGR needed" branch and
 * render cyan - verbatim the bug that `callerTypedChar` in `chat-stream.ts`
 * was fixed for ("sometimes i get the sysop cyan when i type", 2026-09-08).
 * A bare dot cannot desync what it never sets.
 *
 * And the window ENDS at the caller's first key, because the line is shared:
 * see `setThinkingDotsCanceller` in `chat-stream.ts` for why counting dots
 * more cleverly is not the fix.
 */
import type { ChatSession } from '../../types/operator-chat.types';
import { chatIsLive, setThinkingDotsCanceller } from './chat-stream';

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
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    setThinkingDotsCanceller(chatSession, null);
    // Rub out exactly what was written. A chat that has ended gets nothing:
    // its caller is somewhere else and those bytes would land there.
    if (written > 0 && chatIsLive(chatSession, pageId)) emit('\b \b'.repeat(written));
    written = 0;
  };

  const tick = (): void => {
    if (stopped) return;
    if (!chatIsLive(chatSession, pageId)) {
      // Nothing to erase into a chat that is over, but the slot must not keep
      // holding a stop() for a chat that has moved on.
      stopped = true;
      setThinkingDotsCanceller(chatSession, null);
      return;
    }
    emit('.');
    written++;
    timer = setTimeout(tick, gapMs());
  };

  // Registered before the first dot: a caller who types inside the silent
  // threshold ends the window too, and erases the nothing it wrote.
  setThinkingDotsCanceller(chatSession, stop);
  timer = setTimeout(tick, afterMs);

  return stop;
}
