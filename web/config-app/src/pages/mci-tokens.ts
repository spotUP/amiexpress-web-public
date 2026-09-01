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

/** The four codes this board's screens actually carry - 252 SS, 173 CC, 108 SR, 42 CL. */
export const MCI_INSERTS: { code: MciReference['code']; label: string; template: string }[] = [
  { code: 'CC', label: 'Run a command', template: '~CC_command|' },
  { code: 'SS', label: 'Include a screen', template: '~SS_BBS:Screens/name.txt' },
  { code: 'SR', label: 'Include and recurse', template: '~SR_BBS:Screens/name.txt' },
  { code: 'CL', label: 'List the conferences', template: '~CL.' },
];

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
