"use strict";
/**
 * DOORMAN door-system filter — pure logic, no blessed.
 *
 * RepoView cycles a filter over `door_type` with the 'C' hotkey: ALL ->
 * each distinct type present in the CURRENT row set (in first-seen order)
 * -> back to ALL. The type list is derived from whatever rows are on
 * screen right now (never hardcoded), so a newly-indexed type (e.g. DD)
 * shows up automatically. RepoView only — InstalledView does not use this
 * module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_TYPES = void 0;
exports.distinctTypes = distinctTypes;
exports.cycleSystemFilter = cycleSystemFilter;
exports.filterByDoorType = filterByDoorType;
/** Sentinel meaning "no filter applied" — every row is shown. */
exports.ALL_TYPES = 'ALL';
/**
 * Distinct types present in `rows`, in first-seen order. Falsy/empty
 * types are skipped (callers pass a `typeOf` that already applies a
 * fallback, e.g. RepoView's `e => e.door_type || 'XIM'`, so this only
 * guards against a stray empty string slipping through).
 */
function distinctTypes(rows, typeOf) {
    const seen = new Set();
    const result = [];
    for (const row of rows) {
        const t = typeOf(row);
        if (t && !seen.has(t)) {
            seen.add(t);
            result.push(t);
        }
    }
    return result;
}
/**
 * Advance the filter one step: ALL -> availableTypes[0] -> ... ->
 * availableTypes[last] -> ALL. If `current` isn't ALL and isn't present
 * in `availableTypes` (the row set changed under it — e.g. a search
 * narrowed the results and the filtered type dropped out), reset to
 * ALL rather than getting stuck on a type nothing matches.
 */
function cycleSystemFilter(current, availableTypes) {
    if (availableTypes.length === 0)
        return exports.ALL_TYPES;
    if (current === exports.ALL_TYPES)
        return availableTypes[0];
    const idx = availableTypes.indexOf(current);
    if (idx === -1 || idx === availableTypes.length - 1)
        return exports.ALL_TYPES;
    return availableTypes[idx + 1];
}
/** Apply the current filter to `rows`. ALL_TYPES is a no-op pass-through. */
function filterByDoorType(rows, sys, typeOf) {
    if (sys === exports.ALL_TYPES)
        return rows;
    return rows.filter(row => typeOf(row) === sys);
}
//# sourceMappingURL=systemFilter.js.map