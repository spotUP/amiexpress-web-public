/**
 * The little pictures of a piece: NEXT and HOLD.
 *
 * Lifted out of `ui/game-screen.ts` unchanged (2026-09-15) to keep that file
 * under its cap. Drawing one piece in a two-line box depends on the piece,
 * the palette and how wide a block is on this screen - and on nothing else
 * about the game - so it is the part that comes out cleanly.
 */
import { blockChar } from './block-glyphs';
import { blockCols, fitCell, cellsCanCarryBackground } from './block-width';
import type { PieceType } from '../core/types';

/** How a piece is laid out in its preview box, indents counted in CELLS. */
export function miniPiece(
  type: PieceType,
  rotationSystem: string,
  screen: { width: number },
  mode: string,
  level: number,
): string {
  const cols = blockCols(screen.width);
  const block = fitCell(
    blockChar(type, rotationSystem, mode, level), cols,
    cellsCanCarryBackground(screen as never),
  );
  // Indents are counted in CELLS, not characters, so a preview keeps its
  // shape on a screen where a block is one character wide.
  const p = (cells: number) => ' '.repeat(cells * cols);
  const patterns: Record<PieceType, string> = {
    I: `${p(1)}${block}${block}${block}${block}`,
    O: `${p(2)}${block}${block}\n${p(2)}${block}${block}`,
    T: `${p(3)}${block}\n${p(2)}${block}${block}${block}`,
    S: `${p(3)}${block}${block}\n${p(2)}${block}${block}`,
    Z: `${p(2)}${block}${block}\n${p(3)}${block}${block}`,
    J: `${p(2)}${block}\n${p(2)}${block}${block}${block}`,
    L: `${p(4)}${block}\n${p(2)}${block}${block}${block}`,
  };
  return patterns[type] || '';
}
