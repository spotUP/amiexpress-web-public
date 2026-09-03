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
import { resetPetsciiModel } from '../utils/petscii-session-model';
import type { WireCharset } from '../utils/wire-encoding.util';

// Telnet IAC (Interpret As Command) constants - express.e:2389-2508
const IAC = 255;  // Interpret As Command
const DONT = 254; // Don't perform option
const DO = 253;   // Do perform option
const WONT = 252; // Won't perform option
const WILL = 251; // Will perform option
const SB = 250;   // Subnegotiation begin
const SE = 240;   // Subnegotiation end

// Telnet options
const TELOPT_BINARY = 0;      // 8-bit binary transmission (RFC 856)
const TELOPT_ECHO = 1;        // Echo
const TELOPT_SGA = 3;         // Suppress Go Ahead
const TELOPT_STATUS = 5;      // Status
const TELOPT_TIMING_MARK = 6; // Timing Mark
const TELOPT_TTYPE = 24;      // Terminal Type (RFC 1091)
const TELOPT_NAWS = 31;       // Negotiate About Window Size (RFC 1073)
const TELOPT_LINEMODE = 34;   // Linemode (RFC 1184)
const TELOPT_CHARSET = 42;    // Charset (RFC 2066)

// TTYPE subnegotiation commands
const TTYPE_SEND = 1;         // Request terminal type
const TTYPE_IS = 0;           // Terminal type response

// CHARSET subnegotiation commands (RFC 2066:3)
const CHARSET_REQUEST = 1;    // Peer offers a separated list of charset names
const CHARSET_ACCEPTED = 2;   // We take one of them, and name it back
const CHARSET_REJECTED = 3;   // We recognise none of them

/**
 * The charset names this board answers ACCEPTED for, and the wire charset each
 * one resolves to. RFC 2066 names are IANA names, so the same codec arrives
 * under several spellings; every one of them maps to ONE of the three
 * `WireCharset` values `utils/wire-encoding.util.ts` defines, and nothing here
 * is a second terminal list - it is the client stating a fact about itself.
 */
const CHARSET_NAMES: ReadonlyMap<string, WireCharset> = new Map<string, WireCharset>([
  ['UTF-8', 'utf-8'],
  ['UTF8', 'utf-8'],
  ['ISO-8859-1', 'iso-8859-1'],
  ['ISO8859-1', 'iso-8859-1'],
  ['ISO_8859-1', 'iso-8859-1'],
  ['LATIN1', 'iso-8859-1'],
  ['IBM437', 'cp437'],
  ['CP437', 'cp437'],
  ['CSPC8CODEPAGE437', 'cp437'],
]);

/**
 * Result of classifying a reported TTYPE string.
 */
export interface TerminalTypeClassification {
  isC64: boolean;
  isAmiga: boolean;
  unicodeCapable: boolean;
}

/**
 * Classify a TTYPE (RFC 1091) string into C64/Amiga/unicode-capable flags.
 * Pure function extracted from handleTerminalType so the classification
 * logic can be unit-tested without a live telnet negotiation.
 *
 * `terminalTypeString` is expected to already be upper-cased, as
 * handleTerminalType does before calling this.
 *
 * Regression (audit F1/F2): `isAmiga` used to match on `.includes('TERM')`,
 * which also matched 'XTERM', 'XTERM-256COLOR', etc. XTERM is a modern
 * Unicode-capable terminal, not an Amiga one - it was being forced into
 * Amiga-compat (no Unicode) mode. Amiga's own Term.app reports the bare
 * string "TERM" with nothing else, so the fix is an exact-equality check
 * for 'TERM' plus a prefix check for 'AMIGA*' instead of a substring match.
 */
