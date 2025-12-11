/**
 * Phreak Wars SDK Door Server
 *
 * Fully refactored to use proper SDK patterns:
 * - No BBSSession internals access
 * - Game state stored locally in door
 * - Socket.IO input handling
 * - Portable and self-contained
 */

import { Socket as SocketIOSocket } from 'socket.io';

// Import game modules
import { PhreakWarsGameState } from './lib/types';
import { gameStates, createNewGameState, checkAndResetDailyLimits } from './lib/player';
import { displayMainMenu } from './lib/ui';
import {
  handleMainMenu,
  handleCharacterCreation,
  handlePhreaking,
  handleBBSExploration,
  handleProgramming,
  handleTrading,
  handleRomance,
  handleMultiplayer,
  handleUpgrades,
  handlePostingSubject,
  handlePostingBody,
  handleMessageChoice,
  handleWaiting,
  handleStatsMenu,
  handleDeleteConfirmation
} from './lib/handlers';
import { handleTextMinigame } from './lib/minigames';

/**
 * SDK-compatible runDoor export
 * Follows the same pattern as bbslinkwall and other SDK doors
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user } = doorSession;

  console.log('[PhreakWars] Starting door for user:', user?.username);

  // Initialize or load game state
  const userId = user?.id || 0;
  let gameState = gameStates.get(userId);

  if (!gameState) {
    // Create new player
    gameState = createNewGameState();
    gameStates.set(userId, gameState);
  }

  // Check and reset daily limits if needed
  checkAndResetDailyLimits(gameState);

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
  } else {
    // Existing player - show main menu
    displayMainMenu(socket, gameState);
  }

  // Set up input handler
  const inputHandler = (data: string) => {
    try {
      const input = data.trim().toUpperCase();

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
          handleDeleteConfirmation(socket, gameState, input, doorSession);
          break;
        case 'text_minigame':
          handleTextMinigame(socket, gameState, input);
          break;
        case 'quit':
          // Remove input handler and exit
          socket.removeListener('user-input', inputHandler);
          socket.emit('ansi-output', '\r\n');
          return;
        default:
          displayMainMenu(socket, gameState);
      }

      // Check if user quit during handler
      if (gameState.currentMode === 'quit') {
        socket.removeListener('user-input', inputHandler);
        socket.emit('ansi-output', '\r\n');
      }
    } catch (error) {
      console.error('[PhreakWars] Error handling input:', error);
      socket.emit('ansi-output', '\r\n\x1b[31mAn error occurred. Returning to menu...\x1b[0m\r\n');
      displayMainMenu(socket, gameState);
    }
  };

  // Register input handler
  socket.on('user-input', inputHandler);

  // Wait for door to complete (when mode becomes 'quit' or socket disconnects)
  return new Promise<void>((resolve) => {
    const checkInterval = setInterval(() => {
      if (gameState.currentMode === 'quit' || !socket.connected) {
        clearInterval(checkInterval);
        socket.removeListener('user-input', inputHandler);
        resolve();
      }
    }, 100);

    // Clean up on disconnect
    socket.once('disconnect', () => {
      clearInterval(checkInterval);
      socket.removeListener('user-input', inputHandler);
      resolve();
    });
  });
}
