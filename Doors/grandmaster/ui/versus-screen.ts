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
  private minimapContainer: any;
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
    this.minimapRenderer = new MinimapRenderer({ height: 10, compact: true });
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

    // Main board (left side, smaller to make room for minimaps)
    // Board: 10 columns × 2 chars = 20, plus 2 for borders = 22 width
    // Height: 20 visible rows + 2 for borders = 22
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,  // Match game-screen positioning
      left: 0,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      fixed: true,
    });

    // Stats (below board)
    this.statsBox = createBox({
      parent: this.screen,
      top: 23,  // Below board (1 + 22 = 23)
      left: 0,
      width: 22,
      height: 3,
      content: '',
    });

    // Garbage queue indicator (right of board)
    this.garbageIndicator = createBox({
      parent: this.screen,
      top: 1,
      left: 22,  // Right edge of board
      width: 6,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      content: '{red-fg}GARBAGE{/red-fg}',
      fixed: true,
    });

    // Attack indicator
    this.attackIndicator = createBox({
      parent: this.screen,
      top: 23,
      left: 22,
      width: 6,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: '',
      fixed: true,
    });

    // Minimap container (right side)
    // Screen width: 80, Board: 22, Garbage: 6, Remaining: 52 for minimap (includes borders)
    const minimapPanel = createBox({
      parent: this.screen,
      top: 1,
      left: 28,  // Right of garbage indicator (22 + 6 = 28)
      width: 52,  // Fits within 80 columns (28 + 52 = 80)
      height: 25,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Opponents ',
      fixed: true,
    });

    this.minimapContainer = createBox({
      parent: minimapPanel,
      top: 1,
      left: 1,
      width: 50,  // Panel width (52) - 2 for borders = 50
      height: 23,
      content: '',
    });
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

    // Render stats
    this.statsBox.setContent(
      `Score: {yellow-fg}${gameState.score}{/yellow-fg}  ` +
      `Level: {cyan-fg}${gameState.level}{/cyan-fg}  ` +
      `Grade: {magenta-fg}${gameState.grade}{/magenta-fg}`
    );

    // Render garbage queue
    const pending = this.attackManager.getPendingGarbage();
    if (pending > 0) {
      const garbageDisplay = '█'.repeat(Math.min(pending, 20));
      this.garbageIndicator.setContent(
        `{red-fg}GARBAGE{/red-fg}\n\n{red-fg}${garbageDisplay}{/red-fg}\n{bold}${pending}{/bold}`
      );
    } else {
      this.garbageIndicator.setContent('{gray-fg}None{/gray-fg}');
    }

    // Render opponent minimaps
    this.minimapRenderer.renderMinimapGrid(
      this.minimapContainer,
      this.opponentTracker.getAliveOpponents(),
      6  // Show up to 6 opponents
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
