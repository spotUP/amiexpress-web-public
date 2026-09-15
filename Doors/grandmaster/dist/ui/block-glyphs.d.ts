import type { PieceType } from '../core/types';
/** The palette a rotation system draws with. ARS has its own. */
export declare function paletteFor(rotationSystem: string): Record<PieceType, string>;
/** The colour name a piece is drawn in - what the effects ask for. */
export declare function pieceColorName(type: PieceType, rotationSystem: string): string;
/**
 * The two characters a locked cell is drawn as.
 *
 * `null` is garbage. A DEATH run past level 1000 draws every block as a bone
 * block instead (TGM3 Shirase).
 */
export declare function blockChar(type: PieceType | null, rotationSystem: string, mode: string, level: number): string;
/** The faded forms the credit roll draws with. */
export declare function fadedBlockChar(type: PieceType, intensity: 'medium' | 'faint', rotationSystem: string): string;
//# sourceMappingURL=block-glyphs.d.ts.map