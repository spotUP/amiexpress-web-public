/**
 * Donkey Kong - Game Constants
 */
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GAME_WIDTH = 32;
export const GAME_HEIGHT = 22;
export const GAME_TICK_MS = 50;
export const STARTING_LIVES = 3;
// Physics
export const GRAVITY = 0.2;
export const JUMP_POWER = -1.0;
export const PLAYER_SPEED = 0.4;
export const CLIMB_SPEED = 0.3;
export const MAX_FALL_SPEED = 1.0;
export const BARREL_SPEED = 0.35;
export const FIREBALL_SPEED = 0.25;
// Timing
export const HAMMER_DURATION = 180;
export const BARREL_SPAWN_RATE = 120;
export const SPRING_SPAWN_RATE = 150;
export const FIREBALL_SPAWN_RATE = 200;
export const BONUS_START = 5000;
export const BONUS_DECREMENT = 100;
export const BONUS_INTERVAL = 30;
export const RESPAWN_TIME = 60;
export const INVINCIBLE_TIME = 90;
// Scoring
export const SCORES = {
    barrel: 100,
    fireball: 200,
    spring: 300,
    hammer: 0,
    rivet: 100,
    pauline: 0,
    bonus: 1,
    jump: 100,
};
// Stage order
export const STAGE_ORDER = ['barrels', 'conveyors', 'elevators', 'rivets'];
// Characters
export const SPRITES = {
    player: 'M',
    playerClimb: 'H',
    playerHammer: 'T',
    barrel: 'O',
    blueBarrel: '@',
    fireball: 'F',
    spring: 'S',
    dk: 'K',
    pauline: 'P',
    girder: '=',
    ladder: 'H',
    ladderBroken: ':',
    rivet: 'o',
    hammer: 't',
    elevator: '[',
    conveyor: '-',
};
// Barrels Stage (25m)
const BARRELS_STAGE = {
    girders: [
        // Bottom
        { x: 0, y: 20, width: 32, slope: 0 },
        // Sloped platforms going up
        { x: 2, y: 17, width: 28, slope: 0.1 },
        { x: 2, y: 14, width: 28, slope: -0.1 },
        { x: 2, y: 11, width: 28, slope: 0.1 },
        { x: 2, y: 8, width: 28, slope: -0.1 },
        { x: 2, y: 5, width: 28, slope: 0.1 },
        // Top platform
        { x: 8, y: 2, width: 16, slope: 0 },
    ],
    ladders: [
        { x: 28, y: 17, height: 3, isBroken: false },
        { x: 6, y: 14, height: 3, isBroken: false },
        { x: 20, y: 14, height: 3, isBroken: true },
        { x: 26, y: 11, height: 3, isBroken: false },
        { x: 10, y: 11, height: 3, isBroken: true },
        { x: 6, y: 8, height: 3, isBroken: false },
        { x: 22, y: 8, height: 3, isBroken: false },
        { x: 16, y: 5, height: 3, isBroken: false },
        { x: 14, y: 2, height: 3, isBroken: false },
    ],
    rivets: [],
    hammers: [
        { x: 6, y: 16, isCollected: false },
        { x: 26, y: 10, isCollected: false },
    ],
    elevators: [],
    conveyors: [],
    paulineX: 16,
    paulineY: 1,
    dkX: 4,
    dkY: 3,
    startX: 4,
    startY: 19,
};
// Conveyors Stage (50m)
const CONVEYORS_STAGE = {
    girders: [
        { x: 0, y: 20, width: 32, slope: 0 },
        { x: 4, y: 16, width: 24, slope: 0 },
        { x: 0, y: 12, width: 14, slope: 0 },
        { x: 18, y: 12, width: 14, slope: 0 },
        { x: 4, y: 8, width: 24, slope: 0 },
        { x: 8, y: 4, width: 16, slope: 0 },
        { x: 12, y: 1, width: 8, slope: 0 },
    ],
    ladders: [
        { x: 8, y: 16, height: 4, isBroken: false },
        { x: 22, y: 16, height: 4, isBroken: false },
        { x: 4, y: 12, height: 4, isBroken: false },
        { x: 26, y: 12, height: 4, isBroken: false },
        { x: 12, y: 8, height: 4, isBroken: false },
        { x: 18, y: 8, height: 4, isBroken: false },
        { x: 15, y: 4, height: 3, isBroken: false },
    ],
    rivets: [],
    hammers: [
        { x: 6, y: 15, isCollected: false },
    ],
    elevators: [],
    conveyors: [
        { x: 4, y: 16, width: 24, direction: 'right' },
        { x: 4, y: 8, width: 24, direction: 'left' },
    ],
    paulineX: 15,
    paulineY: 0,
    dkX: 4,
    dkY: 6,
    startX: 4,
    startY: 19,
};
// Elevators Stage (75m)
const ELEVATORS_STAGE = {
    girders: [
        { x: 0, y: 20, width: 10, slope: 0 },
        { x: 22, y: 20, width: 10, slope: 0 },
        { x: 0, y: 16, width: 8, slope: 0 },
        { x: 24, y: 16, width: 8, slope: 0 },
        { x: 0, y: 12, width: 10, slope: 0 },
        { x: 22, y: 12, width: 10, slope: 0 },
        { x: 4, y: 8, width: 24, slope: 0 },
        { x: 10, y: 4, width: 12, slope: 0 },
        { x: 13, y: 1, width: 6, slope: 0 },
    ],
    ladders: [
        { x: 4, y: 16, height: 4, isBroken: false },
        { x: 26, y: 16, height: 4, isBroken: false },
        { x: 8, y: 8, height: 4, isBroken: false },
        { x: 22, y: 8, height: 4, isBroken: false },
        { x: 15, y: 4, height: 3, isBroken: false },
    ],
    rivets: [],
    hammers: [],
    elevators: [
        { x: 12, y: 8, direction: 'up', height: 12 },
        { x: 18, y: 8, direction: 'down', height: 12 },
    ],
    conveyors: [],
    paulineX: 15,
    paulineY: 0,
    dkX: 4,
    dkY: 6,
    startX: 4,
    startY: 19,
};
// Rivets Stage (100m)
const RIVETS_STAGE = {
    girders: [
        { x: 0, y: 20, width: 32, slope: 0 },
        { x: 6, y: 16, width: 20, slope: 0 },
        { x: 4, y: 12, width: 24, slope: 0 },
        { x: 6, y: 8, width: 20, slope: 0 },
        { x: 8, y: 4, width: 16, slope: 0 },
        { x: 12, y: 1, width: 8, slope: 0 },
    ],
    ladders: [
        { x: 8, y: 16, height: 4, isBroken: false },
        { x: 22, y: 16, height: 4, isBroken: false },
        { x: 6, y: 12, height: 4, isBroken: false },
        { x: 24, y: 12, height: 4, isBroken: false },
        { x: 10, y: 8, height: 4, isBroken: false },
        { x: 20, y: 8, height: 4, isBroken: false },
        { x: 15, y: 4, height: 3, isBroken: false },
    ],
    rivets: [
        { x: 8, y: 16, isRemoved: false },
        { x: 24, y: 16, isRemoved: false },
        { x: 6, y: 12, isRemoved: false },
        { x: 26, y: 12, isRemoved: false },
        { x: 8, y: 8, isRemoved: false },
        { x: 24, y: 8, isRemoved: false },
        { x: 10, y: 4, isRemoved: false },
        { x: 22, y: 4, isRemoved: false },
    ],
    hammers: [
        { x: 4, y: 19, isCollected: false },
        { x: 26, y: 11, isCollected: false },
    ],
    elevators: [],
    conveyors: [],
    paulineX: 15,
    paulineY: 0,
    dkX: 15,
    dkY: 2,
    startX: 4,
    startY: 19,
};
export const STAGES = {
    barrels: BARRELS_STAGE,
    conveyors: CONVEYORS_STAGE,
    elevators: ELEVATORS_STAGE,
    rivets: RIVETS_STAGE,
};
export function getStageData(level, stageIndex) {
    // In higher levels, stages rotate faster and get harder
    const stageType = STAGE_ORDER[stageIndex % STAGE_ORDER.length];
    const baseData = STAGES[stageType];
    // Deep copy
    const data = {
        ...baseData,
        girders: baseData.girders.map(g => ({ ...g })),
        ladders: baseData.ladders.map(l => ({ ...l })),
        rivets: baseData.rivets.map(r => ({ ...r })),
        hammers: baseData.hammers.map(h => ({ ...h })),
        elevators: baseData.elevators.map(e => ({ ...e })),
        conveyors: baseData.conveyors.map(c => ({ ...c })),
    };
    return { stage: stageType, data };
}
export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];
export const DEFAULT_HIGHSCORES = [
    { name: 'DK!', score: 100000, level: 4, date: '2024-01-01' },
    { name: 'ACE', score: 75000, level: 3, date: '2024-01-01' },
    { name: 'MRO', score: 50000, level: 2, date: '2024-01-01' },
    { name: 'JMP', score: 25000, level: 2, date: '2024-01-01' },
    { name: 'PLN', score: 10000, level: 1, date: '2024-01-01' },
];
