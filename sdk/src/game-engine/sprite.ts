import { ANSIColor } from './types';
import { ANSIGraphics } from './graphics';

/**
 * Sprite class for animated game objects
 */
export class Sprite {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public frames: string[][];
  public currentFrame: number;
  public animationSpeed: number;
  public animationTimer: number;
  public visible: boolean;
  public color: ANSIColor;

  constructor(x: number, y: number, frames: string[][], animationSpeed: number = 0.2) {
    this.x = x;
    this.y = y;
    this.frames = frames;

    // Safe width/height calculation with proper null checks
    if (frames && frames.length > 0 && frames[0] && frames[0].length > 0 && frames[0][0]) {
      this.width = frames[0][0].length || 1;
      this.height = frames[0].length || 1;
    } else {
      this.width = 1;
      this.height = 1;
    }

    this.currentFrame = 0;
    this.animationSpeed = animationSpeed;
    this.animationTimer = 0;
    this.visible = true;
    this.color = ANSIColor.WHITE;
  }

  /**
   * Update animation
   */
  update(deltaTime: number): void {
    if (this.frames.length > 1) {
      this.animationTimer += deltaTime;
      if (this.animationTimer >= this.animationSpeed) {
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        this.animationTimer = 0;
      }
    }
  }

  /**
   * Render sprite
   */
  render(graphics: ANSIGraphics): void {
    if (!this.visible) return;

    const frame = this.frames[this.currentFrame];
    for (let row = 0; row < frame.length; row++) {
      for (let col = 0; col < frame[row].length; col++) {
        const char = frame[row][col];
        if (char !== ' ') { // Don't render spaces
          graphics.drawChar(this.x + col, this.y + row, char, this.color);
        }
      }
    }
  }

  /**
   * Set animation frames
   */
  setFrames(frames: string[][]): void {
    this.frames = frames;

    // Safe width/height calculation with proper null checks
    if (frames && frames.length > 0 && frames[0] && frames[0].length > 0 && frames[0][0]) {
      this.width = frames[0][0].length || 1;
      this.height = frames[0].length || 1;
    } else {
      this.width = 1;
      this.height = 1;
    }

    this.currentFrame = 0;
  }

  /**
   * Check collision with another sprite
   */
  collidesWith(other: Sprite): boolean {
    return this.x < other.x + other.width &&
           this.x + this.width > other.x &&
           this.y < other.y + other.height &&
           this.y + this.height > other.y;
  }
}
