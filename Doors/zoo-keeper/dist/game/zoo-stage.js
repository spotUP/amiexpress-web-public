/**
 * Zoo Keeper - Zoo Stage Game Logic
 * The main gameplay where Zeke runs around the perimeter building walls
 */
import { GAME_AREA, ZOO_PERIMETER, ANIMAL_STATS, BONUS_ITEMS, JUMP_SCORES, NET_DURATION_TICKS, WALL_CHARS, WALL_COLORS, COLORS, getLevelConfig, EXTRA_LIFE_SCORE } from './constants';
/**
 * Main game engine class
 */
export class ZooKeeperGame {
    constructor(data, renderCallback) {
        this.moveTimer = 0;
        this.animalMoveTimer = 0;
        this.lastExtraLifeScore = 0;
        this.data = data;
        this.renderCallback = renderCallback;
    }
    /**
     * Initialize a new zoo stage
     */
    initZooStage() {
        const config = getLevelConfig(this.data.level);
        const d = this.data;
        const zoo = d.zooStage;
        // Reset Zeke to starting position (top-left of perimeter)
        d.zeke = {
            x: ZOO_PERIMETER.outerLeft + 2,
            y: ZOO_PERIMETER.outerTop,
            direction: 'right',
            hasNet: false,
            netTimer: 0,
            isJumping: false,
            jumpFrame: 0,
            isDead: false,
            deathFrame: 0
        };
        // Initialize wall grid
        zoo.wall = this.createInitialWall(config.wallStartingThickness);
        // Spawn animals
        zoo.animals = [];
        zoo.animalIdCounter = 0;
        for (let i = 0; i < config.animalCount; i++) {
            const type = config.animalTypes[i % config.animalTypes.length];
            zoo.animals.push(this.spawnAnimal(type));
        }
        // Create bonus items along the fuse
        zoo.bonusItems = this.createBonusItems(config.bonusItemCount);
        // Reset timer
        zoo.timer = config.timerDuration;
        zoo.fusePosition = 0;
        this.render();
    }
    /**
     * Create initial wall with given starting thickness
     */
    createInitialWall(thickness) {
        const wall = [];
        const width = ZOO_PERIMETER.outerRight - ZOO_PERIMETER.outerLeft + 1;
        const height = ZOO_PERIMETER.outerBottom - ZOO_PERIMETER.outerTop + 1;
        for (let y = 0; y < height; y++) {
            wall[y] = [];
            for (let x = 0; x < width; x++) {
                // Only create wall segments on the perimeter path
                const isTopEdge = y === 0;
                const isBottomEdge = y === height - 1;
                const isLeftEdge = x === 0;
                const isRightEdge = x === width - 1;
                const isPerimeter = isTopEdge || isBottomEdge || isLeftEdge || isRightEdge;
                wall[y][x] = {
                    thickness: isPerimeter ? thickness : 0
                };
            }
        }
        return wall;
    }
    /**
     * Spawn a new animal inside the zoo
     */
    spawnAnimal(type) {
        const zoo = this.data.zooStage;
        const innerWidth = ZOO_PERIMETER.innerRight - ZOO_PERIMETER.innerLeft;
        const innerHeight = ZOO_PERIMETER.innerBottom - ZOO_PERIMETER.innerTop;
        return {
            id: ++zoo.animalIdCounter,
            type,
            x: ZOO_PERIMETER.innerLeft + 2 + Math.floor(Math.random() * (innerWidth - 4)),
            y: ZOO_PERIMETER.innerTop + 1 + Math.floor(Math.random() * (innerHeight - 2)),
            dx: Math.random() > 0.5 ? 1 : -1,
            dy: Math.random() > 0.5 ? 1 : -1,
            escaped: false,
            targetWallX: 0,
            targetWallY: 0,
            attackTimer: 0
        };
    }
    /**
     * Create bonus items for the timer fuse
     */
    createBonusItems(count) {
        const items = [];
        const itemTypes = ['rootbeer', 'clover', 'watermelon', 'sundae', 'strawberry', 'trophy', 'money'];
        // Always include one net
        items.push({
            type: 'net',
            x: 0,
            y: 0,
            collected: false,
            fusePosition: 0.5 + Math.random() * 0.3 // Net appears later in fuse
        });
        // Add random bonus items
        for (let i = 0; i < count - 1; i++) {
            const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            items.push({
                type,
                x: 0,
                y: 0,
                collected: false,
                fusePosition: (i + 1) / (count + 1) // Spread evenly
            });
        }
        // Sort by fuse position
        items.sort((a, b) => a.fusePosition - b.fusePosition);
        return items;
    }
    /**
     * Main update loop
     */
    update() {
        const now = Date.now();
        const d = this.data;
        if (d.state !== 'playing')
            return;
        // Update timer
        d.zooStage.fusePosition += 1 / (d.zooStage.timer * 30); // 30 FPS
        if (d.zooStage.fusePosition >= 1) {
            // Time up! Level complete if no escaped animals
            const escapedAnimals = d.zooStage.animals.filter(a => a.escaped);
            if (escapedAnimals.length === 0) {
                this.levelComplete();
                return;
            }
            else {
                // Lose a life if animals escaped
                this.loseLife();
                return;
            }
        }
        // Update Zeke movement
        if (d.zeke.isJumping) {
            this.updateJump();
        }
        // Update net timer
        if (d.zeke.hasNet) {
            d.zeke.netTimer--;
            if (d.zeke.netTimer <= 0) {
                d.zeke.hasNet = false;
            }
        }
        // Update animals
        this.animalMoveTimer++;
        if (this.animalMoveTimer >= 5) { // Animals move every 5 frames
            this.updateAnimals();
            this.animalMoveTimer = 0;
        }
        // Check collisions
        this.checkCollisions();
        // Check bonus item collection
        this.checkBonusItems();
        // Check for extra life
        this.checkExtraLife();
        // Render
        this.render();
    }
    /**
     * Handle direction input
     */
    handleDirection(dir) {
        const d = this.data;
        if (d.zeke.isJumping || d.zeke.isDead)
            return;
        // Zeke can only move along the perimeter
        // Check if direction is valid from current position
        const newDir = this.getValidDirection(dir);
        if (newDir) {
            d.zeke.direction = newDir;
            this.moveZeke();
        }
    }
    /**
     * Get valid direction for perimeter movement
     */
    getValidDirection(desired) {
        const { x, y } = this.data.zeke;
        const p = ZOO_PERIMETER;
        // Determine which edge we're on
        const onTop = y === p.outerTop;
        const onBottom = y === p.outerBottom;
        const onLeft = x === p.outerLeft;
        const onRight = x === p.outerRight;
        // At corners, allow turning
        if (onTop && onLeft) {
            if (desired === 'right' || desired === 'down')
                return desired;
        }
        else if (onTop && onRight) {
            if (desired === 'left' || desired === 'down')
                return desired;
        }
        else if (onBottom && onLeft) {
            if (desired === 'right' || desired === 'up')
                return desired;
        }
        else if (onBottom && onRight) {
            if (desired === 'left' || desired === 'up')
                return desired;
        }
        else if (onTop) {
            if (desired === 'left' || desired === 'right')
                return desired;
        }
        else if (onBottom) {
            if (desired === 'left' || desired === 'right')
                return desired;
        }
        else if (onLeft) {
            if (desired === 'up' || desired === 'down')
                return desired;
        }
        else if (onRight) {
            if (desired === 'up' || desired === 'down')
                return desired;
        }
        return null;
    }
    /**
     * Move Zeke in current direction
     */
    moveZeke() {
        const d = this.data;
        const p = ZOO_PERIMETER;
        let { x, y } = d.zeke;
        // Move in current direction
        switch (d.zeke.direction) {
            case 'up':
                y--;
                break;
            case 'down':
                y++;
                break;
            case 'left':
                x--;
                break;
            case 'right':
                x++;
                break;
        }
        // Clamp to perimeter
        x = Math.max(p.outerLeft, Math.min(p.outerRight, x));
        y = Math.max(p.outerTop, Math.min(p.outerBottom, y));
        // Auto-corner at edges
        if (x === p.outerLeft && d.zeke.direction === 'left') {
            if (y === p.outerTop)
                d.zeke.direction = 'down';
            else if (y === p.outerBottom)
                d.zeke.direction = 'up';
        }
        else if (x === p.outerRight && d.zeke.direction === 'right') {
            if (y === p.outerTop)
                d.zeke.direction = 'down';
            else if (y === p.outerBottom)
                d.zeke.direction = 'up';
        }
        else if (y === p.outerTop && d.zeke.direction === 'up') {
            if (x === p.outerLeft)
                d.zeke.direction = 'right';
            else if (x === p.outerRight)
                d.zeke.direction = 'left';
        }
        else if (y === p.outerBottom && d.zeke.direction === 'down') {
            if (x === p.outerLeft)
                d.zeke.direction = 'right';
            else if (x === p.outerRight)
                d.zeke.direction = 'left';
        }
        d.zeke.x = x;
        d.zeke.y = y;
        // Build wall under Zeke
        this.buildWallAt(x, y);
    }
    /**
     * Build wall at Zeke's position
     */
    buildWallAt(x, y) {
        const wall = this.data.zooStage.wall;
        const wallX = x - ZOO_PERIMETER.outerLeft;
        const wallY = y - ZOO_PERIMETER.outerTop;
        if (wall[wallY] && wall[wallY][wallX]) {
            wall[wallY][wallX].thickness = 3; // Max thickness
        }
    }
    /**
     * Handle jump
     */
    handleJump() {
        const d = this.data;
        if (d.zeke.isJumping || d.zeke.isDead)
            return;
        d.zeke.isJumping = true;
        d.zeke.jumpFrame = 0;
    }
    /**
     * Update jump animation
     */
    updateJump() {
        const d = this.data;
        d.zeke.jumpFrame++;
        // Jump lasts 10 frames
        if (d.zeke.jumpFrame >= 10) {
            d.zeke.isJumping = false;
            d.zeke.jumpFrame = 0;
            // Move forward during jump
            this.moveZeke();
        }
    }
    /**
     * Update all animals
     */
    updateAnimals() {
        const d = this.data;
        const config = getLevelConfig(d.level);
        for (const animal of d.zooStage.animals) {
            if (animal.escaped) {
                this.updateEscapedAnimal(animal);
            }
            else {
                this.updateCagedAnimal(animal, config.animalSpeedMultiplier);
            }
        }
    }
    /**
     * Update animal inside the zoo
     */
    updateCagedAnimal(animal, speedMult) {
        const stats = ANIMAL_STATS[animal.type];
        const p = ZOO_PERIMETER;
        // Move randomly inside cage area
        animal.x += animal.dx;
        animal.y += animal.dy;
        // Bounce off inner walls
        if (animal.x <= p.innerLeft || animal.x >= p.innerRight) {
            animal.dx = -animal.dx;
            animal.x = Math.max(p.innerLeft + 1, Math.min(p.innerRight - 1, animal.x));
        }
        if (animal.y <= p.innerTop || animal.y >= p.innerBottom) {
            animal.dy = -animal.dy;
            animal.y = Math.max(p.innerTop + 1, Math.min(p.innerBottom - 1, animal.y));
        }
        // Occasionally attack wall
        animal.attackTimer++;
        if (animal.attackTimer > 30) {
            animal.attackTimer = 0;
            if (Math.random() < 0.3) {
                this.animalAttackWall(animal);
            }
        }
    }
    /**
     * Animal attacks nearest wall
     */
    animalAttackWall(animal) {
        const stats = ANIMAL_STATS[animal.type];
        const wall = this.data.zooStage.wall;
        const p = ZOO_PERIMETER;
        // Find nearest wall segment
        let minDist = Infinity;
        let targetX = 0;
        let targetY = 0;
        // Check all perimeter positions
        for (let y = 0; y < wall.length; y++) {
            for (let x = 0; x < wall[y].length; x++) {
                if (wall[y][x].thickness > 0) {
                    const worldX = x + p.outerLeft;
                    const worldY = y + p.outerTop;
                    const dist = Math.abs(animal.x - worldX) + Math.abs(animal.y - worldY);
                    if (dist < minDist) {
                        minDist = dist;
                        targetX = x;
                        targetY = y;
                    }
                }
            }
        }
        // Damage wall
        if (wall[targetY] && wall[targetY][targetX]) {
            wall[targetY][targetX].thickness -= stats.strength;
            if (wall[targetY][targetX].thickness <= 0) {
                wall[targetY][targetX].thickness = 0;
                // Check if animal can escape through this gap
                this.checkAnimalEscape(animal, targetX + p.outerLeft, targetY + p.outerTop);
            }
        }
    }
    /**
     * Check if animal escapes through gap
     */
    checkAnimalEscape(animal, gapX, gapY) {
        // If gap is near animal, it escapes
        const dist = Math.abs(animal.x - gapX) + Math.abs(animal.y - gapY);
        if (dist < 5) {
            animal.escaped = true;
            animal.x = gapX;
            animal.y = gapY;
        }
    }
    /**
     * Update escaped animal (chases Zeke)
     */
    updateEscapedAnimal(animal) {
        const d = this.data;
        const stats = ANIMAL_STATS[animal.type];
        const speed = Math.ceil(stats.speed / 3);
        // Move away from center, toward perimeter
        const p = ZOO_PERIMETER;
        const centerX = (p.outerLeft + p.outerRight) / 2;
        const centerY = (p.outerTop + p.outerBottom) / 2;
        // Move toward Zeke but along perimeter
        if (Math.abs(animal.x - d.zeke.x) > Math.abs(animal.y - d.zeke.y)) {
            animal.x += animal.x < d.zeke.x ? speed : -speed;
        }
        else {
            animal.y += animal.y < d.zeke.y ? speed : -speed;
        }
        // Keep on perimeter
        animal.x = Math.max(p.outerLeft, Math.min(p.outerRight, animal.x));
        animal.y = Math.max(p.outerTop, Math.min(p.outerBottom, animal.y));
    }
    /**
     * Check collisions between Zeke and animals
     */
    checkCollisions() {
        const d = this.data;
        for (const animal of d.zooStage.animals) {
            if (!animal.escaped)
                continue;
            const dist = Math.abs(animal.x - d.zeke.x) + Math.abs(animal.y - d.zeke.y);
            if (d.zeke.isJumping && dist <= 2) {
                // Jumped over animal - score points
                const jumpedCount = d.zooStage.animals.filter(a => a.escaped &&
                    Math.abs(a.x - d.zeke.x) + Math.abs(a.y - d.zeke.y) <= 2).length;
                d.score += JUMP_SCORES[Math.min(jumpedCount, 11)] || 0;
            }
            else if (dist <= 1) {
                if (d.zeke.hasNet) {
                    // Capture animal with net
                    this.captureAnimal(animal);
                }
                else {
                    // Zeke is caught!
                    this.loseLife();
                    return;
                }
            }
        }
    }
    /**
     * Capture escaped animal with net
     */
    captureAnimal(animal) {
        const d = this.data;
        const stats = ANIMAL_STATS[animal.type];
        d.score += stats.capturePoints;
        // Remove animal from list
        const index = d.zooStage.animals.indexOf(animal);
        if (index >= 0) {
            d.zooStage.animals.splice(index, 1);
        }
    }
    /**
     * Check bonus item collection
     */
    checkBonusItems() {
        const d = this.data;
        const fusePos = d.zooStage.fusePosition;
        for (const item of d.zooStage.bonusItems) {
            if (item.collected)
                continue;
            // Item becomes available when fuse reaches it
            if (fusePos >= item.fusePosition) {
                // Calculate item position on fuse line
                const fuseWidth = 40;
                item.x = 20 + Math.floor(item.fusePosition * fuseWidth);
                item.y = GAME_AREA.bottom - 1;
                // Check if Zeke is near (would need to be at bottom of perimeter)
                const dist = Math.abs(item.x - d.zeke.x) + Math.abs(item.y - d.zeke.y);
                if (dist <= 2) {
                    item.collected = true;
                    const bonus = BONUS_ITEMS[item.type];
                    d.score += bonus.points;
                    if (bonus.isNet) {
                        d.zeke.hasNet = true;
                        d.zeke.netTimer = NET_DURATION_TICKS;
                    }
                }
            }
        }
    }
    /**
     * Check for extra life
     */
    checkExtraLife() {
        const d = this.data;
        const threshold = Math.floor(d.score / EXTRA_LIFE_SCORE);
        const lastThreshold = Math.floor(this.lastExtraLifeScore / EXTRA_LIFE_SCORE);
        if (threshold > lastThreshold) {
            d.lives++;
            this.lastExtraLifeScore = d.score;
        }
    }
    /**
     * Level complete
     */
    levelComplete() {
        const d = this.data;
        // Bonus for remaining time
        const timeBonus = Math.floor((1 - d.zooStage.fusePosition) * 1000);
        d.score += timeBonus;
        // Next round/level
        d.round++;
        if (d.round > 4) {
            d.round = 1;
            d.level++;
        }
        // Transition based on round
        if (d.round === 2) {
            d.state = 'stageTransition';
            d.transitionMessage = 'PLATFORM STAGE';
            d.transitionTimer = 60;
            // Platform stage would init here
        }
        else if (d.round === 4) {
            d.state = 'stageTransition';
            d.transitionMessage = 'STAMPEDE STAGE';
            d.transitionTimer = 60;
            // Stampede stage would init here
        }
        else {
            // Continue with zoo stage
            this.initZooStage();
        }
        this.render();
    }
    /**
     * Lose a life
     */
    loseLife() {
        const d = this.data;
        d.lives--;
        if (d.lives <= 0) {
            d.state = 'gameover';
            this.showGameOver();
        }
        else {
            // Reset stage
            this.initZooStage();
        }
    }
    /**
     * Show game over screen
     */
    showGameOver() {
        const content = this.renderGameOver();
        this.renderCallback(content);
    }
    /**
     * Main render function
     */
    render() {
        const d = this.data;
        let content = '';
        switch (d.state) {
            case 'playing':
                content = this.renderZooStage();
                break;
            case 'gameover':
                content = this.renderGameOver();
                break;
            case 'stageTransition':
                content = this.renderTransition();
                break;
            default:
                content = this.renderZooStage();
        }
        this.renderCallback(content);
    }
    /**
     * Render zoo stage
     */
    renderZooStage() {
        const d = this.data;
        const lines = [];
        const p = ZOO_PERIMETER;
        const wall = d.zooStage.wall;
        // Create render buffer
        const buffer = [];
        for (let y = 0; y < GAME_AREA.height; y++) {
            buffer[y] = [];
            for (let x = 0; x < GAME_AREA.width; x++) {
                buffer[y][x] = ' ';
            }
        }
        // Draw wall/perimeter
        for (let wy = 0; wy < wall.length; wy++) {
            for (let wx = 0; wx < wall[wy].length; wx++) {
                const thickness = wall[wy][wx].thickness;
                const char = WALL_CHARS[thickness];
                const screenX = wx + p.outerLeft;
                const screenY = wy + p.outerTop - GAME_AREA.top;
                if (screenY >= 0 && screenY < buffer.length && screenX >= 0 && screenX < GAME_AREA.width) {
                    buffer[screenY][screenX] = char;
                }
            }
        }
        // Draw inner cage border
        for (let x = p.innerLeft; x <= p.innerRight; x++) {
            const topY = p.innerTop - GAME_AREA.top;
            const bottomY = p.innerBottom - GAME_AREA.top;
            if (topY >= 0 && topY < buffer.length)
                buffer[topY][x] = '-';
            if (bottomY >= 0 && bottomY < buffer.length)
                buffer[bottomY][x] = '-';
        }
        for (let y = p.innerTop; y <= p.innerBottom; y++) {
            const screenY = y - GAME_AREA.top;
            if (screenY >= 0 && screenY < buffer.length) {
                buffer[screenY][p.innerLeft] = '|';
                buffer[screenY][p.innerRight] = '|';
            }
        }
        // Draw corners
        const innerCorners = [
            { x: p.innerLeft, y: p.innerTop },
            { x: p.innerRight, y: p.innerTop },
            { x: p.innerLeft, y: p.innerBottom },
            { x: p.innerRight, y: p.innerBottom }
        ];
        for (const c of innerCorners) {
            const screenY = c.y - GAME_AREA.top;
            if (screenY >= 0 && screenY < buffer.length) {
                buffer[screenY][c.x] = '+';
            }
        }
        // Draw animals
        for (const animal of d.zooStage.animals) {
            const stats = ANIMAL_STATS[animal.type];
            const screenY = animal.y - GAME_AREA.top;
            if (screenY >= 0 && screenY < buffer.length && animal.x >= 0 && animal.x < GAME_AREA.width) {
                buffer[screenY][animal.x] = stats.char;
            }
        }
        // Draw Zeke
        const zekeY = d.zeke.y - GAME_AREA.top;
        if (zekeY >= 0 && zekeY < buffer.length) {
            buffer[zekeY][d.zeke.x] = d.zeke.hasNet ? '@' : '@';
        }
        // Draw fuse at bottom
        const fuseY = buffer.length - 1;
        const fuseStart = 10;
        const fuseEnd = 70;
        const fuseLength = fuseEnd - fuseStart;
        const burnPos = fuseStart + Math.floor(d.zooStage.fusePosition * fuseLength);
        for (let x = fuseStart; x < fuseEnd; x++) {
            if (x < burnPos) {
                buffer[fuseY][x] = ' '; // Burned
            }
            else if (x === burnPos) {
                buffer[fuseY][x] = '*'; // Burning end
            }
            else {
                buffer[fuseY][x] = '='; // Fuse
            }
        }
        // Draw bonus items on fuse
        for (const item of d.zooStage.bonusItems) {
            if (!item.collected) {
                const itemX = fuseStart + Math.floor(item.fusePosition * fuseLength);
                if (itemX > burnPos && itemX < fuseEnd) {
                    buffer[fuseY][itemX] = BONUS_ITEMS[item.type].char;
                }
            }
        }
        // Convert buffer to tagged string
        for (let y = 0; y < buffer.length; y++) {
            let line = '';
            for (let x = 0; x < buffer[y].length; x++) {
                const char = buffer[y][x];
                // Apply colors based on character
                if (char === '@') {
                    const color = d.zeke.hasNet ? COLORS.zekeWithNet : COLORS.zeke;
                    line += `{${color}-fg}${char}{/}`;
                }
                else if (char === '*') {
                    line += `{${COLORS.fuseEnd}-fg}${char}{/}`;
                }
                else if (char === '=') {
                    line += `{${COLORS.fuse}-fg}${char}{/}`;
                }
                else if (/[ESCRML]/.test(char)) {
                    // Animal
                    const animalType = Object.entries(ANIMAL_STATS).find(([, s]) => s.char === char);
                    if (animalType) {
                        line += `{${animalType[1].color}-fg}${char}{/}`;
                    }
                    else {
                        line += char;
                    }
                }
                else if (/[BCWSTY$N]/.test(char)) {
                    // Bonus item
                    const itemType = Object.entries(BONUS_ITEMS).find(([, b]) => b.char === char);
                    if (itemType) {
                        line += `{${itemType[1].color}-fg}${char}{/}`;
                    }
                    else {
                        line += char;
                    }
                }
                else if (/[.+#]/.test(char)) {
                    // Wall
                    const thickness = char === '.' ? 1 : char === '+' ? 2 : 3;
                    line += `{${WALL_COLORS[thickness]}-fg}${char}{/}`;
                }
                else {
                    line += char;
                }
            }
            lines.push(line);
        }
        return lines.join('\n');
    }
    /**
     * Render game over screen
     */
    renderGameOver() {
        const d = this.data;
        const lines = [
            '',
            '',
            '{red-fg}',
            '   ____    _    __  __ _____    _____  _     __ _____ ____  ',
            '  / ___|  / \\  |  \\/  | ____|  / _ \\ \\/ / __| ____|  _ \\ ',
            ' | |  _  / _ \\ | |\\/| |  _|   | | | \\  / / _| _|  | |_) |',
            ' | |_| |/ ___ \\| |  | | |___  | |_| /  \\ ___| |___|  _ < ',
            '  \\____/_/   \\_\\_|  |_|_____|  \\___/_/\\_\\____|_____|_| \\_\\',
            '{/}',
            '',
            `{yellow-fg}FINAL SCORE: ${d.score}{/}`,
            `{cyan-fg}LEVEL: ${d.level}{/}`,
            '',
            '{white-fg}Press ENTER to continue{/}'
        ];
        return lines.join('\n');
    }
    /**
     * Render stage transition
     */
    renderTransition() {
        const d = this.data;
        const lines = [
            '',
            '',
            '',
            '',
            `{yellow-fg}${d.transitionMessage}{/}`,
            '',
            '{white-fg}GET READY!{/}'
        ];
        return lines.join('\n');
    }
}
