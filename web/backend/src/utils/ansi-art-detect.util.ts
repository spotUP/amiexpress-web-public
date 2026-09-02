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
 *  - Otherwise a VOTE over non-blank rows. "Any art row wins" was tried on
 *    paper and is wrong: `looksLikeAsciiArt` calls a bare `======` divider
 *    art, and Screens/PRIVACY.TXT - the one screen a C64 caller most needs
 *    to read - opens with two of them. A divider is decoration on a page of
 *    prose, not a picture.
 *  - Screens with fewer than MIN_ROWS_FOR_ART_VOTE non-blank rows are never
 *    art by vote: Screens/LOGON.TXT is a bare `~` MCI directive, which
 *    `looksLikeAsciiArt` calls art, and at 1-of-1 rows a share rule would
 *    replace the whole logon flow with the skip token.
 *
 * ART_ROW_SHARE was measured, not guessed, against every screen and
 * bulletin on this board (art-rows / non-blank-rows, SGR stripped):
 *
 *   art:   uprough 1.00  flt 1.00  BBSTITLE 0.98  bull9 0.96  bbb 0.91
 *          bull6 0.88  lastc 0.85  bull2-5 0.76  MENU250 0.74  bull1 0.71
 *          bull11 0.56  Logon24hrs 0.50  MENU 0.45
 *   prose: PRIVACY 0.25  bull10 0.24  bull7 0.21  BullHelp 0.20
 *          quicknew/logon20/bull8/bull12 0.00
 *
 * Nothing on the board lands between 0.25 and 0.45, so 0.35 sits in the
 * middle of an empty band - the most robust point available.
 */
import { looksLikeAsciiArt, positionsCursorAbsolutely } from './ascii-art.util';

/** ASCII token per the strategy plan - the board never uses emoji or icons in BBS output. */
export const ANSI_ART_SKIPPED_NOTICE = '[80-COLUMN ANSI SCREEN - SKIPPED]\r\n';

/** Share of non-blank rows that must look like art before the whole screen is art. */
export const ART_ROW_SHARE = 0.35;

/** Below this many non-blank rows a screen is too small to vote on. */
export const MIN_ROWS_FOR_ART_VOTE = 3;

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

  if (rows.length < MIN_ROWS_FOR_ART_VOTE) return false;

  const artRows = rows.filter((line) => looksLikeAsciiArt(line)).length;
  return artRows / rows.length > ART_ROW_SHARE;
}

/**
 * What `displayScreen` should do with a text screen for this session.
 * `'passthrough'` for every non-PETSCII session, which is what keeps the
 * 80-column path byte-identical.
 */
export function petsciiTextScreenPlan(
  content: string,
  session: { petsciiMode?: boolean } | undefined
): 'art-skip' | 'reflow' | 'passthrough' {
  if (session?.petsciiMode !== true) return 'passthrough';
  return isAnsiArtScreen(content) ? 'art-skip' : 'reflow';
}
