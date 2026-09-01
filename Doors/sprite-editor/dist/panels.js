"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makePanel = makePanel;
exports.resetPanelLayout = resetPanelLayout;
/**
 * makePanel - the one place every sprite-studio content pane becomes a
 * DockablePanel, so the eight panes (browser: doors/sprites/animations/
 * preview; edit: canvas/preview/frames/toolbar) share identical drag/
 * resize/minimize/persistence behaviour instead of eight hand-tuned
 * option blocks drifting apart.
 *
 * Mirrors livechat's worked DockablePanel example (ui/chat-log.ts): the
 * panel supplies the border and title bar; the caller's own widget
 * (list/box) becomes its content child, parented to the panel instead of
 * the screen. The content child is sized in INTEGER rows/cols (rect minus
 * the panel's own 1-cell border on every side), never a percent string -
 * layout.ts's whole point (see its doc comment) is that no pane geometry
 * in this door is resolved through a percent/round step any more, and
 * app-shape.test.ts / edit-screen-shape.test.ts assert zero percent-
 * geometry strings survive in either screen file.
 *
 * Persistence: DockablePanel.saveState/loadState both early-return when
 * `screen.storage` is absent (dockable-panel.ts:2593,2602). This door's
 * screen (built through blessed-helpers' createScreen, same as every
 * other blessed door here) never sets a `storage` property - grepped
 * across the SDK's Screen class and every screen-construction site
 * (including livechat's, the reference implementation) and none exists.
 * So persistence silently no-ops for every panel below; drag/resize/dock/
 * minimize still work in-session, they just do not survive a reload. That
 * degradation is the accepted case for this task (see task-3-report.md).
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const menu_1 = require("./menu");
function makePanel(screen, opts) {
    const { key, title, rect } = opts;
    return new blessed_1.DockablePanel({
        parent: screen,
        title,
        label: title,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        useTitleBar: true,
        draggable: true,
        resizable: true,
        allowMinimize: true,
        topConstraint: menu_1.MENU_HEIGHT,
        bottomConstraint: 1,
        persistenceKey: 'sprited:' + key,
        fitContent: false,
    });
}
/**
 * View -> Reset Layout: restores one panel to its LAYOUT rect and to the
 * floating (undocked) state every panel starts in - the exact shape
 * DockablePanel.setState() already knows how to apply atomically (dock
 * position, un-minimize, then position/size, each clamped to the current
 * screen - see dockable-panel.ts:2503).
 */
function resetPanelLayout(panel, rect) {
    void panel.setState({
        position: 'float',
        minimized: false,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
    });
}
