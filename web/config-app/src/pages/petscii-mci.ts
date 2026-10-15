/**
 * The MCI codes in a PETSCII screen, found where the BOARD finds them.
 *
 * Not on the grid. `preparePetsciiSeq` gates on the file's first byte and
 * then tokenizes `bytes.toString('latin1')` - so the bytes are what a token
 * IS, and a grid-side tokenizer would be a second source of truth about what
 * this board calls a code. It would also be wrong: a `~` on a PETSCII canvas
 * is screen code 0x5E, which draws as the pi glyph, and whether it becomes a
 * token depends on the byte the writer chooses for it.
 *
 * So the screen is written exactly as it would be saved, the codes are found
 * in those bytes with the SAME locator the ANSI editor uses
 * (`locateMciReferences`, the board's own), and the byte offsets come back to
 * cells through the writer's own map.
 *
 * That locator finds the REFERENCE codes - `~CC_`, `~SS_`, `~SR_`, `~CL.` -
 * which are the ones that point at another file and the ones worth outlining
 * before an artist draws over them. It is the same set the ANSI editor shows.
 */
import { writeSeqWithOffsets, type PetsciiSurface } from '@amiexpress/bbs-door-sdk/petscii';
import { locateMciReferences } from '@bbs/screens/mci-references';
import type { MciReferenceShape, MciToken } from './mci-tokens';

/** The pi glyph. Written as 0x7E, which is the gate byte and a token's tilde. */
export const PI_SCREEN_CODE = 0x5e;

export interface PetsciiMciResult {
  /** The codes, with the cell each one starts at and how many cells it covers. */
  tokens: MciToken[];
  /**
   * Cells holding the pi glyph that are NOT part of a code.
   *
   * Once a `.seq` is gated in, EVERY 0x7E in it is a token candidate - the
   * hazard the 2026-09-02 MCI plan could only write down in prose. The pi
   * glyph is written as 0x7E, so in a gated screen a pi in the ART is one of
   * those candidates. This editor knows the grid AND the byte map, so it is
   * the only thing on the board that can point at the row and column.
   *
   * Empty when the gate is off, where a pi is simply a pi.
   */
  piCells: { x: number; y: number }[];
}

/**
 * `.seq` bytes as latin-1 - one char per byte, exactly as the render path
 * reads them. NEVER a UTF-8 decode: it destroys every high-bit PETSCII byte.
 */
function latin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export function petsciiMci(
  surface: PetsciiSurface,
  mciGate: boolean,
  known: MciReferenceShape[] = [],
): PetsciiMciResult {
  const { bytes, offsetOfCell } = writeSeqWithOffsets(surface, { mciGate });

  // The gate is the file's first byte, evaluated once. A screen that is not
  // gated has no codes at all - its bytes are art, whatever they spell.
  if (!mciGate) return { tokens: [], piCells: [] };

  const text = latin1(bytes);

  /** Byte offset -> the cell that byte draws. Elided cells carry -1 and are skipped. */
  const cellAtOffset = new Map<number, { x: number; y: number }>();
  for (let cell = 0; cell < offsetOfCell.length; cell++) {
    const offset = offsetOfCell[cell];
    if (offset < 0) continue;
    cellAtOffset.set(offset, { x: cell % surface.cols, y: Math.floor(cell / surface.cols) });
  }

  const tokens: MciToken[] = [];
  const claimed = new Set<number>();

  for (const found of locateMciReferences(text)) {
    // Where the code's own bytes landed. A code may begin in the gate prelude
    // or in a control byte run, neither of which draws a cell; the first cell
    // it DOES touch is where it is shown.
    const cells: { x: number; y: number }[] = [];
    for (let offset = found.at; offset < found.at + found.text.length; offset++) {
      claimed.add(offset);
      const cell = cellAtOffset.get(offset);
      if (cell) cells.push(cell);
    }
    if (cells.length === 0) continue;

    const fact = known.find(k => k.code === found.ref.code && k.target === found.ref.target);
    tokens.push({
      code: found.ref.code,
      target: found.ref.target,
      line: cells[0].y,
      column: cells[0].x,
      length: cells.length,
      resolves: fact ? fact.resolves : false,
    });
  }

  const piCells: { x: number; y: number }[] = [];
  for (let cell = 0; cell < offsetOfCell.length; cell++) {
    // The writer masks the reverse bit before choosing a byte, so a REVERSED
    // pi is written 0x7E too and is just as much a candidate.
    if ((surface.screen[cell] & 0x7f) !== PI_SCREEN_CODE) continue;
    const offset = offsetOfCell[cell];
    if (offset < 0 || claimed.has(offset)) continue;
    piCells.push({ x: cell % surface.cols, y: Math.floor(cell / surface.cols) });
  }

  return { tokens, piCells };
}
