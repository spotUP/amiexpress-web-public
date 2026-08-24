import type { ManifestDoor } from './repo-types.generated';
import { type RepoClientConfig, type FetchManifestResult } from './repo-client';
export interface CatalogEntry {
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
}
export type DoorRepoMode = {
    kind: 'owner';
} | {
    kind: 'disabled';
} | {
    kind: 'consumer';
    url: string;
};
export declare const DEFAULT_DOOR_REPO_URL = "https://bbs.uprough.net";
/**
 * The ONE decision function: owner when DOOR_REPO_ROLE === 'owner' (checked
 * first, regardless of DOOR_REPO_URL); disabled when DOOR_REPO_URL is
 * exactly the empty string; otherwise consumer, with DOOR_REPO_URL
 * defaulting to DEFAULT_DOOR_REPO_URL when unset.
 */
export declare function resolveDoorRepoMode(env?: Record<string, string | undefined>): DoorRepoMode;
/** This node's install record for an archive -- e.g. the door-installs
 * repository's getInstallByArchive (web/backend/src/doors/
 * door-installs.repository.ts). Distinct from LocalCatalogLookup: install
 * state (installed/installed_as/install_dir) now lives in door_installs,
 * a separate table from door_catalog's metadata (id/archive_path/
 * binary_name) -- see door-installs.repository.ts's header comment for why
 * the split exists. Returns null when this archive has no install record. */
export interface InstallRecord {
    command: string;
    install_dir: string;
}
export type InstallLookup = (archiveName: string) => InstallRecord | null;
export interface LocalCatalogSvc {
    searchCatalog: (query: string) => CatalogEntry[];
}
export interface LoadLocalCatalogResult {
    entries: CatalogEntry[];
    repoUnavailable: boolean;
}
/**
 * Byte-identical to DOORMAN's original (pre-Task-6) loadEntries() when
 * `lookupInstall` is omitted: a missing catalog service, or any error
 * thrown by searchCatalog (e.g. the live volume DB has no door_catalog
 * table), yields an empty list with repoUnavailable:true rather than
 * propagating.
 *
 * `lookupInstall` (Task 5, optional): when supplied, every returned entry's
 * installed/installed_as/install_dir is overlaid from door_installs instead
 * of trusting door_catalog's own columns -- an owner-mode install (Task 5)
 * no longer writes those columns, so without this an owner's own local
 * browse list would show every newly-installed door as never installed.
 */
export declare function loadLocalCatalogEntries(svc: LocalCatalogSvc | null, filter: string, lookupInstall?: InstallLookup): LoadLocalCatalogResult;
export interface LocalCatalogRow {
    id: string;
    installed: number;
    installed_as: string | null;
    install_dir: string | null;
    binary_name: string | null;
    archive_path: string | null;
}
/** Looks up a manifest door's local install state by archive name (e.g. the
 * catalog service's getCatalogEntryByArchive). Returns null when the door
 * has never been indexed/installed locally. */
export type LocalCatalogLookup = (archiveName: string) => LocalCatalogRow | null;
/**
 * Maps one central-repo manifest row into the CatalogEntry shape the view
 * renders. `id`/`archive_path`/`binary_name` come from `lookupLocal` (real
 * only when this archive was also indexed by a local door_catalog scan) --
 * the central manifest has no concept of what is installed on this
 * particular BBS.
 *
 * `installed`/`installed_as`/`install_dir` come from `lookupInstall`
 * (door_installs) whenever the caller supplies one -- door_installs is now
 * the source of truth for install state on THIS node, since a
 * consumer-mode install (Task 5) records there directly without ever
 * touching door_catalog. A supplied `lookupInstall` is authoritative even
 * when it returns null (no install record): that null must win over a
 * stale door_catalog row, which is exactly the drift this split exists to
 * prevent. `lookupLocal`'s door_catalog-sourced installed/installed_as/
 * install_dir are used ONLY when `lookupInstall` is omitted entirely (not
 * the same as "returned null"), so existing callers that have no
 * door_installs lookup to give keep working unchanged.
 *
 * Fields the manifest genuinely has no equivalent for (version,
 * doc_filename, doc_raw, suggested_tooltypes, junk_count) are left at a
 * neutral default; browsing/filtering never reads them for manifest rows.
 */
export declare function mapManifestDoorToEntry(door: ManifestDoor, lookupLocal: LocalCatalogLookup, lookupInstall?: InstallLookup): CatalogEntry;
/**
 * Client-side text filter over already-mapped manifest entries, mirroring
 * door-catalog.service's searchCatalog SQL WHERE clause field-for-field
 * (archive_name, name, author, release_group, description, installed_as),
 * case-insensitive substring match. Manifest rows are fetched/mapped once
 * and kept in memory -- this runs on every keystroke instead of hitting the
 * network, exactly like the local mode's sqlite LIKE query runs on every
 * keystroke instead of a fresh disk scan.
 */
export declare function filterManifestEntries(entries: CatalogEntry[], query: string): CatalogEntry[];
export interface LoadConsumerCatalogResult {
    /** ALL manifest entries, mapped + locally-resolved -- NOT text-filtered.
     * Callers apply filterManifestEntries/filterByDoorType on top, client-side,
     * so re-filtering never re-fetches. */
    entries: CatalogEntry[];
    fromCache: boolean;
    cachedAt: string | null;
}
/**
 * Fetches the central manifest (via the injected fetchManifest, defaulting
 * to repo-client's real implementation) and maps every row. Callers should
 * call this once per browse session (e.g. on view enter), not per
 * keystroke -- see filterManifestEntries above.
 */
export declare function loadConsumerCatalog(url: string, cacheFile: string, lookupLocal: LocalCatalogLookup, fetchManifestFn?: (cfg: RepoClientConfig) => Promise<FetchManifestResult>, lookupInstall?: InstallLookup): Promise<LoadConsumerCatalogResult>;
/** Cache-file path for the consumer-mode manifest cache -- always derived
 * from resolveBbsRoot()'s result, never guessed independently. */
export declare function consumerCacheFilePath(bbsRoot: string): string;
/** Header suffix for consumer-mode offline/cached browsing. Empty string
 * when fromCache is false (fresh network fetch) -- callers append this
 * directly to whatever header text they already build. */
export declare function formatOfflineSuffix(fromCache: boolean, cachedAt: string | null): string;
//# sourceMappingURL=repoDataSource.d.ts.map