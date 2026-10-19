/**
 * Level 1.5 page decoding that sits between the state machine and the
 * renderer (ETSI EN 300 706, levels plan E2-E3): which two G0 sets a page
 * uses, and the X/26 characters it places on the grid.
 */
import type { TeletextSubpage, Triplet } from './marco/model/types';
import type { PageGrid } from './marco/state-machine/types';
import { composeDiacritic, designationForSubset, g0Char, g2Char } from './marco/render-ansi/charsets';
import { LAST_DISPLAY_ROW, localEnhancementTriplets } from './enhancement';

/** The page's default G0 designation and its second G0 (what ESC switches to). */
export interface PageCharsets {
  primary: number | null;
  second: number | null;
}

/**
 * s.9.4.2 / s.9.5.1: X/28/0 format 1 wins over M/29/0, which wins over the
 * header's C12-C14 (family 0). Triplet 1 bits 7-13 are the default
 * designation, bits 14-17 plus triplet 2 bits 0-2 the second; 0x7F there
 * means no second set, and ESC then stays on the default. Only page
 * function 0 (basic Level 1 page) and coding 0 are read.
 */
export function resolvePageCharsets(subpage: TeletextSubpage): PageCharsets {
  const header = designationForSubset(subpage.languageSubset);
  const packets = subpage.enhancement ?? [];
  const pick = (packet: 28 | 29) =>
    packets.find((p) => p.packet === packet && p.designation === 0 && p.triplets[0] && p.triplets[1]);
  const source = pick(28) ?? pick(29);
  if (!source) return { primary: header, second: header };
  const v1 = tripletBits(source.triplets[0]!);
  const v2 = tripletBits(source.triplets[1]!);
  if ((v1 & 0x0f) !== 0) return { primary: header, second: header };
  const primary = (v1 >> 7) & 0x7f;
  const second = ((v1 >> 14) & 0x0f) | ((v2 & 0x07) << 4);
  return { primary, second: second === 0x7f ? primary : second };
}

function tripletBits(t: Triplet): number {
  return (t.address & 0x3f) | ((t.mode & 0x1f) << 6) | ((t.data & 0x7f) << 11);
}

/** Row-address triplet (address 40-63) -> display row: 40 is row 24, 41-63 rows 1-23 (s.12.3.1). */
function rowOf(t: Triplet): number {
  if (t.mode === 0x07 && t.address === 63) return 0;
  return t.address === 40 ? LAST_DISPLAY_ROW : t.address - 40;
}

/**
 * Walk the page's X/26 triplets (s.12.3, Table 27/28) and place the Level
 * 1.5 characters: G2 (mode 0x0F) and G0 with a G2 diacritic (0x10-0x1F) at
 * the active position. Row addresses move the active row (mode 0x04 also
 * sets the column; any other row mode is a Level 2.5 attribute and only
 * moves the row). Column modes 0x00-0x0E and the G3/PDC/DRCS/object modes
 * are Level 2.5 and are parsed past without effect. National options do not
 * apply to X/26 characters (s.12.3.4), so G0 is the plain primary set.
 */
export function applyX26(grid: PageGrid, subpage: TeletextSubpage): void {
  let row = 0;
  for (const t of localEnhancementTriplets(subpage.enhancement ?? [])) {
    if (t.address >= 40) {
      row = rowOf(t);
      continue;
    }
    if (t.mode < 0x0f) continue;
    const cell = grid[row]?.[t.address];
    if (!cell) continue;
    if (t.mode === 0x0f) {
      cell.text = g2Char(t.data);
      cell.charset = 'G2';
    } else if (t.data >= 0x20) {
      const base = t.mode === 0x10 && t.data === 0x2a ? '@' : g0Char(t.data, null);
      cell.text = composeDiacritic(base, t.mode & 0x0f);
    }
  }
}
