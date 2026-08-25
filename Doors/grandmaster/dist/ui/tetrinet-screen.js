"use strict";
/**
 * TetriNET Game Screen
 *
 * Main game screen for TetriNET mode combining:
 * - Main board (left side)
 * - Piece preview and hold
 * - Special inventory panel
 * - Target selector
 * - Opponent mini-boards
 * - Effect overlays
 * - Sudden death timer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const inventory_panel_1 = require("./tetrinet/inventory-panel");
const target_selector_1 = require("./tetrinet/target-selector");
const opponent_boards_1 = require("./tetrinet/opponent-boards");
const effect_overlay_1 = require("./tetrinet/effect-overlay");
const specials_1 = require("../core/tetrinet/specials");
const tetrinet_ai_1 = require("../ai/tetrinet-ai");
/**
 * TetriNET Game Screen
 */
class TetriNetScreen {
    constructor(options) {
        this.running = false;
        this.unsubscribers = [];
        this.screen = options.screen;
        this.engine = options.engine;
        this.inputHandler = options.inputHandler;
        this.sounds = options.sounds;
        this.state = options.state;
        this.network = options.network || null;
        this.playerName = options.playerName;
        this.aiController = options.aiController || null;
        this.setupUI();
        this.setupEngineCallbacks();
        this.setupAttackRouting();
        if (this.network) {
            this.setupNetworkListeners();
        }
    }
    /**
     * The special/garbage ROUTER - the layer local TetriNET never had.
     *
     * Both halves of the exchange were already written and correct: engines
     * SEND via onSpecialUsed/onLinesAdded and RECEIVE via
     * applyIncomingSpecial/addGarbage. Nothing connected them. Both receive
     * methods had exactly one caller repo-wide - the EXTERNAL TetriNET server
     * path in app.ts - so against local AI a special was popped off the
     * inventory, played a sound and vanished, and a classic-rules line clear
     * sent garbage to a `if (this.network)` branch whose body was the comment
     * "TODO: Send garbage to target via network". Local TetriNET was four
     * players practising alone in the same room.
     *
     * Networked games are NOT routed here: the server owns fan-out and
     * app.ts applies what comes back, so routing locally too would double
     * every hit.
     */
    setupAttackRouting() {
        if (this.network || !this.aiController)
            return;
        this.engine.onSpecialUsed((special, targetId) => {
            this.routeSpecial(special, tetrinet_ai_1.HUMAN_TARGET_ID, targetId);
        });
        this.engine.onLinesAdded((count) => {
            this.routeGarbage(count, tetrinet_ai_1.HUMAN_TARGET_ID);
        });
        for (const opponent of this.aiOpponents()) {
            opponent.engine.onSpecialUsed((special, targetId) => {
                this.routeSpecial(special, opponent.id, targetId);
            });
            opponent.engine.onLinesAdded((count) => {
                this.routeGarbage(count, opponent.id);
            });
        }
    }
    aiOpponents() {
        return this.aiController ? this.aiController.getOpponents() : [];
    }
    /** Engine for a participant id, or null if that player is out of the game. */
    participantEngine(id) {
        if (id === tetrinet_ai_1.HUMAN_TARGET_ID) {
            const status = this.engine.getState().status;
            return status === 'gameover' || status === 'won' ? null : this.engine;
        }
        const opponent = this.aiOpponents().find(o => o.id === id);
        return opponent && opponent.alive ? opponent.engine : null;
    }
    participantName(id) {
        if (id === tetrinet_ai_1.HUMAN_TARGET_ID)
            return this.playerName;
        return this.aiOpponents().find(o => o.id === id)?.name ?? id;
    }
    /**
     * Deliver one special to its target.
     *
     * Self-only and self-applied continuous specials (Clear Line, Immunity)
     * are handled inside the sending engine, so they are not routed anywhere.
     *
     * NOTE: useSpecial() POPS the inventory before firing the callback, so the
     * special MUST be read from the callback argument - the inventory no
     * longer holds it by the time we get here.
     */
    routeSpecial(special, sourceId, targetId) {
        if (specials_1.SPECIALS[special].selfOnly || special === 'immunity')
            return;
        const source = this.participantEngine(sourceId);
        if (!source)
            return;
        // A missing target means the sender had nobody selected; the human's
        // fallback is whatever the target selector currently points at.
        const resolvedId = targetId
            ?? (sourceId === tetrinet_ai_1.HUMAN_TARGET_ID ? this.targetSelector.getSelectedTarget()?.id ?? null : null);
        if (!resolvedId || resolvedId === sourceId)
            return;
        const target = this.participantEngine(resolvedId);
        if (!target)
            return;
        const blocked = target.getEffectManager().hasImmunity();
        // Switch Fields swaps the two grids, so the sender's board has to travel
        // with the special.
        target.applyIncomingSpecial(special, this.participantName(sourceId), special === 'switch' ? source.getBoard() : undefined);
        if (resolvedId === tetrinet_ai_1.HUMAN_TARGET_ID) {
            if (blocked) {
                this.effectOverlay.showImmunityBlocked();
            }
            else {
                this.sounds.playSfx('garbage');
                this.effectOverlay.showIncomingWarning(specials_1.SPECIALS[special].name);
            }
        }
    }
    /**
     * Victory: outliving every bot ends the match. TetriNetAI.allDead() had
     * zero callers, so a local TetriNET game could only ever be LOST - the
     * last player standing just kept stacking alone until they topped out.
     */
    checkVictory() {
        if (!this.aiController)
            return;
        if (this.aiOpponents().length > 0 && this.aiController.allDead()) {
            this.engine.win();
        }
    }
    /**
     * Classic-rules garbage goes to EVERY other living player (the cs1/cs2/cs4
     * broadcast of the original protocol), not just the selected target.
     */
    routeGarbage(lines, sourceId) {
        if (lines <= 0)
            return;
        for (const id of [tetrinet_ai_1.HUMAN_TARGET_ID, ...this.aiOpponents().map(o => o.id)]) {
            if (id === sourceId)
                continue;
            const target = this.participantEngine(id);
            if (!target)
                continue;
            target.addGarbage(lines, 'classic');
            if (id === tetrinet_ai_1.HUMAN_TARGET_ID) {
                this.sounds.playSfx('garbage');
            }
        }
    }
    /**
     * Setup UI layout
     */
    setupUI() {
        // Clear screen
        this.screen.children.forEach(child => child.destroy());
        // Main board (left side)
        // Board: 12 columns x 2 chars = 24, plus 2 for borders = 26 width
        // Height: 22 rows + 2 for borders = 24
        this.boardBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 0,
            width: 26,
            height: 24,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'white' } },
            fixed: true,
        });
        // Preview box (right of board) - FIXED during gameplay, not dockable
        this.previewBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 26,
            width: 12,
            height: 6,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' Next ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Inventory panel (below preview)
        this.inventoryPanel = new inventory_panel_1.InventoryPanel({
            parent: this.screen,
            top: 7,
            left: 26,
            maxSlots: 10,
        });
        // Target selector (below inventory)
        this.targetSelector = new target_selector_1.TargetSelector({
            parent: this.screen,
            top: 10,
            left: 26,
            width: 26, // Fill columns 26-51 exactly (26 columns)
        });
        // Stats box (below board)
        this.statsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 25, // Board ends at line 24, stats starts at 25
            left: 0,
            width: 38,
            height: 2, // Reduced from 3 to fit in terminal
            content: '',
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Sudden death timer (shown when active, overlays bottom of board).
        //
        // Two bugs here, both visible during ordinary play: createBox() draws a
        // border by DEFAULT, and this box was created visible and never hidden.
        // Sitting at row 23 with setFront(), its border permanently covered the
        // board's LAST row - so the playfield looked one row short and pieces
        // resting on the floor appeared to sit level with, or below, the bottom
        // border. Borderless, and hidden until sudden death actually starts.
        this.suddenDeathBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            // Row 0, ABOVE the board (which starts at row 1), not on top of it.
            // Sudden death is armed from the start of a game and shows a running
            // countdown, so an overlay parked on the board's last row hid a
            // playable row for the entire match rather than just at the end.
            top: 0,
            left: 0,
            width: 26, // Match board width
            height: 1,
            border: { type: 'none' },
            hidden: true,
            content: '',
            style: { bg: 'red', fg: 'white' }, // High visibility during sudden death
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Opponent boards (right side) - Fits 80 columns exactly
        this.opponentBoards = new opponent_boards_1.OpponentBoards({
            parent: this.screen,
            top: 1,
            left: 52,
            width: 28, // Columns 52-79 (28 cols) fits in 80 total
            maxOpponents: 5,
        });
        // Effect overlay
        this.effectOverlay = new effect_overlay_1.EffectOverlay({
            parent: this.screen,
            boardTop: 1,
            boardLeft: 0,
            boardWidth: 26,
            boardHeight: 24,
        });
        // Ensure game board is always on top (can't be covered by dockable panels)
        this.boardBox.setFront();
        // Stats and sudden death should also be above dockable panels
        this.statsBox.setFront();
        this.suddenDeathBox.setFront();
    }
    /**
     * Setup engine event callbacks
     */
    setupEngineCallbacks() {
        // Special used
        this.engine.onSpecialUsed((type, targetId) => {
            this.sounds.playSfx('attack'); // Attack sound for special usage
            this.inventoryPanel.showUseAnimation();
            if (targetId) {
                this.targetSelector.showAttackAnimation(targetId);
                this.opponentBoards.showAttackAnimation(targetId, 'attack');
            }
        });
        // Lines added (garbage to send)
        this.engine.onLinesAdded((count) => {
            if (count === 4) {
                this.sounds.playSfx('tetris');
            }
            else {
                this.sounds.playSfx('line_clear');
            }
            const state = this.engine.getState();
            if (state.combo > 1) {
                this.sounds.playSfx('combo');
            }
            // Notify network of outgoing garbage
            if (this.network) {
                const target = this.targetSelector.getSelectedTarget();
                if (target) {
                    // TODO: Send garbage to target via network
                }
            }
        });
        // Game over
        this.engine.onGameOver(() => {
            this.running = false;
            this.sounds.playSfx('game_over');
        });
        // Board update (for network sync)
        this.engine.onBoardUpdate((board) => {
            if (this.network) {
                this.network.sendUpdate({
                    board: board,
                    level: this.engine.getState().level,
                    grade: 'S1', // TetriNET doesn't use grades like TGM
                });
            }
        });
        // Sudden death callbacks
        const suddenDeath = this.engine.getSuddenDeath();
        if (suddenDeath) {
            suddenDeath.onActivated(() => {
                this.sounds.playSfx('ready'); // Using existing sound
                this.effectOverlay.showSuddenDeathWarning();
            });
            suddenDeath.onLineAdded((totalLines) => {
                this.sounds.playSfx('garbage');
                this.effectOverlay.showSuddenDeathLine(totalLines);
            });
        }
    }
    /**
     * Setup network event listeners
     * NOTE: Full network integration will be implemented in Phase 5
     */
    setupNetworkListeners() {
        if (!this.network)
            return;
        // Opponent field updates
        const unsubUpdate = this.network.onUpdate((update) => {
            this.opponentBoards.updateSingleBoard({
                id: update.playerId,
                name: update.playerId, // Use ID as name for now
                board: update.board,
                level: update.level,
                alive: true,
                hasImmunity: false, // TODO: sync immunity state
            }, 0); // TODO: track opponent index properly
            this.targetSelector.updateOpponent(update.playerId, {
                level: update.level,
            });
        });
        this.unsubscribers.push(unsubUpdate);
        // TODO: Phase 5 - Add TetriNET-specific network events:
        // - onPlayerJoined
        // - onPlayerLeft
        // - onSpecialReceived
        // - onGarbageReceived
    }
    /**
     * Run game loop
     */
    async run() {
        this.running = true;
        // Setup input handlers
        this.setupInput();
        // Countdown
        await this.showCountdown();
        // Start game
        this.engine.start();
        // Main game loop
        return new Promise((resolve) => {
            let lastTime = Date.now();
            const updateInterval = setInterval(() => {
                if (!this.running) {
                    clearInterval(updateInterval);
                    resolve();
                    return;
                }
                const now = Date.now();
                const deltaTime = now - lastTime;
                lastTime = now;
                // Update game
                this.engine.update(deltaTime);
                this.inputHandler.update(deltaTime);
                // Update AI opponents (local mode)
                if (this.aiController) {
                    this.aiController.update(deltaTime);
                    // Update opponent display every 100ms
                    if (now % 100 < deltaTime) {
                        const aiOpponents = this.aiController.getOpponents();
                        const opponents = aiOpponents.map((ai) => ({
                            id: ai.id,
                            name: ai.name,
                            board: ai.engine.getBoard(),
                            level: ai.engine.getState().level,
                            alive: ai.alive,
                            hasImmunity: ai.engine.getEffectManager().hasImmunity(),
                        }));
                        this.updateOpponents(opponents);
                    }
                    this.checkVictory();
                }
                // Send state to opponents (network mode)
                if (this.network && now % 100 < deltaTime) {
                    this.network.sendUpdate(this.engine.getState());
                }
                // Render
                this.render();
                // Check for game over
                const gameState = this.engine.getState();
                if (gameState.status === 'gameover' || gameState.status === 'won') {
                    this.running = false;
                    clearInterval(updateInterval);
                    resolve();
                }
            }, 16); // ~60 FPS
        });
    }
    /**
     * Setup input handlers
     */
    setupInput() {
        // Movement - confusion reversal is handled by engine.
        // Sound effects match game-screen/versus-screen: these bindings used to
        // be bare engine calls, so movement, rotation, hard drop and hold were
        // all SILENT in TetriNET mode while the same actions were audible in
        // single player. (No IRS/IHS cues here - the TetriNET engine has no
        // initial-rotation/hold system.)
        this.inputHandler.on('left', () => {
            if (this.engine.move(-1))
                this.sounds.playSfx('move');
        });
        this.inputHandler.on('right', () => {
            if (this.engine.move(1))
                this.sounds.playSfx('move');
        });
        // Rotation
        this.inputHandler.on('rotate_cw', () => {
            if (this.engine.rotate(1))
                this.sounds.playSfx('rotate');
        });
        this.inputHandler.on('rotate_ccw', () => {
            if (this.engine.rotate(-1))
                this.sounds.playSfx('rotate');
        });
        // Drop
        this.inputHandler.on('soft_drop', () => this.engine.softDrop());
        this.inputHandler.on('hard_drop', () => {
            this.engine.hardDrop();
            this.sounds.playSfx('hard_drop');
        });
        // Hold
        this.inputHandler.on('hold', () => {
            if (this.engine.hold())
                this.sounds.playSfx('hold');
        });
        // Pause
        this.inputHandler.on('pause', () => this.togglePause());
        // Special usage (spacebar) - use screen.key since it's TetriNET-specific
        this.screen.key(['space', 'enter'], () => {
            const target = this.targetSelector.getSelectedTarget();
            if (target) {
                this.engine.useSpecial(target.id);
            }
            else {
                // Self-targeting specials
                this.engine.useSpecial();
            }
        });
        // Target selection with tab
        this.screen.key(['tab'], () => this.targetSelector.selectNext());
        this.screen.key(['S-tab'], () => this.targetSelector.selectPrevious());
        // Number keys for quick target selection
        for (let i = 1; i <= 5; i++) {
            this.screen.key([`${i}`], () => this.targetSelector.selectByNumber(i));
        }
    }
    /**
     * Show countdown
     */
    async showCountdown() {
        this.sounds.playSfx('ready');
        await new Promise(resolve => setTimeout(resolve, 500));
        const countdown = ['3', '2', '1', 'GO!'];
        for (let i = 0; i < countdown.length; i++) {
            const text = countdown[i];
            if (text === 'GO!') {
                this.sounds.playSfx('go');
            }
            else {
                this.sounds.playSfx('countdown');
            }
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 20,
                height: 5,
                content: `{yellow-fg}{bold}${text}{/bold}{/yellow-fg}`,
                focusable: false,
                mouse: false,
                clickable: false,
            });
            this.screen.render();
            await new Promise(resolve => setTimeout(resolve, 1000));
            box.destroy();
        }
    }
    /**
     * Render game state
     */
    render() {
        const gameState = this.engine.getState();
        const effects = this.engine.getEffectManager();
        // Render board
        this.renderBoard(gameState);
        // Render preview (unless darkness)
        if (!effects.hasDarkness()) {
            this.renderPreview(gameState);
        }
        else {
            this.previewBox.setContent('{gray-fg}  ???{/gray-fg}');
        }
        // Update inventory
        this.inventoryPanel.updateFromArray(gameState.inventory || []);
        // Update effects overlay
        this.effectOverlay.update(effects);
        // Render stats
        this.statsBox.setContent(`Score: {yellow-fg}${gameState.score}{/yellow-fg}  ` +
            `Level: {cyan-fg}${gameState.level}{/cyan-fg}  ` +
            `Lines: {green-fg}${gameState.lines}{/green-fg}`);
        // Render sudden death status
        const suddenDeath = this.engine.getSuddenDeath();
        if (suddenDeath && suddenDeath.isEnabled()) {
            this.suddenDeathBox.setContent(suddenDeath.getDisplay());
            this.suddenDeathBox.hidden = false;
            this.suddenDeathBox.setFront();
        }
        else if (!this.suddenDeathBox.hidden) {
            // Give the board's bottom row back when sudden death is not running.
            this.suddenDeathBox.setContent('');
            this.suddenDeathBox.hidden = true;
        }
        this.screen.render();
    }
    /**
     * Render the game board
     */
    renderBoard(state) {
        const { board, currentPiece } = state;
        let content = '';
        // Get piece shape
        let pieceShape = null;
        if (currentPiece) {
            pieceShape = this.engine.getPieceShape(currentPiece.type, currentPiece.rotation);
        }
        // Render each row (TetriNET 12x22 board)
        for (let y = 0; y < board.height; y++) {
            if (y > 0)
                content += '\n';
            for (let x = 0; x < board.width; x++) {
                const cell = board.grid[y]?.[x];
                let char = '  '; // Empty cell
                // Check if current piece occupies this cell
                if (currentPiece && pieceShape) {
                    const px = x - currentPiece.x;
                    const py = y - currentPiece.y;
                    if (py >= 0 && py < pieceShape.length &&
                        px >= 0 && px < pieceShape[py].length &&
                        pieceShape[py][px]) {
                        char = this.getBlockChar(currentPiece.type);
                    }
                }
                // Check if locked cell
                if (char === '  ' && cell?.filled) {
                    // Check for special block
                    if (cell.special) {
                        char = this.getSpecialBlockChar(cell.special);
                    }
                    else {
                        char = this.getBlockChar(cell.color);
                    }
                }
                content += char;
            }
        }
        this.boardBox.setContent(content);
    }
    /**
     * Render piece preview
     */
    renderPreview(state) {
        const nextPieces = state.nextQueue || [];
        if (nextPieces.length === 0) {
            this.previewBox.setContent('');
            return;
        }
        const pieceType = nextPieces[0];
        const shape = this.engine.getPieceShape(pieceType, 0);
        let content = '';
        for (const row of shape) {
            for (const cell of row) {
                content += cell ? this.getBlockChar(pieceType) : '  ';
            }
            content += '\n';
        }
        this.previewBox.setContent(content);
    }
    /**
     * Update opponent list (external server adapter).
     */
    updateOpponents(opponents) {
        this.opponentBoards.updateBoards(opponents);
        const targets = opponents.map(opponent => ({
            id: opponent.id,
            name: opponent.name,
            level: opponent.level,
            alive: opponent.alive,
            hasImmunity: opponent.hasImmunity,
        }));
        this.targetSelector.setOpponents(targets);
    }
    /**
     * Get colored block character for piece type
     */
    getBlockChar(type) {
        const colors = {
            I: '{cyan-fg}██{/cyan-fg}',
            O: '{yellow-fg}██{/yellow-fg}',
            T: '{magenta-fg}██{/magenta-fg}',
            S: '{green-fg}██{/green-fg}',
            Z: '{red-fg}██{/red-fg}',
            J: '{blue-fg}██{/blue-fg}',
            L: '{white-fg}██{/white-fg}',
        };
        return colors[type] || '{gray-fg}██{/gray-fg}';
    }
    /**
     * Get colored block character for special type
     */
    getSpecialBlockChar(special) {
        const chars = {
            add_line: '{red-fg}[A]{/red-fg}',
            clear_line: '{cyan-fg}[C]{/cyan-fg}',
            nuke: '{yellow-fg}[N]{/yellow-fg}',
            random_clear: '{green-fg}[R]{/green-fg}',
            switch: '{magenta-fg}[S]{/magenta-fg}',
            clear_specials: '{blue-fg}[B]{/blue-fg}',
            gravity: '{white-fg}[G]{/white-fg}',
            quake: '{yellow-fg}[Q]{/yellow-fg}',
            block_bomb: '{red-fg}[O]{/red-fg}',
            clear_column: '{cyan-fg}[V]{/cyan-fg}',
            immunity: '{white-fg}[I]{/white-fg}',
            darkness: '{gray-fg}[D]{/gray-fg}',
            confusion: '{magenta-fg}[F]{/magenta-fg}',
            mutation: '{green-fg}[M]{/green-fg}',
            zebra: '{white-fg}[Z]{/white-fg}',
            left_gravity: '{blue-fg}[L]{/blue-fg}',
        };
        return chars[special] || '{gray-fg}[?]{/gray-fg}';
    }
    /**
     * Toggle pause
     */
    togglePause() {
        const gameState = this.engine.getState();
        if (gameState.status === 'playing') {
            this.engine.pause();
        }
        else if (gameState.status === 'paused') {
            this.engine.resume();
        }
    }
    /**
     * Stop the game
     */
    stop() {
        this.running = false;
    }
    /**
     * Cleanup
     */
    cleanup() {
        this.running = false;
        // Disable mouse tracking
        this.screen.program.disableMouse();
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        this.inventoryPanel.destroy();
        this.targetSelector.destroy();
        this.opponentBoards.destroy();
        this.effectOverlay.destroy();
    }
}
exports.TetriNetScreen = TetriNetScreen;
//# sourceMappingURL=tetrinet-screen.js.map