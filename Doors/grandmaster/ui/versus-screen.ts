/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent minimaps and attack indicators
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/screen';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import { MinimapRenderer, OpponentTracker } from './minimap';
import type { GrandmasterNetworkManager, GameUpdate } from '../network/network-manager';
import type { AttackManager } from '../network/attack-system';
import { BotPlayer } from '../ai/bot-player';

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
    botDifficulty?: number
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

    // Initialize bot player if difficulty provided (CPU Battle mode)
    if (botDifficulty !== undefined) {
      this.botPlayer = new BotPlayer(botDifficulty as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
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
    this.boardBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: 24,  // 10 columns × 2 chars + borders
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'white' } },
    });

    // Stats (below board)
    this.statsBox = createBox({
      parent: this.screen,
      top: 22,
      left: 0,
      width: 24,
      height: 3,
      content: '',
    });

    // Garbage queue indicator (right of board)
    this.garbageIndicator = createBox({
      parent: this.screen,
      top: 0,
      left: 24,
      width: 6,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      content: '{red-fg}GARBAGE{/red-fg}',
    });

    // Attack indicator
    this.attackIndicator = createBox({
      parent: this.screen,
      top: 22,
      left: 24,
      width: 6,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: '',
    });

    // Minimap container (right side)
    this.minimapContainer = createBox({
      parent: this.screen,
      top: 0,
      left: 30,
      width: 50,
      height: 25,
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

    // Main game loop
    let lastTime = Date.now();
    const updateInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(updateInterval);
        return;
      }

      const now = Date.now();
      const deltaTime = now - lastTime;
      lastTime = now;

      // Update player's game
      this.engine.update(deltaTime);

      // Update bot AI if in CPU Battle mode
      if (this.botPlayer) {
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
      }
    }, 16);  // ~60 FPS
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

    // Render board (reuse from GameScreen logic)
    // ... (similar to game-screen.ts renderBoard)

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
      this.screen,
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
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
