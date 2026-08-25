"use strict";
/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent board, garbage strip, hold box,
 * and full visual-effect parity with game-screen.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersusScreen = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const minimap_1 = require("./minimap");
const bot_player_1 = require("../ai/bot-player");
const board_1 = require("../core/board");
const screen_shake_1 = require("../effects/screen-shake");
const particles_1 = require("../effects/particles");
const animations_1 = require("../effects/animations");
const block_glow_1 = require("../effects/block-glow");
const line_clear_animation_1 = require("../effects/line-clear-animation");
/**
 * Versus Screen
 *
 * Extends game screen with multiplayer features (online or CPU battle).
 * Full visual-effect parity with GameScreen (particles, shake, board overlay,
 * lock flash, grade-up, combo, section COOL/REGRET, hold piece).
 */
class VersusScreen {
    constructor(screen, engine, inputHandler, sounds, state, network, attackManager, botOrAI, // number = old botDifficulty, object = VersusAI controller
    sessionRef) {
        this.botPlayer = null;
        this.versusAI = null; // VersusAI controller for CPU Battle mode
        this.voiceStates = new Map();
        this.localMuted = false;
        this.sessionSocket = null;
        this.voiceSpeakingHandler = null;
        this.lastOpponentCount = -1; // tracks layout switch
        /** Match outcome, readable after run() resolves. */
        this.victory = false;
        /** Lobby "Garbage Lines" setting; false disconnects the attack router. */
        this.garbageEnabled = true;
        /** True once at least one networked opponent has been seen (win detection). */
        this.sawNetworkOpponent = false;
        // Board overlay compositor for inline effects (same as game-screen)
        this.boardOverlay = [];
        this.running = false;
        this.unsubscribers = [];
        // Track previous state for detecting changes
        this.lastGrade = '9';
        this.lastLines = 0;
        this.lastLevel = 0;
        this.lastSection = 0;
        this.lastPieceExists = false;
        this.lastScore = -1;
        this.lastCombo = -1;
        this.lastHold = null;
        this.lastBoardHash = '';
        // Animation state
        this.gradeAnimProgress = 0;
        this.gradeAnimDirection = 1;
        this.lastComboMilestone = 0;
        this.twentyGFlashTimer = 0;
        this.rainbowTimer = 0;
        this.lastRainbowUpdate = 0;
        this.screen = screen;
        this.engine = engine;
        this.inputHandler = inputHandler;
        this.sounds = sounds;
        this.state = state;
        this.network = network;
        this.attackManager = attackManager;
        this.sessionSocket = sessionRef?.bbsSession?.socket ?? null;
        this.minimapRenderer = new minimap_1.MinimapRenderer({ height: 10, compact: true });
        this.opponentTracker = new minimap_1.OpponentTracker();
        // Check if AI controller was passed (new implementation)
        if (botOrAI && typeof botOrAI === 'object') {
            this.versusAI = botOrAI;
        }
        // Legacy: Initialize bot player if difficulty provided (old single-bot mode)
        else if (typeof botOrAI === 'number') {
            this.botPlayer = new bot_player_1.BotPlayer(botOrAI);
        }
        // Initialize visual effect systems
        this.shaker = new screen_shake_1.ScreenShaker();
        this.particles = new particles_1.ParticleSystem();
        this.animations = new animations_1.AnimationManager();
        this.glowManager = new block_glow_1.BlockGlowManager();
        this.clearAnimation = new line_clear_animation_1.LineClearAnimationManager();
        // Share managers with game engine
        this.engine.setAnimationManager(this.animations);
        this.engine.setGlowManager(this.glowManager);
        // Configure from settings
        this.glowManager.setEnabled(state.settings.blockGlow);
        this.glowManager.setIntensityMultiplier(state.settings.glowIntensity);
        this.clearAnimation.setEnabled(state.settings.clearStyle !== 'instant');
        this.setupUI();
        if (this.network) {
            this.setupNetworkListeners();
        }
        this.setupAttackRouting();
    }
    /** Lobby "Garbage Lines" toggle. Call before run(). */
    setGarbageEnabled(enabled) {
        this.garbageEnabled = enabled;
    }
    /**
     * The attack ROUTER - the missing layer this whole feature dead-ended on.
     *
     * Every engine (human and AI) has a complete AttackManager: line clears
     * produce attacks via onAttackSent, and queued garbage is applied to the
     * board on lock. But nothing ever CONNECTED them: the human's only
     * onAttackSent listener played a sound (and in CPU battle wasn't even
     * registered, since setupNetworkListeners was gated on `this.network`),
     * receiveAttack() had zero callers repo-wide, and the AI engines had no
     * attack managers at all. Result: "No incoming attack" was a permanent
     * state and the lobby's garbage setting described nothing.
     */
    setupAttackRouting() {
        // Human attacks out
        this.attackManager.onAttackSentCallback((lines, _type) => {
            this.sounds.playSfx('attack');
            if (!this.garbageEnabled)
                return;
            if (this.network) {
                // Networked: broadcast; the broker fans it out to lobby members and
                // receivers filter their own id.
                this.network.sendAttack({
                    from: this.localAttackId(),
                    to: null,
                    lines,
                    type: lines >= 4 ? 'tetris' : lines === 3 ? 'triple' : lines === 2 ? 'double' : 'single',
                    combo: 0,
                    backToBack: false,
                });
            }
            else if (this.versusAI) {
                // CPU battle: random living bot takes the hit.
                const living = this.versusAI.getOpponents().filter((o) => o.alive);
                if (living.length > 0) {
                    const target = living[Math.floor(Math.random() * living.length)];
                    target.attackManager.receiveAttack('You', lines);
                }
            }
        });
        // Feedback when garbage lands in the human's queue (was previously only
        // registered in the networked path).
        this.attackManager.onGarbageReceivedCallback((_lines, _sender) => {
            this.sounds.playSfx('garbage');
            this.shaker.shake('garbageReceive');
        });
        // AI attacks out (CPU battle): each bot targets a random living player -
        // the human or another bot - standard free-for-all behaviour.
        if (this.versusAI) {
            for (const opp of this.versusAI.getOpponents()) {
                opp.attackManager.onAttackSentCallback((lines) => {
                    if (!this.garbageEnabled)
                        return;
                    const others = this.versusAI.getOpponents().filter((o) => o.alive && o.id !== opp.id);
                    // Human is one target slot among the others.
                    const slot = Math.floor(Math.random() * (others.length + 1));
                    if (slot === others.length) {
                        this.attackManager.receiveAttack(opp.name, lines);
                    }
                    else {
                        others[slot].attackManager.receiveAttack(opp.name, lines);
                    }
                });
            }
        }
    }
    /** Stable id used as `from` in outgoing network attacks. */
    localAttackId() {
        return this.network?.getLocalPlayerId?.() ?? 'local';
    }
    /**
     * Setup UI layout — 80x24 terminal
     *
     * Col  0-21 : player board  (22w, 22h, top=1)
     * Col 22-33 : NEXT (12w,12h,top=1) + HOLD (12w,10h,top=13)
     * Col 34-36 : garbage strip (3w, 22h, top=1)
     * Col 37-58 : opponent board (22w, 22h, top=1)
     * Col 59-79 : VS info panel  (21w, 22h, top=1)
     * Row 23    : stats bar (no border)
     *   22 + 12 + 3 + 22 + 21 = 80 ✓
     */
    setupUI() {
        // Clear screen
        this.screen.children.forEach(child => child.destroy());
        // Player board
        this.boardBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 0,
            width: 22,
            height: 22,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'white' } },
            fixed: true,
        });
        // Player NEXT queue
        this.nextBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 22,
            width: 12,
            height: 12,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' NEXT ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Player HOLD box
        this.holdBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 13,
            left: 22,
            width: 12,
            height: 10,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'magenta' } },
            label: ' HOLD ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Garbage strip
        this.garbageIndicator = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 34,
            width: 3,
            height: 22,
            border: { type: 'line' },
            style: { border: { fg: 'red' } },
            content: '',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Opponent full board
        this.opponentBoardBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 37,
            width: 22,
            height: 22,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            label: ' CPU ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // ── 1v1 right side (visible when ≤1 opponent) ──────────────────────────
        // VS info panel (21w)
        this.opponentInfoBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 59,
            width: 21,
            height: 22,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' VS ',
            content: '',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // ── Battle-royale right side (visible when >1 opponent) ──────────────
        // Minimap panel fills all remaining columns (43w: cols 37-79)
        this.minimapPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 1,
            left: 37,
            width: 43,
            height: 22,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' Opponents ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Inner container — bucket/text content rendered here via setContent()
        this.minimapContainer = (0, blessed_helpers_1.createBox)({
            parent: this.minimapPanel,
            top: 1,
            left: 1,
            width: 41,
            height: 20,
            border: 'none',
            tags: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Player stats — bottom row
        this.statsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 23,
            left: 0,
            width: 59,
            height: 1,
            border: 'none',
            content: '',
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Start in 1v1 mode (hidden minimap panel); render() will switch as needed
        this.minimapPanel.hide();
        // Voice speaking indicators
        if (this.sessionSocket) {
            this.voiceSpeakingHandler = (data) => {
                const existing = this.voiceStates.get(String(data.userId)) ?? { speaking: false, muted: false };
                this.voiceStates.set(String(data.userId), { ...existing, speaking: data.speaking });
                this.screen.render();
            };
            this.sessionSocket.on('voice:speaking', this.voiceSpeakingHandler);
            // M key toggles mic mute
            this.screen.key(['m', 'M'], () => {
                this.localMuted = !this.localMuted;
                this.sessionSocket.emit('audio:mute', { muted: this.localMuted });
                this.screen.render();
            });
        }
    }
    /**
     * Setup network event listeners
     */
    setupNetworkListeners() {
        if (!this.network)
            return;
        const unsubUpdate = this.network.onUpdate((update) => {
            if (update.alive === false) {
                this.opponentTracker.removeOpponent(update.playerId);
                return;
            }
            this.sawNetworkOpponent = true;
            this.opponentTracker.updateOpponent(update.playerId, {
                id: update.playerId,
                name: update.playerName ?? update.name ?? update.playerId,
                board: update.board,
                level: update.level,
                grade: update.grade,
                alive: true,
            });
        });
        this.unsubscribers.push(unsubUpdate);
        // Incoming attacks: feed the local garbage queue. This subscription is
        // the receive half the feature never had - game:attack reached
        // network-manager's callback set, but nothing subscribed, so garbage
        // evaporated before touching the queue.
        if (this.network) {
            const unsubAttack = this.network.onAttack((attack) => {
                if (!this.garbageEnabled)
                    return;
                if (attack.from === this.localAttackId())
                    return; // broker echoes to all members
                if (attack.to && attack.to !== this.localAttackId())
                    return;
                this.attackManager.receiveAttack(attack.from, attack.lines);
            });
            this.unsubscribers.push(unsubAttack);
        }
        // NOTE: onAttackSent / onGarbageReceived feedback now lives in
        // setupAttackRouting(), which runs for BOTH network and CPU battles.
    }
    /**
     * Run game loop
     */
    async run() {
        this.running = true;
        this.setupInput();
        await this.showCountdown();
        this.engine.start();
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
                // Update player game
                this.engine.update(deltaTime);
                this.inputHandler.update(deltaTime);
                // Update AI opponents (new CPU Battle mode)
                if (this.versusAI) {
                    this.versusAI.update(deltaTime);
                    // Update tracker every ~100 ms
                    // Sample every frame in 1v1 so the opponent's piece visibly falls.
                    // The 100ms throttle exists for battle-royale sized fields; at one
                    // opponent it just made the board update 10x a second, which is far
                    // too coarse to show a piece in flight.
                    const singleOpponent = this.versusAI.getOpponents().length <= 1;
                    if (singleOpponent || now % 100 < deltaTime) {
                        const aiOpponents = this.versusAI.getOpponents();
                        // Compute danger rank = sorted by stack height descending
                        // (tallest stack = closest to topping out = highest priority)
                        const withHeight = aiOpponents.map((opp) => {
                            const state = opp.engine?.getState?.();
                            const board = state?.board;
                            let stackHeight = 0;
                            if (board) {
                                for (let y = 0; y < board.height; y++) {
                                    if (board.grid[y]?.some((c) => c.filled)) {
                                        stackHeight = board.height - y;
                                        break;
                                    }
                                }
                            }
                            return { opp, state, stackHeight };
                        });
                        // Sort by danger descending, assign rank 1 = most dangerous
                        withHeight.sort((a, b) => b.stackHeight - a.stackHeight);
                        for (let i = 0; i < withHeight.length; i++) {
                            const { opp, state } = withHeight[i];
                            if (!opp.alive) {
                                // Immediately remove dead players from the grid
                                this.opponentTracker.removeOpponent(opp.id);
                                continue;
                            }
                            // Absolute cells of the piece currently in flight. `board` only
                            // ever holds LOCKED cells, so without this the opponent view
                            // cannot show a piece falling - it appears the moment it locks.
                            const oppState = opp.engine?.getState?.();
                            let pieceCells;
                            const cp = oppState?.currentPiece;
                            if (cp) {
                                const shape = opp.engine?.pieceManager?.getShape?.(cp.type, cp.rotation);
                                if (shape) {
                                    pieceCells = [];
                                    for (let r = 0; r < shape.length; r++) {
                                        for (let c = 0; c < shape[r].length; c++) {
                                            if (shape[r][c]) {
                                                pieceCells.push({ x: cp.x + c, y: cp.y + r, type: cp.type });
                                            }
                                        }
                                    }
                                }
                            }
                            this.opponentTracker.updateOpponent(opp.id, {
                                name: opp.name,
                                board: oppState?.board ?? state?.board,
                                level: state?.level ?? 0,
                                grade: state?.grade ?? '9',
                                alive: true,
                                rank: i + 1,
                                pieceCells,
                            });
                        }
                    }
                }
                // Legacy: Update bot AI
                else if (this.botPlayer) {
                    this.botPlayer.update(deltaTime, this.engine);
                }
                // Send state to opponents (online multiplayer only)
                if (this.network && now % 100 < deltaTime) {
                    this.network.sendUpdate(this.engine.getState());
                }
                // Get current state once for all subsystem updates
                const gameState = this.engine.getState();
                // Update visual effects
                this.shaker.update(deltaTime);
                this.particles.update(deltaTime);
                this.animations.update(deltaTime);
                this.glowManager.update(deltaTime);
                this.clearAnimation.update(deltaTime);
                this.updateGradeAnimation(deltaTime);
                // Update 20G flash timer
                if (gameState.gravity >= 20) {
                    this.twentyGFlashTimer += deltaTime;
                }
                else {
                    this.twentyGFlashTimer = 0;
                }
                // Check for game events and trigger effects
                this.checkGameEvents();
                // Render
                this.render();
                // Victory: every AI opponent topped out (CPU battle)...
                const cpuVictory = this.versusAI
                    ? this.versusAI.getOpponents().length > 0 && this.versusAI.allDead()
                    : false;
                // ...or every networked opponent reported alive:false after we saw
                // at least one (versusAI.allDead() previously had zero callers -
                // outliving all bots never ended the match, so the player could
                // only ever LOSE a CPU battle).
                const netVictory = !!this.network && this.sawNetworkOpponent
                    && this.opponentTracker.getAliveOpponents().length === 0;
                if (cpuVictory || netVictory) {
                    this.victory = true;
                    this.running = false;
                    clearInterval(updateInterval);
                    void this.showMatchResult(true).then(resolve);
                    return;
                }
                // Check for game over
                if (gameState.status === 'gameover' || gameState.status === 'complete') {
                    this.running = false;
                    clearInterval(updateInterval);
                    // Tell the opponent we topped out - sendUpdate never carried a
                    // death flag, so the survivor previously never learned the match
                    // was over.
                    if (this.network) {
                        this.network.sendUpdate(gameState, false);
                    }
                    void this.showMatchResult(false).then(resolve);
                    return;
                }
            }, 16); // ~60 FPS
        });
    }
    /**
     * Brief WIN/LOSE overlay before resolving back to the menu.
     */
    async showMatchResult(won) {
        try {
            this.sounds.playSfx(won ? 'game_clear' : 'game_over');
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 9,
                left: 25,
                width: 30,
                height: 5,
                border: { type: 'line' },
                style: { border: { fg: won ? 'green' : 'red' } },
                content: won
                    ? '{center}{bold}{green-fg}YOU WIN!{/green-fg}{/bold}{/center}\n{center}All opponents eliminated{/center}'
                    : '{center}{bold}{red-fg}GAME OVER{/red-fg}{/bold}{/center}\n{center}Better luck next time{/center}',
            });
            this.screen.render();
            await new Promise(r => setTimeout(r, 2500));
            box.destroy();
        }
        catch {
            // Overlay is cosmetic; never block match end on it.
        }
    }
    /**
     * Setup input handlers
     */
    setupInput() {
        this.inputHandler.on('left', () => this.engine.move(-1));
        this.inputHandler.on('right', () => this.engine.move(1));
        this.inputHandler.on('rotate_cw', () => this.engine.rotate(1));
        this.inputHandler.on('rotate_ccw', () => this.engine.rotate(-1));
        this.inputHandler.on('soft_drop', () => this.engine.softDrop());
        this.inputHandler.on('hard_drop', () => this.engine.hardDrop());
        this.inputHandler.on('hold', () => this.engine.hold());
        this.inputHandler.on('pause', () => this.togglePause());
    }
    /**
     * Show countdown (3, 2, 1, GO!)
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
     * Check for game events and trigger visual effects
     * Ported directly from game-screen.ts checkGameEvents().
     */
    checkGameEvents() {
        const gameState = this.engine.getState();
        // Level change
        if (gameState.level > this.lastLevel) {
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
        // Grade change
        if (gameState.grade !== this.lastGrade) {
            this.animations.gradeUp(this.lastGrade, gameState.grade, 40, 5);
            this.particles.spawn('gradeUp', 5, 7);
            this.shaker.shake('lineClear');
            this.sounds.playSfx('grade_up');
            this.lastGrade = gameState.grade;
        }
        // Line clear
        if (gameState.lines > this.lastLines) {
            const linesCleared = gameState.lines - this.lastLines;
            if (gameState.lastTSpin === 'full') {
                this.particles.spawn('tetris', 5, 14);
                this.shaker.shake('tetris');
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice');
            }
            else if (gameState.lastTSpin === 'mini') {
                this.particles.spawn('lineClear', 5, 14);
                this.animations.tSpin(12, 12);
                this.sounds.playSfx('rotate');
            }
            else if (linesCleared === 4) {
                this.particles.spawn('tetris', 5, 14);
                this.shaker.shake('tetris');
                this.animations.lineClearFlash([], 4);
                this.sounds.playSfx('tetris');
                this.sounds.playVoice('tetris_voice');
            }
            else if (linesCleared === 3) {
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('triple');
            }
            else if (linesCleared === 2) {
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
                this.sounds.playVoice('double');
            }
            else if (linesCleared >= 1) {
                this.particles.spawn('lineClear', 5, 14);
                this.shaker.shake('lineClear');
                this.animations.lineClearFlash([], linesCleared);
                this.sounds.playSfx('line_clear');
            }
            this.lastLines = gameState.lines;
        }
        // Combo milestones
        const combo = gameState.combo;
        const milestone = Math.floor(combo / 5) * 5;
        if (combo > 0 && milestone > this.lastComboMilestone && milestone >= 5) {
            this.triggerComboAnimation(combo, milestone);
            this.lastComboMilestone = milestone;
        }
        if (combo === 0)
            this.lastComboMilestone = 0;
        // Recently awarded medals
        const recentMedals = this.engine.getRecentMedals();
        if (recentMedals.length > 0) {
            for (const medal of recentMedals) {
                this.triggerMedalAnimation(medal);
            }
            this.engine.clearRecentMedals();
        }
        // Section completion
        if (gameState.section > this.lastSection) {
            const result = gameState.lastSectionResult;
            if (result) {
                this.handleSectionComplete(this.lastSection, result);
            }
            this.lastSection = gameState.section;
        }
        // Piece spawn (null -> non-null)
        if (gameState.currentPiece && !this.lastPieceExists) {
            this.sounds.playSfx(this.getSpawnSfx(gameState.currentPiece.type));
            // IRS visual/audio feedback
            if (gameState.currentPiece.rotation !== 0) {
                this.animations.tSpin(gameState.currentPiece.x + 1, gameState.currentPiece.y + 1);
                this.sounds.playSfx('pre_rotate');
            }
        }
        // IHS visual feedback
        if (!gameState.canHold && gameState.holdPiece && this.lastHold !== gameState.holdPiece && !this.lastPieceExists) {
            this.sounds.playSfx('pre_hold');
        }
        // Piece lock (non-null -> null)
        if (!gameState.currentPiece && this.lastPieceExists) {
            this.triggerLockFlash();
        }
        this.lastPieceExists = gameState.currentPiece !== null;
    }
    /**
     * Trigger medal award animation
     */
    triggerMedalAnimation(medal) {
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
            S: 'spawn_s', T: 'spawn_t', Z: 'spawn_z',
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
            this.particles.spawn('combo', 5, 14);
        this.animations.comboCounter(combo, milestone);
        if (milestone >= 15) {
            this.sounds.playSfx('tetris');
            this.sounds.playVoice('excellent');
        }
        else if (milestone >= 10) {
            this.sounds.playSfx('grade_up');
            this.sounds.playVoice('combo');
        }
        else if (milestone >= 5) {
            this.sounds.playVoice('combo');
        }
    }
    /**
     * Handle section completion
     */
    handleSectionComplete(section, result) {
        if (result === 'COOL') {
            this.animations.cool(section);
            this.sounds.playSfx('section_cool');
            this.sounds.playVoice('cool');
            this.particles.spawn('cool', 5, 14);
        }
        else if (result === 'REGRET') {
            this.animations.regret(section);
            this.sounds.playSfx('section_regret');
            this.sounds.playVoice('regret');
        }
    }
    /**
     * Update grade display pulse animation
     */
    updateGradeAnimation(deltaTime) {
        const PULSE_SPEED = 0.001;
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
     * Render game state — all effects applied inline
     */
    render() {
        const gameState = this.engine.getState();
        // Build board overlay (particles, animations, floating text, lock glow)
        if (this.particles.getRenderableParticles().length > 0 ||
            this.animations.getAnimations().length > 0 ||
            this.animations.getFloatingTexts().length > 0) {
            this.buildBoardOverlay();
        }
        else {
            this.boardOverlay = [];
        }
        // Render board with shake and overlay
        const isShaking = this.shaker.isShaking();
        if (isShaking) {
            const offset = this.shaker.getOffset();
            this.boardBox.top = 1 + offset.y;
            this.boardBox.left = 0 + offset.x;
        }
        else {
            this.boardBox.top = 1;
            this.boardBox.left = 0;
        }
        this.renderBoard(gameState);
        // Render next queue
        this.renderNextQueue(gameState.nextQueue ?? []);
        // Render hold piece
        this.renderHold(gameState);
        // Render garbage strip
        const pending = this.attackManager.getPendingGarbage();
        this.renderGarbage(pending);
        // Switch right-side layout based on opponent count
        const opponents = this.opponentTracker.getAliveOpponents();
        const oppCount = opponents.length;
        const attackPending = this.attackManager.getPendingGarbage();
        if (oppCount !== this.lastOpponentCount) {
            this.lastOpponentCount = oppCount;
            if (oppCount > 1) {
                // Battle royale: hide 1v1 boxes, show minimap panel
                this.opponentBoardBox?.hide();
                this.opponentInfoBox?.hide();
                this.minimapPanel?.show();
            }
            else {
                // 1v1: show full board + VS info, hide minimap panel
                this.opponentBoardBox?.show();
                this.opponentInfoBox?.show();
                this.minimapPanel?.hide();
            }
        }
        if (oppCount > 1) {
            // Battle royale — render bucket/list visualization
            this.minimapRenderer.renderBuckets(this.minimapContainer, opponents);
        }
        else {
            // 1v1 — render full opponent board + VS info
            const opp = opponents[0] ?? null;
            if (opp) {
                this.renderOpponentBoard(opp);
                this.opponentBoardBox.setLabel(` ${opp.name || 'CPU'} `);
            }
            const oppName = opp?.name || 'CPU';
            const oppLevel = opp?.level ?? '-';
            const oppGrade = opp?.grade ?? '-';
            const oppAlive = opp ? opp.alive : true;
            const localUserId = String(this.network?.getMatchState()?.players.find(p => !p.isBot && !this.opponentTracker.getAliveOpponents().some((o) => String(o.id) === String(p.id)))?.id ?? '');
            const oppUserId = String(opp?.id ?? '');
            const voiceSection = this.sessionSocket
                ? this.renderVoiceSection(localUserId, oppUserId)
                : '';
            this.opponentInfoBox.setContent(`{cyan-fg}${oppName}{/cyan-fg}\n\n` +
                `Level: {yellow-fg}${oppLevel}{/yellow-fg}\n` +
                `Grade: {magenta-fg}${oppGrade}{/magenta-fg}\n` +
                `Status: {${oppAlive ? 'green' : 'red'}-fg}${oppAlive ? 'ALIVE' : 'TOPPED OUT'}{/${oppAlive ? 'green' : 'red'}-fg}\n\n` +
                (attackPending > 0
                    ? `{red-fg}INCOMING: ${attackPending} line${attackPending > 1 ? 's' : ''}{/red-fg}`
                    : `{gray-fg}No incoming attack{/gray-fg}`) +
                voiceSection);
        }
        // Stats bar
        const combo = gameState.combo;
        let comboStr = '';
        if (combo > 0) {
            const comboColor = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : combo >= 5 ? 'cyan' : 'magenta';
            comboStr = `  Combo: {${comboColor}-fg}${combo}x{/${comboColor}-fg}`;
        }
        let b2bStr = '';
        if (gameState.backToBack) {
            const b2bCount = gameState.backToBackCount ?? 1;
            b2bStr = `  {yellow-fg}B2B${b2bCount > 1 ? ` x${b2bCount}` : ''}{/yellow-fg}`;
        }
        this.statsBox.setContent(`Score: {yellow-fg}${gameState.score}{/yellow-fg}` +
            `  Level: {cyan-fg}${gameState.level}{/cyan-fg}` +
            `  Grade: {magenta-fg}${gameState.grade}{/magenta-fg}` +
            comboStr +
            b2bStr);
        this.screen.render();
    }
    /**
     * Build board overlay grid from all active effects
     * Z-order (highest priority first):
     *   1. Text announcements (gradeUp, cool/regret, combo, tSpin)
     *   2. Floating text
     *   3. Particles
     *   4. Lock glow (lowest)
     */
    buildBoardOverlay() {
        // Reset overlay: 20 visible rows (y=4..23) x 10 cols
        this.boardOverlay = [];
        for (let r = 0; r < 20; r++) {
            this.boardOverlay[r] = new Array(10).fill(null);
        }
        const setCell = (boardX, boardY, content) => {
            const row = boardY - 4;
            if (row >= 0 && row < 20 && boardX >= 0 && boardX < 10) {
                this.boardOverlay[row][boardX] = content;
            }
        };
        // Layer 4 (lowest): Lock glow
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
        // Layer 3: Particles
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
        // Layer 2: Floating text
        const floatingTexts = this.animations.getFloatingTexts();
        for (const text of floatingTexts) {
            if (text.mode === 'offboard' && text.x >= 0 && text.x < 10) {
                continue;
            }
            let alpha = 1.0;
            if (text.timer > 80) {
                alpha = 1.0 - ((text.timer - 80) / 20);
            }
            const color = alpha > 0.5 ? text.color : 'gray';
            const boardY = Math.floor(text.y);
            const boardX = Math.floor(text.x);
            for (let lineIdx = 0; lineIdx < text.text.length; lineIdx++) {
                const line = text.text[lineIdx];
                const textBoardY = boardY + lineIdx;
                for (let ci = 0; ci < line.length; ci++) {
                    const cellX = boardX + Math.floor(ci / 2);
                    const charIdx = ci % 2;
                    if (charIdx === 0) {
                        const c1 = line[ci] || ' ';
                        const c2 = (ci + 1 < line.length) ? line[ci + 1] : ' ';
                        setCell(cellX, textBoardY, `{${color}-fg}${c1}${c2}{/${color}-fg}`);
                    }
                }
            }
        }
        // Layer 1 (highest): Text announcements
        const animList = this.animations.getAnimations();
        for (const anim of animList) {
            if (anim.type === 'gradeUp') {
                const rendered = animations_1.AnimationRenderer.renderGradeUp(anim);
                this.overlayTextOnBoard(rendered, 7, setCell);
            }
            else if (anim.type === 'cool' || anim.type === 'regret') {
                const rendered = animations_1.AnimationRenderer.renderSectionResult(anim);
                this.overlayTextOnBoard(rendered, 5, setCell);
            }
            else if (anim.type === 'comboCounter') {
                const data = anim.data;
                const cCombo = data.combo;
                const progress = anim.elapsed / anim.duration;
                if (progress < 0.8) {
                    const color = cCombo >= 15 ? 'red' : cCombo >= 10 ? 'yellow' : 'cyan';
                    const comboText = `${cCombo} COMBO!`;
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
        }
    }
    /**
     * Overlay text centered on the board at a given visible row offset
     */
    overlayTextOnBoard(taggedText, visibleRow, setCell) {
        const lines = taggedText.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const plainText = line.replace(/\{[^}]*\}/g, '');
            const boardWidth = 10;
            const textCellWidth = Math.ceil(plainText.length / 2);
            const startCell = Math.floor((boardWidth - textCellWidth) / 2);
            const boardY = 4 + visibleRow + lineIdx;
            let cellChars = [];
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '{') {
                    const end = line.indexOf('}', i);
                    if (end !== -1) {
                        i = end;
                        continue;
                    }
                }
                cellChars.push(line[i]);
            }
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
     * Render game board with ghost, glow, line-clear fade, and overlay effects
     */
    renderBoard(state) {
        const { board, currentPiece } = state;
        let content = '';
        let pieceShape = null;
        let ghostY = null;
        if (currentPiece) {
            const pieceManager = this.engine.pieceManager;
            const shape = pieceManager?.getShape(currentPiece.type, currentPiece.rotation);
            if (shape) {
                pieceShape = shape;
                if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
                    const calculatedGhostY = (0, board_1.getGhostY)(board, shape, currentPiece.x, currentPiece.y);
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
                const cell = board.grid[y]?.[x];
                let char = '  ';
                // Active piece
                if (currentPiece && pieceShape) {
                    const px = x - currentPiece.x;
                    const py = y - currentPiece.y;
                    if (py >= 0 && py < pieceShape.length &&
                        px >= 0 && px < pieceShape[py].length &&
                        pieceShape[py][px]) {
                        char = this.getBlockChar(currentPiece.type);
                    }
                }
                // Ghost piece
                if (ghostY !== null && currentPiece && pieceShape && char === '  ') {
                    const px = x - currentPiece.x;
                    const py = y - ghostY;
                    const ghostBlockY = ghostY + py;
                    if (py >= 0 && py < pieceShape.length &&
                        px >= 0 && px < pieceShape[py].length &&
                        pieceShape[py][px] &&
                        ghostBlockY >= 4 && ghostBlockY < 24 &&
                        x >= 0 && x < board.width) {
                        char = '{gray-fg}░░{/gray-fg}';
                    }
                }
                // Locked cell with effects
                if (char === '  ' && cell?.filled) {
                    const clearFade = this.clearAnimation.getCellFade(x, y);
                    if (clearFade >= 1.0) {
                        char = '  ';
                    }
                    else {
                        char = this.getBlockChar(cell.color);
                        // Block glow
                        const glowIntensity = this.glowManager.getGlowIntensity(x, y);
                        if (glowIntensity > 0) {
                            const glowColor = this.glowManager.getGlowColor(x, y);
                            if (glowColor) {
                                char = this.applyGlow(char, glowColor, glowIntensity);
                            }
                        }
                        // Line clear fade
                        if (clearFade > 0 && clearFade < 1.0) {
                            char = line_clear_animation_1.LineClearAnimationManager.applyFade(char, clearFade);
                        }
                    }
                }
                // Board overlay (highest priority)
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
     * Render player's next piece queue
     */
    renderNextQueue(queue) {
        if (!this.nextBox)
            return;
        const SHAPES = {
            I: ['████████'],
            O: ['████', '████'],
            T: ['██████', ' ██  '],
            S: [' ████', '████ '],
            Z: ['████ ', ' ████'],
            J: ['██   ', '██████'],
            L: ['   ██', '██████'],
        };
        const COLORS = {
            I: 'cyan', O: 'yellow', T: 'magenta',
            S: 'green', Z: 'red', J: 'blue', L: 'white',
        };
        let content = '';
        const show = Math.min(queue.length, 5);
        for (let i = 0; i < show; i++) {
            const type = queue[i];
            const rows = SHAPES[type] ?? ['??'];
            const color = COLORS[type] ?? 'white';
            for (const row of rows) {
                content += `{${color}-fg}${row}{/${color}-fg}\n`;
            }
            if (i < show - 1)
                content += '\n';
        }
        this.nextBox.setContent(content);
    }
    /**
     * Render hold piece
     */
    renderHold(state) {
        if (!this.holdBox)
            return;
        if (!state.holdPiece) {
            this.holdBox.setContent('{gray-fg}(empty){/gray-fg}');
            return;
        }
        const SHAPES = {
            I: ['████████'],
            O: ['████', '████'],
            T: ['██████', ' ██  '],
            S: [' ████', '████ '],
            Z: ['████ ', ' ████'],
            J: ['██   ', '██████'],
            L: ['   ██', '██████'],
        };
        const COLORS = {
            I: 'cyan', O: 'yellow', T: 'magenta',
            S: 'green', Z: 'red', J: 'blue', L: 'white',
        };
        const type = state.holdPiece;
        const color = COLORS[type] ?? 'white';
        const canHold = state.canHold !== false;
        const rows = SHAPES[type] ?? ['??'];
        const fg = canHold ? color : 'gray';
        const content = rows.map(r => `{${fg}-fg}${r}{/${fg}-fg}`).join('\n');
        this.holdBox.setContent(content);
    }
    /**
     * Render garbage strip — stacked red blocks showing pending count
     */
    renderGarbage(pending) {
        if (!this.garbageIndicator)
            return;
        if (pending <= 0) {
            this.garbageIndicator.setContent('');
            return;
        }
        const capped = Math.min(pending, 18);
        const bars = '{red-fg}' + ('█\n').repeat(capped).trim() + '{/red-fg}';
        this.garbageIndicator.setContent(`{red-fg}${pending}{/red-fg}\n${bars}`);
    }
    /**
     * Render opponent board (full size)
     */
    renderOpponentBoard(opponent) {
        if (!this.opponentBoardBox || !opponent.board)
            return;
        const board = opponent.board;
        // Overlay the in-flight piece (see OpponentState.pieceCells): board.grid
        // is locked cells only, so drawing it alone made pieces pop into
        // existence at the bottom rather than fall.
        const falling = new Map();
        for (const c of (opponent.pieceCells ?? [])) {
            falling.set(`${c.x},${c.y}`, c.type);
        }
        let content = '';
        const startY = Math.max(0, board.height - 20);
        for (let y = startY; y < board.height; y++) {
            if (y > startY)
                content += '\n';
            for (let x = 0; x < board.width; x++) {
                const fallingType = falling.get(`${x},${y}`);
                if (fallingType) {
                    content += this.getBlockChar(fallingType);
                    continue;
                }
                const cell = board.grid[y]?.[x];
                content += cell?.filled ? this.getBlockChar(cell.color) : '  ';
            }
        }
        this.opponentBoardBox.setContent(content);
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
     * Apply glow effect to block character
     */
    applyGlow(baseChar, glowColor, intensity) {
        const brightMap = {
            red: 'lightred', green: 'lightgreen', yellow: 'lightyellow', blue: 'lightblue',
            magenta: 'lightmagenta', cyan: 'lightcyan', white: 'lightwhite', orange: 'yellow',
        };
        const brightColor = brightMap[glowColor] || glowColor;
        if (intensity > 0.7) {
            return `{${brightColor}-bg}${baseChar}{/${brightColor}-bg}`;
        }
        else if (intensity > 0.3) {
            return `{${glowColor}-bg}${baseChar}{/${glowColor}-bg}`;
        }
        return baseChar;
    }
    /**
     * Render voice chat status section for opponentInfoBox
     */
    renderVoiceSection(localUserId, oppUserId) {
        const fmtRow = (uid, label, isLocal) => {
            const muted = isLocal ? this.localMuted : (this.voiceStates.get(uid)?.muted ?? false);
            const speaking = this.voiceStates.get(uid)?.speaking ?? false;
            if (muted)
                return `{red-fg}[M]{/red-fg} ${label}`;
            if (speaking)
                return `{green-fg}[*]{/green-fg} ${label}`;
            return `{gray-fg}[ ]{/gray-fg} ${label}`;
        };
        const localName = this.state.playerName || 'You';
        const opp = this.opponentTracker.getAliveOpponents()[0];
        const oppName = opp?.name || 'Opp';
        return (`\n{cyan-fg}-- VOICE ----------{/cyan-fg}\n` +
            `${fmtRow(localUserId, localName, true)}\n` +
            `${fmtRow(oppUserId, oppName, false)}\n` +
            `{gray-fg}M=mute{/gray-fg}`);
    }
    /**
     * Cleanup
     */
    cleanup() {
        if (this.sessionSocket && this.voiceSpeakingHandler) {
            this.sessionSocket.off('voice:speaking', this.voiceSpeakingHandler);
            this.voiceSpeakingHandler = null;
        }
        this.running = false;
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
    }
}
exports.VersusScreen = VersusScreen;
//# sourceMappingURL=versus-screen.js.map