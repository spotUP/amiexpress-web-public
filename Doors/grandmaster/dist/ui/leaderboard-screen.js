"use strict";
/**
 * Leaderboard Screen
 *
 * Displays high scores and rankings for all game modes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Leaderboard screen
 */
class LeaderboardScreen {
    constructor(screen, highScores, sounds, playerName) {
        this.screen = screen;
        this.highScores = highScores;
        this.sounds = sounds;
        this.currentMode = 'master';
        this.playerName = playerName;
    }
    /**
     * Show leaderboard and wait for exit
     */
    async show() {
        // Enable mouse control for tab switching
        this.screen.program.enableMouse();
        return new Promise((resolve) => {
            this.render();
            // Handle key events
            const keyHandler = (ch, key) => {
                if (!key)
                    return;
                if (key.name === 'escape' || key.name === 'q') {
                    this.screen.unkey(['escape', 'q'], keyHandler);
                    this.screen.unkey(['left', 'right', 'tab'], modeHandler);
                    this.onClose?.();
                    this.sounds.playSfx('menu_select');
                    resolve();
                }
            };
            const modeHandler = (ch, key) => {
                if (!key)
                    return;
                if (key.name === 'left' || (key.name === 'tab' && key.shift)) {
                    this.previousMode();
                    this.sounds.playSfx('menu_select');
                    this.render();
                }
                else if (key.name === 'right' || key.name === 'tab') {
                    this.nextMode();
                    this.sounds.playSfx('menu_select');
                    this.render();
                }
            };
            // Alt+Enter changes the room while the leaderboard is up; a
            // composition measured once is right for one size only.
            const onResize = () => this.render();
            this.screen.on('resize', onResize);
            this.onClose = () => this.screen.removeListener('resize', onResize);
            this.screen.key(['escape', 'q'], keyHandler);
            this.screen.key(['left', 'right', 'tab'], modeHandler);
        });
    }
    /**
     * Cycle to previous mode
     */
    previousMode() {
        const modes = ['master', 'death', 'sprint', 'marathon', 'versus', 'training'];
        const index = modes.indexOf(this.currentMode);
        this.currentMode = modes[(index - 1 + modes.length) % modes.length];
    }
    /**
     * Cycle to next mode
     */
    nextMode() {
        const modes = ['master', 'death', 'sprint', 'marathon', 'versus', 'training'];
        const index = modes.indexOf(this.currentMode);
        this.currentMode = modes[(index + 1) % modes.length];
    }
    /**
     * Render leaderboard
     */
    render() {
        // Clear screen
        this.screen.children.forEach(child => child.destroy());
        // The composition is drawn from the terminal's CURRENT size.
        //
        // Every box here used to carry the numbers of an 80x24 screen - width 70
        // and 76, left 2, top 6 and 20 - so on a terminal Alt+Enter had widened
        // the whole leaderboard sat in the top-left corner of a much larger
        // screen (reported 2026-09-02). Nothing re-ran on resize either; see the
        // listener at the end of show().
        const screenWidth = Number(this.screen.width) || 80;
        const screenHeight = Number(this.screen.height) || 24;
        const panelWidth = Math.max(40, Math.min(screenWidth - 4, 110));
        const panelLeft = Math.max(0, Math.floor((screenWidth - panelWidth) / 2));
        const headerWidth = Math.min(panelWidth, 70);
        // Title 3, tabs 3, personal best 3, instructions 1: what is left is the
        // table's.
        const scoresTop = 6;
        const personalHeight = 3;
        const scoresHeight = Math.max(6, screenHeight - scoresTop - personalHeight - 2);
        const personalTop = scoresTop + scoresHeight;
        // Title
        const title = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 'center',
            width: headerWidth,
            height: 3,
            // Text, not a frame: createBox draws a line border when no border key
            // is given, which is where the boxes around the title, the tabs and the
            // hint line came from.
            border: undefined,
            content: '{bold}{yellow-fg}═══ LEADERBOARDS ═══{/yellow-fg}{/bold}',
        });
        // Mode tabs
        const modeTabs = this.renderModeTabs();
        const modeTabsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 3,
            left: 'center',
            width: headerWidth,
            height: 3,
            border: undefined,
            content: modeTabs,
        });
        // Top scores
        const topScores = this.highScores.getTopScores(this.currentMode, 10);
        const scoresContent = this.renderScoresTable(topScores);
        const scoresBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: scoresTop,
            left: panelLeft,
            width: panelWidth,
            height: scoresHeight,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ` Top 10 - ${this.getModeName(this.currentMode)} `,
            content: scoresContent,
            fixed: true,
        });
        // Personal best
        const personalBest = this.highScores.getPersonalBest(this.playerName, this.currentMode);
        const personalContent = this.renderPersonalBest(personalBest);
        const personalBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: personalTop,
            left: panelLeft,
            width: panelWidth,
            height: personalHeight,
            border: { type: 'line' },
            style: { border: { fg: 'magenta' } },
            label: ' Your Best ',
            content: personalContent,
            fixed: true,
        });
        // Instructions
        const instructions = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            bottom: 0,
            left: 'center',
            width: headerWidth,
            height: 1,
            border: undefined,
            content: '{gray-fg}← → / TAB: Change Mode  |  Q/ESC: Back{/gray-fg}',
        });
        this.screen.render();
    }
    /**
     * Render mode tabs
     */
    renderModeTabs() {
        const modes = [
            { mode: 'master', name: 'MASTER' },
            { mode: 'death', name: 'DEATH' },
            { mode: 'sprint', name: 'SPRINT' },
            { mode: 'marathon', name: 'MARATHON' },
            { mode: 'versus', name: 'VERSUS' },
            { mode: 'training', name: 'TRAINING' },
        ];
        let tabs = '';
        for (const { mode, name } of modes) {
            if (mode === this.currentMode) {
                tabs += `{black-bg}{white-fg}{bold}[ ${name} ]{/bold}{/white-fg}{/black-bg} `;
            }
            else {
                tabs += `{gray-fg}  ${name}  {/gray-fg} `;
            }
        }
        tabs += '';
        return tabs;
    }
    /**
     * Get display name for mode
     */
    getModeName(mode) {
        const names = {
            master: 'Master Mode',
            death: 'Death Mode (Shirase)',
            sprint: '40-Line Sprint',
            marathon: 'Marathon',
            versus: 'Versus Mode',
            training: 'Training Mode',
            mission: 'Mission Mode',
            dig: 'Dig Mode',
            ultra: 'Ultra Mode',
            blitz: 'Blitz Mode',
            combo: 'Combo Challenge',
            survival: 'Survival Mode',
            classic: 'Classic Mode',
            zen: 'Zen Mode',
            zone: 'Zone Mode',
            cpu_battle: 'CPU Battle',
            tetrinet: 'TetriNET',
        };
        return names[mode];
    }
    /**
     * Render scores table
     */
    renderScoresTable(scores) {
        if (scores.length === 0) {
            return '\n\n{gray-fg}No scores yet{/gray-fg}\n\nBe the first to set a record!';
        }
        let content = '{bold}  #  Player          Grade Level    Score  Time      Date{/bold}\n';
        content += '  ─────────────────────────────────────────────────────────────\n';
        for (let i = 0; i < 10; i++) {
            if (i < scores.length) {
                const entry = scores[i];
                const rank = this.formatRank(i + 1);
                const player = this.formatPlayer(entry.playerName);
                const grade = this.formatGrade(entry.grade);
                const level = this.formatLevel(entry.level);
                const score = this.formatScore(entry.score);
                const time = this.formatTime(entry.time);
                const date = this.formatDate(entry.date);
                content += `  ${rank}  ${player} ${grade} ${level} ${score}  ${time}  ${date}\n`;
            }
            else {
                content += `  ${this.formatRank(i + 1)}  {gray-fg}───{/gray-fg}\n`;
            }
        }
        return content;
    }
    /**
     * Render personal best
     */
    renderPersonalBest(best) {
        if (!best) {
            return '{gray-fg}No personal record in this mode yet{/gray-fg}';
        }
        return (`Grade: ${this.formatGrade(best.grade)}  Level: ${this.formatLevel(best.level)}  ` +
            `Score: ${this.formatScore(best.score)}  ` +
            `Time: ${this.formatTime(best.time)}  ${this.formatDate(best.date)}`);
    }
    /**
     * Format rank
     */
    formatRank(rank) {
        const color = rank === 1 ? 'yellow' : rank === 2 ? 'white' : rank === 3 ? 'red' : 'gray';
        return `{${color}-fg}${rank.toString().padStart(2, ' ')}{/${color}-fg}`;
    }
    /**
     * Format player name
     */
    formatPlayer(name) {
        return `{cyan-fg}${name.substring(0, 15).padEnd(15, ' ')}{/cyan-fg}`;
    }
    /**
     * Format grade
     */
    formatGrade(grade) {
        const color = grade === 'GMM' || grade === 'GM' ? 'yellow' : grade.startsWith('M') ? 'red' : grade.startsWith('m') ? 'magenta' : grade.startsWith('S') ? 'cyan' : 'white';
        return `{${color}-fg}{bold}${grade.padEnd(4, ' ')}{/bold}{/${color}-fg}`;
    }
    /**
     * Format level
     */
    formatLevel(level) {
        return `{white-fg}${level.toString().padStart(4, ' ')}{/white-fg}`;
    }
    /**
     * Format score
     */
    formatScore(score) {
        return `{yellow-fg}${score.toLocaleString().padStart(8, ' ')}{/yellow-fg}`;
    }
    /**
     * Format time
     */
    formatTime(time) {
        if (time === null) {
            return '{gray-fg}  --:--  {/gray-fg}';
        }
        const minutes = Math.floor(time / 60000);
        const seconds = Math.floor((time % 60000) / 1000);
        const ms = Math.floor((time % 1000) / 10);
        return `{white-fg}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}{/white-fg}`;
    }
    /**
     * Format date
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString().substring(2);
        return `{gray-fg}${month}/${day}/${year}{/gray-fg}`;
    }
}
exports.LeaderboardScreen = LeaderboardScreen;
//# sourceMappingURL=leaderboard-screen.js.map