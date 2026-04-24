/**
 * Connection Manager Module
 *
 * Handles Socket.IO connection to BBS server with:
 * - Connection state machine
 * - Automatic reconnection with exponential backoff
 * - Connection quality monitoring (RTT, packet loss, jitter)
 * - Heartbeat/keepalive system
 * - Connection recovery after disconnect
 */

import { EventEmitter } from 'events';
import type {
  ConnectionConfig,
  ConnectionState,
  ConnectionStatus,
  ConnectionQuality,
  ConnectionEvents,
  IConnectionManager,
  NetworkMessage,
} from '../types';

// Default configuration
const DEFAULT_CONFIG: Required<ConnectionConfig> = {
  serverUrl: 'ws://localhost:3001',
  autoConnect: false,
  reconnect: true,
  reconnectAttempts: 10,
  reconnectDelay: 1000,
  reconnectDelayMax: 30000,
  heartbeatInterval: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling'],
  auth: {},
};

// Latency thresholds for quality assessment
const QUALITY_THRESHOLDS = {
  excellent: { maxLatency: 50, maxJitter: 10, maxPacketLoss: 0.01 },
  good: { maxLatency: 100, maxJitter: 25, maxPacketLoss: 0.02 },
  fair: { maxLatency: 150, maxJitter: 50, maxPacketLoss: 0.05 },
  poor: { maxLatency: 250, maxJitter: 100, maxPacketLoss: 0.10 },
  // Anything worse is 'critical'
};

/**
 * Connection Manager
 *
 * Manages WebSocket connection to the BBS server with automatic
 * reconnection, quality monitoring, and event handling.
 */
export class ConnectionManager extends EventEmitter implements IConnectionManager {
  readonly name = 'connection';

  private config: Required<ConnectionConfig>;
  private socket: any = null;
  private _state: ConnectionState;
  private heartbeatTimer?: NodeJS.Timeout;
  private latencyTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private latencySamples: number[] = [];
  private packetsSent = 0;
  private packetsReceived = 0;
  private packetsLost = 0;
  private lastPingTime = 0;
  private pendingPings = new Map<number, number>();

  constructor(config: Partial<ConnectionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._state = this.createInitialState();
  }

