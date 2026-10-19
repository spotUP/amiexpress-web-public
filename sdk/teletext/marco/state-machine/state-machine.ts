import {
  type Cell,
  type PageGrid,
  type RowState,
  CharsetMode,
  Color,
  MosaicType,
} from './types';
import {
  isControlCode,
  isAlphaColor,
  isMosaicColor,
  ALPHA_BLACK,
  FLASH,
  STEADY,
  END_BOX,
  START_BOX,
  NORMAL_HEIGHT,
  DOUBLE_HEIGHT,
  MOSAIC_BLACK,
  CONCEAL,
  CONTIGUOUS_MOSAIC,
  SEPARATED_MOSAIC,
  ESC,
  BLACK_BACKGROUND,
  NEW_BACKGROUND,
  HOLD_MOSAIC,
  RELEASE_MOSAIC,
  isSetAtCode,
} from './control-codes';

const ROWS = 24;
const COLS = 40;

/**
 * Create the default row state per ETSI EN 300 706 Section 12.2.
 */
export function createDefaultRowState(): RowState {
  return {
    fgColor: Color.WHITE,
    bgColor: Color.BLACK,
    charsetMode: CharsetMode.TEXT,
    mosaicType: MosaicType.CONTIGUOUS,
    holdGraphics: false,
    heldMosaic: null,
    heldMosaicType: MosaicType.CONTIGUOUS,
    doubleHeight: false,
    flash: false,
    conceal: false,
    escSwitch: false,
    box: false,
  };
}

/**
 * Apply one spacing attribute to the row state. WHEN it applies - before or
 * after its own cell is drawn - is `isSetAtCode`'s business, not this one's.
 *
 * The held mosaic is reset to SPACE only on a change of alphanumerics /
 * mosaics MODE or a change of SIZE (Table 26 entry 1/E). A mosaic colour code
 * while already in mosaics, or Normal Size while already normal size, keeps
 * it: that is what lets Hold Mosaics change colour between blocks without a
 * gap.
 */
export function applyControlCode(state: RowState, code: number): void {
  if (isAlphaColor(code)) {
    // 0x00 is Level 2.5 alpha black; kept as a colour code (the user's choice).
    state.fgColor = (code - ALPHA_BLACK) as Color;
    if (state.charsetMode !== CharsetMode.TEXT) state.heldMosaic = null;
    state.charsetMode = CharsetMode.TEXT;
    state.conceal = false;
  } else if (isMosaicColor(code)) {
    // 0x10 is Level 2.5 mosaic black; kept as a colour code.
    state.fgColor = (code - MOSAIC_BLACK) as Color;
    if (state.charsetMode !== CharsetMode.GRAPHICS) state.heldMosaic = null;
    state.charsetMode = CharsetMode.GRAPHICS;
    state.conceal = false;
  } else {
    switch (code) {
      case FLASH:
        state.flash = true;
        break;
      case STEADY:
        state.flash = false;
        break;
      case END_BOX:
        state.box = false;
        break;
      case START_BOX:
        state.box = true;
        break;
      case NORMAL_HEIGHT:
        if (state.doubleHeight) state.heldMosaic = null;
        state.doubleHeight = false;
        break;
      case DOUBLE_HEIGHT:
        if (!state.doubleHeight) state.heldMosaic = null;
        state.doubleHeight = true;
        break;
      case CONCEAL:
        state.conceal = true;
        break;
      case CONTIGUOUS_MOSAIC:
        state.mosaicType = MosaicType.CONTIGUOUS;
        break;
      case SEPARATED_MOSAIC:
        state.mosaicType = MosaicType.SEPARATED;
        break;
      case ESC:
        // Toggle between G0/G2 character sets - not fully modelled here
        // but we track the flag for completeness.
        state.escSwitch = !state.escSwitch;
        break;
      case BLACK_BACKGROUND:
        state.bgColor = Color.BLACK;
        break;
      case NEW_BACKGROUND:
        // The foreground in effect at this cell becomes the background.
        state.bgColor = state.fgColor;
        break;
      case HOLD_MOSAIC:
        state.holdGraphics = true;
        break;
      case RELEASE_MOSAIC:
        state.holdGraphics = false;
        break;
    }
  }
}

