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

/**
 * Model markup to terminal bytes. Titles (<title>) paint cyan; color tags
 * paint their color: <color>/<colour> with c/cyan or g/green (bare <color>
 * defaults cyan, matching what the models mean by it). Unknown tags and
 * stray brackets stay literal: eating a caller's "a < b" would be worse
 * than showing it. Unclosed tags run to end of string (a cut reply still
 * paints).
 */
const CHAT_MARKUP_COLORS: Record<string, string> = {
  c: '36', cyan: '36', g: '32', green: '32',
};

export function renderChatMarkup(text: string): string {
  const paint = (inner: string, code: string): string => `\x1b[0;${code}m${inner}\x1b[0m`;
  const paintTag = (tag: string, attr: string | undefined, inner: string): string => {
    const t = tag.toLowerCase();
    if (t === 'title' || t === 'cyan') return paint(inner, '36');
    if (t === 'green') return paint(inner, '32');
    const code = CHAT_MARKUP_COLORS[(attr ?? '').toLowerCase() || 'c'];
    return code ? paint(inner, code) : inner;
  };
  let out = text.replace(
    /<(title|colou?r|cyan|green)(?:\s+([a-z]))?\s*>([\s\S]*?)(?:<\/(?:colou?r|cyan|green|title)(?:\s+[a-z])?\s*>)/gi,
    (_m, tag: string, attr: string | undefined, inner: string) => paintTag(tag, attr, inner),
  );
  // Unclosed trailing tag paints to the end rather than leaking brackets.
  out = out.replace(
    /<(title|colou?r|cyan|green)(?:\s+([a-z]))?\s*>([^<]*)$/i,
    (_m, tag: string, attr: string | undefined, inner: string) => paintTag(tag, attr, inner),
  );
  return out;
}

/** Every live chat, by page id. Owned here; the handler reads and writes it. */
export const activeChatSessions = new Map<string, ChatSession>();

/**
 * Is this still the chat the board is holding for that page?
 *
 * A reply is generated, thinks for a while, and only then types. A `/quit`
 * inside that pause left nothing in flight to wait for, the chat was gone, and
 * the typing began anyway - on top of the caller's NEXT page. Anything that
 * emits to a caller between one await and the next asks this first.
 */
export function chatIsLive(chatSession: ChatSession, pageId: string): boolean {
  return activeChatSessions.get(pageId) === chatSession && !(chatSession as any).ended;
}

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
interface ChatLine {
  text: string;
  lastSender: ChatSender | null;
  /** ANSI escape parser: 0 none, 1 seen ESC, 2 inside CSI. Escape bytes are
   *  emitted but never counted toward the 78 columns. A lone ESC (the ESC
   *  key, not CSI) counts as typed before. */
  esc?: number;
}
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
  if (ch === '\x1b') {
    line.esc = 1;
    return out;
  }
  if (line.esc === 1) {
    line.esc = ch === '[' ? 2 : 0;
    if (line.esc === 0) line.text += `\x1b${ch}`;
    return out;
  }
  if (line.esc === 2) {
    if (/[A-Za-z]/.test(ch)) line.esc = 0;
    return out;
  }
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

/**
 * THE BOARD'S OWN VOICE - neither speaker's: the terminal put back to plain,
 * and the line model told that nobody is mid-turn any more.
 *
 * The hint under the greeting raw-emitted `\x1b[0m` and told the line model
 * nothing. That was harmless while the greeting was a raw emit too: nobody had
 * spoken, so the co-sysop's first typed character still carried the cyan. The
 * moment the greeting went through the line model (2026-09-08) the model
 * believed the sysop was mid-turn, emitted no colour for the intro underneath,
 * and the intro arrived in whatever the reset had left - no colour at all.
 * Every SGR this chat sends comes from here, so the model cannot be lied to
 * again by the next line of board prose someone drops into the stream.
 */
