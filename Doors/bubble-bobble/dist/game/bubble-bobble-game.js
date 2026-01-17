/**
 * Bubble Bobble - Game Engine
 * 1986 Taito arcade platformer
 */
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY, JUMP_POWER, PLAYER_SPEED, PLAYER_SPEED_SHOES, MAX_FALL_SPEED, BUBBLE_SHOOT_SPEED, BUBBLE_FLOAT_SPEED, BUBBLE_RANGE, BUBBLE_RANGE_CANDY, BUBBLE_SHOOT_TIME, BUBBLE_FLOAT_TIME, BUBBLE_POP_TIME, ENEMY_BUBBLE_TIME, ENEMY_ANGRY_TIME, HURRY_UP_TIME, INVINCIBLE_TIME, RESPAWN_TIME, ITEM_LIFETIME, COMBO_WINDOW, SCORES, SPRITES, ENEMY_COLORS, ITEM_COLORS, getLevelData, } from './constants';
export class BubbleBobbleGame {
    constructor(data, renderCallback, onGameOver, onLevelComplete) {
        this.data = data;
        this.renderCallback = renderCallback;
        this.onGameOver = onGameOver;
        this.onLevelComplete = onLevelComplete;
    }
    initLevel() {
        const levelData = getLevelData(this.data.level);
        // Reset player
        this.data.player = {
            x: 4,
            y: 17,
            vx: 0,
            vy: 0,
            direction: 'right',
            isJumping: false,
            isOnGround: true,
            isBubbling: false,
            bubbleFrame: 0,
            walkFrame: 0,
            invincibleTimer: INVINCIBLE_TIME,
            isAlive: true,
            respawnTimer: 0,
            hasShoes: false,
            hasCandy: false,
            rapidFire: false,
            bubbleRange: BUBBLE_RANGE,
        };
        // Setup platforms and walls
        this.data.platforms = [...levelData.platforms];
        this.data.walls = [...levelData.walls];
        // Spawn enemies
        this.data.enemies = [];
        this.data.enemyIdCounter = 0;
        for (const spawn of levelData.enemySpawns) {
            this.spawnEnemy(spawn.type, spawn.x, spawn.y);
        }
        // Clear bubbles and items
        this.data.bubbles = [];
        this.data.items = [];
        this.data.bubbleIdCounter = 0;
        this.data.itemIdCounter = 0;
        // Reset timers
        this.data.levelTimer = 0;
        this.data.hurryUpTimer = HURRY_UP_TIME;
        this.data.isHurryUp = false;
        this.data.comboCount = 0;
        this.data.lastPopTime = 0;
        this.render();
    }
    spawnEnemy(type, x, y) {
        this.data.enemies.push({
            id: this.data.enemyIdCounter++,
            type,
            x,
            y,
            vx: Math.random() > 0.5 ? 0.2 : -0.2,
            vy: 0,
            direction: Math.random() > 0.5 ? 'right' : 'left',
            state: 'normal',
            bubbleTimer: 0,
            angerTimer: 0,
            frame: 0,
            aiTimer: Math.floor(Math.random() * 30),
        });
    }
    update() {
        if (this.data.state !== 'playing')
            return;
        this.data.frameCount++;
        this.data.levelTimer++;
        // Hurry up timer
        if (!this.data.isHurryUp) {
            this.data.hurryUpTimer--;
            if (this.data.hurryUpTimer <= 0) {
                this.data.isHurryUp = true;
                this.makeEnemiesAngry();
            }
        }
        // Update player
        this.updatePlayer();
        // Update enemies
        this.updateEnemies();
        // Update bubbles
        this.updateBubbles();
        // Update items
        this.updateItems();
        // Check collisions
        this.checkCollisions();
        // Check level complete
        if (this.data.enemies.length === 0 && this.data.enemies.filter(e => e.state !== 'dead').length === 0) {
            this.data.state = 'levelComplete';
            this.onLevelComplete();
            return;
        }
        this.render();
    }
    updatePlayer() {
        const player = this.data.player;
        if (!player.isAlive) {
            if (player.respawnTimer > 0) {
                player.respawnTimer--;
                if (player.respawnTimer === 0) {
                    player.isAlive = true;
                    player.invincibleTimer = INVINCIBLE_TIME;
                    player.x = 4;
                    player.y = 17;
                    player.vx = 0;
                    player.vy = 0;
                }
            }
            return;
        }
        if (player.invincibleTimer > 0) {
            player.invincibleTimer--;
        }
        // Apply gravity
        player.vy += GRAVITY;
        if (player.vy > MAX_FALL_SPEED)
            player.vy = MAX_FALL_SPEED;
        // Update position
        player.x += player.vx;
        player.y += player.vy;
        // Platform collision
        player.isOnGround = false;
        this.handlePlatformCollision(player);
        // Screen wrapping (horizontal)
        if (player.x < 0)
            player.x = GAME_WIDTH - 1;
        if (player.x >= GAME_WIDTH)
            player.x = 0;
        // Ceiling and floor
        if (player.y < 0) {
            player.y = GAME_HEIGHT - 2;
        }
        if (player.y >= GAME_HEIGHT - 1) {
            player.y = GAME_HEIGHT - 2;
            player.vy = 0;
            player.isOnGround = true;
            player.isJumping = false;
        }
        // Friction
        player.vx *= 0.8;
        if (Math.abs(player.vx) < 0.01)
            player.vx = 0;
        // Update animation
        if (player.isBubbling) {
            player.bubbleFrame++;
            if (player.bubbleFrame > BUBBLE_SHOOT_TIME) {
                player.isBubbling = false;
                player.bubbleFrame = 0;
            }
        }
        if (Math.abs(player.vx) > 0.05) {
            player.walkFrame = (player.walkFrame + 1) % 4;
        }
    }
    handlePlatformCollision(entity) {
        for (const platform of this.data.platforms) {
            if (entity.x >= platform.x && entity.x < platform.x + platform.width) {
                // Landing on platform from above
                if (entity.y >= platform.y - 1 && entity.y < platform.y + 0.5 && entity.vy >= 0) {
                    entity.y = platform.y - 1;
                    entity.vy = 0;
                    if ('isOnGround' in entity) {
                        entity.isOnGround = true;
                    }
                }
            }
        }
        // Wall collision
        for (const wall of this.data.walls) {
            if (Math.abs(entity.x - wall.x) < 1 && Math.abs(entity.y - wall.y) < 1) {
                // Push back
                if (entity.x < wall.x)
                    entity.x = wall.x - 1;
                else
                    entity.x = wall.x + 1;
            }
        }
    }
    updateEnemies() {
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            if (enemy.state === 'bubbled') {
                // Float upward in bubble
                enemy.y += BUBBLE_FLOAT_SPEED * 0.5;
                enemy.bubbleTimer--;
                if (enemy.bubbleTimer <= 0) {
                    // Pop out of bubble
                    enemy.state = 'angry';
                    enemy.angerTimer = ENEMY_ANGRY_TIME;
                }
                // Wrap at top
                if (enemy.y < 0) {
                    enemy.y = GAME_HEIGHT - 2;
                }
                continue;
            }
            // AI behavior
            enemy.aiTimer--;
            if (enemy.aiTimer <= 0) {
                this.updateEnemyAI(enemy);
                enemy.aiTimer = 20 + Math.floor(Math.random() * 20);
            }
            // Movement
            const speed = enemy.state === 'angry' || this.data.isHurryUp ? 0.4 : 0.2;
            enemy.vx = enemy.direction === 'right' ? speed : -speed;
            // Apply gravity
            enemy.vy += GRAVITY;
            if (enemy.vy > MAX_FALL_SPEED)
                enemy.vy = MAX_FALL_SPEED;
            enemy.x += enemy.vx;
            enemy.y += enemy.vy;
            // Platform collision
            this.handlePlatformCollision(enemy);
            // Screen wrapping
            if (enemy.x < 0)
                enemy.x = GAME_WIDTH - 1;
            if (enemy.x >= GAME_WIDTH)
                enemy.x = 0;
            // Floor
            if (enemy.y >= GAME_HEIGHT - 1) {
                enemy.y = GAME_HEIGHT - 2;
                enemy.vy = 0;
            }
            // Random jump
            if (enemy.vy === 0 && Math.random() < 0.02) {
                enemy.vy = JUMP_POWER * 0.8;
            }
            // Animation
            enemy.frame = (enemy.frame + 1) % 4;
            // Anger timer
            if (enemy.state === 'angry' && !this.data.isHurryUp) {
                enemy.angerTimer--;
                if (enemy.angerTimer <= 0) {
                    enemy.state = 'normal';
                }
            }
        }
    }
    updateEnemyAI(enemy) {
        const player = this.data.player;
        // Simple AI: move toward player occasionally
        if (Math.random() < 0.5 && player.isAlive) {
            enemy.direction = player.x > enemy.x ? 'right' : 'left';
        }
        else {
            // Random direction change
            if (Math.random() < 0.3) {
                enemy.direction = enemy.direction === 'right' ? 'left' : 'right';
            }
        }
    }
    makeEnemiesAngry() {
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'normal') {
                enemy.state = 'angry';
            }
        }
    }
    updateBubbles() {
        for (const bubble of this.data.bubbles) {
            bubble.timer++;
            switch (bubble.state) {
                case 'shooting':
                    // Move in shoot direction
                    bubble.x += bubble.vx;
                    // Check if hit enemy
                    const hitEnemy = this.checkBubbleEnemyCollision(bubble);
                    if (hitEnemy) {
                        bubble.state = 'hasEnemy';
                        bubble.trappedEnemy = hitEnemy;
                        hitEnemy.state = 'bubbled';
                        hitEnemy.bubbleTimer = ENEMY_BUBBLE_TIME;
                        hitEnemy.x = bubble.x;
                        hitEnemy.y = bubble.y;
                        bubble.vx = 0;
                    }
                    // Transition to floating
                    if (bubble.timer > this.data.player.bubbleRange) {
                        bubble.state = 'floating';
                        bubble.vx = 0;
                    }
                    break;
                case 'floating':
                case 'hasEnemy':
                    // Float upward
                    bubble.y += BUBBLE_FLOAT_SPEED;
                    bubble.x += (Math.random() - 0.5) * 0.1; // Wobble
                    // Wrap at top
                    if (bubble.y < 0) {
                        bubble.y = GAME_HEIGHT - 2;
                    }
                    // Pop after time
                    if (bubble.timer > BUBBLE_FLOAT_TIME) {
                        bubble.state = 'popping';
                        bubble.timer = 0;
                        // Release enemy if trapped
                        if (bubble.trappedEnemy) {
                            bubble.trappedEnemy.state = 'angry';
                            bubble.trappedEnemy.angerTimer = ENEMY_ANGRY_TIME;
                            bubble.trappedEnemy = null;
                        }
                    }
                    break;
                case 'popping':
                    if (bubble.timer > BUBBLE_POP_TIME) {
                        this.data.bubbles = this.data.bubbles.filter(b => b.id !== bubble.id);
                    }
                    break;
            }
            // Animation
            bubble.frame = (bubble.frame + 1) % 4;
        }
    }
    checkBubbleEnemyCollision(bubble) {
        for (const enemy of this.data.enemies) {
            if (enemy.state !== 'normal' && enemy.state !== 'angry')
                continue;
            const dist = Math.sqrt(Math.pow(bubble.x - enemy.x, 2) + Math.pow(bubble.y - enemy.y, 2));
            if (dist < 1.5) {
                return enemy;
            }
        }
        return null;
    }
    updateItems() {
        for (const item of this.data.items) {
            item.timer++;
            if (item.isFalling) {
                item.vy += GRAVITY;
                if (item.vy > MAX_FALL_SPEED)
                    item.vy = MAX_FALL_SPEED;
                item.y += item.vy;
                // Check platform landing
                for (const platform of this.data.platforms) {
                    if (item.x >= platform.x && item.x < platform.x + platform.width) {
                        if (item.y >= platform.y - 1 && item.y < platform.y + 0.5) {
                            item.y = platform.y - 1;
                            item.isFalling = false;
                            item.vy = 0;
                        }
                    }
                }
                // Floor
                if (item.y >= GAME_HEIGHT - 2) {
                    item.y = GAME_HEIGHT - 2;
                    item.isFalling = false;
                    item.vy = 0;
                }
            }
            // Despawn after time
            if (item.timer > ITEM_LIFETIME) {
                this.data.items = this.data.items.filter(i => i.id !== item.id);
            }
        }
    }
    checkCollisions() {
        const player = this.data.player;
        if (!player.isAlive)
            return;
        // Player vs bubbles (pop them)
        for (const bubble of this.data.bubbles) {
            if (bubble.state === 'popping')
                continue;
            const dist = Math.sqrt(Math.pow(player.x - bubble.x, 2) + Math.pow(player.y - bubble.y, 2));
            if (dist < 1.5) {
                if (bubble.state === 'hasEnemy' && bubble.trappedEnemy) {
                    // Pop enemy bubble
                    this.popEnemyBubble(bubble);
                }
                else if (bubble.state === 'floating' || bubble.state === 'shooting') {
                    // Bounce off bubble
                    player.vy = JUMP_POWER * 0.5;
                }
            }
        }
        // Player vs items
        for (const item of this.data.items) {
            const dist = Math.sqrt(Math.pow(player.x - item.x, 2) + Math.pow(player.y - item.y, 2));
            if (dist < 1.5) {
                this.collectItem(item);
            }
        }
        // Player vs enemies (if not invincible)
        if (player.invincibleTimer <= 0) {
            for (const enemy of this.data.enemies) {
                if (enemy.state === 'bubbled' || enemy.state === 'dead')
                    continue;
                const dist = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));
                if (dist < 1.5) {
                    this.killPlayer();
                    break;
                }
            }
        }
    }
    popEnemyBubble(bubble) {
        const enemy = bubble.trappedEnemy;
        const enemyType = enemy.type;
        // Check combo
        const now = this.data.frameCount;
        if (now - this.data.lastPopTime < COMBO_WINDOW) {
            this.data.comboCount++;
        }
        else {
            this.data.comboCount = 1;
        }
        this.data.lastPopTime = now;
        // Calculate score
        let score = SCORES[enemyType] || 100;
        if (this.data.comboCount > 1) {
            const comboKey = `combo${Math.min(this.data.comboCount, 8)}`;
            score += SCORES[comboKey] || 0;
        }
        this.data.score += score;
        // Remove enemy
        enemy.state = 'dead';
        this.data.enemies = this.data.enemies.filter(e => e.id !== enemy.id);
        // Remove bubble
        this.data.bubbles = this.data.bubbles.filter(b => b.id !== bubble.id);
        // Spawn item
        this.spawnItem(bubble.x, bubble.y);
    }
    spawnItem(x, y) {
        // Determine item type based on level and combo
        let itemType;
        const rand = Math.random();
        if (rand < 0.4)
            itemType = 'apple';
        else if (rand < 0.6)
            itemType = 'orange';
        else if (rand < 0.75)
            itemType = 'cherry';
        else if (rand < 0.85)
            itemType = 'grape';
        else if (rand < 0.92)
            itemType = 'watermelon';
        else if (rand < 0.96) {
            // Power-ups
            const powerups = ['shoe', 'candy', 'umbrella'];
            itemType = powerups[Math.floor(Math.random() * powerups.length)];
        }
        else if (rand < 0.99)
            itemType = 'crown';
        else
            itemType = 'diamond';
        this.data.items.push({
            id: this.data.itemIdCounter++,
            type: itemType,
            x,
            y,
            timer: 0,
            isFalling: true,
            vy: 0,
        });
    }
    collectItem(item) {
        const score = SCORES[item.type] || 100;
        this.data.score += score;
        // Apply power-up effects
        switch (item.type) {
            case 'shoe':
                this.data.player.hasShoes = true;
                break;
            case 'candy':
                this.data.player.hasCandy = true;
                this.data.player.bubbleRange = BUBBLE_RANGE_CANDY;
                break;
            case 'umbrella':
                // Skip levels (simplified: just extra points)
                this.data.score += 1000;
                break;
        }
        this.data.items = this.data.items.filter(i => i.id !== item.id);
    }
    killPlayer() {
        this.data.player.isAlive = false;
        this.data.player.hasShoes = false;
        this.data.player.hasCandy = false;
        this.data.player.bubbleRange = BUBBLE_RANGE;
        this.data.lives--;
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            this.onGameOver();
        }
        else {
            this.data.player.respawnTimer = RESPAWN_TIME;
        }
    }
    handleMove(direction) {
        if (this.data.state !== 'playing')
            return;
        const player = this.data.player;
        if (!player.isAlive)
            return;
        const speed = player.hasShoes ? PLAYER_SPEED_SHOES : PLAYER_SPEED;
        player.vx = direction === 'left' ? -speed : speed;
        player.direction = direction;
    }
    handleJump() {
        if (this.data.state !== 'playing')
            return;
        const player = this.data.player;
        if (!player.isAlive)
            return;
        if (player.isOnGround && !player.isJumping) {
            player.vy = JUMP_POWER;
            player.isJumping = true;
            player.isOnGround = false;
        }
    }
    handleBubble() {
        if (this.data.state !== 'playing')
            return;
        const player = this.data.player;
        if (!player.isAlive)
            return;
        if (!player.isBubbling || player.rapidFire) {
            player.isBubbling = true;
            player.bubbleFrame = 0;
            // Create bubble
            const bubbleX = player.direction === 'right' ? player.x + 1 : player.x - 1;
            const bubbleVx = player.direction === 'right' ? BUBBLE_SHOOT_SPEED : -BUBBLE_SHOOT_SPEED;
            this.data.bubbles.push({
                id: this.data.bubbleIdCounter++,
                type: 'normal',
                x: bubbleX,
                y: player.y,
                vx: bubbleVx,
                vy: 0,
                state: 'shooting',
                trappedEnemy: null,
                timer: 0,
                frame: 0,
            });
        }
    }
    render() {
        const buffer = [];
        // Initialize buffer
        for (let y = 0; y < GAME_HEIGHT; y++) {
            buffer[y] = [];
            for (let x = 0; x < GAME_WIDTH; x++) {
                buffer[y][x] = ' ';
            }
        }
        // Draw platforms
        for (const platform of this.data.platforms) {
            for (let x = platform.x; x < platform.x + platform.width && x < GAME_WIDTH; x++) {
                if (x >= 0 && platform.y < GAME_HEIGHT) {
                    buffer[Math.floor(platform.y)][x] = SPRITES.platform;
                }
            }
        }
        // Draw walls
        for (const wall of this.data.walls) {
            if (wall.x >= 0 && wall.x < GAME_WIDTH && wall.y >= 0 && wall.y < GAME_HEIGHT) {
                buffer[wall.y][wall.x] = SPRITES.wall;
            }
        }
        // Draw items
        for (const item of this.data.items) {
            const ix = Math.floor(item.x);
            const iy = Math.floor(item.y);
            if (ix >= 0 && ix < GAME_WIDTH && iy >= 0 && iy < GAME_HEIGHT) {
                buffer[iy][ix] = SPRITES.item[item.type] || '*';
            }
        }
        // Draw bubbles
        for (const bubble of this.data.bubbles) {
            const bx = Math.floor(bubble.x);
            const by = Math.floor(bubble.y);
            if (bx >= 0 && bx < GAME_WIDTH && by >= 0 && by < GAME_HEIGHT) {
                buffer[by][bx] = bubble.state === 'hasEnemy' ? SPRITES.bubbleFull : SPRITES.bubble;
            }
        }
        // Draw enemies
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            if (enemy.state === 'bubbled')
                continue; // Drawn as bubble
            const ex = Math.floor(enemy.x);
            const ey = Math.floor(enemy.y);
            if (ex >= 0 && ex < GAME_WIDTH && ey >= 0 && ey < GAME_HEIGHT) {
                buffer[ey][ex] = SPRITES.enemy[enemy.type] || 'E';
            }
        }
        // Draw player
        const player = this.data.player;
        if (player.isAlive && (player.invincibleTimer === 0 || this.data.frameCount % 4 < 2)) {
            const px = Math.floor(player.x);
            const py = Math.floor(player.y);
            if (px >= 0 && px < GAME_WIDTH && py >= 0 && py < GAME_HEIGHT) {
                buffer[py][px] = player.direction === 'right' ? SPRITES.playerRight : SPRITES.playerLeft;
            }
        }
        // Build output with colors (double width for better aspect ratio)
        let output = '';
        for (let y = 0; y < GAME_HEIGHT; y++) {
            for (let x = 0; x < GAME_WIDTH; x++) {
                const char = buffer[y][x];
                let colored;
                if (char === SPRITES.platform) {
                    colored = `{green-fg}${char}${char}{/}`;
                }
                else if (char === SPRITES.wall) {
                    colored = `{blue-fg}${char}${char}{/}`;
                }
                else if (char === SPRITES.playerRight || char === SPRITES.playerLeft) {
                    colored = `{cyan-fg}${char}${char}{/}`;
                }
                else if (char === SPRITES.bubble) {
                    colored = `{white-fg}${char}${char}{/}`;
                }
                else if (char === SPRITES.bubbleFull) {
                    colored = `{yellow-fg}${char}${char}{/}`;
                }
                else if (Object.values(SPRITES.enemy).includes(char)) {
                    const enemyHere = this.data.enemies.find(e => Math.floor(e.x) === x && Math.floor(e.y) === y && e.state !== 'dead' && e.state !== 'bubbled');
                    const color = enemyHere ? ENEMY_COLORS[enemyHere.type] || 'red' : 'red';
                    colored = `{${color}-fg}${char}${char}{/}`;
                }
                else if (Object.values(SPRITES.item).includes(char)) {
                    const itemHere = this.data.items.find(i => Math.floor(i.x) === x && Math.floor(i.y) === y);
                    const color = itemHere ? ITEM_COLORS[itemHere.type] || 'yellow' : 'yellow';
                    colored = `{${color}-fg}${char}${char}{/}`;
                }
                else {
                    colored = '  ';
                }
                output += colored;
            }
            if (y < GAME_HEIGHT - 1)
                output += '\n';
        }
        this.renderCallback(output);
    }
}
