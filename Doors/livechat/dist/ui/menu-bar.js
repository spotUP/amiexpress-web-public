"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENU_HEIGHT = void 0;
exports.createMenuBar = createMenuBar;
/**
 * Menu bar component - dropdown menus
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
exports.MENU_HEIGHT = 1;
// Handlers storage (set dynamically)
let globalHandlers = {};
const MENU_LABELS = ['Chat', 'Tools', 'View', 'Help'];
const buildMenuItems = () => ([
    {
        label: 'Chat',
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
    const bar = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: exports.MENU_HEIGHT,
        style: { fg: 'white', bg: 'blue' },
        content: '',
        fixed: true,
    });
    const menuButtons = [];
    const menus = [];
    const menuDefs = buildMenuItems();
    menuDefs.forEach((menu) => {
        menus.push(new blessed_1.DropdownMenu({ parent: screen, label: menu.label, items: menu.items }));
    });
    const openMenu = (index) => {
        menus.forEach((menu, i) => {
            if (i !== index)
                menu.close();
        });
        menus[index].openFor(menuButtons[index]);
    };
    const setupMenuButtons = () => {
        let left = 1;
        MENU_LABELS.forEach((label, index) => {
            const button = (0, blessed_helpers_1.createBox)({
                parent: bar,
                top: 0,
                left,
                width: label.length + 2,
                height: 1,
                content: `{bold}${label}{/bold}`,
                style: { fg: 'white', bg: 'blue', focus: { fg: 'black', bg: 'cyan' } },
                mouse: true,
                keys: true,
                clickable: true,
                fixed: true,
            });
            button.on('click', () => openMenu(index));
            button.key(['enter', 'space', 'down'], () => openMenu(index));
            menus[index].on('tab-next', () => openMenu((index + 1) % menus.length));
            menus[index].on('tab-prev', () => openMenu((index - 1 + menus.length) % menus.length));
            menuButtons.push(button);
            left += label.length + 3;
        });
    };
    setupMenuButtons();
    return {
        element: bar,
        setHandlers: (handlers) => {
            globalHandlers = handlers;
            const updatedDefs = buildMenuItems();
            updatedDefs.forEach((menu, index) => {
                menus[index]?.setItems(menu.items);
            });
        },
    };
}
