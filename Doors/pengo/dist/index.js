"use strict";
/**
 * Pengo - Server/Fallback Door Entry Point
 * 1982 Sega arcade puzzle game port
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcHandlers = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const arcade_1 = require("@amiexpress/bbs-door-sdk/engines/ui/arcade");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const path_1 = require("path");
const pengo_game_1 = require("./game/pengo-game");
const initial_data_1 = require("./game/initial-data");
const server_1 = require("./server");
Object.defineProperty(exports, "rpcHandlers", { enumerable: true, get: function () { return server_1.rpcHandlers; } });
const constants_1 = require("./game/constants");
const camera_1 = require("./game/camera");
const spriteSheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, "sprites"));
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
let inputManager = null;
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
        // The 15x17 world (75 characters) is narrower than the 80-column
        // terminal - it fits with room to spare, unlike the 30 character
        // rows the camera has to scroll for. Centring it, rather than
        // pinning to the left edge, is the only place that spare width goes.
        left: "center",
        width: constants_1.BOARD_COLS,
        height: constants_1.BOARD_ROWS,
        fixed: true,
        tags: true,
        style: { bg: "black" },
    });
    footerBox = new blessed_1.Box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: "100%",
        height: 1,
        tags: true,
        content: "{gray-fg}Arrow Keys: Move | Space: Push Block | P: Pause | Q: Quit{/}",
    });
}
/**
 * ASCII arrows for the Sno-Bees the camera window is currently hiding.
 *
 * The maze is 15 rows tall and only 11 fit on screen at once; a camera
 * that scrolls the rest into view can hide the Sno-Bee about to reach
 * Pengo. That is only acceptable if the HUD says so - see the cell-art
 * camera module's own doc comment on `offScreenMarkers`. This door's
 * camera only ever scrolls vertically (the maze is exactly as wide as the
 * screen can show), so only 'n'/'ne'/'nw' and 's'/'se'/'sw' markers can
 * ever occur here.
 */
