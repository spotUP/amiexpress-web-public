/**
 * Frogger - Server/Fallback Door Entry Point
 * 1981 Konami arcade game port for AmiExpress BBS
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import { GamepadInputManager } from "@amiexpress/bbs-door-sdk/utils/gamepad-input-manager";
import { GamepadButton } from "@amiexpress/bbs-door-sdk/types/gamepad";
import { FroggerGame } from "./game/frogger-game";
import { rpcHandlers } from "./server";
import { FroggerData, GameState, InputKey, Direction } from "./game/types";
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  GAME_AREA_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  INITIAL_TIME,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
  HOME_POSITIONS,
} from "./game/constants";

// Export RPC handlers for hybrid mode
export { rpcHandlers };

/**
 * Create initial game data
 */
function createInitialGameData(): FroggerData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    timeRemaining: INITIAL_TIME,

    frog: {
      x: 20,
      y: 12,
      direction: "up",
      isJumping: false,
      jumpProgress: 0,
      isDead: false,
      deathType: null,
      deathFrame: 0,
      onObject: null,
    },

    lanes: [],
    homes: [],
    homesCompleted: 0,

    vehicleIdCounter: 0,
    riverObjectIdCounter: 0,

    flyTimer: 0,
    alligatorTimer: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

/**
 * Main door instance
 */
const door = new Door({
  name: "Frogger",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: FroggerData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: FroggerGame | null = null;
let doorContext: any; // Will be set on start
let inputManager: DoorInputManager | null = null;
let gamepadManager: GamepadInputManager | null = null;

/**
 * Initialize neo-blessed screen
 */
function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Frogger",
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
    height: GAME_AREA_HEIGHT,
    tags: true,
    style: { bg: "black" },
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
    style: { border: { fg: "gray" } },
    content: "{gray-fg}Arrow Keys: Hop | P: Pause | Q: Quit{/}",
  });
}

/**
 * Format HUD display
 */
