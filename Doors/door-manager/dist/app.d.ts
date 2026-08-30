/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */
import type { InstallDeps } from './install-core';
export { buildDoorInfoContent, extractAndRegisterDoor, extractArchiveTo, findExtractedBinary, } from './install-core';
export type { InstallDeps, InstallOutcome } from './install-core';
import type { LocalCatalogLookup } from './repoDataSource';
import type { RepoClientConfig, FetchManifestResult } from './repo-client';
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function commandClaimedByOtherArchive(getInstallByCommand: (command: string) => {
    archive_name: string;
} | null, command: string, archiveName: string): boolean;
export declare function resolveArchivePath(archivePath: string | null | undefined): string | null;
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
    /** Existence check ONLY -- detects a command collision before recording. */
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