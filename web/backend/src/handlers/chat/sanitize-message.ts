/**
 * WHAT A CHAT MESSAGE MAY CARRY.
 *
 * ONE copy, because there were two - `group-chat.handler.ts` and
 * `dm.handler.ts` each had their own `sanitizeMessage`, identical and free
 * to drift, and this one gained a rule the moment a caller could type
 * PETSCII.
 *
 * ESC goes, and that is not negotiable: a room message is broadcast into
 * every other member's terminal (`broadcastAnsiToRoom`), so an escape
 * sequence a caller typed is an instruction to somebody else's screen. It
 * is also why a caller's colour travels as the board's own marker rather
 * than as SGR - a form with an ESC in it could never survive this line.
 *
 * BANK 0 goes too. The board runs the lowercase charset board-wide ("only
 * lowercase characters are allowed and only black background ... this
 * should apply bbs wide", the sysop, 2026-09-14,
 * `sdk/petscii/board-rules.ts`), and one bank-0 glyph makes the transducer
 * emit `$8E`, which reflows every letter already on every C64 in the room.
 * Nothing on this board may produce one; this is the door nobody can open.
 */

/** PetMe64 bank 0: the charset this board does not run. */
const BANK0_FIRST = 0xe000;
const BANK0_LAST = 0xe0ff;

export function sanitizeChatMessage(message: string): string {
  let out = '';
  for (const ch of message.replace(/\x1b/g, '')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= BANK0_FIRST && code <= BANK0_LAST) continue;
    out += ch;
  }
  return out;
}
