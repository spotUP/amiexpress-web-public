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
const config_1 = require("../input/config");
const inventory_panel_1 = require("./tetrinet/inventory-panel");
const target_selector_1 = require("./tetrinet/target-selector");
const opponent_boards_1 = require("./tetrinet/opponent-boards");
const effect_overlay_1 = require("./tetrinet/effect-overlay");
const specials_1 = require("../core/tetrinet/specials");
const tetrinet_ai_1 = require("../ai/tetrinet-ai");
const tetrinet_board_1 = require("../core/tetrinet/tetrinet-board");
const board_effects_1 = require("./board-effects");
/**
 * TetriNET Game Screen
 */
class TetriNetScreen {
    constructor(options) {
        this.running = false;
        this.unsubscribers = [];
        this.lastRender = 0;
        /** Participants on other BBS nodes, keyed by the id their packets carry. */
        this.remotes = new Map();
        /** Whether any remote participant has ever been seen (victory needs this). */
        this.sawRemote = false;
        /** Hard-drop motion blur, drawn by the same code as the main modes. */
        this.hardDropTrails = [];
        /**
         * Who has died, in order. The reference server hands out winlist points
         * by finishing place - 3 to the winner, 2 to whoever died last before
         * them, 1 to the one before that - so the order matters, not just the
         * survivor.
         */
        this.deathOrder = [];
        this.knownAlive = new Set();
        /** TGM key layout, restored when the TetriNET game ends. */
        this.previousKeys = null;
        this.screen = options.screen;
        this.engine = options.engine;
        this.inputHandler = options.inputHandler;
        this.sounds = options.sounds;
        this.state = options.state;
        this.network = options.network || null;
        this.playerName = options.playerName;
        this.aiController = options.aiController || null;
        this.teams = options.teams || {};
        this.setupUI();
        this.setupEngineCallbacks();
        this.setupAttackRouting();
        if (this.network) {
            this.setupNetworkListeners();
        }
    }
    /**
     * The special/garbage ROUTER - the layer TetriNET never had.
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
     * The router treats every participant the same, whether it is this node's
     * human, a bot this node owns, or a player on another BBS node: resolve
     * the id, then either apply the hit locally or put it on the wire.
     *
     * Games on an EXTERNAL TetriNET server are not routed here - that server
     * fans specials out itself, so doing it again locally would double every
     * hit.
     */
    setupAttackRouting() {
        if (this.network && !this.routesOverNetwork())
            return;
        if (!this.aiController && !this.network)
            return;
        this.engine.onSpecialUsed((special, targetId) => {
            this.routeSpecial(special, this.localId(), targetId);
        });
        this.engine.onLinesAdded((count) => {
            this.routeGarbage(count, this.localId());
        });
        for (const opponent of this.aiOpponents()) {
            opponent.engine.onSpecialUsed((special, targetId) => {
                this.routeSpecial(special, opponent.id, targetId);
            });
            opponent.engine.onLinesAdded((count) => {
                this.routeGarbage(count, opponent.id);
            });
        }
        if (this.routesOverNetwork()) {
            this.unsubscribers.push(this.network.onSpecial((packet) => this.receiveSpecial(packet)));
            this.unsubscribers.push(this.network.onGarbage((packet) => this.receiveGarbage(packet)));
        }
        if (this.network?.onPause) {
            this.unsubscribers.push(this.network.onPause((packet) => {
                this.applyPause(packet.paused);
                this.effectOverlay.showIncomingWarning(packet.paused ? `${packet.fromName} paused` : `${packet.fromName} resumed`);
            }));
        }
    }
    /** Id this node's human player answers to. */
    localId() {
        return this.network?.localId?.() ?? tetrinet_ai_1.HUMAN_TARGET_ID;
    }
    /** True when the transport carries specials and garbage itself. */
    routesOverNetwork() {
        return !!(this.network?.sendSpecial && this.network?.sendGarbage);
    }
    aiOpponents() {
        return this.aiController ? this.aiController.getOpponents() : [];
    }
    /**
     * Engine for a participant this node OWNS, or null - which also means
     * "not ours": a remote player's id resolves to null here and the hit goes
     * on the wire instead.
     */
    participantEngine(id) {
        if (id === this.localId() || id === tetrinet_ai_1.HUMAN_TARGET_ID) {
            const status = this.engine.getState().status;
            return status === 'gameover' || status === 'won' ? null : this.engine;
        }
        const opponent = this.aiOpponents().find(o => o.id === id);
        return opponent && opponent.alive ? opponent.engine : null;
    }
    /** Team of a participant, or '' when teams are not in use. */
    participantTeam(id) {
        return this.teams[id] ?? '';
    }
    participantName(id) {
        if (id === this.localId() || id === tetrinet_ai_1.HUMAN_TARGET_ID)
            return this.playerName;
        const bot = this.aiOpponents().find(o => o.id === id);
        if (bot)
            return bot.name;
        return this.remotes.get(id)?.name ?? id;
    }
    /** Every id currently in the match, local and remote. */
    participantIds() {
        return [
            this.localId(),
            ...this.aiOpponents().map(o => o.id),
            ...this.remotes.keys(),
        ];
    }
    /**
     * Deliver one special to its target, wherever that target lives.
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
            ?? (sourceId === this.localId() ? this.targetSelector.getSelectedTarget()?.id ?? null : null);
        // Self is a legal target: TetriNET lets you use Clear Line, Nuke or
        // anything else on your own field, which is what Enter does in the
        // reference client.
        if (!resolvedId)
            return;
        const target = this.participantEngine(resolvedId);
        if (target) {
            this.applyLocalSpecial(special, target, resolvedId, this.participantName(sourceId), source.getBoard());
            return;
        }
        if (this.routesOverNetwork() && this.remotes.has(resolvedId)) {
            this.network.sendSpecial({
                from: sourceId,
                fromName: this.participantName(sourceId),
                to: resolvedId,
                special,
                // Switch Fields is the one special that needs the sender's board.
                sourceBoard: special === 'switch' ? source.getBoard() : undefined,
            });
        }
    }
    /** Apply a special to an engine on this node and give the human feedback. */
    applyLocalSpecial(special, target, targetId, senderName, sourceBoard) {
        const blocked = target.getEffectManager().hasImmunity();
        target.applyIncomingSpecial(special, senderName, special === 'switch' ? sourceBoard : undefined);
        if (targetId === this.localId() || targetId === tetrinet_ai_1.HUMAN_TARGET_ID) {
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
     * Classic-rules garbage goes to EVERY other living player (the cs1/cs2/cs4
     * broadcast of the original protocol), not just the selected target.
     */
    routeGarbage(lines, sourceId) {
        if (lines <= 0)
            return;
        for (const id of [this.localId(), ...this.aiOpponents().map(o => o.id)]) {
            if (id === sourceId)
                continue;
            const target = this.participantEngine(id);
            if (!target)
                continue;
            target.addGarbage(lines, 'classic');
            if (id === this.localId()) {
                this.sounds.playSfx('garbage');
            }
        }
        if (this.routesOverNetwork() && this.remotes.size > 0) {
            this.network.sendGarbage({
                from: sourceId,
                fromName: this.participantName(sourceId),
                to: null,
                lines,
            });
        }
    }
    /** A special from another node, addressed to somebody this node owns. */
    receiveSpecial(packet) {
        const target = this.participantEngine(packet.to);
        if (!target)
            return; // not ours - another node will handle it
        const ownBoardBefore = packet.special === 'switch'
            ? (0, tetrinet_board_1.cloneTetriNetBoard)(target.getBoard())
            : undefined;
        this.applyLocalSpecial(packet.special, target, packet.to, packet.fromName, packet.sourceBoard);
        // Switch Fields is a SWAP: the sender must end up with the board this
        // player just gave away. Reply once, and never reply to a reply.
        if (packet.special === 'switch' && !packet.reply && ownBoardBefore && this.routesOverNetwork()) {
            this.network.sendSpecial({
                from: packet.to,
                fromName: this.participantName(packet.to),
                to: packet.from,
                special: 'switch',
                sourceBoard: ownBoardBefore,
                reply: true,
            });
        }
    }
    /** Garbage from another node. `to: null` is the classic broadcast. */
    receiveGarbage(packet) {
        const targets = packet.to === null
            ? [this.localId(), ...this.aiOpponents().map(o => o.id)]
            : [packet.to];
        for (const id of targets) {
            if (id === packet.from)
                continue;
            const target = this.participantEngine(id);
            if (!target)
                continue;
            target.addGarbage(packet.lines, 'classic');
            if (id === this.localId()) {
                this.sounds.playSfx('garbage');
            }
        }
    }
    /**
     * Victory: outliving every other participant ends the match.
     * TetriNetAI.allDead() had zero callers, so a local TetriNET game could
     * only ever be LOST - the last player standing just kept stacking alone.
     */
    checkVictory() {
        const hadOpponents = this.aiOpponents().length > 0 || this.sawRemote;
        if (!hadOpponents)
            return;
        const botsAlive = this.aiOpponents().some((o) => o.alive);
        const remotesAlive = Array.from(this.remotes.values()).some(r => r.alive);
        if (!botsAlive && !remotesAlive) {
            this.engine.win();
        }
    }
    /**
     * Repaint the opponent strip and target list from BOTH sources - the bots
     * this node owns and the players on other nodes.
     */
    refreshOpponents() {
        this.trackDeaths();
        const bots = this.aiOpponents().map((bot) => ({
            id: bot.id,
            name: bot.name,
            board: bot.engine.getBoard(),
            level: bot.engine.getState().level,
            alive: bot.alive,
            hasImmunity: bot.engine.getEffectManager().hasImmunity(),
        }));
        const remotes = Array.from(this.remotes.entries()).map(([id, remote]) => ({
            id,
            name: remote.name,
            board: remote.board,
            level: remote.level,
            alive: remote.alive,
            hasImmunity: remote.hasImmunity,
        }));
        this.updateOpponents([...bots, ...remotes]);
        this.shareAverageLevel(bots, remotes);
        // Bots aim at everyone in the match, not just the people on this node.
        this.aiController?.setExternalTargets?.([this.localId(), ...this.remotes.keys()]);
    }
    /**
     * TetriNET's "average levels" option: everyone at the table climbs
     * together at the average of all levels, rather than at their own pace.
     */
    shareAverageLevel(bots, remotes) {
        if (!this.engine.usesAverageLevels())
            return;
        const levels = [
            this.engine.getState().level,
            ...bots.map(b => b.level),
            ...remotes.map(r => r.level),
        ];
        const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
        this.engine.applyAverageLevel(average);
        for (const bot of this.aiOpponents())
            bot.engine.applyAverageLevel(average);
    }
    /** Note anyone who has just died, keeping the order they died in. */
    trackDeaths() {
        const living = new Map();
        for (const bot of this.aiOpponents()) {
            if (bot.alive)
                living.set(bot.id, bot.name);
        }
        for (const [id, remote] of this.remotes) {
            if (remote.alive)
                living.set(id, remote.name);
        }
        for (const id of this.knownAlive) {
            if (!living.has(id) && !this.deathOrder.includes(id)) {
                this.deathOrder.push(id);
            }
        }
        this.knownAlive = new Set(living.keys());
    }
    /**
     * Finishing order for the winlist: the survivor first, then the others
     * from the last death backwards. Empty when the match ended without a
     * single survivor - the reference server records nothing then either.
     */
    getFinishOrder() {
        const status = this.engine.getState().status;
        const survivors = [];
        if (status !== 'gameover')
            survivors.push(this.localId());
        for (const bot of this.aiOpponents())
            if (bot.alive)
                survivors.push(bot.id);
        for (const [id, remote] of this.remotes)
            if (remote.alive)
                survivors.push(id);
        if (survivors.length !== 1)
            return [];
        const order = [survivors[0], ...[...this.deathOrder].reverse()];
        if (status === 'gameover' && !order.includes(this.localId())) {
            order.push(this.localId());
        }
        return order.map(id => ({
            name: this.participantName(id),
            team: this.participantTeam(id),
        }));
    }
    /** Publish this node's fields: the human, plus any bots it owns. */
    publishFields() {
        if (!this.network)
            return;
        this.network.sendUpdate(this.engine.getState());
        if (!this.network.sendField)
            return;
        for (const bot of this.aiOpponents()) {
            this.network.sendField({
                playerId: bot.id,
                name: bot.name,
                board: bot.engine.getBoard(),
                level: bot.engine.getState().level,
                alive: bot.alive,
                hasImmunity: bot.engine.getEffectManager().hasImmunity(),
            });
        }
    }
    /**
     * Setup UI layout - 80x24, the same budget the versus screen fits into.
     *
     * Col  0-25 : playfield        (26w, 24h, top 0) - 12x22 field, 2 chars a
     *                               cell, plus its border. A TetriNET field is
     *                               two rows TALLER than a TGM one, so it uses
     *                               the full height and the readouts that sit
     *                               under the board in versus live to the
     *                               right of it here.
     * Col 26-51 : Next (rows 0-5), Inventory (6-8), Target (9-16),
     *             Stats (17-20), Sudden Death (21-23)
     * Col 52-79 : Opponents        (28w, 24h, top 0)
     *   26 + 26 + 28 = 80, and nothing is painted below row 23.
     *
     * The previous layout put the board at top 1 with height 24 (so its bottom
     * border fell on row 25, off a 24-row terminal) and the stats bar at row
     * 25, off-screen entirely - which is why the field looked bottomless and
     * score/level/lines were nowhere to be seen.
     */
    setupUI() {
        // Clear screen
        this.screen.children.forEach(child => child.destroy());
        // Playfield
        this.boardBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 0,
            width: 26,
            height: 24,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'white' } },
            fixed: true,
        });
        // Next piece, and - when the house rule is on - Hold beside it.
        const holdEnabled = this.engine.isHoldEnabled();
        this.previewBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 26,
            width: holdEnabled ? 13 : 26,
            height: 6,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            label: ' Next ',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        if (holdEnabled) {
            this.holdBox = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 0,
                left: 39,
                width: 13,
                height: 6,
                border: { type: 'line' },
                style: { border: { fg: 'cyan' } },
                label: ' Hold ',
                fixed: true,
                focusable: false,
                mouse: false,
                clickable: false,
            });
        }
        // Special inventory
        this.inventoryPanel = new inventory_panel_1.InventoryPanel({
            parent: this.screen,
            top: 6,
            left: 26,
            width: 26,
            maxSlots: 10,
        });
        // Attack target
        this.targetSelector = new target_selector_1.TargetSelector({
            parent: this.screen,
            top: 9,
            left: 26,
            width: 26,
            height: 8,
        });
        // Score / level / lines. In versus this is a bar under the board; the
        // TetriNET field is too tall for that, so it sits in the right column.
        this.statsBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 17,
            left: 26,
            width: 26,
            height: 4,
            border: { type: 'line' },
            style: { border: { fg: 'green' } },
            label: ' Stats ',
            content: '',
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Sudden death countdown.
        //
        // Twice bitten here: createBox() draws a border BY DEFAULT (this box used
        // to paint one across the board's last playable row), and it was created
        // visible and never hidden. Borderless, and shown only while sudden
        // death is actually running.
        this.suddenDeathBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 21,
            left: 26,
            width: 26,
            height: 3,
            border: { type: 'none' },
            content: '',
            hidden: true,
            fixed: true,
            focusable: false,
            mouse: false,
            clickable: false,
        });
        // Opponent fields
        this.opponentBoards = new opponent_boards_1.OpponentBoards({
            parent: this.screen,
            top: 0,
            left: 52,
            width: 28,
            height: 24,
            maxOpponents: 5,
        });
        // Effect overlay (attack animations, incoming warnings)
        this.effectOverlay = new effect_overlay_1.EffectOverlay({
            parent: this.screen,
            boardTop: 0,
            boardLeft: 0,
            boardWidth: 26,
            boardHeight: 24,
        });
        // The board must stay above any dockable panel.
        this.boardBox.setFront();
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
            // Outgoing garbage is the router's job (setupAttackRouting) - this
            // used to be an `if (this.network)` branch whose body was the comment
            // "TODO: Send garbage to target via network", which is precisely why
            // no garbage ever left this screen.
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
     * Track the participants living on other BBS nodes.
     *
     * The old version wrote straight into one opponent board with
     * `name: update.playerId  // Use ID as name for now`, `hasImmunity: false
     * // TODO` and a hardcoded opponent index of 0, so every remote player
     * overwrote the same slot and none of them had a name. Updates now land
     * in a keyed map and the whole strip is repainted from it alongside the
     * local bots.
     */
    setupNetworkListeners() {
        if (!this.network)
            return;
        const unsubUpdate = this.network.onUpdate((update) => {
            if (update.playerId === this.localId())
                return;
            this.sawRemote = true;
            this.remotes.set(update.playerId, {
                name: update.name ?? update.playerId,
                board: update.board,
                level: update.level,
                alive: update.alive,
                hasImmunity: update.hasImmunity,
            });
            this.targetSelector.updateOpponent(update.playerId, {
                level: update.level,
                alive: update.alive,
                hasImmunity: update.hasImmunity,
            });
        });
        this.unsubscribers.push(unsubUpdate);
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
                // Drive the bots this node owns (local play, or the host of a
                // networked match).
                if (this.aiController) {
                    this.aiController.update(deltaTime);
                }
                if (now % 100 < deltaTime) {
                    this.refreshOpponents();
                    this.publishFields();
                }
                this.checkVictory();
                // Render at 20 fps in the background. This was an UNCONDITIONAL
                // render on every 16 ms tick - 60 full repaints a second of a 12x22
                // field, three times what the versus screen sends, and with the
                // landing shadow and the motion blur now drawn per cell it was
                // enough to make the blur stutter over a BBS connection. Input
                // still feels immediate: every action calls renderNow().
                if (now - this.lastRender >= TetriNetScreen.RENDER_INTERVAL) {
                    this.render();
                    this.lastRender = now;
                }
                // Check for game over
                const gameState = this.engine.getState();
                if (gameState.status === 'gameover' || gameState.status === 'won') {
                    this.running = false;
                    if (gameState.status === 'gameover' && !this.deathOrder.includes(this.localId())) {
                        this.deathOrder.push(this.localId());
                    }
                    clearInterval(updateInterval);
                    // Tell the other nodes we are out. Field updates stop with the
                    // loop, so without this last publish the survivors keep seeing a
                    // living opponent and nobody is ever declared the winner.
                    this.publishFields();
                    resolve();
                }
            }, 16); // ~60 FPS
        });
    }
    /**
     * Setup input handlers
     */
    setupInput() {
        // TetriNET's own key layout for the duration of the game. The TGM
        // layout collides with it head-on - Space is rotate-180 there, Enter is
        // hard drop and D is move-right - so the reference client's special
        // keys had nowhere to live.
        this.previousKeys = this.inputHandler.getConfig();
        this.inputHandler.updateConfig(config_1.TETRINET_KEYS);
        // Movement - confusion reversal is handled by engine.
        // Sound effects match game-screen/versus-screen: these bindings used to
        // be bare engine calls, so movement, rotation, hard drop and hold were
        // all SILENT in TetriNET mode while the same actions were audible in
        // single player. (No IRS/IHS cues here - the TetriNET engine has no
        // initial-rotation/hold system.)
        const act = (fn) => () => { fn(); this.renderNow(); };
        this.inputHandler.on('left', act(() => {
            if (this.engine.move(-1))
                this.sounds.playSfx('move');
        }));
        this.inputHandler.on('right', act(() => {
            if (this.engine.move(1))
                this.sounds.playSfx('move');
        }));
        // Rotation
        this.inputHandler.on('rotate_cw', act(() => {
            if (this.engine.rotate(1))
                this.sounds.playSfx('rotate');
        }));
        this.inputHandler.on('rotate_ccw', act(() => {
            if (this.engine.rotate(-1))
                this.sounds.playSfx('rotate');
        }));
        // Drop
        this.inputHandler.on('soft_drop', act(() => { this.engine.softDrop(); }));
        this.inputHandler.on('hard_drop', act(() => {
            this.recordHardDropTrail();
            this.engine.hardDrop();
            this.sounds.playSfx('hard_drop');
        }));
        // Hold
        this.inputHandler.on('hold', act(() => {
            if (this.engine.hold())
                this.sounds.playSfx('hold');
        }));
        // Pause
        this.inputHandler.on('pause', () => this.togglePause());
        // TetriNET's special keys, through the SAME input path as movement.
        //
        // These used to be screen.key() bindings, and in game mode the door
        // receives keys through bbs.onKeyDown/onKeyUp - not through blessed
        // keypress events - so none of them ever fired: specials could not be
        // used at all, and the panel's "TAB: Next 1-5: Select" hint described
        // something that did not work.
        //
        // The model is the reference client's: the number key USES the first
        // special on that slot, there is no separate select-then-fire step.
        for (let slot = 1; slot <= 6; slot++) {
            this.inputHandler.on(`use_special_${slot}`, () => this.useSpecialOnSlot(slot));
        }
        this.inputHandler.on('use_special_self', () => {
            this.fireSpecial(this.localId());
        });
        this.inputHandler.on('use_special_random', () => {
            const living = this.livingTargets();
            if (living.length === 0)
                return;
            this.fireSpecial(living[Math.floor(Math.random() * living.length)]);
        });
        this.inputHandler.on('discard_special', () => {
            if (this.engine.discardSpecial()) {
                this.sounds.playSfx('menu_select');
                this.inventoryPanel.showUseAnimation();
            }
        });
    }
    /** Repaint now - used by input handlers so the throttle is invisible. */
    renderNow() {
        this.render();
        this.lastRender = Date.now();
    }
    /** Ids of everyone still playing, this node's human excluded. */
    livingTargets() {
        return [
            ...this.aiOpponents().filter((o) => o.alive).map((o) => o.id),
            ...Array.from(this.remotes.entries()).filter(([, r]) => r.alive).map(([id]) => id),
        ];
    }
    /**
     * Use the first special on the player shown at that slot number. The
     * panel numbers opponents from 1, which is what the key refers to.
     */
    useSpecialOnSlot(slot) {
        const target = this.targetSelector.getOpponentAt(slot - 1);
        if (!target) {
            this.sounds.playSfx('error');
            return;
        }
        this.fireSpecial(target.id);
    }
    /** Use the first special in the inventory on one participant. */
    fireSpecial(targetId) {
        if (this.engine.getState().inventory.length === 0) {
            this.sounds.playSfx('error');
            return;
        }
        this.engine.useSpecial(targetId);
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
        // Held piece
        if (this.holdBox) {
            this.renderHold(gameState);
        }
        // Update inventory
        this.inventoryPanel.updateFromArray(gameState.inventory || []);
        // Update effects overlay
        this.effectOverlay.update(effects);
        // Render stats. Two lines, because the panel is 24 columns wide inside
        // its border - one long line wrapped and lost the tail.
        this.statsBox.setContent(`Score: {yellow-fg}${gameState.score}{/yellow-fg}\n` +
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
        // Landing shadow and motion blur, from ui/board-effects.ts - the same
        // code the main modes draw, rather than a TetriNET-only lookalike.
        // Darkness hides the shadow, like the preview.
        const ghostY = this.engine.getEffectManager().hasDarkness()
            ? null
            : this.engine.getGhostY();
        const now = Date.now();
        this.hardDropTrails = (0, board_effects_1.expireTrails)(this.hardDropTrails, now);
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
                // Landing shadow, over empty cells only - the piece itself and any
                // locked block take precedence.
                if (char === '  ' && currentPiece && pieceShape && ghostY !== null && ghostY !== currentPiece.y) {
                    const gx = x - currentPiece.x;
                    const gy = y - ghostY;
                    if (gy >= 0 && gy < pieceShape.length &&
                        gx >= 0 && gx < pieceShape[gy].length &&
                        pieceShape[gy][gx]) {
                        char = board_effects_1.GHOST_CHAR;
                    }
                }
                // Hard-drop streak, over empty cells only.
                if (char === '  ' && !cell?.filled) {
                    char = (0, board_effects_1.trailCharAt)(this.hardDropTrails, x, y, now) ?? char;
                }
                content += char;
            }
        }
        this.boardBox.setContent(content);
    }
    /**
     * Remember the streak a hard drop is about to leave. Must run BEFORE the
     * drop, while the piece is still at the top of its fall.
     */
    recordHardDropTrail() {
        const piece = this.engine.getState().currentPiece;
        if (!piece)
            return;
        const ghostY = this.engine.getGhostY();
        if (ghostY === null)
            return;
        const shape = this.engine.getPieceShape(piece.type, piece.rotation);
        if (!shape)
            return;
        this.hardDropTrails.push(...(0, board_effects_1.buildHardDropTrail)(shape, piece.x, piece.y, ghostY - piece.y, this.getPieceColor(piece.type), 
        // The TetriNET field has no hidden spawn rows: all 22 are drawn.
        { minY: 0, maxY: this.engine.getBoard().height }, Date.now()));
    }
    /**
     * Render the held piece, greyed out until it can be swapped again.
     */
    renderHold(state) {
        if (!state.holdPiece) {
            this.holdBox.setContent('');
            return;
        }
        const shape = this.engine.getPieceShape(state.holdPiece, 0);
        const block = state.canHold
            ? this.getBlockChar(state.holdPiece)
            : '{gray-fg}||{/gray-fg}';
        let content = '';
        for (const row of shape) {
            for (const cell of row) {
                content += cell ? block : '  ';
            }
            content += '\n';
        }
        this.holdBox.setContent(content);
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
        return `{${this.getPieceColor(type)}-fg}██{/${this.getPieceColor(type)}-fg}`;
    }
    /** Colour name for a piece type - also what the motion blur fades out. */
    getPieceColor(type) {
        const colors = {
            I: 'cyan',
            O: 'yellow',
            T: 'magenta',
            S: 'green',
            Z: 'red',
            J: 'blue',
            L: 'white',
        };
        return colors[type] || 'gray';
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
    /**
     * Pause is MATCH-wide in TetriNET (`pause <on|off> <slot>` in the
     * protocol): one player pausing stops the game for everybody, and any
     * player can resume it. It used to pause this node's engine only, so in a
     * networked match the other players kept playing against a frozen board.
     */
    togglePause() {
        const status = this.engine.getState().status;
        if (status !== 'playing' && status !== 'paused')
            return;
        const paused = status === 'playing';
        this.applyPause(paused);
        this.network?.sendPause?.({
            from: this.localId(),
            fromName: this.playerName,
            paused,
        });
    }
    /** Apply a pause state locally - to this node's bots as well. */
    applyPause(paused) {
        if (paused) {
            this.engine.pause();
            for (const bot of this.aiOpponents())
                bot.engine.pause();
        }
        else {
            this.engine.resume();
            for (const bot of this.aiOpponents())
                bot.engine.resume();
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
        // Hand the TGM key layout back to the rest of the door.
        if (this.previousKeys) {
            this.inputHandler.updateConfig(this.previousKeys);
            this.previousKeys = null;
        }
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
/** Background repaint rate, matching the versus screen. */
TetriNetScreen.RENDER_INTERVAL = 50;
//# sourceMappingURL=tetrinet-screen.js.map