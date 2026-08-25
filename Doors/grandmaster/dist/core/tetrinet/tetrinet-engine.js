"use strict";
/**
 * TetriNET Game Engine
 *
 * Extended game engine for TetriNET mode with:
 * - Special block inventory
 * - Continuous effects (immunity, darkness, confusion, mutation)
 * - Sudden death mechanic
 * - TetriNET-style gameplay
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetEngine = void 0;
const board_1 = require("../board");
const tetrinet_board_1 = require("./tetrinet-board");
const specials_1 = require("./specials");
const inventory_1 = require("./inventory");
const continuous_effects_1 = require("./continuous-effects");
const sudden_death_1 = require("./sudden-death");
const special_effects_1 = require("./special-effects");
const game_rules_1 = require("./game-rules");
const tetrinet_pieces_1 = require("./tetrinet-pieces");
/**
 * TetriNET Game Engine
 */
class TetriNetEngine {
    constructor(settings, options) {
        this.currentPiece = null;
        this.holdPiece = null;
        this.canHold = true;
        this.nextQueue = [];
        // Stats
        this.level = 0;
        this.lines = 0;
        this.score = 0;
        this.combo = 0;
        this.lineCount = 0;
        this.slines = 0;
        this.llines = 0;
        // Timing
        this.status = 'ready';
        this.startTime = null;
        this.endTime = null;
        this.lastUpdate = 0;
        this.dropTimer = 0;
        this.downCount = 0;
        this.spawnDelayRemaining = 0;
        this.rngState = null;
        this.useSeededRng = false;
        // Callbacks
        this.onSpecialUsedCallbacks = [];
        this.onLinesAddedCallbacks = [];
        this.onGameOverCallbacks = [];
        this.onBoardUpdateCallbacks = [];
        this.settings = settings;
        this.options = { ...(0, game_rules_1.getDefaultOptions)('standard'), ...options };
        this.board = (0, tetrinet_board_1.createTetriNetBoard)(12, 22);
        this.inventory = new inventory_1.SpecialInventory(this.options.inventorySize);
        this.effectManager = new continuous_effects_1.ContinuousEffectManager();
        this.suddenDeath = new sudden_death_1.SuddenDeathManager(this.options.delayBeforeSuddenDeath, this.options.suddenDeathTick);
        if (typeof this.options.randomSeed === 'number' && this.options.useSameBlocks) {
            this.useSeededRng = true;
            this.rngState = this.options.randomSeed >>> 0;
        }
        const first = this.getRandomPieceType();
        this.nextQueue = [first];
    }
    /**
     * Start the game
     */
    start() {
        this.status = 'playing';
        this.startTime = Date.now();
        this.lastUpdate = Date.now();
        this.level = this.options.startingLevel;
        this.lineCount = 0;
        this.slines = 0;
        this.llines = 0;
        if (this.options.startingHeight > 0) {
            const toppedOut = (0, tetrinet_board_1.addGarbageLines)(this.board, this.options.startingHeight, 'addline');
            if (toppedOut) {
                this.gameOver();
                return;
            }
        }
        this.suddenDeath.start();
        this.spawnDelayRemaining = 0;
        this.spawnPiece();
    }
    /**
     * Pause the game
     */
    pause() {
        if (this.status === 'playing') {
            this.status = 'paused';
        }
    }
    /**
     * Resume the game
     */
    resume() {
        if (this.status === 'paused') {
            this.status = 'playing';
            this.lastUpdate = Date.now();
        }
    }
    /**
     * Update game state
     */
    update(deltaTime) {
        if (this.status !== 'playing') {
            return;
        }
        this.effectManager.update();
        const suddenDeathLines = this.suddenDeath.update();
        if (suddenDeathLines > 0) {
            this.addGarbage(suddenDeathLines);
        }
        if (!this.currentPiece && this.spawnDelayRemaining > 0) {
            this.spawnDelayRemaining -= deltaTime;
            if (this.spawnDelayRemaining <= 0) {
                this.spawnDelayRemaining = 0;
                this.spawnPiece();
            }
        }
        this.dropTimer += deltaTime;
        const dropInterval = this.getDropInterval();
        while (this.dropTimer >= dropInterval) {
            this.dropTimer -= dropInterval;
            if (this.currentPiece) {
                if (!this.movePieceDown()) {
                    if (this.downCount > 0) {
                        this.lockPiece();
                        this.downCount = 0;
                    }
                    else {
                        this.downCount = 1;
                    }
                }
                else {
                    this.downCount = 0;
                }
            }
        }
    }
    /**
     * Spawn a new piece
     */
    spawnPiece() {
        let pieceType = this.nextQueue.shift();
        let rotation = this.getRandomRotation(pieceType);
        if (this.effectManager.hasMutation()) {
            pieceType = this.getRandomPieceType();
            rotation = this.getRandomRotation(pieceType);
            this.effectManager.onPiecePlaced();
        }
        const next = this.getRandomPieceType();
        this.nextQueue = [next];
        const spawnX = Math.floor(this.board.width / 2) - 2;
        this.currentPiece = {
            type: pieceType,
            rotation: rotation,
            x: spawnX,
            y: 0,
        };
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(pieceType, this.currentPiece.rotation);
        if ((0, board_1.checkCollision)(this.board, shape, this.currentPiece.x, this.currentPiece.y)) {
            this.gameOver();
            return;
        }
        // A freshly spawned piece may be held; the flag only blocks a SECOND
        // hold of the same piece. This used to be set false here, which alone
        // made hold impossible.
        this.canHold = true;
        this.downCount = 0;
    }
    /**
     * Move piece left or right
     */
    move(direction) {
        if (!this.currentPiece || this.status !== 'playing') {
            return false;
        }
        // Confusion reverses controls
        const actualDirection = this.effectManager.hasConfusion() ? -direction : direction;
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        const newX = this.currentPiece.x + actualDirection;
        if (!(0, board_1.checkCollision)(this.board, shape, newX, this.currentPiece.y)) {
            this.currentPiece.x = newX;
            this.downCount = 0;
            return true;
        }
        return false;
    }
    /**
     * Rotate piece
     */
    rotate(direction) {
        if (!this.currentPiece || this.status !== 'playing') {
            return false;
        }
        const rotationCount = (0, tetrinet_pieces_1.getRotationCount)(this.currentPiece.type);
        const oldRotation = this.currentPiece.rotation;
        let newRotation = oldRotation + direction;
        if (newRotation >= rotationCount)
            newRotation = 0;
        if (newRotation < 0)
            newRotation = rotationCount - 1;
        const obstruction = this.blockObstructed(this.currentPiece.type, newRotation, this.currentPiece.x, this.currentPiece.y);
        if (obstruction === 1) {
            return false;
        }
        if (obstruction === 2) {
            const shifts = [1, -1, 2, -2];
            for (const shift of shifts) {
                const shifted = this.blockObstructed(this.currentPiece.type, newRotation, this.currentPiece.x + shift, this.currentPiece.y);
                if (shifted === 0) {
                    this.currentPiece.x += shift;
                    this.currentPiece.rotation = newRotation;
                    this.downCount = 0;
                    return true;
                }
            }
            return false;
        }
        this.currentPiece.rotation = newRotation;
        this.downCount = 0;
        return true;
    }
    /**
     * Soft drop (faster descent)
     */
    softDrop() {
        return this.movePieceDown();
    }
    /**
     * Hard drop (instant drop and lock)
     */
    hardDrop() {
        if (!this.currentPiece || this.status !== 'playing') {
            return;
        }
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        const ghostY = (0, board_1.getGhostY)(this.board, shape, this.currentPiece.x, this.currentPiece.y);
        // Move to ghost position and lock
        this.currentPiece.y = ghostY;
        this.lockPiece();
    }
    /**
     * Hold the current piece, swapping in whatever was held before.
     *
     * This was a stub that returned false, and spawnPiece() set canHold to
     * FALSE on every spawn, so the bound key did nothing under any
     * circumstances. Hold is a local house rule (options.allowHold): a real
     * TetriNET server's other clients do not have it.
     *
     * One hold per piece, as everywhere else in the genre - otherwise a
     * player can swap back and forth for ever and never place anything.
     */
    hold() {
        if (!this.options.allowHold)
            return false;
        if (!this.currentPiece || this.status !== 'playing')
            return false;
        if (!this.canHold)
            return false;
        const incoming = this.holdPiece;
        this.holdPiece = this.currentPiece.type;
        if (incoming === null) {
            // Nothing held yet: take the next piece, then re-lock hold for it.
            this.spawnPiece();
        }
        else {
            const rotation = this.getRandomRotation(incoming);
            const spawnX = Math.floor(this.board.width / 2) - 2;
            const shape = (0, tetrinet_pieces_1.getTetriNetShape)(incoming, rotation);
            if ((0, board_1.checkCollision)(this.board, shape, spawnX, 0)) {
                this.currentPiece = { type: incoming, rotation, x: spawnX, y: 0 };
                this.gameOver();
                return true;
            }
            this.currentPiece = { type: incoming, rotation, x: spawnX, y: 0 };
            this.downCount = 0;
        }
        this.canHold = false;
        return true;
    }
    /**
     * Move piece down one row
     */
    movePieceDown() {
        if (!this.currentPiece) {
            return false;
        }
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        const newY = this.currentPiece.y + 1;
        if (!(0, board_1.checkCollision)(this.board, shape, this.currentPiece.x, newY)) {
            this.currentPiece.y = newY;
            this.downCount = 0;
            return true;
        }
        return false;
    }
    /**
     * Lock piece in place
     */
    lockPiece() {
        if (!this.currentPiece) {
            return;
        }
        let shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        if (this.blockObstructed(this.currentPiece.type, this.currentPiece.rotation, this.currentPiece.x, this.currentPiece.y) !== 0) {
            let placed = false;
            for (let y = this.currentPiece.y - 1; y >= 0; y--) {
                if (this.blockObstructed(this.currentPiece.type, this.currentPiece.rotation, this.currentPiece.x, y) === 0) {
                    this.currentPiece.y = y;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                this.gameOver();
                return;
            }
            shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        }
        // Place piece on board
        (0, board_1.placePiece)(this.board, shape, this.currentPiece.x, this.currentPiece.y, this.currentPiece.type);
        // Check for line clears
        const completedLines = (0, board_1.getCompleteLines)(this.board);
        if (completedLines.length > 0) {
            // Collect specials from cleared lines
            const collectedSpecials = (0, tetrinet_board_1.clearLinesWithSpecials)(this.board, completedLines);
            // Add collected specials to inventory
            for (let i = 0; i < completedLines.length; i++) {
                for (const special of collectedSpecials) {
                    this.inventory.add(special);
                }
            }
            this.lineCount += completedLines.length;
            this.slines += completedLines.length;
            this.llines += completedLines.length;
            this.lines += completedLines.length;
            this.combo++;
            const linesForSpecials = Math.max(1, this.options.linesToMakeForSpecials);
            const slcount = Math.floor(this.slines / linesForSpecials);
            this.slines = this.slines % linesForSpecials;
            const specialsToDrop = this.options.specialsAddedEachTime * slcount;
            if (!this.options.noSpecials && specialsToDrop > 0) {
                const availableSpecials = (0, specials_1.getSpecialsForRule)('standard');
                (0, tetrinet_board_1.addSpecialsToField)(this.board, specialsToDrop, availableSpecials, () => this.getRandomSpecial());
            }
            if (this.options.linesPerLevel > 0 && this.llines >= this.options.linesPerLevel) {
                while (this.llines >= this.options.linesPerLevel) {
                    this.level += this.options.levelIncrement;
                    this.llines -= this.options.linesPerLevel;
                }
            }
            const classicLines = this.getClassicLinesToSend(completedLines.length);
            if (classicLines > 0) {
                for (const callback of this.onLinesAddedCallbacks) {
                    callback(classicLines);
                }
            }
        }
        else {
            this.combo = 0;
        }
        // Notify board update
        for (const callback of this.onBoardUpdateCallbacks) {
            callback(this.board);
        }
        // Spawn next piece (with TetriNET delay)
        this.scheduleNextPieceSpawn();
    }
    /**
     * Calculate score for line clears
     */
    calculateLineScore(lineCount) {
        const baseScores = [0, 100, 300, 500, 800];
        return (baseScores[lineCount] || 800) * (this.level + 1);
    }
    /**
     * Use a special from inventory
     */
    useSpecial(targetId) {
        if (this.status !== 'playing') {
            return null;
        }
        const special = this.inventory.use();
        if (!special) {
            return null;
        }
        // Check if it's a continuous effect
        if ((0, continuous_effects_1.isContinuousEffect)(special)) {
            if (special === 'immunity') {
                // Immunity is used on self
                this.effectManager.startEffect('immunity');
            }
            // Other continuous effects are applied to target via network
        }
        else if (specials_1.SPECIALS[special].selfOnly) {
            // Self-only specials (Clear Line) act on the user's OWN board. This
            // branch did not exist: the special was popped off the inventory and
            // announced to the callbacks, but its effect was never applied
            // anywhere, so 'C' was a slot that deleted itself and did nothing.
            (0, special_effects_1.applySpecialEffect)(special, this.board);
            for (const callback of this.onBoardUpdateCallbacks) {
                callback(this.board);
            }
        }
        // Notify callbacks
        for (const callback of this.onSpecialUsedCallbacks) {
            callback(special, targetId ?? null);
        }
        return special;
    }
    /**
     * Throw the first special away without using it.
     *
     * The reference client binds this to D; TetriNET inventories are small
     * (10 by default) and a useless special blocks the ones behind it.
     */
    discardSpecial() {
        if (this.status !== 'playing')
            return null;
        return this.inventory.use();
    }
    /**
     * Apply incoming special from opponent
     */
    applyIncomingSpecial(special, senderId, sourceBoard) {
        // Check immunity
        if (this.effectManager.hasImmunity() && special !== 'immunity') {
            return; // Blocked by immunity
        }
        // Check if it's a continuous effect
        if ((0, continuous_effects_1.isContinuousEffect)(special)) {
            this.effectManager.startEffect(special, senderId);
            return;
        }
        // Apply instant effect. Switch Fields is the one special that needs the
        // SENDER's board too - without it applySpecialEffect returns
        // 'Switch requires two boards' and the special silently does nothing.
        (0, special_effects_1.applySpecialEffect)(special, this.board, sourceBoard);
        // Notify board update
        for (const callback of this.onBoardUpdateCallbacks) {
            callback(this.board);
        }
    }
    /**
     * Add garbage lines to board
     */
    addGarbage(lineCount, lineType = 'addline') {
        const toppedOut = (0, tetrinet_board_1.addGarbageLines)(this.board, lineCount, lineType);
        // Notify board update
        for (const callback of this.onBoardUpdateCallbacks) {
            callback(this.board);
        }
        if (toppedOut) {
            this.gameOver();
        }
    }
    /**
     * Game over
     */
    gameOver() {
        this.status = 'gameover';
        this.endTime = Date.now();
        this.suddenDeath.stop();
        this.spawnDelayRemaining = 0;
        for (const callback of this.onGameOverCallbacks) {
            callback();
        }
    }
    getDropInterval() {
        if (this.level <= 100) {
            return 1005 - (this.level * 10);
        }
        return 5;
    }
    getRandomPieceType() {
        const roll = this.nextRandom(100);
        for (let i = 0; i < this.options.pieceFrequency.length; i++) {
            if (roll < this.options.pieceFrequency[i]) {
                return tetrinet_pieces_1.TETRINET_PIECE_ORDER[i];
            }
        }
        return tetrinet_pieces_1.TETRINET_PIECE_ORDER[0];
    }
    getRandomRotation(type) {
        // The protocol draws the orientation from a range of FOUR for every
        // piece, whatever its symmetry, then maps it onto the orientations that
        // piece actually has. Drawing from the piece's own rotation count
        // consumed the same LCG step - so the BLOCK sequence still lined up
        // with other clients - but produced a different orientation for
        // anything that is not four-way, which is visible in a 1.14
        // same-blocks game.
        const count = Math.max(1, (0, tetrinet_pieces_1.getRotationCount)(type));
        return this.nextRandom(4) % count;
    }
    getRandomSpecial() {
        const specials = [
            'add_line', 'clear_line', 'nuke', 'random_clear', 'switch',
            'clear_specials', 'gravity', 'quake', 'block_bomb',
        ];
        const roll = Math.floor(Math.random() * 100);
        for (let i = 0; i < this.options.specialFrequency.length; i++) {
            if (roll < this.options.specialFrequency[i]) {
                return specials[i] ?? 'add_line';
            }
        }
        return 'add_line';
    }
    nextRandom(range) {
        if (range <= 0) {
            return 0;
        }
        if (!this.useSeededRng || this.rngState === null) {
            return Math.floor(Math.random() * range);
        }
        // TetriNET 1.14 LCG: sn+1 = (a * sn + c) mod 2^32
        this.rngState = (Math.imul(this.rngState, 0x08088405) + 1) >>> 0;
        return Math.floor((this.rngState * range) / 0x100000000);
    }
    blockObstructed(type, rotation, x, y) {
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(type, rotation);
        let side = 0;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (!shape[row][col])
                    continue;
                const boardX = x + col;
                const boardY = y + row;
                if (boardX < 0 || boardX >= this.board.width) {
                    side = 2;
                    continue;
                }
                if (boardY < 0 || boardY >= this.board.height) {
                    return 1;
                }
                if (this.board.grid[boardY][boardX].filled) {
                    return 1;
                }
            }
        }
        return side;
    }
    getClassicLinesToSend(linesCleared) {
        if (!this.options.classicMode) {
            return 0;
        }
        switch (linesCleared) {
            case 2: return 1;
            case 3: return 2;
            case 4: return 4;
            default: return 0;
        }
    }
    /**
     * Mark as won
     */
    win() {
        this.status = 'won';
        this.endTime = Date.now();
        this.suddenDeath.stop();
        this.spawnDelayRemaining = 0;
    }
    scheduleNextPieceSpawn() {
        const delay = Math.max(0, this.options.nextPieceDelayMs);
        if (delay <= 0) {
            this.spawnPiece();
            return;
        }
        this.currentPiece = null;
        this.spawnDelayRemaining = delay;
        this.dropTimer = 0;
        this.downCount = 0;
    }
    // ===== Getters =====
    getState() {
        return {
            board: this.board,
            currentPiece: this.currentPiece,
            holdPiece: this.holdPiece,
            canHold: this.canHold,
            nextQueue: [...this.nextQueue],
            level: this.level,
            lines: this.lines,
            score: this.score,
            combo: this.combo,
            inventory: this.inventory.getAll(),
            activeEffects: this.effectManager.getActiveEffectTypes(),
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
        };
    }
    getBoard() {
        return this.board;
    }
    getEncodedBoard() {
        return (0, tetrinet_board_1.encodeBoard)(this.board);
    }
    getCurrentPiece() {
        return this.currentPiece;
    }
    getInventory() {
        return this.inventory;
    }
    getEffectManager() {
        return this.effectManager;
    }
    getSuddenDeath() {
        return this.suddenDeath;
    }
    getLevel() {
        return this.level;
    }
    getLines() {
        return this.lines;
    }
    getScore() {
        return this.score;
    }
    getStatus() {
        return this.status;
    }
    getPieceShape(type, rotation) {
        return (0, tetrinet_pieces_1.getTetriNetShape)(type, rotation);
    }
    /** Whether the local hold house rule is on (see options.allowHold). */
    isHoldEnabled() {
        return this.options.allowHold === true;
    }
    getGhostY() {
        if (!this.currentPiece) {
            return null;
        }
        const shape = (0, tetrinet_pieces_1.getTetriNetShape)(this.currentPiece.type, this.currentPiece.rotation);
        return (0, board_1.getGhostY)(this.board, shape, this.currentPiece.x, this.currentPiece.y);
    }
    // Hide next queue if darkness active
    getVisibleNextQueue() {
        if (this.effectManager.hasDarkness()) {
            return []; // Hidden
        }
        return [...this.nextQueue];
    }
    // ===== Callbacks =====
    onSpecialUsed(callback) {
        this.onSpecialUsedCallbacks.push(callback);
        return () => {
            const index = this.onSpecialUsedCallbacks.indexOf(callback);
            if (index >= 0)
                this.onSpecialUsedCallbacks.splice(index, 1);
        };
    }
    onLinesAdded(callback) {
        this.onLinesAddedCallbacks.push(callback);
        return () => {
            const index = this.onLinesAddedCallbacks.indexOf(callback);
            if (index >= 0)
                this.onLinesAddedCallbacks.splice(index, 1);
        };
    }
    onGameOver(callback) {
        this.onGameOverCallbacks.push(callback);
        return () => {
            const index = this.onGameOverCallbacks.indexOf(callback);
            if (index >= 0)
                this.onGameOverCallbacks.splice(index, 1);
        };
    }
    onBoardUpdate(callback) {
        this.onBoardUpdateCallbacks.push(callback);
        return () => {
            const index = this.onBoardUpdateCallbacks.indexOf(callback);
            if (index >= 0)
                this.onBoardUpdateCallbacks.splice(index, 1);
        };
    }
}
exports.TetriNetEngine = TetriNetEngine;
//# sourceMappingURL=tetrinet-engine.js.map