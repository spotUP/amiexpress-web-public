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

import { PassiveChannel, passiveReplyAddress, type PassivePortRange } from './ftp-data-channel';
import {
  FtpFilesystem,
  longListLine,
  machineListLine,
  machineTimestamp,
  resolvePath,
} from './ftp-filesystem';

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
  /**
   * The same, for a DATA connection after `PROT P`. Separate from `startTls`
   * because a client may secure the control connection and leave the data one
   * clear, which is `PROT C` and legal.
   */
  secureData?(socket: Duplex): Promise<Duplex>;
  /** What the caller may browse. Absent means every directory command is 550. */
  filesystem?: FtpFilesystem;
  /** The published range a passive listener may bind inside. */
  passivePorts?(): PassivePortRange | null;
  /** The PUBLIC address `PASV` advertises - never the container's own. */
  passiveAddress?(): string | null;
  /**
   * Where a named file's BYTES are - a local area, or a pooled area's object
   * fetched down. Production wires `resolveFile`, the same locator the board's
   * own download path uses, so FTP and `D` can never disagree about what
   * exists.
   */
  resolveFile?(conferenceId: number, filename: string): Promise<{ path: string; size: number; name: string } | null>;
  /**
   * The ratio gate. `allowed: false` carries the gate's OWN sentence, because
   * a caller refused for ratio has to be told which of his limits stopped him.
   */
  mayDownload?(user: FtpUser, size: number): Promise<{ allowed: boolean; message?: string }>;
  /** Charge the download once the bytes are actually gone. */
  recordDownload?(user: FtpUser, size: number): Promise<void>;
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
  'MODE', 'STRU', 'PORT', 'STOR', 'STOU', 'APPE',
]);

/**
 * Commands the board will not carry over FTP at all, and why they say so.
 *
 * A refusal with a reason is worth having: `DELE` answered `500 command not
 * recognized`, which tells a client the server is broken rather than that the
 * board does not hand out deletions. Files leave this board through the
 * sysop's own tools, not through a caller's file manager.
 */
const REFUSED: Record<string, string> = {
  DELE: 'Deleting files over FTP is not permitted on this board',
  RMD: 'Removing directories over FTP is not permitted - a directory here is a conference',
  XRMD: 'Removing directories over FTP is not permitted - a directory here is a conference',
  MKD: 'Making directories over FTP is not permitted - a directory here is a conference',
  XMKD: 'Making directories over FTP is not permitted - a directory here is a conference',
  RNFR: 'Renaming files over FTP is not permitted on this board',
  RNTO: 'Renaming files over FTP is not permitted on this board',
  SITE: 'No SITE commands on this board',
};

