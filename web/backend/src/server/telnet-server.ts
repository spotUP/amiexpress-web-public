/**
 * Telnet Server for AmiExpress BBS
 *
 * Implements RFC 854 (Telnet Protocol) with IAC command handling
 * Based on express.e telnet implementation (lines 2386-2508)
 *
 * Features:
 * - Full IAC (Interpret As Command) protocol support
 * - NAWS (Negotiate About Window Size) - RFC 1073
 * - Telnet option negotiation (WILL/WONT/DO/DONT)
 * - Integration with BBS session management
 * - Connection rate limiting
 */

import { Server as NetServer, Socket } from 'net';
import { EventEmitter } from 'events';
import { createSession, getNextAvailableNodeId, checkConnectionLimit, setSession } from './session-manager';
import { LOCALHOST_IPS } from '../index';
import { BBSSession } from '../index';
import { config } from '../config';
import { DEFAULT_CONNECTION_BAUD } from '../constants/modem';
import { ipBanManager } from '../security/ip-ban-manager';
import { LoggedOnSubState } from '../constants/bbs-states';

// Telnet IAC (Interpret As Command) constants - express.e:2389-2508
const IAC = 255;  // Interpret As Command
const DONT = 254; // Don't perform option
const DO = 253;   // Do perform option
const WONT = 252; // Won't perform option
const WILL = 251; // Will perform option
const SB = 250;   // Subnegotiation begin
const SE = 240;   // Subnegotiation end

// Telnet options
const TELOPT_ECHO = 1;        // Echo
const TELOPT_SGA = 3;         // Suppress Go Ahead
const TELOPT_STATUS = 5;      // Status
const TELOPT_TIMING_MARK = 6; // Timing Mark
const TELOPT_TTYPE = 24;      // Terminal Type (RFC 1091)
const TELOPT_NAWS = 31;       // Negotiate About Window Size (RFC 1073)
const TELOPT_LINEMODE = 34;   // Linemode (RFC 1184)

// TTYPE subnegotiation commands
const TTYPE_SEND = 1;         // Request terminal type
const TTYPE_IS = 0;           // Terminal type response

/**
 * IAC Protocol State Machine
 * Based on express.e:370-374, 2389-2508
 */
enum IACState {
  NORMAL = 0,      // Normal data mode
  IAC_SEEN = 1,    // IAC (255) received, waiting for command
  CMD_SEEN = 2,    // Command received, waiting for option
  SB_SEEN = 3,     // SB received, waiting for option
  SB_DATA = 4,     // In SB data mode
  SB_IAC = 5       // IAC in SB mode (possible end)
}

/**
 * Telnet Connection
 * Wraps a raw TCP socket with telnet protocol handling
 */
export class TelnetConnection extends EventEmitter {
  private socket: Socket;
  private iacState: IACState = IACState.NORMAL;
  private iaccmd: number = 0;
  private nawsMode: number = 0;
  private nawsWidth: number = 80;
  private nawsHeight: number = 24;
  private willSent: boolean = false;
  private doSent: boolean = false;
  private ttypeRequested: boolean = false;
  private ttypeData: number[] = [];
  public terminalType: string = 'unknown';
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;

