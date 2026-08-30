/**
 * The install core: turning an archive into an installed door.
 *
 * Extracted from app.ts, which had grown past the repo's 2000-line ceiling.
 * Nothing here touches the UI - it is the part of installing that both owner
 * mode and consumer mode share, and the part worth testing directly.
 */
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
/**
 * Shared install core: extract an already-on-disk archive, write the .info
 * command config, register the install locally, and refresh the boot-time
 * door registry. Both owner mode (local archive already resolved via
 * resolveArchivePath) and consumer mode (archive downloaded from the
 * central repo into tmp-door-repo/, see installConsumerDoor below) funnel
 * through this exact function once they have a real archivePath — this is
 * the ONE place extractArchiveTo/findExtractedBinary/buildDoorInfoContent
 * get called from, so both modes stay byte-identical past this point. Pure
 * except for the injected deps (all real I/O), so it is directly testable
 * without a blessed Screen.
 */
export interface InstallDeps {
    extractArchiveTo: (archivePath: string, destDir: string) => Promise<{
        ok: boolean;
        fileCount: number;
        error?: string;
    }>;
    findExtractedBinary: (destDir: string, binaryName: string | null | undefined) => string | null;
    writeInfoFile: (infoPath: string, content: string) => void;
    /** Caller-supplied: encapsulates whatever "persist the install locally"
     * means for this mode -- both owner and consumer now record a row in
     * door_installs (Task 5); door_catalog no longer carries install state.
     * Errors are caught and logged here, exactly like the pre-Task-5 inline
     * behavior: a bookkeeping failure never rolls back a working on-disk
     * install. */
    /**
     * Persist the install.
     *
     * Takes the command and directory that were ACTUALLY used, which are not
     * always the ones the caller asked for: when the archive names its own
     * command the door is moved to it. A record written from the caller's
     * original guess would point at a directory that no longer exists - and an
     * install_dir that does not match reality is how an uninstall came to
     * delete the wrong thing.
     */
    recordInstall: (command: string, installDirRelative: string) => void;
    refreshDoorRegistry: () => Promise<boolean>;
}
/**
 * What the install did, step by step, for the panel the sysop watches.
 *
 * An install reported one line when it finished and nothing while it ran,
 * which is the other half of "show me a log in the right panel" - asked for
 * after an uninstall removed more than it should have.
 */
export interface InstallStep {
    kind: 'ok' | 'skip' | 'fail';
    text: string;
}
export type InstallOutcome = {
    ok: true;
    doorType: string;
    fileCount: number;
    binaryRel: string;
    steps: InstallStep[];
} | {
    ok: false;
    step: string;
    detail: string;
    steps: InstallStep[];
};
export declare function extractAndRegisterDoor(archivePath: string, installDir: string, infoPath: string, doorType: string, binaryName: string | null, finalCmd: string, deps: InstallDeps): Promise<InstallOutcome>;
//# sourceMappingURL=install-core.d.ts.map