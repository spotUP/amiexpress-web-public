/**
 * Table widget - Tabular data display
 */

import { Element } from '../core/element';
import type { TableOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface TableData {
  headers: string[];
  data: string[][];
}

export class Table extends Element {
  private rows: string[][] = [];
  private headers: string[] = [];
  private columnWidth: number[] = [];
  private columnSpacing: number = 1;

  constructor(options: TableOptions = {}) {
    super({
      scrollable: true,
      ...options,
    });

    this.rows = options.rows || options.data || [];
    this.headers = options.headers || [];
    this.columnWidth = options.columnWidth || [];
    this.columnSpacing = options.columnSpacing || 1;

    this._updateContent();
  }

  private _updateContent(): void {
    // Calculate column widths if not provided
    const widths = this.columnWidth.length > 0 ? this.columnWidth : this._calculateColumnWidths();

    // Build table
    const lines: string[] = [];

    // Headers
    if (this.headers.length > 0) {
      const headerLine = this.headers
        .map((h, i) => this._padCell(h, widths[i] || 10))
        .join(' '.repeat(this.columnSpacing));
      lines.push(headerLine);

      // Separator
      const separator = widths.map((w) => '─'.repeat(w)).join(' '.repeat(this.columnSpacing));
      lines.push(separator);
    }

    // Rows
    for (const row of this.rows) {
      const rowLine = row.map((cell, i) => this._padCell(cell, widths[i] || 10)).join(' '.repeat(this.columnSpacing));
      lines.push(rowLine);
    }

    this.setContent(lines.join('\n'));
  }

  private _calculateColumnWidths(): number[] {
    const widths: number[] = [];

    // Start with headers
    for (let i = 0; i < this.headers.length; i++) {
      widths[i] = this.headers[i].length;
    }

    // Check rows
    for (const row of this.rows) {
      for (let i = 0; i < row.length; i++) {
        widths[i] = Math.max(widths[i] || 0, row[i].length);
      }
    }

    return widths;
  }

  private _padCell(text: string, width: number): string {
    if (text.length > width) {
      return text.slice(0, width);
    }
    return text + ' '.repeat(width - text.length);
  }

  setRows(rows: string[][]): void {
    this.rows = rows;
    this._updateContent();
  }

  setData(data: TableData | string[][]): void {
    if (Array.isArray(data)) {
      this.setRows(data);
    } else {
      this.headers = data.headers;
      this.setRows(data.data);
    }
  }

  setHeaders(headers: string[]): void {
    this.headers = headers;
    this._updateContent();
  }

  getRows(): string[][] {
    return this.rows.slice();
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // Re-render table to adjust column widths
    this._updateContent();
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
