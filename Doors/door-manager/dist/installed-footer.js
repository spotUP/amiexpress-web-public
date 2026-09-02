"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installedFooter = installedFooter;
const door_theme_1 = require("./door-theme");
/**
 * The installed-doors footer.
 *
 * Presentation only, and out of app.ts because that file is at the project's
 * 2000-line ceiling and a key list is the least view-dependent thing in it.
 * Pure, so the key list can be asserted without a terminal.
 */
/**
 * @param enabled whether the SELECTED door is enabled; the E key offers the
 *                opposite of the current state, and reads wrong otherwise.
 */
function installedFooter(enabled, narrow = false) {
    const en = enabled ? 'Dis' : 'En';
    // A 40-column footer holds about five hints. These are the five: run it,
    // read it, remove it, switch it off, leave. Upload/Files/doc/Strip/Tab
    // still work - they are just not advertised on a screen with no room.
    if (narrow) {
        return (`{center}{${door_theme_1.T.warn}-fg}ENTER{/${door_theme_1.T.warn}-fg}=Run {${door_theme_1.T.warn}-fg}I{/${door_theme_1.T.warn}-fg}=Info ` +
            `{${door_theme_1.T.warn}-fg}D{/${door_theme_1.T.warn}-fg}=Del {${door_theme_1.T.warn}-fg}E{/${door_theme_1.T.warn}-fg}=${en} ` +
            `{${door_theme_1.T.warn}-fg}Q{/${door_theme_1.T.warn}-fg}=Quit{/center}`);
    }
    return (`{center}{${door_theme_1.T.warn}-fg}ENTER{/${door_theme_1.T.warn}-fg}=Run {${door_theme_1.T.warn}-fg}U{/${door_theme_1.T.warn}-fg}pload ` +
        `{${door_theme_1.T.warn}-fg}I{/${door_theme_1.T.warn}-fg}nfo {${door_theme_1.T.warn}-fg}F{/${door_theme_1.T.warn}-fg}iles ` +
        `{${door_theme_1.T.warn}-fg}D{/${door_theme_1.T.warn}-fg}el {${door_theme_1.T.warn}-fg}V{/${door_theme_1.T.warn}-fg}iew doc {${door_theme_1.T.warn}-fg}E{/${door_theme_1.T.warn}-fg}=${en} ` +
        `{${door_theme_1.T.warn}-fg}S{/${door_theme_1.T.warn}-fg}trip {${door_theme_1.T.warn}-fg}Tab{/${door_theme_1.T.warn}-fg}=Repo {${door_theme_1.T.warn}-fg}Q{/${door_theme_1.T.warn}-fg}uit{/center}`);
}
//# sourceMappingURL=installed-footer.js.map