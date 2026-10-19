import { type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';
import type { Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';
/** Every piece of art the door asks for, by name. */
export declare const ART_NAMES: readonly ["mag_title", "mag_front", "mag_contents", "mag_goodbye", "mag_article_end", "mag_logo_small", "mag_loading", "sec_hack", "sec_scene", "sec_graffiti", "sec_music", "sec_people", "sec_archive", "sec_stream", "sec_general"];
export declare const SECTION_ART: Record<Desk, string>;
export interface ArtSources {
    /** `Doors/magazine/art`: where the Studio saves and the loader reads, filler included. Null when the caller wants no art. */
    shippedDir: string | null;
    /** Slot name to the absolute file the Studio's slot names, from `slotFiles`. Absent: the default file. */
    slots?: Readonly<Record<string, string>>;
    /** `<board root>/Screens/doors/MAG`: where the Studio's C64 tab saves. Null or absent: no C64 drawings. */
    variantDir?: string | null;
    /** The caller answered T at the graphics prompt: his own Teletext drawing comes before the C64 one. */
    teletext?: boolean;
}
/** `<board root>/Screens/doors/MAG`: where the Studio's C64 and Teletext tabs save, found from the door's folder. */
export declare function boardVariantDir(doorDir: string): string;
/** The Studio's name for the slot that holds a piece: the setting key, as the section it is addressed by. */
export declare const slotKey: (name: string) => string;
/**
 * Which file each slot reads, from the door's saved settings.
 *
 * A value is one name or `dir/name` inside the door's folder, as
 * `resolveArtValue` in the backend requires (no dot-first segment, so no
 * `..`); anything else is ignored and the slot keeps its default file.
 */
export declare function slotFiles(values: Readonly<Record<string, unknown>>, doorDir: string): Record<string, string>;
/** The directory the door ships its placeholders in, from source (`Doors/magazine`) or from `dist`. */
export declare function shippedArtDir(startDir?: string): string;
export type ArtKind = 'ans' | 'seq';
export interface LoadedArt {
    kind: ArtKind;
    bytes: Buffer;
    /** Where it came from, for the tests and the log. */
    file: string;
    /**
     * How the bytes decode. Absent: latin1, as every Amiga ANSI file is. A
     * rendered `.tti` is UTF-8: its mosaics are sextants (U+1FB00), which the
     * teletext font draws and latin1 cannot hold.
     */
    encoding?: 'latin1' | 'utf8';
}
/**
 * One piece of art for one caller. A wide caller gets the slot's file, else
 * the default `.ans`. A 40-column caller gets the Studio's narrow drawing
 * (read as ANSI, so `kind` is `ans`) - a teletext caller his Teletext one
 * first (his native `.tti` page, rendered, before his `.ttx.ans`), everyone
 * the C64 one - else the shipped `.seq`. Null when none exists.
 */
export declare function loadArt(name: string, kind: ArtKind, sources: ArtSources): LoadedArt | null;
/**
 * Amiga ANSI to rows: latin1 text, SGR kept, every other escape sequence (a
 * cursor move, a clear) dropped, rows clipped to `maxCols` visible cells.
 * Art moves nothing: it is drawn into a box the door has placed.
 */
export declare function ansiRows(bytes: Buffer, maxRows: number, maxCols: number, encoding?: 'latin1' | 'utf8'): string[];
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