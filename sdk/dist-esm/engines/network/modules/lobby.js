/**
 * Lobby System Module
 *
 * Pre-game coordination with:
 * - Lobby lifecycle (waiting, countdown, starting, in-game)
 * - Team management and balancing
 * - Map/mode voting
 * - Ready check with timeout
 * - Lobby chat
 * - Custom game settings
 * - Invite system
 */
import { EventEmitter } from 'events';
// Default game settings
const DEFAULT_SETTINGS = {
    mode: 'default',
    customRules: {},
};
// Default lobby config
const DEFAULT_CONFIG = {
    name: 'New Lobby',
    maxPlayers: 8,
    teamCount: 0,
    teamSize: 4,
    isPrivate: false,
    password: undefined,
    settings: DEFAULT_SETTINGS,
    allowVoting: true,
    readyTimeout: 60000,
};
/**
 * Lobby System
 *
 * Manages pre-game lobby coordination including teams, voting,
 * ready checks, and game settings.
 */
export class LobbySystem extends EventEmitter {
    constructor(connection) {
        super();
        this.name = 'lobby';
        this._current = null;
        this.localPlayer = null;
        this.connection = connection;
        this.setupEventHandlers();
    }
    /**
     * Get current lobby
     */
    get current() {
        return this._current;
    }
    /**
     * Initialize lobby system
     */
    async init() {
        // Nothing to initialize
    }
    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        const socket = this.connection.getSocket();
        if (!socket)
            return;
        socket.on('lobby:created', (lobby) => {
            this._current = lobby;
            this.emit('lobby:created', lobby);
        });
        socket.on('lobby:joined', (lobby) => {
            this._current = lobby;
            this.emit('lobby:joined', lobby);
        });
        socket.on('lobby:updated', (lobby) => {
            this._current = lobby;
            this.emit('lobby:updated', lobby);
        });
        socket.on('lobby:player_joined', (player) => {
            if (this._current) {
                this._current.players.push(player);
                this.emit('player:joined', player);
            }
        });
        socket.on('lobby:player_left', (playerId) => {
            if (this._current) {
                const player = this._current.players.find(p => p.id === playerId);
                this._current.players = this._current.players.filter(p => p.id !== playerId);
                if (player) {
                    this.emit('player:left', player);
                }
            }
        });
        socket.on('lobby:player_ready', (data) => {
            if (this._current) {
                const player = this._current.players.find(p => p.id === data.playerId);
                if (player) {
                    player.ready = data.ready;
                    this.emit('player:ready', data.playerId, data.ready);
                    this.checkAllReady();
                }
            }
        });
        socket.on('lobby:team_changed', (data) => {
            if (this._current) {
                const player = this._current.players.find(p => p.id === data.playerId);
                if (player) {
                    // Remove from old team
                    this._current.teams.forEach(team => {
                        team.players = team.players.filter(p => p.id !== data.playerId);
                    });
                    // Add to new team
                    const newTeam = this._current.teams.find(t => t.id === data.teamId);
                    if (newTeam) {
                        newTeam.players.push(player);
                        player.team = data.teamId;
                    }
                    this.emit('team:changed', data.playerId, data.teamId);
                }
            }
        });
        socket.on('lobby:settings_changed', (settings) => {
            if (this._current) {
                this._current.settings = settings;
                this.emit('settings:changed', settings);
            }
        });
        socket.on('lobby:chat', (message) => {
            if (this._current) {
                this._current.chat.push(message);
                this.emit('lobby:chat', message);
            }
        });
        socket.on('lobby:vote_started', (vote) => {
            if (this._current) {
                this._current.votes.push(vote);
                this.emit('vote:started', vote);
            }
        });
        socket.on('lobby:vote_updated', (vote) => {
            if (this._current) {
                const idx = this._current.votes.findIndex(v => v.id === vote.id);
                if (idx >= 0) {
                    this._current.votes[idx] = vote;
                }
                this.emit('vote:updated', vote);
            }
        });
        socket.on('lobby:vote_ended', (data) => {
            if (this._current) {
                this._current.votes = this._current.votes.filter(v => v.id !== data.voteId);
                this.emit('vote:ended', data.voteId, data.result);
            }
        });
        socket.on('lobby:countdown', (seconds) => {
            if (this._current) {
                this._current.countdown = seconds;
                this._current.state = seconds > 0 ? 'countdown' : 'waiting';
                this.emit('countdown', seconds);
            }
        });
        socket.on('lobby:game_starting', () => {
            if (this._current) {
                this._current.state = 'starting';
                this.emit('game:starting');
            }
        });
        socket.on('lobby:game_started', () => {
            if (this._current) {
                this._current.state = 'playing';
                this.emit('game:start');
            }
        });
        socket.on('lobby:closed', () => {
            this._current = null;
            this.emit('lobby:closed');
        });
        socket.on('lobby:kicked', (reason) => {
            this._current = null;
            this.emit('kicked', reason);
        });
        socket.on('lobby:host_changed', (newHostId) => {
            if (this._current) {
                const newHost = this._current.players.find(p => p.id === newHostId);
                if (newHost) {
                    this._current.players.forEach(p => p.isHost = false);
                    newHost.isHost = true;
                    this._current.host = newHost;
                    this.emit('host:changed', newHost);
                }
            }
        });
    }
    /**
     * Create a new lobby
     */
    async create(config) {
        const fullConfig = { ...DEFAULT_CONFIG, ...config };
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('lobby:create', fullConfig, (response) => {
                if (response.success && response.lobby) {
                    this._current = response.lobby;
                    this.localPlayer = response.lobby.host;
                    resolve(response.lobby);
                }
                else {
                    reject(new Error(response.error || 'Failed to create lobby'));
                }
            });
        });
    }
    /**
     * Join an existing lobby
     */
    async join(lobbyId, password) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('lobby:join', { lobbyId, password }, (response) => {
                if (response.success && response.lobby) {
                    this._current = response.lobby;
                    this.localPlayer = response.lobby.players.find(p => p.id === socket.userId) || null;
                    resolve(response.lobby);
                }
                else {
                    reject(new Error(response.error || 'Failed to join lobby'));
                }
            });
        });
    }
    /**
     * Join lobby by invite code
     */
    async joinByCode(inviteCode) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('lobby:join_by_code', { inviteCode }, (response) => {
                if (response.success && response.lobby) {
                    this._current = response.lobby;
                    this.localPlayer = response.lobby.players.find(p => p.id === socket.userId) || null;
                    resolve(response.lobby);
                }
                else {
                    reject(new Error(response.error || 'Invalid invite code'));
                }
            });
        });
    }
    /**
     * Leave current lobby
     */
    leave() {
        if (!this._current)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:leave');
        }
        this.cleanup();
        this._current = null;
        this.localPlayer = null;
        this.emit('lobby:left');
    }
    /**
     * Set ready status
     */
    setReady(ready) {
        if (!this._current || !this.localPlayer)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:ready', { ready });
            this.localPlayer.ready = ready;
        }
    }
    /**
     * Toggle ready status
     */
    toggleReady() {
        if (this.localPlayer) {
            this.setReady(!this.localPlayer.ready);
        }
    }
    /**
     * Set team
     */
    setTeam(teamId) {
        if (!this._current || !this.localPlayer)
            return;
        const team = this._current.teams.find(t => t.id === teamId);
        if (!team)
            return;
        // Check if team is full
        if (team.players.length >= team.maxSize) {
            this.emit('error', new Error('Team is full'));
            return;
        }
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:set_team', { teamId });
        }
    }
    /**
     * Set player color (cosmetic)
     */
    setColor(color) {
        if (!this._current || !this.localPlayer)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:set_color', { color });
            this.localPlayer.color = color;
        }
    }
    /**
     * Set player character (cosmetic)
     */
    setCharacter(character) {
        if (!this._current || !this.localPlayer)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:set_character', { character });
            this.localPlayer.character = character;
        }
    }
    /**
     * Update game settings (host only)
     */
    setSettings(settings) {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            const newSettings = { ...this._current.settings, ...settings };
            socket.emit('lobby:set_settings', newSettings);
        }
    }
    /**
     * Start a vote
     */
    startVote(type, options, duration = 30000) {
        if (!this._current)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:start_vote', { type, options, duration });
        }
    }
    /**
     * Cast a vote
     */
    vote(voteId, optionId) {
        if (!this._current)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:vote', { voteId, optionId });
        }
    }
    /**
     * Send chat message
     */
    chat(message) {
        if (!this._current || !this.localPlayer)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:chat', { message });
        }
    }
    /**
     * Send emote
     */
    emote(emoteId) {
        if (!this._current || !this.localPlayer)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:emote', { emoteId });
        }
    }
    /**
     * Kick player (host only)
     */
    kick(playerId, reason) {
        if (!this._current || !this.isHost())
            return;
        if (playerId === this.localPlayer?.id)
            return; // Can't kick yourself
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:kick', { playerId, reason });
        }
    }
    /**
     * Ban player (host only)
     */
    ban(playerId, reason) {
        if (!this._current || !this.isHost())
            return;
        if (playerId === this.localPlayer?.id)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:ban', { playerId, reason });
        }
    }
    /**
     * Transfer host to another player
     */
    transferHost(playerId) {
        if (!this._current || !this.isHost())
            return;
        if (playerId === this.localPlayer?.id)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:transfer_host', { playerId });
        }
    }
    /**
     * Start countdown (host only)
     */
    startCountdown(seconds = 5) {
        if (!this._current || !this.isHost())
            return;
        // Check if minimum players
        const nonSpectators = this._current.players.filter(p => !p.team || p.team > 0);
        if (nonSpectators.length < 2) {
            this.emit('error', new Error('Need at least 2 players'));
            return;
        }
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:start_countdown', { seconds });
        }
    }
    /**
     * Cancel countdown (host only)
     */
    cancelCountdown() {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:cancel_countdown');
        }
    }
    /**
     * Start game immediately (host only)
     */
    startGame() {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:start_game');
        }
    }
    /**
     * Force start game even if not all ready (host only)
     */
    forceStart() {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:force_start');
        }
    }
    /**
     * Generate invite link
     */
    async getInviteCode() {
        if (!this._current) {
            throw new Error('Not in a lobby');
        }
        if (this._current.inviteCode) {
            return this._current.inviteCode;
        }
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('lobby:get_invite_code', {}, (response) => {
                if (response.success && response.code) {
                    this._current.inviteCode = response.code;
                    resolve(response.code);
                }
                else {
                    reject(new Error(response.error || 'Failed to get invite code'));
                }
            });
        });
    }
    /**
     * Check if local player is host
     */
    isHost() {
        return this.localPlayer?.isHost || false;
    }
    /**
     * Check if local player is ready
     */
    isReady() {
        return this.localPlayer?.ready || false;
    }
    /**
     * Check if all players are ready
     */
    checkAllReady() {
        if (!this._current)
            return;
        const playingPlayers = this._current.players.filter(p => !p.team || p.team > 0);
        const allReady = playingPlayers.length >= 2 && playingPlayers.every(p => p.ready);
        if (allReady) {
            this.emit('all_ready');
        }
    }
    /**
     * Auto-balance teams
     */
    autoBalanceTeams() {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:auto_balance');
        }
    }
    /**
     * Shuffle teams
     */
    shuffleTeams() {
        if (!this._current || !this.isHost())
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('lobby:shuffle_teams');
        }
    }
    /**
     * List available lobbies
     */
    async listLobbies(options) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('lobby:list', options || {}, (response) => {
                if (response.success && response.lobbies) {
                    resolve(response.lobbies);
                }
                else {
                    reject(new Error(response.error || 'Failed to list lobbies'));
                }
            });
        });
    }
    /**
     * Cleanup internal state
     */
    cleanup() {
        if (this.readyTimeout) {
            clearTimeout(this.readyTimeout);
            this.readyTimeout = undefined;
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = undefined;
        }
    }
    /**
     * Dispose of lobby system
     */
    dispose() {
        this.leave();
        this.removeAllListeners();
    }
}
export default LobbySystem;
