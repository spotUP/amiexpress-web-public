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

/**
 * The board said no to an account whose password was RIGHT: deleted, locked,
 * level 0, a password that must be changed first. Distinct from null so the
 * caller is told why, as express.e tells an FTP caller (28745-28752).
 */
export interface FtpLogonRefusal {
  refused: { code: number; text: string };
}

export interface FtpDeps {
  /**
   * The board's own password check - bcrypt, the same call the BBS login
   * makes - and then the board's own account gates (services/logon-gates).
   * Null is a wrong name or password; a refusal is an account the board will
   * not let on.
   */
  authenticate(username: string, password: string): Promise<FtpUser | FtpLogonRefusal | null>;
  /** Take a node for this session, or null when the board has none free. */
  reserveNode(sessionId: string, user: FtpUser): Promise<number | null>;
  /**
   * The board's NODE gates on the node this caller was given (services/
   * logon-gates): reserved for someone else (express.e:28733-28743), or this
   * account already on another node (28756-28765). Null lets him on. Absent
   * only in fixtures that test something else; the board's deps have it.
   */
  refuseOnNode?(nodeId: number, user: FtpUser): Promise<FtpLogonRefusal | null>;
  releaseNode(sessionId: string): Promise<void>;
  /** express.e writes every FTP command to the CallersLog; so do we. */
  log(username: string, message: string, nodeId: number): void;
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
  /**
   * express.e's ftpDownloadFileStart (15109-15140) ends in logUDFile(TRUE)
   * (9475-9489): `\tDownloading <name> <size> bytes` to the CallersLog and
   * the UDLog, as the transfer starts. Absent means nothing is logged.
   */
  logDownload?(user: FtpUser, name: string, size: number, nodeId: number): Promise<void>;
  /**
   * Why this upload is refused, BEFORE any bytes are taken - the conference's
   * `NO_FTP_UPLOADS` text, a name the board will not accept, a caller without
   * the access. Undefined means go ahead.
   */
  refuseUpload?(
    user: FtpUser,
    conferenceId: number,
    filename: string
  ): Promise<{ code: number; text: string; logAs: string } | undefined>;
  /** `FILENAMECAPS`: an upload's name is uppercased before anything reads it. */
  uppercaseUploads?(): boolean;
  /**
   * Read the caller's bytes into the node's playpen and file them the way the
   * board files every other upload. Returns what to tell him.
   */
  acceptUpload?(
    request: { user: FtpUser; conferenceId: number; nodeId: number; filename: string },
    data: Duplex
  ): Promise<{ bytes: number; accepted: boolean; notices: string[] }>;
}

/** Commands a caller may use before logging in. */
const PRE_LOGIN = new Set(['USER', 'PASS', 'QUIT', 'FEAT', 'NOOP', 'AUTH', 'SYST']);

