"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const dockable_1 = require("./dockable");
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
    sounds, state) {
        this.screen = screen;
        this.engine = engine;
        this.input = input;
        this.sounds = sounds;
        this.state = state;
        this.running = false;
        this.lastRender = 0;
        this.RENDER_FPS = 20; // Reduced for BBS efficiency
        this.RENDER_INTERVAL = 1000 / this.RENDER_FPS;
        // Track previous state for detecting changes
        this.lastGrade = '9';
        this.lastLines = 0;
        this.lastLevel = 0;
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
     * Run the game loop
     */
    async run() {
        return new Promise((resolve) => {
            // Setup UI
            this.setupUI();
            // Setup input handlers
            this.setupInput();
            // Start game
            this.engine.start();
            this.running = true;
            this.sounds.playMusic('master_1', true);
            // Game loop using setInterval
            let lastUpdate = Date.now();
            const gameLoop = setInterval(() => {
                if (!this.running) {
                    clearInterval(gameLoop);
                    this.showGameOver().then(() => {
                        this.cleanup();
                        resolve();
                    });
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
                // Check for game over
                if (gameState.status === 'gameover') {
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
            this.particles.spawn('gradeUp', 40, 5);
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
                this.particles.spawn('tetris', 12, 12);
                this.shaker.shake('tetris');
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice'); // Voice callout
            }
            else if (gameState.lastTSpin === 'mini') {
                // T-Spin Mini
                this.particles.spawn('lineClear', 12, 12);
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('rotate');
            }
            else if (linesCleared === 4) {
                // Tetris!
                this.particles.spawn('tetris', 12, 12);
                this.shaker.shake('tetris');
                this.animations.lineClearFlash([], 4);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice'); // Voice callout
            }
            else if (linesCleared === 3) {
                // Triple
                this.particles.spawn('lineClear', 12, 12);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('triple'); // Voice callout
            }
            else if (linesCleared === 2) {
                // Double
                this.particles.spawn('lineClear', 12, 12);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('double'); // Voice callout
            }
            else if (linesCleared >= 1) {
                // Single line clear (no voice)
                this.particles.spawn('lineClear', 12, 12);
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
        this.lastHold = gameState.holdPiece;
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
            this.particles.spawn('combo', 40, 12);
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
            this.particles.spawn('cool', 40, 12);
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
        this.nextBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 1,
            left: 25,
            width: 14,
            height: 12,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' NEXT ',
            persistenceKey: 'grandmaster.game.next',
        });
        this.holdBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 14,
            left: 25,
            width: 14,
            height: 6,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'magenta' } },
            label: ' HOLD ',
            persistenceKey: 'grandmaster.game.hold',
        });
        this.gradeBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 1,
            left: 38,
            width: 15,
            height: 7,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            label: ' GRADE ',
            persistenceKey: 'grandmaster.game.grade',
        });
        this.statsBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 9,
            left: 38,
            width: 15,
            height: 8,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'green' } },
            label: ' STATS ',
            persistenceKey: 'grandmaster.game.stats',
        });
        this.sectionBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 17,
            left: 38,
            width: 15,
            height: 6,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' SECTION ',
            persistenceKey: 'grandmaster.game.section',
        });
        (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            align: 'center',
            style: { bg: 'black', fg: 'gray' },
            content: '←→ Move | Z/X Rotate | ↓ Soft | Enter Hard | C Hold | ESC Pause',
        });
        // Create effectsBox LAST so it renders on top of all other elements
        this.effectsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            style: { fg: 'white', bg: 'transparent' },
            clickable: false,
            mouse: false,
            tags: true,
        });
    }
    /**
     * Setup input handlers
     */
    setupInput() {
        // Skip input setup for attract mode (AI-controlled)
        if (!this.input)
            return;
        this.input.on('left', () => {
            if (this.engine.move(-1)) {
                this.sounds.playSfx('move');
            }
        });
        this.input.on('right', () => {
            if (this.engine.move(1)) {
                this.sounds.playSfx('move');
            }
        });
        this.input.on('rotate_cw', () => {
            if (this.engine.rotate(1)) {
                this.sounds.playSfx('rotate');
            }
            else {
                if (this.engine.setIRS(1)) {
                    this.sounds.playSfx('pre_rotate');
                }
            }
        });
        this.input.on('rotate_ccw', () => {
            if (this.engine.rotate(-1)) {
                this.sounds.playSfx('rotate');
            }
            else {
                if (this.engine.setIRS(-1)) {
                    this.sounds.playSfx('pre_rotate');
                }
            }
        });
        this.input.on('soft_drop', () => {
            if (this.engine.softDrop()) {
                this.sounds.playSfx('move');
            }
        });
        this.input.on('hard_drop', () => {
            this.addHardDropTrail();
            this.engine.hardDrop();
            this.sounds.playSfx('hard_drop');
        });
        this.input.on('hold', () => {
            if (this.engine.hold()) {
                this.sounds.playSfx('hold');
            }
            else {
                if (this.engine.setIHS()) {
                    this.sounds.playSfx('pre_hold');
                }
            }
        });
        this.input.on('pause', () => {
            if (this.engine.getState().status === 'playing') {
                this.engine.pause();
                this.showPauseMenu();
            }
        });
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
        if (boardHash !== this.lastBoardHash || this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0 || isShaking) {
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
        if (state.section !== this.lastSection || state.sectionTime !== 0) {
            this.renderSectionInfo(state);
            this.lastSection = state.section;
            needsRender = true;
        }
        // Render effects overlay if any effects active
        if (this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0) {
            this.renderEffects();
            needsRender = true;
        }
        // Only render to screen if content changed
        if (needsRender) {
            this.screen.render();
        }
    }
    getBoardHash(state) {
        const piece = state.currentPiece ? `${state.currentPiece.x},${state.currentPiece.y},${state.currentPiece.rotation}` : 'null';
        // Simplified hash for board
        return `${piece}-${state.lines}-${this.shineTimer}`;
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
            `  Grav:  ${gravDisplay}G`;
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
     * Render visual effects overlay
     */
    renderEffects() {
        let effectsContent = '';
        const screenWidth = this.screen.width;
        const screenHeight = this.screen.height;
        // Render particles
        const particles = this.particles.getRenderableParticles();
        for (const particle of particles) {
            const x = Math.floor(particle.x);
            const y = Math.floor(particle.y);
            // Only render if on screen
            if (x >= 0 && x < screenWidth && y >= 0 && y < screenHeight) {
                const alpha = particle.alpha;
                const color = particle.color;
                const char = particle.char;
                // Fade particle based on alpha
                if (alpha > 0.7) {
                    effectsContent += `\x1b[${y};${x}H{${color}-fg}${char}{/${color}-fg}`;
                }
                else if (alpha > 0.3) {
                    effectsContent += `\x1b[${y};${x}H{gray-fg}${char}{/gray-fg}`;
                }
            }
        }
        // Render active animations
        const animations = this.animations.getAnimations();
        for (const anim of animations) {
            if (anim.type === 'gradeUp') {
                const rendered = animations_1.AnimationRenderer.renderGradeUp(anim);
                // Center grade up animation on screen
                // "GRADE UP!" is ~9 chars, center at screenWidth/2
                const centerX = Math.floor(screenWidth / 2) - 5;
                effectsContent += `\x1b[${5};${centerX}H${rendered}`;
            }
            else if (anim.type === 'cool' || anim.type === 'regret') {
                const rendered = animations_1.AnimationRenderer.renderSectionResult(anim);
                // Center section result on screen
                const text = anim.type === 'cool' ? 'COOL!' : 'REGRET';
                const centerX = Math.floor(screenWidth / 2) - Math.floor(text.length / 2);
                effectsContent += `\x1b[${3};${centerX}H${rendered}`;
            }
            else if (anim.type === 'comboCounter') {
                // Render combo counter animation
                const data = anim.data;
                const combo = data.combo;
                const milestone = data.milestone;
                const progress = anim.elapsed / anim.duration;
                // Flash and fade effect
                if (progress < 0.8) {
                    const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : 'cyan';
                    const scale = progress < 0.2 ? 'bold' : '';
                    const comboText = `${combo} COMBO!`;
                    const centerX = Math.floor(screenWidth / 2) - Math.floor(comboText.length / 2);
                    effectsContent += `\x1b[${8};${centerX}H{${color}-fg}${scale ? '{bold}' : ''}${comboText}${scale ? '{/bold}' : ''}{/${color}-fg}`;
                }
            }
            else if (anim.type === 'tSpin') {
                // Render T-Spin flash
                const data = anim.data;
                const progress = anim.elapsed / anim.duration;
                if (progress < 0.6) {
                    const tspinText = 'T-SPIN!';
                    const centerX = Math.floor(screenWidth / 2) - Math.floor(tspinText.length / 2);
                    effectsContent += `\x1b[${10};${centerX}H{magenta-fg}{bold}${tspinText}{/bold}{/magenta-fg}`;
                }
            }
            else if (anim.type === 'lockGlow') {
                const intensity = animations_1.AnimationRenderer.getLockGlowIntensity(anim);
                if (intensity > 0.3) {
                    const data = anim.data;
                    for (const cell of data.cells) {
                        if (cell.y < 4)
                            continue;
                        const x = 4 + cell.x * 2;
                        const y = cell.y + 1;
                        if (intensity > 0.7) {
                            effectsContent += `\x1b[${y};${x}H{white-fg}{bold}██{/bold}{/white-fg}`;
                        }
                        else {
                            effectsContent += `\x1b[${y};${x}H{white-fg}░░{/white-fg}`;
                        }
                    }
                }
            }
        }
        // Render floating texts
        const floatingTexts = this.animations.getFloatingTexts();
        if (floatingTexts.length > 0) {
            console.log(`[EFFECTS] Rendering ${floatingTexts.length} floating texts:`, floatingTexts.map(t => ({ text: t.text, x: t.x, y: t.y, mode: t.mode })));
        }
        for (const text of floatingTexts) {
            const progress = text.timer / text.maxTimer;
            // Calculate alpha (fade out frames 80-100)
            let alpha = 1.0;
            if (text.timer > 80) {
                alpha = 1.0 - ((text.timer - 80) / 20);
            }
            // Filter by mode
            if (text.mode === 'offboard' && text.x >= 0 && text.x < 10) {
                continue; // Don't render if on playfield in offboard mode
            }
            // Calculate screen position (convert board coords to screen coords)
            // Board box is at blessed position (left:2, top:1) = ANSI (column 3, row 2) in 1-indexed coords
            // Board content inside border starts at blessed (3, 2) = ANSI (column 4, row 3) in 1-indexed coords
            // Each board cell is 2 chars wide
            // Board Y coordinates: 4-23 visible (0-3 are vanish zone)
            // ANSI uses 1-indexed coordinates, so add 1 to blessed positions
            const boardContentLeft = 4; // ANSI 1-indexed: left(3) + border(1)
            const boardContentTop = 3; // ANSI 1-indexed: top(2) + border(1)
            const screenX = boardContentLeft + Math.floor(text.x * 2);
            const screenY = boardContentTop + Math.floor(text.y - 4); // y=4 is first visible row, maps to ANSI row 3
            // Apply alpha via color (blessed limitation - can't do true alpha)
            const color = alpha > 0.5 ? text.color : 'gray';
            // Render multi-line text
            for (let i = 0; i < text.text.length; i++) {
                const line = text.text[i];
                const y = screenY + i;
                if (y >= 0 && y < screenHeight) {
                    effectsContent += `\x1b[${y};${screenX}H{${color}-fg}${line}{/${color}-fg}`;
                }
            }
        }
        if (this.effectsBox) {
            this.effectsBox.setContent(effectsContent);
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
        this.hardDropTrails = this.hardDropTrails.filter(trail => now - trail.createdAt < 160);
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
                        char = '{gray-fg}░░{/gray-fg}';
                    }
                }
                if (char === '  ' && !cell.filled && !isMasterRoll) {
                    const trail = this.hardDropTrails.find(t => t.x === x && t.y === y);
                    if (trail) {
                        const age = now - trail.createdAt;
                        const fade = Math.max(0, 1 - (age / 160));
                        const strength = trail.strength * fade;
                        char = this.getHardDropTrailChar(trail.color, strength);
                    }
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
            return `{white-fg}[ ]{/white-fg}`;
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
        const now = Date.now();
        const maxSteps = Math.max(1, dropDistance);
        for (let py = 0; py < shape.length; py++) {
            for (let px = 0; px < shape[py].length; px++) {
                if (!shape[py][px])
                    continue;
                const startX = currentPiece.x + px;
                for (let step = 0; step < dropDistance; step++) {
                    const y = currentPiece.y + step + py;
                    if (y < 4 || y >= 24)
                        continue;
                    const strength = (step + 1) / maxSteps;
                    this.hardDropTrails.push({
                        x: startX,
                        y,
                        color,
                        strength,
                        createdAt: now,
                    });
                }
            }
        }
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
    getHardDropTrailChar(color, strength) {
        if (strength > 0.66) {
            const bright = this.getBrightColor(color);
            return `{${bright}-bg}  {/${bright}-bg}`;
        }
        if (strength > 0.33) {
            return `{${color}-bg}  {/${color}-bg}`;
        }
        return `{${color}-fg}░░{/${color}-fg}`;
    }
    getBrightColor(color) {
        const map = {
            red: 'lightred', green: 'lightgreen', yellow: 'lightyellow', blue: 'lightblue',
            magenta: 'lightmagenta', cyan: 'lightcyan', white: 'lightwhite', orange: 'yellow'
        };
        return map[color] || color;
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
        const brightColor = this.getBrightColor(glowColor);
        if (intensity > 0.7) {
            // Strong glow - bright background
            return `{${brightColor}-bg}${baseChar}{/${brightColor}-bg}`;
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
     * Show pause menu
     */
    showPauseMenu() {
        const pauseBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 30,
            height: 8,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            align: 'center',
            content: '\n{bold}PAUSED{/bold}\n\nPress ESC to resume\nPress Q to quit',
            persistenceKey: 'grandmaster.game.pause',
        });
        this.screen.render();
        const resumeHandler = () => {
            this.screen.removeListener('keypress', resumeHandler);
            pauseBox.destroy();
            this.engine.resume();
            this.screen.render();
        };
        this.screen.on('keypress', (ch, key) => {
            if (key.name === 'escape') {
                resumeHandler();
            }
            else if (key.name === 'q' || key.name === 'Q') {
                this.running = false;
                resumeHandler();
            }
        });
    }
    /**
     * Show game over screen
     */
    async showGameOver() {
        const result = this.engine.getResult();
        let gameOverTitle = '{bold}{red-fg}GAME OVER{/red-fg}{/bold}';
        let gameOverColor = 'red';
        if (result.grade === 'GMM' || result.grade === 'GM') {
            gameOverTitle = result.grade === 'GMM'
                ? '{bold}{yellow-fg}GRAND MASTER MARU!{/yellow-fg}{/bold}'
                : '{bold}{yellow-fg}GRAND MASTER!{/yellow-fg}{/bold}';
            gameOverColor = 'yellow';
            this.sounds.playVoice('bravo');
        }
        const gameOverBox = (0, dockable_1.createDockable)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 40,
            height: 14,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: gameOverColor } },
            align: 'center',
            content: `\n${gameOverTitle}\n\n` +
                `Grade:  {yellow-fg}${result.grade}{/yellow-fg}\n` +
                `Level:  ${result.level}\n` +
                `Lines:  ${result.lines}\n` +
                `Score:  ${result.score.toLocaleString()}\n` +
                `Combo:  ${result.combo}x\n\n` +
                '{gray-fg}Press any key to continue{/gray-fg}',
            persistenceKey: 'grandmaster.game.over',
        });
        this.screen.render();
        this.sounds.playSfx('game_over');
        this.sounds.stopMusic(); // Stop current music before playing game over music
        this.sounds.playMusic('game_over', false);
        await this.waitForKey();
        gameOverBox.destroy();
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
        if (this.input) {
            this.input.reset();
        }
        this.sounds.stopMusic();
        this.boardBox?.destroy();
        this.nextBox?.destroy();
        this.holdBox?.destroy();
        this.statsBox?.destroy();
        this.gradeBox?.destroy();
        this.sectionBox?.destroy();
        this.effectsBox?.destroy();
    }
}
exports.GameScreen = GameScreen;
//# sourceMappingURL=game-screen.js.map