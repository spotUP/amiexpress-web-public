/**
 * THE CHAT STREAM - the caller's terminal half of the operator chat.
 *
 * Split out of operator-chat.handler.ts on 2026-09-08 when that file reached
 * the 2 000-line limit. This module owns the live chat sessions, the shared
 * line model (express.e chat(), 6067-6244: one scrolling stream, a colour per
 * side, a character at a time), the caller's keys, the delivery of a line to
 * the caller, and the wrapping of a message into lines. The handler owns
 * pages, takeovers, the bot's replies and the admin's side.
 */
import type { BBSSession } from '../../index';
import type { ChatSession, PageRequest } from '../../types/operator-chat.types';
import { emitterForUserId } from '../../server/session-emitter-registry';
import { planNaturalTyping } from '../grumpy-sysop-bot.handler';

/** Every live chat, by page id. Owned here; the handler reads and writes it. */
export const activeChatSessions = new Map<string, ChatSession>();

/**
 * THE CHAT IS ONE SCROLLING STREAM - express.e chat(), 6067-6244.
 *
 * No clear, no scroll region, no input line at the bottom. Every key from
 * EITHER side goes out with sendChar the moment it is pressed (6172); the
 * colour switches only when the SENDER changes (6164-6171); backspace is
 * BS-space-BS to both sides (6147-6149); return is a newline (6138). Both
 * sides type into ONE line buffer (`space`), and when it passes 78 columns
 * the half-typed word at its end is rubbed out, a newline sent, and the word
 * put back at the start of the next line (6181-6223). At the end: attributes
 * off, the EndChat screen or "Ending Chat." (6228-6242), and the prompt.
 *
 * The split-screen layout this replaces (scroll region 1-23, input on 24,
 * a preview line) was this port's invention; so was a word-at-a-time
 * delivery that came from reading tranChat() (5860-6065, the translator
 * variant, which buffers words so it can translate them) instead of chat().
 *
 * express.e colours the two sides with LVL_CHAT_COLOR_SYSOP / _USER from the
 * board's ACS levels; this port has no such setting yet, so the colours are
 * the ones its chat has always used.
 */
export const CHAT_COLOR_SYSOP = '36';
export const CHAT_COLOR_USER = '33';

/** Longest a single message may take to arrive, whatever the pace setting. */
const MAX_DELIVERY_MS = 12_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type ChatSender = 'user' | 'sysop';
/** express.e's `space` and `x` (6098-6100), and who wrote last, per chat. */
interface ChatLine { text: string; lastSender: ChatSender | null }
function chatLineOf(chatSession: ChatSession): ChatLine {
  const cs = chatSession as any;
  if (!cs.line) cs.line = { text: '', lastSender: null } as ChatLine;
  return cs.line as ChatLine;
}

/**
 * One character from one side onto the shared line - the bytes the caller's
 * terminal gets. express.e:6162-6223: a colour change if the sender changed,
 * the character, and the wrap when the line passes 78 columns.
 */
export function chatCharBytes(chatSession: ChatSession, sender: ChatSender, ch: string): string {
  const line = chatLineOf(chatSession);
  let out = '';
  if (line.lastSender !== sender) {
    out += `\x1b[${sender === 'sysop' ? CHAT_COLOR_SYSOP : CHAT_COLOR_USER}m`;
    line.lastSender = sender;
  }
  out += ch;
  line.text += ch;
  if (line.text.length > 78) {
    // 6181-6223: back up to the last space; no space (or a trailing one)
    // means a plain newline; otherwise rub out the partial word, newline,
    // and put the word at the start of the next line.
    const at = line.text.lastIndexOf(' ');
    const word = at < 0 ? '' : line.text.slice(at + 1);
    if (word.length === 0) {
      out += '\r\n';
      line.text = '';
    } else {
      out += '\b \b'.repeat(word.length) + '\r\n' + word;
      line.text = word;
    }
  }
  return out;
}
/** express.e:6143-6152: one character off the shared line, both sides. */
export function chatBackspaceBytes(chatSession: ChatSession): string {
  const line = chatLineOf(chatSession);
  if (line.text.length === 0) return '';
  line.text = line.text.slice(0, -1);
  return '\b \b';
}
/** express.e:6130-6141: return ends the line. */
export function chatReturnBytes(chatSession: ChatSession): string {
  chatLineOf(chatSession).text = '';
  return '\r\n';
}

/** The chat the caller's session is in, or null. */
function chatOfSession(session: BBSSession): ChatSession | null {
  const pageId = session.tempData?.pageId;
  return (pageId && activeChatSessions.get(pageId)) || null;
}
function emitToCaller(io: any, session: BBSSession, bytes: string): void {
  if (!bytes) return;
  const reach = emitterForUserId(session.user!.id, io);
  if (reach) reach.emitter.emit('ansi-output', bytes);
}
/**
 * THE CALLER'S SIDE of the stream, called from the chat branch of
 * command.handler for every key: the character goes onto the shared line and
 * back to the caller's own terminal, exactly as express echoes it (6172).
 */
export function callerTypedChar(io: any, session: BBSSession, ch: string): void {
  const cs = chatOfSession(session);
  // Chat or no chat, the caller's own key is in the caller's colour: a bare
  // character inherited whatever was current - the bot's cyan, after its line
  // ("sometimes i get the sysop cyan when i type", 2026-09-08).
  emitToCaller(io, session, cs ? chatCharBytes(cs, 'user', ch) : `\x1b[${CHAT_COLOR_USER}m${ch}`);
}
export function callerBackspaced(io: any, session: BBSSession): void {
  const cs = chatOfSession(session);
  emitToCaller(io, session, cs ? chatBackspaceBytes(cs) : '\b \b');
}
export function callerPressedReturn(io: any, session: BBSSession): void {
  const cs = chatOfSession(session);
  emitToCaller(io, session, cs ? chatReturnBytes(cs) : '\r\n');
}