/** Verbs this phase answers, but only for a caller who has logged in. */
const AFTER_LOGIN = new Set([
  'PWD', 'XPWD', 'CWD', 'XCWD', 'CDUP', 'TYPE', 'PBSZ', 'PROT', 'PASV', 'LIST', 'NLST',
  'MLSD', 'MLST', 'OPTS', 'EPSV', 'SIZE', 'MDTM', 'RETR', 'REST', 'STOR',
  'MODE', 'STRU', 'PORT',
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
  /** TYPE A. Tracked separately so an unset TYPE can be refused, as express does. */
  private ascii = false;
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
      /*
       * EVERY COMMAND ANSWERS SOMETHING.
       *
       * `handleLine` is async and was launched with a bare `void`, so anything
       * it threw became an unhandled rejection and the caller got NO REPLY -
       * his client then waits for its own timeout with a half-open data
       * connection. That is exactly what a missing `Conf2.info` did to STOR on
       * the live board (sysop, 2026-09-07): a one-line ENOENT presented as a
       * hung upload.
       *
       * WEB_: ftpd.e has no equivalent (an E procedure cannot throw into the
       * read loop); 451 is the RFC 959 code for a local processing error.
       * A thrown command is a 451: the board failed, the caller is told, and
       * the session stays usable. This is the LAST line of defence - a
       * command that can fail should still catch its own failure and say
       * something specific.
       */
      void this.handleLine(line).catch((error) => {
        console.error(
          `[FTP] ${line.split(' ')[0]} failed: ${
            error instanceof Error ? error.stack ?? error.message : String(error)}`
        );
        this.reply(
          451,
          `The board could not complete that: ${
            error instanceof Error ? error.message : String(error)}`
        );
      });
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
    // WEB_: ftpd.e:1968 logs the raw request, PASS included; masked here
    // so a CallersLog never holds a caller's password.
    this.deps.log(this.user?.username ?? this.pendingUser ?? 'unknown',
      `\tFTP Command >: ${verb === 'PASS' ? 'PASS ****' : line}`, this.nodeId);

    if (!this.user && !PRE_LOGIN.has(verb)) {
      // A verb the server HAS is refused for want of a login; one it does not
      // have is unknown. Telling a client "command not recognized" about PWD
      // makes it conclude the server cannot browse at all.
      if (AFTER_LOGIN.has(verb)) {
        // WEB_: ftpd.e answers 500 here (ftpDoLogin, ftpd.e:2218) because its
        // login runs BEFORE the command loop; this port has one loop, so a
        // verb sent too early gets the RFC 959 "not logged in" code (530)
        // that every client acts on, with the text kept.
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
        // ftpd.e:1197-1209, verbatim - including the full-stop, which some
        // clients echo to the user.
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
      case 'MODE':
        // ftpd.e:1361-1368 - only Stream; the reply echoes the parameter and
        // ends in three exclamation marks, as the original does.
        return arg.trim().toUpperCase().startsWith('S')
          ? this.reply(200, `Mode set to ${arg.trim()}!!!`)
          : this.reply(502, 'Mode not implemented');
      case 'STRU':
        // ftpd.e:1370-1377 - only File. "Strucrure" is the original's
        // spelling (ftpd.e:1376).
        return arg.trim().toUpperCase().startsWith('F')
          ? this.reply(200, `Structure set to ${arg.trim()}!!!`)
          : this.reply(502, 'Strucrure not implemented');
      case 'PORT':
        // ftpd.e:1356-1359, verbatim: active mode is refused with 502 and a
        // client falls back to PASV.
        return this.reply(502, 'Only passive mode allowed');
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
      case 'STOR':
        return this.onStor(arg);
      default:
        // ftpd.e:2047 - every verb it lacks (DELE, RMD, MKD, RNFR, RNTO, SITE,
        // STOU, APPE, ...) gets the one sentence.
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
      // WEB_: ftpd.e takes Val(params) unchecked (ftpd.e:1423), so garbage
      // becomes 0 and a negative offset seeks before the file. A stream
      // cannot start there, so the RFC 959 syntax-error code is the answer.
      return this.reply(501, 'REST needs a byte offset');
    }
    this.restartAt = offset;
    // ftpd.e:1426, verbatim.
    this.reply(350, `Restarting at ${offset}. Send STORE or RETRIEVE to initiate transfer`);
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
    // ftpd.e:1860 - no data connection is the one 425 sentence.
    if (!channel) return this.reply(425, "Can't open data connection");
    this.passive = null;

    const offset = this.restartAt;
    this.restartAt = 0;

    const tree = this.deps.filesystem;
    if (!tree || !this.deps.resolveFile || !this.user) {
      channel.close();
      // WEB_: a board started without a file tree; ftpd.e always has one.
      return this.reply(550, 'Downloads are not available');
    }

    const target = resolvePath(this.cwd, arg.trim());
    const entry = target === null ? null : await tree.find(this.user, target);
    if (!entry || entry.isDirectory) {
      channel.close();
      return this.reply(550, `${arg.trim()}: No such file or directory`);
    }

    const conference = tree.conferenceAt(this.user, target!);
    if (!conference) {
      channel.close();
      return this.reply(550, `${arg.trim()}: No such file or directory`);
    }

    // The gate first, and its own words. A refusal here moves zero bytes.
    if (this.deps.mayDownload) {
      const verdict = await this.deps.mayDownload(this.user, entry.size);
      if (!verdict.allowed) {
        channel.close();
        // ftpd.e:1788 sends the ratio check's own sentence. WEB_: the
        // fallback only exists for a gate that returned no sentence.
        return this.reply(550, verdict.message || 'Refused by your download ratio');
      }
    }

    let located;
    try {
      // A row from a directory walk already knows where its bytes are; only a
      // CATALOGUE row needs resolving, because a DIR entry is a claim about a
      // file rather than a path to one.
      located = entry.hostPath
        ? { path: entry.hostPath, size: entry.size, name: entry.name }
        : await this.deps.resolveFile(conference.conference_id, entry.name);
    } catch (error) {
      // A pooled volume being down is NOT "no such file": telling a caller his
      // file is missing when the bucket is having a bad minute is how a sysop
      // deletes a catalogue row for a file that was always fine.
      channel.close();
      // WEB_: pooled volumes have no ftpd.e counterpart.
      return this.reply(
        451,
        `The storage this file lives on did not answer: ${
          error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!located) {
      channel.close();
      // ftpd.e:1775 - the same sentence as a file that is not there.
      return this.reply(550, `${entry.name}: No such file or directory`);
    }

    // ftpd.e:1764 - always BINARY, whatever TYPE says.
    this.reply(150, 'Opening BINARY connection with ASYNC');

    const data = await this.openData(channel);
    if (!data) return;
    const shownName = arg.trim().replace(/^\//, '');

    try {
      // ftpd.e cmdRetr calls downloadFileStart before the bytes go
      // (ftpd.e:1792), and express.e logs the file there, whole size
      // (express.e:15109-15140, 9478). Nothing is logged at the end: with no
      // flagged list in FTP server mode ftpDownloadFileEnd returns at
      // `IF fileItem=NIL THEN RETURN` (express.e:15168).
      if (this.deps.logDownload) await this.deps.logDownload(this.user, entry.name, located.size, this.nodeId);
      const sent = await this.sendFile(located.path, data, offset);
      if (this.deps.recordDownload) await this.deps.recordDownload(this.user, sent);
      // ftpd.e:1840-1846 - `226 <name> ... Transfer Complete`.
      this.reply(226, `${shownName} ... Transfer Complete`);
    } catch (error) {
      data.destroy();
      console.error(`[FTP] RETR ${entry.name} aborted: ${error instanceof Error ? error.message : String(error)}`);
      // ftpd.e:1840-1846 - a transfer that did not finish is `426 <name> ...
      // Transfer aborted`.
      this.reply(426, `${shownName} ... Transfer aborted`);
    }
  }

  /**
   * The caller's data connection, ready for bytes - or null after the 425 that
   * says why not. ftpd.e cmdPasv: waiting too long is `Timed out waiting for
   * data connection` (ftpd.e:732); anything else is `Can't open data
   * connection` (ftpd.e:710, 741).
   */
  private async openData(channel: PassiveChannel): Promise<Duplex | null> {
    let data: Duplex;
    try {
      data = await channel.accept();
    } catch {
      this.reply(425, 'Timed out waiting for data connection');
      return null;
    }
    try {
      if (this.protectData && this.deps.secureData) data = await this.deps.secureData(data);
    } catch {
      data.destroy();
      this.reply(425, "Can't open data connection");
      return null;
    }
    return data;
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
    // ftpd.e:1417 - one sentence for "not there", whatever the reason.
    const entry = await this.entryFor(arg);
    if (!entry || entry.isDirectory) {
      return this.reply(550, `${arg.trim()}: No such file or directory`);
    }
    this.reply(213, String(entry.size));
  }

  /** `MDTM`: the upload date the DIR entry carries, in RFC 3659's UTC form. */
  private async onMdtm(arg: string): Promise<void> {
    // ftpd.e:1394.
    const entry = await this.entryFor(arg);
    if (!entry || entry.isDirectory) {
      return this.reply(550, `${arg.trim()}: No such file or directory`);
    }
    this.reply(213, machineTimestamp(entry.modified));
  }

  /**
   * `STOR`: take the bytes, then hand them to the board's own filing.
   *
   * The bytes land in the node's PLAYPEN first and are filed afterwards -
   * never written into an area directly. That is not ceremony: the duplicate
   * check, the archive test and the quarantine all decide WHERE the file
   * belongs, and a file already sitting in the area cannot be sent to HOLD
   * without a second move that can fail on its own.
   *
   * A caller may only upload into a conference he is standing in, and the
   * board may forbid it outright (`NO_FTP_UPLOADS`).
   */
  private async onStor(arg: string): Promise<void> {
    const channel = this.passive;
    // ftpd.e:1697 - no data connection is the one 425 sentence.
    if (!channel) return this.reply(425, "Can't open data connection");
    this.passive = null;
    this.restartAt = 0;

    const tree = this.deps.filesystem;
    if (!tree || !this.deps.acceptUpload || !this.user) {
      channel.close();
      // WEB_: a board started without a filing service; ftpd.e always has one.
      return this.reply(550, 'Uploads are not available');
    }

    let name = arg.trim().split('/').pop() ?? '';
    // ftpd.e:1443 - FILENAMECAPS uppercases an upload's name before anything
    // else looks at it, so the dupe check and the DIR entry agree.
    if (this.deps.uppercaseUploads?.()) name = name.toUpperCase();

    // ftpd.e:1512-1516 - at the ROOT there is no conference to file it in,
    // and "Cant upload here" is express's own wording.
    const conference = tree.conferenceAt(this.user, this.cwd);
    if (!conference) {
      channel.close();
      return this.reply(550, 'Cant upload here');
    }

    // Everything the board would refuse BEFORE a byte is taken: a caller told
    // no after ten megabytes has been told no expensively. express separates
    // 553 (the NAME is wrong, or it is already here) from 550 (the board will
    // not take it), and a client acts on that difference.
    const refusal = await this.deps.refuseUpload?.(this.user, conference.conference_id, name);
    if (refusal) {
      channel.close();
      this.deps.log(this.user.username, '\tUpload Failed..', this.nodeId);
      this.deps.log(this.user.username, `\t${refusal.logAs} ${name}`, this.nodeId);
      return this.reply(refusal.code, refusal.text);
    }

    this.reply(150, `Opening ${this.binary ? 'Binary' : 'Ascii'} connection`);

    const data = await this.openData(channel);
    if (!data) return;

    try {
      /*
       * ftpd.e:1669-1692 - the file-check conversation.
       *
       * The bytes arriving is not the end of it: the board tests the archive,
       * and express keeps the caller informed WHILE it does, with `226-`
       * continuation lines. A client told nothing for ten seconds decides the
       * server has died; one that reads "file check in progress" waits.
       */
      this.socket.write(`226-${name} ... Upload complete, file check in progress.. \r\n`);

      const outcome = await this.deps.acceptUpload(
        { user: this.user, conferenceId: conference.conference_id, nodeId: this.nodeId, filename: name },
        data
      );

      // What the board decided - a duplicate, a quarantine, a dead volume.
      for (const notice of outcome.notices) this.socket.write(`226-${notice}\r\n`);
      // The CallersLog lines for this file are express.e's ftpUploadFileEnd
      // (15084-15088), written by the filing service it went through. This
      // used to add `\tFTP Upload >: name (n bytes)`, a line neither ftpd.e
      // nor express.e writes, and which no CallersLog reader knows.
      // ftpd.e:1690 - 226 or 426, the filename in both.
      this.reply(
        outcome.accepted === false ? 426 : 226,
        `${name} ... ${outcome.accepted === false ? 'Transfer aborted' : 'Transfer Complete'}`
      );
    } catch (error) {
      data.destroy();
      // WEB_: the filing service threw (ftpd.e's startFileCheck cannot);
      // 451 is the RFC 959 local-error code and the board's own words.
      this.reply(
        451,
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
      return this.reply(550, `${arg.trim() || this.cwd}: No such file or directory`);
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
    // WEB_: a board started without a file tree; ftpd.e always has one.
    if (!fs) return this.reply(550, 'No directories available');

    const target = resolvePath(this.cwd, arg.trim() || '/');
    // ftpd.e:1261 - the path the caller sent, then the same sentence.
    if (target === null) return this.reply(550, `${arg.trim()}: No such file or directory.`);
    if (!fs.exists(this.user, target)) {
      // ftpd.e:1261 - the same sentence for a conference and a subdirectory,
      // because to the caller they are both just a directory that is not there.
      return this.reply(550, `${arg.trim()}: No such file or directory.`);
    }
    this.cwd = target;
    // ftpd.e:1240 - `250 CWD command successful.`, full-stop included.
    return this.reply(250, 'CWD command successful.');
  }

  /**
   * `TYPE`. Both modes are accepted and the flag is remembered; what it
   * changes is line endings on the way out, which only matters once files
   * move. A refusal here stops a client before it ever asks for a listing.
   */
  private onType(arg: string): void {
    const mode = arg.trim().toUpperCase();
    if (mode !== 'A' && mode !== 'I') {
      // ftpd.e:1348 takes the whole parameter and only I or A; L (and
      // anything else) is refused by ftpd.e:1352.
      return this.reply(502, 'Type not implemented');
    }
    this.binary = mode !== 'A';
    this.ascii = mode === 'A';
    // ftpd.e:1350 echoes the parameter as sent and adds three exclamation
    // marks.
    this.reply(200, `Type set to ${arg.trim()}!!!`);
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
    // forgot PASV gets the same 425 whatever the server would have listed
    // (ftpd.e:1946). A 550 here would read as "that directory does not
    // exist".
    if (format === 'machine' && arg !== '' && arg !== '/') {
      // ftpd.e:1907-1917 - MLSD lists the caller's current directory for no
      // parameter or `/`, and refuses any other path (a subdirectory
      // included) before it looks at the data connection. The path is
      // echoed as sent; the PASV connection is closed, as ftpd.e:1925 does.
      this.passive?.close();
      this.passive = null;
      return this.reply(550, `${arg}: No such file or directory`);
    }
    const channel = this.passive;
    if (!channel) return this.reply(425, "Can't open data connection");
    this.passive = null;

    const fs = this.deps.filesystem;
    if (!fs) {
      channel.close();
      // WEB_: a board started without a file tree; ftpd.e always has one.
      return this.reply(550, 'No directories available');
    }

    // A client passes flags here (`LIST -al`), which are not a path.
    const requested = arg
      .split(' ')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith('-'))
      .join(' ');
    // ftpd.e:1909 - MLSD (`/` included) lists the current directory.
    const target = resolvePath(this.cwd, format === 'machine' ? '.' : requested || '.');
    if (target === null || !fs.exists(this.user, target)) {
      channel.close();
      // ftpd.e:1917 (MLSD's refusal) - the one "not there" sentence.
      return this.reply(550, `${requested || this.cwd}: No such file or directory`);
    }

    let entries;
    try {
      entries = await fs.list(this.user, target);
    } catch (error) {
      channel.close();
      // WEB_: the DIR files are read per request here; ftpd.e holds them in
      // memory and cannot fail.
      return this.reply(
        451,
        `Could not read the directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // ftpd.e:1909 / 1938 - the mode named is the caller's TYPE.
    this.reply(150, `Opening ${this.binary ? 'Binary' : 'ASCII'} connection for directory listing`);

    const data = await this.openData(channel);
    if (!data) return;

    const render = (entry: (typeof entries)[number]): string => {
      if (format === 'long') return longListLine(entry);
      if (format === 'machine') return machineListLine(entry);
      return entry.name;
    };
    const body = entries.map((entry) => `${render(entry)}\r\n`).join('');

    await new Promise<void>((resolve) => {
      data.end(body, () => resolve());
    });
    // ftpd.e:1915 - capital C.
    this.reply(226, 'Transfer Complete');
  }

  private sendFeatures(): void {
    // Everything named here must be a verb this server answers - a client
    // believes FEAT and stops trying the alternatives (2026-09-07: MLST was
    // advertised while MLSD answered 502, and Transmit simply stopped).
    // ftpd.e:1219-1226 lists five. The three extra are ones this server
    // genuinely answers and a modern client looks for - and the rule that
    // matters is the one the MLSD bug taught: everything advertised here must
    // be answered.
    const lines = [
      ' REST STREAM',
      ' SIZE',
      ' MDTM',
      ' MLST type*;size*;modify*;perm*;',
      ' EPSV',
      ' PASV',
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
    // ftpd.e:1180.
    this.reply(331, 'user accepted');
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
    // WEB_: ftpd.e takes a PASS with no USER as a failed login
    // (430, ftpd.e:1189). 503 is the RFC 959 bad-sequence code, and tells
    // the client what to do.
    if (!this.pendingUser) return this.reply(503, 'Login with USER first');
    if (this.mustUpgradeFirst()) {
      return this.reply(534, 'Policy requires TLS - issue AUTH TLS first');
    }

    const user = await this.deps.authenticate(this.pendingUser, arg);
    if (!user) {
      this.pendingUser = null;
      return this.reply(430, 'Invalid username or password');
    }
    if ('refused' in user) {
      // Before a node is taken: an account the board refuses holds nothing.
      this.pendingUser = null;
      return this.reply(user.refused.code, user.refused.text);
    }

    const nodeId = await this.deps.reserveNode(this.sessionId, user);
    if (nodeId === null) {
      // express.e's FTP is a node's own session, so a board with every node
      // busy has nowhere to put this caller. Saying so is better than serving
      // a session that no WHO, log or time limit can see.
      this.pendingUser = null;
      // WEB_: ftpd.e runs inside a node that is already assigned
      // (express.e:15511); a board with every node busy has no equivalent.
      return this.reply(421, 'All nodes are busy - try again later');
    }

    // express.e:28733 / 28756 - asked once the caller HAS a node, as express
    // asks them of the node that answered. The node is given back: a refused
    // caller holds nothing.
    const nodeRefusal = await this.deps.refuseOnNode?.(nodeId, user);
    if (nodeRefusal) {
      this.pendingUser = null;
      await this.deps.releaseNode(this.sessionId);
      return this.reply(nodeRefusal.refused.code, nodeRefusal.refused.text);
    }

    this.user = user;
    this.nodeId = nodeId;
    this.pendingUser = null;
    // ftpd.e:1187 - `230 password accepted`, and nothing else. The clause
    // this port added - "Time remaining for today N mins." - is not in
    // express, and it told the sysop 0 minutes while he had no limit at all
    // (2026-09-07). Nothing enforced that number either; it was only ever
    // printed. The line says what express says.
    this.reply(230, 'password accepted');
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.user) void this.deps.releaseNode(this.sessionId);
    this.socket.end();
  }
}
