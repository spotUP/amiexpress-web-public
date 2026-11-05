/**
 * Pipe Dream - Game Constants
 */
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 7;
export const GAME_TICK_MS = 100;
export const QUEUE_SIZE = 5;
// Timing
export const BASE_FLOW_DELAY = 50; // Ticks before flow starts
export const BASE_FLOW_SPEED = 5; // Fill rate per tick
// Scoring
export const SCORES = {
    pipeUsed: 50,
    pipeFilled: 100,
    crossFilled: 200,
    reservoirFilled: 300,
    reachedEnd: 500,
    levelBonus: 1000,
    unusedQueue: 25,
};
// Pipe connections map
export const PIPE_CONNECTIONS = {
    vertical: { up: true, down: true, left: false, right: false },
    horizontal: { up: false, down: false, left: true, right: true },
    cornerNE: { up: true, down: false, left: false, right: true },
    cornerNW: { up: true, down: false, left: true, right: false },
    cornerSE: { up: false, down: true, left: false, right: true },
    cornerSW: { up: false, down: true, left: true, right: false },
    cross: { up: true, down: true, left: true, right: true },
    start: { up: false, down: false, left: false, right: false }, // Set dynamically
    end: { up: true, down: true, left: true, right: true },
    reservoir: { up: true, down: true, left: true, right: true },
    oneWay: { up: false, down: true, left: false, right: false }, // Set dynamically
};
// Pipe sprites (3x3 ASCII art for each pipe)
export const PIPE_SPRITES = {
    vertical: [
        ' | ',
        ' | ',
        ' | ',
    ],
    horizontal: [
        '   ',
        '---',
        '   ',
    ],
    cornerNE: [
        ' +-',
        ' | ',
        '   ',
    ],
    cornerNW: [
        '-+ ',
        ' | ',
        '   ',
    ],
    cornerSE: [
        '   ',
        ' | ',
        ' +-',
    ],
    cornerSW: [
        '   ',
        ' | ',
        '-+ ',
    ],
    cross: [
        ' | ',
        '-+-',
        ' | ',
    ],
    start: [
        '[S]',
        '[>]',
        '[S]',
    ],
    end: [
        '[E]',
        '[E]',
        '[E]',
    ],
    reservoir: [
        '###',
        '# #',
        '###',
    ],
    oneWay: [
        ' v ',
        ' | ',
        ' v ',
    ],
};
// Simple pipe chars for compact display
export const PIPE_CHARS = {
    vertical: '|',
    horizontal: '-',
    cornerNE: 'L',
    cornerNW: 'J',
    cornerSE: 'r',
    cornerSW: '7',
    cross: '+',
    start: 'S',
    end: 'E',
    reservoir: '#',
    oneWay: 'v',
};
// Opposite directions
export const OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
};
// Direction vectors
export const DIRECTION_VECTORS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};
// Basic pipe types that appear in queue (no start/end/special)
export const BASIC_PIPES = [
    'vertical',
    'horizontal',
    'cornerNE',
    'cornerNW',
    'cornerSE',
    'cornerSW',
];
// Level configurations
export const LEVEL_CONFIGS = [
    { gridWidth: 7, gridHeight: 5, flowSpeed: 3, flowDelay: 60, requiredPipes: 8, obstacleCount: 0, hasReservoirs: false, hasCross: false, hasOneWay: false },
    { gridWidth: 8, gridHeight: 5, flowSpeed: 4, flowDelay: 55, requiredPipes: 10, obstacleCount: 2, hasReservoirs: false, hasCross: true, hasOneWay: false },
    { gridWidth: 8, gridHeight: 6, flowSpeed: 4, flowDelay: 50, requiredPipes: 12, obstacleCount: 3, hasReservoirs: true, hasCross: true, hasOneWay: false },
    { gridWidth: 9, gridHeight: 6, flowSpeed: 5, flowDelay: 45, requiredPipes: 14, obstacleCount: 4, hasReservoirs: true, hasCross: true, hasOneWay: true },
    { gridWidth: 10, gridHeight: 7, flowSpeed: 5, flowDelay: 40, requiredPipes: 16, obstacleCount: 5, hasReservoirs: true, hasCross: true, hasOneWay: true },
];
export function getLevelConfig(level) {
    const index = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
    const config = { ...LEVEL_CONFIGS[index] };
    // Scale difficulty for higher levels
    if (level > LEVEL_CONFIGS.length) {
        const extra = level - LEVEL_CONFIGS.length;
        config.flowSpeed = Math.min(8, config.flowSpeed + Math.floor(extra / 2));
        config.flowDelay = Math.max(25, config.flowDelay - extra * 2);
        config.requiredPipes = config.requiredPipes + extra * 2;
        config.obstacleCount = Math.min(10, config.obstacleCount + Math.floor(extra / 2));
    }
    return config;
}
export function getPipesForLevel(level) {
    const config = getLevelConfig(level);
    const pipes = [...BASIC_PIPES];
    if (config.hasCross)
        pipes.push('cross');
    // Reservoirs and one-way spawn differently (placed on grid)
    return pipes;
}
export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];
export const DEFAULT_HIGHSCORES = [
    { name: 'PLM', score: 50000, level: 8, date: '2024-01-01' },
    { name: 'FLO', score: 35000, level: 6, date: '2024-01-01' },
    { name: 'PIP', score: 20000, level: 4, date: '2024-01-01' },
    { name: 'DRN', score: 10000, level: 3, date: '2024-01-01' },
    { name: 'OOZ', score: 5000, level: 2, date: '2024-01-01' },
];
