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

import { EventEmitter } from 'events';
import { NetworkMessage } from '../../core/types';

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** Multiplayer mode */
  mode: 'realtime' | 'turn-based' | 'hybrid';
  /** Server URL (optional, defaults to BBS server) */
  serverUrl?: string;
  /** Enable latency compensation */
  latencyCompensation?: boolean;
  /** Network tick rate (ms, realtime only) */
  tickRate?: number;
  /** Connection timeout (ms) */
  timeout?: number;
  /** Enable encryption */
  encryption?: boolean;
}

/**
 * Room/session configuration
 */
export interface RoomConfig {
  /** Room ID */
  id: string;
  /** Room name */
  name: string;
  /** Maximum players */
  maxPlayers: number;
  /** Is room password protected? */
  password?: string;
  /** Turn-based mode */
  turnBased?: boolean;
  /** Turn time limit (seconds, turn-based only) */
  turnTimeLimit?: number;
  /** Allow spectators */
  allowSpectators?: boolean;
  /** Custom room data */
  data?: Record<string, any>;
}

/**
 * Player information
 */
export interface NetworkPlayer {
  /** Player ID */
  id: number;
  /** Username */
  name: string;
  /** Node number */
  node: number;
  /** Connection latency (ms) */
  latency: number;
  /** Is ready? */
  ready: boolean;
  /** Is spectator? */
  spectator: boolean;
  /** Custom player data */
  data: Record<string, any>;
}

/**
 * Room state
 */
export interface Room {
  /** Room configuration */
  config: RoomConfig;
  /** Players in room */
  players: NetworkPlayer[];
  /** Current turn (turn-based only) */
  currentTurn?: number;
  /** Room state */
  state: 'waiting' | 'playing' | 'finished';
  /** Host player ID */
  hostId: number;
  /** Creation timestamp */
  created: Date;
}

/**
 * Network synchronization state
 */
export interface SyncState {
  /** State version/sequence number */
  version: number;
  /** State timestamp */
  timestamp: number;
  /** State data */
  data: any;
  /** State checksum (for validation) */
  checksum?: string;
}

/**
 * Network Engine
 * Handles all multiplayer communication and synchronization
 */
export class NetworkEngine extends EventEmitter {
  private config: Required<NetworkConfig>;
  private rooms: Map<string, Room> = new Map();
  private currentRoom?: Room;
  private currentPlayer?: NetworkPlayer;
  private syncStates: Map<string, SyncState> = new Map();
  private messageQueue: NetworkMessage[] = [];
  private connected: boolean = false;
  private tickInterval?: NodeJS.Timeout;

  constructor(config: NetworkConfig) {
    super();

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
  async init(playerId: number, playerName: string): Promise<void> {
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
  createRoom(roomId: string, config: Partial<RoomConfig>): Room {
    if (!this.currentPlayer) {
      throw new Error('Player not initialized');
    }

    const room: Room = {
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
  joinRoom(roomId: string, password?: string): Room {
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
      } else {
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
  leaveRoom(): void {
    if (!this.currentRoom || !this.currentPlayer) return;

    const room = this.currentRoom;
    room.players = room.players.filter(p => p.id !== this.currentPlayer!.id);

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
  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get current room
   */
  getCurrentRoom(): Room | undefined {
    return this.currentRoom;
  }

  /**
   * Send message to specific player
   */
  sendTo(playerId: number, type: string, data: any): void {
    if (!this.currentPlayer) return;

    const message: NetworkMessage = {
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
  broadcast(type: string, data: any, includeSpectators: boolean = false): void {
    if (!this.currentRoom || !this.currentPlayer) return;

    const message: NetworkMessage = {
      type,
      from: this.currentPlayer.id,
      to: 0, // Broadcast
      data,
      timestamp: Date.now()
    };

    this.emit('message-broadcast', message);

    // Send to all players
    this.currentRoom.players.forEach(player => {
      if (player.id !== this.currentPlayer!.id) {
        if (!includeSpectators && player.spectator) return;
        this.deliverMessage({ ...message, to: player.id });
      }
    });
  }

  /**
   * Synchronize state across all players
   */
  syncState(key: string, data: any): void {
    const state: SyncState = {
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
  getSyncState(key: string): SyncState | undefined {
    return this.syncStates.get(key);
  }

  /**
   * Set player ready status
   */
  setReady(ready: boolean): void {
    if (!this.currentPlayer || !this.currentRoom) return;

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
  startGame(): void {
    if (!this.currentRoom || !this.currentPlayer) return;
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
  endTurn(): void {
    if (!this.currentRoom || !this.currentPlayer) return;
    if (!this.currentRoom.config.turnBased) {
      throw new Error('Not in turn-based mode');
    }

    const currentTurn = this.currentRoom.currentTurn!;
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
  getCurrentTurnPlayer(): NetworkPlayer | undefined {
    if (!this.currentRoom || this.currentRoom.currentTurn === undefined) return;
    return this.currentRoom.players[this.currentRoom.currentTurn];
  }

  /**
   * Kick player (host only)
   */
  kickPlayer(playerId: number): void {
    if (!this.currentRoom || !this.currentPlayer) return;
    if (this.currentRoom.hostId !== this.currentPlayer.id) {
      throw new Error('Only host can kick players');
    }

    const player = this.currentRoom.players.find(p => p.id === playerId);
    if (!player) return;

    this.currentRoom.players = this.currentRoom.players.filter(p => p.id !== playerId);
    this.sendTo(playerId, 'kicked', {});
    this.emit('player-kicked', player);
  }

  /**
   * Measure latency to player
   */
  async measureLatency(playerId: number): Promise<number> {
    const start = Date.now();
    // In production, send ping and wait for pong
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    return Date.now() - start;
  }

  /**
   * Update player latency
   */
  private async updateLatencies(): Promise<void> {
    if (!this.currentRoom || !this.currentPlayer) return;

    for (const player of this.currentRoom.players) {
      if (player.id !== this.currentPlayer.id) {
        player.latency = await this.measureLatency(player.id);
      }
    }
  }

  /**
   * Network tick (realtime mode)
   */
  private startNetworkTick(): void {
    this.tickInterval = setInterval(() => {
      this.processPendingMessages();
      this.updateLatencies();
      this.emit('network-tick');
    }, this.config.tickRate);
  }

  /**
   * Process pending messages
   */
  private processPendingMessages(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      // In production, send via WebSocket
    }
  }

  /**
   * Deliver message to recipient
   */
  private deliverMessage(message: NetworkMessage): void {
    // In production, route through WebSocket server
    // For now, emit locally for testing
    setTimeout(() => {
      this.emit('message-received', message);
    }, 10 + Math.random() * 20); // Simulate network delay
  }

  /**
   * Generate checksum for state validation
   */
  private generateChecksum(data: any): string {
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
  onPlayerJoin(callback: (player: NetworkPlayer) => void): void {
    this.on('player-joined', callback);
  }

  /**
   * Event: Player left room
   */
  onPlayerLeave(callback: (player: NetworkPlayer) => void): void {
    this.on('player-left', callback);
  }

  /**
   * Event: Message received
   */
  onMessage(callback: (message: NetworkMessage) => void): void {
    this.on('message-received', callback);
  }

  /**
   * Event: Turn started (turn-based)
   */
  onTurnStart(callback: (player: NetworkPlayer) => void): void {
    this.on('turn-start', callback);
  }

  /**
   * Event: Game started
   */
  onGameStart(callback: () => void): void {
    this.on('game-start', callback);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    this.leaveRoom();
    this.connected = false;
    this.removeAllListeners();
  }
}
