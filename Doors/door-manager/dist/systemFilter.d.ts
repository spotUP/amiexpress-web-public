/**
 * DOORMAN door-system filter — pure logic, no blessed.
 *
 * Both RepoView and InstalledView cycle a filter over `door_type` /
 * `type` with the same hotkey ('C'): ALL -> each distinct type present
 * in the CURRENT row set (in first-seen order) -> back to ALL. The type
 * list is derived from whatever rows are on screen right now (never
 * hardcoded), so a newly-indexed type (e.g. DD) shows up automatically.
 */
/** Sentinel meaning "no filter applied" — every row is shown. */
export declare const ALL_TYPES = "ALL";
/**
 * Distinct types present in `rows`, in first-seen order. Falsy/empty
 * types are skipped (callers pass a `typeOf` that already applies a
 * fallback, e.g. `d => d.type || 'AMI'`, so this only guards against a
 * stray empty string slipping through).
 */
export declare function distinctTypes<T>(rows: T[], typeOf: (row: T) => string): string[];
/**
 * Advance the filter one step: ALL -> availableTypes[0] -> ... ->
 * availableTypes[last] -> ALL. If `current` isn't ALL and isn't present
 * in `availableTypes` (the row set changed under it — e.g. a search
 * narrowed the results and the filtered type dropped out), reset to
 * ALL rather than getting stuck on a type nothing matches.
 */
export declare function cycleSystemFilter(current: string, availableTypes: string[]): string;
/** Apply the current filter to `rows`. ALL_TYPES is a no-op pass-through. */
export declare function filterByDoorType<T>(rows: T[], sys: string, typeOf: (row: T) => string): T[];
//# sourceMappingURL=systemFilter.d.ts.map