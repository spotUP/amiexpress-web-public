/**
 * Screen Shake Engine
 *
 * Provides dynamic screen shake effects for various game events
 */

/**
 * Shake decay types
 */
export type ShakeDecay = 'linear' | 'exponential' | 'bounce';

/**
 * Shake direction
 */
export type ShakeDirection = 'horizontal' | 'vertical' | 'circular' | 'random';

/**
 * Shake configuration
 */
export interface ShakeConfig {
  intensity: number;      // Pixels of displacement (1-8)
  duration: number;       // Milliseconds
  decay: ShakeDecay;
  direction: ShakeDirection;
}

/**
 * Shake presets for common events
 */
export const SHAKE_PRESETS: Record<string, ShakeConfig> = {
  // Subtle feedback
  pieceLock: {
    intensity: 1,
    duration: 50,
    decay: 'linear',
    direction: 'vertical',
  },

  // Medium impact
  lineClear: {
    intensity: 2,
    duration: 100,
    decay: 'exponential',
    direction: 'horizontal',
  },

  // Heavy impact
  tetris: {
    intensity: 4,
    duration: 200,
    decay: 'bounce',
    direction: 'circular',
  },

  // Devastating
  perfectClear: {
    intensity: 6,
    duration: 400,
    decay: 'bounce',
    direction: 'random',
  },

  // Incoming attack
  garbageReceive: {
    intensity: 3,
    duration: 150,
    decay: 'exponential',
    direction: 'vertical',
  },

  // Critical moment
  topOut: {
    intensity: 8,
    duration: 600,
    decay: 'exponential',
    direction: 'random',
  },
};

/**
 * Active shake instance
 */
class ShakeInstance {
  private elapsed: number = 0;
  private config: ShakeConfig;
  private phase: number = 0;

  constructor(config: ShakeConfig) {
    this.config = config;
    this.phase = Math.random() * Math.PI * 2; // Random start phase
  }

  /**
   * Update shake and return current offset
   */
  update(deltaTime: number): { x: number; y: number } {
    this.elapsed += deltaTime;

    if (this.isDone()) {
      return { x: 0, y: 0 };
    }

    const progress = this.elapsed / this.config.duration;
    const amplitude = this.getAmplitude(progress);

    return this.getOffset(amplitude, progress);
  }

  /**
   * Calculate amplitude based on decay type
   */
  private getAmplitude(progress: number): number {
    const intensity = this.config.intensity;

    switch (this.config.decay) {
      case 'linear':
        return intensity * (1 - progress);

      case 'exponential':
        return intensity * Math.pow(1 - progress, 2);

      case 'bounce': {
        // Damped oscillation
        const freq = 4; // Number of bounces
        const dampening = Math.pow(1 - progress, 2);
        const oscillation = Math.cos(progress * Math.PI * freq);
        return intensity * dampening * oscillation;
      }

      default:
        return intensity * (1 - progress);
    }
  }

  /**
   * Calculate offset based on direction
   */
  private getOffset(amplitude: number, progress: number): { x: number; y: number } {
    const time = this.elapsed / 16; // ~60 FPS time step
    const phase = this.phase;

    switch (this.config.direction) {
      case 'horizontal':
        return {
          x: amplitude * Math.sin(time + phase),
          y: 0,
        };

      case 'vertical':
        return {
          x: 0,
          y: amplitude * Math.sin(time + phase),
        };

      case 'circular': {
        const angle = time + phase;
        return {
          x: amplitude * Math.cos(angle),
          y: amplitude * Math.sin(angle),
        };
      }

      case 'random': {
        // Perlin-like noise
        const x = amplitude * (Math.random() * 2 - 1);
        const y = amplitude * (Math.random() * 2 - 1);
        return { x, y };
      }

      default:
        return { x: 0, y: 0 };
    }
  }

  /**
   * Check if shake is complete
   */
  isDone(): boolean {
    return this.elapsed >= this.config.duration;
  }
}

/**
 * Screen shake manager
 */
export class ScreenShaker {
  private offsetX: number = 0;
  private offsetY: number = 0;
  private shakeQueue: ShakeInstance[] = [];
  private enabled: boolean = true;

  /**
   * Trigger a shake effect
   */
  shake(preset: keyof typeof SHAKE_PRESETS): void {
    if (!this.enabled) return;

    const config = SHAKE_PRESETS[preset];
    if (config) {
      this.shakeQueue.push(new ShakeInstance(config));
    }
  }

  /**
   * Trigger a custom shake
   */
  shakeCustom(config: ShakeConfig): void {
    if (!this.enabled) return;
    this.shakeQueue.push(new ShakeInstance(config));
  }

  /**
   * Update all active shakes
   */
  update(deltaTime: number): void {
    // Reset offsets
    this.offsetX = 0;
    this.offsetY = 0;

    // Update and combine all active shakes
    this.shakeQueue = this.shakeQueue.filter(shake => {
      const offset = shake.update(deltaTime);
      this.offsetX += offset.x;
      this.offsetY += offset.y;
      return !shake.isDone();
    });
  }

  /**
   * Get current shake offset
   */
  getOffset(): { x: number; y: number } {
    return {
      x: Math.round(this.offsetX),
      y: Math.round(this.offsetY),
    };
  }

  /**
   * Check if currently shaking
   */
  isShaking(): boolean {
    return this.shakeQueue.length > 0;
  }

  /**
   * Stop all shakes immediately
   */
  stop(): void {
    this.shakeQueue = [];
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * Enable/disable shake effects
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Check if shake is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
