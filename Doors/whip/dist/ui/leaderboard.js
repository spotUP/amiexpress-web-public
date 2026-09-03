"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showLeaderboard = showLeaderboard;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const gamification_1 = require("../core/gamification");
const door_theme_1 = require("../door-theme");
const chrome_1 = require("./chrome");
/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS = [
    { key: 'Up/Down', does: 'Scroll' },
    { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS = [
    { key: 'Up/Dn', does: 'Scroll' },
    { key: 'Q', does: 'Back' },
];
async function showLeaderboard(screen, currentUser, dataManager) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        const users = await dataManager.loadUsers();
        const sortedUsers = Object.values(users).sort((a, b) => b.points - a.points);
        // Header - NOT focusable
        const header = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 0,
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
            top: 3,
            left: 1,
            width: '98%',
            height: 2,
            content: ' {bold}RANK  HANDLE          LEVEL      POINTS  TASKS  PROJECTS  ACHIEVEMENTS{/bold}\n' +
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
            top: 5,
            left: 1,
            width: '98%',
            height: '100%-8',
            border: { type: 'line' },
            label: ' Leaderboard ',
            scrollable: true,
            alwaysScroll: true,
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
            const levelStars = (0, gamification_1.getLevelStars)(user.level);
            // Format rank with padding
            const rank = `#${user.rank}`.padEnd(6);
            // Format handle with padding
            const handle = user.handle.substring(0, 14).padEnd(16);
            // Format level with stars
            const level = `${user.level.toUpperCase()} (${levelStars})`.padEnd(11);
            // Format points
            const points = (0, gamification_1.formatPoints)(user.points).padStart(7);
            // Format stats
            const tasks = user.tasksCompleted.toString().padStart(5);
            const projects = user.projectsCreated.toString().padStart(9);
            const achievs = `${user.achievements.length}/${totalAchievements}`.padStart(13);
            const line = `${isCurrentUser ? '{inverse}' : ''} ${rank} ${handle} {${levelColor}-fg}${level}{/${levelColor}-fg} ${points}  ${tasks}  ${projects}  ${achievs}${isCurrentUser ? '  <- YOU' : ''}${isCurrentUser ? '{/inverse}' : ''}\n`;
            content += line;
        }
        table.setContent(content);
        table.focus();
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
        const cleanup = () => {
            // First: a rail timer still writing after these widgets are gone would
            // paint into a screen that no longer holds them.
            chrome.stop();
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(tableHeader);
            screen.remove(table);
            screen.remove(instructions);
        };
    });
}
