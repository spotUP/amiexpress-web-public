/**
 * Broker Client - Socket-like adapter for in-process lobby broker
 *
 * Implements the same interface as a Socket.IO socket so it can be
 * used transparently by ConnectionManager, LobbySystem, and other
 * SDK modules that expect a socket.
 *
 * Each door instance creates one BrokerClient. The client forwards
 * protocol events to the LobbyBroker singleton and receives events
 * from the broker via the deliver() method.
 */

import { EventEmitter } from 'events';
import { LobbyBroker, type IBrokerClient } from './lobby-broker';

/**
 * Configuration for creating a BrokerClient
 */
export interface BrokerClientConfig {
  playerId: number;
  playerName: string;
  nodeId: number;
}

/**
 * BrokerClient - acts as a socket for in-process multiplayer
 *
 * The SDK's LobbySystem calls socket.emit('lobby:create', ...) and
 * socket.on('lobby:player_joined', ...). This client routes emit()
 * calls to the broker and receives broker broadcasts via deliver().
 */
export class BrokerClient extends EventEmitter implements IBrokerClient {
  readonly clientId: string;
  readonly playerId: number;
  readonly playerName: string;
  readonly nodeId: number;
  connected = true;

  private broker: LobbyBroker;
  private disposed = false;

  constructor(config: BrokerClientConfig) {
    super();
    this.clientId = `client-${config.nodeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.playerId = config.playerId;
    this.playerName = config.playerName;
    this.nodeId = config.nodeId;

    this.broker = LobbyBroker.getInstance();
    this.broker.registerClient(this);
  }

  /**
   * Override emit to route protocol events to broker
   *
   * Events prefixed with lobby:, game:, match:, state:, input:
   * are forwarded to the broker. Everything else stays local
   * (standard EventEmitter behavior for internal SDK events).
   */
  emit(event: string, ...args: any[]): boolean {
    if (this.disposed) return false;

    // Check if this is a protocol event (vs internal EventEmitter event)
    if (this.isProtocolEvent(event)) {
      // Extract callback if last arg is a function
      let callback: Function | undefined;
      let data: any;

      if (args.length > 0 && typeof args[args.length - 1] === 'function') {
        callback = args[args.length - 1];
        data = args.length > 1 ? args[0] : undefined;
      } else {
        data = args[0];
      }

      this.broker.handleEvent(this.clientId, event, data, callback);
      return true;
    }

    // Non-protocol events use normal EventEmitter
    return super.emit(event, ...args);
  }

  /**
   * Deliver an event from the broker to this client
   * Called by LobbyBroker when broadcasting to lobby members
   */
  deliver(event: string, ...args: any[]): void {
    if (this.disposed) return;

    // Use EventEmitter.emit to trigger handlers set up by LobbySystem etc.
    // This is safe because deliver() uses super.emit(), not our overridden emit()
    try {
      super.emit(event, ...args);
    } catch (err) {
      console.error(`[BrokerClient:${this.clientId}] Error in handler for ${event}:`, err);
    }
  }

  /**
   * Check if an event name is a protocol event (should go to broker)
   */
  private isProtocolEvent(event: string): boolean {
    // Standard EventEmitter events are NOT protocol events
    if (event === 'newListener' || event === 'removeListener' || event === 'error') {
      return false;
    }

    // Protocol namespaces that go through the broker
    return event.startsWith('lobby:') ||
           event.startsWith('game:') ||
           event.startsWith('match:') ||
           event.startsWith('state:') ||
           event.startsWith('input:');
  }

  /**
   * Disconnect from broker (Socket.IO compatibility alias for dispose)
   */
  disconnect(): void {
    this.dispose();
  }

  /**
   * Clean up and disconnect from broker
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connected = false;
    this.broker.unregisterClient(this.clientId);
    this.removeAllListeners();
  }
}
