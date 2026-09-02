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

import { scanMciCodes } from './mci-catalog';

export type MciPlacement = 'none' | 'above' | 'below';

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
export function planMciCarry(oldText: string, newText: string): CarryPlan {
  const plan: CarryPlan = { head: [], tail: [], lost: [], uploadHasCodes: false };

  if (scanMciCodes(newText).some(found => found.entry || found.text === '~')) {
    plan.uploadHasCodes = true;
    return plan;
  }

  const lines = oldText.split('\n').map(l => l.replace(/\r$/, ''));
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
      if (codeLine[i]) plan.head.push(line);
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
 * `placement` says which block leads: `above` puts the head where it was and
 * appends the tail after the art, `below` puts everything after the art.
 * Neither ever writes into the art itself.
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

  const above = placement === 'above' ? plan.head : [];
  const below = placement === 'above' ? plan.tail : carried;

  const lines: string[] = [...above];
  // MCI runs only when the FIRST line starts with a tilde. With everything
  // below the art there is no first-line tilde, so one is added; it is the
  // switch, not a drawing.
  if (lines.length === 0) lines.push('~');

  const head = lines.join(ending) + ending;
  const tail = below.length ? below.join(ending) + ending : '';

  return head + body + (body.endsWith(ending) || body === '' ? '' : ending) + tail + trailer;
}
