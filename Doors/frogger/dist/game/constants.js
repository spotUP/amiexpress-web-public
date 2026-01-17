"use strict";
/**
 * Frogger - Game Constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPRITES = exports.DEFAULT_HIGHSCORES = exports.MENU_OPTIONS = exports.LEVEL_CONFIGS = exports.COLORS = exports.SCORES = exports.OBJECT_WIDTHS = exports.TURTLE_SURFACE_DURATION = exports.TURTLE_DIVE_DURATION = exports.RIVER_OBJECT_SPAWN_INTERVAL = exports.VEHICLE_SPAWN_INTERVAL = exports.HOME_POSITIONS = exports.LANE_CONFIG = exports.GRID_HEIGHT = exports.GRID_WIDTH = exports.EXTRA_LIFE_SCORE = exports.STARTING_LIVES = exports.INITIAL_TIME = exports.GAME_TICK_MS = exports.GAME_AREA_HEIGHT = exports.SCREEN_HEIGHT = exports.SCREEN_WIDTH = void 0;
exports.getLevelConfig = getLevelConfig;
// Screen dimensions
exports.SCREEN_WIDTH = 80;
exports.SCREEN_HEIGHT = 24;
exports.GAME_AREA_HEIGHT = 18;
// Game timing
exports.GAME_TICK_MS = 50; // 20 FPS
exports.INITIAL_TIME = 60; // Seconds per level
// Player settings
exports.STARTING_LIVES = 3;
exports.EXTRA_LIFE_SCORE = 10000;
// Grid settings (logical grid, not screen)
exports.GRID_WIDTH = 40; // 2 chars per cell
exports.GRID_HEIGHT = 13; // Total lanes including safe zones
// Lane layout (from bottom to top)
exports.LANE_CONFIG = [
    { type: 'safe', y: 12 }, // Start area
    { type: 'road', y: 11, dir: -1, speed: 1.5 }, // Lane 1 - slow cars left
    { type: 'road', y: 10, dir: 1, speed: 2.0 }, // Lane 2 - cars right
    { type: 'road', y: 9, dir: -1, speed: 1.0 }, // Lane 3 - trucks left
    { type: 'road', y: 8, dir: 1, speed: 2.5 }, // Lane 4 - fast cars right
    { type: 'road', y: 7, dir: -1, speed: 3.0 }, // Lane 5 - race cars left
    { type: 'safe', y: 6 }, // Median/safe zone
    { type: 'water', y: 5, dir: 1, speed: 1.0 }, // River 1 - logs right
    { type: 'water', y: 4, dir: -1, speed: 2.0 }, // River 2 - turtles left
    { type: 'water', y: 3, dir: 1, speed: 1.5 }, // River 3 - logs right
    { type: 'water', y: 2, dir: -1, speed: 2.5 }, // River 4 - turtles left
    { type: 'water', y: 1, dir: 1, speed: 1.0 }, // River 5 - logs right
    { type: 'home', y: 0 }, // Home row
];
// Home slots positions (5 homes)
exports.HOME_POSITIONS = [4, 12, 20, 28, 36];
// Vehicle spawn rates (per lane)
exports.VEHICLE_SPAWN_INTERVAL = 3000; // ms
// River object spawn rates
exports.RIVER_OBJECT_SPAWN_INTERVAL = 2500;
// Turtle dive timing
exports.TURTLE_DIVE_DURATION = 2000; // ms underwater
exports.TURTLE_SURFACE_DURATION = 4000; // ms above water
// Object widths (in grid cells)
exports.OBJECT_WIDTHS = {
    car: 2,
    truck: 3,
    racecar: 2,
    log: 4,
    turtle: 2,
    alligator: 3,
    snake: 2,
};
// Scoring
exports.SCORES = {
    hop: 10, // Each forward hop
    home: 50, // Reaching a home
    fly: 200, // Eating bonus fly
    levelComplete: 1000, // All 5 homes filled
    timeBonus: 10, // Per second remaining
};
// Colors for rendering
exports.COLORS = {
    frog: 'green',
    car: 'red',
    truck: 'yellow',
    racecar: 'magenta',
    log: 'yellow',
    turtle: 'green',
    water: 'blue',
    road: 'black',
    safe: 'green',
    home: 'cyan',
};
// Level configurations
exports.LEVEL_CONFIGS = [
    // Level 1
    {
        vehicleSpeed: 1.0,
        riverSpeed: 1.0,
        turtleDiveFrequency: 0, // No diving on level 1
        timeLimit: 60,
        flySpawnChance: 0.1,
        alligatorChance: 0,
    },
    // Level 2
    {
        vehicleSpeed: 1.2,
        riverSpeed: 1.2,
        turtleDiveFrequency: 0.1,
        timeLimit: 55,
        flySpawnChance: 0.15,
        alligatorChance: 0.05,
    },
    // Level 3
    {
        vehicleSpeed: 1.4,
        riverSpeed: 1.3,
        turtleDiveFrequency: 0.2,
        timeLimit: 50,
        flySpawnChance: 0.2,
        alligatorChance: 0.1,
    },
    // Level 4
    {
        vehicleSpeed: 1.6,
        riverSpeed: 1.4,
        turtleDiveFrequency: 0.25,
        timeLimit: 45,
        flySpawnChance: 0.25,
        alligatorChance: 0.15,
    },
    // Level 5+ (repeats with increasing difficulty)
    {
        vehicleSpeed: 1.8,
        riverSpeed: 1.5,
        turtleDiveFrequency: 0.3,
        timeLimit: 40,
        flySpawnChance: 0.3,
        alligatorChance: 0.2,
    },
];
// Get level config (cycles after level 5)
function getLevelConfig(level) {
    const index = Math.min(level - 1, exports.LEVEL_CONFIGS.length - 1);
    const config = { ...exports.LEVEL_CONFIGS[index] };
    // Scale difficulty for levels beyond 5
    if (level > 5) {
        const scaleFactor = 1 + (level - 5) * 0.1;
        config.vehicleSpeed *= scaleFactor;
        config.riverSpeed *= scaleFactor;
        config.timeLimit = Math.max(30, config.timeLimit - (level - 5) * 2);
    }
    return config;
}
// Menu options
exports.MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];
// Default high scores
exports.DEFAULT_HIGHSCORES = [
    { name: 'ACE', score: 10000, level: 5, date: '2024-01-01' },
    { name: 'BOB', score: 8000, level: 4, date: '2024-01-01' },
    { name: 'CAT', score: 6000, level: 3, date: '2024-01-01' },
    { name: 'DAN', score: 4000, level: 2, date: '2024-01-01' },
    { name: 'EVE', score: 2000, level: 1, date: '2024-01-01' },
];
// Character sprites (using block sprite patterns)
exports.SPRITES = {
    frog: {
        idle: ['@'],
        hop: ['^', '@'],
    },
    car: ['##'],
    truck: ['###'],
    log: ['===='],
    turtle: ['oo'],
    home: ['[ ]'],
    homeOccupied: ['[*]'],
    fly: ['*'],
    water: ['~~'],
    road: ['..'],
};
//# sourceMappingURL=constants.js.map