/**
 * Attract Mode Screen
 *
 * Cinematic presentation mode with boot sequence, demo AI gameplay,
 * leaderboard displays, and cycling announcements
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/screen';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { GameEngine } from '../core/game';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import { BotPlayer } from '../ai/bot-player';

type AttractState = 'boot' | 'demo' | 'leaderboard' | 'tips' | 'credits';

interface LeaderboardEntry {
  rank: number;
  name: string;
  grade: string;
  level: number;
  score: number;
  time: number | null;
}

/**
 * Attract Mode Screen
 *
 * Auto-plays demo gameplay, shows leaderboards, tips, and credits
 */
export class AttractScreen {
  private screen: Screen;
  private engine: GameEngine | null = null;
  private sounds: SoundEngine;
  private state: AppState;
  private botPlayer: BotPlayer;

  // UI Elements
  private mainBox: any;
  private demoBox: any;
  private infoBox: any;

  // State management
  private attractState: AttractState = 'boot';
  private stateTimer: number = 0;
  private bootAnimationFrame: number = 0;
  private running: boolean = false;
  private exitCallback: (() => void) | null = null;
  private exitHandler: (() => void) | null = null;

  // Rainbow animation
  private rainbowTimer: number = 0;
  private readonly RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];

  // Demo game
  private demoEngine: GameEngine | null = null;
  private demoRunning: boolean = false;

  constructor(
    screen: Screen,
    sounds: SoundEngine,
    state: AppState
  ) {
    this.screen = screen;
    this.sounds = sounds;
    this.state = state;
    this.botPlayer = new BotPlayer(7); // Expert difficulty for demo

    this.setupUI();
  }

  /**
   * Setup UI layout
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Main container (for boot logo) - full screen black background
    this.mainBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      align: 'center',
      content: '',
    });

    // Demo gameplay area (left side) - hidden initially
    this.demoBox = createBox({
      parent: this.screen,
      top: 2,
      left: 2,
      width: 26,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      align: 'center',
      content: '',
    });
    this.demoBox.hide();  // Hidden during boot

    // Info panel (right side) - hidden initially
    this.infoBox = createBox({
      parent: this.screen,
      top: 2,
      left: 30,
      width: 50,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      align: 'center',
      content: '',
    });
    this.infoBox.hide();  // Hidden during boot
  }

  /**
   * Run attract mode
   */
  async run(onExit: () => void): Promise<void> {
    this.running = true;
    this.exitCallback = onExit;

    // Setup input to exit on any key
    this.setupInput();

    // Start with boot sequence
    await this.showBootSequence();

    // Main attract loop
    this.attractState = 'demo';
    this.startDemo();

    const updateInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(updateInterval);
        return;
      }

      this.update(16); // ~60 FPS
      this.render();
    }, 16);
  }

  /**
   * Show boot sequence animation
   */
  private async showBootSequence(): Promise<void> {
    this.attractState = 'boot';

    const logo = [
      '   ██████  ██████   █████  ███    ██ ██████  ',
      '  ██       ██   ██ ██   ██ ████   ██ ██   ██ ',
      '  ██   ███ ██████  ███████ ██ ██  ██ ██   ██ ',
      '  ██    ██ ██   ██ ██   ██ ██  ██ ██ ██   ██ ',
      '   ██████  ██   ██ ██   ██ ██   ████ ██████  ',
      '',
      '  ███    ███  █████  ███████ ████████ ███████ ██████  ',
      '  ████  ████ ██   ██ ██         ██    ██      ██   ██ ',
      '  ██ ████ ██ ███████ ███████    ██    █████   ██████  ',
      '  ██  ██  ██ ██   ██      ██    ██    ██      ██   ██ ',
      '  ██      ██ ██   ██ ███████    ██    ███████ ██   ██ ',
    ];

    // Animate logo line by line
    for (let i = 0; i < logo.length; i++) {
      let content = '{cyan-fg}{bold}\n\n\n\n';
      for (let j = 0; j <= i; j++) {
        content += logo[j] + '\n';
      }
      content += '{/bold}{/cyan-fg}';

      this.mainBox.setContent(content);
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Show version and press key message with rainbow animation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Play ready sound
    this.sounds.playSfx('ready');

    // Animate rainbow colors for 2 seconds
    const startTime = Date.now();
    const animationDuration = 2000;

    while (Date.now() - startTime < animationDuration) {
      this.rainbowTimer++;
      const colorIndex = Math.floor(this.rainbowTimer / 5) % this.RAINBOW_COLORS.length;

      // Create rainbow gradient by coloring each line differently
      let content = '\n\n\n\n{bold}';
      for (let i = 0; i < logo.length; i++) {
        const lineColorIndex = (colorIndex + i) % this.RAINBOW_COLORS.length;
        const color = this.RAINBOW_COLORS[lineColorIndex];
        content += `{${color}-fg}${logo[i]}{/${color}-fg}\n`;
      }
      content += '{/bold}\n{yellow-fg}v1.0.0{/yellow-fg}\n\n';
      content += '{white-fg}A Tetris: The Grand Master 3 Tribute{/white-fg}\n\n';
      content += '{gray-fg}Press any key...{/gray-fg}';

      this.mainBox.setContent(content);
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Start demo gameplay
   */
  private startDemo(): void {
    this.demoEngine = new GameEngine('master', this.state.settings);

    if (this.demoEngine) {
      this.demoEngine.start();
      this.demoRunning = true;
      this.stateTimer = 0;
    }
  }

  /**
   * Update attract mode state
   */
  private update(deltaTime: number): void {
    this.stateTimer += deltaTime;

    switch (this.attractState) {
      case 'demo':
        if (this.demoEngine && this.demoRunning) {
          // Update demo game
          this.demoEngine.update(deltaTime);

          // Update bot AI
          this.botPlayer.update(deltaTime, this.demoEngine);

          // Check if demo ended
          const gameState = this.demoEngine.getState();
          if (gameState.status === 'gameover' || gameState.status === 'complete') {
            this.demoRunning = false;
            this.stateTimer = 0;
            this.attractState = 'leaderboard';
          }

          // Auto-restart after 3 minutes
          if (this.stateTimer > 180000) {
            this.demoRunning = false;
            this.stateTimer = 0;
            this.attractState = 'leaderboard';
          }
        }
        break;

      case 'leaderboard':
        // Show leaderboard for 10 seconds
        if (this.stateTimer > 10000) {
          this.stateTimer = 0;
          this.attractState = 'tips';
        }
        break;

      case 'tips':
        // Show tips for 8 seconds
        if (this.stateTimer > 8000) {
          this.stateTimer = 0;
          this.attractState = 'credits';
        }
        break;

      case 'credits':
        // Show credits for 8 seconds
        if (this.stateTimer > 8000) {
          this.stateTimer = 0;
          this.attractState = 'demo';
          this.startDemo();
        }
        break;
    }
  }

  /**
   * Render attract mode
   */
  private render(): void {
    switch (this.attractState) {
      case 'demo':
        this.renderDemo();
        break;
      case 'leaderboard':
        this.renderLeaderboard();
        break;
      case 'tips':
        this.renderTips();
        break;
      case 'credits':
        this.renderCredits();
        break;
    }

    this.screen.render();
  }

  /**
   * Render demo gameplay
   */
  private renderDemo(): void {
    if (!this.demoEngine) return;

    // Clear main box (remove boot logo)
    this.mainBox.setContent('');
    this.mainBox.hide();

    // Show demo boxes
    this.demoBox.show();
    this.infoBox.show();

    // Bring to front
    this.demoBox.setFront();
    this.infoBox.setFront();

    const gameState = this.demoEngine.getState();
    const board = gameState.board;
    const currentPiece = gameState.currentPiece;

    // Render board
    let boardContent = '';
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        let char = '  ';

        if (cell.filled) {
          const color = this.getPieceColor(cell.color || 'I');
          char = `{${color}-fg}██{/${color}-fg}`;
        } else if (currentPiece) {
          // Check if current piece cell
          const shape = this.getPieceShape(currentPiece.type, currentPiece.rotation);
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;

          if (py >= 0 && py < shape.length && px >= 0 && px < shape[py].length && shape[py][px]) {
            const color = this.getPieceColor(currentPiece.type);
            char = `{${color}-fg}██{/${color}-fg}`;
          }
        }

        boardContent += char;
      }
      boardContent += '\n';
    }

    this.demoBox.setContent(boardContent);

    // Render info panel
    let infoContent = '{cyan-fg}{bold}DEMONSTRATION{/bold}{/cyan-fg}\n\n';
    infoContent += `{white-fg}Grade:{/white-fg} {magenta-fg}{bold}${gameState.grade}{/bold}{/magenta-fg}\n`;
    infoContent += `{white-fg}Level:{/white-fg} {cyan-fg}${gameState.level}{/cyan-fg}\n`;
    infoContent += `{white-fg}Score:{/white-fg} {yellow-fg}${gameState.score.toLocaleString()}{/yellow-fg}\n`;
    infoContent += `{white-fg}Lines:{/white-fg} {green-fg}${gameState.lines}{/green-fg}\n\n`;

    if (gameState.combo > 0) {
      infoContent += `{magenta-fg}{bold}COMBO ${gameState.combo}x{/bold}{/magenta-fg}\n`;
    }

    if (gameState.backToBack) {
      infoContent += `{yellow-fg}{bold}BACK-TO-BACK{/bold}{/yellow-fg}\n`;
    }

    infoContent += '\n\n{gray-fg}CPU Difficulty: Expert (7){/gray-fg}\n\n';
    infoContent += '{yellow-fg}Press any key to start{/yellow-fg}';

    this.infoBox.setContent(infoContent);
  }

  /**
   * Render leaderboard
   */
  private renderLeaderboard(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    // Mock leaderboard data
    const leaderboard: LeaderboardEntry[] = [
      { rank: 1, name: 'ZEN', grade: 'GM', level: 999, score: 999999, time: 529000 },
      { rank: 2, name: 'ACE', grade: 'GM', level: 999, score: 975000, time: 547000 },
      { rank: 3, name: 'KAN', grade: 'MO', level: 999, score: 890000, time: 612000 },
      { rank: 4, name: 'TAK', grade: 'MV', level: 999, score: 845000, time: 658000 },
      { rank: 5, name: 'SRS', grade: 'M', level: 999, score: 789000, time: 701000 },
      { rank: 6, name: 'TGM', grade: 'm9', level: 999, score: 723000, time: 745000 },
      { rank: 7, name: 'ARS', grade: 'm5', level: 850, score: 654000, time: null },
      { rank: 8, name: 'SYS', grade: 'S13', level: 700, score: 587000, time: null },
    ];

    let content = '{yellow-fg}{bold}═══ LEADERBOARD ═══{/bold}{/yellow-fg}\n\n';
    content += '{white-fg} # NAME  GRADE  LEVEL    SCORE      TIME{/white-fg}\n';
    content += '{gray-fg}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{/gray-fg}\n';

    for (const entry of leaderboard) {
      const rankColor = entry.rank <= 3 ? 'yellow' : 'white';
      const gradeColor = entry.grade.startsWith('GM') ? 'magenta' :
                         entry.grade.startsWith('M') ? 'red' :
                         entry.grade.startsWith('m') ? 'cyan' : 'white';

      const timeStr = entry.time
        ? this.formatTime(entry.time)
        : '--:--:--';

      content += `{${rankColor}-fg}${entry.rank.toString().padStart(2)}{/${rankColor}-fg} `;
      content += `{cyan-fg}${entry.name.padEnd(5)}{/cyan-fg} `;
      content += `{${gradeColor}-fg}{bold}${entry.grade.padEnd(3)}{/bold}{/${gradeColor}-fg}   `;
      content += `{white-fg}${entry.level.toString().padStart(3)}{/white-fg}  `;
      content += `{yellow-fg}${entry.score.toLocaleString().padStart(7)}{/yellow-fg}  `;
      content += `{gray-fg}${timeStr}{/gray-fg}\n`;
    }

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Render tips screen
   */
  private renderTips(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    let content = '{cyan-fg}{bold}═══ TIPS & TRICKS ═══{/bold}{/cyan-fg}\n\n';

    const tips = [
      '{yellow-fg}Finesse:{/yellow-fg} Use optimal movement\n  patterns to reduce key presses',
      '{yellow-fg}IRS/IHS:{/yellow-fg} Rotate or hold during\n  the ARE delay for faster play',
      '{yellow-fg}T-Spins:{/yellow-fg} Rotate T-pieces into\n  tight spaces for bonus points',
      '{yellow-fg}Back-to-Back:{/yellow-fg} Chain Tetrises\n  and T-Spins for 50% bonus',
      '{yellow-fg}20G:{/yellow-fg} At level 500+, pieces\n  drop instantly - stay calm!',
      '{yellow-fg}Credit Roll:{/yellow-fg} Reach M grade to\n  unlock invisible challenge',
    ];

    for (const tip of tips) {
      content += `{white-fg}•{/white-fg} ${tip}\n\n`;
    }

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Render credits screen
   */
  private renderCredits(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    let content = '{magenta-fg}{bold}═══ CREDITS ═══{/bold}{/magenta-fg}\n\n';

    content += '{yellow-fg}Original Game:{/yellow-fg}\n';
    content += '{cyan-fg}Tetris: The Grand Master 3{/cyan-fg}\n';
    content += '{gray-fg}© Arika Co., Ltd.{/gray-fg}\n\n';

    content += '{yellow-fg}This Implementation:{/yellow-fg}\n';
    content += '{cyan-fg}GRANDMASTER for AmiExpress BBS{/cyan-fg}\n';
    content += '{gray-fg}2024{/gray-fg}\n\n';

    content += '{yellow-fg}Built With:{/yellow-fg}\n';
    content += '{white-fg}AmiExpress BBS Door SDK v2.0{/white-fg}\n';
    content += '{white-fg}Neo-Blessed UI Engine{/white-fg}\n';
    content += '{white-fg}TypeScript{/white-fg}\n\n';

    content += '{yellow-fg}Special Thanks:{/yellow-fg}\n';
    content += '{gray-fg}TGM Community{/gray-fg}\n';
    content += '{gray-fg}Hard Drop Wiki{/gray-fg}\n';
    content += '{gray-fg}Retro BBS Enthusiasts{/gray-fg}\n\n';

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Get piece color
   */
  private getPieceColor(type: string): string {
    const colors: Record<string, string> = {
      I: 'cyan',
      O: 'yellow',
      T: 'magenta',
      S: 'green',
      Z: 'red',
      J: 'blue',
      L: 'white',
    };
    return colors[type] || 'white';
  }

  /**
   * Get piece shape
   */
  private getPieceShape(type: string, rotation: number): number[][] {
    const { PieceManager } = require('../core/pieces');
    const pieceManager = new PieceManager();
    return pieceManager.getShape(type as any, rotation);
  }

  /**
   * Format time in MM:SS:MS format
   */
  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    this.exitHandler = () => {
      this.exit();
    };

    // Any key exits attract mode
    this.screen.on('keypress', this.exitHandler);
  }

  /**
   * Exit attract mode
   */
  private exit(): void {
    this.running = false;
    this.demoRunning = false;

    if (this.exitCallback) {
      this.exitCallback();
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.demoRunning = false;
    // Only remove our specific handler, not all keypress listeners
    if (this.exitHandler) {
      this.screen.removeListener('keypress', this.exitHandler);
      this.exitHandler = null;
    }
  }
}
