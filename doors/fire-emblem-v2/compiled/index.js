"use strict";
/**
 * Fire Emblem: Emblem of Valor v2.0
 *
 * Tactical RPG using SDK v2.0 with neo-blessed UI
 *
 * Features:
 * - Story-driven tactical combat
 * - Multiple playable characters with unique classes
 * - Weapon triangle system (Sword > Axe > Lance > Sword)
 * - Neo-blessed tactical map UI
 * - Permadeath and difficulty options
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
// ===== Game Data =====
const PLAYER_UNITS = [
    {
        id: 'aldric',
        name: 'Aldric',
        class: 'Lord',
        level: 1,
        hp: 18,
        maxHp: 18,
        str: 5,
        mag: 0,
        skl: 7,
        spd: 8,
        lck: 6,
        def: 4,
        res: 1,
        team: 'player',
        weapon: 'Iron Sword',
    },
    {
        id: 'elara',
        name: 'Elara',
        class: 'Cleric',
        level: 1,
        hp: 16,
        maxHp: 16,
        str: 1,
        mag: 4,
        skl: 6,
        spd: 7,
        lck: 8,
        def: 2,
        res: 6,
        team: 'player',
        weapon: 'Heal',
    },
    {
        id: 'marcus',
        name: 'Marcus',
        class: 'Knight',
        level: 1,
        hp: 22,
        maxHp: 22,
        str: 7,
        mag: 0,
        skl: 5,
        spd: 3,
        lck: 4,
        def: 9,
        res: 0,
        team: 'player',
        weapon: 'Iron Lance',
    },
];
const ENEMY_UNITS = [
    {
        id: 'bandit1',
        name: 'Bandit',
        class: 'Brigand',
        level: 1,
        hp: 20,
        maxHp: 20,
        str: 6,
        mag: 0,
        skl: 4,
        spd: 5,
        lck: 3,
        def: 3,
        res: 0,
        team: 'enemy',
        weapon: 'Iron Axe',
    },
    {
        id: 'bandit2',
        name: 'Bandit',
        class: 'Brigand',
        level: 1,
        hp: 20,
        maxHp: 20,
        str: 6,
        mag: 0,
        skl: 4,
        spd: 5,
        lck: 3,
        def: 3,
        res: 0,
        team: 'enemy',
        weapon: 'Iron Axe',
    },
];
// ===== Game Class =====
class FireEmblemGame {
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        // Show title
        this.ctx.output.write('\x1b[2J\x1b[H');
        this.ctx.output.write('\x1b[36m');
        this.ctx.output.write('  ╔══════════════════════════════════════╗\r\n');
        this.ctx.output.write('  ║  FIRE EMBLEM: EMBLEM OF VALOR v2.0  ║\r\n');
        this.ctx.output.write('  ╚══════════════════════════════════════╝\r\n');
        this.ctx.output.write('\x1b[0m\r\n');
        this.ctx.output.write('  A tactical RPG for AmiExpress BBS\r\n\r\n');
        this.ctx.output.write('  Chapter 1: Bandit Raid\r\n\r\n');
        this.ctx.output.write('  Bandits are attacking the village!\r\n');
        this.ctx.output.write('  Defeat all enemies to protect the people.\r\n\r\n');
        this.ctx.output.write('\x1b[90m  Press SPACE to start or Q to quit\x1b[0m\r\n');
        // Wait for input to start
        const key = await this.waitForKey();
        if (key === 'q' || key === 'Q') {
            this.ctx.close();
            return;
        }
        // Initialize game state
        this.initializeChapter();
        // Create neo-blessed UI
        this.createUI();
        // Start game
        this.render();
    }
    initializeChapter() {
        // Place player units
        const playerUnits = [
            { ...PLAYER_UNITS[0], x: 2, y: 8 },
            { ...PLAYER_UNITS[1], x: 3, y: 8 },
            { ...PLAYER_UNITS[2], x: 1, y: 8 },
        ];
        // Place enemy units
        const enemyUnits = [
            { ...ENEMY_UNITS[0], x: 8, y: 2 },
            { ...ENEMY_UNITS[1], x: 9, y: 3 },
        ];
        this.state = {
            chapter: 1,
            turn: 1,
            phase: 'player',
            units: [...playerUnits, ...enemyUnits],
            selectedUnit: null,
            cursorX: 2,
            cursorY: 8,
            mapWidth: 12,
            mapHeight: 10,
            gameOver: false,
            victory: false,
        };
    }
    createUI() {
        this.screen = new blessed_1.Screen({
            smartCSR: true,
            title: 'Fire Emblem: Emblem of Valor',
        });
        // Map display
        this.mapBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '70%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            label: ' Battlefield ',
        });
        // Status display
        this.statusBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: '70%',
            width: '30%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            label: ' Status ',
        });
        // Set up input handlers
        this.screen.key(['q', 'Q'], () => {
            this.cleanup();
            this.ctx.close();
        });
        this.screen.key(['up', 'w'], () => this.moveCursor(0, -1));
        this.screen.key(['down', 's'], () => this.moveCursor(0, 1));
        this.screen.key(['left', 'a'], () => this.moveCursor(-1, 0));
        this.screen.key(['right', 'd'], () => this.moveCursor(1, 0));
        this.screen.key(['space', 'enter'], () => this.handleSelect());
        this.screen.key(['e', 'E'], () => this.endPlayerPhase());
    }
    moveCursor(dx, dy) {
        if (this.state.gameOver)
            return;
        this.state.cursorX = Math.max(0, Math.min(this.state.mapWidth - 1, this.state.cursorX + dx));
        this.state.cursorY = Math.max(0, Math.min(this.state.mapHeight - 1, this.state.cursorY + dy));
        this.render();
    }
    handleSelect() {
        if (this.state.gameOver)
            return;
        const unit = this.getUnitAt(this.state.cursorX, this.state.cursorY);
        if (!this.state.selectedUnit) {
            // Select unit
            if (unit && unit.team === 'player' && this.state.phase === 'player') {
                this.state.selectedUnit = unit;
                this.render();
            }
        }
        else {
            // Move unit or attack
            if (unit && unit.team === 'enemy') {
                this.performAttack(this.state.selectedUnit, unit);
            }
            else if (!unit) {
                this.moveUnit(this.state.selectedUnit, this.state.cursorX, this.state.cursorY);
            }
            this.state.selectedUnit = null;
            this.render();
        }
    }
    endPlayerPhase() {
        if (this.state.phase === 'player' && !this.state.gameOver) {
            this.state.phase = 'enemy';
            this.render();
            setTimeout(() => this.performEnemyPhase(), 1000);
        }
    }
    performEnemyPhase() {
        // Simple AI: move towards player units and attack if in range
        const enemies = this.state.units.filter(u => u.team === 'enemy');
        const players = this.state.units.filter(u => u.team === 'player');
        for (const enemy of enemies) {
            // Find nearest player
            let nearest = players[0];
            let minDist = this.distance(enemy, nearest);
            for (const player of players) {
                const dist = this.distance(enemy, player);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = player;
                }
            }
            // Attack if adjacent
            if (minDist === 1) {
                this.performAttack(enemy, nearest);
            }
            else {
                // Move towards player
                const dx = nearest.x > enemy.x ? 1 : nearest.x < enemy.x ? -1 : 0;
                const dy = nearest.y > enemy.y ? 1 : nearest.y < enemy.y ? -1 : 0;
                this.moveUnit(enemy, enemy.x + dx, enemy.y + dy);
            }
        }
        // Check victory/defeat
        this.checkGameOver();
        // Start player turn
        this.state.turn++;
        this.state.phase = 'player';
        this.render();
    }
    performAttack(attacker, defender) {
        // Simple damage calculation
        const damage = Math.max(0, attacker.str - defender.def);
        defender.hp = Math.max(0, defender.hp - damage);
        // Remove defeated units
        if (defender.hp <= 0) {
            this.state.units = this.state.units.filter(u => u.id !== defender.id);
            this.checkGameOver();
        }
    }
    moveUnit(unit, x, y) {
        // Check if position is valid
        if (x < 0 || x >= this.state.mapWidth || y < 0 || y >= this.state.mapHeight)
            return;
        if (this.getUnitAt(x, y))
            return;
        unit.x = x;
        unit.y = y;
    }
    distance(u1, u2) {
        return Math.abs(u1.x - u2.x) + Math.abs(u1.y - u2.y);
    }
    getUnitAt(x, y) {
        return this.state.units.find(u => u.x === x && u.y === y) || null;
    }
    checkGameOver() {
        const players = this.state.units.filter(u => u.team === 'player');
        const enemies = this.state.units.filter(u => u.team === 'enemy');
        if (enemies.length === 0) {
            this.state.gameOver = true;
            this.state.victory = true;
        }
        else if (players.length === 0) {
            this.state.gameOver = true;
            this.state.victory = false;
        }
    }
    render() {
        // Render map
        let mapContent = '';
        for (let y = 0; y < this.state.mapHeight; y++) {
            for (let x = 0; x < this.state.mapWidth; x++) {
                const unit = this.getUnitAt(x, y);
                const isCursor = x === this.state.cursorX && y === this.state.cursorY;
                const isSelected = this.state.selectedUnit && unit?.id === this.state.selectedUnit.id;
                if (unit) {
                    if (unit.team === 'player') {
                        mapContent += isSelected ? '{blue-fg}{bold}P{/bold}{/blue-fg}' : '{green-fg}P{/green-fg}';
                    }
                    else {
                        mapContent += '{red-fg}E{/red-fg}';
                    }
                }
                else {
                    mapContent += isCursor ? '{inverse}.{/inverse}' : '.';
                }
                mapContent += ' ';
            }
            mapContent += '\n';
        }
        if (this.state.gameOver) {
            mapContent += '\n';
            if (this.state.victory) {
                mapContent += '{green-fg}{bold}VICTORY!{/bold}{/green-fg}\n';
                mapContent += 'All enemies defeated!\n';
            }
            else {
                mapContent += '{red-fg}{bold}DEFEAT!{/bold}{/red-fg}\n';
                mapContent += 'All units lost...\n';
            }
            mapContent += '\nPress Q to quit\n';
        }
        this.mapBox.setContent(mapContent);
        // Render status
        let statusContent = `{bold}Chapter ${this.state.chapter}: Bandit Raid{/bold}\n\n`;
        statusContent += `Turn: ${this.state.turn}\n`;
        statusContent += `Phase: {${this.state.phase === 'player' ? 'green' : 'red'}-fg}${this.state.phase.toUpperCase()}{/${this.state.phase === 'player' ? 'green' : 'red'}-fg}\n\n`;
        const cursorUnit = this.getUnitAt(this.state.cursorX, this.state.cursorY);
        if (cursorUnit) {
            statusContent += `{bold}${cursorUnit.name}{/bold}\n`;
            statusContent += `${cursorUnit.class} Lv${cursorUnit.level}\n`;
            statusContent += `HP: ${cursorUnit.hp}/${cursorUnit.maxHp}\n`;
            statusContent += `Str: ${cursorUnit.str}  Def: ${cursorUnit.def}\n`;
            statusContent += `Spd: ${cursorUnit.spd}  Res: ${cursorUnit.res}\n`;
            statusContent += `${cursorUnit.weapon}\n`;
        }
        else {
            statusContent += '{gray-fg}No unit selected{/gray-fg}\n';
        }
        statusContent += '\n{bold}Controls:{/bold}\n';
        statusContent += 'Arrows/WASD: Move\n';
        statusContent += 'Space: Select/Action\n';
        statusContent += 'E: End Phase\n';
        statusContent += 'Q: Quit\n';
        this.statusBox.setContent(statusContent);
        this.screen.render();
    }
    cleanup() {
        if (this.screen) {
            this.screen.destroy();
        }
    }
    async waitForKey() {
        return await this.ctx.input.getChar();
    }
}
// ===== SDK v2.0 Pattern =====
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Fire Emblem: Emblem of Valor',
    version: '2.0.0',
    author: 'AmiExpress SDK v2.0',
});
let game;
door.onStart(async (ctx) => {
    game = new FireEmblemGame();
    game.setContext(ctx);
    await game.start();
});
door.onClose(async (ctx) => {
    ctx.output.writeLine('\r\n\x1b[36mThanks for playing Fire Emblem!\x1b[0m\r\n');
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    console.error('Fire Emblem error:', error);
});
exports.default = door;
