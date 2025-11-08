/**
 * Physics Engine - 2D Physics for BBS Games
 *
 * Provides realistic physics simulation including:
 * - Collision detection (AABB and circle)
 * - Gravity and forces
 * - Velocity and acceleration
 * - Friction and bounce
 * - Collision callbacks
 *
 * @example
 * ```typescript
 * import { PhysicsEngine } from '@amiexpress/sdk/engines/physics';
 *
 * const physics = new PhysicsEngine({ gravity: 9.8 });
 *
 * // Create player body
 * const player = physics.createBody({
 *   id: 'player',
 *   position: { x: 10, y: 0 },
 *   size: { width: 2, height: 4 },
 *   mass: 1,
 *   category: 'player'
 * });
 *
 * // Create platform
 * const platform = physics.createBody({
 *   id: 'platform',
 *   position: { x: 0, y: 20 },
 *   size: { width: 80, height: 2 },
 *   static: true,
 *   category: 'terrain'
 * });
 *
 * // Handle collisions
 * physics.onCollision('player', 'terrain', (collision) => {
 *   console.log('Player landed on platform!');
 * });
 *
 * // Update physics each frame
 * physics.update(deltaTime);
 * ```
 */

import { PhysicsBody, Position, Size, Collision } from '../../core/types';

export interface PhysicsEngineConfig {
  /** Gravity acceleration (units/s²) */
  gravity?: number;
  /** Global friction */
  friction?: number;
  /** Time step (fixed timestep in seconds) */
  timeStep?: number;
}

type CollisionCallback = (collision: Collision) => void;

export class PhysicsEngine {
  /** Physics bodies registry */
  private bodies: Map<string, PhysicsBody> = new Map();

  /** Collision callbacks */
  private collisionCallbacks: Map<string, CollisionCallback> = new Map();

  /** Gravity acceleration */
  private gravity: number;

  /** Global friction */
  private friction: number;

  /** Fixed time step */
  private timeStep: number;

  /** Accumulator for fixed timestep */
  private accumulator: number = 0;

  constructor(config: PhysicsEngineConfig = {}) {
    this.gravity = config.gravity ?? 9.8;
    this.friction = config.friction ?? 0.98;
    this.timeStep = config.timeStep ?? 1 / 60; // 60 Hz
  }

  /**
   * Create a physics body
   *
   * @param config - Body configuration
   * @returns Created physics body
   *
   * @example
   * ```typescript
   * const bullet = physics.createBody({
   *   id: 'bullet1',
   *   position: { x: playerX, y: playerY },
   *   size: { width: 1, height: 1 },
   *   velocity: { x: 10, y: 0 },
   *   mass: 0.1,
   *   category: 'projectile'
   * });
   * ```
   */
  public createBody(config: {
    id: string;
    position: Position;
    size: Size;
    velocity?: Position;
    acceleration?: Position;
    mass?: number;
    friction?: number;
    bounce?: number;
    static?: boolean;
    category?: string;
    data?: Record<string, any>;
  }): PhysicsBody {
    const body: PhysicsBody = {
      id: config.id,
      position: { ...config.position },
      size: { ...config.size },
      velocity: config.velocity || { x: 0, y: 0 },
      acceleration: config.acceleration || { x: 0, y: 0 },
      mass: config.mass ?? 1,
      friction: config.friction ?? this.friction,
      bounce: config.bounce ?? 0.2,
      static: config.static ?? false,
      category: config.category || 'default',
      data: config.data || {},
    };

    this.bodies.set(config.id, body);
    return body;
  }

  /**
   * Get physics body by ID
   *
   * @param id - Body ID
   * @returns Physics body or undefined
   */
  public getBody(id: string): PhysicsBody | undefined {
    return this.bodies.get(id);
  }

  /**
   * Remove physics body
   *
   * @param id - Body ID
   */
  public removeBody(id: string): void {
    this.bodies.delete(id);
  }

  /**
   * Apply force to body
   *
   * @param body - Target body (or ID)
   * @param force - Force vector
   *
   * @example
   * ```typescript
   * // Jump
   * physics.applyForce(player, { x: 0, y: -15 });
   *
   * // Dash right
   * physics.applyForce(player, { x: 20, y: 0 });
   * ```
   */
  public applyForce(body: PhysicsBody | string, force: Position): void {
    const b = typeof body === 'string' ? this.bodies.get(body) : body;
    if (!b || b.static) return;

    // F = ma, so a = F/m
    b.acceleration.x += force.x / b.mass;
    b.acceleration.y += force.y / b.mass;
  }

