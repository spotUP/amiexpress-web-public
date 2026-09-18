/**
 * Keeping a screen's MCI codes when its art is replaced.
 *
 * A screen here is a PROGRAM: `~SS_` includes, `~CC_` command invocations,
 * `~SP` pauses. A designer draws in PabloDraw, which knows nothing about any
 * of that, and uploads the result over the top - so every code in the file
 * being replaced is gone, silently. The menu still paints and the keys stop
 * working.
 *
 * Two rules, both the sysop's (2026-09-02):
 *
 *   - **The upload wins.** If the replacement carries any code of its own it
 *     is the whole truth and nothing is carried, so retyping the codes is how
 *     a sysop takes exact control. The carry runs only for a file with no
 *     codes at all, which is what an ANSI editor produces.
 *   - **Per target.** A fan-out reads each target's OWN old file, so
 *     `Node1/LOGON.TXT` keeps `~SS_BBS:Node1/BBSTITLE.txt` and node 7 keeps
 *     node 7's. One set taken from the first target would hand every node
 *     node 1's screen.
 *
 * Where the codes go is measured, not assumed. Across the 377 files on this
 * board that carry codes, 439 sit in the first three lines and 272 in the last
 * three - a head block and a tail block, exactly as the sysop described. The
 * 78 in between cannot be placed around new art by any rule, so they are
 * REPORTED and lost rather than guessed at.
 */

import { scanMciCodes, type ScannedMciCode } from './mci-catalog';

/**
 * Where a carried code goes when new art replaces old.
 *
 * `keep` - EACH CODE STAYS ON THE SIDE IT WAS ON. The head block goes back
 *   above the drawing and the tail block back below it, which is how a screen
 *   was written and what it means: a `~f` clears before the logo, and a `~SP`
 *   pauses after it. "they need to be kept where they are in the logo i
 *   replace" (sysop, 2026-09-18).
 * `below` - everything after the art, for a screen whose codes are a tail
 *   anyway and whose new drawing wants the top row.
 * `none` - the upload as it is, codes dropped.
 * `above` - the old spelling of `keep`, kept because a browser holding the
 *   previous admin bundle still sends it. It never meant "all of them above":
 *   it put the head above and the tail below, which is what `keep` says.
 */
export type MciPlacement = 'none' | 'keep' | 'below' | 'above';

/** A code that cannot be carried, and where it was, so a sysop can put it back. */
export interface LostMciCode {
  text: string;
  /** 1-based, in the file being replaced. */
  line: number;
}

export interface CarryPlan {
  /** Whole lines of codes above the art, in order. */
  head: string[];
  /** Whole lines of codes below the art, in order. */
  tail: string[];
  /** Codes on a line that also carries art, or a code line between art lines. */
  lost: LostMciCode[];
  /** True when the replacement has codes of its own, so nothing is carried. */
  uploadHasCodes: boolean;
}

/** The line ending a file already uses, so a carry does not mix them. */
function lineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Whether a line is codes and nothing else.
 *
 * Blanking every code and asking what is left is the only test that survives
 * the shapes this board actually writes: `~ ~3SR_bbs:Screens/logoff` and
 * `~SS_BBS:bulletins/bull6.txt| ~SP` are both code lines, and neither matches
 * any single pattern.
 */
export function isCodeOnlyLine(line: string): boolean {
  return isCodeLine(line);
}

function isCodeLine(line: string): boolean {
  if (!line.trim()) return false;

  const codes = scanMciCodes(line);
  if (codes.length === 0) return false;

  let blanked = line;
  for (const found of codes) {
    blanked = blanked.slice(0, found.at) + ' '.repeat(found.text.length) + blanked.slice(found.at + found.text.length);
  }
  return blanked.trim().length === 0;
}

/**
 * What an upload would carry across, and what it would lose.
 *
 * `oldText` and `newText` are latin1 - a screen carries Amiga high-bit bytes,
 * and a UTF-8 round trip turns one into U+FFFD.
 */