  constructor(socket: Socket) {
    super();
    this.socket = socket;
    this.nodeId = getNextAvailableNodeId();
    this.sessionId = `telnet-${this.nodeId}-${Date.now()}`;

    // Set up socket event handlers
    this.socket.on('data', this.handleData.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    this.socket.on('close', this.handleClose.bind(this));

    // Initialize telnet negotiation (express.e:1029-1055)
    this.initializeTelnet();
  }

  /**
   * Initialize telnet connection with option negotiation
   * Send WILL/DO commands for supported options
   */
  private initializeTelnet(): void {
    // Request character-at-a-time mode (disable linemode)
    this.sendCommand([IAC, DONT, TELOPT_LINEMODE]);
    this.sendCommand([IAC, WONT, TELOPT_LINEMODE]);

    // Request client terminal type (RFC 1091)
    this.sendCommand([IAC, DO, TELOPT_TTYPE]);

    // Request client to send window size (NAWS)
    this.sendCommand([IAC, DO, TELOPT_NAWS]);

    // We will echo characters
    this.sendCommand([IAC, WILL, TELOPT_ECHO]);

    // We will suppress go-ahead
    this.sendCommand([IAC, WILL, TELOPT_SGA]);

    // Request client to suppress go-ahead
    this.sendCommand([IAC, DO, TELOPT_SGA]);
  }

  /**
   * Handle incoming data with IAC protocol processing
   * Based on express.e:2386-2508
   */
  private handleData(data: Buffer): void {
    const output: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      switch (this.iacState) {
        case IACState.NORMAL:
          if (byte === IAC) {
            this.iacState = IACState.IAC_SEEN;
          } else if (byte === 0) {
            // Telnet clients often send CR NUL; ignore NUL padding
          } else {
            output.push(byte);
          }
          break;

        case IACState.IAC_SEEN:
          if (byte === IAC) {
            // IAC IAC = literal 255
            output.push(255);
            this.iacState = IACState.NORMAL;
          } else if (byte === SB) {
            // IAC SB = Subnegotiation begin
            this.iacState = IACState.SB_SEEN;
          } else if (byte >= WILL && byte <= DONT) {
            // IAC WILL/WONT/DO/DONT = option negotiation
            this.iaccmd = byte;
            this.iacState = IACState.CMD_SEEN;
          } else {
            // Unknown command, return to normal
            this.iacState = IACState.NORMAL;
          }
          break;

        case IACState.CMD_SEEN:
          // Process option negotiation command
          this.handleNegotiation(this.iaccmd, byte);
          this.iacState = IACState.NORMAL;
          break;

        case IACState.SB_SEEN:
          // Subnegotiation option
          if (byte === TELOPT_NAWS) {
            this.nawsMode = 4; // Expecting 4 bytes (width MSB, width LSB, height MSB, height LSB)
          } else if (byte === TELOPT_TTYPE) {
            this.ttypeData = []; // Start collecting TTYPE data
          }
          this.iacState = IACState.SB_DATA;
          break;

        case IACState.SB_DATA:
          // Process subnegotiation data
          if (byte === IAC) {
            this.iacState = IACState.SB_IAC;
          } else if (this.nawsMode > 0) {
            // NAWS data processing (express.e:2404-2412)
            if (this.nawsMode === 4) this.nawsWidth = byte << 8;
            if (this.nawsMode === 3) this.nawsWidth = (this.nawsWidth & 0xff00) | byte;
            if (this.nawsMode === 2) this.nawsHeight = byte << 8;
            if (this.nawsMode === 1) {
              this.nawsHeight = (this.nawsHeight & 0xff00) | byte;
              // Width and height complete - emit event
              this.emit('window-size', this.nawsWidth || 80, this.nawsHeight || 24);
            }
            this.nawsMode--;
          } else if (this.ttypeData.length >= 0) {
            // TTYPE data collection
            this.ttypeData.push(byte);
          }
          break;

        case IACState.SB_IAC:
          if (byte === SE) {
            // IAC SE = end of subnegotiation
            // Process collected TTYPE data
            if (this.ttypeData.length > 0) {
              this.handleTerminalType();
            }
            this.iacState = IACState.NORMAL;
          } else if (byte === IAC) {
            // IAC IAC in SB mode = literal 255
            this.iacState = IACState.SB_DATA;
          } else {
            // Continue SB data
            this.iacState = IACState.SB_DATA;
          }
          break;
      }
    }

    // Emit clean data (without IAC sequences)
    if (output.length > 0) {
      this.emit('data', Buffer.from(output));
    }
  }

