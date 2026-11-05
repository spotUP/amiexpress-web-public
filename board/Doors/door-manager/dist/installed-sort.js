"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SORT_MODES = void 0;
exports.nextSortMode = nextSortMode;
exports.sortLabel = sortLabel;
exports.sortInstalled = sortInstalled;
exports.SORT_MODES = ['default', 'access-asc', 'access-desc'];
function nextSortMode(mode) {
    return exports.SORT_MODES[(exports.SORT_MODES.indexOf(mode) + 1) % exports.SORT_MODES.length];
}
/** What the list label says about the order. Empty for the board's own. */
function sortLabel(mode) {
    if (mode === 'access-asc')
        return 'by access, low first';
    if (mode === 'access-desc')
        return 'by access, high first';
    return '';
}
function sortInstalled(doors, mode) {
    const out = doors.slice();
    if (mode === 'default')
        return out;
    const level = (d) => (typeof d.accessLevel === 'number' ? d.accessLevel : 0);
    const sign = mode === 'access-asc' ? 1 : -1;
    // Array.prototype.sort is stable (ES2019), so equal levels keep their order.
    return out.sort((a, b) => sign * (level(a) - level(b)));
}
//# sourceMappingURL=installed-sort.js.map