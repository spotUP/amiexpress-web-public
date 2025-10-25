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
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState } from '../bbs/session';
import { Door, DoorSession } from '../types';

// Game state interface
interface PhreakWarsGameState {
  player: {
    handle: string;
    skillLevel: number;
    money: number;
    phoneBills: number;
    computer: {
      ram: number; // KB
      storage: number; // KB
      modemSpeed: number; // baud
      hasBlueBox: boolean;
      hasRedBox: boolean;
    };
    skills: {
      phreaking: number;
      programming: number;
      hacking: number;
    };
    inventory: string[];
    achievements: string[];
  };
  bbs: {
    name: string;
    security: number;
    users: number;
    messages: Array<{
      subject: string;
      body: string;
      author: string;
      timestamp: Date;
    }>;
    files: Array<{
      name: string;
      description: string;
      size: number;
      uploader: string;
    }>;
  };
  ownBbs?: {
    name: string;
    security: number;
    users: number;
    messages: Array<{
      subject: string;
      body: string;
      author: string;
      timestamp: Date;
    }>;
    files: Array<{
      name: string;
      description: string;
      size: number;
      uploader: string;
    }>;
  };
  shadow: {
    relationship: number; // 0-100
    messages: string[];
    lastContact: Date;
    pendingReplies: Array<{
      subject: string;
      body: string;
      timestamp: Date;
    }>;
  };
  dailyLimits: {
    lastReset: Date;
    phreakingAttempts: number;
    hackingAttempts: number;
    programmingSessions: number;
    tradingVisits: number;
    chatMessages: number;
    downloads: number;
    posts: number;
    bbsHacks: number;
  };
  currentMode: string;
  previousMode: string;
  inputBuffer: string;
  postingSubject?: string;
  postingBody?: string;
  minigameType?: string;
  minigameState?: any;
}

// Global game states (in production, this would be stored in database)
const gameStates = new Map<string, PhreakWarsGameState>();

// Daily limits configuration
const DAILY_LIMITS = {
  PHREAKING_ATTEMPTS: 10,
  HACKING_ATTEMPTS: 8,
  PROGRAMMING_SESSIONS: 6,
  TRADING_VISITS: 5,
  CHAT_MESSAGES: 15,
  DOWNLOADS: 5,
  POSTS: 3,
  BBS_HACKS: 3
};

/**
 * Check and reset daily limits if a new day has started
 */
function checkAndResetDailyLimits(gameState: PhreakWarsGameState) {
  const now = new Date();
  const lastReset = new Date(gameState.dailyLimits.lastReset);

  // Check if it's a new day (reset at midnight)
  if (now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()) {

    // Reset all daily limits
    gameState.dailyLimits = {
      lastReset: now,
      phreakingAttempts: 0,
      hackingAttempts: 0,
      programmingSessions: 0,
      tradingVisits: 0,
      chatMessages: 0,
      downloads: 0,
      posts: 0,
      bbsHacks: 0
    };
  }
}

/**
 * Check if player has reached daily limit for an action
 */
function checkDailyLimit(gameState: PhreakWarsGameState, limitType: keyof typeof DAILY_LIMITS, currentCount: number): boolean {
  const limit = DAILY_LIMITS[limitType];
  return currentCount >= limit;
}

/**
 * Display daily limits status
 */
