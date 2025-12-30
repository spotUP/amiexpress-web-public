/**
 * Joust - Server/Fallback Door Entry Point
 * 1982 Williams Electronics arcade jousting game
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { JoustGame } from './game/joust-game';
import { rpcHandlers } from './server';
import { JoustData, InputKey, Direction } from './game/types';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
  STANDARD_PLATFORMS,
  LAVA_PITS,
} from './game/constants';

export { rpcHandlers };

function createInitialGameData(): JoustData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    wave: 1,

    player: {
      x: 10, y: 16, vx: 0, vy: 0,
      direction: 'right', mount: 'ostrich',
      isFlapping: false, flapFrame: 0,
      isWalking: false, walkFrame: 0,
      isAlive: true, respawnTimer: 0, invincibleTimer: 0,
    },
    enemies: [],
    eggs: [],
    pterodactyl: {
      x: -10, y: 10, vx: 0, vy: 0,
      isActive: false, targetPlayer: false,
      mouthOpen: false, mouthTimer: 0,
    },

    platforms: [...STANDARD_PLATFORMS],
    lavaPits: [...LAVA_PITS],

    enemyIdCounter: 0,
    eggIdCounter: 0,
    waveTimer: 0,
    survivalBonus: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

const door = new Door({ name: 'Joust', version: '1.0.0', author: 'AmiExpress BBS' });

let gameData: JoustData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: JoustGame | null = null;

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true, dockBorders: true, title: 'Joust', fullUnicode: false,
    output: (data: string) => door.write(data), input: null as any,
  });

  hudBox = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, tags: true, content: formatHUD() });

  gameArea = blessed.box({ parent: screen, top: 1, left: 0, width: GAME_WIDTH, height: GAME_HEIGHT + 2, tags: true, style: { bg: 'black' } });

  footerBox = blessed.box({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true,
    border: { type: 'line' }, style: { border: { fg: 'gray' } },
    content: '{gray-fg}Arrow Keys: Move | Space: Flap | P: Pause | Q: Quit{/}',
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, '0');
  const livesStr = '*'.repeat(Math.max(0, gameData.lives));
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}WAVE: ${gameData.wave}{/}  {red-fg}LIVES: ${livesStr}{/}`;
}

function showMenu(): void {
  gameData.state = 'menu';
  gameData.menuSelection = 0;
  gameArea.setContent('');

  if (menuBox) menuBox.destroy();

  const menuContent = [
    '{cyan-fg}',
    '       _                 _   ',
    '      | | ___  _   _ ___| |_ ',
    '   _  | |/ _ \\| | | / __| __|',
    '  | |_| | (_) | |_| \\__ \\ |_ ',
    '   \\___/ \\___/ \\__,_|___/\\__|',
    '{/}',
    '', '{white-fg}Williams Electronics 1982{/}', '',
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    menuContent.push(`{${selected ? 'yellow' : 'white'}-fg}${selected ? '> ' : '  '}${option}{/}`);
  });

  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 40, height: menuContent.length + 2,
    tags: true, border: { type: 'line' }, style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    content: menuContent.join('\n'),
  });

  screen.render();
}

async function showHighscores(): Promise<void> {
  gameData.state = 'highscores';
  try { gameData.highscores = await rpcHandlers.getHighscores(); } catch { /* cached */ }

  const content = ['{yellow-fg}HIGH SCORES{/}', '', '{white-fg}RANK  NAME   SCORE     WAVE{/}', '{gray-fg}----  ----  --------   ----{/}'];
  gameData.highscores.slice(0, 10).forEach((score, i) => {
    content.push(`{cyan-fg}${(i+1).toString().padStart(2)}.{/}   {white-fg}${score.name.padEnd(4)}{/}  {yellow-fg}${score.score.toString().padStart(8)}{/}   {green-fg}${score.wave.toString().padStart(2)}{/}`);
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
    '{cyan-fg}OBJECTIVE:{/}', 'Defeat enemy knights by jousting!', 'Higher lance wins the collision.', '',
    '{green-fg}CONTROLS:{/}', 'Arrow Keys - Move left/right', 'Space - Flap wings to fly', '',
    '{magenta-fg}ENEMIES:{/}',
    '{red-fg}Bounder{/} - Weakest (500 pts)',
    '{gray-fg}Hunter{/} - Aggressive (750 pts)',
    '{blue-fg}Shadow Lord{/} - Smartest (1500 pts)', '',
    '{white-fg}TIPS:{/}', 'Collect eggs before they hatch!', 'Watch out for the Pterodactyl!', '',
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

  game = new JoustGame(
    gameData,
    (content: string) => {
      gameArea.setContent(content);
      hudBox.setContent(formatHUD());
      screen.render();
    },
    () => showGameOver(),
    () => showWaveComplete()
  );
  game.initWave();

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => { if (gameData.state === 'playing') game?.update(); }, GAME_TICK_MS);
}