  /**
   * Handle TERMINAL-TYPE subnegotiation response (RFC 1091)
   * Detects C64 vs modern terminals based on reported type
   */
  private handleTerminalType(): void {
    // First byte should be TTYPE_IS (0)
    if (this.ttypeData.length < 2 || this.ttypeData[0] !== TTYPE_IS) {
console.log(`[Telnet] Invalid TTYPE response on node ${this.nodeId}`);
      return;
    }

    // Extract terminal type string (skip first byte which is TTYPE_IS)
    const terminalTypeBytes = this.ttypeData.slice(1);
    const terminalTypeString = String.fromCharCode(...terminalTypeBytes).toUpperCase();

    this.terminalType = terminalTypeString;
console.log(`[Telnet] Node ${this.nodeId} terminal type: "${terminalTypeString}"`);

    // Detect C64 based on terminal type string
    const isC64 = terminalTypeString.includes('C64') ||
                  terminalTypeString.includes('COMMODORE') ||
                  terminalTypeString.includes('PETSCII');

    // Detect Amiga terminals - these need Amiga compatibility mode (no Unicode)
    // Common Amiga terminal programs: Term, NComm, JRComm, DCTelnet, AmiTCP telnet
    const isAmiga = terminalTypeString.includes('AMIGA') ||
                    terminalTypeString.includes('TERM') ||
                    terminalTypeString.includes('NCOMM') ||
                    terminalTypeString.includes('JRCOMM') ||
                    terminalTypeString.includes('VT52') ||  // Amiga often reports VT52
                    terminalTypeString === 'UNKNOWN';       // Amiga terminals often don't negotiate

    // Modern terminals that support Unicode (xterm, vt100, etc.)
    // These get full Unicode support even over telnet
    const isModernTerminal = terminalTypeString.includes('XTERM') ||
                             terminalTypeString.includes('VT100') ||
                             terminalTypeString.includes('VT220') ||
                             terminalTypeString.includes('LINUX') ||
                             terminalTypeString.includes('SCREEN') ||
                             terminalTypeString.includes('TMUX') ||
                             terminalTypeString.includes('PUTTY') ||
                             terminalTypeString.includes('KONSOLE') ||
                             terminalTypeString.includes('GNOME') ||
                             terminalTypeString.includes('ITERM') ||
                             terminalTypeString.includes('ALACRITTY') ||
                             terminalTypeString.includes('KITTY') ||
                             terminalTypeString.includes('WINDOWS') ||
                             terminalTypeString.includes('MINTTY') ||
                             terminalTypeString.includes('RXVT');

    // Unicode capable if it's a modern terminal and NOT an Amiga/C64
    const unicodeCapable = isModernTerminal && !isAmiga && !isC64;

    console.log(`[Telnet] Node ${this.nodeId} terminal "${terminalTypeString}" - ` +
                `isAmiga: ${isAmiga}, isModern: ${isModernTerminal}, unicodeCapable: ${unicodeCapable}`);

    // Emit terminal-type event for session configuration
    this.emit('terminal-type', {
      terminalType: terminalTypeString,
      isC64: isC64,
      isAmiga: isAmiga,
      unicodeCapable: unicodeCapable,
      width: isC64 ? 40 : 80,
      height: isC64 ? 25 : 24
    });
  }

  /**
   * Handle telnet option negotiation
   * Based on express.e IAC handling
   */
  private handleNegotiation(command: number, option: number): void {
    switch (command) {
      case WILL:
        // Client willing to do something
        if (option === TELOPT_TTYPE) {
          // Client will send terminal type - request it
          if (!this.ttypeRequested) {
            this.sendCommand([IAC, SB, TELOPT_TTYPE, TTYPE_SEND, IAC, SE]);
            this.ttypeRequested = true;
          }
        } else if (option === TELOPT_NAWS) {
          // Client will send window size - acknowledge
          if (!this.doSent) {
            this.sendCommand([IAC, DO, TELOPT_NAWS]);
            this.doSent = true;
          }
        } else if (option === TELOPT_SGA) {
          // Client will suppress go-ahead - acknowledge
          this.sendCommand([IAC, DO, TELOPT_SGA]);
        }
        break;

      case WONT:
        // Client won't do something - acknowledge
        this.sendCommand([IAC, DONT, option]);
        break;

      case DO:
        // Client requests us to do something
        if (option === TELOPT_ECHO || option === TELOPT_SGA) {
          // We will echo/suppress-go-ahead - acknowledge
          if (!this.willSent) {
            this.sendCommand([IAC, WILL, option]);
            this.willSent = true;
          }
        } else {
          // We won't do this option
          this.sendCommand([IAC, WONT, option]);
        }
        break;

      case DONT:
        // Client requests us not to do something - acknowledge
        this.sendCommand([IAC, WONT, option]);
        break;
    }
  }

