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
import { MOUSE_REPORTING_OFF } from '../utils/terminal-modes';
import { createSession, getNextAvailableNodeId, checkConnectionLimit, setSession } from './session-manager';
import { BBSSession } from '../index';
import { config } from '../config';
import { DEFAULT_CONNECTION_BAUD } from '../constants/modem';
import { ipBanManager } from '../security/ip-ban-manager';
import { LoggedOnSubState } from '../constants/bbs-states';
import { classifyTerminalType } from './telnet-server';
import { applyTerminalTypeReport, applyWindowSizeReport, type TerminalTypeReport } from '../amiga-emulation/xim/screen-width.util';
import { ANSI_GRAPHICS_PROMPT } from '../services/login-connect.service';

/**
 * SSH Connection
 * Wraps an SSH session with the same interface as TelnetConnection
 */
/**
 * What the pty said before the BBS session existed - its terminal type and its
 * size - put on the session when it is made.
 *
 * ssh2 delivers `pty` before `shell`, and the session is made on `ready`
 * (from `shell`), so both reports were emitted to a connection with no
 * session and dropped: an SSH caller stayed 80x24 and Latin-1 until he
 * resized (web-vs-telnet audit item 1, 2026-09-28). The same appliers the
 * events use, so nothing here is a second copy of session init.
 */
export function applyPtyToSession(connection: SSHConnection, session: BBSSession): void {
  if (connection.terminalReport) applyTerminalTypeReport(session as any, connection.terminalReport);
  const size = connection.getWindowSize();
  applyWindowSizeReport(session as any, size.width, size.height);
}

export class SSHConnection extends EventEmitter {
  private connection: Connection;
  private stream: any = null;
  /** Written before the shell opened; flushed in order when it does. */
  private pendingWrites: Buffer[] = [];
  /** Set by the one hangup (close() or the stream's own close); nothing is written after it. */
  private closed = false;
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  private terminalWidth: number = 80;
  private terminalHeight: number = 24;

  constructor(connection: Connection, assignedNode?: number) {
    super();
    this.connection = connection;
    const nodeId = assignedNode ?? getNextAvailableNodeId();
    if (nodeId === null) throw new Error('No free node');
    this.nodeId = nodeId;
    this.sessionId = `ssh-${this.nodeId}-${Date.now()}`;

    // Set up connection event handlers
    this.connection.on('authentication', this.handleAuthentication.bind(this));
    this.connection.on('ready', this.handleReady.bind(this));
    this.connection.on('error', this.handleError.bind(this));
    this.connection.on('close', this.handleClose.bind(this));
  }

