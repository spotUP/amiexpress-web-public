"use strict";
/**
 * DOORMAN's screen furniture - the header, footer, list, info and filter
 * panels every view draws into, and the animated masthead on the header's
 * first row.
 *
 * Split out of app.ts when it reached the 2000-line ceiling, the same way
 * install-core.ts was. Nothing here imports app.ts, so the views can import
 * the layout without a cycle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoormanLayout = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_theme_1 = require("./door-theme");
class DoormanLayout {
    constructor(screen, nodeId) {
        /** Stops the masthead animation; called when the door tears down. */
        this.stopMasthead = null;
        this.screen = screen;
        this.width = Math.floor(screen.width * 0.35) - 8;
        this.header = new blessed_1.Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3,
            tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        // The animated slash rail, on the header's first row. A child keeps it
        // out of the outer geometry - nothing below moves, and a theme with no
        // rail (classic) gets the plain title it always had.
        const mastheadRow = new blessed_1.Box({ parent: this.header, top: 0, left: 0, width: '100%-2',
            height: 1, tags: true, content: '', focusable: false,
            style: door_theme_1.S.bar.style });
        this.stopMasthead = (0, theme_1.attachMasthead)(mastheadRow, door_theme_1.CURRENT, {
            title: 'DOORMAN',
            // One column short: writing a row's last cell leaves the terminal in
            // a pending-wrap state and clips the final character.
            width: Math.max(1, (screen.width || 80) - 3),
            rail: door_theme_1.S.accent,
            ink: door_theme_1.S.ink,
            render: () => screen.render(),
        });
        this.footer = new blessed_1.Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
            tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        this.filterPanel = new blessed_1.Panel({ parent: screen, top: 3, left: 0, width: '35%', height: 3,
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
        this.filterBox = new blessed_1.Textbox({ parent: this.filterPanel, top: 0, left: 1, width: '100%-2',
            height: 1, mouse: true, keys: false, inputOnFocus: false,
            style: { fg: door_theme_1.T.ink, focus: { fg: door_theme_1.T.warn } } });
        this.filterPanel.hide();
        this.listPanel = new blessed_1.Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6',
            tags: true, style: { border: { fg: door_theme_1.T.accent } }, focusable: false });
        this.doorList = new blessed_1.List({ parent: this.listPanel, top: 1, left: 1, width: '100%-2',
            height: '100%-2', keys: true, vi: false, mouse: true, scrollable: true,
            alwaysScroll: true, tags: true, wrapItems: false,
            scrollbar: { ch: ' ', style: { bg: door_theme_1.T.bar } },
            style: { selected: { bg: door_theme_1.T.bar, fg: door_theme_1.T.ink }, item: { fg: door_theme_1.T.ink } } });
        this.infoPanel = new blessed_1.Panel({ parent: screen, top: 3, left: '35%', width: '65%',
            height: '100%-6', tags: true, style: { border: { fg: door_theme_1.T.accentAlt } }, focusable: false });
        this.infoBox = new blessed_1.ScrollableBox({ parent: this.infoPanel, top: 1, left: 1,
            width: '100%-2', height: '100%-2', tags: true, scrollable: true, keys: true,
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
        this.listPanel.top = 6;
        this.listPanel.height = '100%-9';
    }
    showInstalledLayout() {
        this.filterPanel.hide();
        this.listPanel.top = 3;
        this.listPanel.height = '100%-6';
    }
    render() { this.screen.render(); }
}
exports.DoormanLayout = DoormanLayout;
//# sourceMappingURL=doorman-layout.js.map