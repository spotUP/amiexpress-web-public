/**
 * Galaga - Server/Fallback Door Entry Point
 * 1981 Namco space shooter arcade game port
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GalagaGame } from './game/galaga-game';
import { rpcHandlers } from './server';
import { GalagaData, InputKey } from './game/types';
import {
  SCREEN_WIDTH,
  GAME_AREA_WIDTH,
  GAME_AREA_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
} from './game/constants';

export { rpcHandlers };

function createInitialGameData(): GalagaData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    stage: 1,
    shotsHit: 0,
    shotsFired: 0,

    player: {
      x: GAME_AREA_WIDTH / 2,
      y: GAME_AREA_HEIGHT - 2,
      isDead: false,
      deathFrame: 0,
      hasDualFighter: false,
      isCaptured: false,
    },

    aliens: [],
    bullets: [],
    explosions: [],
    stars: [],

    formation: [],
    formationOffset: 0,
    formationDirection: 1,

    alienIdCounter: 0,
    bulletIdCounter: 0,
    explosionIdCounter: 0,
    spawnPhase: 0,
    aliensToSpawn: [],

    isChallengingStage: false,
    challengingKills: 0,
    challengingTotal: 40,

    capturedFighterAlienId: null,
    tractorBeamTimer: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',

    lastUpdateTime: Date.now(),
    frameCount: 0,
    stageIntroTimer: 0,
  };
}

const door = new Door({
  name: 'Galaga',
  version: '1.0.0',
  author: 'AmiExpress BBS',
});

let gameData: GalagaData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: GalagaGame | null = null;

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: 'Galaga',
    fullUnicode: false,
    output: (data: string) => door.write(data),
    input: null as any,
  });

  hudBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    content: formatHUD(),
  });

  gameArea = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: GAME_AREA_WIDTH,
    height: GAME_AREA_HEIGHT,
    tags: true,
    style: { bg: 'black' },
  });

  footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'gray' } },
    content: '{gray-fg}Left/Right: Move | Space: Fire | P: Pause | Q: Quit{/}',
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, '0');
  const livesStr = '*'.repeat(Math.max(0, gameData.lives));
  const accuracy = gameData.shotsFired > 0
    ? Math.floor((gameData.shotsHit / gameData.shotsFired) * 100)
    : 0;
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}STAGE: ${gameData.stage}{/}  {red-fg}LIVES: ${livesStr}{/}  {white-fg}HIT: ${accuracy}%{/}`;
}

function showMenu(): void {
  gameData.state = 'menu';
  gameData.menuSelection = 0;
  gameArea.setContent('');

  if (menuBox) menuBox.destroy();

  const menuContent = [
    '{cyan-fg}',
    '   ____       _                   ',
    '  / ___| __ _| | __ _  __ _  __ _ ',
    ' | |  _ / _` | |/ _` |/ _` |/ _` |',
    ' | |_| | (_| | | (_| | (_| | (_| |',
    '  \\____|\\__,_|_|\\__,_|\\__, |\\__,_|',
    '                      |___/       ',
    '{/}',
    '',
    '{white-fg}Classic 1981 Namco Space Shooter{/}',
    '',
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    const prefix = selected ? '> ' : '  ';
    const color = selected ? 'yellow' : 'white';
    menuContent.push(`{${color}-fg}${prefix}${option}{/}`);
  });

  menuBox = blessed.box({
    parent: gameArea,
    top: 'center',
    left: 'center',
    width: 45,
    height: menuContent.length + 2,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    content: menuContent.join('\n'),
  });

  screen.render();
}

async function showHighscores(): Promise<void> {
  gameData.state = 'highscores';

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch { /* use cached */ }

  const content = [
    '{yellow-fg}HIGH SCORES{/}',
    '',
    '{white-fg}RANK  NAME   SCORE     STAGE{/}',
    '{gray-fg}----  ----  --------   -----{/}',
  ];

  gameData.highscores.slice(0, 10).forEach((score, index) => {
    const rank = (index + 1).toString().padStart(2, ' ');
    const name = score.name.padEnd(4, ' ');
    const scoreStr = score.score.toString().padStart(8, ' ');
    const stage = score.stage.toString().padStart(2, ' ');
    content.push(`{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${stage}{/}`);
  });

  content.push('', '{gray-fg}Press any key to return{/}');

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    parent: gameArea,
    top: 'center',
    left: 'center',
    width: 40,
    height: content.length + 2,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
    content: content.join('\n'),
  });

  screen.render();
}

function showHelp(): void {
  const content = [
    '{yellow-fg}HOW TO PLAY{/}',
    '',
    '{cyan-fg}OBJECTIVE:{/}',
    'Destroy all aliens in each stage.',
    'Avoid enemy fire and collisions!',
    '',
    '{green-fg}SPECIAL:{/}',
    'Boss Galagas can capture your ship.',
    'Destroy the boss to rescue it and',
    'get a DUAL FIGHTER with double firepower!',
    '',
    '{magenta-fg}CHALLENGING STAGES:{/}',
    'Every 3rd stage has bonus enemies.',
    'They cannot shoot - destroy them all!',
    '',
    '{white-fg}CONTROLS:{/}',
    'Left/Right - Move ship',
    'Space      - Fire',
    'P          - Pause',
    'Q          - Quit',
    '',
    '{gray-fg}Press any key to return{/}',
  ];

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    parent: gameArea,
    top: 'center',
    left: 'center',
    width: 45,
    height: content.length + 2,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    content: content.join('\n'),
  });

  screen.render();
}

