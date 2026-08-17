/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Rewritten around a ViewManager / view stack so each screen owns its
 * own key bindings and ESC always pops cleanly.
 */
import { KeyBinder } from './ViewManager';
import type { DoorRepoMode, LocalCatalogLookup } from './repoDataSource';
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
 * Same stable-slug convention dev/scripts/door-corpus/build-door-catalog.ts
 * uses to derive a door_catalog.id from an archive_name (that script's
 * `baseId`, duplicated here rather than imported: it's a standalone tsx
 * script outside both this package's and web/backend's TypeScript program,
 * not an importable module). Reusing the exact formula matters, not just
 * for readability parity with scanned rows (e.g. "!ALSTER.LHA" -> "_alster"
 * in the seed data) -- it means a door that is BOTH consumer-installed here
 * AND later indexed by a local scan resolves to the SAME id instead of two
 * divergent rows colliding on door_catalog.archive_name's UNIQUE
 * constraint. Deterministic in archiveName alone, so install -> uninstall
 * -> reinstall of the same archive always targets the same row (idempotent
 * upsert, never a duplicate).
 */
export declare function catalogIdForArchive(archiveName: string): string;
/** Mirrors door_catalog's columns (door-catalog.service.ts's upsertCatalogEntry
 * SQL, read directly rather than imported -- see the ConsumerInstallDeps
 * comment below for why). Every column the INSERT statement names must be
 * present here; better-sqlite3's named-parameter binding throws on any
 * referenced column missing from the bound object. */
export interface ConsumerCatalogUpsertRow {
    id: string;
    archive_name: string;
    archive_path: string;
    binary_name: string | null;
    door_type: string;
    name: string;
    version: string | null;
    author: string | null;
    release_group: string | null;
    description: string | null;
    file_id_diz: string | null;
    doc_filename: string | null;
    doc_raw: string | null;
    suggested_tooltypes: string | null;
    category: string | null;
    archive_size: number;
    junk_count: number;
    installed: number;
    installed_as: string | null;
    install_dir: string | null;
    corpus_id: string | null;
    source: string;
}
/** New door_catalog.source value for this install path. The column's only
 * existing value anywhere in the codebase (schema DEFAULT, every seed row)
 * is 'scan' -- the local archive-corpus scanner's provenance tag. 'door-repo'
 * extends that same informal enum minimally: it marks a row as created by
 * a consumer-mode install from the central door-repo API, never by a local
 * filesystem scan. */
export declare const CONSUMER_INSTALL_SOURCE = "door-repo";
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
 * Local registration (fix round 1, overriding the original "never invent a
 * local row" reading of the plan): on a consumer BBS, "no local catalog row
 * yet" is the NORMAL case for a fresh install, not an edge case — a
 * consumer browses the manifest precisely because it has never locally
 * indexed these archives. Leaving `installed` permanently false for every
 * consumer install would break the primary flow. So: `lookupLocal` is
 * re-run here (fresh, never trusting whatever id the browse-time
 * CatalogEntry carried, since that id falls back to archiveName for
 * never-indexed rows and is not a real primary key) --
 *   - a real local row already exists (previously scanned, or previously
 *     installed-then-uninstalled -- markUninstalled keeps the row) ->
 *     markInstalled(localRow.id, ...) runs exactly as before.
 *   - no local row -> UPSERT one first (door-catalog.service.ts's existing,
 *     previously-unused upsertCatalogEntry -- its ON CONFLICT(id) clause
 *     deliberately does not touch installed/installed_as/install_dir, so
 *     it only ever writes metadata, never install state), using
 *     catalogIdForArchive(archiveName) as a deterministic id, populated
 *     ONLY from facts this function actually has (the manifest row's
 *     archive_name/door_type/name/description/archive_size, plus
 *     source='door-repo' recording its provenance) -- never fabricated, and
 *     never claiming the archive is locally stored: archive_path is left
 *     '' (matches repoDataSource.ts's own convention for "no local path
 *     known", and satisfies the column's NOT NULL constraint). Then
 *     markInstalled(newId, ...) runs against that real row exactly like
 *     the "row already exists" branch. `installed` now reads back 1 next
 *     time this archive is resolved locally, satisfying Task 6's
 *     lookupLocal-driven resolution in the repo browse view.
 *   - id collision with a DIFFERENT archive_name already at that slug
 *     (rare -- e.g. two archive names that normalize to the same id) ->
 *     never clobber the unrelated row (same philosophy as the corpus
 *     builder's own collision handling); falls back to registry-only,
 *     logged loudly.
 */
export interface ConsumerInstallDeps {
    fetchManifest: (cfg: RepoClientConfig) => Promise<FetchManifestResult>;
    downloadArchive: (cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string) => Promise<void>;
    extractArchiveTo: InstallDeps['extractArchiveTo'];
    findExtractedBinary: InstallDeps['findExtractedBinary'];
    writeInfoFile: InstallDeps['writeInfoFile'];
    lookupLocal: LocalCatalogLookup;
    /** Existence check ONLY (archive_name of whatever row currently holds
     * this id, if any) -- used to detect a slug collision before upserting.
     * Not the full row; nothing else here needs more than that. */
    getCatalogEntry: (id: string) => {
        archive_name: string;
    } | null;
    upsertCatalogEntry: (entry: ConsumerCatalogUpsertRow) => void;
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
/** True when repo-curation actions (Strip on a repo copy, catalog-row
 * edits, archive delete) are permitted. Owner mode and disabled mode both
 * mean "local catalog only, full local control" (see repoDataSource.ts's
 * module doc grouping them under "local") -- consumer mode is the only mode
 * that does not own the catalog it's browsing. */
export declare function repoViewCurationAllowed(mode: DoorRepoMode): boolean;
/** RepoView's per-entry footer hint string, gated by repo mode. Byte-
 * identical to DOORMAN's pre-Task-8 string in owner mode (and disabled
 * mode, which reads identically) -- only consumer mode differs, by omitting
 * the Strip hint entirely rather than advertising a key that does nothing. */
export declare function repoViewFooterParts(mode: DoorRepoMode, opts: {
    installed: boolean;
    hasJunk: boolean;
    hasDoc: boolean;
}): string;
export interface RepoViewHotkeyHandlers {
    onInstallUninstall: () => void;
    onStrip: () => void;
    onViewDoc: () => void;
    onBrowseArchive: () => void;
    onCycleFilter: () => void;
}
/** Registers RepoView's per-entry action hotkeys (R/S/V/A/C), gated by repo
 * mode: consumer mode omits the [S]trip binding entirely -- see
 * repoViewCurationAllowed. Install/uninstall (R), view doc (V), browse
 * archive contents (A), and the system-type filter (C) register in every
 * mode. */
export declare function registerRepoViewActionKeys(keys: KeyBinder, mode: DoorRepoMode, handlers: RepoViewHotkeyHandlers): void;
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map