function showWaveComplete(): void {
  if (menuBox) menuBox.destroy();

  const content = [
    '{green-fg}WAVE COMPLETE!{/}', '',
    `{white-fg}Wave ${gameData.wave} cleared!{/}`,
    '{yellow-fg}Survival Bonus: 3000{/}', '',
    '{gray-fg}Press SPACE for next wave{/}',
  ];

  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 35, height: content.length + 2,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'green' }, bg: 'black' },
    content: content.join('\n'),
  });
  screen.render();
}

function nextWave(): void {
  gameData.wave++;
  gameData.state = 'playing';
  if (menuBox) { menuBox.destroy(); menuBox = null; }
  game?.initWave();
}

function showGameOver(): void {
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea, top: 'center', left: 'center', width: 30, height: 8,
    tags: true, border: { type: 'line' }, style: { border: { fg: 'red' }, bg: 'black' },
    content: `{red-fg}GAME OVER{/}\n\n{white-fg}Final Score: {yellow-fg}${gameData.score}{/}\n{white-fg}Wave: {cyan-fg}${gameData.wave}{/}\n\n{gray-fg}Press ENTER{/}`,
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
    case 'waveComplete': handleWaveCompleteInput(inputKey); break;
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
  if (key === ' ') return 'flap';
  if (key === '\r' || key === '\n') return 'enter';
  if (key === '\x1b') return 'escape';
  if (key === '\x7f' || key === '\b') return 'backspace';
  return key.toLowerCase();
}

function handleMenuInput(key: InputKey): void {
  if (key === 'up') { gameData.menuSelection = Math.max(0, gameData.menuSelection - 1); showMenu(); }
  else if (key === 'down') { gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1); showMenu(); }
  else if (key === 'enter' || key === 'flap') {
    if (gameData.menuSelection === 0) startGame();
    else if (gameData.menuSelection === 1) showHighscores();
    else if (gameData.menuSelection === 2) showHelp();
    else { cleanup(); door.exit(); }
  }
  else if (key === 'q' || key === 'escape') { cleanup(); door.exit(); }
}

function handleGameInput(key: InputKey): void {
  if (key === 'left') {
    game?.handleDirection('left');
  } else if (key === 'right') {
    game?.handleDirection('right');
  } else if (key === 'flap' || key === 'up') {
    game?.handleFlap();
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

function handleWaveCompleteInput(key: InputKey): void {
  if (key === 'flap' || key === 'enter') {
    nextWave();
  } else if (key === 'q' || key === 'escape') {
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    showMenu();
  }
}

function handleGameOverInput(key: InputKey): void {
  if (key === 'enter' || key === 'flap') {
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
    try { await rpcHandlers.saveHighscore({ name: gameData.playerName, score: gameData.score, wave: gameData.wave }); } catch { /* ignore */ }
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
door.onError((error: Error) => { console.error('[Joust] Error:', error); cleanup(); });

export default door;
