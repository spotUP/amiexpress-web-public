/**
 * Client Door Bridge
 * Manages WebSocket communication between browser-running doors and BBS
 */

import { Socket } from 'socket.io';
import type { BBSSession } from '../index';

// Import SDK protocol types
interface MessageType {
  CONNECT: string;
  DISCONNECT: string;
  CONNECTED: string;
  OUTPUT: string;
  INPUT: string;
  RPC_REQUEST: string;
  RPC_RESPONSE: string;
  RPC_ERROR: string;
  STATE_UPDATE: string;
  PING: string;
  PONG: string;
}

const MessageType: MessageType = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECTED: 'connected',
  OUTPUT: 'output',
  INPUT: 'input',
  RPC_REQUEST: 'rpc-request',
  RPC_RESPONSE: 'rpc-response',
  RPC_ERROR: 'rpc-error',
  STATE_UPDATE: 'state-update',
  PING: 'ping',
  PONG: 'pong',
};

interface ClientDoorSession {
  doorId: string;
  sessionId: string;
  socket: Socket;
  bbsSession: BBSSession;
  active: boolean;
  startTime: Date;
  rpcHandlers: Map<string, (params: any) => Promise<any>>;
}

/**
 * Client Door Bridge
 * Handles WebSocket protocol for client doors
 */
export class ClientDoorBridge {
  private sessions: Map<string, ClientDoorSession> = new Map();
  private nextSessionId: number = 1;

