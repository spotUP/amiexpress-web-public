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
import { scanMciCodes } from '@bbs/screens/mci-catalog';

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

    const covered: number[] = [];

    // The codes that NAME something - `~CC_door`, `~SS_screen`, `~<n>SR_` -
    // because only those have a target the index can say resolves or not.
    for (const found of locateMciReferences(text)) {
      const fact = known.find(k => k.code === found.ref.code && k.target === found.ref.target);

      covered.push(found.at);
      tokens.push({
        code: found.ref.code,
        target: found.ref.target,
        line,
        column: found.at,
        length: found.text.length,
        resolves: fact?.resolves ?? false,
      });
    }

    /*
     * AND EVERY OTHER CODE IN THE LINE.
     *
     * This used to find FOUR shapes, so a screen whose codes are `~f`, `~SP`
     * or anything the board added later showed an empty list and - once the
     * list gained a toggle - no toggle either: "i see only the F code and i
     * see no code toggle" (sysop, 2026-09-18).
     *
     * `scanMciCodes` is the board's own scanner, the one the carry uses: it
     * takes any `~token` whether the catalog knows it or not, which is why
     * `~XISUBSCAN` - in no catalog anywhere - is carried correctly on a
     * replace. "screen files can have a big variety of mci codes", and the
     * editor now sees the same variety the board does.
     *
     * These name nothing, so there is nothing to resolve and they are not
     * drawn as broken.
     */
    for (const found of scanMciCodes(text)) {
      if (covered.includes(found.at)) continue;
      if (found.text === '~~') continue;

      tokens.push({
        code: (found.entry?.code ?? found.text.replace(/^~\d*/, '')) as MciToken['code'],
        target: '',
        line,
        column: found.at,
        length: found.text.length,
        resolves: true,
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
  /*
   * THE TOKEN'S CODE IS NOT SPELLED LIKE THE CATALOG'S.
   *
   * `locateMciReferences` reports the four codes that POINT at something as
   * `CC`/`SS`/`SR`/`CL`, and the catalog carries them as `CC_`, `SS_`, `SR_`
   * and - alone among them - a bare `CL`, because the underscore is part of
   * the code's syntax for the ones that take a target. Matching on equality
   * found nothing for three of the four, silently: every include and every
   * command would have been reported as a code this board does not know.
   *
   * The type checker caught it. `MciToken['code']` is a four-way union, so a
   * test written with the catalog's spelling would not compile - which is the
   * only reason this was found before it shipped.
   */
  const want = token.code.toUpperCase();
  const entry = catalog.find(c => {
    const code = c.code.toUpperCase();
    return code === want || code === `${want}_`;
  });
  /*
   * Titled as it appears ON THE SCREEN, which is the catalog's spelling when
   * there is one: the artist is looking at `~SS_BBS:Bulletins/bull6.txt`, and
   * a panel that called it `~SS` would be naming something they cannot see.
   */
  return {
    title: `~${entry?.code ?? token.code}`,
    summary: entry?.summary ?? 'Not a code this board knows.',
    target: token.target || null,
    broken: !token.resolves,
  };
}
