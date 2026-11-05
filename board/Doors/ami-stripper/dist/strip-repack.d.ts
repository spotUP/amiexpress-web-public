/**
 * Strip-and-repack finalization for the AmiStripper door.
 *
 * Extracted from index.ts so the temp-file lifecycle is unit-testable
 * without pulling in the door SDK. stripArchive always writes a portable
 * ZIP and may adjust the requested output path (forced .zip extension),
 * so cleanup must track the path it ACTUALLY wrote (outputPath), not the
 * literal tmp path we asked for.
 */
export interface StripRepackOutcome {
    ok: boolean;
    origSize: number;
    newSize: number;
    finalPath: string;
    error?: string;
}
export type StripArchiveFn = (archivePath: string, outPath: string) => Promise<{
    outputPath?: string;
} | null | undefined | void>;
export declare function runStripRepack(stripArchiveFn: StripArchiveFn, archivePath: string): Promise<StripRepackOutcome>;
//# sourceMappingURL=strip-repack.d.ts.map