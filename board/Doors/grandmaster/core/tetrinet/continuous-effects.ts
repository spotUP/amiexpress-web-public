/**
 * TetriNET Continuous Effects Manager
 *
 * Manages timed effects that last for a duration or piece count:
 * - Immunity: Protected from specials for 5 seconds
 * - Darkness: Piece preview hidden for 5 seconds
 * - Confusion: Left/right controls reversed for 5 seconds
 * - Mutation: Next 5 pieces are randomized
 */

import type { SpecialType } from './specials';
import { SPECIALS } from './specials';

/**
 * Active continuous effect
 */
export interface ActiveEffect {
  type: SpecialType;
  startTime: number;         // When effect started (ms timestamp)
  duration: number;          // Duration in ms (5000 for timed effects)
  piecesRemaining?: number;  // For Mutation (5 pieces)
  sourcePlayerId?: string;   // Who sent the effect
}

/**
 * Continuous effect types
 */
export type ContinuousEffectType = 'immunity' | 'darkness' | 'confusion' | 'mutation';

/**
 * Check if a special type is a continuous effect
 */
export function isContinuousEffect(type: SpecialType): type is ContinuousEffectType {
  return type === 'immunity' || type === 'darkness' || type === 'confusion' || type === 'mutation';
}

/**
 * Manager for continuous effects
 */
export class ContinuousEffectManager {
  private activeEffects: Map<ContinuousEffectType, ActiveEffect> = new Map();
  private onEffectStartCallbacks: Array<(type: ContinuousEffectType) => void> = [];
  private onEffectEndCallbacks: Array<(type: ContinuousEffectType) => void> = [];

  /**
   * Start a continuous effect
   */
  startEffect(type: ContinuousEffectType, sourcePlayerId?: string): void {
    const special = SPECIALS[type];

    const effect: ActiveEffect = {
      type,
      startTime: Date.now(),
      duration: special.duration,
      sourcePlayerId,
    };

    // Mutation uses piece count instead of time
    if (type === 'mutation') {
      effect.piecesRemaining = special.pieceCount;  // 5 pieces
    }

    // Replace existing effect of same type (reset timer)
    this.activeEffects.set(type, effect);

    // Notify callbacks
    for (const callback of this.onEffectStartCallbacks) {
      callback(type);
    }
  }

  /**
   * End a continuous effect early
   */
  endEffect(type: ContinuousEffectType): void {
    if (this.activeEffects.has(type)) {
      this.activeEffects.delete(type);

      // Notify callbacks
      for (const callback of this.onEffectEndCallbacks) {
        callback(type);
      }
    }
  }

  /**
   * Update effects (call every frame)
   * Returns array of effects that just ended
   */
  update(): ContinuousEffectType[] {
    const endedEffects: ContinuousEffectType[] = [];
    const now = Date.now();

    for (const [type, effect] of this.activeEffects) {
      // Check if time-based effect has expired
      if (effect.duration > 0) {
        const elapsed = now - effect.startTime;
        if (elapsed >= effect.duration) {
          endedEffects.push(type);
        }
      }

      // Mutation with no pieces remaining
      if (type === 'mutation' && effect.piecesRemaining !== undefined && effect.piecesRemaining <= 0) {
        endedEffects.push(type);
      }
    }

    // Remove ended effects
    for (const type of endedEffects) {
      this.activeEffects.delete(type);

      // Notify callbacks
      for (const callback of this.onEffectEndCallbacks) {
        callback(type);
      }
    }

    return endedEffects;
  }

  /**
   * Called when a piece is placed (for Mutation counter)
   */
  onPiecePlaced(): void {
    const mutation = this.activeEffects.get('mutation');
    if (mutation && mutation.piecesRemaining !== undefined) {
      mutation.piecesRemaining--;
    }
  }

  /**
   * Check if an effect is currently active
   */
  isActive(type: ContinuousEffectType): boolean {
    return this.activeEffects.has(type);
  }

  /**
   * Check if player has immunity (blocks incoming specials)
   */
  hasImmunity(): boolean {
    return this.isActive('immunity');
  }

  /**
   * Check if player has darkness (hides preview)
   */
  hasDarkness(): boolean {
    return this.isActive('darkness');
  }

  /**
   * Check if player has confusion (reversed controls)
   */
  hasConfusion(): boolean {
    return this.isActive('confusion');
  }

  /**
   * Check if player has mutation (randomized pieces)
   */
  hasMutation(): boolean {
    return this.isActive('mutation');
  }

  /**
   * Get remaining time for an effect (ms)
   */
  getTimeRemaining(type: ContinuousEffectType): number {
    const effect = this.activeEffects.get(type);
    if (!effect || effect.duration === 0) {
      return 0;
    }

    const elapsed = Date.now() - effect.startTime;
    return Math.max(0, effect.duration - elapsed);
  }

  /**
   * Get remaining pieces for Mutation
   */
  getMutationRemaining(): number {
    const mutation = this.activeEffects.get('mutation');
    return mutation?.piecesRemaining ?? 0;
  }

  /**
   * Get all active effects
   */
  getActiveEffects(): ActiveEffect[] {
    return Array.from(this.activeEffects.values());
  }

  /**
   * Get active effect types
   */
  getActiveEffectTypes(): ContinuousEffectType[] {
    return Array.from(this.activeEffects.keys());
  }

  /**
   * Clear all effects
   */
  clearAll(): void {
    const types = this.getActiveEffectTypes();
    this.activeEffects.clear();

    for (const type of types) {
      for (const callback of this.onEffectEndCallbacks) {
        callback(type);
      }
    }
  }

  /**
   * Register callback for when effect starts
   */
  onEffectStart(callback: (type: ContinuousEffectType) => void): () => void {
    this.onEffectStartCallbacks.push(callback);
    return () => {
      const index = this.onEffectStartCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onEffectStartCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register callback for when effect ends
   */
  onEffectEnd(callback: (type: ContinuousEffectType) => void): () => void {
    this.onEffectEndCallbacks.push(callback);
    return () => {
      const index = this.onEffectEndCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onEffectEndCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get display string for active effects
   */
  getDisplay(): string {
    const parts: string[] = [];

    if (this.hasImmunity()) {
      const remaining = Math.ceil(this.getTimeRemaining('immunity') / 1000);
      parts.push(`{white-fg}IMMUNE(${remaining}s){/white-fg}`);
    }

    if (this.hasDarkness()) {
      const remaining = Math.ceil(this.getTimeRemaining('darkness') / 1000);
      parts.push(`{black-bg}{white-fg}DARK(${remaining}s){/white-fg}{/black-bg}`);
    }

    if (this.hasConfusion()) {
      const remaining = Math.ceil(this.getTimeRemaining('confusion') / 1000);
      parts.push(`{magenta-fg}CONFUSED(${remaining}s){/magenta-fg}`);
    }

    if (this.hasMutation()) {
      const remaining = this.getMutationRemaining();
      parts.push(`{green-fg}MUTATED(${remaining}pc){/green-fg}`);
    }

    return parts.join(' ');
  }

  /**
   * Serialize state
   */
  getState(): ActiveEffect[] {
    return this.getActiveEffects();
  }

  /**
   * Load state
   */
  loadState(effects: ActiveEffect[]): void {
    this.activeEffects.clear();
    for (const effect of effects) {
      if (isContinuousEffect(effect.type)) {
        this.activeEffects.set(effect.type, effect);
      }
    }
  }
}
