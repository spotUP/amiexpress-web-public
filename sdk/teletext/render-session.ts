/**
 * One teletext page, rendered for the session that asked for it.
 *
 * The vendored renderer (marco/render-ansi) already turns a resolved page
 * grid into 8-colour ANSI with Unicode sextants, and it already knows about
 * reveal and the flash phase. What it cannot know is which terminal is on
 * the other end of this board, and two things differ there:
 *
 *  - Double height. The vendored renderer duplicates a double-height row
 *    because no general terminal escape gives height without width (see its
 *    note at render-ansi.ts). This board's teletext sessions are not a
 *    general terminal: the stream filter in packages/terminal translates
 *    DECDHL (ESC#3 / ESC#4) into the TeletextUPR font's baked top and bottom
 *    halves, which is real double height. So in teletext mode we emit DECDHL
 *    and let the font do it; in ANSI mode we leave the duplication alone.
 *
 *  - Mosaics. Sextants (U+1FB00) only exist in fonts that carry Unicode 13
 *    legacy computing blocks. The teletext font has them; topaz and the
 *    other Amiga faces an ANSI caller uses do not, and an unmapped glyph is
 *    a hole in the picture. ANSI callers therefore get an ASCII density
 *    approximation by default - coarse, but it is a picture rather than
 *    tofu.
 *
 * Pure: no fs, no network, no socket. Callers position the cursor and write.
 */
import type { TeletextSubpage } from './marco/model/types';
import type { PageGrid } from './marco/state-machine/types';
import { compileRow } from './marco/compile/index';
import { processPage } from './marco/state-machine/state-machine';
import { renderToAnsi } from './marco/render-ansi/index';
import { sextantBits } from './sextant';
import { LAST_DISPLAY_ROW } from './enhancement';

/** 24 display rows by 40 columns, as broadcast. */
export const TELETEXT_ROWS = 24;
export const TELETEXT_COLS = 40;

/** DECDHL line attributes, as the board's terminal filter expects them. */
export const DH_TOP = '\x1b#3';
export const DH_BOTTOM = '\x1b#4';

export type TeletextRenderMode = 'teletext' | 'ansi';
export type MosaicStyle = 'sextant' | 'ascii';

export interface SessionRenderOptions {
  /**
   * 'teletext' for a session that answered T at the graphics prompt (the
   * TeletextUPR font, DECDHL, sextants). 'ansi' for everyone else.
   */
  mode?: TeletextRenderMode;
  /** Show concealed text. Default false - a quiz answer stays hidden. */
  reveal?: boolean;
  /** Which half of the flash cycle to draw. Default true (visible). */
  flashPhase?: boolean;
  /** The page's G0 national option sub-set, when it names one. */
  subset?: string;
  /** Default follows the mode: sextants in teletext, ASCII in ANSI. */
  mosaicStyle?: MosaicStyle;
}

/**
 * Resolve a subpage's tokens into the 24x40 cell grid (25 rows with row 24).
 *
 * Rows are placed by their declared index, not by array position: a t42
 * recovery hands over only the rows it actually captured, and a page that
 * lost row 3 to tape dropout must still print rows 4 to 23 where they
 * belong rather than sliding them up.
 */
export function subpageToGrid(subpage: TeletextSubpage): PageGrid {
  const blank = () => new Array<number>(TELETEXT_COLS).fill(0x20);
  const raw: number[][] = [];
  for (let i = 0; i < TELETEXT_ROWS; i++) raw.push(blank());

  const rows = subpage.rows ?? [];
  // Row 24 (s.9.3.1) becomes a 25th grid row only when the page carries it,
  // so a Level 1 page still renders exactly 24 rows.
  if (rows.some(row => row.index === LAST_DISPLAY_ROW)) raw.push(blank());
  rows.forEach((row, position) => {
    const at =
      Number.isInteger(row.index) && row.index >= 0 && row.index < raw.length
        ? row.index
        : position;
    if (at < 0 || at >= raw.length) return;
    raw[at] = Array.from(compileRow(row).bytes40);
  });

  return processPage(raw);
}

/**
 * Render one subpage into 24 lines, each complete in itself.
 *
 * Lines are returned rather than joined because the board paints a page with
 * absolute cursor motion, and the terminal filter drops a DECDHL attribute
 * the moment the cursor leaves the line. The caller writes
 * `ESC[<row>;1H` + line, in that order, so the attribute is set after the
 * move and survives to the end of the row.
 */
export function renderSubpageLines(
  subpage: TeletextSubpage,
  options: SessionRenderOptions = {},
): string[] {
  const mode: TeletextRenderMode = options.mode ?? 'teletext';
  const mosaicStyle: MosaicStyle =
    options.mosaicStyle ?? (mode === 'teletext' ? 'sextant' : 'ascii');

  const grid = subpageToGrid(subpage);
  const ansi = renderToAnsi(grid, {
    reveal: options.reveal ?? false,
    flashPhase: options.flashPhase ?? true,
    subset: options.subset ?? subpage.languageSubset,
  });

  const lines = ansi.split('\n');
  return lines.map((line, row) => {
    const drawn = mosaicStyle === 'ascii' ? sextantsToAscii(line) : line;
    if (mode !== 'teletext') return drawn;
    const attribute = doubleHeightAttribute(grid, row);
    return attribute ? attribute + drawn : drawn;
  });
}

/**
 * Render one subpage as a single string with CRLF between rows.
 * For callers that just want to dump a page down the wire.
 */
export function renderPageForSession(
  subpage: TeletextSubpage,
  options: SessionRenderOptions = {},
): string {
  return renderSubpageLines(subpage, options).join('\r\n');
}

/**
 * Which DECDHL attribute this row needs, if any.
 *
 * The state machine marks the top row's cells doubleHeight and copies them
 * into the row below with doubleHeightBottom set. DECDHL is a whole-line
 * attribute, so one double-height cell makes the line double height - which
 * is what a real decoder does too.
 */
function doubleHeightAttribute(grid: PageGrid, row: number): string | null {
  const cells = grid[row];
  if (!cells) return null;
  let top = false;
  for (const cell of cells) {
    if (cell.doubleHeightBottom) return DH_BOTTOM;
    if (cell.doubleHeight) top = true;
  }
  return top ? DH_TOP : null;
}

/**
 * Replace sextant glyphs with an ASCII density approximation.
 *
 * This inverts the forward table in marco/render-ansi: bits 0-63 map to
 * U+1FB00 onwards with four patterns carved out (empty, left half, right
 * half, full) because Unicode already had them elsewhere. Going back is the
 * same rule read the other way, so the two stay in step by construction
 * rather than by a second copy of the table.
 */
export function sextantsToAscii(line: string): string {
  let out = '';
  for (const glyph of line) {
    const bits = sextantBits(glyph);
    out += bits === null ? glyph : ASCII_RAMP[popcount6(bits)];
  }
  return out;
}

/** How full a cell is, 0 (blank) to 6 (solid), as one ASCII character. */
const ASCII_RAMP = [' ', '.', ':', 'o', 'O', '8', '#'] as const;

function popcount6(bits: number): number {
  let n = 0;
  for (let i = 0; i < 6; i++) if (bits & (1 << i)) n++;
  return n;
}

