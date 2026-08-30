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
import { SCREEN_HEIGHT, GAME_TICK_MS, STARTING_LIVES, MENU_OPTIONS, DEFAULT_HIGHSCORES, FIELD_WIDTH, FIELD_HEIGHT, } from "./game/constants";
// Export RPC handlers for hybrid mode
export { rpcHandlers };
/**
 * Create initial game data
 */
function createInitialGameData() {
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
let gameData;
let screen;
let gameArea;
let hudBox;
let footerBox;
let menuBox = null;
let gameLoop = null;
let engine = null;
let isDrawKeyHeld = false;
let currentDrawSpeed = null;
let doorContext; // Will be set on start
let inputManager = null;
/**
 * Initialize neo-blessed screen
 */
function initScreen() {
    screen = blessed.screen({
        smartCSR: true,
        dockBorders: true,
        title: "Super Qix",
        fullUnicode: false,
        output: (data) => doorContext?.output.write(data),
        input: null,
    });
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
        content: "{gray-fg}Arrows: Move | Z: Slow Draw | X: Fast Draw | P: Pause | Q: Quit{/}",
    });
}
/**
 * Format HUD display
 */
function formatHUD() {
    const scoreStr = gameData.score.toString().padStart(8, "0");
    const livesStr = "*".repeat(gameData.lives);
    const percentStr = Math.floor(gameData.claimedPercent)
        .toString()
        .padStart(2, " ");
    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LVL: ${gameData.level}{/}  {green-fg}CLAIMED: ${percentStr}%{/}  {red-fg}LIVES: ${livesStr}{/}`;
}
/**
 * Enter the main menu: reset to the first option, then draw it.
 *
 * Use this when ARRIVING at the menu. To redraw the menu after the
 * selection moves, call renderMenu() - calling showMenu() there would
 * reset menuSelection back to 0 on every keypress, which is exactly the
 * bug that made arrow up/down appear to do nothing.
 */
function showMenu() {
    gameData.state = "menu";
    gameData.menuSelection = 0;
    renderMenu();
}
/**
 * Draw the main menu for the CURRENT selection, without changing it.
 */
function renderMenu() {
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
async function showHighscores() {
    gameData.state = "highscores";
    try {
        gameData.highscores = await rpcHandlers.getHighscores();
    }
    catch {
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
        content.push(`{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}  {magenta-fg}${percent}%{/}`);
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
function showHelp() {
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
function startGame() {
    gameData.state = "playing";
    gameData.score = 0;
    gameData.lives = STARTING_LIVES;
    gameData.level = 1;
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    // Initialize game engine
    engine = new QixEngine(gameData, (content) => {
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
        }
        else if (gameData.state === "levelTransition") {
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
function handleInput(key) {
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
function normalizeKey(key) {
    if (key === "\x1b[A" || key === "w" || key === "W")
        return "up";
    if (key === "\x1b[B" || key === "s" || key === "S")
        return "down";
    if (key === "\x1b[C" || key === "d" || key === "D")
        return "right";
    if (key === "\x1b[D" || key === "a" || key === "A")
        return "left";
    if (key === " ")
        return "space";
    if (key === "\r" || key === "\n")
        return "enter";
    if (key === "\x1b" || key === "\x1b\x1b")
        return "escape";
    if (key === "\x7f" || key === "\b")
        return "backspace";
    if (key === "\t")
        return "tab";
    return key.toLowerCase();
}
/**
 * Handle menu input
 */
function handleMenuInput(key) {
    switch (key) {
        case "up":
            gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
            renderMenu();
            break;
        case "down":
            gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
            renderMenu();
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
function handleGameInput(key) {
    switch (key) {
        case "up":
        case "down":
        case "left":
        case "right":
            engine?.handleDirection(key);
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
function showPauseScreen() {
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
function handleGameOverInput(key) {
    if (key === "enter" || key === "space") {
        const lowestScore = gameData.highscores[gameData.highscores.length - 1]?.score || 0;
        if (gameData.score > lowestScore || gameData.highscores.length < 10) {
            gameData.state = "enterName";
            gameData.playerName = "";
            gameData.playerNameCursor = 0;
            showNameEntry();
        }
        else {
            showMenu();
        }
    }
    else if (key === "q" || key === "escape") {
        showMenu();
    }
}
/**
 * Show name entry screen
 */
function showNameEntry() {
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
async function handleNameEntryInput(key) {
    if (key === "enter") {
        if (gameData.playerName.length > 0) {
            try {
                await rpcHandlers.saveHighscore({
                    name: gameData.playerName,
                    score: gameData.score,
                    level: gameData.level,
                    maxPercent: Math.floor(gameData.claimedPercent),
                });
            }
            catch {
                // Continue anyway
            }
            showMenu();
        }
    }
    else if (key === "backspace") {
        if (gameData.playerName.length > 0) {
            gameData.playerName = gameData.playerName.slice(0, -1);
            showNameEntry();
        }
    }
    else if (key === "escape") {
        showMenu();
    }
    else if (typeof key === "string" &&
        key.length === 1 &&
        /[A-Za-z0-9]/.test(key)) {
        if (gameData.playerName.length < 3) {
            gameData.playerName += key.toUpperCase();
            showNameEntry();
        }
    }
}
/**
 * Cleanup resources
 */
let keepAlive = null;
// doorContext already declared above
function cleanup() {
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
door.onStart(async (ctx) => {
    doorContext = ctx;
    gameData = createInitialGameData();
    // Prevent event loop from emptying
    keepAlive = setInterval(() => { }, 60000);
    try {
        gameData.highscores = await rpcHandlers.getHighscores();
    }
    catch {
        // Use defaults
    }
    initScreen();
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Set up input management (enables mouse, keyboard routing)
    inputManager = new DoorInputManager(ctx, screen, {
        enableGameMode: true, // Game needs raw keyboard input
        enableGrabKeys: true, // Capture all keys for game controls
        enableMouse: true, // Enable mouse events
        debug: false,
        debugName: 'SuperQix'
    });
    inputManager.enable();
    showMenu();
});
door.onInput((ctx, key) => {
    handleInput(key.raw || key.key || key);
});
door.onClose(() => {
    cleanup();
});
door.onError((ctx, error) => {
    console.error("[Super Qix] Error:", error);
    cleanup();
});
// Export for SDK
export default door;
