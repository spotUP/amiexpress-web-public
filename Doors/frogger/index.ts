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
  attractScreen,
  titleLines,
  titleWidth,
  nextPhase,
  ATTRACT_ORDER,
  ATTRACT_FRAMES,
  AttractPhase,
} from "./game/attract";
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  GAME_AREA_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  INITIAL_TIME,
  MENU_OPTIONS,
  LIVES_OPTIONS,
  MAX_NAME_LENGTH,
  BG_COLORS,
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
    ladyFrogTimer: 0,
    otterTimer: 0,

    snakes: [],
    snakeIdCounter: 0,
    carryingLadyFrog: false,

    furthestRow: 12,
    hopPointsThisHome: 0,
    startingLives: STARTING_LIVES,
    extraLifeAwarded: false,
    frogStartTime: Date.now(),

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

/** How long the finished board stays up between levels, in ticks. */
const LEVEL_COMPLETE_FRAMES = 40;
let levelCompleteFrames = 0;

/** Attract mode state: which panel is up, and the demo game behind it. */
let attractLoop: ReturnType<typeof setInterval> | null = null;
let attractPhase: AttractPhase = "points";
let attractFrames = 0;
let demoGame: FroggerGame | null = null;
let demoData: FroggerData | null = null;

/** How often the demo player takes a hop, in ticks. */
const DEMO_HOP_FRAMES = 6;
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
    // One row tall, so an injected Panel border WOULD BE the whole box and
    // the score line would never appear at all.
    border: undefined,
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
    // The engine lays the board out itself: one line per lane, exactly
    // GRID_WIDTH * CELL_WIDTH characters wide. Word wrapping a line that
    // already fills the box pushes a blank row in after every real row, so
    // the board rendered on every OTHER line.
    wrap: false,
    // blessed.box() here returns a Panel, which injects a border of its own
    // unless told not to. That border stole two columns - which is what made
    // the full-width lines wrap - and its bottom edge showed as a stray line
    // across the top of the screen.
    border: undefined,
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
/**
 * The status line, laid out like the cabinet's (FAQ 6.2): the player's score
 * with the high score beside it, the level, and how many frogs are left.
 */
function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(6, "0");
  const best = Math.max(
    gameData.score,
    ...gameData.highscores.map(h => h.score)
  );
  const hiStr = best.toString().padStart(6, "0");

  // 256 frogs is one of the operator's settings, so the row of them has to
  // give up and count at some point.
  const livesStr = gameData.lives > 8
    ? `x${gameData.lives}`
    : "*".repeat(Math.max(0, gameData.lives));

  const homesStr = gameData.homesCompleted.toString();

  return (
    `{yellow-fg}1-UP ${scoreStr}{/}  ` +
    `{white-fg}HI-SCORE ${hiStr}{/}  ` +
    `{cyan-fg}LEVEL ${gameData.level}{/}  ` +
    `{green-fg}HOMES ${homesStr}/5{/}  ` +
    `{red-fg}FROGS ${livesStr}{/}`
  );
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
/**
 * Attract mode: what the cabinet does when nobody is playing.
 *
 * Title over the point table, then the score ranking, then the invitation to
 * play, then the machine playing itself, round and round. Any key drops into
 * the menu - on the cabinet that is the coin slot.
 */
function startAttract(): void {
  stopAttract();

  gameData.state = "attract";
  attractPhase = ATTRACT_ORDER[0];
  attractFrames = 0;

  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  footerBox.setContent("{gray-fg}Press any key to play{/}");
  renderAttract();

  attractLoop = setInterval(() => {
    attractFrames++;

    if (attractPhase === "demo") runDemoFrame();
    else renderAttract();

    if (attractFrames >= ATTRACT_FRAMES[attractPhase]) {
      attractPhase = nextPhase(attractPhase);
      attractFrames = 0;
      if (attractPhase === "demo") startDemo();
      else stopDemo();
    }
  }, GAME_TICK_MS);
}

/** Tear the attract loop down, whether or not it is running. */
function stopAttract(): void {
  if (attractLoop) {
    clearInterval(attractLoop);
    attractLoop = null;
  }
  stopDemo();
}

/** Paint the current attract panel. */
function renderAttract(): void {
  const width = (gameArea.width as number) || 80;
  const lines = attractScreen(attractPhase, gameData, width, attractFrames);

  gameArea.setContent(lines.join("\n"));
  hudBox.setContent(formatHUD());
  screen.render();
}

/**
 * Start the machine playing itself.
 *
 * On its OWN game state, so a demo can never touch the player's score, the
 * high score table or the lives setting.
 */
