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
export type BallEvent<TBrick extends PhysicsBrick = PhysicsBrick> =
  | { type: 'wall' }
  | { type: 'paddle' }
  | { type: 'paddleCatch' }
  | { type: 'brickHit'; brick: TBrick }
  | { type: 'brickDestroyed'; brick: TBrick };

/**
 * Advance one active ball by one frame's worth of movement, colliding with
 * walls, the paddle, and bricks along the way.
 *
 * Mutates `ball` (position/velocity, `active` on a sticky catch), `paddle`
 * (`sticky` consumed by a catch), and any hit brick (`hits`, `destroyed`).
 * Returns the events in occurrence order.
 */
export function stepBall<TBrick extends PhysicsBrick>(
  ball: PhysicsBall,
  paddle: PhysicsPaddle,
  bricks: TBrick[],
  bounds: PlayfieldBounds
): BallEvent<TBrick>[] {
  const events: BallEvent<TBrick>[] = [];

  const frameDistance = Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * ball.speed;
  const substeps = Math.max(1, Math.ceil(frameDistance / MAX_SUBSTEP));

  for (let s = 0; s < substeps; s++) {
    // Velocity is re-read each substep so a bounce mid-frame deflects the
    // remainder of the path instead of finishing the old straight line.
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
    if (
      ball.vy > 0 &&
      ball.y >= paddle.y - 1 &&
      ball.y <= paddle.y &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.width
    ) {
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
      if (brick.destroyed) continue;

      if (
        ball.x >= brick.x &&
        ball.x < brick.x + brick.width &&
        ball.y >= brick.y &&
        ball.y < brick.y + brick.height
      ) {
        const fromLeft = ball.x - brick.x;
        const fromRight = brick.x + brick.width - ball.x;
        const fromTop = ball.y - brick.y;
        const fromBottom = brick.y + brick.height - ball.y;

        const minHoriz = Math.min(fromLeft, fromRight);
        const minVert = Math.min(fromTop, fromBottom);

        if (minHoriz < minVert) {
          ball.vx = -ball.vx;
        } else {
          ball.vy = -ball.vy;
        }

        brick.hits--;
        if (brick.hits <= 0) {
          brick.destroyed = true;
          events.push({ type: 'brickDestroyed', brick });
        } else {
          events.push({ type: 'brickHit', brick });
        }
        break;
      }
    }
  }

  return events;
}
