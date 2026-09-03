"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMainMenu = showMainMenu;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const door_theme_1 = require("../door-theme");
const chrome_1 = require("./chrome");
/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS = [
    { key: 'Up/Down', does: 'Navigate' },
    { key: 'Enter', does: 'Select' },
    { key: 'Hotkey', does: 'Quick Action' },
    { key: 'Q', does: 'Quit' },
];
const COMPACT_HINTS = [
    { key: 'Up/Dn', does: 'Move' },
    { key: 'Ent', does: 'Pick' },
    { key: 'Q', does: 'Quit' },
];
async function showMainMenu(screen, user, dataManager) {
    return new Promise(async (resolve) => {
        // Enable mouse
        screen.program.enableMouse();
        // Clear screen
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Get stats for display
        const projects = await dataManager.loadProjects();
        const tasks = await dataManager.loadTasks();
        const parties = await dataManager.loadParties();
        const upcomingParty = parties.find(p => new Date(p.date) > new Date());
        const daysUntilParty = upcomingParty
            ? Math.ceil((new Date(upcomingParty.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null;
        // ========================================================================
        // HEADER - the chrome's masthead (NOT focusable)
        // ========================================================================
        const header = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            },
            // Empty: a three-row framed box has ONE interior row, and the chrome's
            // masthead owns it now. The centred title that used to sit there is the
            // `title` handed to attachWhipChrome below.
            content: '',
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // ========================================================================
        // CONTENT - Main container (NOT focusable, list inside is)
        // ========================================================================
        const mainContainer = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 3,
            left: 0,
            width: '100%',
            height: '100%-6', // Leave room for header (3) and footer (3)
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
            },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Menu items
        const menuItems = [
            { key: 'T', label: 'Quick Task (New)', value: 'quick-task' },
            { key: 'N', label: 'New Project', value: 'new-project' },
            { key: 'V', label: 'View All Projects', value: 'view-projects' },
            { key: 'K', label: 'Kanban Board', value: 'kanban' },
            { key: 'M', label: 'My Tasks', value: 'my-tasks' },
            { key: 'P', label: 'Party Timeline', value: 'parties' },
            { key: 'L', label: 'Leaderboard', value: 'leaderboard' },
            { key: 'A', label: 'Achievements', value: 'achievements' },
            { key: 'Q', label: 'Quit', value: 'quit' }
        ];
        // Menu box with border - explicit height (9 items + 2 border + 2 padding = 13)
        const menuBox = (0, blessed_helpers_1.createBox)({
            parent: mainContainer,
            top: 1,
            left: 1,
            width: '50%',
            height: 13,
            border: { type: 'line' },
            label: ' MAIN MENU ',
            style: {
                border: { fg: door_theme_1.T.accent },
                bg: door_theme_1.T.ground
            },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Menu list (focusable) - use blessed.list directly to avoid SDK's forced scrollable
        const list = blessed_1.default.list({
            parent: menuBox,
            top: 1,
            left: 1,
            width: '100%-4',
            height: 9, // 9 menu items - exact fit, no scrolling needed
            items: menuItems.map(item => `[{bold}${item.key}{/bold}] ${item.label}`),
            tags: true,
            keys: true,
            vi: true,
            mouse: true,
            focusable: true,
            style: {
                selected: { bg: door_theme_1.T.accent, fg: door_theme_1.T.ground },
                item: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground }
            },
            padding: { left: 1 },
        });
        // Build stats content
        let statsContent = '';
        statsContent += `{${door_theme_1.T.accent}-fg}Projects:{/${door_theme_1.T.accent}-fg}  {bold}${projects.length}{/bold}\n`;
        statsContent += `{${door_theme_1.T.accent}-fg}Tasks:{/${door_theme_1.T.accent}-fg}     {bold}${tasks.length}{/bold}\n`;
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const activeTasks = tasks.filter(t => t.status !== 'done').length;
        statsContent += `{${door_theme_1.T.accent}-fg}Active:{/${door_theme_1.T.accent}-fg}    {bold}${activeTasks}{/bold}\n`;
        statsContent += `{${door_theme_1.T.accent}-fg}Completed:{/${door_theme_1.T.accent}-fg} {bold}${completedTasks}{/bold}\n`;
        statsContent += '\n';
        if (upcomingParty && daysUntilParty !== null) {
            statsContent += `{${door_theme_1.T.accentAlt}-fg}UPCOMING PARTY:{/${door_theme_1.T.accentAlt}-fg}\n`;
            statsContent += `{bold}${upcomingParty.name}{/bold}\n`;
            statsContent += `in {bold}${daysUntilParty}{/bold} days`;
        }
        else {
            statsContent += `{${door_theme_1.T.dim}-fg}No upcoming parties{/${door_theme_1.T.dim}-fg}`;
        }
        // Stats box on right side - same height as menu box (13)
        const statsBox = (0, blessed_helpers_1.createBox)({
            parent: mainContainer,
            top: 1,
            right: 1,
            width: '45%',
            height: 13,
            border: { type: 'line' },
            label: ' STATS ',
            content: statsContent,
            style: {
                border: { fg: door_theme_1.T.accentAlt },
                bg: door_theme_1.T.ground
            },
            padding: { left: 1, top: 1 },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Getting started hint if no projects
        let gettingStarted = null;
        if (projects.length === 0) {
            gettingStarted = (0, blessed_helpers_1.createBox)({
                parent: mainContainer,
                bottom: 1,
                left: 1,
                width: '98%',
                height: 5,
                border: { type: 'line' },
                label: ' Getting Started ',
                content: `{center}{bold}{${door_theme_1.T.accent}-fg}Welcome to WHIP!{/${door_theme_1.T.accent}-fg}{/bold}{/center}\n` +
                    `{center}Press {bold}[T]{/bold} to create your first quick task{/center}\n` +
                    `{center}Press {bold}[N]{/bold} to create a new project{/center}`,
                style: {
                    border: { fg: door_theme_1.T.ok },
                    fg: door_theme_1.T.ink,
                    bg: door_theme_1.T.ground
                },
                tags: true,
                focusable: false,
                mouse: false,
                clickable: false,
            });
        }
        // ========================================================================
        // FOOTER - Keyboard hints (NOT focusable)
        // ========================================================================
        const footer = (0, blessed_helpers_1.createBox)({
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            style: {
                fg: door_theme_1.T.dim,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.dim },
            },
            // Filled by the chrome, from the SDK's hint builder.
            content: '',
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // The whole chrome from the door's ONE call: the rail on the header's
        // row, the theme's glitches on the menu, the hint line on the footer.
        const chrome = (0, chrome_1.attachWhipChrome)({
            screen,
            header,
            footer,
            title: 'WHIP v1.0',
            hints: HINTS,
            compactHints: COMPACT_HINTS,
            // The menu list is the only thing here with rows to spare.
            glitch: list,
        });
        // Focus the list
        list.focus();
        // Keyboard handler for direct shortcuts
        const keyHandler = (ch, key) => {
            const keyName = key.name.toUpperCase();
            // Check for direct menu shortcuts
            const menuItem = menuItems.find(item => item.key === keyName);
            if (menuItem) {
                cleanup();
                resolve(menuItem.value);
                return;
            }
        };
        // Mouse click and Enter handler
        const selectHandler = (item, index) => {
            cleanup();
            resolve(menuItems[index].value);
        };
        list.on('select', selectHandler);
        screen.on('keypress', keyHandler);
        const cleanup = () => {
            // First: a rail timer still writing after these widgets are gone would
            // paint into a screen that no longer holds them.
            chrome.stop();
            screen.off('keypress', keyHandler);
            list.removeAllListeners('select');
            screen.remove(header);
            screen.remove(mainContainer);
            if (gettingStarted)
                screen.remove(gettingStarted);
            screen.remove(footer);
        };
        screen.render();
    });
}
