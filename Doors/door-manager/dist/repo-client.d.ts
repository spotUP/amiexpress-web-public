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
export interface RepoArchiveFiles {
    count: number;
    junkCount: number;
    files: RepoArchiveFile[];
}
/** The archive's contents, or null when the server has none for it. */
export declare function fetchArchiveFiles(cfg: RepoClientConfig, archiveName: string): Promise<RepoArchiveFiles | null>;
/** The archive's documentation, or null when it carries none. */
export declare function fetchDoc(cfg: RepoClientConfig, archiveName: string): Promise<string | null>;
//# sourceMappingURL=repo-client.d.ts.map