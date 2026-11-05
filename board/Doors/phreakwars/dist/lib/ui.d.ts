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
 * Emit one payload, word-wrapped to the caller's width.
 *
 * This door writes through BBSApi.write(), which emits straight to the socket
 * and never passes the backend's wrapForSession - so a 51-column menu row
 * ("[P] Phreaking - Learn phone manipulation techniques") hard-wraps mid-word
 * on a C64 and eats the row beneath it. Every emit in this door goes through
 * here instead.
 *
 * The wrap itself is the SDK's - `wrapLineToWidth` is the same primitive
 * web/backend's wrapForSession is built on, so the door and the board break
 * lines identically instead of two implementations drifting.
 *
 * At 80 columns and wider this is a straight pass-through: an 80-column
 * board's bytes are what they always were, including the handful of prose
 * lines that run past 80 and have always relied on the terminal's own wrap.
 */
export declare function say(socket: Socket, gameState: {
    terminalWidth?: number;
}, text: string): void;
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
