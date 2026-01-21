"use strict";
/**
 * Card Lobby - Dialog Manager
 * Handles all modal dialogs, windows, and prompts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DialogManager = void 0;
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const lib_1 = require("../lib");
class DialogManager {
    constructor(screen, overlayShade) {
        this.modalActive = false;
        this.leaderboardMode = 'weekly';
        this.screen = screen;
        this.overlayShade = overlayShade;
    }
    setModalActive(value) {
        this.modalActive = value;
    }
    isModalActive() {
        return this.modalActive;
    }
    showProfileWindow(profile) {
        if (!profile)
            return;
        const stats = profile.stats;
        const lines = [
            `Player: ${profile.username}`,
            '',
            `Chips: ${profile.wallet.chips}`,
            `Lifetime Earned: ${profile.wallet.lifetimeEarned}`,
            `Hands: ${stats.handsPlayed}  Wins: ${stats.wins}  Losses: ${stats.losses}`,
            `Net: ${(0, lib_1.formatChips)(stats.net)}  Biggest Pot: ${stats.biggestPot}`,
            `Best Streak: ${stats.bestWinStreak}`,
        ];
        this.showTextWindow('Player Profile', lines.join('\n'));
    }
    showAchievementsWindow(profile) {
        if (!profile)
            return;
        const lines = [];
        lines.push(`Unlocked: ${profile.achievements.length}/${lib_1.ACHIEVEMENTS.length}`);
        lines.push('');
        lib_1.ACHIEVEMENTS.forEach((achievement) => {
            const unlocked = profile?.achievements.includes(achievement.id);
            const status = unlocked ? '[X]' : '[ ]';
            lines.push(`${status} ${achievement.name} - ${achievement.description}`);
        });
        this.showTextWindow('Achievements', lines.join('\n'));
    }
    showLeaderboardWindow(profiles) {
        const content = this.buildLeaderboardContent(profiles);
        this.showTextWindow('Leaderboard', content, {
            footer: 'Keys: 1 Daily  2 Weekly  3 All-Time',
            onKey: (key) => {
                if (key === '1')
                    this.leaderboardMode = 'daily';
                if (key === '2')
                    this.leaderboardMode = 'weekly';
                if (key === '3')
                    this.leaderboardMode = 'all';
                return this.buildLeaderboardContent(profiles);
            },
        });
    }
    buildLeaderboardContent(profiles) {
        const modeLabel = this.leaderboardMode === 'all' ? 'ALL-TIME' : this.leaderboardMode.toUpperCase();
        const rows = Object.values(profiles)
            .map((profile) => {
            const stats = this.leaderboardMode === 'daily'
                ? profile.stats.daily
                : this.leaderboardMode === 'weekly'
                    ? profile.stats.weekly
                    : { hands: profile.stats.handsPlayed, wins: profile.stats.wins, net: profile.stats.net };
            return {
                username: profile.username,
                wins: stats.wins,
                hands: stats.hands,
                net: stats.net,
            };
        })
            .filter((row) => row.hands > 0 || row.wins > 0)
            .sort((a, b) => b.net - a.net)
            .slice(0, 10);
        const lines = [];
        lines.push(`Mode: ${modeLabel}`);
        lines.push('');
        lines.push('RANK NAME           WINS  HANDS  NET');
        lines.push('---- -------------- ----- ------ -----');
        if (rows.length === 0) {
            lines.push('No stats yet. Play a hand to get on the board.');
        }
        else {
            rows.forEach((row, index) => {
                const line = (0, lib_1.pad)(String(index + 1), 4) +
                    ' ' +
                    (0, lib_1.pad)(row.username, 14) +
                    ' ' +
                    (0, lib_1.pad)(String(row.wins), 5) +
                    ' ' +
                    (0, lib_1.pad)(String(row.hands), 6) +
                    ' ' +
                    (0, lib_1.pad)((0, lib_1.formatChips)(row.net), 5);
                lines.push(line);
            });
        }
        return lines.join('\n');
    }
    async showBulletinsWindow(session) {
        const entries = lib_1.LOBBY_BULLETINS.map((entry) => `#${entry.number} ${entry.title}`);
        const selection = await this.showListDialog('Bulletins', entries);
        if (selection === null)
            return;
        const entry = lib_1.LOBBY_BULLETINS[selection];
        if (!entry)
            return;
        const content = await this.readBulletin(entry.number, session);
        this.showTextWindow(`Bulletin #${entry.number}`, content || 'Bulletin not found.');
    }
    async readBulletin(number, session) {
        if (!session.bbs?.readFile)
            return null;
        const content = await session.bbs.readFile(`Bulletins/bull${number}.txt`);
        if (!content)
            return null;
        return content.replace(/\r\n/g, '\n');
    }
    async writeWeeklyBulletinIfNeeded(lobby, profiles, session) {
        if (!lobby)
            return;
        const now = Date.now();
        if (now - lobby.lastBulletinAt < lib_1.WEEK_MS)
            return;
        const content = (0, lib_1.buildWeeklyBulletin)(lobby, profiles);
        if (session.bbs?.writeFile) {
            await session.bbs.writeFile(`Bulletins/bull${lib_1.WEEKLY_BULLETIN_NUMBER}.txt`, content);
            lobby.lastBulletinAt = now;
        }
    }
    showTextWindow(title, content, opts) {
        if (this.modalActive)
            return;
        this.modalActive = true;
        this.overlayShade.show();
        const container = new blessed_1.Box({
            parent: this.overlayShade,
            top: 'center',
            left: 'center',
            width: 70,
            height: 18,
            border: { type: 'ascii' },
            label: ` ${title} `,
            style: { border: lib_1.UI_THEME.windowBorder, bg: 'black' },
        });
        const textBottom = opts?.footer ? 2 : 1;
        const text = new blessed_1.ScrollableBox({
            parent: container,
            top: 0,
            left: 0,
            right: 0,
            bottom: textBottom,
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            mouse: true,
            content,
            style: { fg: 'white', bg: 'black' },
            scrollbar: {
                ch: ' ',
                style: { bg: 'blue' }
            }
        });
        if (opts?.footer) {
            new blessed_1.Box({
                parent: container,
                bottom: 0,
                left: 0,
                right: 0,
                height: 1,
                content: opts.footer,
                style: { fg: lib_1.UI_THEME.accent },
                tags: true
            });
        }
        const cleanup = () => {
            container.destroy();
            this.overlayShade.hide();
            this.modalActive = false;
            this.screen.render();
        };
        container.key(['escape', 'q'], cleanup);
        text.key(['escape', 'q'], cleanup); // Ensure text widget also handles it
        container.key(['1', '2', '3'], (ch) => {
            if (!opts?.onKey)
                return;
            const next = opts.onKey(ch);
            if (typeof next === 'string') {
                text.setContent(next);
                this.screen.render();
            }
        });
        text.focus();
        this.screen.render();
    }
    async showListDialog(title, items) {
        if (this.modalActive)
            return null;
        this.modalActive = true;
        this.overlayShade.show();
        return new Promise((resolve) => {
            const list = new blessed_1.List({
                parent: this.overlayShade,
                top: 'center',
                left: 'center',
                width: 60,
                height: 16,
                border: { type: 'ascii' },
                label: ` ${title} `,
                style: {
                    border: lib_1.UI_THEME.windowBorder,
                    bg: 'black',
                    fg: 'white',
                    selected: { fg: 'black', bg: lib_1.UI_THEME.highlightBg },
                },
                items,
                keys: true,
                mouse: true,
                vi: true,
            });
            const cleanup = (value) => {
                list.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve(value);
            };
            list.on('select', (_, index) => cleanup(index));
            list.key(['escape', 'q'], () => cleanup(null));
            list.focus();
            this.screen.render();
        });
    }
    async showPromptDialog(title, text, value) {
        if (this.modalActive)
            return null;
        this.modalActive = true;
        return new Promise((resolve) => {
            this.overlayShade.show();
            const prompt = blessed_1.default.prompt({
                parent: this.screen,
                title: ` ${title} `,
                text,
                value,
                border: { type: 'ascii' },
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            const cleanup = (result) => {
                prompt.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve(result);
            };
            prompt.showInput(text, value, (err, result) => {
                if (err) {
                    cleanup(null);
                    return;
                }
                cleanup(result ?? null);
            });
            this.screen.render();
        });
    }
    async showYesNoDialog(title, text) {
        if (this.modalActive)
            return null;
        this.modalActive = true;
        return new Promise((resolve) => {
            this.overlayShade.show();
            const question = blessed_1.default.question({
                parent: this.screen,
                title: ` ${title} `,
                text,
                border: { type: 'ascii' },
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            const cleanup = (value) => {
                question.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve(value);
            };
            question.once('answer', (answer) => cleanup(answer));
            question.ask(text);
            this.screen.render();
        });
    }
    async showMessageDialog(title, text) {
        if (this.modalActive)
            return;
        this.modalActive = true;
        return new Promise((resolve) => {
            this.overlayShade.show();
            const message = blessed_1.default.message({
                parent: this.screen,
                title: ` ${title} `,
                text,
                border: { type: 'ascii' },
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            const cleanup = () => {
                message.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve();
            };
            message.display(text, cleanup);
            this.screen.render();
        });
    }
    // ============================================================================
    // UNO DIALOGS
    // ============================================================================
    async showColorSelectionDialog() {
        return new Promise((resolve) => {
            if (this.modalActive) {
                resolve(null);
                return;
            }
            this.modalActive = true;
            this.overlayShade.show();
            const dialogWidth = 40;
            const dialogHeight = 12;
            const dialog = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: dialogWidth,
                height: dialogHeight,
                label: ' Choose Color ',
                border: 'line',
                shadow: true,
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            const buttonWidth = 12;
            const buttonHeight = 3;
            const startY = 2;
            const spacing = 1;
            const colors = [
                { color: 'R', label: 'RED', fg: 'white', bg: 'red' },
                { color: 'G', label: 'GREEN', fg: 'black', bg: 'green' },
                { color: 'B', label: 'BLUE', fg: 'white', bg: 'blue' },
                { color: 'Y', label: 'YELLOW', fg: 'black', bg: 'yellow' },
            ];
            const cleanup = (result) => {
                dialog.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve(result);
            };
            colors.forEach((colorDef, index) => {
                const button = (0, blessed_helpers_1.createButton)({
                    parent: dialog,
                    top: startY + (index * (buttonHeight + spacing)),
                    left: 'center',
                    width: buttonWidth,
                    height: buttonHeight,
                    content: colorDef.label,
                    align: 'center',
                    valign: 'middle',
                    style: {
                        fg: colorDef.fg,
                        bg: colorDef.bg,
                        hover: { fg: 'white', bg: colorDef.bg },
                        focus: { fg: 'white', bg: colorDef.bg },
                    },
                    mouse: true,
                });
                button.on('press', () => cleanup(colorDef.color));
            });
            dialog.key(['escape', 'q'], () => cleanup(null));
            dialog.focus();
            this.screen.render();
        });
    }
    async showHouseRuleCreationDialog() {
        return new Promise((resolve) => {
            if (this.modalActive) {
                resolve(null);
                return;
            }
            this.modalActive = true;
            this.overlayShade.show();
            const dialogWidth = 60;
            const dialogHeight = 20;
            const dialog = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: dialogWidth,
                height: dialogHeight,
                label: ' Create House Rule ',
                border: 'line',
                shadow: true,
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            (0, blessed_helpers_1.createText)({
                parent: dialog,
                top: 1,
                left: 2,
                content: 'Rule Number (1-5):',
                style: { fg: 'cyan' },
            });
            const numberInput = blessed_1.default.textbox({
                parent: dialog,
                top: 2,
                left: 2,
                width: 10,
                height: 1,
                inputOnFocus: true,
                style: { fg: 'white', bg: 'blue' },
            });
            (0, blessed_helpers_1.createText)({
                parent: dialog,
                top: 4,
                left: 2,
                content: 'Rule Name:',
                style: { fg: 'cyan' },
            });
            const nameInput = blessed_1.default.textbox({
                parent: dialog,
                top: 5,
                left: 2,
                width: dialogWidth - 4,
                height: 1,
                inputOnFocus: true,
                style: { fg: 'white', bg: 'blue' },
            });
            (0, blessed_helpers_1.createText)({
                parent: dialog,
                top: 7,
                left: 2,
                content: 'Description:',
                style: { fg: 'cyan' },
            });
            const descInput = blessed_1.default.textbox({
                parent: dialog,
                top: 8,
                left: 2,
                width: dialogWidth - 4,
                height: 3,
                inputOnFocus: true,
                style: { fg: 'white', bg: 'blue' },
            });
            const cleanup = (result) => {
                dialog.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve(result);
            };
            const submitBtn = (0, blessed_helpers_1.createButton)({
                parent: dialog,
                bottom: 2,
                left: 'center',
                width: 12,
                height: 3,
                content: 'Create',
                align: 'center',
                valign: 'middle',
                style: {
                    fg: 'white',
                    bg: 'green',
                    hover: { fg: 'white', bg: 'light-green' },
                    focus: { fg: 'white', bg: 'light-green' },
                },
                mouse: true,
            });
            submitBtn.on('press', () => {
                const number = parseInt(numberInput.getValue(), 10);
                const name = nameInput.getValue().trim();
                const description = descInput.getValue().trim();
                if (number < 1 || number > 5 || isNaN(number)) {
                    cleanup(null);
                    return;
                }
                if (!name || !description) {
                    cleanup(null);
                    return;
                }
                cleanup({
                    number: number,
                    name,
                    description,
                    createdBy: 'current-user', // This should be replaced with actual user ID
                    createdAt: Date.now(),
                });
            });
            dialog.key(['escape', 'q'], () => cleanup(null));
            numberInput.focus();
            this.screen.render();
        });
    }
    async showHouseRulesListDialog(activeRules) {
        return new Promise((resolve) => {
            if (this.modalActive) {
                resolve();
                return;
            }
            this.modalActive = true;
            this.overlayShade.show();
            const dialogWidth = 70;
            const dialogHeight = 25;
            const dialog = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: dialogWidth,
                height: dialogHeight,
                label: ' Active House Rules ',
                border: 'line',
                shadow: true,
                style: { fg: 'white', bg: 'black', border: { fg: lib_1.UI_THEME.windowBorder.fg } },
            });
            const content = [];
            content.push('{cyan-fg}House Rules at this table:{/}\n');
            if (activeRules.length === 0) {
                content.push('{gray-fg}No house rules active yet.{/}');
                content.push('');
                content.push('Play a House Rules card (1-5) to create a rule!');
            }
            else {
                activeRules.forEach((rule) => {
                    content.push(`{yellow-fg}[${rule.number}]{/} {white-fg}${rule.name}{/}`);
                    content.push(`    ${rule.description}`);
                    content.push('');
                });
            }
            const scrollBox = blessed_1.default.scrollablebox({
                parent: dialog,
                top: 1,
                left: 1,
                right: 1,
                bottom: 4,
                content: content.join('\n'),
                tags: true,
                scrollable: true,
                alwaysScroll: true,
                mouse: true,
                keys: true,
                vi: true,
                scrollbar: {
                    ch: ' ',
                    style: { bg: 'blue' },
                },
                style: { fg: 'white', bg: 'black' },
            });
            const cleanup = () => {
                dialog.destroy();
                this.overlayShade.hide();
                this.modalActive = false;
                this.screen.render();
                resolve();
            };
            const closeBtn = (0, blessed_helpers_1.createButton)({
                parent: dialog,
                bottom: 1,
                left: 'center',
                width: 12,
                height: 3,
                content: 'Close',
                align: 'center',
                valign: 'middle',
                style: {
                    fg: 'white',
                    bg: 'blue',
                    hover: { fg: 'white', bg: 'light-blue' },
                    focus: { fg: 'white', bg: 'light-blue' },
                },
                mouse: true,
            });
            closeBtn.on('press', cleanup);
            dialog.key(['escape', 'q', 'enter'], cleanup);
            closeBtn.focus();
            this.screen.render();
        });
    }
}
exports.DialogManager = DialogManager;
