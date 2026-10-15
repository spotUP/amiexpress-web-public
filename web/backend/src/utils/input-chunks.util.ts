/**
 * ONE KEYSTROKE, OR A PASTE?
 *
 * Every text-input consumer on this board was written against a keyboard:
 * `data.length === 1 && data >= ' ' && data <= '~'` is the printable-character
 * test in chat-mode-input.util.ts and in both of operator-chat.handler.ts's
 * typing buffers. A keyboard satisfies it. A PASTE does not - the browser
 * delivers the whole clipboard as a single `command` event, so the guard was
 * false and the text was dropped on the floor without a word (reported live
 * 2026-09-13: "pasting to the bbs is very slow as well" - it was not slow, it
 * was silently doing nothing, and the caller retyped).
 *
 * So the consumers keep their one-character contract and the chunk is split
 * before it reaches them. What must NEVER be split:
 *
 *  - An escape sequence. `\x1b[OP` is ONE key (F1, which leaves chat); split
 *    into five it is an ESC and four printable characters typed into the
 *    message.
 *  - Anything carrying a control byte. Door traffic, telnet negotiation and
 *    file-transfer payloads reach the same boundary, and a byte of those is
 *    not a character anybody typed.
 *
 * CR and LF DO come out as their own keys: a multi-line paste should send a
 * line per line, which is what pressing return between them would have done.
 */

/** A control byte that is not CR or LF - the mark of traffic, not typing. */
const NOT_TYPING = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

/**
 * The keys inside one input event: the event itself when it is a single key,
 * its characters when it is pasted text.
 */
export function inputKeys(data: string): string[] {
  if (data.length <= 1) return [data];
  if (data.charCodeAt(0) === 0x1b) return [data];
  if (NOT_TYPING.test(data)) return [data];
  return Array.from(data);
}