function startGame(): void {
  gameData.state = 'playing';
  gameData.score = 0;
  gameData.lives = STARTING_LIVES;
  gameData.stage = 1;
  gameData.shotsHit = 0;
  gameData.shotsFired = 0;

  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  game = new GalagaGame(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
  });

  game.initStage();

  if (gameLoop) clearInterval(gameLoop);

  gameLoop = setInterval(() => {
    if (gameData.state === 'playing') {
      game?.update();
    }
  }, GAME_TICK_MS);
}

function handleInput(key: string): void {
  const inputKey = normalizeKey(key);

  switch (gameData.state) {
    case 'menu':
      handleMenuInput(inputKey);
      break;
    case 'highscores':
      showMenu();
      break;
    case 'playing':
      handleGameInput(inputKey);
      break;
    case 'paused':
      handlePausedInput(inputKey);
      break;
    case 'gameover':
      handleGameOverInput(inputKey);
      break;
    case 'enterName':
      handleNameEntryInput(inputKey);
      break;
    default:
      showMenu();
  }
}

function normalizeKey(key: string): InputKey {
  if (key === '\x1b[A' || key === 'w' || key === 'W') return 'up';
  if (key === '\x1b[B' || key === 's' || key === 'S') return 'down';
  if (key === '\x1b[C' || key === 'd' || key === 'D') return 'right';
  if (key === '\x1b[D' || key === 'a' || key === 'A') return 'left';
  if (key === ' ') return 'fire';
  if (key === '\r' || key === '\n') return 'enter';
  if (key === '\x1b' || key === '\x1b\x1b') return 'escape';
  if (key === '\x7f' || key === '\b') return 'backspace';
  return key.toLowerCase();
}

function handleMenuInput(key: InputKey): void {
  switch (key) {
    case 'up':
      gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
      showMenu();
      break;
    case 'down':
      gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
      showMenu();
      break;
    case 'enter':
    case 'fire':
      switch (gameData.menuSelection) {
        case 0: startGame(); break;
        case 1: showHighscores(); break;
        case 2: showHelp(); break;
        case 3: cleanup(); door.exit(); break;
      }
      break;
    case 'q':
    case 'escape':
      cleanup();
      door.exit();
      break;
  }
}

function handleGameInput(key: InputKey): void {
  switch (key) {
    case 'left':
      game?.handleKeyDown('left');
      setTimeout(() => game?.handleKeyUp('left'), 100);
      break;
    case 'right':
      game?.handleKeyDown('right');
      setTimeout(() => game?.handleKeyUp('right'), 100);
      break;
    case 'fire':
      game?.handleKeyDown('fire');
      break;
    case 'p':
      showPauseScreen();
      break;
    case 'q':
    case 'escape':
      gameData.state = 'menu';
      if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
      }
      showMenu();
      break;
  }
}

function showPauseScreen(): void {
  gameData.state = 'paused';

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    parent: gameArea,
    top: 'center',
    left: 'center',
    width: 30,
    height: 6,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' }, bg: 'black' },
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

function handleGameOverInput(key: InputKey): void {
  if (key === 'enter' || key === 'fire') {
    const lowestScore = gameData.highscores[gameData.highscores.length - 1]?.score || 0;
    if (gameData.score > lowestScore || gameData.highscores.length < 10) {
      gameData.state = 'enterName';
      gameData.playerName = '';
      showNameEntry();
    } else {
      showMenu();
    }
  } else if (key === 'q' || key === 'escape') {
    showMenu();
  }
}

function showNameEntry(): void {
  const content = [
    '{yellow-fg}NEW HIGH SCORE!{/}',
    '',
    `{white-fg}Score: {yellow-fg}${gameData.score}{/}`,
    `{white-fg}Stage: {cyan-fg}${gameData.stage}{/}`,
    '',
    '{cyan-fg}Enter your initials:{/}',
    '',
    `{white-fg}[ ${gameData.playerName.padEnd(3, '_')} ]{/}`,
    '',
    '{gray-fg}Press ENTER when done{/}',
  ];

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    parent: gameArea,
    top: 'center',
    left: 'center',
    width: 35,
    height: content.length + 2,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' }, bg: 'black' },
    content: content.join('\n'),
  });

  screen.render();
}

async function handleNameEntryInput(key: InputKey): Promise<void> {
  if (key === 'enter') {
    if (gameData.playerName.length > 0) {
      try {
        await rpcHandlers.saveHighscore({
          name: gameData.playerName,
          score: gameData.score,
          stage: gameData.stage,
        });
      } catch { /* continue */ }
      showMenu();
    }
  } else if (key === 'backspace') {
    if (gameData.playerName.length > 0) {
      gameData.playerName = gameData.playerName.slice(0, -1);
      showNameEntry();
    }
  } else if (key === 'escape') {
    showMenu();
  } else if (typeof key === 'string' && key.length === 1 && /[A-Za-z0-9]/.test(key)) {
    if (gameData.playerName.length < 3) {
      gameData.playerName += key.toUpperCase();
      showNameEntry();
    }
  }
}

function cleanup(): void {
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
  if (screen) {
    screen.removeAllListeners();
    screen.destroy();
  }
}

door.onStart(async () => {
  gameData = createInitialGameData();

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch { /* use defaults */ }

  initScreen();
  showMenu();
});

door.onInput((data: string) => {
  handleInput(data);
});

door.onClose(() => {
  cleanup();
});

door.onError((error: Error) => {
  console.error('[Galaga] Error:', error);
  cleanup();
});

export default door;
