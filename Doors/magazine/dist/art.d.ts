import { type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';
import type { Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';
/** Every piece of art the door asks for, by name. */
export declare const ART_NAMES: readonly ["mag_title", "mag_front", "mag_contents", "mag_goodbye", "mag_article_end", "mag_logo_small", "mag_loading", "sec_hack", "sec_scene", "sec_graffiti", "sec_music", "sec_people", "sec_archive", "sec_stream", "sec_general"];
export declare const SECTION_ART: Record<Desk, string>;
/** Banner ceilings: five rows on an ANSI screen, four on the C64's forty columns. */
export declare const BANNER_MAX_ROWS = 5;
export declare const BANNER_MAX_ROWS_40 = 4;
export interface ArtSources {
    /** `<board root>/Magazine/art`: the sysop's, checked first. */
    overrideDir: string;
    /** `Doors/magazine/art`: what ships. Null when the caller wants no shipped art. */
    shippedDir: string | null;
}
/** The directory the door ships its placeholders in, from source (`Doors/magazine`) or from `dist`. */
export declare function shippedArtDir(startDir?: string): string;
export declare function overrideArtDir(magazineRootDir: string): string;
export type ArtKind = 'ans' | 'seq';
export interface LoadedArt {
    kind: ArtKind;
    bytes: Buffer;
    /** Where it came from, for the tests and the log. */
    file: string;
}
/**
 * One piece of art for one caller: the override first, then the shipped
 * placeholder; the caller's kind only. Null when neither exists.
 */
export declare function loadArt(name: string, kind: ArtKind, sources: ArtSources): LoadedArt | null;
/**
 * Amiga ANSI to rows: latin1 text, SGR kept, every other escape sequence (a
 * cursor move, a clear) dropped, rows clipped to `maxCols` visible cells.
 * Art moves nothing: it is drawn into a box the door has placed.
 */
export declare function ansiRows(bytes: Buffer, maxRows: number, maxCols: number): string[];
/**
 * A `.seq` to rows: the board's PETSCII machine reads it (bank one, as the
 * board's callers are), each cell becomes a glyph in a colour, reverse video
 * stays reverse video, and trailing blank cells and rows are cut.
 */
export declare function seqSurface(bytes: Buffer): PetsciiMachineState;
export declare function seqRows(bytes: Buffer, maxRows: number, maxCols: number): string[];
export declare function artRows(art: LoadedArt, maxRows: number, maxCols: number): string[];
/**
 * Which kind this caller gets. A C64 reads PETSCII, and so does any screen of
 * forty columns or fewer - the ANSI art is drawn for eighty and is never folded.
 */
export declare function artKindFor(petscii: boolean, width: number): ArtKind;
/** The visible text of one art row: escapes and tags gone, so a test (or a width check) reads what a caller reads. */
export declare function artRowText(row: string): string;
//# sourceMappingURL=art.d.ts.map