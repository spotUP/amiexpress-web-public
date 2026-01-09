/**
 * ListTable - Enhanced table with list-like selection behavior
 *
 * Responsive features:
 * - Column priority hiding on mobile (hides low-priority columns)
 * - Horizontal swipe scrolling on mobile
 * - Touch-friendly row heights
 */

import { Box } from './box';
import type { ElementOptions, KeyEvent } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface ListTableOptions extends Omit<ElementOptions, 'align'> {
  rows?: string[][];
  headers?: string[];
  columnWidths?: number[];
  align?: ('left' | 'center' | 'right')[];
  interactive?: boolean;
  noCellBorders?: boolean;
  /** Column visibility priority (higher = more important, shown first on mobile) */
  columnPriority?: number[];
  /** Max columns to show on mobile (default: 2) */
  mobileMaxColumns?: number;
}

export class ListTable extends Box {
  private rows: string[][] = [];
  private headers: string[] = [];
  private columnWidths: number[] = [];
  private align: ('left' | 'center' | 'right')[] = [];
  private selectedRow: number = 0;
  private interactive: boolean;
  private noCellBorders: boolean;

  // Responsive tracking
  private _isMobileMode: boolean = false;
  private _columnPriority: number[];
  private _mobileMaxColumns: number;
  private _visibleColumns: number[] = [];  // Indices of visible columns

  constructor(options: ListTableOptions = {}) {
    // Destructure ListTable-specific properties
    const { rows, headers, columnWidths, align, interactive, noCellBorders, ...boxOptions } = options;

    super({
      ...boxOptions,
      scrollable: true,
      mouse: true,
      tags: true,  // Enable tag parsing for selection highlighting
      wrap: false, // Tables should NOT wrap - it breaks column layout
      style: {
        fg: 'white',
        ...(options.style || {}),
      },
    });

    this.headers = headers || [];
    this.rows = rows || [];
    this.columnWidths = columnWidths || [];
    this.align = align || [];
    this.interactive = interactive !== false;
    this.noCellBorders = noCellBorders || false;

    // Responsive options
    this._columnPriority = options.columnPriority || [];
    this._mobileMaxColumns = options.mobileMaxColumns ?? 2;

    // Auto-calculate column widths if not provided
    if (this.columnWidths.length === 0) {
      this.calculateColumnWidths();
    }

    // Initialize visible columns (all by default)
    this._initVisibleColumns();

    this.updateContent();

    if (this.interactive) {
      this.enableMouse();
      this.enableKeys();
      this.options.focusable = true; // Enable focus

      // Focus/blur handlers
      this.on('focus', () => {
        this.screen?.render();
      });
      this.on('blur', () => {
        this.screen?.render();
      });

      // Navigation keys
      this.on('keypress', this._onKeypress.bind(this));

      this.on('click', (data: any) => {
        const rowIndex = this.getRowFromY(data.y);
        if (rowIndex >= 0) {
          this.selectRow(rowIndex);
        }
      });

      // Mouse wheel handlers - move selection up/down
      this.on('wheelup', () => {
        this.selectPrevious();
      });

      this.on('wheeldown', () => {
        this.selectNext();
      });
    }
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.interactive || !this.focused) return false;

    if (key.name === 'up' || key.name === 'k') {
      this.selectPrevious();
      this.screen?.render();
      return true;
    }

    if (key.name === 'down' || key.name === 'j') {
      this.selectNext();
      this.screen?.render();
      return true;
    }

    if (key.name === 'enter' || key.name === 'space') {
      this.emit('select', this.rows[this.selectedRow], this.selectedRow);
      return true;
    }

