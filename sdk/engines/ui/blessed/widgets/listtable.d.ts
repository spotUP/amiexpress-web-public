/**
 * ListTable - Enhanced table with list-like selection behavior
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface ListTableOptions extends Omit<ElementOptions, 'align'> {
    rows?: string[][];
    headers?: string[];
    columnWidths?: number[];
    align?: ('left' | 'center' | 'right')[];
    interactive?: boolean;
    noCellBorders?: boolean;
}
export declare class ListTable extends Box {
    private rows;
    private headers;
    private columnWidths;
    private align;
    private selectedRow;
    private interactive;
    private noCellBorders;
    constructor(options?: ListTableOptions);
    /**
     * Calculate column widths automatically
     */
    private calculateColumnWidths;
    /**
     * Format a cell value
     */
    private formatCell;
    /**
     * Generate table content
     */
    private updateContent;
    /**
     * Get row index from Y coordinate
     */
    private getRowFromY;
    /**
     * Select a row
     */
    selectRow(index: number): void;
    /**
     * Select previous row
     */
    selectPrevious(): void;
    /**
     * Select next row
     */
    selectNext(): void;
    /**
     * Set table data
     * First row is treated as headers (blessed-contrib compatible)
     */
    setData(rows: string[][]): void;
    /**
     * Set headers
     */
    setHeaders(headers: string[]): void;
    /**
     * Get selected row index
     */
    getSelected(): number;
    /**
     * Get selected row data
     */
    getSelectedRow(): string[] | undefined;
}
