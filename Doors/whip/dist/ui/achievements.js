"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showAchievements = showAchievements;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const door_theme_1 = require("../door-theme");
/**
 * Smart text truncation with ellipsis
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text.padEnd(maxLength);
    }
    return text.substring(0, maxLength - 3) + '...';
}
/**
 * Pad achievement name with spaces
 */
function padName(name, maxLength) {
    if (name.length >= maxLength) {
        return name.substring(0, maxLength);
    }
    return name + ' '.repeat(maxLength - name.length);
}
async function showAchievements(screen, currentUser, dataManager) {
    return new Promise(async (resolve) => {
        screen.program.enableMouse();
        screen.clearRegion(0, screen.width, 0, screen.height);
        screen.alloc();
        // Note: Removed 200ms artificial delay for better responsiveness
        const achievements = await dataManager.loadAchievements();
        const allAchievements = Object.values(achievements);
        const unlocked = allAchievements.filter(a => currentUser.achievements.includes(a.id));
        const locked = allAchievements.filter(a => !currentUser.achievements.includes(a.id));
        // Header - NOT focusable
        const header = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            content: `{center}{bold}{${door_theme_1.T.accent}-fg}YOUR ACHIEVEMENTS{/${door_theme_1.T.accent}-fg}{/bold} - Track your progress{/center}\n` +
                `{center}Unlocked: {bold}{${door_theme_1.T.ok}-fg}${unlocked.length}{/${door_theme_1.T.ok}-fg}{/bold} / ${allAchievements.length}  |  Points from Achievements: {bold}${unlocked.reduce((sum, a) => sum + a.points, 0)}{/bold}{/center}`,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Stats moved to header - remove this separate stats box
        // Content area - focusable (scrollable)
        const content = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            top: 3,
            left: 1,
            width: '98%',
            height: '100%-6',
            border: { type: 'line' },
            label: ' Achievements ',
            scrollable: true,
            alwaysScroll: true,
            mouse: true,
            keys: true,
            vi: true,
            style: { bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.accent } },
            focusable: true,
        });
        let contentText = '';
        // Unlocked section
        contentText += ` {bold}{${door_theme_1.T.ok}-fg}UNLOCKED ({/${door_theme_1.T.ok}-fg}{/bold}{bold}` + unlocked.length + `{/bold}{bold}{${door_theme_1.T.ok}-fg}):{/${door_theme_1.T.ok}-fg}{/bold}\n\n`;
        if (unlocked.length === 0) {
            contentText += ` {${door_theme_1.T.dim}-fg}No achievements unlocked yet. Start completing tasks!{/${door_theme_1.T.dim}-fg}\n\n`;
        }
        else {
            for (const achievement of unlocked) {
                const name = padName(achievement.name, 25);
                const desc = truncateText(achievement.description, 35);
                contentText += ` {${door_theme_1.T.ok}-fg}${achievement.icon}{/${door_theme_1.T.ok}-fg} {bold}${name}{/bold}${desc}  {${door_theme_1.T.accentAlt}-fg}+${achievement.points} pts{/${door_theme_1.T.accentAlt}-fg}\n`;
            }
            contentText += '\n';
        }
        // Locked section
        contentText += ` {bold}{${door_theme_1.T.alert}-fg}LOCKED ({/${door_theme_1.T.alert}-fg}{/bold}{bold}` + locked.length + `{/bold}{bold}{${door_theme_1.T.alert}-fg}):{/${door_theme_1.T.alert}-fg}{/bold}\n\n`;
        if (locked.length === 0) {
            contentText += ` {${door_theme_1.T.ok}-fg}All achievements unlocked! You are a legend!{/${door_theme_1.T.ok}-fg}\n`;
        }
        else {
            for (const achievement of locked) {
                const name = padName(achievement.name, 25);
                const desc = truncateText(achievement.description, 35);
                contentText += ` {${door_theme_1.T.dim}-fg}${achievement.icon}{/${door_theme_1.T.dim}-fg} {${door_theme_1.T.dim}-fg}${name}${desc}  +${achievement.points} pts{/${door_theme_1.T.dim}-fg}\n`;
            }
        }
        content.setContent(contentText);
        content.focus();
        // Footer - NOT focusable
        const instructions = (0, blessed_helpers_1.createBox)({
            fixed: true,
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            content: ` {${door_theme_1.T.accent}-fg}[Up/Down]{/${door_theme_1.T.accent}-fg} Scroll   {${door_theme_1.T.alert}-fg}[Q/ESC]{/${door_theme_1.T.alert}-fg} Back\n` +
                ` {${door_theme_1.T.dim}-fg}Scrollwheel supported{/${door_theme_1.T.dim}-fg}`,
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground, border: { fg: door_theme_1.T.dim } },
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
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
            screen.off('keypress', keyHandler);
            screen.remove(header);
            screen.remove(content);
            screen.remove(instructions);
        };
    });
}
