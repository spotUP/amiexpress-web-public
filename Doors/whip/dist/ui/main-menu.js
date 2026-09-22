"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMainMenu = showMainMenu;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const menu_1 = require("./menu");
const layout_1 = require("./layout");
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
        // MENU BAR - shared helper (ui/menu.ts). Built after the list so
        // Escape can hand focus back to it; menuBarHeight() is the ONE copy
        // of the tier, so the header below lands right with or without the bar.
        // ========================================================================
        const barH = (0, menu_1.menuBarHeight)(screen.width);
        let menu = null;
        const pickFromBar = (value) => {
            cleanup();
            resolve(value);
        };
        // ========================================================================
        // HEADER - the chrome's masthead (NOT focusable)
        // ========================================================================
        const header = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: barH,
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
            top: barH + 3,
            left: 0,
            width: '100%',
            height: `100%-${barH + 7}`, // Menu bar (0-1) + header (3) + footer (3) + gap
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
            { key: 'D', label: 'My Profile (Discord name)', value: 'my-profile' },
            { key: 'Q', label: 'Quit', value: 'quit' }
        ];
        /*
         * WHERE THE TWO PANES GO, from the LIVE width - see `ui/layout.ts`. At
         * eighty columns this is the 50%/45% pair the screen has always drawn;
         * at forty the list takes the whole width and the stats go underneath,
         * because twenty columns do not hold `[D] My Profile (Discord name)`.
         */
        const contentRows = Math.max(0, screen.height - (barH + 7));
        const panes = (0, layout_1.whipPanes)(screen.width, contentRows);
        // Menu box with border - 10 items + 2 border + 1 spare = 13
        const menuBox = (0, blessed_helpers_1.createBox)({
            parent: mainContainer,
            top: panes.main.top,
            left: panes.main.left,
            width: panes.main.width,
            height: panes.main.height,
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
            // Every item, or as many rows as the box has interior - the list is
            // ten entries and a C64's box is not always thirteen rows tall.
            height: Math.min(menuItems.length, Math.max(1, Number(panes.main.height) - 3)),
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
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const activeTasks = tasks.filter(t => t.status !== 'done').length;
        let statsContent = '';
        if (panes.stacked) {
            /*
             * TWO ROWS, because that is what is left under the menu on a C64 - and
             * two rows can still carry all four numbers. A label per row and the
             * numbers beside them is the same information in a quarter of the
             * height; what goes is the blank line and the one-per-row spacing,
             * which are luxuries of an eighty-column screen.
             */
            statsContent += `{${door_theme_1.T.accent}-fg}Projects{/${door_theme_1.T.accent}-fg} {bold}${projects.length}{/bold}  `
                + `{${door_theme_1.T.accent}-fg}Tasks{/${door_theme_1.T.accent}-fg} {bold}${tasks.length}{/bold}\n`;
            statsContent += `{${door_theme_1.T.accent}-fg}Active{/${door_theme_1.T.accent}-fg} {bold}${activeTasks}{/bold}  `
                + `{${door_theme_1.T.accent}-fg}Done{/${door_theme_1.T.accent}-fg} {bold}${completedTasks}{/bold}`;
        }
        else {
            statsContent += `{${door_theme_1.T.accent}-fg}Projects:{/${door_theme_1.T.accent}-fg}  {bold}${projects.length}{/bold}\n`;
            statsContent += `{${door_theme_1.T.accent}-fg}Tasks:{/${door_theme_1.T.accent}-fg}     {bold}${tasks.length}{/bold}\n`;
            statsContent += `{${door_theme_1.T.accent}-fg}Active:{/${door_theme_1.T.accent}-fg}    {bold}${activeTasks}{/bold}\n`;
            statsContent += `{${door_theme_1.T.accent}-fg}Completed:{/${door_theme_1.T.accent}-fg} {bold}${completedTasks}{/bold}\n`;
            statsContent += '\n';
        }
        if (!panes.stacked) {
            // The party block is three more rows, which a stacked screen has
            // already spent on the menu. The Party Timeline screen is a keypress
            // away and says the same thing at length.
            if (upcomingParty && daysUntilParty !== null) {
                statsContent += `{${door_theme_1.T.accentAlt}-fg}UPCOMING PARTY:{/${door_theme_1.T.accentAlt}-fg}\n`;
                statsContent += `{bold}${upcomingParty.name}{/bold}\n`;
                statsContent += `in {bold}${daysUntilParty}{/bold} days`;
            }
            else {
                statsContent += `{${door_theme_1.T.dim}-fg}No upcoming parties{/${door_theme_1.T.dim}-fg}`;
            }
        }
        // The stats: beside the menu at eighty columns, under it at forty, and
        // left out when the rows underneath cannot hold a box with anything in
        // it (`sideFits`) - a one-row frame with a label and no numbers is worse
        // than no box.
        const statsBox = (0, layout_1.sideFits)(panes) ? (0, blessed_helpers_1.createBox)({
            parent: mainContainer,
            top: panes.side.top,
            ...(panes.side.left !== undefined ? { left: panes.side.left } : { right: panes.side.right }),
            width: panes.side.width,
            height: panes.side.height,
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
        }) : null;
        // Getting started hint if no projects. At forty columns the menu and the
        // stats have already taken the content pane, and the first two entries
        // of the menu ARE the getting-started advice.
        let gettingStarted = null;
        if (projects.length === 0 && !panes.stacked) {
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
        // The bar goes up once the list exists for Escape to return to.
        // The list's own table below answers every bracketed letter (and keeps
        // answering below 60 columns, where there is no bar at all), so the bar
        // advertises them and binds none.
        menu = (0, menu_1.attachWhipMenu)(screen, pickFromBar, () => list, { hotkeys: 'host' });
        screen.render();
        // Keyboard handler for direct shortcuts. Tab is NOT here any more: the
        // step between the list and the menu bar is attachWhipMenu's job, on
        // every screen, and this copy was the only one that ever had it.
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
            if (menu) {
                menu.destroy();
                menu = null;
            }
            screen.remove(header);
            screen.remove(mainContainer);
            if (gettingStarted)
                screen.remove(gettingStarted);
            screen.remove(footer);
        };
        screen.render();
    });
}
