/**
 * Bubble Bobble - Server/Fallback Door Entry Point
 * 1986 Taito arcade platformer
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BubbleBobbleGame } from './game/bubble-bobble-game';
import { rpcHandlers } from './server';
import { BubbleBobbleData, InputKey, Direction } from './game/types';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
  BUBBLE_RANGE,
} from './game/constants';

export { rpcHandlers };

function createInitialGameData(): BubbleBobbleData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    level: 1,

    player: {
      x: 4, y: 17, vx: 0, vy: 0,
      direction: 'right',
      isJumping: false, isOnGround: true,
      isBubbling: false, bubbleFrame: 0, walkFrame: 0,
      invincibleTimer: 0, isAlive: true, respawnTimer: 0,
      hasShoes: false, hasCandy: false, rapidFire: false, bubbleRange: BUBBLE_RANGE,
    },
    enemies: [],
    bubbles: [],
    items: [],

    platforms: [],
    walls: [],

    enemyIdCounter: 0,
    bubbleIdCounter: 0,
    itemIdCounter: 0,
    levelTimer: 0,
    hurryUpTimer: 600,
    isHurryUp: false,

    extendLetters: [false, false, false, false, false, false],
    comboCount: 0,
    lastPopTime: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

const door = new Door({ name: 'Bubble Bobble', version: '1.0.0', author: 'AmiExpress BBS' });

let gameData: BubbleBobbleData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: BubbleBobbleGame | null = null;

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true, dockBorders: true, title: 'Bubble Bobble', fullUnicode: false,
    output: (data: string) => door.write(data), input: null as any,
  });

  hudBox = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, tags: true, content: formatHUD() });

  gameArea = blessed.box({ parent: screen, top: 1, left: 0, width: GAME_WIDTH * 2, height: GAME_HEIGHT + 2, tags: true, style: { bg: 'black' } });

  footerBox = blessed.box({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true,
    border: { type: 'line' }, style: { border: { fg: 'gray' } },
    content: '{gray-fg}Arrow Keys: Move | Z: Jump | X: Bubble | P: Pause | Q: Quit{/}',
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, '0');
  const livesStr = '*'.repeat(Math.max(0, gameData.lives));
  const hurryStr = gameData.isHurryUp ? '{red-fg}HURRY!{/}' : '';
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {green-fg}LIVES: ${livesStr}{/}  ${hurryStr}`;
}

function showMenu(): void {
  gameData.state = 'menu';
  gameData.menuSelection = 0;
  gameArea.setContent('');

  if (menuBox) menuBox.destroy();

  const menuContent = [
    '{green-fg}',
    '  ____        _     _     _      ',
    ' | __ ) _   _| |__ | |__ | | ___ ',
    " |  _ \\| | | | '_ \\| '_ \\| |/ _ \\",
    ' | |_) | |_| | |_) | |_) | |  __/',
    ' |____/ \\__,_|_.__/|_.__/|_|\\___|',
    '  ____        _     _     _      ',
    ' | __ )  ___ | |__ | |__ | | ___ ',
    " |  _ \\ / _ \\| '_ \\| '_ \\| |/ _ \\",
    ' | |_) | (_) | |_) | |_) | |  __/',
    ' |____/ \\___/|_.__/|_.__/|_|\\___|',
    '{/}',
    '', '{white-fg}Taito 1986{/}', '',
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    menuContent.push(`{${selected ? 'yellow' : 'white'}-fg}${selected ? '> ' : '  '}${option}{/}`);
  });

  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 42, height: menuContent.length + 2,
    tags: true, border: { type: 'line' }, style: { fg: 'white', bg: 'black', border: { fg: 'green' } },
    content: menuContent.join('\n'),
  });

  screen.render();
}

async function showHighscores(): Promise<void> {
  gameData.state = 'highscores';
  try { gameData.highscores = await rpcHandlers.getHighscores(); } catch { /* cached */ }

  const content = ['{yellow-fg}HIGH SCORES{/}', '', '{white-fg}RANK  NAME   SCORE     LEVEL{/}', '{gray-fg}----  ----  --------   -----{/}'];
  gameData.highscores.slice(0, 10).forEach((score, i) => {
    content.push(`{cyan-fg}${(i+1).toString().padStart(2)}.{/}   {white-fg}${score.name.padEnd(4)}{/}  {yellow-fg}${score.score.toString().padStart(8)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`);
  });
  content.push('', '{gray-fg}Press any key to return{/}');

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 40, height: content.length + 2,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'yellow' } }, content: content.join('\n'),
  });
  screen.render();
}

