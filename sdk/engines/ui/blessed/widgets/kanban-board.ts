/**
 * KanbanBoard Widget
 *
 * A multi-column board with drag-and-drop support for moving items between columns.
 * Perfect for task management, workflow visualization, and project tracking.
 *
 * Features:
 * - Multiple columns with customizable labels
 * - Drag and drop items between columns (mouse)
 * - Keyboard navigation (arrow keys, Enter to move)
 * - Visual feedback during drag operations
 * - Emits events for item moves
 *
 * Usage:
 * ```typescript
 * const board = new KanbanBoard({
 *   parent: screen,
 *   columns: [
 *     { id: 'todo', label: 'TODO', items: ['Task 1', 'Task 2'] },
 *     { id: 'doing', label: 'IN PROGRESS', items: ['Task 3'] },
 *     { id: 'done', label: 'DONE', items: [] }
 *   ]
 * });
 *
 * board.on('move', (data) => {
 *   console.log(`Moved "${data.item}" from ${data.fromColumn} to ${data.toColumn}`);
 * });
 * ```
 */

import { Box } from './box';
import { List } from './list';
import type { ElementOptions } from '../core/types';

export interface KanbanColumn {
  id: string;
  label: string;
  items: string[];
  data?: any[];  // Optional associated data for each item
}

export interface KanbanBoardOptions extends ElementOptions {
  columns: KanbanColumn[];
  columnStyle?: {
    border?: { fg?: string };
    activeBorder?: { fg?: string };
    bg?: string;
  };
  itemStyle?: {
    fg?: string;
    bg?: string;
    selected?: { fg?: string; bg?: string };
  };
  ghostStyle?: {
    fg?: string;
    bg?: string;
    border?: { fg?: string };
  };
}

export interface KanbanMoveEvent {
  item: string;
  itemIndex: number;
  itemData?: any;
  fromColumn: string;
  fromIndex: number;
  toColumn: string;
  toIndex: number;
}

export class KanbanBoard extends Box {
  private columns: KanbanColumn[];
  private columnBoxes: Box[] = [];
  private columnLists: List[] = [];
  private activeColumn: number = 0;
  private dragging: {
    active: boolean;
    columnIndex: number;
    itemIndex: number;
    item: string;
    itemData?: any;
    ghost?: Box;
  } | null = null;

  private columnStyle: NonNullable<KanbanBoardOptions['columnStyle']>;
  private itemStyle: NonNullable<KanbanBoardOptions['itemStyle']>;
  private ghostStyle: NonNullable<KanbanBoardOptions['ghostStyle']>;

  constructor(options: KanbanBoardOptions) {
    super({
      ...options,
      tags: true,
    });

    this.columns = options.columns;

    this.columnStyle = {
      border: { fg: 'cyan' },
      activeBorder: { fg: 'yellow' },
      bg: 'black',
      ...options.columnStyle
    };

    this.itemStyle = {
      fg: 'white',
      bg: 'black',
      selected: { fg: 'black', bg: 'cyan' },
      ...options.itemStyle
    };

    this.ghostStyle = {
      fg: 'white',
      bg: 'blue',
      border: { fg: 'yellow' },
      ...options.ghostStyle
    };

    this.createColumns();
    this.setupEventHandlers();
    this.updateColumnStyles();
  }

  private createColumns(): void {
    const colCount = this.columns.length;

    for (let i = 0; i < colCount; i++) {
      const column = this.columns[i];

      // Column container box
      const colBox = new Box({
        parent: this,
        top: 0,
        left: `${Math.floor((100 / colCount) * i)}%`,
        width: `${Math.floor(100 / colCount)}%`,
        height: '100%',
        border: { type: 'line' },
        label: ` ${column.label} `,
        style: {
          border: this.columnStyle.border,
          bg: this.columnStyle.bg
        },
        tags: true,
        focusable: false,
      });

      // List inside the column
      const list = new List({
        parent: colBox,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        items: column.items.length > 0 ? column.items : ['{gray-fg}(empty){/gray-fg}'],
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        style: {
          item: { fg: this.itemStyle.fg, bg: this.itemStyle.bg },
          selected: this.itemStyle.selected,
          bg: this.itemStyle.bg
        }
      });

      // Store column index on list for event handling
      (list as any)._kanbanColumnIndex = i;

      this.columnBoxes.push(colBox);
      this.columnLists.push(list);
    }
  }