/** Verbs this phase answers, but only for a caller who has logged in. */
const AFTER_LOGIN = new Set([
  'PWD', 'XPWD', 'CWD', 'XCWD', 'CDUP', 'TYPE', 'PBSZ', 'PROT', 'PASV', 'LIST', 'NLST',
  'MLSD', 'MLST', 'OPTS', 'EPSV', 'SIZE', 'MDTM', 'RETR', 'REST',
  ...Object.keys(REFUSED),
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
  private readonly allowPlaintext: boolean;
  private closed = false;
  /** Where the caller is standing. `/` is the list of his conferences. */
  private cwd = '/';
  private binary = true;
  private protectData = false;
  private passive: PassiveChannel | null = null;
  /** `REST` offset for the NEXT transfer, and only that one. */
  private restartAt = 0;

  constructor(
    socket: Duplex,
    deps: FtpDeps,
    peerAddress?: string,
    opts: { secure?: boolean; allowPlaintext?: boolean } = {}
  ) {
    this.socket = socket;
    this.deps = deps;
    this.peerAddress = peerAddress;
    this.secure = opts.secure ?? false;
    this.allowPlaintext = opts.allowPlaintext ?? false;
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
      // A verb the server HAS is refused for want of a login; one it does not
      // have is unknown. Telling a client "command not recognized" about PWD
      // makes it conclude the server cannot browse at all.
      if (NOT_YET.has(verb) || AFTER_LOGIN.has(verb)) {
        return this.reply(530, 'Please login with USER and PASS.');
      }
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
      case 'PWD':
      case 'XPWD':
        return this.reply(257, `"${this.cwd}" is current directory.`);
      case 'CWD':
      case 'XCWD':
        return this.onCwd(arg);
      case 'CDUP':
        return this.onCwd('..');
      case 'TYPE':
        return this.onType(arg);
      case 'PBSZ':
        // RFC 4217: only 0 is meaningful over TLS, and a client sends it
        // before PROT. Answering 500 - which this did - makes a client
        // conclude data protection is impossible and give up on the transfer.
        return this.reply(200, 'PBSZ=0');
      case 'PROT':
        return this.onProt(arg);
      case 'PASV':
        return this.onPasv('classic');
      case 'EPSV':
        // What a modern client tries FIRST - curl and most GUI clients send
        // EPSV, and only fall back to PASV when it is refused. Answering 500
        // costs every one of them a round trip, and a client that does NOT
        // fall back gets no data connection at all.
        return this.onPasv('extended');
      case 'LIST':
        return this.onList(arg, 'long');
      case 'NLST':
        return this.onList(arg, 'names');
      case 'MLSD':
        // What Transmit actually asks for: FEAT advertises MLST, so a modern
        // client prefers the machine listing and never sends LIST at all.
        // Advertising it and answering 502 is why the sysop's client stopped
        // after PWD with no error a human could read.
        return this.onList(arg, 'machine');
      case 'MLST':
        return this.onMlst(arg);
      case 'OPTS':
        return this.onOpts(arg);
      case 'SIZE':
        return this.onSize(arg);
      case 'MDTM':
        return this.onMdtm(arg);
      case 'REST':
        return this.onRest(arg);
      case 'RETR':
        return this.onRetr(arg);
      default:
        if (REFUSED[verb]) return this.reply(550, REFUSED[verb]);
        if (NOT_YET.has(verb)) return this.reply(502, `${verb} not implemented yet`);
        return this.reply(500, 'command not recognized');
    }
  }

  /**
   * `CWD`. A conference is one level under the root and nothing is deeper yet,
   * so the answer is 250 or 550 - never a path a later phase would have to
   * un-invent.
   */
  /**
   * `REST`: where the next transfer starts.
   *
   * Cleared by the transfer it applies to, and by anything else that moves the
   * caller - a stale offset silently truncating the NEXT download is the
   * classic way to hand somebody a corrupt file.
   */
  private onRest(arg: string): void {
    const offset = Number(arg.trim());
    if (!Number.isInteger(offset) || offset < 0) {
      return this.reply(501, 'REST needs a byte offset');
    }
    this.restartAt = offset;
    this.reply(350, `Restarting at ${offset}. Send RETR to resume`);
  }

  /**
   * `RETR`: the file, through the board's own gates.
   *
   * The order is the board's, not FTP's: the RATIO is checked before a byte
   * moves, because a caller who is over his limit must be refused rather than
   * served and charged afterwards. `resolveFile` is the same locator `D` uses,
   * so a pooled file is fetched from its bucket exactly as it would be for a
   * download at the menu.
   */
  private async onRetr(arg: string): Promise<void> {
    const channel = this.passive;
    if (!channel) return this.reply(425, 'Use PASV first');
    this.passive = null;

    const offset = this.restartAt;
    this.restartAt = 0;

    const tree = this.deps.filesystem;
    if (!tree || !this.deps.resolveFile || !this.user) {
      channel.close();
      return this.reply(550, 'Downloads are not available');
    }

    const target = resolvePath(this.cwd, arg.trim());
    const entry = target === null ? null : await tree.find(this.user, target);
    if (!entry || entry.isDirectory) {
      channel.close();
      return this.reply(550, `${arg.trim()}: no such file`);
    }

    const conference = tree.conferenceAt(this.user, target!);
    if (!conference) {
      channel.close();
      return this.reply(550, `${arg.trim()}: no such file`);
    }

    // The gate first, and its own words. A refusal here moves zero bytes.
    if (this.deps.mayDownload) {
      const verdict = await this.deps.mayDownload(this.user, entry.size);
      if (!verdict.allowed) {
        channel.close();
        return this.reply(550, verdict.message || 'Refused by your download ratio');
      }
    }

    let located;
    try {
      located = await this.deps.resolveFile(conference.conference_id, entry.name);
    } catch (error) {
      // A pooled volume being down is NOT "no such file": telling a caller his
      // file is missing when the bucket is having a bad minute is how a sysop
      // deletes a catalogue row for a file that was always fine.
      channel.close();
      return this.reply(
        451,
        `The storage this file lives on did not answer: ${
          error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!located) {
      channel.close();
      return this.reply(550, `${entry.name}: the board lists it, but its bytes are not here`);
    }

    this.reply(150, `Opening ${this.binary ? 'BINARY' : 'ASCII'} mode data connection for ${entry.name} (${located.size} bytes)`);

    let data: Duplex;
    try {
      data = await channel.accept();
      if (this.protectData && this.deps.secureData) data = await this.deps.secureData(data);
    } catch (error) {
      return this.reply(425, error instanceof Error ? error.message : 'No data connection');
    }

    try {
      const sent = await this.sendFile(located.path, data, offset);
      if (this.deps.recordDownload) await this.deps.recordDownload(this.user, sent);
      this.deps.log(this.user.username, `\tFTP Download >: ${entry.name} (${sent} bytes)`, this.nodeId);
      this.reply(226, 'Transfer complete');
    } catch (error) {
      data.destroy();
      this.reply(451, `Transfer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * The bytes, streamed rather than read into memory - an Amiga release is
   * small, a pooled ISO is not, and one caller must not be able to hold the
   * board's whole heap.
   */
  private sendFile(filePath: string, data: Duplex, offset: number): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFs = require('fs') as typeof import('fs');
    return new Promise<number>((resolve, reject) => {
      let sent = 0;
      const stream = nodeFs.createReadStream(filePath, offset > 0 ? { start: offset } : {});
      stream.on('data', (chunk: Buffer | string) => {
        sent += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      });
      stream.on('error', reject);
      data.on('error', reject);
      data.on('close', () => resolve(sent));
      stream.pipe(data);
    });
  }

  /**
   * `SIZE`: the byte count the BOARD holds, not the file on disk.
   *
   * The DIR entry is what the board shows in `F`, what a ratio is charged
   * against, and what a caller sees before he decides. A `stat` of a pooled
   * area's local copy would answer about a file that may not even be here.
   */
  private async onSize(arg: string): Promise<void> {
    const entry = await this.entryFor(arg);
    if (!entry) return this.reply(550, `${arg.trim()}: no such file`);
    if (entry.isDirectory) return this.reply(550, `${arg.trim()}: not a plain file`);
    this.reply(213, String(entry.size));
  }

  /** `MDTM`: the upload date the DIR entry carries, in RFC 3659's UTC form. */
  private async onMdtm(arg: string): Promise<void> {
    const entry = await this.entryFor(arg);
    if (!entry) return this.reply(550, `${arg.trim()}: no such file`);
    if (entry.isDirectory) return this.reply(550, `${arg.trim()}: not a plain file`);
    this.reply(213, machineTimestamp(entry.modified));
  }

  /** The one entry an argument names, relative to where the caller stands. */
  private async entryFor(arg: string) {
    const tree = this.deps.filesystem;
    if (!tree) return null;
    const target = resolvePath(this.cwd, arg.trim() || '.');
    if (target === null) return null;
    return tree.find(this.user, target);
  }

  /**
   * `MLST`: the facts about ONE path, on the control connection.
   *
   * No data connection, which is the whole point of it - a client uses it to
   * ask "what is this, and may I enter it" before deciding anything. The reply
   * is a three-line block: 250, the fact line indented by one space, 250 END.
   */
  private async onMlst(arg: string): Promise<void> {
    const tree = this.deps.filesystem;
    if (!tree) return this.reply(550, 'No directories available');

    const target = resolvePath(this.cwd, arg.trim() || '.');
    const entry = target === null ? null : await tree.find(this.user, target);
    if (!entry) {
      return this.reply(550, `${arg.trim() || this.cwd}: no such file or directory`);
    }

    // The path, not the bare name: RFC 3659 says MLST answers about what was
    // asked for. A file gets its own size and date, which is the half that was
    // missing - `MLST 1oo-olsk.txt` used to answer "no such directory".
    const fact = machineListLine({ ...entry, name: target! });
    this.socket.write('250-Listing\r\n');
    this.socket.write(` ${fact}\r\n`);
    this.reply(250, 'END');
  }

  /**
   * `OPTS MLST modify;size;...` - a client narrowing the facts it wants.
   *
   * Answered 200 and otherwise ignored: this server sends the same four facts
   * either way, and a client that asked politely and got 500 back concludes
   * the machine listing is unavailable.
   */
  private onOpts(arg: string): void {
    const option = arg.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
    if (option === 'MLST') return this.reply(200, 'MLST OPTS type;size;modify;perm;');
    if (option === 'UTF8') return this.reply(200, 'UTF8 set to on');
    this.reply(501, `OPTS ${option || '(none)'} not understood`);
  }

  private async onCwd(arg: string): Promise<void> {
    const fs = this.deps.filesystem;
    if (!fs) return this.reply(550, 'No directories available');

    const target = resolvePath(this.cwd, arg.trim() || '/');
    if (target === null) return this.reply(550, 'Cannot go above the root');
    if (!fs.exists(this.user, target)) {
      return this.reply(550, `${arg.trim()}: no such conference`);
    }
    this.cwd = target;
    return this.reply(250, `Directory changed to ${target}`);
  }

  /**
   * `TYPE`. Both modes are accepted and the flag is remembered; what it
   * changes is line endings on the way out, which only matters once files
   * move. A refusal here stops a client before it ever asks for a listing.
   */
  private onType(arg: string): void {
    const mode = arg.trim().toUpperCase().charAt(0);
    if (mode !== 'A' && mode !== 'I' && mode !== 'L') {
      return this.reply(504, `TYPE ${arg.trim()} not supported`);
    }
    this.binary = mode !== 'A';
    this.reply(200, `Type set to ${this.binary ? 'I' : 'A'}`);
  }

  /** `PROT`: C (clear) always, P (private) only when the board has TLS. */
  private onProt(arg: string): void {
    const level = arg.trim().toUpperCase();
    if (level === 'C') {
      this.protectData = false;
      return this.reply(200, 'Protection level set to C');
    }
    if (level !== 'P') return this.reply(504, `Protection level ${level} not supported`);
    if (!this.deps.secureData) return this.reply(431, 'No TLS certificate configured');
    this.protectData = true;
    this.reply(200, 'Protection level set to P');
  }

  /**
   * `PASV`. The listener binds inside the published range and the reply names
   * the PUBLIC address - the container's own is not reachable from anywhere a
   * caller is standing.
   */
  private async onPasv(form: 'classic' | 'extended'): Promise<void> {
    const range = this.deps.passivePorts?.();
    const address = this.deps.passiveAddress?.();
    // EPSV names only a PORT - the client reuses the control connection's
    // address - so it works without a configured address, and over IPv6,
    // which is the reason RFC 2428 exists.
    if (!range || (form === 'classic' && !address)) {
      return this.reply(425, 'Passive mode is not configured');
    }

    this.passive?.close();
    this.passive = null;

    const channel = await PassiveChannel.open(range, '0.0.0.0');
    if (!channel) return this.reply(425, 'No free data port');

    this.passive = channel;
    if (form === 'extended') {
      return this.reply(229, `Entering Extended Passive Mode (|||${channel.port()}|)`);
    }
    try {
      this.reply(227, `Entering Passive Mode (${passiveReplyAddress(address!, channel.port())})`);
    } catch (error) {
      channel.close();
      this.passive = null;
      this.reply(425, error instanceof Error ? error.message : 'Passive mode failed');
    }
  }

  /**
   * `LIST` and `NLST`, which differ only in what a row looks like.
   *
   * The order matters and is the part clients are unforgiving about: 150
   * BEFORE the data connection is used, the rows, the close, and only then
   * 226. A 226 that arrives before the socket closes is read as a truncated
   * listing.
   */
  private async onList(arg: string, format: 'long' | 'names' | 'machine'): Promise<void> {
    // The data connection is checked FIRST, and deliberately: a client that
    // forgot PASV gets the same 425 whatever the server would have listed,
    // and "use PASV first" is the answer that tells it what to do. A 550
    // here would read as "that directory does not exist".
    const channel = this.passive;
    if (!channel) return this.reply(425, 'Use PASV first');
    this.passive = null;

    const fs = this.deps.filesystem;
    if (!fs) {
      channel.close();
      return this.reply(550, 'No directories available');
    }

    // A client passes flags here (`LIST -al`), which are not a path.
    const requested = arg
      .split(' ')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith('-'))
      .join(' ');
    const target = resolvePath(this.cwd, requested || '.');
    if (target === null || !fs.exists(this.user, target)) {
      channel.close();
      return this.reply(550, `${requested || this.cwd}: no such directory`);
    }

    let entries;
    try {
      entries = await fs.list(this.user, target);
    } catch (error) {
      channel.close();
      return this.reply(
        451,
        `Could not read the directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.reply(150, 'Opening ASCII mode data connection for file list');

    let data: Duplex;
    try {
      data = await channel.accept();
    } catch (error) {
      return this.reply(425, error instanceof Error ? error.message : 'No data connection');
    }

    try {
      if (this.protectData && this.deps.secureData) data = await this.deps.secureData(data);
    } catch {
      data.destroy();
      return this.reply(425, 'Could not secure the data connection');
    }

    const render = (entry: (typeof entries)[number]): string => {
      if (format === 'long') return longListLine(entry);
      if (format === 'machine') return machineListLine(entry);
      return entry.name;
    };
    const body = entries.map((entry) => `${render(entry)}\r\n`).join('');

    await new Promise<void>((resolve) => {
      data.end(body, () => resolve());
    });
    this.reply(226, 'Transfer complete');
  }

  private sendFeatures(): void {
    // Everything named here must be a verb this server answers - a client
    // believes FEAT and stops trying the alternatives (2026-09-07: MLST was
    // advertised while MLSD answered 502, and Transmit simply stopped).
    const lines = [
      ' EPSV',
      ' PASV',
      ' REST STREAM',
      ' SIZE',
      ' MDTM',
      ' MLST type*;size*;modify*;perm*;',
      ' UTF8',
    ];
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
    if (this.mustUpgradeFirst()) {
      return this.reply(534, 'Policy requires TLS - issue AUTH TLS first');
    }
    this.pendingUser = arg.trim();
    this.reply(331, 'Password required');
  }

  /**
   * Whether this caller has to secure the connection before naming himself.
   *
   * Three ways past it, in order of preference: the connection is already
   * inside TLS (`AUTH TLS`, what a capable client does); the caller is on
   * loopback, so nothing crosses a wire; or the sysop has switched the policy
   * off for this board.
   *
   * That third one is a real weakening, and opt-in for that reason -
   * `FTP_ALLOW_PLAINTEXT=1`, off unless it is set. It exists because a client
   * with no explicit-FTPS option cannot log in AT ALL otherwise, and whether
   * that trade is worth making is the board owner's call rather than this
   * file's. What it costs while it is on: the password crosses the internet in
   * clear text, and it is the caller's BBS password, which is also his admin
   * password.
   */
  private mustUpgradeFirst(): boolean {
    if (this.secure) return false;
    if (isLoopback(this.peerAddress)) return false;
    return !this.allowPlaintext;
  }

  private async onPass(arg: string): Promise<void> {
    if (!this.pendingUser) return this.reply(503, 'Login with USER first');
    if (this.mustUpgradeFirst()) {
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