function startDemo(): void {
  demoData = createInitialGameData();
  demoData.highscores = gameData.highscores;
  demoData.state = "playing";

  demoGame = new FroggerGame(demoData, (content: string) => {
    gameArea.setContent(content);
    screen.render();
  });
  demoGame.initLevel();
}

function stopDemo(): void {
  demoGame = null;
  demoData = null;
}

/** One tick of the demo game. */
function runDemoFrame(): void {
  if (!demoGame || !demoData) {
    startDemo();
    return;
  }

  // The demo hops at a human pace rather than every tick.
  if (attractFrames % DEMO_HOP_FRAMES === 0) demoGame.demoStep();

  demoGame.update();

  // A demo that has run out of frogs goes back to the title.
  if (demoData.state !== "playing") {
    attractPhase = nextPhase("demo");
    attractFrames = 0;
    stopDemo();
  }
}

function showMenu(): void {
  stopAttract();
  footerBox.setContent("{gray-fg}Arrow Keys: Hop | P: Pause | Q: Quit{/}");
  gameData.state = "menu";
  gameData.menuSelection = 0;
  renderMenu();
}

/**
 * Draw the main menu for the CURRENT selection, without changing it.
 */
function renderMenu(): void {
  gameArea.setContent("");

  if (menuBox) {
    menuBox.destroy();
  }

  // Wide enough for the block title, which is what it is: sizing this by
  // eye is what made every title row wrap and show as a doubled, broken
  // letterform with a black line through it.
  const width = Math.max(54, titleWidth());

  // The same block title the attract screen uses, so the door has one look
  // rather than two - the menu used to carry a figlet in slashes.
  const menuContent: string[] = [...titleLines(width)];

  menuContent.push("");
  menuContent.push(centred("Classic 1981 Konami Arcade Game", width, "white"));
  menuContent.push("");

  // A strip of the board itself: the traffic, the river and its footing,
  // in the colours the game draws them in.
  menuContent.push(laneStrip(width));
  menuContent.push("");

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;

    // The lives row shows its setting and Enter steps through them. On the
    // cabinet this was an operator switch (FAQ 6.3).
    const label = option === "Lives"
      ? `${option}: ${gameData.startingLives}`
      : option;

    const text = selected ? `> ${label} <` : `  ${label}  `;
    const pad = Math.max(0, Math.floor((width - text.length) / 2));

    menuContent.push(
      selected
        ? `${" ".repeat(pad)}{blue-bg}{lightyellow-fg}${text}{/lightyellow-fg}{/blue-bg}`
        : `${" ".repeat(pad)}{white-fg}${text}{/white-fg}`
    );
  });

  menuContent.push("");
  menuContent.push(centred("UP/DOWN to choose, ENTER to confirm", width, "gray"));

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: width + 2,
    height: menuContent.length + 2,
    tags: true,
    // The content is laid out to `width` already; re-wrapping it is what
    // broke the title.
    wrap: false,
    border: { type: "line" },
    style: { fg: "white", bg: "black", border: { fg: "green" } },
    content: menuContent.join("\n"),
  });

  screen.render();
}

/** Centre a plain string and colour it. */
function centred(text: string, width: number, colour: string): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return `${" ".repeat(pad)}{${colour}-fg}${text}{/${colour}-fg}`;
}

/**
 * A strip of the board, drawn in the game's own colours: the road, a car,
 * the river, a log, a turtle set and the bank.
 */