  /**
   * Send telnet command sequence
   */
  private sendCommand(bytes: number[]): void {
    this.socket.write(Buffer.from(bytes));
  }

  /**
   * Write data to telnet connection
   * Escapes IAC (255) as IAC IAC
   */
  public write(data: string | Buffer): void {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    const output: number[] = [];

    // Escape IAC characters (express.e handles this implicitly)
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      output.push(byte);
      if (byte === IAC) {
        output.push(IAC); // Double IAC to escape
      }
    }

    this.socket.write(Buffer.from(output));
  }

  /**
   * Get remote address
   */
  public getRemoteAddress(): string {
    return this.socket.remoteAddress || 'unknown';
  }

  /**
   * Get terminal dimensions from NAWS
   */
  public getWindowSize(): { width: number; height: number } {
    return {
      width: this.nawsWidth || 80,
      height: this.nawsHeight || 24
    };
  }

  /**
   * Close connection
   */
  public close(): void {
    this.socket.end();
  }

  /**
   * Handle socket errors
   */
  private handleError(error: Error): void {
console.error(`[Telnet] Connection error on node ${this.nodeId}:`, error.message);
    this.emit('error', error);
  }

  /**
   * Handle socket close
   */
  private handleClose(): void {
console.log(`[Telnet] Connection closed on node ${this.nodeId}`);
    this.emit('close');
  }
}

/**
 * Telnet Server
 * Listens on port 23 (or configured port) and creates telnet connections
 */
export class TelnetServer extends EventEmitter {
  private server: NetServer;
  private port: number;
  private connections: Map<string, TelnetConnection> = new Map();

