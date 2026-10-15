"use strict";
/**
 * Galaga - Game Constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIVE_PATHS = exports.DEFAULT_HIGHSCORES = exports.MENU_OPTIONS = exports.STAGE_CONFIGS = exports.FORMATION_LAYOUT = exports.SPRITES = exports.COLORS = exports.SCORES = exports.ALIEN_DIVE_FREQUENCY = exports.ALIEN_DIVE_SPEED = exports.ENEMY_BULLET_SPEED = exports.PLAYER_BULLET_SPEED = exports.FORMATION_SWAY_AMOUNT = exports.FORMATION_SWAY_SPEED = exports.FORMATION_SPACING_Y = exports.FORMATION_SPACING_X = exports.FORMATION_START_Y = exports.FORMATION_COLS = exports.FORMATION_ROWS = exports.MAX_PLAYER_BULLETS = exports.PLAYER_SPEED = exports.PLAYER_Y = exports.STARTING_LIVES = exports.GAME_TICK_MS = exports.GAME_AREA_HEIGHT = exports.GAME_AREA_WIDTH = exports.SCREEN_HEIGHT = exports.SCREEN_WIDTH = void 0;
exports.getStageConfig = getStageConfig;
// Screen dimensions
exports.SCREEN_WIDTH = 80;
exports.SCREEN_HEIGHT = 24;
exports.GAME_AREA_WIDTH = 60;
exports.GAME_AREA_HEIGHT = 20;
// Game timing
exports.GAME_TICK_MS = 33; // ~30 FPS
// Player settings
exports.STARTING_LIVES = 3;
exports.PLAYER_Y = exports.GAME_AREA_HEIGHT - 2;
exports.PLAYER_SPEED = 2;
exports.MAX_PLAYER_BULLETS = 2;
// Formation settings
exports.FORMATION_ROWS = 5;
exports.FORMATION_COLS = 10;
exports.FORMATION_START_Y = 3;
exports.FORMATION_SPACING_X = 4;
exports.FORMATION_SPACING_Y = 2;
exports.FORMATION_SWAY_SPEED = 0.5;
exports.FORMATION_SWAY_AMOUNT = 5;
// Bullet settings
exports.PLAYER_BULLET_SPEED = -2;
exports.ENEMY_BULLET_SPEED = 1;
// Alien settings
exports.ALIEN_DIVE_SPEED = 0.8;
exports.ALIEN_DIVE_FREQUENCY = 2000; // ms between dive attempts
// Scoring
exports.SCORES = {
    bee: 50, // Bee in formation
    beeSwoop: 100, // Bee while diving
    butterfly: 80, // Butterfly in formation
    butterflySwoop: 160, // Butterfly while diving
    boss: 150, // Boss first hit
    bossKill: 400, // Boss killed (no capture)
    bossKillWithFighter: 1600, // Boss killed that captured your ship
    dualFighter: 1000, // Bonus for getting dual fighter
    challengingPerfect: 10000, // All 40 enemies in challenging stage
    challengingBonus: 100, // Per enemy in challenging stage
};
// Colors
exports.COLORS = {
    player: 'cyan',
    playerBullet: 'white',
    bee: 'yellow',
    butterfly: 'red',
    boss: 'green',
    bossWing: 'blue',
    captured: 'cyan',
    tractorBeam: 'yellow',
    explosion: 'yellow',
    star: 'white',
};
// Sprites (ASCII)
exports.SPRITES = {
    player: ['^', 'A'],
    dualPlayer: ['^A^'],
    bee: ['w'],
    butterfly: ['M'],
    boss: ['@'],
    bossWithCaptured: ['@A'],
    bullet: ['|'],
    enemyBullet: ['.'],
    explosion: ['*', '+', 'o', '.'],
    star: ['.', '*', '+'],
};
// Formation layout (which alien types in each row)
exports.FORMATION_LAYOUT = [
    // Row 0: Bosses (4 in center)
    [null, null, null, 'boss', 'boss', 'boss', 'boss', null, null, null],
    // Row 1: Butterflies
    ['butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly'],
    // Row 2: Butterflies
    ['butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly'],
    // Row 3: Bees
    ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'],
    // Row 4: Bees
    ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'],
];
// Stage configurations
exports.STAGE_CONFIGS = [
    // Stage 1
    {
        bees: 20,
        butterflies: 16,
        bosses: 4,
        diveFrequency: 3000,
        alienSpeed: 0.5,
        bulletSpeed: 0.8,
        isChallengingStage: false,
    },
    // Stage 2
    {
        bees: 20,
        butterflies: 16,
        bosses: 4,
        diveFrequency: 2500,
        alienSpeed: 0.6,
        bulletSpeed: 0.9,
        isChallengingStage: false,
    },
    // Stage 3 - Challenging
    {
        bees: 20,
        butterflies: 16,
        bosses: 4,
        diveFrequency: 0,
        alienSpeed: 0.8,
        bulletSpeed: 0,
        isChallengingStage: true,
    },
    // Stage 4
    {
        bees: 20,
        butterflies: 16,
        bosses: 4,
        diveFrequency: 2000,
        alienSpeed: 0.7,
        bulletSpeed: 1.0,
        isChallengingStage: false,
    },
    // Stage 5+
    {
        bees: 20,
        butterflies: 16,
        bosses: 4,
        diveFrequency: 1500,
        alienSpeed: 0.8,
        bulletSpeed: 1.2,
        isChallengingStage: false,
    },
];
/**
 * Get stage configuration
 */