function showHelp(): void {
  const content = [
    '{yellow-fg}HOW TO PLAY{/}', '',
    '{cyan-fg}OBJECTIVE:{/}', 'Trap enemies in bubbles and pop them!', '',
    '{green-fg}CONTROLS:{/}', 'Arrow Keys - Move Bub', 'Z/Up - Jump', 'X/Space - Blow bubble', '',
    '{magenta-fg}TIPS:{/}',
    'Pop multiple enemies for combos!',
    'Collect fruit for bonus points.',
    'Get shoes for speed, candy for range.', '',
    '{red-fg}WARNING:{/}', 'HURRY UP = Angry enemies!', '',
    '{gray-fg}Press any key to return{/}',
  ];

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 45, height: content.length + 2,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'cyan' } }, content: content.join('\n'),
  });
  screen.render();
}

function startGame(): void {
  gameData = { ...createInitialGameData(), state: 'playing' };
  if (menuBox) { menuBox.destroy(); menuBox = null; }

  game = new BubbleBobbleGame(
    gameData,
    (content: string) => {
      gameArea.setContent(content);
      hudBox.setContent(formatHUD());
      screen.render();
    },
    () => showGameOver(),
    () => showLevelComplete()
  );
  game.initLevel();

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => { if (gameData.state === 'playing') game?.update(); }, GAME_TICK_MS);
}

function showLevelComplete(): void {
  if (menuBox) menuBox.destroy();

  const content = [
    '{green-fg}LEVEL COMPLETE!{/}', '',
    `{white-fg}Level ${gameData.level} cleared!{/}`, '',
    '{gray-fg}Press SPACE for next level{/}',
  ];

  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 35, height: content.length + 2,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'green' }, bg: 'black' },
    content: content.join('\n'),
  });
  screen.render();
}

function nextLevel(): void {
  gameData.level++;
  gameData.state = 'playing';
  if (menuBox) { menuBox.destroy(); menuBox = null; }
  game?.initLevel();
}

function showGameOver(): void {
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 30, height: 8,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'red' }, bg: 'black' },
    content: `{red-fg}GAME OVER{/}\n\n{white-fg}Final Score: {yellow-fg}${gameData.score}{/}\n{white-fg}Level: {cyan-fg}${gameData.level}{/}\n\n{gray-fg}Press ENTER{/}`,
  });
  screen.render();
  if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
}

function handleInput(key: string): void {
  const inputKey = normalizeKey(key);
  switch (gameData.state) {
    case 'menu': handleMenuInput(inputKey); break;
    case 'highscores': showMenu(); break;
    case 'help': showMenu(); break;
    case 'playing': handleGameInput(inputKey); break;
    case 'paused': handlePausedInput(inputKey); break;
    case 'levelComplete': handleLevelCompleteInput(inputKey); break;
    case 'gameover': handleGameOverInput(inputKey); break;
    case 'enterName': handleNameEntryInput(inputKey); break;
    default: showMenu();
  }
}

function normalizeKey(key: string): InputKey {
  if (key === '\x1b[A' || key === 'w') return 'up';
  if (key === '\x1b[B' || key === 's') return 'down';
  if (key === '\x1b[C' || key === 'd') return 'right';
  if (key === '\x1b[D' || key === 'a') return 'left';
  if (key === ' ' || key === 'x') return 'bubble';
  if (key === 'z') return 'jump';
  if (key === '\r' || key === '\n') return 'enter';
  if (key === '\x1b') return 'escape';
  if (key === '\x7f' || key === '\b') return 'backspace';
  return key.toLowerCase();
}