  constructor(port: number = 2323) {
    super();
    this.port = port;
    this.server = new NetServer();

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));
  }

  /**
   * Start telnet server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
console.log(`[Telnet Server] Listening on port ${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop telnet server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active connections
      for (const conn of this.connections.values()) {
        conn.close();
      }
      this.connections.clear();

      this.server.close(() => {
console.log('[Telnet Server] Stopped');
        resolve();
      });
    });
  }

  /**
   * Handle incoming telnet connection
   * Based on express.e:1024-1055 (acceptIncomingConnection)
   */
  private handleConnection(socket: Socket): void {
    const remoteAddress = socket.remoteAddress || 'unknown';

    // Silently ignore localhost probe connections (Render.com internal health checks/service discovery)
    // These spam the logs but don't represent real user connections.
    // Dev note: only apply in production. Local debugging (scripted repros, curl-driven tests)
    // legitimately connects from localhost.
    const isLocalhost = remoteAddress === '::1' || remoteAddress === '127.0.0.1' ||
                        remoteAddress === '::ffff:127.0.0.1' || remoteAddress === 'localhost';

    if (isLocalhost && process.env.NODE_ENV === 'production') {
      socket.end();
      return;
    }

    console.log(`[Telnet Server] New connection from ${remoteAddress}`);

    // Reduce input latency (especially noticeable under modem emulation)
    socket.setNoDelay(true);

    if (!ipBanManager.allowConnection(remoteAddress)) {
      console.warn(`[Telnet Server] Connection attempt blocked for ${remoteAddress} (suspicious activity)`);
      socket.write('Too many requests. Try again later.\r\n');
      socket.end();
      return;
    }

    // Check rate limiting (express.e uses similar connection tracking)
    if (!checkConnectionLimit(remoteAddress)) {
      console.warn(`[Telnet Server] Rate limit exceeded for ${remoteAddress}`);
      socket.write('Too many connections. Please try again later.\r\n');
      socket.end();
      return;
    }

    // Create telnet connection with IAC processing
    const connection = new TelnetConnection(socket);

    // Store connection
    this.connections.set(connection.sessionId, connection);

    // Create BBS session with unified options (express.e:1028-1044)
    const cfg = config.getConfig();
    const session = createSession(connection.nodeId, {
      connectionType: 'telnet',
      remoteAddress: remoteAddress,
      connectionHostname: cfg.hostname,
      connectionPort: this.port,
      connectionBaud: DEFAULT_CONNECTION_BAUD
    });
    connection.session = session;

    // Map session to node ID for lookup
    setSession(connection.sessionId, session);

    // Forward events
    connection.on('data', (data: Buffer) => {
      this.emit('data', connection, data);
    });

    connection.on('window-size', (width: number, height: number) => {
console.log(`[Telnet] Node ${connection.nodeId} window size: ${width}x${height}`);
      this.emit('window-size', connection, width, height);
    });

    connection.on('close', () => {
      this.connections.delete(connection.sessionId);
      this.emit('disconnect', connection);
    });

    connection.on('error', (error: Error) => {
console.error(`[Telnet] Error on node ${connection.nodeId}:`, error.message);
    });

    // Emit connection event
    this.emit('connection', connection);

    // Wait briefly for terminal type negotiation before showing prompt
    // This allows C64 terminals to be auto-detected via TTYPE
    let promptShown = false;
    const showPrompt = () => {
      if (promptShown) return;
      promptShown = true;

      // Check if C64 was detected - skip graphics prompt and go straight to PETSCII mode
      if (connection.session && connection.terminalType &&
          (connection.terminalType.includes('C64') ||
           connection.terminalType.includes('COMMODORE') ||
           connection.terminalType.includes('PETSCII'))) {
console.log(`[Telnet] C64 terminal detected (${connection.terminalType}) - auto-enabling PETSCII mode`);
        connection.session.terminalType = 'c64';
        connection.session.petsciiMode = true;
        connection.session.ansiEnabled = false;
        connection.session.screenWidth = 40;
        connection.session.screenHeight = 25;
        connection.session.subState = LoggedOnSubState.DISPLAY_BBSTITLE;
        connection.session.tempData = { inputBuffer: '' };
        // Emit terminal detection event for index.ts to handle BBSTITLE display
        this.emit('c64-detected', connection);
      } else if (connection.session) {
        // Show standard ANSI prompt for non-C64 terminals
        connection.session.subState = LoggedOnSubState.ANSI_PROMPT;
        connection.session.tempData = { inputBuffer: '' };
        connection.write('\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
      }
    };

    // Listen for terminal-type event (comes from handleTerminalType)
    connection.once('terminal-type', (info: {
      terminalType: string;
      isC64: boolean;
      isAmiga: boolean;
      unicodeCapable: boolean;
      width: number;
      height: number;
    }) => {
      // Store unicode capability in session for doors to use
      if (connection.session) {
        (connection.session as any).unicodeCapable = info.unicodeCapable;
        (connection.session as any).isAmigaTerminal = info.isAmiga;
        (connection.session as any).detectedTerminalType = info.terminalType;
      }
      showPrompt();
    });

    // Timeout after 500ms if no TTYPE response - show prompt anyway
    setTimeout(() => {
      showPrompt();
    }, 500);
  }

  /**
   * Handle server errors
   */
  private handleError(error: Error): void {
console.error('[Telnet Server] Error:', error.message);
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
  public getConnection(nodeId: number): TelnetConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.nodeId === nodeId) {
        return conn;
      }
    }
    return undefined;
  }
}
