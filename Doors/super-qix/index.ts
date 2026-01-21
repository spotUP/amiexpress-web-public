/**
 * Super Qix - Server/Fallback Door Entry Point
 * 1987 Taito arcade game port for AmiExpress BBS
 *
 * This file serves as:
 * 1. The fallback door for terminal-only sessions (no audio)
 * 2. The server entry point for hybrid door mode
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import { QixEngine } from "./game/qix-engine";
import { rpcHandlers } from "./server";
import { SuperQixData, GameState, InputKey, Direction } from "./game/types";
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  COLORS,
  DEFAULT_HIGHSCORES,
  FIELD_WIDTH,
  FIELD_HEIGHT,
} from "./game/constants";

// Export RPC handlers for hybrid mode
export { rpcHandlers };

/**
 * Create initial game data
 */
function createInitialGameData(): SuperQixData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    claimedPercent: 0,
    targetPercent: 75,
    scoreMultiplier: 1,

    field: [],
    fieldWidth: FIELD_WIDTH,
    fieldHeight: FIELD_HEIGHT,

    marker: {
      x: Math.floor(FIELD_WIDTH / 2),
      y: FIELD_HEIGHT - 1,
      isDrawing: false,
      drawSpeed: null,
      hasShield: false,
      speedBoost: false,
      speedBoostTimer: 0,
    },

    currentStix: null,

    qixList: [],
    sparxList: [],
    fuse: null,
    qixIdCounter: 0,
    sparxIdCounter: 0,

    powerUps: [],
    powerUpIdCounter: 0,
    collectedLetters: [],
    levelWord: "",
    activeEffects: [],

    borderPath: [],

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",
    playerNameCursor: 0,

    lastUpdateTime: Date.now(),
    frameCount: 0,
    levelStartTime: Date.now(),
    stopTimer: 0,

    transitionTimer: 0,
    transitionMessage: "",
  };
}

/**
 * Main door entry point
 */
const door = new Door({
  name: "Super Qix",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: SuperQixData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let engine: QixEngine | null = null;
let isDrawKeyHeld: boolean = false;
let currentDrawSpeed: "fast" | "slow" | null = null;
let doorContext: any; // Will be set on start
let inputManager: DoorInputManager | null = null;

/**
 * Initialize neo-blessed screen
 */
function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Super Qix",
    fullUnicode: false,
    output: (data: string) => doorContext?.output.write(data),
    input: null as any,
  } as any);

  // HUD at top
  hudBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: formatHUD(),
  });

  // Main game area
  gameArea = blessed.box({
    fixed: true,
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    height: SCREEN_HEIGHT - 4,
    tags: true,
    style: {
      bg: "black",
    },
  });

  // Footer with controls
  footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "gray" },
    },
    content:
      "{gray-fg}Arrows: Move | Z: Slow Draw | X: Fast Draw | P: Pause | Q: Quit{/}",
  });
}

/**
 * Format HUD display
 */
