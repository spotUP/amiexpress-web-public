import { PhysicsObject, Platform } from './types';
import { CollisionSystem } from './collision';

/**
 * Platformer Physics system for side-scrolling games
 */
export class PlatformerPhysics {
  private gravity: number;
  private terminalVelocity: number;
  private jumpForce: number;
  private moveSpeed: number;
  private friction: number;

  constructor(options?: {
    gravity?: number;
    terminalVelocity?: number;
    jumpForce?: number;
    moveSpeed?: number;
    friction?: number;
  }) {
    this.gravity = options?.gravity || 0.5;
    this.terminalVelocity = options?.terminalVelocity || 10;
    this.jumpForce = options?.jumpForce || -12;
    this.moveSpeed = options?.moveSpeed || 3;
    this.friction = options?.friction || 0.8;
  }

  /**
   * Apply physics to a game object
   */
  applyPhysics(obj: PhysicsObject, deltaTime: number, platforms: Platform[]): void {
    // Apply gravity
    if (!obj.onGround) {
      obj.velocityY = Math.min(obj.velocityY + this.gravity * deltaTime * 60, this.terminalVelocity);
    }

    // Apply horizontal movement
    obj.velocityX *= this.friction;

    // Update position
    obj.x += obj.velocityX * deltaTime * 60;
    obj.y += obj.velocityY * deltaTime * 60;

    // Check platform collisions
    obj.onGround = false;
    for (const platform of platforms) {
      const collision = CollisionSystem.getCollisionSide(
        obj.x, obj.y, obj.width, obj.height,
        platform.x, platform.y, platform.width, platform.height
      );

      if (collision) {
        switch (collision) {
          case 'top':
            if (obj.velocityY > 0) { // Falling down
              obj.y = platform.y - obj.height;
              obj.velocityY = 0;
              obj.onGround = true;
            }
            break;
          case 'bottom':
            if (obj.velocityY < 0) { // Moving up
              obj.y = platform.y + platform.height;
              obj.velocityY = 0;
            }
            break;
          case 'left':
            if (obj.velocityX > 0) { // Moving right
              obj.x = platform.x - obj.width;
              obj.velocityX = 0;
            }
            break;
          case 'right':
            if (obj.velocityX < 0) { // Moving left
              obj.x = platform.x + platform.width;
              obj.velocityX = 0;
            }
            break;
        }
      }
    }

    // Keep object in bounds
    obj.x = Math.max(0, Math.min(obj.x, 80 - obj.width));
    obj.y = Math.max(0, obj.y);
  }

  /**
   * Make object jump
   */
  jump(obj: PhysicsObject): void {
    if (obj.onGround) {
      obj.velocityY = this.jumpForce;
      obj.onGround = false;
    }
  }

  /**
   * Move object horizontally
   */
  move(obj: PhysicsObject, direction: number): void {
    obj.velocityX = direction * this.moveSpeed;
  }

  /**
   * Check if object can jump
   */
  canJump(obj: PhysicsObject): boolean {
    return obj.onGround;
  }
}
