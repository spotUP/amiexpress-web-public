/**
 * repoDataSource: pure, blessed-free logic behind RepoView's data source
 * (app.ts). Two data sources feed the same `CatalogEntry` shape the view
 * renders:
 *
 *   - "local" (owner mode AND disabled mode): the BBS's own door_catalog
 *     sqlite table, via the catalog service's searchCatalog(). This is
 *     BYTE-IDENTICAL to DOORMAN's pre-Task-6 behavior -- extracted here,
 *     unchanged, so both modes share one implementation and it is unit
 *     testable without a blessed screen.
 *   - "consumer": the central door-repo HTTP API (repo-client.ts's
 *     fetchManifest), mapped into the same CatalogEntry shape. The central
 *     manifest knows nothing about what is installed on THIS BBS, so
 *     `installed`/`installed_as`/`install_dir` are always resolved locally
 *     via a caller-supplied lookup against the local catalog.
 *
 * Mode selection (resolveDoorRepoMode) is the ONE place that reads
 * DOOR_REPO_ROLE/DOOR_REPO_URL -- app.ts and any future consumer (e.g. a
 * later curation-gating task) call this instead of re-deriving the rule.
 */
import * as path from 'path';
import type { ManifestDoor } from './repo-types.generated';
import { fetchManifest, type RepoClientConfig, type FetchManifestResult } from './repo-client';

// ─── Entry shape ────────────────────────────────────────────────────────────
//
// Mirrors app.ts's (formerly locally-declared) CatalogEntry -- the row shape
// RepoView renders regardless of which data source populated it. Single
// source of truth: app.ts imports this type rather than redeclaring it.

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

// ─── Mode selection ─────────────────────────────────────────────────────────

export type DoorRepoMode =
  | { kind: 'owner' }
  | { kind: 'disabled' }
  | { kind: 'consumer'; url: string };

export const DEFAULT_DOOR_REPO_URL = 'https://bbs.uprough.net';

/**
 * The ONE decision function: owner when DOOR_REPO_ROLE === 'owner' (checked
 * first, regardless of DOOR_REPO_URL); disabled when DOOR_REPO_URL is
 * exactly the empty string; otherwise consumer, with DOOR_REPO_URL
 * defaulting to DEFAULT_DOOR_REPO_URL when unset.
 */
export function resolveDoorRepoMode(
  env: Record<string, string | undefined> = process.env
): DoorRepoMode {
  if (env.DOOR_REPO_ROLE === 'owner') return { kind: 'owner' };
  if (env.DOOR_REPO_URL === '') return { kind: 'disabled' };
  const rawUrl = env.DOOR_REPO_URL || DEFAULT_DOOR_REPO_URL;
  // Strip trailing slash(es): repo-client.ts joins this base with paths that
  // already start with '/' (e.g. `${cfg.url}/api/door-repo/manifest`), so an
  // operator-supplied DOOR_REPO_URL ending in '/' would otherwise produce a
  // double slash (`https://host//api/door-repo/manifest`) that Express does
  // not route, turning a config typo into a silent-looking 404.
  return { kind: 'consumer', url: rawUrl.replace(/\/+$/, '') };
}

// ─── Install state (door_installs) ──────────────────────────────────────────
//
// Shared by BOTH the local ("owner"/"disabled") and consumer data sources
// below: door_installs, not door_catalog, is the source of truth for what
// THIS node has installed (Task 5) -- a consumer-mode install never touches
// door_catalog at all, and an owner-mode install no longer writes
// installed/installed_as/install_dir there either.

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

/** Overlays door_installs state onto an already-built CatalogEntry (e.g.
 * one door_catalog's searchCatalog produced). `lookupInstall` is
 * authoritative even on a null result -- a stale door_catalog installed
 * flag must never outrank a real, or a really-absent, door_installs
 * record (same rule mapManifestDoorToEntry's lookupInstall follows). */
function overlayInstallState(entry: CatalogEntry, lookupInstall: InstallLookup): CatalogEntry {
  const install = lookupInstall(entry.archive_name);
  return {
    ...entry,
    installed: install ? 1 : 0,
    installed_as: install?.command ?? null,
    install_dir: install?.install_dir ?? null,
  };
}

