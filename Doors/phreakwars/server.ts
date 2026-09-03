/**
 * Phreak Wars SDK Door Server
 *
 * Fully refactored to use proper SDK patterns:
 * - No BBSSession internals access
 * - Game state stored locally in door
 * - Socket.IO input handling
 * - Portable and self-contained
 */

import { ServerDoor, DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';

// Metadata
export const metadata = {
  name: 'Phreak Wars',
  version: '1.0.0',
  description: 'The Underground BBS Empire - Phone Phreaking Simulation',
  author: 'AmiExpress SDK',
  command: 'PHREAKWARS',
};

// Import game modules
import { PhreakWarsGameState } from './lib/types';
import { gameStates, createNewGameState, checkAndResetDailyLimits } from './lib/player';
import { displayMainMenu, titleBox, stateWidth, say } from './lib/ui';
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
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
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

  // The caller's REAL width, recorded on the per-user state (gameStates is
  // shared across nodes, so this cannot be a module-level value). Cast:
  // the SDK's BBSApi interface does not declare getTerminalSize, though the
  // backend's implementation has it (web/backend/src/doors/BBSApi.ts:216).
  gameState.terminalWidth = (ctx as any).bbs?.getTerminalSize?.().width ?? 80;

  // Store game state in context for onInput handler
  (ctx as any).gameState = gameState;

  // Start the game
  if (gameState.player.handle === '') {
    // New player - show character creation
    say(socket, gameState, '\x1b[2J\x1b[H');
    for (const row of titleBox([
      { text: 'PHREAK WARS', colour: '\x1b[32m' },
      { text: 'THE UNDERGROUND BBS EMPIRE', colour: '\x1b[33m' },
    ], stateWidth(gameState))) say(socket, gameState, row);
    say(socket, gameState, '\r\n');
    say(socket, gameState, '\x1b[36mWelcome to the underground world of 1980s phone phreaking!\x1b[0m\r\n\r\n');
    say(socket, gameState, '\x1b[33mEnter your hacker handle:\x1b[0m ');
    gameState.currentMode = 'character_creation';
  } else {
    // Existing player - show main menu
    displayMainMenu(socket, gameState);
  }

  // onStart RETURNS here, and that is the whole point.
  //
  // `bbsSession.doorInputHandler` - the property the backend calls for every
  // keystroke (web: server/socket-handlers.ts:779; telnet: index.ts:1241) - is
  // installed by the SDK's input loop, and `Door.execute()` only reaches that
  // loop once every start handler has resolved (sdk/src/core/Door.ts:118-131).
  // This handler used to sit on a stay-alive promise polling `currentMode`
  // until the player quit, so the loop was never reached, the handler was
  // never installed, and every key the player pressed fell through to the
  // `door:input` dead-drop at socket-handlers.ts:783. The door painted and
  // could not be typed into, on every surface.
  //
  // The input loop is this door's stay-alive: it holds `execute()` open until
  // the socket disconnects, the BBS sends `door:close`, or the door itself
  // says it is finished (see the quit path in onInput below).
});

door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  const gameState = (ctx as any).gameState;
  if (!gameState) return;
  
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
        handleDeleteConfirmation(socket, gameState, input, (ctx as any).rawSession || ctx);
        break;
      case 'text_minigame':
        handleTextMinigame(socket, gameState, input);
        break;
      case 'quit':
        return;
      default:
        displayMainMenu(socket, gameState);
    }
  } catch (error) {
    console.error('[PhreakWars] Error handling input:', error);
    say(socket, gameState, '\r\n\x1b[31mAn error occurred. Returning to menu...\x1b[0m\r\n');
    displayMainMenu(socket, gameState);
  }

  // Quitting has to say so now that the SDK's input loop is the door's
  // lifetime. `ctx.close()` drops this node's running-session entry; the loop
  // then resolves on the next keystroke (sdk/src/core/Door.ts:212-217), which
  // is exactly the "Press any key to exit..." the quit handler prints.
  if (gameState.currentMode === 'quit') {
    ctx.close();
  }
});

export default door;
