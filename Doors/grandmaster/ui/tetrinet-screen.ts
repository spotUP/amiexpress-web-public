/**
 * TetriNET Game Screen
 *
 * Main game screen for TetriNET mode combining:
 * - Main board (left side)
 * - Piece preview and hold
 * - Special inventory panel
 * - Target selector
 * - Opponent mini-boards
 * - Effect overlays
 * - Sudden death timer
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import type { GrandmasterNetworkManager } from '../network/network-manager';
import { InventoryPanel } from './tetrinet/inventory-panel';
import { TargetSelector, type TargetInfo } from './tetrinet/target-selector';
import { OpponentBoards, type OpponentBoardData } from './tetrinet/opponent-boards';
import { EffectOverlay } from './tetrinet/effect-overlay';
import { getGhostY } from '../core/board';
import type { SpecialType } from '../core/tetrinet/specials';
import type { TetriNetBoard } from '../core/tetrinet/tetrinet-board';

/**
 * TetriNET Screen options
 */
export interface TetriNetScreenOptions {
  screen: Screen;
  engine: TetriNetEngine;
  inputHandler: InputHandler;
  sounds: SoundEngine;
  state: AppState;
  network?: GrandmasterNetworkManager;
  playerName: string;
}

/**
 * TetriNET Game Screen
 */
export class TetriNetScreen {
  private screen: Screen;
  private engine: TetriNetEngine;
  private inputHandler: InputHandler;
  private sounds: SoundEngine;
  private state: AppState;
  private network: GrandmasterNetworkManager | null;
  private playerName: string;

  // UI Elements
  private boardBox: any;
  private previewBox: any;
  private holdBox: any;
  private statsBox: any;
  private suddenDeathBox: any;

  // TetriNET-specific UI
  private inventoryPanel!: InventoryPanel;
  private targetSelector!: TargetSelector;
  private opponentBoards!: OpponentBoards;
  private effectOverlay!: EffectOverlay;

  private running: boolean = false;
  private unsubscribers: Array<() => void> = [];