/**
 * What a spacing attribute's own cell shows (Table 26 intro): a SPACE, or in
 * Hold Mosaics mode the held mosaic, in its original contiguous/separated
 * form. The held mosaic is only ever set in mosaics mode and reset on leaving
 * it, so a non-null one means the cell is in mosaics.
 */
function controlCodeDisplayChar(state: RowState): { char: number; mode: CharsetMode; mosType: MosaicType } {
  if (state.holdGraphics && state.heldMosaic !== null) {
    return { char: state.heldMosaic, mode: CharsetMode.GRAPHICS, mosType: state.heldMosaicType };
  }
  return { char: 0x20, mode: state.charsetMode, mosType: state.mosaicType };
}

/**
 * Emit a cell from the current state and the given display info.
 */
function emitCell(
  state: RowState,
  char: number,
  charsetMode: CharsetMode,
  mosaicType: MosaicType,
): Cell {
  return {
    char,
    fgColor: state.fgColor,
    bgColor: state.bgColor,
    charsetMode,
    mosaicType,
    doubleHeight: state.doubleHeight,
    doubleHeightBottom: false, // set in post-processing
    flash: state.flash,
    conceal: state.conceal,
    width: 'single',
    charset: 'G0',
    underline: false,
    invert: false,
    box: state.box,
  };
}

/** A mosaic character in mosaics mode: bit 6 set (0x20-0x3F, 0x60-0x7F). 0x40-0x5F blast through as text. */
function isMosaicChar(byte: number): boolean {
  return (byte >= 0x20 && byte <= 0x3F) || (byte >= 0x60 && byte <= 0x7F);
}

/**
 * Walk one row, calling `visit` with the state each cell is drawn in. The one
 * attribute walk: `processRow` draws from it and `rowStateAt` (the editor's
 * view) reads it, so the two cannot disagree.
 */
function walkRow(rowData: ArrayLike<number>, columns: number, visit: (col: number, byte: number, state: RowState) => void): RowState {
  const state = createDefaultRowState();
  for (let col = 0; col < columns; col++) {
    const byte = rowData[col] & 0x7F; // strip parity bit
    if (isControlCode(byte)) {
      const setAt = isSetAtCode(byte);
      if (setAt) applyControlCode(state, byte);
      visit(col, byte, state);
      if (!setAt) applyControlCode(state, byte);
    } else {
      if (state.charsetMode === CharsetMode.GRAPHICS && isMosaicChar(byte)) {
        state.heldMosaic = byte;
        state.heldMosaicType = state.mosaicType;
      }
      visit(col, byte, state);
    }
  }
  return state;
}

/**
 * The row state a CHARACTER placed at column `x` would be drawn in: every
 * attribute left of `x` applied. `x` may be 40 (the state after the row).
 */
export function rowStateAt(rowData: ArrayLike<number>, x: number): RowState {
  return walkRow(rowData, Math.max(0, Math.min(x, COLS)), () => {});
}

/**
 * Process a single row of 40 bytes through the state machine.
 * Returns an array of 40 Cells.
 */
export function processRow(rowData: ArrayLike<number>): Cell[] {
  const cells: Cell[] = new Array(COLS);
  walkRow(rowData, COLS, (col, byte, state) => {
    if (isControlCode(byte)) {
      const display = controlCodeDisplayChar(state);
      cells[col] = emitCell(state, display.char, display.mode, display.mosType);
    } else if (state.charsetMode === CharsetMode.GRAPHICS) {
      cells[col] = isMosaicChar(byte)
        ? emitCell(state, byte, CharsetMode.GRAPHICS, state.mosaicType)
        : emitCell(state, byte, CharsetMode.TEXT, state.mosaicType); // blast-through
    } else {
      cells[col] = emitCell(state, byte, state.charsetMode, state.mosaicType);
    }
  });
  return cells;
}

