"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameScreen = void 0;
const board_effects_1 = require("./board-effects");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const pieces_1 = require("../core/pieces");
const board_1 = require("../core/board");
const screen_shake_1 = require("../effects/screen-shake");
const particles_1 = require("../effects/particles");
const transitions_1 = require("../effects/transitions");
const animations_1 = require("../effects/animations");
const block_glow_1 = require("../effects/block-glow");
const line_clear_animation_1 = require("../effects/line-clear-animation");
const connected_blocks_1 = require("../effects/connected-blocks");
/**
 * Main game screen
 */
class GameScreen {
    constructor(screen, engine, input, // Null for attract mode (AI-controlled)
    sounds, state, gamepadMapper = null) {
        this.screen = screen;
        this.engine = engine;
        this.input = input;
        this.sounds = sounds;
        this.state = state;
        this.gamepadMapper = gamepadMapper;
        this.running = false;
        this.stoppedEarly = false; // True if stopped externally (not gameover)
        this.cleanedUp = false; // Prevent double cleanup
        this.escHandler = null;
        // Board overlay compositor: effects rendered inline in board content
        // Each cell is a blessed-tagged 2-char string or null (no overlay)
        this.boardOverlay = [];
        this.lastRender = 0;
        this.RENDER_FPS = 20; // Reduced for BBS efficiency
        this.RENDER_INTERVAL = 1000 / this.RENDER_FPS;
        // Track previous state for detecting changes
        this.lastGrade = '9';
        this.lastLines = 0;
        this.lastLevel = 0;
        this.lastSectionInfoRender = 0;
        this.lastSection = 0;
        this.lastPieceExists = false;
        this.lastScore = -1;
        this.lastCombo = -1;
        this.lastNext = [];
        this.lastHold = null;
        this.lastBoardHash = '';
        // Animation state
        this.gradeAnimProgress = 0;
        this.gradeAnimDirection = 1;
        this.lastComboMilestone = 0;
        this.twentyGFlashTimer = 0;
        // Rainbow border animation
        this.rainbowTimer = 0;
        this.lastRainbowUpdate = 0;
        this.RAINBOW_INTERVAL = 100; // Much slower update
        this.RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
        // Block shine effect (sweep animation like arkanoid2)
        this.shineTimer = 0;
        this.SHINE_INTERVAL = 300; // Frames between shine sweeps
        this.shineCells = new Map(); // "x,y" -> frames remaining
        // Shared with the TetriNET screen - see ui/board-effects.ts.
        this.hardDropTrails = [];
        // Initialize effect systems
        this.shaker = new screen_shake_1.ScreenShaker();
        this.particles = new particles_1.ParticleSystem();
        this.transitions = new transitions_1.TransitionManager();
        this.animations = new animations_1.AnimationManager();
        this.glowManager = new block_glow_1.BlockGlowManager();
        this.clearAnimation = new line_clear_animation_1.LineClearAnimationManager();
        this.connectedBlocks = new connected_blocks_1.ConnectedBlockRenderer();
        // Share managers with game engine for trigger integration
        this.engine.setAnimationManager(this.animations);
        this.engine.setGlowManager(this.glowManager);
        // Configure managers from settings
        this.glowManager.setEnabled(state.settings.blockGlow);
        this.glowManager.setIntensityMultiplier(state.settings.glowIntensity);
        this.clearAnimation.setEnabled(state.settings.clearStyle !== 'instant');
        this.connectedBlocks.setEnabled(state.settings.connectedBlocks);
    }
    /**
     * Show READY -> GO countdown before game starts.
     * Renders the next queue so the player can plan ahead.
     */
    async showReadyGo() {
        const state = this.engine.getState();
        // Show next queue preview during countdown
        this.renderNext(state.nextQueue);
        const readyBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 10,
            left: 2,
            width: 22,
            height: 3,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            align: 'center',
            content: '{bold}{yellow-fg}READY{/yellow-fg}{/bold}',
            fixed: true,
            tags: true,
        });
        try {
            this.screen.render();
            await new Promise(resolve => setTimeout(resolve, 900));
            readyBox.setContent('{bold}{green-fg}  GO !{/green-fg}{/bold}');
            this.screen.render();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        finally {
            readyBox.destroy();
            this.screen.render();
        }
    }
    /**
     * Run the game loop
     */
    async run() {
        // Setup UI and input
        this.setupUI();
        this.setupInput();
        // Ready-Go sequence shows next queue before pieces start falling
        await this.showReadyGo();
        return new Promise((resolve) => {
            // Start game
            this.engine.start();
            this.running = true;
            this.sounds.playMusic('master_1', true);
            // Game loop using setInterval
            let lastUpdate = Date.now();
            const gameLoop = setInterval(() => {
                if (!this.running) {
                    clearInterval(gameLoop);
                    // Only show game over if not stopped early (e.g., attract mode exit)
                    if (this.stoppedEarly) {
                        this.cleanup();
                        resolve();
                    }
                    else {
                        this.showGameOver().then(() => {
                            this.cleanup();
                            resolve();
                        });
                    }
                    return;
                }
                const now = Date.now();
                const deltaTime = now - lastUpdate;
                lastUpdate = now;
                // Update game (always at 60Hz logic)
                this.engine.update(deltaTime);
                if (this.input) {
                    this.input.update(deltaTime);
                }
                // Get current state once for all checks
                const gameState = this.engine.getState();
                // Update effects
                this.shaker.update(deltaTime);
                this.particles.update(deltaTime);
                this.transitions.update(deltaTime);
                this.animations.update(deltaTime);
                this.glowManager.update(deltaTime);
                this.clearAnimation.update(deltaTime);
                this.updateGradeAnimation(deltaTime);
                // Update rainbow border animation
                if (now - this.lastRainbowUpdate >= this.RAINBOW_INTERVAL) {
                    this.rainbowTimer++;
                    this.updateRainbowBorders();
                    this.lastRainbowUpdate = now;
                }
                // Update block shine effect
                this.updateShineEffect();
                // Update 20G flash timer
                if (gameState.gravity >= 20) {
                    this.twentyGFlashTimer += deltaTime;
                }
                else {
                    this.twentyGFlashTimer = 0;
                }
                // Check for game events and trigger effects
                this.checkGameEvents();
                // Render at target FPS
                if (now - this.lastRender >= this.RENDER_INTERVAL) {
                    this.render();
                    this.lastRender = now;
                }
                // Check for game over or ultra completion
                if (gameState.status === 'gameover' || gameState.status === 'complete') {
                    this.running = false;
                }
            }, 16); // Logic at ~60 FPS
        });
    }
    /**
     * Check for game events and trigger visual effects
     */
    checkGameEvents() {
        const gameState = this.engine.getState();
        // Check for level change
        if (gameState.level > this.lastLevel) {
            // TGM3 plays level change (section up) every 100 levels
            const oldSection = Math.floor(this.lastLevel / 100);
            const newSection = Math.floor(gameState.level / 100);
            if (newSection > oldSection && gameState.level < 1000) {
                this.sounds.playSfx('section_up');
            }
            else {
                this.sounds.playSfx('level_up');
            }
            this.lastLevel = gameState.level;
        }
        // Check for grade change
        if (gameState.grade !== this.lastGrade) {
            this.animations.gradeUp(this.lastGrade, gameState.grade, 40, 5);
            this.particles.spawn('gradeUp', 5, 7); // Board center, upper area
            this.shaker.shake('lineClear');
            this.sounds.playSfx('grade_up');
            this.lastGrade = gameState.grade;
        }
        // Check for line clear
        if (gameState.lines > this.lastLines) {
            const linesCleared = gameState.lines - this.lastLines;
            // Check for T-Spin
            if (gameState.lastTSpin === 'full') {
                // T-Spin!
                this.particles.spawn('tetris', 5, 14);
                this.shaker.shake('tetris');
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice'); // Voice callout
            }
            else if (gameState.lastTSpin === 'mini') {
                // T-Spin Mini
                this.particles.spawn('lineClear', 5, 14);
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('rotate');
            }
            else if (linesCleared === 4) {
                // Tetris!
                this.particles.spawn('tetris', 5, 14);
                this.shaker.shake('tetris');
                this.animations.lineClearFlash([], 4);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice'); // Voice callout
            }
            else if (linesCleared === 3) {
                // Triple
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('triple'); // Voice callout
            }
            else if (linesCleared === 2) {
                // Double
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('double'); // Voice callout
            }
            else if (linesCleared >= 1) {
                // Single line clear (no voice)
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
            }
            this.lastLines = gameState.lines;
        }
        // Check for combo milestones
        const combo = gameState.combo;
        const milestone = Math.floor(combo / 5) * 5;
        if (combo > 0 && milestone > this.lastComboMilestone && milestone >= 5) {
            this.triggerComboAnimation(combo, milestone);
            this.lastComboMilestone = milestone;
        }
        if (combo === 0)
            this.lastComboMilestone = 0;
        // Check for recently awarded medals
        const recentMedals = this.engine.getRecentMedals();
        if (recentMedals.length > 0) {
            for (const medal of recentMedals) {
                this.triggerMedalAnimation(medal);
            }
            this.engine.clearRecentMedals();
        }
        // Check for section completion
        if (gameState.section > this.lastSection) {
            const result = gameState.lastSectionResult;
            if (result) {
                this.handleSectionComplete(this.lastSection, result);
            }
            this.lastSection = gameState.section;
        }
        // Check for piece spawn (null -> non-null)
        if (gameState.currentPiece && !this.lastPieceExists) {
            this.sounds.playSfx(this.getSpawnSfx(gameState.currentPiece.type));
            // IRS visual/audio feedback
            if (gameState.currentPiece.rotation !== 0) {
                this.animations.tSpin(gameState.currentPiece.x + 1, gameState.currentPiece.y + 1); // Use tspin flash for IRS
                this.sounds.playSfx('pre_rotate');
            }
        }
        // IHS visual feedback
        if (!gameState.canHold && gameState.holdPiece && this.lastHold !== gameState.holdPiece && !this.lastPieceExists) {
            this.sounds.playSfx('pre_hold');
        }
        // Check for piece lock (detect when currentPiece becomes null after being non-null)
        if (!gameState.currentPiece && this.lastPieceExists) {
            // Piece just locked - trigger lock flash
            this.triggerLockFlash();
        }
        this.lastPieceExists = gameState.currentPiece !== null;
    }
    /**
     * Trigger medal award animation
     */
    triggerMedalAnimation(medal) {
        const color = (medal.tier === 3) ? 'cyan' : (medal.tier === 2) ? 'yellow' : (medal.tier === 1) ? 'white' : 'yellow';
        const tierName = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'][medal.tier];
        this.animations.gradeUp('', `${tierName} ${medal.type}`, 40, 10);
        this.sounds.playSfx('grade_up');
    }
    /**
     * Get spawn sound for piece type
     */
    getSpawnSfx(type) {
        const map = {
            I: 'spawn_i', J: 'spawn_j', L: 'spawn_l', O: 'spawn_o',
            S: 'spawn_s', T: 'spawn_t', Z: 'spawn_z'
        };
        return map[type] || 'move';
    }
    /**
     * Trigger lock flash effect
     */
    triggerLockFlash() {
        const gameState = this.engine.getState();
        const lockTime = Date.now();
        const cells = [];
        for (let y = 0; y < gameState.board.height; y++) {
            for (let x = 0; x < gameState.board.width; x++) {
                const cell = gameState.board.grid[y][x];
                if (cell.lockTime && (lockTime - cell.lockTime) < 50) {
                    cells.push({ x, y });
                }
            }
        }
        const color = cells.length > 0
            ? gameState.board.grid[cells[0].y][cells[0].x].color || 'white'
            : 'white';
        this.animations.lockGlow(cells, color);
        this.sounds.playSfx('lock');
    }
    /**
     * Trigger combo animation for milestone achievements
     */
    triggerComboAnimation(combo, milestone) {
        if (milestone >= 10)
            this.particles.spawn('combo', 5, 14); // Board center
        this.animations.comboCounter(combo, milestone);
        // Voice callouts for combo milestones
        if (milestone >= 15) {
            this.sounds.playSfx('tetris');
            this.sounds.playVoice('excellent'); // High combo voice
        }
        else if (milestone >= 10) {
            this.sounds.playSfx('grade_up');
            this.sounds.playVoice('combo'); // Combo voice
        }
        else if (milestone >= 5) {
            this.sounds.playVoice('combo'); // Combo voice
        }
    }
    /**
     * Handle section completion
     */
    handleSectionComplete(section, result) {
        // Trigger animation
        if (result === 'COOL') {
            this.animations.cool(section);
            this.sounds.playSfx('section_cool');
            this.sounds.playVoice('cool'); // Voice callout
            // Optional: spawn particles for COOL achievement
            this.particles.spawn('cool', 5, 14); // Board center
        }
        else if (result === 'REGRET') {
            this.animations.regret(section);
            this.sounds.playSfx('section_regret');
            this.sounds.playVoice('regret'); // Voice callout
        }
    }
    /**
     * Setup UI elements
     */
    setupUI() {
        // Clear screen
        this.screen.children.forEach(child => child.destroy());
        // Outer frame wrapping the entire game area (consistency with main menu)
        this.outerFrame = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'gray' } },
            focusable: false,
            mouse: false,
            clickable: false,
        });
        this.boardBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 2,
            width: 22,
            height: 22,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'white' } },
            fixed: true,
        });
        this.nextBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 25,
            width: 14,
            height: 12,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' NEXT ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        this.holdBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 16,
            left: 25,
            width: 14,
            height: 6,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'magenta' } },
            label: ' HOLD ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        this.gradeBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 40,
            width: 15,
            height: 7,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            label: ' GRADE ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        this.statsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 8,
            left: 40,
            width: 15,
            height: 8,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'green' } },
            label: ' STATS ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Right of the SECTION column, which is otherwise unused. Only zone mode
        // shows it.
        this.zoneBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 8,
            left: 56,
            width: 20,
            height: 6,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' ZONE ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Hidden until a zone game starts; every other mode never sees it.
        this.zoneBox.hide();
        this.sectionBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 16,
            left: 40,
            width: 15,
            height: 6,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' SECTION ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // No footer in game screen - 24-row terminal has no room inside outer frame
        // (outerFrame border uses 2 rows, board needs 22 rows = exactly 24)
        // Key hints are shown on menu screen and in settings
        // Effects are now rendered inline in board content via boardOverlay compositor
        // No effectsBox needed - eliminates ghost artifacts from transparent overlays
    }
    /**
     * Setup input handlers
     */
    setupInput() {
        // Skip input setup for attract mode (AI-controlled)
        if (!this.input)
            return;
        // Helper: register a callback on both keyboard and gamepad inputs.
        // Every input-driven engine change renders IMMEDIATELY instead of
        // waiting for the next 50 ms render tick - that wait (0-50 ms, avg 25)
        // was the single largest guaranteed input latency in the whole path.
        // renderNow() has its own 8 ms floor, so DAS/ARR repeats cannot flood.
        const on = (action, cb) => {
            const wrapped = () => { cb(); this.renderNow(); };
            this.input.on(action, wrapped);
            this.gamepadMapper?.on(action, wrapped);
        };
        on('left', () => {
            if (this.engine.move(-1)) {
                this.sounds.playSfx('move');
            }
        });
        on('right', () => {
            if (this.engine.move(1)) {
                this.sounds.playSfx('move');
            }
        });
        on('rotate_cw', () => {
            if (this.engine.rotate(1)) {
                this.sounds.playSfx('rotate');
            }
            else {
                if (this.engine.setIRS(1)) {
                    this.sounds.playSfx('pre_rotate');
                }
            }
        });
        on('rotate_ccw', () => {
            if (this.engine.rotate(-1)) {
                this.sounds.playSfx('rotate');
            }
            else {
                if (this.engine.setIRS(-1)) {
                    this.sounds.playSfx('pre_rotate');
                }
            }
        });
        on('rotate_180', () => {
            // In Zone mode, rotate_180 activates Zone (if meter >= 20%); otherwise rotates normally
            if (this.state.currentMode === 'zone') {
                if (this.engine.activateZone()) {
                    this.sounds.playSfx('section_cool'); // Zone activation sound
                    return;
                }
            }
            // 180 = two CW rotations
            const r1 = this.engine.rotate(1);
            const r2 = this.engine.rotate(1);
            if (r1 || r2)
                this.sounds.playSfx('rotate');
        });
        on('soft_drop', () => {
            this.engine.softDrop();
        });
        on('hard_drop', () => {
            this.addHardDropTrail();
            this.engine.hardDrop();
            this.sounds.playSfx('hard_drop');
        });
        on('hold', () => {
            if (this.engine.hold()) {
                this.sounds.playSfx('hold');
            }
            else {
                if (this.engine.setIHS()) {
                    this.sounds.playSfx('pre_hold');
                }
            }
        });
        on('pause', () => {
            if (this.engine.getState().status === 'playing') {
                this.engine.pause();
                this.showPauseMenu();
            }
        });
        // ESC directly quits the game (bypass pause menu)
        // Handled via screen keypress since ESC is not mapped in input config
        this.escHandler = (_ch, key) => {
            if (!key || !this.input)
                return;
            if (key.name === 'escape' && this.engine.getState().status === 'playing') {
                this.stoppedEarly = true;
                this.running = false;
            }
        };
        this.screen.on('keypress', this.escHandler);
    }
    /**
     * Render game state
     */
    render() {
        const state = this.engine.getState();
        let needsRender = false;
        // Detect board changes via hash
        const boardHash = this.getBoardHash(state);
        const isShaking = this.shaker.isShaking();
        // A fading hard-drop trail is an ANIMATION and has to keep the board
        // repainting the way particles and shake do. It did not, so the streak
        // was painted once by the frame that locked the piece and then FROZE:
        // the piece is down, the hash stops changing, and the gate below blocked
        // every later frame until the next piece moved - at which point the
        // trail vanished in one step instead of fading. Reported live as "the
        // motion blur freezes for a bit on hard drops" (2026-08-25).
        //
        // Expiry belongs here rather than in renderBoard() for the same reason:
        // renderBoard only runs when the gate passes, so a blocked gate stopped
        // the trail expiring at all.
        const hadTrails = this.hardDropTrails.length > 0;
        this.hardDropTrails = (0, board_effects_1.expireTrails)(this.hardDropTrails, Date.now());
        const hasTrails = this.hardDropTrails.length > 0;
        if (boardHash !== this.lastBoardHash || hasTrails || hadTrails || this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0 || isShaking) {
            // Apply shake offset
            if (isShaking) {
                const offset = this.shaker.getOffset();
                this.boardBox.top = 1 + offset.y;
                this.boardBox.left = 2 + offset.x;
            }
            else {
                this.boardBox.top = 1;
                this.boardBox.left = 2;
            }
            this.renderBoard(state);
            this.lastBoardHash = boardHash;
            needsRender = true;
        }
        // Update next/hold if changed
        if (JSON.stringify(state.nextQueue.slice(0, 3)) !== JSON.stringify(this.lastNext)) {
            this.renderNext(state.nextQueue.slice(0, 3));
            this.lastNext = [...state.nextQueue.slice(0, 3)];
            needsRender = true;
        }
        if (state.holdPiece !== this.lastHold) {
            this.renderHold(state.holdPiece);
            this.lastHold = state.holdPiece;
            needsRender = true;
        }
        // Stats update (always update if lines/score changed)
        if (state.score !== this.lastScore || state.level !== this.lastLevel || state.combo !== this.lastCombo) {
            this.renderStats(state);
            this.lastScore = state.score;
            this.lastLevel = state.level;
            this.lastCombo = state.combo;
            needsRender = true;
        }
        // Grade and Section (always updated)
        if (state.grade !== this.lastGrade || this.gradeAnimProgress > 0) {
            const gradeColor = this.getAnimatedGradeColor(state.grade);
            const gradeSize = this.getAnimatedGradeSize(state.grade);
            const gradePadding = ' '.repeat(Math.floor((13 - state.grade.length) / 2));
            this.gradeBox.setContent(`\n\n${gradePadding}{${gradeColor}-fg}${gradeSize.prefix}${state.grade}${gradeSize.suffix}{/${gradeColor}-fg}`);
            this.lastGrade = state.grade;
            needsRender = true;
        }
        // sectionTime is nonzero for the entire game, so the old
        // `sectionTime !== 0` made this branch (and needsRender) true on every
        // pass. The timer readout only needs ~4 Hz.
        if (state.section !== this.lastSection || Date.now() - this.lastSectionInfoRender >= 250) {
            this.renderSectionInfo(state);
            this.lastSection = state.section;
            this.lastSectionInfoRender = Date.now();
            needsRender = true;
        }
        // Build board overlay for inline effects rendering (replaces effectsBox)
        if (this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0 || this.animations.getFloatingTexts().length > 0) {
            this.buildBoardOverlay();
            needsRender = true;
        }
        else {
            // Clear overlay when no effects active
            this.boardOverlay = [];
        }
        // Only render to screen if content changed
        if (needsRender) {
            this.screen.render();
        }
    }
    /** Render immediately (used for input feedback), floored at 8 ms. */
    renderNow() {
        const now = Date.now();
        if (now - this.lastRender >= 8) {
            this.render();
            this.lastRender = now;
        }
    }
    getBoardHash(state) {
        const piece = state.currentPiece ? `${state.currentPiece.x},${state.currentPiece.y},${state.currentPiece.rotation}` : 'null';
        // The shine animation only affects pixels while sweep cells are live.
        // Including the raw shineTimer here made the hash change EVERY 16 ms
        // tick, which defeated the render gate permanently - the board
        // repainted at full rate even with nothing moving.
        const shine = this.shineCells.size > 0 ? this.shineTimer : 0;
        return `${piece}-${state.lines}-${shine}`;
    }
    getPPS(state) {
        if (!state.startTime || state.piecesPlaced === 0)
            return '0.00';
        const elapsed = (Date.now() - state.startTime) / 1000;
        if (elapsed < 0.1)
            return '0.00';
        return (state.piecesPlaced / elapsed).toFixed(2);
    }
    getDigHud(state) {
        if (state.mode !== 'dig')
            return '';
        const remaining = state.digLinesRemaining ?? 0;
        const color = remaining <= 3 ? 'green' : remaining <= 6 ? 'yellow' : 'red';
        const filled = 10 - remaining;
        const bar = '#'.repeat(filled) + '-'.repeat(remaining);
        return `\n{${color}-fg}DIG: ${remaining} left{/${color}-fg}\n{gray-fg}[${bar}]{/gray-fg}`;
    }
    /**
     * The zone meter, or the countdown while zone is running.
     *
     * Exported shape kept as a string builder so it can be tested without a
     * Screen; the box only exists in zone mode.
     */
    static zoneHudContent(state) {
        if (state.zoneActive) {
            const s = Math.ceil(Math.max(0, state.zoneTimeRemaining) / 1000);
            const n = state.zoneBufferedLines ?? 0;
            return `\n {cyan-fg}{bold}ACTIVE{/bold}{/cyan-fg}\n {cyan-fg}${s}s{/cyan-fg}\n {white-fg}${n} lines held{/white-fg}`;
        }
        const meter = state.zoneMeter ?? 0;
        const pct = Math.round(meter * 100);
        const filled = Math.max(0, Math.min(10, Math.round(meter * 10)));
        const bar = '#'.repeat(filled) + '-'.repeat(10 - filled);
        // 20% is the threshold activateZone() enforces; say so rather than
        // leaving the player guessing why the key does nothing.
        const color = pct >= 100 ? 'yellow' : pct >= 20 ? 'cyan' : 'gray';
        const hint = pct >= 20 ? '{green-fg}FLIP to enter{/green-fg}' : '{gray-fg}needs 20%{/gray-fg}';
        return `\n {${color}-fg}${String(pct).padStart(3)}%{/${color}-fg} {gray-fg}[${bar}]{/gray-fg}\n ${hint}`;
    }
    renderZone(state) {
        if (state.mode !== 'zone') {
            this.zoneBox.hide();
            return;
        }
        this.zoneBox.show();
        this.zoneBox.setContent(GameScreen.zoneHudContent(state));
    }
    getUltraTime(state) {
        if (state.mode !== 'ultra' || state.ultraTimeRemaining === undefined)
            return '';
        const ms = Math.max(0, state.ultraTimeRemaining);
        const totalSecs = Math.ceil(ms / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = (totalSecs % 60).toString().padStart(2, '0');
        const color = ms < 30000 ? 'red' : ms < 60000 ? 'yellow' : 'green';
        return `\n  {${color}-fg}TIME: ${m}:${s}{/${color}-fg}`;
    }
    renderStats(state) {
        const comboDisplay = this.getAnimatedComboDisplay(state.combo);
        let gravDisplay;
        if (state.gravity >= 20) {
            const flash = Math.floor(this.twentyGFlashTimer / 250) % 2 === 0;
            gravDisplay = `{${flash ? 'red' : 'yellow'}-fg}{bold}20.00{/bold}{/${flash ? 'red' : 'yellow'}-fg}`;
        }
        else {
            gravDisplay = `{yellow-fg}${state.gravity.toFixed(2)}{/yellow-fg}`;
        }
        let statsContent = `\n  Level: {cyan-fg}${state.level}{/cyan-fg}\n` +
            `  Lines: {green-fg}${state.lines}{/green-fg}\n` +
            `  Score: {white-fg}${state.score.toLocaleString()}{/white-fg}\n` +
            `  Combo: ${comboDisplay}\n` +
            `  Grav:  ${gravDisplay}G\n` +
            `  PPS:   {white-fg}${this.getPPS(state)}{/white-fg}` +
            this.getUltraTime(state) +
            this.getDigHud(state);
        // Zone has its own box: the six stats above already fill this one.
        this.renderZone(state);
        if (state.lastTSpin === 'full') {
            statsContent += `\n\n  {magenta-fg}{bold}T-SPIN!{/bold}{/magenta-fg}`;
        }
        else if (state.lastTSpin === 'mini') {
            statsContent += `\n\n  {cyan-fg}T-SPIN MINI{/cyan-fg}`;
        }
        if (state.backToBack && state.backToBackCount > 1) {
            statsContent += `\n  {yellow-fg}{bold}B2B x${state.backToBackCount}{/bold}{/yellow-fg}`;
        }
        else if (state.backToBack) {
            statsContent += `\n  {yellow-fg}{bold}B2B{/bold}{/yellow-fg}`;
        }
        if (state.creditRollActive) {
            const timeLeft = Math.ceil(state.creditRollTimeRemaining / 1000);
            const color = timeLeft < 30 ? 'red' : 'yellow';
            statsContent += `\n\n  {${color}-fg}CREDIT{/${color}-fg}\n`;
            statsContent += `  {${color}-fg}${timeLeft}s{/${color}-fg}`;
        }
        this.statsBox.setContent(statsContent);
    }
    /**
     * Build board overlay grid from all active effects
     *
     * Z-order (highest priority first):
     * 1. Text announcements (gradeUp, cool/regret, combo, tSpin)
     * 2. Floating text (score popups)
     * 3. Particles (converted to board coords)
     * 4. Lock glow (piece lock flash)
     *
     * Board coordinates: x=0..9, y=4..23 (visible area)
     * Each overlay cell is a 2-char blessed-tagged string or null
     */
    buildBoardOverlay() {
        // Reset overlay grid: 20 visible rows (y=4..23) x 10 cols
        this.boardOverlay = [];
        for (let r = 0; r < 20; r++) {
            this.boardOverlay[r] = new Array(10).fill(null);
        }
        // Helper to set overlay cell (lowest-priority callers go first, higher overwrite)
        const setCell = (boardX, boardY, content) => {
            const row = boardY - 4;
            if (row >= 0 && row < 20 && boardX >= 0 && boardX < 10) {
                this.boardOverlay[row][boardX] = content;
            }
        };
        // --- Layer 4 (lowest): Lock glow ---
        const lockGlowAnims = this.animations.getAnimationsByType('lockGlow');
        for (const anim of lockGlowAnims) {
            const intensity = animations_1.AnimationRenderer.getLockGlowIntensity(anim);
            if (intensity > 0.3) {
                const data = anim.data;
                for (const cell of data.cells) {
                    if (intensity > 0.7) {
                        setCell(cell.x, cell.y, '{white-fg}{bold}██{/bold}{/white-fg}');
                    }
                    else {
                        setCell(cell.x, cell.y, '{white-fg}░░{/white-fg}');
                    }
                }
            }
        }
        // --- Layer 3: Particles (now spawned in board coordinates) ---
        const particles = this.particles.getRenderableParticles();
        for (const particle of particles) {
            const boardX = Math.floor(particle.x);
            const boardY = Math.floor(particle.y);
            if (boardX >= 0 && boardX < 10 && boardY >= 4 && boardY < 24) {
                const alpha = particle.alpha;
                if (alpha > 0.7) {
                    setCell(boardX, boardY, `{${particle.color}-fg}${particle.char}${particle.char}{/${particle.color}-fg}`);
                }
                else if (alpha > 0.3) {
                    setCell(boardX, boardY, `{gray-fg}${particle.char}${particle.char}{/gray-fg}`);
                }
            }
        }
        // --- Layer 2: Floating text (score popups) ---
        const floatingTexts = this.animations.getFloatingTexts();
        for (const text of floatingTexts) {
            // Filter by mode
            if (text.mode === 'offboard' && text.x >= 0 && text.x < 10) {
                continue; // Don't render on playfield in offboard mode
            }
            // Calculate alpha (fade out frames 80-100)
            let alpha = 1.0;
            if (text.timer > 80) {
                alpha = 1.0 - ((text.timer - 80) / 20);
            }
            const color = alpha > 0.5 ? text.color : 'gray';
            // text.x is board X, text.y is board Y (floating upward from originY)
            const boardY = Math.floor(text.y);
            const boardX = Math.floor(text.x);
            // Render each line of text into board cells
            for (let lineIdx = 0; lineIdx < text.text.length; lineIdx++) {
                const line = text.text[lineIdx];
                const textBoardY = boardY + lineIdx;
                // Each board cell is 2 chars. Spread text across cells starting at boardX.
                for (let ci = 0; ci < line.length; ci++) {
                    const cellX = boardX + Math.floor(ci / 2);
                    // Build 2-char cell content for this position
                    const charIdx = ci % 2;
                    if (charIdx === 0) {
                        // Get both chars for this cell
                        const c1 = line[ci] || ' ';
                        const c2 = (ci + 1 < line.length) ? line[ci + 1] : ' ';
                        setCell(cellX, textBoardY, `{${color}-fg}${c1}${c2}{/${color}-fg}`);
                    }
                }
            }
        }
        // --- Layer 1 (highest): Text announcements ---
        const animations = this.animations.getAnimations();
        for (const anim of animations) {
            if (anim.type === 'gradeUp') {
                const rendered = animations_1.AnimationRenderer.renderGradeUp(anim);
                // Center "GRADE UP!" (9 chars) on board (10 cells = 20 chars)
                // Then second line with grade transition
                this.overlayTextOnBoard(rendered, 7, setCell); // Board center area
            }
            else if (anim.type === 'cool' || anim.type === 'regret') {
                const rendered = animations_1.AnimationRenderer.renderSectionResult(anim);
                this.overlayTextOnBoard(rendered, 5, setCell); // Mid-upper area
            }
            else if (anim.type === 'comboCounter') {
                const data = anim.data;
                const combo = data.combo;
                const progress = anim.elapsed / anim.duration;
                if (progress < 0.8) {
                    const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : 'cyan';
                    const comboText = `${combo} COMBO!`;
                    const boldTag = progress < 0.2 ? '{bold}' : '';
                    const boldEnd = progress < 0.2 ? '{/bold}' : '';
                    this.overlayTextOnBoard(`{${color}-fg}${boldTag}${comboText}${boldEnd}{/${color}-fg}`, 10, setCell);
                }
            }
            else if (anim.type === 'tSpin') {
                const progress = anim.elapsed / anim.duration;
                if (progress < 0.6) {
                    this.overlayTextOnBoard('{magenta-fg}{bold}T-SPIN!{/bold}{/magenta-fg}', 9, setCell);
                }
            }
            // lockGlow handled in layer 4 above
        }
    }
    /**
     * Overlay text centered on the board at a given visible row offset
     * Text may contain blessed tags. Plain text chars are extracted for positioning.
     * visibleRow: 0-19 offset from top of visible board (board y=4+visibleRow)
     */
    overlayTextOnBoard(taggedText, visibleRow, setCell) {
        // Split multi-line text
        const lines = taggedText.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            // Strip blessed tags to get plain text length for centering
            const plainText = line.replace(/\{[^}]*\}/g, '');
            const boardWidth = 10; // cells
            const textCellWidth = Math.ceil(plainText.length / 2); // Each cell is 2 chars
            const startCell = Math.floor((boardWidth - textCellWidth) / 2);
            const boardY = 4 + visibleRow + lineIdx;
            // Build cells from the tagged text
            // Strategy: extract plain chars with their surrounding tags
            // For simplicity, render the entire line into consecutive board cells
            let charCount = 0;
            let currentTags = '';
            let cellChars = [];
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '{') {
                    const end = line.indexOf('}', i);
                    if (end !== -1) {
                        currentTags += line.substring(i, end + 1);
                        i = end;
                        continue;
                    }
                }
                cellChars.push(line[i]);
            }
            // Now spread cellChars into 2-char board cells, wrapped in original tags
            // Re-extract the tag prefix and suffix from the line
            const tagPrefix = line.match(/^(\{[^}]*\})+/)?.[0] || '';
            const tagSuffix = line.match(/(\{\/[^}]*\})+$/)?.[0] || '';
            for (let ci = 0; ci < cellChars.length; ci += 2) {
                const c1 = cellChars[ci] || ' ';
                const c2 = cellChars[ci + 1] || ' ';
                const cellX = startCell + Math.floor(ci / 2);
                setCell(cellX, boardY, `${tagPrefix}${c1}${c2}${tagSuffix}`);
            }
        }
    }
    /**
     * Update grade display animation
     */
    updateGradeAnimation(deltaTime) {
        const PULSE_SPEED = 0.001; // Slower
        this.gradeAnimProgress += PULSE_SPEED * deltaTime * this.gradeAnimDirection;
        if (this.gradeAnimProgress >= 1) {
            this.gradeAnimProgress = 1;
            this.gradeAnimDirection = -1;
        }
        else if (this.gradeAnimProgress <= 0) {
            this.gradeAnimProgress = 0;
            this.gradeAnimDirection = 1;
        }
    }
    /**
     * Update rainbow border colors for all panels
     */
    updateRainbowBorders() {
        const baseIndex = this.rainbowTimer % this.RAINBOW_COLORS.length;
        // Only update if grade is high enough to justify the distraction
        const state = this.engine.getState();
        const isRainbowMode = state.grade === 'GM' || state.grade === 'GMM' || state.creditRollActive;
        if (!isRainbowMode) {
            if (this.boardBox?.style?.border)
                this.boardBox.style.border.fg = 'white';
            if (this.nextBox?.style?.border)
                this.nextBox.style.border.fg = 'cyan';
            if (this.holdBox?.style?.border)
                this.holdBox.style.border.fg = 'magenta';
            if (this.gradeBox?.style?.border)
                this.gradeBox.style.border.fg = 'yellow';
            if (this.statsBox?.style?.border)
                this.statsBox.style.border.fg = 'green';
            if (this.sectionBox?.style?.border)
                this.sectionBox.style.border.fg = 'cyan';
            return;
        }
        // Each panel gets a different offset for a wave effect
        if (this.boardBox?.style?.border) {
            this.boardBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 0) % this.RAINBOW_COLORS.length];
        }
        if (this.nextBox?.style?.border) {
            this.nextBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 1) % this.RAINBOW_COLORS.length];
        }
        if (this.holdBox?.style?.border) {
            this.holdBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 2) % this.RAINBOW_COLORS.length];
        }
        if (this.gradeBox?.style?.border) {
            this.gradeBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 3) % this.RAINBOW_COLORS.length];
        }
        if (this.statsBox?.style?.border) {
            this.statsBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 4) % this.RAINBOW_COLORS.length];
        }
        if (this.sectionBox?.style?.border) {
            this.sectionBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 5) % this.RAINBOW_COLORS.length];
        }
    }
    /**
     * Update block shine effect (sweeping glare like arkanoid2)
     */
    updateShineEffect() {
        this.shineTimer++;
        // Trigger new shine sweep periodically
        if (this.shineTimer >= this.SHINE_INTERVAL) {
            this.shineTimer = 0;
            const gameState = this.engine.getState();
            const board = gameState.board;
            let delay = 0;
            // Sweep from top-left to bottom-right
            for (let y = 4; y < 24; y++) {
                for (let x = 0; x < board.width; x++) {
                    const cell = board.grid[y][x];
                    if (cell.filled && cell.locked) {
                        const key = `${x},${y}`;
                        this.shineCells.set(key, delay + 5);
                        delay += 1;
                    }
                }
            }
        }
        for (const [key, frames] of this.shineCells.entries()) {
            if (frames <= 0) {
                this.shineCells.delete(key);
            }
            else {
                this.shineCells.set(key, frames - 1);
            }
        }
    }
    /**
     * Check if a cell should be rendered with shine effect
     */
    hasShineEffect(x, y) {
        const key = `${x},${y}`;
        const frames = this.shineCells.get(key);
        return frames !== undefined && frames > 0 && frames < 5;
    }
    /**
     * Get animated color for grade
     */
    getAnimatedGradeColor(grade) {
        if (grade === 'GMM' || grade === 'GM') {
            const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
            const index = Math.floor(this.gradeAnimProgress * colors.length) % colors.length;
            return colors[index];
        }
        if (grade.startsWith('M'))
            return 'red';
        if (grade.startsWith('m'))
            return 'magenta';
        if (grade.startsWith('S'))
            return 'cyan';
        return 'white';
    }
    /**
     * Get animated size for grade
     */
    getAnimatedGradeSize(grade) {
        const pulse = Math.sin(this.gradeAnimProgress * Math.PI * 2) * 0.5 + 0.5;
        return pulse > 0.7 ? { prefix: '{bold}', suffix: '{/bold}' } : { prefix: '', suffix: '' };
    }
    /**
     * Get animated combo display with milestone colors
     */
    getAnimatedComboDisplay(combo) {
        const comboAnim = this.animations.getAnimationsByType('comboCounter')[0];
        if (comboAnim) {
            const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : combo >= 5 ? 'cyan' : 'magenta';
            return `{${color}-fg}{bold}${combo}x{/bold}{/${color}-fg}`;
        }
        const color = combo >= 5 ? 'magenta' : 'white';
        return `{${color}-fg}${combo}x{/${color}-fg}`;
    }
    /**
     * Render section information
     */
    renderSectionInfo(state) {
        // COOL targets (seconds) - from TGM3 Master mode
        const COOL_TARGETS = {
            0: 52, 1: 48, 2: 46, 3: 44, 4: 36,
            5: 36, 6: 40, 7: 44, 8: 44, 9: 44,
        };
        const section = state.section;
        const sectionTime = state.sectionTime / 1000;
        const coolTarget = COOL_TARGETS[section] || 45;
        let timeColor = 'white';
        if (sectionTime < coolTarget) {
            timeColor = 'green';
        }
        else {
            timeColor = 'yellow';
        }
        let content = `\n {cyan-fg}SEC:{/cyan-fg} ${section}\n`;
        content += ` {${timeColor}-fg}${sectionTime.toFixed(1)}s{/${timeColor}-fg}\n`;
        content += ` {green-fg}${coolTarget}s{/green-fg}`;
        if (state.lastSectionResult) {
            const resultColor = state.lastSectionResult === 'COOL' ? 'green'
                : state.lastSectionResult === 'REGRET' ? 'red' : 'yellow';
            content += `\n {${resultColor}-fg}${state.lastSectionResult}{/${resultColor}-fg}`;
        }
        this.sectionBox.setContent(content);
    }
    /**
     * Render board with pieces
     */
    renderBoard(state) {
        const { board, currentPiece } = state;
        const rotationSystem = this.state.settings.rotationSystem;
        const creditRoll = this.engine.creditRollManager;
        const invisibleManager = this.engine.invisiblePieceManager;
        const isMasterRoll = state.creditRollActive;
        // Update connected blocks cache if enabled
        if (this.state.settings.connectedBlocks) {
            this.connectedBlocks.updateCache(board);
        }
        let content = '';
        const now = Date.now();
        // Trails are expired in render(), before the repaint gate.
        let pieceShape = null;
        let ghostY = null;
        if (currentPiece) {
            const pieceManager = this.engine.pieceManager;
            const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
            if (shape) {
                pieceShape = shape;
                // Only calculate ghost if piece is visible or will land in visible area
                if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
                    const calculatedGhostY = (0, board_1.getGhostY)(board, shape, currentPiece.x, currentPiece.y);
                    // Only use ghost if ANY part of it is in visible area (ghostY + shape height >= 4)
                    // This prevents ghost rendering when the entire ghost is in vanish zone
                    const ghostBottom = calculatedGhostY + shape.length - 1;
                    if (ghostBottom >= 4 && calculatedGhostY !== currentPiece.y) {
                        ghostY = calculatedGhostY;
                    }
                }
            }
        }
        for (let y = 4; y < 24; y++) {
            if (y > 4)
                content += '\n';
            for (let x = 0; x < board.width; x++) {
                const cell = board.grid[y][x];
                let char = '  ';
                if (currentPiece && pieceShape) {
                    const px = x - currentPiece.x;
                    const py = y - currentPiece.y;
                    if (py >= 0 && py < pieceShape.length &&
                        px >= 0 && px < pieceShape[py].length &&
                        pieceShape[py][px]) {
                        if (currentPiece.invisible) {
                            char = '{black-fg}░░{/black-fg}';
                        }
                        else {
                            // TGM3: In Master Roll, board is invisible, but active piece is visible
                            char = this.getBlockChar(currentPiece.type, rotationSystem);
                        }
                    }
                }
                if (ghostY !== null && currentPiece && pieceShape && char === '  ' && !isMasterRoll) {
                    const px = x - currentPiece.x;
                    const py = y - ghostY;
                    // Calculate the actual board row this ghost block represents
                    const ghostBlockY = ghostY + py;
                    // Additional bounds check: ensure ghost block is within board and shape bounds
                    // AND ensure the ghost block's board position is in visible area (>= 4)
                    if (py >= 0 && py < pieceShape.length &&
                        px >= 0 && px < pieceShape[py].length &&
                        pieceShape[py][px] &&
                        ghostBlockY >= 4 && ghostBlockY < 24 && // Ghost block must be in visible board area
                        x >= 0 && x < board.width) { // Within board width
                        char = board_effects_1.GHOST_CHAR;
                    }
                }
                if (char === '  ' && !cell.filled && !isMasterRoll) {
                    char = (0, board_effects_1.trailCharAt)(this.hardDropTrails, x, y, now) ?? char;
                }
                if (char === '  ' && cell.filled) {
                    // Check line clear animation fade
                    const clearFade = this.clearAnimation.getCellFade(x, y);
                    if (clearFade >= 1.0) {
                        // Cell fully cleared by animation - render as empty
                        char = '  ';
                    }
                    else if (this.hasShineEffect(x, y) && !isMasterRoll) {
                        char = '{white-bg}{white-fg}██{/white-fg}{/white-bg}';
                    }
                    else if (isMasterRoll && cell.lockTime) {
                        // Apply TGM3 authentic credit roll fade
                        const age = Date.now() - cell.lockTime;
                        const fadeStage = creditRoll.getFadeStage(cell.lockTime);
                        if (fadeStage === 'full') {
                            char = this.getBlockChar(cell.color, rotationSystem);
                        }
                        else if (fadeStage === 'bright') {
                            char = this.getFadedBlockChar(cell.color, 'medium', rotationSystem);
                        }
                        else if (fadeStage === 'medium' || fadeStage === 'faint') {
                            char = this.getFadedBlockChar(cell.color, 'faint', rotationSystem);
                        }
                        else {
                            char = '  '; // Fully invisible
                        }
                    }
                    else if (!isMasterRoll) {
                        // Get base character (connected blocks or simple blocks)
                        const pieceColor = this.getPieceColorName(cell.color);
                        if (this.state.settings.connectedBlocks) {
                            char = this.connectedBlocks.getConnectedChar(x, y, pieceColor);
                        }
                        else {
                            char = this.getBlockChar(cell.color, rotationSystem);
                        }
                        // Apply block glow overlay if active
                        const glowIntensity = this.glowManager.getGlowIntensity(x, y);
                        if (glowIntensity > 0) {
                            const glowColor = this.glowManager.getGlowColor(x, y);
                            if (glowColor) {
                                char = this.applyGlow(char, glowColor, glowIntensity);
                            }
                        }
                        // Apply line clear fade effect if animating
                        if (clearFade > 0 && clearFade < 1.0) {
                            char = line_clear_animation_1.LineClearAnimationManager.applyFade(char, clearFade);
                        }
                        // Apply placement effect overlay if active
                        const placementEffects = this.animations.getPlacementEffects();
                        for (const effect of placementEffects) {
                            const effectChar = animations_1.AnimationRenderer.renderPlacementEffect(effect, x, y);
                            if (effectChar) {
                                char = effectChar;
                                break; // Only apply first matching effect
                            }
                        }
                        // Apply back-to-back glow overlay if active
                        const b2bAnimations = this.animations.getAnimationsByType('backToBackGlow');
                        for (const anim of b2bAnimations) {
                            const b2bChar = animations_1.AnimationRenderer.renderBackToBackGlow(anim.data, anim.elapsed, anim.duration, x, y);
                            if (b2bChar) {
                                char = b2bChar;
                                break;
                            }
                        }
                    }
                }
                // Apply board overlay (text announcements, particles, floating text, lock glow)
                // This is the highest-priority visual layer
                if (this.boardOverlay.length > 0) {
                    const overlayRow = y - 4;
                    if (overlayRow >= 0 && overlayRow < this.boardOverlay.length) {
                        const overlayCell = this.boardOverlay[overlayRow][x];
                        if (overlayCell !== null) {
                            char = overlayCell;
                        }
                    }
                }
                content += char;
            }
        }
        this.boardBox.setContent(content);
    }
    /**
     * Get ANSI block character for piece type
     */
    getBlockChar(type, rotationSystem) {
        const gameState = this.engine.getState();
        const colors = rotationSystem === 'ARS' ? pieces_1.ARS_COLORS : pieces_1.PIECE_COLORS;
        // Handle garbage blocks (type is null)
        if (type === null) {
            return '{gray-fg}██{/gray-fg}';
        }
        const color = colors[type] || 'white';
        // TGM3 Shirase: Bone blocks at level 1000+
        if (gameState.mode === 'death' && gameState.level >= 1000) {
            return '{white-fg}[]{/white-fg}';
        }
        return `{${color}-fg}██{/${color}-fg}`;
    }
    /**
     * Get faded block character for credit roll
     */
    getFadedBlockChar(type, intensity, rotationSystem) {
        const colors = rotationSystem === 'ARS' ? pieces_1.ARS_COLORS : pieces_1.PIECE_COLORS;
        const color = colors[type] || 'white';
        if (intensity === 'medium') {
            return `{${color}-fg}▒▒{/${color}-fg}`;
        }
        else {
            return `{${color}-fg}░░{/${color}-fg}`;
        }
    }
    addHardDropTrail() {
        const state = this.engine.getState();
        const { board, currentPiece } = state;
        if (!currentPiece) {
            return;
        }
        const pieceManager = this.engine.pieceManager;
        const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
        if (!shape) {
            return;
        }
        const ghostY = (0, board_1.getGhostY)(board, shape, currentPiece.x, currentPiece.y);
        const dropDistance = ghostY - currentPiece.y;
        if (dropDistance <= 0) {
            return;
        }
        const color = this.getPieceGlowColor(currentPiece.type, this.state.settings.rotationSystem);
        // The TGM board hides its four spawn rows, so the streak starts at row 4.
        this.hardDropTrails.push(...(0, board_effects_1.buildHardDropTrail)(shape, currentPiece.x, currentPiece.y, dropDistance, color, { minY: 4, maxY: 24 }, Date.now()));
    }
    /**
     * Render next queue
     */
    renderNext(queue) {
        let content = '\n';
        const rotationSystem = this.state.settings.rotationSystem;
        for (let i = 0; i < Math.min(3, queue.length); i++) {
            const piece = queue[i];
            const mini = this.getMiniPiece(piece, rotationSystem);
            content += mini + (i < 2 ? '\n\n' : '\n');
        }
        this.nextBox.setContent(content);
    }
    /**
     * Render hold piece
     */
    renderHold(piece) {
        if (!piece) {
            this.holdBox.setContent('\n   {gray-fg}---{/gray-fg}');
            return;
        }
        const mini = this.getMiniPiece(piece, this.state.settings.rotationSystem);
        this.holdBox.setContent('\n' + mini);
    }
    /**
     * Get mini piece preview
     */
    getMiniPiece(type, rotationSystem) {
        const block = this.getBlockChar(type, rotationSystem);
        const patterns = {
            I: `  ${block}${block}${block}${block}`,
            O: `    ${block}${block}\n    ${block}${block}`,
            T: `      ${block}\n    ${block}${block}${block}`,
            S: `      ${block}${block}\n    ${block}${block}`,
            Z: `    ${block}${block}\n      ${block}${block}`,
            J: `    ${block}\n    ${block}${block}${block}`,
            L: `        ${block}\n    ${block}${block}${block}`,
        };
        return patterns[type] || '';
    }
    /**
     * Calculate credit roll opacity based on block age
     */
    getCreditRollOpacity(age) {
        const HALF_LIFE = 5000;
        return Math.exp(-age / HALF_LIFE);
    }
    /**
     * Get color for piece type
     */
    getPieceGlowColor(type, rotationSystem) {
        const colors = rotationSystem === 'ARS' ? pieces_1.ARS_COLORS : pieces_1.PIECE_COLORS;
        return colors[type];
    }
    /**
     * Get color name for piece type (for visual effects)
     */
    getPieceColorName(type) {
        const rotationSystem = this.state.settings.rotationSystem;
        const colors = rotationSystem === 'ARS' ? pieces_1.ARS_COLORS : pieces_1.PIECE_COLORS;
        return colors[type] || 'white';
    }
    /**
     * Apply glow effect to block character
     */
    applyGlow(baseChar, glowColor, intensity) {
        // intensity 1.0 = full glow, 0.0 = no glow
        const bright = (0, board_effects_1.brightColor)(glowColor);
        if (intensity > 0.7) {
            // Strong glow - bright background
            return `{${bright}-bg}${baseChar}{/${bright}-bg}`;
        }
        else if (intensity > 0.3) {
            // Medium glow - normal background
            return `{${glowColor}-bg}${baseChar}{/${glowColor}-bg}`;
        }
        else {
            // Minimal glow - just use base
            return baseChar;
        }
    }
    /**
     * Show pause menu with live stats
     */
    showPauseMenu() {
        const state = this.engine.getState();
        const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
        const mins = Math.floor(elapsed / 60);
        const secs = (elapsed % 60).toString().padStart(2, '0');
        const pps = this.getPPS(state);
        const finErr = this.engine.getFinesseErrors();
        const secMs = state.sectionTime ?? 0;
        const secSecs = Math.floor(secMs / 1000);
        const secMins = Math.floor(secSecs / 60);
        const secS = (secSecs % 60).toString().padStart(2, '0');
        const content = `\n{bold}{yellow-fg}PAUSED{/yellow-fg}{/bold}\n\n` +
            `{white-fg}Time:    ${mins}:${secs}{/white-fg}\n` +
            `{cyan-fg}Grade:   ${state.grade}{/cyan-fg}\n` +
            `{white-fg}Level:   ${state.level}{/white-fg}\n` +
            `{green-fg}PPS:     ${pps}{/green-fg}\n` +
            `{white-fg}Section: ${secMins}:${secS}{/white-fg}\n` +
            `{${finErr === 0 ? 'green' : 'red'}-fg}Finesse: ${finErr} err{/${finErr === 0 ? 'green' : 'red'}-fg}\n\n` +
            `{gray-fg}P=resume  ESC/Q=quit{/gray-fg}`;
        const pauseBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 32,
            height: 14,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            align: 'left',
            content,
            tags: true,
            fixed: true,
        });
        this.screen.render();
        const handler = (ch, key) => {
            if (!key)
                return;
            if (key.name === 'p') {
                this.screen.removeListener('keypress', handler);
                pauseBox.destroy();
                this.engine.resume();
                this.screen.render();
            }
            else if (key.name === 'escape' || key.name === 'q') {
                this.screen.removeListener('keypress', handler);
                pauseBox.destroy();
                this.stoppedEarly = true;
                this.running = false;
                this.screen.render();
            }
        };
        this.screen.on('keypress', handler);
    }
    /**
     * Show game over screen
     */
    async showGameOver() {
        const result = this.engine.getResult();
        const gameState = this.engine.getState();
        let gameOverTitle = '{bold}{red-fg}GAME OVER{/red-fg}{/bold}';
        let gameOverColor = 'red';
        // Dig mode complete
        if (gameState.mode === 'dig' && gameState.status === 'complete') {
            gameOverTitle = '{bold}{green-fg}DIG COMPLETE!{/green-fg}{/bold}';
            gameOverColor = 'green';
        }
        else if (gameState.mode === 'ultra' && gameState.status === 'complete') {
            // Ultra mode time-up
            gameOverTitle = '{bold}{cyan-fg}TIME UP!{/cyan-fg}{/bold}';
            gameOverColor = 'cyan';
        }
        else if (result.grade === 'GMM' || result.grade === 'GM') {
            gameOverTitle = result.grade === 'GMM'
                ? '{bold}{yellow-fg}GRAND MASTER MARU!{/yellow-fg}{/bold}'
                : '{bold}{yellow-fg}GRAND MASTER!{/yellow-fg}{/bold}';
            gameOverColor = 'yellow';
            this.sounds.playVoice('bravo');
        }
        // Clear all game UI to prevent border overlap
        this.cleanup();
        // Full-screen black background
        const bg = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            style: { bg: 'black' },
        });
        const gameOverBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 40,
            height: 14,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: gameOverColor } },
            align: 'center',
            valign: 'middle',
            content: `${gameOverTitle}\n\n` +
                `Grade:  {yellow-fg}${result.grade}{/yellow-fg}\n` +
                `Level:  ${result.level}\n` +
                `Lines:  ${result.lines}\n` +
                `Score:  ${result.score.toLocaleString()}\n` +
                `Combo:  ${result.combo}x\n\n` +
                '{gray-fg}Press any key to continue{/gray-fg}',
            fixed: true,
        });
        this.screen.render();
        this.sounds.playSfx('game_over');
        this.sounds.stopMusic();
        this.sounds.playMusic('game_over', false);
        await this.waitForKey();
        gameOverBox.destroy();
        bg.destroy();
    }
    waitForKey() {
        return new Promise((resolve) => {
            const handler = () => {
                this.screen.removeListener('keypress', handler);
                resolve();
            };
            this.screen.on('keypress', handler);
        });
    }
    cleanup() {
        if (this.cleanedUp)
            return; // Prevent double cleanup
        this.cleanedUp = true;
        if (this.input) {
            this.input.reset();
        }
        if (this.escHandler) {
            this.screen.removeListener('keypress', this.escHandler);
            this.escHandler = null;
        }
        this.sounds.stopMusic();
        this.boardBox?.destroy();
        this.nextBox?.destroy();
        this.holdBox?.destroy();
        this.statsBox?.destroy();
        this.gradeBox?.destroy();
        this.sectionBox?.destroy();
        this.footerBox?.destroy();
        this.outerFrame?.destroy();
    }
    /**
     * Stop the game loop early without showing game over (for attract mode exit)
     */
    stop() {
        if (!this.running)
            return;
        this.stoppedEarly = true; // Prevent showGameOver from being called
        this.running = false;
        // Game loop will detect running=false and call cleanup() on next tick
        // Call cleanup immediately for faster resource release
        this.cleanup();
    }
}
exports.GameScreen = GameScreen;
//# sourceMappingURL=game-screen.js.map