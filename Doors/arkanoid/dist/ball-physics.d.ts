/**
 * ARKANOID - Ball physics (pure, I/O-free)
 *
 * Extracted from ArkanoidGame.updateBalls() so the collision algorithm is
 * unit-testable, and rewritten from endpoint sampling to substepped (swept)
 * movement.
 *
 * WHY SUBSTEPS
 * ------------
 * Bricks are one cell high. The old integrator moved the ball
 * `speed * |v|` cells in a single jump and then point-tested only the
 * endpoint. With `BALL_SPEED_FAST = 1.05` and `|vy| = 1` the vertical step
 * is 1.05 cells - more than a brick is thick - so the endpoint could land
 * past the brick's `[y, y+1)` interval without ever testing a point inside
 * it: the ball flew straight through. Diagonal motion could likewise cross
 * a brick's corner between two samples even at step < 1.
 *
 * Movement is now divided into substeps no larger than MAX_SUBSTEP cells on
 * the dominant axis, with every collision check run per substep. Velocity
 * changes (a bounce) take effect on the very next substep, so the swept path
 * follows the deflected trajectory inside a single frame exactly as a
 * continuous ball would.
 *
 * The collision RESPONSES (wall clamps, paddle angle formula, nearest-side
 * brick reflection, hit decrement) are unchanged from the original - this
 * module fixes when collisions are detected, not what they do.
 */
/** Structural slices of the game objects the physics needs. The game's own
 *  Ball/Brick/Paddle interfaces satisfy these; render-only fields (colors,
 *  shineFrame, points) stay out of the physics' sight. */
export interface PhysicsBall {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    active: boolean;
}
export interface PhysicsBrick {
    x: number;
    y: number;
    width: number;
    height: number;
    hits: number;
    destroyed: boolean;
}
export interface PhysicsPaddle {
    x: number;
    y: number;
    width: number;
    sticky: boolean;
}
/** Playfield edges, in the same 1-indexed cell coordinates the game uses. */
export interface PlayfieldBounds {
    left: number;
    right: number;
    top: number;
}
/** What happened during one ball's frame, in the order it happened. The
 *  caller owns everything audible/countable: sounds, score, combo, power-up
 *  spawns. `brick` points at the game's own brick object so the caller can
 *  read points/powerUp from it. */
export type BallEvent<TBrick extends PhysicsBrick = PhysicsBrick> = {
    type: 'wall';
} | {
    type: 'paddle';
} | {
    type: 'paddleCatch';
} | {
    type: 'brickHit';
    brick: TBrick;
} | {
    type: 'brickDestroyed';
    brick: TBrick;
};
/**
 * Advance one active ball by one frame's worth of movement, colliding with
 * walls, the paddle, and bricks along the way.
 *
 * Mutates `ball` (position/velocity, `active` on a sticky catch), `paddle`
 * (`sticky` consumed by a catch), and any hit brick (`hits`, `destroyed`).
 * Returns the events in occurrence order.
 */
export declare function stepBall<TBrick extends PhysicsBrick>(ball: PhysicsBall, paddle: PhysicsPaddle, bricks: TBrick[], bounds: PlayfieldBounds): BallEvent<TBrick>[];
//# sourceMappingURL=ball-physics.d.ts.map