"use strict";
/**
 * Pengo - Game Engine
 * Core game logic for the 1982 Sega arcade puzzle game
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PengoGame = void 0;
const constants_1 = require("./constants");
class PengoGame {
    constructor(data, onRender) {
        this.data = data;
        this.renderCallback = onRender;
    }
    initLevel() {
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        // Initialize grid with walls on edges
        this.data.grid = [];
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            this.data.grid[y] = [];
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                if (x === 0 || x === constants_1.GRID_WIDTH - 1 || y === 0 || y === constants_1.GRID_HEIGHT - 1) {
                    this.data.grid[y][x] = 'wall';
                }
                else {
                    this.data.grid[y][x] = 'empty';
                }
            }
        }
        // Place ice blocks randomly
        let blocksPlaced = 0;
        while (blocksPlaced < config.iceBlocks) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'empty') {
                this.data.grid[y][x] = 'ice';
                blocksPlaced++;
            }
        }
        // Place 3 diamond blocks
        let diamondsPlaced = 0;
        while (diamondsPlaced < 3) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'ice') {
                this.data.grid[y][x] = 'diamond';
                diamondsPlaced++;
            }
        }
        // Find empty spot for Pengo
        let pengoPlaced = false;
        while (!pengoPlaced) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'empty') {
                this.data.pengo = {
                    x, y,
                    direction: 'up',
                    isPushing: false,
                    pushFrame: 0,
                    isDead: false,
                    deathFrame: 0,
                };
                pengoPlaced = true;
            }
        }
        // Spawn enemies
        this.data.enemies = [];
        for (let i = 0; i < config.enemies; i++) {
            this.spawnEnemy();
        }
        // Spawn eggs
        this.data.eggs = [];
        for (let i = 0; i < config.eggs; i++) {
            let placed = false;
            while (!placed) {
                const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
                const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
                if (this.data.grid[y][x] === 'empty' &&
                    Math.abs(x - this.data.pengo.x) > 3 &&
                    Math.abs(y - this.data.pengo.y) > 3) {
                    this.data.eggs.push({ x, y, hatchTimer: constants_1.HATCH_TIME + Math.random() * 100 });
                    placed = true;
                }
            }
        }
        this.data.timeRemaining = config.timeLimit;
        this.data.diamondsAligned = false;
        this.render();
    }
    spawnEnemy() {
        let placed = false;
        while (!placed) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'empty' &&
                Math.abs(x - this.data.pengo.x) > 3 &&
                Math.abs(y - this.data.pengo.y) > 3) {
                this.data.enemies.push({
                    id: this.data.enemyIdCounter++,
                    x, y,
                    direction: ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)],
                    state: 'walking',
                    stunTimer: 0,
                    hatchTimer: 0,
                    moveTimer: 0,
                });
                placed = true;
            }
        }
    }
    handleDirection(direction) {
        if (this.data.pengo.isDead)
            return;
        this.data.pengo.direction = direction;
        this.tryMove(direction);
    }
    handlePush() {
        if (this.data.pengo.isDead || this.data.pengo.isPushing)
            return;
        const dir = this.data.pengo.direction;
        const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
        const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
        const targetX = this.data.pengo.x + dx;
        const targetY = this.data.pengo.y + dy;
        const cell = this.data.grid[targetY]?.[targetX];
        if (cell === 'ice' || cell === 'diamond') {
            this.pushBlock(targetX, targetY, dx, dy);
        }
        else if (cell === 'wall') {
            this.shakeWall(dir);
        }
    }
    tryMove(direction) {
        const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
        const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
        const newX = this.data.pengo.x + dx;
        const newY = this.data.pengo.y + dy;
        const cell = this.data.grid[newY]?.[newX];
        if (cell === 'empty') {
            this.data.pengo.x = newX;
            this.data.pengo.y = newY;
        }
    }
    pushBlock(x, y, dx, dy) {
        this.data.pengo.isPushing = true;
        this.data.pengo.pushFrame = 0;
        this.data.score += constants_1.SCORES.pushBlock;
        const cellType = this.data.grid[y][x];
        // Slide block until it hits something
        let slideX = x;
        let slideY = y;
        let crushedEnemy = false;
        while (true) {
            const nextX = slideX + dx;
            const nextY = slideY + dy;
            const nextCell = this.data.grid[nextY]?.[nextX];
            // Check for enemy at next position
            const enemyHit = this.data.enemies.find(e => e.x === nextX && e.y === nextY && e.state !== 'dead');
            if (enemyHit) {
                // Crush enemy!
                enemyHit.state = 'dead';
                this.data.score += constants_1.SCORES.crushEnemy;
                crushedEnemy = true;
                // Block stops at enemy position
                this.data.grid[y][x] = 'empty';
                this.data.grid[slideY][slideX] = 'empty';
                break;
            }
            if (nextCell === 'empty') {
                slideX = nextX;
                slideY = nextY;
            }
            else {
                // Hit wall or another block
                break;
            }
        }
        if (!crushedEnemy) {
            // Move block to final position
            this.data.grid[y][x] = 'empty';
            this.data.grid[slideY][slideX] = cellType;
        }
        // Check for diamond alignment
        this.checkDiamondAlignment();
    }
    shakeWall(direction) {
        // Stun all enemies touching that wall
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            let touching = false;
            if (direction === 'up' && enemy.y === 1)
                touching = true;
            if (direction === 'down' && enemy.y === constants_1.GRID_HEIGHT - 2)
                touching = true;
            if (direction === 'left' && enemy.x === 1)
                touching = true;
            if (direction === 'right' && enemy.x === constants_1.GRID_WIDTH - 2)
                touching = true;
            if (touching) {
                enemy.state = 'stunned';
                enemy.stunTimer = constants_1.STUN_DURATION;
                this.data.score += constants_1.SCORES.stunEnemy;
            }
        }
    }
    checkDiamondAlignment() {
        // Check horizontal alignment
        for (let y = 1; y < constants_1.GRID_HEIGHT - 1; y++) {
            let count = 0;
            for (let x = 1; x < constants_1.GRID_WIDTH - 1; x++) {
                if (this.data.grid[y][x] === 'diamond')
                    count++;
            }
            if (count >= 2) {
                this.data.score += count === 2 ? constants_1.SCORES.diamondAlign2 : constants_1.SCORES.diamondAlign3;
                this.data.diamondsAligned = true;
            }
        }
        // Check vertical alignment
        for (let x = 1; x < constants_1.GRID_WIDTH - 1; x++) {
            let count = 0;
            for (let y = 1; y < constants_1.GRID_HEIGHT - 1; y++) {
                if (this.data.grid[y][x] === 'diamond')
                    count++;
            }
            if (count >= 2) {
                this.data.score += count === 2 ? constants_1.SCORES.diamondAlign2 : constants_1.SCORES.diamondAlign3;
                this.data.diamondsAligned = true;
            }
        }
    }
    update() {
        this.data.lastUpdateTime = Date.now();
        this.data.frameCount++;
        // Timer
        if (this.data.frameCount % 10 === 0) {
            this.data.timeRemaining--;
            if (this.data.timeRemaining <= 0) {
                this.killPengo();
                return;
            }
        }
        // Push animation
        if (this.data.pengo.isPushing) {
            this.data.pengo.pushFrame++;
            if (this.data.pengo.pushFrame >= 5) {
                this.data.pengo.isPushing = false;
            }
        }
        // Death animation
        if (this.data.pengo.isDead) {
            this.data.pengo.deathFrame++;
            if (this.data.pengo.deathFrame >= 20) {
                this.respawnPengo();
            }
            this.render();
            return;
        }
        // Update enemies
        this.updateEnemies();
        // Update eggs
        this.updateEggs();
        // Check collisions
        this.checkCollisions();
        // Check level complete
        if (this.data.enemies.filter(e => e.state !== 'dead').length === 0 &&
            this.data.eggs.length === 0) {
            this.data.state = 'levelComplete';
            this.data.score += constants_1.SCORES.clearLevel;
            this.data.score += this.data.timeRemaining * constants_1.SCORES.timeBonus;
            setTimeout(() => {
                this.data.level++;
                this.initLevel();
                this.data.state = 'playing';
            }, 2000);
        }
        // Remove dead enemies
        this.data.enemies = this.data.enemies.filter(e => e.state !== 'dead');
        this.render();
    }
    updateEnemies() {
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            if (enemy.state === 'stunned') {
                enemy.stunTimer--;
                if (enemy.stunTimer <= 0) {
                    enemy.state = 'walking';
                }
                continue;
            }
            enemy.moveTimer++;
            if (enemy.moveTimer < config.enemySpeed)
                continue;
            enemy.moveTimer = 0;
            // Simple AI: move towards Pengo
            const dx = this.data.pengo.x - enemy.x;
            const dy = this.data.pengo.y - enemy.y;
            let moveDir;
            if (Math.abs(dx) > Math.abs(dy)) {
                moveDir = dx > 0 ? 'right' : 'left';
            }
            else {
                moveDir = dy > 0 ? 'down' : 'up';
            }
            // Try to move
            const moveDx = moveDir === 'left' ? -1 : moveDir === 'right' ? 1 : 0;
            const moveDy = moveDir === 'up' ? -1 : moveDir === 'down' ? 1 : 0;
            const newX = enemy.x + moveDx;
            const newY = enemy.y + moveDy;
            if (this.data.grid[newY]?.[newX] === 'empty') {
                enemy.x = newX;
                enemy.y = newY;
                enemy.direction = moveDir;
            }
            else {
                // Can't move towards player, try random direction
                const dirs = ['up', 'down', 'left', 'right'];
                for (const dir of dirs.sort(() => Math.random() - 0.5)) {
                    const rdx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
                    const rdy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
                    const rx = enemy.x + rdx;
                    const ry = enemy.y + rdy;
                    if (this.data.grid[ry]?.[rx] === 'empty') {
                        enemy.x = rx;
                        enemy.y = ry;
                        enemy.direction = dir;
                        break;
                    }
                }
            }
        }
    }
    updateEggs() {
        for (let i = this.data.eggs.length - 1; i >= 0; i--) {
            const egg = this.data.eggs[i];
            egg.hatchTimer--;
            if (egg.hatchTimer <= 0) {
                // Hatch into enemy
                this.data.enemies.push({
                    id: this.data.enemyIdCounter++,
                    x: egg.x,
                    y: egg.y,
                    direction: 'up',
                    state: 'walking',
                    stunTimer: 0,
                    hatchTimer: 0,
                    moveTimer: 0,
                });
                this.data.eggs.splice(i, 1);
            }
        }
    }
    checkCollisions() {
        // Enemy collision with Pengo
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead' || enemy.state === 'stunned')
                continue;
            if (enemy.x === this.data.pengo.x && enemy.y === this.data.pengo.y) {
                this.killPengo();
                return;
            }
        }
    }
    killPengo() {
        this.data.pengo.isDead = true;
        this.data.pengo.deathFrame = 0;
        this.data.lives--;
    }
    respawnPengo() {
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            return;
        }
        this.data.pengo.isDead = false;
        this.data.pengo.deathFrame = 0;
        // Find empty spot
        for (let y = constants_1.GRID_HEIGHT - 2; y > 0; y--) {
            for (let x = 1; x < constants_1.GRID_WIDTH - 1; x++) {
                if (this.data.grid[y][x] === 'empty') {
                    const enemyNear = this.data.enemies.some(e => Math.abs(e.x - x) <= 2 && Math.abs(e.y - y) <= 2);
                    if (!enemyNear) {
                        this.data.pengo.x = x;
                        this.data.pengo.y = y;
                        return;
                    }
                }
            }
        }
    }
    render() {
        const lines = [];
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            let line = '';
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                // Check for Pengo
                if (this.data.pengo.x === x && this.data.pengo.y === y && !this.data.pengo.isDead) {
                    line += '{cyan-fg}P{/}';
                    continue;
                }
                // Check for enemy
                const enemy = this.data.enemies.find(e => e.x === x && e.y === y && e.state !== 'dead');
                if (enemy) {
                    const color = enemy.state === 'stunned' ? 'yellow' : 'red';
                    line += `{${color}-fg}S{/}`;
                    continue;
                }
                // Check for egg
                const egg = this.data.eggs.find(e => e.x === x && e.y === y);
                if (egg) {
                    line += '{magenta-fg}o{/}';
                    continue;
                }
                // Render cell
                const cell = this.data.grid[y][x];
                switch (cell) {
                    case 'wall':
                        line += '{blue-fg}+{/}';
                        break;
                    case 'ice':
                        line += '{white-fg}#{/}';
                        break;
                    case 'diamond':
                        line += '{yellow-fg}*{/}';
                        break;
                    default:
                        line += ' ';
                }
            }
            // Add spacing for wider display
            lines.push(line.split('').join(' '));
        }
        lines.push('');
        const timeColor = this.data.timeRemaining <= 30 ? 'red' : 'yellow';
        lines.push(`{${timeColor}-fg}TIME: ${this.data.timeRemaining}{/}  {white-fg}ENEMIES: ${this.data.enemies.filter(e => e.state !== 'dead').length}{/}`);
        this.renderCallback(lines.join('\n'));
    }
}
exports.PengoGame = PengoGame;
//# sourceMappingURL=pengo-game.js.map