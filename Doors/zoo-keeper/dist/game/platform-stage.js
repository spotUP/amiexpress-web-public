/**
 * Zoo Keeper - Platform Stage Logic
 * Jump up moving platforms to rescue Zelda while dodging coconuts
 */
import { GAME_AREA, PLATFORM_STAGE, CHARS, COLORS } from './constants';
/**
 * Platform Stage Game Engine
 */
export class PlatformStageGame {
    constructor(data, renderCallback) {
        this.coconutTimer = 0;
        this.data = data;
        this.renderCallback = renderCallback;
    }
    /**
     * Initialize platform stage
     */
    init() {
        const d = this.data;
        const ps = d.platformStage;
        const cfg = PLATFORM_STAGE;
        // Reset Zeke position (ground level)
        d.zeke.x = 40;
        d.zeke.y = GAME_AREA.bottom - 2;
        d.zeke.isJumping = false;
        d.zeke.jumpFrame = 0;
        // Create platforms
        ps.platforms = [];
        const baseY = GAME_AREA.bottom - 4;
        for (let i = 0; i < cfg.platformCount; i++) {
            const y = baseY - (i * cfg.platformSpacing);
            const goingRight = i % 2 === 0;
            ps.platforms.push({
                x: goingRight ? 10 : 60,
                y,
                width: cfg.platformWidth,
                dx: goingRight ? cfg.platformSpeed : -cfg.platformSpeed,
                minX: 5,
                maxX: GAME_AREA.width - cfg.platformWidth - 5
            });
        }
        // Position Zelda at top
        ps.zelda = {
            x: 40,
            y: GAME_AREA.top + 1
        };
        // Position monkey
        ps.monkey = {
            x: 60,
            y: GAME_AREA.top + 2
        };
        // Reset coconuts
        ps.coconuts = [];
        ps.monkeyThrowTimer = cfg.throwInterval;
        // Track which platform Zeke is on
        ps.zekelPlatformIndex = -1; // -1 = ground
        this.render();
    }
    /**
     * Main update loop
     */
    update() {
        const d = this.data;
        if (d.state !== 'platform')
            return;
        // Update platforms
        this.updatePlatforms();
        // Update coconuts
        this.updateCoconuts();
        // Update monkey throw timer
        this.coconutTimer++;
        if (this.coconutTimer >= PLATFORM_STAGE.throwInterval / 33) { // Convert ms to frames
            this.throwCoconut();
            this.coconutTimer = 0;
        }
        // Check if Zeke reached Zelda
        if (d.zeke.y <= d.platformStage.zelda.y + 1) {
            this.rescueComplete();
            return;
        }
        // Check coconut collisions
        this.checkCoconutCollisions();
        // Update jump
        if (d.zeke.isJumping) {
            this.updateJump();
        }
        this.render();
    }
    /**
     * Update platform positions
     */
    updatePlatforms() {
        const ps = this.data.platformStage;
        for (const platform of ps.platforms) {
            platform.x += platform.dx;
            // Bounce at edges
            if (platform.x <= platform.minX) {
                platform.x = platform.minX;
                platform.dx = Math.abs(platform.dx);
            }
            else if (platform.x >= platform.maxX) {
                platform.x = platform.maxX;
                platform.dx = -Math.abs(platform.dx);
            }
        }
        // Move Zeke with platform if on one
        if (ps.zekelPlatformIndex >= 0 && ps.zekelPlatformIndex < ps.platforms.length) {
            const platform = ps.platforms[ps.zekelPlatformIndex];
            this.data.zeke.x += platform.dx;
            // Keep Zeke on screen
            this.data.zeke.x = Math.max(1, Math.min(GAME_AREA.width - 2, this.data.zeke.x));
        }
    }
    /**
     * Update coconut positions
     */
    updateCoconuts() {
        const ps = this.data.platformStage;
        const toRemove = [];
        for (let i = 0; i < ps.coconuts.length; i++) {
            const coconut = ps.coconuts[i];
            // Apply gravity
            coconut.dy += PLATFORM_STAGE.coconutGravity;
            // Move
            coconut.x += coconut.dx;
            coconut.y += coconut.dy;
            // Bounce off walls
            if (coconut.x <= 1 || coconut.x >= GAME_AREA.width - 1) {
                coconut.dx = -coconut.dx;
                coconut.bounceCount++;
            }
            // Bounce off platforms
            for (const platform of ps.platforms) {
                if (coconut.dy > 0 &&
                    coconut.y >= platform.y - 1 && coconut.y <= platform.y &&
                    coconut.x >= platform.x && coconut.x <= platform.x + platform.width) {
                    coconut.dy = -Math.abs(coconut.dy) * 0.8;
                    coconut.y = platform.y - 1;
                    coconut.bounceCount++;
                }
            }
            // Bounce off ground
            if (coconut.y >= GAME_AREA.bottom - 1) {
                coconut.dy = -Math.abs(coconut.dy) * 0.6;
                coconut.y = GAME_AREA.bottom - 1;
                coconut.bounceCount++;
            }
            // Remove after too many bounces
            if (coconut.bounceCount > 5) {
                toRemove.push(i);
            }
        }
        // Remove dead coconuts
        for (let i = toRemove.length - 1; i >= 0; i--) {
            ps.coconuts.splice(toRemove[i], 1);
        }
    }
    /**
     * Throw a coconut
     */
    throwCoconut() {
        const ps = this.data.platformStage;
        if (ps.coconuts.length >= PLATFORM_STAGE.maxCoconuts)
            return;
        const coconut = {
            x: ps.monkey.x,
            y: ps.monkey.y + 1,
            dx: (this.data.zeke.x < ps.monkey.x) ? -PLATFORM_STAGE.coconutSpeed : PLATFORM_STAGE.coconutSpeed,
            dy: 1,
            bounceCount: 0
        };
        ps.coconuts.push(coconut);
    }
    /**
     * Check coconut collisions with Zeke
     */
    checkCoconutCollisions() {
        const d = this.data;
        const ps = d.platformStage;
        if (d.zeke.isJumping)
            return; // Can't hit while jumping
        for (const coconut of ps.coconuts) {
            const dist = Math.abs(coconut.x - d.zeke.x) + Math.abs(coconut.y - d.zeke.y);
            if (dist <= 1) {
                this.hitByCoconut();
                return;
            }
        }
    }
    /**
     * Zeke hit by coconut
     */
    hitByCoconut() {
        const d = this.data;
        d.lives--;
        if (d.lives <= 0) {
            d.state = 'gameover';
        }
        else {
            // Reset to ground
            d.zeke.x = 40;
            d.zeke.y = GAME_AREA.bottom - 2;
            d.platformStage.zekelPlatformIndex = -1;
            d.platformStage.coconuts = [];
        }
    }
    /**
     * Handle direction input
     */
    handleDirection(dir) {
        const d = this.data;
        if (d.zeke.isJumping)
            return;
        // On platform stage, left/right move Zeke
        if (dir === 'left') {
            d.zeke.x = Math.max(1, d.zeke.x - 2);
        }
        else if (dir === 'right') {
            d.zeke.x = Math.min(GAME_AREA.width - 2, d.zeke.x + 2);
        }
    }
    /**
     * Handle jump input
     */
    handleJump() {
        const d = this.data;
        if (d.zeke.isJumping)
            return;
        d.zeke.isJumping = true;
        d.zeke.jumpFrame = 0;
    }
    /**
     * Update jump animation
     */
    updateJump() {
        const d = this.data;
        const ps = d.platformStage;
        d.zeke.jumpFrame++;
        // Jump arc - rising for first 8 frames, falling for next 8
        const jumpHeight = 4;
        if (d.zeke.jumpFrame <= 8) {
            // Rising
            d.zeke.y--;
        }
        else if (d.zeke.jumpFrame <= 16) {
            // Falling
            d.zeke.y++;
        }
        else {
            // Jump complete
            d.zeke.isJumping = false;
            d.zeke.jumpFrame = 0;
            // Check if landed on platform
            ps.zekelPlatformIndex = -1;
            for (let i = 0; i < ps.platforms.length; i++) {
                const platform = ps.platforms[i];
                if (d.zeke.y === platform.y - 1 &&
                    d.zeke.x >= platform.x && d.zeke.x <= platform.x + platform.width) {
                    ps.zekelPlatformIndex = i;
                    break;
                }
            }
            // If not on platform and not at ground, fall
            if (ps.zekelPlatformIndex === -1 && d.zeke.y < GAME_AREA.bottom - 2) {
                d.zeke.y = GAME_AREA.bottom - 2; // Fall to ground
            }
        }
    }
    /**
     * Rescue complete
     */
    rescueComplete() {
        const d = this.data;
        // Bonus points for rescue
        d.score += 5000;
        // Advance to next round
        d.round++;
        if (d.round > 4) {
            d.round = 1;
            d.level++;
        }
        d.state = 'stageTransition';
        d.transitionMessage = 'ZOO STAGE';
        d.transitionTimer = 60;
    }
    /**
     * Render the platform stage
     */
    render() {
        const d = this.data;
        const ps = d.platformStage;
        const lines = [];
        // Create render buffer
        const buffer = [];
        for (let y = 0; y < GAME_AREA.height; y++) {
            buffer[y] = [];
            for (let x = 0; x < GAME_AREA.width; x++) {
                buffer[y][x] = ' ';
            }
        }
        // Draw tree trunk (in center)
        const trunkX = 38;
        for (let y = 0; y < GAME_AREA.height - 1; y++) {
            buffer[y][trunkX] = '|';
            buffer[y][trunkX + 1] = '|';
            buffer[y][trunkX + 2] = '|';
        }
        // Draw tree top
        for (let x = trunkX - 5; x <= trunkX + 7; x++) {
            buffer[0][x] = '^';
            buffer[1][x] = '*';
        }
        // Draw Zelda
        const zeldaScreenY = ps.zelda.y - GAME_AREA.top;
        if (zeldaScreenY >= 0 && zeldaScreenY < buffer.length) {
            buffer[zeldaScreenY][ps.zelda.x] = CHARS.zelda;
        }
        // Draw monkey
        const monkeyScreenY = ps.monkey.y - GAME_AREA.top;
        if (monkeyScreenY >= 0 && monkeyScreenY < buffer.length) {
            buffer[monkeyScreenY][ps.monkey.x] = CHARS.monkey;
        }
        // Draw platforms
        for (const platform of ps.platforms) {
            const screenY = platform.y - GAME_AREA.top;
            if (screenY >= 0 && screenY < buffer.length) {
                for (let x = 0; x < platform.width; x++) {
                    const px = Math.floor(platform.x) + x;
                    if (px >= 0 && px < GAME_AREA.width) {
                        buffer[screenY][px] = '=';
                    }
                }
            }
        }
        // Draw coconuts
        for (const coconut of ps.coconuts) {
            const screenY = Math.floor(coconut.y) - GAME_AREA.top;
            const screenX = Math.floor(coconut.x);
            if (screenY >= 0 && screenY < buffer.length && screenX >= 0 && screenX < GAME_AREA.width) {
                buffer[screenY][screenX] = CHARS.coconut;
            }
        }
        // Draw ground
        for (let x = 0; x < GAME_AREA.width; x++) {
            buffer[GAME_AREA.height - 1][x] = '#';
        }
        // Draw Zeke
        const zekeScreenY = d.zeke.y - GAME_AREA.top;
        if (zekeScreenY >= 0 && zekeScreenY < buffer.length) {
            buffer[zekeScreenY][Math.floor(d.zeke.x)] = CHARS.zeke;
        }
        // Convert buffer to tagged string
        for (let y = 0; y < buffer.length; y++) {
            let line = '';
            for (let x = 0; x < buffer[y].length; x++) {
                const char = buffer[y][x];
                if (char === CHARS.zeke) {
                    line += `{${COLORS.zeke}-fg}${char}{/}`;
                }
                else if (char === CHARS.zelda) {
                    line += `{${COLORS.zelda}-fg}${char}{/}`;
                }
                else if (char === CHARS.monkey) {
                    line += `{${COLORS.monkey}-fg}${char}{/}`;
                }
                else if (char === CHARS.coconut) {
                    line += `{${COLORS.coconut}-fg}${char}{/}`;
                }
                else if (char === '=' || char === '#') {
                    line += `{green-fg}${char}{/}`;
                }
                else if (char === '|' || char === '^' || char === '*') {
                    line += `{yellow-fg}${char}{/}`;
                }
                else {
                    line += char;
                }
            }
            lines.push(line);
        }
        this.renderCallback(lines.join('\n'));
    }
}
