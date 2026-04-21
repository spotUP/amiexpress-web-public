/**
 * Versus Mode AI System
 *
 * Creates AI opponents for CPU Battle mode with their own game engines.
 * Each AI has an independent board visible on minimaps.
 */
import { GameEngine } from '../core/game';
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
}
/**
 * Get random AI name for difficulty
 */
export declare function getAIName(difficulty: BotDifficulty): string;
/**
 * Versus AI Controller
 *
 * Manages multiple AI opponents for CPU Battle mode
 */
export declare class VersusAI {
    private opponents;
    /**
     * Create AI opponents
     */
    createOpponents(count: number, difficulty: BotDifficulty, settings: PlayerSettings, sounds: SoundEngine): AIOpponent[];
    /**
     * Get all opponents
     */
    getOpponents(): AIOpponent[];
    /**
     * Update all AI opponents (call each game tick)
     */
    update(deltaTime: number): void;
    /**
     * Get opponent boards for minimap display
     */
    getOpponentBoards(): Array<{
        id: string;
        name: string;
        board: Board;
        alive: boolean;
    }>;
    /**
     * Check if all AI opponents are dead
     */
    allDead(): boolean;
    /**
     * Cleanup AI opponents
     */
    destroy(): void;
}
//# sourceMappingURL=versus-ai.d.ts.map