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
const events_1 = require("events");
const sync_1 = require("./sync");
const prediction_1 = require("./prediction");
const rollback_1 = require("./rollback");
/**
 * Grandmaster Network Manager
 */
class GrandmasterNetworkManager extends events_1.EventEmitter {
    constructor(bbsSession) {
        super();
        this.matchState = null;
        this.localPlayerId = null;
        this.localPlayerName = 'Player';
        this.localPlayerNumericId = 0;
        this.opponentStates = new Map();
        this.updateCallbacks = new Set();
        this.attackCallbacks = new Set();
        // Netcode systems (optional, for competitive multiplayer)
        this.syncManager = null;
        this.predictionManager = null;
        this.rollbackManager = null;
        this.interpolator = null;
        this.gameEngine = null;
        this.network = new network_engine_1.NetworkEngine();
        // Get player info from session
        this.localPlayerId = bbsSession.user?.id || `player-${Date.now()}`;
        this.localPlayerName = bbsSession.user?.username || 'Player';
        // Generate a stable numeric ID from user ID for SDK lobby system
        this.localPlayerNumericId = typeof bbsSession.user?.id === 'number'
            ? bbsSession.user.id
            : this.hashStringToNumber(this.localPlayerId || 'unknown');
        // Connect via in-process broker for BBS multiplayer
        const nodeId = bbsSession.bbsSession?.nodeNumber ?? bbsSession.nodeNumber ?? 1;
        this.network.connectBroker({
            playerId: this.localPlayerNumericId,
            playerName: this.localPlayerName,
            nodeId,
        });
        this.setupEventListeners();
    }
    /**
     * Generate a stable numeric hash from a string ID
     */
    hashStringToNumber(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    /**
     * Setup network event listeners
     * Hooks into SDK lobby system events to keep matchState in sync
     */
    setupEventListeners() {
        const lobby = this.network.lobby;
        // Lobby created - sync initial state
        lobby.on('lobby:created', () => {
            this.syncMatchStateFromLobby();
        });
        // Lobby joined - sync state
        lobby.on('lobby:joined', () => {
            this.syncMatchStateFromLobby();
        });
        // Lobby updated - resync
        lobby.on('lobby:updated', () => {
            this.syncMatchStateFromLobby();
        });
        // Player joined lobby
        lobby.on('player:joined', () => {
            this.syncMatchStateFromLobby();
        });
        // Player left lobby
        lobby.on('player:left', (player) => {
            const playerId = String(player?.id ?? player);
            this.opponentStates.delete(playerId);
            this.syncMatchStateFromLobby();
        });
        // Player ready state changed
        lobby.on('player:ready', () => {
            this.syncMatchStateFromLobby();
            // Signal adapter so lobby widget can check auto-start
            this.emit('player:ready', { playerId: '', ready: true });
        });
        // Game starting — broker fires this on ALL connected nodes
        lobby.on('game:starting', () => {
            if (this.matchState) {
                this.matchState.status = 'countdown';
            }
            this.emit('match:starting');
        });
        // Game started — broker fires this on ALL connected nodes
        lobby.on('game:start', () => {
            if (this.matchState) {
                this.matchState.status = 'playing';
                this.matchState.startTime = Date.now();
            }
            this.emit('match:started');
        });
        // Game update from opponent (via broker)
        const socket = this.network.connection.getSocket();
        if (socket) {
            socket.on('game:update', (update) => {
                // Update opponent state
                const existing = this.opponentStates.get(update.playerId);
                if (existing) {
                    existing.board = update.board;
                    existing.level = update.level;
                    existing.grade = update.grade;
                }
                this.updateCallbacks.forEach(cb => cb(update));
            });
            socket.on('game:attack', (attack) => {
                this.attackCallbacks.forEach(cb => cb(attack));
            });
        }
        // Match finished
        this.network.on('match:finished', (winnerId) => {
            if (this.matchState) {
                this.matchState.status = 'finished';
                this.matchState.winner = winnerId;
            }
        });
    }
    /**
     * Sync matchState from SDK lobby.current
     * Translates LobbyPlayer (numeric ID) to PlayerInfo (string ID)
     */
    syncMatchStateFromLobby() {
        const lobby = this.network.lobby.current;
        if (!lobby)
            return;
        // Use localPlayerId (BBS user ID) for the local player so the lobby widget's
        // host-check (state.players[0].id === localPlayerId) resolves correctly.
        // SDK assigns numeric hashed IDs; translating back here keeps IDs consistent.
        const players = lobby.players.map(p => ({
            id: p.id === this.localPlayerNumericId && this.localPlayerId
                ? this.localPlayerId
                : String(p.id),
            name: p.username,
            rank: 1,
            rating: 1000,
            ready: p.ready,
            isBot: false,
        }));
        const prevPlayerCount = this.matchState?.players.length ?? 0;
        if (this.matchState) {
            this.matchState.players = players;
            this.matchState.matchId = lobby.id;
        }
        else {
            this.matchState = {
                mode: lobby.settings?.mode || 'versus_1v1',
                matchId: lobby.id,
                players,
                status: lobby.state === 'playing' ? 'playing' : lobby.state === 'countdown' || lobby.state === 'starting' ? 'countdown' : 'waiting',
                startTime: null,
                winner: null,
            };
        }
        // Update opponent states for non-local players
        for (const p of lobby.players) {
            const pid = String(p.id);
            if (pid !== this.localPlayerId && !this.opponentStates.has(pid)) {
                this.opponentStates.set(pid, {
                    id: pid,
                    name: p.username,
                    board: {
                        width: 10,
                        height: 20,
                        grid: Array(20).fill(null).map(() => Array(10).fill(0)),
                    },
                    level: 1,
                    grade: '9',
                    alive: true,
                });
            }
        }
        // Emit events so the lobby adapter can update the UI
        if (players.length > prevPlayerCount) {
            const newPlayers = players.slice(prevPlayerCount);
            for (const p of newPlayers) {
                this.emit('player:joined', p);
            }
        }
        this.emit('lobby:updated');
        console.log(`[GrandmasterNetworkManager] syncMatchState: ${players.length} players in lobby ${lobby.id}`);
    }
    /**
     * Join matchmaking queue
     * Uses atomic broker matchmaking to find or create a lobby
     */
    async joinQueue(mode) {
        console.log(`[GrandmasterNetworkManager] joinQueue called, mode=${mode}, localPlayerId=${this.localPlayerId}`);
        const modeMaxPlayers = {
            versus_1v1: 2,
            team_2v2: 4,
            battle_royale: 99,
        };
        const lobby = await this.network.lobby.matchmake({
            name: 'GRANDMASTER Match',
            maxPlayers: modeMaxPlayers[mode] || 2,
            isPrivate: false,
            settings: { mode, customRules: {} },
        }, mode);
        console.log(`[GrandmasterNetworkManager] Matchmaking result: lobby=${lobby.id}, players=${lobby.players.length}`);
        // Initialize matchState so getState() is non-null and Ready/settings work immediately
        this.syncMatchStateFromLobby();
    }
    /**
     * Leave matchmaking queue
     */
    async leaveQueue() {
        await this.network.leaveQueue();
    }
    /**
     * Create custom lobby via SDK broker
     */
    async createLobby(mode, isPrivate = false) {
        console.log(`[GrandmasterNetworkManager] createLobby called, mode=${mode}, localPlayerId=${this.localPlayerId}`);
        const lobby = await this.network.createLobby({
            name: 'GRANDMASTER Match',
            maxPlayers: mode === 'battle_royale' ? 99 : mode === 'team_2v2' ? 4 : 2,
            isPrivate,
            settings: { mode, customRules: {} },
        });
        console.log(`[GrandmasterNetworkManager] Lobby created: ${lobby.id}, players: ${lobby.players.length}`);
        // Initialize matchState so getState() is non-null and settings/Ready work immediately
        this.syncMatchStateFromLobby();
        return lobby.id;
    }
    /**
     * Join lobby by ID
     */
    async joinLobby(lobbyId) {
        console.log(`[GrandmasterNetworkManager] joinLobby called, lobbyId=${lobbyId}`);
        await this.network.joinLobby(lobbyId);
        // matchState will be synced via lobby:joined event handler
    }
    /**
     * Leave current lobby
     */
    async leaveLobby() {
        console.log(`[GrandmasterNetworkManager] leaveLobby called`);
        await this.network.leaveLobby();
        this.matchState = null;
        this.opponentStates.clear();
    }
    /**
     * List available lobbies
     */
    async listLobbies() {
        const lobbies = await this.network.lobby.listLobbies();
        return lobbies.map(l => ({
            id: l.id,
            name: l.name,
            players: l.players.length,
            maxPlayers: l.maxPlayers,
            mode: l.settings?.mode || 'unknown',
        }));
    }
    /**
     * Set ready status in lobby
     */
    async setReady(ready) {
        // Update local state
        if (this.matchState && this.localPlayerId) {
            const localPlayer = this.matchState.players.find(p => p.id === this.localPlayerId);
            if (localPlayer) {
                localPlayer.ready = ready;
                console.log(`[GrandmasterNetworkManager] setReady: ${ready} for ${this.localPlayerId}`);
            }
        }
        this.network.setReady(ready);
    }
    /**
     * Start match (host only)
     * Uses SDK lobby system's countdown mechanism
     */
    async startMatch() {
        console.log(`[GrandmasterNetworkManager] startMatch called`);
        this.network.lobby.startCountdown(3);
    }
    /**
     * Send game state update
     */
    sendUpdate(gameState) {
        if (!this.localPlayerId)
            return;
        const update = {
            playerId: this.localPlayerId,
            playerName: this.localPlayerName,
            timestamp: Date.now(),
            board: gameState.board,
            level: gameState.level,
            score: gameState.score,
            grade: gameState.grade,
            combo: gameState.combo,
            attacking: gameState.combo > 0,
        };
        // Must emit on the broker socket, not the NetworkEngine EventEmitter.
        // NetworkEngine.emit() is local-only; broker delivery requires socket.emit().
        this.network.connection.getSocket()?.emit('game:update', update);
    }
    /**
     * Send attack to opponent(s)
     */
    sendAttack(attack) {
        this.network.connection.getSocket()?.emit('game:attack', attack);
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
     * Subscribe to network engine events (forwarded, not local)
     */
    onNetwork(event, callback) {
        this.network.on(event, callback);
    }
    /**
     * Emit to network engine (forwarded to broker)
     */
    emitNetwork(event, ...args) {
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