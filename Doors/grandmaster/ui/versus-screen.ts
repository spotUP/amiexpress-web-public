/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent minimaps and attack indicators
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import { MinimapRenderer, OpponentTracker } from './minimap';
import type { GrandmasterNetworkManager, GameUpdate } from '../network/network-manager';
import type { AttackManager } from '../network/attack-system';
import { BotPlayer } from '../ai/bot-player';
import { getGhostY } from '../core/board';

/**
 * Versus Screen
 *
 * Extends game screen with multiplayer features (online or CPU battle)
 */
export class VersusScreen {
  private screen: Screen;
  private engine: GameEngine;
  private inputHandler: InputHandler;
  private sounds: SoundEngine;
  private state: AppState;
  private network: GrandmasterNetworkManager | null;
  private attackManager: AttackManager;
  private minimapRenderer: MinimapRenderer;
  private opponentTracker: OpponentTracker;
  private botPlayer: BotPlayer | null = null;
  private versusAI: any | null = null;  // VersusAI controller for CPU Battle mode

  // UI Elements
  private boardBox: any;
  private nextBox: any;            // Player's next queue
  private opponentBoardBox: any;   // 1v1: full opponent board
  private opponentInfoBox: any;    // 1v1: opponent name/stats
  private minimapContainer: any;   // Battle royale: minimap grid
  private garbageIndicator: any;
  private attackIndicator: any;
  private statsBox: any;

  private running: boolean = false;
  private unsubscribers: Array<() => void> = [];