export function classifyTerminalType(terminalTypeString: string): TerminalTypeClassification {
  // Detect C64 based on terminal type string
  const isC64 = terminalTypeString.includes('C64') ||
                terminalTypeString.includes('COMMODORE') ||
                terminalTypeString.includes('PETSCII');

  // Detect Amiga terminals - these need Amiga compatibility mode (no Unicode)
  // Common Amiga terminal programs: Term, NComm, JRComm, DCTelnet, AmiTCP telnet
  const isAmiga = terminalTypeString.startsWith('AMIGA') ||
                  terminalTypeString === 'TERM' ||          // bare "TERM" = Amiga Term; must not match XTERM
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

  return { isC64, isAmiga, unicodeCapable };
}

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
  /**
   * RFC 854 CR-NUL state: when the previous emitted byte was 0x0d
   * (CR), the next 0x00 (NUL) must be stripped as NVT padding. Only
   * tracked during raw transfer (transferRawActive); outside of
   * transfer the whole NUL is stripped unconditionally.
   */
  private lastWasCR: boolean = false;
  private iaccmd: number = 0;
  private nawsMode: number = 0;
  private nawsWidth: number = 80;
  private nawsHeight: number = 24;
  private willSent: boolean = false;
  private doSent: boolean = false;

  /**
   * Per-option state tracking. RFC 854 says responses MUST NOT be
   * sent if they wouldn't change state. Without this we get infinite
   * negotiation loops — e.g. we send DONT LINEMODE at startup, client
   * acks WONT, we ack DONT again (because we're now "receiving"
   * something we already said), client acks WONT again, forever.
   * The loop pollutes the wire mid-ZMODEM transfer with garbage
   * IAC sequences that desync the receiver's parser → "Garbage
   * count exceeded" / "Bad Block (Wrong CRC)" failures.
   *
   * Values are 'agreed' (acked to our DONT/WONT, no need to re-ack)
   * or 'enabled'. Absent = not yet negotiated, response allowed.
   */
  private peerWillState: Map<number, 'on' | 'off'> = new Map();
  private peerDoState:   Map<number, 'on' | 'off'> = new Map();
  private ttypeRequested: boolean = false;
  private ttypeData: number[] = [];
  /**
   * Which option the subnegotiation currently being collected belongs to.
   * Before CHARSET (RFC 2066) arrived, SB data was routed by side effect -
   * `nawsMode > 0` meant NAWS and everything else fell into `ttypeData` - and a
   * third option had nowhere to go. -1 = no subnegotiation in progress.
   */
  private sbOption: number = -1;
  private charsetData: number[] = [];
  /**
   * The charset the peer NEGOTIATED (RFC 2066), if it did. It beats the TTYPE
   * classification - `unicodeCapable` - because it is the client stating a
   * fact rather than this server inferring one from a terminal name. Copied
   * onto the session, which is what `resolveWireCharset` reads.
   */
  public wireCharset: WireCharset | undefined = undefined;
  public terminalType: string = 'unknown';
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  /**
   * Task 10 (dedicated PETSCII port): once true, a real TTYPE response
   * arriving later is parsed for wire-protocol correctness (the option
   * negotiation still completes normally) but its classification is
   * discarded — handleTerminalType() returns before touching
   * `terminalType` or emitting 'terminal-type'. Without this, a client
   * that DOES negotiate on this "C64 from byte one" port (unlike a real
   * C64 over a WiFi modem) could downgrade a session already committed to
   * PETSCII 40x25 back to 80x24 ANSI mid-connection.
   */
  private terminalTypeLocked: boolean = false;

  constructor(socket: Socket, options?: { petsciiDefault?: boolean }) {
    super();
    this.socket = socket;
    this.nodeId = getNextAvailableNodeId();
    this.sessionId = `telnet-${this.nodeId}-${Date.now()}`;

    if (options?.petsciiDefault) {
      // Synchronet convention: connections on this port are PETSCII from
      // byte one. `terminalType` matches what a real handleTerminalType()
      // TTYPE parse would produce (contains "PETSCII" so showPrompt()'s
      // existing C64 detection below fires unchanged), and is locked so
      // later negotiation can't override it.
      this.terminalType = 'PETSCII-PORT';
      this.terminalTypeLocked = true;
    }

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
    // Request character-at-a-time mode (disable linemode). Seed peer
    // state to 'off' for both directions so when client mirrors back
    // WONT/DONT LINEMODE we DON'T re-ack and start an infinite loop.
    this.peerWillState.set(TELOPT_LINEMODE, 'off');
    this.peerDoState.set(TELOPT_LINEMODE, 'off');
    this.sendCommand([IAC, DONT, TELOPT_LINEMODE]);
    this.sendCommand([IAC, WONT, TELOPT_LINEMODE]);

    // Request client terminal type (RFC 1091)
    this.sendCommand([IAC, DO, TELOPT_TTYPE]);

    // Request client to send window size (NAWS)
    this.sendCommand([IAC, DO, TELOPT_NAWS]);

    // Ask the client whether it wants to negotiate a charset (RFC 2066). A
    // client that never answers is unaffected - the TTYPE classification
    // decides for it, exactly as before - and the 500 ms TTYPE timer below is
    // the precedent for tolerating silence.
    this.sendCommand([IAC, DO, TELOPT_CHARSET]);

    // We will echo characters
    this.peerDoState.set(TELOPT_ECHO, 'on');
    this.sendCommand([IAC, WILL, TELOPT_ECHO]);

    // We will suppress go-ahead
    this.peerDoState.set(TELOPT_SGA, 'on');
    this.sendCommand([IAC, WILL, TELOPT_SGA]);

    // Request client to suppress go-ahead
    this.sendCommand([IAC, DO, TELOPT_SGA]);
  }

  /**
   * Handle incoming data with IAC protocol processing
   * Based on express.e:2386-2508
   */
  private handleData(data: Buffer): void {
    // ZMODEM transfer in progress: the wire carries raw binary frames
    // containing NUL (0x00) and IAC (0xFF) bytes as legitimate data.
    // Run the full IAC state machine so RFC 854 escape pairs (IAC IAC
    // → 0xFF) collapse correctly and option-renegotiation IAC sequences
    // are honored, but suppress NUL stripping — NUL is valid file data
    // and stripping it corrupts the CRC. The flag is read inside the
    // NORMAL state below.
    const rawTransfer = !!(this.session as any)?.transferRawActive;

    const output: number[] = [];

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      switch (this.iacState) {
        case IACState.NORMAL:
          if (byte === IAC) {
            this.iacState = IACState.IAC_SEEN;
          } else if (byte === 0 && !rawTransfer) {
            // Telnet clients often send CR NUL; ignore NUL padding.
          } else if (byte === 0 && rawTransfer && this.lastWasCR) {
            // RFC 854 CR-NUL collapse: in NVT mode senders escape CR
            // as `CR NUL`. The NUL is padding and MUST be stripped.
            // MuffinTerm doesn't negotiate BINARY transmission, so
            // it sends \r as \r\x00 even inside ZMODEM file data —
            // corrupting the byte stream and breaking the CRC check.
            // Standalone NULs (not preceded by CR) ARE valid binary
            // data during a transfer, so we keep them.
            this.lastWasCR = false;
          } else {
            output.push(byte);
            this.lastWasCR = (byte === 0x0d);
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
          this.sbOption = byte;
          if (byte === TELOPT_NAWS) {
            this.nawsMode = 4; // Expecting 4 bytes (width MSB, width LSB, height MSB, height LSB)
          } else if (byte === TELOPT_TTYPE) {
            this.ttypeData = []; // Start collecting TTYPE data
          } else if (byte === TELOPT_CHARSET) {
            this.charsetData = []; // Start collecting CHARSET data (RFC 2066)
          }
          this.iacState = IACState.SB_DATA;
          break;

        case IACState.SB_DATA:
          // Process subnegotiation data
          if (byte === IAC) {
            this.iacState = IACState.SB_IAC;
          } else if (this.sbOption === TELOPT_CHARSET) {
            this.charsetData.push(byte);
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
            // Process the collected data for the option this SB belonged to.
            // The TTYPE arm keeps its exact pre-CHARSET condition, so a NAWS
            // subnegotiation still behaves the way it always did.
            if (this.sbOption === TELOPT_CHARSET) {
              if (this.charsetData.length > 0) {
                this.handleCharset();
              }
            } else if (this.ttypeData.length > 0) {
              this.handleTerminalType();
            }
            this.sbOption = -1;
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
    if (this.terminalTypeLocked) {
      // Task 10: dedicated PETSCII port already committed this connection
      // to C64 at connect time — a real TTYPE reply arriving afterward
      // (negotiation itself still completed normally in handleNegotiation)
      // must not reclassify it.
console.log(`[Telnet] Node ${this.nodeId} TTYPE response ignored - connection is locked to PETSCII-port defaults`);
      return;
    }

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

    const { isC64, isAmiga, unicodeCapable } = classifyTerminalType(terminalTypeString);

    console.log(`[Telnet] Node ${this.nodeId} terminal "${terminalTypeString}" - ` +
                `isAmiga: ${isAmiga}, isC64: ${isC64}, unicodeCapable: ${unicodeCapable}`);

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
   * Handle a CHARSET subnegotiation (RFC 2066).
   *
   * Only the peer's REQUEST is answered. The wire format is
   * `REQUEST [ "[TTABLE]" <version> ] <sep> <charset> [ <sep> <charset> ... ]`
   * where <sep> is any character the requester picks (conventionally ";") and
   * is stated by being the first byte after the command. We take the FIRST
   * name we recognise, reply ACCEPTED with that exact name, and record the
   * charset the socket is written in from then on. Nothing recognised is a
   * REJECTED, never a silent drop: a client that hears nothing back waits.
   *
   * Translation tables (TTABLE-IS and friends) are not implemented - a
   * REQUEST that asks for one still gets an ACCEPTED naming a charset, which
   * RFC 2066:3.1 permits, because the "[TTABLE]" prefix only says the sender
   * is WILLING to send a table.
   */
  private handleCharset(): void {
    const command = this.charsetData[0];
    if (command !== CHARSET_REQUEST) {
      // ACCEPTED / REJECTED / TTABLE-* are answers to a REQUEST this server
      // never sends. Nothing to do, and nothing to log every frame.
      return;
    }

    let body = String.fromCharCode(...this.charsetData.slice(1));
    const TTABLE = '[TTABLE]';
    if (body.toUpperCase().startsWith(TTABLE)) {
      // Skip the marker and the one-byte version that follows it.
      body = body.slice(TTABLE.length + 1);
    }

    const separator = body.charAt(0);
    if (separator === '') {
      this.sendCommand([IAC, SB, TELOPT_CHARSET, CHARSET_REJECTED, IAC, SE]);
      return;
    }

    const offered = body.slice(1).split(separator).map((name) => name.trim()).filter((name) => name.length > 0);
    for (const name of offered) {
      const resolved = CHARSET_NAMES.get(name.toUpperCase());
      if (!resolved) continue;
      this.wireCharset = resolved;
      if (this.session) this.session.wireCharset = resolved;
console.log(`[Telnet] Node ${this.nodeId} charset negotiated: "${name}" -> ${resolved}`);
      const reply = [IAC, SB, TELOPT_CHARSET, CHARSET_ACCEPTED];
      for (let i = 0; i < name.length; i++) reply.push(name.charCodeAt(i) & 0xff);
      reply.push(IAC, SE);
      this.sendCommand(reply);
      return;
    }

console.log(`[Telnet] Node ${this.nodeId} charset REJECTED - none of [${offered.join(', ')}] is supported`);
    this.sendCommand([IAC, SB, TELOPT_CHARSET, CHARSET_REJECTED, IAC, SE]);
  }

  /**
   * Handle telnet option negotiation
   * Based on express.e IAC handling
   */
  private handleNegotiation(command: number, option: number): void {
    switch (command) {
      case WILL:
        // Client willing to do something. Skip if we already ack'd
        // (peer state already 'on') — RFC 854 forbids re-ack to
        // prevent negotiation loops.
        if (this.peerWillState.get(option) === 'on' && option !== TELOPT_TTYPE) {
          break;
        }
        this.peerWillState.set(option, 'on');
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
        } else if (option === TELOPT_BINARY) {
          // Client agrees to transmit 8-bit binary (RFC 856).
          // Required for ZMODEM file transfers — without it the
          // client applies NVT-mode rules (CR→CRLF/CRNUL, etc.)
          // to binary data, corrupting CRC. We initiate the
          // negotiation before sz/rz spawns; this acknowledges
          // the client's WILL response.
          this.sendCommand([IAC, DO, TELOPT_BINARY]);
        }
        break;

      case WONT:
        // Client won't do something. RFC 854: only respond DONT if
        // our perception of peer state changes. If we already know
        // peer is off (we sent DONT earlier or peer sent WONT earlier),
        // DON'T re-ack — that would cycle the negotiation forever.
        if (this.peerWillState.get(option) !== 'off') {
          this.peerWillState.set(option, 'off');
          this.sendCommand([IAC, DONT, option]);
        }
        break;

      case DO:
        // Client requests us to do something. Only ack if it would
        // change our state.
        if (this.peerDoState.get(option) === 'on') {
          // Already acked WILL for this option; don't re-ack.
          break;
        }
        if (option === TELOPT_ECHO || option === TELOPT_SGA) {
          this.peerDoState.set(option, 'on');
          this.sendCommand([IAC, WILL, option]);
          if (option === TELOPT_ECHO) this.willSent = true;
        } else if (option === TELOPT_BINARY) {
          // Required for ZMODEM. We also initiate via WILL BINARY
          // emit in startZmodemDownload / handleZmodemUploadCommand.
          this.peerDoState.set(option, 'on');
          this.sendCommand([IAC, WILL, TELOPT_BINARY]);
        } else {
          // We won't do this option
          this.peerDoState.set(option, 'off');
          this.sendCommand([IAC, WONT, option]);
        }
        break;

      case DONT:
        // Client requests us not to do something. Only ack if state
        // would change.
        if (this.peerDoState.get(option) !== 'off') {
          this.peerDoState.set(option, 'off');
          this.sendCommand([IAC, WONT, option]);
        }
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
   *
   * BOTH ARMS ARE LIVE, and TP-5 changed neither of them. A BUFFER arrives for
   * a Latin-1 or CP437 caller, already encoded by `encodeForWire`
   * (`utils/wire-encoding.util.ts`) at the ONE place a string becomes bytes.
   * A STRING arrives for a caller who negotiated UTF-8 - where
   * `Buffer.from(data)` is the correct encode and this method is unchanged by
   * design - and for the two pre-emitter fallback prompts (this file's
   * `showPrompt` fallback and `ssh-server.ts`'s), which are pure ASCII.
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
  /**
   * Task 10: dedicated PETSCII port. When set, every connection accepted
   * by this server is treated as C64 from byte one (Synchronet
   * convention) — the strongest autodetect for real C64s, whose WiFi
   * modems negotiate no telnet options at all.
   */
  private petsciiDefault: boolean;

  constructor(port: number = 2323, options?: { petsciiDefault?: boolean }) {
    super();
    this.port = port;
    this.petsciiDefault = !!options?.petsciiDefault;
    this.server = new NetServer();

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));
  }

  /**
   * Start telnet server with retry-backoff on EADDRINUSE.
   *
   * A stale previous process can hold the port in TIME_WAIT for ~60 s after
   * kill. We retry 4 times (0 s, 2 s, 4 s, 8 s) to ride that out without
   * crashing the whole backend.
   */
  public async start(): Promise<void> {
    const maxAttempts = 4;
    const delays = [0, 2000, 4000, 8000];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (delays[attempt] > 0) {
        console.log(`[Telnet Server] Port ${this.port} busy — retrying in ${delays[attempt] / 1000}s (attempt ${attempt + 1}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (err: NodeJS.ErrnoException) => {
            this.server.removeListener('error', onError);
            reject(err);
          };
          this.server.once('error', onError);
          this.server.listen(this.port, () => {
            this.server.removeListener('error', onError);
            console.log(`[Telnet Server] Listening on port ${this.port}`);
            resolve();
          });
        });
        return; // success
      } catch (err: any) {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts - 1) {
          // If the server entered a bad state, recreate it for the retry
          try { this.server.close(); } catch {}
          const { Server: NetServer } = await import('net');
          this.server = new NetServer();
          continue;
        }
        throw err; // non-retryable or out of attempts
      }
    }
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
    const connection = new TelnetConnection(socket, { petsciiDefault: this.petsciiDefault });

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
    const showPrompt = async () => {
      if (promptShown) return;
      promptShown = true;

      // Check if C64 was detected via TTYPE, OR via the DEL-probe
      // (task 6 / audit F1-F3): real C64s behind a WiFi modem negotiate no
      // telnet options, so TTYPE never fires for them, but the connect
      // screen's first keypress lands on connection.on('data') in index.ts
      // before this timer runs and classifies it there (c64-detect.util.ts),
      // stamping connection.session.terminalType = 'c64'. Either signal
      // skips the graphics prompt and goes straight to PETSCII mode.
      const delProbeDetectedC64 = connection.session?.terminalType === 'c64';
      if (connection.session && (delProbeDetectedC64 || (connection.terminalType &&
          (connection.terminalType.includes('C64') ||
           connection.terminalType.includes('COMMODORE') ||
           connection.terminalType.includes('PETSCII'))))) {
console.log(`[Telnet] C64 terminal detected (${delProbeDetectedC64 ? 'DEL-probe' : connection.terminalType}) - auto-enabling PETSCII mode`);
        connection.session.terminalType = 'c64';
        connection.session.petsciiMode = true;
        connection.session.ansiEnabled = false;
        connection.session.screenWidth = 40;
        connection.session.screenHeight = 25;
        connection.session.subState = LoggedOnSubState.DISPLAY_BBSTITLE;
        connection.session.tempData = { inputBuffer: '' };
        // The session is PETSCII from this line on, so the model describes a
        // fresh 40x25 screen and not whatever drained onto the wire while the
        // caller was still being classified: an emitText chunk sitting in the
        // 16ms AnsiBuffer (`utils/ansi-buffer.util.ts`) leaves AFTER the
        // DEL-probe stamped terminalType='c64' in index.ts, i.e. with
        // sessionWantsPetscii already true, and is transduced into the model
        // as if it were C64 screen content. Task OC-5.
        resetPetsciiModel(connection.session);
        // Emit terminal detection event for index.ts to handle BBSTITLE display
        this.emit('c64-detected', connection);
      } else if (connection.session) {
        // Pre-login pipeline shared with web + SSH: operator chat
        // listeners, SamiLog refresh, FRONTEND syscmd, ANSI prompt
        // + state, AREXX login trigger. The emitter is attached to
        // the connection by setupTelnetSSHHandler, which runs
        // synchronously after this telnet-server emits 'connection'.
        const emitter = (connection as any).emitter;
        if (emitter) {
          const { runPreLoginConnect } = await import('../services/login-connect.service');
          await runPreLoginConnect(emitter, connection.session, {
            socketId: connection.sessionId,
          });
        } else {
          // Fallback: if the emitter wasn't attached, at least prompt
          // so the user isn't stuck. Shouldn't happen in practice.
          connection.session.subState = LoggedOnSubState.ANSI_PROMPT;
          connection.session.tempData = { inputBuffer: '' };
          connection.write('\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n) [add Q to skip bulletins]?');
        }
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

    if (this.petsciiDefault) {
      // Task 10: dedicated PETSCII port. Emit the identical event shape
      // handleTerminalType() produces for a real TTYPE C64 response, so
      // this flows through the SAME session-application code every other
      // telnet C64 detection uses — the once('terminal-type', ...)
      // listener above (unicodeCapable/isAmigaTerminal/detectedTerminalType
      // + showPrompt()) and, once setupTelnetSSHHandler attaches its own
      // listener in index.ts, that applier too — instead of a second
      // hand-rolled copy of session init. terminalTypeLocked (set in the
      // TelnetConnection constructor) ensures a later real TTYPE reply
      // can't re-fire this event and downgrade the session.
      connection.emit('terminal-type', {
        terminalType: 'PETSCII-PORT',
        isC64: true,
        isAmiga: false,
        unicodeCapable: false,
        width: 40,
        height: 25
      });
    }

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
