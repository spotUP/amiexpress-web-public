/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */
import type { LocalCatalogLookup } from './repoDataSource';
import type { RepoClientConfig, FetchManifestResult } from './repo-client';
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
     * means for this mode (owner: always call markInstalled(e.id, ...);
     * consumer: only when a real local catalog row exists -- see
     * installConsumerDoor). Errors are caught and logged here, exactly like
     * the pre-Task-7 inline behavior: a bookkeeping failure never rolls back
     * a working on-disk install. */
    markInstalled: () => void;
    refreshDoorRegistry: () => Promise<boolean>;
}
export type InstallOutcome = {
    ok: true;
    doorType: string;
    fileCount: number;
    binaryRel: string;
} | {
    ok: false;
    step: string;
    detail: string;
};
export declare function extractAndRegisterDoor(archivePath: string, installDir: string, infoPath: string, doorType: string, binaryName: string | null, finalCmd: string, deps: InstallDeps): Promise<InstallOutcome>;
/**
 * Consumer-mode install: download + verify the archive from the central
 * door-repo API, then hand off to extractAndRegisterDoor for the identical
 * extract/register flow owner mode already uses. destPath always lives
 * under tmp-door-repo/ and is removed in the finally on every path,
 * including every failure — downloadArchive (Task 5) already deletes it on
 * a network/checksum failure, but a failure further down (extract,
 * write-info) still leaves a successfully-downloaded archive sitting in
 * tmp-door-repo/ unless this cleans it up too.
 *
 * Local registration: the central manifest's archiveName is not a local
 * catalog primary key (repoDataSource.ts's mapManifestDoorToEntry falls
 * back CatalogEntry.id to archiveName for rows never indexed locally). This
 * function never invents a local door_catalog row to make markInstalled's
 * `WHERE id = ?` match something. Instead: `lookupLocal` is re-run here
 * (fresh, not trusting whatever id the browse-time CatalogEntry carried) —
 * a real local row -> markInstalled runs and `installed` will read back 1
 * next time this archive is resolved locally. No local row -> markInstalled
 * is skipped entirely (an UPDATE...WHERE id=<archiveName> would silently
 * match zero rows anyway) and the install proceeds as registry-only: the
 * door is on disk, its .info is written, and refreshDoorRegistry() makes it
 * runnable immediately — only the repo browse view's `installed` flag won't
 * reflect it until a local catalog row for this archive exists by some
 * other means (e.g. a future local scan/import).
 */
export interface ConsumerInstallDeps {
    fetchManifest: (cfg: RepoClientConfig) => Promise<FetchManifestResult>;
    downloadArchive: (cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string) => Promise<void>;
    extractArchiveTo: InstallDeps['extractArchiveTo'];
    findExtractedBinary: InstallDeps['findExtractedBinary'];
    writeInfoFile: InstallDeps['writeInfoFile'];
    lookupLocal: LocalCatalogLookup;
    markInstalled: (id: string, cmd: string, dir: string) => void;
    refreshDoorRegistry: () => Promise<boolean>;
    mkdir: (dir: string) => void;
    unlink: (path: string) => void;
}
export type ConsumerInstallOutcome = {
    ok: true;
    doorType: string;
    fileCount: number;
    binaryRel: string;
    registeredLocally: boolean;
} | {
    ok: false;
    step: string;
    detail: string;
};
export declare function installConsumerDoor(cfg: RepoClientConfig, archiveName: string, doorType: string, binaryName: string | null, finalCmd: string, installDir: string, infoPath: string, tmpDir: string, deps: ConsumerInstallDeps): Promise<ConsumerInstallOutcome>;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map