"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENU_HEIGHT = void 0;
exports.createMenuBar = createMenuBar;
/**
 * Menu bar component - dropdown menus
 * Uses SDK MenuBar widget (Moebius-style)
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
exports.MENU_HEIGHT = 1;
// Handlers storage (set dynamically)
let globalHandlers = {};
const buildMenuItems = () => ([
    {
        label: 'Chat v3.2.0',
        items: [
            { label: 'Help (F1)', action: () => globalHandlers.onHelp?.() },
            { label: 'Channel List (F2)', action: () => globalHandlers.onList?.() },
            { label: 'Next Channel (F3)', action: () => globalHandlers.onChTab?.() },
        ],
    },
    {
        label: 'Tools',
        items: [
            { label: 'Emoji (F4)', action: () => globalHandlers.onEmoji?.() },
            { label: 'Files (F6)', action: () => globalHandlers.onFiles?.() },
            { label: 'Pins (F7)', action: () => globalHandlers.onPins?.() },
            { label: 'Search (Ctrl+F)', action: () => globalHandlers.onSearch?.() },
        ],
    },
    {
        label: 'View',
        items: [
            { label: 'Settings (Ctrl+S)', action: () => globalHandlers.onSettings?.() },
        ],
    },
    {
        label: 'Help',
        items: [
            { label: 'Quit (Ctrl+Q)', action: () => globalHandlers.onQuit?.() },
        ],
    },
]);
function createMenuBar(screen) {
    const menuBar = new blessed_1.MenuBar({
        screen,
        items: buildMenuItems(),
    });
    return {
        element: menuBar,
        setHandlers: (handlers) => {
            globalHandlers = handlers;
            // Update menu items with new handlers
            menuBar.setItems(buildMenuItems());
        },
    };
}
