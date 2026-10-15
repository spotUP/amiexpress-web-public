/**
 * WebSocket Protocol for Client Doors
 * Defines message format for browser-BBS communication
 */

import { BBSUser, KeyEvent } from './types';

/**
 * Message Types
 */
export enum MessageType {
  // Connection lifecycle
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  CONNECTED = 'connected',

  // I/O
  OUTPUT = 'output',
  INPUT = 'input',

  // RPC (for hybrid doors)
  RPC_REQUEST = 'rpc-request',
  RPC_RESPONSE = 'rpc-response',
  RPC_ERROR = 'rpc-error',

  // State
  STATE_UPDATE = 'state-update',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * Base Message
 */
export interface BaseMessage {
  type: MessageType;
  timestamp?: number;
}

/**
 * Connection Messages
 */
export interface ConnectMessage extends BaseMessage {
  type: MessageType.CONNECT;
  user: BBSUser;
}

export interface ConnectedMessage extends BaseMessage {
  type: MessageType.CONNECTED;
  doorId: string;
  sessionId: string;
}

export interface DisconnectMessage extends BaseMessage {
  type: MessageType.DISCONNECT;
  reason?: string;
}

/**
 * I/O Messages
 */
export interface OutputMessage extends BaseMessage {
  type: MessageType.OUTPUT;
  data: {
    text: string;
    userId?: number;
  };
}

export interface InputMessage extends BaseMessage {
  type: MessageType.INPUT;
  data: KeyEvent;
}

/**
 * RPC Messages (Hybrid Doors)
 */
export interface RPCRequestMessage extends BaseMessage {
  type: MessageType.RPC_REQUEST;
  id: string;
  method: string;
  params: any;
}

export interface RPCResponseMessage extends BaseMessage {
  type: MessageType.RPC_RESPONSE;
  id: string;
  result: any;
}

export interface RPCErrorMessage extends BaseMessage {
  type: MessageType.RPC_ERROR;
  id: string;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * State Update Message
 */
export interface StateUpdateMessage extends BaseMessage {
  type: MessageType.STATE_UPDATE;
  data: Record<string, any>;
}

/**
 * Ping/Pong Messages
 */
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

/**
 * Union of all message types
 */
export type WebSocketMessage =
  | ConnectMessage
  | ConnectedMessage
  | DisconnectMessage
  | OutputMessage
  | InputMessage
  | RPCRequestMessage
  | RPCResponseMessage
  | RPCErrorMessage
  | StateUpdateMessage
  | PingMessage
  | PongMessage;

/**
 * Helper to create messages
 */
export class ProtocolHelper {
  static createOutputMessage(text: string, userId?: number): OutputMessage {
    return {
      type: MessageType.OUTPUT,
      timestamp: Date.now(),
      data: { text, userId },
    };
  }

  static createInputMessage(key: KeyEvent): InputMessage {
    return {
      type: MessageType.INPUT,
      timestamp: Date.now(),
      data: key,
    };
  }

  static createRPCRequest(
    id: string,
    method: string,
    params: any
  ): RPCRequestMessage {
    return {
      type: MessageType.RPC_REQUEST,
      timestamp: Date.now(),
      id,
      method,
      params,
    };
  }

  static createRPCResponse(id: string, result: any): RPCResponseMessage {
    return {
      type: MessageType.RPC_RESPONSE,
      timestamp: Date.now(),
      id,
      result,
    };
  }

  static createRPCError(
    id: string,
    code: number,
    message: string,
    data?: any
  ): RPCErrorMessage {
    return {
      type: MessageType.RPC_ERROR,
      timestamp: Date.now(),
      id,
      error: { code, message, data },
    };
  }
}
