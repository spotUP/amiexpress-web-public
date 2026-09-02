/**
 * A screen that is nothing but codes is plumbing, not art.
 *
 * Asked for in those terms: "can we add filters so the user can select to
 * filter out screens with only codes and generated screens ... so the ansi
 * artists only see the screens they should touch".
 *
 * Measured on the live board when the rule was written: 400 files of art, 258
 * of pure codes, 5 empty and 6 the board writes itself. Eleven distinct screen
 * names account for all 258 - AWAITSCREEN is one code, LOGON10 is four
 * includes and a pause - and the art each of them PULLS IN is its own file,
 * which stays visible.
 */
process.env.SKIP_DB_INIT = '1';

import { isCodesOnly } from '../../src/screens/screen-index.service';

describe('telling plumbing from art', () => {
  it('knows a screen that only runs a door', () => {
    // AWAITSCREEN.TXT, 47 copies of it on this board.
    expect(isCodesOnly('~CC_V-AWAIT|\r\n')).toBe(true);
  });

  it('knows a screen that only pulls other screens in', () => {
    // LOGON10.TXT: includes, a pause, and nothing of its own.
    expect(isCodesOnly('~SS_BBS:screens/flt.txt ~f ~SP ~SS_BBS:screens/reference-board.txt\r\n')).toBe(true);
  });

  it('knows a numbered-pool include', () => {
    expect(isCodesOnly('~ ~3SR_WORK:bbs/Screens/logoff/logoff\r\n')).toBe(true);
  });

  it('counts a lone tilde as plumbing', () => {
    // JOINED.TXT is two bytes: a tilde and a newline.
    expect(isCodesOnly('~\r\n')).toBe(true);
  });

  it('does not mistake art with codes in it for plumbing', () => {
    // The common case, and the one that must never be hidden: a piece of art
    // that also carries a code or two.
    expect(isCodesOnly('\x1b[31m░▒▓ UP ROUGH ▓▒░\r\n~SP\r\n')).toBe(false);
  });

  it('does not mistake colour-only art for plumbing', () => {
    // Escapes are stripped, so what is left has to be the drawing itself.
    expect(isCodesOnly('\x1b[1;32mHELLO\x1b[0m')).toBe(false);
  });

  it('treats whitespace around the codes as nothing', () => {
    expect(isCodesOnly('  ~SP \t\r\n  ~f  \r\n')).toBe(true);
  });

  it('says a file with only art is art', () => {
    expect(isCodesOnly('███')).toBe(false);
  });
});
