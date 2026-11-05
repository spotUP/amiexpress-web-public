/**
 * How a block is drawn: its colour, and the two characters that carry it.
 *
 * Lifted out of `ui/game-screen.ts` unchanged (2026-09-15), when the MISSION
 * rules pushed that file to its 2000-line cap. A block's glyph depends on the
 * piece type, the rotation system's palette and - for the bone blocks of a
 * DEATH run past level 1000 - the mode and level, and on nothing else about
 * the screen, so it can be asked and tested without one.
 *
 * `█` is not an Amiga character and the telnet wire turns it into `?`; the
 * caller decides whether a cell is painted as a glyph or as a background
 * colour (`ui/block-width.ts`), which is why these return tagged text and not
 * cells.
 */
import { PIECE_COLORS, ARS_COLORS } from '../core/pieces';
import type { PieceType } from '../core/types';

/** The palette a rotation system draws with. ARS has its own. */
export function paletteFor(rotationSystem: string): Record<PieceType, string> {
  return rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
}

/** The colour name a piece is drawn in - what the effects ask for. */
export function pieceColorName(type: PieceType, rotationSystem: string): string {
  return paletteFor(rotationSystem)[type] || 'white';
}

/**
 * The two characters a locked cell is drawn as.
 *
 * `null` is garbage. A DEATH run past level 1000 draws every block as a bone
 * block instead (TGM3 Shirase).
 */
export function blockChar(
  type: PieceType | null,
  rotationSystem: string,
  mode: string,
  level: number,
): string {
  if (type === null) {
    return '{gray-fg}██{/gray-fg}';
  }
  if (mode === 'death' && level >= 1000) {
    return '{white-fg}[]{/white-fg}';
  }
  const color = pieceColorName(type, rotationSystem);
  return `{${color}-fg}██{/${color}-fg}`;
}

/** The faded forms the credit roll draws with. */
export function fadedBlockChar(
  type: PieceType,
  intensity: 'medium' | 'faint',
  rotationSystem: string,
): string {
  const color = pieceColorName(type, rotationSystem);
  return intensity === 'medium'
    ? `{${color}-fg}▒▒{/${color}-fg}`
    : `{${color}-fg}░░{/${color}-fg}`;
}
