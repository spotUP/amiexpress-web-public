/**
 * Building a teletext page in code, rather than replaying one off a tape.
 *
 * This is the part a television could never do. A TV had no processor and
 * no way to talk back, so an interactive teletext page had to be drawn in
 * advance and broadcast: Team17 built Worms for teletext in 1996 by
 * precomputing every screen the game could ever show, and it died because a
 * day's broadcast could not hold enough pages. A BBS has both halves the
 * television was missing, so a page can simply be composed for this turn,
 * for this caller, and sent.
 *
 * What comes out is an ordinary TeletextSubpage - the same model a .t42
 * recovery parses into - so a generated page travels the identical store
 * and renderer as an archived one, and a door never has two ways to draw.
 *
 * Two things to know before using it:
 *
 *  - Teletext attributes are SPACING attributes. A colour is a character
 *    cell, not a property of the text after it, so asking for coloured text
 *    at column 4 puts the colour at column 4 and the text from column 5.
 *    `write` returns where it actually ended so a caller can chain.
 *  - Block graphics are 2x3 pixels per cell. A full 40x24 page is therefore
 *    an 80x72 pixel canvas, which is what MosaicCanvas gives you.
 *
 * Pure: no fs, no network.
 */
import type {
  TeletextSubpage,
  TeletextPage,
  TeletextRow,
  TeletextToken,
  NationalSubset,
  FastextLinks,
  PageNumber,
} from './marco/model/types';
import {
  createDefaultPageFlags,
  createDefaultServiceFlags,
} from './marco/model/factories';
import {
  FLASH,
  CONCEAL,
  DOUBLE_HEIGHT,
  NEW_BACKGROUND,
} from './marco/state-machine/control-codes';
import { Color } from './marco/state-machine/types';
import { TELETEXT_ROWS, TELETEXT_COLS } from './render-session';

export type ColorName =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white';

export const COLORS: Record<ColorName, Color> = {
  black: Color.BLACK,
  red: Color.RED,
  green: Color.GREEN,
  yellow: Color.YELLOW,
  blue: Color.BLUE,
  magenta: Color.MAGENTA,
  cyan: Color.CYAN,
  white: Color.WHITE,
};

/** Alpha colour controls are 0x00-0x07, mosaic colour controls 0x10-0x17. */
const ALPHA_BASE = 0x00;
const MOSAIC_BASE = 0x10;

const BLANK = 0x20;

export interface TextStyle {
  /** Ink. White is the row default and costs no cell. */
  fg?: ColorName;
  /** Paper. Costs two cells: the colour, then New Background. */
  bg?: ColorName;
  flash?: boolean;
  /** Hidden until the caller reveals - how a quiz answer is carried. */
  conceal?: boolean;
  /** Double height. The row below is given over to the bottom halves. */
  doubleHeight?: boolean;
}

/**
 * The byte that draws a six-bit mosaic pattern.
 *
 * Bit 0 is top-left, bit 1 top-right, bit 2 mid-left, bit 3 mid-right,
 * bit 4 bottom-left, bit 5 bottom-right - the same order the renderer's
 * sextant table uses.
 */
export function mosaicByte(bits: number): number {
  const pattern = bits & 0x3f;
  return pattern < 0x20 ? 0x20 + pattern : 0x60 + (pattern - 0x20);
}

/**
 * A page under construction.
 *
 * Rows are held as 40 raw bytes each, exactly what the compiler wants, so
 * nothing has to be re-derived when the page is finished.
 */
export class PageBuilder {
  private readonly rows: number[][];
  private links: FastextLinks | null = null;
  private readonly subset: NationalSubset;

  constructor(options: { subset?: NationalSubset } = {}) {
    this.subset = options.subset ?? 'english';
    this.rows = [];
    for (let row = 0; row < TELETEXT_ROWS; row++) {
      this.rows.push(new Array<number>(TELETEXT_COLS).fill(BLANK));
    }
  }

