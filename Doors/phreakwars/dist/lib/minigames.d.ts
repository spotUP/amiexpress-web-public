/**
 * PhreakWars Minigames Module
 *
 * All interactive minigame logic for skill development.
 */
import { Socket } from 'socket.io';
import { PhreakWarsGameState, MinigameType } from './types';
/**
 * Start a text-based minigame for the player
 */
export declare function startTextMinigame(socket: Socket, gameState: PhreakWarsGameState, gameType: MinigameType): void;
/**
 * Handle text-based minigame input
 */
export declare function handleTextMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