  /**
   * Set body velocity directly
   *
   * @param body - Target body (or ID)
   * @param velocity - Velocity vector
   *
   * @example
   * ```typescript
   * // Move right at constant speed
   * physics.setVelocity(player, { x: 5, y: 0 });
   * ```
   */
  public setVelocity(body: PhysicsBody | string, velocity: Position): void {
    const b = typeof body === 'string' ? this.bodies.get(body) : body;
    if (!b || b.static) return;

    b.velocity = { ...velocity };
  }

  /**
   * Apply impulse to body (instant velocity change)
   *
   * @param body - Target body (or ID)
   * @param impulse - Impulse vector
   *
   * @example
   * ```typescript
   * // Instant jump
   * physics.applyImpulse(player, { x: 0, y: -10 });
   * ```
   */
  public applyImpulse(body: PhysicsBody | string, impulse: Position): void {
    const b = typeof body === 'string' ? this.bodies.get(body) : body;
    if (!b || b.static) return;

    b.velocity.x += impulse.x;
    b.velocity.y += impulse.y;
  }

  /**
   * Apply gravity to body
   *
   * @param body - Target body (or ID)
   * @param gravity - Gravity override (optional)
   */
  public applyGravity(body: PhysicsBody | string, gravity?: number): void {
    this.applyForce(body, { x: 0, y: (gravity ?? this.gravity) });
  }

  /**
   * Check collision between two bodies (AABB)
   *
   * @param a - First body
   * @param b - Second body
   * @returns Collision data or null
   */
  public checkCollision(a: PhysicsBody, b: PhysicsBody): Collision | null {
    // AABB collision detection
    const ax1 = a.position.x;
    const ay1 = a.position.y;
    const ax2 = a.position.x + a.size.width;
    const ay2 = a.position.y + a.size.height;

    const bx1 = b.position.x;
    const by1 = b.position.y;
    const bx2 = b.position.x + b.size.width;
    const by2 = b.position.y + b.size.height;

    // Check overlap
    if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1) {
      // Calculate overlap amounts
      const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
      const overlapY = Math.min(ay2 - by1, by2 - ay1);

      // Determine collision normal (direction of smallest overlap)
      const normal: Position =
        overlapX < overlapY
          ? { x: ax2 > bx2 ? 1 : -1, y: 0 }
          : { x: 0, y: ay2 > by2 ? 1 : -1 };

      const depth = Math.min(overlapX, overlapY);

      return {
        bodyA: a,
        bodyB: b,
        normal,
        depth,
      };
    }