function laneStrip(width: number): string {
  const run = [
    { bg: BG_COLORS.road, cells: 3 },
    { bg: BG_COLORS.car, cells: 2 },
    { bg: BG_COLORS.road, cells: 3 },
    { bg: BG_COLORS.water, cells: 2 },
    { bg: BG_COLORS.log, cells: 4 },
    { bg: BG_COLORS.water, cells: 2 },
    { bg: BG_COLORS.turtle, cells: 3 },
    { bg: BG_COLORS.water, cells: 2 },
    { bg: BG_COLORS.bank, cells: 3 },
  ];

  const drawn = run.reduce((n, part) => n + part.cells, 0);
  const pad = Math.max(0, Math.floor((width - drawn) / 2));

  return " ".repeat(pad) + run
    .map(part => `{${part.bg}-bg}${" ".repeat(part.cells)}{/${part.bg}-bg}`)
    .join("");
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

/** Step to the next of the cabinet's life settings (FAQ 6.3). */
function cycleLives(): void {
  const next = (LIVES_OPTIONS.indexOf(gameData.startingLives) + 1) % LIVES_OPTIONS.length;
  gameData.startingLives = LIVES_OPTIONS[next];
}

/**
 * Start the game
 */
function startGame(): void {
  gameData.state = "playing";
  gameData.score = 0;
  // FAQ 6.3: the cabinet was set to 3, 5, 7 or 256 frogs.
  gameData.lives = gameData.startingLives;
  gameData.extraLifeAwarded = false;
  gameData.level = 1;
  gameData.homesCompleted = 0;
  gameData.homes = [];
  gameData.carryingLadyFrog = false;

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
      pollHeldDirections();
      game?.update();
    } else if (gameData.state === "gameover") {
      // Keep painting so the GAME OVER prompt blinks. Nothing drew this
      // state at all, so losing the last frog froze the board.
      gameData.frameCount++;
      game?.render();
    } else if (gameData.state === "levelComplete") {
      // Hold the finished board for a couple of seconds, then move on. The
      // engine used to schedule this with a setTimeout of its own, which
      // advanced the level whether or not the door was still showing it.
      levelCompleteFrames++;
      if (levelCompleteFrames >= LEVEL_COMPLETE_FRAMES) {
        levelCompleteFrames = 0;
        game?.advanceLevel();
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
      handlePausedInput(inputKey);
      break;
    case "gameover":
      handleGameOverInput(inputKey);
      break;
    case "enterName":
      handleNameEntryInput(inputKey);
      break;
    case "attract":
      // Any key at all leaves the attract loop and opens the menu, which is
      // this cabinet's coin slot.
      showMenu();
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
      renderMenu();
      break;
    case "down":
      gameData.menuSelection = Math.min(
        MENU_OPTIONS.length - 1,
        gameData.menuSelection + 1
      );
      renderMenu();
      break;
    case "enter":
    case "space":
      switch (MENU_OPTIONS[gameData.menuSelection]) {
        case "Start Game":
          startGame();
          break;
        case "Lives":
          cycleLives();
          renderMenu();
          break;
        case "High Scores":
          showHighscores();
          break;
        case "Help":
          showHelp();
          break;
        case "Quit":
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
 * Hop for whichever directions are held down.
 *
 * Frogger is a hopper, not a continuous mover: one press is one hop. So
 * unlike the free-roaming games this keeps a deliberate delay before a held
 * key starts repeating - the same shape GrandMaster uses for its discrete
 * grid steps - and repeats slowly after that. Holding a direction should
 * walk the frog forward, not fire it across the road.
 */
function pollHeldDirections(): void {
  if (!inputManager?.isKeyStateActive()) return;
  for (const dir of ["up", "down", "left", "right"] as Direction[]) {
    if (inputManager.consumeRepeat(dir, { initialDelay: 250, repeatRate: 140 })) {
      game?.handleDirection(dir);
    }
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
      // Held keys drive hopping when real key edges are available; acting on
      // the character too would hop twice per press.
      if (inputManager?.isKeyStateActive()) break;
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
    const madeTheTable =
      gameData.score > lowestScore || gameData.highscores.length < 10;

    if (!madeTheTable) {
      showMenu();
      return;
    }

    // The BBS knows the caller. Only ask for a name when it somehow does
    // not - typing initials is a coin-op ritual, not something a BBS user
    // should have to do.
    if (gameData.playerName) {
      void saveScoreAndReturn(gameData.playerName);
      return;
    }

    gameData.state = "enterName";
    showNameEntry();
  } else if (key === "q" || key === "escape") {
    showMenu();
  }
}

/** Record the score under `name`, then go back to the menu either way. */
async function saveScoreAndReturn(name: string): Promise<void> {
  try {
    await rpcHandlers.saveHighscore({
      name,
      score: gameData.score,
      level: gameData.level,
    });
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    // A high score that cannot be written is not worth losing the door over.
  }
  showMenu();
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
    `{white-fg}[ ${gameData.playerName.padEnd(MAX_NAME_LENGTH, "_")} ]{/}`,
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
      await saveScoreAndReturn(gameData.playerName);
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
    key >= " " && key <= "~"
  ) {
    // Any printable character, and a handle's worth of them. It used to
    // take three letters or digits and nothing else, so a BBS handle with a
    // symbol in it could not be typed at all.
    if (gameData.playerName.length < MAX_NAME_LENGTH) {
      gameData.playerName += key;
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
  stopAttract();
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

  // The BBS already knows who is playing, so a high score does not need to
  // be typed in three letters at a time - the same thing Grandmaster does.
  gameData.playerName = ctx?.session?.user?.username || "";

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
    trackHeldKeys: true,    // Move from held keys, not the auto-repeat stream
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
      renderMenu();
    }
  });

  gamepadManager.on('dpad:down', () => {
    if (gameData.state === 'playing') {
      game?.handleDirection('down');
    } else if (gameData.state === 'menu') {
      gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
      renderMenu();
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

  startAttract();
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
