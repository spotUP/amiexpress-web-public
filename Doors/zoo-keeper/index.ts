/**
 * Zoo Keeper - Server/Fallback Door Entry Point
 * 1982 Taito arcade game port for AmiExpress BBS
 *
 * This file serves as:
 * 1. The fallback door for terminal-only sessions (no audio)
 * 2. The server entry point for hybrid door mode
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { arcadeMenu, moveSelection, ArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/door-input-manager";
import { ZooKeeperGame } from "./game/zoo-stage";
import { createInitialGameData } from "./game/initial-data";
import { rpcHandlers } from "./server";
import { ZooKeeperData, GameState, InputKey, Direction } from "./game/types";
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  COLORS,
  DEFAULT_HIGHSCORES,
} from "./game/constants";

// Export RPC handlers for hybrid mode
export { rpcHandlers };

/**
 * Create initial game data
 */

/**
 * Main door entry point
 */
const door = new Door({
  name: "Zoo Keeper",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: ZooKeeperData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: ZooKeeperGame | null = null;
let doorContext: any; // Will be set on start
let inputManager: DoorInputManager | null = null;

/**
 * Initialize neo-blessed screen
 */
function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Zoo Keeper",
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
    // blessed.box() is a Panel here, and a Panel injects a line border
    // whenever `border` is absent from the options. On a ONE-ROW box that
    // border IS the whole box, so the HUD never appeared at all.
    border: undefined,
    content: formatHUD(),
  });

  // Main game area
  gameArea = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: "100%",
    height: SCREEN_HEIGHT - 4,
    fixed: true,
    tags: true,
    // The stages lay the board out themselves: one line per row, exactly
    // GAME_AREA.width characters wide. Word wrapping a line that already
    // fills the box pushes a blank row in after every real row, so the board
    // renders on every OTHER line - reported as "the lines are too long,
    // every second one is black".
    wrap: false,
    // ...and the same Panel default steals two columns and two rows, which
    // is what makes an 80-column row overflow a box that only has 78.
    border: undefined,
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
    border: { type: "line", fg: "gray" },
    style: {},
    content: "{gray-fg}Arrow Keys: Move | Space: Jump | P: Pause | Q: Quit{/}",
  });
}

/**
 * Format HUD display
 */
