/**
 * "Is this SCREEN art?" for the PETSCII text fallback (C64/40-col Task 7).
 *
 * The strategy plan's Phase 2.3 rule is "never emit smeared art": an
 * 80-column ANSI art screen reflowed to 40 columns is always wrong, and a
 * clean ASCII token beats a picture cut in half. Most of this board's
 * screens have no `.seq` variant (the census found `.seq` art for BBSTITLE
 * and Logoff only), so a C64 caller reaches the `.TXT`/`.ANS` and something
 * has to decide, per screen, between reflow and skip.
 *
 * WHAT THIS MODULE IS NOT: a third art detector. The row-level heuristic is
 * the SDK's frozen pair - `looksLikeAsciiArt` and
 * `positionsCursorAbsolutely`, re-exported by ./ascii-art.util - which the
 * 80-column path already uses in xim/io.ts's line-wrap safety net and in
 * `wrapForSession`. Writing a private glyph-density regex here would give
 * the board two answers to one question, and they would drift. All this
 * module adds is SCREEN-LEVEL POLICY: how many art rows make a screen art.
 *
 * The policy, and why it is a share and not "any row":
 *  - ANY absolute cursor motion anywhere -> art. A screen that moves the
 *    cursor to a row and column is composing at fixed coordinates; it has
 *    no lines to wrap, and rewrapping moves everything after the break
 *    somewhere the author never asked for. This is the same rule
 *    `wrapForSession` already applies to door payloads. Bulletins/bull7.txt
 *    (a `\x1b[22C`-indented BBS list) and Screens/uprough.txt (a one-line
 *    positioned ANSImation) are caught here.
 *  - Otherwise a VOTE over non-blank rows: BOTH a share above ART_ROW_SHARE
 *    and an absolute floor of MIN_ART_ROWS art rows. "Any art row wins" was
 *    tried on paper and is wrong - `looksLikeAsciiArt` calls a bare `======`
 *    divider art, and Screens/PRIVACY.TXT, the screen a C64 caller most
 *    needs to READ, opens with two of them.
 *  - The FLOOR is what makes the share safe on SHORT screens, where one or
 *    two decorative rows dominate any ratio. A seven-row bulletin with a
 *    centred title (a >= 33-column indent is art) and two rules scores
 *    3/7 = 0.43; a three-row notice scores 2/3 = 0.67. Both are prose a C64
 *    caller must be able to read. A row-count minimum does not help - three
 *    rows is not fewer than three - but an ART-ROW floor does, and it costs
 *    nothing: the art file on this board with the fewest art rows is
 *    Screens/Logon24hrs.txt at exactly 6 of 12, so MIN_ART_ROWS = 6 keeps
 *    every current art file art. Screens/LOGON.TXT (the two bytes `~\n`,
 *    one art row at 1-of-1) falls under it too.
 *  - MENUS ARE NEVER SKIPPED, whatever they score - see
 *    `petsciiTextScreenPlan`'s `isMenu`.
 *
 * Both constants were measured, not guessed, against every screen and
 * bulletin on this board (art-rows / non-blank-rows, SGR stripped; files
 * marked * are already art by rule 1, cursor positioning):
 *
 *   art:   uprough 1/1* 1.00   flt 1/1* 1.00      BBSTITLE 64/65 0.98
 *          bull9 25/26 0.96    _uprough 13/14 0.93  bbb 21/23* 0.91
 *          bull6 29/33 0.88    lastc 28/33 0.85   bull2-5 16/21 0.76
 *          MENU250 17/23 0.74  bull1 15/21 0.71   bull11 15/27 0.56
 *          Logon24hrs 6/12 0.50  MENU 9/20 0.45   no_upload 7/16* 0.44
 *   prose: PRIVACY 4/16 0.25  bull10 4/17 0.24   bull7 15/70* 0.21
 *          BullHelp 1/5 0.20  quicknew 0/23      logon20 0/6
 *          bull8 0/14         quicknew2 0/3      bull12 0/1
 *          uploadmsg 0/1      LOGON 1/1          MAILSCAN 0/0
 *          LOGOFF 0/0
 *
 * Nothing on the board lands between 0.25 and 0.45, so 0.35 sits in the
 * middle of an empty band - the most robust point available.
 */
import { looksLikeAsciiArt, positionsCursorAbsolutely } from './ascii-art.util';

/** ASCII token per the strategy plan - the board never uses emoji or icons in BBS output. */
export const ANSI_ART_SKIPPED_NOTICE = '[80-COLUMN ANSI SCREEN - SKIPPED]\r\n';

/** Share of non-blank rows that must look like art before the whole screen is art. */
export const ART_ROW_SHARE = 0.35;

/**
 * Absolute floor: fewer art rows than this and the screen is prose whatever
 * the share says. Set to the lowest art-row count on the board
 * (Screens/Logon24hrs.txt, 6 of 12) - raising it starts reflowing pictures.
 */
export const MIN_ART_ROWS = 6;

/** Any CSI sequence - stripped before the row vote so colour never counts as symbols. */
const ANSI_SEQUENCE_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

/**
 * True when this screen must be shown as-is or not at all, never reflowed.
 * Pure: no session, no width - the caller decides what to do with the answer.
 */
export function isAnsiArtScreen(content: string): boolean {
  if (!content) return false;

  // A layout at absolute coordinates is never a paragraph.
  if (positionsCursorAbsolutely(content)) return true;

  const rows = content
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(ANSI_SEQUENCE_RE, ''))
    .filter((line) => line.trim().length > 0);

  const artRows = rows.filter((line) => looksLikeAsciiArt(line)).length;
  return artRows >= MIN_ART_ROWS && artRows / rows.length > ART_ROW_SHARE;
}

/**
 * What `displayScreen` should do with a text screen for this session.
 * `'passthrough'` for every non-PETSCII session, which is what keeps the
 * 80-column path byte-identical.
 *
 * `isMenu` forces `'reflow'`: a MENU is the one screen a caller cannot do
 * without. Screens/MENU.TXT scores 0.45 and MENU250.TXT 0.74 - both art -
 * there is no MENU*.seq to fall back to, and MENU is in
 * SCREENS_REQUIRE_CLEAR, so skipping one left a C64 caller looking at a
 * cleared screen, the skip token, and no command list. A folded menu is
 * navigable; a skipped one is not (strategy plan Phase 2.4: menus get a
 * .seq WITH a text fallback through the reflow).
 */
export function petsciiTextScreenPlan(
  content: string,
  session: { petsciiMode?: boolean } | undefined,
  isMenu: boolean = false
): 'art-skip' | 'reflow' | 'passthrough' {
  if (session?.petsciiMode !== true) return 'passthrough';
  if (isMenu) return 'reflow';
  return isAnsiArtScreen(content) ? 'art-skip' : 'reflow';
}
