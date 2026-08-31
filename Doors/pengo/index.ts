/**
 * Pengo - Server/Fallback Door Entry Point
 * 1982 Sega arcade puzzle game port
 */

import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import { Screen, Box, List, ScrollableBox, Message, Prompt } from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { arcadeMenu, moveSelection, ArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import { loadSpriteSheet } from "@amiexpress/bbs-door-sdk/engines/graphics/cell-art";
import { join } from "path";
import { PengoGame } from "./game/pengo-game";
import { createInitialGameData } from "./game/initial-data";
import { rpcHandlers } from "./server";
import { PengoData, InputKey, Direction } from "./game/types";
import {
  BOARD_COLS,
  BOARD_ROWS,
  GAME_TICK_MS,
  MENU_OPTIONS,
  DEFAULT_HIGHSCORES,
} from "./game/constants";

export { rpcHandlers };

const spriteSheet = loadSpriteSheet(join(__dirname, "sprites"));

const door = new Door({
  name: "Pengo",
  version: "1.0.0",
  author: "AmiExpress BBS",
});

let gameData: PengoData;
let screen: Screen;
let gameArea: Box;
let hudBox: Box;
let footerBox: Box;
let menuBox: any = null; // Can be List, Box, etc.
let gameLoop: ReturnType<typeof setInterval> | null = null;
let game: PengoGame | null = null;
let doorContext: any; // Will be set on start
let inputManager: DoorInputManager | null = null;

function initScreen(): void {
  screen = new Screen({
    smartCSR: true,
    dockBorders: true,
    title: "Pengo",
    fullUnicode: false,
    output: (data: string) => doorContext?.output.write(data),
    input: null as any,
  } as any);

  hudBox = new Box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: formatHUD(),
  });

  gameArea = new Box({
    parent: screen,
    top: 1,
    left: 0,
    width: BOARD_COLS,
    height: BOARD_ROWS,
    fixed: true,
    tags: true,
    style: { bg: "black" },
  });

  footerBox = new Box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content:
      "{gray-fg}Arrow Keys: Move | Space: Push Block | P: Pause | Q: Quit{/}",
  });
}

function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  const timeColor = gameData.timeRemaining <= 30 ? "red" : "yellow";
  const enemies = gameData.enemies.filter(e => e.state !== "dead").length;
  return (
    `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  ` +
    `{red-fg}LIVES: ${livesStr}{/}  {${timeColor}-fg}TIME: ${gameData.timeRemaining}{/}  ` +
    `{white-fg}ENEMIES: ${enemies}{/}`
  );
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

  // Parented to the SCREEN, not gameArea. A menu centred inside the narrower
  // gameArea box would resolve to a negative left offset whenever the menu
  // is wider than the board, hanging columns off the left edge - which is
  // exactly how it was reported: the title showing as "ngo" and the items
  // clipped.
  // Arkanoid's menu, from the shared arcade shell rather than a tenth
  // private copy of it. The width is the box's interior.
  const width = 40;
  const lines = arcadeMenu({
    title: ['  P E N G O  ', '   SNO-BEES  '],
    options: MENU_OPTIONS,
    selection: gameData.menuSelection,
    width,
    subtitle: 'Classic 1982 Sega Arcade Action!',
  });

  menuBox = new Box({
    parent: screen,
    top: "center",
    left: "center",
    width: width + 2,
    height: lines.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black", fg: "white" },
    // arcadeMenu already centres each line for this width; prefixing spaces
    // here would shift the whole menu right of centre.
    content: lines.join("\n"),
  });

  screen.render();
}

async function showHighscores(): Promise<void> {
  sfx?.play("select");
  gameData.state = "highscores";
  try {
    gameData.highscores = await rpcHandlers.getHighscores();
  } catch {
    /* cached */
  }

  const items = [
    "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
    "{gray-fg}----  ----  --------   -----{/}",
  ];
  
  gameData.highscores.slice(0, 10).forEach((score, i) => {
    items.push(
      `{cyan-fg}${(i + 1)
        .toString()
        .padStart(2)}.{/}   {white-fg}${score.name.padEnd(
        4
      )}{/}  {yellow-fg}${score.score
        .toString()
        .padStart(8)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`
    );
  });

  if (menuBox) menuBox.destroy();
  
  const body = [...items, "", "{gray-fg}Press any key to return{/}"];

  menuBox = new Box({
    parent: screen,
    top: "center",
    left: "center",
    width: 48,
    height: body.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black", fg: "white" },
    label: " HIGH SCORES ",
    content: body.map(l => `  ${l}`).join("\n"),
  });

  screen.render();
}

function showHelp(): void {
  sfx?.play("select");
  gameData.state = "help"; // Ensure state is set
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
  ].join("\n");

  if (menuBox) menuBox.destroy();
  
  const body = content.split("\n").concat(["", "{gray-fg}Press any key to return{/}"]);

  menuBox = new Box({
    parent: screen,
    top: "center",
    left: "center",
    width: 48,
    height: body.length + 2,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black", fg: "white" },
    content: body.map(l => `  ${l}`).join("\n"),
  });

  screen.render();
}

