/**
 * Phreak Wars: The Underground BBS Empire
 *
 * A comprehensive text-based adventure game immersing players in the authentic
 * world of 1980s phone phreaking and computer underground culture.
 *
 * Features:
 * - Progressive skill development from novice to master hacker
 * - Interactive phreaking with authentic 1980s techniques
 * - BBS exploration and multiplayer competition
 * - Economic system with illegal goods trading
 * - Romance storyline with "Shadow" character
 * - Historical accuracy based on extensive research
 *
 * Architecture:
 * - Modularized into focused subsystems for maintainability
 * - Separated concerns: types, player, minigames, UI, handlers
 * - Main coordinator orchestrates all modules
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState } from '../index';
import { Door, DoorSession } from '../types';

// Import all modules
import { PhreakWarsGameState } from './phreakwars/types';
import { gameStates, createNewGameState, checkAndResetDailyLimits } from './phreakwars/player';
import { displayMainMenu } from './phreakwars/ui';
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
} from './phreakwars/handlers';
import { handleTextMinigame } from './phreakwars/minigames';

/**
 * Execute Phreak Wars door
 */
export async function executePhreakWarsDoor(socket: Socket, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log('Executing Phreak Wars door for user:', session.user?.username);

  // Initialize or load game state
  const userId = session.user!.id;
  let gameState = gameStates.get(userId);

  if (!gameState) {
    // Create new player
    gameState = createNewGameState();
    gameStates.set(userId, gameState);
  }

  // Check and reset daily limits if needed
  checkAndResetDailyLimits(gameState);

  // Set up door session
  session.subState = LoggedOnSubState.DOOR_RUNNING;
  session.tempData = { phreakWarsMode: true, gameState };

  // Start the game
  if (gameState.player.handle === '') {
    // New player - show character creation
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m                    \x1b[32mPHREAK WARS\x1b[0m                              \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m|\x1b[0m              \x1b[33mTHE UNDERGROUND BBS EMPIRE\x1b[0m                   \x1b[36m|\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m+==============================================================+\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[36mWelcome to the underground world of 1980s phone phreaking!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mEnter your hacker handle:\x1b[0m ');
    gameState.currentMode = 'character_creation';
  } else {
    // Existing player - show main menu
    displayMainMenu(socket, gameState);
  }
}

/**
 * Handle Phreak Wars input
 */
export function handlePhreakWarsInput(socket: Socket, session: BBSSession, data: string): void {
  const gameState = session.tempData?.gameState as PhreakWarsGameState;
  if (!gameState) return;

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
      handleDeleteConfirmation(socket, gameState, input, session);
      break;
    case 'text_minigame':
      handleTextMinigame(socket, gameState, input);
      break;
    case 'quit':
      // Exit the door
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
      socket.emit('ansi-output', '\r\n');
      break;
    default:
      displayMainMenu(socket, gameState);
  }
}
