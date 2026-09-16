import { type Random } from './scramble';
/** Somewhere to write to - the door's socket, and nothing else about it. */
export interface Wire {
    emit(event: string, payload: string): unknown;
}
export interface SettleOptions {
    /** Off leaves the plain paint: one write per row, no frames. */
    animate: boolean;
    /** How many frames the table takes to settle. */
    frames?: number;
    random?: Random;
}
/**
 * Write `lines` over `onScreen` placeholder rows.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
export declare function settleOnto(wire: Wire, lines: readonly string[], onScreen: number, options: SettleOptions): number;
//# sourceMappingURL=settle-paint.d.ts.map