    return null;
  }

  /**
   * Resolve collision between two bodies
   *
   * @param collision - Collision data
   * @private
   */
  private resolveCollision(collision: Collision): void {
    const { bodyA, bodyB, normal, depth } = collision;

    // Don't resolve if both static
    if (bodyA.static && bodyB.static) return;

    // Separate bodies
    if (!bodyA.static && !bodyB.static) {
      const totalMass = bodyA.mass + bodyB.mass;
      const aRatio = bodyB.mass / totalMass;
      const bRatio = bodyA.mass / totalMass;

      bodyA.position.x -= normal.x * depth * aRatio;
      bodyA.position.y -= normal.y * depth * aRatio;
      bodyB.position.x += normal.x * depth * bRatio;
      bodyB.position.y += normal.y * depth * bRatio;
    } else if (!bodyA.static) {
      bodyA.position.x -= normal.x * depth;
      bodyA.position.y -= normal.y * depth;
    } else {
      bodyB.position.x += normal.x * depth;
      bodyB.position.y += normal.y * depth;
    }

    // Apply bounce
    const bounce = Math.min(bodyA.bounce, bodyB.bounce);

    if (!bodyA.static) {
      const velDotNormal = bodyA.velocity.x * normal.x + bodyA.velocity.y * normal.y;
      bodyA.velocity.x -= (1 + bounce) * velDotNormal * normal.x;
      bodyA.velocity.y -= (1 + bounce) * velDotNormal * normal.y;
    }

    if (!bodyB.static) {
      const velDotNormal = bodyB.velocity.x * normal.x + bodyB.velocity.y * normal.y;
      bodyB.velocity.x += (1 + bounce) * velDotNormal * normal.x;
      bodyB.velocity.y += (1 + bounce) * velDotNormal * normal.y;
    }
  }

  /**
   * Register collision callback
   *
   * @param categoryA - First category
   * @param categoryB - Second category
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * physics.onCollision('player', 'enemy', (collision) => {
   *   player.takeDamage(10);
   *   enemy.flash();
   * });
   *
   * physics.onCollision('bullet', 'enemy', (collision) => {
   *   enemy.destroy();
   *   bullet.destroy();
   * });
   * ```
   */
  public onCollision(
    categoryA: string,
    categoryB: string,
    callback: CollisionCallback
  ): void {
    const key = `${categoryA}:${categoryB}`;
    this.collisionCallbacks.set(key, callback);
  }

  /**
   * Update physics simulation
   *
   * @param deltaTime - Time since last update (seconds)
   *
   * @example
   * ```typescript
   * door.onUpdate((delta) => {
   *   physics.update(delta / 1000); // Convert ms to seconds
   * });
   * ```
   */
  public update(deltaTime: number): void {
    // Fixed timestep accumulator
    this.accumulator += deltaTime;

    while (this.accumulator >= this.timeStep) {
      this.step(this.timeStep);
      this.accumulator -= this.timeStep;
    }
  }

  /**
   * Single physics step
   *
   * @param dt - Time step (seconds)
   * @private
   */
  private step(dt: number): void {
    const bodiesArray = Array.from(this.bodies.values());

    // Update velocities and positions
    for (const body of bodiesArray) {
      if (body.static) continue;

      // Apply acceleration to velocity
      body.velocity.x += body.acceleration.x * dt;
      body.velocity.y += body.acceleration.y * dt;

      // Apply friction
      body.velocity.x *= body.friction;
      body.velocity.y *= body.friction;

      // Update position
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;

      // Reset acceleration for next frame
      body.acceleration.x = 0;
      body.acceleration.y = 0;
    }

    // Check collisions
    for (let i = 0; i < bodiesArray.length; i++) {
      for (let j = i + 1; j < bodiesArray.length; j++) {
        const collision = this.checkCollision(bodiesArray[i], bodiesArray[j]);

        if (collision) {
          // Resolve physics
          this.resolveCollision(collision);

          // Trigger callbacks
          this.triggerCollisionCallbacks(collision);
        }
      }
    }
  }

  /**
   * Trigger collision callbacks
   *
   * @param collision - Collision data
   * @private
   */
  private triggerCollisionCallbacks(collision: Collision): void {
    const catA = collision.bodyA.category;
    const catB = collision.bodyB.category;

    // Check both orderings
    const key1 = `${catA}:${catB}`;
    const key2 = `${catB}:${catA}`;

    const callback1 = this.collisionCallbacks.get(key1);
    const callback2 = this.collisionCallbacks.get(key2);

    if (callback1) callback1(collision);
    if (callback2) {
      // Swap bodies for reverse callback
      callback2({
        bodyA: collision.bodyB,
        bodyB: collision.bodyA,
        normal: { x: -collision.normal.x, y: -collision.normal.y },
        depth: collision.depth,
      });
    }
  }

  /**
   * Get all bodies in category
   *
   * @param category - Category name
   * @returns Array of bodies
   */
  public getBodiesByCategory(category: string): PhysicsBody[] {
    return Array.from(this.bodies.values()).filter(
      (body) => body.category === category
    );
  }

  /**
   * Ray cast (find first body intersecting ray)
   *
   * @param start - Ray start position
   * @param end - Ray end position
   * @param category - Filter by category (optional)
   * @returns First hit body or null
   *
   * @example
   * ```typescript
   * // Check line of sight
   * const hit = physics.raycast(
   *   player.position,
   *   { x: player.position.x + 20, y: player.position.y },
   *   'enemy'
   * );
   *
   * if (hit) {
   *   console.log('Enemy in sight!');
   * }
   * ```
   */
  public raycast(
    start: Position,
    end: Position,
    category?: string
  ): PhysicsBody | null {
    const bodies = category
      ? this.getBodiesByCategory(category)
      : Array.from(this.bodies.values());

    for (const body of bodies) {
      // Simple AABB ray intersection (can be improved)
      if (this.rayIntersectsBox(start, end, body)) {
        return body;
      }
    }

    return null;
  }

  /**
   * Check if ray intersects box
   *
   * @param start - Ray start
   * @param end - Ray end
   * @param body - Body to test
   * @returns True if intersects
   * @private
   */
  private rayIntersectsBox(
    start: Position,
    end: Position,
    body: PhysicsBody
  ): boolean {
    // Simplified ray-AABB intersection
    const bx1 = body.position.x;
    const by1 = body.position.y;
    const bx2 = body.position.x + body.size.width;
    const by2 = body.position.y + body.size.height;

    // Check if either endpoint is inside box
    if (
      (start.x >= bx1 && start.x <= bx2 && start.y >= by1 && start.y <= by2) ||
      (end.x >= bx1 && end.x <= bx2 && end.y >= by1 && end.y <= by2)
    ) {
      return true;
    }

    // TODO: More accurate ray-box intersection
    return false;
  }

  /**
   * Clear all bodies
   */
  public clear(): void {
    this.bodies.clear();
  }
}

export default PhysicsEngine;
