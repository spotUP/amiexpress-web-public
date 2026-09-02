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
 * The title box, drawn to the width the caller actually has.
 *
 * It used to be a literal 64-character frame, which on a 40-column C64
 * screen folded into a second row of `=` and a stray `|` mid-line. The
 * frame, the centring and the rule all come from the width now.
 */
export declare function titleBox(lines: Array<{
    text: string;
    colour: string;
}>, width: number): string[];
/** The caller's width, or the board default when nothing recorded one. */
export declare function stateWidth(gameState: {
    terminalWidth?: number;
}): number;
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