  /** Every cell back to a space, keeping the fastext links. */
  clear(): this {
    for (const row of this.rows) row.fill(BLANK);
    return this;
  }

  /** Blank one row. Cheaper than redrawing a page for a status line. */
  clearRow(row: number): this {
    if (this.rows[row]) this.rows[row].fill(BLANK);
    return this;
  }

  /**
   * Put text on the page.
   *
   * Remember that a style costs cells: `write(0, 0, 'HI', { fg: 'red' })`
   * puts the red attribute at column 0 and H at column 1.
   */
  write(row: number, col: number, text: string, style: TextStyle = {}): this {
    const bytes = [...attributeBytes(style, false), ...Array.from(text, ch => g0Byte(ch))];
    this.put(row, col, bytes);
    return this;
  }

  /**
   * Put mosaic cells on the page.
   *
   * `patterns` are six-bit patterns, not bytes - mosaicByte does that
   * conversion, and this calls it for you.
   */
  writeMosaic(
    row: number,
    col: number,
    patterns: readonly number[],
    style: TextStyle = {},
  ): this {
    const bytes = [...attributeBytes(style, true), ...patterns.map(mosaicByte)];
    this.put(row, col, bytes);
    return this;
  }

  /** Centre text on a row, allowing for the cells the style will take. */
  writeCentred(row: number, text: string, style: TextStyle = {}): this {
    const cost = attributeCost(style);
    const col = Math.max(0, Math.floor((TELETEXT_COLS - (text.length + cost)) / 2));
    return this.write(row, col, text, style);
  }

  /**
   * Draw a pixel canvas onto the page.
   *
   * One colour for the whole block: a mosaic colour is a spacing attribute
   * like any other, so a canvas that changed colour per cell would spend a
   * column on every change. Doors that want two colours draw two canvases
   * on different rows.
   */
  drawCanvas(
    canvas: MosaicCanvas,
    at: { row: number; col?: number; fg?: ColorName; bg?: ColorName } = { row: 0 },
  ): this {
    const col = at.col ?? 0;
    const cells = canvas.toPatterns();
    cells.forEach((patterns, line) => {
      const row = at.row + line;
      if (row < 0 || row >= TELETEXT_ROWS) return;
      this.writeMosaic(row, col, patterns, { fg: at.fg ?? 'white', bg: at.bg });
    });
    return this;
  }

  /** Where the coloured keys go. Omitted keys offer no button. */
  fastext(links: FastextLinks): this {
    this.links = links;
    return this;
  }

  /** The finished page, ready for the store or the renderer. */
  subpage(subcode = 0): TeletextSubpage {
    const rows: TeletextRow[] = this.rows.map((bytes, index) => ({
      index,
      tokens: bytes.map(toToken),
    }));
    return {
      subcode,
      rows,
      languageSubset: this.subset,
      pageFlags: createDefaultPageFlags(),
    };
  }

  /** The finished page wrapped as a page, so the store can hold it. */
  page(pageNumber: PageNumber, subcode = 0): TeletextPage {
    return {
      pageNumber,
      subpages: [this.subpage(subcode)],
      serviceFlags: createDefaultServiceFlags(),
      fastext: this.links,
    };
  }

  /** Write bytes into a row, clipped at the page edge. */
  private put(row: number, col: number, bytes: number[]): number {
    const line = this.rows[row];
    if (!line) return col;
    let at = Math.max(0, col);
    for (const byte of bytes) {
      if (at >= TELETEXT_COLS) break;
      line[at++] = byte;
    }
    return at;
  }
}

/**
 * A 2x3-per-cell pixel surface.
 *
 * 40 columns by 24 rows of block graphics is 80 by 72 pixels, and that is
 * the whole resolution a teletext game ever had to play with.
 */
export class MosaicCanvas {
  readonly width: number;
  readonly height: number;
  private readonly cellCols: number;
  private readonly cellRows: number;
  private readonly bits: Uint8Array;

