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
  /** Panel label. Defaults to the in-game one. */
  label?: string;
  /** Tile size. Defaults suit the in-game side panel. */
  boardWidth?: number;
  boardHeight?: number;
  /** Tiles per row. Defaults to three, as the side panel uses. */
  perRow?: number;
}

/**
 * Individual mini-board widget
 */
interface MiniBoardWidget {
  /** How many field columns and rows this widget's box shows. */
  cols: number;
  rows: number;
  container: any;
  boardBox: any;
  nameLabel: any;
}

/** A TetriNET field is 12 columns by 22 rows. */
const FULL_FIELD_COLS = 12;
const FULL_FIELD_ROWS = 22;

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
  private perRow: number = 3;

  /** True while a single opponent is being shown at full size. */
  private solo = false;

  constructor(options: OpponentBoardsOptions) {
    this.maxOpponents = options.maxOpponents || 5;
    // The spectator view has the whole screen and lays six fields out in a
    // single row; the in-game panel is a narrow column and keeps its 3x2.
    if (options.boardWidth) this.boardWidth = options.boardWidth;
    if (options.boardHeight) this.boardHeight = options.boardHeight;
    if (options.perRow) this.perRow = options.perRow;

    // Calculate container size
    const width = options.width || (this.boardWidth * this.perRow + 4);
    const height = options.height || (this.boardHeight * 2 + 2); // 2 rows

    this.container = createBox({
      parent: options.parent,
      top: options.top,
      left: options.left,
      width,
      height,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: options.label ?? ' Opponents ',
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
    // One opponent gets the whole panel at 1:1; minimaps only from two.
    //
    // Reported 2026-08-30: "in TetriNet mode the opponent's board is drawn
    // as a minimap even when there is only ONE bot", where there is room to
    // draw it properly and the minimap costs readability for nothing. The
    // panel's 26x22 interior fits a 12x22 field exactly, so nothing has to
    // be scaled away - the area scaler below degenerates to 1:1 when its
    // box matches the field.
    const solo = opponents.length === 1;
    if (solo !== this.solo) {
      this.solo = solo;
      for (const [, widget] of this.miniBoards) widget.container.destroy();
      this.miniBoards.clear();
    }

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
    if (this.solo) return this.createFullBoard();

    // Calculate position (3 columns, 2 rows layout)
    // Tile inside the panel's border: 3 across, 2 down, no gap at the bottom.
    // The old +1 offsets pushed the second row to top 13, so with a 24-row
    // panel the bottom board hung off the end.
    const col = index % this.perRow;
    const row = Math.floor(index / this.perRow);
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

    return {
      container,
      boardBox,
      nameLabel,
      cols: this.boardWidth - 2,
      rows: this.boardHeight - 3,
    };
  }

  /**
   * The lone opponent, drawn at full size across the whole panel.
   *
   * No inner border and no name strip: the panel's own frame is the only
   * frame, and the name goes in its label. That is what buys the 22 rows a
   * full field needs - an inner border plus a name row leaves only 19, which
   * is why the tiled layout has to scale at all.
   */
  private createFullBoard(): MiniBoardWidget {
    const inner = this.innerSize();
    const cols = FULL_FIELD_COLS;
    const rows = Math.min(FULL_FIELD_ROWS, inner.height);

    const container = createBox({
      parent: this.container,
      top: 0,
      left: 0,
      width: inner.width,
      height: inner.height,
      // createBox() draws a border by default; the panel already has one.
      border: { type: 'none' },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const boardBox = createBox({
      parent: container,
      top: 0,
      left: Math.max(0, Math.floor((inner.width - cols) / 2)),
      width: cols,
      height: rows,
      content: '',
      border: { type: 'none' },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // A zero-height strip: the name lives in the panel label instead, but the
    // widget shape stays the same so renderMiniBoard needs no special case.
    const nameLabel = createBox({
      parent: container,
      top: 0,
      left: 0,
      width: inner.width,
      height: 1,
      content: '',
      border: { type: 'none' },
      hidden: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    return { container, boardBox, nameLabel, cols, rows };
  }

  /** Usable space inside the panel's border. */
  private innerSize(): { width: number; height: number } {
    const width = (this.container.width ?? this.boardWidth * this.perRow + 4) - 2;
    const height = (this.container.height ?? this.boardHeight * 2 + 2) - 2;
    return { width, height };
  }

  /**
   * Render a mini-board with scaled content
   */
  private renderMiniBoard(widget: MiniBoardWidget, opponent: OpponentBoardData): void {
    // Update name label with status
    let nameContent = opponent.name.substring(0, 10);
    let frame = 'white';
    if (!opponent.alive) {
      nameContent = `{red-fg}[X] ${nameContent}{/red-fg}`;
      frame = 'red';
    } else if (opponent.hasImmunity) {
      nameContent = `{cyan-fg}[I] ${nameContent}{/cyan-fg}`;
      frame = 'cyan';
    }  else {
      nameContent = `{white-fg}${nameContent}{/white-fg}`;
    }
    nameContent += ` {gray-fg}L${opponent.level}{/gray-fg}`;

    if (this.solo) {
      // The full-size board has no frame of its own - the panel's is the
      // only one - so the name goes in the panel's label and the status
      // colour on the panel's border.
      const status = !opponent.alive ? ' [X]' : opponent.hasImmunity ? ' [I]' : '';
      this.container.setLabel?.(` ${opponent.name.substring(0, 12)}${status} L${opponent.level} `);
      if (this.container.style?.border) this.container.style.border.fg = frame;
    } else {
      if (widget.container.style?.border) widget.container.style.border.fg = frame;
      widget.nameLabel.setContent(nameContent);
    }

    // Render scaled board
    const boardContent = this.renderScaledBoard(opponent.board, opponent.alive, widget);
    widget.boardBox.setContent(boardContent);
  }

  /**
   * Render board scaled to mini size
   * Full board is 12x22, mini is 12x8 (every 3 rows -> 1 row)
   */
  private renderScaledBoard(board: TetriNetBoard, alive: boolean, widget?: MiniBoardWidget): string {
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
    // From the widget when there is one, so a full-size board renders 1:1 -
    // the area scaler below degenerates to a copy when the box matches the
    // field. Falls back to the tiled figures for direct callers (tests).
    const miniRows = widget ? widget.rows : this.boardHeight - 3;
    const miniCols = widget ? widget.cols : this.boardWidth - 2;
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
