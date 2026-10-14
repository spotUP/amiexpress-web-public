/** WEBTERM's rows - internal W rows 17-22 - as text. Pure. */
import type { WebTerminalState } from '@amiexpress/bbs-door-sdk/core/types';
export type RowId = 'modem' | 'font' | 'palette' | 'charset' | 'data' | 'erase';
export declare const ROWS: ReadonlyArray<{
    id: RowId;
    label: string;
    blurb: string;
}>;
export declare const clip: (text: string, width: number) => string;
export declare function valueOf(id: RowId, s: WebTerminalState): string;
/** One line at 80 columns and wider, two (label, then value under it) below. */
export declare function rowLines(id: RowId, s: WebTerminalState, width: number): string[];
export declare function dataLines(rows: Array<{
    label: string;
    value: string;
}>, width: number): string[];
//# sourceMappingURL=layout.d.ts.map