export function chatResetColourBytes(chatSession: ChatSession): string {
  chatLineOf(chatSession).lastSender = null;
  return '\x1b[0m';
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
 * THE THINKING DOTS ARE CANCELLED BY THE CALLER'S OWN KEYS.
 *
 * `thinking-dots.ts` types dots while the co-sysop thinks and rubs them out by
 * backspacing over exactly what it wrote. This line is SHARED: the caller's
 * keys are echoed onto it the moment they are pressed (6172), and a caller
 * waiting for an answer is precisely a caller who keeps typing. Dots followed
 * by `abc` would be rubbed out AS `abc` - the caller's characters gone from
 * the screen, still in `line.text`, and the dots left standing. So the
 * caller's first key ENDS the thinking window, while the screen still ends in
 * dots and the backspaces still land on them.
 *
 * The slot lives in this module because this module owns the chat session's
 * scratch (`chatLineOf` above). `thinking-dots` fills it and empties it again
 * when it stops; the caller's three paths below empty it. That also keeps the
 * dependency one-way - `thinking-dots` reads this module, never the reverse.
 */
type ChatWithDots = ChatSession & { thinkingDotsStop?: ((keepDots?: boolean) => void) | null };

/** Called by `thinking-dots` alone, when a window opens. */
export function setThinkingDotsCanceller(chatSession: ChatSession, cancel: (keepDots?: boolean) => void): void {
  (chatSession as ChatWithDots).thinkingDotsStop = cancel;
}

/**
 * Called by `thinking-dots` alone, when a window closes - and ONLY if the slot
 * still holds that window's own `stop`. There is one slot per chat, so a
 * window that ended late (a chat that had already moved on, say) would
 * otherwise empty the slot belonging to the window that replaced it, and the
 * caller's next key would find nothing to cancel and type into live dots.
 */
export function clearThinkingDotsCanceller(chatSession: ChatSession, cancel: (keepDots?: boolean) => void): void {
  const cs = chatSession as ChatWithDots;
  if (cs.thinkingDotsStop === cancel) cs.thinkingDotsStop = null;
}

/** End any thinking window on this chat. A reply keeps the dots and types
 *  after them; everything else (keys, quit, end) erases. */
export function cancelThinkingDots(chatSession: ChatSession | null | undefined, keepDots = false): void {
  const cancel = chatSession ? (chatSession as ChatWithDots).thinkingDotsStop : null;
  if (cancel) cancel(keepDots);
}
/**
 * What counts as a typed character in operator chat.
 *
 * Was inline in command.handler (`data >= ' ' && data <= '~'`): 7-bit ASCII
 * only, so Swedish åäö died silently at the keystroke - the caller typed and
 * nothing reached the buffer, the echo, or the model ("i can't type swedish
 * åäö in the operator chat", 2026-09-11). The board's own charset since 1985
 * is Amiga Latin-1: printable ASCII plus U+00A0-U+00FF ride, C0/C1 controls
 * and DEL stay out, astral planes (emoji are two UTF-16 units, never one
 * keystroke) stay out with them.
 */
export function chatAcceptsKeystroke(data: string): boolean {
  if (data.length !== 1) return false;
  const cp = data.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  return cp >= 0xa0 && cp <= 0xff;
}

/**
 * THE CALLER'S SIDE of the stream, called from the chat branch of
 * command.handler for every key: the character goes onto the shared line and
 * back to the caller's own terminal, exactly as express echoes it (6172).
 */
export function callerTypedChar(io: any, session: BBSSession, ch: string): void {
  const cs = chatOfSession(session);
  // The dots come off the screen BEFORE this key is echoed onto it: their
  // backspaces have to land on the dots, not on the caller's own character.
  if (cs) cancelThinkingDots(cs);
  // Chat or no chat, the caller's own key is in the caller's colour: a bare
  // character inherited whatever was current - the bot's cyan, after its line
  // ("sometimes i get the sysop cyan when i type", 2026-09-08).
  emitToCaller(io, session, cs ? chatCharBytes(cs, 'user', ch) : `\x1b[${CHAT_COLOR_USER}m${ch}`);
}
export function callerBackspaced(io: any, session: BBSSession): void {
  const cs = chatOfSession(session);
  if (cs) cancelThinkingDots(cs);
  emitToCaller(io, session, cs ? chatBackspaceBytes(cs) : '\b \b');
}
export function callerPressedReturn(io: any, session: BBSSession): void {
  const cs = chatOfSession(session);
  if (cs) cancelThinkingDots(cs);
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
/** How long a kept line may sit before the co-sysop says how to send it. */
export const SEND_HINT_AFTER_MS = 6000;

type ChatScratch = BBSSession & {
  chatPendingLines?: string[];
  chatSendHintShown?: boolean;
  chatSendHintTimer?: ReturnType<typeof setTimeout>;
};

/**
 * A caller who does not know the convention presses return ONCE and waits
 * for an answer that is not coming ("if the user doesnt know that he needs
 * to press enter twice the sysop could tell him the first time it happens"
 * - sysop, 2026-09-08). So when a line has been kept and the caller has
 * gone quiet, the co-sysop says how to send it - ONCE per chat, and never
 * while they are still typing.
 */
export function scheduleSendHint(io: any, session: BBSSession, delayMs = SEND_HINT_AFTER_MS): void {
  const s = session as ChatScratch;
  if (s.chatSendHintShown) return;
  cancelSendHint(session);
  const timer = setTimeout(() => {
    delete s.chatSendHintTimer;
    // Still waiting, still silent, still in the chat, and nothing half-typed
    // on the shared line for the hint to land in the middle of.
    if (s.chatSendHintShown || (s.chatPendingLines ?? []).length === 0) return;
    if ((session.inputBuffer ?? '') !== '') return;
    const cs = chatOfSession(session);
    if (!cs) return;
    s.chatSendHintShown = true;
    let out = '';
    for (const ch of 'press return once more on the empty line and I will read it') {
      out += chatCharBytes(cs, 'sysop', ch);
    }
    out += chatReturnBytes(cs);
    emitToCaller(io, session, out);
  }, delayMs);
  timer.unref?.();
  s.chatSendHintTimer = timer;
}

/** The line went, or the chat did: nothing left to hint about. */
export function cancelSendHint(session: BBSSession): void {
  const s = session as ChatScratch;
  if (s.chatSendHintTimer) clearTimeout(s.chatSendHintTimer);
  delete s.chatSendHintTimer;
}

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
  pace: { typingSpeed?: number; typoProbability?: number } | null,
  opts?: { prefixReturn?: boolean }
): Promise<void> {
  // Model markup (<title>, <color>) becomes terminal SGR here, once, for
  // every sender - the wrap counting below then sees visible columns only.
  const painted = renderChatMarkup(text);
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
    const live = () => chatIsLive(chatSession, page.id);
    const emit = (bytes: string) => { if (bytes && live()) reach.emitter.emit('ansi-output', bytes); };

    // Kept thinking dots occupy the line's first cells, so a reply typed
    // after them wraps early (2026-09-10). Start it on a fresh line; the
    // dots stay standing above, as decided.
    if (opts?.prefixReturn) emit(chatReturnBytes(chatSession));

    // The message's own line breaks are returns; the shared line wraps itself.
    const lines = painted.replace(/\r/g, '').split('\n');    const plans = lines.map((line) =>
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
    // AND A BLANK LINE: the co-sysop presses return twice too, so the caller
    // can see the turn has come back to them ("the sysop also needs to press
    // enter twice to show me that its my turn to type" - sysop, 2026-09-08).
    // The caller's own send already ends this way: the second return is what
    // sent it.
    emit(chatReturnBytes(chatSession));
  };
  const prev: Promise<void> = (chatSession as any).delivery ?? Promise.resolve();
  const next = prev.then(run, run);
  (chatSession as any).delivery = next.catch(() => undefined);
  return next;
}

/**
 * express.e chat():6085-6094 - "This is <sysop>, How can I help you??", the
 * board naming whoever answered the page. Three returns above it (one the
 * caller's stream already got, two of its own) and two below.
 *
 * IT IS TYPED, like every other line that speaker sends. It was the one line
 * emitted whole, and a greeting that arrived instantly above a conversation
 * that types a character at a time read as a glitch. The two blank lines are
 * carried as the message's OWN line breaks rather than emitted around it, so
 * they are paced, serialised and cancelled with the greeting: a caller who
 * quits mid-greeting takes all of it with him, blank lines included.
 *
 * Never with typos, whatever the board's typo setting says - a slip in an
 * introduction reads as a bug rather than as character. That rule lives here,
 * not at the call site, because the next persona given an opening line would
 * otherwise have to remember it.
 */
export async function deliverGreeting(
  io: any,
  chatSession: ChatSession,
  page: PageRequest,
  startName: string,
  typingSpeed?: number
): Promise<void> {
  await deliverToCaller(io, chatSession, page, `\n\nThis is ${startName}, How can I help you??`, {
    typingSpeed,
    typoProbability: 0,
  });
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