/** Whether any cell of a processed row is double height. */
function hasDoubleHeight(cells: readonly Cell[]): boolean {
  return cells.some(cell => cell.doubleHeight);
}

/**
 * Which rows are the LOWER half of a double-height row above them. Such a
 * row's own data is ignored (Table 26 entry 0/D), so its own Double Height
 * never makes the row after it a lower row too.
 */
export function doubleHeightLowerRows(rows: readonly ArrayLike<number>[]): boolean[] {
  const lower: boolean[] = new Array(rows.length).fill(false);
  for (let row = 0; row < rows.length - 1; row++) {
    if (!lower[row] && hasDoubleHeight(processRow(rows[row]))) lower[row + 1] = true;
  }
  return lower;
}

/**
 * First row on which a double-height code has no row below it to expand into.
 *
 * ETSI EN 300 706 Annex C.3 rule 1: the transmission "should inhibit the
 * transmission of double height/double size attributes in rows 0, 23 and 24 ...
 * If a decoder receives an illegal combination, it may choose, for example, to
 * display a partial character, to reduce the size or to ignore the character
 * completely." (s.9.3 Notes 1 and 7 say the same.) We take "reduce size": the row is
 * drawn at normal height, so a 24-row page never ends in a top half with no
 * bottom half, and row 24 (when present) is never its lower half.
 */
const FIRST_ROW_WITHOUT_ROOM_BELOW = 23;

function withoutIllegalDoubleHeight(cells: Cell[], row: number): Cell[] {
  if (row < FIRST_ROW_WITHOUT_ROOM_BELOW) return cells;
  return cells.map(cell => (cell.doubleHeight ? { ...cell, doubleHeight: false } : cell));
}

export interface ProcessPageOptions {
  /**
   * The page has the Newsflash (C5) or Subtitle (C6) control bit set. EN 300
   * 706 0/B: "Characters outside this area are not displayed". The spec shows
   * the video picture there; a BBS has none, so the outside is black (the
   * transparent colour is defined as black here).
   */
  boxed?: boolean;
}

/** A cell outside the box on a boxed page: nothing drawn, black, no attributes that paint. */
function hideOutsideBox(cell: Cell): Cell {
  if (cell.box) return cell;
  return {
    ...cell,
    char: 0x20,
    charsetMode: CharsetMode.TEXT,
    fgColor: Color.BLACK,
    bgColor: Color.BLACK,
    flash: false,
    conceal: false,
  };
}

/**
 * Process a full 24x40 page through the state machine. A 25th input row is
 * row 24 (s.9.3.1, Level 1.5 and up) and is rendered as a 25th grid row.
 * Row 24 is never the lower half of a double-height row 23: s.9.3 allows no
 * double height in rows 23 and 24.
 *
 * ETSI EN 300 706 Table 26 entry 0/D: the row below a row with double height
 * ignores every character and attribute transmitted for it. Under a
 * double-height cell it shows that cell's lower half; everywhere else it
 * shows a space in the background of the cell above, with no foreground.
 */
export function processPage(pageData: Uint8Array[] | number[][], options: ProcessPageOptions = {}): PageGrid {
  const rowCount = pageData.length > ROWS ? ROWS + 1 : ROWS;
  const rows = pageData.slice(0, rowCount);
  const lower = doubleHeightLowerRows(rows.slice(0, ROWS));
  const grid: PageGrid = new Array(rowCount);

  for (let row = 0; row < rowCount; row++) {
    grid[row] = lower[row]
      ? grid[row - 1].map(cell =>
          cell.doubleHeight
            ? { ...cell, doubleHeightBottom: true }
            : { ...emitCell(createDefaultRowState(), 0x20, CharsetMode.TEXT, MosaicType.CONTIGUOUS), bgColor: cell.bgColor, box: cell.box },
        )
      : withoutIllegalDoubleHeight(processRow(rows[row]), row);
  }

  return options.boxed ? grid.map(row => row.map(hideOutsideBox)) : grid;
}