  /**
   * Handle SSH authentication.
   *
   * SSH here is a pure TRANSPORT, exactly like telnet (which has no
   * transport auth at all). The SSH layer intentionally accepts the
   * connection WITHOUT validating credentials — `ctx.username` is only
   * logged, never trusted. Real authentication happens afterwards in the
   * shared BBS login flow (`runPreLoginConnect` -> username/password
   * screens), and `createSession()` below is created UNAUTHENTICATED and
   * never receives `ctx.username`. Do NOT add a credential check here
   * expecting it to gate BBS access — it wouldn't, and it would break
   * clients that connect SSH-as-transport with an arbitrary username.
   *
   * Pre-filling the BBS login from the SSH credentials, through the same
   * `AuthenticationUseCase` the login loop uses, is a later feature and
   * would be the only reason to make this handler care who the caller
   * claims to be.
   */
  private handleAuthentication(ctx: any): void {
    if (ctx.method === 'password' || ctx.method === 'none' || ctx.method === 'keyboard-interactive') {
console.log(`[SSH] Transport auth accepted (method=${ctx.method}, username=${ctx.username}); BBS login gates access`);
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
console.log(`[SSH] PTY requested: ${this.terminalWidth}x${this.terminalHeight} term=${info.term}`);

        /**
         * TP-12. `info.term` is the SSH client's terminal type and it was
         * read by nothing: an SSH caller was `unicodeCapable: false` for
         * ever, so every blessed door drew in Amiga/ACS fallback mode
         * (sdk/utils/blessed-helpers.ts reads `bbs.unicodeCapable`), and the
         * wire charset predicate had no terminal to look at.
         *
         * Classified by the SAME `classifyTerminalType` telnet uses, and
         * emitted with the SAME payload shape, so it flows through the one
         * applier rather than a second copy of session init.
         *
         * PETSCII is NOT flipped here (non-goal, recorded): a `term` of
         * `C64` is remembered and logged, and `petsciiMode` stays untouched
         * - the graphics prompt is what turns PETSCII on, for every
         * transport.
         */
        const termString = String(info.term || '').toUpperCase();
        if (termString) {
          const { isC64, isAmiga, unicodeCapable } = classifyTerminalType(termString);
          // KEPT, not only emitted: ssh2 delivers `pty` before `shell`, and the
          // BBS session is made on `ready` (from `shell`) - so this event finds
          // no session and is dropped. The session applies the kept report
          // when it is created (see the `ready` handler below).
          this.terminalReport = {
            terminalType: termString,
            isC64,
            isAmiga,
            unicodeCapable,
            width: isC64 ? 40 : this.terminalWidth,
            height: isC64 ? 25 : this.terminalHeight,
          };
          this.emit('terminal-type', this.terminalReport);
        }

        // A pty request carries the size too, and only `window-change` used
        // to say so - an SSH caller who never resized their window stayed at
        // the 80x24 default the session manager creates.
        this.emit('window-size', this.terminalWidth, this.terminalHeight);

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
        // Anything the BBS said before the shell existed goes out first.
        this.flushPendingWrites();

        // Forward data from client to BBS
        this.stream.on('data', (data: Buffer) => {
          this.emit('data', data);
        });

        // Handle stream close
        this.stream.on('close', () => {
console.log(`[SSH] Stream closed on node ${this.nodeId}`);
          this.closed = true;
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
    if (this.closed) return;
    if (this.stream) {
      this.stream.write(data);
      return;
    }
    /**
     * TP-12. This used to DISCARD anything written before the shell handler
     * assigned `this.stream`, silently and with no error. The window is
     * narrow - `'connection'` is emitted synchronously before any `'ready'`
     * - but a write that vanishes is a defect whatever the window, and it
     * is the only candidate the research could name for the ~478 bytes of
     * FRONTEND screen that went missing on SSH during the parity walk.
     */
    this.pendingWrites.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : data);
  }

  /** Everything written before the shell existed, in the order it was written. */
  private flushPendingWrites(): void {
    if (!this.stream || this.pendingWrites.length === 0) return;
    const queued = this.pendingWrites;
    this.pendingWrites = [];
console.log(`[SSH] Flushing ${queued.length} write(s) queued before the shell opened`);
    for (const chunk of queued) this.stream.write(chunk);
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
  /** The pty's terminal report, kept for the session that does not exist yet. */
  public terminalReport: TerminalTypeReport | null = null;

  public getWindowSize(): { width: number; height: number } {
    return {
      width: this.terminalWidth || 80,
      height: this.terminalHeight || 24
    };
  }

  /**
   * Close connection - mouse reporting off first; see TelnetConnection.close
   * (sysop, 2026-09-30: "massive mouse leak when they log off").
   */
  public close(): void {
    // One hangup: the stream's own 'close' handler also ends the connection,
    // and a second close() must not write to a stream that is already down.
    if (this.closed) return;
    if (this.stream) {
      this.stream.write(MOUSE_REPORTING_OFF);
      this.closed = true;
      this.stream.close();
    }
    this.closed = true;
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
          /**
           * TP-13b. A half-open SSH connection - a laptop that slept, a
           * router that dropped the flow - held its node until the OS TCP
           * keepalive noticed, which is hours by default. ssh2 pings the
           * client every 60 s and gives up after three unanswered, so the
           * node comes back in about three minutes.
           *
           * This is NOT an idle-caller timeout: a caller sitting at a
           * prompt answers these pings and is left alone.
           */
          keepaliveInterval: 60000,
          keepaliveCountMax: 3,
        } as any, this.handleConnection.bind(this));

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

    // A node first, as the web and telnet paths take one. An SSH client is
    // still authenticating here, so a full board just closes it.
    const nodeId = getNextAvailableNodeId();
    if (nodeId === null) {
console.warn(`[SSH Server] All nodes busy - refusing ${remoteAddress}`);
      client.end();
      return;
    }

    // Create SSH connection wrapper
    const connection = new SSHConnection(client, nodeId);

    // Store connection
    this.connections.set(connection.sessionId, connection);

    // Wait for connection to be ready before creating BBS session
    connection.on('ready', async () => {
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

      applyPtyToSession(connection, session);

      // Map session to node ID for lookup
      setSession(connection.sessionId, session);

console.log(`[SSH] BBS session created for node ${connection.nodeId}`);

      // Pre-login pipeline shared with web + telnet. See
      // telnet-server.ts:showPrompt() comment and
      // services/login-connect.service.ts for the unified flow.
      const emitter = (connection as any).emitter;
      if (emitter) {
        const { runPreLoginConnect } = await import('../services/login-connect.service');
        await runPreLoginConnect(emitter, session, {
          socketId: connection.sessionId,
        });
      } else {
        session.subState = LoggedOnSubState.ANSI_PROMPT;
        session.tempData = { inputBuffer: '' };
        connection.write(ANSI_GRAPHICS_PROMPT);
      }
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
