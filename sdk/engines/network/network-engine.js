"use strict";
/**
 * Network Engine - Multiplayer Support
 *
 * Provides real-time and turn-based multiplayer functionality for BBS doors.
 * Handles session management, state synchronization, and network messaging.
 *
 * Features:
 * - Real-time multiplayer (WebSocket-based)
 * - Turn-based multiplayer (event-driven)
 * - Session/room management
 * - State synchronization
 * - Player discovery
 * - Network message routing
 * - Latency compensation
 *
 * @example Real-time Multiplayer
 * ```typescript
 * const network = new NetworkEngine({ mode: 'realtime' });
 *
 * network.createRoom('game1', { maxPlayers: 4 });
 * network.onPlayerJoin((player) => {
 *   console.log(`${player.name} joined`);
 * });
 *
 * network.broadcast({ type: 'game-state', data: gameState });
 * ```
 *
 * @example Turn-based Multiplayer
 * ```typescript
 * const network = new NetworkEngine({ mode: 'turn-based' });
 *
 * network.createRoom('chess', { maxPlayers: 2, turnBased: true });
 * network.onTurn((player) => {
 *   console.log(`It's ${player.name}'s turn`);
 * });
 *
 * network.endTurn(); // Advance to next player
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkEngine = void 0;
const events_1 = require("events");
/**
 * Network Engine
 * Handles all multiplayer communication and synchronization
 */
