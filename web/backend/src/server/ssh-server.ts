/**
 * SSH Server for AmiExpress BBS
 *
 * Modern SSH implementation for secure BBS connections
 * No express.e equivalent - SSH wasn't common in 1990s BBS systems
 *
 * Features:
 * - SSH2 protocol support (RFC 4253)
 * - Password authentication
 * - PTY (pseudo-terminal) support
 * - Integration with BBS session management
 * - Connection rate limiting
 * - Same event interface as TelnetConnection for consistency
 */

import { Server as SSHServer, Connection, AcceptConnection } from 'ssh2';
import { EventEmitter } from 'events';
import { createSession, getNextAvailableNodeId, checkConnectionLimit, setSession } from './session-manager';
import { BBSSession } from '../index';
import { config } from '../config';
import { DEFAULT_CONNECTION_BAUD } from '../constants/modem';
import { ipBanManager } from '../security/ip-ban-manager';
import { LoggedOnSubState } from '../constants/bbs-states';

/**
 * SSH Connection
 * Wraps an SSH session with the same interface as TelnetConnection
 */
export class SSHConnection extends EventEmitter {
  private connection: Connection;
  private stream: any = null;
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  private terminalWidth: number = 80;
  private terminalHeight: number = 24;

  constructor(connection: Connection) {
    super();
    this.connection = connection;
    this.nodeId = getNextAvailableNodeId();
    this.sessionId = `ssh-${this.nodeId}-${Date.now()}`;

    // Set up connection event handlers
    this.connection.on('authentication', this.handleAuthentication.bind(this));
    this.connection.on('ready', this.handleReady.bind(this));
    this.connection.on('error', this.handleError.bind(this));
    this.connection.on('close', this.handleClose.bind(this));
  }

  /**
   * Handle SSH authentication
   * Validates username/password against BBS user database
   */
  private handleAuthentication(ctx: any): void {
    if (ctx.method === 'password') {
      // For now, accept any authentication - BBS will handle login
      // In production, you might want to validate against user database here
console.log(`[SSH] Authentication attempt: ${ctx.username}`);
      ctx.accept();
    } else if (ctx.method === 'none') {
      // Allow "none" authentication - BBS will prompt for login
      ctx.accept();
    } else {
      ctx.reject();
    }
  }

  /**
   * Handle SSH connection ready
   * Set up session and shell
   */
  private handleReady(): void {
console.log(`[SSH] Connection ready on node ${this.nodeId}`);

    this.connection.on('session', (accept: AcceptConnection<any>) => {
      const session = accept();

      session.on('pty', (accept: () => void, reject: () => void, info: any) => {
        // Store terminal dimensions from PTY request
        this.terminalWidth = info.cols || 80;
        this.terminalHeight = info.rows || 24;
console.log(`[SSH] PTY requested: ${this.terminalWidth}x${this.terminalHeight}`);
        if (typeof accept === 'function') {
          accept();
        }
      });

      session.on('window-change', (accept: () => void, reject: () => void, info: any) => {
        // Handle terminal resize
        this.terminalWidth = info.cols || 80;
        this.terminalHeight = info.rows || 24;
console.log(`[SSH] Window resize: ${this.terminalWidth}x${this.terminalHeight}`);
        this.emit('window-size', this.terminalWidth, this.terminalHeight);
        if (typeof accept === 'function') {
          accept();
        }
      });

      session.on('shell', (accept: () => void, reject: () => void) => {
console.log(`[SSH] Shell requested on node ${this.nodeId}`);
        this.stream = accept();

        // Forward data from client to BBS
        this.stream.on('data', (data: Buffer) => {
          this.emit('data', data);
        });

        // Handle stream close
        this.stream.on('close', () => {
console.log(`[SSH] Stream closed on node ${this.nodeId}`);
          this.connection.end();
        });

        // Emit connection ready event
        this.emit('ready');
      });

      session.on('exec', (accept: () => void, reject: () => void, info: any) => {
        // Reject exec requests - BBS only supports interactive shell
console.log(`[SSH] Exec request rejected: ${info.command}`);
        reject();
      });
    });
  }

  /**
   * Write data to SSH connection
   */
  public write(data: string | Buffer): void {
    if (this.stream) {
      this.stream.write(data);
    }
  }

  /**
   * Get remote address
   */
  public getRemoteAddress(): string {
    return (this.connection as any)._sock?.remoteAddress || 'unknown';
  }

  /**
   * Get terminal dimensions
   */
  public getWindowSize(): { width: number; height: number } {
    return {
      width: this.terminalWidth || 80,
      height: this.terminalHeight || 24
    };
  }

