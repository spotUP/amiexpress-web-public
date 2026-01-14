/**
 * Line Clear Tile Animation System
 *
 * Implements tile-by-tile line clear animations with 4 styles:
 * - Inward: Collapse from edges to center
 * - Outward: Explode from center to edges
 * - Instant: No animation, immediate clear
 * - Directional: Toggleable IN/OUT direction
 *
 * The animation defers actual line clearing until completion (20 frames = 333ms at 60 FPS).
 */

export type ClearStyle = 'inward' | 'outward' | 'instant' | 'directional';
export type ClearDirection = 'in' | 'out';

export interface LineClearAnimation {
  lines: number[];                    // Y positions being cleared
  style: ClearStyle;
  timer: number;                      // 0-20 frames
  maxTimer: number;                   // 20 frames (333ms at 60 FPS)
  direction: ClearDirection;          // For directional mode
  cellStates: Map<string, number>;    // "x,y" -> fade progress (0-1)
  speedMultiplier: number;            // Animation speed multiplier (0.5-2.0)
}

/**
 * Line Clear Animation Manager
 *
 * Manages tile-by-tile line clear animations with deferred line clearing.
 * The game engine should check if animation is active and call update() each frame.
 */
export class LineClearAnimationManager {
  private animation: LineClearAnimation | null = null;
  private readonly BOARD_WIDTH = 10;
  private enabled: boolean = true;

  /**
   * Enable or disable line clear animations
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.animation = null;
    }
  }

  /**
   * Start line clear animation
   *
   * @param lines - Array of Y positions being cleared
   * @param style - Animation style
   * @param direction - Direction for 'directional' style (default: 'in')
   * @param speedMultiplier - Speed multiplier (0.5=slow, 1.0=normal, 2.0=fast)
   */
  startClearAnimation(
    lines: number[],
    style: ClearStyle,
    direction: ClearDirection = 'in',
    speedMultiplier: number = 1.0
  ): void {
    if (!this.enabled || style === 'instant') {
      // Skip animation for instant style or when disabled
      this.animation = null;
      return;
    }

    const maxTimer = Math.ceil(20 / speedMultiplier);

    this.animation = {
      lines,
      style,
      timer: 0,
      maxTimer,
      direction,
      cellStates: new Map(),
      speedMultiplier
    };

    // Initialize cell states
    for (const y of lines) {
      for (let x = 0; x < this.BOARD_WIDTH; x++) {
        const key = `${x},${y}`;
        this.animation.cellStates.set(key, 0); // Start at fade = 0 (fully visible)
      }
    }
  }

  /**
   * Update animation state
   *
   * Call this every frame (60 FPS). Returns true when animation completes.
   *
   * @param deltaTime - Time since last update in milliseconds
   * @returns true if animation completed this frame
   */
  update(deltaTime: number): boolean {
    if (!this.animation) return true;

    // Convert deltaTime (ms) to frames at 60 FPS
    const deltaFrames = (deltaTime / 1000) * 60;
    this.animation.timer += deltaFrames;

    // Calculate progress (0-1)
    const progress = Math.min(1, this.animation.timer / this.animation.maxTimer);

    // Update cell fade states based on animation style
    for (const y of this.animation.lines) {
      for (let x = 0; x < this.BOARD_WIDTH; x++) {
        const key = `${x},${y}`;
        const fade = this.calculateFade(x, y, progress);
        this.animation.cellStates.set(key, fade);
      }
    }

    // Check if animation complete
    if (this.animation.timer >= this.animation.maxTimer) {
      this.animation = null;
      return true;
    }

    return false;
  }

  /**
   * Get fade progress for a specific cell
   *
   * @param x - Cell X position
   * @param y - Cell Y position
   * @returns Fade progress (0=visible, 1=cleared)
   */
  getCellFade(x: number, y: number): number {
    if (!this.animation) return 0;

    const key = `${x},${y}`;
    return this.animation.cellStates.get(key) || 0;
  }

