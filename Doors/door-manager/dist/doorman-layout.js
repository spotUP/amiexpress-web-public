"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoormanLayout = void 0;
exports.formatSize = formatSize;
/**
 * DOORMAN's shared layout: one set of panels that every view updates in
 * place, and the width rules that decide their shape.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
 *
 * Every width decision here comes from the LIVE screen through the SDK's
 * single compact profile. There is no 40 and no 80 in this file: the door
 * used to build its Screen with no geometry at all and paint an 80-column
 * layout onto whatever canvas the caller had, which is what a C64 saw as a
 * repeated name column and size cells on the wrong rows.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_theme_1 = require("./door-theme");
const type_badge_1 = require("./type-badge");
/** Byte count as a door list shows it. Lives here with the row that uses it. */
function formatSize(bytes) {
    if (bytes === 0)
        return '0 B';
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1048576)
        return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / 1048576)} MB`;
}
/**
 * Exported for the 40-column layout test: the geometry rules are the thing
 * under test, and constructing the real layout against a real Screen is the
 * only honest way to assert them (a source pin proves a call exists, not
 * that the panels stop overlapping).
 */
class DoormanLayout {
    constructor(screen, nodeId) {
        /** Stops the masthead animation; called when the door tears down. */
        this.stopMasthead = null;
        this.screen = screen;
        const screenWidth = screen.width || 80;
        this.compact = (0, blessed_1.getCompactProfile)(screenWidth);
        this.narrow = this.compact.singleColumn;
        // The list's inner text width. Side by side it is 35% of the screen
        // less the frames; stacked it is the whole row less the gutter.
        this.width = this.narrow
            ? Math.max(8, screenWidth - 6)
            : Math.floor(screenWidth * 0.35) - 8;
        // Two of forty columns is too much to spend on a frame, and a header or
        // footer three rows tall is a fifth of a C64 screen. `frame` is spread
        // into every panel: at 80 it adds no key at all, so the Panel widget's
        // default border (and its colour) is untouched byte for byte.
        const frame = this.compact.borders ? {} : { border: undefined };
        const chromeH = this.compact.collapseChrome ? 1 : 3;
        // Stacked at XXS: the list takes the top half, the info pane the bottom.
        const listGeom = this.narrow
            ? { top: chromeH, left: 0, width: '100%', height: '50%-1' }
            : { top: 3, left: 0, width: '35%', height: '100%-6' };
        const infoGeom = this.narrow
            ? { top: '50%', left: 0, width: '100%', height: '50%-1' }
            : { top: 3, left: '35%', width: '65%', height: '100%-6' };
        // Inside a frameless panel there is no frame to sit inside of.
        const inset = this.compact.borders
            ? { top: 1, left: 1, width: '100%-2', height: '100%-2' }
            : { top: 0, left: 0, width: '100%', height: '100%' };
        this.header = new blessed_1.Panel({ parent: screen, top: 0, left: 0, width: '100%', height: chromeH,
            ...frame,
            tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        // The animated slash rail, on the header's first row. A child keeps it
        // out of the outer geometry - nothing below moves, and a theme with no
        // rail (classic) gets the plain title it always had.
        const mastheadRow = new blessed_1.Box({ parent: this.header, top: 0, left: 0,
            width: this.compact.borders ? '100%-2' : '100%',
            height: 1, tags: true, content: '', focusable: false,
            style: door_theme_1.S.bar.style });
        // The rail is drawn to the SCREEN's width - it was the 80-wide run the
        // sysop watched fold on a C64 - and at XXS it stops moving entirely: a
        // 40-column canvas has no spare cells for decoration, and 20fps of row
        // repaint is a lot of PETSCII bytes. (SDK: effectsAllowed().)
        this.stopMasthead = (0, blessed_1.effectsAllowed)(screenWidth) ? (0, theme_1.attachMasthead)(mastheadRow, door_theme_1.CURRENT, {
            title: 'DOORMAN',
            // One column short: writing a row's last cell leaves the terminal in
            // a pending-wrap state and clips the final character.
            width: Math.max(1, (screen.width || 80) - 3),
            rail: door_theme_1.S.accent,
            ink: door_theme_1.S.ink,
            render: () => screen.render(),
        }) : (mastheadRow.setContent(' DOORMAN '), () => undefined);
        this.footer = new blessed_1.Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: chromeH,
            ...frame,
            tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        this.filterPanel = new blessed_1.Panel({ parent: screen, top: chromeH, left: 0,
            width: this.narrow ? '100%' : '35%', height: chromeH,
            ...frame,
            tags: true, style: { border: { fg: door_theme_1.T.dim } }, focusable: false });
        // keys:false + inputOnFocus:false make this a DISPLAY-ONLY widget — see
        // sdk/engines/ui/blessed/widgets/textbox.ts:58-60 (keys:false skips
        // `this.on('keypress', this._onKeypress)` entirely, so Textbox's own
        // self-editing insertChar()/deleteChar() path is never wired up at
        // all, no matter how the box gets focused — keyboard activation,
        // focusNext()/Tab-cycling, or a mouse click all leave it inert) and
        // :63-68 (inputOnFocus:false skips the readInput() emit on focus).
        // RepoView's filterKeypress (below) is the ONLY thing that ever writes
        // to this box, via setValue() — a single source of truth instead of
        // two editors racing. Round 1-3 patched that race at the manual-path
        // level (activation timing, Tab's handled signal); this is the actual
        // root cause: Textbox is a self-editing widget by default, and nothing
        // before this depended on catching every path that could focus it —
        // keys:false removes the capability structurally instead.
        this.filterBox = new blessed_1.Textbox({ parent: this.filterPanel, top: 0,
            left: this.compact.borders ? 1 : 0, width: this.compact.borders ? '100%-2' : '100%',
            height: 1, mouse: true, keys: false, inputOnFocus: false,
            style: { fg: door_theme_1.T.ink, focus: { fg: door_theme_1.T.warn } } });
        this.filterPanel.hide();
        this.listPanel = new blessed_1.Panel({ parent: screen, ...listGeom,
            ...frame,
            tags: true, style: { border: { fg: door_theme_1.T.accent } }, focusable: false });
        this.doorList = new blessed_1.List({ parent: this.listPanel, ...inset,
            keys: true, vi: false, mouse: true, scrollable: true,
            alwaysScroll: true, tags: true, wrapItems: false,
            scrollbar: { ch: ' ', style: { bg: door_theme_1.T.bar } },
            style: { selected: { bg: door_theme_1.T.bar, fg: door_theme_1.T.ink }, item: { fg: door_theme_1.T.ink } } });
        this.infoPanel = new blessed_1.Panel({ parent: screen, ...infoGeom,
            ...frame,
            tags: true, style: { border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        this.infoBox = new blessed_1.ScrollableBox({ parent: this.infoPanel, ...inset,
            tags: true, scrollable: true, keys: true,
            style: { fg: door_theme_1.T.ink } });
        // Disable type-ahead on doorList (re-add keypress without the type-ahead block)
        const _nav = this.doorList._onKeypress?.bind(this.doorList);
        this.doorList.removeAllListeners('keypress');
        if (_nav) {
            this.doorList.on('keypress', (ch, key) => {
                if (ch?.length === 1 && /[a-zA-Z0-9/ ]/.test(ch))
                    return;
                if (key?.name === 'escape' || ch === '\x1b')
                    return;
                return _nav(ch, key);
            });
        }
        this.setHeader(`{center}{${door_theme_1.T.accent}-fg}DOORMAN v2{/${door_theme_1.T.accent}-fg}  {${door_theme_1.T.ink}-fg}Node ${nodeId}{/${door_theme_1.T.ink}-fg}{/center}`);
    }
    setHeader(content) { this.header.setContent(content); }
    setFooter(content) { this.footer.setContent(content); }
    setListLabel(label) { this.listPanel.setLabel(label); }
    setListItems(items) { this.doorList.setItems(items); }
    setListSelect(idx) { this.doorList.select(idx); }
    get listSelected() { return this.doorList.selected ?? 0; }
    setInfo(content) { this.infoBox.setContent(content); }
    focusList() { this.doorList.focus(); }
    focusFilter() { this.filterBox.focus(); }
    showRepoLayout() {
        this.filterPanel.show();
        this.listPanel.top = this.narrow ? 2 : 6;
        this.listPanel.height = this.narrow ? '50%-2' : '100%-9';
    }
    showInstalledLayout() {
        this.filterPanel.hide();
        this.listPanel.top = this.narrow ? 1 : 3;
        this.listPanel.height = this.narrow ? '50%-1' : '100%-6';
    }
    /**
     * One installed-door row: badge, name, enabled flag, size.
     *
     * Here rather than inline in the view because `width` is a layout rule -
     * the row has to be sized by whatever decided the list's text column, and
     * a copy of this arithmetic anywhere else is a copy that can drift from it.
     */
    installedRow(d) {
        const badge = `[${(0, type_badge_1.typeBadge)(d.type)}]`;
        const sz = formatSize(d.size).padStart(6);
        const nameW = Math.max(6, this.width - 14);
        const name = d.name.length > nameW ? d.name.slice(0, nameW - 1) + '…' : d.name.padEnd(nameW);
        const st = d.enabled ? `{${door_theme_1.T.ok}-fg}*{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.alert}-fg}-{/${door_theme_1.T.alert}-fg}`;
        return `${badge} ${name} ${st} ${sz}`;
    }
    render() { this.screen.render(); }
}
exports.DoormanLayout = DoormanLayout;
//# sourceMappingURL=doorman-layout.js.map