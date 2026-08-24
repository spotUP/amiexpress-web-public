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
import type {
  Lobby,
  LobbyConfig,
  LobbyPlayer,
  LobbyChatMessage,
  Team,
  GameSettings,
  Vote,
  VoteOption,
  RoomState,
  ILobbySystem,
} from '../types';
import type { ConnectionManager } from './connection';

// Default game settings
const DEFAULT_SETTINGS: GameSettings = {
  mode: 'default',
  customRules: {},
};

// Default lobby config
const DEFAULT_CONFIG: Required<Omit<LobbyConfig, 'password'>> & { password?: string } = {
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
export class LobbySystem extends EventEmitter implements ILobbySystem {
  readonly name = 'lobby';

  private connection: ConnectionManager;
  private _current: Lobby | null = null;
  private localPlayer: LobbyPlayer | null = null;
  private readyTimeout?: NodeJS.Timeout;
  private countdownInterval?: NodeJS.Timeout;

  constructor(connection: ConnectionManager) {
    super();
    this.connection = connection;
    this.setupEventHandlers();
  }

  /**
   * Get current lobby
   */
  get current(): Lobby | null {
    return this._current;
  }

  /**
   * Initialize lobby system
   */
  async init(): Promise<void> {
    // Nothing to initialize
  }

  /**
   * Setup socket event handlers
   */
  /**
   * Setup socket event handlers
   * Called in constructor and when socket changes (e.g., broker injection)
   */
  setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket) return;

    socket.on('lobby:created', (lobby: Lobby) => {
      this._current = lobby;
      this.emit('lobby:created', lobby);
    });

    socket.on('lobby:joined', (lobby: Lobby) => {
      this._current = lobby;
      this.emit('lobby:joined', lobby);
    });

    socket.on('lobby:updated', (lobby: Lobby) => {
      this._current = lobby;
      this.emit('lobby:updated', lobby);
    });

    socket.on('lobby:player_joined', (player: LobbyPlayer) => {
      if (this._current) {
        // Idempotent: only add if not already present
        if (!this._current.players.some(p => p.id === player.id)) {
          this._current.players.push(player);
        }
        this.emit('player:joined', player);
      }
    });

    socket.on('lobby:player_left', (playerId: number) => {
      if (this._current) {
        const player = this._current.players.find(p => p.id === playerId);
        this._current.players = this._current.players.filter(p => p.id !== playerId);
        if (player) {
          this.emit('player:left', player);
        }
      }
    });

    socket.on('lobby:player_ready', (data: { playerId: number; ready: boolean }) => {
      if (this._current) {
        const player = this._current.players.find(p => p.id === data.playerId);
        if (player) {
          player.ready = data.ready;
          this.emit('player:ready', data.playerId, data.ready);
          this.checkAllReady();
        }
      }
    });

    socket.on('lobby:team_changed', (data: { playerId: number; teamId: number }) => {
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

    socket.on('lobby:settings_changed', (settings: GameSettings) => {
      if (this._current) {
        this._current.settings = settings;
        this.emit('settings:changed', settings);
      }
    });

    socket.on('lobby:chat', (message: LobbyChatMessage) => {
      if (this._current) {
        this._current.chat.push(message);
        this.emit('lobby:chat', message);
      }
    });

    socket.on('lobby:vote_started', (vote: Vote) => {
      if (this._current) {
        this._current.votes.push(vote);
        this.emit('vote:started', vote);
      }
    });

    socket.on('lobby:vote_updated', (vote: Vote) => {
      if (this._current) {
        const idx = this._current.votes.findIndex(v => v.id === vote.id);
        if (idx >= 0) {
          this._current.votes[idx] = vote;
        }
        this.emit('vote:updated', vote);
      }
    });

    socket.on('lobby:vote_ended', (data: { voteId: string; result: VoteOption | null }) => {
      if (this._current) {
        this._current.votes = this._current.votes.filter(v => v.id !== data.voteId);
        this.emit('vote:ended', data.voteId, data.result);
      }
    });

    socket.on('lobby:countdown', (seconds: number) => {
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

    socket.on('lobby:kicked', (reason?: string) => {
      this._current = null;
      this.emit('kicked', reason);
    });

    socket.on('lobby:host_changed', (newHostId: number) => {
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
  async create(config: LobbyConfig): Promise<Lobby> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('lobby:create', fullConfig, (response: { success: boolean; lobby?: Lobby; error?: string }) => {
        if (response.success && response.lobby) {
          this._current = response.lobby;
          this.localPlayer = response.lobby.host;
          resolve(response.lobby);
        } else {
          reject(new Error(response.error || 'Failed to create lobby'));
        }
      });
    });
  }

  /**
   * Join an existing lobby
   */
  async join(lobbyId: string, password?: string): Promise<Lobby> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('lobby:join', { lobbyId, password }, (response: { success: boolean; lobby?: Lobby; error?: string }) => {
        if (response.success && response.lobby) {
          this._current = response.lobby;
          this.localPlayer = response.lobby.players.find(p => p.id === ((socket as any).playerId ?? (socket as any).userId)) || null;
          resolve(response.lobby);
        } else {
          reject(new Error(response.error || 'Failed to join lobby'));
        }
      });
    });
  }

  /**
   * Join lobby by invite code
   */
  async joinByCode(inviteCode: string): Promise<Lobby> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('lobby:join_by_code', { inviteCode }, (response: { success: boolean; lobby?: Lobby; error?: string }) => {
        if (response.success && response.lobby) {
          this._current = response.lobby;
          this.localPlayer = response.lobby.players.find(p => p.id === ((socket as any).playerId ?? (socket as any).userId)) || null;
          resolve(response.lobby);
        } else {
          reject(new Error(response.error || 'Invalid invite code'));
        }
      });
    });
  }

  /**
   * Leave current lobby
   */
  leave(): void {
    if (!this._current) return;

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
  setReady(ready: boolean): void {
    if (!this._current || !this.localPlayer) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:ready', { ready });
      this.localPlayer.ready = ready;
    }
  }

  /**
   * Toggle ready status
   */
  toggleReady(): void {
    if (this.localPlayer) {
      this.setReady(!this.localPlayer.ready);
    }
  }

  /**
   * Set team
   */
  setTeam(teamId: number): void {
    if (!this._current || !this.localPlayer) return;

    const team = this._current.teams.find(t => t.id === teamId);
    if (!team) return;

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
  setColor(color: string): void {
    if (!this._current || !this.localPlayer) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:set_color', { color });
      this.localPlayer.color = color;
    }
  }

  /**
   * Set player character (cosmetic)
   */
  setCharacter(character: string): void {
    if (!this._current || !this.localPlayer) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:set_character', { character });
      this.localPlayer.character = character;
    }
  }

  /**
   * Update game settings (host only)
   */
  setSettings(settings: Partial<GameSettings>): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      const newSettings = { ...this._current.settings, ...settings };
      socket.emit('lobby:set_settings', newSettings);
    }
  }

  /**
   * Start a vote
   */
  startVote(type: Vote['type'], options: { id: string; label: string }[], duration: number = 30000): void {
    if (!this._current) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:start_vote', { type, options, duration });
    }
  }

  /**
   * Cast a vote
   */
  vote(voteId: string, optionId: string): void {
    if (!this._current) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:vote', { voteId, optionId });
    }
  }

  /**
   * Send chat message
   */
  chat(message: string): void {
    if (!this._current || !this.localPlayer) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:chat', { message });
    }
  }

  /**
   * Send emote
   */
  emote(emoteId: string): void {
    if (!this._current || !this.localPlayer) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:emote', { emoteId });
    }
  }

  /**
   * Kick player (host only)
   */
  kick(playerId: number, reason?: string): void {
    if (!this._current || !this.isHost()) return;
    if (playerId === this.localPlayer?.id) return; // Can't kick yourself

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:kick', { playerId, reason });
    }
  }

  /**
   * Ban player (host only)
   */
  ban(playerId: number, reason?: string): void {
    if (!this._current || !this.isHost()) return;
    if (playerId === this.localPlayer?.id) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:ban', { playerId, reason });
    }
  }

  /**
   * Transfer host to another player
   */
  transferHost(playerId: number): void {
    if (!this._current || !this.isHost()) return;
    if (playerId === this.localPlayer?.id) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:transfer_host', { playerId });
    }
  }

  /**
   * Start countdown (host only)
   */
  startCountdown(seconds: number = 5): void {
    if (!this._current || !this.isHost()) return;

    // Require at least one real participant. This used to demand TWO, which
    // made a solo host permanently unable to start: bots are held in the
    // door's own match state, not in the broker lobby this module sees, so
    // filling the lobby with bots never moved this count off 1 and Start
    // just sat there reporting "Need at least 2 players" (reported live
    // 2026-08-25). Whether a given game is actually playable solo is the
    // door's call - it knows about its bots - not this transport module's.
    const nonSpectators = this._current.players.filter(p => !p.team || p.team > 0);
    if (nonSpectators.length < 1) {
      this.emit('error', new Error('Need at least 1 player'));
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
  cancelCountdown(): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:cancel_countdown');
    }
  }

  /**
   * Start game immediately (host only)
   */
  startGame(): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:start_game');
    }
  }

  /**
   * Force start game even if not all ready (host only)
   */
  forceStart(): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:force_start');
    }
  }

  /**
   * Generate invite link
   */
  async getInviteCode(): Promise<string> {
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

      socket.emit('lobby:get_invite_code', {}, (response: { success: boolean; code?: string; error?: string }) => {
        if (response.success && response.code) {
          this._current!.inviteCode = response.code;
          resolve(response.code);
        } else {
          reject(new Error(response.error || 'Failed to get invite code'));
        }
      });
    });
  }

  /**
   * Check if local player is host
   */
  isHost(): boolean {
    return this.localPlayer?.isHost || false;
  }

  /**
   * Check if local player is ready
   */
  isReady(): boolean {
    return this.localPlayer?.ready || false;
  }

  /**
   * Check if all players are ready
   */
  private checkAllReady(): void {
    if (!this._current) return;

    const playingPlayers = this._current.players.filter(p => !p.team || p.team > 0);
    const allReady = playingPlayers.length >= 2 && playingPlayers.every(p => p.ready);

    if (allReady) {
      this.emit('all_ready');
    }
  }

  /**
   * Auto-balance teams
   */
  autoBalanceTeams(): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:auto_balance');
    }
  }

  /**
   * Shuffle teams
   */
  shuffleTeams(): void {
    if (!this._current || !this.isHost()) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('lobby:shuffle_teams');
    }
  }

  /**
   * List available lobbies
   */
  async listLobbies(options?: { gameMode?: string; notFull?: boolean; notStarted?: boolean }): Promise<Lobby[]> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('lobby:list', options || {}, (response: { success: boolean; lobbies?: Lobby[]; error?: string }) => {
        if (response.success && response.lobbies) {
          resolve(response.lobbies);
        } else {
          reject(new Error(response.error || 'Failed to list lobbies'));
        }
      });
    });
  }

  /**
   * Atomic matchmake: find a waiting lobby or create one.
   * Handled server-side to prevent race conditions.
   */
  async matchmake(config: LobbyConfig, mode: string): Promise<Lobby> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('lobby:matchmake', { config, mode }, (response: { success: boolean; lobby?: Lobby; error?: string }) => {
        if (response.success && response.lobby) {
          this._current = response.lobby;
          // BrokerClient exposes playerId (number); Socket.IO exposes userId.
          // Try both so matchmake works with either transport.
          const myId = (socket as any).playerId ?? (socket as any).userId;
          this.localPlayer = response.lobby.players.find(p => p.id === myId) || null;
          resolve(response.lobby);
        } else {
          reject(new Error(response.error || 'Matchmaking failed'));
        }
      });
    });
  }

  /**
   * Cleanup internal state
   */
  private cleanup(): void {
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
  dispose(): void {
    this.leave();
    this.removeAllListeners();
  }
}

export default LobbySystem;
