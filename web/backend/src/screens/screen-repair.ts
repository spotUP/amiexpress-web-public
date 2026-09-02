import * as fs from 'fs';

/**
 * Putting the escape byte back in front of a screen's colour codes.
 *
 * 47 files on this board hold `[0;1;31m` with the ESC gone - a text-mode copy
 * somewhere in their history ate it - so a caller sees the codes printed
 * instead of the colour. The damage is mechanical: a CSI sequence is ESC + `[`
 * + parameters + a final letter, and these files carry all of it but the ESC.
 *
 * Narrow on purpose. A file with ANY escape byte in it is refused, because
 * then a bare `[` might be art rather than damage - `[bracket]` in a logon
 * screen is a real thing. And a backup is written first, the same one a delete
 * writes.
 *
 * It lives here, not in the route that first needed it, because the health
 * page offers the same repair. A second implementation behind that button
 * would be a second chance to write an escape byte into somebody's art.
 */
export type ScreenRepair = { repaired: number } | { refused: string };

export function repairOneFile(full: string): ScreenRepair {
  let text: string;
  try {
    text = fs.readFileSync(full, 'latin1');
  } catch (error) {
    return { refused: (error as Error).message };
  }

  if (text.includes('\x1b')) {
    return {
      refused: 'This file already contains escape bytes, so a bare [ may be art rather than damage. Nothing was changed.',
    };
  }

  // The final byte of a CSI sequence is what says where it ends: m for colour,
  // H for cursor position, J for clear, and the rest of the set.
  const CSI = /\[([0-9;?]*)([A-Za-z])/g;
  const matches = text.match(CSI);
  if (!matches || matches.length === 0) {
    return { refused: 'No colour codes found in this file - there is nothing to repair.' };
  }

  const repaired = text.replace(CSI, (_full, params, final) => `\x1b[${params}${final}`);

  try {
    fs.copyFileSync(full, `${full}.backup`);
    fs.writeFileSync(full, repaired, 'latin1');
  } catch (error) {
    return { refused: (error as Error).message };
  }

  return { repaired: matches.length };
}