function offscreenIndicator() {
    const markers = (0, camera_1.offscreenEnemyMarkers)(gameData);
    if (markers.length === 0)
        return "";
    const above = markers.filter(m => m.direction[0] === "n").length;
    const below = markers.filter(m => m.direction[0] === "s").length;
    const parts = [];
    if (above > 0)
        parts.push(`^${above}`);
    if (below > 0)
        parts.push(`v${below}`);
    if (parts.length === 0)
        return "";
    return `  {magenta-fg}OFF: ${parts.join(" ")}{/}`;
}
function formatHUD() {
    const scoreStr = gameData.score.toString().padStart(8, "0");
    const livesStr = "*".repeat(Math.max(0, gameData.lives));
    const timeColor = gameData.timeRemaining <= 30 ? "red" : "yellow";
    const enemies = gameData.enemies.filter(e => e.state !== "dead").length;
    return (`{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  ` +
        `{red-fg}LIVES: ${livesStr}{/}  {${timeColor}-fg}TIME: ${gameData.timeRemaining}{/}  ` +
        `{white-fg}ENEMIES: ${enemies}{/}` + offscreenIndicator());
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
    // Parented to the SCREEN, not gameArea. A menu centred inside the narrower
    // gameArea box would resolve to a negative left offset whenever the menu
    // is wider than the board, hanging columns off the left edge - which is
    // exactly how it was reported: the title showing as "ngo" and the items
    // clipped.
    // Arkanoid's menu, from the shared arcade shell rather than a tenth
    // private copy of it. The width is the box's interior.
    const width = 40;
    const lines = (0, arcade_1.arcadeMenu)({
        title: ['  P E N G O  ', '   SNO-BEES  '],
        options: constants_1.MENU_OPTIONS,
        selection: gameData.menuSelection,
        width,
        subtitle: 'Classic 1982 Sega Arcade Action!',
    });
    menuBox = new blessed_1.Box({
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
async function showHighscores() {
    sfx?.play("select");
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
    const body = [...items, "", "{gray-fg}Press any key to return{/}"];
    menuBox = new blessed_1.Box({
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
function showHelp() {
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
    if (menuBox)
        menuBox.destroy();
    const body = content.split("\n").concat(["", "{gray-fg}Press any key to return{/}"]);
    menuBox = new blessed_1.Box({
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
function startGame() {
    sfx?.play("start");
    gameData = { ...(0, initial_data_1.createInitialGameData)(), state: "playing" };
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    game = new pengo_game_1.PengoGame(gameData, (content) => {
        gameArea.setContent(content);
        hudBox.setContent(formatHUD());
        screen.render();
        // Every event that changes the board repaints it, so this is the
        // one place that sees them all.
        if (sfx && game)
            sfx.flush(game.cues);
    }, spriteSheet);
    game.initLevel();
    if (gameLoop)
        clearInterval(gameLoop);
    gameLoop = setInterval(() => {
        if (gameData.state === "playing") {
            pollHeldDirections();
            game?.update();
        }
        // The state can change inside update() - a wave finished, a last life
        // lost - and those paths return before the game repaints. Draining here
        // as well means the sound still lands on the tick it happened on.
        if (sfx && game)
            sfx.flush(game.cues);
        syncMusicState();
    }, constants_1.GAME_TICK_MS);
}
/**
 * Tell the server what screen this is, for the client's music poll.
 *
 * Called from the input handler and the game loop rather than from each
 * individual transition - there are a dozen of those, and one of them
 * would eventually be missed (the Super Qix rule).
 */
function syncMusicState() {
    (0, server_1.setMusicState)(gameData.state);
}
function handleInput(key) {
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
        case "dying":
        case "levelComplete":
            // Timed animation hand-overs: the game loop drives these itself
            // (death via pengo.isDead/deathFrame in PengoGame.update(); level
            // transition via the setTimeout in update() that flips state back to
            // 'playing' after 2000ms). A keypress here must be a no-op - routing
            // it to showMenu() was the bug ("the game ends after level 1").
            break;
        default: {
            // Exhaustiveness guard: every GameState member above is handled
            // explicitly, so gameData.state narrows to `never` here. Adding a
            // state to the union without adding a case above fails this
            // assignment at compile time instead of silently falling through to
            // a runtime default. No runtime action is taken for an unrecognized
            // value - a no-op is safe; dumping the player to showMenu() mid-game
            // is exactly the destructive fallback this fix removes.
            const _exhaustive = gameData.state;
            void _exhaustive;
        }
    }
    syncMusicState();
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
        gameData.menuSelection = (0, arcade_1.moveSelection)(gameData.menuSelection, constants_1.MENU_OPTIONS.length, -1);
        sfx?.play("blip");
        renderMenu();
    }
    else if (key === "down") {
        gameData.menuSelection = (0, arcade_1.moveSelection)(gameData.menuSelection, constants_1.MENU_OPTIONS.length, +1);
        sfx?.play("blip");
        renderMenu();
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
/**
 * Step the player for whichever directions are held down.
 *
 * Called once per game tick. This replaces reacting to the character
 * stream, which arrives as the client's auto-repeat - one character, a
 * ~400ms gap, then a burst - and made movement stutter. Holding a key now
 * moves at a steady rate from the moment it goes down.
 */
function pollHeldDirections() {
    if (!inputManager?.isKeyStateActive())
        return;
    for (const dir of ["up", "down", "left", "right"]) {
        if (inputManager.consumeRepeat(dir, { repeatRate: 90 })) {
            game?.handleDirection(dir);
        }
    }
}
function handleGameInput(key) {
    if (key === "up" || key === "down" || key === "left" || key === "right") {
        // Held keys drive movement when real key edges are available; acting on
        // the character too would move twice per press.
        if (inputManager?.isKeyStateActive())
            return;
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
/**
 * Sound effects, over the session socket to the browser.
 *
 * Null over telnet and until the door starts; every call site treats that
 * as "nobody is listening", which is the truth rather than an error.
 */
let sfx = null;
function cleanup() {
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
door.onStart(async (ctx) => {
    // A browser session has a socket; a telnet one does not, and ArcadeSfx
    // treats a missing socket as "nobody is listening" rather than an error.
    sfx = new arcade_1.ArcadeSfx(ctx?.socket);
    doorContext = ctx;
    gameData = (0, initial_data_1.createInitialGameData)();
    // Prevent event loop from emptying
    keepAlive = setInterval(() => { }, 60000);
    try {
        gameData.highscores = await server_1.rpcHandlers.getHighscores();
    }
    catch {
        /* cached */
    }
    initScreen();
    // Set up input management (enables mouse, keyboard routing)
    inputManager = new blessed_helpers_1.DoorInputManager(ctx, screen, {
        enableGameMode: true, // Game needs raw keyboard input
        enableGrabKeys: true, // Capture all keys for game controls
        enableMouse: true, // Enable mouse events
        trackHeldKeys: true, // Move from held keys, not the auto-repeat stream
        debug: false,
        debugName: 'Pengo'
    });
    inputManager.enable();
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