function handleMenuInput(key: InputKey): void {
  if (key === 'up') { gameData.menuSelection = Math.max(0, gameData.menuSelection - 1); showMenu(); }
  else if (key === 'down') { gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1); showMenu(); }
  else if (key === 'enter' || key === 'bubble') {
    if (gameData.menuSelection === 0) startGame();
    else if (gameData.menuSelection === 1) showHighscores();
    else if (gameData.menuSelection === 2) showHelp();
    else { cleanup(); door.exit(); }
  }
  else if (key === 'q' || key === 'escape') { cleanup(); door.exit(); }
}

function handleGameInput(key: InputKey): void {
  if (key === 'left') {
    game?.handleMove('left');
  } else if (key === 'right') {
    game?.handleMove('right');
  } else if (key === 'jump' || key === 'up') {
    game?.handleJump();
  } else if (key === 'bubble') {
    game?.handleBubble();
  } else if (key === 'p') {
    showPauseScreen();
  } else if (key === 'q' || key === 'escape') {
    gameData.state = 'menu';
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    showMenu();
  }
}

function showPauseScreen(): void {
  gameData.state = 'paused';
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 30, height: 6,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'yellow' }, bg: 'black' },
    content: '{yellow-fg}PAUSED{/}\n\n{white-fg}Press P to resume{/}',
  });
  screen.render();
}

function handlePausedInput(key: InputKey): void {
  if (key === 'p') {
    if (menuBox) { menuBox.destroy(); menuBox = null; }
    gameData.state = 'playing';
    game?.render();
  } else if (key === 'q' || key === 'escape') {
    gameData.state = 'menu';
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    showMenu();
  }
}

function handleLevelCompleteInput(key: InputKey): void {
  if (key === 'bubble' || key === 'enter') {
    nextLevel();
  } else if (key === 'q' || key === 'escape') {
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    showMenu();
  }
}

function handleGameOverInput(key: InputKey): void {
  if (key === 'enter' || key === 'bubble') {
    const lowest = gameData.highscores[gameData.highscores.length - 1]?.score || 0;
    if (gameData.score > lowest || gameData.highscores.length < 10) {
      gameData.state = 'enterName';
      gameData.playerName = '';
      showNameEntry();
    } else showMenu();
  } else if (key === 'q' || key === 'escape') showMenu();
}

function showNameEntry(): void {
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 35, height: 11,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'yellow' }, bg: 'black' },
    content: `{yellow-fg}NEW HIGH SCORE!{/}\n\n{white-fg}Score: {yellow-fg}${gameData.score}{/}\n\n{cyan-fg}Enter initials:{/}\n\n{white-fg}[ ${gameData.playerName.padEnd(3, '_')} ]{/}\n\n{gray-fg}ENTER when done{/}`,
  });
  screen.render();
}

async function handleNameEntryInput(key: InputKey): Promise<void> {
  if (key === 'enter' && gameData.playerName.length > 0) {
    try { await rpcHandlers.saveHighscore({ name: gameData.playerName, score: gameData.score, level: gameData.level }); } catch { /* ignore */ }
    showMenu();
  } else if (key === 'backspace' && gameData.playerName.length > 0) {
    gameData.playerName = gameData.playerName.slice(0, -1);
    showNameEntry();
  } else if (key === 'escape') {
    showMenu();
  } else if (typeof key === 'string' && key.length === 1 && /[A-Za-z0-9]/.test(key) && gameData.playerName.length < 3) {
    gameData.playerName += key.toUpperCase();
    showNameEntry();
  }
}

function cleanup(): void {
  if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
  if (screen) { screen.removeAllListeners(); screen.destroy(); }
}

door.onStart(async () => {
  gameData = createInitialGameData();
  try { gameData.highscores = await rpcHandlers.getHighscores(); } catch { /* cached */ }
  initScreen();
  showMenu();
});

door.onInput((data: string) => handleInput(data));
door.onClose(() => cleanup());
door.onError((error: Error) => { console.error('[Bubble Bobble] Error:', error); cleanup(); });

export default door;
