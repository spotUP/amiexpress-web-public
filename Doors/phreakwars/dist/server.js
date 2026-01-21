/**
 * Phreak Wars SDK Door Server
 *
 * Fully refactored to use proper SDK patterns:
 * - No BBSSession internals access
 * - Game state stored locally in door
 * - Socket.IO input handling
 * - Portable and self-contained
 */
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
// Metadata
export const metadata = {
    name: 'Phreak Wars',
    version: '1.0.0',
    description: 'The Underground BBS Empire - Phone Phreaking Simulation',
    author: 'AmiExpress SDK',
    command: 'PHREAKWARS',
};
import { gameStates, createNewGameState, checkAndResetDailyLimits } from './lib/player';
import { displayMainMenu } from './lib/ui';
import { handleMainMenu, handleCharacterCreation, handlePhreaking, handleBBSExploration, handleProgramming, handleTrading, handleRomance, handleMultiplayer, handleUpgrades, handlePostingSubject, handlePostingBody, handleMessageChoice, handleWaiting, handleStatsMenu, handleDeleteConfirmation } from './lib/handlers';
import { handleTextMinigame } from './lib/minigames';
/**
 * Main door class
 */
const door = new ServerDoor(metadata);
door.onStart(async (ctx) => {
    const { socket, user } = ctx;
    console.log('[PhreakWars] Starting door for user:', user?.username);
    // Initialize or load game state
    const userId = String(user?.id || '0');
    let gameState = gameStates.get(userId);
    if (!gameState) {
        // Create new player
        gameState = createNewGameState();
        gameStates.set(userId, gameState);
    }
    // Check and reset daily limits if needed
    checkAndResetDailyLimits(gameState);
    // Store game state in context for onInput handler
    ctx.gameState = gameState;
    // Start the game
    if (gameState.player.handle === '') {
        // New player - show character creation
        socket.emit('ansi-output', '\x1b[2J\x1b[H');
        socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36m|\\x1b[0m                    \x1b[32mPHREAK WARS\x1b[0m                              \x1b[36m|\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36m|\\x1b[0m              \x1b[33mTHE UNDERGROUND BBS EMPIRE\x1b[0m                   \x1b[36m|\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '\x1b[36mWelcome to the underground world of 1980s phone phreaking!\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '\x1b[33mEnter your hacker handle:\x1b[0m ');
        gameState.currentMode = 'character_creation';
    }
    else {
        // Existing player - show main menu
        displayMainMenu(socket, gameState);
    }
    // Wait for quit mode
    await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (gameState.currentMode === 'quit' || !socket.connected) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        socket.once('disconnect', () => {
            clearInterval(checkInterval);
            resolve();
        });
    });
});
door.onInput(async (ctx, key) => {
    const gameState = ctx.gameState;
    if (!gameState)
        return;
    const { socket } = ctx;
    const data = key.raw;
    const input = data.trim().toUpperCase();
    try {
        // Route input based on current game mode
        switch (gameState.currentMode) {
            case 'main_menu':
                handleMainMenu(socket, gameState, input);
                break;
            case 'character_creation':
                handleCharacterCreation(socket, gameState, data);
                break;
            case 'phreaking':
                handlePhreaking(socket, gameState, input);
                break;
            case 'bbs_exploration':
                handleBBSExploration(socket, gameState, input);
                break;
            case 'programming':
                handleProgramming(socket, gameState, input);
                break;
            case 'trading':
                handleTrading(socket, gameState, input);
                break;
            case 'romance':
                handleRomance(socket, gameState, input);
                break;
            case 'multiplayer':
                handleMultiplayer(socket, gameState, input);
                break;
            case 'upgrades':
                handleUpgrades(socket, gameState, input);
                break;
            case 'posting_subject':
                handlePostingSubject(socket, gameState, data);
                break;
            case 'posting_body':
                handlePostingBody(socket, gameState, data);
                break;
            case 'message_choice':
                handleMessageChoice(socket, gameState, input);
                break;
            case 'waiting':
                handleWaiting(socket, gameState, input);
                break;
            case 'stats_menu':
                handleStatsMenu(socket, gameState, input);
                break;
            case 'delete_confirmation':
                handleDeleteConfirmation(socket, gameState, input, ctx.rawSession || ctx);
                break;
            case 'text_minigame':
                handleTextMinigame(socket, gameState, input);
                break;
            case 'quit':
                return;
            default:
                displayMainMenu(socket, gameState);
        }
    }
    catch (error) {
        console.error('[PhreakWars] Error handling input:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mAn error occurred. Returning to menu...\x1b[0m\r\n');
        displayMainMenu(socket, gameState);
    }
});
export default door;
