/**
 * Donkey Kong - Server/Fallback Door Entry Point
 * 1981 Nintendo arcade classic
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { DonkeyKongGame } from "./game/donkey-kong-game";
import { rpcHandlers } from "./server";
import { DonkeyKongData, InputKey, Direction } from "./game/types";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
  STAGE_ORDER,
} from "./game/constants";

export { rpcHandlers };

function createInitialGameData(): DonkeyKongData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    stage: "barrels",
    stageIndex: 0,

    player: {
      x: 4,
      y: 19,
      vx: 0,
      vy: 0,
      direction: "right",
      isJumping: false,
      isOnGround: true,
      isClimbing: false,
      climbFrame: 0,
      walkFrame: 0,
      hasHammer: false,
      hammerTimer: 0,
      hammerFrame: 0,
      isAlive: true,
      respawnTimer: 0,
      invincibleTimer: 0,
    },
    barrels: [],
    fireBalls: [],
    springs: [],

    girders: [],
    ladders: [],
    rivets: [],
    hammers: [],
    elevators: [],
    conveyors: [],

    paulineX: 16,
    paulineY: 1,
    dkX: 4,
    dkY: 3,
    dkFrame: 0,
    dkThrowTimer: 120,

    barrelIdCounter: 0,
    fireballIdCounter: 0,
    springIdCounter: 0,
    bonusTimer: 5000,
    jumpScore: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

const door = new Door({
  name: "Donkey Kong",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: DonkeyKongData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: DonkeyKongGame | null = null;
let doorContext: any; // Will be set on start

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Donkey Kong",
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
    fixed: true,
    parent: screen,
    top: 1,
    left: 0,
    width: GAME_WIDTH * 2,
    height: GAME_HEIGHT + 1,
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
      "{gray-fg}Arrows: Move/Climb | Space: Jump | P: Pause | Q: Quit{/}",
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(7, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  const bonusStr = Math.floor(gameData.bonusTimer / 100)
    .toString()
    .padStart(2, "0");
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}L${gameData.level}{/}  {magenta-fg}BONUS: ${bonusStr}00{/}  {red-fg}${livesStr}{/}`;
}

function showMenu(): void {
  gameData.state = "menu";
  gameData.menuSelection = 0;
  gameArea.setContent("");

  if (menuBox) menuBox.destroy();

  const menuContent = [
    "{yellow-fg}",
    " ____   ___  _   _ _  _________   __",
    "|  _ \\ / _ \\| \\ | | |/ / ____\\ \\ / /",
    "| | | | | | |  \\| |  /|  _|   \\ V / ",
    "| |_| | |_| | |\\  | . \\| |___   | |  ",
    "|____/ \\___/|_| \\_|_|\\_\\_____|  |_|  ",
    "       _  _____ _   _  ____         ",
    "      | |/ /_ _| \\ | |/ ___|        ",
    "      |   / | ||  \\| | |  _         ",
    "      |  <  | || |\\  | |_| |        ",
    "      |_|\\_\\___|_| \\_|\\____|        ",
    "{/}",
    "",
    "{white-fg}Nintendo 1981{/}",
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
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 44,
    height: menuContent.length + 2,
    tags: true,
    border: { type: "line" },
    style: { fg: "white", bg: "black", border: { fg: "yellow" } },
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
    "{white-fg}RANK  NAME   SCORE    LEVEL{/}",
    "{gray-fg}----  ----  -------   -----{/}",
  ];
  gameData.highscores.slice(0, 10).forEach((score, i) => {
    content.push(
      `{cyan-fg}${(i + 1)
        .toString()
        .padStart(2)}.{/}   {white-fg}${score.name.padEnd(
        4
      )}{/}  {yellow-fg}${score.score
        .toString()
        .padStart(7)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`
    );
  });
  content.push("", "{gray-fg}Press any key to return{/}");

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 38,
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
    "Climb to rescue Pauline from DK!",
    "",
    "{green-fg}CONTROLS:{/}",
    "Left/Right - Walk",
    "Up/Down - Climb ladders",
    "Space - Jump",
    "",
    "{magenta-fg}HAZARDS:{/}",
    "{yellow-fg}O{/} - Barrels (jump over or smash)",
    "{red-fg}F{/} - Fireballs (avoid!)",
    "{white-fg}t{/} - Hammers (grab to smash!)",
    "",
    "{white-fg}TIP:{/} Jump barrels for 100 pts!",
    "",
    "{gray-fg}Press any key to return{/}",
  ];

  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 42,
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

  game = new DonkeyKongGame(
    gameData,
    (content: string) => {
      gameArea.setContent(content);
      hudBox.setContent(formatHUD());
      screen.render();
    },
    () => showGameOver(),
    () => showStageComplete()
  );
  game.initStage();

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => {
    if (gameData.state === "playing") game?.update();
  }, GAME_TICK_MS);
}

function showStageComplete(): void {
  if (menuBox) menuBox.destroy();

  const stageName = gameData.stage.toUpperCase();
  const content = [
    "{green-fg}STAGE COMPLETE!{/}",
    "",
    `{white-fg}${stageName} cleared!{/}`,
    `{yellow-fg}Bonus: ${gameData.bonusTimer}{/}`,
    "",
    "{gray-fg}Press SPACE for next stage{/}",
  ];

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 35,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "green" }, bg: "black" },
    content: content.join("\n"),
  });
  screen.render();
}

function nextStage(): void {
  gameData.stageIndex++;

  // Level up after completing all stages
  if (gameData.stageIndex >= STAGE_ORDER.length) {
    gameData.stageIndex = 0;
    gameData.level++;
  }

  gameData.state = "playing";
  gameData.bonusTimer = 5000;
  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }
  game?.initStage();
}

function showGameOver(): void {
  if (menuBox) menuBox.destroy();
  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 30,
    height: 8,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "red" }, bg: "black" },
    content: `{red-fg}GAME OVER{/}\n\n{white-fg}Final Score: {yellow-fg}${gameData.score}{/}\n{white-fg}Level: {cyan-fg}${gameData.level}{/}\n\n{gray-fg}Press ENTER{/}`,
  });
  screen.render();
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
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
    case "help":
      showMenu();
      break;
    case "playing":
      handleGameInput(inputKey);
      break;
    case "paused":
      handlePausedInput(inputKey);
      break;
    case "stageComplete":
      handleStageCompleteInput(inputKey);
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
  if (key === " ") return "jump";
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
  } else if (key === "enter" || key === "jump") {
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
  if (key === "left") {
    game?.handleMove("left");
  } else if (key === "right") {
    game?.handleMove("right");
  } else if (key === "up") {
    game?.handleClimb("up");
  } else if (key === "down") {
    game?.handleClimb("down");
  } else if (key === "jump") {
    game?.handleJump();
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
    fixed: true,
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

function handleStageCompleteInput(key: InputKey): void {
  if (key === "jump" || key === "enter") {
    nextStage();
  } else if (key === "q" || key === "escape") {
    if (gameLoop) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
    showMenu();
  }
}

function handleGameOverInput(key: InputKey): void {
  if (key === "enter" || key === "jump") {
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
    fixed: true,
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
  console.error("[Donkey Kong] Error:", error);
  cleanup();
});

export default door;
