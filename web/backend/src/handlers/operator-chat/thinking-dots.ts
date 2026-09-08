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
 */
import type { ChatSession } from '../../types/operator-chat.types';
import { chatIsLive, CHAT_COLOR_SYSOP } from './chat-stream';

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

  const tick = (): void => {
    if (stopped) return;
    if (!chatIsLive(chatSession, pageId)) { stopped = true; return; }
    // The sysop colour comes with the first dot, the way the first character
    // of a sysop line carries it.
    emit(written === 0 ? `\x1b[${CHAT_COLOR_SYSOP}m.` : '.');
    written++;
    timer = setTimeout(tick, gapMs());
  };

  timer = setTimeout(tick, afterMs);

  return () => {
    if (stopped) return;
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    // Rub out exactly what was written. A chat that has ended gets nothing:
    // its caller is somewhere else and those bytes would land there.
    if (written > 0 && chatIsLive(chatSession, pageId)) emit('\b \b'.repeat(written));
    written = 0;
  };
}
