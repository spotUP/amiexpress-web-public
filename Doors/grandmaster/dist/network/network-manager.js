"use strict";
/**
 * Network Manager
 *
 * Wraps SDK NetworkEngine for GRANDMASTER multiplayer
 * Includes state sync, client prediction, and rollback netcode
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrandmasterNetworkManager = void 0;
const network_engine_1 = require("@amiexpress/bbs-door-sdk/engines/network/network-engine");
const sync_1 = require("./sync");
const prediction_1 = require("./prediction");
const rollback_1 = require("./rollback");
/**
 * Grandmaster Network Manager
 */
class GrandmasterNetworkManager {
    constructor(bbsSession) {
        this.matchState = null;
        this.localPlayerId = null;
        this.opponentStates = new Map();
        this.updateCallbacks = new Set();
        this.attackCallbacks = new Set();
        // Netcode systems (optional, for competitive multiplayer)
        this.syncManager = null;
        this.predictionManager = null;
        this.rollbackManager = null;
        this.interpolator = null;
        this.gameEngine = null;
        this.network = new network_engine_1.NetworkEngine(bbsSession.socket);
        this.setupEventListeners();
    }
    /**
     * Setup network event listeners
     */
    setupEventListeners() {
        // Player joined match
        this.network.on('player:joined', (player) => {
            if (this.matchState) {
                this.matchState.players.push(player);
            }
        });
        // Player left match
        this.network.on('player:left', (playerId) => {
            if (this.matchState) {
                this.matchState.players = this.matchState.players.filter(p => p.id !== playerId);
            }
            this.opponentStates.delete(playerId);
        });
        // Game update from opponent
        this.network.on('game:update', (update) => {
            // Update opponent state
            const existing = this.opponentStates.get(update.playerId);
            if (existing) {
                existing.board = update.board;
                existing.level = update.level;
                existing.grade = update.grade;
            }
            // Notify callbacks
            this.updateCallbacks.forEach(cb => cb(update));
        });
        // Attack received
        this.network.on('game:attack', (attack) => {
            this.attackCallbacks.forEach(cb => cb(attack));
        });
        // Match started
        this.network.on('match:started', () => {
            if (this.matchState) {
                this.matchState.status = 'playing';
                this.matchState.startTime = Date.now();
            }
        });
        // Match finished
        this.network.on('match:finished', (winnerId) => {
            if (this.matchState) {
                this.matchState.status = 'finished';
                this.matchState.winner = winnerId;
            }
        });
    }
    /**
     * Join matchmaking queue
     */
    async joinQueue(mode) {
        await this.network.joinQueue({
            gameMode: mode,
        });
    }
    /**
     * Leave matchmaking queue
     */
    async leaveQueue() {
        await this.network.leaveQueue();
    }
    /**
     * Create custom lobby
     */
    async createLobby(mode, isPrivate = false) {
        const lobby = await this.network.createLobby({
            name: 'GRANDMASTER Match',
            maxPlayers: mode === 'battle_royale' ? 99 : mode === 'team_2v2' ? 4 : 2,
            isPrivate,
        });
        return lobby.id;
    }
    /**
     * Join lobby by ID
     */
    async joinLobby(lobbyId) {
        await this.network.joinLobby(lobbyId);
    }
    /**
     * Set ready status in lobby
     */
    async setReady(ready) {
        this.network.setReady(ready);
    }
    /**
     * Start match (host only)
     * Note: In a full implementation, this would be handled server-side
     */
    async startMatch() {
        // Emit a custom event that the server would handle
        this.network.emit('match:start', {});
    }
    /**
     * Send game state update
     */
    sendUpdate(gameState) {
        if (!this.localPlayerId)
            return;
        const update = {
            playerId: this.localPlayerId,
            timestamp: Date.now(),
            board: gameState.board,
            level: gameState.level,
            score: gameState.score,
            grade: gameState.grade,
            combo: gameState.combo,
            attacking: gameState.combo > 0,
        };
        this.network.emit('game:update', update);
    }
    /**
     * Send attack to opponent(s)
     */
    sendAttack(attack) {
        this.network.emit('game:attack', attack);
    }
    /**
     * Get current opponent states
     */
    getOpponents() {
        return Array.from(this.opponentStates.values());
    }
    /**
     * Subscribe to game updates
     */
    onUpdate(callback) {
        this.updateCallbacks.add(callback);
        return () => this.updateCallbacks.delete(callback);
    }
    /**
     * Subscribe to attacks
     */
    onAttack(callback) {
        this.attackCallbacks.add(callback);
        return () => this.attackCallbacks.delete(callback);
    }
    /**
     * Get match state
     */
    getMatchState() {
        return this.matchState;
    }
    /**
     * Subscribe to network events
     */
    on(event, callback) {
        this.network.on(event, callback);
    }
    /**
     * Emit network event
     */
    emit(event, ...args) {
        this.network.emit(event, ...args);
    }
    /**
     * Enable competitive netcode (prediction + rollback)
     * Call this before starting a competitive match
     */
    enableNetcode(engine) {
        this.gameEngine = engine;
        this.syncManager = new sync_1.StateSyncManager();
        this.predictionManager = new prediction_1.PredictionManager(engine);
        this.rollbackManager = new rollback_1.RollbackManager(engine, this.predictionManager);
        this.interpolator = new sync_1.StateInterpolator();
        // Setup sync packet listeners
        this.network.on('state:sync', (packet) => {
            this.handleSyncPacket(packet);
        });
        // Setup input acknowledgments
        this.network.on('input:ack', (data) => {
            this.predictionManager?.onInputAck(data.inputId, data.serverFrame);
        });
    }
    /**
     * Disable netcode (back to simple state sync)
     */
    disableNetcode() {
        this.syncManager = null;
        this.predictionManager = null;
        this.rollbackManager = null;
        this.interpolator = null;
        this.gameEngine = null;
    }
    /**
     * Handle player input with prediction
     */
    handleInput(inputType, timestamp) {
        if (!this.predictionManager) {
            // No prediction, ignore
            return;
        }
        // Add to prediction buffer
        const inputId = this.predictionManager.addInput(inputType, timestamp);
        // Send to server
        const input = this.predictionManager.getInput(inputId);
        if (input) {
            const encoded = prediction_1.InputEncoder.encode(input);
            this.network.emit('game:input', { input: encoded });
        }
    }
    /**
     * Process predictions (call every frame)
     */
    processPredictions(currentTime) {
        if (!this.predictionManager)
            return;
        // Apply pending inputs
        this.predictionManager.processPendingInputs(currentTime);
        // Create snapshot
        this.predictionManager.createSnapshot();
    }
    /**
     * Handle sync packet from server
     */
    handleSyncPacket(packet) {
        if (!this.syncManager || !this.rollbackManager || !this.interpolator)
            return;
        // Add to interpolation buffer
        if (packet.type === 'full_state') {
            this.interpolator.addState(packet.state, packet.timestamp);
        }
        else if (packet.type === 'delta_state') {
            const currentState = this.gameEngine?.getState();
            if (currentState) {
                const newState = this.syncManager.applySyncPacket(packet, currentState);
                this.interpolator.addState(newState, packet.timestamp);
            }
        }
        // Check for rollback
        const currentFrame = this.syncManager.getFrame();
        this.rollbackManager.handleServerUpdate(packet, currentFrame);
    }
    /**
     * Send state sync (server only)
     */
    sendStateSync(state, currentTime) {
        if (!this.syncManager)
            return;
        if (this.syncManager.shouldSync(currentTime)) {
            const packet = this.syncManager.createSyncPacket(state, currentTime);
            this.network.emit('state:sync', packet);
        }
    }
    /**
     * Get interpolated state for rendering
     */
    getInterpolatedState(currentTime) {
        if (!this.interpolator)
            return null;
        return this.interpolator.getInterpolatedState(currentTime);
    }
    /**
     * Get netcode stats
     */
    getNetcodeStats() {
        if (!this.syncManager || !this.predictionManager || !this.rollbackManager) {
            return null;
        }
        return {
            sync: {
                frame: this.syncManager.getFrame(),
            },
            prediction: this.predictionManager.getStats(),
            rollback: this.rollbackManager.getStats(),
        };
    }
    /**
     * Is netcode enabled?
     */
    isNetcodeEnabled() {
        return this.syncManager !== null;
    }
    /**
     * Disconnect
     */
    disconnect() {
        this.network.disconnect();
    }
}
exports.GrandmasterNetworkManager = GrandmasterNetworkManager;
//# sourceMappingURL=network-manager.js.map