  private setupEventHandlers(): void {
    // Set up handlers for each column list
    this.columnLists.forEach((list, colIndex) => {
      // Mouse down - start drag
      list.on('mousedown', (data: any) => {
        if (this.columns[colIndex].items.length === 0) return;

        const itemIndex = list.selected || 0;
        if (itemIndex >= this.columns[colIndex].items.length) return;

        this.startDrag(colIndex, itemIndex, data);
      });

      // Click to select column
      list.on('focus', () => {
        this.activeColumn = colIndex;
        this.updateColumnStyles();
      });

      // Double click to emit select event
      list.on('select', (item: any, index: number) => {
        if (this.columns[colIndex].items.length === 0) return;
        if (index >= this.columns[colIndex].items.length) return;

        this.emit('select', {
          column: this.columns[colIndex].id,
          columnIndex: colIndex,
          item: this.columns[colIndex].items[index],
          itemIndex: index,
          itemData: this.columns[colIndex].data?.[index]
        });
      });
    });

    // Global mouse move for drag
    if (this.screen) {
      this.screen.on('mouse', (data: any) => {
        if (!this.dragging?.active) return;

        if (data.action === 'mousemove') {
          this.updateGhostPosition(data.x, data.y);
        } else if (data.action === 'mouseup') {
          this.endDrag(data.x, data.y);
        }
      });
    }

    // Keyboard navigation
    this.on('keypress', (ch: any, key: any) => {
      this.handleKeypress(key);
    });
  }

  private handleKeypress(key: any): void {
    switch (key.name) {
      case 'left':
        this.activeColumn = Math.max(0, this.activeColumn - 1);
        this.columnLists[this.activeColumn].focus();
        this.updateColumnStyles();
        break;

      case 'right':
        this.activeColumn = Math.min(this.columns.length - 1, this.activeColumn + 1);
        this.columnLists[this.activeColumn].focus();
        this.updateColumnStyles();
        break;

      case 'm':
        // Quick move - show column selection
        this.showMoveMenu();
        break;
    }
  }

  private startDrag(colIndex: number, itemIndex: number, mouseData: any): void {
    const column = this.columns[colIndex];
    const item = column.items[itemIndex];

    this.dragging = {
      active: true,
      columnIndex: colIndex,
      itemIndex: itemIndex,
      item: item,
      itemData: column.data?.[itemIndex]
    };

    // Create ghost element
    const ghost = new Box({
      parent: this.screen,
      top: mouseData.y,
      left: mouseData.x,
      width: 20,
      height: 3,
      border: { type: 'line' },
      content: item.length > 16 ? item.substring(0, 14) + '..' : item,
      style: {
        fg: this.ghostStyle.fg,
        bg: this.ghostStyle.bg,
        border: this.ghostStyle.border
      },
      tags: true,
    });

    this.dragging.ghost = ghost;
    this.screen?.render();

    this.emit('dragstart', {
      column: column.id,
      columnIndex: colIndex,
      item: item,
      itemIndex: itemIndex,
      itemData: column.data?.[itemIndex]
    });
  }

  private updateGhostPosition(x: number, y: number): void {
    if (!this.dragging?.ghost) return;

    this.dragging.ghost.top = y - 1;
    this.dragging.ghost.left = x - 10;

    // Highlight target column
    const targetCol = this.getColumnAtPosition(x);
    this.columnBoxes.forEach((box, i) => {
      if (i === targetCol && targetCol !== this.dragging!.columnIndex) {
        box.style.border.fg = 'green';
      } else if (i === this.activeColumn) {
        box.style.border.fg = this.columnStyle.activeBorder?.fg || 'yellow';
      } else {
        box.style.border.fg = this.columnStyle.border?.fg || 'cyan';
      }
    });

    this.screen?.render();
  }

  private endDrag(x: number, y: number): void {
    if (!this.dragging?.active) return;

    const targetCol = this.getColumnAtPosition(x);

    // Remove ghost
    if (this.dragging.ghost) {
      this.screen?.remove(this.dragging.ghost);
    }

    // If dropped on a different column, move the item
    if (targetCol !== -1 && targetCol !== this.dragging.columnIndex) {
      this.moveItem(
        this.dragging.columnIndex,
        this.dragging.itemIndex,
        targetCol
      );
    }

    this.dragging = null;
    this.updateColumnStyles();
    this.screen?.render();
  }