  /**
   * Check if cell should render during animation
   *
   * @param x - Cell X position
   * @param y - Cell Y position
   * @returns true if cell should be rendered
   */
  shouldRenderCell(x: number, y: number): boolean {
    if (!this.animation) return true;

    // Check if this Y position is being animated
    if (!this.animation.lines.includes(y)) return true;

    // Check fade progress
    const fade = this.getCellFade(x, y);
    return fade < 1.0; // Only render if not fully faded
  }

  /**
   * Check if animation is currently active
   */
  isActive(): boolean {
    return this.animation !== null;
  }

  /**
   * Get current animation style (for debugging/UI)
   */
  getCurrentStyle(): ClearStyle | null {
    return this.animation?.style || null;
  }

  /**
   * Clear animation (force stop)
   */
  clear(): void {
    this.animation = null;
  }

  /**
   * Calculate fade progress for a cell based on animation style
   *
   * @param x - Cell X position
   * @param y - Cell Y position
   * @param progress - Global animation progress (0-1)
   * @returns Fade progress (0=visible, 1=cleared)
   */
  private calculateFade(x: number, y: number, progress: number): number {
    if (!this.animation) return 0;

    switch (this.animation.style) {
      case 'inward':
        return this.calculateInwardFade(x, progress);
      case 'outward':
        return this.calculateOutwardFade(x, progress);
      case 'directional':
        return this.calculateDirectionalFade(x, progress, this.animation.direction);
      case 'instant':
        return 1; // Should not reach here, but handle anyway
      default:
        return progress; // Fallback: linear fade
    }
  }

  /**
   * Inward collapse animation
   *
   * Cells closer to the center fade first, creating a collapse effect.
   */
  private calculateInwardFade(x: number, progress: number): number {
    const centerX = (this.BOARD_WIDTH - 1) / 2; // 4.5 for width 10
    const distanceFromCenter = Math.abs(x - centerX);

    // Delay based on distance (cells closer to center fade first)
    const delay = distanceFromCenter / this.BOARD_WIDTH;

    // Fade with staggered timing
    return Math.max(0, Math.min(1, (progress - delay) / 0.5));
  }

  /**
   * Outward explosion animation
   *
   * Cells at the edges fade first, creating an explosion effect.
   */
  private calculateOutwardFade(x: number, progress: number): number {
    const centerX = (this.BOARD_WIDTH - 1) / 2;
    const distanceFromCenter = Math.abs(x - centerX);

    // Delay based on distance (edges fade first)
    const maxDistance = this.BOARD_WIDTH / 2;
    const delay = (maxDistance - distanceFromCenter) / this.BOARD_WIDTH;

    // Fade with staggered timing
    return Math.max(0, Math.min(1, (progress - delay) / 0.5));
  }

  /**
   * Directional animation (toggleable IN/OUT)
   *
   * @param x - Cell X position
   * @param progress - Global animation progress
   * @param direction - 'in' for inward, 'out' for outward
   */
  private calculateDirectionalFade(x: number, progress: number, direction: ClearDirection): number {
    if (direction === 'in') {
      return this.calculateInwardFade(x, progress);
    } else {
      return this.calculateOutwardFade(x, progress);
    }
  }

  /**
   * Apply fade effect to cell character
   *
   * This is a helper for rendering - can be called from UI layer.
   *
   * @param baseChar - Base character (e.g., '██' with color tags)
   * @param fade - Fade progress (0-1)
   * @returns Faded character with appropriate styling
   */
  static applyFade(baseChar: string, fade: number): string {
    // fade 0.0 = solid, 0.5 = medium, 1.0 = invisible

    if (fade < 0.33) {
      return baseChar; // Solid
    } else if (fade < 0.66) {
      // Extract color and apply medium fade
      const color = this.extractColor(baseChar);
      return `{${color}-fg}▒▒{/${color}-fg}`;
    } else {
      // Extract color and apply light fade
      const color = this.extractColor(baseChar);
      return `{${color}-fg}░░{/${color}-fg}`;
    }
  }

  /**
   * Extract color from blessed-tagged string
   *
   * Example: "{cyan-fg}██{/cyan-fg}" → "cyan"
   */
  private static extractColor(taggedString: string): string {
    const match = taggedString.match(/\{([a-z]+)-fg\}/);
    return match ? match[1] : 'white';
  }
}
