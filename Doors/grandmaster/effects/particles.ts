/**
 * Particle Explosion System
 *
 * Creates particle effects for line clears, Tetris, perfect clears, etc.
 */

/**
 * Single particle
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;          // Velocity X
  vy: number;          // Velocity Y
  life: number;        // Current life (frames)
  maxLife: number;     // Maximum life (frames)
  char: string;        // Display character
  color: string;       // ANSI color
  gravity: number;     // Gravity acceleration
  friction: number;    // Friction multiplier (0.9 = 90% speed retained)
  fadeOut: boolean;    // Fade as life decreases
  trail: boolean;      // Leave trail behind
}

/**
 * Particle preset configuration
 */
export interface ParticlePreset {
  count: number;
  spread: { x: number; y: number };
  speed: number;
  life: number;
  chars: string[];
  colors: string[];
  gravity: number;
  friction: number;
  trail?: boolean;
  fadeOut?: boolean;
}

/**
 * Particle effect presets
 */
export const PARTICLE_PRESETS: Record<string, ParticlePreset> = {
  // Line clear - horizontal burst
  lineClear: {
    count: 20,
    spread: { x: 3, y: 0.5 },
    speed: 4,
    life: 15,
    chars: ['█', '▓', '▒', '░'],
    colors: ['white', 'cyan', 'blue'],
    gravity: 0.1,
    friction: 0.95,
    fadeOut: true,
  },

  // Tetris - massive explosion
  tetris: {
    count: 80,
    spread: { x: 5, y: 3 },
    speed: 6,
    life: 30,
    chars: ['█', '▓', '▒', '░', '●', '○', '◆', '◇'],
    colors: ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'],
    gravity: 0.15,
    friction: 0.92,
    trail: true,
    fadeOut: true,
  },

  // Perfect Clear - screen-filling celebration
  perfectClear: {
    count: 200,
    spread: { x: 20, y: 10 },
    speed: 8,
    life: 60,
    chars: ['█', '▓', '●', '○', '★', '☆', '◆'],
    colors: ['yellow', 'white', 'cyan', 'magenta'],
    gravity: 0.05,
    friction: 0.98,
    trail: true,
    fadeOut: true,
  },

  // Grade up - rising sparkles
  gradeUp: {
    count: 40,
    spread: { x: 2, y: 0 },
    speed: 3,
    life: 40,
    chars: ['●', '○', '◆', '★'],
    colors: ['yellow', 'white', 'cyan'],
    gravity: -0.1,  // Float upward
    friction: 0.99,
    fadeOut: true,
  },

  // T-Spin - spinning particles
  tSpin: {
    count: 30,
    spread: { x: 3, y: 2 },
    speed: 5,
    life: 25,
    chars: ['●', '◆', '▓'],
    colors: ['magenta', 'white', 'yellow'],
    gravity: 0.12,
    friction: 0.93,
    trail: true,
    fadeOut: true,
  },

  // Combo - cascading effect
  combo: {
    count: 15,
    spread: { x: 2, y: 1 },
    speed: 4,
    life: 20,
    chars: ['●', '○'],
    colors: ['cyan', 'white'],
    gravity: 0.08,
    friction: 0.96,
    fadeOut: true,
  },
};

/**
 * Particle system manager
 */
export class ParticleSystem {
  private particles: Particle[] = [];
  private enabled: boolean = true;
  private maxParticles: number = 500;

  /**
   * Spawn particles from a preset
   */
  spawn(preset: keyof typeof PARTICLE_PRESETS, x: number, y: number): void {
    if (!this.enabled) return;

    const config = PARTICLE_PRESETS[preset];
    if (!config) return;

    // Limit total particles
    const availableSlots = this.maxParticles - this.particles.length;
    const spawnCount = Math.min(config.count, availableSlots);

    for (let i = 0; i < spawnCount; i++) {
      this.particles.push(this.createParticle(config, x, y));
    }
  }

  /**
   * Create a single particle from config
   */
  private createParticle(config: ParticlePreset, x: number, y: number): Particle {
    // Random angle and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = config.speed * (0.5 + Math.random() * 0.5);

    // Random velocity within spread
    const vx = Math.cos(angle) * speed * (Math.random() * config.spread.x);
    const vy = Math.sin(angle) * speed * (Math.random() * config.spread.y);

    // Random character and color
    const char = config.chars[Math.floor(Math.random() * config.chars.length)];
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];

    // Random life variation (±20%)
    const life = config.life * (0.8 + Math.random() * 0.4);

    return {
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      char,
      color,
      gravity: config.gravity,
      friction: config.friction,
      fadeOut: config.fadeOut ?? false,
      trail: config.trail ?? false,
    };
  }

  /**
   * Update all particles
   */
  update(deltaTime: number): void {
    const dt = deltaTime / 16; // Normalize to ~60 FPS

    this.particles = this.particles.filter(particle => {
      // Update velocity
      particle.vy += particle.gravity * dt;
      particle.vx *= particle.friction;
      particle.vy *= particle.friction;

      // Update position
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Decrease life
      particle.life -= dt;

      // Remove if dead
      return particle.life > 0;
    });
  }

  /**
   * Get all active particles
   */
  getParticles(): Particle[] {
    return this.particles;
  }

  /**
   * Get particles for rendering (with alpha based on life)
   */
  getRenderableParticles(): Array<Particle & { alpha: number }> {
    return this.particles.map(particle => ({
      ...particle,
      alpha: particle.fadeOut
        ? particle.life / particle.maxLife
        : 1.0,
    }));
  }

  /**
   * Clear all particles
   */
  clear(): void {
    this.particles = [];
  }

  /**
   * Enable/disable particle system
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set maximum particle count
   */
  setMaxParticles(max: number): void {
    this.maxParticles = max;
  }

  /**
   * Get current particle count
   */
  getParticleCount(): number {
    return this.particles.length;
  }
}
