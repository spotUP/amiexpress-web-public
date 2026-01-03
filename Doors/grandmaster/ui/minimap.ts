/**
 * Minimap Renderer
 *
 * Compact opponent board visualization using single-character blocks
 * Optimized for Battle Royale mode (up to 99 players)
 */

import type { Board, PieceType } from '../core/types';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * Opponent state for minimap
 */
export interface OpponentState {
  id: string;
  name: string;
  board: Board;
  level: number;
  grade: string;
  alive: boolean;
  targeting?: boolean;  // Is this opponent targeting you?
  rank?: number;        // Current rank (1-99)
}

/**
 * Minimap configuration
 */
export interface MinimapConfig {
  width: number;          // Board width in chars (default: 10)
  height: number;         // Visible rows (default: 10)
  showName: boolean;      // Show player name above board
  showLevel: boolean;     // Show level
  showGrade: boolean;     // Show grade
  compact: boolean;       // Ultra-compact mode (no labels)
}

/**
 * Minimap Renderer
 *
 * Renders opponent boards in compact single-character format
 */
export class MinimapRenderer {
  private config: MinimapConfig;

  constructor(config?: Partial<MinimapConfig>) {
    this.config = {
      width: 10,
      height: 10,
      showName: true,
      showLevel: true,
      showGrade: true,
      compact: false,
      ...config,
    };
  }

  /**
   * Render a single opponent minimap
   */
  renderMinimap(opponent: OpponentState): string {
    const board = opponent.board;
    let output = '';

    // Header (name, level, grade)
    if (!this.config.compact) {
      if (this.config.showName) {
        const nameColor = opponent.targeting ? 'red' : opponent.alive ? 'white' : 'gray';
        const name = opponent.name.substring(0, this.config.width);
        output += `{${nameColor}-fg}${name.padEnd(this.config.width)}{/${nameColor}-fg}\n`;
      }

      if (this.config.showLevel || this.config.showGrade) {
        let info = '';
        if (this.config.showLevel) info += `L${opponent.level}`;
        if (this.config.showGrade) info += ` ${opponent.grade}`;
        output += `{gray-fg}${info.substring(0, this.config.width).padEnd(this.config.width)}{/gray-fg}\n`;
      }
    }

    // Board - render top N rows (reversed, so top of board is at top)
    const startY = Math.max(0, board.height - this.config.height);
    for (let y = startY; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        if (cell.filled) {
          const color = this.getPieceColor(cell.color as PieceType);
          output += `{${color}-fg}█{/${color}-fg}`;
        } else {
          output += ' ';
        }
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Render multiple opponent minimaps in a grid layout
   */
  renderMinimapGrid(
    screen: Screen,
    opponents: OpponentState[],
    maxVisible: number = 6
  ): void {
    // Clear existing minimaps
    screen.children
      .filter(c => (c as any).minimapId)
      .forEach(c => c.destroy());

    // Sort opponents: targeting you first, then by rank
    const sorted = [...opponents]
      .filter(o => o.alive)
      .sort((a, b) => {
        if (a.targeting && !b.targeting) return -1;
        if (!a.targeting && b.targeting) return 1;
        return (a.rank || 99) - (b.rank || 99);
      })
      .slice(0, maxVisible);

    // Calculate layout (2x3 grid)
    const cols = 3;
    const rows = Math.ceil(sorted.length / cols);
    const minimapWidth = 12;  // 10 chars + border
    const minimapHeight = this.config.compact ? 12 : 15;

    // Render each minimap
    sorted.forEach((opponent, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const minimapBox = createBox({
        parent: screen,
        top: row * minimapHeight,
        left: 58 + (col * minimapWidth),  // Start after main board (56 chars)
        width: minimapWidth,
        height: minimapHeight,
        border: {
          type: 'line',
        },
        style: {
          border: {
            fg: opponent.targeting ? 'red' : opponent.rank === 1 ? 'yellow' : 'gray',
          },
        },
        content: this.renderMinimap(opponent),
      });

      // Mark as minimap for cleanup
      (minimapBox as any).minimapId = opponent.id;
    });

    screen.render();
  }

  /**
   * Render Battle Royale HUD with rank and alive count
   */
  renderBattleRoyaleHUD(
    screen: Screen,
    rank: number,
    aliveCount: number,
    totalPlayers: number
  ): void {
    const hudBox = createBox({
      parent: screen,
      top: 0,
      right: 0,
      width: 20,
      height: 5,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
      },
      content:
        `{bold}BATTLE ROYALE{/bold}\n\n` +
        `  Rank:  {yellow-fg}#${rank}{/yellow-fg}\n` +
        `  Alive: {green-fg}${aliveCount}{/green-fg}/{gray-fg}${totalPlayers}{/gray-fg}`,
    });

    (hudBox as any).isBattleRoyaleHUD = true;
  }

  /**
   * Get ANSI color for piece type (single character display)
   */
  private getPieceColor(type: PieceType): string {
    const colors: Record<PieceType, string> = {
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
   * Update minimap configuration
   */
  setConfig(config: Partial<MinimapConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Opponent Tracker
 *
 * Manages opponent states for minimap display
 */
export class OpponentTracker {
  private opponents: Map<string, OpponentState> = new Map();

  /**
   * Add or update opponent
   */
  updateOpponent(id: string, state: Partial<OpponentState>): void {
    const existing = this.opponents.get(id);
    if (existing) {
      this.opponents.set(id, { ...existing, ...state });
    } else {
      this.opponents.set(id, {
        id,
        name: state.name || 'Unknown',
        board: state.board!,
        level: state.level || 1,
        grade: state.grade || '9',
        alive: state.alive !== false,
        targeting: state.targeting || false,
        rank: state.rank,
      });
    }
  }

  /**
   * Remove opponent
   */
  removeOpponent(id: string): void {
    this.opponents.delete(id);
  }

  /**
   * Get all opponents
   */
  getOpponents(): OpponentState[] {
    return Array.from(this.opponents.values());
  }

  /**
   * Get alive opponents
   */
  getAliveOpponents(): OpponentState[] {
    return this.getOpponents().filter(o => o.alive);
  }

  /**
   * Get opponents targeting you
   */
  getTargetingOpponents(): OpponentState[] {
    return this.getOpponents().filter(o => o.targeting && o.alive);
  }

  /**
   * Clear all opponents
   */
  clear(): void {
    this.opponents.clear();
  }

  /**
   * Get opponent count
   */
  count(): number {
    return this.opponents.size;
  }

  /**
   * Get alive count
   */
  aliveCount(): number {
    return this.getAliveOpponents().length;
  }
}
