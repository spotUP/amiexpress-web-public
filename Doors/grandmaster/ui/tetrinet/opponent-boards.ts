/**
 * TetriNET Opponent Boards Display
 *
 * Shows mini-boards for up to 5 opponents in a grid layout.
 * Each mini-board shows:
 * - Scaled representation of their field (6x10 blocks)
 * - Player name and level
 * - Dead/alive status with visual indicator
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { createDockable } from '../dockable';
import type { TetriNetBoard } from '../../core/tetrinet/tetrinet-board';

/**
 * Opponent board data
 */
export interface OpponentBoardData {
  id: string;
  name: string;
  board: TetriNetBoard;
  level: number;
  alive: boolean;
  hasImmunity: boolean;
}

/**
 * Opponent Boards options
 */
export interface OpponentBoardsOptions {
  parent: Screen;
  top: number | string;
  left: number | string;
  width?: number;
  height?: number;
  maxOpponents?: number;
}

/**
 * Individual mini-board widget
 */
interface MiniBoardWidget {
  container: any;
  boardBox: any;
  nameLabel: any;
}

/**
 * Opponent Boards component
 */
export class OpponentBoards {
  private container: any;
  private miniBoards: Map<string, MiniBoardWidget> = new Map();
  private maxOpponents: number;
  private boardWidth: number = 14;  // 12 cols * 1 char + 2 borders
  private boardHeight: number = 12; // 10 visible rows + name + status

  constructor(options: OpponentBoardsOptions) {
    this.maxOpponents = options.maxOpponents || 5;

    // Calculate container size
    const width = options.width || (this.boardWidth * 3 + 4);  // 3 boards per row
    const height = options.height || (this.boardHeight * 2 + 2); // 2 rows

    this.container = createDockable({
      parent: options.parent,
      top: options.top,
      left: options.left,
      width,
      height,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Opponents ',
      content: '',
      persistenceKey: 'grandmaster.tnet.opponents',
    });
  }

  /**
   * Update all opponent boards
   */
  updateBoards(opponents: OpponentBoardData[]): void {
    // Remove boards for players who left
    const currentIds = new Set(opponents.map(o => o.id));
    for (const [id, widget] of this.miniBoards) {
      if (!currentIds.has(id)) {
        widget.container.destroy();
        this.miniBoards.delete(id);
      }
    }

    // Add/update boards for current players
    for (let i = 0; i < Math.min(opponents.length, this.maxOpponents); i++) {
      const opponent = opponents[i];
      this.updateSingleBoard(opponent, i);
    }
  }

  /**
   * Update a single opponent's board
   */
  updateSingleBoard(opponent: OpponentBoardData, index: number): void {
    let widget = this.miniBoards.get(opponent.id);

    // Create widget if doesn't exist
    if (!widget) {
      widget = this.createMiniBoard(opponent.id, index);
      this.miniBoards.set(opponent.id, widget);
    }

    // Update content
    this.renderMiniBoard(widget, opponent);
  }

  /**
   * Create a mini-board widget
   */
  private createMiniBoard(id: string, index: number): MiniBoardWidget {
    // Calculate position (3 columns, 2 rows layout)
    const col = index % 3;
    const row = Math.floor(index / 3);
    const left = 1 + col * (this.boardWidth + 1);
    const top = 1 + row * this.boardHeight;

    const container = createBox({
      parent: this.container,
      top,
      left,
      width: this.boardWidth,
      height: this.boardHeight,
      border: { type: 'line' },
      style: { border: { fg: 'white' } },
    });

    const nameLabel = createBox({
      parent: container,
      top: 0,
      left: 0,
      width: this.boardWidth - 2,
      height: 1,
      content: '',
    });

    const boardBox = createBox({
      parent: container,
      top: 1,
      left: 0,
      width: this.boardWidth - 2,
      height: this.boardHeight - 3,
      content: '',
    });

    return { container, boardBox, nameLabel };
  }

  /**
   * Render a mini-board with scaled content
   */
  private renderMiniBoard(widget: MiniBoardWidget, opponent: OpponentBoardData): void {
    // Update name label with status
    let nameContent = opponent.name.substring(0, 10);
    if (!opponent.alive) {
      nameContent = `{red-fg}[X] ${nameContent}{/red-fg}`;
      widget.container.style.border.fg = 'red';
    } else if (opponent.hasImmunity) {
      nameContent = `{cyan-fg}[I] ${nameContent}{/cyan-fg}`;
      widget.container.style.border.fg = 'cyan';
    } else {
      nameContent = `{white-fg}${nameContent}{/white-fg}`;
      widget.container.style.border.fg = 'white';
    }
    nameContent += ` {gray-fg}L${opponent.level}{/gray-fg}`;
    widget.nameLabel.setContent(nameContent);

    // Render scaled board
    const boardContent = this.renderScaledBoard(opponent.board, opponent.alive);
    widget.boardBox.setContent(boardContent);
  }

  /**
   * Render board scaled to mini size
   * Full board is 12x22, mini is 12x8 (every 3 rows -> 1 row)
   */
  private renderScaledBoard(board: TetriNetBoard, alive: boolean): string {
    if (!alive) {
      // Show dead indicator
      return '\n\n{red-fg}  DEAD{/red-fg}';
    }

    let content = '';
    const scaleY = 3;  // Every 3 rows becomes 1
    const visibleRows = 8;

    for (let miniY = 0; miniY < visibleRows; miniY++) {
      if (miniY > 0) content += '\n';

      for (let x = 0; x < board.width; x++) {
        // Sample from the middle of each 3-row chunk
        const actualY = 4 + (miniY * scaleY) + 1;  // Start from row 4, sample middle

        const cell = board.grid[actualY]?.[x];
        if (cell?.filled) {
          // Show filled cells with color
          const color = this.getCellColor(cell);
          content += `{${color}-fg}#{/${color}-fg}`;
        } else {
          content += ' ';
        }
      }
    }

    return content;
  }

  /**
   * Get color for cell based on special or piece color
   */
  private getCellColor(cell: any): string {
    if (cell.special) {
      // Special block colors
      return 'yellow';
    }

    // Regular piece colors
    const colors: Record<string, string> = {
      I: 'cyan',
      O: 'yellow',
      T: 'magenta',
      S: 'green',
      Z: 'red',
      J: 'blue',
      L: 'white',
    };
    return colors[cell.color] || 'gray';
  }

  /**
   * Show attack animation on opponent
   */
  showAttackAnimation(targetId: string, type: 'attack' | 'immunity'): void {
    const widget = this.miniBoards.get(targetId);
    if (!widget) return;

    const color = type === 'immunity' ? 'cyan' : 'red';
    const originalColor = widget.container.style.border.fg;

    widget.container.style.border.fg = color;
    setTimeout(() => {
      widget.container.style.border.fg = originalColor;
    }, 300);
  }

  /**
   * Mark opponent as dead
   */
  markDead(id: string): void {
    const widget = this.miniBoards.get(id);
    if (widget) {
      widget.container.style.border.fg = 'red';
      widget.boardBox.setContent('\n\n{red-fg}  DEAD{/red-fg}');
    }
  }

  /**
   * Get container element
   */
  getElement(): any {
    return this.container;
  }

  /**
   * Destroy all widgets
   */
  destroy(): void {
    for (const widget of this.miniBoards.values()) {
      widget.container.destroy();
    }
    this.miniBoards.clear();
    this.container.destroy();
  }
}
