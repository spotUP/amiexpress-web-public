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
  /** Characters per cell at full size. One on a square-celled screen, two on a terminal. */
  cellWidth?: number;
  /**
   * Draw the panel's own frame?
   *
   * It costs two columns and two rows, and a lone full-size board brings its
   * own frame - so on a narrow screen the outer one is the difference between
   * a full field and a minimap. Fourteen columns hold a twelve-block field
   * with its frame; the panel's frame leaves twelve, one short, and the widget
   * quietly fell back to a scaled board: "tetrinet shows a minimap, it doesnt
   * need to do that if there is only one opponent" (2026-09-06).
   */
  frame?: boolean;
  /**
   * How many fields may be drawn at FULL size, side by side.
   *
   * The in-game side panel leaves this at 1: it is 26 columns wide, so one
   * full field is all that fits, and a lone bot gets it. The SPECTATOR passes
   * 3, because it has the whole 80-column screen and a viewer watching two or
   * three games wants to see them the size they are played at.
   *
   * Scoped rather than global on purpose - raising it for the spectator
   * silently changed the in-game panel too, and the routing tests caught it.
   */
  maxFullBoards?: number;
}

/**
 * Individual mini-board widget
 */
interface MiniBoardWidget {
  /** How many field columns and rows this widget's box shows. */
  cols: number;
  rows: number;
  /** Characters per cell: 1 for a scaled minimap, CELL_WIDTH for full size. */
  cellWidth: number;
  container: any;
  boardBox: any;
  nameLabel: any;
}

/**
 * A field drawn at FULL size, as the player's own board is drawn.
 *
 * The played board is a 22x22 box with a border - 20x20 inside - and its
 * cells are two characters wide, so a full field is the board's own column
 * count at CELL_WIDTH each. TGM fields are 10 wide, TetriNET's are 12, so
 * the width is taken from the board rather than assumed.
 */
const CELL_WIDTH = 2;


/** How many full-size fields fit side by side in the panel. */
function fullBoardsThatFit(innerWidth: number, boardCols: number, cellWidth = CELL_WIDTH): number {
  const each = boardCols * cellWidth + 2;   // + its own frame
  return Math.max(0, Math.floor(innerWidth / each));
}

/**
 * Opponent Boards component
 */
export class OpponentBoards {
  private container: any;
  private miniBoards: Map<string, MiniBoardWidget> = new Map();
  private maxOpponents: number;
  /**
   * Characters per cell at full size, which is the SCREEN's answer.
   *
   * Two read square on a terminal and are a 2:1 smear on a C64, exactly as on
   * the played board. At one character a full opponent field is fourteen
   * columns with its frame, so two fit side by side in forty: "sure we can
   * fit two full size playfields?" (2026-09-06).
   */
  private cellWidth: number = CELL_WIDTH;
  /** Does this panel draw its own frame? */
  private framed = true;
  // 6 scaled columns + 2 borders, and 8 scaled rows + name + 2 borders.
  // Five of these tile a 28x24 panel: three across (3 * 9 = 27 <= 26 inner
  // plus the last board's own width) and two down.
  private boardWidth: number = 8;
  private boardHeight: number = 11;
  private perRow: number = 3;

  /** True while a single opponent is being shown at full size. */
  private solo = false;

  /**
   * Which opponent the viewer has focused.
   *
   * Only matters once there are more fields than fit at full size: the
   * focused one is drawn full and the rest as minimaps. Tab moves it.
   */
  private focusIndex = 0;

  /** How many boards were drawn full last time, for the layout to stay put. */
  private fullCount = 0;

  /** The ceiling on full-size boards for this panel. */
  private maxFullBoards = 1;

