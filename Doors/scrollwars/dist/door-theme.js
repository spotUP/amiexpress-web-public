"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT = exports.S = exports.T = void 0;
exports.applyTheme = applyTheme;
/**
 * SCROLLWARS colours, from the caller's theme.
 *
 * This door spread literal colour names through its widgets - `fg: 'cyan'`,
 * `bg: 'blue'`, `{yellow-fg}` - which is a door that looks identical
 * whatever theme the caller chose. Each literal is now the TOKEN that was
 * standing behind it, so `classic` renders exactly as before (its tokens ARE
 * those names) and every other theme is followed rather than ignored.
 *
 * `T` and `S` are live bindings: `applyTheme` reassigns them once at startup
 * and every use site sees the new values.
 *
 * Copied from DOORMAN's `door-theme.ts`, which is the reference migration -
 * not reinvented, so all the migrated doors keep one shape.
 */
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
/** Raw tokens, for tags and style objects. */
exports.T = (0, theme_1.themeById)('classic').tokens;
/** Ready-made widget styles: panels, frames, bars, lists. */
exports.S = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
/** The theme itself, for the few places that need its border or rail. */
exports.CURRENT = (0, theme_1.themeById)('classic');
/**
 * Re-theme this door.
 *
 * Safe to call with anything - a host with no theme leaves the classic
 * default in place, which is the board exactly as it has always looked.
 */
