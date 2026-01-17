/**
 * PhreakWars Input Handlers Module
 *
 * All input handling logic for game modes.
 */
import { Socket } from 'socket.io';
/** Minimal session interface for door operations */
interface DoorSession {
    user?: {
        id: number;
        username?: string;
    };
    tempData: {
        gameState?: any;
    };
}
import { PhreakWarsGameState } from './types';
export declare const shadowMessageTemplates: {
    subject: string;
    body: string;
    relationshipBoost: number;
    replyChance: number;
    replySubject: string;
    replyBody: string;
}[];
/**
 * Handle main menu input
 */
export declare function handleMainMenu(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle character creation
 */
export declare function handleCharacterCreation(socket: Socket, gameState: PhreakWarsGameState, data: string): void;
/**
 * Handle phreaking input
 */
export declare function handlePhreaking(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle programming input
 */
export declare function handleProgramming(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle trading input
 */
export declare function handleTrading(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle upgrades input
 */
export declare function handleUpgrades(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle BBS exploration input
 */
export declare function handleBBSExploration(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Display message choice menu for posting
 */
export declare function displayMessageChoiceMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Handle message choice input
 */
export declare function handleMessageChoice(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle posting subject input
 */
export declare function handlePostingSubject(socket: Socket, gameState: PhreakWarsGameState, data: string): void;
/**
 * Handle posting body input
 */
export declare function handlePostingBody(socket: Socket, gameState: PhreakWarsGameState, data: string): void;
/**
 * Handle romance input
 */
export declare function handleRomance(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle multiplayer input
 */
export declare function handleMultiplayer(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle stats menu input
 */
export declare function handleStatsMenu(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
/**
 * Handle delete confirmation
 */
export declare function handleDeleteConfirmation(socket: Socket, gameState: PhreakWarsGameState, input: string, session: DoorSession): void;
/**
 * Handle waiting mode (any key press continues)
 */
export declare function handleWaiting(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
export {};
