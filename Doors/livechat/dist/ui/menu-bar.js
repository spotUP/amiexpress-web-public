"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MASTHEAD_TITLE = exports.MENU_HEIGHT = void 0;
exports.menusEndColumn = menusEndColumn;
exports.createMenuBar = createMenuBar;
/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const door_theme_1 = require("../door-theme");
exports.MENU_HEIGHT = 1;
/**
 * The headline beside the rail. Full words: this is a label, not a code.
 */
exports.MASTHEAD_TITLE = 'LIVE CHAT';
/**
 * The column after the last menu label.
 *
 * Derived from the same items the bar is built from, and by the same
 * arithmetic the SDK widget uses (`  label  ` plus one column of spacing),
 * so the masthead cannot drift onto the menus when a label is renamed.
 */
function menusEndColumn() {
    return buildMenuItems().reduce((left, item) => left + ` ${item.label} `.length + 1, 0);
}
// Handlers storage (set dynamically)
let globalHandlers = {};
const buildMenuItems = () => ([
    {
        label: 'Chat v3.2.0',
        items: [
            { label: 'Help (F1)', action: () => globalHandlers.onHelp?.() },
            { label: 'Channel List (F2)', action: () => globalHandlers.onList?.() },
            { label: 'Next Channel (F3)', action: () => globalHandlers.onChTab?.() },
            { label: 'Join Channel...', action: () => globalHandlers.onJoinChannel?.() },
            { label: 'Leave Channel', action: () => globalHandlers.onLeaveChannel?.() },
        ],
    },
    {
        label: 'Tools',
        items: [
            { label: 'Emoji (F4)', action: () => globalHandlers.onEmoji?.() },
            { label: 'Files (F6)', action: () => globalHandlers.onFiles?.() },
            { label: 'Pins (F7)', action: () => globalHandlers.onPins?.() },
            { label: 'Search (Ctrl+F)', action: () => globalHandlers.onSearch?.() },
            { label: 'Threads', action: () => globalHandlers.onThreads?.() },
        ],
    },
    {
        label: 'View',
        items: [
            { label: 'Settings (Ctrl+S)', action: () => globalHandlers.onSettings?.() },
            { label: 'Theme', action: () => globalHandlers.onTheme?.() },
            { label: 'Cycle Render Mode (r)', action: () => globalHandlers.onRenderMode?.() },
            { label: 'Fullscreen / Grid', action: () => globalHandlers.onToggleView?.() },
            { label: 'Toggle Sidebar', action: () => globalHandlers.onToggleSidebar?.() },
            { label: 'Clear Chat', action: () => globalHandlers.onClearChat?.() },
        ],
    },
    {
        label: 'Help',
        items: [
            { label: 'About', action: () => globalHandlers.onAbout?.() },
            { label: 'Keyboard Shortcuts', action: () => globalHandlers.onShortcuts?.() },
            { label: 'Quit (Ctrl+Q)', action: () => globalHandlers.onQuit?.() },
        ],
    },
]);
function createMenuBar(screen) {
    const menuBar = new blessed_1.MenuBar({
        screen,
        items: buildMenuItems(),
    });
    const left = menusEndColumn();
    /**
     * The masthead's own box, INSIDE the bar and to the right of the menus.
     *
     * A child rather than the bar's content: painting the rail as the bar's
     * own content would put an animated slash in each one-column gap BETWEEN
     * the menu labels, which reads as damage rather than as branding. It
     * survives setHandlers(), because MenuBar.setItems() destroys only the
     * buttons and the dropdowns.
     */
    const mastheadRow = new blessed_1.Box({
        parent: menuBar,
        top: 0,
        left,
        width: `100%-${left}`,
        height: 1,
        // Explicitly none: Panel takes a line border when the caller names no
        // border key at all, and a one-row framed box has no interior.
        border: undefined,
        tags: true,
        content: '',
        fixed: true,
        focusable: false,
        clickable: false,
        mouse: false,
    });
    let mastheadWidth = 1;
    /**
     * Size the run to the LIVE screen, and say whether a masthead fits.
     *
     * What the menus leave is what there is: on a 40-column C64 four labels
     * leave a handful of columns, which is not a masthead but a clipped word.
     * There the row is hidden and the bar keeps the theme's mark, still, at
     * the right end - so a C64 caller still sees the branding.
     */
    const layoutMasthead = () => {
        const width = (screen.width) || 80;
        const room = width - left;
        // The title, plus enough rail beside it to read as a rail.
        const fits = room >= exports.MASTHEAD_TITLE.length + 6;
        mastheadRow.width = `100%-${left}`;
        if (fits)
            mastheadRow.show();
        else
            mastheadRow.hide();
        // One short of the run's last cell: writing a row's final cell leaves
        // the terminal in a pending-wrap state and the last glyph is clipped.
        mastheadWidth = Math.max(1, room - 1);
        // `{|}` is blessed's right-align; the menu buttons draw over the left
        // end, which is why the mark sits at the other one.
        menuBar.setContent(!fits && door_theme_1.S.rail ? `{|}${door_theme_1.S.rail} ` : '');
        return fits;
    };
    layoutMasthead();
    return {
        element: menuBar,
        mastheadRow,
        layoutMasthead,
        mastheadWidth: () => mastheadWidth,
        setHandlers: (handlers) => {
            globalHandlers = handlers;
            // Update menu items with new handlers
            menuBar.setItems(buildMenuItems());
            // The buttons were rebuilt; the run they leave has not moved, but the
            // bar's content was not touched by setItems, so the mark is repainted
            // from the one place that decides it.
            layoutMasthead();
        },
    };
}
