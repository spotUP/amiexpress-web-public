import { type Random } from './scramble';
/** Somewhere to write to - the door's socket, and nothing else about it. */
export interface Wire {
    emit(event: string, payload: string): unknown;
}
export interface SettleOptions {
    /** Off leaves the plain paint: one write per row, no frames. */
    animate: boolean;
    /** How many frames the table takes to settle. More frames, slower fade. */
    frames?: number;
    /** Milliseconds between frames. Without this the frames arrive together. */
    frameMs?: number;
    random?: Random;
    /** Injected so a test does not wait in real time. */
    sleep?: (ms: number) => Promise<void>;
}
/**
 * Write `lines` over `onScreen` placeholder rows, settling as they go.
 *
 * ASYNCHRONOUS, and that is the whole difference between an animation and a
 * redraw. The first cut emitted every frame in one synchronous loop: the
 * terminal received them back to back and painted the last, so the table
 * appeared all at once and the sysop said so - "the scramble animation reveals
 * all real characters at the same time". A frame is only a frame if there is
 * time between them.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
export declare function settleOnto(wire: Wire, lines: readonly string[], onScreen: number, options: SettleOptions): Promise<number>;
//# sourceMappingURL=settle-paint.d.ts.map