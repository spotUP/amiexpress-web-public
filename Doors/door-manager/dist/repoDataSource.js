"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DOOR_REPO_URL = void 0;
exports.resolveDoorRepoMode = resolveDoorRepoMode;
exports.loadLocalCatalogEntries = loadLocalCatalogEntries;
exports.mapManifestDoorToEntry = mapManifestDoorToEntry;
exports.filterManifestEntries = filterManifestEntries;
exports.loadConsumerCatalog = loadConsumerCatalog;
exports.consumerCacheFilePath = consumerCacheFilePath;
exports.formatOfflineSuffix = formatOfflineSuffix;
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
const path = __importStar(require("path"));
const repo_client_1 = require("./repo-client");
exports.DEFAULT_DOOR_REPO_URL = 'https://bbs.uprough.net';
/**
 * The ONE decision function: owner when DOOR_REPO_ROLE === 'owner' (checked
 * first, regardless of DOOR_REPO_URL); disabled when DOOR_REPO_URL is
 * exactly the empty string; otherwise consumer, with DOOR_REPO_URL
 * defaulting to DEFAULT_DOOR_REPO_URL when unset.
 */
function resolveDoorRepoMode(env = process.env) {
    if (env.DOOR_REPO_ROLE === 'owner')
        return { kind: 'owner' };
    if (env.DOOR_REPO_URL === '')
        return { kind: 'disabled' };
    const rawUrl = env.DOOR_REPO_URL || exports.DEFAULT_DOOR_REPO_URL;
    // Strip trailing slash(es): repo-client.ts joins this base with paths that
    // already start with '/' (e.g. `${cfg.url}/api/door-repo/manifest`), so an
    // operator-supplied DOOR_REPO_URL ending in '/' would otherwise produce a
    // double slash (`https://host//api/door-repo/manifest`) that Express does
    // not route, turning a config typo into a silent-looking 404.
    return { kind: 'consumer', url: rawUrl.replace(/\/+$/, '') };
}
/** Overlays door_installs state onto an already-built CatalogEntry (e.g.
 * one door_catalog's searchCatalog produced). `lookupInstall` is
 * authoritative even on a null result -- a stale door_catalog installed
 * flag must never outrank a real, or a really-absent, door_installs
 * record (same rule mapManifestDoorToEntry's lookupInstall follows). */
function overlayInstallState(entry, lookupInstall) {
    const install = lookupInstall(entry.archive_name);
    return {
        ...entry,
        installed: install ? 1 : 0,
        installed_as: install?.command ?? null,
        install_dir: install?.install_dir ?? null,
    };
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
function loadLocalCatalogEntries(svc, filter, lookupInstall) {
    if (!svc)
        return { entries: [], repoUnavailable: true };
    try {
        const entries = svc.searchCatalog(filter);
        return {
            entries: lookupInstall ? entries.map(e => overlayInstallState(e, lookupInstall)) : entries,
            repoUnavailable: false,
        };
    }
    catch {
        return { entries: [], repoUnavailable: true };
    }
}
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
function mapManifestDoorToEntry(door, lookupLocal, lookupInstall) {
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
function filterManifestEntries(entries, query) {
    const q = query.trim().toLowerCase();
    if (!q)
        return entries;
    return entries.filter(e => [e.archive_name, e.name, e.author, e.release_group, e.description, e.installed_as].some(field => field != null && field.toLowerCase().includes(q)));
}
/**
 * Fetches the central manifest (via the injected fetchManifest, defaulting
 * to repo-client's real implementation) and maps every row. Callers should
 * call this once per browse session (e.g. on view enter), not per
 * keystroke -- see filterManifestEntries above.
 */
async function loadConsumerCatalog(url, cacheFile, lookupLocal, fetchManifestFn = repo_client_1.fetchManifest, lookupInstall) {
    const { manifest, fromCache, cachedAt } = await fetchManifestFn({ url, cacheFile });
    const entries = manifest.doors.map(door => mapManifestDoorToEntry(door, lookupLocal, lookupInstall));
    return { entries, fromCache, cachedAt };
}
/** Cache-file path for the consumer-mode manifest cache -- always derived
 * from resolveBbsRoot()'s result, never guessed independently. */
function consumerCacheFilePath(bbsRoot) {
    return path.join(bbsRoot, 'door-repo-cache.json');
}
/** Header suffix for consumer-mode offline/cached browsing. Empty string
 * when fromCache is false (fresh network fetch) -- callers append this
 * directly to whatever header text they already build. */
function formatOfflineSuffix(fromCache, cachedAt) {
    if (!fromCache)
        return '';
    const date = cachedAt ? cachedAt.slice(0, 10) : 'unknown date';
    return ` OFFLINE (cached ${date})`;
}
//# sourceMappingURL=repoDataSource.js.map