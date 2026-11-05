"use strict";
/**
 * The archive browser: what is inside a door archive, from catalog data
 * rather than from lha.
 *
 * Moved out of app.ts when it reached the repo's 2000-line ceiling. It reads
 * the catalog's own column names - path, size, is_junk - so both sources
 * feed it the same shape: a local door_catalog row, or a listing fetched
 * from the door server by a consumer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchiveBrowseView = void 0;
const ViewManager_1 = require("./ViewManager");
const door_theme_1 = require("./door-theme");
// ── Archive Browser (from catalog, no lha needed) ────────────────────────────
class ArchiveBrowseView extends ViewManager_1.BaseView {
    constructor(layout, archiveName, files) {
        super();
        this.layout = layout;
        this.archiveName = archiveName;
        this.files = files;
    }
    enter() {
        // Hide filter panel (was shown in repo mode), use installed-style layout
        this.layout.showInstalledLayout();
        // Filter out hidden files (starting with . or __) and system files
        const visible = this.files.filter((f) => {
            const base = f.path.split('/').pop() ?? f.path;
            return !base.startsWith('.') && !base.startsWith('__');
        });
        const junk = visible.filter((f) => f.is_junk).length;
        const items = visible.map((f) => {
            const sz = f.size < 1024 ? `${f.size}b` : `${Math.round(f.size / 1024)}k`;
            const mark = f.is_junk ? '!' : ' ';
            const w = this.layout.width - 7;
            const name = f.path.length > w
                ? '<' + f.path.slice(f.path.length - w + 1)
                : f.path;
            return `${mark} ${name.padEnd(w)} ${sz.padStart(5)}`;
        });
        this.layout.setListLabel(` ${this.archiveName} (${visible.length} files) `);
        this.layout.setListItems(items);
        this.layout.setListSelect(0);
        this.layout.setInfo(`{${door_theme_1.T.warn}-fg}${this.archiveName}{/${door_theme_1.T.warn}-fg}\n\n` +
            `{${door_theme_1.T.ink}-fg}${visible.length} files{/${door_theme_1.T.ink}-fg}` +
            (junk > 0 ? `  {${door_theme_1.T.alert}-fg}${junk} ad files{/${door_theme_1.T.alert}-fg}` : `  {${door_theme_1.T.ok}-fg}clean{/${door_theme_1.T.ok}-fg}`) +
            `\n\n{${door_theme_1.T.dim}-fg}! = flagged as ad file{/${door_theme_1.T.dim}-fg}`);
        this.layout.setFooter(`{center}{${door_theme_1.T.warn}-fg}↑/↓{/${door_theme_1.T.warn}-fg} Navigate  {${door_theme_1.T.warn}-fg}ESC/Q{/${door_theme_1.T.warn}-fg} Back{/center}`);
        this.layout.focusList();
        this.layout.render();
        this.keys.key(['q', 'Q'], () => this.vm.pop());
    }
    exit() {
        this.layout.showRepoLayout(); // restore repo layout on exit
        this.keys.release();
    }
}
exports.ArchiveBrowseView = ArchiveBrowseView;
//# sourceMappingURL=archive-browse-view.js.map