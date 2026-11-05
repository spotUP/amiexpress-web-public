import type { DoorRepoManifest } from './repo-types.generated';
export interface RepoClientConfig {
    url: string;
    cacheFile: string;
    /** Test-only overrides for MANIFEST_TIMEOUT_MS / ARCHIVE_TIMEOUT_MS below.
     * Production callers (app.ts, repoDataSource.ts) never set these and get
     * the vetted defaults -- this exists so tests can prove the AbortSignal
     * wiring against a real stalling http.Server without waiting out the real
     * 20s/120s bounds. */
    manifestTimeoutMs?: number;
    archiveTimeoutMs?: number;
}
export interface FetchManifestResult {
    manifest: DoorRepoManifest;
    fromCache: boolean;
    cachedAt: string | null;
}
export declare function fetchManifest(cfg: RepoClientConfig): Promise<FetchManifestResult>;
export declare function downloadArchive(cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string): Promise<void>;
/**
 * Teach the central classifier a new junk pattern. Used by DOORMAN's
 * StripView when the sysop marks a file as ad/junk that the classifier
 * missed. The pattern is an exact filename glob (e.g. "7hE-EdGE.nfo").
 *
 * Requires DOORREPO_LEARN_KEY to be set on the doorserver; silently
 * succeeds (returns { ok: false }) when the server has no learn key
 * configured, so DOORMAN never blocks on a server that does not opt in.
 */
export declare function learnPattern(cfg: RepoClientConfig, pattern: string, learnKey: string | null, archiveName?: string, filePath?: string): Promise<{
    ok: boolean;
    id?: number;
    duplicate?: boolean;
}>;
export interface RepoArchiveFile {
    size: number;
    isJunk: boolean;
    path: string;
}
/** One catalog row as GET /doors/:archiveName returns it. Only the fields
 *  DOORMAN renders or records are typed here; the endpoint sends more
 *  (screenshots, Demozoo credits, download URL) that this door has no use
 *  for. */
export interface RepoDoorDetail {
    archiveName: string;
    name: string | null;
    version: string | null;
    description: string | null;
    category: string | null;
    author: string | null;
    releaseGroup: string | null;
    fileIdDiz: string | null;
    docFilename: string | null;
    doc: string | null;
    /** As stored: a JSON object of tooltype name -> value, from whatever the
     *  scanner read out of the archive's own icon or its documentation. Often
     *  partial or nonsense ("LOCATION":"<dir>-"), which is why it is shown to
     *  the sysop and never written into an installed door's .info. */
    suggestedTooltypes: string | null;
    junkCount: number;
    hasDoc: boolean;
    md5: string | null;
    sha256: string | null;
    files: RepoArchiveFile[];
}
/** Everything the repo knows about one archive, or null when the server has
 *  no such row, cannot be reached, or answers with something that is not
 *  this shape. Never throws: every caller is a UI action that must degrade
 *  to "the repo could not tell us", not take the door down. */
export declare function fetchDoorDetail(cfg: RepoClientConfig, archiveName: string): Promise<RepoDoorDetail | null>;
//# sourceMappingURL=repo-client.d.ts.map