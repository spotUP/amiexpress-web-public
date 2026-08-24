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
/** Movement per substep is capped at this many cells on the dominant axis.
 *  0.5 gives at least two samples inside any 1-cell brick row crossing. */
const MAX_SUBSTEP = 0.5;
/**
 * Advance one active ball by one frame's worth of movement, colliding with
 * walls, the paddle, and bricks along the way.
 *
 * Mutates `ball` (position/velocity, `active` on a sticky catch), `paddle`
 * (`sticky` consumed by a catch), and any hit brick (`hits`, `destroyed`).
 * Returns the events in occurrence order.
 */
export function stepBall(ball, paddle, bricks, bounds) {
    const events = [];
    const frameDistance = Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * ball.speed;
    const substeps = Math.max(1, Math.ceil(frameDistance / MAX_SUBSTEP));
    for (let s = 0; s < substeps; s++) {
        // Velocity is re-read each substep so a bounce mid-frame deflects the
        // remainder of the path instead of finishing the old straight line.
        // The pre-move position is kept: a brick hit reverts to it, so the
        // ball reflects from open space instead of staying embedded in the
        // grid - an embedded ball found a fresh neighbor brick every substep
        // and machine-gunned through the wall (reported as "the ball goes
        // crazy and removes many bricks").
        const preX = ball.x;
        const preY = ball.y;
        ball.x += (ball.vx * ball.speed) / substeps;
        ball.y += (ball.vy * ball.speed) / substeps;
        // Wall collisions - clamp-and-reflect, as before.
        if (ball.x <= bounds.left) {
            ball.x = bounds.left + 1;
            ball.vx = Math.abs(ball.vx);
            events.push({ type: 'wall' });
        }
        if (ball.x >= bounds.right) {
            ball.x = bounds.right - 1;
            ball.vx = -Math.abs(ball.vx);
            events.push({ type: 'wall' });
        }
        if (ball.y <= bounds.top) {
            ball.y = bounds.top + 1;
            ball.vy = Math.abs(ball.vy);
            events.push({ type: 'wall' });
        }
        // Paddle collision - same window and same angle formula as the original.
        if (ball.vy > 0 &&
            ball.y >= paddle.y - 1 &&
            ball.y <= paddle.y &&
            ball.x >= paddle.x &&
            ball.x <= paddle.x + paddle.width) {
            const hitPos = (ball.x - paddle.x) / paddle.width;
            const angle = (hitPos - 0.5) * 1.2;
            ball.vx = angle * 2;
            ball.vy = -Math.abs(ball.vy);
            ball.y = paddle.y - 1;
            if (paddle.sticky) {
                ball.active = false;
                paddle.sticky = false;
                events.push({ type: 'paddleCatch' });
                // A caught ball stops moving; the rest of the frame is void.
                return events;
            }
            events.push({ type: 'paddle' });
        }
        // Brick collisions - nearest-side reflection, first overlapping brick
        // wins, exactly as before. Substepping is what guarantees we get here
        // with the ball actually inside the brick instead of past it.
        for (const brick of bricks) {
            if (brick.destroyed)
                continue;
            if (ball.x >= brick.x &&
                ball.x < brick.x + brick.width &&
                ball.y >= brick.y &&
                ball.y < brick.y + brick.height) {
                // Which face was crossed this substep, judged by where the ball
                // CAME FROM - not by distance to the nearest edge. Bricks are 6x1:
                // the old nearest-edge heuristic called any entry within half a
                // cell of a brick's side a horizontal hit, flipped vx, and let the
                // ball sail straight up through the cell it had just emptied
                // (reported as "the ball does not bounce back when removing a
                // brick"). The pre-substep position is open space, so the axis it
                // was outside on is the axis that was crossed.
                const crossedY = preY < brick.y || preY >= brick.y + brick.height;
                const crossedX = preX < brick.x || preX >= brick.x + brick.width;
                if (crossedY && crossedX) {
                    // True corner entry - reflect both axes.
                    ball.vx = -ball.vx;
                    ball.vy = -ball.vy;
                }
                else if (crossedX) {
                    ball.vx = -ball.vx;
                }
                else {
                    ball.vy = -ball.vy;
                }
                // Resolve the penetration: back out to where this substep began.
                // That position was either the frame's start or a previous
                // substep's resolved position - open space either way.
                ball.x = preX;
                ball.y = preY;
                brick.hits--;
                if (brick.hits <= 0) {
                    brick.destroyed = true;
                    events.push({ type: 'brickDestroyed', brick });
                }
                else {
                    events.push({ type: 'brickHit', brick });
                }
                break;
            }
        }
    }
    return events;
}
