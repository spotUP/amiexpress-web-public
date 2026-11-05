/** Where the last good answer is kept, beside the door. */
export declare const CACHE_FILE = "glc.lastgood.json";
export interface DeadlineResult {
    /** The JSON body, from the network or from the cache. */
    body: string | null;
    /** Where it came from, for the notice the door draws. */
    source: 'network' | 'cache' | 'nothing';
}
/**
 * Race a fetch against the clock.
 *
 * The promise is not cancelled - it cannot be, in general - but it is
 * ABANDONED: whatever it eventually settles to is ignored, and the caller has
 * already been given the cache. `onLate` exists so a late answer can still be
 * written to the cache for the next caller, which is where a slow scenewall
 * pays for itself.
 */
export declare function withDeadline(fetch: () => Promise<string>, timeoutSeconds: number, onLate?: (body: string) => void): Promise<string | null>;
/** The last answer this door got, or null when it has never had one. */
export declare function readCache(doorDir: string): string | null;
/**
 * Keep this answer for the next caller.
 *
 * Written through a temporary file: a door killed mid-write would otherwise
 * leave a truncated cache, and the next caller would see a parse error
 * instead of yesterday's list.
 */
export declare function writeCache(doorDir: string, body: string): void;
/** The body to draw, and where it came from. */
export declare function bodyForThisCall(fetch: () => Promise<string>, timeoutSeconds: number, doorDir: string): Promise<DeadlineResult>;
//# sourceMappingURL=fetch-deadline.d.ts.map