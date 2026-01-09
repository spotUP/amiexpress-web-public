/**
 * TetriNET 1.x External Server Client
 *
 * Connects to external TetriNET servers on port 31457.
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
  formatTetrenetPlayerLost,
  formatTetrenetClientInfo,
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
  /** Server port (default 31457) */
  port?: number;
  /** Player nickname */
  nickname: string;
  /** Team name (optional) */
  team?: string;
  /** Connection mode */
  mode?: TetriFastMode;
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
 */
export class TetriNetClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private options: Required<TetriNetClientOptions>;
  private state: ConnectionState = 'disconnected';
  private mySlot: PlayerSlot | null = null;
  private players: Map<PlayerSlot, ExternalPlayer> = new Map();
  private buffer: string = '';
  private clientIp: string = '127.0.0.1';

  constructor(options: TetriNetClientOptions) {
    super();
    this.options = {
      host: options.host,
      port: options.port || 31457,
      nickname: options.nickname.substring(0, 15), // TetriNET max 15 chars
      team: options.team || '',
      mode: options.mode || 'standard',
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
   * Get player by slot
   */
  getPlayer(slot: PlayerSlot): ExternalPlayer | undefined {
    return this.players.get(slot);
  }

  /**
   * Connect to server
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      throw new Error('Already connected or connecting');
    }

    this.state = 'connecting';
    this.emit('state:change', this.state);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error('Connection timeout'));
      }, this.options.timeout);

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        // Get local IP for encryption
        this.clientIp = this.socket?.localAddress || '127.0.0.1';
        // Send encrypted login
        this.sendLogin();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.handleClose();
      });

      this.socket.on('error', (error: Error) => {
        clearTimeout(timeout);
        this.state = 'error';
        this.emit('state:change', this.state);
        this.emit('error', error);
        reject(error);
      });

      // Listen for successful slot assignment
      const onConnected = (slot: PlayerSlot) => {
        clearTimeout(timeout);
        this.removeListener('connected', onConnected);
        resolve();
      };
      this.on('connected', onConnected);

      // Connect
      this.socket.connect(this.options.port, this.options.host);
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.state = 'disconnected';
    this.mySlot = null;
    this.players.clear();
    this.buffer = '';
    this.emit('state:change', this.state);
    this.emit('disconnected');
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
    if (!this.mySlot) return;
    this.send(formatTetrenetChat(this.mySlot, message));
  }

  /**
   * Send /me action
   */
  sendAction(action: string): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetAction(this.mySlot, action));
  }

  /**
   * Set team
   */
  setTeam(team: string): void {
    if (!this.mySlot) return;
    this.send(formatTetrenetTeam(this.mySlot, team));
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
    // TetriNET login is XOR encrypted
    const loginMessage = formatTetrenetLogin(
      this.options.nickname,
      this.clientIp,
      this.options.mode
    );
    // Login is sent as hex bytes followed by 0xFF
    this.socket?.write(Buffer.from(loginMessage + 'FF', 'hex'));
  }

  private send(line: string): void {
    if (!this.socket || this.state === 'disconnected') return;
    // TetriNET messages end with 0xFF byte
    this.socket.write(line + String.fromCharCode(0xFF));
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
      this.emit('raw', line);
      return;
    }

    switch (message.type) {
      case 'tetrinet:join': {
        // Initial slot assignment
        const joinMsg = message as any;
        if (joinMsg.slot) {
          const slot = joinMsg.slot as PlayerSlot;
          this.mySlot = slot;
          this.state = 'connected';
          this.emit('state:change', this.state);
          this.emit('connected', slot);

          // Add self to players
          this.players.set(slot, {
            slot: slot,
            name: this.options.nickname,
            team: this.options.team,
            alive: true,
            level: 1,
          });

          // Send team if set
          if (this.options.team) {
            this.setTeam(this.options.team);
          }

          // Send client info
          this.send(formatTetrenetClientInfo('GRANDMASTER', '1.0'));
        }
        break;
      }

      case 'tetrinet:player_joined': {
        const playerMsg = message as any;
        const existingPlayer = this.players.get(playerMsg.player.slot);

        if (existingPlayer && playerMsg.player.team !== undefined) {
          // Team update for existing player
          existingPlayer.team = playerMsg.player.team;
          this.emit('player:team', {
            slot: playerMsg.player.slot,
            team: playerMsg.player.team,
          });
        } else if (!existingPlayer && playerMsg.player.name) {
          // New player joined
          this.players.set(playerMsg.player.slot, playerMsg.player);
          this.emit('player:joined', playerMsg.player);
        }
        break;
      }

      case 'tetrinet:player_left': {
        const leftMsg = message as any;
        const player = this.players.get(leftMsg.slot);
        this.players.delete(leftMsg.slot);
        this.emit('player:left', { slot: leftMsg.slot, player });
        break;
      }

      case 'tetrinet:chat': {
        const chatMsg = message as any;
        const player = this.players.get(chatMsg.senderSlot);
        this.emit('chat', {
          slot: chatMsg.senderSlot,
          name: player?.name || `Player ${chatMsg.senderSlot}`,
          text: chatMsg.text,
          isAction: chatMsg.isAction,
          isGameMessage: chatMsg.isGameMessage,
        });
        break;
      }

      case 'tetrinet:game_start': {
        const startMsg = message as any;
        this.state = 'playing';
        this.emit('state:change', this.state);

        // Reset all players to alive
        for (const player of this.players.values()) {
          player.alive = true;
          player.level = startMsg.options?.startingLevel || 1;
        }

        this.emit('game:start', {
          options: startMsg.options,
          inProgress: startMsg.inProgress,
        });
        break;
      }

      case 'tetrinet:game_over': {
        const overMsg = message as any;
        this.state = 'connected';
        this.emit('state:change', this.state);
        this.emit('game:end', {
          winnerSlot: overMsg.winnerSlot,
        });
        break;
      }

      case 'tetrinet:field_update': {
        const fieldMsg = message as any;
        this.emit('field:update', {
          slot: fieldMsg.slot,
          field: fieldMsg.field,
          level: fieldMsg.level,
        });
        break;
      }

      case 'tetrinet:special_used': {
        const specialMsg = message as any;
        this.emit('special:used', {
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
        this.emit('player:lost', { slot: lostMsg.slot });
        break;
      }

      case 'tetrinet:options_update': {
        const optionsMsg = message as any;
        if (optionsMsg.options.winlist) {
          this.emit('winlist', optionsMsg.options.winlist);
        }
        if (optionsMsg.options.paused !== undefined) {
          this.emit('game:pause', optionsMsg.options.paused);
        }
        if (optionsMsg.options.clientInfoRequest) {
          // Server requested client info, respond
          this.send(formatTetrenetClientInfo('GRANDMASTER', '1.0'));
        }
        break;
      }

      case 'tetrinet:leave': {
        // Connection rejected
        const leaveMsg = message as any;
        this.emit('error', new Error(leaveMsg.reason || 'Connection rejected'));
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
      this.emit('state:change', this.state);
      this.emit('disconnected');
    }
  }
}

/**
 * Create a TetriNET client
 */
export function createTetriNetClient(options: TetriNetClientOptions): TetriNetClient {
  return new TetriNetClient(options);
}
