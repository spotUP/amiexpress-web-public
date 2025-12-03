import { Sprite } from './sprite';
import { ANSIGraphics } from './graphics';

/**
 * Sprite Manager for handling multiple sprites
 */
export class SpriteManager {
  private sprites: Sprite[];
  private graphics: ANSIGraphics;

  constructor(graphics: ANSIGraphics) {
    this.sprites = [];
    this.graphics = graphics;
  }

  /**
   * Add sprite to manager
   */
  addSprite(sprite: Sprite): void {
    this.sprites.push(sprite);
  }

  /**
   * Remove sprite from manager
   */
  removeSprite(sprite: Sprite): void {
    const index = this.sprites.indexOf(sprite);
    if (index !== -1) {
      this.sprites.splice(index, 1);
    }
  }

  /**
   * Update all sprites
   */
  update(deltaTime: number): void {
    this.sprites.forEach(sprite => sprite.update(deltaTime));
  }

  /**
   * Render all sprites
   */
  render(): void {
    this.sprites.forEach(sprite => sprite.render(this.graphics));
  }

  /**
   * Get all sprites
   */
  getSprites(): Sprite[] {
    return [...this.sprites];
  }

  /**
   * Clear all sprites
   */
  clear(): void {
    this.sprites = [];
  }
}
