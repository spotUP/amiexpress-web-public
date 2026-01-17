/**
 * Zoo Keeper - Game Constants
 * All game parameters based on original 1982 Taito arcade specifications
 */
// Display dimensions (neo-blessed terminal)
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
// Game area (inside borders)
export const GAME_AREA = {
    top: 1, // Below HUD
    left: 0,
    width: 80,
    height: 19, // Leave room for footer
    bottom: 20
};
// Zoo stage perimeter dimensions
export const ZOO_PERIMETER = {
    outerTop: 2,
    outerLeft: 1,
    outerRight: 78,
    outerBottom: 18,
    innerTop: 4,
    innerLeft: 5,
    innerRight: 74,
    innerBottom: 16
};
// Timing (in milliseconds)
export const GAME_TICK_MS = 33; // ~30 FPS
export const ZEKE_MOVE_DELAY = 100; // ms between moves
export const ANIMAL_MOVE_DELAY = 150; // Base animal move delay
export const JUMP_DURATION = 300; // Jump animation duration
export const DEATH_ANIMATION_FRAMES = 10;
export const TRANSITION_DURATION = 2000;
// Lives
export const STARTING_LIVES = 3;
export const EXTRA_LIFE_SCORE = 50000;
// Timer/fuse
export const BASE_TIMER_SECONDS = 60;
export const TIMER_REDUCTION_PER_LEVEL = 2; // Seconds less per level
export const MIN_TIMER_SECONDS = 30;
// Animal characteristics
export const ANIMAL_STATS = {
    elephant: { capturePoints: 250, speed: 2, strength: 1, char: 'E', color: 'gray' },
    snake: { capturePoints: 500, speed: 4, strength: 1, char: 'S', color: 'green' },
    camel: { capturePoints: 1000, speed: 4, strength: 2, char: 'C', color: 'yellow' },
    rhino: { capturePoints: 2000, speed: 6, strength: 3, char: 'R', color: 'gray' },
    moose: { capturePoints: 4000, speed: 6, strength: 3, char: 'M', color: 'yellow' },
    lion: { capturePoints: 30000, speed: 8, strength: 3, char: 'L', color: 'yellow' }
};
// Jump scoring (number of animals jumped at once)
export const JUMP_SCORES = {
    1: 100,
    2: 500,
    3: 2000,
    4: 6000,
    5: 15000,
    6: 30000,
    7: 60000,
    8: 120000,
    9: 250000,
    10: 500000,
    11: 1000000
};
// Bonus items
export const BONUS_ITEMS = {
    rootbeer: { points: 120, char: 'B', color: 'yellow', isNet: false },
    clover: { points: 300, char: 'C', color: 'green', isNet: false },
    watermelon: { points: 500, char: 'W', color: 'green', isNet: false },
    sundae: { points: 1000, char: 'S', color: 'white', isNet: false },
    strawberry: { points: 2500, char: 'T', color: 'red', isNet: false },
    trophy: { points: 5000, char: 'Y', color: 'yellow', isNet: false },
    money: { points: 7500, char: '$', color: 'green', isNet: false },
    net: { points: 0, char: 'N', color: 'cyan', isNet: true }
};
// Net powerup duration (in game ticks)
export const NET_DURATION_TICKS = 300; // ~10 seconds at 30fps
// Wall visual characters
export const WALL_CHARS = {
    0: ' ', // Broken/gap
    1: '.', // Weak
    2: '+', // Medium
    3: '#' // Strong
};
// Wall colors by thickness
export const WALL_COLORS = {
    0: 'black',
    1: 'red',
    2: 'yellow',
    3: 'white'
};
// Level configurations
export const LEVEL_CONFIGS = [
    // Level 1: Easy start
    {
        animalTypes: ['elephant'],
        animalCount: 3,
        animalSpeedMultiplier: 1.0,
        wallStartingThickness: 3,
        timerDuration: 60,
        bonusItemCount: 4
    },
    // Level 2: Add snakes
    {
        animalTypes: ['elephant', 'snake'],
        animalCount: 4,
        animalSpeedMultiplier: 1.0,
        wallStartingThickness: 3,
        timerDuration: 58,
        bonusItemCount: 4
    },
    // Level 3: Add camels
    {
        animalTypes: ['elephant', 'snake', 'camel'],
        animalCount: 5,
        animalSpeedMultiplier: 1.1,
        wallStartingThickness: 2,
        timerDuration: 55,
        bonusItemCount: 5
    },
    // Level 4: Add rhinos
    {
        animalTypes: ['elephant', 'snake', 'camel', 'rhino'],
        animalCount: 5,
        animalSpeedMultiplier: 1.2,
        wallStartingThickness: 2,
        timerDuration: 52,
        bonusItemCount: 5
    },
    // Level 5: Add moose
    {
        animalTypes: ['elephant', 'snake', 'camel', 'rhino', 'moose'],
        animalCount: 6,
        animalSpeedMultiplier: 1.3,
        wallStartingThickness: 2,
        timerDuration: 50,
        bonusItemCount: 6
    },
    // Level 6+: Add lions, full difficulty
    {
        animalTypes: ['elephant', 'snake', 'camel', 'rhino', 'moose', 'lion'],
        animalCount: 7,
        animalSpeedMultiplier: 1.5,
        wallStartingThickness: 1,
        timerDuration: 45,
        bonusItemCount: 6
    }
];
// Get level config (caps at highest defined)
export function getLevelConfig(level) {
    const index = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
    return LEVEL_CONFIGS[index];
}
// Platform stage constants
export const PLATFORM_STAGE = {
    platformCount: 5,
    platformWidth: 8,
    platformSpacing: 3,
    platformSpeed: 2,
    coconutSpeed: 3,
    coconutGravity: 0.5,
    maxCoconuts: 3,
    throwInterval: 2000, // ms between coconut throws
    zeldaY: 2,
    monkeyY: 3
};
// Stampede stage constants
export const STAMPEDE_STAGE = {
    escalatorSpeed: 1,
    animalWaveInterval: 1500, // ms between animal waves
    animalsPerWave: 3,
    escalatorHeight: 16,
    extraLifeAtTop: true
};
// Character display
export const CHARS = {
    zeke: '@',
    zekeWithNet: '@', // Same char, different color
    zelda: 'Z',
    monkey: 'm',
    coconut: 'o',
    fuse: '=',
    fuseEnd: '*',
    corner: '+',
    horizontal: '-',
    vertical: '|',
    empty: ' '
};
// Colors
export const COLORS = {
    zeke: 'cyan',
    zekeWithNet: 'magenta',
    zelda: 'magenta',
    monkey: 'yellow',
    coconut: 'yellow',
    fuse: 'red',
    fuseEnd: 'yellow',
    hud: 'white',
    score: 'yellow',
    lives: 'red',
    level: 'cyan',
    timer: 'red',
    menuTitle: 'yellow',
    menuItem: 'white',
    menuSelected: 'cyan',
    gameOver: 'red',
    highScore: 'yellow'
};
// Menu options
export const MENU_OPTIONS = [
    'Start Game',
    'High Scores',
    'Help',
    'Quit'
];
// High score defaults
export const DEFAULT_HIGHSCORES = [
    { name: 'ZKE', score: 50000, level: 5, date: '1982-01-01' },
    { name: 'TAI', score: 40000, level: 4, date: '1982-01-01' },
    { name: 'TOE', score: 30000, level: 3, date: '1982-01-01' },
    { name: 'AAA', score: 20000, level: 2, date: '1982-01-01' },
    { name: 'BBB', score: 10000, level: 1, date: '1982-01-01' }
];
// Max high scores to keep
export const MAX_HIGHSCORES = 10;
// Name entry max length
export const MAX_NAME_LENGTH = 3;
