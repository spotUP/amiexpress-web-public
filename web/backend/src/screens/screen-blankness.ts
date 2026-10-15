/**
 * Whether a screen file draws anything at all.
 *
 * A screen that DOES NOT EXIST and a screen that exists with nothing in it are
 * not the same thing to AmiExpress, and the difference is a keypress from the
 * caller. express.e:6773-6774:
 *
 *     IF (fh:=Open(filename,OLDFILE))<>0
 *       res:=TRUE
 *
 * `displayScreen` answers TRUE for any file that OPENS, whatever is in it, and
 * the display flow pauses on that answer - `IF displayScreen(SCREEN_BULL) THEN
 * doPause()` (express.e:28556, command.handler.ts:864). So an empty screen file
 * buys a full `(Pause)...Space To Resume:` on a blank terminal, while an ABSENT
 * one is skipped in silence.
 *
 * "i get an empty prompt after loging in with ansi mode ... it has been like
 * this for a while" (sysop, 2026-09-14). It was 272 tracked files of two bytes
 * - `~\n`, the MCI gate and a newline - and nobody was wrong at any step:
 * `Screens/LOGON.TXT` went 26 bytes, then 16, then 2, then 0 across three
 * sensible commits that each removed one MCI line.
 *
 * ONE DEFINITION, THREE CALLERS. The rule was written twice within an hour -
 * in `the-board-ships-no-blank-screen.test.ts`, which asks the REPOSITORY, and
 * in the login-sequence route, which asks whether an edit just emptied a file.
 * A third copy was about to be written for the health check. This is the
 * shared one; two copies of a rule about what a caller sees is how this board
 * collected its two-sources-of-truth bugs.
 */

import * as fs from 'fs';

/** Extensions the board loads as a screen. */
export const SCREEN_EXTENSIONS: ReadonlySet<string> =
  new Set(['.txt', '.ttx', '.seq', '.ans', '.rip', '.tti']);

/**
 * The directories a caller can be served from, relative to the board root.
 *
 * The question is what a CALLER can be shown, so the scope is where
 * `loadScreenFile` looks: the board root, `Screens/`, a node's own directory,
 * a conference's, and a theme's copy of any of those. An empty file anywhere
 * else is a fixture or build output and cannot reach a terminal.
 */
export const SERVED_PATH =
  /^(?:Screens\/|Node\d+\/|Conf\d+\/|Themes\/[^/]+\/|[^/]+\.(?:txt|ttx|seq|ans|rip|tti)$)/i;

/**
 * Would a caller shown this file see nothing?
 *
 * The leading `~` gate (express.e:6800-6806) and the MCI lines behind it are
 * instructions, not ink; a file made only of those draws nothing on its own.
 * `~SS_`, `~SR_`, `~SX_`, `~XI` and `~CC_` are the exception - an include, a
 * recursion or a door PUTS something on the screen - so a file carrying one of
 * those is not blank even though every line of it is a code.
 *
 * `~f` IS NOT AN EXCEPTION, deliberately. It clears; clearing is not drawing,
 * and a file of nothing but `~f|` is exactly the blank pause this exists to
 * find - it is also what the login-sequence picker would produce if unticking
 * the last item were allowed. Measured before deciding: of 813 tracked screens
 * on this board, ZERO are `~f` and nothing else, so the stricter rule costs
 * nothing today and closes the case the picker can create tomorrow.
 */
export function screenDrawsNothing(content: string | Buffer): boolean {
  const text = typeof content === 'string' ? content : content.toString('latin1');
  if (/~(?:SS_|SR_|SX_|XI|CC_)/.test(text)) return false;
  const withoutCodes = text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')   // ANSI
    .replace(/~[A-Za-z0-9_]*\|?/g, '')        // MCI, including the bare gate
    .replace(/[\s\x00\x0c\x1a]/g, '');        // whitespace, NULs, form feed, EOF
  return withoutCodes.length === 0;
}

/**
 * Would a caller shown the file at `filePath` see nothing?
 *
 * The same rule as `screenDrawsNothing`, asked about a path - which is what
 * RESOLUTION needs, because it is holding a candidate filename and has not
 * read it yet. It lives here rather than beside its caller for the reason
 * written at the top of this file: one definition. A second copy of it -
 * `screens/hollow-screen.ts`, written in parallel on 2026-09-14 - disagreed
 * with this one about a file made of nothing but `~f|` and about a file made
 * of nothing but ANSI escapes, and that is exactly how the board collects the
 * two-sources-of-truth bugs this module was created to end.
 *
 * A file that cannot be READ is not blank: that must never turn a permission
 * error or a race into a silently skipped screen. Resolution has already
 * established the name is there; an unreadable file is a different fault and
 * belongs to the loader's own error handling.
 *
 * Latin-1, never UTF-8: a screen carries Amiga high-bit bytes and a UTF-8
 * round trip turns 0xA1 into U+FFFD.
 */
