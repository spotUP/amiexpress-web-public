"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.artSettingSection = exports.NARROW_COLUMNS = void 0;
exports.originalLogo = originalLogo;
exports.logoFor = logoFor;
/**
 * Which drawing goes above the title bar.
 *
 * The sysop, 2026-09-16: "i would love to take control of the logo". So the
 * five lines are a FILE now - one per style, shipped in `art/` and declared
 * as drawable slots in `door.settings.json`, which is what puts them in the
 * ANSI Studio for the artists at level 100.
 *
 * Three places are tried, in this order:
 *
 *  (The reading itself now lives in the SDK's `utils/door-logo`, shared with the
 * arcade doors; this file only maps a GLC style onto it and owns the compiled-in
 * original.)
 *
 *  1. THE C64 VARIANT, for a caller on forty columns. The Studio stores those
 *     outside the door - `Screens/doors/GLC/setting:logo3.c64.ans` - because
 *     the drawing is the BOARD'S and has to survive a door re-install
 *     (`web/backend/src/doors/door-art-variants.ts`). A door reads it the same
 *     way the board writes it; nothing here reaches into the backend.
 *  2. THE ART FILE the setting names, for everyone else.
 *  3. THE ORIGINAL, compiled in from `GLCViewer.e`. A board that has never
 *     opened the Studio, and a door folder with no `art/` at all, both draw
 *     exactly what the 68K viewer drew - which is what keeps the parity test
 *     meaningful after this file exists.
 */
const door_logo_1 = require("@amiexpress/bbs-door-sdk/utils/door-logo");
Object.defineProperty(exports, "NARROW_COLUMNS", { enumerable: true, get: function () { return door_logo_1.NARROW_COLUMNS; } });
Object.defineProperty(exports, "artSettingSection", { enumerable: true, get: function () { return door_logo_1.artSettingSection; } });
const art_generated_1 = require("./art.generated");
/** What the original ships for this style, and the last word if nothing else answers. */
function originalLogo(style) {
    return style === 1 || style === 3 ? art_generated_1.LOGO_STYLE_1_3 : art_generated_1.LOGO_STYLE_2_4;
}
/**
 * The five lines to draw above the title bar. A narrow caller with no
 * drawing gets none (its title bar is the header); a wide caller with no
 * artist file gets the compiled-in original.
 */
function logoFor(request) {
    const drawn = (0, door_logo_1.readDoorLogo)({
        key: `logo${request.style}`,
        shipped: `style${request.style}`,
        doorDir: request.doorDir,
        bbsRoot: request.bbsRoot,
        columns: request.columns,
        values: request.values,
        command: request.command,
        teletext: request.teletext,
    });
    return drawn ?? originalLogo(request.style);
}
//# sourceMappingURL=logo.js.map