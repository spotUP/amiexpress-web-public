/**
 * Pengo - Server/Fallback Door Entry Point
 * 1982 Sega arcade puzzle game port
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { PengoGame } from "./game/pengo-game";
import { rpcHandlers } from "./server";
import { PengoData, InputKey, Direction } from "./game/types";
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  INITIAL_TIME,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
} from "./game/constants";

export { rpcHandlers };

function createInitialGameData(): PengoData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    timeRemaining: INITIAL_TIME,

    pengo: {
      x: 7,
      y: 6,
      direction: "up",
      isPushing: false,
      pushFrame: 0,
      isDead: false,
      deathFrame: 0,
    },
    enemies: [],
    grid: [],
    eggs: [],

    diamondsAligned: false,
    enemyIdCounter: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

const door = new Door({
  name: "Pengo",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: PengoData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: PengoGame | null = null;
let doorContext: any; // Will be set on start

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Pengo",
    fullUnicode: false,
    output: (data: string) => doorContext?.output.write(data),
    input: null as any,
  } as any);

  hudBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: formatHUD(),
  });

  gameArea = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: GRID_WIDTH * 2,
    height: GRID_HEIGHT + 2,
    tags: true,
    style: { bg: "black" },
  });

  footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "gray" } },
    content:
      "{gray-fg}Arrow Keys: Move | Space: Push Block | P: Pause | Q: Quit{/}",
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {red-fg}LIVES: ${livesStr}{/}`;
}

function showMenu(): void {
  gameData.state = "menu";
  gameData.menuSelection = 0;
  gameArea.setContent("");

  if (menuBox) menuBox.destroy();

  const menuContent = [
    "{cyan-fg}",
    "  ____                       ",
    " |  _ \\ ___ _ __   __ _  ___ ",
    " | |_) / _ \\ '_ \\ / _` |/ _ \\",
    " |  __/  __/ | | | (_| | (_) |",
    " |_|   \\___|_| |_|\\__, |\\___/",
    "                  |___/      ",
    "{/}",
    "",
    "{white-fg}Classic 1982 Sega Puzzle Game{/}",
    "",
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    menuContent.push(
      `{${selected ? "yellow" : "white"}-fg}${
        selected ? "> " : "  "
      }${option}{/}`
    );
  });

  menuBox = blessed.box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 40,
    height: menuContent.length + 2,
    tags: true,
    border: { type: "line" },
    style: { fg: "white", bg: "black", border: { fg: "cyan" } },
    content: menuContent.join("\n"),
  });

  screen.render();
}

async function showHighscores(): Promise<void> {
  gameData.state = "highscores";
  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    /* cached */
  }

  const content = [
    "{yellow-fg}HIGH SCORES{/}",
    "",
    "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
    "{gray-fg}----  ----  --------   -----{/}",
  ];
  gameData.highscores.slice(0, 10).forEach((score, i) => {
    content.push(
      `{cyan-fg}${(i + 1)
        .toString()
        .padStart(2)}.{/}   {white-fg}${score.name.padEnd(
        4
      )}{/}  {yellow-fg}${score.score
        .toString()
        .padStart(8)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`
    );
  });
  content.push("", "{gray-fg}Press any key to return{/}");

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 40,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" } },
    content: content.join("\n"),
  });
  screen.render();
}

function showHelp(): void {
  const content = [
    "{yellow-fg}HOW TO PLAY{/}",
    "",
    "{cyan-fg}OBJECTIVE:{/}",
    "Crush all Sno-Bees with ice blocks!",
    "",
    "{green-fg}CONTROLS:{/}",
    "Arrow Keys - Move Pengo",
    "Space - Push/Slide ice block",
    "",
    "{magenta-fg}TIPS:{/}",
    "Push blocks against wall to stun enemies",
    "Line up diamond blocks for bonus!",
    "",
    "{gray-fg}Press any key to return{/}",
  ];

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 45,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" } },
    content: content.join("\n"),
  });
  screen.render();
}

function startGame(): void {
  gameData = { ...createInitialGameData(), state: "playing" };
  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  game = new PengoGame(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
  });
  game.initLevel();

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => {
    if (gameData.state === "playing") game?.update();
  }, GAME_TICK_MS);
}

function handleInput(key: string): void {
  const inputKey = normalizeKey(key);
  switch (gameData.state) {
    case "menu":
      handleMenuInput(inputKey);
      break;
    case "highscores":
      showMenu();
      break;
    case "playing":
      handleGameInput(inputKey);
      break;
    case "paused":
      handlePausedInput(inputKey);
      break;
    case "gameover":
      handleGameOverInput(inputKey);
      break;
    case "enterName":
      handleNameEntryInput(inputKey);
      break;
    default:
      showMenu();
  }
}