class NetworkEngine extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.rooms = new Map();
        this.syncStates = new Map();
        this.messageQueue = [];
        this.connected = false;
        this.config = {
            mode: config.mode,
            serverUrl: config.serverUrl || 'ws://localhost:3002',
            latencyCompensation: config.latencyCompensation ?? true,
            tickRate: config.tickRate ?? 50, // 20 FPS
            timeout: config.timeout ?? 5000,
            encryption: config.encryption ?? false
        };
    }
    /**
     * Initialize network engine
     */
    async init(playerId, playerName) {
        this.currentPlayer = {
            id: playerId,
            name: playerName,
            node: 1,
            latency: 0,
            ready: false,
            spectator: false,
            data: {}
        };
        // Connect to server (in production, use actual WebSocket)
        this.connected = true;
        // Start network tick for realtime mode
        if (this.config.mode === 'realtime' || this.config.mode === 'hybrid') {
            this.startNetworkTick();
        }
        this.emit('connected');
    }
    /**
     * Create a new room
     */
    createRoom(roomId, config) {
        if (!this.currentPlayer) {
            throw new Error('Player not initialized');
        }
        const room = {
            config: {
                id: roomId,
                name: config.name || roomId,
                maxPlayers: config.maxPlayers || 4,
                password: config.password,
                turnBased: config.turnBased ?? false,
                turnTimeLimit: config.turnTimeLimit,
                allowSpectators: config.allowSpectators ?? true,
                data: config.data || {}
            },
            players: [this.currentPlayer],
            currentTurn: config.turnBased ? 0 : undefined,
            state: 'waiting',
            hostId: this.currentPlayer.id,
            created: new Date()
        };
        this.rooms.set(roomId, room);
        this.currentRoom = room;
        this.emit('room-created', room);
        return room;
    }
    /**
     * Join an existing room
     */
    joinRoom(roomId, password) {
        if (!this.currentPlayer) {
            throw new Error('Player not initialized');
        }
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} not found`);
        }
        if (room.config.password && room.config.password !== password) {
            throw new Error('Invalid password');
        }
        if (room.players.length >= room.config.maxPlayers) {
            if (room.config.allowSpectators) {
                this.currentPlayer.spectator = true;
            }
            else {
                throw new Error('Room is full');
            }
        }
        room.players.push(this.currentPlayer);
        this.currentRoom = room;
        this.emit('player-joined', this.currentPlayer);
        this.emit('room-joined', room);
        return room;
    }
    /**
     * Leave current room
     */
    leaveRoom() {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        const room = this.currentRoom;
        room.players = room.players.filter(p => p.id !== this.currentPlayer.id);
        // Transfer host if needed
        if (room.hostId === this.currentPlayer.id && room.players.length > 0) {
            room.hostId = room.players[0].id;
            this.emit('host-changed', room.players[0]);
        }
        // Delete room if empty
        if (room.players.length === 0) {
            this.rooms.delete(room.config.id);
            this.emit('room-closed', room);
        }
        this.emit('player-left', this.currentPlayer);
        this.currentRoom = undefined;
    }
    /**
     * List available rooms
     */
    listRooms() {
        return Array.from(this.rooms.values());
    }
    /**
     * Get current room
     */
    getCurrentRoom() {
        return this.currentRoom;
    }
    /**
     * Send message to specific player
     */
    sendTo(playerId, type, data) {
        if (!this.currentPlayer)
            return;
        const message = {
            type,
            from: this.currentPlayer.id,
            to: playerId,
            data,
            timestamp: Date.now()
        };
        this.messageQueue.push(message);
        this.emit('message-sent', message);
        // In production, send via WebSocket
        this.deliverMessage(message);
    }
    /**
     * Broadcast message to all players in room
     */
    broadcast(type, data, includeSpectators = false) {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        const message = {
            type,
            from: this.currentPlayer.id,
            to: 0, // Broadcast
            data,
            timestamp: Date.now()
        };
        this.emit('message-broadcast', message);
        // Send to all players
        this.currentRoom.players.forEach(player => {
            if (player.id !== this.currentPlayer.id) {
                if (!includeSpectators && player.spectator)
                    return;
                this.deliverMessage({ ...message, to: player.id });
            }
        });
    }
    /**
     * Synchronize state across all players
     */
    syncState(key, data) {
        const state = {
            version: (this.syncStates.get(key)?.version || 0) + 1,
            timestamp: Date.now(),
            data,
            checksum: this.generateChecksum(data)
        };
        this.syncStates.set(key, state);
        this.broadcast('sync-state', { key, state });
    }
    /**
     * Get synchronized state
     */
    getSyncState(key) {
        return this.syncStates.get(key);
    }
    /**
     * Set player ready status
     */
    setReady(ready) {
        if (!this.currentPlayer || !this.currentRoom)
            return;
        this.currentPlayer.ready = ready;
        this.broadcast('player-ready', { playerId: this.currentPlayer.id, ready });
        // Check if all players ready
        const allReady = this.currentRoom.players.every(p => p.spectator || p.ready);
        if (allReady && this.currentRoom.state === 'waiting') {
            this.currentRoom.state = 'playing';
            this.emit('game-start');
        }
    }
    /**
     * Start game (host only)
     */
    startGame() {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        if (this.currentRoom.hostId !== this.currentPlayer.id) {
            throw new Error('Only host can start game');
        }
        this.currentRoom.state = 'playing';
        this.broadcast('game-start', {});
        this.emit('game-start');
        if (this.currentRoom.config.turnBased) {
            this.emit('turn-start', this.currentRoom.players[0]);
        }
    }
    /**
     * End current turn (turn-based only)
     */
    endTurn() {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        if (!this.currentRoom.config.turnBased) {
            throw new Error('Not in turn-based mode');
        }
        const currentTurn = this.currentRoom.currentTurn;
        const currentPlayerId = this.currentRoom.players[currentTurn].id;
        if (this.currentPlayer.id !== currentPlayerId) {
            throw new Error('Not your turn');
        }
        // Advance to next player
        this.currentRoom.currentTurn = (currentTurn + 1) % this.currentRoom.players.length;
        const nextPlayer = this.currentRoom.players[this.currentRoom.currentTurn];
        this.broadcast('turn-end', { playerId: currentPlayerId });
        this.broadcast('turn-start', { playerId: nextPlayer.id });
        this.emit('turn-start', nextPlayer);
    }
    /**
     * Get current turn player
     */
    getCurrentTurnPlayer() {
        if (!this.currentRoom || this.currentRoom.currentTurn === undefined)
            return;
        return this.currentRoom.players[this.currentRoom.currentTurn];
    }
    /**
     * Kick player (host only)
     */
    kickPlayer(playerId) {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        if (this.currentRoom.hostId !== this.currentPlayer.id) {
            throw new Error('Only host can kick players');
        }
        const player = this.currentRoom.players.find(p => p.id === playerId);
        if (!player)
            return;
        this.currentRoom.players = this.currentRoom.players.filter(p => p.id !== playerId);
        this.sendTo(playerId, 'kicked', {});
        this.emit('player-kicked', player);
    }
    /**
     * Measure latency to player
     */
    async measureLatency(playerId) {
        const start = Date.now();
        // In production, send ping and wait for pong
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
        return Date.now() - start;
    }
    /**
     * Update player latency
     */
    async updateLatencies() {
        if (!this.currentRoom || !this.currentPlayer)
            return;
        for (const player of this.currentRoom.players) {
            if (player.id !== this.currentPlayer.id) {
                player.latency = await this.measureLatency(player.id);
            }
        }
    }
    /**
     * Network tick (realtime mode)
     */
    startNetworkTick() {
        this.tickInterval = setInterval(() => {
            this.processPendingMessages();
            this.updateLatencies();
            this.emit('network-tick');
        }, this.config.tickRate);
    }
    /**
     * Process pending messages
     */
    processPendingMessages() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            // In production, send via WebSocket
        }
    }
    /**
     * Deliver message to recipient
     */
    deliverMessage(message) {
        // In production, route through WebSocket server
        // For now, emit locally for testing
        setTimeout(() => {
            this.emit('message-received', message);
        }, 10 + Math.random() * 20); // Simulate network delay
    }
    /**
     * Generate checksum for state validation
     */
    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }
    /**
     * Event: Player joined room
     */
    onPlayerJoin(callback) {
        this.on('player-joined', callback);
    }
    /**
     * Event: Player left room
     */
    onPlayerLeave(callback) {
        this.on('player-left', callback);
    }
    /**
     * Event: Message received
     */
    onMessage(callback) {
        this.on('message-received', callback);
    }
    /**
     * Event: Turn started (turn-based)
     */
    onTurnStart(callback) {
        this.on('turn-start', callback);
    }
    /**
     * Event: Game started
     */
    onGameStart(callback) {
        this.on('game-start', callback);
    }
    /**
     * Cleanup
     */
    dispose() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }
        this.leaveRoom();
        this.connected = false;
        this.removeAllListeners();
    }
}
exports.NetworkEngine = NetworkEngine;
