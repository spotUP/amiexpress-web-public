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

import {
  ClientDoor,
  AudioEngine,
  AnsiColor,
  KeyStateTracker,
} from '@amiexpress/bbs-door-sdk/client';

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
  goto: (x: number, y: number) => `${CSI}${y};${x}H`,

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

const BLOCK = {
  full: '\u2588',
  upper: '\u2580',
  lower: '\u2584',
  light: '\u2591',
  medium: '\u2592',
  dark: '\u2593',
  space: ' ',
};

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
const PADDLE_SPEED = 3;

const BALL_SPEED_DEFAULT = 1;
const BALL_SPEED_FAST = 1.5;
const BALL_SPEED_SLOW = 0.6;

const BRICK_WIDTH = 6;
const BRICK_HEIGHT = 1;
const BRICK_ROWS = 8;
const BRICK_COLS = 12;
const BRICK_START_Y = GAME_TOP + 2;
const BRICK_START_X = GAME_LEFT + 2;

const INITIAL_LIVES = 3;
const MAX_HIGHSCORES = 10;

// =============================================================================
// Types
// =============================================================================

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  active: boolean;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  bgColor: string;
  hits: number;
  maxHits: number;
  destroyed: boolean;
  points: number;
  powerUp?: PowerUpType;
  shineFrame: number;
}

type PowerUpType = 'expand' | 'shrink' | 'slow' | 'fast' | 'multi' | 'life' | 'laser' | 'sticky';

interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  color: string;
  bgColor: string;
  active: boolean;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  color: string;
  bgColor: string;
  sticky: boolean;
  laser: boolean;
}

interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'highscores' | 'enterName' | 'help';
type Difficulty = 'easy' | 'normal' | 'hard';

interface GameData {
  state: GameState;
  score: number;
  lives: number;
  level: number;
  difficulty: Difficulty;
  paddle: Paddle;
  balls: Ball[];
  bricks: Brick[];
  powerUps: PowerUp[];
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;
  startTime: number;
  shineTimer: number;
  comboCount: number;
  lastBrickHit: number;
}

// =============================================================================
// Level Patterns
// =============================================================================

