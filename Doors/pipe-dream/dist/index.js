/**
 * Pipe Dream - Server/Fallback Door Entry Point
 * 1989 LucasArts puzzle game
 */
import { CoreDoor as Door } from "@amiexpress/bbs-door-sdk";
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { arcadeMenu, moveSelection, ArcadeSfx } from "@amiexpress/bbs-door-sdk/engines/ui/arcade";
import { DoorInputManager } from "@amiexpress/bbs-door-sdk/utils/blessed-helpers";
import { PipeDreamGame } from "./game/pipe-dream-game";
import { createInitialGameData } from "./game/initial-data";
import { rpcHandlers } from "./server";
import { GAME_TICK_MS, MENU_OPTIONS, } from "./game/constants";
export { rpcHandlers };
const door = new Door({
    name: "Pipe Dream",
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
let inputManager = null;
let game = null;
let doorContext; // Will be set on start
function initScreen() {
    screen = blessed.screen({
        smartCSR: true,
        dockBorders: true,
        title: "Pipe Dream",
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
        // blessed.box() is a Panel here, and a Panel injects a line border
        // whenever `border` is absent. On a ONE-ROW box that border IS the whole
        // box, so the HUD never appears at all.
        border: undefined,
    });
    gameArea = blessed.box({
        fixed: true,
        parent: screen,
        top: 1,
        left: 0,
        width: "100%",
        height: "100%-4",
        tags: true,
        style: { bg: "black" },
        // The game lays its board out itself: one line per row, exactly the
        // field's width. Word wrapping a line that already fills the box pushes a
        // blank row in after every real row, so the board renders on every OTHER
        // line - reported as "the lines are too long, every second one is black".
        wrap: false,
        // ...and the same Panel default steals two columns and two rows, which is
        // what makes a full-width row overflow the box in the first place.
        border: undefined,
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
        content: "{gray-fg}Arrows: Move | Space: Place | D: Discard | P: Pause | Q: Quit{/}",
    });
}
function formatHUD() {
    const scoreStr = gameData.score.toString().padStart(6, "0");
    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  {green-fg}PIPES: ${gameData.pipesUsed}/${gameData.requiredPipes}{/}`;
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
        "{cyan-fg}",
        "  ____  _            ____                          ",
        " |  _ \\(_)_ __   ___|  _ \\ _ __ ___  __ _ _ __ ___ ",
        " | |_) | | '_ \\ / _ \\ | | | '__/ _ \\/ _` | '_ ` _ \\",
        " |  __/| | |_) |  __/ |_| | | |  __/ (_| | | | | | |",
        " |_|   |_| .__/ \\___|____/|_|  \\___|\\__,_|_| |_| |_|",
        "         |_|                                        ",
        "{/}",
        "",
        "{white-fg}LucasArts 1989{/}",
        "",
    ];
    // Arkanoid's menu, from the shared arcade shell: centred rows, the
    // selected one picked out, and one hint line. The door keeps its own
    // logo above this - Arkanoid's title is two lines of text, and these
    // games have their own.
    menuContent.push(...arcadeMenu({
        title: [],
        options: MENU_OPTIONS,
        selection: gameData.menuSelection,
        width: 54,
    }));
    menuBox = blessed.box({
        fixed: true,
        parent: gameArea,
        top: "center",
        left: "center",
        width: 56,
        height: menuContent.length + 2,
        tags: true,
        border: { type: "line" },
        style: { fg: "white", bg: "black", border: { fg: "cyan" } },
        content: menuContent.join("\n"),
    });
    screen.render();
}
async function showHighscores() {
    sfx?.play("select");
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
        "{white-fg}RANK  NAME   SCORE   LEVEL{/}",
        "{gray-fg}----  ----  ------   -----{/}",
    ];
    gameData.highscores.slice(0, 10).forEach((score, i) => {
        content.push(`{cyan-fg}${(i + 1)
            .toString()
            .padStart(2)}.{/}   {white-fg}${score.name.padEnd(4)}{/}  {yellow-fg}${score.score
            .toString()
            .padStart(6)}{/}   {green-fg}${score.level.toString().padStart(2)}{/}`);
    });
    content.push("", "{gray-fg}Press any key to return{/}");
    if (menuBox)
        menuBox.destroy();
    menuBox = blessed.box({
        fixed: true,
        parent: gameArea,
        top: "center",
        left: "center",
        width: 38,
        height: content.length + 2,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "yellow" } },
        content: content.join("\n"),
    });
    screen.render();
}
function showHelp() {
    sfx?.play("select");
    const content = [
        "{yellow-fg}HOW TO PLAY{/}",
        "",
        "{cyan-fg}OBJECTIVE:{/}",
        "Connect pipes to guide the flow!",
        "Build a path before the ooze starts!",
        "",
        "{green-fg}CONTROLS:{/}",
        "Arrow Keys - Move cursor",
        "Space - Place pipe from queue",
        "D - Discard current pipe",
        "",
        "{magenta-fg}PIPES:{/}",
        "| - Vertical    - Horizontal",
        "L J r 7 - Corner pieces",
        "+ - Cross (fills twice!)",
        "",
        "{white-fg}TIP:{/} Use more pipes than required!",
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
        width: 42,
        height: content.length + 2,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "cyan" } },
        content: content.join("\n"),
    });
    screen.render();
}
function startGame() {
    sfx?.play("start");
    gameData = { ...createInitialGameData(), state: "playing" };
    if (menuBox) {
        menuBox.destroy();
        menuBox = null;
    }
    game = new PipeDreamGame(gameData, (content) => {
        gameArea.setContent(content);
        hudBox.setContent(formatHUD());
        screen.render();
        // Every event that changes the board repaints it, so this is the
        // one place that sees them all.
        if (sfx && game)
            sfx.flush(game.cues);
    }, () => showGameOver(), () => showLevelComplete());
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
    }, GAME_TICK_MS);
}
function showLevelComplete() {
    if (menuBox)
        menuBox.destroy();
    const content = [
        "{green-fg}LEVEL COMPLETE!{/}",
        "",
        `{white-fg}Level ${gameData.level} cleared!{/}`,
        `{yellow-fg}Pipes Used: ${gameData.pipesUsed}{/}`,
        gameData.reachedEnd ? "{magenta-fg}REACHED END BONUS!{/}" : "",
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
        width: 32,
        height: 9,
        tags: true,
        border: { type: "line" },
        style: { border: { fg: "red" }, bg: "black" },
        content: `{red-fg}PIPE BURST!{/}\n\n{white-fg}Not enough pipes!{/}\n\n{yellow-fg}Score: ${gameData.score}{/}\n{cyan-fg}Level: ${gameData.level}{/}\n\n{gray-fg}Press ENTER{/}`,
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
    if (key === "\x1b[C")
        return "right";
    if (key === "\x1b[D" || key === "a")
        return "left";
    if (key === "d" || key === "D")
        return "discard";
    if (key === " ")
        return "place";
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
        gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, -1);
        sfx?.play("blip");
        renderMenu();
    }
    else if (key === "down") {
        gameData.menuSelection = moveSelection(gameData.menuSelection, MENU_OPTIONS.length, +1);
        sfx?.play("blip");
        renderMenu();
    }
    else if (key === "enter" || key === "place") {
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
 * Move the cursor for whichever directions are held down.
 *
 * Called once per game tick, replacing movement driven by the character
 * stream (the client's auto-repeat: one character, a ~400ms gap, then a
 * burst). This is a grid cursor rather than a free-roaming character, so it
 * waits before repeating - the same shape GrandMaster uses for its discrete
 * steps - and then repeats gently. Place and discard are taps and stay on
 * the character path.
 */
function pollHeldDirections() {
    if (!inputManager?.isKeyStateActive())
        return;
    for (const dir of ["up", "down", "left", "right"]) {
        if (inputManager.consumeRepeat(dir, { initialDelay: 250, repeatRate: 120 })) {
            game?.handleMove(dir);
        }
    }
}
function handleGameInput(key) {
    // Held keys drive the cursor when real key edges are available; acting on
    // the character too would move twice per press.
    const heldDrivesMovement = !!inputManager?.isKeyStateActive();
    if (key === "up") {
        if (!heldDrivesMovement)
            game?.handleMove("up");
    }
    else if (key === "down") {
        if (!heldDrivesMovement)
            game?.handleMove("down");
    }
    else if (key === "left") {
        if (!heldDrivesMovement)
            game?.handleMove("left");
    }
    else if (key === "right") {
        if (!heldDrivesMovement)
            game?.handleMove("right");
    }
    else if (key === "place") {
        game?.handlePlace();
    }
    else if (key === "discard") {
        game?.handleDiscard();
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
    if (key === "place" || key === "enter") {
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
    if (key === "enter" || key === "place") {
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
    if (inputManager) {
        inputManager.disable();
        inputManager = null;
    }
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
    // A browser session has a socket; a telnet one does not, and ArcadeSfx
    // treats a missing socket as "nobody is listening" rather than an error.
    sfx = new ArcadeSfx(ctx?.socket);
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
    // Real key-down/key-up edges, so movement can be driven by which
    // keys are actually held instead of the client's auto-repeat.
    inputManager = new DoorInputManager(ctx, screen, {
        enableGameMode: true, // Game needs raw keyboard input
        enableGrabKeys: true, // Capture all keys for game controls
        enableMouse: false, // No mouse interaction in this game
        trackHeldKeys: true, // Move from held keys, not the auto-repeat stream
        debug: false,
        debugName: 'PipeDream'
    });
    inputManager.enable();
    showMenu();
});
door.onInput((ctx, key) => handleInput(key.raw || key.key || key));
door.onClose(() => cleanup());
door.onError((ctx, error) => {
    console.error("[Pipe Dream] Error:", error);
    cleanup();
});
export default door;
