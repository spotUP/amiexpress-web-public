/**
 * PhreakWars UI Module
 *
 * All display functions and UI rendering for the game.
 */
import { Socket } from 'socket.io';
import { PhreakWarsGameState } from './types';
/**
 * Display progress bar
 */
export declare function displayProgressBar(socket: Socket, progress: number): void;
/**
 * Display main menu
 */
export declare function displayMainMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display upgrades menu
 */
export declare function displayUpgradesMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display help
 */
export declare function displayHelp(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display stats
 */
export declare function displayStats(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display phreaking menu
 */
export declare function displayPhreakingMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display programming menu
 */
export declare function displayProgrammingMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display trading menu
 */
export declare function displayTradingMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display BBS exploration
 */
export declare function displayBBSExploration(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display romance menu
 */
export declare function displayRomanceMenu(socket: Socket, gameState: PhreakWarsGameState): void;
/**
 * Display multiplayer menu
 */
export declare function displayMultiplayerMenu(socket: Socket, gameState: PhreakWarsGameState): void;
