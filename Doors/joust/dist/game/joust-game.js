/**
 * Joust - Game Engine
 * 1982 Williams Electronics arcade jousting game
 */
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY, FLAP_POWER, MAX_FALL_SPEED, MAX_RISE_SPEED, HORIZONTAL_SPEED, HORIZONTAL_DRAG, GROUND_FRICTION, LANCE_HEIGHT_ADVANTAGE, COLLISION_DISTANCE, SCORES, RESPAWN_TIME, INVINCIBLE_TIME, STANDARD_PLATFORMS, LAVA_PITS, ENEMY_COLORS, SPRITES, getWaveConfig, } from './constants';
export class JoustGame {
    constructor(data, renderCallback, onGameOver, onWaveComplete) {
        this.data = data;
        this.renderCallback = renderCallback;
        this.onGameOver = onGameOver;
        this.onWaveComplete = onWaveComplete;
    }
    initWave() {
        const config = getWaveConfig(this.data.wave);
        // Reset player position
        this.data.player = {
            x: 10,
            y: 16,
            vx: 0,
            vy: 0,
            direction: 'right',
            mount: 'ostrich',
            isFlapping: false,
            flapFrame: 0,
            isWalking: false,
            walkFrame: 0,
            isAlive: true,
            respawnTimer: 0,
            invincibleTimer: 0,
        };
        // Spawn enemies
        this.data.enemies = [];
        this.data.eggs = [];
        this.data.enemyIdCounter = 0;
        this.data.eggIdCounter = 0;
        this.data.waveTimer = 0;
        // Spawn bounders
        for (let i = 0; i < config.bounders; i++) {
            this.spawnEnemy('bounder');
        }
        // Spawn hunters
        for (let i = 0; i < config.hunters; i++) {
            this.spawnEnemy('hunter');
        }
        // Spawn shadow lords
        for (let i = 0; i < config.shadowLords; i++) {
            this.spawnEnemy('shadowLord');
        }
        // Reset pterodactyl
        this.data.pterodactyl = {
            x: -10,
            y: 10,
            vx: 0,
            vy: 0,
            isActive: false,
            targetPlayer: false,
            mouthOpen: false,
            mouthTimer: 0,
        };
        // Set platforms
        this.data.platforms = [...STANDARD_PLATFORMS];
        this.data.lavaPits = [...LAVA_PITS];
        this.render();
    }
    spawnEnemy(type) {
        const spawnPoints = [
            { x: 5, y: 3 },
            { x: 73, y: 3 },
            { x: 39, y: 2 },
            { x: 20, y: 6 },
            { x: 58, y: 6 },
        ];
        const spawn = spawnPoints[this.data.enemyIdCounter % spawnPoints.length];
        this.data.enemies.push({
            id: this.data.enemyIdCounter++,
            type,
            x: spawn.x,
            y: spawn.y,
            vx: Math.random() > 0.5 ? 0.3 : -0.3,
            vy: 0,
            direction: Math.random() > 0.5 ? 'right' : 'left',
            mount: 'buzzard',
            isFlapping: false,
            flapFrame: 0,
            state: 'flying',
            targetX: Math.random() * GAME_WIDTH,
            targetY: Math.random() * (GAME_HEIGHT - 5) + 3,
            aiTimer: Math.floor(Math.random() * 60),
        });
    }
    update() {
        if (this.data.state !== 'playing')
            return;
        this.data.frameCount++;
        this.data.waveTimer++;
        // Update player
        this.updatePlayer();
        // Update enemies
        this.updateEnemies();
        // Update eggs
        this.updateEggs();
        // Update pterodactyl
        this.updatePterodactyl();
        // Check collisions
        this.checkCollisions();
        // Check wave complete
        if (this.data.enemies.length === 0 && this.data.eggs.length === 0) {
            this.data.score += SCORES.survivalBonus;
            this.data.state = 'waveComplete';
            this.onWaveComplete();
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
                    player.x = 10;
                    player.y = 16;
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
        // Clamp vertical velocity
        if (player.vy > MAX_FALL_SPEED)
            player.vy = MAX_FALL_SPEED;
        if (player.vy < MAX_RISE_SPEED)
            player.vy = MAX_RISE_SPEED;
        // Apply horizontal drag
        player.vx *= HORIZONTAL_DRAG;
        // Check if walking on platform
        const onPlatform = this.isOnPlatform(player);
        if (onPlatform) {
            player.vx *= GROUND_FRICTION;
            if (Math.abs(player.vx) < 0.01)
                player.vx = 0;
        }
        // Update position
        player.x += player.vx;
        player.y += player.vy;
        // Platform collision
        this.handlePlatformCollision(player);
        // Screen wrapping (horizontal)
        if (player.x < 0)
            player.x = GAME_WIDTH - 1;
        if (player.x >= GAME_WIDTH)
            player.x = 0;
        // Ceiling
        if (player.y < 1) {
            player.y = 1;
            player.vy = 0;
        }
        // Lava death
        if (player.y >= GAME_HEIGHT - 1) {
            for (const pit of this.data.lavaPits) {
                if (player.x >= pit.x && player.x < pit.x + pit.width) {
                    this.killPlayer();
                    return;
                }
            }
            // Land on solid ground
            player.y = GAME_HEIGHT - 2;
            player.vy = 0;
        }
        // Update animation
        if (player.isFlapping) {
            player.flapFrame = (player.flapFrame + 1) % 4;
        }
        else {
            player.flapFrame = 0;
        }
        if (Math.abs(player.vx) > 0.05 && onPlatform) {
            player.isWalking = true;
            player.walkFrame = (player.walkFrame + 1) % 4;
        }
        else {
            player.isWalking = false;
            player.walkFrame = 0;
        }
    }
    updateEnemies() {
        const config = getWaveConfig(this.data.wave);
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            // AI behavior
            enemy.aiTimer--;
            if (enemy.aiTimer <= 0) {
                this.updateEnemyAI(enemy);
                enemy.aiTimer = 30 + Math.floor(Math.random() * 30);
            }
            // Apply gravity
            enemy.vy += GRAVITY;
            if (enemy.vy > MAX_FALL_SPEED)
                enemy.vy = MAX_FALL_SPEED;
            // Flapping behavior
            if (enemy.state === 'flying') {
                if (enemy.y > enemy.targetY) {
                    enemy.vy += FLAP_POWER * 0.5;
                    enemy.isFlapping = true;
                }
                else {
                    enemy.isFlapping = false;
                }
            }
            // Horizontal movement
            if (enemy.x < enemy.targetX) {
                enemy.vx += config.enemySpeed * 0.1;
                enemy.direction = 'right';
            }
            else {
                enemy.vx -= config.enemySpeed * 0.1;
                enemy.direction = 'left';
            }
            enemy.vx *= HORIZONTAL_DRAG;
            // Update position
            enemy.x += enemy.vx;
            enemy.y += enemy.vy;
            // Platform collision
            this.handlePlatformCollision(enemy);
            // Screen wrapping
            if (enemy.x < 0)
                enemy.x = GAME_WIDTH - 1;
            if (enemy.x >= GAME_WIDTH)
                enemy.x = 0;
            // Ceiling
            if (enemy.y < 1) {
                enemy.y = 1;
                enemy.vy = 0;
            }
            // Lava death
            if (enemy.y >= GAME_HEIGHT - 1) {
                for (const pit of this.data.lavaPits) {
                    if (enemy.x >= pit.x && enemy.x < pit.x + pit.width) {
                        enemy.state = 'dead';
                        this.data.enemies = this.data.enemies.filter(e => e.id !== enemy.id);
                        return;
                    }
                }
                enemy.y = GAME_HEIGHT - 2;
                enemy.vy = 0;
            }
            // Animation
            enemy.flapFrame = enemy.isFlapping ? (enemy.flapFrame + 1) % 4 : 0;
        }
    }
    updateEnemyAI(enemy) {
        const player = this.data.player;
        switch (enemy.type) {
            case 'bounder':
                // Random movement with occasional pursuit
                if (Math.random() < 0.3 && player.isAlive) {
                    enemy.targetX = player.x;
                    enemy.targetY = player.y - 1;
                }
                else {
                    enemy.targetX = Math.random() * GAME_WIDTH;
                    enemy.targetY = Math.random() * (GAME_HEIGHT - 6) + 3;
                }
                break;
            case 'hunter':
                // Actively hunts player
                if (player.isAlive) {
                    enemy.targetX = player.x + (Math.random() - 0.5) * 10;
                    enemy.targetY = player.y - 2;
                }
                break;
            case 'shadowLord':
                // Smart hunter, tries to get above player
                if (player.isAlive) {
                    enemy.targetX = player.x;
                    enemy.targetY = Math.max(2, player.y - 3);
                }
                break;
        }
    }
    updateEggs() {
        const config = getWaveConfig(this.data.wave);
        for (const egg of this.data.eggs) {
            egg.timer++;
            switch (egg.state) {
                case 'falling':
                    egg.vy += GRAVITY;
                    egg.y += egg.vy;
                    // Check platform landing
                    const landed = this.checkEggLanding(egg);
                    if (landed) {
                        egg.state = 'landed';
                        egg.timer = 0;
                        egg.vy = 0;
                    }
                    // Lava death
                    if (egg.y >= GAME_HEIGHT - 1) {
                        for (const pit of this.data.lavaPits) {
                            if (egg.x >= pit.x && egg.x < pit.x + pit.width) {
                                this.data.eggs = this.data.eggs.filter(e => e.id !== egg.id);
                                return;
                            }
                        }
                        egg.state = 'landed';
                        egg.timer = 0;
                        egg.y = GAME_HEIGHT - 2;
                    }
                    break;
                case 'landed':
                    if (egg.timer >= config.eggHatchTime * 0.7) {
                        egg.state = 'hatching';
                    }
                    break;
                case 'hatching':
                    if (egg.timer >= config.eggHatchTime) {
                        egg.state = 'hatched';
                        this.hatchEgg(egg);
                        this.data.eggs = this.data.eggs.filter(e => e.id !== egg.id);
                    }
                    break;
            }
        }
    }
    checkEggLanding(egg) {
        for (const platform of this.data.platforms) {
            if (egg.x >= platform.x && egg.x < platform.x + platform.width) {
                if (egg.y >= platform.y - 1 && egg.y < platform.y + 1 && egg.vy > 0) {
                    egg.y = platform.y - 1;
                    return true;
                }
            }
        }
        return false;
    }
    hatchEgg(egg) {
        this.spawnEnemy(egg.enemyType);
        const newEnemy = this.data.enemies[this.data.enemies.length - 1];
        newEnemy.x = egg.x;
        newEnemy.y = egg.y;
    }
    updatePterodactyl() {
        const config = getWaveConfig(this.data.wave);
        const ptero = this.data.pterodactyl;
        // Spawn pterodactyl if wave takes too long
        if (!ptero.isActive && this.data.waveTimer > config.pterodactylTimer) {
            ptero.isActive = true;
            ptero.x = -5;
            ptero.y = 5 + Math.random() * 8;
            ptero.vx = 0.8;
            ptero.vy = 0;
            ptero.targetPlayer = true;
        }
        if (!ptero.isActive)
            return;
        // Move toward player
        const player = this.data.player;
        if (player.isAlive && ptero.targetPlayer) {
            const dx = player.x - ptero.x;
            const dy = player.y - ptero.y;
            ptero.vx = dx > 0 ? 0.6 : -0.6;
            ptero.vy = dy * 0.05;
        }
        ptero.x += ptero.vx;
        ptero.y += ptero.vy;
        // Mouth animation
        ptero.mouthTimer++;
        if (ptero.mouthTimer > 10) {
            ptero.mouthOpen = !ptero.mouthOpen;
            ptero.mouthTimer = 0;
        }
        // Remove if off screen
        if (ptero.x > GAME_WIDTH + 10 || ptero.x < -10) {
            ptero.isActive = false;
        }
    }
    isOnPlatform(entity) {
        for (const platform of this.data.platforms) {
            if (entity.x >= platform.x && entity.x < platform.x + platform.width) {
                if (Math.abs(entity.y - (platform.y - 1)) < 0.5 && entity.vy >= 0) {
                    return true;
                }
            }
        }
        // Check solid ground
        if (entity.y >= GAME_HEIGHT - 2) {
            let onGround = true;
            for (const pit of this.data.lavaPits) {
                if (entity.x >= pit.x && entity.x < pit.x + pit.width) {
                    onGround = false;
                }
            }
            return onGround;
        }
        return false;
    }
    handlePlatformCollision(entity) {
        for (const platform of this.data.platforms) {
            if (entity.x >= platform.x && entity.x < platform.x + platform.width) {
                // Landing on platform
                if (entity.y >= platform.y - 1.5 && entity.y < platform.y && entity.vy > 0) {
                    entity.y = platform.y - 1;
                    entity.vy = 0;
                }
            }
        }
    }
    checkCollisions() {
        const player = this.data.player;
        if (!player.isAlive || player.invincibleTimer > 0)
            return;
        // Player vs enemies
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            const dist = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));
            if (dist < COLLISION_DISTANCE) {
                // Joust! Higher lance wins
                const heightDiff = enemy.y - player.y;
                if (heightDiff > LANCE_HEIGHT_ADVANTAGE) {
                    // Player wins (player is higher)
                    this.defeatEnemy(enemy);
                }
                else if (heightDiff < -LANCE_HEIGHT_ADVANTAGE) {
                    // Enemy wins (enemy is higher)
                    this.killPlayer();
                }
                else {
                    // Bounce off
                    player.vx = -player.vx * 1.5;
                    player.vy = -1;
                    enemy.vx = -enemy.vx * 1.5;
                    enemy.vy = -1;
                }
            }
        }
        // Player vs eggs (collect)
        for (const egg of this.data.eggs) {
            const dist = Math.sqrt(Math.pow(player.x - egg.x, 2) + Math.pow(player.y - egg.y, 2));
            if (dist < 2) {
                this.data.score += SCORES.egg;
                this.data.eggs = this.data.eggs.filter(e => e.id !== egg.id);
            }
        }
        // Player vs pterodactyl
        const ptero = this.data.pterodactyl;
        if (ptero.isActive) {
            const dist = Math.sqrt(Math.pow(player.x - ptero.x, 2) + Math.pow(player.y - ptero.y, 2));
            if (dist < 3) {
                if (player.y < ptero.y - 1) {
                    // Player kills pterodactyl
                    this.data.score += SCORES.pterodactyl;
                    ptero.isActive = false;
                }
                else {
                    // Pterodactyl kills player
                    this.killPlayer();
                }
            }
        }
    }
    defeatEnemy(enemy) {
        const scoreKey = enemy.type;
        this.data.score += SCORES[scoreKey] || SCORES.bounder;
        // Create egg
        this.data.eggs.push({
            id: this.data.eggIdCounter++,
            x: enemy.x,
            y: enemy.y,
            vx: 0,
            vy: 0,
            state: 'falling',
            timer: 0,
            enemyType: enemy.type,
        });
        // Remove enemy
        this.data.enemies = this.data.enemies.filter(e => e.id !== enemy.id);
    }
    killPlayer() {
        this.data.player.isAlive = false;
        this.data.lives--;
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
            this.onGameOver();
        }
        else {
            this.data.player.respawnTimer = RESPAWN_TIME;
        }
    }
    handleFlap() {
        if (this.data.state !== 'playing')
            return;
        const player = this.data.player;
        if (!player.isAlive)
            return;
        player.vy += FLAP_POWER;
        player.isFlapping = true;
    }
    handleDirection(direction) {
        if (this.data.state !== 'playing')
            return;
        const player = this.data.player;
        if (!player.isAlive)
            return;
        if (direction === 'left') {
            player.vx -= HORIZONTAL_SPEED;
            player.direction = 'left';
        }
        else {
            player.vx += HORIZONTAL_SPEED;
            player.direction = 'right';
        }
    }
    render() {
        const buffer = [];
        // Initialize buffer with empty space
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
        // Draw lava
        const lavaY = GAME_HEIGHT - 1;
        for (const pit of this.data.lavaPits) {
            for (let x = pit.x; x < pit.x + pit.width && x < GAME_WIDTH; x++) {
                if (x >= 0 && lavaY < GAME_HEIGHT) {
                    buffer[lavaY][x] = this.data.frameCount % 10 < 5 ? SPRITES.lava : SPRITES.lavaHand;
                }
            }
        }
        // Draw eggs
        for (const egg of this.data.eggs) {
            const ex = Math.floor(egg.x);
            const ey = Math.floor(egg.y);
            if (ex >= 0 && ex < GAME_WIDTH && ey >= 0 && ey < GAME_HEIGHT) {
                buffer[ey][ex] = egg.state === 'hatching' ? SPRITES.eggHatching : SPRITES.egg;
            }
        }
        // Draw enemies
        for (const enemy of this.data.enemies) {
            if (enemy.state === 'dead')
                continue;
            const ex = Math.floor(enemy.x);
            const ey = Math.floor(enemy.y);
            if (ex >= 0 && ex < GAME_WIDTH && ey >= 0 && ey < GAME_HEIGHT) {
                buffer[ey][ex] = enemy.direction === 'right' ? SPRITES.enemyRight : SPRITES.enemyLeft;
            }
        }
        // Draw pterodactyl
        if (this.data.pterodactyl.isActive) {
            const px = Math.floor(this.data.pterodactyl.x);
            const py = Math.floor(this.data.pterodactyl.y);
            if (px >= 0 && px < GAME_WIDTH && py >= 0 && py < GAME_HEIGHT) {
                buffer[py][px] = SPRITES.pterodactyl;
            }
        }
        // Draw player
        const player = this.data.player;
        if (player.isAlive && (player.invincibleTimer === 0 || this.data.frameCount % 4 < 2)) {
            const px = Math.floor(player.x);
            const py = Math.floor(player.y);
            if (px >= 0 && px < GAME_WIDTH && py >= 0 && py < GAME_HEIGHT) {
                let sprite;
                if (player.isFlapping || player.vy < -0.3) {
                    sprite = SPRITES.playerFlap;
                }
                else {
                    sprite = player.direction === 'right' ? SPRITES.playerRight : SPRITES.playerLeft;
                }
                buffer[py][px] = sprite;
            }
        }
        // Build output with colors
        let output = '';
        for (let y = 0; y < GAME_HEIGHT; y++) {
            for (let x = 0; x < GAME_WIDTH; x++) {
                const char = buffer[y][x];
                if (char === SPRITES.platform) {
                    output += `{green-fg}${char}{/}`;
                }
                else if (char === SPRITES.lava || char === SPRITES.lavaHand) {
                    output += `{red-fg}${char}{/}`;
                }
                else if (char === SPRITES.playerRight || char === SPRITES.playerLeft || char === SPRITES.playerFlap) {
                    output += `{cyan-fg}${char}{/}`;
                }
                else if (char === SPRITES.enemyRight || char === SPRITES.enemyLeft) {
                    // Color by enemy type at this position
                    const enemyHere = this.data.enemies.find(e => Math.floor(e.x) === x && Math.floor(e.y) === y);
                    const color = enemyHere ? ENEMY_COLORS[enemyHere.type] || 'red' : 'red';
                    output += `{${color}-fg}${char}{/}`;
                }
                else if (char === SPRITES.egg || char === SPRITES.eggHatching) {
                    output += `{white-fg}${char}{/}`;
                }
                else if (char === SPRITES.pterodactyl) {
                    output += `{magenta-fg}${char}{/}`;
                }
                else {
                    output += char;
                }
            }
            if (y < GAME_HEIGHT - 1)
                output += '\n';
        }
        this.renderCallback(output);
    }
}
