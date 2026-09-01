"use strict";
/**
 * Pengo - Game Engine
 * Core game logic for the 1982 Sega arcade puzzle game
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PengoGame = void 0;
const constants_1 = require("./constants");
const arcade_1 = require("@amiexpress/bbs-door-sdk/engines/ui/arcade");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const render_1 = require("./render");
const levels_1 = require("../levels");
const ai_1 = require("./ai");
class PengoGame {
    constructor(data, onRender, sheet) {
        /**
         * What just happened, for whoever is listening.
         *
         * The game names the moment; the door decides whether anybody hears it.
         * Nothing in here touches a socket, so the sound design is assertable in
         * a test with no audio anywhere near it.
         */
        this.cues = new arcade_1.SfxCues();
        this.data = data;
        this.renderCallback = onRender;
        this.sheet = sheet;
    }
    /**
     * Levels 1-16: the transcribed arcade originals (`levels/`, see the
     * provenance note there). Level 17 onward: the door's own procedural
     * generator, unchanged - there is no 17th original to transcribe, and
     * looping the 16 back around would make "level 17" secretly identical
     * to "level 1" with a higher number, which reads as a bug more than a
     * feature. The real arcade does loop; we don't, and this is why.
     */
    initLevel() {
        const config = (0, constants_1.getLevelConfig)(this.data.level);
        const original = (0, levels_1.loadOriginalLevel)(this.data.level);
        if (original) {
            this.data.grid = original.grid;
        }
        else {
            this.data.grid = this.buildWalledGrid();
            this.scatterIceBlocks(config.iceBlocks);
            this.scatterDiamonds(3);
        }
        this.placePengo();
        // Spawn enemies
        this.data.enemies = [];
        for (let i = 0; i < config.enemies; i++) {
            this.spawnEnemy();
        }
        // Spawn eggs: at the level's own authored spots when there are any,
        // procedurally scattered otherwise. Either way they become the same
        // free-floating Egg entities this door has always used - only WHERE
        // they start changes; the hatch model itself is untouched (see
        // Stage 3's ruling to leave eggs alone for now).
        this.data.eggs = [];
        if (original) {
            for (const spot of original.eggSpawns) {
                this.data.eggs.push({
                    x: spot.x, y: spot.y, hatchTimer: constants_1.HATCH_TIME + Math.random() * 100,
                });
            }
        }
        else {
            for (let i = 0; i < config.eggs; i++) {
                this.scatterEgg();
            }
        }
        this.data.timeRemaining = config.timeLimit;
        this.data.diamondsAligned = false;
        this.render();
    }
    /** A blank grid: every cell empty except the wall border. */
    buildWalledGrid() {
        const grid = [];
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            grid[y] = [];
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                grid[y][x] = (x === 0 || x === constants_1.GRID_WIDTH - 1 || y === 0 || y === constants_1.GRID_HEIGHT - 1)
                    ? 'wall' : 'empty';
            }
        }
        return grid;
    }
    scatterIceBlocks(count) {
        let placed = 0;
        while (placed < count) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'empty') {
                this.data.grid[y][x] = 'ice';
                placed++;
            }
        }
    }
    scatterDiamonds(count) {
        let placed = 0;
        while (placed < count) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'ice') {
                this.data.grid[y][x] = 'diamond';
                placed++;
            }
        }
    }
    placePengo() {
        while (true) {
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
                return;
            }
        }
    }
    scatterEgg() {
        while (true) {
            const x = 1 + Math.floor(Math.random() * (constants_1.GRID_WIDTH - 2));
            const y = 1 + Math.floor(Math.random() * (constants_1.GRID_HEIGHT - 2));
            if (this.data.grid[y][x] === 'empty' &&
                Math.abs(x - this.data.pengo.x) > 3 &&
                Math.abs(y - this.data.pengo.y) > 3) {
                this.data.eggs.push({ x, y, hatchTimer: constants_1.HATCH_TIME + Math.random() * 100 });
                return;
            }
        }
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
                    crushTimer: 0,
                    hatchTimer: 0,
                    moveTimer: 0,
                });
                placed = true;
            }
        }
    }
    /** Adds to the score, capped at the arcade's five-digit display (ref1). */
    addScore(amount) {
        this.data.score = Math.min(constants_1.MAX_SCORE, this.data.score + amount);
    }
    livingEnemyCount() {
        return this.data.enemies.filter(e => e.state !== 'dead').length;
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
        if (cell === 'diamond' && this.data.diamondsAligned) {
            // Locked in place once the alignment bonus has been scored (ref2
            // locks them too) - pushing it further would let the score-once
            // guard in checkDiamondAlignment() be dodged by nudging a diamond
            // out of line and back, and there is no more bonus to earn anyway.
            this.cues.push('boop');
        }
        else if (cell === 'ice' || cell === 'diamond') {
            this.pushBlock(targetX, targetY, dx, dy);
        }
        else if (cell === 'wall') {
            this.shakeWall(dir);
        }
    }
    /**
     * Is a block in flight standing in this cell?
     *
     * A pushed block leaves the grid for the duration of its slide (see
     * pushBlock) and lives in `slidingBlocks` until it settles, so the grid
     * alone reports its cells as empty floor. Every walkability question has
     * to ask this too, or the block is a hole in the world: Pengo walks a
     * cell per 90ms against the block's one per SLIDE_TICKS_PER_CELL, so
     * holding the direction key used to walk him through the block he had
     * just pushed and into whatever stood behind it - reported in play,
     * "the penguin flies with the block and dies on the enemy". Sno-Bees
     * read the same grid and could step into one instead of being squashed.
     */
    slidingBlockAt(x, y) {
        return this.data.slidingBlocks.some(b => b.x === x && b.y === y);
    }
    /**
     * Can an actor step into this cell? The one answer to that question -
     * the grid says what terrain is there, `slidingBlocks` says what is in
     * the air above it, and neither alone is the truth.
     */
    canEnter(x, y) {
        return this.data.grid[y]?.[x] === 'empty' && !this.slidingBlockAt(x, y);
    }
    tryMove(direction) {
        const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
        const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
        const newX = this.data.pengo.x + dx;
        const newY = this.data.pengo.y + dy;
        if (this.canEnter(newX, newY)) {
            this.data.pengo.x = newX;
            this.data.pengo.y = newY;
        }
    }
    /**
     * Start a block sliding. The push RESOLVES over the next few ticks.
     *
     * This used to run the whole slide in one synchronous loop, so a block
     * left its cell and arrived at the far wall inside a single frame - the
     * player never saw it travel, which read as the block disappearing.
     * Diagnosed exactly in play: "they move too fast making it a 1 frame
     * animation". The block is now an entity in flight; `advanceSlidingBlocks`
     * moves it a cell at a time and decides where it stops.
     */
    pushBlock(x, y, dx, dy) {
        // The block leaves Pengo's flippers whatever it goes on to hit.
        this.cues.push('dash');
        this.data.pengo.isPushing = true;
        this.data.pengo.pushFrame = 0;
        this.addScore(constants_1.SCORES.pushBlock);
        const cellType = this.data.grid[y][x];
        const nextX = x + dx;
        const nextY = y + dy;
        const nextCell = this.data.grid[nextY]?.[nextX];
        const enemyThere = this.data.enemies.some(e => e.x === nextX && e.y === nextY && e.state !== 'dead' && e.state !== 'crushed');
        // Nowhere to go: the block breaks where it stands. Ref2's rule, and the
        // "destroy a boxed-in block" move the player had no way to make before.
        if (nextCell !== 'empty' && !enemyThere) {
            this.data.grid[y][x] = 'empty';
            this.cues.push('switch');
            this.data.lastSlide = { x, y, tick: this.data.frameCount };
            this.checkDiamondAlignment();
            return;
        }
        // Off the grid and into the air: it belongs to the slide list now, and
        // comes back to the grid when it stops.
        this.data.grid[y][x] = 'empty';
        this.data.slidingBlocks.push({
            x, y, type: cellType, dx, dy,
            timer: constants_1.SLIDE_TICKS_PER_CELL, crushed: 0,
        });
    }
    /**
     * Move every block in flight, and settle the ones that have arrived.
     *
     * A block travels one cell per SLIDE_TICKS_PER_CELL. It squashes any
     * Sno-Bee it reaches and carries on only while the next cell holds
     * another one, so a push resolves where it did its damage rather than
     * running on to the far wall.
     */
    advanceSlidingBlocks() {
        if (this.data.slidingBlocks.length === 0)
            return;
        const stillMoving = [];
        for (const block of this.data.slidingBlocks) {
            block.timer--;
            if (block.timer > 0) {
                stillMoving.push(block);
                continue;
            }
            block.timer = constants_1.SLIDE_TICKS_PER_CELL;
            const nextX = block.x + block.dx;
            const nextY = block.y + block.dy;
            const nextCell = this.data.grid[nextY]?.[nextX];
            const enemyHit = this.data.enemies.find(e => e.x === nextX && e.y === nextY && e.state !== 'dead' && e.state !== 'crushed');
            if (enemyHit) {
                enemyHit.state = 'crushed';
                enemyHit.crushTimer = constants_1.CRUSH_FRAMES;
                block.crushed++;
                block.x = nextX;
                block.y = nextY;
                // Carry on only into another Sno-Bee; otherwise this is where the
                // push resolves and the block rests on what it squashed.
                const beyond = this.data.enemies.some(e => e.x === nextX + block.dx && e.y === nextY + block.dy &&
                    e.state !== 'dead' && e.state !== 'crushed');
                if (beyond) {
                    stillMoving.push(block);
                    continue;
                }
                this.settleBlock(block);
                continue;
            }
            if (nextCell === 'empty') {
                block.x = nextX;
                block.y = nextY;
                stillMoving.push(block);
                continue;
            }
            // A wall, another block, or the edge of the grid.
            this.settleBlock(block);
        }
        this.data.slidingBlocks = stillMoving;
    }
    /** A block stops: back into the grid, and pay out what it caught. */
    settleBlock(block) {
        this.data.grid[block.y][block.x] = block.type;
        if (block.crushed > 0) {
            // One combo per push, keyed to how many that push caught - not per
            // enemy, or four one-kill pushes would be worth as much as a
            // four-kill one and the combo would mean nothing.
            this.addScore((0, constants_1.crushComboScore)(block.crushed));
            this.cues.push('explosion');
        }
        this.data.lastSlide = { x: block.x, y: block.y, tick: this.data.frameCount };
        this.checkDiamondAlignment();
    }
    shakeWall(direction) {
        // A shake that catches nobody is a dull thud; one that stuns is a hit.
        // The player has to be able to tell those apart to learn the timing.
        let stunned = false;
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
                this.addScore(constants_1.SCORES.stunEnemy);
                stunned = true;
            }
        }
        this.cues.push(stunned ? 'hit' : 'boop');
        this.data.wallShake = { tick: this.data.frameCount };
    }
    /**
     * The alignment bonus, scored exactly once. It used to re-check (and
     * re-add) on every later push that still happened to find 2+ diamonds
     * in a line - even a push unrelated to the diamonds - because only the
     * SOUND was deduped via `diamondsAligned`, never the score. Diamonds
     * are also locked from further pushing once this fires (see
     * handlePush()), so there is no way back into this function with the
     * flag still false after the first real alignment.
     */
    checkDiamondAlignment() {
        if (this.data.diamondsAligned)
            return;
        // Check horizontal alignment
        for (let y = 1; y < constants_1.GRID_HEIGHT - 1; y++) {
            let count = 0;
            for (let x = 1; x < constants_1.GRID_WIDTH - 1; x++) {
                if (this.data.grid[y][x] === 'diamond')
                    count++;
            }
            if (count >= 2) {
                this.addScore(count === 2 ? constants_1.SCORES.diamondAlign2 : constants_1.SCORES.diamondAlign3);
                this.cues.push('powerup');
                this.data.diamondsAligned = true;
                return;
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
                this.addScore(count === 2 ? constants_1.SCORES.diamondAlign2 : constants_1.SCORES.diamondAlign3);
                this.cues.push('powerup');
                this.data.diamondsAligned = true;
                return;
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
        this.advanceSlidingBlocks();
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
            this.cues.push('level-up');
            this.addScore(constants_1.SCORES.clearLevel);
            this.addScore(this.data.timeRemaining * constants_1.SCORES.timeBonus);
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
            // Squashed: hold still, play the animation out, then be gone. The
            // enemy has to survive a few ticks in a visible state or the crush -
            // the whole point of the game - happens invisibly.
            if (enemy.state === 'crushed') {
                enemy.crushTimer--;
                if (enemy.crushTimer <= 0) {
                    enemy.state = 'dead';
                }
                continue;
            }
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
            // AI: head for a random point near Pengo, not Pengo's own cell -
            // ref1's model. A deterministic chase toward the player's exact
            // position was reported as meaningfully harder than either
            // reference clone, and than the arcade itself. Re-picked once the
            // enemy has reached its current target (or never had one).
            enemy.targetAge = (enemy.targetAge ?? 0) + 1;
            if (enemy.targetX === undefined || enemy.targetY === undefined ||
                (enemy.x === enemy.targetX && enemy.y === enemy.targetY) ||
                enemy.targetAge >= constants_1.AI_RETARGET_MOVES) {
                enemy.targetAge = 0;
                const target = (0, ai_1.gaussianTargetNear)(this.data.pengo, constants_1.AI_TARGET_SIGMA, { minX: 1, maxX: constants_1.GRID_WIDTH - 2, minY: 1, maxY: constants_1.GRID_HEIGHT - 2 });
                enemy.targetX = target.x;
                enemy.targetY = target.y;
            }
            const dx = enemy.targetX - enemy.x;
            const dy = enemy.targetY - enemy.y;
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
            const blockedCell = this.data.grid[newY]?.[newX];
            if (this.canEnter(newX, newY)) {
                enemy.x = newX;
                enemy.y = newY;
                enemy.direction = moveDir;
            }
            else if (blockedCell === 'ice' && Math.random() < constants_1.ENEMY_BREAK_BLOCK_CHANCE) {
                // Both references agree enemies break blocks in their path; ref2's
                // coinflip (rather than always breaking, ref1's model) so a
                // corridor of ice still slows a Sno-Bee down rather than being
                // free to walk through. The tick is spent breaking it, not
                // moving - the block wasn't there a moment ago either way.
                this.data.grid[newY][newX] = 'empty';
            }
            else {
                // Can't move towards the target, try a random direction (the
                // existing fallback - unchanged; only WHERE the enemy is headed
                // is a Gaussian pick now, not this recovery path).
                const dirs = ['up', 'down', 'left', 'right'];
                for (const dir of dirs.sort(() => Math.random() - 0.5)) {
                    const rdx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
                    const rdy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
                    const rx = enemy.x + rdx;
                    const ry = enemy.y + rdy;
                    if (this.canEnter(rx, ry)) {
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
            if (egg.hatchTimer > 0)
                egg.hatchTimer--;
            if (egg.hatchTimer <= 0) {
                // Population cap: ours was the only one of the three references
                // with no limit at all - eggs hatched on top of the initial
                // spawn with nothing to stop it. A ready egg now just waits
                // (staying in the "about to hatch" warning state) until a
                // Sno-Bee has died and made room.
                if (this.livingEnemyCount() >= constants_1.MAX_LIVING_ENEMIES)
                    continue;
                this.cues.push('blip');
                this.data.enemies.push({
                    id: this.data.enemyIdCounter++,
                    x: egg.x,
                    y: egg.y,
                    direction: 'up',
                    state: 'walking',
                    stunTimer: 0,
                    crushTimer: 0,
                    hatchTimer: 0,
                    moveTimer: 0,
                });
                this.data.eggs.splice(i, 1);
            }
        }
    }
    checkCollisions() {
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead' || enemy.state === 'crushed')
                continue;
            if (enemy.x !== this.data.pengo.x || enemy.y !== this.data.pengo.y)
                continue;
            if (enemy.state === 'stunned') {
                // Both reference clones agree: walking into an already-stunned
                // Sno-Bee is a kill, not a pass-through. Smaller than a crush -
                // that stays the bigger prize for actually setting up a push.
                enemy.state = 'crushed';
                enemy.crushTimer = constants_1.CRUSH_FRAMES;
                this.addScore(constants_1.SCORES.touchKillStunned);
                this.cues.push('zap');
                continue;
            }
            this.killPengo();
            return;
        }
    }
    killPengo() {
        if (this.data.pengo.isDead)
            return;
        this.cues.push('death');
        this.data.pengo.isDead = true;
        this.data.pengo.deathFrame = 0;
        this.data.lives--;
    }
    respawnPengo() {
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            this.cues.push('gameover');
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
        const board = (0, render_1.buildBoard)(this.data, this.sheet, this.data.frameCount);
        this.renderCallback((0, cell_art_1.bufferToTags)(board).join('\n'));
    }
}
exports.PengoGame = PengoGame;
//# sourceMappingURL=pengo-game.js.map