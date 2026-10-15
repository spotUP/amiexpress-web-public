"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEADERBOARD_HEADER = void 0;
exports.formatLeaderboardRow = formatLeaderboardRow;
exports.visibleLength = visibleLength;
exports.showLeaderboard = showLeaderboard;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const gamification_1 = require("../core/gamification");
const menu_1 = require("./menu");
const scroll_keys_1 = require("./scroll-keys");
const door_theme_1 = require("../door-theme");
const chrome_1 = require("./chrome");
/**
 * One leaderboard row, single visual line (2026-09-10).
 *
 * Rows used to run 77-85 visible cells in a 76-cell pane: every row
 * wrapped, the star meter tore columns apart, and the current user got
 * a full-width inverse block nobody needed (the <- YOU marker says it).
 * Columns are sized to a 76 budget with room to spare; the marker stays,
 * the block goes.
 */
exports.LEADERBOARD_HEADER = 'RANK HANDLE        LEVEL  POINTS TASKS PROJ ACHV';
function formatLeaderboardRow(rank, handle, level, levelColor, points, tasks, projects, achievs, isYou) {
    const levelText = level.toUpperCase().substring(0, 5);
    const levelCell = `{${levelColor}-fg}${levelText}{/${levelColor}-fg}` + ' '.repeat(Math.max(0, 6 - levelText.length));
    const cells = `#${rank}`.padEnd(4) +
        handle.substring(0, 12).padEnd(13) +
        levelCell +
        points.substring(0, 6).padStart(7) +
        String(tasks).substring(0, 4).padStart(5) +
        String(projects).substring(0, 4).padStart(5) +
        achievs.substring(0, 6).padStart(7);
    return cells + (isYou ? ` {${door_theme_1.T.accent}-fg}<- YOU{/${door_theme_1.T.accent}-fg}` : '');
}
/** Visible cells, tags excluded - the number the pane width must cover. */
function visibleLength(row) {
    return row.replace(/\{[^}]*\}/g, '').length;
}
/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS = [
    { key: 'Up/Down', does: 'Scroll' },
    { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS = [
    { key: 'Up/Dn', does: 'Scroll' },
    { key: 'Q', does: 'Back' },
];
async function showLeaderboard(screen, currentUser, dataManager, onNavigate) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        const users = await dataManager.loadUsers();
        const sortedUsers = Object.values(users).sort((a, b) => b.points - a.points);
        // Menu bar row (ui/menu.ts): header and table slide down one row
        // when it is up, and stay put below 60 columns.
        const barH = (0, menu_1.menuBarHeight)(screen.width);
        // Header - NOT focusable
        const header = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: barH,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            // Empty: a three-row framed box has ONE interior row, and the chrome's
            // masthead owns it now. The centred title moved to `title` below.
            content: '',
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Table header - NOT focusable
        const tableHeaderWidth = screen.width - 4;
        const tableHeader = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: barH + 3,
            left: 1,
            width: '98%',
            height: 2,
            content: ` {bold}${exports.LEADERBOARD_HEADER}{/bold}\n` +
                ' ' + '='.repeat(tableHeaderWidth - 2), // Dynamic separator width
            style: { fg: door_theme_1.T.accent, bg: door_theme_1.T.ground },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Leaderboard table - focusable (scrollable content)
        const table = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: barH + 5,
            left: 1,
            width: '98%',
            height: `100%-${barH + 8}`,
            border: { type: 'line' },
            label: ' Leaderboard ',
            scrollable: true,
            alwaysScroll: true,
            scrollbar: true,
            mouse: true,
            keys: true,
            vi: true,
            style: { bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            focusable: true,
        });
        let content = '';
        const achievements = await dataManager.loadAchievements();
        const totalAchievements = Object.keys(achievements).length;
        for (let i = 0; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            const isCurrentUser = user.userId === currentUser.userId;
            const levelColor = (0, gamification_1.getLevelColor)(user.level);
            const line = formatLeaderboardRow(user.rank, user.handle, user.level, levelColor, (0, gamification_1.formatPoints)(user.points), user.tasksCompleted, user.projectsCreated, `${user.achievements.length}/${totalAchievements}`, isCurrentUser);
            content += `${line}\n`;
        }
        table.setContent(content);
        table.focus();
        // Arrow/wheel scrolling, same as achievements (ui/scroll-keys.ts).
        const unbindScroll = (0, scroll_keys_1.bindBoxScroll)(screen, table);
        // Footer - NOT focusable
        const instructions = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            // Filled by the chrome, from the SDK's hint builder.
            content: '',
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // The whole chrome from the door's ONE call.
        const chrome = (0, chrome_1.attachWhipChrome)({
            screen,
            header,
            footer: instructions,
            title: 'TOP SCENERS',
            hints: HINTS,
            compactHints: COMPACT_HINTS,
            // The scrolling table is the only thing here with rows to spare.
            glitch: table,
        });
        screen.render();
        const keyHandler = (ch, key) => {
            switch (key.name) {
                case 'q':
                case 'escape':
                    cleanup();
                    resolve();
                    break;
            }
        };
        screen.on('keypress', keyHandler);
        // Menu picks leave this screen for wherever the app loop sends them.
        let menu = null;
        const pickFromBar = (value) => {
            onNavigate?.(value);
            cleanup();
            resolve();
        };
        menu = (0, menu_1.attachWhipMenu)(screen, pickFromBar, () => table, { reserved: ['Q'] });
        const cleanup = () => {
            // First: a rail timer still writing after these widgets are gone would
            // paint into a screen that no longer holds them.
            chrome.stop();
            unbindScroll();
            if (menu) {
                menu.destroy();
                menu = null;
            }
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(tableHeader);
            screen.remove(table);
            screen.remove(instructions);
        };
    });
}