function normalizeKey(key: string): InputKey {
  if (key === "\x1b[A" || key === "w") return "up";
  if (key === "\x1b[B" || key === "s") return "down";
  if (key === "\x1b[C" || key === "d") return "right";
  if (key === "\x1b[D" || key === "a") return "left";
  if (key === " ") return "push";
  if (key === "\r" || key === "\n") return "enter";
  if (key === "\x1b") return "escape";
  if (key === "\x7f" || key === "\b") return "backspace";
  return key.toLowerCase();
}

function handleMenuInput(key: InputKey): void {
  if (key === "up") {
    gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
    showMenu();
  } else if (key === "down") {
    gameData.menuSelection = Math.min(
      MENU_OPTIONS.length - 1,
      gameData.menuSelection + 1
    );
    showMenu();
  } else if (key === "enter" || key === "push") {
    if (gameData.menuSelection === 0) startGame();
    else if (gameData.menuSelection === 1) showHighscores();
    else if (gameData.menuSelection === 2) showHelp();
    else {
      cleanup();
      doorContext?.close();
    }
  } else if (key === "q" || key === "escape") {
    cleanup();
    doorContext?.close();
  }
}

function handleGameInput(key: InputKey): void {
  if (key === "up" || key === "down" || key === "left" || key === "right") {
    game?.handleDirection(key as Direction);
  } else if (key === "push") {
    game?.handlePush();
  } else if (key === "p") {
    showPauseScreen();
  } else if (key === "q" || key === "escape") {
    gameData.state = "menu";
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    showMenu();
  }
}

function showPauseScreen(): void {
  gameData.state = "paused";
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 30,
    height: 6,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    content: "{yellow-fg}PAUSED{/}\n\n{white-fg}Press P to resume{/}",
  });
  screen.render();
}

function handlePausedInput(key: InputKey): void {
  if (key === "p") {
    if (menuBox) {
      menuBox.destroy();
      menuBox = null;
    }
    gameData.state = "playing";
    game?.render();
  } else if (key === "q" || key === "escape") {
    gameData.state = "menu";
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    showMenu();
  }
}

function handleGameOverInput(key: InputKey): void {
  if (key === "enter" || key === "push") {
    const lowest =
      gameData.highscores[gameData.highscores.length - 1]?.score || 0;
    if (gameData.score > lowest || gameData.highscores.length < 10) {
      gameData.state = "enterName";
      gameData.playerName = "";
      showNameEntry();
    } else showMenu();
  } else if (key === "q" || key === "escape") showMenu();
}

function showNameEntry(): void {
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 35,
    height: 11,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    content: `{yellow-fg}NEW HIGH SCORE!{/}\n\n{white-fg}Score: {yellow-fg}${
      gameData.score
    }{/}\n\n{cyan-fg}Enter initials:{/}\n\n{white-fg}[ ${gameData.playerName.padEnd(
      3,
      "_"
    )} ]{/}\n\n{gray-fg}ENTER when done{/}`,
  });
  screen.render();
}

async function handleNameEntryInput(key: InputKey): Promise<void> {
  if (key === "enter" && gameData.playerName.length > 0) {
    try {
      await rpcHandlers.saveHighscore({
        name: gameData.playerName,
        score: gameData.score,
        level: gameData.level,
      });
    } catch {
      /* ignore */
    }
    showMenu();
  } else if (key === "backspace" && gameData.playerName.length > 0) {
    gameData.playerName = gameData.playerName.slice(0, -1);
    showNameEntry();
  } else if (key === "escape") {
    showMenu();
  } else if (
    typeof key === "string" &&
    key.length === 1 &&
    /[A-Za-z0-9]/.test(key) &&
    gameData.playerName.length < 3
  ) {
    gameData.playerName += key.toUpperCase();
    showNameEntry();
  }
}

let keepAlive: ReturnType<typeof setInterval> | null = null;
// doorContext already declared above

function cleanup(): void {
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
  if (screen) {
    screen.removeAllListeners();
    screen.destroy();
  }
}

door.onStart(async (ctx: any) => {
  doorContext = ctx;
  gameData = createInitialGameData();

  // Prevent event loop from emptying
  keepAlive = setInterval(() => {}, 60000);

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    /* cached */
  }
  initScreen();
  showMenu();
});

door.onInput((ctx: any, key: any) => handleInput(key.raw || key.key || key));
door.onClose(() => cleanup());
door.onError((ctx: any, error: Error) => {
  console.error("[Pengo] Error:", error);
  cleanup();
});

export default door;
