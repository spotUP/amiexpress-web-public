/**
 * Bubble Bobble - Server/Fallback Door Entry Point
 * 1986 Taito arcade platformer
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { GamepadInputManager } from "@amiexpress/bbs-door-sdk/utils/gamepad-input-manager";
import { BubbleBobbleGame } from "./game/bubble-bobble-game";
import { rpcHandlers } from "./server";
import { GAME_WIDTH, GAME_HEIGHT, GAME_TICK_MS, STARTING_LIVES, MENU_OPTIONS, DEFAULT_HIGHSCORES, BUBBLE_RANGE, } from "./game/constants";
export { rpcHandlers };
function createInitialGameData() {
    return {
        state: "menu",
        score: 0,
        lives: STARTING_LIVES,
        level: 1,
        player: {
            x: 4,
            y: 17,
            vx: 0,
            vy: 0,
            direction: "right",
            isJumping: false,
            isOnGround: true,
            isBubbling: false,
            bubbleFrame: 0,
            walkFrame: 0,
            invincibleTimer: 0,
            isAlive: true,
            respawnTimer: 0,
            hasShoes: false,
            hasCandy: false,
            rapidFire: false,
            bubbleRange: BUBBLE_RANGE,
        },
        enemies: [],
        bubbles: [],
        items: [],
        platforms: [],
        walls: [],
        enemyIdCounter: 0,
        bubbleIdCounter: 0,
        itemIdCounter: 0,
        levelTimer: 0,
        hurryUpTimer: 600,
        isHurryUp: false,
        extendLetters: [false, false, false, false, false, false],
        comboCount: 0,
        lastPopTime: 0,
        highscores: [...DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
const door = new Door({
    name: "Bubble Bobble",
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
let game = null;
let doorContext; // Will be set on start
let gamepadManager = null;
function initScreen() {
    screen = blessed.screen({
        smartCSR: true,
        dockBorders: true,
        title: "Bubble Bobble",
        fullUnicode: false,
        output: (data) => doorContext?.output.write(data),
        input: null,
    });
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
        width: GAME_WIDTH * 2,
        height: GAME_HEIGHT + 2,
        fixed: true,
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
        content: "{gray-fg}Arrow Keys: Move | Z: Jump | X: Bubble | P: Pause | Q: Quit{/}",
    });
}
function formatHUD() {
    const scoreStr = gameData.score.toString().padStart(8, "0");
    const livesStr = "*".repeat(Math.max(0, gameData.lives));
    const hurryStr = gameData.isHurryUp ? "{red-fg}HURRY!{/}" : "";
    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {green-fg}LIVES: ${livesStr}{/}  ${hurryStr}`;
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
    gameArea.setContent("");
    if (menuBox)
        menuBox.destroy();
    const menuContent = [
        "{green-fg}",
        "  ____        _     _     _      ",
        " | __ ) _   _| |__ | |__ | | ___ ",
        " |  _ \\| | | | '_ \\| '_ \\| |/ _ \\",
        " | |_) | |_| | |_) | |_) | |  __/",
        " |____/ \\__,_|_.__/|_.__/|_|\\___|",
        "  ____        _     _     _      ",
        " | __ )  ___ | |__ | |__ | | ___ ",
        " |  _ \\ / _ \\| '_ \\| '_ \\| |/ _ \\",
        " | |_) | (_) | |_) | |_) | |  __/",
        " |____/ \\___/|_.__/|_.__/|_|\\___|",
        "{/}",
        "",
        "{white-fg}Taito 1986{/}",
        "",
    ];
    MENU_OPTIONS.forEach((option, index) => {
        const selected = index === gameData.menuSelection;
        menuContent.push(`{${selected ? "yellow" : "white"}-fg}${selected ? "> " : "  "}${option}{/}`);
    });
    menuBox = blessed.box({
        fixed: true,
        parent: gameArea,
        top: "center",
        left: "center",
        width: 42,
        height: menuContent.length + 2,
        tags: true,
        border: { type: "line" },
        style: { fg: "white", bg: "black", border: { fg: "green" } },
        content: menuContent.join("\n"),
    });
    screen.render();
}
async function showHighscores() {
    gameData.state = "highscores";
    try {
        gameData.highscores = await rpcHandlers.getHighscores();
    }
    catch {
        /* cached */
    }
    const content = [
        "{yellow-fg}HIGH SCORES{/}",
        "",
        "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
        "{gray-fg}----  ----  --------   -----{/}",
    ];
    gameData.highscores.slice(0, 10).forEach((score, i) => {
        content.push(`{cyan-fg}${(i + 1)
            .toString()
            .padStart(2)}.{/}   {white-fg}${score.name.padEnd(4)}{/}  {yellow-fg}${score.score
            .toString()
            .padStart(8)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`);
    });
    content.push("", "{gray-fg}Press any key to return{/}");
    if (menuBox)
        menuBox.destroy();
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
function showHelp() {
    const content = [
        "{yellow-fg}HOW TO PLAY{/}",
        "",
        "{cyan-fg}OBJECTIVE:{/}",
        "Trap enemies in bubbles and pop them!",
        "",
        "{green-fg}CONTROLS:{/}",
        "Arrow Keys - Move Bub",
        "Z/Up - Jump",
        "X/Space - Blow bubble",
        "",
        "{magenta-fg}TIPS:{/}",
        "Pop multiple enemies for combos!",
        "Collect fruit for bonus points.",
        "Get shoes for speed, candy for range.",
        "",
        "{red-fg}WARNING:{/}",
        "HURRY UP = Angry enemies!",
        "",
        "{gray-fg}Press any key to return{/}",
    ];
    if (menuBox)
        menuBox.destroy();
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
function startGame() {
    gameData = { ...createInitialGameData(), state: "playing" };
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    game = new BubbleBobbleGame(gameData, (content) => {
        gameArea.setContent(content);
        hudBox.setContent(formatHUD());
        screen.render();
    }, () => showGameOver(), () => showLevelComplete());
    game.initLevel();
    if (gameLoop)
        clearInterval(gameLoop);
    gameLoop = setInterval(() => {
        if (gameData.state === "playing")
            game?.update();
    }, GAME_TICK_MS);
}
function showLevelComplete() {
    if (menuBox)
        menuBox.destroy();
    const content = [
        "{green-fg}LEVEL COMPLETE!{/}",
        "",
        `{white-fg}Level ${gameData.level} cleared!{/}`,
        "",
        "{gray-fg}Press SPACE for next level{/}",
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
function nextLevel() {
    gameData.level++;
    gameData.state = "playing";
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    game?.initLevel();
}
function showGameOver() {
    if (menuBox)
        menuBox.destroy();
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
function handleInput(key) {
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
        case "levelComplete":
            handleLevelCompleteInput(inputKey);
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
function normalizeKey(key) {
    if (key === "\x1b[A" || key === "w")
        return "up";
    if (key === "\x1b[B" || key === "s")
        return "down";
    if (key === "\x1b[C" || key === "d")
        return "right";
    if (key === "\x1b[D" || key === "a")
        return "left";
    if (key === " " || key === "x")
        return "bubble";
    if (key === "z")
        return "jump";
    if (key === "\r" || key === "\n")
        return "enter";
    if (key === "\x1b")
        return "escape";
    if (key === "\x7f" || key === "\b")
        return "backspace";
    return key.toLowerCase();
}
function handleMenuInput(key) {
    if (key === "up") {
        gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
        renderMenu();
    }
    else if (key === "down") {
        gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
        renderMenu();
    }
    else if (key === "enter" || key === "bubble") {
        if (gameData.menuSelection === 0)
            startGame();
        else if (gameData.menuSelection === 1)
            showHighscores();
        else if (gameData.menuSelection === 2)
            showHelp();
        else {
            cleanup();
            doorContext?.close();
        }
    }
    else if (key === "q" || key === "escape") {
        cleanup();
        doorContext?.close();
    }
}
function handleGameInput(key) {
    if (key === "left") {
        game?.handleMove("left");
    }
    else if (key === "right") {
        game?.handleMove("right");
    }
    else if (key === "jump" || key === "up") {
        game?.handleJump();
    }
    else if (key === "bubble") {
        game?.handleBubble();
    }
    else if (key === "p") {
        showPauseScreen();
    }
    else if (key === "q" || key === "escape") {
        gameData.state = "menu";
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        showMenu();
    }
}
function showPauseScreen() {
    gameData.state = "paused";
    if (menuBox)
        menuBox.destroy();
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
function handlePausedInput(key) {
    if (key === "p") {
        if (menuBox) {
            menuBox.destroy();
            menuBox = null;
        }
        gameData.state = "playing";
        game?.render();
    }
    else if (key === "q" || key === "escape") {
        gameData.state = "menu";
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        showMenu();
    }
}
function handleLevelCompleteInput(key) {
    if (key === "bubble" || key === "enter") {
        nextLevel();
    }
    else if (key === "q" || key === "escape") {
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        showMenu();
    }
}
function handleGameOverInput(key) {
    if (key === "enter" || key === "bubble") {
        const lowest = gameData.highscores[gameData.highscores.length - 1]?.score || 0;
        if (gameData.score > lowest || gameData.highscores.length < 10) {
            gameData.state = "enterName";
            gameData.playerName = "";
            showNameEntry();
        }
        else
            showMenu();
    }
    else if (key === "q" || key === "escape")
        showMenu();
}
function showNameEntry() {
    if (menuBox)
        menuBox.destroy();
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
        content: `{yellow-fg}NEW HIGH SCORE!{/}\n\n{white-fg}Score: {yellow-fg}${gameData.score}{/}\n\n{cyan-fg}Enter initials:{/}\n\n{white-fg}[ ${gameData.playerName.padEnd(3, "_")} ]{/}\n\n{gray-fg}ENTER when done{/}`,
    });
    screen.render();
}
async function handleNameEntryInput(key) {
    if (key === "enter" && gameData.playerName.length > 0) {
        try {
            await rpcHandlers.saveHighscore({
                name: gameData.playerName,
                score: gameData.score,
                level: gameData.level,
            });
        }
        catch {
            /* ignore */
        }
        showMenu();
    }
    else if (key === "backspace" && gameData.playerName.length > 0) {
        gameData.playerName = gameData.playerName.slice(0, -1);
        showNameEntry();
    }
    else if (key === "escape") {
        showMenu();
    }
    else if (typeof key === "string" &&
        key.length === 1 &&
        /[A-Za-z0-9]/.test(key) &&
        gameData.playerName.length < 3) {
        gameData.playerName += key.toUpperCase();
        showNameEntry();
    }
}
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
    if (gamepadManager) {
        gamepadManager.destroy();
        gamepadManager = null;
    }
    if (screen) {
        screen.removeAllListeners();
        screen.destroy();
    }
}
door.onStart(async (ctx) => {
    console.log("[Bubble Bobble] Server component starting...");
    doorContext = ctx;
    gameData = createInitialGameData();
    // Prevent event loop from emptying
    keepAlive = setInterval(() => { }, 60000);
    try {
        gameData.highscores = await rpcHandlers.getHighscores();
    }
    catch {
        /* cached */
    }
    initScreen();
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Set up gamepad support
    gamepadManager = new GamepadInputManager(ctx.session);
    // D-pad/analog for movement
    gamepadManager.on('dpad:left', () => {
        if (gameData.state === 'playing') {
            game?.handleMove('left');
        }
    });
    gamepadManager.on('dpad:right', () => {
        if (gameData.state === 'playing') {
            game?.handleMove('right');
        }
    });
    gamepadManager.on('axis:left-x', (value) => {
        if (gameData.state === 'playing') {
            if (value < -0.3) {
                game?.handleMove('left');
            }
            else if (value > 0.3) {
                game?.handleMove('right');
            }
        }
    });
    // Menu navigation
    gamepadManager.on('dpad:up', () => {
        if (gameData.state === 'menu') {
            gameData.menuSelection = Math.max(0, gameData.menuSelection - 1);
            renderMenu();
        }
    });
    gamepadManager.on('dpad:down', () => {
        if (gameData.state === 'menu') {
            gameData.menuSelection = Math.min(3, gameData.menuSelection + 1);
            renderMenu();
        }
    });
    // A button for jump
    gamepadManager.on('button:a', (pressed) => {
        if (!pressed)
            return;
        if (gameData.state === 'playing') {
            game?.handleJump();
        }
        else if (gameData.state === 'menu') {
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
        }
    });
    // B button for bubble
    gamepadManager.on('button:b', (pressed) => {
        if (!pressed)
            return;
        if (gameData.state === 'playing') {
            game?.handleBubble();
        }
    });
    // START for pause
    gamepadManager.on('button:start', (pressed) => {
        if (!pressed)
            return;
        if (gameData.state === 'playing') {
            showPauseScreen();
        }
        else if (gameData.state === 'paused') {
            if (menuBox) {
                menuBox.destroy();
                menuBox = null;
            }
            gameData.state = 'playing';
            game?.render();
        }
    });
    // SELECT for quit
    gamepadManager.on('button:select', (pressed) => {
        if (!pressed)
            return;
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
door.onInput((ctx, key) => handleInput(key.raw || key.key || key));
door.onClose(() => cleanup());
door.onError((ctx, error) => {
    console.error("[Bubble Bobble] Error:", error);
    cleanup();
});
export default door;
