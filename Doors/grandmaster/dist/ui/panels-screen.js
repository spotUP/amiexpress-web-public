"use strict";
/**
 * The TETRIS ATTACK screen: the board, the HUD, and the loop that drives them.
 *
 * Modelled on ui/tetrinet-screen.ts - a 16ms interval that advances the engine
 * and repaints at a slower rate - with one deliberate difference.
 *
 * THE ENGINE IS FED THE SAME WAY A REPLAY IS. Every frame this screen builds a
 * single input character from the held keys and hands it to the stack, exactly
 * as a recorded replay or a netplay opponent would. So the live game, a replay
 * and a networked game all run through one code path: the cursor's auto-repeat,
 * the every-other-frame swap rule and the raise gating are the engine's, not a
 * second implementation living in the UI that could drift from it.
 *
 * TIMING. The engine is frame-exact at 60Hz and the terminal is not. The two
 * are decoupled: a fixed-timestep accumulator runs whole engine frames, capped
 * at eight per tick so a slow repaint cannot run thirty frames back to back
 * with no input sampled between them, and the repaint is throttled separately.
 * That cap is the same one core/game.ts uses, for the same reason.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INPUT_CHARS = exports.PanelsScreen = void 0;
exports.noInput = noInput;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const clear_screen_1 = require("./clear-screen");
const board_view_1 = require("./panels/board-view");
const layout_1 = require("./panels/layout");
const input_codec_1 = require("../core/panels/input-codec");
Object.defineProperty(exports, "INPUT_CHARS", { enumerable: true, get: function () { return input_codec_1.INPUT_CHARS; } });
/** The engine's frame rate. Not negotiable: every constant is in these frames. */
const FRAME_TIME = 1000 / 60;
/**
 * Most engine frames one tick may run. Eight is ~133ms - generous for a slow
 * repaint, and far short of letting a stall run a whole chain uninterrupted.
 */
