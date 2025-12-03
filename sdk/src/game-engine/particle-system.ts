import { Particle, ANSIColor } from './types';
import { ANSIGraphics } from './graphics';

/**
 * Particle System for visual effects
 */
export class ParticleSystem {
  private socket: any;
  private particles: Particle[] = [];
  private graphics: ANSIGraphics;

  constructor(socket: any, graphics: ANSIGraphics) {
    this.socket = socket;
    this.graphics = graphics;
  }

  /**
   * Add a particle
   */
  addParticle(x: number, y: number, vx: number, vy: number, life: number, char: string, color: ANSIColor): void {
    this.particles.push({
      x, y, vx, vy, life, maxLife: life, char, color,
      ax: 0, ay: 0 // acceleration
    });
  }

  /**
   * Update all particles
   */
  update(deltaTime: number): void {
    this.particles = this.particles.filter(particle => {
      // Update position
      particle.x += particle.vx * deltaTime * 60; // Scale for 60 FPS base
      particle.y += particle.vy * deltaTime * 60;

      // Update velocity
      particle.vx += particle.ax * deltaTime * 60;
      particle.vy += particle.ay * deltaTime * 60;

      // Update life
      particle.life -= deltaTime * 60;

      return particle.life > 0;
    });
  }

  /**
   * Render all particles
   */
  render(): void {
    this.particles.forEach(particle => {
      const alpha = particle.life / particle.maxLife;
      // Simple fading effect
      const color = alpha > 0.5 ? particle.color :
                   alpha > 0.25 ? ANSIColor.BRIGHT_BLACK : ANSIColor.BLACK;

      this.graphics.drawChar(
        Math.round(particle.x),
        Math.round(particle.y),
        particle.char,
        color
      );
    });
  }

  /**
   * Create explosion effect
   */
  createExplosion(x: number, y: number, particleCount: number = 20): void {
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = Math.random() * 3 + 1;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      this.addParticle(x, y, vx, vy, 30, '*', ANSIColor.YELLOW);
    }
  }

  /**
   * Create fire effect
   */
  createFire(x: number, y: number, intensity: number = 10): void {
    for (let i = 0; i < intensity; i++) {
      const vx = (Math.random() - 0.5) * 2;
      const vy = -Math.random() * 2 - 1;
      const chars = ['.', 'o', '*', '#'];
      const char = chars[Math.floor(Math.random() * chars.length)];

      this.addParticle(x, y, vx, vy, 20 + Math.random() * 20, char,
                      Math.random() > 0.5 ? ANSIColor.RED : ANSIColor.YELLOW);
    }
  }

  /**
   * Create starfield effect
   */
  createStarfield(width: number, height: number, starCount: number = 50): void {
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const speed = Math.random() * 2 + 0.5;

      this.addParticle(x, y, -speed, 0, 999999, '.', ANSIColor.WHITE);
    }
  }

  /**
   * Clear all particles
   */
  clear(): void {
    this.particles = [];
  }

  /**
   * Get particle count
   */
  getParticleCount(): number {
    return this.particles.length;
  }
}
