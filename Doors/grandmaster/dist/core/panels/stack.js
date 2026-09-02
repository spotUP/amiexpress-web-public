"use strict";
/**
 * The Stack: one player's board, and the frame loop that advances it.
 * Ported from common/engine/Stack.lua (@ c80668e).
 *
 * SCOPE. This is the solo engine - board, rise, swap, matching, game over.
 * Garbage, rollback, replay input and the puzzle win conditions arrive with
 * later phases and are marked where they attach. The plan calls for splitting
 * this across three files because Stack.lua is ~1800 lines; at the subset
 * implemented here that would mean inventing a large structural interface to
 * pass the stack to its own helpers, which reads worse than it solves. The
 * seam to split on when garbage lands is rise/physics/board, and the size hook
 * blocks at 2000 lines long before that becomes a surprise.
 *
 * THE FRAME. run() is one frame and nothing else is. Order inside it is not
 * arbitrary - three orderings are load-bearing:
 *
 *  1. `wasToppedOut` is sampled at the START of runPhysics, before anything
 *     moves. Stop time and the death check both read that snapshot, not the
 *     live state, so a match made on the frame you top out still pays out at
 *     the generous danger rate.
 *
 *  2. A swap INPUT is queued and executes at the start of the NEXT frame,
 *     before matching. So a swap the player makes on frame N is matched on
 *     frame N+1 - which is why a queued swap also locks the rise.
 *
 *  3. checkMatches runs BEFORE updatePanels. Matching therefore sees the board
 *     as it was left by the previous frame, and the +1 on a match timer exists
 *     to pay for that.
 *
 * DISPLACEMENT. The stack does not rise a row at a time; it rises in 16ths of
 * a row, and a new row is only committed when displacement reaches 0. The rise
 * timer accumulates a FRACTIONAL number of frames per 16th from the speed
 * table, which is why that table must not be rounded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stack = exports.COUNTDOWN_END = exports.BOARD_HEIGHT = exports.BOARD_WIDTH = void 0;
exports.defaultBehaviours = defaultBehaviours;
const panel_1 = require("./panel");
const level_data_1 = require("./level-data");
const consts_1 = require("./consts");
const check_matches_1 = require("./check-matches");
const consts_2 = require("./consts");
const input_codec_1 = require("./input-codec");
exports.BOARD_WIDTH = 6;
exports.BOARD_HEIGHT = 12;
/** The last frame of the countdown; physics begins on this frame. */
exports.COUNTDOWN_END = consts_2.COUNTDOWN_START + consts_2.COUNTDOWN_LENGTH;
const DIRECTION_ROW = {
    up: 1, down: -1, left: 0, right: 0,
};
const DIRECTION_COLUMN = {
    up: 0, down: 0, left: -1, right: 1,
};
function defaultBehaviours() {
    return { passiveRaise: true, allowManualRaise: true };
}
class Stack {
    constructor(options) {
        this.width = exports.BOARD_WIDTH;
        this.height = exports.BOARD_HEIGHT;
        /** panels[row][column]; row 0 is the dimmed incoming row, columns from 1. */
        this.panels = [];
        this.panelsCreatedCount = 0;
        this.clock = 0;
        /** Frames of actual play; stops while the game has not started. */
        this.stopWatch = 0;
        this.stopWatchIsRunning = true;
        // --- rise ---
        /** 16ths of a row until the next row is committed. */
        this.displacement = consts_1.DISPLACEMENT_PER_ROW;
        this.riseLock = false;
        this.hasRisen = false;
        this.nextSpeedIncreaseClock = consts_1.DT_SPEED_INCREASE;
        this.panelsToSpeedup = 0;
        // --- manual raise ---
        this.manualRaise = false;
        this.manualRaiseYet = false;
        this.preventManualRaise = false;
        this.preStopTime = 0;
        this.shakeTime = 0;
        this.prevShakeTime = 0;
        this.shakeTimeOnFrame = 0;
        this.peakShakeTime = 0;
        this.wasToppedOut = false;
        this.chainCounter = 0;
        this.score = 0;
        this.panelsCleared = 0;
        this.metalPanelsQueued = 0;
        this.swapCount = 0;
        /** 0 means the game is still running, matching upstream's sentinel. */
        this.gameOverClock = 0;
        this.nActivePanels = 0;
        this.nPrevActivePanels = 0;
        this.swappingPanelCount = 0;
        // --- cursor ---
        this.curRow = 0;
        this.curCol = 1;
        this.cursorDirection = null;
        this.swapThisFrame = false;
        /** Ticks the current direction has been held. */
        this.curTimer = 0;
        /** Set during the countdown's scripted cursor animation. */
        this.cursorLock = false;
        this.animatingCursorDuringCountdown = false;
        this.doCountdown = false;
        this.countdownTimer = null;
        /**
         * One input character per frame, as a replay stores them and as netplay sends
         * them. When this is empty the stack is in "manual" mode and the caller sets
         * cursorDirection / swapThisFrame / manualRaise itself.
         */
        this.confirmedInput = [];
        this.inputState = input_codec_1.INPUT_CHARS.idle;
        this.queuedSwapRow = 0;
        this.queuedSwapColumn = 0;
        /** The origin of the last attack graphic, for the renderer. */
        this.lastMatchOrigin = null;
        this.levelData = options.levelData;
        this.behaviours = { ...defaultBehaviours(), ...options.behaviours };
        this.panelSource = options.panelSource.clone(this);
        this.speed = this.levelData.startingSpeed;
        if (this.levelData.speedIncreaseMode === level_data_1.SpeedIncreaseMode.TIME_INTERVAL) {
            this.nextSpeedIncreaseClock = consts_1.DT_SPEED_INCREASE;
        }
        else {
            this.panelsToSpeedup = consts_1.PANELS_TO_NEXT_SPEED[this.speed];
        }
        this.health = this.levelData.maxHealth;
        this.riseTimer = consts_1.SPEED_TO_RISE_TIME[this.speed];
        this.stopTime = options.startingStopTime ?? 0;
        this.topCurRow = this.behaviours.passiveRaise ? this.height - 1 : this.height;
        this.engineVersion = options.engineVersion ?? consts_2.ENGINE_VERSION;
        this.curWaitTime = options.cursorWaitTime ?? consts_2.DEFAULT_INPUT_REPEAT_DELAY;
        if (options.doCountdown) {
            // Physics is held off until the countdown ends.
            this.stopWatchIsRunning = false;
            this.doCountdown = true;
        }
        for (let row = 0; row <= this.height; row++) {
            this.panels[row] = [];
            for (let col = 1; col <= this.width; col++)
                this.createPanelAt(row, col);
        }
    }
    createPanelAt(row, column) {
        const panel = new panel_1.Panel(row, column, this.panelsCreatedCount++, this.levelData.frameConstants);
        panel.onPop = () => this.handlePop(panel);
        panel.onPopped = () => this.handlePopped();
        panel.onLand = () => this.handleLand(panel);
        this.panels[row][column] = panel;
        return panel;
    }
    /**
     * Fill the opening board.
     *
     * One more row than the board is tall, because a new row spawns in row 0 and
     * we want the bottom of the starting board to end up in row 1. The cursor is
     * pushed back down after each row so it does not ride up with the stack.
     */
    startingState() {
        const rowCount = this.panelSource.getStartingBoardHeight?.() ?? 7;
        for (let i = 1; i <= rowCount + 1; i++) {
            this.newRow();
            this.curRow -= 1;
        }
        this.curRow = Math.max(1, this.curRow);
    }
    // --- queries ---
    /** Is any panel occupying the top row? */
    isToppedOut() {
        for (let col = 1; col <= this.width; col++) {
            if (this.panels[this.height][col].dangerous())
                return true;
        }
        return false;
    }
    /**
     * Two frames of hysteresis, deliberately: a board counts as active for one
     * frame after the last panel settles, which stops the rise from resuming for
     * a single frame between two links of a chain.
     */
    hasActivePanels() {
        return this.nActivePanels > 0 || this.nPrevActivePanels > 0;
    }
    hasFallingGarbage() {
        const top = Math.min(this.height + 3, this.panels.length - 1);
        for (let row = top; row >= 1; row--) {
            if (!this.panels[row])
                continue;
            for (let col = 1; col <= this.width; col++) {
                const panel = this.panels[row][col];
                if (panel && panel.isGarbage && panel.state === 'falling')
                    return true;
            }
        }
        return false;
    }
    hasChainingPanels() {
        // Row 0 can never chain: those panels are dimmed.
        for (let row = 1; row < this.panels.length; row++) {
            for (let col = 1; col <= this.width; col++) {
                const panel = this.panels[row][col];
                if (panel && panel.chaining && panel.color !== 0)
                    return true;
            }
        }
        return false;
    }
    swapQueued() {
        return this.queuedSwapColumn !== 0 && this.queuedSwapRow !== 0;
    }
    gameEnded() {
        return this.gameOverClock > 0 && this.clock >= this.gameOverClock;
    }
    // --- one frame ---
    /** Is this stack being driven by a recorded/networked input buffer? */
    get drivenByInput() {
        return this.confirmedInput.length > 0;
    }
    /** Append one or more input characters to the buffer. */
    receiveConfirmedInput(input) {
        for (const char of input)
            this.confirmedInput.push(char);
    }
    /** Has the game finished, from the point of view of the input reader? */
    inputExhausted() {
        return this.gameOverClock > 0 && this.clock >= this.gameOverClock;
    }
    /** Take this frame's input off the buffer and decode it. */
    setupInput() {
        if (!this.drivenByInput)
            return;
        this.inputState = this.inputExhausted()
            ? input_codec_1.INPUT_CHARS.idle
            : (this.confirmedInput[this.clock] ?? input_codec_1.INPUT_CHARS.idle);
        this.controls();
    }
    /**
     * Turn this frame's input character into intents.
     *
     * Two details are load-bearing. Directions are PRIORITISED, not combined -
     * up beats down beats left beats right - and a swap is refused outright if
     * one is already queued, so a swap is possible at most every OTHER frame.
     * Upstream flags that second one as a known wart (issue #624): it can make a
     * stealth attempt fail with no feedback.
     */
    controls() {
        const state = (0, input_codec_1.maskToInputState)((0, input_codec_1.decodeInput)(this.inputState));
        this.swapThisFrame = state.swap;
        if (this.swapThisFrame && this.swapQueued())
            this.swapThisFrame = false;
        let newDir = null;
        if (state.up)
            newDir = 'up';
        else if (state.down)
            newDir = 'down';
        else if (state.left)
            newDir = 'left';
        else if (state.right)
            newDir = 'right';
        if (newDir === this.cursorDirection) {
            if (this.curTimer !== this.curWaitTime)
                this.curTimer += 1;
        }
        else {
            this.cursorDirection = newDir;
            this.curTimer = 0;
        }
        if (state.raise && !this.preventManualRaise) {
            this.manualRaise = true;
            this.manualRaiseYet = false;
        }
    }
    /**
     * The opening countdown: 188 frames in which the cursor walks itself into
     * place and nothing else happens.
     *
     * The walk is not decoration - it decides where the cursor STARTS, and every
     * recorded input in a replay is relative to that position. Four steps down,
     * two left, from the top-right of the playfield.
     */
    runCountdown() {
        this.doCountdown = true;
        this.riseLock = true;
        if (this.clock === 0) {
            this.animatingCursorDuringCountdown = true;
            if (this.engineVersion === consts_2.ENGINE_VERSIONS.TELEGRAPH_COMPATIBLE)
                this.cursorLock = true;
            this.curRow = this.height - 1;
            this.curCol = this.width - 1;
        }
        else if (this.clock === consts_2.COUNTDOWN_START) {
            this.countdownTimer = consts_2.COUNTDOWN_LENGTH;
        }
        if (this.countdownTimer !== null) {
            const countDownFrame = consts_2.COUNTDOWN_LENGTH - this.countdownTimer;
            if (countDownFrame > 0 && countDownFrame % consts_2.COUNTDOWN_CURSOR_SPEED === 0) {
                const moveIndex = Math.floor(countDownFrame / consts_2.COUNTDOWN_CURSOR_SPEED);
                if (moveIndex <= 4)
                    this.moveCursorInDirection('down');
                else if (moveIndex <= 6)
                    this.moveCursorInDirection('left');
                else if (moveIndex === 10)
                    this.animatingCursorDuringCountdown = false;
            }
            else if (countDownFrame === 6 * consts_2.COUNTDOWN_CURSOR_SPEED + 1) {
                if (this.engineVersion === consts_2.ENGINE_VERSIONS.TELEGRAPH_COMPATIBLE)
                    this.cursorLock = false;
            }
            if (this.countdownTimer === 0) {
                this.doCountdown = false;
                this.countdownTimer = null;
            }
            if (this.countdownTimer !== null)
                this.countdownTimer -= 1;
        }
    }
    run() {
        this.setupInput();
        if (this.doCountdown && this.clock <= exports.COUNTDOWN_END) {
            this.runCountdown();
            if (this.clock === exports.COUNTDOWN_END)
                this.stopWatchIsRunning = true;
        }
        if (this.stopWatchIsRunning)
            this.runPhysics();
        // Phase 3: what the player asked for this frame.
        this.applyCursorDirection(this.cursorDirection);
        if (this.swapThisFrame) {
            const left = this.panels[this.curRow][this.curCol];
            const right = this.panels[this.curRow][this.curCol + 1];
            this.tryQueueSwap(left, right);
        }
        this.handleManualRaise();
        if (this.stopWatchIsRunning)
            this.stopWatch += 1;
        this.clock += 1;
        if (!this.drivenByInput) {
            // Manual mode: the caller sets the intents again for the next frame.
            this.cursorDirection = null;
            this.swapThisFrame = false;
        }
    }
    runPhysics() {
        // Sampled before anything moves; stop time and the death check read this.
        this.wasToppedOut = this.isToppedOut();
        this.decrementInvincibilityTimers();
        this.updateRiseLock();
        this.updateSpeed();
        if (this.behaviours.passiveRaise) {
            if (this.advancePassiveRaise()) {
                if (this.checkGameOver())
                    this.setGameOver();
            }
        }
        if (!this.wasToppedOut && !this.hasFallingGarbage()) {
            this.health = this.levelData.maxHealth;
        }
        if (this.displacement % consts_1.DISPLACEMENT_PER_ROW !== 0) {
            this.topCurRow = this.height - 1;
        }
        // The swap the player asked for last frame happens now, before matching.
        if (this.swapQueued()) {
            this.swap(this.queuedSwapRow, this.queuedSwapColumn);
            this.queuedSwapColumn = 0;
            this.queuedSwapRow = 0;
        }
        (0, check_matches_1.checkMatches)(this);
        this.updatePanels();
        this.updateActivePanelCount();
        // No chaining panels left anywhere means the chain is over.
        if (this.chainCounter !== 0 && !this.hasChainingPanels()) {
            this.chainCounter = 0;
        }
        this.removeExtraRows();
        if (this.checkGameOver())
            this.setGameOver();
    }
    updatePanels() {
        this.shakeTimeOnFrame = 0;
        for (let row = 1; row < this.panels.length; row++) {
            for (let col = 1; col <= this.width; col++) {
                this.panels[row][col].update(this.panels);
            }
        }
    }
    updateActivePanelCount() {
        this.nPrevActivePanels = this.nActivePanels;
        const { count, swapping } = this.getActivePanelCount();
        this.nActivePanels = count;
        this.swappingPanelCount = swapping;
    }
    /**
     * Panels doing something. Note `landing` does NOT count as active - a landing
     * panel's twelve bounce frames must not hold the stack still.
     */
    getActivePanelCount() {
        let count = 0;
        let swapping = 0;
        for (let row = 1; row <= this.height; row++) {
            for (let col = 1; col <= this.width; col++) {
                const panel = this.panels[row][col];
                if (panel.isGarbage) {
                    if (panel.state !== 'normal')
                        count += 1;
                }
                else if (panel.color !== 0 && panel.state !== 'normal' && panel.state !== 'landing') {
                    count += 1;
                    if (panel.state === 'swapping')
                        swapping += 1;
                }
            }
        }
        return { count, swapping };
    }
    decrementInvincibilityTimers() {
        this.prevShakeTime = this.shakeTime;
        this.shakeTime = Math.max(this.shakeTime - 1, this.shakeTimeOnFrame);
        if (this.shakeTime === 0)
            this.peakShakeTime = 0;
        // Stop time does NOT tick while pre-stop remains. Pre-stop covers the clear
        // animation; stop time is the reward that begins once it finishes.
        if (this.preStopTime !== 0) {
            this.preStopTime -= 1;
        }
        else if (this.stopTime !== 0) {
            this.stopTime -= 1;
        }
    }
    updateRiseLock() {
        const previousRiseLock = this.riseLock;
        if (this.swapQueued())
            this.riseLock = true;
        else if (this.shakeTime > 0)
            this.riseLock = true;
        else if (this.hasActivePanels())
            this.riseLock = true;
        else
            this.riseLock = false;
        if (previousRiseLock && !this.riseLock)
            this.preventManualRaise = false;
    }
    updateSpeed() {
        if (this.levelData.speedIncreaseMode === level_data_1.SpeedIncreaseMode.TIME_INTERVAL) {
            if (this.clock === this.nextSpeedIncreaseClock) {
                this.speed = Math.min(this.speed + 1, 99);
                this.nextSpeedIncreaseClock += consts_1.DT_SPEED_INCREASE;
            }
        }
        else if (this.panelsToSpeedup <= 0) {
            this.speed = Math.min(this.speed + 1, 99);
            this.panelsToSpeedup += consts_1.PANELS_TO_NEXT_SPEED[this.speed];
        }
    }
    /**
     * The automatic rise.
     *
     * Returns true if the rise was allowed to proceed this frame, which is the
     * caller's cue to test for death - because being topped out during a rise is
     * what drains health, and nothing else does.
     */
    advancePassiveRaise() {
        if (this.manualRaise) {
            // Finishes a raise begun on the PREVIOUS frame, and so may ignore the
            // rise lock. The new row is deferred to here so the stack is guaranteed
            // not to have been topped out at the start of the frame.
            if (this.displacement === 0 && this.hasRisen) {
                this.topCurRow = this.height;
                this.newRow();
            }
            return false;
        }
        if (!this.riseLock && this.stopTime === 0) {
            if (this.isToppedOut()) {
                this.health -= 1;
            }
            else {
                this.riseTimer -= 1;
                if (this.riseTimer <= 0) {
                    this.displacement -= 1;
                    if (this.displacement === 0) {
                        this.preventManualRaise = false;
                        this.topCurRow = this.height;
                        this.newRow();
                    }
                    this.riseTimer += consts_1.SPEED_TO_RISE_TIME[this.speed];
                }
            }
            return true;
        }
        return false;
    }
    /**
     * The player pushing the stack up.
     *
     * Manual raise DUMPS all accumulated stop time - pushing while a big chain's
     * reward is still running throws that reward away. The final 16th is
     * deliberately deferred to passive raise on the next frame, so a raise cannot
     * commit a row on the same frame it tops the stack out.
     */
    handleManualRaise() {
        if (!this.behaviours.allowManualRaise || !this.manualRaise)
            return;
        if (!this.riseLock) {
            this.stopTime = 0;
            if (this.wasToppedOut) {
                if (this.checkGameOver())
                    this.setGameOver();
            }
            else {
                this.hasRisen = true;
                this.displacement -= 1;
                if (this.displacement === 1) {
                    if (!this.preventManualRaise)
                        this.addScore(consts_1.SCORE_PER_MANUAL_RAISE);
                    this.manualRaise = false;
                    this.riseTimer = 1;
                    this.preventManualRaise = true;
                }
                this.manualRaiseYet = true;
            }
        }
        else if (!this.manualRaiseYet) {
            // Rise-locked before the raise ever moved: it is cancelled outright.
            this.manualRaise = false;
        }
        else if (this.hasFallingGarbage()) {
            // Falling garbage may top the stack out, and resuming the raise once the
            // shake runs out would then be instant death with stop time still in hand.
            this.manualRaise = false;
        }
    }
    /** Commit a new row at the bottom, pushing everything up one. */
    newRow() {
        const panels = this.panels;
        if (this.curRow !== 0) {
            this.curRow = Math.max(1, Math.min(this.curRow + 1, this.topCurRow));
        }
        if (this.queuedSwapRow > 0)
            this.queuedSwapRow += 1;
        const stackHeight = panels.length;
        panels[stackHeight] = [];
        const { colors, metalPanelsQueued } = this.panelSource.nextRowColors(this, this.metalPanelsQueued);
        this.metalPanelsQueued = metalPanelsQueued;
        for (let col = 1; col <= this.width; col++) {
            const panel = this.createPanelAt(stackHeight, col);
            panel.color = colors[col - 1];
            panel.state = 'dimmed';
        }
        // Switching each panel down one refreshes its row/column bookkeeping.
        for (let row = stackHeight; row >= 1; row--) {
            for (let col = this.width; col >= 1; col--) {
                panel_1.Panel.switch(panels[row][col], panels[row - 1][col], panels);
            }
        }
        // The row created at the top is now row 0; the old row 0 is in play at row
        // 1 and must lose its dimmed state HERE - checkMatches runs before the
        // panel update, so those panels have to be matchable already.
        for (let col = 1; col <= this.width; col++) {
            panels[1][col].state = 'normal';
            panels[1][col].stateChanged = true;
        }
        this.displacement = consts_1.DISPLACEMENT_PER_ROW;
        this.onNewRow?.();
    }
    /** Drop empty rows above the playfield so the grid does not grow forever. */
    removeExtraRows() {
        for (let row = this.panels.length - 1; row > this.height; row--) {
            const rowPanels = this.panels[row];
            let empty = true;
            for (let col = 1; col <= this.width; col++) {
                if (rowPanels[col].color !== 0) {
                    empty = false;
                    break;
                }
            }
            if (!empty)
                break;
            this.panels.pop();
        }
    }
    // --- input ---
    moveCursorInDirection(direction) {
        this.curRow = Math.max(1, Math.min(this.curRow + DIRECTION_ROW[direction], this.topCurRow));
        this.curCol = Math.max(1, Math.min(this.curCol + DIRECTION_COLUMN[direction], this.width - 1));
    }
    /**
     * Move the cursor, with the game's own auto-repeat.
     *
     * A direction moves on the frame it is first pressed (curTimer 0), then not
     * again until the timer reaches curWaitTime, after which it moves every
     * frame. Note the timer is incremented in BOTH controls() and here, so it
     * advances two per frame and the effective delay is HALF curWaitTime - about
     * 10 frames at the default of 20. That double increment is upstream's, and a
     * port that increments once makes every held direction travel at half speed.
     */
    applyCursorDirection(direction) {
        if (direction && (this.curTimer === 0 || this.curTimer === this.curWaitTime)
            && !this.cursorLock) {
            this.moveCursorInDirection(direction);
        }
        else {
            this.curRow = Math.max(1, Math.min(this.curRow, this.topCurRow));
        }
        if (this.curTimer !== this.curWaitTime)
            this.curTimer += 1;
    }
    /**
     * Ask for a swap. It does not happen now - it is queued for the next frame.
     */
    tryQueueSwap(panel1, panel2) {
        if (!this.canSwap(panel1, panel2))
            return false;
        this.swapCount += 1;
        // By convention the queued column is the LEFT panel.
        this.queuedSwapColumn = Math.min(panel1.column, panel2.column);
        this.queuedSwapRow = panel1.row;
        return true;
    }
    canSwap(panel1, panel2) {
        if (Math.abs(panel1.column - panel2.column) !== 1 || panel1.row !== panel2.row)
            return false;
        // No swapping during the countdown, or on the first frame of a game.
        if (this.doCountdown || this.clock <= 1)
            return false;
        if (panel1.color === 0 && panel2.color === 0)
            return false;
        if (!panel1.allowsSwap() || !panel2.allowsSwap())
            return false;
        const row = panel1.row;
        let panelAbove1;
        let panelAbove2;
        if (row < this.height) {
            panelAbove1 = this.panels[row + 1][panel1.column];
            panelAbove2 = this.panels[row + 1][panel2.column];
            // Nothing above the cursor may be hovering.
            if (panelAbove1.state === 'hovering' || panelAbove2.state === 'hovering')
                return false;
        }
        // If one side of the cursor is air, a swap in progress directly above or
        // below that spans air and not-air would produce an inconsistent board.
        if (panel1.color === 0 || panel2.color === 0) {
            if (panelAbove1 && panelAbove2
                && panelAbove1.state === 'swapping' && panelAbove2.state === 'swapping'
                && (panelAbove1.color === 0 || panelAbove2.color === 0)
                && (panelAbove1.color !== 0 || panelAbove2.color !== 0)) {
                return false;
            }
            if (row > 1) {
                const panelBelow1 = this.panels[row - 1][panel1.column];
                const panelBelow2 = this.panels[row - 1][panel2.column];
                if (panelBelow1.state === 'swapping' && panelBelow2.state === 'swapping'
                    && (panelBelow1.color === 0 || panelBelow2.color === 0)
                    && (panelBelow1.color !== 0 || panelBelow2.color !== 0)) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * Perform the swap.
     *
     * `dontSwap` is set immediately afterwards for any panel that is now going to
     * fall, or any gap that now has a panel above it: those swaps cannot be taken
     * back, because the board is already committed to moving.
     */
    swap(row, col) {
        const panels = this.panels;
        let leftPanel = panels[row][col];
        let rightPanel = panels[row][col + 1];
        leftPanel.startSwap(true);
        rightPanel.startSwap(false);
        panel_1.Panel.switch(leftPanel, rightPanel, panels);
        [leftPanel, rightPanel] = [rightPanel, leftPanel];
        if (row !== 1) {
            if (leftPanel.color !== 0
                && (panels[row - 1][col].color === 0 || panels[row - 1][col].state === 'falling')) {
                leftPanel.dontSwap = true;
            }
            if (rightPanel.color !== 0
                && (panels[row - 1][col + 1].color === 0
                    || panels[row - 1][col + 1].state === 'falling')) {
                rightPanel.dontSwap = true;
            }
        }
        if (row !== this.height) {
            if (leftPanel.color === 0 && panels[row + 1][col].color !== 0)
                leftPanel.dontSwap = true;
            if (rightPanel.color === 0 && panels[row + 1][col + 1].color !== 0) {
                rightPanel.dontSwap = true;
            }
        }
    }
    // --- scoring and life ---
    addScore(amount) {
        this.score += amount;
        if (this.score > consts_1.MAX_SCORE)
            this.score = consts_1.MAX_SCORE;
    }
    handlePop(panel) {
        if (!panel.isGarbage) {
            this.addScore(consts_1.SCORE_PER_PANEL);
            this.panelsCleared += 1;
            if (this.panelsCleared % this.levelData.shockFrequency === 0) {
                this.metalPanelsQueued = Math.min(this.metalPanelsQueued + 1, this.levelData.shockCap);
            }
        }
        this.onPanelPop?.(panel);
    }
    handlePopped() {
        this.panelsToSpeedup -= 1;
    }
    handleLand(panel) {
        this.onPanelLand?.(panel);
    }
    /**
     * Health reaching zero ends the game, but only once the stack has stopped
     * shaking - garbage landing must not kill on the frame it arrives.
     */
    checkGameOver() {
        if (this.gameOverClock > 0)
            return true;
        // Out of health, once the stack has stopped shaking - garbage landing must
        // not kill on the frame it arrives.
        if (this.health <= 0 && this.shakeTime <= 0)
            return true;
        // Holding the raise button while topped out and not rise-locked is an
        // instant loss, and it is the ONLY way to die while raising - the health
        // drain lives in passive raise, which a manual raise short-circuits.
        // Upstream calls this one disputable (issue #437): at one point of health
        // the difference is negligible, but on lower levels it makes it easy to
        // kill yourself by accident. Kept, because it is what the engine does.
        if (!this.riseLock && this.behaviours.allowManualRaise
            && this.wasToppedOut && this.manualRaise) {
            return true;
        }
        return false;
    }
    setGameOver() {
        this.gameOverClock = this.clock;
        this.onGameOver?.();
    }
}
exports.Stack = Stack;
//# sourceMappingURL=stack.js.map