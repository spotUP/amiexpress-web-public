"use strict";
/**
 * TetriNET Lobby Adapter
 *
 * Implements LobbyNetworkAdapter for TetriNET games.
 * Supports both BBS-local and external TetriNET server connections.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetLobbyAdapter = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * TetriNET Lobby Adapter
 */
class TetriNetLobbyAdapter extends blessed_1.EventEmitter {
    constructor(network) {
        super();
        this.state = null;
        this.messageIdCounter = 0;
        this.network = network;
        this.setupEventListeners();
    }
    /**
     * Setup network event forwarding
     */
    setupEventListeners() {
        // Player joined (from TetriNET protocol)
        this.network.on('tetrinet:player_joined', (data) => {
            if (!this.state)
                return;
            const player = {
                slot: data.slot,
                name: data.name,
                team: data.team || '',
                ready: false,
            };
            // Remove any existing player in this slot
            this.state.players = this.state.players.filter(p => p.slot !== data.slot);
            this.state.players.push(player);
            this.state.players.sort((a, b) => a.slot - b.slot);
            this.emit('player:joined', this.convertPlayer(player));
            this.emit('state:updated');
        });
        // Player left
        this.network.on('tetrinet:player_left', (data) => {
            if (!this.state)
                return;
            this.state.players = this.state.players.filter(p => p.slot !== data.slot);
            this.emit('player:left', `slot-${data.slot}`);
            this.emit('state:updated');
        });
        // Team changed
        this.network.on('tetrinet:team', (data) => {
            if (!this.state)
                return;
            const player = this.state.players.find(p => p.slot === data.slot);
            if (player) {
                player.team = data.team;
                this.emit('player:team', { playerId: `slot-${data.slot}`, team: data.team });
                this.emit('state:updated');
            }
        });
        // Chat message (partyline)
        this.network.on('tetrinet:chat', (data) => {
            if (!this.state)
                return;
            const player = this.state.players.find(p => p.slot === data.slot);
            const message = {
                id: `msg-${++this.messageIdCounter}`,
                playerId: `slot-${data.slot}`,
                playerName: player?.name || `Player ${data.slot}`,
                text: data.text,
                timestamp: Date.now(),
                isAction: data.isAction,
            };
            this.state.chatMessages.push(message);
            this.emit('chat:message', message);
        });
        // Game message (server announcement)
        this.network.on('tetrinet:gmsg', (data) => {
            if (!this.state)
                return;
            const message = {
                id: `msg-${++this.messageIdCounter}`,
                playerId: 'server',
                playerName: 'Server',
                text: data.text,
                timestamp: Date.now(),
                isSystem: true,
            };
            this.state.chatMessages.push(message);
            this.emit('chat:message', message);
        });
        // Winlist updated
        this.network.on('tetrinet:winlist', (data) => {
            if (!this.state)
                return;
            this.state.winlist = data.entries.map((entry, index) => ({
                rank: index + 1,
                name: entry.name,
                score: entry.score,
                isTeam: entry.type === 't',
            }));
            this.emit('leaderboard:updated', this.state.winlist);
        });
        // Game options updated (newgame command)
        this.network.on('tetrinet:options', (options) => {
            if (!this.state)
                return;
            this.state.gameOptions = { ...this.state.gameOptions, ...options };
            this.emit('settings:updated', this.state.gameOptions);
        });
        // Match starting
        this.network.on('tetrinet:newgame', () => {
            this.emit('match:starting');
            // Short delay then match:started
            setTimeout(() => {
                this.emit('match:started');
            }, 1000);
        });
        // Game ended
        this.network.on('tetrinet:endgame', () => {
            // Back to waiting state
            if (this.state) {
                this.state.players.forEach(p => p.ready = false);
                this.emit('state:updated');
            }
        });
    }
    /**
     * Convert TetriNET player to lobby player info
     */
    convertPlayer(player) {
        return {
            id: `slot-${player.slot}`,
            name: player.name,
            slot: player.slot,
            team: player.team || undefined,
            ready: player.ready,
            isBot: false,
        };
    }
    /**
     * Get current lobby state
     */
    getState() {
        if (!this.state)
            return null;
        return {
            lobbyId: this.state.lobbyId,
            mode: this.state.mode,
            players: this.state.players.map(p => this.convertPlayer(p)),
            status: 'waiting',
            hostId: this.state.isHost ? `slot-${this.state.localSlot}` : undefined,
            settings: this.state.gameOptions,
            chatMessages: this.state.chatMessages,
            leaderboard: this.state.winlist,
        };
    }
    /**
     * Join matchmaking queue (creates BBS-local game)
     */
    async joinQueue(mode) {
        // For TetriNET, matchmaking creates a local game
        await this.createLobby(mode);
    }
    /**
     * Create a new lobby (BBS-local TetriNET game)
     */
    async createLobby(mode, _isPrivate) {
        const lobbyId = `tnet-${Date.now().toString(36)}`;
        // Initialize state
        this.state = {
            lobbyId,
            mode,
            players: [],
            localSlot: 1, // Host gets slot 1
            isHost: true,
            gameOptions: this.getDefaultOptions(mode),
            winlist: [],
            chatMessages: [],
        };
        // Add self as first player
        // Note: In real implementation, this would come from the network
        this.emit('state:updated');
        return lobbyId;
    }
    /**
     * Join existing lobby
     */
    async joinLobby(lobbyId) {
        // Initialize state for joining
        this.state = {
            lobbyId,
            mode: 'standard',
            players: [],
            localSlot: null, // Will be assigned by server
            isHost: false,
            gameOptions: this.getDefaultOptions('standard'),
            winlist: [],
            chatMessages: [],
        };
        // In real implementation, would send join request to server
        this.emit('state:updated');
    }
    /**
     * Leave lobby
     */
    async leaveLobby() {
        if (this.state?.localSlot) {
            // Send leave message
            this.network.emit('tetrinet:leave', { slot: this.state.localSlot });
        }
        this.state = null;
    }
    /**
     * Set ready state
     */
    async setReady(ready) {
        if (!this.state?.localSlot)
            return;
        const player = this.state.players.find(p => p.slot === this.state?.localSlot);
        if (player) {
            player.ready = ready;
            this.emit('player:ready', { playerId: `slot-${this.state.localSlot}`, ready });
            this.emit('state:updated');
        }
    }
    /**
     * Start match (host only)
     */
    async startMatch() {
        if (!this.state?.isHost)
            return;
        // Send newgame command with current options
        this.network.emit('tetrinet:startgame', this.state.gameOptions);
        // Local fallback: start immediately when no server echoes newgame
        this.emit('match:starting');
        setTimeout(() => {
            this.emit('match:started');
        }, 1000);
    }
    /**
     * Send chat message
     */
    sendChat(message, isAction) {
        if (!this.state?.localSlot)
            return;
        // Send to network
        this.network.emit('tetrinet:chat', {
            slot: this.state.localSlot,
            text: message,
            isAction,
        });
        // Also add locally (for immediate feedback)
        const player = this.state.players.find(p => p.slot === this.state?.localSlot);
        const chatMessage = {
            id: `msg-${++this.messageIdCounter}`,
            playerId: `slot-${this.state.localSlot}`,
            playerName: player?.name || 'You',
            text: message,
            timestamp: Date.now(),
            isAction,
        };
        this.state.chatMessages.push(chatMessage);
        this.emit('chat:message', chatMessage);
    }
    /**
     * Set team
     */
    async setTeam(team) {
        if (!this.state?.localSlot)
            return;
        const player = this.state.players.find(p => p.slot === this.state?.localSlot);
        if (player) {
            player.team = team;
            // Send to network
            this.network.emit('tetrinet:team', {
                slot: this.state.localSlot,
                team,
            });
            this.emit('player:team', { playerId: `slot-${this.state.localSlot}`, team });
            this.emit('state:updated');
        }
    }
    /**
     * Update game settings (host only)
     */
    async updateSettings(settings) {
        if (!this.state?.isHost)
            return;
        this.state.gameOptions = {
            ...this.state.gameOptions,
            ...settings,
        };
        // Broadcast to other players
        this.network.emit('tetrinet:options', this.state.gameOptions);
        this.emit('settings:updated', settings);
    }
    /**
     * Get default game options for a mode
     */
    getDefaultOptions(mode) {
        const ruleMap = {
            classic: 'classic',
            standard: 'standard',
            extended: 'extended',
        };
        return {
            rule: ruleMap[mode] || 'standard',
            noSpecials: mode === 'classic',
            inventorySize: 10,
            linesToMakeForSpecials: 1,
            specialsAddedEachTime: 1,
            specialOccurancies: [], // Use default rates from rule set
            startingHeight: 0,
            linesPerLevel: 2,
            levelIncrement: 1,
            pieceFrequency: [14, 28, 42, 56, 70, 84, 100],
            specialFrequency: [11, 22, 33, 44, 55, 66, 77, 88, 100],
            levelAverage: false,
            classicMode: mode === 'classic',
            startingLevel: 1,
            classicStyleMultiplayer: false,
            nextPieceDelayMs: 1000,
            delayBeforeSuddenDeath: 2,
            suddenDeathTick: 10,
        };
    }
    /**
     * Add local player to lobby (called after connection established)
     */
    addLocalPlayer(name, slot) {
        if (!this.state)
            return;
        this.state.localSlot = slot;
        const player = {
            slot,
            name,
            team: '',
            ready: this.state.isHost, // Host is always ready
        };
        this.state.players.push(player);
        this.state.players.sort((a, b) => a.slot - b.slot);
        this.emit('player:joined', this.convertPlayer(player));
        this.emit('state:updated');
    }
}
exports.TetriNetLobbyAdapter = TetriNetLobbyAdapter;
//# sourceMappingURL=tetrinet-lobby-adapter.js.map