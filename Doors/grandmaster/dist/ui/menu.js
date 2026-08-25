"use strict";
/**
 * Main Menu Screen
 *
 * Displays game mode selection and options
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/**
 * Main menu screen
 */
class MenuScreen {
    constructor(screen, state, sounds) {
        this.screen = screen;
        this.state = state;
        this.sounds = sounds;
    }
    /**
     * Show menu and wait for selection
     */
    async show() {
        // Enable mouse control for menu navigation
        this.screen.program.enableMouse();
        // Clear terminal buffer to prevent ghosting from previous screens (e.g., tetrinet lobby)
        // This is the same fix used in app.ts startup for modem speed compatibility
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
        // Wait for screen clear to propagate (critical for modem speeds)
        await new Promise(resolve => setTimeout(resolve, 200));
        return new Promise((resolve) => {
            // Play menu music
            this.sounds.playMusic('menu', true);
            // Clear screen completely
            this.screen.children.forEach(child => child.destroy());
            // Full-screen background to clear any previous content
            const background = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                style: {
                    bg: 'black',
                },
            });
            // Title box - centered, wide enough for ASCII art
            // Offset top:1 to avoid overlapping any parent border
            // No border of its own: createBox() draws one by default, and that
            // outline sat directly above the logo, duplicating the full-screen
            // background frame right outside it. Dropping it removes that line and
            // hands the two rows it occupied to the panels below.
            const title = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 1,
                left: 2,
                width: 76,
                height: 4,
                border: { type: 'none' },
                content: this.getTitleArt(),
                style: {
                    fg: 'yellow',
                    bg: 'black',
                },
            });
            // Layout: 2 char margin on each side, panels fill 76 chars
            // menuPanel: 26, descBox: 30, info: 20 = 76 total
            // Title art is rows 1-4; panels run row 5 to row 22 (row 23 is the
            // background frame's bottom edge) = 18 rows.
            const leftMargin = 2;
            const panelTop = 5;
            const panelHeight = 18;
            // Mode selection list - left panel
            const menuPanel = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: panelTop,
                left: leftMargin,
                width: 26,
                height: panelHeight,
                border: { type: 'line' },
                label: ' SELECT MODE ',
                style: {
                    border: { fg: 'cyan' },
                },
            });
            const menu = (0, blessed_helpers_1.createList)({
                parent: menuPanel,
                top: 0,
                left: 1,
                width: 22,
                height: panelHeight - 2, // Leave room for panel border
                scrollable: true,
                scrollbar: {
                    ch: ' ',
                    style: { bg: 'cyan' },
                },
                style: {
                    border: { fg: 'cyan' },
                    selected: { bg: 'cyan', fg: 'black' },
                    item: { fg: 'white' },
                },
                keys: true,
                vi: true,
                mouse: true,
                items: [
                    'MASTER MODE',
                    'DEATH MODE',
                    'SPRINT 40L',
                    'MARATHON',
                    'CPU BATTLE',
                    'VERSUS',
                    '{yellow-fg}TETRINET{/yellow-fg}',
                    'TRAINING',
                    '{cyan-fg}ULTRA 2MIN{/cyan-fg}',
                    '{red-fg}DIG MODE{/red-fg}',
                    '{cyan-fg}ZONE MODE{/cyan-fg}',
                    '',
                    'Settings',
                    'High Scores',
                    '{cyan-fg}Manual (F1){/cyan-fg}',
                    '{red-fg}Quit{/red-fg}',
                ],
            });
            // Mode description box - middle panel
            const descBox = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: panelTop,
                left: leftMargin + 26,
                width: 30,
                height: panelHeight,
                border: { type: 'line' },
                label: ' DESCRIPTION ',
                style: { border: { fg: 'gray' } },
                content: this.getModeDescription(0),
                fixed: true,
            });
            // Update description when selection changes
            menu.on('select item', (_item, index) => {
                // Play navigation sound when scrolling through menu
                this.sounds.playSfx('menu_select');
                descBox.setContent(this.getModeDescription(index));
                this.screen.render();
            });
            // Info box - right panel
            const info = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: panelTop,
                left: leftMargin + 26 + 30,
                width: 20,
                height: panelHeight,
                border: { type: 'line' },
                label: ' PLAYER ',
                style: { border: { fg: 'gray' } },
                content: this.getPlayerInfo(),
            });
            // Instructions
            const instructions = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                bottom: 0,
                left: 0,
                width: '100%',
                height: 1,
                align: 'center',
                style: { fg: 'gray', bg: 'black' },
                content: 'Arrow Keys: Navigate  |  Enter: Select  |  ESC/Q: Quit',
            });
            // Ensure title is rendered on top (z-index fix)
            title.setFront();
            this.screen.render();
            // Handle selection
            menu.on('select', (_item, index) => {
                const selections = [
                    'master',
                    'death',
                    'sprint',
                    'marathon',
                    'cpu_battle',
                    'versus',
                    'tetrinet',
                    'training',
                    'ultra',
                    'dig',
                    'zone',
                    'master', // Separator line, default to master
                    'settings',
                    'stats',
                    'manual',
                    'quit',
                ];
                const selection = selections[index];
                this.sounds.playSfx('menu_ok');
                // Clean up
                background.destroy();
                title.destroy();
                menuPanel.destroy(); // Also destroys menu as a child
                descBox.destroy();
                info.destroy();
                instructions.destroy();
                this.screen.render();
                resolve(selection);
            });
            // Handle quit key
            menu.key(['q', 'Q'], () => {
                menu.emit('select', null, 15); // Trigger quit selection (index 15)
            });
            // Handle ESC key - same as quit
            menu.key(['escape'], () => {
                menu.emit('select', null, 15); // Trigger quit selection (index 15)
            });
            // Handle F1 key for manual
            menu.key(['f1'], () => {
                menu.emit('select', null, 14); // Trigger manual selection (index 14)
            });
            // Focus and render
            menu.focus();
            this.screen.render();
        });
    }
    /**
     * Get title ASCII art
     */
    getTitleArt() {
        const p = '    '; // 4-char pad to center 68-char art in 76-char box
        return `{bold}{yellow-fg}${p} _____ _____ _____ _____ ____  _____ _____ _____ _____ _____ _____
${p}|   __|  _  |  _  |   | |    \\|     |  _  |   __|_   _|   __| __  |
${p}|  |  |     |     |\\    |  |  | | | |     |__   | | | |   __|    -|
${p}|_____|__|__|__|__|_|___|____/|_|_|_|__|__|_____| |_| |_____|__|__|{/yellow-fg}{/bold}`;
    }
    /**
     * Get mode description for selected index
     */
    getModeDescription(index) {
        const descriptions = [
            // MASTER MODE
            '{bold}{cyan-fg}MASTER MODE{/cyan-fg}{/bold}\n\n' +
                'Classic TGM3-style\n' +
                'grading system.\n\n' +
                'Reach GM grade by\n' +
                'mastering speed,\n' +
                'efficiency & skill.',
            // DEATH MODE
            '{bold}{red-fg}DEATH MODE{/red-fg}{/bold}\n\n' +
                '20G gravity from\n' +
                'the very start!\n\n' +
                'Shirase-style\n' +
                'extreme challenge.',
            // SPRINT 40L
            '{bold}{green-fg}SPRINT 40L{/green-fg}{/bold}\n\n' +
                'Clear 40 lines as\n' +
                'fast as possible.\n\n' +
                'Pure speed test.',
            // MARATHON
            '{bold}{yellow-fg}MARATHON{/yellow-fg}{/bold}\n\n' +
                'Endless survival.\n' +
                'How long can you\n' +
                'last?\n\n' +
                'No level cap.',
            // CPU BATTLE
            '{bold}{magenta-fg}CPU BATTLE{/magenta-fg}{/bold}\n\n' +
                'Battle against AI\n' +
                'opponents.\n\n' +
                'Test your skills\n' +
                'vs the computer.',
            // VERSUS
            '{bold}{blue-fg}VERSUS{/blue-fg}{/bold}\n\n' +
                'Online multiplayer!\n\n' +
                'Battle other BBS\n' +
                'users in real-time.',
            // TETRINET
            '{bold}{yellow-fg}TETRINET{/yellow-fg}{/bold}\n\n' +
                'Classic TetriNET!\n\n' +
                '16 special blocks,\n' +
                'up to 6 players,\n' +
                'sudden death mode.',
            // TRAINING
            '{bold}{white-fg}TRAINING{/white-fg}{/bold}\n\n' +
                'Practice mode.\n\n' +
                'Learn techniques,\n' +
                'no pressure.',
            // ULTRA MODE
            '{bold}{cyan-fg}ULTRA 2MIN{/cyan-fg}{/bold}\n\n' +
                'Score as many\n' +
                'points as possible\n' +
                'in 2 minutes!\n\n' +
                '{cyan-fg}Race the clock!{/cyan-fg}',
            // DIG MODE
            '{bold}{red-fg}DIG MODE{/red-fg}{/bold}\n\n' +
                'Board starts with\n' +
                '10 garbage rows.\n\n' +
                'Clear them all!\n' +
                'Faster = better\n' +
                'time score.',
            // ZONE MODE
            '{bold}{cyan-fg}ZONE MODE{/cyan-fg}{/bold}\n\n' +
                'Clear lines to\n' +
                'fill the ZONE\n' +
                'meter. Activate\n' +
                'with Rotate180\n' +
                'for a bonus!\n\n' +
                '{gray-fg}Min 20% to fire{/gray-fg}',
            // Empty separator
            '',
            // Settings
            '{gray-fg}Configure game\noptions, controls,\nand preferences.{/gray-fg}',
            // High Scores
            '{gray-fg}View your play\nhistory, records,\nand achievements.{/gray-fg}',
            // Manual
            '{cyan-fg}Player manual with\ncontrols, mechanics,\nand strategy tips.{/cyan-fg}',
            // Quit
            '{gray-fg}Exit GRANDMASTER\nand return to BBS.{/gray-fg}',
        ];
        return descriptions[index] || '';
    }
    /**
     * Get player info display
     */
    getPlayerInfo() {
        const stats = this.state.stats;
        return `{cyan-fg}${this.state.playerName}{/cyan-fg}\n\n` +
            `Grade: {yellow-fg}${stats.bestGrade}{/yellow-fg}\n` +
            `Level: ${stats.bestLevel}\n` +
            `Games: ${stats.gamesPlayed}\n` +
            `Lines: ${stats.totalLines}`;
    }
}
exports.MenuScreen = MenuScreen;
//# sourceMappingURL=menu.js.map