  constructor(
    screen: Screen,
    engine: GameEngine,
    inputHandler: InputHandler,
    sounds: SoundEngine,
    state: AppState,
    network: GrandmasterNetworkManager | null,
    attackManager: AttackManager,
    botOrAI?: number | any  // number = old botDifficulty, object = VersusAI controller
  ) {
    this.screen = screen;
    this.engine = engine;
    this.inputHandler = inputHandler;
    this.sounds = sounds;
    this.state = state;
    this.network = network;
    this.attackManager = attackManager;
    this.minimapRenderer = new MinimapRenderer({ height: 18, compact: true });
    this.opponentTracker = new OpponentTracker();

    // Check if AI controller was passed (new implementation)
    if (botOrAI && typeof botOrAI === 'object') {
      this.versusAI = botOrAI;
    }
    // Legacy: Initialize bot player if difficulty provided (old single-bot mode)
    else if (typeof botOrAI === 'number') {
      this.botPlayer = new BotPlayer(botOrAI as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
    }

    this.setupUI();
    if (this.network) {
      this.setupNetworkListeners();
    }
  }

  /**
   * Setup UI layout
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // 80×24 layout:
    //   Col  0-21 : player board (22)
    //   Col 22-24 : garbage strip  (3)
    //   Col 25-46 : opponent board (22)
    //   Col 47-60 : player NEXT queue (14)
    //   Col 61-79 : VS info panel  (19)  — 22+3+22+14+19 = 80
    //   Row 23    : one-line stats bar

    // Player board
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 0,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      fixed: true,
    });

    // Garbage queue strip
    this.garbageIndicator = createBox({
      parent: this.screen,
      top: 1,
      left: 22,
      width: 3,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      content: '',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Opponent full board (same dimensions as player board)
    this.opponentBoardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 25,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' CPU ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Player NEXT queue
    this.nextBox = createBox({
      parent: this.screen,
      top: 1,
      left: 47,
      width: 14,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      label: ' NEXT ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // VS info panel (narrower — 19 wide)
    this.opponentInfoBox = createBox({
      parent: this.screen,
      top: 1,
      left: 61,
      width: 19,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' VS ',
      content: '',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // attackIndicator is now part of opponentInfoBox — null it out
    this.attackIndicator = null;

    // Player stats — bottom row, no border
    this.statsBox = createBox({
      parent: this.screen,
      top: 23,
      left: 0,
      width: 61,
      height: 1,
      border: 'none' as any,
      content: '',
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // minimapContainer kept as null — not used in 1v1
    this.minimapContainer = null;
  }

  /**
   * Setup network event listeners
   */
  private setupNetworkListeners(): void {
    if (!this.network) return;  // Safety check

    // Opponent updates
    const unsubUpdate = this.network.onUpdate((update: GameUpdate) => {
      this.opponentTracker.updateOpponent(update.playerId, {
        id: update.playerId,
        board: update.board,
        level: update.level,
        grade: update.grade,
        alive: true,
      });
    });
    this.unsubscribers.push(unsubUpdate);

    // Incoming attacks
    this.attackManager.onGarbageReceivedCallback((lines: number, sender: string) => {
      this.sounds.playSfx('garbage');
      this.showAttackFlash('INCOMING', 'red');
    });

    // Outgoing attacks
    this.attackManager.onAttackSentCallback((lines: number, type: string) => {
      this.sounds.playSfx('attack');
      this.showAttackFlash(`SENT ${lines}`, 'yellow');
    });
  }

  /**
   * Show attack flash animation
   */
  private showAttackFlash(text: string, color: string): void {
    this.attackIndicator.setContent(`{${color}-fg}{bold}${text}{/bold}{/${color}-fg}`);
    this.screen.render();

    setTimeout(() => {
      this.attackIndicator.setContent('');
      this.screen.render();
    }, 500);
  }

  /**
   * Run game loop
   */
  async run(): Promise<void> {
    this.running = true;

    // Setup input handlers
    this.setupInput();

    // Countdown
    await this.showCountdown();

    // Start game
    this.engine.start();

    // Main game loop - returns a promise that resolves when game ends
    return new Promise((resolve) => {
      let lastTime = Date.now();
      const updateInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(updateInterval);
          resolve();
          return;
        }

        const now = Date.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        // Update player's game
        this.engine.update(deltaTime);
        this.inputHandler.update(deltaTime);

        // Update AI opponents (new CPU Battle mode with multiple bots)
        if (this.versusAI) {
          this.versusAI.update(deltaTime);

          // Update opponent minimaps every 100ms
          if (now % 100 < deltaTime) {
            const opponentBoards = this.versusAI.getOpponentBoards();
            for (const opponent of opponentBoards) {
              this.opponentTracker.updateOpponent(opponent.id, {
                name: opponent.name,
                board: opponent.board,
                level: 0,
                grade: '5',
                alive: opponent.alive,
              });
            }
          }
        }
        // Legacy: Update bot AI if in old single-bot CPU Battle mode
        else if (this.botPlayer) {
          this.botPlayer.update(deltaTime, this.engine);
        }

        // Send state to opponents (online multiplayer only)
        if (this.network && now % 100 < deltaTime) {
          this.network.sendUpdate(this.engine.getState());
        }

        // Render
        this.render();

        // Check for game over
        const gameState = this.engine.getState();
        if (gameState.status === 'gameover' || gameState.status === 'complete') {
          this.running = false;
          clearInterval(updateInterval);
          resolve();
        }
      }, 16);  // ~60 FPS
    });
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    this.inputHandler.on('left', () => this.engine.move(-1));
    this.inputHandler.on('right', () => this.engine.move(1));
    this.inputHandler.on('rotate_cw', () => this.engine.rotate(1));
    this.inputHandler.on('rotate_ccw', () => this.engine.rotate(-1));
    this.inputHandler.on('soft_drop', () => this.engine.softDrop());
    this.inputHandler.on('hard_drop', () => this.engine.hardDrop());
    this.inputHandler.on('hold', () => this.engine.hold());
    this.inputHandler.on('pause', () => this.togglePause());
  }

  /**
   * Show countdown
   */
  private async showCountdown(): Promise<void> {
    // Play ready sound
    this.sounds.playSfx('ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const countdown = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < countdown.length; i++) {
      const text = countdown[i];

      // Play appropriate sound
      if (text === 'GO!') {
        this.sounds.playSfx('go');
      } else {
        this.sounds.playSfx('countdown');
      }

      const box = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 20,
        height: 5,
        content: `{yellow-fg}{bold}${text}{/bold}{/yellow-fg}`,
        focusable: false,
        mouse: false,
        clickable: false,
      });
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 1000));
      box.destroy();
    }
  }

  /**
   * Render game state
   */
  private render(): void {
    const gameState = this.engine.getState();

    // Render board
    this.renderBoard(gameState);

    // Render next queue
    this.renderNextQueue(gameState.nextQueue ?? []);

    // Render stats
    this.statsBox.setContent(
      `Score: {yellow-fg}${gameState.score}{/yellow-fg}  ` +
      `Level: {cyan-fg}${gameState.level}{/cyan-fg}  ` +
      `Grade: {magenta-fg}${gameState.grade}{/magenta-fg}`
    );

    // Render garbage queue (compact: show count only)
    const pending = this.attackManager.getPendingGarbage();
    this.garbageIndicator.setContent(
      pending > 0 ? `{red-fg}${pending}{/red-fg}` : ''
    );

    // Render opponent board + combined VS info panel
    const opponents = this.opponentTracker.getAliveOpponents();
    const opp = opponents[0] ?? null;

    if (opp) {
      this.renderOpponentBoard(opp);
      (this.opponentBoardBox as any).setLabel(` ${opp.name || 'CPU'} `);
    }

    // Combined VS panel: opponent info + incoming attack status
    const attackPending = this.attackManager.getPendingGarbage();
    const oppName = opp?.name || 'CPU';
    const oppLevel = opp?.level ?? '-';
    const oppGrade = opp?.grade ?? '-';
    const oppAlive = opp ? opp.alive : true;
    this.opponentInfoBox.setContent(
      `{cyan-fg}${oppName}{/cyan-fg}\n\n` +
      `Level: {yellow-fg}${oppLevel}{/yellow-fg}\n` +
      `Grade: {magenta-fg}${oppGrade}{/magenta-fg}\n` +
      `Status: {${oppAlive ? 'green' : 'red'}-fg}${oppAlive ? 'ALIVE' : 'TOPPED OUT'}{/${oppAlive ? 'green' : 'red'}-fg}\n\n` +
      (attackPending > 0
        ? `{red-fg}INCOMING: ${attackPending} line${attackPending > 1 ? 's' : ''}{/red-fg}`
        : `{gray-fg}No incoming attack{/gray-fg}`)
    );

    this.screen.render();
  }

  /**
   * Toggle pause
   */
  private togglePause(): void {
    const gameState = this.engine.getState();
    if (gameState.status === 'playing') {
      this.engine.pause();
    } else if (gameState.status === 'paused') {
      this.engine.resume();
    }
  }

  /**
   * Render the game board
   */
  private renderBoard(state: any): void {
    const { board, currentPiece } = state;
    let content = '';

    // Get piece shape and ghost position
    let pieceShape: number[][] | null = null;
    let ghostY: number | null = null;

    if (currentPiece) {
      const pieceManager = (this.engine as any).pieceManager;
      const shape = pieceManager?.getShape(currentPiece.type, currentPiece.rotation);
      if (shape) {
        pieceShape = shape;
        // Only show ghost if piece top is visible (entered the playfield at row 4+)
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
        }
      }
    }

    // Render each row (visible rows 4-23)
    for (let y = 4; y < 24; y++) {
      if (y > 4) content += '\n';

      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y]?.[x];
        let char = '  ';  // Empty cell

        // Check if current piece occupies this cell
        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            char = this.getBlockChar(currentPiece.type);
          }
        }

        // Check if ghost piece occupies this cell
        if (ghostY !== null && currentPiece && pieceShape && char === '  ') {
          const px = x - currentPiece.x;
          const py = y - ghostY;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            char = '{gray-fg}░░{/gray-fg}';
          }
        }

        // Check if locked cell
        if (char === '  ' && cell?.filled) {
          char = this.getBlockChar(cell.color);
        }

        content += char;
      }
    }

    this.boardBox.setContent(content);
  }

  /**
   * Render player's next piece queue into nextBox.
   * Each piece is shown in its spawn orientation using 2-char blocks.
   * Up to 5 pieces fit in the 12-row content area (2 rows each + 1 blank).
   */
  private renderNextQueue(queue: string[]): void {
    if (!this.nextBox) return;

    // Piece shapes (spawn rotation, trimmed to their bounding box)
    const SHAPES: Record<string, string[]> = {
      I: ['████████'],
      O: ['████', '████'],
      T: ['██████', ' ██  '],
      S: [' ████', '████ '],
      Z: ['████ ', ' ████'],
      J: ['██   ', '██████'],
      L: ['   ██', '██████'],
    };

    const COLORS: Record<string, string> = {
      I: 'cyan', O: 'yellow', T: 'magenta',
      S: 'green', Z: 'red', J: 'blue', L: 'white',
    };

    let content = '';
    const show = Math.min(queue.length, 5);
    for (let i = 0; i < show; i++) {
      const type = queue[i];
      const rows = SHAPES[type] ?? ['??'];
      const color = COLORS[type] ?? 'white';
      for (const row of rows) {
        // Replace block chars with colored version
        content += `{${color}-fg}${row}{/${color}-fg}\n`;
      }
      if (i < show - 1) content += '\n';  // blank separator between pieces
    }

    this.nextBox.setContent(content);
  }

  /**
   * Render opponent board (full size, same layout as player board)
   */
  private renderOpponentBoard(opponent: any): void {
    if (!this.opponentBoardBox || !opponent.board) return;
    const board = opponent.board;
    let content = '';
    const startY = Math.max(0, board.height - 20);
    for (let y = startY; y < board.height; y++) {
      if (y > startY) content += '\n';
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y]?.[x];
        content += cell?.filled ? this.getBlockChar(cell.color) : '  ';
      }
    }
    this.opponentBoardBox.setContent(content);
  }

  /**
   * Get colored block character for piece type
   */
  private getBlockChar(type: string): string {
    const colors: Record<string, string> = {
      I: '{cyan-fg}██{/cyan-fg}',
      O: '{yellow-fg}██{/yellow-fg}',
      T: '{magenta-fg}██{/magenta-fg}',
      S: '{green-fg}██{/green-fg}',
      Z: '{red-fg}██{/red-fg}',
      J: '{blue-fg}██{/blue-fg}',
      L: '{white-fg}██{/white-fg}',
    };
    return colors[type] || '{gray-fg}██{/gray-fg}';
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
