"use strict";
/**
 * Pengo - Server/Fallback Door Entry Point
 * 1982 Sega arcade puzzle game port
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcHandlers = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const pengo_game_1 = require("./game/pengo-game");
const server_1 = require("./server");
Object.defineProperty(exports, "rpcHandlers", { enumerable: true, get: function () { return server_1.rpcHandlers; } });
const constants_1 = require("./game/constants");
function createInitialGameData() {
    return {
        state: "menu",
        score: 0,
        lives: constants_1.STARTING_LIVES,
        level: 1,
        timeRemaining: constants_1.INITIAL_TIME,
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
        highscores: [...constants_1.DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
const door = new bbs_door_sdk_1.CoreDoor({
    name: "Pengo",
    version: "1.0.0",
    author: "AmiExpress BBS",
});
let gameData;
let screen;
let gameArea;
let hudBox;
let footerBox;
let menuBox = null; // Can be List, Box, etc.
let gameLoop = null;
let game = null;
let doorContext; // Will be set on start
function initScreen() {
    screen = new blessed_1.Screen({
        smartCSR: true,
        dockBorders: true,
        title: "Pengo",
        fullUnicode: false,
        output: (data) => doorContext?.output.write(data),
        input: null,
    });
    hudBox = new blessed_1.Box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        height: 1,
        tags: true,
        content: formatHUD(),
    });
    gameArea = new blessed_1.Box({
        parent: screen,
        top: 1,
        left: 0,
        width: constants_1.GRID_WIDTH * 2,
        height: constants_1.GRID_HEIGHT + 2,
        fixed: true,
        tags: true,
        style: { bg: "black" },
    });
    footerBox = new blessed_1.Box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: "100%",
        height: 3,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "gray" } },
        content: "{gray-fg}Arrow Keys: Move | Space: Push Block | P: Pause | Q: Quit{/}",
    });
}
function formatHUD() {
    const scoreStr = gameData.score.toString().padStart(8, "0");
    const livesStr = "*".repeat(Math.max(0, gameData.lives));
    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {red-fg}LIVES: ${livesStr}{/}`;
}
function showMenu() {
    gameData.state = "menu";
    gameData.menuSelection = 0;
    gameArea.setContent("");
    if (menuBox)
        menuBox.destroy();
    const menuList = new blessed_1.List({
        parent: gameArea,
        top: "center",
        left: "center",
        width: 40,
        height: constants_1.MENU_OPTIONS.length + 4,
        tags: true,
        border: { type: "line" },
        style: {
            fg: "white",
            bg: "black",
            border: { fg: "cyan" },
            selected: { bg: "blue", fg: "white" }
        },
        label: " Pengo ",
        items: constants_1.MENU_OPTIONS,
        keys: true,
        vi: true,
        mouse: true
    });
    menuList.on('select', (item, index) => {
        if (index === 0)
            startGame();
        else if (index === 1)
            showHighscores();
        else if (index === 2)
            showHelp();
        else {
            cleanup();
            doorContext?.close();
        }
    });
    menuList.key(['escape', 'q'], () => {
        cleanup();
        doorContext?.close();
    });
    menuList.focus();
    menuBox = menuList;
    screen.render();
}
async function showHighscores() {
    gameData.state = "highscores";
    try {
        gameData.highscores = await server_1.rpcHandlers.getHighscores();
    }
    catch {
        /* cached */
    }
    const items = [
        "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
        "{gray-fg}----  ----  --------   -----{/}",
    ];
    gameData.highscores.slice(0, 10).forEach((score, i) => {
        items.push(`{cyan-fg}${(i + 1)
            .toString()
            .padStart(2)}.{/}   {white-fg}${score.name.padEnd(4)}{/}  {yellow-fg}${score.score
            .toString()
            .padStart(8)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`);
    });
    if (menuBox)
        menuBox.destroy();
    const list = new blessed_1.List({
        parent: gameArea,
        top: "center",
        left: "center",
        width: 40,
        height: items.length + 4,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "yellow" }, bg: "black", fg: "white" },
        label: " HIGH SCORES ",
        items: items,
        interactive: false // Just display
    });
    // Footer
    new blessed_1.Box({
        parent: list,
        bottom: 0,
        width: "100%-2",
        height: 1,
        content: "{gray-fg}Press any key to return{/}",
        tags: true
    });
    list.on('keypress', () => {
        showMenu();
    });
    menuBox = list;
    list.focus(); // Focus to catch keys
    screen.render();
}
function showHelp() {
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
    if (menuBox)
        menuBox.destroy();
    const box = new blessed_1.ScrollableBox({
        parent: gameArea,
        top: "center",
        left: "center",
        width: 45,
        height: 16,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "cyan" }, bg: "black", fg: "white" },
        content: content,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: " " },
        keys: true,
        vi: true,
        mouse: true
    });
    // Footer
    new blessed_1.Box({
        parent: box,
        bottom: 0,
        width: "100%-2",
        height: 1,
        content: "{gray-fg}Press any key to return{/}",
        tags: true
    });
    box.on('keypress', (_ch, key) => {
        // ScrollableBox uses keys for scrolling. Only exit on specific keys or non-nav keys?
        // "Press any key to return" implies any.
        // But we want scrolling.
        // Let's exit on Enter, Space, Escape.
        if (['enter', 'space', 'escape'].includes(key.name)) {
            showMenu();
        }
    });
    menuBox = box;
    box.focus();
    screen.render();
}
function startGame() {
    gameData = { ...createInitialGameData(), state: "playing" };
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    game = new pengo_game_1.PengoGame(gameData, (content) => {
        gameArea.setContent(content);
        hudBox.setContent(formatHUD());
        screen.render();
    });
    game.initLevel();
    if (gameLoop)
        clearInterval(gameLoop);
    gameLoop = setInterval(() => {
        if (gameData.state === "playing")
            game?.update();
    }, constants_1.GAME_TICK_MS);
}
function handleInput(key) {
    const inputKey = normalizeKey(key);
    // Route to widgets for UI states
    if (["menu", "highscores", "help", "paused", "enterName"].includes(gameData.state)) {
        const k = { name: inputKey, full: inputKey, shift: false, ctrl: false, meta: false };
        screen.emit('keypress', key, k);
        // Fallthrough to manual handlers if widgets don't consume it?
        // Actually, if using Widgets, we shouldn't call manual handlers.
        // But we haven't refactored all states yet.
        // 'menu' is refactored. 'highscores' and 'help' will be.
        // 'paused' and 'enterName' are next.
        // For now, let's only return for 'menu'.
        if (gameData.state === "menu")
            return;
    }
    switch (gameData.state) {
        case "menu":
            // Handled by widget
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
function normalizeKey(key) {
    if (key === "\x1b[A" || key === "w")
        return "up";
    if (key === "\x1b[B" || key === "s")
        return "down";
    if (key === "\x1b[C" || key === "d")
        return "right";
    if (key === "\x1b[D" || key === "a")
        return "left";
    if (key === " ")
        return "push";
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
        showMenu();
    }
    else if (key === "down") {
        gameData.menuSelection = Math.min(constants_1.MENU_OPTIONS.length - 1, gameData.menuSelection + 1);
        showMenu();
    }
    else if (key === "enter" || key === "push") {
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
    if (key === "up" || key === "down" || key === "left" || key === "right") {
        game?.handleDirection(key);
    }
    else if (key === "push") {
        game?.handlePush();
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
    const box = new blessed_1.Box({
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
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        showMenu();
    });
    menuBox = box;
    box.focus();
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
function handleGameOverInput(key) {
    if (key === "enter" || key === "push") {
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
    const prompt = new blessed_1.Prompt({
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
                await server_1.rpcHandlers.saveHighscore({
                    name: gameData.playerName,
                    score: gameData.score,
                    level: gameData.level,
                });
            }
            catch { /* ignore */ }
            showMenu();
        }
        else {
            showMenu();
        }
    });
    menuBox = prompt;
    screen.render();
}
async function handleNameEntryInput(key) {
    if (key === "enter" && gameData.playerName.length > 0) {
        try {
            await server_1.rpcHandlers.saveHighscore({
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
    if (screen) {
        screen.removeAllListeners();
        screen.destroy();
    }
}
door.onStart(async (ctx) => {
    doorContext = ctx;
    gameData = createInitialGameData();
    // Prevent event loop from emptying
    keepAlive = setInterval(() => { }, 60000);
    try {
        gameData.highscores = await server_1.rpcHandlers.getHighscores();
    }
    catch {
        /* cached */
    }
    initScreen();
    showMenu();
});
door.onInput((ctx, key) => handleInput(key.raw || key.key || key));
door.onClose(() => cleanup());
door.onError((ctx, error) => {
    console.error("[Pengo] Error:", error);
    cleanup();
});
exports.default = door;
//# sourceMappingURL=index.js.map