  constructor(options: OpponentBoardsOptions) {
    this.maxOpponents = options.maxOpponents || 5;
    this.cellWidth = options.cellWidth ?? CELL_WIDTH;
    this.framed = options.frame !== false;
    // The spectator view has the whole screen and lays six fields out in a
    // single row; the in-game panel is a narrow column and keeps its 3x2.
    if (options.boardWidth) this.boardWidth = options.boardWidth;
    if (options.boardHeight) this.boardHeight = options.boardHeight;
    if (options.perRow) this.perRow = options.perRow;
    if (options.maxFullBoards !== undefined) this.maxFullBoards = options.maxFullBoards;

    // Calculate container size
    const width = options.width || (this.boardWidth * this.perRow + 4);
    const height = options.height || (this.boardHeight * 2 + 2); // 2 rows

    this.container = createBox({
      parent: options.parent,
      top: options.top,
      left: options.left,
      width,
      height,
      border: options.frame === false ? undefined : { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: options.frame === false ? undefined : (options.label ?? ' Opponents '),
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
  /** Move the viewer's focus on by one, wrapping. */
  cycleFocus(total: number): number {
    if (total <= 0) return 0;
    this.focusIndex = (this.focusIndex + 1) % total;
    // The layout is rebuilt on the next update, because which board is drawn
    // full has changed.
    for (const [, widget] of this.miniBoards) widget.container.destroy();
    this.miniBoards.clear();
    return this.focusIndex;
  }

  /** Who the viewer is focused on. */
  getFocus(): number {
    return this.focusIndex;
  }

  /** True when every field is being shown at full size. */
  isShowingAllFull(): boolean {
    return this.fullCount > 0 && this.fullCount === this.miniBoards.size;
  }

  updateBoards(opponents: OpponentBoardData[]): void {
    // One opponent gets the whole panel at 1:1; minimaps only from two.
    //
    // Reported 2026-08-30: "in TetriNet mode the opponent's board is drawn
    // as a minimap even when there is only ONE bot", where there is room to
    // draw it properly and the minimap costs readability for nothing. The
    // panel's 26x22 interior fits a 12x22 field exactly, so nothing has to
    // be scaled away - the area scaler below degenerates to 1:1 when its
    // box matches the field.
    // How many of these can be shown at FULL size, side by side.
    //
    // A full field is the board's own columns at two characters each plus its
    // frame; three of them come to 66 of the panel's 78, so up to three fit.
    // Beyond that the focused one is drawn full and the rest as minimaps.
    const cols = opponents[0]?.board?.width ?? 10;
    const fits = Math.min(
      fullBoardsThatFit(this.innerSize().width, cols, this.cellWidth),
      this.maxFullBoards
    );
    // All of them, or none - except a panel that allows several full boards,
    // which falls back to showing the FOCUSED one full with the rest as
    // minimaps. The in-game side panel has room for one, so it goes straight
    // from a lone bot at full size to all-minimaps the moment a second
    // arrives; promoting one of two there would just make the other look
    // broken.
    const full =
      opponents.length <= fits ? opponents.length :
      this.maxFullBoards > 1 && fits > 0 ? 1 :
      0;

    if (this.focusIndex >= Math.max(1, opponents.length)) this.focusIndex = 0;

    // The focused player is drawn FIRST, so when only some fit at full size
    // the focused one is the one that gets it. Tab moves the focus.
    if (this.focusIndex > 0 && this.focusIndex < opponents.length) {
      opponents = [
        opponents[this.focusIndex],
        ...opponents.filter((_, i) => i !== this.focusIndex),
      ];
    }

    const solo = full > 0;
    if (solo !== this.solo || full !== this.fullCount) {
      this.solo = solo;
      this.fullCount = full;
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
      widget = this.createMiniBoard(opponent.id, index, opponent.board?.width ?? 10);
      this.miniBoards.set(opponent.id, widget);
    }

    // Update content
    this.renderMiniBoard(widget, opponent);
  }

  /**
   * Create a mini-board widget
   */
  private createMiniBoard(id: string, index: number, boardCols = 10): MiniBoardWidget {
    if (index < this.fullCount) return this.createFullBoard(index, boardCols);

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
      cellWidth: 1,
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
  private createFullBoard(index: number, boardCols: number): MiniBoardWidget {
    const inner = this.innerSize();
    const cols = boardCols;
    const rows = inner.height;
    const boxWidth = cols * this.cellWidth + 2;

    // Side by side, in the order the fields arrive, so a board does not jump
    // about as other players top out.
    const container = createBox({
      parent: this.container,
      top: 0,
      left: index * boxWidth,
      width: boxWidth,
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
      left: 0,
      width: cols * this.cellWidth,
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

    return { container, boardBox, nameLabel, cols, rows, cellWidth: this.cellWidth };
  }

  /** Usable space inside the panel's border. */
  private innerSize(): { width: number; height: number } {
    // A frameless panel's inside IS its size; a framed one loses two of each.
    const chrome = this.framed ? 2 : 0;
    const width = (this.container.width ?? this.boardWidth * this.perRow + 4) - chrome;
    const height = (this.container.height ?? this.boardHeight * 2 + 2) - chrome;
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

        const pad = widget ? widget.cellWidth : 1;
        if (hit) {
          const color = this.getCellColor(hit);
          // At full size the cell is a solid block, as the played board draws
          // it; a minimap keeps one character so six fields still fit.
          line += `{${color}-bg}{${color}-fg}${'#'.repeat(pad)}{/}`;
        } else {
          line += ' '.repeat(pad);
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
