/**
 * Network Engine - Comprehensive Multiplayer Framework
 *
 * A complete multiplayer game framework providing everything modern games need:
 * - Real-time and turn-based multiplayer
 * - Matchmaking with skill-based ranking
 * - Pre-game lobbies with team management
 * - State synchronization with multiple strategies
 * - Client-side prediction and server reconciliation
 * - Entity interpolation for smooth movement
 * - Player presence and activity tracking
 * - Social features (friends, parties, voice chat)
 * - Leaderboards, statistics, and achievements
 * - Game replay recording and playback
 * - Anti-cheat and security validation
 *
 * @example Quick Start
 * ```typescript
 * const network = new NetworkEngine();
 * await network.connect('ws://game-server.com');
 *
 * // Join matchmaking
 * await network.matchmaking.joinQueue({ queueType: 'ranked', gameMode: 'deathmatch' });
 *
 * // Or create a lobby
 * const lobby = await network.lobby.create({ name: 'My Game', maxPlayers: 8 });
 * ```
 *
 * @example Real-time Game with Prediction
 * ```typescript
 * network.prediction.setSimulationCallback((state, input) => {
 *   // Apply input to state and return new state
 *   return simulatePhysics(state, input);
 * });
 *
 * // Player input - predicted locally, sent to server
 * network.prediction.predictInput({ action: 'jump', axis: { x: 1, y: 0 } });
 *
 * // Server state - reconcile predictions
 * network.on('game:state', (state, tick) => {
 *   network.prediction.reconcile(state, tick);
 * });
 * ```
 */
import { EventEmitter } from 'events';
import { ConnectionManager } from './modules/connection';
import { LobbySystem } from './modules/lobby';
import { MatchmakingEngine } from './modules/matchmaking';
import { StateSynchronizer } from './modules/sync';
import { PredictionEngine } from './modules/prediction';
import { InterpolationEngine } from './modules/interpolation';
import { PresenceManager } from './modules/presence';
import { SocialManager } from './modules/social';
import { LeaderboardManager } from './modules/leaderboard';
import { ReplaySystem } from './modules/replay';
import { SecurityManager } from './modules/security';
/**
 * Network Engine
 *
 * The main entry point for multiplayer functionality. Composes all sub-modules
 * and provides convenience methods for common operations.
 */
