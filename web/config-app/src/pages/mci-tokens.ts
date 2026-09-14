/**
 * The MCI codes on the canvas, and where they sit.
 *
 * A screen is a program: `~CC_gwall|` runs a door, `~SS_` includes another
 * screen, `~nSR_` recurses, `~CL.` lists conferences. The editor highlights
 * them so a sysop drawing over one can see what they are about to break, and
 * shows a dead one in the alert colour.
 *
 * The patterns come from the board's own parser rather than a copy: the
 * backend's `mci-references.ts` already mirrors the loader in
 * `screen.handler.ts`, and a third set of regexes in the admin would be the
 * first to drift. Only the coordinates are this module's own work - the parser
 * counts characters in a string, and a canvas counts cells in a row.
 */

import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { locateMciReferences, type MciReference } from '@bbs/screens/mci-references';

/** What the index knows about a file's references - the shape the API sends. */
export type MciReferenceShape = MciReference;

export interface MciToken {
  code: MciReference['code'];
  target: string;
  /** Canvas row. */
  line: number;
  /** Canvas column of the tilde. */
  column: number;
  /** How many cells the code covers, so it can be highlighted. */
  length: number;
  /**
   * Whether the board could follow it. Only the index knows - a code the sysop
   * has just typed is not in it yet and is shown as unresolved rather than
   * claimed to work.
   */
  resolves: boolean;
}

// The four-template insert bar that used to live here is gone. It typed
// `~CC_command|` and left the sysop to know that `command` meant a door and to
// spell it right; MciPicker offers the board's own command icons, screens and
// doors instead, and every code rather than four.

export function findMciTokens(canvas: Cell[][], known: MciReferenceShape[]): MciToken[] {
  const tokens: MciToken[] = [];

  canvas.forEach((row, line) => {
    const text = row.map(cell => cell.char ?? ' ').join('');

    for (const found of locateMciReferences(text)) {
      const fact = known.find(k => k.code === found.ref.code && k.target === found.ref.target);

      tokens.push({
        code: found.ref.code,
        target: found.ref.target,
        line,
        column: found.at,
        length: found.text.length,
        resolves: fact?.resolves ?? false,
      });
    }
  });

  return tokens;
}

/**
 * The code the cursor is sitting on, or null.
 *
 * "on" means anywhere in the token, tilde to terminator - an artist pointing
 * at the middle of `~SS_BBS:Bulletins/bull6.txt` is pointing at that code, not
 * at nothing.
 */
export function tokenAt(tokens: MciToken[], line: number, column: number): MciToken | null {
  return tokens.find(
    t => t.line === line && column >= t.column && column < t.column + t.length,
  ) ?? null;
}

/**
 * What to tell the artist about the code under the cursor.
 *
 * "it would be nice if the editor explained what the mci codes in the screen
 * does as well" (the sysop, 2026-09-14). The editor already FOUND the codes
 * and outlined them - it drew a box round something without saying what it
 * was, which is the least useful half of knowing.
 *
 * Three facts, in the order they matter: what the code does, what this
 * particular one points at, and whether the board can actually follow it. The
 * third is the one a broken screen turns on, and it is the one the artist
 * cannot get any other way - `resolves` comes from the board's own index, so
 * "Nothing on this board answers to that" is a fact rather than a guess.
 *
 * A code the catalog does not describe still gets the other two: an unknown
 * code is exactly when somebody needs to be told it is unknown.
 */
export function explainToken(
  token: MciToken,
  catalog: { code: string; summary: string }[],
): { title: string; summary: string; target: string | null; broken: boolean } {
  const entry = catalog.find(c => c.code.toUpperCase() === token.code.toUpperCase());
  return {
    title: `~${token.code}`,
    summary: entry?.summary ?? 'Not a code this board knows.',
    target: token.target || null,
    broken: !token.resolves,
  };
}