/** A scanned code that is the screen CLEAR and nothing else - `~f`, `~F`, `~2f`. */
function isClearScreen(found: ScannedMciCode): boolean {
  return /^~\d{0,3}f$/i.test(found.text);
}

/** A whole line whose every code is a clear, and which holds no art. */
function isClearOnlyLine(line: string): boolean {
  const codes = scanMciCodes(line);
  return codes.length > 0 && codes.every(isClearScreen) && isCodeLine(line);
}

export function planMciCarry(oldText: string, newText: string): CarryPlan {
  const plan: CarryPlan = { head: [], tail: [], lost: [], uploadHasCodes: false };

  /*
   * `~f` DOES NOT COUNT AS THE UPLOAD HAVING CODES.
   *
   * The rule above is "the upload wins": a replacement carrying codes of its
   * own is the whole truth, so nothing is carried. That is right for a file a
   * sysop typed codes into, and wrong for the one code an ANSI editor puts
   * there by itself - `~f`, the screen clear, which is furniture at the top of
   * the drawing rather than a program.
   *
   * The sysop met it on `Conf2/bull20.txt` (2026-09-16): new art whose only
   * code was a leading `~f` silently took `~SP` and `~CC_ctop` - a pause and a
   * door invocation - out of the bulletin. The screen still painted and the
   * door stopped running, which is exactly the failure this module exists to
   * prevent.
   *
   * Matched on the scanner's own shape rather than the literal two bytes, so a
   * repeat count (`~2f`) and an upper-case `~F` are the same furniture.
   */
  const uploadCodes = scanMciCodes(newText).filter(found => found.entry || found.text === '~');
  if (uploadCodes.some(found => !isClearScreen(found))) {
    plan.uploadHasCodes = true;
    return plan;
  }
  /** The upload brought its own clear, so a carried one would fire twice. */
  const uploadClears = uploadCodes.some(isClearScreen);

  /*
   * THE OLD FILE'S SAUCE IS NOT ITS LAST LINE OF ART.
   *
   * `applyMciCarry` has always cut the record off the NEW text before putting
   * codes back. This did not cut it off the OLD one, so the 128 bytes of
   * metadata - "SAUCE00 ... Amiga Topaz 1+" - read as a line that is neither
   * blank nor code, `lastArt` landed on IT, and every code sitting BELOW the
   * drawing was therefore "among the art" and reported lost.
   *
   * Every screen an ANSI editor has ever saved carries one, so this quietly
   * dropped the tail of the most-edited files on the board. Met head-on when
   * replacing `Conf2/bull20.txt`: `~SP`, `~f`, `~CC_ctop` and `~XISUBSCAN`
   * all reported lost, with only the `~f` at the top surviving.
   */
  const lines = oldText.slice(0, sauceOffset(oldText)).split('\n').map(l => l.replace(/\r$/, ''));
  const codeLine = lines.map(isCodeLine);

  let firstArt = 0;
  while (firstArt < lines.length && (codeLine[firstArt] || !lines[firstArt].trim())) firstArt++;

  let lastArt = lines.length - 1;
  while (lastArt >= 0 && (codeLine[lastArt] || !lines[lastArt].trim())) lastArt--;

  // No art at all: the whole file is codes, and all of it is the head.
  if (firstArt >= lines.length) {
    plan.head = lines.filter((_, i) => codeLine[i]);
    return plan;
  }

  lines.forEach((line, i) => {
    if (i < firstArt) {
      // A head line that is only the clear is dropped when the upload already
      // carries one: two clears in a row blank the screen twice.
      if (codeLine[i] && !(uploadClears && isClearOnlyLine(line))) plan.head.push(line);
      return;
    }
    if (i > lastArt) {
      if (codeLine[i]) plan.tail.push(line);
      return;
    }
    // Between the first and last art line: a code here sits among the drawing
    // and has no place around new art.
    for (const found of scanMciCodes(line)) {
      if (found.entry || found.text === '~') {
        plan.lost.push({ text: found.text, line: i + 1 });
      }
    }
  });

  return plan;
}

