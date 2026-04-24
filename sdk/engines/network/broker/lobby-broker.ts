/**
 * In-Process Lobby Broker
 *
 * Global singleton that coordinates multiplayer lobbies between
 * door instances running in the same Node.js process.
 * Uses globalThis with Symbol.for() to guarantee single instance
 * even if the SDK is bundled multiple times.
 */

import type {
  Lobby,
  LobbyConfig,
  LobbyPlayer,
  GameSettings,
  LobbyChatMessage,
  RoomState,
} from '../types';

const BROKER_KEY = Symbol.for('aex-lobby-broker');

/**
 * Broker client interface - the socket-like adapter each player uses
 */
export interface IBrokerClient {
  readonly clientId: string;
  readonly playerId: number;
  readonly playerName: string;
  readonly nodeId: number;
  deliver(event: string, ...args: any[]): void;
}

/**
 * Lobby Broker - coordinates all multiplayer lobbies in-process
 */
export class LobbyBroker {
  private lobbies: Map<string, Lobby> = new Map();
  private clients: Map<string, IBrokerClient> = new Map();
  private clientLobbies: Map<string, string> = new Map();
  private countdownTimers: Map<string, NodeJS.Timeout[]> = new Map();

  /**
   * Get the global singleton instance
   */
  static getInstance(): LobbyBroker {
    const g = globalThis as any;
    if (!g[BROKER_KEY]) {
      g[BROKER_KEY] = new LobbyBroker();
    }
    return g[BROKER_KEY];
  }

  /**
   * Register a client with the broker
   */
  registerClient(client: IBrokerClient): void {
    this.clients.set(client.clientId, client);
  }

  /**
   * Unregister a client and clean up
   */
  unregisterClient(clientId: string): void {
    const lobbyId = this.clientLobbies.get(clientId);
    if (lobbyId) {
      this.handleLeaveLobby(clientId);
    }
    this.clients.delete(clientId);
  }

