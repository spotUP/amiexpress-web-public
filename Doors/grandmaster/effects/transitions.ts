/**
 * Screen Transition System
 *
 * Provides fade, wipe, and slide transitions between screens
 */

/**
 * Transition types
 */
export type TransitionType = 'fade' | 'wipe' | 'slide' | 'none';

/**
 * Transition direction (for wipe/slide)
 */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Transition configuration
 */
export interface TransitionConfig {
  type: TransitionType;
  duration: number;           // Milliseconds
  direction?: TransitionDirection;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/**
 * Transition presets
 */
export const TRANSITION_PRESETS: Record<string, TransitionConfig> = {
  // Quick fade for mode changes
  quickFade: {
    type: 'fade',
    duration: 200,
    easing: 'ease-out',
  },

  // Slow fade for dramatic moments
  slowFade: {
    type: 'fade',
    duration: 500,
    easing: 'ease-in-out',
  },

  // Wipe for menu transitions
  wipeRight: {
    type: 'wipe',
    duration: 300,
    direction: 'right',
    easing: 'ease-out',
  },

  wipeLeft: {
    type: 'wipe',
    duration: 300,
    direction: 'left',
    easing: 'ease-out',
  },

  // Slide for screen changes
  slideRight: {
    type: 'slide',
    duration: 250,
    direction: 'right',
    easing: 'ease-in-out',
  },

  slideLeft: {
    type: 'slide',
    duration: 250,
    direction: 'left',
    easing: 'ease-in-out',
  },

  // Instant (no transition)
  instant: {
    type: 'none',
    duration: 0,
  },
};

/**
 * Transition instance
 */
export class Transition {
  private elapsed: number = 0;
  private config: TransitionConfig;
  private direction: 'in' | 'out';

  constructor(config: TransitionConfig, direction: 'in' | 'out' = 'out') {
    this.config = config;
    this.direction = direction;
  }

  /**
   * Update transition
   */
  update(deltaTime: number): void {
    this.elapsed += deltaTime;
  }

  /**
   * Get current progress (0-1)
   */
  getProgress(): number {
    if (this.config.duration === 0) {
      return 1;
    }

    const raw = Math.min(this.elapsed / this.config.duration, 1);
    return this.applyEasing(raw);
  }

  /**
   * Apply easing function to progress
   */
  private applyEasing(t: number): number {
    switch (this.config.easing) {
      case 'ease-in':
        return t * t;

      case 'ease-out':
        return t * (2 - t);

      case 'ease-in-out':
        return t < 0.5
          ? 2 * t * t
          : -1 + (4 - 2 * t) * t;

      case 'linear':
      default:
        return t;
    }
  }

  /**
   * Get fade alpha (0-1)
   */
  getFadeAlpha(): number {
    const progress = this.getProgress();
    return this.direction === 'out' ? progress : 1 - progress;
  }

  /**
   * Get wipe position (0-100, percentage of screen)
   */
  getWipePosition(): number {
    const progress = this.getProgress();
    return this.direction === 'out' ? progress * 100 : (1 - progress) * 100;
  }

  /**
   * Get slide offset (pixels)
   */
  getSlideOffset(screenWidth: number, screenHeight: number): { x: number; y: number } {
    const progress = this.getProgress();
    const direction = this.config.direction || 'right';

    let x = 0;
    let y = 0;

    switch (direction) {
      case 'left':
        x = this.direction === 'out'
          ? -screenWidth * progress
          : screenWidth * (1 - progress);
        break;

      case 'right':
        x = this.direction === 'out'
          ? screenWidth * progress
          : -screenWidth * (1 - progress);
        break;

      case 'up':
        y = this.direction === 'out'
          ? -screenHeight * progress
          : screenHeight * (1 - progress);
        break;

      case 'down':
        y = this.direction === 'out'
          ? screenHeight * progress
          : -screenHeight * (1 - progress);
        break;
    }

    return { x: Math.round(x), y: Math.round(y) };
  }

  /**
   * Check if transition is complete
   */
  isDone(): boolean {
    return this.elapsed >= this.config.duration;
  }

  /**
   * Get transition type
   */
  getType(): TransitionType {
    return this.config.type;
  }

  /**
   * Get transition direction
   */
  getDirection(): 'in' | 'out' {
    return this.direction;
  }
}

/**
 * Transition manager
 */
export class TransitionManager {
  private currentTransition: Transition | null = null;
  private onComplete: (() => void) | null = null;

  /**
   * Start a transition
   */
  start(
    preset: keyof typeof TRANSITION_PRESETS,
    direction: 'in' | 'out' = 'out',
    onComplete?: () => void
  ): void {
    const config = TRANSITION_PRESETS[preset];
    if (!config) return;

    this.currentTransition = new Transition(config, direction);
    this.onComplete = onComplete || null;
  }

  /**
   * Start a custom transition
   */
  startCustom(
    config: TransitionConfig,
    direction: 'in' | 'out' = 'out',
    onComplete?: () => void
  ): void {
    this.currentTransition = new Transition(config, direction);
    this.onComplete = onComplete || null;
  }

  /**
   * Update current transition
   */
  update(deltaTime: number): void {
    if (!this.currentTransition) return;

    this.currentTransition.update(deltaTime);

    if (this.currentTransition.isDone()) {
      if (this.onComplete) {
        this.onComplete();
      }
      this.currentTransition = null;
      this.onComplete = null;
    }
  }

  /**
   * Get current transition
   */
  getTransition(): Transition | null {
    return this.currentTransition;
  }

  /**
   * Check if transitioning
   */
  isTransitioning(): boolean {
    return this.currentTransition !== null;
  }

  /**
   * Stop current transition
   */
  stop(): void {
    this.currentTransition = null;
    this.onComplete = null;
  }
}
