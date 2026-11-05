export interface CtopArt {
    header: string[];
    tailer: string[];
}
export declare const NO_ART: CtopArt;
/**
 * One drawing, narrow copy first when the caller's screen is narrow.
 *
 * `dirs` are searched in order, as the door searches them: the conference
 * first, then the door's own directory.
 */
export declare function loadArtFile(dirs: readonly string[], name: string, narrow: boolean): string[];
/** Both drawings. */
export declare function loadCtopArt(dirs: readonly string[], narrow: boolean): CtopArt;
//# sourceMappingURL=art.d.ts.map