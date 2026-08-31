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
import { loadBackgroundForLevel } from "./game/background";
import { rpcHandlers } from "./server";
import { normalizeKey, directionForKey, canBindKey, keyLabel, helpControlLines, } from "./game/controls";
import { SCREEN_HEIGHT, GAME_TICK_MS, STARTING_LIVES, MENU_OPTIONS, SKILL_LEVELS, DEFAULT_HIGHSCORES, FIELD_WIDTH, FIELD_HEIGHT, MAX_NAME_LENGTH, DEFAULT_KEY_MAP, } from "./game/constants";
// Export RPC handlers for hybrid mode
export { rpcHandlers };
/**
 * Create initial game data
 */
function createInitialGameData() {
    return {
        state: "menu",
        lap: 1,
        skill: "medium",
        bonusLivesAwarded: 0,
        invulnerableUntil: 0,
        lastMultiplierAt: 0,
        lastMultiplier: 1,
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
        internalLines: [],
        highscores: [...DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        playerNameCursor: 0,
        lastUpdateTime: Date.now(),
        frameCount: 0,
        levelStartTime: Date.now(),
        stopTimer: 0, gremlinsCaptured: 0,
        keyMap: { ...DEFAULT_KEY_MAP },
        remapDirection: 0,
        remapMessage: "",
        timeMeter: 0,
        warp: null,
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
let doorContext; // Will be set on start
let inputManager = null;
/**
 * The player's BBS handle, taken from the session.
 *
 * It names their saved key bindings and goes on the high score board, so a
 * handle longer than three characters can finally be recorded - the arcade's
 * three initials are not a BBS name.
 */
let bbsUsername = "";
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
        // blessed.box() is a Panel here, and a Panel draws a blue line border
        // unless one is asked for explicitly. On a one-row box that border IS
        // the box, so the HUD never appeared at all.
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
        height: SCREEN_HEIGHT - 4,
        tags: true,
        // The engine lays the playfield out itself: one line per field row,
        // exactly SCREEN_WIDTH characters wide. Word wrapping a line that
        // already fills the box pushes a blank row in after every real row, so
        // the field rendered on every OTHER line and its bottom half - the
        // right and bottom borders included - fell off the visible area.
        wrap: false,
        // ...and the same Panel default stole two columns and two rows from
        // the playfield, which is what wrapped every row and hid the right
        // and bottom borders.
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
        border: { type: "line" },
        style: {
            border: { fg: "gray" },
        },
        content: footerText(),
    });
}
/**
 * The footer's one-line reminder, from the same bindings the help screen
 * uses - so a remap moves both, and neither can go stale on its own.
 */
function footerText() {
    const move = [
        keyLabel(gameData.keyMap.up),
        keyLabel(gameData.keyMap.down),
        keyLabel(gameData.keyMap.left),
        keyLabel(gameData.keyMap.right),
    ].every(label => label.startsWith("Arrow"))
        ? "Arrows"
        : "Your keys";
    return `{gray-fg}${move}: Move and Draw | P: Pause | Ctrl-D: Redraw | Q: Quit{/}`;
}
/**
 * Format HUD display
 */
