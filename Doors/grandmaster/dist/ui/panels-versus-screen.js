"use strict";
/**
 * TETRIS ATTACK with an opponent: Vs CPU and Challenge Mode.
 *
 * The same loop as the solo screen - a fixed-timestep 60Hz engine, throttled
 * repaint, one input character per frame - with a second board beside it and a
 * PanelMatch moving garbage between them.
 *
 * ONE SCREEN SERVES BOTH MODES because the two opponents differ only in what
 * they are, not in how they are driven:
 *
 *   VS CPU     a real Stack, played by PanelAi through the input path. Its
 *              board is drawn, because it has one.
 *   CHALLENGE  a SimulatedStack: an attack script and a health model with no
 *              board at all. Its slot draws a danger bar, which is what
 *              panel-attack draws too.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelsVersusScreen = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const stack_1 = require("../core/panels/stack");
const match_1 = require("../core/panels/match");
const board_view_1 = require("./panels/board-view");
const layout_1 = require("./panels/layout");
const versus_layout_1 = require("./panels/versus-layout");
const input_codec_1 = require("../core/panels/input-codec");
const FRAME_TIME = 1000 / 60;
const MAX_CATCHUP_FRAMES = 8;
const RENDER_INTERVAL = 50;
const TICK_INTERVAL = 16;
class PanelsVersusScreen {
    constructor(options) {
        /** Characters and rows per panel, the same on both boards. */
        this.scale = { x: 1, y: 1 };
        this.lastTick = 0;
        this.frameAccumulator = 0;
        this.lastRender = 0;
        this.quitting = false;
        /** Set by the caller when its session reports a lost connection. */
        this.desynced = false;
        this.screen = options.screen;
        this.player = options.player;
        this.opponent = options.opponent;
        this.cpu = options.cpu;
        this.sheet = options.sheet;
        this.readInput = options.readInput;
        this.variant = options.variant ?? (this.screen.width < 80 ? 'c64' : 'wide');
        this.stepper = options.stepper;
        this.isOver = options.isOver;
        this.match = new match_1.PanelMatch({ stacks: [this.player, this.opponent] });
    }
    /** Does the opponent have a board to draw, or only a health bar? */
    get opponentHasBoard() {
        return this.opponent instanceof stack_1.Stack;
    }
    setupUI() {
        // The C64 does not draw the incoming row here either - the same trade the
        // solo board makes, and for the same twenty-five rows.
        const options = {
            variant: this.variant,
            showIncomingRow: this.variant !== 'c64',
        };
        const { cols, rows } = (0, board_view_1.boardSize)(this.player, options);
        // Scale the tiles to the room, then lay out the SCALED boards. The view
        // used to lay out unscaled ones: two 6-column boards and a strip of
        // initials in a 40-column screen, with half of it black.
        const aspect = this.variant === 'c64' ? layout_1.CELL_ASPECT.petscii : layout_1.CELL_ASPECT.terminal;
        this.scale = (0, versus_layout_1.versusScale)(this.screen.width, this.screen.height, cols, rows, aspect, versus_layout_1.CENTRE_WIDE);
        const layout = (0, versus_layout_1.versusLayout)(this.screen.width, this.screen.height, cols * this.scale.x, rows * this.scale.y);
        this.layout = layout;
        const box = (slot) => (0, bbs_door_sdk_1.createBox)({
            parent: this.screen,
            top: slot.top,
            left: slot.left,
            width: slot.width,
            height: slot.height,
            border: undefined,
            tags: true,
            style: { fg: 'white', bg: 'black' },
        });
        this.playerBox = box(layout.player);
        this.centreBox = box(layout.centre);
        this.opponentBox = box(layout.opponent);
    }
    renderOpponent() {
        if (!this.opponentBox || !this.layout)
            return;
        if (this.opponentHasBoard) {
            const board = (0, board_view_1.buildBoard)(this.opponent, this.sheet, this.player.clock, {
                variant: this.variant,
                showIncomingRow: this.variant !== 'c64',
                scale: this.scale,
                // Never draw a cursor on someone else's board.
                showCursor: false,
            });
            this.opponentBox.setContent((0, cell_art_1.bufferToTags)(board).join('\n'));
            return;
        }
        // No board to show: a rising danger bar is genuinely all there is.
        const percentage = this.opponent.getTopOutPercentage();
        this.opponentBox.setContent((0, versus_layout_1.dangerBarRows)(this.layout, percentage).join('\n'));
    }
    repaint() {
        if (!this.layout)
            return;
        if (this.playerBox) {
            const board = (0, board_view_1.buildBoard)(this.player, this.sheet, this.player.clock, {
                variant: this.variant,
                showIncomingRow: this.variant !== 'c64',
                scale: this.scale,
            });
            this.playerBox.setContent((0, cell_art_1.bufferToTags)(board).join('\n'));
        }
        if (this.centreBox) {
            const seconds = Math.floor(this.player.stopWatch / 60);
            const timeText = `${Math.floor(seconds / 60)}'${String(seconds % 60).padStart(2, '0')}`;
            this.centreBox.setContent((0, versus_layout_1.versusCentreLines)(this.layout, {
                score: this.player.score,
                speed: this.player.speed,
                timeText,
                chain: this.player.chainCounter,
                stopped: this.player.stopTime > 0,
                incoming: this.player.incomingGarbage.len(),
            }).join('\n'));
        }
        this.renderOpponent();
        this.screen.render();
    }
    /** One engine frame for both boards. */
    step() {
        const input = (0, input_codec_1.encodeInput)((0, input_codec_1.inputStateToMask)(this.readInput()));
        // Netplay: the session decides whether this frame may run at all, because
        // a frame that runs before the other player's input arrives is a desync.
        if (this.stepper) {
            this.stepper(input);
            return;
        }
        this.player.receiveConfirmedInput(input);
        if (this.cpu && this.opponent instanceof stack_1.Stack) {
            this.opponent.receiveConfirmedInput((0, input_codec_1.encodeInput)(this.cpu.update()));
        }
        this.match.run();
    }
    run() {
        this.setupUI();
        this.repaint();
        this.lastTick = Date.now();
        this.lastRender = 0;
        return new Promise((resolve) => {
            const finish = () => {
                this.cleanup();
                resolve({
                    // Surviving the opponent is the win condition; quitting is not a win.
                    playerWon: !this.quitting && !this.player.gameEnded(),
                    // A netplay match may end without either board topping out - a side
                    // that stopped talking - and the session knows which that was.
                    desynced: this.desynced,
                    score: this.player.score,
                    frames: this.player.stopWatch,
                });
            };
            this.loop = setInterval(() => {
                const now = Date.now();
                const delta = now - this.lastTick;
                this.lastTick = now;
                this.frameAccumulator = Math.min(this.frameAccumulator + delta, FRAME_TIME * MAX_CATCHUP_FRAMES);
                while (this.frameAccumulator >= FRAME_TIME) {
                    this.frameAccumulator -= FRAME_TIME;
                    this.step();
                }
                if ((this.isOver ? this.isOver() : this.match.hasEnded()) || this.quitting) {
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
    quit() {
        this.quitting = true;
    }
    cleanup() {
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = undefined;
        }
        this.playerBox?.destroy();
        this.centreBox?.destroy();
        this.opponentBox?.destroy();
        this.playerBox = undefined;
        this.centreBox = undefined;
        this.opponentBox = undefined;
        this.screen.render();
    }
}
exports.PanelsVersusScreen = PanelsVersusScreen;
//# sourceMappingURL=panels-versus-screen.js.map