const LEVEL_PATTERNS: string[][] = [
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

const BRICK_COLORS: Record<string, { fg: string; bg: string; hits: number; points: number }> = {
  '1': { fg: ANSI.fg.white, bg: ANSI.bg.red, hits: 1, points: 10 },
  '2': { fg: ANSI.fg.black, bg: ANSI.bg.yellow, hits: 1, points: 20 },
  '3': { fg: ANSI.fg.white, bg: ANSI.bg.green, hits: 2, points: 30 },
  '4': { fg: ANSI.fg.white, bg: ANSI.bg.blue, hits: 2, points: 40 },
  '5': { fg: ANSI.fg.black, bg: ANSI.bg.magenta, hits: 3, points: 50 },
  'X': { fg: ANSI.fg.white, bg: ANSI.bg.brightBlack, hits: 999, points: 0 },
};

const POWERUP_COLORS: Record<PowerUpType, { fg: string; bg: string; char: string }> = {
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

class Renderer {
  private buffer: string = '';

  clear(): void {
    this.buffer = '';
  }

  add(str: string): void {
    this.buffer += str;
  }

  goto(x: number, y: number): void {
    this.buffer += ANSI.goto(x, y);
  }

  drawBlock(x: number, y: number, bgColor: string, width: number = 1): void {
    this.buffer += ANSI.goto(x, y) + bgColor + BLOCK.space.repeat(width) + ANSI.reset;
  }

  drawText(x: number, y: number, text: string, fg: string = '', bg: string = ''): void {
    this.buffer += ANSI.goto(x, y) + fg + bg + text + ANSI.reset;
  }

  drawBox(x: number, y: number, width: number, height: number, bgColor: string): void {
    for (let row = 0; row < height; row++) {
      this.drawBlock(x, y + row, bgColor, width);
    }
  }

  flush(): string {
    const result = this.buffer;
    this.buffer = '';
    return result;
  }
}

// =============================================================================
// Arkanoid Game (Client Version)
// =============================================================================

class ArkanoidGame {
  private door: ClientDoor;
  private audio: AudioEngine;
  private renderer: Renderer;
  private data: GameData;
  private lastUpdate: number = 0;
  private musicStarted: boolean = false;
  private keyTracker: KeyStateTracker;

  constructor() {
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

    this.setupEventHandlers();
  }

  private createInitialGameData(): GameData {
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

  private createPaddle(): Paddle {
    return {
      x: GAME_LEFT + Math.floor(GAME_WIDTH / 2) - Math.floor(PADDLE_WIDTH_DEFAULT / 2),
      y: PADDLE_Y,
      width: PADDLE_WIDTH_DEFAULT,
      color: ANSI.fg.white,
      bgColor: ANSI.bg.brightBlue,
      sticky: false,
      laser: false,
    };
  }

  private createBall(attached: boolean = true): Ball {
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

  private getBallSpeed(): number {
    let speed = BALL_SPEED_DEFAULT;
    switch (this.data.difficulty) {
      case 'easy': speed *= 0.8; break;
      case 'hard': speed *= 1.2; break;
    }
    speed += (this.data.level - 1) * 0.05;
    return Math.min(speed, 2);
  }

  private setupEventHandlers(): void {
    this.door.onConnect(async (user) => {
      this.data.playerName = user.name?.substring(0, 10) || 'PLAYER';
      await this.loadHighscores();
      this.door.send(this.render());

      // Start key state tracker for instant paddle movement (no delay!)
      this.keyTracker.start((key) => {
        // Only handle paddle movement during gameplay
        if (this.data.state === 'playing') {
          if (key === 'arrowleft' || key === 'a') {
            this.movePaddle(-1);
          } else if (key === 'arrowright' || key === 'd') {
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
        } catch (e) {
          // Not a mouse event, continue with keyboard handling
        }
      }

      // Handle non-movement keys (space, q, enter, etc.)
      const k = key.key?.toLowerCase() || '';

      // Ignore arrow keys - handled by KeyStateTracker
      if (k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd') {
        return;
      }

      this.handleInput(k);
      if (this.data.state !== 'playing') {
        this.door.send(this.render());
      }
    });

    this.door.onUpdate((delta) => {
      if (this.data.state === 'playing') {
        this.update(delta);
        this.door.send(this.render());
      }
    });
  }

  private async loadHighscores(): Promise<void> {
    try {
      const result = await this.door.rpc('getHighscores', {});
      this.data.highscores = result.highscores || [];
    } catch (e) {
      console.warn('Failed to load highscores:', e);
      this.data.highscores = [];
    }
  }

  private async saveHighscore(): Promise<void> {
    try {
      await this.door.rpc('saveHighscore', {
        name: this.data.playerName,
        score: this.data.score,
        level: this.data.level,
      });
      await this.loadHighscores();
    } catch (e) {
      console.warn('Failed to save highscore:', e);
    }
  }

  private isHighScore(): boolean {
    if (this.data.highscores.length < MAX_HIGHSCORES) return true;
    return this.data.score > this.data.highscores[this.data.highscores.length - 1].score;
  }

  private initLevel(levelNum: number): void {
    this.data.level = levelNum;
    this.data.bricks = [];
    this.data.powerUps = [];
    this.data.balls = [this.createBall(true)];
    this.data.paddle = this.createPaddle();
    this.data.shineTimer = 0;
    this.data.comboCount = 0;

    if (this.data.difficulty === 'easy') {
      this.data.paddle.width = PADDLE_WIDTH_LARGE;
    } else if (this.data.difficulty === 'hard') {
      this.data.paddle.width = PADDLE_WIDTH_SMALL;
    }

    const patternIndex = Math.min(levelNum - 1, LEVEL_PATTERNS.length - 1);
    const pattern = LEVEL_PATTERNS[patternIndex];

    for (let row = 0; row < pattern.length && row < BRICK_ROWS; row++) {
      const rowPattern = pattern[row];
      for (let col = 0; col < rowPattern.length && col < BRICK_COLS; col++) {
        const char = rowPattern[col];
        if (char === '.' || char === ' ') continue;

        const colorDef = BRICK_COLORS[char] || BRICK_COLORS['1'];
        const brick: Brick = {
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
          const types: PowerUpType[] = ['expand', 'slow', 'multi', 'life', 'sticky'];
          if (this.data.difficulty !== 'easy') {
            types.push('shrink', 'fast');
          }
          brick.powerUp = types[Math.floor(Math.random() * types.length)];
        }

        this.data.bricks.push(brick);
      }
    }
  }

  private movePaddle(direction: number): void {
    const paddle = this.data.paddle;
    const newX = paddle.x + direction * PADDLE_SPEED;

    if (newX >= GAME_LEFT && newX + paddle.width <= GAME_RIGHT) {
      paddle.x = newX;
      for (const ball of this.data.balls) {
        if (!ball.active) {
          ball.x = paddle.x + Math.floor(paddle.width / 2);
        }
      }
    }
  }

  private launchBall(): void {
    for (const ball of this.data.balls) {
      if (!ball.active) {
        ball.active = true;
        ball.vx = (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.4);
        ball.vy = -1;
      }
    }
  }

  private update(deltaTime: number): void {
    this.updateBalls(deltaTime);
    this.updatePowerUps();
    this.updateShineEffect();

    if (this.checkLevelComplete()) {
      this.playSound('levelComplete');
      this.nextLevel();
    }
  }

  private updateBalls(deltaTime: number): void {
    const paddle = this.data.paddle;

    for (let i = this.data.balls.length - 1; i >= 0; i--) {
      const ball = this.data.balls[i];

      if (!ball.active) {
        ball.x = paddle.x + Math.floor(paddle.width / 2);
        ball.y = paddle.y - 1;
        continue;
      }

      const moveX = ball.vx * ball.speed;
      const moveY = ball.vy * ball.speed;

      ball.x += moveX;
      ball.y += moveY;

      // Wall collisions
      if (ball.x <= GAME_LEFT) {
        ball.x = GAME_LEFT + 1;
        ball.vx = Math.abs(ball.vx);
        this.playSound('hit');
      }
      if (ball.x >= GAME_RIGHT) {
        ball.x = GAME_RIGHT - 1;
        ball.vx = -Math.abs(ball.vx);
        this.playSound('hit');
      }
      if (ball.y <= GAME_TOP) {
        ball.y = GAME_TOP + 1;
        ball.vy = Math.abs(ball.vy);
        this.playSound('hit');
      }

      // Paddle collision
      if (ball.vy > 0 &&
          ball.y >= paddle.y - 1 && ball.y <= paddle.y &&
          ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {

        const hitPos = (ball.x - paddle.x) / paddle.width;
        const angle = (hitPos - 0.5) * 1.2;

        ball.vx = angle * 2;
        ball.vy = -Math.abs(ball.vy);
        ball.y = paddle.y - 1;

        if (paddle.sticky) {
          ball.active = false;
          paddle.sticky = false;
        }

        this.playSound('hit');
        this.data.comboCount = 0;
      }

      // Brick collisions
      for (const brick of this.data.bricks) {
        if (brick.destroyed) continue;

        if (ball.x >= brick.x && ball.x < brick.x + brick.width &&
            ball.y >= brick.y && ball.y < brick.y + brick.height) {

          const fromLeft = ball.x - brick.x;
          const fromRight = brick.x + brick.width - ball.x;
          const fromTop = ball.y - brick.y;
          const fromBottom = brick.y + brick.height - ball.y;

          const minHoriz = Math.min(fromLeft, fromRight);
          const minVert = Math.min(fromTop, fromBottom);

          if (minHoriz < minVert) {
            ball.vx = -ball.vx;
          } else {
            ball.vy = -ball.vy;
          }

          brick.hits--;
          if (brick.hits <= 0) {
            brick.destroyed = true;
            this.data.score += brick.points * (1 + Math.floor(this.data.comboCount / 3));
            this.data.comboCount++;

            if (brick.powerUp) {
              this.spawnPowerUp(brick.x + brick.width / 2, brick.y, brick.powerUp);
            }
            this.playSound('explosion');
          } else {
            this.playSound('hit');
          }
          break;
        }
      }

      // Ball fell below paddle
      if (ball.y > GAME_BOTTOM) {
        if (this.data.balls.length > 1) {
          this.data.balls.splice(i, 1);
        } else {
          this.loseLife();
        }
      }
    }
  }

  private spawnPowerUp(x: number, y: number, type: PowerUpType): void {
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

  private updatePowerUps(): void {
    const paddle = this.data.paddle;

    for (let i = this.data.powerUps.length - 1; i >= 0; i--) {
      const pu = this.data.powerUps[i];
      if (!pu.active) continue;

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

  private applyPowerUp(type: PowerUpType): void {
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

  private loseLife(): void {
    this.data.lives--;
    this.data.comboCount = 0;
    this.playSound('gameover');

    if (this.data.lives <= 0) {
      this.data.state = 'gameover';
      this.stopMusic();
    } else {
      this.data.balls = [this.createBall(true)];
      this.data.paddle.sticky = false;
      this.data.paddle.laser = false;
    }
  }

  private checkLevelComplete(): boolean {
    const breakableBricks = this.data.bricks.filter(b => !b.destroyed && b.maxHits < 999);
    return breakableBricks.length === 0;
  }

  private nextLevel(): void {
    if (this.data.level >= 20) {
      this.data.state = 'victory';
      this.stopMusic();
    } else {
      this.data.score += 1000 * this.data.level;
      this.initLevel(this.data.level + 1);
    }
  }

  private updateShineEffect(): void {
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

  private async playSound(type: 'hit' | 'explosion' | 'powerup' | 'gameover' | 'levelComplete'): Promise<void> {
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
    } catch (e) {
      // Audio not available, silently fail
    }
  }

  private async startMusic(): Promise<void> {
    if (this.musicStarted) return;
    try {
      await this.audio.init();
      await this.audio.generateMusic({
        prompt: 'upbeat arcade game chiptune',
        tempo: 140,
        pattern: 'x-x-x-x-',
        instruments: ['square', 'triangle'],
      });
      this.musicStarted = true;
    } catch (e) {
      // Music not available, silently fail
    }
  }

  private stopMusic(): void {
    try {
      this.audio.stopMusic();
      this.musicStarted = false;
    } catch (e) {
      // Ignore
    }
  }

  // =============================================================================
  // Rendering
  // =============================================================================

  private render(): string {
    this.renderer.clear();

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
      case 'enterName':
        return this.renderEnterName();
      case 'help':
        return this.renderHelp();
    }

    return '';
  }

  private renderMenu(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

    const title = [' ARKANOID ', '  BLOCKS  '];

    let y = 4;
    for (const line of title) {
      this.renderer.drawText(
        Math.floor(SCREEN_WIDTH / 2) - Math.floor(line.length / 2),
        y++,
        line,
        ANSI.fg.brightYellow,
        ANSI.bg.blue
      );
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
      this.renderer.drawText(
        Math.floor(SCREEN_WIDTH / 2) - Math.floor(text.length / 2),
        y++,
        text,
        selected ? ANSI.fg.brightYellow : ANSI.fg.white,
        selected ? ANSI.bg.blue : ''
      );
    }

    this.renderer.drawText(20, 18, 'Use UP/DOWN to select, ENTER to confirm', ANSI.fg.brightBlack);
    this.renderer.drawText(30, 20, 'Classic Arcade Action!', ANSI.fg.cyan);

    return this.renderer.flush();
  }

  private renderGame(): string {
    this.renderer.add(ANSI.hide);

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
      if (brick.destroyed) continue;
      let bg = brick.bgColor;
      if (brick.shineFrame > 0 && brick.shineFrame < 5) {
        bg = ANSI.bg.brightWhite;
      }
      if (brick.maxHits > 1 && brick.hits < brick.maxHits) {
        const damage = brick.maxHits - brick.hits;
        if (damage === 1) bg = brick.bgColor.replace('4', '10');
      }
      this.renderer.drawBlock(brick.x, brick.y, bg, brick.width);
    }

    for (const pu of this.data.powerUps) {
      if (!pu.active) continue;
      const colors = POWERUP_COLORS[pu.type];
      this.renderer.drawText(Math.floor(pu.x), Math.floor(pu.y), colors.char, colors.fg, colors.bg);
    }

    const paddle = this.data.paddle;
    let paddleBg = paddle.bgColor;
    if (paddle.sticky) paddleBg = ANSI.bg.brightGreen;
    if (paddle.laser) paddleBg = ANSI.bg.brightRed;
    this.renderer.drawBlock(paddle.x, paddle.y, paddleBg, paddle.width);

    for (const ball of this.data.balls) {
      this.renderer.drawBlock(Math.floor(ball.x), Math.floor(ball.y), ANSI.bg.brightWhite, 1);
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

  private renderGameOver(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

    this.renderer.drawText(33, 8, '  GAME OVER  ', ANSI.fg.white, ANSI.bg.red);
    this.renderer.drawText(30, 11, `Final Score: ${this.data.score}`, ANSI.fg.brightYellow);
    this.renderer.drawText(30, 12, `Level Reached: ${this.data.level}`, ANSI.fg.brightCyan);

    if (this.isHighScore()) {
      this.renderer.drawText(28, 15, 'NEW HIGH SCORE! Press ENTER', ANSI.fg.brightGreen);
    } else {
      this.renderer.drawText(30, 15, 'Press ENTER for menu', ANSI.fg.white);
    }

    return this.renderer.flush();
  }

  private renderVictory(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

    this.renderer.drawText(32, 7, '  VICTORY!  ', ANSI.fg.black, ANSI.bg.brightGreen);
    this.renderer.drawText(28, 9, 'You completed all 20 levels!', ANSI.fg.brightYellow);
    this.renderer.drawText(30, 12, `Final Score: ${this.data.score}`, ANSI.fg.brightCyan);

    const colors = [ANSI.bg.red, ANSI.bg.yellow, ANSI.bg.green, ANSI.bg.cyan, ANSI.bg.magenta];
    for (let i = 0; i < 10; i++) {
      this.renderer.drawBlock(15 + i * 5, 14, colors[i % 5], 4);
    }

    if (this.isHighScore()) {
      this.renderer.drawText(28, 17, 'NEW HIGH SCORE! Press ENTER', ANSI.fg.brightGreen);
    } else {
      this.renderer.drawText(30, 17, 'Press ENTER for menu', ANSI.fg.white);
    }

    return this.renderer.flush();
  }

  private renderHighscores(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

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
      } else {
        this.renderer.drawText(15, y, `${(i + 1).toString().padStart(2, ' ')}.  ----------  ----------  -----  ----------`, ANSI.fg.brightBlack);
      }
    }

    this.renderer.drawText(30, 20, 'Press any key to return', ANSI.fg.white);

    return this.renderer.flush();
  }

  private renderEnterName(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

    this.renderer.drawText(30, 8, '  NEW HIGH SCORE!  ', ANSI.fg.black, ANSI.bg.brightGreen);
    this.renderer.drawText(30, 11, `Your Score: ${this.data.score}`, ANSI.fg.brightYellow);
    this.renderer.drawText(28, 14, 'Enter your name:', ANSI.fg.white);
    this.renderer.drawText(28, 16, `> ${this.data.playerName}_`, ANSI.fg.brightCyan, ANSI.bg.blue);
    this.renderer.drawText(25, 19, 'Press ENTER when done (max 10 chars)', ANSI.fg.brightBlack);

    return this.renderer.flush();
  }

  private renderHelp(): string {
    this.renderer.add(ANSI.clear + ANSI.home + ANSI.hide);

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

  private handleInput(key: string): void {
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
        } else if (k === 'q') {
          this.data.state = 'menu';
          this.stopMusic();
        }
        break;
      case 'gameover':
      case 'victory':
        if (k === 'enter' || k === '\r' || k === '\n') {
          if (this.isHighScore()) {
            this.data.state = 'enterName';
          } else {
            this.data.state = 'menu';
          }
        }
        break;
      case 'highscores':
      case 'help':
        this.data.state = 'menu';
        break;
      case 'enterName':
        this.handleNameInput(key);
        break;
    }
  }

  private handleMenuInput(k: string): void {
    const maxOptions = 4;

    if (k === 'arrowup' || k === 'up' || k === 'w') {
      this.data.menuSelection = (this.data.menuSelection - 1 + maxOptions + 1) % (maxOptions + 1);
    } else if (k === 'arrowdown' || k === 'down' || k === 's') {
      this.data.menuSelection = (this.data.menuSelection + 1) % (maxOptions + 1);
    } else if (k === 'enter' || k === '\r' || k === '\n') {
      switch (this.data.menuSelection) {
        case 0: this.startGame(); break;
        case 1: this.cycleDifficulty(); break;
        case 2: this.data.state = 'highscores'; break;
        case 3: this.data.state = 'help'; break;
        case 4: this.quit(); break;
      }
    }
  }

  private handleGameInput(k: string): void {
    if (k === 'arrowleft' || k === 'left' || k === 'a') {
      this.movePaddle(-1);
    } else if (k === 'arrowright' || k === 'right' || k === 'd') {
      this.movePaddle(1);
    } else if (k === ' ' || k === 'space') {
      if (this.data.balls.some(b => !b.active)) {
        this.launchBall();
      } else {
        this.data.state = 'paused';
      }
    } else if (k === 'q') {
      this.data.state = 'menu';
      this.stopMusic();
    }
  }

  private async handleNameInput(key: string): Promise<void> {
    if (key === 'enter' || key === '\r' || key === '\n') {
      if (this.data.playerName.length > 0) {
        await this.saveHighscore();
        this.data.state = 'highscores';
      }
    } else if (key === 'backspace' || key === '\x7f') {
      this.data.playerName = this.data.playerName.slice(0, -1);
    } else if (key.length === 1 && this.data.playerName.length < 10) {
      if (/[a-zA-Z0-9]/.test(key)) {
        this.data.playerName += key.toUpperCase();
      }
    }
  }

  private handleMouseInput(event: { type: string; x: number; y: number; button?: number }): void {
    // Mouse events: mouse-hover, mouse-click, mouse-drag, mouse-up
    // x and y are 1-indexed terminal coordinates

    if (this.data.state === 'playing') {
      // Map mouse X position to paddle position
      // Mouse x is 1-indexed, game area is GAME_LEFT to GAME_RIGHT
      const mouseX = event.x;
      const paddle = this.data.paddle;
      const paddleHalfWidth = paddle.width / 2;

      // Center the paddle on the mouse position
      let newPaddleX = mouseX - paddleHalfWidth;

      // Clamp to game boundaries
      newPaddleX = Math.max(GAME_LEFT, Math.min(GAME_RIGHT - paddle.width + 1, newPaddleX));

      paddle.x = newPaddleX;

      // Move attached ball with paddle
      for (const ball of this.data.balls) {
        if (!ball.active) {
          ball.x = paddle.x + Math.floor(paddle.width / 2);
        }
      }

      // Click to launch ball
      if (event.type === 'mouse-click') {
        if (this.data.balls.some(b => !b.active)) {
          this.launchBall();
        }
      }

      // Render immediately for smooth mouse movement
      this.door.send(this.render());
    } else if (this.data.state === 'menu' && event.type === 'mouse-click') {
      // Menu click handling - check Y position for menu items
      const menuStartY = 10;
      const clickY = event.y;

      if (clickY >= menuStartY && clickY <= menuStartY + 4) {
        const selection = clickY - menuStartY;
        this.data.menuSelection = selection;

        switch (selection) {
          case 0: this.startGame(); break;
          case 1: this.cycleDifficulty(); break;
          case 2: this.data.state = 'highscores'; break;
          case 3: this.data.state = 'help'; break;
          case 4: this.quit(); break;
        }

        this.door.send(this.render());
      }
    }
  }

  private cycleDifficulty(): void {
    const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
    const idx = difficulties.indexOf(this.data.difficulty);
    this.data.difficulty = difficulties[(idx + 1) % difficulties.length];
  }

  private startGame(): void {
    this.data.score = 0;
    this.data.lives = INITIAL_LIVES;
    this.data.startTime = Date.now();
    this.initLevel(1);
    this.data.state = 'playing';
    this.startMusic();
  }

  private quit(): void {
    this.door.send(ANSI.show + ANSI.reset);
    this.door.send(ANSI.clear + ANSI.home);
    this.door.send('\x1b[32mThanks for playing ARKANOID!\x1b[0m\r\n');
    this.stopMusic();
    this.keyTracker.stop();
    this.door.shutdown();
  }

  public start(): void {
    this.door.setFPS(30);
    this.door.start();
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const game = new ArkanoidGame();
game.start();