function startGame(): void {
  sfx?.play("start");
  gameData = { ...createInitialGameData(), state: "playing" };
  if (menuBox) {
    menuBox.destroy();
    menuBox = null;
  }

  game = new PengoGame(gameData, (content: string) => {
    gameArea.setContent(content);
    hudBox.setContent(formatHUD());
    screen.render();
    // Every event that changes the board repaints it, so this is the
    // one place that sees them all.
    if (sfx && game) sfx.flush(game.cues);
  }, spriteSheet);
  game.initLevel();

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => {
    if (gameData.state === "playing") {
      pollHeldDirections();
      game?.update();
    }
    // The state can change inside update() - a wave finished, a last life
    // lost - and those paths return before the game repaints. Draining here
    // as well means the sound still lands on the tick it happened on.
    if (sfx && game) sfx.flush(game.cues);
  }, GAME_TICK_MS);
}

function handleInput(key: string): void {
  const inputKey = normalizeKey(key);

  // The screen is created with `input: null` - blessed never receives a real
  // key, so a widget's own keys:true and focus() can never fire. Every screen
  // is driven from gameData here instead, the way the other arcade doors do
  // it. This used to re-emit 'keypress' at the screen and hope a widget
  // caught it, which is why the menu could not be navigated at all.
  switch (gameData.state) {
    case "menu":
      handleMenuInput(inputKey);
      break;
    case "highscores":
    case "help":
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
    gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, -1);
    sfx?.play("blip");
    renderMenu();
  } else if (key === "down") {
    gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, +1);
    sfx?.play("blip");
    renderMenu();
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

/**
 * Step the player for whichever directions are held down.
 *
 * Called once per game tick. This replaces reacting to the character
 * stream, which arrives as the client's auto-repeat - one character, a
 * ~400ms gap, then a burst - and made movement stutter. Holding a key now
 * moves at a steady rate from the moment it goes down.
 */
function pollHeldDirections(): void {
  if (!inputManager?.isKeyStateActive()) return;
  for (const dir of ["up", "down", "left", "right"] as Direction[]) {
    if (inputManager.consumeRepeat(dir, { repeatRate: 90 })) {
      game?.handleDirection(dir);
    }
  }
}

function handleGameInput(key: InputKey): void {
  if (key === "up" || key === "down" || key === "left" || key === "right") {
    // Held keys drive movement when real key edges are available; acting on
    // the character too would move twice per press.
    if (inputManager?.isKeyStateActive()) return;
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
  
  const box = new Box({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 30,
    height: 6,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    content: "{center}{yellow-fg}PAUSED{/}\n\n{white-fg}Press P to resume{/}{/center}",
    keys: true,
    mouse: true,
    vi: true
  });

  box.key(['p', 'P'], () => {
     box.destroy();
     menuBox = null;
     gameData.state = "playing";
     game?.render();
  });

  box.key(['q', 'escape'], () => {
     gameData.state = "menu";
     if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
     showMenu();
  });

  menuBox = box;
  box.focus();
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
  
  const prompt = new Prompt({
    parent: gameArea,
    top: "center",
    left: "center",
    width: 40,
    height: 12,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    label: " NEW HIGH SCORE! ",
    text: `Score: {yellow-fg}${gameData.score}{/}\n\nEnter initials:`,
    value: gameData.playerName,
    tags: true
  });

  prompt.showInput(undefined, undefined, async (err, value) => {
      // Prompt destroys itself on submit/cancel
      menuBox = null;
      
      if (!err && value) {
          gameData.playerName = value.toUpperCase().slice(0, 3);
          try {
            await rpcHandlers.saveHighscore({
                name: gameData.playerName,
                score: gameData.score,
                level: gameData.level,
            });
          } catch { /* ignore */ }
          showMenu();
      } else {
          showMenu();
      }
  });

  menuBox = prompt;
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

door.onStart(async (ctx: any) => {
  // A browser session has a socket; a telnet one does not, and ArcadeSfx
  // treats a missing socket as "nobody is listening" rather than an error.
  sfx = new ArcadeSfx(ctx?.socket);

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

  // Set up input management (enables mouse, keyboard routing)
  inputManager = new DoorInputManager(ctx, screen, {
    enableGameMode: true,   // Game needs raw keyboard input
    enableGrabKeys: true,   // Capture all keys for game controls
    enableMouse: true,      // Enable mouse events
    trackHeldKeys: true,    // Move from held keys, not the auto-repeat stream
    debug: false,
    debugName: 'Pengo'
  });
  inputManager.enable();

  showMenu();
});

door.onInput((ctx: any, key: any) => handleInput(key.raw || key.key || key));
door.onClose(() => cleanup());
door.onError((ctx: any, error: Error) => {
  console.error("[Pengo] Error:", error);
  cleanup();
});

export default door;