const MAX_CATCHUP_FRAMES = 8;
/** How often the board is repainted. Twenty a second is plenty for panels. */
const RENDER_INTERVAL = 50;
/** How often the loop wakes. */
const TICK_INTERVAL = 16;
class PanelsScreen {
    /**
     * The board being played.
     *
     * A getter, not a field, because undo rebuilds the puzzle's stack from its
     * input history - a captured reference would keep drawing the board the
     * player just took back.
     */
    get stack() {
        return this.puzzle ? this.puzzle.stack : this.soloStack;
    }
    constructor(options) {
        this.lastTick = 0;
        this.frameAccumulator = 0;
        this.lastRender = 0;
        this.quitting = false;
        /** Set by the caller's undo key; acted on at the top of the next frame. */
        this.undoRequested = false;
        this.screen = options.screen;
        this.puzzle = options.puzzle;
        this.soloStack = options.stack;
        this.onStep = options.onStep;
        this.isOver = options.isOver;
        this.recorder = options.recorder;
        this.playback = options.playback ?? false;
        if (!this.puzzle && !this.soloStack) {
            throw new Error('PanelsScreen needs either a stack or a puzzle');
        }
        this.sheet = options.sheet;
        this.sounds = options.sounds;
        this.readInput = options.readInput;
        // Below 80 columns is the compact screen, which uses the C64 sheet.
        this.variant = options.variant
            ?? (this.screen.width < 80 ? 'c64' : 'wide');
    }
    /** Lay the board and HUD out, centred in whatever room there is. */
    setupUI() {
        // THE SCREEN IS CLEARED FIRST, like every other screen in this door.
        //
        // This one did not, so TETRIS ATTACK painted on top of whatever the
        // player came from: a TetriNET Stats panel and half a NEXT box sat over
        // the board, at the columns an 80-column layout had put them - which is
        // exactly why it read as "tetris attack looks like it's 80 columns?
        // layout broken" (2026-09-06). The leftovers were another screen's, not
        // this one's geometry.
        (0, clear_screen_1.clearScreen)(this.screen);
        const { cols, rows } = (0, board_view_1.boardSize)(this.stack, this.boardOptions());
        // Geometry comes from the live screen width, never from a constant.
        // A PETSCII cell is square; an xterm cell is half as wide as it is tall.
        // The layout has to know which, because it decides what a square TILE is.
        const layout = (0, layout_1.panelsLayout)(this.screen.width, this.screen.height, cols, rows, this.variant === 'c64' ? layout_1.CELL_ASPECT.petscii : layout_1.CELL_ASPECT.terminal);
        this.layout = layout;
        // The well gets a frame where there is room for one. The layout has always
        // said whether to draw it - `border`, from the compact profile - and
        // nothing read the flag, so the board floated in the middle of an empty
        // screen with no edge to it. At 40 columns the profile turns borders off.
        if (layout.border) {
            this.frameBox = (0, bbs_door_sdk_1.createBox)({
                parent: this.screen,
                top: Math.max(0, layout.board.top - 1),
                left: Math.max(0, layout.board.left - 1),
                width: layout.board.width + 2,
                height: layout.board.height + 2,
                label: ' TETRIS ATTACK ',
                tags: true,
                style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
            });
        }
        this.boardBox = (0, bbs_door_sdk_1.createBox)({
            parent: this.screen,
            top: layout.board.top,
            left: layout.board.left,
            width: layout.board.width,
            height: layout.board.height,
            border: undefined,
            tags: true,
            style: { bg: 'black' },
        });
        // Mouse click to swap.
        //
        // THE BOARD IS DRAWN UPSIDE DOWN relative to the engine: buffer row 0 is
        // the TOP of the playfield and engine row 1 is the bottom, which is what
        // bufferRowFor expresses. Reading the click as `y + 1` therefore mirrored
        // it - clicking the stack asked to swap the empty rows above it, canSwap
        // refused because both cells were air, and nothing happened. That is the
        // "sometimes when I click to swap tiles it doesn't work" a caller hit.
        //
        // The inverse of bufferRowFor lives beside it, so the two cannot drift.
        this.boardBox.on('click', (data) => {
            const relX = data.x - layout.board.left;
            const relY = data.y - layout.board.top;
            const col = Math.floor(relX / (0, board_view_1.panelCols)(this.variant)) + 1;
            const row = (0, board_view_1.engineRowFor)(this.stack, Math.floor(relY));
            // A swap needs a panel to its right, and the dimmed incoming row below
            // the floor is not in play.
            if (col < 1 || col > this.stack.width - 1)
                return;
            if (row < 1 || row > this.stack.height)
                return;
            this.stack.requestMouseSwap(row, col);
        });
        this.hudBox = (0, bbs_door_sdk_1.createBox)({
            parent: this.screen,
            top: layout.hud.top,
            left: layout.hud.left,
            width: layout.hud.width,
            height: layout.hud.height,
            border: undefined,
            tags: true,
            style: { fg: 'white', bg: 'black' },
        });
    }
    /** The single input character for this frame. */
    inputCharacter() {
        const held = this.readInput();
        return (0, input_codec_1.encodeInput)((0, input_codec_1.inputStateToMask)(held));
    }
    renderHud() {
        if (!this.hudBox || !this.layout)
            return;
        const stack = this.stack;
        const seconds = Math.floor(stack.stopWatch / 60);
        const timeText = `${Math.floor(seconds / 60)}'${String(seconds % 60).padStart(2, '0')}`;
        this.hudBox.setContent((0, layout_1.hudLines)(this.layout, {
            score: stack.score,
            speed: stack.speed,
            timeText,
            chain: stack.chainCounter,
            stopped: stack.stopTime > 0,
            movesLeft: this.puzzle ? this.puzzle.movesLeft() : undefined,
            canUndo: this.puzzle ? this.puzzle.canUndo() : undefined,
        }).join('\n'));
    }
    /**
     * What the board IS on this screen - the same answer for its size and for
     * its paint, or the two disagree and the stack draws a row out of place.
     *
     * The C64 does not draw the incoming row. Twelve panel rows at double
     * height need 24 of its 25 rows, and a thirteenth would need 26: the choice
     * is a 12x24 board a player can read or a 6x13 one with a row of warning
     * under it. The sysop asked for the bigger tile, and this is what it costs -
     * the rising row is felt rather than seen there.
     */
    boardOptions() {
        return {
            variant: this.variant,
            showIncomingRow: this.variant !== 'c64',
        };
    }
    renderBoard(tick) {
        if (!this.boardBox)
            return;
        const board = (0, board_view_1.buildBoard)(this.stack, this.sheet, tick, {
            ...this.boardOptions(),
            scale: this.layout?.scale,
        });
        // bufferToTags returns one string per row.
        this.boardBox.setContent((0, cell_art_1.bufferToTags)(board).join('\n'));
    }
    repaint() {
        this.renderBoard(this.stack.clock);
        this.renderHud();
        this.screen.render();
    }
    /** Play until the stack tops out or the player leaves. */
    run() {
        this.setupUI();
        this.repaint();
        this.lastTick = Date.now();
        this.lastRender = 0;
        return new Promise((resolve) => {
            const finish = () => {
                this.cleanup();
                resolve({
                    score: this.stack.score,
                    frames: this.stack.stopWatch,
                    toppedOut: this.stack.gameEnded(),
                    puzzleOutcome: this.puzzle?.result(),
                });
            };
            this.loop = setInterval(() => {
                const now = Date.now();
                const delta = now - this.lastTick;
                this.lastTick = now;
                // Catch up, but only so far - see MAX_CATCHUP_FRAMES.
                this.frameAccumulator = Math.min(this.frameAccumulator + delta, FRAME_TIME * MAX_CATCHUP_FRAMES);
                // Undo is taken between frames, never inside the catch-up loop: it
                // replays the whole attempt, and doing that mid-catch-up would run the
                // rebuilt board forward by however many frames were still owed.
                if (this.undoRequested) {
                    this.undoRequested = false;
                    this.frameAccumulator = 0;
                    if (this.puzzle?.undo())
                        this.repaint();
                }
                while (this.frameAccumulator >= FRAME_TIME) {
                    this.frameAccumulator -= FRAME_TIME;
                    if (this.playback) {
                        this.stack.run();
                    }
                    else {
                        const input = this.inputCharacter();
                        this.recorder?.record(input);
                        if (this.puzzle) {
                            this.puzzle.receiveInput(input);
                            this.puzzle.run();
                        }
                        else {
                            this.stack.receiveConfirmedInput(input);
                            // A mode that owns the frame steps the board itself.
                            if (this.onStep)
                                this.onStep();
                            else
                                this.stack.run();
                        }
                    }
                }
                const puzzleOver = this.puzzle ? this.puzzle.result() !== 'playing' : false;
                const modeOver = this.isOver ? this.isOver() : false;
                if (puzzleOver || modeOver || this.stack.gameEnded() || this.quitting) {
                    finish();
                    return;
                }
                if (now - this.lastRender >= RENDER_INTERVAL) {
                    this.lastRender = now;
                    this.repaint();
                }
            }, TICK_INTERVAL);
        });
    }
    /** Take back the last move, on the next frame. The original binds X and Y. */
    requestUndo() {
        this.undoRequested = true;
    }
    /** Ask the loop to stop at the end of this frame. */
    quit() {
        this.quitting = true;
    }
    cleanup() {
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = undefined;
        }
        this.boardBox?.destroy();
        this.hudBox?.destroy();
        this.frameBox?.destroy();
        this.boardBox = undefined;
        this.hudBox = undefined;
        this.frameBox = undefined;
        this.screen.render();
    }
}
exports.PanelsScreen = PanelsScreen;
/** No keys held; the idle input character is 'A'. */
function noInput() {
    return { up: false, down: false, left: false, right: false, swap: false, raise: false };
}
//# sourceMappingURL=panels-screen.js.map