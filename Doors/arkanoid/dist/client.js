/**
 * ARKANOID - Hybrid Door Client Component
 *
 * This is a port of the original server-side Arkanoid to the SDK client runtime.
 * It runs in the browser with:
 * - Real Web Audio sounds via SDK AudioEngine
 * - RPC calls to server for highscore persistence
 * - Same gameplay as the original
 *
 * Controls:
 * - Mouse: Move paddle (hover), Launch ball (click)
 * - Arrow keys or A/D: Move paddle
 * - Space: Launch ball / Pause
 * - Q: Quit to menu
 */
import { ClientDoor, AudioEngine, KeyStateTracker, ScreenBuffer, TrackerEngine, } from '@amiexpress/bbs-door-sdk/client';
import { GamepadInputManager } from '@amiexpress/bbs-door-sdk/utils/gamepad-input-manager';
import { stepBall } from './ball-physics';
import { easePaddle } from './paddle-motion';
import { trackForState } from './music-select';
import { horizontalBar, subcellPoint, dominantAxis } from '@amiexpress/bbs-door-sdk/engines/graphics/subcell';
import { expireTrails, trailIntensity, trailTier, } from '@amiexpress/bbs-door-sdk/engines/graphics/motion-trail';
// =============================================================================
// ANSI Escape Codes and Colors
// =============================================================================
const ESC = '\x1b';
const CSI = `${ESC}[`;
const ANSI = {
    hide: `${CSI}?25l`,
    show: `${CSI}?25h`,
    home: `${CSI}H`,
    clear: `${CSI}2J`,
    clearLine: `${CSI}2K`,
    goto: (x, y) => `${CSI}${y};${x}H`,
    fg: {
        black: `${CSI}30m`,
        red: `${CSI}31m`,
        green: `${CSI}32m`,
        yellow: `${CSI}33m`,
        blue: `${CSI}34m`,
        magenta: `${CSI}35m`,
        cyan: `${CSI}36m`,
        white: `${CSI}37m`,
        brightBlack: `${CSI}90m`,
        brightRed: `${CSI}91m`,
        brightGreen: `${CSI}92m`,
        brightYellow: `${CSI}93m`,
        brightBlue: `${CSI}94m`,
        brightMagenta: `${CSI}95m`,
        brightCyan: `${CSI}96m`,
        brightWhite: `${CSI}97m`,
    },
    bg: {
        black: `${CSI}40m`,
        red: `${CSI}41m`,
        green: `${CSI}42m`,
        yellow: `${CSI}43m`,
        blue: `${CSI}44m`,
        magenta: `${CSI}45m`,
        cyan: `${CSI}46m`,
        white: `${CSI}47m`,
        brightBlack: `${CSI}100m`,
        brightRed: `${CSI}101m`,
        brightGreen: `${CSI}102m`,
        brightYellow: `${CSI}103m`,
        brightBlue: `${CSI}104m`,
        brightMagenta: `${CSI}105m`,
        brightCyan: `${CSI}106m`,
        brightWhite: `${CSI}107m`,
    },
    reset: `${CSI}0m`,
    bold: `${CSI}1m`,
    dim: `${CSI}2m`,
    blink: `${CSI}5m`,
};
/**
 * Shade characters for the motion trail, thinning as the streak fades.
 * The solid blocks come from the SDK's subcell module - this door used to
 * carry its own unused copy of that table.
 */
const SHADE = {
    light: '\u2591',
    medium: '\u2592',
    dark: '\u2593',
};
/**
 * Foreground SGR for each background SGR. A half block is a GLYPH, so an
 * object drawn as a background colour has to be re-expressed as a foreground
 * one when it sits on a half-cell boundary. Derived from the ANSI table so
 * the two cannot drift apart.
 */