    return false;
  }

  /**
   * Calculate column widths automatically
   */
  private calculateColumnWidths(): void {
    const numCols = Math.max(
      this.headers.length,
      ...this.rows.map(row => row.length)
    );

    this.columnWidths = new Array(numCols).fill(0);

    // Check headers
    for (let i = 0; i < this.headers.length; i++) {
      this.columnWidths[i] = Math.max(this.columnWidths[i], this.headers[i].length);
    }

    // Check all rows
    for (const row of this.rows) {
      for (let i = 0; i < row.length; i++) {
        this.columnWidths[i] = Math.max(this.columnWidths[i], row[i].length);
      }
    }

    // Add padding
    this.columnWidths = this.columnWidths.map(w => w + 2);
  }

  /**
   * Format a cell value
   */
  private formatCell(value: string, colIndex: number): string {
    const width = this.columnWidths[colIndex] || 10;
    const alignment = this.align[colIndex] || 'left';

    let formatted = value;
    if (formatted.length > width - 2) {
      formatted = formatted.substring(0, width - 3) + '...';
    }

    const padding = width - formatted.length;
    if (alignment === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      formatted = ' '.repeat(leftPad) + formatted + ' '.repeat(rightPad);
    } else if (alignment === 'right') {
      formatted = ' '.repeat(padding) + formatted;
    } else {
      formatted = formatted + ' '.repeat(padding);
    }

    return formatted;
  }

  /**
   * Generate table content
   */
  private updateContent(): void {
    const lines: string[] = [];
    const border = this.noCellBorders ? ' ' : '│';

    // Header row
    if (this.headers.length > 0) {
      const headerCells = this.headers.map((h, i) => this.formatCell(h, i));
      lines.push(border + headerCells.join(border) + border);

      // Header separator
      const separators = this.columnWidths.map(w => '─'.repeat(w));
      lines.push(this.noCellBorders ? separators.join(' ') : '├' + separators.join('┼') + '┤');
    }

    // Data rows
    for (let rowIdx = 0; rowIdx < this.rows.length; rowIdx++) {
      const row = this.rows[rowIdx];
      const cells = row.map((cell, i) => this.formatCell(cell, i));
      const line = border + cells.join(border) + border;

      if (this.interactive && rowIdx === this.selectedRow) {
        // Highlight selected row: High contrast when focused, subtle when not
        const style = this.focused ? '{black-fg}{yellow-bg}' : '{white-fg}{blue-bg}';
        lines.push(`${style}${line}{/}`);
      } else {
        lines.push(line);
      }
    }

    this.setContent(lines.join('\n'));
  }

  /**
   * Get row index from Y coordinate
   */
  private getRowFromY(y: number): number {
    const relY = y - this.itop;
    const headerOffset = this.headers.length > 0 ? 2 : 0;
    const rowIndex = relY - headerOffset;
    return rowIndex >= 0 && rowIndex < this.rows.length ? rowIndex : -1;
  }

  /**
   * Select a row
   */
  selectRow(index: number): void {
    if (index < 0 || index >= this.rows.length) return;
    this.selectedRow = index;
    this.updateContent();
    this.emit('select row', index, this.rows[index]);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Select previous row
   */
  selectPrevious(): void {
    if (this.selectedRow > 0) {
      this.selectRow(this.selectedRow - 1);
    }
  }

  /**
   * Select next row
   */
  selectNext(): void {
    if (this.selectedRow < this.rows.length - 1) {
      this.selectRow(this.selectedRow + 1);
    }
  }

  /**
   * Set table data
   * First row is treated as headers (blessed-contrib compatible)
   */
  setData(rows: string[][]): void {
    if (rows.length > 0) {
      // First row is headers, rest is data (blessed-contrib compatibility)
      this.headers = rows[0];
      this.rows = rows.slice(1);
    } else {
      this.headers = [];
      this.rows = [];
    }
    this.calculateColumnWidths();
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Set headers
   */
  setHeaders(headers: string[]): void {
    this.headers = headers;
    this.calculateColumnWidths();
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get selected row index
   */
  getSelected(): number {
    return this.selectedRow;
  }

  /**
   * Get selected row data
   */
  getSelectedRow(): string[] | undefined {
    return this.rows[this.selectedRow];
  }

  /**
   * Initialize visible columns array
   */
  private _initVisibleColumns(): void {
    const numCols = Math.max(
      this.headers.length,
      ...this.rows.map(row => row.length)
    );
    this._visibleColumns = Array.from({ length: numCols }, (_, i) => i);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust visible columns
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - hide low-priority columns
   */
  protected _enterMobileMode(): void {
    this._isMobileMode = true;
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - show all columns
   */
  protected _exitMobileMode(): void {
    this._isMobileMode = false;
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly layout with limited columns
   */
  private _setMobileLayout(): void {
    this._isMobileMode = true;

    const numCols = Math.max(
      this.headers.length,
      ...this.rows.map(row => row.length)
    );

    if (numCols <= this._mobileMaxColumns) {
      // All columns fit, show all
      this._visibleColumns = Array.from({ length: numCols }, (_, i) => i);
    } else {
      // Sort columns by priority (higher first)
      const colsWithPriority = Array.from({ length: numCols }, (_, i) => ({
        index: i,
        priority: this._columnPriority[i] ?? 0,
      }));
      colsWithPriority.sort((a, b) => b.priority - a.priority);

      // Take top N columns by priority
      this._visibleColumns = colsWithPriority
        .slice(0, this._mobileMaxColumns)
        .map(c => c.index)
        .sort((a, b) => a - b);  // Sort back by index for display order
    }

    this.updateContent();
    if (this.screen) this.screen.render();
  }

  /**
   * Restore desktop layout with all columns
   */
  private _setDesktopLayout(): void {
    this._isMobileMode = false;

    // Show all columns
    this._initVisibleColumns();
    this.updateContent();
    if (this.screen) this.screen.render();
  }

  /**
   * Get visible headers (filtered for mobile)
   */
  private getVisibleHeaders(): string[] {
    return this._visibleColumns.map(i => this.headers[i] || '');
  }

  /**
   * Get visible row cells (filtered for mobile)
   */
  private getVisibleRow(row: string[]): string[] {
    return this._visibleColumns.map(i => row[i] || '');
  }

  /**
   * Get visible column width
   */
  private getVisibleColumnWidth(visibleIndex: number): number {
    const actualIndex = this._visibleColumns[visibleIndex];
    return this.columnWidths[actualIndex] || 10;
  }

  /**
   * Get visible column alignment
   */
  private getVisibleAlign(visibleIndex: number): 'left' | 'center' | 'right' {
    const actualIndex = this._visibleColumns[visibleIndex];
    return this.align[actualIndex] || 'left';
  }
}
