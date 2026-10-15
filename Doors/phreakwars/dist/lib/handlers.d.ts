/**
 * PhreakWars Input Handlers Module
 *
 * All input handling logic for game modes.
 */
import { Socket } from 'socket.io';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
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
 * Ask for the hacker handle and keep asking until one is accepted.
 *
 * A LINE, not a keystroke: the SDK reader echoes what the player types and
 * returns on Enter, so the 3-15 rule judges the finished handle instead of the
 * first letter of it.
 */
export declare function askForHandle(ctx: DoorContext, socket: Socket, gameState: PhreakWarsGameState): Promise<void>;
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
export declare function handleMessageChoice(ctx: DoorContext, socket: Socket, gameState: PhreakWarsGameState, input: string): Promise<void>;
/**
 * Write a message: a subject line, then body lines until /END.
 *
 * Both are free text, so both are read with the SDK line reader. The old
 * per-keystroke handlers judged the first letter of the subject as the whole
 * subject and appended every single keystroke to the body as its own line.
 */
export declare function askForPost(ctx: DoorContext, socket: Socket, gameState: PhreakWarsGameState): Promise<void>;
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
export declare function handleDeleteConfirmation(ctx: DoorContext, socket: Socket, gameState: PhreakWarsGameState, input: string, userId: string): Promise<PhreakWarsGameState | null>;
/**
 * Handle waiting mode (any key press continues)
 */
export declare function handleWaiting(socket: Socket, gameState: PhreakWarsGameState, input: string): void;
