/**
 * Paddle glide.
 *
 * The pointer - mouse, or the phone trackpad - reports WHOLE terminal
 * columns, so a paddle that takes its position straight from the pointer can
 * only ever land on whole cells and visibly steps across the screen. Easing
 * toward the pointer's column instead puts the paddle on the positions in
 * between, which is what the half-block rendering needs in order to show a
 * movement smaller than one character.
 *
 * Pure, so the feel can be tuned against tests rather than against a phone.
 */
/**
 * Fraction of the remaining distance covered each frame.
 *
 * 0.65, not the 0.55 first tried: at 0.55 a ten-column flick still had a
 * fifth of the distance to go after two frames, which is lag you can feel in
 * a game this fast. At 0.65 the paddle is essentially on the pointer within
 * two frames and still passes THROUGH the half-cell positions on the way,
 * which is what the half-block rendering needs.
 */
export declare const PADDLE_EASE = 0.65;
/** Closer than this and the paddle simply sits on the target. */
export declare const PADDLE_SNAP = 0.05;
/**
 * One frame of glide toward `target`.
 *
 * Never overshoots: the step is always a fraction of what remains, so the
 * paddle approaches the pointer and stops there.
 */
export declare function easePaddle(current: number, target: number, ease?: number, snap?: number): number;
//# sourceMappingURL=paddle-motion.d.ts.map