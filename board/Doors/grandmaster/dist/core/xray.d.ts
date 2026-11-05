/**
 * X-RAY: one column of the stack at a time, and darkness between sweeps.
 *
 * Reference type 12 (`mission.c:1334-1341`). A cell at column k is drawn only
 * while `xray_counter % p_xray_frame == k` (`view.c:1647`), the counter ticks
 * once a frame (`gamestart.c:4014-4015`) and `p_xray_frame` is 36
 * (`gamestart.c:700`). At 60fps that is a sweep of ten columns in ten frames
 * followed by twenty-six frames with nothing visible at all, six tenths of a
 * second end to end.
 *
 * THIS DOOR CANNOT COUNT FRAMES THE SAME WAY. A terminal repaints when the
 * door tells it to, over a modem in the worst case, so a rule written in
 * frames would sweep at whatever speed the line happened to give. The cycle
 * is kept in TIME instead - the same 600ms, the same one-column-at-a-time
 * sweep - so a caller on a fast screen and a caller on a slow one see the
 * same X-RAY, one of them just catches fewer frames of it.
 */
/** The reference's own cycle length: p_xray_frame (gamestart.c:700). */
export declare const XRAY_FRAMES = 36;
/** The whole cycle in milliseconds - 36 frames at 60fps. */
export declare const XRAY_CYCLE_MS = 600;
/**
 * Which column is visible right now, or -1 for the dark part of the cycle.
 *
 * The cycle position is worked out in the reference's own FRAME units - a
 * whole number 0..35 - rather than by dividing milliseconds by a fractional
 * column width, which lands on the wrong column at the boundaries and would
 * light column 9 twice and column 10 never.
 *
 * `width` is the board's, so a narrower field sweeps in fewer steps and rests
 * for longer, which is what the reference's `% p_xray_frame == k` does when k
 * only runs to the field's width.
 */
export declare function xrayVisibleColumn(now: number, width: number): number;
//# sourceMappingURL=xray.d.ts.map