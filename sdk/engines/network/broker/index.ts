/**
 * Broker Module - In-process multiplayer coordination
 *
 * Provides lobby coordination between door instances running
 * in the same Node.js process without requiring an external server.
 */

export { LobbyBroker } from './lobby-broker';
export { BrokerClient, type BrokerClientConfig } from './broker-client';