export class NetworkEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        // Initialize connection manager first (required by other modules)
        this.connection = new ConnectionManager(config.connection);
        // Initialize all sub-modules with connection reference
        this.lobby = new LobbySystem(this.connection);
        this.matchmaking = new MatchmakingEngine(this.connection);
        this.sync = new StateSynchronizer(this.connection, config.sync);
        this.prediction = new PredictionEngine(this.connection, config.prediction);
        this.interpolation = new InterpolationEngine(config.interpolation);
        this.presence = new PresenceManager(this.connection, config.presence);
        this.social = new SocialManager(this.connection);
        this.leaderboard = new LeaderboardManager(this.connection);
        this.replay = new ReplaySystem(this.connection, config.replay);
        this.security = new SecurityManager(this.connection, config.security);
        // Wire up cross-module events
        this.setupCrossModuleEvents();
    }
    /**
     * Connect to game server
     */
    async connect(url, options) {
        const config = url ? { ...options, serverUrl: url } : options;
        await this.connection.connect(config);
        // Initialize all modules
        await Promise.all([
            this.lobby.init(),
            this.matchmaking.init(),
            this.sync.init(),
            this.prediction.init(),
            this.interpolation.init(),
            this.presence.init(),
            this.social.init(),
            this.leaderboard.init(),
            this.replay.init(),
            this.security.init(),
        ]);
        this.emit('connected');
    }
    /**
     * Disconnect from server
     */
    disconnect() {
        this.connection.disconnect();
        this.emit('disconnected');
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connection.state.status === 'connected';
    }
    /**
     * Get connection state
     */
    getConnectionState() {
        return this.connection.state;
    }
    /**
     * Get connection quality
     */
    getConnectionQuality() {
        return this.connection.state.quality;
    }
    /**
     * Get latency
     */
    getLatency() {
        return this.connection.state.latency;
    }
    // ============================================================
    // Convenience Methods - Delegating to sub-modules
    // ============================================================
    // --- Lobby ---
    /**
     * Create a lobby
     */
    async createLobby(config) {
        const fullConfig = {
            name: config.name || 'New Lobby',
            maxPlayers: config.maxPlayers || 8,
            isPrivate: config.isPrivate || false,
            password: config.password,
            teamCount: config.teamCount,
            teamSize: config.teamSize,
            settings: config.settings,
        };
        return this.lobby.create(fullConfig);
    }
    /**
     * Join a lobby
     */
    async joinLobby(lobbyId, password) {
        return this.lobby.join(lobbyId, password);
    }
    /**
     * Leave current lobby
     */
    async leaveLobby() {
        return this.lobby.leave();
    }
    /**
     * Set ready status
     */
    setReady(ready) {
        this.lobby.setReady(ready);
    }
    // --- Matchmaking ---
    /**
     * Join matchmaking queue
     */
    async joinQueue(config) {
        const fullConfig = {
            queueType: config.queueType || 'casual',
            gameMode: config.gameMode || 'default',
            partyId: config.partyId,
            preferredRegions: config.preferredRegions || [],
            skillRange: config.skillRange,
            maxWaitTime: config.maxWaitTime,
        };
        return this.matchmaking.joinQueue(fullConfig);
    }
    /**
     * Leave matchmaking queue
     */
    async leaveQueue() {
        return this.matchmaking.leaveQueue();
    }
    /**
     * Accept a match
     */
    async acceptMatch() {
        return this.matchmaking.acceptMatch();
    }
    // --- Presence ---
    /**
     * Set online status
     */
    setStatus(status) {
        this.presence.setStatus(status);
    }
    /**
     * Set game activity
     */
    setGameActivity(game, details) {
        this.presence.setGameActivity(game, details);
    }
    // --- Social ---
    /**
     * Add friend
     */
    async addFriend(playerId) {
        return this.social.addFriend(playerId);
    }
    /**
     * Create party
     */
    async createParty() {
        return this.social.createParty();
    }
    /**
     * Invite to game
     */
    async inviteToGame(playerId, roomId) {
        return this.social.inviteToGame(playerId, roomId);
    }
    // --- Leaderboard ---
    /**
     * Get leaderboard
     */
    async getLeaderboard(query) {
        return this.leaderboard.getLeaderboard(query);
    }
    /**
     * Get player stats
     */
    async getStats(playerId) {
        return this.leaderboard.getStats(playerId);
    }
    // --- Replay ---
    /**
     * Start recording
     */
    startRecording() {
        this.replay.startRecording();
    }
    /**
     * Stop recording
     */
    async stopRecording() {
        return this.replay.stopRecording();
    }
    // ============================================================
    // Private Methods
    // ============================================================
    /**
     * Setup cross-module event wiring
     */
    setupCrossModuleEvents() {
        // Connection events bubble up
        this.connection.on('connected', () => this.emit('connected'));
        this.connection.on('disconnected', (reason) => this.emit('disconnected', reason));
        this.connection.on('reconnecting', (attempt) => this.emit('reconnecting', attempt));
        this.connection.on('quality:changed', (quality) => this.emit('quality:changed', quality));
        // Matchmaking -> Lobby transition
        this.matchmaking.on('match:ready', (match) => {
            this.emit('match:ready', match);
            // Lobby creation/joining is handled by the server after match is found
        });
        // Lobby -> Game transition
        this.lobby.on('game:starting', () => {
            this.emit('game:starting');
            // Start recording if replay enabled
            const lobby = this.lobby.current;
            if (lobby && !this.replay.isRecording) {
                // Auto-start recording could be enabled here
            }
        });
        // Presence auto-updates
        this.lobby.on('joined', (lobby) => {
            this.presence.setLobbyActivity(lobby.name);
        });
        this.lobby.on('left', () => {
            this.presence.clearActivity();
        });
        // Security validation on inputs
        this.prediction.on('input:local', (input) => {
            const validation = this.security.validateInput(0, input);
            if (!validation.valid) {
                this.emit('security:warning', validation);
            }
        });
        // Achievement unlocks
        this.leaderboard.on('achievement:unlocked', (achievement) => {
            this.emit('achievement:unlocked', achievement);
        });
    }
    /**
     * Dispose of all modules
     */
    dispose() {
        // Dispose all modules
        this.connection.dispose();
        this.lobby.dispose();
        this.matchmaking.dispose();
        this.sync.dispose();
        this.prediction.dispose();
        this.interpolation.dispose();
        this.presence.dispose();
        this.social.dispose();
        this.leaderboard.dispose();
        this.replay.dispose();
        this.security.dispose();
        this.removeAllListeners();
    }
}
export default NetworkEngine;
