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
  // 6 scaled columns + 2 borders, and 8 scaled rows + name + 2 borders.
  // Five of these tile a 28x24 panel: three across (3 * 9 = 27 <= 26 inner
  // plus the last board's own width) and two down.
  private boardWidth: number = 8;
  private boardHeight: number = 11;

  constructor(options: OpponentBoardsOptions) {
    this.maxOpponents = options.maxOpponents || 5;

    // Calculate container size
    const width = options.width || (this.boardWidth * 3 + 4);  // 3 boards per row
    const height = options.height || (this.boardHeight * 2 + 2); // 2 rows

    this.container = createBox({
      parent: options.parent,
      top: options.top,
      left: options.left,
      width,
      height,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Opponents ',
      content: '',
      fixed: true,  // Fixed during gameplay, not dockable
      focusable: false,
      mouse: false,
      clickable: false,
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
    // Tile inside the panel's border: 3 across, 2 down, no gap at the bottom.
    // The old +1 offsets pushed the second row to top 13, so with a 24-row
    // panel the bottom board hung off the end.
    const col = index % 3;
    const row = Math.floor(index / 3);
    const left = col * (this.boardWidth + 1);
    const top = row * this.boardHeight;

    const container = createBox({
      parent: this.container,
      top,
      left,
      width: this.boardWidth,
      height: this.boardHeight,
      border: { type: 'line' },
      style: { border: { fg: 'white' } },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const nameLabel = createBox({
      parent: container,
      top: 0,
      left: 0,
      width: this.boardWidth - 2,
      height: 1,
      content: '',
      // createBox() draws a border BY DEFAULT. Without this the name strip
      // and the field below drew their own frames inside the mini board's
      // frame - the stack of nested rectangles seen live on 2026-08-25.
      border: { type: 'none' },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const boardBox = createBox({
      parent: container,
      top: 1,
      left: 0,
      width: this.boardWidth - 2,
      height: this.boardHeight - 3,
      content: '',
      border: { type: 'none' },
      focusable: false,
      mouse: false,
      clickable: false,
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
      return '\n\n{red-fg} DEAD{/red-fg}';
    }

    // Area scaler: every mini cell covers a rectangle of the real field and
    // lights up if ANY cell in it is filled, so a one-cell tower still shows.
    //
    // The old version wrote board.width (12) characters into a SIX column
    // box, and sampled rows 4 + n*3 - reading past the end of a 22-row field
    // and never showing the bottom of the stack, which is the part that
    // matters. Both dimensions now derive from the box.
    const miniRows = this.boardHeight - 3;
    const miniCols = this.boardWidth - 2;
    const lines: string[] = [];

    for (let my = 0; my < miniRows; my++) {
      const y0 = Math.floor((my * board.height) / miniRows);
      const y1 = Math.max(y0 + 1, Math.floor(((my + 1) * board.height) / miniRows));
      let line = '';

      for (let mx = 0; mx < miniCols; mx++) {
        const x0 = Math.floor((mx * board.width) / miniCols);
        const x1 = Math.max(x0 + 1, Math.floor(((mx + 1) * board.width) / miniCols));

        let hit: any = null;
        for (let y = y0; y < y1 && !hit; y++) {
          for (let x = x0; x < x1; x++) {
            const cell = board.grid[y]?.[x];
            if (cell?.filled) { hit = cell; break; }
          }
        }

        if (hit) {
          const color = this.getCellColor(hit);
          line += `{${color}-fg}#{/${color}-fg}`;
        } else {
          line += ' ';
        }
      }

      lines.push(line);
    }

    return lines.join('\n');
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
