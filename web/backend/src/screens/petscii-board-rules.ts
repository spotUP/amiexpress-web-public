/**
 * THE C64 RULES, ASKED OF A FILE THE BOARD HOLDS.
 *
 * `sdk/petscii/board-rules.ts` replays a `.seq` through `PetsciiMachine` and
 * answers what it breaks: art drawn in the graphics bank, a background that is
 * not black (sysop, 2026-09-14, decided 2026-09-17). This is the board's side
 * of that call, and it exists for one reason - THE CODES ARE NOT ART.
 *
 * A screen the editor saves with the MCI gate opens `~D|`, and a bulletin
 * opens `~f|`. Handed to the machine raw, those five bytes print as GLYPHS
 * before the file has said which bank it wants, and every gated screen on the
 * board reads as "three cells in the graphics bank" - false, and loud enough
 * to bury the twenty files that really are wrong. The renderer never draws
 * them either: `applyMciPrePasses` takes them out before the machine sees a
 * byte (`petscii-screen.render.ts`).
 *
 * So the codes come out here first, with the board's own scanner - the same
 * one the carry and the census use - and what is left is what a caller's C64
 * would actually paint.
 *
 * What this deliberately does NOT do is judge the TEXT a code expands to. A
 * `~f` in the graphics bank does draw glyphs a caller sees, but its bytes are
 * not in the file and its width is not known until the screen runs; a file
 * whose only drawing is an MCI value goes unreported rather than guessed at.
 */
import {
  checkBoardRules, boardRulesReason, type BoardRuleViolation,
} from '@amiexpress/bbs-door-sdk/petscii';

import { scanMciCodes } from './mci-catalog';

export type { BoardRuleViolation };

/** Is this a file the C64 rules apply to at all? The extension is what the loader routes on. */
export function isSeqPath(relPath: string): boolean {
  return relPath.toLowerCase().endsWith('.seq');
}

/**
 * The bytes the machine would draw: the file with its MCI codes removed.
 *
 * latin1 both ways - a screen carries high-bit bytes and a UTF-8 round trip
 * turns one into U+FFFD.
 */
export function artBytesWithoutMci(bytes: Buffer): Buffer {
  const text = bytes.toString('latin1');
  const codes = scanMciCodes(text).slice().sort((a, b) => a.at - b.at);
  if (!codes.length) return bytes;

  let out = '';
  let cursor = 0;
  for (const code of codes) {
    if (code.at < cursor) continue; // overlapping scan result: keep the first
    out += text.slice(cursor, code.at);
    cursor = code.at + code.text.length;
    /*
     * AND THE TERMINATOR, which the scan does not carry.
     *
     * `scanMciCodes` reports `~D` for the gate `~D|` - the `|` is that code's
     * ARGUMENT - and `~f` for `~f|`, where the `|` ends the code. Left behind,
     * that one byte prints as a glyph before the file has chosen a bank, and
     * every gated screen on the board reads as art in the graphics bank. The
     * renderer never draws it either.
     */
    if (text[cursor] === '|') cursor++;
  }
  out += text.slice(cursor);
  return Buffer.from(out, 'latin1');
}

/** What this `.seq` breaks, if anything. An empty array is a screen the board can show as drawn. */
export function checkPetsciiBoardRules(bytes: Buffer): BoardRuleViolation[] {
  return checkBoardRules(artBytesWithoutMci(bytes));
}

/**
 * The refusal for a write, or null to let it through.
 *
 * Only a `.seq` is judged: an ANSI screen is not a C64 screen, and the rules
 * are about what a C64 paints.
 */
export function petsciiRuleRefusal(relPath: string, bytes: Buffer): string | null {
  if (!isSeqPath(relPath)) return null;
  const violations = checkPetsciiBoardRules(bytes);
  return violations.length ? boardRulesReason(violations) : null;
}
