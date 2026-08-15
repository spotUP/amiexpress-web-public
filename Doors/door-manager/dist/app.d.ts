/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function resolveArchivePath(archivePath: string | null | undefined): string | null;
/** Content of the .info-style command config written on install. Pure and
 * exported for testing: door_type must flow through as TYPE= (a FIM door
 * force-typed XIM at install time simply won't run under the FIM engine). */
export declare function buildDoorInfoContent(doorType: string, cmd: string, binaryRel: string): string;
/**
 * Extract every file in an archive into destDir, preserving the archive's
 * internal directory structure. Portable — uses the backend's shared
 * extractor factory (pure-JS LHA, WASM LZX, etc.) instead of the native
 * `lha` CLI, so it works the same on macOS dev machines and the Linux
 * container on the live server.
 */
export declare function extractArchiveTo(archivePath: string, destDir: string): Promise<{
    ok: boolean;
    fileCount: number;
    error?: string;
}>;
/**
 * Archives (especially FAME door packs) often nest the actual door binary
 * several directories deep (e.g. "add_2_fame/doors/5d/5d!sysop/5d!sysop").
 * The catalog only stores the binary's basename, so after extraction we
 * search the extracted tree for a case-insensitive match rather than
 * assuming it landed at the archive root. Returns a path relative to
 * destDir (posix-style, for use in an AmigaDOS LOCATION= line).
 */
export declare function findExtractedBinary(destDir: string, binaryName: string | null | undefined): string | null;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map