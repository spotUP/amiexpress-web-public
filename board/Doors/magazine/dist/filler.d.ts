import type { ArtSources } from './art';
/** A column needs at least this many empty rows at its foot before filler is considered. */
export declare const FILLER_MIN_GAP = 6;
export interface FillerPiece {
    /** File name, e.g. `mortimer_07.txt`. */
    file: string;
    /** Rows as read: no trailing blanks, ragged, never padded. */
    rows: string[];
    width: number;
    height: number;
    /** Carries the (c)Mt signature. */
    signed: boolean;
    /** Every glyph survives the PETSCII transducer (no '?'). */
    petsciiOk: boolean;
}
/** What the layout needs to place filler: the pieces on offer and what identifies the view. */
export interface FillerOptions {
    pieces: readonly FillerPiece[];
    /** Same view, same key: a story id, or a listing's name. */
    key: string;
}
/** Whether every glyph in `text` reaches a C64 as itself (or its fold), never as '?'. */
export declare function petsciiMappable(text: string): boolean;
/** Parse one piece from its bytes; null for a file that is not plain printable latin1 art. */
export declare function parsePiece(file: string, bytes: Buffer): FillerPiece | null;
/**
 * The pieces for one caller, from the door's `art/fill/`. A caller that reads
 * PETSCII (or a screen of forty columns or fewer) gets only the pieces that map.
 */
export declare function loadFiller(sources: ArtSources, petsciiLike: boolean): FillerPiece[];
/** FNV-1a, 32 bit: small, stable, and the same on every machine. */
export declare function hashKey(text: string): number;
/**
 * The piece for one gap: those that fit `width` x `height` whole, starting at
 * the hashed one and skipping any already used on this spread. Null when
 * nothing fits or everything that fits is used.
 */
export declare function chooseFiller(pieces: readonly FillerPiece[], seed: string, width: number, height: number, used: ReadonlySet<string>): FillerPiece | null;
/** Where a piece sits in a column of `room` rows whose text ends after `textRows`. */
export interface FillerPlacement {
    piece: FillerPiece;
    /** First row of the piece inside the column. */
    top: number;
    /** Blank cells left of the piece, centring it in the column. */
    indent: number;
}
/**
 * Filler for one spread: at most ONE piece, however many columns have room.
 * `textRows[c]` is how many rows column `c` uses; `room` is the rows each
 * column has. One entry per column, null everywhere but the chosen one.
 *
 * WHERE. A column holding no text at all comes first (a contents list that
 * fills the left column gets its clipart in the right one; the list is never
 * interrupted). With several empty columns the view's hash picks one. The
 * piece is centred in an empty column, both ways. Only when every column holds
 * text does filler go into a column's tail: the largest gap first, centred in
 * that gap one blank row below the text, and only for a gap of FILLER_MIN_GAP
 * rows or more. A column that cannot take a piece whole yields to the next.
 */
export declare function placeFiller(options: FillerOptions, spreadNo: number, textRows: readonly number[], room: number, colWidth: number): Array<FillerPlacement | null>;
//# sourceMappingURL=filler.d.ts.map