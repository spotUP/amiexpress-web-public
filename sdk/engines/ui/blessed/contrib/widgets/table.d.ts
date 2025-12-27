/**
 * Table Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/table.js
 * Data table with headers and selectable rows
 */
import { Box } from '../../widgets/box';
import { List } from '../../widgets/list';
import type { ElementOptions } from '../../core/types';
export interface TableData {
    headers: string[];
    data: string[][];
}
export interface TableOptions extends ElementOptions {
    columnWidth: number[];
    columnSpacing?: number;
    selectedFg?: string | number | number[];
    selectedBg?: string | number | number[];
    interactive?: boolean;
    data?: TableData;
    keys?: boolean;
    vi?: boolean;
    mouse?: boolean;
    bold?: boolean;
    fg?: string | number | number[];
    bg?: string | number | number[];
}
/**
 * Table Widget
 * Displays tabular data with headers and selectable rows
 */
export declare class Table extends Box {
    options: TableOptions;
    rows: List;
    constructor(options: Partial<TableOptions> & {
        columnWidth: number[];
    });
    focus(): void;
    render(): any;
    setData(table: TableData): void;
    getOptionsPrototype(): TableOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function table(options: Partial<TableOptions> & {
    columnWidth: number[];
}): Table;
