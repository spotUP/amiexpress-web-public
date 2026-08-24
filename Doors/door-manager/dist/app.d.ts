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
     * means for this mode -- both owner and consumer now record a row in
     * door_installs (Task 5); door_catalog no longer carries install state.
     * Errors are caught and logged here, exactly like the pre-Task-5 inline
     * behavior: a bookkeeping failure never rolls back a working on-disk
     * install. */
    recordInstall: () => void;
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
/** Mirrors door_installs' columns (door-installs.repository.ts's
 * DoorInstall, read directly rather than imported -- DOORMAN cannot import
 * web/backend source paths; getInstallsRepo() above reaches the
 * already-loaded module via require.cache instead). `installed_at` is
 * stamped by the repository itself and is intentionally absent. */
export interface DoorInstallEntry {
    id: string;
    catalog_id: string | null;
    archive_name: string;
    command: string;
    install_dir: string;
    door_type: string | null;
    name: string | null;
    md5: string | null;
    description: string | null;
    category: string | null;
    version: string | null;
    release_group: string | null;
    source_url: string | null;
    source_revision: string | null;
}
/**
 * Consumer-mode install: download + verify the archive from the central
 * door-repo API, then hand off to extractAndRegisterDoor for the identical
 * extract/register flow owner mode already uses. destPath always lives
 * under tmp-door-repo/ and is removed in the finally on every path,
 * including every failure — downloadArchive already deletes it on a
 * network/checksum failure, but a failure further down (extract,
 * write-info) still leaves a successfully-downloaded archive sitting in
 * tmp-door-repo/ unless this cleans it up too.
 *
 * Local registration (Task 5): door_installs, not door_catalog, is the
 * install-state store -- no "invent a local catalog row" step. `lookupLocal`
 * still runs (door_catalog) purely to capture `catalog_id` for provenance
 * when a real local row exists; never required for the install to succeed.
 *
 * door_installs enforces uniqueness on `command` (ON CONFLICT(command)
 * upserts, so reinstalling is naturally idempotent) -- which is also why a
 * collision guard is still needed: installing a NEW archive under a command
 * some OTHER archive already owns would otherwise silently overwrite that
 * install's row. `getInstallByCommand(finalCmd)` checks for that and
 * refuses (registry-only, loudly logged) rather than clobbering -- the
 * backfill has shown this BBS has commands claimed by up to nine archives.
 */
export interface ConsumerInstallDeps {
    fetchManifest: (cfg: RepoClientConfig) => Promise<FetchManifestResult>;
    downloadArchive: (cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string) => Promise<void>;
    extractArchiveTo: InstallDeps['extractArchiveTo'];
    findExtractedBinary: InstallDeps['findExtractedBinary'];
    writeInfoFile: InstallDeps['writeInfoFile'];
    lookupLocal: LocalCatalogLookup;
    /** Existence check ONLY (archive_name of whatever install currently holds
     * this command, if any) -- used to detect a command collision. */
    getInstallByCommand: (command: string) => {
        archive_name: string;
    } | null;
    recordInstall: (entry: DoorInstallEntry) => void;
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
/** True when repo-curation actions (Strip on a repo copy, catalog-row
 * edits, archive delete) are permitted. Owner mode and disabled mode both
 * mean "local catalog only, full local control" (see repoDataSource.ts's
 * module doc grouping them under "local") -- consumer mode is the only mode
 * that does not own the catalog it's browsing. */
/**
 * Where the selection should land after a list is rebuilt.
 *
 * Actions that change the list used to send the cursor back to the top,
 * which loses the reader's place: delete row 400 of 3301 and you are back at
 * row 1 with no idea where you were. Keeping the INDEX (rather than the
 * entry) is what a user means by "stay where I am" here - after a delete the
 * row that moved up into that slot is the one under the cursor, which is
 * also the next thing they are likely to act on.
 *
 * Clamped because the list can shrink underneath the index: deleting the
 * last row leaves the old index one past the end.
 */
/**
 * Repo-view presentation helpers live in repo-view-helpers.ts (app.ts hit the
 * 2000-line ceiling). Re-exported so importers and tests do not care where
 * they moved to.
 */
export { wrapText, clampSelection, repoViewCurationAllowed, repoViewFooterParts, registerRepoViewActionKeys, type RepoViewHotkeyHandlers, } from './repo-view-helpers';
export declare function createApp(session: DoorSession): Promise<void>;
//# sourceMappingURL=app.d.ts.map