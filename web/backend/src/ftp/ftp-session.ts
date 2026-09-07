/**
 * One FTP control connection, and the rules it answers to before a caller is
 * anybody.
 *
 * Phase 2 of `thoughts/shared/plans/2026-09-07-ftp-server.md`: the socket, the
 * login, and the two policies that have to be right before any file is ever
 * named - who may talk to us in the clear, and what happens to the node a
 * session takes.
 *
 * Everything the session needs from the board arrives as `FtpDeps`, so a test
 * drives the real command loop over a real socket without a database, and the
 * production wiring is the only place that knows about `db`, the node manager
 * and the CallersLog.
 */
import type { Duplex } from 'stream';

/** What the board tells us about the caller once the password checks out. */
export interface FtpUser {
  id: number;
  username: string;
}

export interface FtpDeps {
  /** The board's own password check - bcrypt, the same call the BBS login makes. */
  authenticate(username: string, password: string): Promise<FtpUser | null>;
  /** Take a node for this session, or null when the board has none free. */
  reserveNode(sessionId: string, user: FtpUser): Promise<number | null>;
  releaseNode(sessionId: string): Promise<void>;
  /** express.e writes every FTP command to the CallersLog; so do we. */
  log(username: string, message: string, nodeId: number): void;
  timeRemainingMinutes(user: FtpUser): number;
  /**
   * Turn the control connection into a TLS one, for `AUTH TLS`. Absent when
   * the board has no certificate, which is what makes `AUTH` answer 431.
   */
  startTls?(socket: Duplex): Promise<Duplex>;
}

/** Commands a caller may use before logging in. */
const PRE_LOGIN = new Set(['USER', 'PASS', 'QUIT', 'FEAT', 'NOOP', 'AUTH', 'SYST']);

/**
 * Commands the protocol has but this phase has not built yet.
 *
 * They answer 502, not 500: 500 means "no such command", and a client that is
 * told that about LIST concludes the server is not an FTP server at all. The
 * set shrinks to nothing as phases 3-6 land.
 */
const NOT_YET = new Set([
  'LIST', 'NLST', 'MLSD', 'MLST', 'PWD', 'XPWD', 'CWD', 'XCWD', 'CDUP',
  'TYPE', 'MODE', 'STRU', 'PORT', 'PASV', 'RETR', 'STOR', 'REST', 'SIZE', 'MDTM',
]);

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const addr = address.replace(/^::ffff:/, '');
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('127.');
}

let sessionCounter = 0;

export class FtpSession {
  private socket: Duplex;
  private readonly deps: FtpDeps;
  private readonly peerAddress: string | undefined;
  private readonly sessionId: string;

  private buffer = '';
  private pendingUser: string | null = null;
  private user: FtpUser | null = null;
  private nodeId = 0;
  private secure: boolean;
  private closed = false;

  constructor(socket: Duplex, deps: FtpDeps, peerAddress?: string, opts: { secure?: boolean } = {}) {
    this.socket = socket;
    this.deps = deps;
    this.peerAddress = peerAddress;
    this.secure = opts.secure ?? false;
    this.sessionId = `ftp-${++sessionCounter}-${Date.now()}`;
  }

  /** Greet the caller and start reading commands. */
  start(): void {
    this.attach(this.socket);
    // The greeting comes first even for a caller we will refuse in the clear:
    // explicit FTPS IS `AUTH TLS` after the greeting, so a server that hung up
    // at 220 could never be upgraded by anybody.
    this.reply(220, 'Welcome to Ami-Express FTP server.');
  }

  /** The listeners currently on the control connection, so an upgrade can take them off again. */
  private listeners: { data: (chunk: Buffer) => void; error: () => void; close: () => void } | null = null;

  private attach(socket: Duplex): void {
    const listeners = {
      data: (chunk: Buffer) => this.onData(chunk),
      error: () => this.close(),
      close: () => this.close(),
    };
    socket.on('data', listeners.data);
    socket.on('error', listeners.error);
    socket.on('close', listeners.close);
    this.listeners = listeners;
  }