// ─── Local ("owner"/"disabled") data source ─────────────────────────────────

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
export function loadLocalCatalogEntries(
  svc: LocalCatalogSvc | null,
  filter: string,
  lookupInstall?: InstallLookup
): LoadLocalCatalogResult {
  if (!svc) return { entries: [], repoUnavailable: true };
  try {
    const entries = svc.searchCatalog(filter);
    return {
      entries: lookupInstall ? entries.map(e => overlayInstallState(e, lookupInstall)) : entries,
      repoUnavailable: false,
    };
  } catch {
    return { entries: [], repoUnavailable: true };
  }
}

// ─── Consumer (central repo) data source ────────────────────────────────────

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
export function mapManifestDoorToEntry(
  door: ManifestDoor,
  lookupLocal: LocalCatalogLookup,
  lookupInstall?: InstallLookup
): CatalogEntry {
  const local = lookupLocal(door.archiveName);
  const install = lookupInstall?.(door.archiveName);
  const installKnown = lookupInstall !== undefined;
  return {
    id: local?.id ?? door.archiveName,
    archive_name: door.archiveName,
    archive_path: local?.archive_path ?? '',
    binary_name: local?.binary_name ?? null,
    door_type: door.doorType,
    name: door.name ?? door.archiveName,
    version: null,
    author: door.author,
    release_group: door.releaseGroup,
    description: door.description,
    file_id_diz: door.fileIdDiz,
    doc_filename: null,
    doc_raw: null,
    suggested_tooltypes: null,
    category: door.category,
    archive_size: door.archiveSize ?? 0,
    junk_count: 0,
    installed: installKnown ? (install ? 1 : 0) : (local?.installed ? 1 : 0),
    installed_as: installKnown ? (install?.command ?? null) : (local?.installed_as ?? null),
    install_dir: installKnown ? (install?.install_dir ?? null) : (local?.install_dir ?? null),
  };
}

/**
 * Client-side text filter over already-mapped manifest entries, mirroring
 * door-catalog.service's searchCatalog SQL WHERE clause field-for-field
 * (archive_name, name, author, release_group, description, installed_as),
 * case-insensitive substring match. Manifest rows are fetched/mapped once
 * and kept in memory -- this runs on every keystroke instead of hitting the
 * network, exactly like the local mode's sqlite LIKE query runs on every
 * keystroke instead of a fresh disk scan.
 */
export function filterManifestEntries(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e =>
    [e.archive_name, e.name, e.author, e.release_group, e.description, e.installed_as].some(
      field => field != null && field.toLowerCase().includes(q)
    )
  );
}

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
export async function loadConsumerCatalog(
  url: string,
  cacheFile: string,
  lookupLocal: LocalCatalogLookup,
  fetchManifestFn: (cfg: RepoClientConfig) => Promise<FetchManifestResult> = fetchManifest,
  lookupInstall?: InstallLookup
): Promise<LoadConsumerCatalogResult> {
  const { manifest, fromCache, cachedAt } = await fetchManifestFn({ url, cacheFile });
  const entries = manifest.doors.map(door => mapManifestDoorToEntry(door, lookupLocal, lookupInstall));
  return { entries, fromCache, cachedAt };
}

/** Cache-file path for the consumer-mode manifest cache -- always derived
 * from resolveBbsRoot()'s result, never guessed independently. */
export function consumerCacheFilePath(bbsRoot: string): string {
  return path.join(bbsRoot, 'door-repo-cache.json');
}

/** Header suffix for consumer-mode offline/cached browsing. Empty string
 * when fromCache is false (fresh network fetch) -- callers append this
 * directly to whatever header text they already build. */
export function formatOfflineSuffix(fromCache: boolean, cachedAt: string | null): string {
  if (!fromCache) return '';
  const date = cachedAt ? cachedAt.slice(0, 10) : 'unknown date';
  return ` OFFLINE (cached ${date})`;
}