function applyTheme(source) {
    const theme = (0, theme_1.resolveTheme)(source);
    if (!theme)
        return;
    exports.CURRENT = theme;
    exports.T = theme.tokens;
    exports.S = (0, theme_1.themeStyles)(theme);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9vci10aGVtZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2Rvb3ItdGhlbWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBdUNBLGdDQU1DO0FBN0NEOzs7Ozs7Ozs7Ozs7OztHQWNHO0FBQ0gscUVBT21EO0FBRW5ELDhDQUE4QztBQUNuQyxRQUFBLENBQUMsR0FBZ0IsSUFBQSxpQkFBUyxFQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUV4RCw2REFBNkQ7QUFDbEQsUUFBQSxDQUFDLEdBQWdCLElBQUEsbUJBQVcsRUFBQyxJQUFBLGlCQUFTLEVBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUU5RCx5RUFBeUU7QUFDOUQsUUFBQSxPQUFPLEdBQVUsSUFBQSxpQkFBUyxFQUFDLFNBQVMsQ0FBQyxDQUFDO0FBRWpEOzs7OztHQUtHO0FBQ0gsU0FBZ0IsVUFBVSxDQUFDLE1BQWU7SUFDeEMsTUFBTSxLQUFLLEdBQUcsSUFBQSxvQkFBWSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25DLElBQUksQ0FBQyxLQUFLO1FBQUUsT0FBTztJQUNuQixlQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ2hCLFNBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO0lBQ2pCLFNBQUMsR0FBRyxJQUFBLG1CQUFXLEVBQUMsS0FBSyxDQUFDLENBQUM7QUFDekIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU0NST0xMV0FSUyBjb2xvdXJzLCBmcm9tIHRoZSBjYWxsZXIncyB0aGVtZS5cbiAqXG4gKiBUaGlzIGRvb3Igc3ByZWFkIGxpdGVyYWwgY29sb3VyIG5hbWVzIHRocm91Z2ggaXRzIHdpZGdldHMgLSBgZmc6ICdjeWFuJ2AsXG4gKiBgYmc6ICdibHVlJ2AsIGB7eWVsbG93LWZnfWAgLSB3aGljaCBpcyBhIGRvb3IgdGhhdCBsb29rcyBpZGVudGljYWxcbiAqIHdoYXRldmVyIHRoZW1lIHRoZSBjYWxsZXIgY2hvc2UuIEVhY2ggbGl0ZXJhbCBpcyBub3cgdGhlIFRPS0VOIHRoYXQgd2FzXG4gKiBzdGFuZGluZyBiZWhpbmQgaXQsIHNvIGBjbGFzc2ljYCByZW5kZXJzIGV4YWN0bHkgYXMgYmVmb3JlIChpdHMgdG9rZW5zIEFSRVxuICogdGhvc2UgbmFtZXMpIGFuZCBldmVyeSBvdGhlciB0aGVtZSBpcyBmb2xsb3dlZCByYXRoZXIgdGhhbiBpZ25vcmVkLlxuICpcbiAqIGBUYCBhbmQgYFNgIGFyZSBsaXZlIGJpbmRpbmdzOiBgYXBwbHlUaGVtZWAgcmVhc3NpZ25zIHRoZW0gb25jZSBhdCBzdGFydHVwXG4gKiBhbmQgZXZlcnkgdXNlIHNpdGUgc2VlcyB0aGUgbmV3IHZhbHVlcy5cbiAqXG4gKiBDb3BpZWQgZnJvbSBET09STUFOJ3MgYGRvb3ItdGhlbWUudHNgLCB3aGljaCBpcyB0aGUgcmVmZXJlbmNlIG1pZ3JhdGlvbiAtXG4gKiBub3QgcmVpbnZlbnRlZCwgc28gYWxsIHRoZSBtaWdyYXRlZCBkb29ycyBrZWVwIG9uZSBzaGFwZS5cbiAqL1xuaW1wb3J0IHtcbiAgdGhlbWVTdHlsZXMsXG4gIHRoZW1lQnlJZCxcbiAgcmVzb2x2ZVRoZW1lLFxuICB0eXBlIFRoZW1lLFxuICB0eXBlIFRoZW1lVG9rZW5zLFxuICB0eXBlIFRoZW1lU3R5bGVzLFxufSBmcm9tICdAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsvZW5naW5lcy91aS90aGVtZSc7XG5cbi8qKiBSYXcgdG9rZW5zLCBmb3IgdGFncyBhbmQgc3R5bGUgb2JqZWN0cy4gKi9cbmV4cG9ydCBsZXQgVDogVGhlbWVUb2tlbnMgPSB0aGVtZUJ5SWQoJ2NsYXNzaWMnKS50b2tlbnM7XG5cbi8qKiBSZWFkeS1tYWRlIHdpZGdldCBzdHlsZXM6IHBhbmVscywgZnJhbWVzLCBiYXJzLCBsaXN0cy4gKi9cbmV4cG9ydCBsZXQgUzogVGhlbWVTdHlsZXMgPSB0aGVtZVN0eWxlcyh0aGVtZUJ5SWQoJ2NsYXNzaWMnKSk7XG5cbi8qKiBUaGUgdGhlbWUgaXRzZWxmLCBmb3IgdGhlIGZldyBwbGFjZXMgdGhhdCBuZWVkIGl0cyBib3JkZXIgb3IgcmFpbC4gKi9cbmV4cG9ydCBsZXQgQ1VSUkVOVDogVGhlbWUgPSB0aGVtZUJ5SWQoJ2NsYXNzaWMnKTtcblxuLyoqXG4gKiBSZS10aGVtZSB0aGlzIGRvb3IuXG4gKlxuICogU2FmZSB0byBjYWxsIHdpdGggYW55dGhpbmcgLSBhIGhvc3Qgd2l0aCBubyB0aGVtZSBsZWF2ZXMgdGhlIGNsYXNzaWNcbiAqIGRlZmF1bHQgaW4gcGxhY2UsIHdoaWNoIGlzIHRoZSBib2FyZCBleGFjdGx5IGFzIGl0IGhhcyBhbHdheXMgbG9va2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlUaGVtZShzb3VyY2U6IHVua25vd24pOiB2b2lkIHtcbiAgY29uc3QgdGhlbWUgPSByZXNvbHZlVGhlbWUoc291cmNlKTtcbiAgaWYgKCF0aGVtZSkgcmV0dXJuO1xuICBDVVJSRU5UID0gdGhlbWU7XG4gIFQgPSB0aGVtZS50b2tlbnM7XG4gIFMgPSB0aGVtZVN0eWxlcyh0aGVtZSk7XG59XG4iXX0=