  private getColumnAtPosition(x: number): number {
    const coords = this._getCoords();
    if (!coords) return -1;

    const relX = x - coords.xi;
    const colWidth = (coords.xl - coords.xi) / this.columns.length;

    for (let i = 0; i < this.columns.length; i++) {
      if (relX >= i * colWidth && relX < (i + 1) * colWidth) {
        return i;
      }
    }
    return -1;
  }

  private moveItem(fromCol: number, fromIndex: number, toCol: number, toIndex?: number): void {
    const fromColumn = this.columns[fromCol];
    const toColumn = this.columns[toCol];

    if (fromIndex >= fromColumn.items.length) return;

    const item = fromColumn.items[fromIndex];
    const itemData = fromColumn.data?.[fromIndex];

    // Remove from source
    fromColumn.items.splice(fromIndex, 1);
    if (fromColumn.data) {
      fromColumn.data.splice(fromIndex, 1);
    }

    // Add to destination
    const insertIndex = toIndex ?? toColumn.items.length;
    toColumn.items.splice(insertIndex, 0, item);
    if (toColumn.data) {
      toColumn.data.splice(insertIndex, 0, itemData);
    }

    // Update lists
    this.refreshColumnItems(fromCol);
    this.refreshColumnItems(toCol);

    // Emit move event
    const moveEvent: KanbanMoveEvent = {
      item,
      itemIndex: fromIndex,
      itemData,
      fromColumn: fromColumn.id,
      fromIndex,
      toColumn: toColumn.id,
      toIndex: insertIndex
    };

    this.emit('move', moveEvent);
  }

  private refreshColumnItems(colIndex: number): void {
    const column = this.columns[colIndex];
    const list = this.columnLists[colIndex];

    if (column.items.length === 0) {
      list.setItems(['{gray-fg}(empty){/gray-fg}']);
    } else {
      list.setItems(column.items);
    }
  }

  private updateColumnStyles(): void {
    this.columnBoxes.forEach((box, i) => {
      if (i === this.activeColumn) {
        box.style.border.fg = this.columnStyle.activeBorder?.fg || 'yellow';
      } else {
        box.style.border.fg = this.columnStyle.border?.fg || 'cyan';
      }
    });
  }

  private showMoveMenu(): void {
    const column = this.columns[this.activeColumn];
    if (column.items.length === 0) return;

    const list = this.columnLists[this.activeColumn];
    const selectedIndex = list.selected || 0;
    if (selectedIndex >= column.items.length) return;

    // Emit event for parent to show move menu
    this.emit('moveRequest', {
      column: column.id,
      columnIndex: this.activeColumn,
      item: column.items[selectedIndex],
      itemIndex: selectedIndex,
      itemData: column.data?.[selectedIndex],
      availableColumns: this.columns
        .filter((_, i) => i !== this.activeColumn)
        .map(c => ({ id: c.id, label: c.label }))
    });
  }

  /**
   * Move an item between columns programmatically
   */
  public moveItemById(itemIndex: number, fromColumnId: string, toColumnId: string): boolean {
    const fromCol = this.columns.findIndex(c => c.id === fromColumnId);
    const toCol = this.columns.findIndex(c => c.id === toColumnId);

    if (fromCol === -1 || toCol === -1) return false;
    if (itemIndex >= this.columns[fromCol].items.length) return false;

    this.moveItem(fromCol, itemIndex, toCol);
    return true;
  }

  /**
   * Update items in a column
   */
  public setColumnItems(columnId: string, items: string[], data?: any[]): void {
    const colIndex = this.columns.findIndex(c => c.id === columnId);
    if (colIndex === -1) return;

    this.columns[colIndex].items = items;
    this.columns[colIndex].data = data;
    this.refreshColumnItems(colIndex);
  }

  /**
   * Get the currently active column
   */
  public getActiveColumn(): KanbanColumn {
    return this.columns[this.activeColumn];
  }

  /**
   * Get the selected item in the active column
   */
  public getSelectedItem(): { item: string; index: number; data?: any } | null {
    const column = this.columns[this.activeColumn];
    const list = this.columnLists[this.activeColumn];
    const index = list.selected || 0;

    if (column.items.length === 0 || index >= column.items.length) {
      return null;
    }

    return {
      item: column.items[index],
      index,
      data: column.data?.[index]
    };
  }

  /**
   * Focus the board and its active column
   */
  public focus(): void {
    super.focus();
    this.columnLists[this.activeColumn]?.focus();
  }

  /**
   * Get all columns
   */
  public getColumns(): KanbanColumn[] {
    return this.columns;
  }
}
