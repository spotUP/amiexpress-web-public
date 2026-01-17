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
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    char: string;
    color: string;
    gravity: number;
    friction: number;
    fadeOut: boolean;
    trail: boolean;
}
/**
 * Particle preset configuration
 */
export interface ParticlePreset {
    count: number;
    spread: {
        x: number;
        y: number;
    };
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
export declare const PARTICLE_PRESETS: Record<string, ParticlePreset>;
/**
 * Particle system manager
 */
export declare class ParticleSystem {
    private particles;
    private enabled;
    private maxParticles;
    /**
     * Spawn particles from a preset
     */
    spawn(preset: keyof typeof PARTICLE_PRESETS, x: number, y: number): void;
    /**
     * Create a single particle from config
     */
    private createParticle;
    /**
     * Update all particles
     */
    update(deltaTime: number): void;
    /**
     * Get all active particles
     */
    getParticles(): Particle[];
    /**
     * Get particles for rendering (with alpha based on life)
     */
    getRenderableParticles(): Array<Particle & {
        alpha: number;
    }>;
    /**
     * Clear all particles
     */
    clear(): void;
    /**
     * Enable/disable particle system
     */
    setEnabled(enabled: boolean): void;
    /**
     * Check if enabled
     */
    isEnabled(): boolean;
    /**
     * Set maximum particle count
     */
    setMaxParticles(max: number): void;
    /**
     * Get current particle count
     */
    getParticleCount(): number;
}
//# sourceMappingURL=particles.d.ts.map