  constructor(cellCols = TELETEXT_COLS, cellRows = TELETEXT_ROWS) {
    this.cellCols = cellCols;
    this.cellRows = cellRows;
    this.width = cellCols * 2;
    this.height = cellRows * 3;
    this.bits = new Uint8Array(this.width * this.height);
  }

  clear(): this {
    this.bits.fill(0);
    return this;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x: number, y: number, on = true): this {
    const px = Math.round(x);
    const py = Math.round(y);
    if (this.inside(px, py)) this.bits[py * this.width + px] = on ? 1 : 0;
    return this;
  }

  get(x: number, y: number): boolean {
    const px = Math.round(x);
    const py = Math.round(y);
    return this.inside(px, py) ? this.bits[py * this.width + px] === 1 : false;
  }

  fillRect(x: number, y: number, width: number, height: number, on = true): this {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) this.set(x + dx, y + dy, on);
    }
    return this;
  }

  /** A straight line, Bresenham. Used for terrain and for a shot's path. */
  line(x0: number, y0: number, x1: number, y1: number, on = true): this {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      this.set(ax, ay, on);
      if (ax === bx && ay === by) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        ax += sx;
      }
      if (doubled <= dx) {
        error += dx;
        ay += sy;
      }
    }
    return this;
  }

  /** A filled disc, for the crater a shot leaves. */
  disc(cx: number, cy: number, radius: number, on = true): this {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, on);
      }
    }
    return this;
  }

  /** The canvas as six-bit patterns, one array per character row. */
  toPatterns(): number[][] {
    const out: number[][] = [];
    for (let cellRow = 0; cellRow < this.cellRows; cellRow++) {
      const line: number[] = [];
      for (let cellCol = 0; cellCol < this.cellCols; cellCol++) {
        let pattern = 0;
        for (let sub = 0; sub < 6; sub++) {
          const x = cellCol * 2 + (sub % 2);
          const y = cellRow * 3 + Math.floor(sub / 2);
          if (this.bits[y * this.width + x] === 1) pattern |= 1 << sub;
        }
        line.push(pattern);
      }
      out.push(line);
    }
    return out;
  }
}

/**
 * How many cells a style will take before the text starts.
 *
 * Teletext attributes are spacing attributes: asking for red text at column
 * 4 puts the red at column 4 and the text from column 5. A caller laying
 * out a page needs to know that without having to write something first.
 */
export function attributeCost(style: TextStyle, mosaic = false): number {
  return attributeBytes(style, mosaic).length;
}

/**
 * The spacing attributes a style needs, in the order the standard wants
 * them.
 *
 * Background first: teletext has no "set background" code, only New
 * Background, which promotes the CURRENT foreground to paper. So a style
 * with a background sets that colour, promotes it, then sets the real ink.
 */
function attributeBytes(style: TextStyle, mosaic: boolean): number[] {
  const base = mosaic ? MOSAIC_BASE : ALPHA_BASE;
  const bytes: number[] = [];

  if (style.bg) {
    bytes.push(ALPHA_BASE + COLORS[style.bg], NEW_BACKGROUND);
  }
  if (style.fg || mosaic || style.bg) {
    bytes.push(base + COLORS[style.fg ?? 'white']);
  }
  if (style.flash) bytes.push(FLASH);
  if (style.conceal) bytes.push(CONCEAL);
  if (style.doubleHeight) bytes.push(DOUBLE_HEIGHT);
  return bytes;
}

/**
 * G0 is seven-bit. A character the set cannot carry becomes a space rather
 * than a random glyph - a generated page must never invent a control code.
 */
function g0Byte(ch: string): number {
  const code = ch.charCodeAt(0);
  return code >= 0x20 && code <= 0x7e ? code : BLANK;
}

function toToken(byte: number): TeletextToken {
  return byte < 0x20
    ? { kind: 'control', codepoint7: byte }
    : { kind: 'char', codepoint7: byte };
}
