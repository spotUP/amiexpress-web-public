"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCORD_NAME_MAX = void 0;
exports.normalizeDiscordName = normalizeDiscordName;
exports.showMyProfile = showMyProfile;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const door_theme_1 = require("../door-theme");
exports.DISCORD_NAME_MAX = 32;
/** Pure: what the door stores for a typed Discord name. */
function normalizeDiscordName(raw) {
    return String(raw ?? '').trim().slice(0, exports.DISCORD_NAME_MAX);
}
/**
 * My Profile - handle, level, points, and the Discord name the Discord bot
 * matches on. Save stores the trimmed name, Clear removes it, Cancel/ESC
 * changes nothing. Resolves the name to store, '' to clear, null to cancel.
 */
async function showMyProfile(screen, user) {
    return new Promise((resolve) => {
        let closed = false;
        const modal = blessed_1.default.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 62,
            height: 15,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accent },
                bg: door_theme_1.T.ground,
            },
            label: ' My Profile ',
            tags: true,
        });
        const info = blessed_1.default.box({
            parent: modal,
            top: 1,
            left: 2,
            right: 2,
            height: 3,
            tags: true,
            content: `{bold}${user.handle}{/bold} - level ${user.level}, ${user.points} pts, ${user.tasksCompleted} tasks done`,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
        });
        void info;
        const help = blessed_1.default.box({
            parent: modal,
            top: 4,
            left: 2,
            right: 2,
            height: 2,
            tags: true,
            content: 'Your Discord name, so the Discord bot knows your tasks are yours.',
            style: { fg: door_theme_1.T.dim, bg: door_theme_1.T.ground },
        });
        void help;
        const nameInput = blessed_1.default.textbox({
            parent: modal,
            top: 6,
            left: 2,
            right: 2,
            height: 3,
            border: { type: 'line' },
            label: ' Discord name ',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            value: user.discordName ?? '',
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.accent },
            },
        });
        const save = () => {
            if (closed)
                return;
            const value = normalizeDiscordName(nameInput.getValue?.() ?? nameInput.value);
            cleanup();
            resolve(value);
        };
        const saveBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 10,
            left: 4,
            width: 14,
            height: 3,
            content: '[ Save ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ok,
                border: { fg: door_theme_1.T.ok },
                focus: { bg: 'lightgreen', fg: door_theme_1.T.ground },
                hover: { bg: 'lightgreen', fg: door_theme_1.T.ground },
            },
        });
        const clearBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 10,
            left: 24,
            width: 14,
            height: 3,
            content: '[ Clear ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.alert,
                border: { fg: door_theme_1.T.alert },
                focus: { bg: 'lightred', fg: door_theme_1.T.ground },
                hover: { bg: 'lightred', fg: door_theme_1.T.ground },
            },
        });
        const cancelBtn = (0, blessed_helpers_1.createButton)({
            parent: modal,
            top: 10,
            left: 44,
            width: 14,
            height: 3,
            content: '[ Cancel ]',
            align: 'center',
            valign: 'middle',
            border: { type: 'line' },
            keys: true,
            mouse: true,
            style: {
                fg: door_theme_1.T.ink,
                bg: door_theme_1.T.ground,
                border: { fg: door_theme_1.T.dim },
                focus: { bg: door_theme_1.T.dim, fg: door_theme_1.T.ground },
                hover: { bg: door_theme_1.T.dim, fg: door_theme_1.T.ground },
            },
        });
        const cleanup = () => {
            if (closed)
                return;
            closed = true;
            screen.off('keypress', keyHandler);
            screen.remove(modal);
            screen.render();
        };
        saveBtn.on('press', () => { save(); });
        clearBtn.on('press', () => {
            if (closed)
                return;
            cleanup();
            resolve('');
        });
        cancelBtn.on('press', () => { cleanup(); resolve(null); });
        const focusables = [nameInput, saveBtn, clearBtn, cancelBtn];
        const advanceFrom = (current) => {
            if (closed)
                return;
            const i = focusables.indexOf(current);
            focusables[(i + 1) % focusables.length].focus();
            screen.render();
        };
        nameInput.on('submit', () => advanceFrom(nameInput));
        const keyHandler = (ch, key) => {
            if (closed)
                return;
            if (key.name === 'escape') {
                cleanup();
                resolve(null);
            }
            else if (key.name === 'tab')
                advanceFrom(screen.getFocused());
        };
        screen.on('keypress', keyHandler);
        nameInput.focus();
        screen.render();
    });
}
