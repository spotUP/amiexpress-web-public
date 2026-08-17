import type { DoorRepoManifest } from './repo-types.generated';
export interface RepoClientConfig {
    url: string;
    cacheFile: string;
}
export interface FetchManifestResult {
    manifest: DoorRepoManifest;
    fromCache: boolean;
    cachedAt: string | null;
}
export declare function fetchManifest(cfg: RepoClientConfig): Promise<FetchManifestResult>;
export declare function downloadArchive(cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string): Promise<void>;
//# sourceMappingURL=repo-client.d.ts.map