const FG_FOR_BG = Object.fromEntries(Object.keys(ANSI.bg).map(name => [
    ANSI.bg[name],
    ANSI.fg[name],
]));
// =============================================================================
// Game Constants
// =============================================================================
const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 24;
const GAME_LEFT = 2;
const GAME_TOP = 3;
const GAME_WIDTH = 76;
const GAME_HEIGHT = 19;
const GAME_RIGHT = GAME_LEFT + GAME_WIDTH - 1;
const GAME_BOTTOM = GAME_TOP + GAME_HEIGHT - 1;
const PADDLE_WIDTH_DEFAULT = 10;
const PADDLE_WIDTH_SMALL = 6;
const PADDLE_WIDTH_LARGE = 14;
const PADDLE_Y = GAME_BOTTOM - 1;
const PADDLE_SPEED = 2; // Reduced from 3 for smoother keyboard control
const BALL_SPEED_DEFAULT = 0.7; // Reduced 30% from 1.0
const BALL_SPEED_FAST = 1.05; // Reduced 30% from 1.5
const BALL_SPEED_SLOW = 0.42; // Reduced 30% from 0.6
const BRICK_WIDTH = 6;
const BRICK_HEIGHT = 1;
const BRICK_ROWS = 8;
const BRICK_COLS = 12;
const BRICK_START_Y = GAME_TOP + 2;
const BRICK_START_X = GAME_LEFT + 2;
const INITIAL_LIVES = 3;
const MAX_HIGHSCORES = 10;
// =============================================================================
// Level Patterns
// =============================================================================
const LEVEL_PATTERNS = [
    ['111111111111', '222222222222', '333333333333', '444444444444'],
    ['1.1.1.1.1.1.', '.2.2.2.2.2.2', '3.3.3.3.3.3.', '.4.4.4.4.4.4', '1.1.1.1.1.1.'],
    ['......11......', '.....2222.....', '....333333....', '...44444444...', '..1111111111..'],
    ['..1......1..', '...1....1...', '..11111111..', '.11.1111.11.', '111111111111', '1.11111111.1', '1.1......1.1', '...11..11...'],
    ['......1.....', '.....222....', '....33333...', '...4444444..', '....33333...', '.....222....', '......1.....'],
    ['121212121212', '212121212121', '343434343434', '434343434343', '121212121212', '212121212121'],
    ['.11....11...', '1111..1111..', '111111111111', '.1111111111.', '..11111111..', '...111111...', '....1111....', '.....11.....'],
    ['1..1..1..1..', '111111111111', '111111111111', '1111..111111', '1111..111111', '111111111111'],
    ['..22222222..', '.2222222222.', '2233223322..', '222222222222', '.2222222222.', '..2..2..2...', '..22222222..'],
    ['XXXXXXXXXXXX', '111111111111', '222222222222', '333333333333', '444444444444', 'XXXXXXXXXXXX'],
    ['111.........', '...222......', '......333...', '.........444', '......333...', '...222......', '111.........'],
    ['....1111....', '....1111....', '222211112222', '222211112222', '....1111....', '....1111....'],
    ['111111111111', '............1', '1111111111.1', '1..........1', '1.111111111.', '1.1.........', '1.1111111111'],
    ['123412341234', '234123412341', '341234123412', '412341234123', '123412341234'],
    ['X111111111X.', 'X1........X.', 'X1.222222.X.', 'X1.2....2.X.', 'X1.2....2.X.', 'X1.222222.X.', 'X1........X.', 'X111111111X.'],
    ['1.......1...', '.2.....2....', '..3...3.....', '...4.4......', '....4.......', '...4.4......', '..3...3.....', '.2.....2....'],
    ['111.111.222.', '1..1.1.2...2', '111..1..222.', '1..1.1....2.', '111.111.222.'],
    ['X1X1X1X1X1X1', '1.1.1.1.1.1.', 'X1X1X1X1X1X1', '.1.1.1.1.1.1', 'X1X1X1X1X1X1', '1.1.1.1.1.1.'],
    ['XXXXXXXXXXXX', 'X1111111111X', 'X2222222222X', 'X3333333333X', 'X4444444444X', 'XXXXXXXXXXXX'],
    ['4X4X4X4X4X4X', 'X4X4X4X4X4X4', '3X3X3X3X3X3X', 'X3X3X3X3X3X3', '2X2X2X2X2X2X', 'X2X2X2X2X2X2', '1X1X1X1X1X1X', 'X1X1X1X1X1X1'],
];
const BRICK_COLORS = {
    '1': { fg: ANSI.fg.white, bg: ANSI.bg.red, hits: 1, points: 10 },
    '2': { fg: ANSI.fg.black, bg: ANSI.bg.yellow, hits: 1, points: 20 },
    '3': { fg: ANSI.fg.white, bg: ANSI.bg.green, hits: 2, points: 30 },
    '4': { fg: ANSI.fg.white, bg: ANSI.bg.blue, hits: 2, points: 40 },
    '5': { fg: ANSI.fg.black, bg: ANSI.bg.magenta, hits: 3, points: 50 },
    'X': { fg: ANSI.fg.white, bg: ANSI.bg.brightBlack, hits: 999, points: 0 },
};
const POWERUP_COLORS = {
    expand: { fg: ANSI.fg.black, bg: ANSI.bg.green, char: 'E' },
    shrink: { fg: ANSI.fg.white, bg: ANSI.bg.red, char: 'S' },
    slow: { fg: ANSI.fg.black, bg: ANSI.bg.cyan, char: '-' },
    fast: { fg: ANSI.fg.white, bg: ANSI.bg.magenta, char: '+' },
    multi: { fg: ANSI.fg.black, bg: ANSI.bg.yellow, char: 'M' },
    life: { fg: ANSI.fg.white, bg: ANSI.bg.brightRed, char: 'L' },
    laser: { fg: ANSI.fg.black, bg: ANSI.bg.brightYellow, char: '!' },
    sticky: { fg: ANSI.fg.white, bg: ANSI.bg.brightBlue, char: '~' },
};
// =============================================================================
// Renderer
// =============================================================================
/**
 * Draws into an SDK ScreenBuffer and emits only the cells that changed.
 *
 * The previous version concatenated a fresh cursor-move + colour + reset for
 * every block it drew, so a gameplay frame was 4669 bytes and went out 25-62
 * times a second (measured at the door output boundary, 2026-08-24). xterm.js
 * paints on its own animation frame while it is still parsing, so it kept
 * showing the playfield erased but not yet repainted - the brick flicker.
 * With the buffer a frame costs the cells that actually moved.
 */
