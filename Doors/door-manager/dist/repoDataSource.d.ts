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
export interface LocalCatalogSvc {
    searchCatalog: (query: string) => CatalogEntry[];
}
export interface LoadLocalCatalogResult {
    entries: CatalogEntry[];
    repoUnavailable: boolean;
}
/**
 * Byte-identical to DOORMAN's original (pre-Task-6) loadEntries(): a missing
 * catalog service, or any error thrown by searchCatalog (e.g. the live
 * volume DB has no door_catalog table), yields an empty list with
 * repoUnavailable:true rather than propagating.
 */
export declare function loadLocalCatalogEntries(svc: LocalCatalogSvc | null, filter: string): LoadLocalCatalogResult;
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
 * renders. `installed`/`installed_as`/`install_dir` (and, when available,
 * `id`/`archive_path`/`binary_name`) come from `lookupLocal` -- the central
 * manifest has no concept of what is installed on this particular BBS.
 * Fields the manifest genuinely has no equivalent for (version,
 * doc_filename, doc_raw, suggested_tooltypes, junk_count) are left at a
 * neutral default; browsing/filtering never reads them for manifest rows.
 */
export declare function mapManifestDoorToEntry(door: ManifestDoor, lookupLocal: LocalCatalogLookup): CatalogEntry;
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
export declare function loadConsumerCatalog(url: string, cacheFile: string, lookupLocal: LocalCatalogLookup, fetchManifestFn?: (cfg: RepoClientConfig) => Promise<FetchManifestResult>): Promise<LoadConsumerCatalogResult>;
/** Cache-file path for the consumer-mode manifest cache -- always derived
 * from resolveBbsRoot()'s result, never guessed independently. */
export declare function consumerCacheFilePath(bbsRoot: string): string;
/** Header suffix for consumer-mode offline/cached browsing. Empty string
 * when fromCache is false (fresh network fetch) -- callers append this
 * directly to whatever header text they already build. */
export declare function formatOfflineSuffix(fromCache: boolean, cachedAt: string | null): string;
//# sourceMappingURL=repoDataSource.d.ts.map