function getStageConfig(stage) {
    // Every 3rd stage is challenging
    if (stage % 3 === 0) {
        return {
            ...exports.STAGE_CONFIGS[2], // Challenging template
            alienSpeed: 0.6 + (Math.floor(stage / 3) * 0.1),
        };
    }
    const index = Math.min(stage - 1, exports.STAGE_CONFIGS.length - 1);
    const config = { ...exports.STAGE_CONFIGS[index] };
    // Scale difficulty for higher stages
    if (stage > 5) {
        const scaleFactor = 1 + (stage - 5) * 0.1;
        config.diveFrequency = Math.max(800, config.diveFrequency / scaleFactor);
        config.alienSpeed = Math.min(1.5, config.alienSpeed * scaleFactor);
        config.bulletSpeed = Math.min(2.0, config.bulletSpeed * scaleFactor);
    }
    return config;
}
// Menu options
exports.MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];
// Default high scores
exports.DEFAULT_HIGHSCORES = [
    { name: 'ACE', score: 50000, stage: 10, date: '2024-01-01' },
    { name: 'BOB', score: 40000, stage: 8, date: '2024-01-01' },
    { name: 'CAT', score: 30000, stage: 6, date: '2024-01-01' },
    { name: 'DAN', score: 20000, stage: 4, date: '2024-01-01' },
    { name: 'EVE', score: 10000, stage: 2, date: '2024-01-01' },
];
// Dive paths (predefined attack patterns)
exports.DIVE_PATHS = {
    swoopLeft: [
        { x: 0, y: 1 }, { x: -2, y: 2 }, { x: -4, y: 4 },
        { x: -3, y: 6 }, { x: 0, y: 8 }, { x: 3, y: 10 },
        { x: 5, y: 12 }, { x: 3, y: 14 }, { x: 0, y: 16 },
    ],
    swoopRight: [
        { x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 4 },
        { x: 3, y: 6 }, { x: 0, y: 8 }, { x: -3, y: 10 },
        { x: -5, y: 12 }, { x: -3, y: 14 }, { x: 0, y: 16 },
    ],
    captureRun: [
        { x: 0, y: 2 }, { x: 0, y: 4 }, { x: 0, y: 6 },
        { x: 0, y: 8 }, { x: 0, y: 10 }, { x: 0, y: 12 },
    ],
};
//# sourceMappingURL=constants.js.map