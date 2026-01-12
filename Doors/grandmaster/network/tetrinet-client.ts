/**
 * TetriNET 1.x External Server Client
 *
 * Connects to external TetriNET servers on port 31457 (or 31458 for TSpec).
 * Implements the TetriNET protocol with XOR-encrypted login.
 */

import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import * as net from 'net';
import {
  formatTetrenetLogin,
  formatTetrenetField,
  formatTetrenetSpecial,
  formatTetrenetLevel,
  formatTetrenetChat,
  formatTetrenetAction,
  formatTetrenetTeam,
  formatTetrenetConnected,
  formatTetrenetVersion,
  formatTspecChat,
  formatTetrenetPlayerLost,
  formatTetrenetClientInfo,
  formatTetrenetStartGame,
  formatTetrenetPause,
  parseTetrenetMessage,
  type PlayerSlot,
  type TetriFastMode,
  type TetriNetMessage,
} from './tetrinet-protocol';
import type { SpecialType } from '../core/tetrinet/specials';

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'playing' | 'error';

/**
 * Player info from external server
 */
export interface ExternalPlayer {
  slot: PlayerSlot;
  name: string;
  team: string;
  alive: boolean;
  level: number;
}

/**
 * Client options
 */
export interface TetriNetClientOptions {
  /** Server hostname */
  host: string;
  /** Server port (default 31457, or 31458 for TSpec) */
  port?: number;
  /** Player nickname */
  nickname: string;
  /** Team name (optional) */
  team?: string;
  /** Connection mode */
  mode?: TetriFastMode;
  /** TSpec password/token (used only for mode 'tspec') */
  password?: string;
  /** Connection timeout in ms */
  timeout?: number;
}

/**
 * TetriNET 1.x Client
 *
 * Events:
 * - 'connected': Successfully connected and assigned slot
 * - 'disconnected': Connection closed
 * - 'error': Connection or protocol error
 * - 'player:joined': Player joined the room
 * - 'player:left': Player left the room
 * - 'player:team': Player changed team
 * - 'chat': Chat message received
 * - 'game:start': Game starting
 * - 'game:end': Game ended
 * - 'field:update': Field update received
 * - 'special:used': Special was used
 * - 'player:lost': Player topped out
 * - 'player:won': Player won the game
 * - 'level:update': Level update received
 * - 'winlist': Winlist update
 * - 'spectator:list': Spectator list update
 * - 'spectator:joined': Spectator joined
 * - 'spectator:left': Spectator left
 * - 'spectator:chat': Spectator chat
 */