/**
 * The uploaded bytes with the old file's codes put back around them.
 *
 * `placement` says where they land: `keep` puts each block back on the side it
 * was written on - head above the art, tail below it - and `below` puts every
 * carried code after the art. Neither ever writes into the art itself.
 *
 * The enabling tilde is not optional. The board parses codes only when the
 * first line starts with one, so a carry whose codes would all land BELOW the
 * art has to put a tilde on the first line or it has carried nothing that
 * runs.
 */
/**
 * Where the art ends and the art program's own metadata begins.
 *
 * An ANSI editor appends a SAUCE record - 128 bytes, conventionally preceded
 * by an EOF (0x1A) - carrying the title, author and group. The gallery reads
 * it to credit the artist, and the board's `stripSauceMetadata` cuts the file
 * from that marker onward before a caller ever sees it.
 *
 * Both of which mean a carried code must go BEFORE it. Appended after, the
 * SAUCE stops being the last 128 bytes so no reader finds it - the editor
 * renders it as text on the canvas - and the board, which cuts from the
 * marker, throws away the very codes the carry promised to keep.
 */
function sauceOffset(text: string): number {
  const marker = text.lastIndexOf('SAUCE00');
  if (marker === -1 || marker < text.length - 512) return text.length;

  return text[marker - 1] === '\x1a' ? marker - 1 : marker;
}

export function applyMciCarry(newText: string, plan: CarryPlan, placement: MciPlacement): string {
  if (placement === 'none' || plan.uploadHasCodes) return newText;

  const carried = [...plan.head, ...plan.tail];
  if (carried.length === 0) return newText;

  const ending = lineEnding(newText);
  const cut = sauceOffset(newText);
  const body = newText.slice(0, cut);
  const trailer = newText.slice(cut);

  // `keep` (and its old spelling `above`): each block back on its own side.
  const asWritten = placement !== 'below';
  const above = asWritten ? plan.head : [];
  const below = asWritten ? plan.tail : carried;

  const lines: string[] = [...above];
  // MCI runs only when the FIRST line starts with a tilde. With everything
  // below the art there is no first-line tilde, so one is added; it is the
  // switch, not a drawing.
  if (lines.length === 0) lines.push('~');

  const head = lines.join(ending) + ending;
  const tail = below.length ? below.join(ending) + ending : '';

  return head + body + (body.endsWith(ending) || body === '' ? '' : ending) + tail + trailer;
}

/**
 * The code-only lines that top and tail a screen, and the art between them.
 *
 * The ANSI editor loads a file's rows onto a canvas, so a code sitting on its
 * own row is just characters a sysop can type over or delete - "i removed
 * lines in the art, did i remove codes? that should not be possible" (the
 * sysop, 2026-09-16). The editor asks for this split and edits `art` only, so
 * the codes are never on the canvas to lose; the carry puts them back on save.
 *
 * Measured against the same head/tail rule `planMciCarry` uses, so the two
 * cannot disagree about what a code line is.
 */
export function splitScreenCodes(text: string): { head: string[]; art: string; tail: string[] } {
  const ending = lineEnding(text);
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const codeLine = lines.map(isCodeLine);

  let firstArt = 0;
  while (firstArt < lines.length && (codeLine[firstArt] || !lines[firstArt].trim())) firstArt++;
  let lastArt = lines.length - 1;
  while (lastArt >= 0 && (codeLine[lastArt] || !lines[lastArt].trim())) lastArt--;

  // A file that is all codes has no art to edit; it is head and nothing else.
  if (firstArt >= lines.length) {
    return { head: lines.filter((_, i) => codeLine[i]), art: '', tail: [] };
  }

  return {
    head: lines.slice(0, firstArt).filter((_, i) => codeLine[i]),
    art: lines.slice(firstArt, lastArt + 1).join(ending),
    tail: lines.slice(lastArt + 1).filter((_, i) => codeLine[lastArt + 1 + i]),
  };
}