function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(gameData.lives);
  const percentStr = Math.floor(gameData.claimedPercent)
    .toString()
    .padStart(2, " ");
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LVL: ${gameData.level}{/}  {green-fg}CLAIMED: ${percentStr}%{/}  {red-fg}LIVES: ${livesStr}{/}`;
}

/**
 * Show main menu
 */
function showMenu(): void {
  gameData.state = "menu";
  gameData.menuSelection = 0;

  if (gameArea) {
    gameArea.setContent("");
  }

  if (menuBox) {
    menuBox.destroy();
  }

  const menuContent = [
    "{magenta-fg}",
    "   ____  _   _ ____  _____ ____  ",
    "  / ___|| | | |  _ \\| ____|  _ \\ ",
    "  \\___ \\| | | | |_) |  _| | |_) |",
    "   ___) | |_| |  __/| |___|  _ < ",
    "  |____/ \\___/|_|   |_____|_| \\_\\",
    "         ___  _____  __",
    "        / _ \\|_ _\\ \\/ /",
    "       | | | || | \\  / ",
    "       | |_| || | /  \\ ",
    "        \\__\\_\\___/_/\\_\\",
    "{/}",
    "",
    "{white-fg}Classic 1987 Taito Arcade Game{/}",
    "",
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    const prefix = selected ? "{cyan-fg}> " : "{white-fg}  ";
    const suffix = selected ? "{/}" : "{/}";
    menuContent.push(`${prefix}${option}${suffix}`);
  });

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 45,
    height: menuContent.length + 2,
    tags: true,
    border: { type: "line", fg: "magenta" },
    style: {
      fg: "white",
      bg: "black",
      // focus: { border: { fg: 'cyan' } },
      // hover: { border: { fg: 'cyan' } },
    },
    content: menuContent.join("\n"),
  });

  screen.render();
}

/**
 * Show high scores
 */
async function showHighscores(): Promise<void> {
  gameData.state = "highscores";

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    // Use cached scores
  }

  const content = [
    "{yellow-fg}HIGH SCORES{/}",
    "",
    "{white-fg}RANK  NAME   SCORE     LVL  MAX%{/}",
    "{gray-fg}----  ----  --------   ---  ----{/}",
  ];

  gameData.highscores.slice(0, 10).forEach((score, index) => {
    const rank = (index + 1).toString().padStart(2, " ");
    const name = score.name.padEnd(4, " ");
    const scoreStr = score.score.toString().padStart(8, " ");
    const level = score.level.toString().padStart(2, " ");
    const percent = (score.maxPercent || 75).toString().padStart(3, " ");
    content.push(
      `{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}  {magenta-fg}${percent}%{/}`
    );
  });

  content.push("");
  content.push("{gray-fg}Press any key to return{/}");

  if (menuBox) {
    menuBox.destroy();
  }

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 45,
    height: content.length + 2,
    tags: true,
    border: { type: "line", fg: "yellow" },
    style: {},
    content: content.join("\n"),
  });

  screen.render();
}

/**
 * Show help screen
 */
function showHelp(): void {
  const content = [
    "{yellow-fg}HOW TO PLAY{/}",
    "",
    "{cyan-fg}OBJECTIVE:{/}",
    "Claim 75%+ of the playfield by drawing",
    "lines that enclose areas without the Qix.",
    "",
    "{cyan-fg}ENEMIES:{/}",
    "{magenta-fg}*{/} Qix - Bounces in unclaimed area",
    "{red-fg}+{/} Sparx - Patrols the borders",
    "{yellow-fg}~{/} Fuse - Burns if you stop drawing",
    "",
    "{cyan-fg}POWER-UPS:{/}",
    "S=Speed, H=Shield, F=Freeze, W=Warp",
    "Letters spell word for auto-complete!",
    "",
    "{white-fg}CONTROLS:{/}",
    "Arrow Keys - Move marker",
    "Z          - Slow Draw (2x points)",
    "X          - Fast Draw",
    "P          - Pause",
    "Q          - Quit",
    "",
    "{gray-fg}Press any key to return{/}",
  ];

  if (menuBox) {
    menuBox.destroy();
  }

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 50,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "cyan" },
    },
    content: content.join("\n"),
  });

  screen.render();
}

/**
 * Start the game
 */
function startGame(): void {
  gameData.state = "playing";
  gameData.score = 0;
  gameData.lives = STARTING_LIVES;
  gameData.level = 1;

  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  // Initialize game engine
  engine = new QixEngine(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
  });

  engine.initLevel(1);

  // Start game loop
  if (gameLoop) {
    clearInterval(gameLoop);
  }

  gameLoop = setInterval(() => {
    if (gameData.state === "playing") {
      engine?.update();
    } else if (gameData.state === "levelTransition") {
      gameData.transitionTimer--;
      if (gameData.transitionTimer <= 0) {
        engine?.advanceLevel();
      }
    }
  }, GAME_TICK_MS);
}

/**
 * Handle input
 */
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
      if (inputKey === "p" || inputKey === "escape") {
        gameData.state = "playing";
        engine?.render();
      }
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

/**
 * Normalize key input
 */
function normalizeKey(key: string): InputKey {
  if (key === "\x1b[A" || key === "w" || key === "W") return "up";
  if (key === "\x1b[B" || key === "s" || key === "S") return "down";
  if (key === "\x1b[C" || key === "d" || key === "D") return "right";
  if (key === "\x1b[D" || key === "a" || key === "A") return "left";
  if (key === " ") return "space";
  if (key === "\r" || key === "\n") return "enter";
  if (key === "\x1b" || key === "\x1b\x1b") return "escape";
  if (key === "\x7f" || key === "\b") return "backspace";
  if (key === "\t") return "tab";
  return key.toLowerCase();
}

/**
 * Handle menu input
 */
function handleMenuInput(key: InputKey): void {
  switch (key) {
    case "up":
      gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
      showMenu();
      break;

    case "down":
      gameData.menuSelection = Math.min(
        MENU_OPTIONS.length - 1,
        gameData.menuSelection + 1
      );
      showMenu();
      break;

    case "enter":
    case "space":
      switch (gameData.menuSelection) {
        case 0:
          startGame();
          break;
        case 1:
          showHighscores();
          break;
        case 2:
          showHelp();
          break;
        case 3:
          cleanup();
          doorContext?.close();
          break;
      }
      break;

    case "q":
    case "escape":
      cleanup();
      doorContext?.close();
      break;
  }
}

/**
 * Handle game input
 */
function handleGameInput(key: InputKey): void {
  switch (key) {
    case "up":
    case "down":
    case "left":
    case "right":
      engine?.handleDirection(key as Direction);
      break;

    case "z":
      engine?.handleSlowDraw();
      break;

    case "x":
      engine?.handleFastDraw();
      break;

    case "p":
      gameData.state = "paused";
      showPauseScreen();
      break;

    case "q":
    case "escape":
      gameData.state = "menu";
      if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
      }
      showMenu();
      break;
  }
}

/**
 * Show pause screen
 */
function showPauseScreen(): void {
  const content = [
    "{yellow-fg}PAUSED{/}",
    "",
    "{white-fg}Press P to resume{/}",
    "{gray-fg}Press Q to quit{/}",
  ];

  if (menuBox) {
    menuBox.destroy();
  }

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 30,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "yellow" },
      bg: "black",
    },
    content: content.join("\n"),
  });

  screen.render();
}

/**
 * Handle game over input
 */
function handleGameOverInput(key: InputKey): void {
  if (key === "enter" || key === "space") {
    const lowestScore =
      gameData.highscores[gameData.highscores.length - 1]?.score || 0;
    if (gameData.score > lowestScore || gameData.highscores.length < 10) {
      gameData.state = "enterName";
      gameData.playerName = "";
      gameData.playerNameCursor = 0;
      showNameEntry();
    } else {
      showMenu();
    }
  } else if (key === "q" || key === "escape") {
    showMenu();
  }
}

/**
 * Show name entry screen
 */
function showNameEntry(): void {
  const content = [
    "{yellow-fg}NEW HIGH SCORE!{/}",
    "",
    `{white-fg}Score: {yellow-fg}${gameData.score}{/}`,
    `{white-fg}Level: {cyan-fg}${gameData.level}{/}`,
    "",
    "{cyan-fg}Enter your initials:{/}",
    "",
    `{white-fg}[ ${gameData.playerName.padEnd(3, "_")} ]{/}`,
    "",
    "{gray-fg}Press ENTER when done{/}",
  ];

  if (menuBox) {
    menuBox.destroy();
  }

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 35,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "yellow" },
      bg: "black",
    },
    content: content.join("\n"),
  });

  screen.render();
}

/**
 * Handle name entry input
 */
async function handleNameEntryInput(key: InputKey): Promise<void> {
  if (key === "enter") {
    if (gameData.playerName.length > 0) {
      try {
        await rpcHandlers.saveHighscore({
          name: gameData.playerName,
          score: gameData.score,
          level: gameData.level,
          maxPercent: Math.floor(gameData.claimedPercent),
        });
      } catch {
        // Continue anyway
      }
      showMenu();
    }
  } else if (key === "backspace") {
    if (gameData.playerName.length > 0) {
      gameData.playerName = gameData.playerName.slice(0, -1);
      showNameEntry();
    }
  } else if (key === "escape") {
    showMenu();
  } else if (
    typeof key === "string" &&
    key.length === 1 &&
    /[A-Za-z0-9]/.test(key)
  ) {
    if (gameData.playerName.length < 3) {
      gameData.playerName += key.toUpperCase();
      showNameEntry();
    }
  }
}

/**
 * Cleanup resources
 */
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

  // CRITICAL: Disable input manager FIRST (restores BBS input state)
  if (inputManager) {
    inputManager.disable();
    inputManager = null;
  }

  if (screen) {
    screen.removeAllListeners();
    screen.destroy();
  }
}

// Door lifecycle hooks
door.onStart(async (ctx: any) => {
  doorContext = ctx;
  gameData = createInitialGameData();

  // Prevent event loop from emptying
  keepAlive = setInterval(() => {}, 60000);

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    // Use defaults
  }

  initScreen();

  // Set up input management (enables mouse, keyboard routing)
  inputManager = new DoorInputManager(ctx, screen, {
    enableGameMode: true,   // Game needs raw keyboard input
    enableGrabKeys: true,   // Capture all keys for game controls
    enableMouse: true,      // Enable mouse events
    debug: false,
    debugName: 'SuperQix'
  });
  inputManager.enable();

  showMenu();
});

door.onInput((ctx: any, key: any) => {
  handleInput(key.raw || key.key || key);
});

door.onClose(() => {
  cleanup();
});

door.onError((ctx: any, error: Error) => {
  console.error("[Super Qix] Error:", error);
  cleanup();
});

// Export for SDK
export default door;
