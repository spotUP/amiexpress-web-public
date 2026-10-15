/**
 * PETSCII IN A CHAT LINE.
 *
 * A caller asked whether PETSCII characters and colours can be typed in the
 * chat; they could not, and "we want full petscii input <3" (the sysop,
 * 2026-09-22) is why they can. What arrives here has already been decoded
 * into the board's own markers, so chat's job is narrow: keep them, and
 * keep the two things that must never travel.
 *
 * ESC, because a room message is broadcast into every other member's
 * terminal - an escape sequence a caller typed is an instruction to
 * somebody else's screen, and that is also why the pen is a marker rather
 * than SGR.
 *
 * BANK 0, because the board runs one charset board-wide and a single
 * bank-0 glyph makes the transducer emit `$8E`, which reflows every letter
 * already on every C64 in the room.
 */
process.env.SKIP_DB_INIT = '1';

import { sanitizeChatMessage } from '../../src/handlers/chat/sanitize-message';
import { colourMarker, puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';

const LINE = puaForScreenCode(0x40);
const RED = colourMarker(2);
const BANK0 = String.fromCodePoint(0xe040);

describe('a chat line a caller drew', () => {
  it('keeps the cells and the pen', () => {
    expect(sanitizeChatMessage(`${RED}${LINE}${LINE} hi`)).toBe(`${RED}${LINE}${LINE} hi`);
  });

  it('still strips an escape sequence, which is somebody else’s screen', () => {
    expect(sanitizeChatMessage('\x1b[2Jgone')).toBe('[2Jgone');
  });

  it('refuses the charset bank the board does not run', () => {
    expect(sanitizeChatMessage(`a${BANK0}b`)).toBe('ab');
  });

  it('leaves an ordinary message exactly as it was', () => {
    expect(sanitizeChatMessage('hello everyone')).toBe('hello everyone');
  });
});