export class TetriNetClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private options: Required<TetriNetClientOptions>;
  private state: ConnectionState = 'disconnected';
  private mySlot: PlayerSlot | null = null;
  private players: Map<PlayerSlot, ExternalPlayer> = new Map();
  private spectators: Set<string> = new Set();
  private buffer: string = '';
  private serverIp: string = '127.0.0.1';
  private eventBacklog: Array<{ event: string; args: any[] }> = [];

  constructor(options: TetriNetClientOptions) {
    super();
    const mode = options.mode || 'tetrifast';
    const defaultPort = mode === 'tspec' ? 31458 : 31457;
    const fallbackTeam = (options.team ?? '').trim() || options.nickname.substring(0, 15);
    this.options = {
      host: options.host,
      port: options.port || defaultPort,
      nickname: options.nickname.substring(0, 15), // TetriNET max 15 chars
      team: fallbackTeam,
      mode,
      password: options.password || '',
      timeout: options.timeout || 30000,
    };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get assigned slot
   */
  getSlot(): PlayerSlot | null {
    return this.mySlot;
  }

  /**
   * Get all players
   */
  getPlayers(): ExternalPlayer[] {
    return Array.from(this.players.values());
  }

  /**
   * Get spectator list
   */
  getSpectators(): string[] {
    return Array.from(this.spectators.values());
  }

  /**
   * Replay buffered events (used when listeners attach after connect).
   */
  drainBacklog(): void {
    const pending = [...this.eventBacklog];
    this.eventBacklog = [];
    for (const entry of pending) {
      this.emit(entry.event, ...entry.args);
    }
  }

  private emitEvent(event: string, ...args: any[]): void {
    if (this.listenerCount(event) === 0) {
      this.eventBacklog.push({ event, args });
    }
    this.emit(event, ...args);
  }

  /**
   * Get player by slot
   */
  getPlayer(slot: PlayerSlot): ExternalPlayer | undefined {
    return this.players.get(slot);
  }

  private getServerIp(socket: net.Socket | null): string {
    if (!socket || !socket.remoteAddress) {
      return '127.0.0.1';
    }
    const addr = socket.remoteAddress;
    if (addr.includes('.')) {
      return addr.split(':').pop() || addr;
    }
    return '127.0.0.1';
  }

  /**
   * Connect to server
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      throw new Error('Already connected or connecting');
    }

    console.log(`[TetriNetClient] Connecting to ${this.options.host}:${this.options.port}...`);
    this.state = 'connecting';
    this.emit('state:change', this.state);

    const isTspec = this.options.mode === 'tspec';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log(`[TetriNetClient] Connection timeout after ${this.options.timeout}ms`);
        this.disconnect();
        reject(new Error('Connection timeout'));
      }, this.options.timeout);

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        console.log(`[TetriNetClient] Socket connected to ${this.options.host}:${this.options.port}`);
        this.emit('status', 'TCP connected, sending login...');

        this.serverIp = this.getServerIp(this.socket);
        console.log(`[TetriNetClient] Using server IP for encryption: ${this.serverIp}`);
        this.emit('status', `Encrypting login with server IP ${this.serverIp}...`);

        // Send encrypted login
        this.sendLogin();
        this.emit('status', 'Login sent, awaiting slot assignment...');
      });

      this.socket.on('data', (data: Buffer) => {
        const hex = data.toString('hex').substring(0, 60);
        const latin1 = data.toString('latin1').substring(0, 100);
        console.log(`[TetriNetClient] Received ${data.length} bytes: ${hex}`);
        console.log(`[TetriNetClient] As text: ${latin1}`);
        this.emit('status', `Received ${data.length} bytes from server`);
        this.handleData(data);
      });

      this.socket.on('close', () => {
        console.log(`[TetriNetClient] Connection closed`);
        this.handleClose();
      });

      this.socket.on('error', (error: Error) => {
        console.log(`[TetriNetClient] Socket error: ${error.message}`);
        clearTimeout(timeout);
        this.state = 'error';
        this.emit('state:change', this.state);
        this.emit('error', error);
        reject(error);
      });

      if (isTspec) {
        const onSpectatorConnected = () => {
          console.log(`[TetriNetClient] TSpec connection established`);
          clearTimeout(timeout);
          this.removeListener('connected:spectator', onSpectatorConnected);
          resolve();
        };
        this.on('connected:spectator', onSpectatorConnected);
      } else {
        // Listen for successful slot assignment
        const onConnected = (slot: PlayerSlot) => {
          console.log(`[TetriNetClient] Successfully connected, assigned slot ${slot}`);
          clearTimeout(timeout);
          this.removeListener('connected', onConnected);
          resolve();
        };
        this.on('connected', onConnected);
      }

      // Connect
      console.log(`[TetriNetClient] Initiating TCP connection...`);
      this.socket.connect(this.options.port, this.options.host);
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    console.log(`[TetriNetClient] Disconnecting...`);
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.state = 'disconnected';
    this.mySlot = null;
    this.players.clear();
    this.spectators.clear();
    this.buffer = '';
    this.emit('state:change', this.state);
    this.emit('disconnected');
    console.log(`[TetriNetClient] Disconnected`);
  }

  /**
   * Send field update
   */
  sendField(field: string): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetField(this.mySlot, field));
  }

  /**
   * Send special usage
   */
  sendSpecial(target: PlayerSlot, special: SpecialType): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetSpecial(target, special, this.mySlot));
  }

  /**
   * Send level update
   */
  sendLevel(level: number): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetLevel(this.mySlot, level));
  }

  /**
   * Send chat message
   */
  sendChat(message: string): void {
    if (this.options.mode === 'tspec') {
      const trimmed = message.trim();
      const isPublic = trimmed.startsWith('//');
      const text = isPublic ? trimmed.substring(2).trimStart() : trimmed;
      if (!text) return;
      console.log(`[TetriNetClient] Sending TSpec chat: ${text}`);
      this.send(formatTspecChat(text, isPublic));
      return;
    }
    if (!this.mySlot) return;
    console.log(`[TetriNetClient] Sending chat: ${message}`);
    this.send(formatTetrenetChat(this.mySlot, message));
  }

  /**
   * Send version string
   */
  sendVersion(version: string): void {
    this.send(formatTetrenetVersion(version));
  }

  /**
   * Send start/stop game (operator only).
   */
  sendStartGame(start: boolean): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetStartGame(start, this.mySlot));
  }

  /**
   * Send pause/resume (operator only).
   */
  sendPause(pause: boolean): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetPause(pause, this.mySlot));
  }

  /**
   * Send /me action
   */
  sendAction(action: string): void {
    if (!this.mySlot) return;
    console.log(`[TetriNetClient] Sending action: ${action}`);
    this.send(formatTetrenetAction(this.mySlot, action));
  }

  /**
   * Set team
   */
  setTeam(team: string): void {
    if (!this.mySlot) return;
    const normalized = team.trim();
    const resolvedTeam = normalized || this.options.nickname;
    console.log(`[TetriNetClient] Setting team: ${resolvedTeam}`);
    this.send(formatTetrenetTeam(this.mySlot, resolvedTeam));
  }

  /**
   * Report player lost (topped out)
   */
  sendPlayerLost(): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetPlayerLost(this.mySlot));
  }

  /**
   * Send raw line (for testing)
   */
  sendRaw(line: string): void {
    this.send(line);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private sendLogin(): void {
    console.log(`[TetriNetClient] Preparing encrypted login for nick '${this.options.nickname}', mode '${this.options.mode}', server IP '${this.serverIp}'`);
    // TetriNET login is encrypted with IP-based rolling hash (server IP)
    const loginMessage = formatTetrenetLogin(
      this.options.nickname,
      this.serverIp,
      this.options.mode,
      this.options.mode === 'tspec' ? this.options.password : '1.13'
    );
    // Login is sent as ASCII hex followed by 0xFF terminator
    console.log(`[TetriNetClient] Sending login hex (${loginMessage.length} chars): ${loginMessage.substring(0, 60)}...`);
    this.emit('status', `Sent login hex (${loginMessage.length} chars)`);
    this.send(loginMessage);
  }

  private send(line: string): void {
    if (!this.socket || this.state === 'disconnected') return;
    // TetriNET messages end with 0xFF byte (must be raw 0xFF, not UTF-8)
    const payload = Buffer.from(line, 'latin1');
    const terminator = Buffer.from([0xFF]);
    this.socket.write(Buffer.concat([payload, terminator]));
  }

  private handleData(data: Buffer): void {
    // TetriNET uses 0xFF as message delimiter
    this.buffer += data.toString('latin1');

    // Split by 0xFF
    const parts = this.buffer.split(String.fromCharCode(0xFF));
    this.buffer = parts.pop() || ''; // Keep incomplete message

    for (const line of parts) {
      if (line.trim()) {
        this.handleMessage(line);
      }
    }
  }

  private handleMessage(line: string): void {
    const message = parseTetrenetMessage(line);
    if (!message) {
      // Unknown message, log for debugging
      const hex = Buffer.from(line, 'latin1').toString('hex');
      console.log(`[TetriNetClient] Unknown message: ${line.substring(0, 100)} (hex: ${hex.substring(0, 40)})`);
      this.emit('raw', line);
      return;
    }
    console.log(`[TetriNetClient] Parsed message type: ${message.type}`);

    if (this.options.mode === 'tspec' && this.state === 'connecting') {
      if (message.type !== 'tetrinet:connect_error'
        && message.type !== 'tetrinet:disconnect'
        && message.type !== 'tetrinet:kick') {
        this.state = 'connected';
        this.emit('state:change', this.state);
        this.emit('connected:spectator');
      }
    }

    switch (message.type) {
      case 'tetrinet:join': {
        // Initial slot assignment
        const joinMsg = message as any;
        if (joinMsg.slot) {
          const slot = joinMsg.slot as PlayerSlot;
          this.mySlot = slot;
          this.state = 'connected';
          this.emitEvent('state:change', this.state);
          this.emitEvent('connected', slot);

          // Add self to players
          const self = {
            slot: slot,
            name: this.options.nickname,
            team: this.options.team,
            alive: true,
            level: 1,
          };
          this.players.set(slot, self);
          this.emitEvent('player:joined', self);

          // Acknowledge connection (gtetrinet sends connected after playernum)
          this.send(formatTetrenetConnected());

          // Send team (matches gtetrinet flow)
          this.setTeam(this.options.team ?? '');
        }
        break;
      }

      case 'tetrinet:player_joined': {
        const playerMsg = message as any;
        const existingPlayer = this.players.get(playerMsg.player.slot);

        if (existingPlayer && playerMsg.player.team !== undefined) {
          // Team update for existing player
          existingPlayer.team = playerMsg.player.team;
          this.emitEvent('player:team', {
            slot: playerMsg.player.slot,
            team: playerMsg.player.team,
          });
        } else if (!existingPlayer && playerMsg.player.name) {
          // New player joined
          this.players.set(playerMsg.player.slot, playerMsg.player);
          this.emitEvent('player:joined', playerMsg.player);
        }
        break;
      }

      case 'tetrinet:player_left': {
        const leftMsg = message as any;
        const player = this.players.get(leftMsg.slot);
        this.players.delete(leftMsg.slot);
        this.emitEvent('player:left', { slot: leftMsg.slot, player });
        break;
      }

      case 'tetrinet:chat': {
        const chatMsg = message as any;
        const player = this.players.get(chatMsg.senderSlot);
        const senderSlot = chatMsg.senderSlot;
        const senderName = senderSlot === 0 ? 'Server' : (player?.name || `Player ${senderSlot}`);
        this.emitEvent('chat', {
          slot: senderSlot,
          name: senderName,
          text: chatMsg.text,
          isAction: chatMsg.isAction,
          isGameMessage: chatMsg.isGameMessage,
        });
        break;
      }

      case 'tetrinet:winlist': {
        const winlistMsg = message as any;
        this.emitEvent('winlist', winlistMsg.entries);
        break;
      }

      case 'tetrinet:spectator_list': {
        const specMsg = message as any;
        this.spectators = new Set(specMsg.names || []);
        this.emitEvent('spectator:list', this.getSpectators());
        break;
      }

      case 'tetrinet:spectator_joined': {
        const specMsg = message as any;
        if (specMsg.name) {
          this.spectators.add(specMsg.name);
        }
        this.emitEvent('spectator:joined', specMsg.name);
        break;
      }

      case 'tetrinet:spectator_left': {
        const specMsg = message as any;
        if (specMsg.name) {
          this.spectators.delete(specMsg.name);
        }
        this.emitEvent('spectator:left', specMsg.name);
        break;
      }

      case 'tetrinet:spectator_chat': {
        const specMsg = message as any;
        this.emitEvent('spectator:chat', {
          name: specMsg.name,
          text: specMsg.text,
          isAction: specMsg.isAction,
        });
        break;
      }

      case 'tetrinet:game_start': {
        const startMsg = message as any;
        this.state = 'playing';
        this.emitEvent('state:change', this.state);

        // Reset all players to alive
        for (const player of this.players.values()) {
          player.alive = true;
          player.level = startMsg.options?.startingLevel || 1;
        }

        this.emitEvent('game:start', {
          options: startMsg.options,
          inProgress: startMsg.inProgress,
        });
        break;
      }

      case 'tetrinet:game_over': {
        const overMsg = message as any;
        this.state = 'connected';
        this.emitEvent('state:change', this.state);
        this.emitEvent('game:end', {
          winnerSlot: overMsg.winnerSlot,
        });
        break;
      }

      case 'tetrinet:field_update': {
        const fieldMsg = message as any;
        this.emitEvent('field:update', {
          slot: fieldMsg.slot,
          field: fieldMsg.field,
          level: fieldMsg.level,
        });
        break;
      }

      case 'tetrinet:special_used': {
        const specialMsg = message as any;
        this.emitEvent('special:used', {
          senderSlot: specialMsg.senderSlot,
          targetSlot: specialMsg.targetSlot,
          special: specialMsg.special,
          classicLines: specialMsg.classicLines,
        });
        break;
      }

      case 'tetrinet:player_lost': {
        const lostMsg = message as any;
        const player = this.players.get(lostMsg.slot);
        if (player) {
          player.alive = false;
        }
        this.emitEvent('player:lost', { slot: lostMsg.slot });
        break;
      }

      case 'tetrinet:options_update': {
        const optionsMsg = message as any;
        if (optionsMsg.options.winlist) {
          this.emitEvent('winlist', optionsMsg.options.winlist);
        }
        if (optionsMsg.options.paused !== undefined) {
          this.emitEvent('game:pause', optionsMsg.options.paused);
        }
        if (optionsMsg.options.clientInfoRequest) {
          // Server requested client info, respond
          this.send(formatTetrenetClientInfo('GRANDMASTER', '1.0'));
        }
        break;
      }

      case 'tetrinet:connect': {
        this.emitEvent('status', 'Server acknowledged connection');
        break;
      }

      case 'tetrinet:disconnect': {
        const disconnectMsg = message as any;
        this.emitEvent('error', new Error(disconnectMsg.reason || 'Server disconnected'));
        this.disconnect();
        break;
      }

      case 'tetrinet:connect_error': {
        const errorMsg = message as any;
        this.emitEvent('error', new Error(errorMsg.reason || 'Connection rejected'));
        this.disconnect();
        break;
      }

      case 'tetrinet:kick': {
        const kickMsg = message as any;
        this.emitEvent('error', new Error(kickMsg.reason || 'Kicked by server'));
        this.disconnect();
        break;
      }

      case 'tetrinet:leave': {
        // Connection rejected
        const leaveMsg = message as any;
        this.emitEvent('error', new Error(leaveMsg.reason || 'Connection rejected'));
        this.disconnect();
        break;
      }
    }
  }

  private handleClose(): void {
    if (this.state !== 'disconnected') {
      this.state = 'disconnected';
      this.mySlot = null;
      this.players.clear();
      this.spectators.clear();
      this.emitEvent('state:change', this.state);
      this.emitEvent('disconnected');
    }
  }
}

/**
 * Create a TetriNET client
 */
export function createTetriNetClient(options: TetriNetClientOptions): TetriNetClient {
  return new TetriNetClient(options);
}