  /**
   * Stop reading the raw connection before TLS takes it over.
   *
   * Without this the command reader is still on the socket when the handshake
   * starts, so it swallows the ClientHello as if it were a command line and
   * the upgrade never completes - the connection just stops answering. The
   * `close` listener has to go too, or the raw socket ending as it becomes
   * the TLS transport tears the session down mid-handshake.
   */
  private detach(socket: Duplex): void {
    if (!this.listeners) return;
    socket.removeListener('data', this.listeners.data);
    socket.removeListener('error', this.listeners.error);
    socket.removeListener('close', this.listeners.close);
    this.listeners = null;
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('latin1');
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      void this.handleLine(line);
    }
  }

  private reply(code: number, text: string): void {
    if (this.closed) return;
    this.socket.write(`${code} ${text}\r\n`);
  }

  private async handleLine(line: string): Promise<void> {
    if (line.trim() === '') return;
    const space = line.indexOf(' ');
    const verb = (space === -1 ? line : line.slice(0, space)).toUpperCase();
    const arg = space === -1 ? '' : line.slice(space + 1);

    // express.e writes the command line itself, not just the verb
    // (ftpd.e:1968-1974). A password is the one thing it must not carry.
    this.deps.log(this.user?.username ?? this.pendingUser ?? 'unknown',
      `\tFTP Command >: ${verb === 'PASS' ? 'PASS ****' : line}`, this.nodeId);

    if (!this.user && !PRE_LOGIN.has(verb)) {
      if (NOT_YET.has(verb)) return this.reply(530, 'Please login with USER and PASS.');
      return this.reply(500, 'command not recognized');
    }

    switch (verb) {
      case 'QUIT':
        this.reply(200, 'Byebye!');
        this.close();
        return;
      case 'NOOP':
        return this.reply(200, 'OK');
      case 'SYST':
        return this.reply(215, 'AmigaOS');
      case 'FEAT':
        return this.sendFeatures();
      case 'AUTH':
        return this.startTls(arg);
      case 'USER':
        return this.onUser(arg);
      case 'PASS':
        return this.onPass(arg);
      default:
        if (NOT_YET.has(verb)) return this.reply(502, `${verb} not implemented yet`);
        return this.reply(500, 'command not recognized');
    }
  }

  private sendFeatures(): void {
    const lines = [' REST STREAM', ' SIZE', ' MDTM', ' MLST type*;size*;modify*;perm*;'];
    if (this.deps.startTls) lines.unshift(' AUTH TLS');
    this.socket.write('211-Extensions supported:\r\n');
    for (const line of lines) this.socket.write(`${line}\r\n`);
    this.reply(211, 'END');
  }

  private async startTls(arg: string): Promise<void> {
    const mechanism = arg.trim().toUpperCase();
    if (mechanism !== 'TLS' && mechanism !== 'TLS-C' && mechanism !== 'SSL') {
      return this.reply(504, 'Unsupported security mechanism');
    }
    if (!this.deps.startTls) return this.reply(431, 'No TLS certificate configured');
    if (this.secure) return this.reply(534, 'Already secured');

    this.reply(234, 'AUTH TLS successful');
    const raw = this.socket;
    this.detach(raw);
    try {
      const upgraded = await this.deps.startTls(raw);
      this.socket = upgraded;
      this.secure = true;
      this.buffer = '';
      this.attach(upgraded);
    } catch {
      this.close();
    }
  }

  /**
   * The plaintext policy, and why it lives on USER rather than on the greeting.
   *
   * A password crossing the public internet in the clear is the whole risk, and
   * USER is the first command that begins to hand one over. Refusing at the
   * greeting instead would also refuse the `AUTH TLS` that is the fix.
   */
  private onUser(arg: string): void {
    if (!this.secure && !isLoopback(this.peerAddress)) {
      return this.reply(534, 'Policy requires TLS - issue AUTH TLS first');
    }
    this.pendingUser = arg.trim();
    this.reply(331, 'Password required');
  }

  private async onPass(arg: string): Promise<void> {
    if (!this.pendingUser) return this.reply(503, 'Login with USER first');
    if (!this.secure && !isLoopback(this.peerAddress)) {
      return this.reply(534, 'Policy requires TLS - issue AUTH TLS first');
    }

    const user = await this.deps.authenticate(this.pendingUser, arg);
    if (!user) {
      this.pendingUser = null;
      return this.reply(430, 'Invalid username or password');
    }

    const nodeId = await this.deps.reserveNode(this.sessionId, user);
    if (nodeId === null) {
      // express.e's FTP is a node's own session, so a board with every node
      // busy has nowhere to put this caller. Saying so is better than serving
      // a session that no WHO, log or time limit can see.
      this.pendingUser = null;
      return this.reply(421, 'All nodes are busy - try again later');
    }

    this.user = user;
    this.nodeId = nodeId;
    this.pendingUser = null;
    this.reply(230, `password accepted. Time remaining for today ${this.deps.timeRemainingMinutes(user)} mins.`);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.user) void this.deps.releaseNode(this.sessionId);
    this.socket.end();
  }
}