function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  const homesStr = gameData.homesCompleted.toString();
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {green-fg}HOMES: ${homesStr}/5{/}  {red-fg}LIVES: ${livesStr}{/}`;
}

/**
 * Show main menu
 */
function showMenu(): void {
  gameData.state = "menu";
  gameData.menuSelection = 0;

  gameArea.setContent("");

  if (menuBox) {
    menuBox.destroy();
  }

  const menuContent = [
    "{green-fg}",
    "  _____                                 ",
    " |  ___| __ ___   __ _  __ _  ___ _ __  ",
    " | |_ | '__/ _ \\ / _` |/ _` |/ _ \\ '__| ",
    " |  _|| | | (_) | (_| | (_| |  __/ |    ",
    " |_|  |_|  \\___/ \\__, |\\__, |\\___|_|    ",
    "                 |___/ |___/            ",
    "{/}",
    "",
    "{white-fg}Classic 1981 Konami Arcade Game{/}",
    "",
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    const prefix = selected ? "> " : "  ";
    const color = selected ? "cyan" : "white";
    menuContent.push(`{${color}-fg}${prefix}${option}{/}`);
  });

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 50,
    height: menuContent.length + 2,
    tags: true,
    border: { type: "line" },
    style: { fg: "white", bg: "black", border: { fg: "green" } },
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
    // Use cached/default scores
  }

  const content = [
    "{yellow-fg}HIGH SCORES{/}",
    "",
    "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
    "{gray-fg}----  ----  --------   -----{/}",
  ];

  gameData.highscores.slice(0, 10).forEach((score, index) => {
    const rank = (index + 1).toString().padStart(2, " ");
    const name = score.name.padEnd(4, " ");
    const scoreStr = score.score.toString().padStart(8, " ");
    const level = score.level.toString().padStart(2, " ");
    content.push(
      `{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}`
    );
  });

  content.push("", "{gray-fg}Press any key to return{/}");

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    fixed: true,
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

/**
 * Show help screen
 */
function showHelp(): void {
  const content = [
    "{yellow-fg}HOW TO PLAY{/}",
    "",
    "{green-fg}OBJECTIVE:{/}",
    "Guide your frog to one of the 5 homes",
    "at the top of the screen.",
    "",
    "{cyan-fg}OBSTACLES:{/}",
    "Avoid cars and trucks on the road.",
    "Use logs and turtles to cross the river.",
    "Watch out - turtles dive underwater!",
    "",
    "{white-fg}CONTROLS:{/}",
    "Arrow Keys - Hop in direction",
    "P          - Pause",
    "Q          - Quit",
    "",
    "{magenta-fg}SCORING:{/}",
    "Each hop forward:     10 pts",
    "Reaching home:        50 pts",
    "Bonus fly:           200 pts",
    "Level complete:    1,000 pts",
    "",
    "{gray-fg}Press any key to return{/}",
  ];

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    fixed: true,
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

/**
 * Start the game
 */
function startGame(): void {
  gameData.state = "playing";
  gameData.score = 0;
  gameData.lives = STARTING_LIVES;
  gameData.level = 1;
  gameData.homesCompleted = 0;
  gameData.homes = [];

  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  game = new FroggerGame(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
  });

  game.initLevel();

  if (gameLoop) clearInterval(gameLoop);

  gameLoop = setInterval(() => {
    if (gameData.state === "playing") {
      game?.update();
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
      handlePausedInput(inputKey);
      break;
    case "gameover":
      handleGameOverInput(inputKey);
      break;
    case "enterName":
      handleNameEntryInput(inputKey);
      break;
    case "levelComplete":
      // Wait for transition
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
      game?.handleDirection(key as Direction);
      break;
    case "p":
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

/**
 * Handle paused state input
 */
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
    "",
    "{cyan-fg}Enter your initials:{/}",
    "",
    `{white-fg}[ ${gameData.playerName.padEnd(3, "_")} ]{/}`,
    "",
    "{gray-fg}Press ENTER when done{/}",
  ];

  if (menuBox) menuBox.destroy();

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 35,
    height: content.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
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

  // Clean up gamepad manager
  if (gamepadManager) {
    gamepadManager.destroy();
    gamepadManager = null;
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
  screen.program.write('\x1b[2J');
  screen.program.write('\x1b[H');
  screen.clearRegion(0, screen.width, 0, screen.height);
  screen.alloc();

  // Set up input management (enables mouse, keyboard routing)
  inputManager = new DoorInputManager(ctx, screen, {
    enableGameMode: true,   // Game needs raw keyboard input
    enableGrabKeys: true,   // Capture all keys for game controls
    enableMouse: true,      // Enable mouse events
    debug: false,
    debugName: 'Frogger'
  });
  inputManager.enable();

  // Set up gamepad support
  gamepadManager = new GamepadInputManager(ctx.session);

  // D-pad for frog movement
  gamepadManager.on('dpad:up', () => {
    if (gameData.state === 'playing') {
      game?.handleDirection('up');
    } else if (gameData.state === 'menu') {
      gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
      showMenu();
    }
  });

  gamepadManager.on('dpad:down', () => {
    if (gameData.state === 'playing') {
      game?.handleDirection('down');
    } else if (gameData.state === 'menu') {
      gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
      showMenu();
    }
  });

  gamepadManager.on('dpad:left', () => {
    if (gameData.state === 'playing') {
      game?.handleDirection('left');
    }
  });

  gamepadManager.on('dpad:right', () => {
    if (gameData.state === 'playing') {
      game?.handleDirection('right');
    }
  });

  // A button for select/confirm
  gamepadManager.on('button:a', (pressed) => {
    if (!pressed) return;

    if (gameData.state === 'menu') {
      switch (gameData.menuSelection) {
        case 0: startGame(); break;
        case 1: showHighscores(); break;
        case 2: showHelp(); break;
        case 3: cleanup(); doorContext?.close(); break;
      }
    } else if (gameData.state === 'highscores') {
      showMenu();
    }
  });

  // START button for pause
  gamepadManager.on('button:start', (pressed) => {
    if (!pressed) return;

    if (gameData.state === 'playing') {
      showPauseScreen();
    } else if (gameData.state === 'paused') {
      if (menuBox) {
        menuBox.destroy();
        menuBox = null;
      }
      gameData.state = 'playing';
      game?.render();
    }
  });

  // B or SELECT button for back/quit
  gamepadManager.on('button:b', (pressed) => {
    if (!pressed) return;

    if (gameData.state === 'playing' || gameData.state === 'paused') {
      gameData.state = 'menu';
      if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
      }
      showMenu();
    } else if (gameData.state === 'menu') {
      cleanup();
      doorContext?.close();
    }
  });

  gamepadManager.on('button:select', (pressed) => {
    if (!pressed) return;
    if (gameData.state === 'playing' || gameData.state === 'paused') {
      gameData.state = 'menu';
      if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
      }
      showMenu();
    }
  });

  showMenu();
});

door.onInput((ctx: any, key: any) => {
  handleInput(key.raw || key.key || key);
});

door.onClose(() => {
  cleanup();
});

door.onError((ctx: any, error: Error) => {
  console.error("[Frogger] Error:", error);
  cleanup();
});

// Export for SDK
export default door;
