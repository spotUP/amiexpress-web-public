/**
 * Versus Mode AI System
 *
 * Creates AI opponents for CPU Battle mode with their own game engines.
 * Each AI has an independent board visible on minimaps.
 */

import { GameEngine } from '../core/game';
import { AttackManager } from '../network/attack-system';
import { BotPlayer, type BotDifficulty } from './bot-player';
import type { PlayerSettings, Board } from '../core/types';
import type { SoundEngine } from '../audio/sounds';

/**
 * AI opponent with own game engine
 */
export interface AIOpponent {
  id: string;
  name: string;
  engine: GameEngine;
  bot: BotPlayer;
  difficulty: BotDifficulty;
  alive: boolean;
  /**
   * This AI's own attack manager. Without one the engine's attack hooks are
   * dead (both are guarded by `if (this.attackManager)` in core/game.ts):
   * the AI could neither send garbage on its line clears nor receive any -
   * which is why versus garbage never appeared in CPU battles.
   */
  attackManager: AttackManager;
}

/**
 * AI opponent names by difficulty
 */
const AI_NAMES: Record<BotDifficulty, string[]> = {
  1: ['Newbie', 'Rookie', 'Trainee'],
  2: ['Scout', 'Learner', 'Student'],
  3: ['Cadet', 'Apprentice', 'Junior'],
  4: ['Soldier', 'Practitioner', 'Regular'],
  5: ['Sergeant', 'Specialist', 'Veteran'],
  6: ['Captain', 'Professional', 'Elite'],
  7: ['Major', 'Expert', 'Ace'],
  8: ['Colonel', 'Master', 'Legend'],
  9: ['General', 'Grandmaster', 'Titan'],
  10: ['Commander', 'God', 'Supreme'],
};

/**
 * Get random AI name for difficulty
 */
export function getAIName(difficulty: BotDifficulty): string {
  const names = AI_NAMES[difficulty];
  return names[Math.floor(Math.random() * names.length)];
}

/**
 * Versus AI Controller
 *
 * Manages multiple AI opponents for CPU Battle mode
 */
export class VersusAI {
  private opponents: AIOpponent[] = [];

  /**
   * Create AI opponents
   */
  createOpponents(
    count: number,
    difficulty: BotDifficulty,
    settings: PlayerSettings,
    sounds: SoundEngine
  ): AIOpponent[] {
    this.opponents = [];

    for (let i = 0; i < count; i++) {
      // Each AI gets its own attack manager wired into its engine so line
      // clears generate attacks and queued garbage is applied on lock.
      const attackManager = new AttackManager();
      const engine = new GameEngine('versus', settings, sounds, attackManager);

      // Create bot controller for this AI's engine
      const bot = new BotPlayer(difficulty);

      const opponent: AIOpponent = {
        id: `ai-${i + 1}`,
        name: `CPU ${getAIName(difficulty)}`,
        engine,
        bot,
        difficulty,
        alive: true,
        attackManager,
      };

      // Start AI engine
      engine.start();

      this.opponents.push(opponent);
    }

    return this.opponents;
  }

  /**
   * Get all opponents
   */
  getOpponents(): AIOpponent[] {
    return this.opponents;
  }

  /**
   * Update all AI opponents (call each game tick)
   */
  update(deltaTime: number): void {
    for (const opponent of this.opponents) {
      if (!opponent.alive) continue;

      const state = opponent.engine.getState();

      // Check if AI is game over
      if (state.status === 'gameover') {
        opponent.alive = false;
        continue;
      }

      // Update AI engine (physics, gravity, etc.)
      opponent.engine.update(deltaTime);

      // Update bot AI (make moves)
      opponent.bot.update(deltaTime, opponent.engine);
    }
  }

  /**
   * Get opponent boards for minimap display
   */
  getOpponentBoards(): Array<{ id: string; name: string; board: Board; alive: boolean }> {
    return this.opponents.map(opponent => ({
      id: opponent.id,
      name: opponent.name,
      board: opponent.engine.getState().board,
      alive: opponent.alive,
    }));
  }

  /**
   * Check if all AI opponents are dead
   */
  allDead(): boolean {
    return this.opponents.every(o => !o.alive);
  }

  /**
   * Cleanup AI opponents
   */
  destroy(): void {
    for (const opponent of this.opponents) {
      // Engines will be garbage collected
      opponent.alive = false;
    }
    this.opponents = [];
  }
}