  /**
   * Create initial connection state
   */
  private createInitialState(): ConnectionState {
    return {
      status: 'disconnected',
      latency: 0,
      packetLoss: 0,
      jitter: 0,
      quality: 'good',
      bytesReceived: 0,
      bytesSent: 0,
      reconnectAttempts: 0,
    };
  }

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return { ...this._state };
  }

  /**
   * Get underlying socket instance
   */
  getSocket(): any {
    return this.socket;
  }

  /**
   * Set a custom socket-like transport (e.g., BrokerClient for in-process multiplayer)
   * Sets connection state to 'connected' immediately since no network handshake needed.
   */
  setSocket(socket: any): void {
    this.socket = socket;
    this.setStatus('connected');
    this._state.connectedAt = new Date();
    this._state.latency = 0;
    this._state.quality = 'excellent';
    this.emit('connected');
  }

  /**
   * Initialize the connection manager
   */
  async init(): Promise<void> {
    if (this.config.autoConnect) {
      await this.connect();
    }
  }

  /**
   * Connect to the server
   */
  async connect(config?: Partial<ConnectionConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (this._state.status === 'connected' || this._state.status === 'connecting') {
      return;
    }

    this.setStatus('connecting');

    try {
      await this.createSocket();
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  /**
   * Create and configure Socket.IO connection
   */
  private async createSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Dynamic import for Socket.IO client
      import('socket.io-client').then(({ io }) => {
        this.socket = io(this.config.serverUrl, {
          transports: this.config.transports,
          timeout: this.config.timeout,
          reconnection: false, // We handle reconnection ourselves
          auth: this.config.auth,
        });

        // Connection successful
        this.socket.on('connect', () => {
          this.setStatus('connected');
          this._state.connectedAt = new Date();
          this._state.reconnectAttempts = 0;
          this.startHeartbeat();
          this.startLatencyMonitoring();
          this.emit('connect');
          resolve();
        });

        // Connection error
        this.socket.on('connect_error', (error: Error) => {
          if (this._state.status === 'connecting') {
            reject(error);
          }
          this.handleConnectionError(error);
        });

        // Disconnection
        this.socket.on('disconnect', (reason: string) => {
          this.handleDisconnect(reason);
        });

        // Pong response for latency measurement
        this.socket.on('pong', (timestamp: number) => {
          this.handlePong(timestamp);
        });

        // Track bytes received
        this.socket.io.on('packet', (packet: any) => {
          if (packet.data) {
            this._state.bytesReceived += JSON.stringify(packet.data).length;
          }
          this.packetsReceived++;
        });

        // Connection timeout
        setTimeout(() => {
          if (this._state.status === 'connecting') {
            this.socket?.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, this.config.timeout);

      }).catch((error) => {
        // Socket.IO not available (server-side)
        console.warn('ConnectionManager: Socket.IO client not available, using mock connection');
        this.useMockConnection();
        resolve();
      });
    });
  }

  /**
   * Use mock connection for server-side or testing
   */
  private useMockConnection(): void {
    this.setStatus('connected');
    this._state.connectedAt = new Date();
    this._state.latency = 10;
    this._state.quality = 'excellent';

    // Create mock socket with event emitter
    this.socket = new EventEmitter();
    (this.socket as any).connected = true;
    (this.socket as any).emit = (event: string, ...args: any[]) => {
      // Simulate network delay
      setTimeout(() => {
        (this.socket as EventEmitter).emit(`response:${event}`, ...args);
      }, 10);
      return true;
    };
    (this.socket as any).disconnect = () => {
      this.handleDisconnect('client disconnect');
    };

    this.emit('connect');
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    this.emit('error', error);

    if (this.config.reconnect && this._state.reconnectAttempts < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.setStatus('error');
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(reason: string): void {
    this.stopHeartbeat();
    this.stopLatencyMonitoring();

    this.emit('disconnect', reason);

    if (this.config.reconnect && reason !== 'io client disconnect') {
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this._state.reconnectAttempts++;
    this.setStatus('reconnecting');

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this._state.reconnectAttempts - 1),
      this.config.reconnectDelayMax
    );
    const jitter = baseDelay * 0.2 * Math.random();
    const delay = baseDelay + jitter;

    this.emit('reconnect_attempt', this._state.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.createSocket();
        this.emit('reconnect', this._state.reconnectAttempts);
      } catch (error) {
        if (this._state.reconnectAttempts < this.config.reconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
          this.emit('reconnect_failed');
        }
      }
    }, delay);
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.stopHeartbeat();
    this.stopLatencyMonitoring();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.setStatus('disconnected');
  }

  /**
   * Set connection status
   */
  private setStatus(status: ConnectionStatus): void {
    if (this._state.status !== status) {
      this._state.status = status;
      this.emit('status_change', status);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        const pingId = Date.now();
        this.pendingPings.set(pingId, pingId);
        this.packetsSent++;
        this.socket.emit('ping', pingId);

        // Track lost packets (pings not responded to within 5 seconds)
        setTimeout(() => {
          if (this.pendingPings.has(pingId)) {
            this.pendingPings.delete(pingId);
            this.packetsLost++;
            this.updatePacketLoss();
          }
        }, 5000);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.pendingPings.clear();
  }

  /**
   * Handle pong response
   */
  private handlePong(pingId: number): void {
    if (this.pendingPings.has(pingId)) {
      const sentTime = this.pendingPings.get(pingId)!;
      const latency = Date.now() - sentTime;
      this.pendingPings.delete(pingId);
      this.addLatencySample(latency);
    }
  }

  /**
   * Start latency monitoring
   */
  private startLatencyMonitoring(): void {
    this.stopLatencyMonitoring();

    this.latencyTimer = setInterval(() => {
      this.updateQuality();
    }, 1000);
  }

  /**
   * Stop latency monitoring
   */
  private stopLatencyMonitoring(): void {
    if (this.latencyTimer) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = undefined;
    }
  }

  /**
   * Add latency sample for averaging
   */
  private addLatencySample(latency: number): void {
    this.latencySamples.push(latency);

    // Keep last 20 samples
    if (this.latencySamples.length > 20) {
      this.latencySamples.shift();
    }

    this.updateLatencyStats();
    this.emit('latency', latency);
  }

  /**
   * Update latency statistics
   */
  private updateLatencyStats(): void {
    if (this.latencySamples.length === 0) return;

    // Calculate average latency
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    this._state.latency = Math.round(sum / this.latencySamples.length);

    // Calculate jitter (standard deviation)
    const mean = sum / this.latencySamples.length;
    const squaredDiffs = this.latencySamples.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    this._state.jitter = Math.round(Math.sqrt(avgSquaredDiff));
  }

  /**
   * Update packet loss statistics
   */
  private updatePacketLoss(): void {
    if (this.packetsSent === 0) {
      this._state.packetLoss = 0;
    } else {
      this._state.packetLoss = this.packetsLost / this.packetsSent;
    }
  }

  /**
   * Update connection quality assessment
   */
  private updateQuality(): void {
    const oldQuality = this._state.quality;
    this._state.quality = this.assessQuality();

    if (oldQuality !== this._state.quality) {
      this.emit('quality_change', this._state.quality);
    }
  }

  /**
   * Assess connection quality based on metrics
   */
  private assessQuality(): ConnectionQuality {
    const { latency, jitter, packetLoss } = this._state;

    for (const [quality, thresholds] of Object.entries(QUALITY_THRESHOLDS)) {
      if (
        latency <= thresholds.maxLatency &&
        jitter <= thresholds.maxJitter &&
        packetLoss <= thresholds.maxPacketLoss
      ) {
        return quality as ConnectionQuality;
      }
    }

    return 'critical';
  }

  /**
   * Manually measure latency
   */
  async measureLatency(): Promise<number> {
    if (!this.socket?.connected) {
      return -1;
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const pingId = start;

      const timeout = setTimeout(() => {
        resolve(-1);
      }, 5000);

      const handler = (id: number) => {
        if (id === pingId) {
          clearTimeout(timeout);
          this.socket.off('pong', handler);
          const latency = Date.now() - start;
          this.addLatencySample(latency);
          resolve(latency);
        }
      };

      this.socket.on('pong', handler);
      this.socket.emit('ping', pingId);
    });
  }

  /**
   * Get current connection quality
   */
  getQuality(): ConnectionQuality {
    return this._state.quality;
  }

  /**
   * Send a message through the socket
   */
  send(event: string, data: any): void {
    if (this.socket?.connected) {
      this._state.bytesSent += JSON.stringify(data).length;
      this.packetsSent++;
      this.socket.emit(event, data);
    }
  }

  /**
   * Send a message and wait for response
   */
  async request<T = any>(event: string, data: any, timeout = 5000): Promise<T> {
    if (!this.socket?.connected) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);

      this.socket.emit(event, data, (response: T) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  /**
   * Listen for events from server
   */
  on(event: string, handler: (...args: any[]) => void): this {
    if (this.socket) {
      this.socket.on(event, handler);
    }
    return super.on(event, handler);
  }

  /**
   * Remove event listener
   */
  off(event: string, handler: (...args: any[]) => void): this {
    if (this.socket) {
      this.socket.off(event, handler);
    }
    return super.off(event, handler);
  }

  /**
   * Join a Socket.IO room
   */
  joinRoom(roomId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join_room', roomId);
    }
  }

  /**
   * Leave a Socket.IO room
   */
  leaveRoom(roomId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave_room', roomId);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.removeAllListeners();
    this.latencySamples = [];
    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.packetsLost = 0;
  }
}

export default ConnectionManager;