/**
 * RETURN TWICE SENDS. express's chat has no "message" - two people type into
 * one stream - but a co-sysop that answers needs to know when the caller
 * has finished, and the convention every operator chat has taught callers
 * is: press return twice ("its common to press enter twice to signal that
 * you are done typing in operator chats" - sysop, 2026-09-08). A return on a
 * line with text ends the line and keeps it; a return on an EMPTY line hands
 * over everything kept, as one message with its line breaks. Nothing kept
 * and an empty line is just a blank line.
 *
 * Pure over the session's own scratch (`chatPendingLines`), so the chat
 * branch of command.handler stays a few lines and this is testable alone.
 */
export function callerLineEntered(session: BBSSession, line: string): { send?: string } {
  const s = session as BBSSession & { chatPendingLines?: string[] };
  const text = line.trim();
  if (text !== '') {
    (s.chatPendingLines ??= []).push(line.replace(/\s+$/, ''));
    return {};
  }
  const kept = s.chatPendingLines ?? [];
  s.chatPendingLines = [];
  return kept.length ? { send: kept.join('\n') } : {};
}

/**
 * Deliver one side's text to the caller's terminal, a character at a time,
 * serialised per chat so two senders (the bot's opening line and its reply,
 * or a human sysop over the bot) never interleave. The caller's OWN keys do
 * interleave with it, onto the same line - that is /X.
 *
 * `pace` null sends the characters at once (a human sysop's line from the
 * admin); a pace types them with the bot's speed and typos.
 */
export async function deliverToCaller(
  io: any,
  chatSession: ChatSession,
  page: PageRequest,
  text: string,
  pace: { typingSpeed?: number; typoProbability?: number } | null
): Promise<void> {
  const run = async (): Promise<void> => {
    const reach = emitterForUserId(page.userId, io);
    if (!reach) {
console.log(`[Operator Chat] Page ${page.id}: a line for ${page.userHandle} has NO EMITTER for user ${page.userId} - saved and shown to the admin, not to the caller`);
      return;
    }
    // EVERY emit checks the chat is still the live one. A reply is generated
    // and then thinks for a while before it types; a /quit inside that pause
    // found nothing in flight to wait for, the chat was gone, and the typing
    // began anyway - on top of the caller's NEXT page ("old chat leaking in
    // here", 2026-09-08 07:05). The chat that owns this line is either the one
    // in the map or over.
    const live = () => activeChatSessions.get(page.id) === chatSession && !(chatSession as any).ended;
    const emit = (bytes: string) => { if (bytes && live()) reach.emitter.emit('ansi-output', bytes); };

    // The message's own line breaks are returns; the shared line wraps itself.
    const lines = text.replace(/\r/g, '').split('\n');
    const plans = lines.map((line) =>
      pace ? planNaturalTyping(line, pace) : [...line].map((ch) => ({ kind: 'char', ch }) as const)
    );
    const plannedMs = plans.flat().reduce((sum, e) => sum + (e.kind === 'pause' ? e.ms : 0), 0);
    const scale = plannedMs > MAX_DELIVERY_MS ? MAX_DELIVERY_MS / plannedMs : 1;

    for (const plan of plans) {
      if (!live()) return;
      for (const event of plan) {
        if (!live()) return;
        if (event.kind === 'char') emit(chatCharBytes(chatSession, 'sysop', event.ch));
        else if (event.kind === 'backspace') emit(chatBackspaceBytes(chatSession));
        else if (event.ms * scale >= 1) await sleep(event.ms * scale);
      }
      emit(chatReturnBytes(chatSession));
    }
  };
  const prev: Promise<void> = (chatSession as any).delivery ?? Promise.resolve();
  const next = prev.then(run, run);
  (chatSession as any).delivery = next.catch(() => undefined);
  return next;
}

/**
 * A chat message as terminal lines: its OWN line breaks first, then each
 * paragraph word-wrapped to `width`. An AI reply arrives with `\n` in it, and
 * a bare LF sent to a terminal moves down without returning to column 1 -
 * the staircase the sysop photographed on 2026-09-07 ("Welcome to
 * AMIEXPRESS" starting mid-screen). Every line this returns is sent with
 * `\r\n`. Exported for the test.
 */
export function wrapChatMessage(message: string, width: number): string[] {
  return message
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((paragraph) => (paragraph.trim() === '' ? [''] : wordWrapMessage(paragraph, width, width)));
}

function wordWrapMessage(message: string, firstLineMax: number, continuationMax: number): string[] {
  const lines: string[] = [];
  let remaining = message;
  let isFirstLine = true;

  while (remaining.length > 0) {
    const maxChars = isFirstLine ? firstLineMax : continuationMax;

    if (remaining.length <= maxChars) {
      // Remaining text fits on one line
      lines.push(remaining);
      break;
    }

    // Find break point (prefer space, but force break if no space found)
    let breakPoint = remaining.lastIndexOf(' ', maxChars);
    if (breakPoint <= 0) {
      // No space found, force break at maxChars
      breakPoint = maxChars;
    }

    lines.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart(); // Remove leading space from next line
    isFirstLine = false;
  }

  // Ensure at least one line (empty message case)
  if (lines.length === 0) {
    lines.push('');
  }

  return lines;
}