  constructor(options: TetriNetScreenOptions) {
    this.screen = options.screen;
    this.engine = options.engine;
    this.inputHandler = options.inputHandler;
    this.sounds = options.sounds;
    this.state = options.state;
    this.network = options.network || null;
    this.playerName = options.playerName;

    this.setupUI();
    this.setupEngineCallbacks();
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

    // Main board (left side)
    // Board: 12 columns x 2 chars = 24, plus 2 for borders = 26 width
    // Height: 20 visible rows + 2 for borders = 22
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 0,
      width: 26,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
    });

    // Preview box (right of board)
    this.previewBox = createBox({
      parent: this.screen,
      top: 1,
      left: 26,
      width: 12,
      height: 6,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Next ',
    });

    // Hold box (below preview)
    this.holdBox = createBox({
      parent: this.screen,
      top: 7,
      left: 26,
      width: 12,
      height: 6,
      border: { type: 'line' },
      style: { border: { fg: 'magenta' } },
      label: ' Hold ',
    });

    // Inventory panel (below hold)
    this.inventoryPanel = new InventoryPanel({
      parent: this.screen,
      top: 13,
      left: 26,
      maxSlots: 10,
    });

    // Target selector (below inventory)
    this.targetSelector = new TargetSelector({
      parent: this.screen,
      top: 16,
      left: 26,
      width: 25,
    });

    // Stats box (bottom left)
    this.statsBox = createBox({
      parent: this.screen,
      top: 23,
      left: 0,
      width: 38,
      height: 3,
      content: '',
    });

    // Sudden death box (above stats)
    this.suddenDeathBox = createBox({
      parent: this.screen,
      bottom: 3,
      left: 0,
      width: 38,
      height: 1,
      content: '',
    });

    // Opponent boards (right side)
    this.opponentBoards = new OpponentBoards({
      parent: this.screen,
      top: 1,
      left: 52,
      maxOpponents: 5,
    });

    // Effect overlay
    this.effectOverlay = new EffectOverlay({
      parent: this.screen,
      boardTop: 1,
      boardLeft: 0,
      boardWidth: 26,
      boardHeight: 22,
    });
  }

  /**
   * Setup engine event callbacks
   */
  private setupEngineCallbacks(): void {
    // Special used
    this.engine.onSpecialUsed((type, targetId) => {
      this.sounds.playSfx('lock');  // Using existing sound effect
      this.inventoryPanel.showUseAnimation();

      if (targetId) {
        this.targetSelector.showAttackAnimation(targetId);
        this.opponentBoards.showAttackAnimation(targetId, 'attack');
      }
    });

    // Lines added (garbage to send)
    this.engine.onLinesAdded((count) => {
      this.sounds.playSfx('line_clear');
      // Notify network of outgoing garbage
      if (this.network) {
        const target = this.targetSelector.getSelectedTarget();
        if (target) {
          // TODO: Send garbage to target via network
        }
      }
    });

    // Game over
    this.engine.onGameOver(() => {
      this.running = false;
      this.sounds.playSfx('game_over');
    });

    // Board update (for network sync)
    this.engine.onBoardUpdate((board) => {
      if (this.network) {
        this.network.sendUpdate({
          board: board as any,
          level: this.engine.getState().level,
          grade: 'S1',  // TetriNET doesn't use grades like TGM
        } as any);
      }
    });

    // Sudden death callbacks
    const suddenDeath = this.engine.getSuddenDeath();
    if (suddenDeath) {
      suddenDeath.onActivated(() => {
        this.sounds.playSfx('ready');  // Using existing sound
        this.effectOverlay.showSuddenDeathWarning();
      });

      suddenDeath.onLineAdded((totalLines) => {
        this.sounds.playSfx('garbage');
        this.effectOverlay.showSuddenDeathLine(totalLines);
      });
    }
  }

  /**
   * Setup network event listeners
   * NOTE: Full network integration will be implemented in Phase 5
   */
  private setupNetworkListeners(): void {
    if (!this.network) return;

    // Opponent field updates
    const unsubUpdate = this.network.onUpdate((update) => {
      this.opponentBoards.updateSingleBoard({
        id: update.playerId,
        name: update.playerId,  // Use ID as name for now
        board: update.board as TetriNetBoard,
        level: update.level,
        alive: true,
        hasImmunity: false, // TODO: sync immunity state
      }, 0); // TODO: track opponent index properly

      this.targetSelector.updateOpponent(update.playerId, {
        level: update.level,
      });
    });
    this.unsubscribers.push(unsubUpdate);

    // TODO: Phase 5 - Add TetriNET-specific network events:
    // - onPlayerJoined
    // - onPlayerLeft
    // - onSpecialReceived
    // - onGarbageReceived
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

        // Update game
        this.engine.update(deltaTime);
        this.inputHandler.update(deltaTime);

        // Send state to opponents
        if (this.network && now % 100 < deltaTime) {
          this.network.sendUpdate(this.engine.getState() as any);
        }

        // Render
        this.render();

        // Check for game over
        const gameState = this.engine.getState();
        if (gameState.status === 'gameover' || gameState.status === 'won') {
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
    // Movement - confusion reversal is handled by engine
    this.inputHandler.on('left', () => this.engine.move(-1));
    this.inputHandler.on('right', () => this.engine.move(1));

    // Rotation
    this.inputHandler.on('rotate_cw', () => this.engine.rotate(1));
    this.inputHandler.on('rotate_ccw', () => this.engine.rotate(-1));

    // Drop
    this.inputHandler.on('soft_drop', () => this.engine.softDrop());
    this.inputHandler.on('hard_drop', () => this.engine.hardDrop());

    // Hold
    this.inputHandler.on('hold', () => this.engine.hold());

    // Pause
    this.inputHandler.on('pause', () => this.togglePause());

    // Special usage (spacebar) - use screen.key since it's TetriNET-specific
    this.screen.key(['space', 'enter'], () => {
      const target = this.targetSelector.getSelectedTarget();
      if (target) {
        this.engine.useSpecial(target.id);
      } else {
        // Self-targeting specials
        this.engine.useSpecial();
      }
    });

    // Target selection with tab
    this.screen.key(['tab'], () => this.targetSelector.selectNext());
    this.screen.key(['S-tab'], () => this.targetSelector.selectPrevious());

    // Number keys for quick target selection
    for (let i = 1; i <= 5; i++) {
      this.screen.key([`${i}`], () => this.targetSelector.selectByNumber(i));
    }
  }

  /**
   * Show countdown
   */
  private async showCountdown(): Promise<void> {
    this.sounds.playSfx('ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const countdown = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < countdown.length; i++) {
      const text = countdown[i];

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
    const effects = this.engine.getEffectManager();

    // Render board
    this.renderBoard(gameState);

    // Render preview (unless darkness)
    if (!effects.hasDarkness()) {
      this.renderPreview(gameState);
    } else {
      this.previewBox.setContent('{gray-fg}  ???{/gray-fg}');
    }

    // Render hold
    this.renderHold(gameState);

    // Update inventory
    this.inventoryPanel.updateFromArray(gameState.inventory || []);

    // Update effects overlay
    this.effectOverlay.update(effects);

    // Render stats
    this.statsBox.setContent(
      `Score: {yellow-fg}${gameState.score}{/yellow-fg}  ` +
      `Level: {cyan-fg}${gameState.level}{/cyan-fg}  ` +
      `Lines: {green-fg}${gameState.lines}{/green-fg}`
    );

    // Render sudden death status
    const suddenDeath = this.engine.getSuddenDeath();
    if (suddenDeath && suddenDeath.isEnabled()) {
      this.suddenDeathBox.setContent(suddenDeath.getDisplay());
    }

    this.screen.render();
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
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
        }
      }
    }

    // Render each row (visible rows 4-23 for TetriNET's 22-row board)
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
          // Check for special block
          if (cell.special) {
            char = this.getSpecialBlockChar(cell.special);
          } else {
            char = this.getBlockChar(cell.color);
          }
        }

        content += char;
      }
    }

    this.boardBox.setContent(content);
  }

  /**
   * Render piece preview
   */
  private renderPreview(state: any): void {
    const nextPieces = state.preview || [];
    if (nextPieces.length === 0) {
      this.previewBox.setContent('');
      return;
    }

    // Show first 3 preview pieces
    let content = '';
    const pieceManager = (this.engine as any).pieceManager;

    for (let i = 0; i < Math.min(3, nextPieces.length); i++) {
      const pieceType = nextPieces[i];
      const shape = pieceManager?.getShape(pieceType, 0);
      if (shape) {
        for (const row of shape) {
          for (const cell of row) {
            content += cell ? this.getBlockChar(pieceType) : '  ';
          }
          content += '\n';
        }
      }
    }

    this.previewBox.setContent(content);
  }

  /**
   * Render hold piece
   */
  private renderHold(state: any): void {
    const holdPiece = state.holdPiece;
    if (!holdPiece) {
      this.holdBox.setContent('{gray-fg}Empty{/gray-fg}');
      return;
    }

    const pieceManager = (this.engine as any).pieceManager;
    const shape = pieceManager?.getShape(holdPiece, 0);
    if (!shape) {
      this.holdBox.setContent('');
      return;
    }

    let content = '';
    for (const row of shape) {
      for (const cell of row) {
        content += cell ? this.getBlockChar(holdPiece) : '  ';
      }
      content += '\n';
    }

    this.holdBox.setContent(content);
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
   * Get colored block character for special type
   */
  private getSpecialBlockChar(special: SpecialType): string {
    const chars: Record<SpecialType, string> = {
      add_line: '{red-fg}[A]{/red-fg}',
      clear_line: '{cyan-fg}[C]{/cyan-fg}',
      nuke: '{yellow-fg}[N]{/yellow-fg}',
      random_clear: '{green-fg}[R]{/green-fg}',
      switch: '{magenta-fg}[S]{/magenta-fg}',
      clear_specials: '{blue-fg}[B]{/blue-fg}',
      gravity: '{white-fg}[G]{/white-fg}',
      quake: '{yellow-fg}[Q]{/yellow-fg}',
      block_bomb: '{red-fg}[O]{/red-fg}',
      clear_column: '{cyan-fg}[V]{/cyan-fg}',
      immunity: '{white-fg}[I]{/white-fg}',
      darkness: '{gray-fg}[D]{/gray-fg}',
      confusion: '{magenta-fg}[F]{/magenta-fg}',
      mutation: '{green-fg}[M]{/green-fg}',
      zebra: '{white-fg}[Z]{/white-fg}',
      left_gravity: '{blue-fg}[L]{/blue-fg}',
    };
    return chars[special] || '{gray-fg}[?]{/gray-fg}';
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
   * Stop the game
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.inventoryPanel.destroy();
    this.targetSelector.destroy();
    this.opponentBoards.destroy();
    this.effectOverlay.destroy();
  }
}
