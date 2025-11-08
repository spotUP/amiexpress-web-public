/**
 * Unit Tests for Physics Engine
 */

import { PhysicsEngine } from '../../engines/physics/physics-engine';
import { PhysicsBody } from '../../core/types';

describe('PhysicsEngine', () => {
  let physics: PhysicsEngine;

  beforeEach(() => {
    physics = new PhysicsEngine({
      gravity: { x: 0, y: 9.8 },
      friction: 0.1
    });
  });

  describe('Initialization', () => {
    test('should initialize with config', () => {
      expect(physics).toBeDefined();
    });

    test('should set default gravity', () => {
      const defaultPhysics = new PhysicsEngine();
      expect(defaultPhysics).toBeDefined();
    });
  });

  describe('Body Management', () => {
    test('should create physics body', () => {
      const body = physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1,
        static: false
      });

      expect(body).toBeDefined();
      expect(body.id).toBe('player');
      expect(body.position.x).toBe(10);
      expect(body.position.y).toBe(10);
    });

    test('should create static body', () => {
      const body = physics.createBody({
        id: 'wall',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 1 },
        mass: 0,
        static: true
      });

      expect(body.static).toBe(true);
    });

    test('should remove body', () => {
      physics.createBody({
        id: 'temp',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.removeBody('temp');
      // Body should be removed
    });

    test('should get body by id', () => {
      physics.createBody({
        id: 'test',
        position: { x: 5, y: 5 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      const body = physics.getBody('test');
      expect(body).toBeDefined();
      expect(body?.id).toBe('test');
    });
  });

  describe('Forces and Motion', () => {
    test('should apply force to body', () => {
      const body = physics.createBody({
        id: 'ball',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.applyForce('ball', { x: 10, y: 0 });
      physics.update(1); // 1 second

      // Body should have moved
      expect(body.velocity.x).toBeGreaterThan(0);
    });

    test('should apply impulse to body', () => {
      const body = physics.createBody({
        id: 'ball',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.applyImpulse('ball', { x: 5, y: 0 });

      expect(body.velocity.x).toBe(5);
    });

    test('should set velocity directly', () => {
      const body = physics.createBody({
        id: 'player',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.setVelocity('player', { x: 3, y: -5 });

      expect(body.velocity.x).toBe(3);
      expect(body.velocity.y).toBe(-5);
    });

    test('should apply gravity to non-static bodies', () => {
      const body = physics.createBody({
        id: 'falling',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      const initialY = body.position.y;
      physics.update(0.1); // 100ms

      // Body should fall
      expect(body.position.y).toBeGreaterThan(initialY);
    });

    test('should not apply gravity to static bodies', () => {
      const body = physics.createBody({
        id: 'platform',
        position: { x: 0, y: 10 },
        size: { width: 5, height: 1 },
        mass: 0,
        static: true
      });

      const initialY = body.position.y;
      physics.update(1);

      expect(body.position.y).toBe(initialY);
    });
  });

  describe('Collision Detection', () => {
    test('should detect AABB collision', () => {
      const body1 = physics.createBody({
        id: 'box1',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        mass: 1
      });

      const body2 = physics.createBody({
        id: 'box2',
        position: { x: 5, y: 5 },
        size: { width: 10, height: 10 },
        mass: 1
      });

      const colliding = physics.checkCollision('box1', 'box2');
      expect(colliding).toBe(true);
    });

    test('should not detect collision for separated bodies', () => {
      physics.createBody({
        id: 'box1',
        position: { x: 0, y: 0 },
        size: { width: 5, height: 5 },
        mass: 1
      });

      physics.createBody({
        id: 'box2',
        position: { x: 20, y: 20 },
        size: { width: 5, height: 5 },
        mass: 1
      });

      const colliding = physics.checkCollision('box1', 'box2');
      expect(colliding).toBe(false);
    });

    test('should trigger collision callback', (done) => {
      physics.createBody({
        id: 'player',
        position: { x: 0, y: 0 },
        size: { width: 2, height: 2 },
        mass: 1,
        category: 'player'
      });

      physics.createBody({
        id: 'enemy',
        position: { x: 1, y: 1 },
        size: { width: 2, height: 2 },
        mass: 1,
        category: 'enemy'
      });

      physics.onCollision((collision) => {
        expect(collision.bodyA.id).toBeDefined();
        expect(collision.bodyB.id).toBeDefined();
        done();
      });

      physics.update(0.016);
    });

    test('should resolve collision with bounce', () => {
      const body1 = physics.createBody({
        id: 'ball',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1,
        bounce: 0.8
      });

      const body2 = physics.createBody({
        id: 'wall',
        position: { x: 5, y: 0 },
        size: { width: 1, height: 10 },
        mass: 0,
        static: true
      });

      // Move ball towards wall
      physics.setVelocity('ball', { x: 10, y: 0 });

      // Update until collision
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }

      // Ball should bounce back (negative x velocity)
      expect(body1.velocity.x).toBeLessThan(0);
    });
  });

  describe('Physics Update', () => {
    test('should update positions based on velocity', () => {
      const body = physics.createBody({
        id: 'moving',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.setVelocity('moving', { x: 10, y: 0 });
      physics.update(1); // 1 second

      expect(body.position.x).toBeGreaterThan(0);
    });

    test('should apply friction', () => {
      const body = physics.createBody({
        id: 'sliding',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        mass: 1,
        friction: 0.5
      });

      physics.setVelocity('sliding', { x: 10, y: 0 });
      const initialVelocity = body.velocity.x;

      physics.update(1);

      // Friction should slow down the body
      expect(body.velocity.x).toBeLessThan(initialVelocity);
    });

    test('should handle multiple bodies', () => {
      for (let i = 0; i < 10; i++) {
        physics.createBody({
          id: `body${i}`,
          position: { x: i * 5, y: 0 },
          size: { width: 1, height: 1 },
          mass: 1
        });
      }

      physics.update(0.016);
      // All bodies should update
    });
  });

  describe('Category Filtering', () => {
    test('should filter collisions by category', () => {
      physics.createBody({
        id: 'player',
        position: { x: 0, y: 0 },
        size: { width: 2, height: 2 },
        mass: 1,
        category: 'player'
      });

      physics.createBody({
        id: 'powerup',
        position: { x: 1, y: 1 },
        size: { width: 1, height: 1 },
        mass: 0,
        category: 'item'
      });

      // Should detect collision between different categories
      const colliding = physics.checkCollision('player', 'powerup');
      expect(colliding).toBe(true);
    });
  });

  describe('Spatial Queries', () => {
    test('should query bodies in region', () => {
      physics.createBody({
        id: 'inside',
        position: { x: 5, y: 5 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.createBody({
        id: 'outside',
        position: { x: 50, y: 50 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      const bodies = physics.queryRegion({
        x: 0,
        y: 0,
        width: 20,
        height: 20
      });

      expect(bodies).toHaveLength(1);
      expect(bodies[0].id).toBe('inside');
    });

    test('should find nearest body', () => {
      physics.createBody({
        id: 'near',
        position: { x: 5, y: 5 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      physics.createBody({
        id: 'far',
        position: { x: 50, y: 50 },
        size: { width: 1, height: 1 },
        mass: 1
      });

      const nearest = physics.findNearest({ x: 0, y: 0 });

      expect(nearest?.id).toBe('near');
    });
  });
});
