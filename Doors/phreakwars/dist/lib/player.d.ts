/**
 * PhreakWars Player Management Module
 *
 * Handles player creation, stats, inventory, achievements, and daily limits.
 */
import { Socket } from 'socket.io';
import { PhreakWarsGameState, DAILY_LIMITS } from './types';
export declare const gameStates: Map<string, PhreakWarsGameState>;
/**
 * Create new game state for player
 */
export declare function createNewGameState(): PhreakWarsGameState;
/**
 * Update player skill level based on individual skills
 */
export declare function updateSkillLevel(gameState: PhreakWarsGameState): void;
/**
 * Calculate overall game progress (0-100)
 */
export declare function calculateGameProgress(gameState: PhreakWarsGameState): number;
/**
 * Update achievements based on skill level
 */
export declare function updateAchievements(gameState: PhreakWarsGameState): void;
/**
 * Get next achievement milestone
 */
export declare function getNextMilestone(gameState: PhreakWarsGameState): string;
/**
 * Check and reset daily limits if a new day has started
 */
export declare function checkAndResetDailyLimits(gameState: PhreakWarsGameState): void;
/**
 * Check if player has reached daily limit for an action
 */
export declare function checkDailyLimit(gameState: PhreakWarsGameState, limitType: keyof typeof DAILY_LIMITS, currentCount: number): boolean;
/**
 * Display daily limits status
 */
export declare function displayDailyLimits(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Delete player and create new one
 */
export declare function deletePlayer(userId: string): PhreakWarsGameState;
