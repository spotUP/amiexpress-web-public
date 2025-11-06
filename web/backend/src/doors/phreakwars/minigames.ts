/**
 * PhreakWars Minigames Module
 *
 * All interactive minigame logic for skill development.
 */

import { Socket } from 'socket.io';
import { PhreakWarsGameState, MinigameType } from './types';
import { updateSkillLevel } from './player';

/**
 * Start a text-based minigame for the player
 */
export function startTextMinigame(socket: Socket, gameState: PhreakWarsGameState, gameType: MinigameType): void {
  gameState.currentMode = 'text_minigame';
  gameState.minigameType = gameType;
  gameState.minigameState = {};

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
export function handleTextMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
  const minigameType = gameState.minigameType;

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
function startRedBoxMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= RED BOXING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou approach a payphone and insert your red box...\x1b[0m\r\n\r\n');

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
function handleRedBoxMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.phreaking / 100;

  switch (input) {
    case '1':
      success = Math.random() < (0.4 + skillBonus * 0.4);
      socket.emit('ansi-output', '\r\n\x1b[36mGenerating precise coin tones...\x1b[0m\r\n');
      break;
    case '2':
      success = Math.random() < (0.2 + skillBonus * 0.2);
      socket.emit('ansi-output', '\r\n\x1b[36mTrying random frequencies...\x1b[0m\r\n');
      break;
    case '3':
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
    socket.emit('ansi-output', '\x1b[32mSUCCESS!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPayphone accepted the tones! Earned $25!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPhreaking skill improved!\x1b[0m\r\n');
  } else {
    gameState.player.phoneBills += 0.50;
    socket.emit('ansi-output', '\x1b[31mFAILED!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mPayphone rejected the tones. $0.50 added to phone bill.\x1b[0m\r\n');
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Blue Box minigame
 */
function startBlueBoxMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= BLUE BOXING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou dial a long distance number and prepare your blue box...\x1b[0m\r\n\r\n');

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
function handleBlueBoxMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
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
    socket.emit('ansi-output', '\x1b[32mSUCCESS!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mTrunk seized! Free long distance call! Earned $50!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPhreaking skill greatly improved!\x1b[0m\r\n');
  } else {
    gameState.player.phoneBills += 10.00;
    socket.emit('ansi-output', '\x1b[31mFAILED!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mLine busy or monitored. $10.00 added to phone bill.\x1b[0m\r\n');
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Tone Generation minigame
 */
function startToneGenMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= TONE GENERATION PRACTICE =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mPractice generating MF tones for phreaking...\x1b[0m\r\n\r\n');

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
function handleToneGenMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
  const state = gameState.minigameState;
  const targetTone = state.targetTone;

  const toneMap: { [key: string]: string } = {
    '1': '1', '2': '2', '3': '3', '4': '1', '5': '2', '6': '3',
    '7': '4', '8': '5', '9': '4', '0': '5', 'KP': '4', 'ST': '5'
  };

  const correctChoice = toneMap[targetTone] || '1';
  const success = input === correctChoice;

  if (success) {
    gameState.player.skills.phreaking = Math.min(100, gameState.player.skills.phreaking + 3);
    socket.emit('ansi-output', '\r\n\x1b[32mCORRECT!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mMF tone generated successfully! Phreaking skill improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\r\n\x1b[31mINCORRECT!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mKeep practicing to improve your skills!\x1b[0m\r\n');
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Hacking minigame
 */
function startHackMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PASSWORD CRACKING MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou\'ve gained access to a system login prompt...\x1b[0m\r\n\r\n');

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
function handleHackMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
  const state = gameState.minigameState;
  state.attempts++;

  let success = false;
  const skillBonus = gameState.player.skills.hacking / 100;

  if (input === 'H' && state.hints < 2) {
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
    socket.emit('ansi-output', '\x1b[32mSUCCESS!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPassword cracked! System access granted! Earned $100!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mHacking skill improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[31mFAILED!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mPassword attempt failed. System logged the intrusion.\x1b[0m\r\n');
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start Programming minigame
 */
function startProgramMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= PROGRAMMING CHALLENGE =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mCreate a simple BASIC program to solve this problem...\x1b[0m\r\n\r\n');

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
function handleProgramMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
  const state = gameState.minigameState;
  const correctChoice = state.challenge.solution;
  const success = input === correctChoice;

  if (success) {
    gameState.player.skills.programming = Math.min(100, gameState.player.skills.programming + 10);
    socket.emit('ansi-output', '\r\n\x1b[32mSUCCESS!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mProgram compiled and ran successfully! Programming skill greatly improved!\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\r\n\x1b[31mSYNTAX ERROR!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mProgram failed to compile. Keep coding to improve your skills!\x1b[0m\r\n');
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}

/**
 * Start BBS Hacking minigame
 */
function startBBSHackMinigame(socket: Socket, gameState: PhreakWarsGameState): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= BBS INTRUSION MINIGAME =-\x1b[0m\r\n\r\n');

  socket.emit('ansi-output', '\x1b[33mYou\'ve found a vulnerable BBS system...\x1b[0m\r\n\r\n');

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
function handleBBSHackMinigame(socket: Socket, gameState: PhreakWarsGameState, input: string): void {
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

    socket.emit('ansi-output', '\x1b[32mSUCCESS!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mBBS security breached! System compromised!\x1b[0m\r\n');
    socket.emit('ansi-output', `\x1b[32mEarned $${reward} and reputation!\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[32mHacking skill improved!\x1b[0m\r\n');

    if (Math.random() < 0.8) {
      const dataType = Math.random() < 0.5 ? 'Stolen Data' : 'Hacked Files';
      gameState.player.inventory.push(dataType);
      socket.emit('ansi-output', `\x1b[32mStole ${dataType.toLowerCase()} from the BBS!\x1b[0m\r\n`);
    }
  } else {
    socket.emit('ansi-output', '\x1b[31mFAILED!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSecurity systems detected intrusion!\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mConnection terminated. Target alerted!\x1b[0m\r\n');

    if (Math.random() < 0.4) {
      socket.emit('ansi-output', '\x1b[31mCounter-hack attempt detected!\x1b[0m\r\n');
      if (gameState.ownBbs && Math.random() * 100 < 30) {
        socket.emit('ansi-output', '\x1b[31mYour BBS was compromised in retaliation!\x1b[0m\r\n');
        gameState.ownBbs.security = Math.max(1, gameState.ownBbs.security - 1);
        gameState.player.money = Math.max(0, gameState.player.money - 75);
      }
    }
  }

  updateSkillLevel(gameState);
  gameState.currentMode = 'waiting';
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
}