  /**
   * Close connection
   */
  public close(): void {
    if (this.stream) {
      this.stream.close();
    }
    this.connection.end();
  }

  /**
   * Handle connection errors
   */
  private handleError(error: Error): void {
console.error(`[SSH] Connection error on node ${this.nodeId}:`, error.message);
    this.emit('error', error);
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
console.log(`[SSH] Connection closed on node ${this.nodeId}`);
    this.emit('close');
  }
}

/**
 * SSH Server
 * Listens on port 2222 (or configured port) and creates SSH connections
 */
export class SSHServerImpl extends EventEmitter {
  private server: SSHServer | null = null;
  private port: number;
  private hostKeys: Buffer[];
  private connections: Map<string, SSHConnection> = new Map();

  constructor(port: number = 2222, hostKeys?: Buffer[]) {
    super();
    this.port = port;
    this.hostKeys = hostKeys || [];
  }

  /**
   * Start SSH server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if host keys are provided
      if (this.hostKeys.length === 0) {
console.warn('[SSH Server] No host keys provided - SSH server disabled');
console.warn('[SSH Server] To enable: Generate keys via the admin configuration portal');
console.warn('[SSH Server] Or manually: ssh-keygen -t rsa -b 4096 -f data/ssh/ssh_host_rsa_key -N ""');
        resolve(); // Resolve successfully but don't start
        return;
      }

      try {
        this.server = new SSHServer({
          hostKeys: this.hostKeys,
        }, this.handleConnection.bind(this));

        this.server.on('error', this.handleError.bind(this));

        this.server.listen(this.port, '0.0.0.0', () => {
console.log(`[SSH Server] Listening on port ${this.port}`);
          resolve();
        });

        this.server.on('error', reject);
      } catch (error: any) {
console.error('[SSH Server] Failed to start:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Stop SSH server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active connections
      for (const conn of this.connections.values()) {
        conn.close();
      }
      this.connections.clear();

      if (this.server) {
        this.server.close(() => {
console.log('[SSH Server] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming SSH connection
   */
  private handleConnection(client: Connection): void {
    const remoteAddress = (client as any)._sock?.remoteAddress || 'unknown';
console.log(`[SSH Server] New connection from ${remoteAddress}`);

    if (!ipBanManager.allowConnection(remoteAddress)) {
console.warn(`[SSH Server] Connection from ${remoteAddress} blocked (suspicious activity).`);
      client.end();
      return;
    }

    // Check rate limiting
    if (!checkConnectionLimit(remoteAddress)) {
console.warn(`[SSH Server] Rate limit exceeded for ${remoteAddress}`);
      client.end();
      return;
    }

    // Create SSH connection wrapper
    const connection = new SSHConnection(client);

    // Store connection
    this.connections.set(connection.sessionId, connection);

    // Wait for connection to be ready before creating BBS session
    connection.on('ready', () => {
      // Create BBS session with unified options (same as telnet)
      const cfg = config.getConfig();
      const session = createSession(connection.nodeId, {
        connectionType: 'ssh',
        remoteAddress: remoteAddress,
        connectionHostname: cfg.hostname,
        connectionPort: this.port,
        connectionBaud: DEFAULT_CONNECTION_BAUD
      });
      connection.session = session;

      // Map session to node ID for lookup
      setSession(connection.sessionId, session);

console.log(`[SSH] BBS session created for node ${connection.nodeId}`);

      // Show graphics prompt (same as telnet server)
      session.subState = LoggedOnSubState.ANSI_PROMPT;
      session.tempData = { inputBuffer: '' };
      connection.write('\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
    });

    // Forward events
    connection.on('data', (data: Buffer) => {
      this.emit('data', connection, data);
    });

    connection.on('window-size', (width: number, height: number) => {
console.log(`[SSH] Node ${connection.nodeId} window size: ${width}x${height}`);
      this.emit('window-size', connection, width, height);
    });

    connection.on('close', () => {
      this.connections.delete(connection.sessionId);
      this.emit('disconnect', connection);
    });

    connection.on('error', (error: Error) => {
console.error(`[SSH] Error on node ${connection.nodeId}:`, error.message);
    });

    // Emit connection event
    this.emit('connection', connection);
  }

  /**
   * Handle server errors
   */
  private handleError(error: Error): void {
console.error('[SSH Server] Error:', error.message);
    this.emit('error', error);
  }

  /**
   * Get active connection count
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection by node ID
   */
  public getConnection(nodeId: number): SSHConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.nodeId === nodeId) {
        return conn;
      }
    }
    return undefined;
  }
}