  /**
   * Handle an event from a client (replaces socket.emit to server)
   */
  handleEvent(clientId: string, event: string, data: any, callback?: Function): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Process asynchronously to maintain event loop behavior
    process.nextTick(() => {
      try {
        switch (event) {
          case 'lobby:create':
            this.handleCreateLobby(clientId, data, callback);
            break;
          case 'lobby:join':
            this.handleJoinLobby(clientId, data, callback);
            break;
          case 'lobby:join_by_code':
            this.handleJoinByCode(clientId, data, callback);
            break;
          case 'lobby:list':
            this.handleListLobbies(clientId, data, callback);
            break;
          case 'lobby:matchmake':
            this.handleMatchmake(clientId, data, callback);
            break;
          case 'lobby:leave':
            this.handleLeaveLobby(clientId);
            break;
          case 'lobby:ready':
            this.handleReady(clientId, data);
            break;
          case 'lobby:set_team':
            this.handleSetTeam(clientId, data);
            break;
          case 'lobby:set_color':
            this.handleSetColor(clientId, data);
            break;
          case 'lobby:set_character':
            this.handleSetCharacter(clientId, data);
            break;
          case 'lobby:set_settings':
            this.handleSetSettings(clientId, data);
            break;
          case 'lobby:chat':
            this.handleChat(clientId, data);
            break;
          case 'lobby:kick':
            this.handleKick(clientId, data);
            break;
          case 'lobby:transfer_host':
            this.handleTransferHost(clientId, data);
            break;
          case 'lobby:start_countdown':
            this.handleStartCountdown(clientId, data);
            break;
          case 'lobby:cancel_countdown':
            this.handleCancelCountdown(clientId);
            break;
          case 'lobby:start_game':
            this.handleStartGame(clientId);
            break;
          case 'lobby:force_start':
            this.handleForceStart(clientId);
            break;
          case 'lobby:auto_balance':
            this.handleAutoBalance(clientId);
            break;
          case 'lobby:shuffle_teams':
            this.handleShuffleTeams(clientId);
            break;
          case 'lobby:get_invite_code':
            this.handleGetInviteCode(clientId, callback);
            break;
          // Game state events - broadcast to lobby members
          case 'game:update':
          case 'game:attack':
          case 'game:state':
          case 'game:input':
            this.handleGameEvent(clientId, event, data);
            break;
          default:
            // Unknown event - broadcast to lobby if in one
            this.handleGameEvent(clientId, event, data);
            break;
        }
      } catch (err) {
        console.error(`[LobbyBroker] Error handling ${event}:`, err);
        if (callback) {
          callback({ success: false, error: (err as Error).message });
        }
      }
    });
  }

  // --- Lobby lifecycle ---

  private handleCreateLobby(clientId: string, config: LobbyConfig, callback?: Function): void {
    const client = this.clients.get(clientId)!;
    const lobbyId = `lobby-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const hostPlayer: LobbyPlayer = {
      id: client.playerId,
      username: client.playerName,
      node: client.nodeId,
      latency: 0,
      ready: false,
      spectator: false,
      isHost: true,
      joinedAt: new Date(),
      data: {},
    };

    const lobby: Lobby = {
      id: lobbyId,
      name: config.name || 'New Lobby',
      host: hostPlayer,
      players: [hostPlayer],
      teams: [],
      settings: {
        mode: config.settings?.mode || 'default',
        customRules: config.settings?.customRules || {},
        ...config.settings,
      } as GameSettings,
      state: 'waiting' as RoomState,
      countdown: 0,
      maxPlayers: config.maxPlayers || 8,
      isPrivate: config.isPrivate || false,
      inviteCode,
      votes: [],
      chat: [],
      created: new Date(),
    };

    this.lobbies.set(lobbyId, lobby);
    this.clientLobbies.set(clientId, lobbyId);

    if (callback) {
      callback({ success: true, lobby });
    }

    // Notify the creator
    this.deliverSafe(clientId, 'lobby:created', lobby);
  }

  private handleJoinLobby(clientId: string, data: { lobbyId: string; password?: string }, callback?: Function): void {
    const client = this.clients.get(clientId)!;
    const lobby = this.lobbies.get(data.lobbyId);

    if (!lobby) {
      callback?.({ success: false, error: 'Lobby not found' });
      return;
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      callback?.({ success: false, error: 'Lobby is full' });
      return;
    }

    if (lobby.state !== 'waiting') {
      callback?.({ success: false, error: 'Game already in progress' });
      return;
    }

    // Check if already in this lobby
    if (lobby.players.some(p => p.id === client.playerId)) {
      callback?.({ success: true, lobby });
      return;
    }

    const newPlayer: LobbyPlayer = {
      id: client.playerId,
      username: client.playerName,
      node: client.nodeId,
      latency: 0,
      ready: false,
      spectator: false,
      isHost: false,
      joinedAt: new Date(),
      data: {},
    };

    lobby.players.push(newPlayer);
    this.clientLobbies.set(clientId, data.lobbyId);

    // Send full lobby state to joiner
    if (callback) {
      callback({ success: true, lobby });
    }
    this.deliverSafe(clientId, 'lobby:joined', lobby);

    // Broadcast to others in lobby
    this.broadcastToLobby(data.lobbyId, 'lobby:player_joined', newPlayer, clientId);
    // Also send updated lobby state to everyone
    this.broadcastToLobby(data.lobbyId, 'lobby:updated', lobby);
  }

  private handleJoinByCode(clientId: string, data: { inviteCode: string }, callback?: Function): void {
    for (const [lobbyId, lobby] of this.lobbies) {
      if (lobby.inviteCode === data.inviteCode) {
        this.handleJoinLobby(clientId, { lobbyId }, callback);
        return;
      }
    }
    callback?.({ success: false, error: 'Invalid invite code' });
  }

  private handleListLobbies(clientId: string, _options: any, callback?: Function): void {
    const publicLobbies = Array.from(this.lobbies.values())
      .filter(l => !l.isPrivate && l.state === 'waiting' && l.players.length < l.maxPlayers);
    callback?.({ success: true, lobbies: publicLobbies });
  }

  /**
   * Atomic matchmaking: find a waiting lobby matching the mode, or create one.
   * Prevents race conditions where two players both create lobbies simultaneously.
   */
  private handleMatchmake(clientId: string, data: { config: LobbyConfig; mode: string }, callback?: Function): void {
    const client = this.clients.get(clientId)!;

    // Already in a lobby? Leave first
    const existingLobbyId = this.clientLobbies.get(clientId);
    if (existingLobbyId) {
      this.handleLeaveLobby(clientId);
    }

    // Find a waiting matchmaking lobby with the same mode
    let targetLobby: Lobby | null = null;
    for (const lobby of this.lobbies.values()) {
      if (
        lobby.state === 'waiting' &&
        !lobby.isPrivate &&
        lobby.players.length < lobby.maxPlayers &&
        lobby.settings?.mode === data.mode &&
        lobby.settings?.matchmaking === true &&
        // Don't match against yourself
        !lobby.players.some(p => p.id === client.playerId)
      ) {
        targetLobby = lobby;
        break;
      }
    }

    if (targetLobby) {
      // Join existing lobby
      console.log(`[LobbyBroker] Matchmaking: player ${client.playerName} joining existing lobby ${targetLobby.id}`);
      this.handleJoinLobby(clientId, { lobbyId: targetLobby.id }, callback);
    } else {
      // Create new matchmaking lobby
      console.log(`[LobbyBroker] Matchmaking: player ${client.playerName} creating new lobby`);
      const config: LobbyConfig = {
        ...data.config,
        settings: {
          ...data.config.settings,
          matchmaking: true,
          mode: data.mode,
        },
      };
      this.handleCreateLobby(clientId, config, callback);
    }
  }

  private handleLeaveLobby(clientId: string): void {
    const lobbyId = this.clientLobbies.get(clientId);
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      this.clientLobbies.delete(clientId);
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) {
      this.clientLobbies.delete(clientId);
      return;
    }

    const playerId = client.playerId;

    // Remove player
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    this.clientLobbies.delete(clientId);

    // Broadcast leave
    this.broadcastToLobby(lobbyId, 'lobby:player_left', playerId);

    if (lobby.players.length === 0) {
      // Empty lobby - destroy
      this.clearCountdown(lobbyId);
      this.lobbies.delete(lobbyId);
      return;
    }

    // Host migration if host left
    if (lobby.host.id === playerId) {
      const newHost = lobby.players[0];
      newHost.isHost = true;
      lobby.host = newHost;
      this.broadcastToLobby(lobbyId, 'lobby:host_changed', newHost.id);
    }

    // Cancel countdown if not enough players
    if (lobby.players.filter(p => !p.spectator).length < 2) {
      this.clearCountdown(lobbyId);
      if (lobby.state === 'countdown') {
        lobby.state = 'waiting';
        this.broadcastToLobby(lobbyId, 'lobby:updated', lobby);
      }
    }

    this.broadcastToLobby(lobbyId, 'lobby:updated', lobby);
  }

  // --- Player actions ---

  private handleReady(clientId: string, data: { ready: boolean }): void {
    const lobbyId = this.clientLobbies.get(clientId);
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    const client = this.clients.get(clientId);
    if (!lobby || !client) return;

    const player = lobby.players.find(p => p.id === client.playerId);
    if (player) {
      player.ready = data.ready;
      this.broadcastToLobby(lobbyId, 'lobby:player_ready', {
        playerId: client.playerId,
        ready: data.ready,
      });
      this.broadcastToLobby(lobbyId, 'lobby:updated', lobby);
    }
  }

  private handleSetTeam(clientId: string, data: { teamId: number }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player) return;

    player.team = data.teamId;
    this.broadcastToLobby(lobby.id, 'lobby:team_changed', {
      playerId: player.id,
      teamId: data.teamId,
    });
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleSetColor(clientId: string, data: { color: string }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player) return;

    player.color = data.color;
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleSetCharacter(clientId: string, data: { character: string }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player) return;

    player.character = data.character;
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleSetSettings(clientId: string, settings: GameSettings): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    lobby.settings = settings;
    this.broadcastToLobby(lobby.id, 'lobby:settings_changed', settings);
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleChat(clientId: string, data: { message: string }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player) return;

    const chatMsg: LobbyChatMessage = {
      id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      playerId: player.id,
      username: player.username,
      message: data.message,
      timestamp: new Date(),
      type: 'chat',
    };

    lobby.chat.push(chatMsg);
    // Keep chat history manageable
    if (lobby.chat.length > 100) {
      lobby.chat = lobby.chat.slice(-50);
    }

    this.broadcastToLobby(lobby.id, 'lobby:chat', chatMsg);
  }

  private handleKick(clientId: string, data: { playerId: number; reason?: string }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    // Find target client
    const targetClientId = this.findClientByPlayerId(lobby.id, data.playerId);
    if (!targetClientId) return;

    // Notify kicked player
    this.deliverSafe(targetClientId, 'lobby:kicked', data.reason);

    // Remove from lobby
    this.handleLeaveLobby(targetClientId);
  }

  private handleTransferHost(clientId: string, data: { playerId: number }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    const newHost = lobby.players.find(p => p.id === data.playerId);
    if (!newHost) return;

    player.isHost = false;
    newHost.isHost = true;
    lobby.host = newHost;

    this.broadcastToLobby(lobby.id, 'lobby:host_changed', newHost.id);
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  // --- Game start ---

  private handleStartCountdown(clientId: string, data: { seconds: number }): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    const nonSpectators = lobby.players.filter(p => !p.spectator);
    if (nonSpectators.length < 2) return;

    this.clearCountdown(lobby.id);
    lobby.state = 'countdown';
    const seconds = data.seconds || 5;
    lobby.countdown = seconds;

    const timers: NodeJS.Timeout[] = [];
    for (let i = seconds; i >= 0; i--) {
      const timer = setTimeout(() => {
        lobby.countdown = i;
        this.broadcastToLobby(lobby.id, 'lobby:countdown', i);

        if (i === 0) {
          lobby.state = 'starting';
          this.broadcastToLobby(lobby.id, 'lobby:game_starting');

          const startTimer = setTimeout(() => {
            lobby.state = 'playing';
            this.broadcastToLobby(lobby.id, 'lobby:game_started');
          }, 500);
          timers.push(startTimer);
        }
      }, (seconds - i) * 1000);
      timers.push(timer);
    }

    this.countdownTimers.set(lobby.id, timers);
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleCancelCountdown(clientId: string): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    this.clearCountdown(lobby.id);
    lobby.state = 'waiting';
    lobby.countdown = 0;
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleStartGame(clientId: string): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    const nonSpectators = lobby.players.filter(p => !p.spectator);
    if (nonSpectators.length < 2) return;

    this.clearCountdown(lobby.id);
    lobby.state = 'playing';
    this.broadcastToLobby(lobby.id, 'lobby:game_starting');
    setTimeout(() => {
      this.broadcastToLobby(lobby.id, 'lobby:game_started');
    }, 100);
  }

  private handleForceStart(clientId: string): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    this.clearCountdown(lobby.id);
    lobby.state = 'playing';
    this.broadcastToLobby(lobby.id, 'lobby:game_starting');
    setTimeout(() => {
      this.broadcastToLobby(lobby.id, 'lobby:game_started');
    }, 100);
  }

  private handleAutoBalance(clientId: string): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;
    // Simple round-robin team assignment
    const teamCount = lobby.teams.length || 2;
    lobby.players.forEach((p, i) => {
      if (!p.spectator) {
        p.team = (i % teamCount) + 1;
      }
    });
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleShuffleTeams(clientId: string): void {
    const { lobby, player } = this.getPlayerInLobby(clientId);
    if (!lobby || !player || !player.isHost) return;

    const nonSpectators = lobby.players.filter(p => !p.spectator);
    // Fisher-Yates shuffle
    for (let i = nonSpectators.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nonSpectators[i].team, nonSpectators[j].team] =
        [nonSpectators[j].team, nonSpectators[i].team];
    }
    this.broadcastToLobby(lobby.id, 'lobby:updated', lobby);
  }

  private handleGetInviteCode(clientId: string, callback?: Function): void {
    const lobbyId = this.clientLobbies.get(clientId);
    if (!lobbyId) {
      callback?.({ success: false, error: 'Not in a lobby' });
      return;
    }

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      callback?.({ success: false, error: 'Lobby not found' });
      return;
    }

    callback?.({ success: true, code: lobby.inviteCode });
  }

  // --- Game events (broadcast to lobby) ---

  private handleGameEvent(clientId: string, event: string, data: any): void {
    const lobbyId = this.clientLobbies.get(clientId);
    if (!lobbyId) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    // Stamp source identity from registered client, not payload
    const stamped = { ...data, _sourcePlayerId: client.playerId };
    this.broadcastToLobby(lobbyId, event, stamped, clientId);
  }

  // --- Helpers ---

  private getPlayerInLobby(clientId: string): { lobby: Lobby | null; player: LobbyPlayer | null } {
    const lobbyId = this.clientLobbies.get(clientId);
    if (!lobbyId) return { lobby: null, player: null };

    const lobby = this.lobbies.get(lobbyId);
    const client = this.clients.get(clientId);
    if (!lobby || !client) return { lobby: null, player: null };

    const player = lobby.players.find(p => p.id === client.playerId);
    return { lobby, player: player || null };
  }

  private findClientByPlayerId(lobbyId: string, playerId: number): string | null {
    for (const [cid, lid] of this.clientLobbies) {
      if (lid === lobbyId) {
        const client = this.clients.get(cid);
        if (client && client.playerId === playerId) {
          return cid;
        }
      }
    }
    return null;
  }

  private broadcastToLobby(lobbyId: string, event: string, data?: any, excludeClient?: string): void {
    for (const [cid, lid] of this.clientLobbies) {
      if (lid === lobbyId && cid !== excludeClient) {
        if (data !== undefined) {
          this.deliverSafe(cid, event, data);
        } else {
          this.deliverSafe(cid, event);
        }
      }
    }
  }

  private deliverSafe(clientId: string, event: string, ...args: any[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Deep-clone data to prevent shared mutation between clients
      const clonedArgs = args.map(a => {
        if (a && typeof a === 'object') {
          try { return JSON.parse(JSON.stringify(a)); } catch { return a; }
        }
        return a;
      });
      client.deliver(event, ...clonedArgs);
    } catch (err) {
      console.error(`[LobbyBroker] Error delivering ${event} to ${clientId}:`, err);
    }
  }

  private clearCountdown(lobbyId: string): void {
    const timers = this.countdownTimers.get(lobbyId);
    if (timers) {
      timers.forEach(t => clearTimeout(t));
      this.countdownTimers.delete(lobbyId);
    }
  }

  /**
   * Get active lobby count (for diagnostics)
   */
  getLobbyCount(): number {
    return this.lobbies.size;
  }

  /**
   * Get active client count (for diagnostics)
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Destroy all lobbies and reset state (for testing)
   */
  reset(): void {
    for (const lobbyId of this.lobbies.keys()) {
      this.clearCountdown(lobbyId);
    }
    this.lobbies.clear();
    this.clients.clear();
    this.clientLobbies.clear();
    this.countdownTimers.clear();
  }
}