function formatHUD() {
    // Laid out like the arcade: score, the round, the level's word with the
    // letters already collected picked out, and the ratio claimed so far
    // against what the level needs.
    const scoreStr = gameData.score.toString().padStart(6, "0");
    const livesStr = "*".repeat(Math.max(0, gameData.lives));
    const ratio = Math.floor(gameData.claimedPercent);
    const word = (gameData.levelWord || "")
        .split("")
        .map(letter => gameData.collectedLetters.includes(letter)
        ? `{lightyellow-fg}${letter}{/lightyellow-fg}`
        : `{gray-fg}${letter}{/gray-fg}`)
        .join("");
    return (`{lightred-fg}SCORE{/lightred-fg} {lightgreen-fg}${scoreStr}{/lightgreen-fg}  ` +
        `{lightred-fg}ROUND{/lightred-fg} {lightgreen-fg}${gameData.level}{/lightgreen-fg}  ` +
        `{lightcyan-fg}[{/lightcyan-fg}${word}{lightcyan-fg}]{/lightcyan-fg}  ` +
        `{lightred-fg}RATIO{/lightred-fg} {lightyellow-fg}${ratio}%{/lightyellow-fg}` +
        `{lightred-fg}/${gameData.targetPercent}%{/lightred-fg}  ` +
        `{red-fg}${livesStr}{/red-fg}`);
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
        // The skill row shows what it is set to, and Enter cycles it. In the
        // arcade this was an operator switch inside the cabinet (FAQ 4).
        const label = option === SKILL_ROW
            ? `${option}: ${SKILL_LEVELS[gameData.skill].label}`
            : option;
        menuContent.push(`${prefix}${label}{/}`);
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
        // Generated from the LIVE key map, so a remap shows up here and the
        // list cannot drift. It had: this block still advertised "Z - Slow
        // Draw (2x points)" and "X - Fast Draw" long after FAQ 2.5.3 was
        // honoured and the door was given the one draw button it really has.
        ...helpControlLines(gameData.keyMap),
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
 * Load the picture for a level and hand it to the engine.
 *
 * Reading the art is I/O, so it happens here rather than inside initLevel.
 * A board with no backgrounds/ directory simply gets null and the playfield
 * draws in flat colour, exactly as it did before.
 */
async function applyLevelBackground(level) {
    try {
        engine?.setBackground(await loadBackgroundForLevel(level));
    }
    catch (error) {
        console.error("[Super Qix] Background load failed:", error);
        engine?.setBackground(null);
    }
}
/** The menu row that carries the skill setting (FAQ 4). */
const SKILL_ROW = "Skill";
/** The menu row that opens the key remapper. */
const KEYS_ROW = "Keys";
/** The directions the remap screen asks for, in QUIX's order. */
const REMAP_ORDER = ["up", "down", "left", "right"];
/**
 * Open the remapper and ask for the first direction.
 */
function showRemapScreen() {
    gameData.state = "remapKeys";
    gameData.remapDirection = 0;
    gameData.remapMessage = "";
    renderRemapScreen();
}
function renderRemapScreen() {
    const asking = REMAP_ORDER[gameData.remapDirection];
    const content = [
        "{yellow-fg}MOVEMENT KEYS{/}",
        "",
        ...REMAP_ORDER.map((direction, index) => {
            const bound = keyLabel(gameData.keyMap[direction]);
            const label = `Move ${direction}`.padEnd(12);
            if (index < gameData.remapDirection) {
                return `{green-fg}${label}${bound}{/}`;
            }
            if (index === gameData.remapDirection) {
                return `{white-fg}${label}{/}{yellow-fg}press a key{/}`;
            }
            return `{gray-fg}${label}${bound}{/}`;
        }),
        "",
        gameData.remapMessage
            ? `{red-fg}${gameData.remapMessage}{/}`
            : `{cyan-fg}Press the key for "move ${asking}"{/}`,
        "",
        "{gray-fg}Esc to cancel - the arrow keys always work{/}",
    ];
    if (menuBox) {
        menuBox.destroy();
    }
    menuBox = blessed.box({
        fixed: true,
        parent: gameArea,
        top: "center",
        left: "center",
        width: 46,
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
 * One key per direction, in order, then save and return to the menu.
 *
 * Escape abandons the whole thing, leaving the bindings exactly as they
 * were - a half-finished remap that kept the first two would be worse than
 * none at all.
 */
function handleRemapInput(key) {
    if (key === "escape") {
        showMenu();
        return;
    }
    const direction = REMAP_ORDER[gameData.remapDirection];
    const verdict = canBindKey(key, direction);
    if (!verdict.ok) {
        gameData.remapMessage = verdict.reason ?? "That key cannot be used";
        renderRemapScreen();
        return;
    }
    gameData.keyMap[direction] = key;
    gameData.remapMessage = "";
    gameData.remapDirection++;
    if (gameData.remapDirection >= REMAP_ORDER.length) {
        void persistSettings();
        footerBox?.setContent(footerText());
        showMenu();
        return;
    }
    renderRemapScreen();
}
/**
 * Remember the bindings for this BBS user.
 *
 * Best-effort: a board with no writable Doors volume should still let the
 * player play with the keys they just chose for this session.
 */
async function persistSettings() {
    try {
        await rpcHandlers.saveSettings({
            user: bbsUsername,
            keyMap: gameData.keyMap,
        });
    }
    catch (error) {
        console.error("[Super Qix] Could not save settings:", error);
    }
}
/** Step to the next skill level. */
function cycleSkill() {
    const order = ["easy", "medium", "hard"];
    const next = (order.indexOf(gameData.skill) + 1) % order.length;
    gameData.skill = order[next];
}
/**
 * Start the game
 */
async function startGame() {
    gameData.state = "playing";
    gameData.score = 0;
    // FAQ 4: how many lives you get is the skill setting, not a constant.
    gameData.lives = SKILL_LEVELS[gameData.skill].lives;
    gameData.bonusLivesAwarded = 0;
    gameData.level = 1;
    gameData.lap = 1;
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
    await applyLevelBackground(1);
    engine.initLevel(1);
    // Start game loop
    if (gameLoop) {
        clearInterval(gameLoop);
    }
    gameLoop = setInterval(() => {
        if (gameData.state === "playing") {
            // Drive movement from the keys actually held down, the way Arkanoid
            // does: one step per frame while a direction is held, with no wait
            // for the client's auto-repeat. handleDirection keeps its own move
            // throttle, so this sets responsiveness, not speed.
            if (inputManager?.isKeyStateActive()) {
                for (const dir of ["up", "down", "left", "right"]) {
                    // The bound key, not the direction's name: after a remap the
                    // client reports the key the player actually holds down, and
                    // asking for "up" would find nothing held.
                    if (inputManager.isHeld(gameData.keyMap[dir]))
                        engine?.handleDirection(dir);
                }
            }
            engine?.update();
        }
        else if (gameData.state === "gameover") {
            // Keep painting so the GAME OVER prompt blinks. Nothing drew this
            // state at all before, so losing the last life froze the board.
            gameData.frameCount++;
            engine?.render();
        }
        else if (gameData.state === "levelTransition") {
            // The arcade hand-over: the picture wipes in from the right taking
            // the player's lines with it, the BONUS tally sits over the
            // finished image, the picture wipes away, and the next round
            // announces itself. Only then does the level advance.
            const stillPlaying = engine?.advanceLevelOutro() ?? false;
            if (stillPlaying)
                return;
            gameData.transitionTimer--;
            if (gameData.transitionTimer <= 0) {
                // Reveal a different picture on the next level. The load is async;
                // advance once it is in place so the new level never paints a frame
                // with the previous level's art.
                const nextLevel = gameData.level + 1;
                void applyLevelBackground(nextLevel).then(() => engine?.advanceLevel());
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
        case "remapKeys":
            handleRemapInput(inputKey);
            break;
        case "levelTransition":
            // The level is being handed over. Enter cuts the sequence short -
            // the reveal, the tally and the announcement run for several seconds
            // and nobody wants to sit through them twice.
            //
            // Any OTHER key is swallowed rather than falling through to the
            // default below, which sent the player back to the MENU on any
            // keypress - clearing a level looked like the game quitting on you.
            if (inputKey === "enter" || inputKey === "space") {
                engine?.skipOutro();
            }
            break;
        default:
            // An unknown state should not throw the player out of their game.
            break;
    }
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
            switch (MENU_OPTIONS[gameData.menuSelection]) {
                case "Start Game":
                    startGame();
                    break;
                case SKILL_ROW:
                    cycleSkill();
                    renderMenu();
                    break;
                case "High Scores":
                    showHighscores();
                    break;
                case KEYS_ROW:
                    showRemapScreen();
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
 * Handle game input
 */
function handleGameInput(key) {
    // The arrow keys and WASD answer for themselves; a remapped key is
    // consulted on top of them, so remapping never takes the arrows away.
    const direction = directionForKey(key, gameData.keyMap);
    if (direction) {
        // When real key-down/key-up edges are available the game loop drives
        // movement from the held keys instead (see the gameLoop below), which
        // is what removes the client's ~400ms auto-repeat gap. Acting on the
        // character here as well would move the marker twice per press.
        //
        // A REMAPPED key is acted on here regardless: the loop can only see it
        // if the client reports that key by name, and a binding that silently
        // did nothing on some clients would be worse than no binding at all.
        // handleDirection throttles itself, so the overlap costs nothing.
        const isDefaultBinding = key === direction;
        if (!isDefaultBinding || !inputManager?.isKeyStateActive()) {
            engine?.handleDirection(direction);
        }
        return;
    }
    switch (key) {
        // Super Qix has ONE draw button - no slow/fast choice (FAQ 2.5.3).
        case "space":
        case "z":
        case "x":
            engine?.handleDraw();
            break;
        // A BBS line that drops a few bytes leaves the board looking wrong and
        // the player with no way to ask for it again. QUIX has the same key.
        case "ctrl-d":
            redraw();
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
 * Repaint everything (Ctrl-D).
 *
 * The engine owns the board and blessed owns the frame around it, so both
 * have to be asked - repainting only one leaves half a screen.
 */
function redraw() {
    engine?.render();
    screen?.render();
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
            // Pre-filled with the BBS handle rather than blanked: the board knows
            // who this is, and typing three initials is a coin-op ritual.
            gameData.playerName = bbsUsername.toUpperCase().substring(0, MAX_NAME_LENGTH);
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
        "{cyan-fg}Name for the high score table:{/}",
        "",
        `{white-fg}[ ${gameData.playerName.padEnd(MAX_NAME_LENGTH, "_")} ]{/}`,
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
        if (gameData.playerName.length < MAX_NAME_LENGTH) {
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
    // Frogger's pattern: the board already knows who is playing, so nobody
    // should have to type their own name in.
    bbsUsername = ctx?.session?.user?.username || "";
    gameData.playerName = bbsUsername.toUpperCase().substring(0, MAX_NAME_LENGTH);
    try {
        const settings = await rpcHandlers.getSettings({ user: bbsUsername });
        gameData.keyMap = settings.keyMap;
    }
    catch {
        // Keep the defaults - the arrow keys work regardless.
    }
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
        trackHeldKeys: true, // Move from held keys, not the auto-repeat stream
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
