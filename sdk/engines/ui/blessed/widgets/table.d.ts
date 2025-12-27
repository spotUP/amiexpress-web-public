/**
 * Table widget - Tabular data display
 */
import { Element } from '../core/element';
import type { TableOptions } from '../core/types';
export declare class Table extends Element {
    private rows;
    private headers;
    private columnWidth;
    private columnSpacing;
    constructor(options?: TableOptions);
    private _updateContent;
    private _calculateColumnWidths;
    private _padCell;
    setRows(rows: string[][]): void;
    setData(data: string[][]): void;
    setHeaders(headers: string[]): void;
    getRows(): string[][];
}
//# sourceMappingURL=table.d.ts.map