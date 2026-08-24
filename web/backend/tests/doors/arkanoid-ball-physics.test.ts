/**
 * Regression tests for the Arkanoid ball physics (Doors/arkanoid/ball-physics.ts).
 *
 * User-visible symptom (2026-08-24): "the ball flies through bricks
 * sometimes". The old integrator moved the ball up to speed * |v| cells in a
 * single jump - 1.05 cells at BALL_SPEED_FAST against bricks 1 cell high -
 * and point-tested only the endpoint, so the endpoint could land past the
 * brick without a single sample inside it. stepBall() substeps the movement
 * so that cannot happen; these tests pin that guarantee plus the collision
 * responses that were carried over unchanged.
 */

import {
  stepBall,
  PhysicsBall,
  PhysicsBrick,
  PhysicsPaddle,
  PlayfieldBounds,
} from '../../../../Doors/arkanoid/ball-physics';

// The game's real playfield geometry (client.ts constants).
const BOUNDS: PlayfieldBounds = { left: 2, right: 77, top: 3 };

function ball(overrides: Partial<PhysicsBall> = {}): PhysicsBall {
  return { x: 40, y: 12, vx: 0, vy: 1, speed: 0.7, active: true, ...overrides };
}

function brick(overrides: Partial<PhysicsBrick> = {}): PhysicsBrick {
  return { x: 36, y: 8, width: 6, height: 1, hits: 1, destroyed: false, ...overrides };
}

function paddle(overrides: Partial<PhysicsPaddle> = {}): PhysicsPaddle {
  return { x: 35, y: 20, width: 10, sticky: false, ...overrides };
}

describe('arkanoid ball physics', () => {
  describe('tunneling (the reported bug)', () => {
    it('hits a 1-cell brick even at fast speed, where one frame moves more than a brick height', () => {
      // At speed 1.05 with vy=-1 the old code moved y from 9.02 to 7.97 in
      // one jump - straight over the brick row [8, 9) - and reported no hit.
      const b = ball({ x: 38, y: 9.02, vx: 0, vy: -1, speed: 1.05 });
      const target = brick({ x: 36, y: 8 });

      const events = stepBall(b, paddle(), [target], BOUNDS);

      expect(events.map((e) => e.type)).toContain('brickDestroyed');
      expect(target.destroyed).toBe(true);
    });

    it('never crosses a brick row without hitting it, at any speed the game can produce', () => {
      // Sweep start offsets and speeds; a ball crossing the row of a
      // full-width brick wall must always collide.
      const speeds = [0.42, 0.7, 1.05];
      for (const speed of speeds) {
        for (let offset = 0; offset < 1; offset += 0.05) {
          const wall = brick({ x: BOUNDS.left, y: 8, width: BOUNDS.right - BOUNDS.left, hits: 1 });
          const b = ball({ x: 40, y: 9 + offset, vx: 0.3, vy: -1, speed });

          // The ball must hit BEFORE it ends up above the row - the old
          // integrator would sometimes emerge on the far side untouched
          // and only collide on a later pass, or never.
          let hit = false;
          for (let frame = 0; frame < 12 && !hit && b.y >= wall.y; frame++) {
            const events = stepBall(b, paddle(), [wall], BOUNDS);
            hit = events.some((e) => e.type === 'brickDestroyed' || e.type === 'brickHit');
          }

          expect(hit).toBe(true);
        }
      }
    });

    it('catches a diagonal corner crossing that endpoint sampling missed', () => {
      // Up-and-right past the brick's bottom-left corner: start below-left,
      // end above-right, with no frame endpoint inside the brick under the
      // old single-jump integrator.
      const target = brick({ x: 36, y: 8, width: 6 });
      // One old-style frame: (35.6, 8.99) -> (36.86, 7.94). The endpoint is
      // above the brick row, so endpoint sampling saw nothing; the path's
      // midpoint (36.23, 8.47) is inside the brick.
      const b = ball({ x: 35.6, y: 8.99, vx: 1.2, vy: -1, speed: 1.05 });

      const events = stepBall(b, paddle(), [target], BOUNDS);

      expect(events.some((e) => e.type === 'brickDestroyed')).toBe(true);
    });
  });

  describe('collision responses carried over from the original', () => {
    it('reflects vertically off a brick hit from below', () => {
      const b = ball({ x: 38, y: 9.3, vx: 0, vy: -1, speed: 0.7 });

      stepBall(b, paddle(), [brick()], BOUNDS);

      expect(b.vy).toBe(1);
    });

    it('decrements a multi-hit brick without destroying it', () => {
      const tough = brick({ hits: 2 });
      const b = ball({ x: 38, y: 9.3, vx: 0, vy: -1, speed: 0.7 });

      const events = stepBall(b, paddle(), [tough], BOUNDS);

      expect(events.map((e) => e.type)).toContain('brickHit');
      expect(tough.hits).toBe(1);
      expect(tough.destroyed).toBe(false);
    });

    it('bounces off the left wall with the x position clamped inside the field', () => {
      const b = ball({ x: 2.3, y: 12, vx: -1, vy: 0.2, speed: 0.7 });

      const events = stepBall(b, paddle(), [], BOUNDS);

      expect(events.map((e) => e.type)).toContain('wall');
      expect(b.vx).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThan(BOUNDS.left);
    });

    it('angles the ball off the paddle by hit position and resets vy upward', () => {
      const p = paddle({ x: 35, width: 10 });
      // Hit near the right edge - the original formula gives vx = ((hitPos - 0.5) * 1.2) * 2.
      const b = ball({ x: 44, y: 19.5, vx: 0, vy: 1, speed: 0.7 });

      const events = stepBall(b, p, [], BOUNDS);

      expect(events.map((e) => e.type)).toContain('paddle');
      expect(b.vy).toBeLessThan(0);
      expect(b.vx).toBeGreaterThan(0);
      // The bounce snaps the ball to paddle.y - 1, then the rest of the
      // frame's substeps carry it upward along the deflected path.
      expect(b.y).toBeLessThanOrEqual(p.y - 1);
      expect(b.y).toBeGreaterThan(p.y - 2);
    });

    it('sticky paddle catches the ball: deactivates it and consumes the sticky flag', () => {
      const p = paddle({ sticky: true });
      const b = ball({ x: 40, y: 19.5, vx: 0, vy: 1, speed: 0.7 });

      const events = stepBall(b, p, [], BOUNDS);

      expect(events.map((e) => e.type)).toContain('paddleCatch');
      expect(b.active).toBe(false);
      expect(p.sticky).toBe(false);
    });

    it('hits only the first overlapping brick per substep', () => {
      const first = brick({ x: 36, y: 8 });
      const second = brick({ x: 36, y: 8 }); // same cell - only one may be hit
      const b = ball({ x: 38, y: 9.3, vx: 0, vy: -1, speed: 0.7 });

      stepBall(b, paddle(), [first, second], BOUNDS);

      const hits = [first, second].filter((br) => br.destroyed).length;
      expect(hits).toBe(1);
    });
  });

  describe('a bounce mid-frame deflects the rest of the frame', () => {
    it('does not keep travelling into the brick after reflecting', () => {
      const target = brick({ x: 36, y: 8, hits: 1 });
      const b = ball({ x: 38, y: 9.1, vx: 0, vy: -1, speed: 1.05 });

      stepBall(b, paddle(), [target], BOUNDS);

      // After the bounce the remaining substeps move downward, so the ball
      // must finish below the brick row, not inside or above it.
      expect(b.y).toBeGreaterThanOrEqual(8);
      expect(b.vy).toBe(1);
    });
  });
});
