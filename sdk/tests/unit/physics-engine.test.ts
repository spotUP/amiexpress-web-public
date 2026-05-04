/**
 * Unit tests for the PhysicsEngine — 2D physics simulation used by
 * example games (AABB collision, gravity, forces, raycast, callbacks).
 *
 * The previous version of this file passed `gravity: { x: 0, y: 9.8 }`
 * (vector) to the constructor — current API takes `gravity: number`
 * (scalar, applied along Y). Other API drift was minor; rewrote against
 * the current surface.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PhysicsEngine } from '../../engines/physics/physics-engine';

describe('PhysicsEngine', () => {
  let physics: PhysicsEngine;

  beforeEach(() => {
    physics = new PhysicsEngine({ gravity: 9.8, friction: 0.98, timeStep: 1 / 60 });
  });

  describe('Body management', () => {
    test('createBody returns a body with the configured id and position', () => {
      const body = physics.createBody({
        id: 'player',
        position: { x: 10, y: 20 },
        size: { width: 2, height: 4 },
        mass: 1,
      });
      expect(body.id).toBe('player');
      expect(body.position).toEqual({ x: 10, y: 20 });
      expect(body.size).toEqual({ width: 2, height: 4 });
      expect(body.static).toBe(false);
      expect(body.category).toBe('default');
    });

    test('createBody applies sensible defaults', () => {
      const body = physics.createBody({
        id: 'b',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
      });
      expect(body.velocity).toEqual({ x: 0, y: 0 });
      expect(body.acceleration).toEqual({ x: 0, y: 0 });
      expect(body.mass).toBe(1);
      expect(body.bounce).toBe(0.2);
    });

    test('static body is correctly flagged', () => {
      const wall = physics.createBody({
        id: 'wall',
        position: { x: 0, y: 0 },
        size: { width: 80, height: 2 },
        static: true,
      });
      expect(wall.static).toBe(true);
    });

    test('getBody returns the same instance createBody returned', () => {
      const created = physics.createBody({
        id: 'a',
        position: { x: 1, y: 2 },
        size: { width: 1, height: 1 },
      });
      expect(physics.getBody('a')).toBe(created);
    });

    test('getBody returns undefined for unknown ids', () => {
      expect(physics.getBody('nope')).toBeUndefined();
    });

    test('removeBody drops the entry', () => {
      physics.createBody({
        id: 'temp',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
      });
      physics.removeBody('temp');
      expect(physics.getBody('temp')).toBeUndefined();
    });

    test('clear removes every body', () => {
      physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      physics.createBody({ id: 'b', position: { x: 5, y: 5 }, size: { width: 1, height: 1 } });
      physics.clear();
      expect(physics.getBody('a')).toBeUndefined();
      expect(physics.getBody('b')).toBeUndefined();
    });

    test('getBodiesByCategory filters correctly', () => {
      physics.createBody({ id: 'p', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, category: 'player' });
      physics.createBody({ id: 'e1', position: { x: 5, y: 5 }, size: { width: 1, height: 1 }, category: 'enemy' });
      physics.createBody({ id: 'e2', position: { x: 6, y: 6 }, size: { width: 1, height: 1 }, category: 'enemy' });
      const enemies = physics.getBodiesByCategory('enemy');
      expect(enemies).toHaveLength(2);
      expect(enemies.map(b => b.id).sort()).toEqual(['e1', 'e2']);
    });
  });

  describe('Forces, impulses, and velocity', () => {
    test('applyForce mutates acceleration on a non-static body', () => {
      const b = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, mass: 2 });
      physics.applyForce('a', { x: 4, y: 0 });
      // F = m·a → a = F/m = 4/2 = 2
      expect(b.acceleration.x).toBeCloseTo(2);
    });

    test('applyForce on a static body is a no-op', () => {
      const b = physics.createBody({ id: 'wall', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, static: true });
      physics.applyForce('wall', { x: 100, y: 100 });
      expect(b.acceleration).toEqual({ x: 0, y: 0 });
      expect(b.velocity).toEqual({ x: 0, y: 0 });
    });

    test('applyImpulse mutates velocity directly', () => {
      const b = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      physics.applyImpulse('a', { x: 5, y: -3 });
      expect(b.velocity).toEqual({ x: 5, y: -3 });
    });

    test('setVelocity replaces (does not add to) the body velocity', () => {
      const b = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      physics.applyImpulse('a', { x: 10, y: 10 });
      physics.setVelocity('a', { x: 1, y: 1 });
      expect(b.velocity).toEqual({ x: 1, y: 1 });
    });

    test('applyGravity adds a downward force scaled by mass (default = config.gravity)', () => {
      const b = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, mass: 1 });
      physics.applyGravity('a');
      expect(b.acceleration.y).toBeCloseTo(9.8);
      expect(b.acceleration.x).toBe(0);
    });

    test('applyGravity accepts a per-call override', () => {
      const b = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, mass: 1 });
      physics.applyGravity('a', 5);
      expect(b.acceleration.y).toBeCloseTo(5);
    });
  });

  describe('Collision detection', () => {
    test('overlapping AABBs report a collision with depth and normal', () => {
      const a = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 4, height: 4 } });
      const b = physics.createBody({ id: 'b', position: { x: 2, y: 0 }, size: { width: 4, height: 4 } });
      const c = physics.checkCollision(a, b);
      expect(c).not.toBeNull();
      expect(c!.depth).toBeCloseTo(2);
      // X overlap is smallest, so normal is along X.
      expect(c!.normal.y).toBe(0);
      expect(Math.abs(c!.normal.x)).toBe(1);
    });

    test('non-overlapping AABBs return null', () => {
      const a = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
      const b = physics.createBody({ id: 'b', position: { x: 10, y: 10 }, size: { width: 1, height: 1 } });
      expect(physics.checkCollision(a, b)).toBeNull();
    });

    test('edge-touching boxes are NOT considered colliding (strict inequality)', () => {
      // Implementation uses < / > on the bounds, so boxes that share an
      // edge don't overlap. Documents the behavior so future changes
      // that flip to <= surface here.
      const a = physics.createBody({ id: 'a', position: { x: 0, y: 0 }, size: { width: 2, height: 2 } });
      const b = physics.createBody({ id: 'b', position: { x: 2, y: 0 }, size: { width: 2, height: 2 } });
      expect(physics.checkCollision(a, b)).toBeNull();
    });
  });

  describe('Collision callbacks via update()', () => {
    test('onCollision fires for a category pair when bodies overlap during an update tick', () => {
      // Place player and enemy overlapping at t=0; one update tick should
      // report them collided.
      physics.createBody({ id: 'p', position: { x: 0, y: 0 }, size: { width: 2, height: 2 }, category: 'player' });
      physics.createBody({ id: 'e', position: { x: 1, y: 1 }, size: { width: 2, height: 2 }, category: 'enemy', static: true });

      const cb = jest.fn();
      physics.onCollision('player', 'enemy', cb);

      // Drive at least one fixed step (1/60s).
      physics.update(1 / 60);
      expect(cb).toHaveBeenCalled();
    });

    test('reverse-order callback (enemy:player) also fires with bodies swapped', () => {
      physics.createBody({ id: 'p', position: { x: 0, y: 0 }, size: { width: 2, height: 2 }, category: 'player' });
      physics.createBody({ id: 'e', position: { x: 1, y: 1 }, size: { width: 2, height: 2 }, category: 'enemy', static: true });

      const cb = jest.fn();
      physics.onCollision('enemy', 'player', cb);
      physics.update(1 / 60);
      expect(cb).toHaveBeenCalledTimes(1);
      const collision = cb.mock.calls[0][0] as any;
      // The reverse callback gets bodies in (enemy, player) order.
      expect(collision.bodyA.category).toBe('enemy');
      expect(collision.bodyB.category).toBe('player');
    });

    test('callback does not fire for unrelated category pairs', () => {
      physics.createBody({ id: 'p', position: { x: 0, y: 0 }, size: { width: 2, height: 2 }, category: 'player' });
      physics.createBody({ id: 'e', position: { x: 1, y: 1 }, size: { width: 2, height: 2 }, category: 'enemy', static: true });

      const otherCb = jest.fn();
      physics.onCollision('bullet', 'wall', otherCb);
      physics.update(1 / 60);
      expect(otherCb).not.toHaveBeenCalled();
    });
  });

  describe('Simulation step', () => {
    test('a body with velocity moves over time', () => {
      const b = physics.createBody({
        id: 'a',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        velocity: { x: 60, y: 0 },
        friction: 1, // disable damping for a clean assertion
      });
      // 1 second at 60Hz = 60 fixed steps of dt=1/60. velocity is 60 u/s,
      // so position should advance roughly 60 units.
      physics.update(1.0);
      expect(b.position.x).toBeGreaterThan(50);
      expect(b.position.x).toBeLessThan(70);
    });

    test('static bodies do not move even with velocity', () => {
      const wall = physics.createBody({
        id: 'wall',
        position: { x: 5, y: 5 },
        size: { width: 10, height: 1 },
        static: true,
        velocity: { x: 100, y: 100 }, // ignored on static bodies
      });
      physics.update(1.0);
      expect(wall.position).toEqual({ x: 5, y: 5 });
    });

    test('friction damps velocity over multiple ticks', () => {
      const b = physics.createBody({
        id: 'a',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        velocity: { x: 100, y: 0 },
        friction: 0.5, // strong damping
      });
      physics.update(1.0);
      expect(Math.abs(b.velocity.x)).toBeLessThan(1);
    });
  });

  describe('Raycast', () => {
    test('hits a body that the segment passes through', () => {
      const target = physics.createBody({
        id: 't',
        position: { x: 10, y: 0 },
        size: { width: 4, height: 4 },
        category: 'enemy',
      });
      const hit = physics.raycast({ x: 0, y: 1 }, { x: 20, y: 1 }, 'enemy');
      expect(hit).toBe(target);
    });

    test('returns null when no body sits on the segment', () => {
      physics.createBody({
        id: 't',
        position: { x: 100, y: 100 },
        size: { width: 1, height: 1 },
        category: 'enemy',
      });
      const hit = physics.raycast({ x: 0, y: 0 }, { x: 5, y: 0 }, 'enemy');
      expect(hit).toBeNull();
    });

    test('category filter excludes other-category bodies', () => {
      physics.createBody({
        id: 'wall',
        position: { x: 5, y: 0 },
        size: { width: 1, height: 4 },
        category: 'wall',
      });
      // Ray goes through the wall but we're filtering for 'enemy' only.
      const hit = physics.raycast({ x: 0, y: 1 }, { x: 10, y: 1 }, 'enemy');
      expect(hit).toBeNull();
    });

    test('without a category filter, any intersecting body matches', () => {
      const wall = physics.createBody({
        id: 'wall',
        position: { x: 5, y: 0 },
        size: { width: 1, height: 4 },
        category: 'wall',
      });
      const hit = physics.raycast({ x: 0, y: 1 }, { x: 10, y: 1 });
      expect(hit).toBe(wall);
    });
  });
});