function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(gameData.lives);
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {red-fg}LIVES: ${livesStr}{/}`;
}

/**
 * Show main menu
 */
/**
 * Enter the main menu: reset to the first option, then draw it.
 *
 * Use this when ARRIVING at the menu. To redraw the menu after the
 * selection moves, call renderMenu() - calling showMenu() there would
 * reset menuSelection back to 0 on every keypress, which is exactly the
 * bug that made arrow up/down appear to do nothing.
 */
function showMenu(): void {
  gameData.state = "menu";
  gameData.menuSelection = 0;
  renderMenu();
}

/**
 * Draw the main menu for the CURRENT selection, without changing it.
 */
function renderMenu(): void {

  // Clear game area
  gameArea.setContent("");

  // Create menu box
  if (menuBox) {
    menuBox.destroy();
  }

  const menuContent = [
    "{yellow-fg}",
    "  ______   ___    ___   ",
    " |___  /  / _ \\  / _ \\  ",
    "    / /  | | | || | | | ",
    "   / /   | |_| || |_| | ",
    "  / /__   \\___/  \\___/  ",
    " /_____|               ",
    "  _  __                            ",
    " | |/ / ___   ___  _ __   ___  _ __ ",
    " | ' / / _ \\ / _ \\| '_ \\ / _ \\| '__|",
    " | . \\|  __/|  __/| |_) |  __/| |   ",
    " |_|\\_\\\\___| \\___|| .__/ \\___||_|   ",
    "                  |_|              ",
    "{/}",
    "",
    "{white-fg}Classic 1982 Taito Arcade Game{/}",
    "",
  ];

  // Add menu options
  // Arkanoid's menu, from the shared arcade shell: centred rows, the
  // selected one picked out, and one hint line. The door keeps its own
  // logo above this - Arkanoid's title is two lines of text, and these
  // games have their own.
  menuContent.push(...arcadeMenu({
    title: [],
    options: MENU_OPTIONS,
    selection: gameData.menuSelection,
    width: 48,
  }));

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 50,
    height: menuContent.length + 2,
    tags: true,
    border: { type: "line", fg: "yellow" },
    style: {
      fg: "white",
      bg: "black",
    },
    content: menuContent.join("\n"),
  });

  screen.render();
}

/**
 * Show high scores
 */
async function showHighscores(): Promise<void> {
  sfx?.play("select");
  gameData.state = "highscores";

  // Try to load from server
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
    width: 40,
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
  sfx?.play("select");
  const content = [
    "{yellow-fg}HOW TO PLAY{/}",
    "",
    "{cyan-fg}ZOO STAGE:{/}",
    "Run around the perimeter to build walls.",
    "Keep the animals contained inside!",
    "Collect the NET to capture escaped animals.",
    "",
    "{cyan-fg}PLATFORM STAGE:{/}",
    "Jump up the platforms to rescue Zelda!",
    "Avoid the coconuts thrown by the monkey.",
    "",
    "{cyan-fg}STAMPEDE STAGE:{/}",
    "Jump over the charging animals!",
    "Reach the top for an extra life.",
    "",
    "{white-fg}CONTROLS:{/}",
    "Arrow Keys - Move",
    "Space      - Jump",
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
  sfx?.play("start");
  gameData.state = "playing";
  gameData.score = 0;
  gameData.lives = STARTING_LIVES;
  gameData.level = 1;
  gameData.round = 1;

  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  // Initialize game engine
  game = new ZooKeeperGame(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
    // Every event that changes the board repaints it, so this is the
    // one place that sees them all.
    if (sfx && game) sfx.flush(game.cues);
  });

  game.initZooStage();

  // Start game loop
  if (gameLoop) {
    clearInterval(gameLoop);
  }

  gameLoop = setInterval(() => {
    if (
      gameData.state === "playing" ||
      gameData.state === "platform" ||
      gameData.state === "stampede"
    ) {
      pollHeldDirections();
      game?.update();
    }
    // The state can change inside update() - a wave finished, a last life
    // lost - and those paths return before the game repaints. Draining here
    // as well means the sound still lands on the tick it happened on.
    if (sfx && game) sfx.flush(game.cues);
  }, GAME_TICK_MS);
}

/**
 * Step the keeper for whichever directions are held down.
 *
 * Called once per game tick, replacing movement driven by the character
 * stream - that stream is the client's auto-repeat (one character, a ~400ms
 * gap, then a burst), which is what made movement stutter.
 */
function pollHeldDirections(): void {
  if (!inputManager?.isKeyStateActive()) return;
  for (const dir of ["up", "down", "left", "right"] as Direction[]) {
    if (inputManager.consumeRepeat(dir, { repeatRate: 90 })) {
      game?.handleDirection(dir);
    }
  }
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
    case "platform":
    case "stampede":
      handleGameInput(inputKey);
      break;

    case "paused":
      if (inputKey === "p" || inputKey === "escape") {
        gameData.state = "playing";
        game?.render();
      }
      break;

    case "gameover":
      handleGameOverInput(inputKey);
      break;

    case "enterName":
      handleNameEntryInput(inputKey);
      break;

    default:
      // Help screen or other - return to menu
      showMenu();
  }
}

/**
 * Normalize key input
 */
function normalizeKey(key: string): InputKey {
  // Handle arrow keys and special keys
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
      gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, -1);
      sfx?.play("blip");
      renderMenu();
      break;

    case "down":
      gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, +1);
      sfx?.play("blip");
      renderMenu();
      break;

    case "enter":
    case "space":
      switch (gameData.menuSelection) {
        case 0: // Start Game
          startGame();
          break;
        case 1: // High Scores
          showHighscores();
          break;
        case 2: // Help
          showHelp();
          break;
        case 3: // Quit
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
      // Held keys drive movement when real key edges are available; acting
      // on the character too would move twice per press.
      if (inputManager?.isKeyStateActive()) break;
      game?.handleDirection(key as Direction);
      break;

    case "space":
      game?.handleJump();
      break;

    case "p":
      gameData.state = "paused";
      showPauseScreen();
      break;

    case "q":
    case "escape":
      // Confirm quit
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
    // Check if high score
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
      // Save high score
      try {
        await rpcHandlers.saveHighscore({
          name: gameData.playerName,
          score: gameData.score,
          level: gameData.level,
        });
      } catch {
        // Failed to save, continue anyway
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

/**
 * Sound effects, over the session socket to the browser.
 *
 * Null over telnet and until the door starts; every call site treats that
 * as "nobody is listening", which is the truth rather than an error.
 */
let sfx: ArcadeSfx | null = null;

function cleanup(): void {
  if (sfx) {
    sfx.destroy();
    sfx = null;
  }

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
  // A browser session has a socket; a telnet one does not, and ArcadeSfx
  // treats a missing socket as "nobody is listening" rather than an error.
  sfx = new ArcadeSfx(ctx?.socket);

  doorContext = ctx;
  gameData = createInitialGameData();

  // Prevent event loop from emptying
  keepAlive = setInterval(() => {}, 60000);

  // Load high scores
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
    trackHeldKeys: true,    // Move from held keys, not the auto-repeat stream
    debug: false,
    debugName: 'ZooKeeper'
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
  console.error("[Zoo Keeper] Error:", error);
  cleanup();
});

// Export for SDK
export default door;