function displayDailyLimits(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[36m-= DAILY ACTIVITY LIMITS =-\x1b[0m\r\n\r\n');

  const limits = [
    { name: 'Phreaking Attempts', current: gameState.dailyLimits.phreakingAttempts, max: DAILY_LIMITS.PHREAKING_ATTEMPTS },
    { name: 'Hacking Attempts', current: gameState.dailyLimits.hackingAttempts, max: DAILY_LIMITS.HACKING_ATTEMPTS },
    { name: 'Programming Sessions', current: gameState.dailyLimits.programmingSessions, max: DAILY_LIMITS.PROGRAMMING_SESSIONS },
    { name: 'Trading Visits', current: gameState.dailyLimits.tradingVisits, max: DAILY_LIMITS.TRADING_VISITS },
    { name: 'Chat Messages', current: gameState.dailyLimits.chatMessages, max: DAILY_LIMITS.CHAT_MESSAGES },
    { name: 'File Downloads', current: gameState.dailyLimits.downloads, max: DAILY_LIMITS.DOWNLOADS },
    { name: 'Message Posts', current: gameState.dailyLimits.posts, max: DAILY_LIMITS.POSTS },
    { name: 'BBS Hacks', current: gameState.dailyLimits.bbsHacks, max: DAILY_LIMITS.BBS_HACKS }
  ];

  limits.forEach(limit => {
    const color = limit.current >= limit.max ? '\x1b[31m' : '\x1b[32m';
    socket.emit('ansi-output', `${color}${limit.name}: ${limit.current}/${limit.max}\x1b[0m\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[33mLimits reset daily at midnight!\x1b[0m\r\n');
}

/**
 * Execute Phreak Wars door
 */
export async function executePhreakWarsDoor(socket: Socket, session: BBSSession, door: Door, doorSession: DoorSession) {
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
  displayMainMenu(socket, gameState);
}

/**
 * Handle Phreak Wars input
 */
export function handlePhreakWarsInput(socket: Socket, session: BBSSession, data: string) {
  const gameState = session.tempData?.gameState as PhreakWarsGameState;
  if (!gameState) return;

  const input = data.trim().toUpperCase();

  // Handle different game modes
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
    case 'download_file':
      handleDownloadFile(socket, gameState, input);
      break;
    case 'chat_room':
      handleChatRoom(socket, gameState, input);
      break;
    case 'chat_message':
      handleChatMessage(socket, gameState, data);
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
    default:
      displayMainMenu(socket, gameState);
  }
}

/**
 * Start a text-based minigame for the player
 */
function startTextMinigame(socket: Socket, gameState: PhreakWarsGameState, gameType: 'redbox' | 'bluebox' | 'tonegen' | 'hack' | 'program' | 'bbs_hack') {
  gameState.currentMode = 'text_minigame';
  gameState.minigameType = gameType;
  gameState.minigameState = {};

  // Initialize minigame based on type
  switch (gameType) {
    case 'redbox':
      startRedBoxMinigame(socket, gameState);
      break;
    case 'bluebox':
      startBlueBoxMinigame(socket, gameState);
      break;
    case 'tonegen':
      startToneGenMinigame(socket, gameState);
      break;
    case 'hack':
      startHackMinigame(socket, gameState);
      break;
    case 'program':
      startProgramMinigame(socket, gameState);
      break;
    case 'bbs_hack':
      startBBSHackMinigame(socket, gameState);
      break;
  }
}

/**
 * Handle text-based minigame input
 */
function handleTextMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const minigameType = gameState.minigameType;
  const minigameState = gameState.minigameState;

  switch (minigameType) {
    case 'redbox':
      handleRedBoxMinigame(socket, gameState, input);
      break;
    case 'bluebox':
      handleBlueBoxMinigame(socket, gameState, input);
      break;
    case 'tonegen':
      handleToneGenMinigame(socket, gameState, input);
      break;
    case 'hack':
      handleHackMinigame(socket, gameState, input);
      break;
    case 'program':
      handleProgramMinigame(socket, gameState, input);
      break;
    case 'bbs_hack':
      handleBBSHackMinigame(socket, gameState, input);
      break;
  }
}

/**
 * Start Red Box minigame
 */
function startRedBoxMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= RED BOXING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou approach a payphone and insert your red box...\x1b[0m\r\n\r\n');

  // Generate random coin values to match
  const targetCoins = Math.floor(Math.random() * 5) + 1; // 1-5 coins
  const coinValue = 0.25; // quarters
  const totalValue = targetCoins * coinValue;

  gameState.minigameState = {
    targetCoins,
    coinValue,
    totalValue,
    attempts: 0,
    maxAttempts: 3
  };

  socket.emit('ansi-output', `\x1b[32mPayphone requires: $${totalValue.toFixed(2)} (${targetCoins} quarters)\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[32mYou need to generate the exact coin tones!\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[36mChoose your approach:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Generate exact coin tones\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Try random frequencies\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Use pre-recorded tones\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle Red Box minigame
 */
function handleRedBoxMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.phreaking / 100;

  switch (input) {
    case '1':
      // Exact tones - higher success with skill
      success = Math.random() < (0.4 + skillBonus * 0.4);
      socket.emit('ansi-output', '\r\n\x1b[36mGenerating precise coin tones...\x1b[0m\r\n');
      break;
    case '2':
      // Random - lower success
      success = Math.random() < (0.2 + skillBonus * 0.2);
      socket.emit('ansi-output', '\r\n\x1b[36mTrying random frequencies...\x1b[0m\r\n');
      break;
    case '3':
      // Pre-recorded - medium success
      success = Math.random() < (0.3 + skillBonus * 0.3);
      socket.emit('ansi-output', '\r\n\x1b[36mPlaying pre-recorded tones...\x1b[0m\r\n');
      break;
    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice!\x1b[0m\r\n');
      return;
  }

  if (success) {
    gameState.player.skills.phreaking = Math.min(100, gameState.player.skills.phreaking + 5);
    gameState.player.money += 25;
    socket.emit('ansi-output', '\x1b[32m🎵 SUCCESS! 🎵\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPayphone accepted the tones! Earned $25!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPhreaking skill improved!\x1b[0m\r\n');
  } else {
    gameState.player.phoneBills += 0.50;
    socket.emit('ansi-output', '\x1b[31m🎵 FAILED! 🎵\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mPayphone rejected the tones. $0.50 added to phone bill.\x1b[0m\r\n');
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Blue Box minigame
 */
function startBlueBoxMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= BLUE BOXING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou dial a long distance number and prepare your blue box...\x1b[0m\r\n\r\n');

  // Generate random trunk line
  const areaCode = ['212', '213', '312', '415', '617'][Math.floor(Math.random() * 5)];
  const exchange = String(Math.floor(Math.random() * 900) + 100);

  gameState.minigameState = {
    areaCode,
    exchange,
    attempts: 0,
    maxAttempts: 3,
    seized: false
  };

  socket.emit('ansi-output', `\x1b[32mTarget trunk: ${areaCode}-${exchange}XXXX\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[32mYou need to seize the trunk line!\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[36mChoose your approach:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Send 2600Hz tone to seize trunk\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Try KP + ST sequence\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Use custom tone sequence\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle Blue Box minigame
 */
function handleBlueBoxMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.phreaking / 100;

  switch (input) {
    case '1':
      success = Math.random() < (0.5 + skillBonus * 0.3);
      socket.emit('ansi-output', '\r\n\x1b[36mSending 2600Hz seize tone...\x1b[0m\r\n');
      break;
    case '2':
      success = Math.random() < (0.3 + skillBonus * 0.4);
      socket.emit('ansi-output', '\r\n\x1b[36mSending KP + ST sequence...\x1b[0m\r\n');
      break;
    case '3':
      success = Math.random() < (0.2 + skillBonus * 0.5);
      socket.emit('ansi-output', '\r\n\x1b[36mTrying custom tone sequence...\x1b[0m\r\n');
      break;
    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice!\x1b[0m\r\n');
      return;
  }

  if (success) {
    gameState.player.skills.phreaking = Math.min(100, gameState.player.skills.phreaking + 10);
    gameState.player.money += 50;
    socket.emit('ansi-output', '\x1b[32m📻 SUCCESS! 📻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mTrunk seized! Free long distance call! Earned $50!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPhreaking skill greatly improved!\x1b[0m\r\n');
  } else {
    gameState.player.phoneBills += 10.00;
    socket.emit('ansi-output', '\x1b[31m📻 FAILED! 📻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mLine busy or monitored. $10.00 added to phone bill.\x1b[0m\r\n');
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Tone Generation minigame
 */
function startToneGenMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= TONE GENERATION PRACTICE =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mPractice generating MF tones for phreaking...\x1b[0m\r\n\r\n');

  // Generate random MF tone to practice
  const tones = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'KP', 'ST'];
  const targetTone = tones[Math.floor(Math.random() * tones.length)];

  gameState.minigameState = {
    targetTone,
    attempts: 0,
    maxAttempts: 5
  };

  socket.emit('ansi-output', '\x1b[32mGenerate the MF tone for:\x1b[0m ');
  socket.emit('ansi-output', `\x1b[31m${targetTone}\x1b[0m\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mChoose frequency combination:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m 700Hz + 900Hz\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m 700Hz + 1100Hz\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m 900Hz + 1100Hz\r\n');
  socket.emit('ansi-output', '\x1b[33m[4]\x1b[0m 700Hz + 1300Hz\r\n');
  socket.emit('ansi-output', '\x1b[33m[5]\x1b[0m 900Hz + 1300Hz\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle Tone Generation minigame
 */
function handleToneGenMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  const targetTone = state.targetTone;

  // MF tone mappings (simplified)
  const toneMap: { [key: string]: string } = {
    '1': '1', '2': '2', '3': '3', '4': '1', '5': '2', '6': '3',
    '7': '4', '8': '5', '9': '4', '0': '5', 'KP': '4', 'ST': '5'
  };

  const correctChoice = toneMap[targetTone] || '1';
  const success = input === correctChoice;

  if (success) {
    gameState.player.skills.phreaking = Math.min(100, gameState.player.skills.phreaking + 3);
    socket.emit('ansi-output', '\r\n\x1b[32m🎹 CORRECT! 🎹\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mMF tone generated successfully! Phreaking skill improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\r\n\x1b[31m🎹 INCORRECT! 🎹\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mKeep practicing to improve your skills!\x1b[0m\r\n');
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Hacking minigame
 */
function startHackMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PASSWORD CRACKING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou\'ve gained access to a system login prompt...\x1b[0m\r\n\r\n');

  // Generate random password to crack
  const passwordLength = Math.floor(Math.random() * 3) + 4; // 4-6 characters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < passwordLength; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  gameState.minigameState = {
    password,
    attempts: 0,
    maxAttempts: 3,
    hints: 0
  };

  socket.emit('ansi-output', '\x1b[32mSystem: LOGIN PASSWORD REQUIRED\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[32mPassword is 4-6 characters (A-Z, 0-9)\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[36mChoose your approach:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Try common passwords\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Brute force attempt\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Dictionary attack\r\n');
  socket.emit('ansi-output', '\x1b[33m[H]\x1b[0m Get a hint (limited)\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle Hacking minigame
 */
function handleHackMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.hacking / 100;

  if (input === 'H' && state.hints < 2) {
    // Give hint
    state.hints++;
    const password = state.password;
    const hintChar = password.charAt(Math.floor(Math.random() * password.length));
    socket.emit('ansi-output', `\r\n\x1b[33mHINT: Password contains the character '${hintChar}'\x1b[0m\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
    return;
  }

  switch (input) {
    case '1':
      success = Math.random() < (0.3 + skillBonus * 0.3);
      socket.emit('ansi-output', '\r\n\x1b[36mTrying common passwords...\x1b[0m\r\n');
      break;
    case '2':
      success = Math.random() < (0.2 + skillBonus * 0.4);
      socket.emit('ansi-output', '\r\n\x1b[36mRunning brute force attack...\x1b[0m\r\n');
      break;
    case '3':
      success = Math.random() < (0.4 + skillBonus * 0.3);
      socket.emit('ansi-output', '\r\n\x1b[36mLaunching dictionary attack...\x1b[0m\r\n');
      break;
    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice!\x1b[0m\r\n');
      return;
  }

  if (success) {
    gameState.player.skills.hacking = Math.min(100, gameState.player.skills.hacking + 8);
    gameState.player.money += 100;
    socket.emit('ansi-output', '\x1b[32m💻 SUCCESS! 💻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPassword cracked! System access granted! Earned $100!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mHacking skill improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[31m💻 FAILED! 💻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mPassword attempt failed. System logged the intrusion.\x1b[0m\r\n');
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Programming minigame
 */
function startProgramMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PROGRAMMING CHALLENGE =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mCreate a simple BASIC program to solve this problem...\x1b[0m\r\n\r\n');

  // Generate random programming challenge
  const challenges = [
    { problem: 'Write a program that prints numbers 1 to 10', solution: '1' },
    { problem: 'Write a program that calculates 2 + 2', solution: '2' },
    { problem: 'Write a program with a FOR loop', solution: '3' },
    { problem: 'Write a program with IF-THEN logic', solution: '4' }
  ];

  const challenge = challenges[Math.floor(Math.random() * challenges.length)];

  gameState.minigameState = {
    challenge,
    attempts: 0,
    maxAttempts: 3
  };

  socket.emit('ansi-output', `\x1b[32mChallenge: ${challenge.problem}\x1b[0m\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mChoose your approach:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Write simple PRINT statement\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Use arithmetic operations\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Implement loop structure\r\n');
  socket.emit('ansi-output', '\x1b[33m[4]\x1b[0m Add conditional logic\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle Programming minigame
 */
function handleProgramMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  const correctChoice = state.challenge.solution;
  const success = input === correctChoice;

  if (success) {
    gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 10);
    socket.emit('ansi-output', '\r\n\x1b[32m💾 SUCCESS! 💾\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mProgram compiled and ran successfully! Programming skill greatly improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\r\n\x1b[31m💾 SYNTAX ERROR! 💾\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mProgram failed to compile. Keep coding to improve your skills!\x1b[0m\r\n');
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start BBS Hacking minigame
 */
function startBBSHackMinigame(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= BBS INTRUSION MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou\'ve found a vulnerable BBS system...\x1b[0m\r\n\r\n');

  // Generate random BBS security level
  const securityLevel = Math.floor(Math.random() * 10) + 1;

  gameState.minigameState = {
    securityLevel,
    attempts: 0,
    maxAttempts: 3,
    phase: 'scanning'
  };

  socket.emit('ansi-output', `\x1b[32mTarget BBS Security Level: ${securityLevel}/10\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[32mYou need to breach the system defenses!\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[36mChoose your attack vector:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Port scan for vulnerabilities\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Try default passwords\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Exploit buffer overflow\r\n');
  socket.emit('ansi-output', '\x1b[33m[4]\x1b[0m Social engineering approach\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
}

/**
 * Handle BBS Hacking minigame
 */
function handleBBSHackMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.hacking / 100;
  const securityLevel = state.securityLevel;

  switch (input) {
    case '1':
      success = Math.random() < (0.4 + skillBonus * 0.3 - securityLevel * 0.05);
      socket.emit('ansi-output', '\r\n\x1b[36mScanning for open ports...\x1b[0m\r\n');
      break;
    case '2':
      success = Math.random() < (0.3 + skillBonus * 0.4 - securityLevel * 0.03);
      socket.emit('ansi-output', '\r\n\x1b[36mTrying default credentials...\x1b[0m\r\n');
      break;
    case '3':
      success = Math.random() < (0.2 + skillBonus * 0.5 - securityLevel * 0.07);
      socket.emit('ansi-output', '\r\n\x1b[36mExploiting buffer overflow...\x1b[0m\r\n');
      break;
    case '4':
      success = Math.random() < (0.5 + skillBonus * 0.2 - securityLevel * 0.02);
      socket.emit('ansi-output', '\r\n\x1b[36mAttempting social engineering...\x1b[0m\r\n');
      break;
    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice!\x1b[0m\r\n');
      return;
  }

  if (success) {
    const reward = securityLevel * 50 + 100;
    gameState.player.skills.hacking = Math.min(100, gameState.player.skills.hacking + 3);
    gameState.player.money += reward;
    gameState.player.skillLevel = Math.min(10.0, gameState.player.skillLevel + 0.15);

    socket.emit('ansi-output', '\x1b[32m💻 SUCCESS! 💻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mBBS security breached! System compromised!\x1b[0m\r\n');
    socket.emit('ansi-output', `\x1b[32mEarned $${reward} and reputation!\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[32mHacking skill improved!\x1b[0m\r\n');

    // Chance to steal data
    if (Math.random() < 0.8) {
      const dataType = Math.random() < 0.5 ? 'Stolen Data' : 'Hacked Files';
      gameState.player.inventory.push(dataType);
      socket.emit('ansi-output', `\x1b[32mStole ${dataType.toLowerCase()} from the BBS!\x1b[0m\r\n`);
    }
  } else {
    socket.emit('ansi-output', '\x1b[31m💻 FAILED! 💻\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSecurity systems detected intrusion!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mConnection terminated. Target alerted!\x1b[0m\r\n');

    // Chance of retaliation
    if (Math.random() < 0.4) {
      socket.emit('ansi-output', '\x1b[31mCounter-hack attempt detected!\x1b[0m\r\n');
      if (gameState.ownBbs && Math.random() * 100 < 30) {
        socket.emit('ansi-output', '\x1b[31mYour BBS was compromised in retaliation!\x1b[0m\r\n');
        gameState.ownBbs.security = Math.max(1, gameState.ownBbs.security - 1);
        gameState.player.money = Math.max(0, gameState.player.money - 75);
      }
    }
  }

  // Update skill level
  const avgSkill = (gameState.player.skills.phreaking + gameState.player.skills.programming + gameState.player.skills.hacking) / 3;
  gameState.player.skillLevel = Math.min(10.0, avgSkill / 10);

  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Create new game state for player
 */
function createNewGameState(): PhreakWarsGameState {
  return {
    player: {
      handle: '',
      skillLevel: 0.0,
      money: 50,
      phoneBills: 0,
      computer: {
        ram: 64, // 64KB
        storage: 170, // 170KB floppy
        modemSpeed: 300, // 300 baud
        hasBlueBox: false,
        hasRedBox: false
      },
      skills: {
        phreaking: 0,
        programming: 0,
        hacking: 0
      },
      inventory: [],
      achievements: []
    },
    bbs: {
      name: 'Public Domain',
      security: 1,
      users: 25,
      messages: [
        {
          subject: 'Welcome New Users!',
          body: 'Welcome to the Public Domain BBS! This is a safe place for beginners to learn about computing.',
          author: 'Sysop',
          timestamp: new Date()
        }
      ],
      files: [
        {
          name: 'BASICS.TXT',
          description: 'Basic computing concepts for beginners',
          size: 2048,
          uploader: 'Sysop'
        }
      ]
    },
    shadow: {
      relationship: 0,
      messages: [],
      lastContact: new Date(),
      pendingReplies: []
    },
    dailyLimits: {
      lastReset: new Date(),
      phreakingAttempts: 0,
      hackingAttempts: 0,
      programmingSessions: 0,
      tradingVisits: 0,
      chatMessages: 0,
      downloads: 0,
      posts: 0,
      bbsHacks: 0
    },
    currentMode: 'character_creation',
    previousMode: 'main_menu',
    inputBuffer: ''
  };
}

/**
 * Calculate overall game progress (0-100)
 */
function calculateGameProgress(gameState: PhreakWarsGameState): number {
  let progress = 0;

  // Skill level progress (0-40 points)
  progress += (gameState.player.skillLevel / 10.0) * 40;

  // Achievement progress (0-30 points)
  const totalAchievements = 6; // Novice, Apprentice, Journeyman, Expert, Master, Legendary
  const achievementCount = gameState.player.achievements.length;
  progress += (achievementCount / totalAchievements) * 30;

  // Equipment progress (0-15 points)
  let equipmentScore = 0;
  if (gameState.player.computer.ram > 64) equipmentScore += 5;
  if (gameState.player.computer.storage > 170) equipmentScore += 5;
  if (gameState.player.computer.modemSpeed > 300) equipmentScore += 5;
  progress += equipmentScore;

  // Relationship progress (0-10 points)
  progress += (gameState.shadow.relationship / 100) * 10;

  // BBS ownership progress (0-5 points)
  if (gameState.ownBbs) progress += 5;

  return Math.min(100, Math.max(0, progress));
}

/**
 * Display progress bar
 */
function displayProgressBar(socket: Socket, progress: number) {
  const barWidth = 20;
  const filledBars = Math.floor((progress / 100) * barWidth);
  const emptyBars = barWidth - filledBars;

  const filled = '█'.repeat(filledBars);
  const empty = '░'.repeat(emptyBars);

  socket.emit('ansi-output', '\x1b[36mProgress:\x1b[0m ');
  socket.emit('ansi-output', `\x1b[32m${filled}\x1b[0m`);
  socket.emit('ansi-output', `\x1b[37m${empty}\x1b[0m`);
  socket.emit('ansi-output', ` \x1b[33m${progress.toFixed(1)}%\x1b[0m\r\n`);
}

/**
 * Display main menu
 */
function displayMainMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m║\x1b[0m                    \x1b[32mPHREAK WARS\x1b[0m                              \x1b[36m║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m║\x1b[0m              \x1b[33mTHE UNDERGROUND BBS EMPIRE\x1b[0m                   \x1b[36m║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mHandle:\x1b[0m ${gameState.player.handle}\r\n`);
  socket.emit('ansi-output', `\x1b[32mSkill Level:\x1b[0m ${gameState.player.skillLevel.toFixed(1)}\r\n`);
  socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n`);
  socket.emit('ansi-output', `\x1b[32mPhone Bills:\x1b[0m $${gameState.player.phoneBills}\r\n`);

  // Show game progress bar
  const progress = calculateGameProgress(gameState);
  displayProgressBar(socket, progress);

  // Show progression milestones
  if (gameState.player.skillLevel >= 1.0 && !gameState.player.achievements.includes('Novice Hacker')) {
    gameState.player.achievements.push('Novice Hacker');
  }
  if (gameState.player.skillLevel >= 3.0 && !gameState.player.achievements.includes('Apprentice Hacker')) {
    gameState.player.achievements.push('Apprentice Hacker');
  }
  if (gameState.player.skillLevel >= 5.0 && !gameState.player.achievements.includes('Journeyman Hacker')) {
    gameState.player.achievements.push('Journeyman Hacker');
  }
  if (gameState.player.skillLevel >= 7.0 && !gameState.player.achievements.includes('Expert Hacker')) {
    gameState.player.achievements.push('Expert Hacker');
  }
  if (gameState.player.skillLevel >= 9.0 && !gameState.player.achievements.includes('Master Hacker')) {
    gameState.player.achievements.push('Master Hacker');
  }

  // Show next milestone
  let nextMilestone = '';
  if (gameState.player.skillLevel < 1.0) nextMilestone = 'Reach skill level 1.0 for Novice Hacker';
  else if (gameState.player.skillLevel < 3.0) nextMilestone = 'Reach skill level 3.0 for Apprentice Hacker';
  else if (gameState.player.skillLevel < 5.0) nextMilestone = 'Reach skill level 5.0 for Journeyman Hacker';
  else if (gameState.player.skillLevel < 7.0) nextMilestone = 'Reach skill level 7.0 for Expert Hacker';
  else if (gameState.player.skillLevel < 9.0) nextMilestone = 'Reach skill level 9.0 for Master Hacker';
  else if (gameState.player.skillLevel < 10.0) nextMilestone = 'Reach skill level 10.0 for LEGENDARY HACKER';

  if (nextMilestone) {
    socket.emit('ansi-output', `\x1b[33mNext Milestone:\x1b[0m ${nextMilestone}\r\n`);
  }

  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Phreaking & Hacking\r\n');
  socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m BBS Exploration\r\n');
  socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Programming & Coding\r\n');
  socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Black Market Trading\r\n');
  socket.emit('ansi-output', '\x1b[36m[U]\x1b[0m Computer Upgrades\r\n');
  socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m Shadow (Romance)\r\n');
  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Multiplayer BBS\r\n');
  socket.emit('ansi-output', '\x1b[36m[I]\x1b[0m Inventory & Stats\r\n');
  socket.emit('ansi-output', '\x1b[36m[L]\x1b[0m Daily Limits\r\n');
  socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Help\r\n');
  socket.emit('ansi-output', '\x1b[36m[Q]\x1b[0m Quit Game\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');

  gameState.currentMode = 'main_menu';
}

/**
 * Display upgrades menu
 */
function displayUpgradesMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= COMPUTER UPGRADES =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mCurrent System:\x1b[0m\r\n');
  socket.emit('ansi-output', `  RAM: ${gameState.player.computer.ram}KB\r\n`);
  socket.emit('ansi-output', `  Storage: ${gameState.player.computer.storage}KB\r\n`);
  socket.emit('ansi-output', `  Modem: ${gameState.player.computer.modemSpeed} baud\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mAvailable Upgrades:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Extra RAM (64KB) - $50\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Larger Storage (170KB) - $30\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Faster Modem (1200 baud) - $75\r\n');
  socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'upgrades';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle upgrades input
 */
function handleUpgrades(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case '1':
      if (gameState.player.money >= 50) {
        gameState.player.money -= 50;
        gameState.player.computer.ram += 64;
        socket.emit('ansi-output', '\r\n\x1b[32mRAM upgraded to ${gameState.player.computer.ram}KB!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[32mProgramming and hacking will be faster!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '2':
      if (gameState.player.money >= 30) {
        gameState.player.money -= 30;
        gameState.player.computer.storage += 170;
        socket.emit('ansi-output', '\r\n\x1b[32mStorage upgraded to ${gameState.player.computer.storage}KB!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[32mYou can store more files and programs!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '3':
      if (gameState.player.money >= 75) {
        gameState.player.money -= 75;
        gameState.player.computer.modemSpeed = 1200;
        socket.emit('ansi-output', '\r\n\x1b[32mModem upgraded to 1200 baud!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[32mFaster connections to BBS systems!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Handle waiting mode (any key press continues)
 */
function handleWaiting(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  // Return to the previous menu after any key press
  switch (gameState.previousMode) {
    case 'phreaking':
      displayPhreakingMenu(socket, gameState);
      break;
    case 'bbs_exploration':
      displayBBSExploration(socket, gameState);
      break;
    case 'programming':
      displayProgrammingMenu(socket, gameState);
      break;
    case 'trading':
      displayTradingMenu(socket, gameState);
      break;
    case 'romance':
      displayRomanceMenu(socket, gameState);
      break;
    case 'multiplayer':
      displayMultiplayerMenu(socket, gameState);
      break;
    case 'upgrades':
      displayUpgradesMenu(socket, gameState);
      break;
    default:
      displayMainMenu(socket, gameState);
  }
}

/**
 * Handle file download
 */
function handleDownloadFile(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  const fileIndex = parseInt(input) - 1;
  if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= gameState.bbs.files.length) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid file number.\x1b[0m\r\n');
  } else {
    const file = gameState.bbs.files[fileIndex];
    const sizeKB = Math.ceil(file.size / 1024);

    // Check if player has enough storage
    if (sizeKB > gameState.player.computer.storage) {
      socket.emit('ansi-output', '\r\n\x1b[31mNot enough storage space!\x1b[0m\r\n');
      socket.emit('ansi-output', `\x1b[36mFile size: ${sizeKB}KB, Available: ${gameState.player.computer.storage}KB\x1b[0m\r\n`);
    } else {
      socket.emit('ansi-output', '\r\n\x1b[36m-= DOWNLOADING FILE =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', `Downloading ${file.name}...\r\n`);
      socket.emit('ansi-output', `Size: ${sizeKB}KB\r\n`);
      socket.emit('ansi-output', 'Transfer protocol: ZModem\r\n\r\n');

      // Simulate download time based on modem speed
      const downloadTime = Math.ceil((file.size * 8) / (gameState.player.computer.modemSpeed * 1000)); // seconds
      socket.emit('ansi-output', `Estimated time: ${downloadTime} seconds\r\n\r\n`);

      // Success chance based on modem speed and connection quality
      const successChance = Math.min(95, 70 + (gameState.player.computer.modemSpeed / 1200) * 25);

      if (Math.random() * 100 < successChance) {
        socket.emit('ansi-output', '\x1b[32mDOWNLOAD COMPLETE!\x1b[0m\r\n');
        socket.emit('ansi-output', `\x1b[32m${file.name} saved to your computer.\x1b[0m\r\n`);

        // Add file to inventory
        gameState.player.inventory.push(file.name);
        gameState.player.computer.storage -= sizeKB;

        // Possible skill gain
        if (file.name.includes('PROGRAM') || file.name.includes('CODE')) {
          gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 1);
          socket.emit('ansi-output', '\x1b[32mProgramming skill improved!\x1b[0m\r\n');
        } else if (file.name.includes('HACK') || file.name.includes('PHREAK')) {
          gameState.player.skills.hacking = Math.min(100, gameState.player.skills.hacking + 1);
          socket.emit('ansi-output', '\x1b[32mHacking skill improved!\x1b[0m\r\n');
        }
      } else {
        socket.emit('ansi-output', '\x1b[31mDOWNLOAD FAILED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[31mConnection lost or file corrupted.\x1b[0m\r\n');
        gameState.player.phoneBills += 0.10; // Partial charge for failed download
      }
    }
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Handle chat room input
 */
function handleChatRoom(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'T':
      // Check daily limit
      if (checkDailyLimit(gameState, 'CHAT_MESSAGES', gameState.dailyLimits.chatMessages)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your chat messages for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      socket.emit('ansi-output', '\r\n\x1b[36m-= TYPE MESSAGE =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[33mEnter your message:\x1b[0m ');
      gameState.currentMode = 'chat_message';
      return;

    case 'L':
      socket.emit('ansi-output', '\r\n\x1b[32mLeaving chat room...\x1b[0m\r\n');
      displayBBSExploration(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
      displayBBSExploration(socket, gameState);
  }
}

/**
 * Handle chat message input
 */
function handleChatMessage(socket: Socket, gameState: PhreakWarsGameState, data: string) {
  const message = data.trim();
  if (message.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mMessage cannot be empty.\x1b[0m\r\n');
  } else if (message.length > 100) {
    socket.emit('ansi-output', '\r\n\x1b[31mMessage too long (max 100 characters).\x1b[0m\r\n');
  } else {
    // Increment daily counter
    gameState.dailyLimits.chatMessages++;

    socket.emit('ansi-output', `\r\n\x1b[32m<${gameState.player.handle}> ${message}\x1b[0m\r\n\r\n`);

    // Simulate responses from other users
    const responses = [
      'Nice one!',
      'LOL',
      'Who are you again?',
      'Cool story bro',
      'Anyone got the latest warez?',
      'Sysop is watching...',
      '2600Hz forever!'
    ];

    if (Math.random() < 0.4) {
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      const randomUser = ['Newbie1985', 'CodeMaster', 'PhreakLord', 'GameHacker'][Math.floor(Math.random() * 4)];
      socket.emit('ansi-output', `\x1b[32m<${randomUser}> ${randomResponse}\x1b[0m\r\n`);
    }

    // Shadow might respond if relationship is good enough
    if (gameState.shadow.relationship >= 40 && message.toLowerCase().includes('shadow')) {
      socket.emit('ansi-output', '\x1b[35m<Shadow> You were talking about me?\x1b[0m\r\n');
      gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 3);
    }

    // Small chance to meet someone new
    if (Math.random() < 0.1) {
      socket.emit('ansi-output', '\r\n\x1b[33m*** A mysterious user has joined the chat ***\x1b[0m\r\n');
    }
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display help
 */
function displayHelp(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PHREAK WARS HELP =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[32mGAME OBJECTIVE:\x1b[0m\r\n');
  socket.emit('ansi-output', 'Become a master hacker by progressing from novice to legendary status.\r\n\r\n');

  socket.emit('ansi-output', '\x1b[32mMAIN MENU OPTIONS:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Phreaking - Learn phone manipulation techniques\r\n');
  socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m BBS Exploration - Connect to underground systems\r\n');
  socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Programming - Learn coding and create tools\r\n');
  socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Trading - Buy/sell on the black market\r\n');
  socket.emit('ansi-output', '\x1b[36m[U]\x1b[0m Upgrades - Improve your computer\r\n');
  socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m Shadow - Romance storyline\r\n');
  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Multiplayer - BBS competition\r\n');
  socket.emit('ansi-output', '\x1b[36m[I]\x1b[0m Stats - View your progress\r\n\r\n');

  socket.emit('ansi-output', '\x1b[32mTIPS:\x1b[0m\r\n');
  socket.emit('ansi-output', '• Start with phreaking to earn money\r\n');
  socket.emit('ansi-output', '• Upgrade your computer for better performance\r\n');
  socket.emit('ansi-output', '• Visit BBS chat rooms to meet Shadow\r\n');
  socket.emit('ansi-output', '• Watch your phone bills!\r\n\r\n');

  socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Handle main menu input
 */
function handleMainMenu(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'P':
      displayPhreakingMenu(socket, gameState);
      break;
    case 'B':
      displayBBSExploration(socket, gameState);
      break;
    case 'C':
      displayProgrammingMenu(socket, gameState);
      break;
    case 'T':
      displayTradingMenu(socket, gameState);
      break;
    case 'U':
      displayUpgradesMenu(socket, gameState);
      break;
    case 'S':
      displayRomanceMenu(socket, gameState);
      break;
    case 'M':
      displayMultiplayerMenu(socket, gameState);
      break;
    case 'I':
      displayStats(socket, gameState);
      break;
    case 'L':
      displayDailyLimits(socket, gameState);
      break;
    case 'H':
      displayHelp(socket, gameState);
      break;
    case 'Q':
      socket.emit('ansi-output', '\r\n\x1b[33mThanks for playing Phreak Wars!\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[36m"2600 Hz is the key to the kingdom..."\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mPress any key to exit...\x1b[0m');
      gameState.currentMode = 'quit';
      break;
    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice. Press H for help.\x1b[0m\r\n');
      displayMainMenu(socket, gameState);
  }
}

/**
 * Handle character creation
 */
function handleCharacterCreation(socket: Socket, gameState: PhreakWarsGameState, data: string) {
  if (!gameState.player.handle) {
    // First input - handle
    const handle = data.trim();
    if (handle.length < 3 || handle.length > 15) {
      socket.emit('ansi-output', '\r\n\x1b[31mHandle must be 3-15 characters long.\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33mEnter your hacker handle:\x1b[0m ');
      return;
    }
    gameState.player.handle = handle;
    socket.emit('ansi-output', `\r\n\x1b[32mWelcome, ${handle}!\x1b[0m\r\n\r\n`);
    socket.emit('ansi-output', '\x1b[36mYou are a curious teenager in 1985 with access to a computer and modem.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36mYour journey from novice to master hacker begins now...\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to start...\x1b[0m');
    gameState.currentMode = 'main_menu';
  }
}

/**
 * Display phreaking menu
 */
function displayPhreakingMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PHREAKING & HACKING =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mPhreaking Skill:\x1b[0m ${gameState.player.skills.phreaking}/100\r\n`);
  socket.emit('ansi-output', `\x1b[32mHacking Skill:\x1b[0m ${gameState.player.skills.hacking}/100\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36m[R]\x1b[0m Red Boxing (Coin phone fraud)\r\n');
  socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Blue Boxing (Trunk seizing)\r\n');
  socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Tone Generation Practice\r\n');
  socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Hacking Challenges\r\n');
  socket.emit('ansi-output', '\x1b[36m[G]\x1b[0m Government Hack (Final Challenge)\r\n');
  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'phreaking';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle phreaking input
 */
function handlePhreaking(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'R':
      // Check daily limit
      if (checkDailyLimit(gameState, 'PHREAKING_ATTEMPTS', gameState.dailyLimits.phreakingAttempts)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your phreaking attempts for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      // Increment daily counter
      gameState.dailyLimits.phreakingAttempts++;

      // Start red boxing minigame
      startTextMinigame(socket, gameState, 'redbox');
      return;

    case 'B':
      if (!gameState.player.computer.hasBlueBox) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need a blue box to attempt trunk seizing!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mVisit the black market to purchase one.\x1b[0m\r\n');
      } else {
        // Check daily limit
        if (checkDailyLimit(gameState, 'PHREAKING_ATTEMPTS', gameState.dailyLimits.phreakingAttempts)) {
          socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[36mYou\'ve used all your phreaking attempts for today.\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
          break;
        }

        // Increment daily counter
        gameState.dailyLimits.phreakingAttempts++;

        // Start blue boxing minigame
        startTextMinigame(socket, gameState, 'bluebox');
        return;
      }
      break;

    case 'T':
      // Check daily limit
      if (checkDailyLimit(gameState, 'PHREAKING_ATTEMPTS', gameState.dailyLimits.phreakingAttempts)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your phreaking attempts for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      // Increment daily counter
      gameState.dailyLimits.phreakingAttempts++;

      // Start tone generation minigame
      startTextMinigame(socket, gameState, 'tonegen');
      return;

    case 'H':
      // Check daily limit
      if (checkDailyLimit(gameState, 'HACKING_ATTEMPTS', gameState.dailyLimits.hackingAttempts)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your hacking attempts for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      // Increment daily counter
      gameState.dailyLimits.hackingAttempts++;

      // Start hacking minigame
      startTextMinigame(socket, gameState, 'hack');
      return;

    case 'G':
      if (gameState.player.skillLevel < 9.0) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need skill level 9.0+ for government hack!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[36m-= GOVERNMENT HACK ATTEMPT =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', 'Attempting to breach government trunk line...\r\n');
        socket.emit('ansi-output', 'This is the ultimate challenge!\r\n\r\n');

        if (Math.random() * 100 < gameState.player.skillLevel * 10) {
          socket.emit('ansi-output', '\x1b[32m🎉 SUCCESS! 🎉\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[32mYou have become a LEGENDARY MASTER HACKER!\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[32mThe digital underground will never forget your name!\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[32mYou have achieved the ultimate goal!\x1b[0m\r\n');
          gameState.player.achievements.push('Legendary Master Hacker');
          gameState.player.skillLevel = 10.0;

          // Final reward
          gameState.player.money += 1000;
          socket.emit('ansi-output', '\x1b[32mBonus reward: $1000!\x1b[0m\r\n');
        } else {
          socket.emit('ansi-output', '\x1b[31mFAILED!\x1b[0m Federal agents are on your trail!\r\n');
          socket.emit('ansi-output', '\x1b[31mYour hacking career may be over...\x1b[0m\r\n');
          gameState.player.phoneBills += 100;

          // Chance of being caught
          if (Math.random() < 0.3) {
            socket.emit('ansi-output', '\x1b[31m🚔 FEDERAL AGENTS HAVE ARRIVED! 🚔\x1b[0m\r\n');
            socket.emit('ansi-output', '\x1b[31mYour computer has been confiscated!\x1b[0m\r\n');
            // Reset some progress but keep achievements
            gameState.player.money = Math.max(0, gameState.player.money - 500);
            gameState.player.computer.ram = 64;
            gameState.player.computer.storage = 170;
            gameState.player.computer.modemSpeed = 300;
            gameState.player.inventory = [];
          }
        }
      }
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display BBS exploration
 */
function displayBBSExploration(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', `\x1b[36m-= ${gameState.bbs.name} BBS =-\x1b[0m\r\n\r\n`);

  socket.emit('ansi-output', `\x1b[32mSecurity Level:\x1b[0m ${gameState.bbs.security}/10\r\n`);
  socket.emit('ansi-output', `\x1b[32mUsers Online:\x1b[0m ${gameState.bbs.users}\r\n\r\n`);

  // Check for Shadow replies
  if (gameState.shadow.pendingReplies.length > 0) {
    const reply = gameState.shadow.pendingReplies.shift()!; // Remove and get first reply
    socket.emit('ansi-output', '\x1b[35m*** NEW MESSAGE FROM SHADOW ***\x1b[0m\r\n');
    socket.emit('ansi-output', `\x1b[35mSubject: ${reply.subject}\x1b[0m\r\n`);
    socket.emit('ansi-output', `\x1b[35m${reply.body}\x1b[0m\r\n\r\n`);

    // Add to actual BBS messages
    gameState.bbs.messages.push({
      subject: reply.subject,
      body: reply.body,
      author: 'Shadow',
      timestamp: reply.timestamp
    });
  }

  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Read Messages\r\n');
  socket.emit('ansi-output', '\x1b[36m[P]\x1b[0m Post Message\r\n');
  socket.emit('ansi-output', '\x1b[36m[F]\x1b[0m Browse Files\r\n');
  socket.emit('ansi-output', '\x1b[36m[D]\x1b[0m Download File\r\n');
  socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Chat Room\r\n');
  socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'bbs_exploration';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle BBS exploration input
 */
function handleBBSExploration(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'M':
      socket.emit('ansi-output', '\r\n\x1b[36m-= MESSAGE BOARD =-\x1b[0m\r\n\r\n');
      if (gameState.bbs.messages.length === 0) {
        socket.emit('ansi-output', 'No messages.\r\n');
      } else {
        gameState.bbs.messages.forEach((msg, index) => {
          socket.emit('ansi-output', `${index + 1}. \x1b[33m${msg.subject}\x1b[0m by \x1b[32m${msg.author}\x1b[0m\r\n`);
        });
      }
      break;

    case 'P':
      // Check daily limit
      if (checkDailyLimit(gameState, 'POSTS', gameState.dailyLimits.posts)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your message posts for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      displayMessageChoiceMenu(socket, gameState);
      return;

    case 'F':
      socket.emit('ansi-output', '\r\n\x1b[36m-= FILE LIBRARY =-\x1b[0m\r\n\r\n');
      if (gameState.bbs.files.length === 0) {
        socket.emit('ansi-output', 'No files available.\r\n');
      } else {
        gameState.bbs.files.forEach((file, index) => {
          const sizeKB = Math.ceil(file.size / 1024);
          socket.emit('ansi-output', `${index + 1}. \x1b[33m${file.name}\x1b[0m (${sizeKB}KB)\r\n`);
          socket.emit('ansi-output', `   ${file.description}\r\n`);
          socket.emit('ansi-output', `   Uploaded by: ${file.uploader}\r\n\r\n`);
        });
      }
      break;

    case 'D':
      // Check daily limit
      if (checkDailyLimit(gameState, 'DOWNLOADS', gameState.dailyLimits.downloads)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your file downloads for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      socket.emit('ansi-output', '\r\n\x1b[36m-= DOWNLOAD FILE =-\x1b[0m\r\n\r\n');
      if (gameState.bbs.files.length === 0) {
        socket.emit('ansi-output', 'No files available to download.\r\n');
      } else {
        socket.emit('ansi-output', 'Available files:\r\n\r\n');
        gameState.bbs.files.forEach((file, index) => {
          const sizeKB = Math.ceil(file.size / 1024);
          socket.emit('ansi-output', `\x1b[33m[${index + 1}]\x1b[0m ${file.name} (${sizeKB}KB)\r\n`);
        });
        socket.emit('ansi-output', '\r\n\x1b[33mEnter file number to download:\x1b[0m ');
        gameState.currentMode = 'download_file';
        gameState.previousMode = 'bbs_exploration';
        return;
      }
      break;

    case 'C':
      socket.emit('ansi-output', '\r\n\x1b[36m-= CHAT ROOM =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', 'Welcome to the chat room!\r\n');
      socket.emit('ansi-output', `Users online: ${gameState.bbs.users + Math.floor(Math.random() * 5)}\r\n\r\n`);

      // Random chat messages
      const chatMessages = [
        '<Newbie1985> Anyone know how to get free long distance?',
        '<CodeMaster> Just learned BASIC today!',
        '<PhreakLord> 2600Hz is the key...',
        '<GameHacker> Looking for pirated games',
        '<SysopJr> This BBS rocks!'
      ];

      chatMessages.forEach(msg => {
        socket.emit('ansi-output', `\x1b[32m${msg}\x1b[0m\r\n`);
      });

      socket.emit('ansi-output', '\r\n');

      // Chance to meet Shadow
      if (Math.random() < 0.4 && gameState.shadow.relationship < 50) {
        socket.emit('ansi-output', '\x1b[35m*** Shadow has entered the chat room ***\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[35m<Shadow> Hey there... you look new here.\x1b[0m\r\n');
        gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 5);
      } else if (gameState.shadow.relationship >= 30) {
        // Shadow might chat if relationship is good
        if (Math.random() < 0.6) {
          const shadowChats = [
            '<Shadow> Still exploring the underground?',
            '<Shadow> Careful out there... the feds are watching.',
            '<Shadow> You\'re getting pretty good at this.',
            '<Shadow> Meet me in the real world sometime?'
          ];
          const randomChat = shadowChats[Math.floor(Math.random() * shadowChats.length)];
          socket.emit('ansi-output', `\x1b[35m${randomChat}\x1b[0m\r\n`);
          gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 2);
        }
      }

      // Random events
      if (Math.random() < 0.2) {
        socket.emit('ansi-output', '\r\n\x1b[33m*** Sysop Announcement: New files uploaded! ***\x1b[0m\r\n');
      }

      socket.emit('ansi-output', '\r\n\x1b[36m[T]\x1b[0m Type a message\r\n');
      socket.emit('ansi-output', '\x1b[36m[L]\x1b[0m Leave chat room\r\n\r\n');
      socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
      gameState.currentMode = 'chat_room';
      return;

    case 'B':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display programming menu
 */
function displayProgrammingMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PROGRAMMING & CODING =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mProgramming Skill:\x1b[0m ${gameState.player.skills.programming}/100\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36m[B]\x1b[0m Learn BASIC Programming\r\n');
  socket.emit('ansi-output', '\x1b[36m[A]\x1b[0m Learn Assembly Language\r\n');
  socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Learn C Programming\r\n');
  socket.emit('ansi-output', '\x1b[36m[T]\x1b[0m Create Hacking Tool\r\n');
  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'programming';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle programming input
 */
function handleProgramming(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'B':
      // Check daily limit
      if (checkDailyLimit(gameState, 'PROGRAMMING_SESSIONS', gameState.dailyLimits.programmingSessions)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your programming sessions for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      socket.emit('ansi-output', '\r\n\x1b[36m-= LEARNING BASIC =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '10 PRINT "HELLO WORLD"\r\n');
      socket.emit('ansi-output', '20 GOTO 10\r\n\r\n');

      // Increment daily counter
      gameState.dailyLimits.programmingSessions++;

      socket.emit('ansi-output', '\x1b[32mBASIC skill improved!\x1b[0m\r\n');
      gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 3);
      break;

    case 'A':
      // Check daily limit
      if (checkDailyLimit(gameState, 'PROGRAMMING_SESSIONS', gameState.dailyLimits.programmingSessions)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your programming sessions for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      if (gameState.player.skills.programming < 30) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need more programming experience first!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[36m-= LEARNING ASSEMBLY =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', 'MOV AX, 1234h\r\n');
        socket.emit('ansi-output', 'INT 21h\r\n\r\n');

        // Increment daily counter
        gameState.dailyLimits.programmingSessions++;

        socket.emit('ansi-output', '\x1b[32mAssembly skill improved!\x1b[0m\r\n');
        gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 5);
      }
      break;

    case 'C':
      // Check daily limit
      if (checkDailyLimit(gameState, 'PROGRAMMING_SESSIONS', gameState.dailyLimits.programmingSessions)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your programming sessions for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      if (gameState.player.skills.programming < 60) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need advanced programming skills first!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[36m-= LEARNING C PROGRAMMING =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', '#include <stdio.h>\r\n');
        socket.emit('ansi-output', 'int main() {\r\n');
        socket.emit('ansi-output', '    printf("Hello, hacker!\\n");\r\n');
        socket.emit('ansi-output', '    return 0;\r\n');
        socket.emit('ansi-output', '}\r\n\r\n');

        // Increment daily counter
        gameState.dailyLimits.programmingSessions++;

        socket.emit('ansi-output', '\x1b[32mC programming skill improved!\x1b[0m\r\n');
        gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 8);
      }
      break;

    case 'T':
      if (gameState.player.skills.programming < 40) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need programming skills to create tools!\x1b[0m\r\n');
      } else {
        // Check daily limit
        if (checkDailyLimit(gameState, 'PROGRAMMING_SESSIONS', gameState.dailyLimits.programmingSessions)) {
          socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[36mYou\'ve used all your programming sessions for today.\x1b[0m\r\n');
          socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
          break;
        }

        // Increment daily counter
        gameState.dailyLimits.programmingSessions++;

        // Start programming minigame
        startTextMinigame(socket, gameState, 'program');
        return;
      }
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display trading menu
 */
function displayTradingMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= BLACK MARKET TRADING =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mAvailable Items:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[1]\x1b[0m Red Box - $25 (Coin phone fraud)\r\n');
  socket.emit('ansi-output', '\x1b[33m[2]\x1b[0m Blue Box - $100 (Trunk seizing)\r\n');
  socket.emit('ansi-output', '\x1b[33m[3]\x1b[0m Extra RAM (64KB) - $50\r\n');
  socket.emit('ansi-output', '\x1b[33m[4]\x1b[0m Faster Modem (1200 baud) - $75\r\n');
  socket.emit('ansi-output', '\x1b[33m[5]\x1b[0m Pirated Games - $30\r\n');
  socket.emit('ansi-output', '\x1b[33m[6]\x1b[0m Sell Stolen Data - $200\r\n');
  socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'trading';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle trading input
 */
function handleTrading(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case '1':
      if (gameState.player.money >= 25) {
        gameState.player.money -= 25;
        gameState.player.computer.hasRedBox = true;
        socket.emit('ansi-output', '\r\n\x1b[32mPurchased Red Box!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '2':
      if (gameState.player.money >= 100) {
        gameState.player.money -= 100;
        gameState.player.computer.hasBlueBox = true;
        socket.emit('ansi-output', '\r\n\x1b[32mPurchased Blue Box!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '3':
      if (gameState.player.money >= 50) {
        gameState.player.money -= 50;
        gameState.player.computer.ram += 64;
        socket.emit('ansi-output', '\r\n\x1b[32mUpgraded RAM to ${gameState.player.computer.ram}KB!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '4':
      if (gameState.player.money >= 75) {
        gameState.player.money -= 75;
        gameState.player.computer.modemSpeed = 1200;
        socket.emit('ansi-output', '\r\n\x1b[32mUpgraded modem to 1200 baud!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '5':
      if (gameState.player.money >= 30) {
        gameState.player.money -= 30;
        gameState.player.inventory.push('Pirated Games');
        socket.emit('ansi-output', '\r\n\x1b[32mPurchased pirated games!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[32mCan sell for profit on BBS!\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mNot enough money!\x1b[0m\r\n');
      }
      break;

    case '6':
      if (gameState.player.inventory.includes('Stolen Data') || gameState.player.inventory.includes('Hacked Files')) {
        const reward = gameState.player.inventory.includes('Stolen Data') ? 200 : 150;
        socket.emit('ansi-output', `\r\n\x1b[32mSold ${gameState.player.inventory.includes('Stolen Data') ? 'stolen data' : 'hacked files'} for $${reward}!\x1b[0m\r\n`);
        gameState.player.money += reward;
        gameState.player.inventory = gameState.player.inventory.filter(item =>
          item !== 'Stolen Data' && item !== 'Hacked Files'
        );
        socket.emit('ansi-output', '\x1b[32mData erased from inventory.\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mYou don\'t have any stolen data to sell!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mHack some systems first.\x1b[0m\r\n');
      }
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display romance menu
 */
function displayRomanceMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= SHADOW (ROMANCE) =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mRelationship Level:\x1b[0m ${gameState.shadow.relationship}/100\r\n\r\n`);

  if (gameState.shadow.relationship === 0) {
    socket.emit('ansi-output', 'You haven\'t met Shadow yet.\r\n');
    socket.emit('ansi-output', 'Visit BBS chat rooms to meet other hackers.\r\n\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[35m<Shadow>\x1b[0m Hey... I\'ve been thinking about you.\r\n\r\n');

    socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Chat with Shadow\r\n');
    socket.emit('ansi-output', '\x1b[36m[G]\x1b[0m Give Gift\r\n');
    socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Hack Together\r\n');
  }

  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');
  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'romance';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle romance input
 */
function handleRomance(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  if (gameState.shadow.relationship === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou haven\'t met Shadow yet!\x1b[0m\r\n');
    displayMainMenu(socket, gameState);
    return;
  }

  switch (input) {
    case 'C':
      socket.emit('ansi-output', '\r\n\x1b[35m<Shadow>\x1b[0m What\'s new in your world?\r\n');
      socket.emit('ansi-output', '\x1b[35m<You>\x1b[0m Just exploring the underground...\r\n');
      socket.emit('ansi-output', '\x1b[35m<Shadow>\x1b[0m Sounds dangerous... but exciting.\x1b[0m\r\n\r\n');
      gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 2);
      break;

    case 'G':
      if (gameState.player.inventory.includes('Pirated Games')) {
        socket.emit('ansi-output', '\r\n\x1b[35m<You>\x1b[0m I got these games for you...\r\n');
        socket.emit('ansi-output', '\x1b[35m<Shadow>\x1b[0m Wow... that\'s so sweet! Thank you!\x1b[0m 💕\r\n\r\n');
        gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 15);
        gameState.player.inventory = gameState.player.inventory.filter(item => item !== 'Pirated Games');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mYou don\'t have anything to give!\x1b[0m\r\n');
      }
      break;

    case 'H':
      socket.emit('ansi-output', '\r\n\x1b[35m<You>\x1b[0m Want to hack a system together?\r\n');
      socket.emit('ansi-output', '\x1b[35m<Shadow>\x1b[0m I\'d love to! Let\'s do it...\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mJoint hacking successful! Skills improved!\x1b[0m\r\n');
      gameState.player.skills.hacking = Math.min(100, gameState.player.skills.hacking + 5);
      gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + 10);
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Display multiplayer menu
 */
function displayMultiplayerMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= MULTIPLAYER BBS COMPETITION =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', 'Create and manage your own BBS empire!\r\n');
  socket.emit('ansi-output', 'Hack other players\' systems and defend your own.\r\n\r\n');

  socket.emit('ansi-output', '\x1b[36m[C]\x1b[0m Create My BBS\r\n');
  socket.emit('ansi-output', '\x1b[36m[H]\x1b[0m Hack Other BBS\r\n');
  socket.emit('ansi-output', '\x1b[36m[U]\x1b[0m Upgrade Security\r\n');
  socket.emit('ansi-output', '\x1b[36m[S]\x1b[0m BBS Status\r\n');
  socket.emit('ansi-output', '\x1b[36m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'multiplayer';
  gameState.previousMode = 'main_menu';
}

/**
 * Handle multiplayer input
 */
function handleMultiplayer(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'C':
      if (gameState.ownBbs) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou already have a BBS!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mUse [S] to check its status.\x1b[0m\r\n');
      } else {
        // Create new BBS
        gameState.ownBbs = {
          name: `${gameState.player.handle}'s BBS`,
          security: Math.floor(gameState.player.skillLevel),
          users: 0,
          messages: [],
          files: []
        };
        socket.emit('ansi-output', '\r\n\x1b[36m-= CREATING YOUR BBS =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', `\x1b[32m"${gameState.ownBbs.name}" created!\x1b[0m\r\n`);
        socket.emit('ansi-output', '\x1b[32mOther players can now try to hack your system!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[32mDefend it and hack others to build your empire!\x1b[0m\r\n');
      }
      break;

    case 'H':
      // Check daily limit
      if (checkDailyLimit(gameState, 'BBS_HACKS', gameState.dailyLimits.bbsHacks)) {
        socket.emit('ansi-output', '\r\n\x1b[31mDAILY LIMIT REACHED!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mYou\'ve used all your BBS hacks for today.\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mCome back tomorrow for more!\x1b[0m\r\n');
        break;
      }

      socket.emit('ansi-output', '\r\n\x1b[36m-= HACKING OTHER BBS =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', 'Scanning for vulnerable BBS systems...\r\n\r\n');

      // Increment daily counter
      gameState.dailyLimits.bbsHacks++;

      // Start BBS hacking minigame
      startTextMinigame(socket, gameState, 'bbs_hack');
      return;

    case 'U':
      if (!gameState.ownBbs) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou need to create a BBS first!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mUse [C] to create your BBS.\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[36m-= UPGRADING SECURITY =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', `\x1b[32mCurrent Security Level:\x1b[0m ${gameState.ownBbs.security}\r\n`);
        socket.emit('ansi-output', '\x1b[32mUpgrade Cost:\x1b[0m $200\r\n\r\n');

        if (gameState.player.money >= 200) {
          gameState.player.money -= 200;
          gameState.ownBbs.security = Math.min(10, gameState.ownBbs.security + 1);
          socket.emit('ansi-output', '\x1b[32mSecurity upgraded!\x1b[0m\r\n');
          socket.emit('ansi-output', `\x1b[32mNew Security Level: ${gameState.ownBbs.security}\x1b[0m\r\n`);
        } else {
          socket.emit('ansi-output', '\x1b[31mNot enough money!\x1b[0m\r\n');
        }
      }
      break;

    case 'S':
      if (!gameState.ownBbs) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou don\'t have a BBS yet!\x1b[0m\r\n');
        socket.emit('ansi-output', '\x1b[36mUse [C] to create your BBS.\x1b[0m\r\n');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[36m-= BBS STATUS =-\x1b[0m\r\n\r\n');
        socket.emit('ansi-output', `\x1b[32mName:\x1b[0m ${gameState.ownBbs.name}\r\n`);
        socket.emit('ansi-output', `\x1b[32mSecurity Level:\x1b[0m ${gameState.ownBbs.security}/10\r\n`);
        socket.emit('ansi-output', `\x1b[32mUsers:\x1b[0m ${gameState.ownBbs.users}\r\n`);
        socket.emit('ansi-output', `\x1b[32mMessages:\x1b[0m ${gameState.ownBbs.messages.length}\r\n`);
        socket.emit('ansi-output', `\x1b[32mFiles:\x1b[0m ${gameState.ownBbs.files.length}\r\n\r\n`);

        if (gameState.ownBbs.users > 0) {
          socket.emit('ansi-output', '\x1b[32mYour BBS is attracting users!\x1b[0m\r\n');
        } else {
          socket.emit('ansi-output', '\x1b[33mNo users connected yet. Keep upgrading!\x1b[0m\r\n');
        }
      }
      break;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Handle posting subject input
 */
function handlePostingSubject(socket: Socket, gameState: PhreakWarsGameState, data: string) {
  const subject = data.trim();
  if (subject.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mSubject cannot be empty.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
    return;
  }
  if (subject.length > 50) {
    socket.emit('ansi-output', '\r\n\x1b[31mSubject too long (max 50 characters).\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
    return;
  }

  gameState.postingSubject = subject;
  socket.emit('ansi-output', `\r\n\x1b[32mSubject: "${subject}"\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[33mEnter message body (end with /END on a new line):\x1b[0m\r\n');
  gameState.currentMode = 'posting_body';
  gameState.inputBuffer = '';
}

// Message templates for Shadow romance
const shadowMessageTemplates = [
  {
    subject: "Looking for Shadow",
    body: "Hey, I've heard rumors about someone called Shadow. Mysterious hacker type. Anyone know how to get in touch?",
    relationshipBoost: 5,
    replyChance: 0.8,
    replySubject: "Re: Looking for Shadow",
    replyBody: "I heard you're looking for me... ;) What do you want to know?"
  },
  {
    subject: "Shadow - Let's Talk",
    body: "Shadow, if you're reading this, I think you're amazing. Your hacking skills are legendary. Want to chat sometime?",
    relationshipBoost: 10,
    replyChance: 0.9,
    replySubject: "Re: Shadow - Let's Talk",
    replyBody: "Flattery will get you everywhere... but only if you're serious. What makes you think you can keep up with me?"
  },
  {
    subject: "Shadow - I Need Your Help",
    body: "Shadow, I could really use your expertise on a tricky hack. You're the only one I trust. Can we meet?",
    relationshipBoost: 15,
    replyChance: 1.0,
    replySubject: "Re: Shadow - I Need Your Help",
    replyBody: "Trust is a dangerous word in our world... but I'm intrigued. Tell me more about this 'tricky hack' of yours."
  },
  {
    subject: "Shadow - Thinking of You",
    body: "Just wanted to say I can't stop thinking about our last conversation. You're different from everyone else here.",
    relationshipBoost: 8,
    replyChance: 0.7,
    replySubject: "Re: Shadow - Thinking of You",
    replyBody: "That's... sweet. Most people just want to use me for my skills. You might be different. Don't prove me wrong."
  },
  {
    subject: "Shadow - Let's Hack Together",
    body: "Shadow, I have an idea for a big score. But I need someone I can trust. You in?",
    relationshipBoost: 12,
    replyChance: 0.95,
    replySubject: "Re: Shadow - Let's Hack Together",
    replyBody: "A big score, huh? I'm listening... but if this is a setup, you'll regret it. What's the target?"
  }
];

/**
 * Display message choice menu for posting
 */
function displayMessageChoiceMenu(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= POST MESSAGE TO BBS =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[32mChoose a message to post:\x1b[0m\r\n\r\n');

  shadowMessageTemplates.forEach((template, index) => {
    socket.emit('ansi-output', `\x1b[33m[${index + 1}]\x1b[0m ${template.subject}\r\n`);
    socket.emit('ansi-output', `    ${template.body.substring(0, 60)}...\r\n\r\n`);
  });

  socket.emit('ansi-output', '\x1b[33m[C]\x1b[0m Custom message (free-form)\r\n');
  socket.emit('ansi-output', '\x1b[33m[B]\x1b[0m Back to BBS menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'message_choice';
  gameState.previousMode = 'bbs_exploration';
}

/**
 * Handle message choice input
 */
function handleMessageChoice(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  if (input === 'B') {
    displayBBSExploration(socket, gameState);
    return;
  }

  if (input === 'C') {
    // Custom message - go to original posting flow
    socket.emit('ansi-output', '\r\n\x1b[36m-= CUSTOM MESSAGE =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[33mEnter subject:\x1b[0m ');
    gameState.currentMode = 'posting_subject';
    gameState.previousMode = 'message_choice';
    return;
  }

  const choice = parseInt(input) - 1;
  if (isNaN(choice) || choice < 0 || choice >= shadowMessageTemplates.length) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
    displayMessageChoiceMenu(socket, gameState);
    return;
  }

  const template = shadowMessageTemplates[choice];

  // Increment daily counter
  gameState.dailyLimits.posts++;

  // Post the message
  gameState.bbs.messages.push({
    subject: template.subject,
    body: template.body,
    author: gameState.player.handle,
    timestamp: new Date()
  });

  // Boost relationship
  gameState.shadow.relationship = Math.min(100, gameState.shadow.relationship + template.relationshipBoost);

  socket.emit('ansi-output', `\r\n\x1b[32mMessage posted successfully!\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[32mShadow relationship increased by ${template.relationshipBoost} points!\x1b[0m\r\n`);

  // Chance for Shadow to reply next time
  if (Math.random() < template.replyChance) {
    gameState.shadow.pendingReplies.push({
      subject: template.replySubject,
      body: template.replyBody,
      timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000) // Reply appears next day
    });
    socket.emit('ansi-output', '\x1b[35m(Shadow might reply when you check back later...)\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  gameState.currentMode = 'waiting';
}

/**
 * Handle posting body input
 */
function handlePostingBody(socket: Socket, gameState: PhreakWarsGameState, data: string) {
  if (data.trim().toUpperCase() === '/END') {
    // Post the message
    const subject = gameState.postingSubject!;
    const body = gameState.inputBuffer.trim();

    if (body.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mMessage body cannot be empty.\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33mEnter message body (end with /END on a new line):\x1b[0m\r\n');
      return;
    }

    // Increment daily counter
    gameState.dailyLimits.posts++;

    // Add message to BBS
    gameState.bbs.messages.push({
      subject: subject,
      body: body,
      author: gameState.player.handle,
      timestamp: new Date()
    });

    socket.emit('ansi-output', '\r\n\x1b[32mMessage posted successfully!\x1b[0m\r\n');

    // Clear temporary data
    delete gameState.postingSubject;
    gameState.inputBuffer = '';

    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    gameState.currentMode = 'waiting';
  } else {
    // Accumulate the input
    gameState.inputBuffer += data + '\n';
    // Continue collecting input
  }
}

/**
 * Handle stats menu input
 */
function handleStatsMenu(socket: Socket, gameState: PhreakWarsGameState, input: string) {
  switch (input) {
    case 'D':
      socket.emit('ansi-output', '\r\n\x1b[31m-= DELETE PLAYER =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[31mWARNING: This will permanently delete your current player!\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[31mAll progress, money, skills, and achievements will be lost.\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[33m[Y]\x1b[0m Yes, delete player and create new\r\n');
      socket.emit('ansi-output', '\x1b[33m[N]\x1b[0m No, keep current player\r\n\r\n');
      socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
      gameState.currentMode = 'delete_confirmation';
      return;

    case 'M':
      displayMainMenu(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
      displayStats(socket, gameState);
  }
}

/**
 * Handle delete confirmation
 */
function handleDeleteConfirmation(socket: Socket, gameState: PhreakWarsGameState, input: string, session: BBSSession) {
  switch (input) {
    case 'Y':
      // Delete current player and create new one
      const userId = session.user!.id;
      gameStates.delete(userId);
      const newGameState = createNewGameState();
      gameStates.set(userId, newGameState);

      socket.emit('ansi-output', '\r\n\x1b[32mPlayer deleted successfully!\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[32mCreating new player...\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mPress any key to start...\x1b[0m');
      newGameState.currentMode = 'main_menu';
      return;

    case 'N':
      socket.emit('ansi-output', '\r\n\x1b[32mPlayer deletion cancelled.\x1b[0m\r\n');
      displayStats(socket, gameState);
      return;

    default:
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice.\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
      gameState.currentMode = 'delete_confirmation';
  }
}

/**
 * Display stats
 */
function displayStats(socket: Socket, gameState: PhreakWarsGameState) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PLAYER STATS =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', `\x1b[32mHandle:\x1b[0m ${gameState.player.handle}\r\n`);
  socket.emit('ansi-output', `\x1b[32mSkill Level:\x1b[0m ${gameState.player.skillLevel.toFixed(1)}\r\n`);
  socket.emit('ansi-output', `\x1b[32mMoney:\x1b[0m $${gameState.player.money}\r\n`);
  socket.emit('ansi-output', `\x1b[32mPhone Bills:\x1b[0m $${gameState.player.phoneBills}\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mSkills:\x1b[0m\r\n');
  socket.emit('ansi-output', `  Phreaking: ${gameState.player.skills.phreaking}/100\r\n`);
  socket.emit('ansi-output', `  Programming: ${gameState.player.skills.programming}/100\r\n`);
  socket.emit('ansi-output', `  Hacking: ${gameState.player.skills.hacking}/100\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[36mAchievements:\x1b[0m\r\n');
  if (gameState.player.achievements.length === 0) {
    socket.emit('ansi-output', '  None yet\r\n');
  } else {
    gameState.player.achievements.forEach(achievement => {
      socket.emit('ansi-output', `  • ${achievement}\r\n`);
    });
  }
  socket.emit('ansi-output', '\r\n\x1b[36mInventory:\x1b[0m\r\n');
  if (gameState.player.inventory.length === 0) {
    socket.emit('ansi-output', '  Empty\r\n');
  } else {
    gameState.player.inventory.forEach(item => {
      socket.emit('ansi-output', `  • ${item}\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[36mOptions:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[D]\x1b[0m Delete Player and Create New\r\n');
  socket.emit('ansi-output', '\x1b[33m[M]\x1b[0m Back to Main Menu\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mChoice:\x1b[0m ');
  gameState.currentMode = 'stats_menu';
  gameState.previousMode = 'main_menu';
}