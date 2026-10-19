/**
 * Teletext colors per ETSI EN 300 706.
 */
export const enum Color {
  BLACK   = 0,
  RED     = 1,
  GREEN   = 2,
  YELLOW  = 3,
  BLUE    = 4,
  MAGENTA = 5,
  CYAN    = 6,
  WHITE   = 7,
}

/**
 * Character set mode.
 */
export const enum CharsetMode {
  TEXT     = 0,  // G0 alphanumeric
  GRAPHICS = 1, // G1 mosaic
}

/**
 * Mosaic sub-mode: contiguous vs separated.
 */
export const enum MosaicType {
  CONTIGUOUS = 0,
  SEPARATED  = 1,
}

/**
 * Per-row state that tracks all rendering attributes.
 * Reset at the start of each row per ETSI EN 300 706 Section 12.2.
 */
export interface RowState {
  fgColor: Color;
  bgColor: Color;
  charsetMode: CharsetMode;
  mosaicType: MosaicType;
  holdGraphics: boolean;
  heldMosaic: number | null;
  heldMosaicType: MosaicType;
  doubleHeight: boolean;
  flash: boolean;
  conceal: boolean;
  escSwitch: boolean;
  /** Inside a Start Box .. End Box area (0/B .. 0/A); off at the start of every row. */
  box: boolean;
}

/**
 * A rendered cell in the 40x24 grid.
 */
/**
 * Colour Look-Up Table index, EN 300 706 s.12.4 Table 30: CLUT n entry e is
 * index n*8+e, 0-31. Level 1 serial attributes reach CLUT 0 only (0-7, the
 * Color enum), so a Level 1 page renders exactly as before.
 */
export type ClutIndex = number;

/** Character width (s.12.2 0x0E/0x0F, X/26 display attributes). */
export type CellWidth = 'single' | 'double-left' | 'double-right';

/** Character set a cell draws from (s.15.6): G0 text, G2 supplementary, G3 smooth mosaics. */
export type CellCharset = 'G0' | 'G2' | 'G3';

export interface Cell {
  char: number;         // character code to render (7-bit)
  fgColor: ClutIndex;
  bgColor: ClutIndex;
  charsetMode: CharsetMode;
  mosaicType: MosaicType;
  doubleHeight: boolean;
  doubleHeightBottom: boolean;
  flash: boolean;
  conceal: boolean;
  /** Level 1 always 'single' until double width (D1) and X/26 (G5) land. */
  width: CellWidth;
  /** Level 1 always 'G0' until G2/G3 characters (E4, G8) land. */
  charset: CellCharset;
  /** X/26 display attributes (G5); false at Level 1. */
  underline: boolean;
  invert: boolean;
  /** Inside a Start Box / End Box area (D4); X/26 boxing (G5) sets it too. Only a newsflash or subtitle page hides what is outside. */
  box: boolean;
}

/**
 * Full page of rendered cells: 24 rows x 40 columns, plus row 24 (the
 * 25th row, s.9.3.1) when the page carries it.
 */
export type PageGrid = Cell[][];