class Renderer {
    constructor() {
        this.buffer = new ScreenBuffer({ cols: SCREEN_WIDTH, rows: SCREEN_HEIGHT });
    }
    /** Blank every cell. Stale content is diffed away, not flashed away. */
    clearScreen() {
        this.buffer.clear();
        this.buffer.setCursorHidden(true);
    }
    hideCursor() {
        this.buffer.setCursorHidden(true);
    }
    drawBlock(x, y, bgColor, width = 1) {
        this.buffer.drawBlock(x, y, bgColor, width);
    }
    drawText(x, y, text, fg = '', bg = '') {
        this.buffer.drawText(x, y, text, fg, bg);
    }
    /**
     * Draw an object at a FRACTIONAL position, using half blocks so it can sit
     * between two cells. Whole cells are drawn exactly as before (a background
     * block); only the half-covered end cells become glyphs.
     */
    drawSubcell(spans, bgColor) {
        const fg = FG_FOR_BG[bgColor] || ANSI.fg.white;
        for (const span of spans) {
            if (span.partial) {
                this.buffer.drawText(span.x, span.y, span.char, fg, ANSI.bg.black);
            }
            else {
                this.buffer.drawBlock(span.x, span.y, bgColor, 1);
            }
        }
    }
    drawBox(x, y, width, height, bgColor) {
        this.buffer.drawBox(x, y, width, height, bgColor);
    }
    flush() {
        return this.buffer.flush();
    }
}
// =============================================================================
// Arkanoid Game (Client Version)
// =============================================================================
class ArkanoidGame {
    constructor() {
        this.lastUpdate = 0;
        // Set by quit(): the SDK keeps delivering input events after shutdown,
        // and a stray mouse-hover used to reach paint() -> updateMusic() ->
        // ensureTracker(), which resurrected a fresh AudioContext and restarted
        // the menu music AFTER the door had exited.
        this.shuttingDown = false;
        this.tracker = null;
        this.trackerContext = null;
        this.currentTrack = null;
        this.trackSeq = 0;
        this.trackCache = new Map();
        // Guards against a double-submit: the gameover/victory screen accepts
        // BOTH a keyboard Enter and a mouse click as "continue", and the score
        // submission awaits an RPC round trip - a stray click landing while the
        // Enter-triggered save is still in flight would fire a second RPC call
        // (and a second DOOR_SCORE webhook post) for the same score. Reported
        // live before scores were automatic: a Discord webhook fired twice for
        // one highscore entry.
        this.highscoreSaved = false;
        this.heldKeys = new Set(); // Track held keys for smooth movement
        this.gamepadAxis = 0; // Track analog stick position
        /** Live trail cells for the paddle and the balls. */
        this.paddleTrail = [];
        this.ballTrail = [];
        this.door = new ClientDoor({
            name: 'Arkanoid',
            version: '2.0.0',
            author: 'AmiExpress-Web',
            description: 'Classic Arkanoid/Breakout game with audio and music',
            runtime: 'hybrid',
            hybrid: true,
        });
        this.audio = new AudioEngine({
            masterVolume: 0.7,
            musicVolume: 0.4,
            sfxVolume: 0.8,
        });
        this.renderer = new Renderer();
        this.data = this.createInitialGameData();
        this.keyTracker = new KeyStateTracker();
        // Initialize gamepad support (will activate when controller connects)
        this.gamepad = new GamepadInputManager(null, {
            deadzone: 0.15,
            pollRate: 16,
        });
        this.setupGamepadHandlers();
        this.setupEventHandlers();
    }
    createInitialGameData() {
        return {
            state: 'menu',
            score: 0,
            lives: INITIAL_LIVES,
            level: 1,
            difficulty: 'normal',
            paddle: this.createPaddle(),
            balls: [],
            bricks: [],
            powerUps: [],
            highscores: [],
            menuSelection: 0,
            playerName: 'PLAYER',
            startTime: 0,
            shineTimer: 0,
            comboCount: 0,
            lastBrickHit: 0,
        };
    }
    createPaddle() {
        return {
            x: GAME_LEFT + Math.floor(GAME_WIDTH / 2) - Math.floor(PADDLE_WIDTH_DEFAULT / 2),
            targetX: GAME_LEFT + Math.floor(GAME_WIDTH / 2) - Math.floor(PADDLE_WIDTH_DEFAULT / 2),
            y: PADDLE_Y,
            width: PADDLE_WIDTH_DEFAULT,
            color: ANSI.fg.white,
            bgColor: ANSI.bg.brightBlue,
            sticky: false,
            laser: false,
        };
    }
    createBall(attached = true) {
        const paddle = this.data.paddle;
        return {
            x: paddle.x + Math.floor(paddle.width / 2),
            y: paddle.y - 1,
            vx: (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4),
            vy: -1,
            speed: this.getBallSpeed(),
            active: !attached,
        };
    }
    getBallSpeed() {
        let speed = BALL_SPEED_DEFAULT;
        switch (this.data.difficulty) {
            case 'easy':
                speed *= 0.8;
                break;
            case 'hard':
                speed *= 1.2;
                break;
        }
        speed += (this.data.level - 1) * 0.05;
        return Math.min(speed, 2);
    }
    setupGamepadHandlers() {
        // Analog stick for paddle movement
        this.gamepad.on('axis:left-x', (value, controllerId) => {
            this.gamepadAxis = value;
        });
        // D-pad for paddle movement
        this.gamepad.on('dpad:left', () => {
            if (this.data.state === 'playing') {
                this.movePaddle(-1);
            }
        });
        this.gamepad.on('dpad:right', () => {
            if (this.data.state === 'playing') {
                this.movePaddle(1);
            }
        });
        // A button to launch ball or unpause
        this.gamepad.on('button:a', (pressed, value, controllerId) => {
            if (!pressed)
                return;
            if (this.data.state === 'playing') {
                if (this.data.balls.some(b => !b.active)) {
                    this.launchBall();
                }
            }
            else if (this.data.state === 'paused') {
                this.data.state = 'playing';
                this.paint();
            }
            else if (this.data.state === 'menu') {
                switch (this.data.menuSelection) {
                    case 0:
                        this.startGame();
                        break;
                    case 1:
                        this.cycleDifficulty();
                        break;
                    case 2:
                        this.data.state = 'highscores';
                        break;
                    case 3:
                        this.data.state = 'help';
                        break;
                    case 4:
                        this.quit();
                        return;
                }
                this.paint();
            }
        });
        // START button to pause/unpause
        this.gamepad.on('button:start', (pressed, value, controllerId) => {
            if (!pressed)
                return;
            if (this.data.state === 'playing') {
                this.data.state = 'paused';
                this.paint();
            }
            else if (this.data.state === 'paused') {
                this.data.state = 'playing';
                this.paint();
            }
        });
        // B or SELECT button to quit/back
        this.gamepad.on('button:b', (pressed) => {
            if (!pressed)
                return;
            if (this.data.state === 'playing' || this.data.state === 'paused') {
                this.data.state = 'menu';
                this.paint();
            }
        });
        this.gamepad.on('button:select', (pressed) => {
            if (!pressed)
                return;
            if (this.data.state === 'playing' || this.data.state === 'paused') {
                this.data.state = 'menu';
                this.paint();
            }
        });
        // D-pad up/down for menu navigation
        this.gamepad.on('dpad:up', () => {
            if (this.data.state === 'menu') {
                const maxOptions = 4;
                this.data.menuSelection = (this.data.menuSelection - 1 + maxOptions + 1) % (maxOptions + 1);
                this.paint();
            }
        });
        this.gamepad.on('dpad:down', () => {
            if (this.data.state === 'menu') {
                const maxOptions = 4;
                this.data.menuSelection = (this.data.menuSelection + 1) % (maxOptions + 1);
                this.paint();
            }
        });
    }
    setupEventHandlers() {
        this.door.onConnect(async (user) => {
            this.data.playerName = user.name?.substring(0, 10) || 'PLAYER';
            await this.loadHighscores();
            this.paint();
            // Start key state tracker for instant paddle movement (no delay!)
            this.keyTracker.start((key) => {
                // Only handle paddle movement during gameplay
                if (this.data.state === 'playing') {
                    if (key === 'arrowleft' || key === 'a') {
                        this.movePaddle(-1);
                    }
                    else if (key === 'arrowright' || key === 'd') {
                        this.movePaddle(1);
                    }
                }
            }, 16); // 60fps key repeat rate
        });
        this.door.onInput((user, key) => {
            // Check if this is a mouse event (JSON string)
            const keyStr = typeof key === 'string' ? key : (typeof key.key === 'string' ? key.key : '');
            if (keyStr.startsWith('{')) {
                try {
                    const mouseEvent = JSON.parse(keyStr);
                    this.handleMouseInput(mouseEvent);
                    return;
                }
                catch (e) {
                    // Not a mouse event, continue with keyboard handling
                }
            }
            // Handle keydown/keyup events for smooth movement (game mode)
            // These come from ClientDoorBridge with type: 'keydown' or 'keyup'
            const keyType = key.type;
            const keyName = key.key || key.key || '';
            const normalizedKey = keyName.toLowerCase();
            if (keyType === 'keydown') {
                // Track key as held
                this.heldKeys.add(normalizedKey);
                // Also handle immediate actions for non-movement keys
                if (normalizedKey !== 'arrowleft' && normalizedKey !== 'arrowright' &&
                    normalizedKey !== 'a' && normalizedKey !== 'd') {
                    this.handleInput(normalizedKey);
                    if (this.data.state !== 'playing') {
                        this.paint();
                    }
                }
                return;
            }
            else if (keyType === 'keyup') {
                // Stop tracking key
                this.heldKeys.delete(normalizedKey);
                return;
            }
            // Fallback for regular key events (non-game-mode)
            const k = key.key?.toLowerCase() || '';
            // Handle arrow/movement keys for paddle control
            if (this.data.state === 'playing') {
                if (k === 'arrowleft' || k === 'a') {
                    this.movePaddle(-1);
                    return;
                }
                else if (k === 'arrowright' || k === 'd') {
                    this.movePaddle(1);
                    return;
                }
            }
            this.handleInput(k);
            if (this.data.state !== 'playing') {
                this.paint();
            }
        });
        this.door.onUpdate((delta) => {
            if (this.data.state === 'playing') {
                // Process held keys for smooth paddle movement (no key repeat delay!)
                if (this.heldKeys.has('arrowleft') || this.heldKeys.has('a')) {
                    this.movePaddle(-1);
                }
                if (this.heldKeys.has('arrowright') || this.heldKeys.has('d')) {
                    this.movePaddle(1);
                }
                // Process gamepad analog stick for smooth paddle movement
                if (Math.abs(this.gamepadAxis) > 0.1) {
                    const direction = this.gamepadAxis > 0 ? 1 : -1;
                    const intensity = Math.abs(this.gamepadAxis);
                    const movement = Math.ceil(direction * PADDLE_SPEED * intensity);
                    this.movePaddle(movement);
                }
                this.update(delta);
                this.paint();
            }
        });
    }
    async loadHighscores() {
        try {
            const result = await this.door.rpc('getHighscores', {});
            this.data.highscores = result.highscores || [];
        }
        catch (e) {
            console.warn('Failed to load highscores:', e);
            this.data.highscores = [];
        }
    }
    /**
     * Leave the gameover/victory screen. A qualifying score is submitted
     * automatically under the BBS username (captured at connect) - the BBS
     * already knows who is playing, so there is nothing to type - and the
     * board is shown; otherwise straight back to the menu.
     */
    submitScoreAndShowBoard() {
        if (this.isHighScore()) {
            if (this.highscoreSaved) {
                // A save for this game is already in flight (Enter and a click can
                // land together); the .then() below will move to the board.
                return;
            }
            void this.saveHighscore().then(() => {
                this.data.state = 'highscores';
                this.paint();
            });
        }
        else {
            this.data.state = 'menu';
            this.paint();
        }
    }
    async saveHighscore() {
        if (this.highscoreSaved)
            return; // already submitted for this game
        this.highscoreSaved = true;
        try {
            await this.door.rpc('saveHighscore', {
                name: this.data.playerName,
                score: this.data.score,
                level: this.data.level,
            });
            await this.loadHighscores();
        }
        catch (e) {
            console.warn('Failed to save highscore:', e);
        }
    }
    isHighScore() {
        if (this.data.highscores.length < MAX_HIGHSCORES)
            return true;
        return this.data.score > this.data.highscores[this.data.highscores.length - 1].score;
    }
    initLevel(levelNum) {
        this.data.level = levelNum;
        this.data.bricks = [];
        this.data.powerUps = [];
        this.data.balls = [this.createBall(true)];
        this.data.paddle = this.createPaddle();
        this.data.shineTimer = 0;
        this.data.comboCount = 0;
        if (this.data.difficulty === 'easy') {
            this.data.paddle.width = PADDLE_WIDTH_LARGE;
        }
        else if (this.data.difficulty === 'hard') {
            this.data.paddle.width = PADDLE_WIDTH_SMALL;
        }
        const patternIndex = Math.min(levelNum - 1, LEVEL_PATTERNS.length - 1);
        const pattern = LEVEL_PATTERNS[patternIndex];
        for (let row = 0; row < pattern.length && row < BRICK_ROWS; row++) {
            const rowPattern = pattern[row];
            for (let col = 0; col < rowPattern.length && col < BRICK_COLS; col++) {
                const char = rowPattern[col];
                if (char === '.' || char === ' ')
                    continue;
                const colorDef = BRICK_COLORS[char] || BRICK_COLORS['1'];
                const brick = {
                    x: BRICK_START_X + col * BRICK_WIDTH,
                    y: BRICK_START_Y + row * BRICK_HEIGHT,
                    width: BRICK_WIDTH,
                    height: BRICK_HEIGHT,
                    color: colorDef.fg,
                    bgColor: colorDef.bg,
                    hits: colorDef.hits,
                    maxHits: colorDef.hits,
                    destroyed: false,
                    points: colorDef.points,
                    shineFrame: 0,
                };
                if (char !== 'X' && Math.random() < 0.15) {
                    const types = ['expand', 'slow', 'multi', 'life', 'sticky'];
                    if (this.data.difficulty !== 'easy') {
                        types.push('shrink', 'fast');
                    }
                    brick.powerUp = types[Math.floor(Math.random() * types.length)];
                }
                this.data.bricks.push(brick);
            }
        }
    }
    movePaddle(direction) {
        const paddle = this.data.paddle;
        const newX = paddle.x + direction * PADDLE_SPEED;
        if (newX >= GAME_LEFT && newX + paddle.width <= GAME_RIGHT) {
            paddle.targetX = newX;
        }
    }
    launchBall() {
        for (const ball of this.data.balls) {
            if (!ball.active) {
                ball.active = true;
                ball.vx = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
                ball.vy = -1;
            }
        }
    }
    recordPaddleTrail(fromX, toX) {
        const travelled = Math.abs(toX - fromX);
        if (travelled < ArkanoidGame.PADDLE_TRAIL_MIN_SPEED)
            return;
        const paddle = this.data.paddle;
        const now = Date.now();
        // The streak sits where the paddle WAS, so it reads as the paddle
        // smearing behind itself rather than a second paddle.
        this.paddleTrail.push({
            x: fromX,
            y: paddle.y,
            strength: Math.min(1, travelled / 3),
            createdAt: now,
        });
    }
    recordBallTrail(x, y) {
        this.ballTrail.push({ x, y, strength: 1, createdAt: Date.now() });
    }
    updatePaddle() {
        const paddle = this.data.paddle;
        const previousX = paddle.x;
        paddle.x = easePaddle(paddle.x, paddle.targetX);
        // A ball waiting to launch rides the paddle, at the same fractional
        // position - otherwise it would jitter against a paddle that glides.
        for (const ball of this.data.balls) {
            if (!ball.active) {
                ball.x = paddle.x + paddle.width / 2;
            }
        }
        this.recordPaddleTrail(previousX, paddle.x);
    }
    /**
     * Draw a fading streak. The tier comes from the shared model; the
     * characters are this door's, because Arkanoid writes ANSI cells while
     * GRANDMASTER writes blessed tags.
     */
    drawTrail(cells, now, fg, width) {
        for (const cell of cells) {
            const tier = trailTier(trailIntensity(cell, now, ArkanoidGame.ARKANOID_TRAIL_MS));
            if (!tier)
                continue;
            const char = tier === 'solid' ? SHADE.dark : tier === 'mid' ? SHADE.medium : SHADE.light;
            const spans = horizontalBar(cell.x, Math.round(cell.y), width);
            for (const span of spans) {
                this.renderer.drawText(span.x, span.y, char, fg, ANSI.bg.black);
            }
        }
    }
    update(deltaTime) {
        this.updatePaddle();
        this.updateBalls(deltaTime);
        this.updatePowerUps();
        this.updateShineEffect();
        if (this.checkLevelComplete()) {
            this.playSound('levelComplete');
            this.nextLevel();
        }
    }
    updateBalls(deltaTime) {
        const paddle = this.data.paddle;
        for (let i = this.data.balls.length - 1; i >= 0; i--) {
            const ball = this.data.balls[i];
            if (!ball.active) {
                // updatePaddle() already rides it along at fractional precision;
                // only the row needs setting here.
                ball.y = paddle.y - 1;
                continue;
            }
            // Movement and collision live in ball-physics.ts (substepped so the
            // ball cannot tunnel through 1-cell bricks); this loop owns the game
            // consequences - sound, score, combo, power-ups.
            // Where the ball was, for the streak it leaves behind.
            this.recordBallTrail(ball.x, ball.y);
            const events = stepBall(ball, paddle, this.data.bricks, {
                left: GAME_LEFT,
                right: GAME_RIGHT,
                top: GAME_TOP,
            });
            for (const event of events) {
                switch (event.type) {
                    case 'wall':
                        this.playSound('hit');
                        break;
                    case 'paddle':
                    case 'paddleCatch':
                        this.playSound('hit');
                        this.data.comboCount = 0;
                        break;
                    case 'brickDestroyed': {
                        const brick = event.brick;
                        this.data.score += brick.points * (1 + Math.floor(this.data.comboCount / 3));
                        this.data.comboCount++;
                        if (brick.powerUp) {
                            this.spawnPowerUp(brick.x + brick.width / 2, brick.y, brick.powerUp);
                        }
                        this.playSound('explosion');
                        break;
                    }
                    case 'brickHit':
                        this.playSound('hit');
                        break;
                }
            }
            // Ball fell below paddle
            if (ball.y > GAME_BOTTOM) {
                if (this.data.balls.length > 1) {
                    this.data.balls.splice(i, 1);
                }
                else {
                    this.loseLife();
                }
            }
        }
    }
    spawnPowerUp(x, y, type) {
        const colors = POWERUP_COLORS[type];
        this.data.powerUps.push({
            x: Math.floor(x),
            y: Math.floor(y),
            type,
            color: colors.fg,
            bgColor: colors.bg,
            active: true,
        });
    }
    updatePowerUps() {
        const paddle = this.data.paddle;
        for (let i = this.data.powerUps.length - 1; i >= 0; i--) {
            const pu = this.data.powerUps[i];
            if (!pu.active)
                continue;
            pu.y += 0.3;
            if (pu.y >= paddle.y && pu.y <= paddle.y + 1 &&
                pu.x >= paddle.x && pu.x <= paddle.x + paddle.width) {
                this.applyPowerUp(pu.type);
                pu.active = false;
                this.playSound('powerup');
            }
            if (pu.y > GAME_BOTTOM) {
                pu.active = false;
            }
        }
        this.data.powerUps = this.data.powerUps.filter(p => p.active);
    }
    applyPowerUp(type) {
        const paddle = this.data.paddle;
        switch (type) {
            case 'expand':
                paddle.width = Math.min(paddle.width + 4, PADDLE_WIDTH_LARGE + 4);
                break;
            case 'shrink':
                paddle.width = Math.max(paddle.width - 2, PADDLE_WIDTH_SMALL - 2);
                break;
            case 'slow':
                for (const ball of this.data.balls) {
                    ball.speed = Math.max(ball.speed * 0.7, BALL_SPEED_SLOW);
                }
                break;
            case 'fast':
                for (const ball of this.data.balls) {
                    ball.speed = Math.min(ball.speed * 1.3, BALL_SPEED_FAST);
                }
                break;
            case 'multi':
                const activeBalls = this.data.balls.filter(b => b.active);
                if (activeBalls.length > 0 && this.data.balls.length < 5) {
                    const orig = activeBalls[0];
                    for (let i = 0; i < 2; i++) {
                        this.data.balls.push({
                            x: orig.x,
                            y: orig.y,
                            vx: orig.vx + (Math.random() - 0.5) * 0.5,
                            vy: orig.vy,
                            speed: orig.speed,
                            active: true,
                        });
                    }
                }
                break;
            case 'life':
                this.data.lives = Math.min(this.data.lives + 1, 5);
                break;
            case 'sticky':
                paddle.sticky = true;
                break;
            case 'laser':
                paddle.laser = true;
                break;
        }
    }
    loseLife() {
        this.data.lives--;
        this.data.comboCount = 0;
        this.playSound('gameover');
        if (this.data.lives <= 0) {
            this.data.state = 'gameover';
        }
        else {
            this.data.balls = [this.createBall(true)];
            this.data.paddle.sticky = false;
            this.data.paddle.laser = false;
        }
    }
    checkLevelComplete() {
        const breakableBricks = this.data.bricks.filter(b => !b.destroyed && b.maxHits < 999);
        return breakableBricks.length === 0;
    }
    nextLevel() {
        if (this.data.level >= 20) {
            this.data.state = 'victory';
        }
        else {
            this.data.score += 1000 * this.data.level;
            this.initLevel(this.data.level + 1);
        }
    }
    updateShineEffect() {
        this.data.shineTimer++;
        if (this.data.shineTimer > 300) {
            this.data.shineTimer = 0;
            let delay = 0;
            for (const brick of this.data.bricks) {
                if (!brick.destroyed) {
                    brick.shineFrame = delay;
                    delay += 2;
                }
            }
        }
        for (const brick of this.data.bricks) {
            if (brick.shineFrame > 0) {
                brick.shineFrame--;
            }
        }
    }
    // =============================================================================
    // Audio
    // =============================================================================
    async playSound(type) {
        try {
            await this.audio.init();
            switch (type) {
                case 'hit':
                    this.audio.playSound('hit', { frequency: 440, duration: 0.05 });
                    break;
                case 'explosion':
                    this.audio.playSound('explosion', { frequency: 200, duration: 0.2 });
                    break;
                case 'powerup':
                    this.audio.playSound('powerup', { frequency: 880, duration: 0.15 });
                    break;
                case 'gameover':
                    this.audio.playSound('gameover', { frequency: 110, duration: 0.5 });
                    break;
                case 'levelComplete':
                    this.audio.playSound('coin', { frequency: 660, duration: 0.1 });
                    break;
            }
        }
        catch (e) {
            // Audio not available, silently fail
        }
    }
    // ===========================================================================
    // Music - real tracker modules (Zabutom XM pack) via the SDK TrackerEngine.
    // trackForState() (music-select.ts) is the single source of which module
    // belongs to which screen; updateMusic() runs every paint so the music can
    // never drift from the rendered state. Sound effects stay on AudioEngine.
    // ===========================================================================
    /** Keep music in step with the rendered state. Deduped by currentTrack. */
    updateMusic() {
        const track = trackForState(this.data.state, this.data.level);
        if (track === null) {
        }
        else {
            void this.playTrack(track);
        }
    }
    async playTrack(name) {
        if (this.currentTrack === name)
            return;
        this.currentTrack = name;
        const seq = ++this.trackSeq;
        try {
            const tracker = this.ensureTracker();
            if (!tracker)
                return;
            let buffer = this.trackCache.get(name);
            if (!buffer) {
                const base = globalThis.__BBS__?.backendUrl || '';
                const res = await fetch(`${base}/api/doors/ARKANOID/assets/${encodeURIComponent(name)}`);
                if (!res.ok)
                    throw new Error(`asset ${name}: HTTP ${res.status}`);
                buffer = await res.arrayBuffer();
                this.trackCache.set(name, buffer);
            }
            // The state may have moved on while the module downloaded - a stale
            // fetch must not stomp the track that state now wants.
            if (seq !== this.trackSeq)
                return;
            tracker.play(buffer);
        }
        catch (e) {
            // Music is optional; sound effects keep working.
            console.warn('[Arkanoid] music unavailable:', e);
        }
    }
    ensureTracker() {
        if (this.shuttingDown)
            return null;
        if (!this.tracker) {
            // Own the AudioContext so we can resume it: chiptune3 never resumes a
            // context the autoplay policy suspended. By door time the user has
            // long since typed at the BBS, so sticky activation lets resume() win.
            this.trackerContext = new AudioContext();
            this.tracker = new TrackerEngine({
                audioContext: this.trackerContext,
                repeatCount: -1, // loop the module until the state changes it
                volume: 0.6, // under the sound effects
            });
        }
        if (this.trackerContext && this.trackerContext.state === 'suspended') {
            void this.trackerContext.resume().catch(() => { });
        }
        return this.tracker;
    }
    stopMusic() {
        this.currentTrack = null;
        this.trackSeq++;
        try {
            this.tracker?.stop();
        }
        catch (e) {
            // Ignore
        }
    }
    // =============================================================================
    // Rendering
    // =============================================================================
    /**
     * Send the frame, unless nothing changed.
     *
     * An unchanged frame diffs to an empty string; sending it would still cost
     * a full browser -> backend -> browser round trip for zero pixels.
     */
    paint() {
        if (this.shuttingDown)
            return;
        this.updateMusic();
        const frame = this.render();
        if (frame)
            this.door.send(frame);
    }
    render() {
        switch (this.data.state) {
            case 'menu':
                return this.renderMenu();
            case 'playing':
            case 'paused':
                return this.renderGame();
            case 'gameover':
                return this.renderGameOver();
            case 'victory':
                return this.renderVictory();
            case 'highscores':
                return this.renderHighscores();
            case 'help':
                return this.renderHelp();
        }
        return '';
    }
    renderMenu() {
        this.renderer.clearScreen();
        const title = [' ARKANOID ', '  BLOCKS  '];
        let y = 4;
        for (const line of title) {
            this.renderer.drawText(Math.floor(SCREEN_WIDTH / 2) - Math.floor(line.length / 2), y++, line, ANSI.fg.brightYellow, ANSI.bg.blue);
        }
        const colors = [ANSI.bg.red, ANSI.bg.yellow, ANSI.bg.green, ANSI.bg.cyan, ANSI.bg.magenta];
        for (let i = 0; i < 5; i++) {
            this.renderer.drawBlock(20 + i * 8, 7, colors[i], 6);
        }
        const options = [
            'START GAME',
            'DIFFICULTY: ' + this.data.difficulty.toUpperCase(),
            'HIGH SCORES',
            'HOW TO PLAY',
            'QUIT',
        ];
        y = 10;
        for (let i = 0; i < options.length; i++) {
            const selected = i === this.data.menuSelection;
            const text = (selected ? '> ' : '  ') + options[i] + (selected ? ' <' : '  ');
            this.renderer.drawText(Math.floor(SCREEN_WIDTH / 2) - Math.floor(text.length / 2), y++, text, selected ? ANSI.fg.brightYellow : ANSI.fg.white, selected ? ANSI.bg.blue : '');
        }
        this.renderer.drawText(20, 18, 'Use UP/DOWN to select, ENTER to confirm', ANSI.fg.brightBlack);
        this.renderer.drawText(30, 20, 'Classic Arcade Action!', ANSI.fg.cyan);
        return this.renderer.flush();
    }
    renderGame() {
        this.renderer.hideCursor();
        for (let row = GAME_TOP; row <= GAME_BOTTOM; row++) {
            this.renderer.drawBlock(GAME_LEFT, row, ANSI.bg.black, GAME_WIDTH);
        }
        for (let row = GAME_TOP - 1; row <= GAME_BOTTOM + 1; row++) {
            this.renderer.drawBlock(GAME_LEFT - 1, row, ANSI.bg.brightBlack, 1);
            this.renderer.drawBlock(GAME_RIGHT + 1, row, ANSI.bg.brightBlack, 1);
        }
        for (let col = GAME_LEFT - 1; col <= GAME_RIGHT + 1; col++) {
            this.renderer.drawBlock(col, GAME_TOP - 1, ANSI.bg.brightBlack, 1);
        }
        for (const brick of this.data.bricks) {
            if (brick.destroyed)
                continue;
            let bg = brick.bgColor;
            if (brick.shineFrame > 0 && brick.shineFrame < 5) {
                bg = ANSI.bg.brightWhite;
            }
            if (brick.maxHits > 1 && brick.hits < brick.maxHits) {
                const damage = brick.maxHits - brick.hits;
                if (damage === 1)
                    bg = brick.bgColor.replace('4', '10');
            }
            this.renderer.drawBlock(brick.x, brick.y, bg, brick.width);
        }
        for (const pu of this.data.powerUps) {
            if (!pu.active)
                continue;
            const colors = POWERUP_COLORS[pu.type];
            this.renderer.drawText(Math.floor(pu.x), Math.floor(pu.y), colors.char, colors.fg, colors.bg);
        }
        const paddle = this.data.paddle;
        let paddleBg = paddle.bgColor;
        if (paddle.sticky)
            paddleBg = ANSI.bg.brightGreen;
        if (paddle.laser)
            paddleBg = ANSI.bg.brightRed;
        // Streaks first, so the objects themselves draw over them.
        const now = Date.now();
        this.paddleTrail = expireTrails(this.paddleTrail, now, ArkanoidGame.ARKANOID_TRAIL_MS);
        this.ballTrail = expireTrails(this.ballTrail, now, ArkanoidGame.ARKANOID_TRAIL_MS);
        this.drawTrail(this.paddleTrail, now, FG_FOR_BG[paddleBg] || ANSI.fg.brightBlue, paddle.width);
        this.drawTrail(this.ballTrail, now, ANSI.fg.brightWhite, 1);
        // Half blocks let the paddle sit between two columns, so it glides
        // instead of stepping a whole character at a time.
        this.renderer.drawSubcell(horizontalBar(paddle.x, paddle.y, paddle.width), paddleBg);
        for (const ball of this.data.balls) {
            // Only ONE axis can take the half step - the quadrant glyphs are not
            // CP437 - so it goes on whichever way the ball is mostly travelling.
            const axis = dominantAxis(ball.vx ?? 0, ball.vy ?? 0);
            this.renderer.drawSubcell(subcellPoint(ball.x, ball.y, axis), ANSI.bg.brightWhite);
        }
        this.renderer.drawText(2, 1, `SCORE: ${this.data.score.toString().padStart(8, '0')}`, ANSI.fg.brightYellow);
        this.renderer.drawText(30, 1, `LEVEL: ${this.data.level}/20`, ANSI.fg.brightCyan);
        this.renderer.drawText(50, 1, `LIVES: ${'*'.repeat(this.data.lives)}`, ANSI.fg.brightRed);
        if (this.data.comboCount > 2) {
            this.renderer.drawText(65, 1, `x${this.data.comboCount} COMBO!`, ANSI.fg.brightMagenta);
        }
        if (this.data.state === 'paused') {
            this.renderer.drawText(35, 12, '  PAUSED  ', ANSI.fg.black, ANSI.bg.yellow);
            this.renderer.drawText(32, 14, 'Press SPACE to resume', ANSI.fg.white);
        }
        if (this.data.balls.some(b => !b.active)) {
            this.renderer.drawText(28, GAME_BOTTOM, 'Press SPACE to launch ball', ANSI.fg.brightBlack);
        }
        return this.renderer.flush();
    }
    renderGameOver() {
        this.renderer.clearScreen();
        this.renderer.drawText(33, 8, '  GAME OVER  ', ANSI.fg.white, ANSI.bg.red);
        this.renderer.drawText(30, 11, `Final Score: ${this.data.score}`, ANSI.fg.brightYellow);
        this.renderer.drawText(30, 12, `Level Reached: ${this.data.level}`, ANSI.fg.brightCyan);
        if (this.isHighScore()) {
            this.renderer.drawText(28, 15, 'NEW HIGH SCORE! Press ENTER', ANSI.fg.brightGreen);
        }
        else {
            this.renderer.drawText(30, 15, 'Press ENTER for menu', ANSI.fg.white);
        }
        return this.renderer.flush();
    }
    renderVictory() {
        this.renderer.clearScreen();
        this.renderer.drawText(32, 7, '  VICTORY!  ', ANSI.fg.black, ANSI.bg.brightGreen);
        this.renderer.drawText(28, 9, 'You completed all 20 levels!', ANSI.fg.brightYellow);
        this.renderer.drawText(30, 12, `Final Score: ${this.data.score}`, ANSI.fg.brightCyan);
        const colors = [ANSI.bg.red, ANSI.bg.yellow, ANSI.bg.green, ANSI.bg.cyan, ANSI.bg.magenta];
        for (let i = 0; i < 10; i++) {
            this.renderer.drawBlock(15 + i * 5, 14, colors[i % 5], 4);
        }
        if (this.isHighScore()) {
            this.renderer.drawText(28, 17, 'NEW HIGH SCORE! Press ENTER', ANSI.fg.brightGreen);
        }
        else {
            this.renderer.drawText(30, 17, 'Press ENTER for menu', ANSI.fg.white);
        }
        return this.renderer.flush();
    }
    renderHighscores() {
        this.renderer.clearScreen();
        this.renderer.drawText(32, 2, '  HIGH SCORES  ', ANSI.fg.black, ANSI.bg.yellow);
        this.renderer.drawText(15, 5, 'RANK  NAME          SCORE      LEVEL  DATE', ANSI.fg.brightCyan);
        this.renderer.drawText(15, 6, '----  ----------  ----------  -----  ----------', ANSI.fg.brightBlack);
        for (let i = 0; i < MAX_HIGHSCORES; i++) {
            const y = 7 + i;
            const entry = this.data.highscores[i];
            if (entry) {
                const rank = (i + 1).toString().padStart(2, ' ');
                const name = entry.name.padEnd(10, ' ');
                const score = entry.score.toString().padStart(10, ' ');
                const level = entry.level.toString().padStart(5, ' ');
                const date = entry.date;
                const color = i === 0 ? ANSI.fg.brightYellow : i < 3 ? ANSI.fg.brightWhite : ANSI.fg.white;
                this.renderer.drawText(15, y, `${rank}.  ${name}  ${score}  ${level}  ${date}`, color);
            }
            else {
                this.renderer.drawText(15, y, `${(i + 1).toString().padStart(2, ' ')}.  ----------  ----------  -----  ----------`, ANSI.fg.brightBlack);
            }
        }
        this.renderer.drawText(30, 20, 'Press any key to return', ANSI.fg.white);
        return this.renderer.flush();
    }
    renderHelp() {
        this.renderer.clearScreen();
        this.renderer.drawText(32, 2, '  HOW TO PLAY  ', ANSI.fg.black, ANSI.bg.cyan);
        const help = [
            '',
            '  CONTROLS:',
            '  ---------',
            '  MOUSE             - Move paddle (hover)',
            '  CLICK             - Launch ball',
            '  LEFT/RIGHT or A/D - Move paddle (keyboard)',
            '  SPACE             - Launch ball / Pause',
            '  Q                 - Quit to menu',
            '',
            '  POWER-UPS:',
            '  ----------',
            '  E (Green)  - Expand paddle    L (Red)    - Extra life',
            '  S (Red)    - Shrink paddle    ~ (Blue)   - Sticky paddle',
            '  - (Cyan)   - Slow ball        M (Yellow) - Multi-ball',
            '  + (Purple) - Fast ball',
            '',
            '  Break all bricks to advance! Gray bricks are unbreakable.',
        ];
        for (let i = 0; i < help.length; i++) {
            this.renderer.drawText(20, 4 + i, help[i], ANSI.fg.white);
        }
        this.renderer.drawText(30, 23, 'Press any key to return', ANSI.fg.brightBlack);
        return this.renderer.flush();
    }
    // =============================================================================
    // Input Handling
    // =============================================================================
    handleInput(key) {
        const k = key.toLowerCase();
        switch (this.data.state) {
            case 'menu':
                this.handleMenuInput(k);
                break;
            case 'playing':
                this.handleGameInput(k);
                break;
            case 'paused':
                if (k === ' ' || k === 'space') {
                    this.data.state = 'playing';
                }
                else if (k === 'q') {
                    this.data.state = 'menu';
                }
                break;
            case 'gameover':
            case 'victory':
                if (k === 'enter' || k === '\r' || k === '\n') {
                    this.submitScoreAndShowBoard();
                }
                break;
            case 'highscores':
            case 'help':
                this.data.state = 'menu';
                break;
        }
    }
    handleMenuInput(k) {
        const maxOptions = 4;
        if (k === 'arrowup' || k === 'up' || k === 'w') {
            this.data.menuSelection = (this.data.menuSelection - 1 + maxOptions + 1) % (maxOptions + 1);
        }
        else if (k === 'arrowdown' || k === 'down' || k === 's') {
            this.data.menuSelection = (this.data.menuSelection + 1) % (maxOptions + 1);
        }
        else if (k === 'enter' || k === '\r' || k === '\n') {
            switch (this.data.menuSelection) {
                case 0:
                    this.startGame();
                    break;
                case 1:
                    this.cycleDifficulty();
                    break;
                case 2:
                    this.data.state = 'highscores';
                    break;
                case 3:
                    this.data.state = 'help';
                    break;
                case 4:
                    this.quit();
                    break;
            }
        }
    }
    handleGameInput(k) {
        if (k === 'arrowleft' || k === 'left' || k === 'a') {
            this.movePaddle(-1);
        }
        else if (k === 'arrowright' || k === 'right' || k === 'd') {
            this.movePaddle(1);
        }
        else if (k === ' ' || k === 'space') {
            if (this.data.balls.some(b => !b.active)) {
                this.launchBall();
            }
            else {
                this.data.state = 'paused';
            }
        }
        else if (k === 'p') {
            // Explicit pause. Space already pauses, but ONLY when no ball is
            // waiting to be launched - so it cannot be offered as a pause
            // control (an on-screen Pause button would launch the ball instead
            // half the time). P always pauses.
            this.data.state = 'paused';
        }
        else if (k === 'q') {
            this.data.state = 'menu';
        }
    }
    handleMouseInput(event) {
        // Mouse events: mouse-hover, mouse-click, mouse-drag, mouse-up
        // x and y are 0-indexed from frontend, convert to 1-indexed for ANSI positioning
        const mouseX = event.x + 1;
        const mouseY = event.y + 1;
        if (this.data.state === 'playing') {
            // Map mouse X position to paddle position
            // Game area is GAME_LEFT to GAME_RIGHT (1-indexed)
            const paddle = this.data.paddle;
            const paddleHalfWidth = paddle.width / 2;
            // Center the paddle on the mouse position (mouseX already 1-indexed)
            let newPaddleX = mouseX - paddleHalfWidth;
            // Clamp to game boundaries
            newPaddleX = Math.max(GAME_LEFT, Math.min(GAME_RIGHT - paddle.width + 1, newPaddleX));
            paddle.targetX = newPaddleX;
            // Click to launch ball
            if (event.type === 'mouse-click') {
                if (this.data.balls.some(b => !b.active)) {
                    this.launchBall();
                }
            }
            // Render immediately for smooth mouse movement
            this.paint();
        }
        else if (this.data.state === 'menu') {
            // Menu mouse handling - check Y position for menu items
            const menuStartY = 10;
            if (mouseY >= menuStartY && mouseY <= menuStartY + 4) {
                const selection = mouseY - menuStartY;
                // Update selection highlight on hover
                if (event.type === 'mouse-hover') {
                    if (this.data.menuSelection !== selection) {
                        this.data.menuSelection = selection;
                        this.paint();
                    }
                }
                // Execute action on click
                if (event.type === 'mouse-click') {
                    this.data.menuSelection = selection;
                    switch (selection) {
                        case 0:
                            this.startGame();
                            break;
                        case 1:
                            this.cycleDifficulty();
                            break;
                        case 2:
                            this.data.state = 'highscores';
                            break;
                        case 3:
                            this.data.state = 'help';
                            break;
                        case 4:
                            this.quit();
                            return; // Return immediately, don't render after quit
                    }
                    this.paint();
                }
            }
        }
        else if (event.type === 'mouse-click') {
            // Handle mouse clicks on prompt screens as equivalent to pressing Enter
            switch (this.data.state) {
                case 'gameover':
                case 'victory':
                    // Click anywhere to proceed
                    this.submitScoreAndShowBoard();
                    break;
                case 'highscores':
                case 'help':
                    // Click anywhere to return to menu
                    this.data.state = 'menu';
                    this.paint();
                    break;
                case 'paused':
                    // Click to resume
                    this.data.state = 'playing';
                    this.paint();
                    break;
            }
        }
    }
    cycleDifficulty() {
        const difficulties = ['easy', 'normal', 'hard'];
        const idx = difficulties.indexOf(this.data.difficulty);
        this.data.difficulty = difficulties[(idx + 1) % difficulties.length];
    }
    startGame() {
        this.highscoreSaved = false; // a new game's score can submit again
        this.data.score = 0;
        this.data.lives = INITIAL_LIVES;
        this.data.startTime = Date.now();
        this.initLevel(1);
        this.data.state = 'playing';
    }
    quit() {
        this.shuttingDown = true;
        this.door.send(ANSI.show + ANSI.reset);
        this.door.send(ANSI.clear + ANSI.home);
        this.door.send('\x1b[32mThanks for playing ARKANOID!\x1b[0m\r\n');
        this.stopMusic();
        try {
            this.tracker?.dispose();
            void this.trackerContext?.close();
        }
        catch (e) {
            // Ignore - the page is leaving the door either way.
        }
        this.tracker = null;
        this.trackerContext = null;
        this.keyTracker.stop();
        this.gamepad?.destroy();
        this.door.shutdown();
    }
    start() {
        this.door.setFPS(30);
        this.door.start();
    }
}
/** A paddle sliding slower than this leaves no streak - only a dash does. */
ArkanoidGame.PADDLE_TRAIL_MIN_SPEED = 0.8;
/** Trails are shorter here than GRANDMASTER's: the paddle moves constantly. */
ArkanoidGame.ARKANOID_TRAIL_MS = 110;
// =============================================================================
// Entry Point
// =============================================================================
const game = new ArkanoidGame();
game.start();
