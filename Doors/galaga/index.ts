/**
 * Galaga - Server/Fallback Door Entry Point
 * 1981 Namco space shooter arcade game port
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import { GamepadInputManager } from "@amiexpress/bbs-door-sdk/utils/gamepad-input-manager";
import { GamepadButton } from "@amiexpress/bbs-door-sdk/types/gamepad";
import { GalagaGame } from "./game/galaga-game";
import { rpcHandlers } from "./server";
import { GalagaData, InputKey } from "./game/types";
import {
  SCREEN_WIDTH,
  GAME_AREA_WIDTH,
  GAME_AREA_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
} from "./game/constants";

export { rpcHandlers };

function createInitialGameData(): GalagaData {
  return {
    state: "menu",
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
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
    stageIntroTimer: 0,
  };
}

const door = new Door({
  name: "Galaga",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: GalagaData;
let screen: ReturnType<typeof blessed.screen>;
let gameArea: ReturnType<typeof blessed.box>;
let hudBox: ReturnType<typeof blessed.box>;
let footerBox: ReturnType<typeof blessed.box>;
let menuBox: ReturnType<typeof blessed.box> | null = null;
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: GalagaGame | null = null;
let doorContext: any; // Will be set on start
let inputManager: DoorInputManager | null = null;
let gamepadManager: GamepadInputManager | null = null;

function initScreen(): void {
  screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    title: "Galaga",
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
    width: GAME_AREA_WIDTH,
    height: GAME_AREA_HEIGHT,
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
    content: "{gray-fg}Left/Right: Move | Space: Fire | P: Pause | Q: Quit{/}",
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  const accuracy =
    gameData.shotsFired > 0
      ? Math.floor((gameData.shotsHit / gameData.shotsFired) * 100)
      : 0;
  return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}STAGE: ${gameData.stage}{/}  {red-fg}LIVES: ${livesStr}{/}  {white-fg}HIT: ${accuracy}%{/}`;
}

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
  gameArea.setContent("");

  if (menuBox) menuBox.destroy();

  const menuContent = [
    "{cyan-fg}",
    "   ____       _                   ",
    "  / ___| __ _| | __ _  __ _  __ _ ",
    " | |  _ / _` | |/ _` |/ _` |/ _` |",
    " | |_| | (_| | | (_| | (_| | (_| |",
    "  \\____|\\__,_|_|\\__,_|\\__, |\\__,_|",
    "                      |___/       ",
    "{/}",
    "",
    "{white-fg}Classic 1981 Namco Space Shooter{/}",
    "",
  ];

  MENU_OPTIONS.forEach((option, index) => {
    const selected = index === gameData.menuSelection;
    const prefix = selected ? "> " : "  ";
    const color = selected ? "yellow" : "white";
    menuContent.push(`{${color}-fg}${prefix}${option}{/}`);
  });

  menuBox = blessed.box({
    fixed: true,
    parent: gameArea,
    top: "center",
    left: "center",
    width: 45,
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
    /* use cached */
  }

  const content = [
    "{yellow-fg}HIGH SCORES{/}",
    "",
    "{white-fg}RANK  NAME   SCORE     STAGE{/}",
    "{gray-fg}----  ----  --------   -----{/}",
  ];

  gameData.highscores.slice(0, 10).forEach((score, index) => {
    const rank = (index + 1).toString().padStart(2, " ");
    const name = score.name.padEnd(4, " ");
    const scoreStr = score.score.toString().padStart(8, " ");
    const stage = score.stage.toString().padStart(2, " ");
    content.push(
      `{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${stage}{/}`
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

function showHelp(): void {
  const content = [
    "{yellow-fg}HOW TO PLAY{/}",
    "",
    "{cyan-fg}OBJECTIVE:{/}",
    "Destroy all aliens in each stage.",
    "Avoid enemy fire and collisions!",
    "",
    "{green-fg}SPECIAL:{/}",
    "Boss Galagas can capture your ship.",
    "Destroy the boss to rescue it and",
    "get a DUAL FIGHTER with double firepower!",
    "",
    "{magenta-fg}CHALLENGING STAGES:{/}",
    "Every 3rd stage has bonus enemies.",
    "They cannot shoot - destroy them all!",
    "",
    "{white-fg}CONTROLS:{/}",
    "Left/Right - Move ship",
    "Space      - Fire",
    "P          - Pause",
    "Q          - Quit",
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

function startGame(): void {
  gameData.state = "playing";
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
    if (gameData.state === "playing") {
      pollHeldControls();
      game?.update();
    }
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
  if (key === "\x1b[A" || key === "w" || key === "W") return "up";
  if (key === "\x1b[B" || key === "s" || key === "S") return "down";
  if (key === "\x1b[C" || key === "d" || key === "D") return "right";
  if (key === "\x1b[D" || key === "a" || key === "A") return "left";
  if (key === " ") return "fire";
  if (key === "\r" || key === "\n") return "enter";
  if (key === "\x1b" || key === "\x1b\x1b") return "escape";
  if (key === "\x7f" || key === "\b") return "backspace";
  return key.toLowerCase();
}

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
    case "fire":
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
 * Which controls the game currently believes are down, so that edges are
 * only sent when they actually change.
 */
const keyStateMirror: Record<string, boolean> = {
  left: false,
  right: false,
  fire: false,
};

/**
 * Mirror the real held keys into the game's own key-down/key-up model.
 *
 * The game already thinks in presses and releases, but the character stream
 * has no releases - so this door used to send a key-down and fake the
 * matching key-up on a 100ms timer, and never released "fire" at all. The
 * ship therefore moved in 100ms twitches however long the key was held.
 * With real edges the game gets a true press and a true release, and its
 * own movement code runs continuously the way it was written to.
 */
function pollHeldControls(): void {
  if (!inputManager?.isKeyStateActive()) return;

  for (const control of ["left", "right", "fire"]) {
    const held = inputManager.isHeld(control === "fire" ? "space" : control);
    if (held === keyStateMirror[control]) continue;

    keyStateMirror[control] = held;
    if (held) {
      game?.handleKeyDown(control as any);
    } else {
      game?.handleKeyUp(control as any);
    }
  }
}

function handleGameInput(key: InputKey): void {
  // Held keys drive the ship when real key edges are available; acting on
  // the character too would double up on every press.
  if (inputManager?.isKeyStateActive() &&
      (key === "left" || key === "right" || key === "fire")) {
    return;
  }

  switch (key) {
    case "left":
      game?.handleKeyDown("left");
      setTimeout(() => game?.handleKeyUp("left"), 100);
      break;
    case "right":
      game?.handleKeyDown("right");
      setTimeout(() => game?.handleKeyUp("right"), 100);
      break;
    case "fire":
      game?.handleKeyDown("fire");
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

function handleGameOverInput(key: InputKey): void {
  if (key === "enter" || key === "fire") {
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

function showNameEntry(): void {
  const content = [
    "{yellow-fg}NEW HIGH SCORE!{/}",
    "",
    `{white-fg}Score: {yellow-fg}${gameData.score}{/}`,
    `{white-fg}Stage: {cyan-fg}${gameData.stage}{/}`,
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

async function handleNameEntryInput(key: InputKey): Promise<void> {
  if (key === "enter") {
    if (gameData.playerName.length > 0) {
      try {
        await rpcHandlers.saveHighscore({
          name: gameData.playerName,
          score: gameData.score,
          stage: gameData.stage,
        });
      } catch {
        /* continue */
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

let keepAlive: ReturnType<typeof setInterval> | null = null;

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

door.onStart(async (ctx: any) => {
  doorContext = ctx;
  gameData = createInitialGameData();

  // Prevent event loop from emptying (since we have no stdin)
  keepAlive = setInterval(() => {}, 60000);

  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    /* use defaults */
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
    debugName: 'Galaga'
  });
  inputManager.enable();

  // Set up gamepad support
  gamepadManager = new GamepadInputManager(ctx.session);

  // D-pad/analog stick for ship movement
  gamepadManager.on('dpad:left', () => {
    if (gameData.state === 'playing') {
      game?.handleKeyDown('left');
      setTimeout(() => game?.handleKeyUp('left'), 100);
    }
  });

  gamepadManager.on('dpad:right', () => {
    if (gameData.state === 'playing') {
      game?.handleKeyDown('right');
      setTimeout(() => game?.handleKeyUp('right'), 100);
    }
  });

  gamepadManager.on('axis:left-x', (value) => {
    if (gameData.state === 'playing') {
      if (value < -0.3) {
        game?.handleKeyDown('left');
        setTimeout(() => game?.handleKeyUp('left'), 50);
      } else if (value > 0.3) {
        game?.handleKeyDown('right');
        setTimeout(() => game?.handleKeyUp('right'), 50);
      }
    }
  });

  // D-pad for menu navigation
  gamepadManager.on('dpad:up', () => {
    if (gameData.state === 'menu') {
      gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
      renderMenu();
    }
  });

  gamepadManager.on('dpad:down', () => {
    if (gameData.state === 'menu') {
      gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
      renderMenu();
    }
  });

  // A button for fire/select
  gamepadManager.on('button:a', (pressed) => {
    if (!pressed) return;

    if (gameData.state === 'playing') {
      game?.handleKeyDown('fire');
    } else if (gameData.state === 'menu') {
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

  // B/SELECT for back/quit
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
  console.error("[Galaga] Error:", error);
  cleanup();
});

export default door;
