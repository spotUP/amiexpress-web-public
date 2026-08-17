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
//# sourceMappingURL=repo-client.d.ts.map