export function screenFileDrawsNothing(filePath: string): boolean {
  try {
    // Cheap first: a zero-byte file is the common case and needs no read.
    if (fs.statSync(filePath).size === 0) return true;
    return screenDrawsNothing(fs.readFileSync(filePath));
  } catch {
    return false;
  }
}

/**
 * Does this screen DO something, as opposed to merely showing something?
 *
 * A screen file on this board is a program: `Node/logon20.txt` is 149 bytes
 * with no art in it at all, only which bulletins a caller sees, which doors
 * run at login and where the pauses fall. The distinction matters because a
 * THEME may own how the board looks and must not own what it does - a theme
 * carrying its own `logon20.txt` does not restyle the login, it forks it.
 * Six of this board's seven themes had done exactly that, byte-identically,
 * buying nothing and costing six copies that the first edit would fork
 * (`thoughts/shared/plans/2026-09-14-a-theme-owns-art-not-behaviour-design.md`).
 *
 * The codes that DO something are the ones that put someone else's bytes on
 * the screen or run something: `~SS_` and `~2S` include, `~nSR_` recurses,
 * `~SX_` includes conditionally, `~CC_` runs a command, `~XI` runs a door.
 * Colour, `~f`, `~SP` and the bare `~` gate are decoration and do not count -
 * the same split `screenDrawsNothing` above makes for the opposite question,
 * which is why the two live together.
 *
 * A file that is BOTH - art with an include at the end - counts as a program.
 * The conservative direction: mistaking art for a program costs a theme one
 * override it could get another way, while mistaking a program for art lets a
 * theme change the board's behaviour silently.
 */
export function screenIsProgram(content: string | Buffer): boolean {
  const raw = typeof content === 'string' ? content : content.toString('latin1');
  // `~~` is a literal tilde, not the start of a code - so `~~SS_` is the TEXT
  // "~SS_" and does nothing. Blanked before matching, exactly as
  // `locateMciReferences` does it, because two readers of one syntax that
  // disagree about an escape is how this board collects its bugs.
  const text = raw.replace(/~~/g, '  ');
  return /~(?:SS_|2S|\d*SR_|SX_|CC_|XI)/.test(text);
}

/**
 * Whether the board runs MCI in this screen at all.
 *
 * express.e:6800-6806 reads the FIRST line: `IF linedata[0]<>"~" THEN
 * allowMCI:=FALSE`. A screen whose first line does not open with a tilde is
 * shown as raw text, so every code in it - an include included - reaches the
 * caller as the characters it is spelled with. The display path and the
 * screen index both ask this, so they cannot disagree about a file.
 */
export function mciGateOpen(content: string | Buffer): boolean {
  const text = typeof content === 'string' ? content : content.toString('latin1');
  const firstNewline = text.indexOf('\n');
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  return firstLine.trimEnd().length > 0 && firstLine[0] === '~';
}

/**
 * The codes a screen RUNS, in order - its behaviour, with the art removed.
 *
 * `screenIsProgram` answers "does this do anything"; this answers "what does
 * it do", and the difference is what lets a theme restyle a screen without
 * being able to change it.
 *
 * A conference bulletin on this board is 1745 bytes of ANSI logo with one
 * `~SS_` at the end. Refusing a theme's copy outright - the first version of
 * the program rule - took the artist's LOGO away along with the behaviour he
 * should not have had. Comparing signatures instead says exactly what was
 * meant: same codes, different pixels, theme wins; different codes, the
 * board's copy wins and the theme is told why.
 *
 * Measured on the live board 2026-09-14, which is what forced the refinement:
 * of 53 theme copies of program screens, 32 match the board's codes exactly
 * and 21 do not - `Themes/607080/Conf/4/bull20.txt` adds `~XISUBSCAN` to the
 * board's `~SS_BBS:bulletins/bull9.txt`.
 *
 * Whitespace inside a code cannot occur (the syntax ends at one), so the
 * signature needs no normalisation beyond case: `~CC_GL` and `~CC_gl` run the
 * same command on a case-insensitive Amiga volume.
 */
export function screenProgramSignature(content: string | Buffer): string {
  const raw = typeof content === 'string' ? content : content.toString('latin1');
  const text = raw.replace(/~~/g, '  ');
  /*
   * THE TARGET STOPS AT AN ESCAPE, not only at whitespace.
   *
   * `h7`'s conference bulletins write `~SS_BBS:bulletins/bull9.txt` with a
   * colour code butted straight onto it and no space between, so a charset of
   * "anything but whitespace" swallowed `\x1b[37m` into the filename. Five of
   * the sysop's theme files then read as RUNNING something different from the
   * board's identical include, and their art was refused for it (found
   * 2026-09-14 by listing what the migration had left behind - the signature
   * printed the escape).
   *
   * An Amiga filename cannot contain an escape, so the code ends there.
   */
  const codes = text.match(/~(?:SS_|2S|\d*SR_|SX_|CC_|XI)[^\s|~\r\n\x1b]*/g) ?? [];
  return codes.map(code => code.toLowerCase()).join('\n');
}