  /**
   * Start a client door session
   *
   * @param socket Socket.IO socket
   * @param session BBS session
   * @param doorId Door identifier
   * @returns Session ID
   */
  startSession(socket: Socket, session: BBSSession, doorId: string): string {
    const sessionId = `client-door-${this.nextSessionId++}-${Date.now()}`;

    console.log(`[ClientDoorBridge] Starting session ${sessionId} for door ${doorId}`);

    // Create session
    const doorSession: ClientDoorSession = {
      doorId,
      sessionId,
      socket,
      bbsSession: session,
      active: true,
      startTime: new Date(),
      rpcHandlers: new Map(),
    };

    this.sessions.set(sessionId, doorSession);

    // Set up event handlers
    this.setupHandlers(doorSession);

    // Send connection message to client
    this.sendMessage(doorSession, {
      type: MessageType.CONNECTED,
      doorId,
      sessionId,
      timestamp: Date.now(),
    });

    // Send user info to client door
    this.sendMessage(doorSession, {
      type: MessageType.CONNECT,
      user: {
        id: session.user?.id || 0,
        name: session.user?.username || 'Guest',
        node: session.nodeId || 1,
        securityLevel: session.user?.secLevel || 0,
        timeLeft: session.timeRemaining || 3600,
        graphicsMode: 'ANSI',
        termWidth: 80,
        termHeight: 24,
        data: {},
      },
      timestamp: Date.now(),
    });

    return sessionId;
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupHandlers(doorSession: ClientDoorSession): void {
    const { socket, sessionId } = doorSession;

    // Listen for door messages on a namespaced event
    const eventName = `door:message:${sessionId}`;

    socket.on(eventName, (message: any) => {
      this.handleMessage(doorSession, message);
    });

    // Listen for user input and forward to door
    const inputHandler = (data: string) => {
      if (!doorSession.active) return;

      // Convert string input to key event
      const key = {
        key: data,
        code: data.charCodeAt(0),
        ctrl: data.charCodeAt(0) < 32,
        alt: false,
        shift: false,
      };

      // Send to door
      this.sendMessage(doorSession, {
        type: MessageType.INPUT,
        data: key,
        timestamp: Date.now(),
      });
    };

    socket.on('command', inputHandler);

    // Store handler reference for cleanup
    (doorSession as any).inputHandler = inputHandler;

    // Handle disconnection
    socket.once('disconnect', () => {
      this.endSession(sessionId);
    });

    // Start keepalive ping
    this.startKeepalive(doorSession);
  }

  /**
   * Handle message from client door
   */
  private handleMessage(doorSession: ClientDoorSession, message: any): void {
    if (!doorSession.active) return;

    const { socket } = doorSession;

    switch (message.type) {
      case MessageType.OUTPUT:
        // Door wants to send output to terminal
        socket.emit('ansi-output', message.data.text);
        break;

      case MessageType.RPC_REQUEST:
        // Door wants to call server-side RPC
        this.handleRPCRequest(doorSession, message);
        break;

      case MessageType.PONG:
        // Keepalive response
        break;

      case MessageType.DISCONNECT:
        // Door wants to disconnect
        this.endSession(doorSession.sessionId);
        break;

      default:
        console.warn(`[ClientDoorBridge] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle RPC request from client door
   */
  private async handleRPCRequest(doorSession: ClientDoorSession, message: any): Promise<void> {
    const { id, method, params } = message;

    try {
      // Check if handler exists
      const handler = doorSession.rpcHandlers.get(method);

      if (!handler) {
        throw new Error(`Unknown RPC method: ${method}`);
      }

      // Execute handler
      const result = await handler(params);

      // Send response
      this.sendMessage(doorSession, {
        type: MessageType.RPC_RESPONSE,
        id,
        result,
        timestamp: Date.now(),
      });

    } catch (error) {
      // Send error response
      this.sendMessage(doorSession, {
        type: MessageType.RPC_ERROR,
        id,
        error: {
          code: -1,
          message: (error as Error).message,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Register RPC handler for hybrid doors
   *
   * @param sessionId Session ID
   * @param method RPC method name
   * @param handler Handler function
   */
  registerRPCHandler(
    sessionId: string,
    method: string,
    handler: (params: any) => Promise<any>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.rpcHandlers.set(method, handler);
    console.log(`[ClientDoorBridge] Registered RPC handler: ${method} for session ${sessionId}`);
  }

  /**
   * Send message to client door
   */
  private sendMessage(doorSession: ClientDoorSession, message: any): void {
    if (!doorSession.active) return;

    const eventName = `door:message:${doorSession.sessionId}`;
    doorSession.socket.emit(eventName, message);
  }

  /**
   * Start keepalive ping
   */
  private startKeepalive(doorSession: ClientDoorSession): void {
    const interval = setInterval(() => {
      if (!doorSession.active) {
        clearInterval(interval);
        return;
      }

      this.sendMessage(doorSession, {
        type: MessageType.PING,
        timestamp: Date.now(),
      });
    }, 30000); // Ping every 30 seconds

    // Store interval for cleanup
    (doorSession as any).keepaliveInterval = interval;
  }

  /**
   * End a client door session
   *
   * @param sessionId Session ID
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`[ClientDoorBridge] Ending session ${sessionId}`);

    // Mark as inactive
    session.active = false;

    // Clean up event handlers
    if ((session as any).inputHandler) {
      session.socket.off('command', (session as any).inputHandler);
    }

    // Clear keepalive
    if ((session as any).keepaliveInterval) {
      clearInterval((session as any).keepaliveInterval);
    }

    // Remove event listener
    session.socket.removeAllListeners(`door:message:${sessionId}`);

    // Remove from sessions
    this.sessions.delete(sessionId);

    // Clear BBS session flag
    delete session.bbsSession.inDoorManager;

    // Return to menu
    session.bbsSession.subState = (session.bbsSession as any).LoggedOnSubState?.DISPLAY_MENU;
    session.bbsSession.menuPause = false;

    console.log(`[ClientDoorBridge] Session ${sessionId} ended`);
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): ClientDoorSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ClientDoorSession[] {
    return Array.from(this.sessions.values()).filter(s => s.active);
  }

  /**
   * End all sessions for a socket
   */
  endSocketSessions(socket: Socket): void {
    const sessionsToEnd: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.socket.id === socket.id) {
        sessionsToEnd.push(sessionId);
      }
    }

    for (const sessionId of sessionsToEnd) {
      this.endSession(sessionId);
    }
  }
}

/**
 * Global bridge instance
 */
let globalBridge: ClientDoorBridge | null = null;

/**
 * Get or create global bridge instance
 */
export function getClientDoorBridge(): ClientDoorBridge {
  if (!globalBridge) {
    globalBridge = new ClientDoorBridge();
  }
  return globalBridge;
}
