/**
 * lrzsz-transfer.service.ts
 *
 * ZMODEM file transfer over telnet/SSH using the canonical lrzsz
 * (`sz`/`rz`) implementation as a child process. Chuck Forsberg's
 * 1988 reference, maintained by Uwe Ohse since the late '90s, used by
 * every BBS that ran on Linux for the last 35 years and tested
 * against every terminal client that ships ZMODEM (NetRunner,
 * SyncTerm, mTelnet, MuffinTerm, ZOC, qodem, minicom, …).
 *
 * The pure-JS zmodem.js library we tried first kept tripping on its
 * own undocumented event-name validation and aborting sessions; lrzsz
 * sidesteps all of that — its protocol implementation is the
 * reference everyone else interops against.
 *
 * Architecture:
 *   - Spawn `sz -b -e <files>`  (binary, escape ctrl-chars) for downloads
 *   - Spawn `rz -b -e -y -O <dir>` (overwrite, output-dir, binary, escape) for uploads
 *   - Pipe child stdout → transport.send (to the wire)
 *   - Pipe socket input → child stdin (from the wire)
 *   - Child exits with 0 on success, non-zero on cancel/error
 *
 * Flag rationale (see sz(1) / rz(1)):
 *   -b   binary mode (no CR/LF translation)
 *   -e   escape all control characters (telnet IAC, XON/XOFF, etc.)
 *   -O   read input from stdin (don't open tty) — critical for child_process
 *   -y   yes, overwrite existing files on receive
 *   -q   quiet — suppress progress to stderr (we log it ourselves)
 *
 * The `-O` flag is essential: without it sz/rz try to open the
 * controlling tty directly, which doesn't exist for a piped child.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { BBSSession } from '../index';

export type LrzszDirection = 'download' | 'upload';

export interface LrzszTransport {
  type: 'telnet' | 'ssh' | 'web';
  send: (data: Buffer) => void;
}

export interface LrzszTransferOptions {
  session: BBSSession;
  transport: LrzszTransport;
  direction: LrzszDirection;
  /** For download: full paths of files to send. For upload: target directory. */
  paths: string[];
  /** Override the spawned binary (sz/rz). Default: 'sz' / 'rz'. */
  binary?: string;
  /**
   * How long the transfer may be SILENT before it is killed, in ms.
   * Default 5 minutes. Not a limit on how long a transfer may take - see
   * `touch()`. 0 disables the watchdog.
   */
  timeoutMs?: number;
  /**
   * express.e:16831 `zmdupecheck`, answered where express answers it: at the
   * ZFILE header, before one byte of the file has crossed the line.
   *
   * express's ZMODEM receiver calls this on the name in the ZFILE
   * (zmodem.e:2571) and, when it says yes, sends ZSKIP (zmodem.e:2725)
   * instead of receiving. This port used to take the whole file and reject it
   * afterwards - the outcome was right and the caller's minutes were spent
   * for nothing. Upload only; absent means every file is accepted, which is
   * what a sysop-upload or a netmail transfer wants (express.e:16833 exempts
   * exactly those).
   */
  isDuplicate?: (filename: string) => boolean | Promise<boolean>;
  onComplete?: (success: boolean, detail: {
    received: string[];
    sent: string[];
    /** Names answered with ZSKIP, in the order they were offered. */
    skipped: string[];
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }) => void;
}

/**
 * `sz -L`, in bytes: the board's `ZMODEM_PACKETLEN`, or the 1024 this port has
 * always used.
 *
 * NOT lrzsz's 8192. That was tried and it broke MuffinTerm - its receive
 * buffer overflowed at about 30KB - which is why the number was hardcoded low
 * in the first place. Making it a tooltype gives the throughput back to a
 * board whose callers all run SyncTerm or NetRunner, without deciding for the
 * board that has one MuffinTerm caller left.
 *
 * Read at spawn, so a sysop's edit takes effect on the next transfer.
 */
export function zmodemPacketLength(): number {
  const FALLBACK = 1024;
  try {
    const { config } = require('../config');
    const { getBoardConfig } = require('./bbs-config-file.service');
    const configured = Number(getBoardConfig(config.get('dataDir'))?.zmodem_packetlen);
    if (!Number.isFinite(configured) || configured <= 0) return FALLBACK;
    // The bounds are lrzsz's own: a subpacket smaller than 128 bytes is all
    // header, and 8192 is the largest it will send.
    return Math.min(Math.max(Math.floor(configured), 128), 8192);
  } catch {
    return FALLBACK;
  }
}

export class LrzszTransferManager {
  private session: BBSSession;
  private transport: LrzszTransport;
  private direction: LrzszDirection;
  private paths: string[];
  private binary: string;
  private timeoutMs: number;
  private onComplete?: LrzszTransferOptions['onComplete'];

  private proc: ChildProcess | null = null;
  private stderrBuf: string = '';
  private timer: NodeJS.Timeout | null = null;
  private done: boolean = false;
  private inboundBuf: Buffer = Buffer.alloc(0);
  /**
   * Snapshot of filenames present in the upload cwd at spawn time.
   * Used at finish() to compute the actual set of files this transfer
   * produced — readdirSync alone would include every pre-existing file
   * in the playpen, which is how the earlier "31 file(s)" inflation
   * happened when prior failed sessions had left stragglers.
   */
  private preTransferFiles: Set<string> = new Set();

  /**
   * Filenames extracted from rz's stderr "Receiving: <name>" progress
   * lines (one per file). Authoritative for upload completion detection
   * because the readdir-diff approach fails when `-y` overwrites an
   * already-present same-name file (snapshot before == snapshot after).
   */
  private receivedFilenames: string[] = [];
  /**
   * On startup, rz emits a ZRINIT every ~1s until it gets ZFILE.
   * zmodem.js's browser-side Send session can't handle repeated
   * ZRINIT after the initial detection — it throws "Unhandled
   * header: ZRINIT" or a TypeError on the second one. Suppress
   * subsequent identical ZRINIT chunks after the first one is
   * forwarded; reset when the client sends any byte (meaning rz
   * will receive ZFILE and stop the keepalive loop).
   */
  private zrinitForwarded: boolean = false;

  /** express.e:16831's answer, when the caller supplied one. */
  private isDuplicate?: (filename: string) => boolean | Promise<boolean>;
  /** Names this transfer answered with ZSKIP - express's `skipdFiles`. */
  private skippedFiles: string[] = [];
  /** Inbound bytes held while a ZFILE is being screened. */
  private screenBuf: Buffer = Buffer.alloc(0);
  /** True while a duplicate answer is in flight. */
  private screenPending: boolean = false;
  /**
   * Whether a ZFILE could be the next thing on the wire.
   *
   * IT IS NOT ALWAYS. `*\x18A\x18D` is five bytes that a compressed archive
   * can produce by chance, and screening the whole stream for them would hold
   * file DATA hostage waiting for a subpacket terminator that never comes.
   * A ZFILE can only follow the receiver saying it is ready, so this is set
   * when a ZRINIT goes out to the caller and cleared the moment a ZFILE is
   * dealt with. Between those two points the stream is passed through
   * untouched.
   */
  private expectingZfile: boolean = true;

  constructor(opts: LrzszTransferOptions) {
    this.session = opts.session;
    this.transport = opts.transport;
    this.direction = opts.direction;
    this.paths = opts.paths || [];
    this.binary = opts.binary || (this.direction === 'download' ? 'sz' : 'rz');
    // An IDLE timeout, not a total-duration one. See `touch()`.
    this.timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    this.onComplete = opts.onComplete;
    this.isDuplicate = opts.isDuplicate;
  }

  /**
   * Spawn the lrzsz child, hook stdin/stdout into the transport,
   * and start the transfer.
   */
  start(): void {
    const args = this.buildArgs();
    console.log(`[lrzsz ${this.direction}] spawning: ${this.binary} ${args.join(' ')}`);

    // Reset stdin tee for this transfer so the next diff is clean.
    try { fs.writeFileSync(`/tmp/rz-stdin-tee-${this.direction}.bin`, ''); } catch (_e) { /* ignore */ }

    // Snapshot upload cwd so finish() can compute the diff (files
    // rz actually wrote during THIS transfer).
    if (this.direction === 'upload') {
      const cwdSnap = this.resolveCwd();
      if (cwdSnap) {
        try {
          for (const n of fs.readdirSync(cwdSnap)) this.preTransferFiles.add(n);
        } catch { /* directory may not exist yet — that's fine */ }
      }
    }

    const cwd = this.resolveCwd();
    if (cwd) {
      try {
        fs.mkdirSync(cwd, { recursive: true });
      } catch (err) {
        console.warn(`[lrzsz ${this.direction}] cwd mkdir failed:`, err);
      }
    }

    let proc: ChildProcess;
    try {
      proc = spawn(this.binary, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
      });
    } catch (err) {
      console.error(`[lrzsz ${this.direction}] spawn failed:`, err);
      this.finish(false, null, null, String(err));
      return;
    }
    this.proc = proc;
    this.session.transferRawActive = true;
    (this.session as any).transferManager = this;

    // child stdout → wire (the ZMODEM frames).
    //
    // lrzsz emits its HEX header trailer as CR + (LF|0x80) + XON, i.e.
    // \r \x8a \x11 — Forsberg's original spec marked the LF with the
    // high bit so receivers could distinguish trailer-LF from data-LF.
    // Modern terminal clients (SyncTerm, MuffinTerm) only consume
    // \r + \x8a as the trailer and then complain "Unexpected back-channel
    // data: XON" when they see the next \x11. Normalize to plain
    // \r\n\x11 which every client recognises.
    proc.stdout?.on('data', (chunk: Buffer) => {
      try {
        this.touch();
        this.processStdoutChunk(chunk);
      } catch (err) {
        console.error(`[lrzsz ${this.direction}] transport.send failed:`, err);
      }
    });

    // child stderr → log (sz/rz print progress here)
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      this.stderrBuf += text;
      // Cap buffer so a chatty rz can't blow memory.
      if (this.stderrBuf.length > 16 * 1024) {
        this.stderrBuf = this.stderrBuf.slice(-8 * 1024);
      }
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length === 0) continue;
        console.log(`[lrzsz ${this.direction}] stderr: ${line}`);
        // Capture filenames rz announces as it receives them. Line shape:
        //   "                       Receiving: 4AM-FONT.LHA"
        // (variable whitespace, optionally CR-overwritten progress lines).
        // This is authoritative — readdir-based diff misses overwrites
        // when -y replaces same-name files.
        if (this.direction === 'upload') {
          const m = line.match(/^\s*Receiving:\s+(\S.*?)\s*$/);
          if (m && m[1]) {
            const name = m[1].trim();
            // De-dup: rz may emit the line more than once if it
            // restarts/retries a file. Order-preserving uniqueness.
            if (!this.receivedFilenames.includes(name)) {
              this.receivedFilenames.push(name);
            }
          }
        }
      }
    });

    proc.on('error', (err: Error) => {
      console.error(`[lrzsz ${this.direction}] child error:`, err);
      this.finish(false, null, null, err.message);
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[lrzsz ${this.direction}] child closed: code=${code} signal=${signal}`);
      this.finish(code === 0, code, signal);
    });

    // Watchdog. See `touch()` for why this measures silence and not duration.
    this.touch();
  }

  /**
   * Restart the watchdog, because the transfer is alive.
   *
   * This used to be a single `setTimeout` armed at spawn: ten minutes after
   * the transfer STARTED, the child was killed, however well it was going. On
   * a dial-up-rate connection - which is the point of this board - a large
   * file legitimately takes longer than that, so the watchdog killed exactly
   * the transfers it existed to protect, and the caller lost the lot.
   *
   * express has no such timer at all. It relies on the protocol's own
   * timeouts and on carrier detect, and ZMODEM already retries and resyncs on
   * its own. So the only thing worth killing is a transfer that has gone
   * SILENT, and the measure is time since the last byte in either direction,
   * not time since the start.
   */
  private touch(): void {
    if (this.timeoutMs <= 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      console.warn(
        `[lrzsz ${this.direction}] no data for ${this.timeoutMs}ms, killing`,
      );
      this.cancel();
    }, this.timeoutMs);
    // A watchdog must never be the reason the process stays up.
    this.timer.unref?.();
  }

  /**
   * Forward inbound bytes from the wire into the lrzsz child's stdin.
   * Telnet/SSH input handler should route bytes here while
   * transferRawActive is true.
   */
  handleInput(data: Buffer): void {
    if (!this.proc || !this.proc.stdin || this.done) {
      console.log(`[lrzsz ${this.direction}] handleInput DROPPED ${data.length}B (proc=${!!this.proc} stdin=${!!this.proc?.stdin} done=${this.done})`);
      return;
    }
    try {
      // MuffinTerm-specific ZCRCE→ZCRCW rewrite only applies to
      // serial-line MuffinTerm clients. Web uploads (zmodem.js Sentry
      // in the browser) already emit spec-compliant ZCRCW, so running
      // the rewriter just makes it buffer the ZFILE chunk indefinitely
      // searching for a ZCRCE marker that never arrives.
      //
      // TP-12: TELNET, not "not web". SSH is a clean 8-bit stream with no
      // IAC layer and no serial-line framing, so it inherited a workaround
      // written for serial telnet clients and got the same indefinite
      // buffering the browser was exempted from.
      const rewritten =
        this.direction === 'upload' && this.transport.type === 'telnet'
          ? this.rewriteMuffintermZfile(data)
          : data;
      if (rewritten.length === 0) return; // buffering for fragmentation
      // THE DUPLICATE IS ANSWERED HERE, not after the bytes have arrived.
      // Only when the caller gave a rule, and only for an upload.
      if (this.direction === 'upload' && this.isDuplicate) {
        this.screenForDuplicates(rewritten);
        return;
      }
      this.forwardToChild(rewritten);
    } catch (err) {
      console.error(`[lrzsz ${this.direction}] stdin.write failed:`, err);
    }
  }

  /** The write that was inline in handleInput, so the screen can share it. */
  private forwardToChild(buf: Buffer): void {
    if (!this.proc || !this.proc.stdin || this.done || buf.length === 0) return;
    if (process.env.LRZSZ_DEBUG) {
      const preview = buf.slice(0, 64).toString('hex');
      console.log(`[lrzsz ${this.direction}] stdin <- ${buf.length}B: ${preview}${buf.length > 64 ? '...' : ''}`);
      try {
        require('fs').appendFileSync(`/tmp/rz-stdin-tee-${this.direction}.bin`, buf);
      } catch (_e) { /* ignore */ }
    }
    this.touch();
    this.proc.stdin.write(buf);
  }

  /**
   * Hold the stream just long enough to answer a ZFILE.
   *
   * The sender is already waiting: a ZFILE's subpacket ends with ZCRCW, which
   * says "no more data until the receiver answers" (Forsberg). So holding a
   * few hundred bytes here costs nothing and is exactly the window express
   * uses to decide between ZRPOS and ZSKIP.
   */
  private screenForDuplicates(chunk: Buffer): void {
    this.screenBuf = Buffer.concat([this.screenBuf, chunk]);
    if (this.screenPending) return;
    this.drainScreen();
  }

  private drainScreen(): void {
    if (!this.expectingZfile) {
      const out = this.screenBuf;
      this.screenBuf = Buffer.alloc(0);
      this.forwardToChild(out);
      return;
    }

    const found = this.locateZfileFrame(this.screenBuf);
    if (found === 'incomplete') return; // wait for the rest of the frame
    if (found === null) {
      const out = this.screenBuf;
      this.screenBuf = Buffer.alloc(0);
      this.forwardToChild(out);
      return;
    }

    const before = this.screenBuf.slice(0, found.start);
    const frame = this.screenBuf.slice(found.start, found.end);
    this.screenBuf = this.screenBuf.slice(found.end);
    this.expectingZfile = false;
    if (before.length > 0) this.forwardToChild(before);

    this.screenPending = true;
    Promise.resolve()
      .then(() => this.isDuplicate!(found.name))
      .then((duplicate) => {
        if (duplicate) {
          // express.e:2725 - the file is refused before it is sent, and the
          // name goes on the list the CallersLog prints (express.e:15101).
          this.skippedFiles.push(found.name);
          console.log(`[lrzsz upload] duplicate ${found.name} - answering ZSKIP`);
          this.sendZskip();
          // ARM FOR THE NEXT FILE. A ZSKIP invites the sender's next ZFILE
          // exactly as a ZRINIT does, and this screen answered it ITSELF -
          // rz never saw the frame, so rz never advances and never emits the
          // fresh ZRINIT that `processStdoutChunk` re-arms on. Without this
          // line only the FIRST file of a batch is ever screened, and the
          // moment that one is skipped every remaining file is forwarded
          // unchecked: on the live board a batch of three refused
          // ABS_PD1.LHA and then took ABS-PLC2.LHA and ABS-DRIN.LHA, both
          // duplicates, in full. express asks zmdupecheck at EVERY ZFILE
          // (zmodem.e:2571), not at the first one.
          this.expectingZfile = true;
          return;
        }
        this.forwardToChild(frame);
      })
      .catch((err) => {
        // A rule that throws must not cost the caller his upload: take the
        // file, and let the post-transfer filing catch the duplicate the way
        // it always did.
        console.error('[lrzsz upload] duplicate check failed, accepting file:', err);
        this.forwardToChild(frame);
      })
      .then(() => {
        this.screenPending = false;
        if (this.screenBuf.length > 0) this.drainScreen();
      });
  }

  /**
   * The ZFILE frame in `buf`, if a whole one is there.
   *
   * `null` - no frame begins in these bytes.
   * `'incomplete'` - one begins and has not finished arriving.
   */
  private locateZfileFrame(
    buf: Buffer,
  ): { start: number; end: number; name: string } | 'incomplete' | null {
    // `*` ZDLE 'A' ZDLE 'D' is ZBIN + ZFILE (0x04 escaped); 'C' is ZBIN32.
    const shapes: Array<{ prefix: Buffer; crcLen: number; headerBytes: number }> = [
      { prefix: Buffer.from([0x2a, 0x18, 0x41, 0x18, 0x44]), crcLen: 2, headerBytes: 7 },
      { prefix: Buffer.from([0x2a, 0x18, 0x43, 0x18, 0x44]), crcLen: 4, headerBytes: 9 },
    ];
    let start = -1;
    let shape = shapes[0];
    for (const candidate of shapes) {
      const at = buf.indexOf(candidate.prefix);
      if (at >= 0 && (start === -1 || at < start)) {
        start = at;
        shape = candidate;
      }
    }
    if (start < 0) return null;

    // Step over the header: `headerBytes` DECODED bytes after `*\x18A`.
    let cursor = start + 3;
    let decodedHeader = 0;
    while (decodedHeader < shape.headerBytes && cursor < buf.length) {
      cursor += buf[cursor] === 0x18 ? 2 : 1;
      decodedHeader++;
    }
    if (decodedHeader < shape.headerBytes || cursor > buf.length) return 'incomplete';

    // The name is the subpacket's first field, NUL-terminated, and the
    // subpacket ends at ZDLE + a ZCRC* marker.
    const name: number[] = [];
    let sawNul = false;
    let i = cursor;
    while (i < buf.length) {
      const byte = buf[i];
      if (byte === 0x18) {
        if (i + 1 >= buf.length) return 'incomplete';
        const next = buf[i + 1];
        if (next === 0x68 || next === 0x69 || next === 0x6a || next === 0x6b) {
          // Subpacket terminator: the CRC follows, escapes and all.
          let crcCursor = i + 2;
          let crcBytes = 0;
          while (crcBytes < shape.crcLen && crcCursor < buf.length) {
            crcCursor += buf[crcCursor] === 0x18 ? 2 : 1;
            crcBytes++;
          }
          if (crcBytes < shape.crcLen || crcCursor > buf.length) return 'incomplete';
          return {
            start,
            end: crcCursor,
            name: Buffer.from(name).toString('latin1'),
          };
        }
        if (!sawNul) {
          const decoded = next ^ 0x40;
          if (decoded === 0) sawNul = true;
          else name.push(decoded);
        }
        i += 2;
        continue;
      }
      if (!sawNul) {
        if (byte === 0) sawNul = true;
        else name.push(byte);
      }
      i += 1;
    }
    return 'incomplete';
  }

  /**
   * express.e's `zmodem_send_zskip` (zmodem.e:1128) - a hex ZSKIP header with
   * position 0, which is the whole of what a refused file is told.
   */
  private sendZskip(): void {
    const ZSKIP = 0x05;
    const bytes = [ZSKIP, 0, 0, 0, 0];
    let crc = 0;
    for (const b of bytes) {
      crc ^= b << 8;
      for (let k = 0; k < 8; k++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const body = bytes.map(hex).join('') + hex((crc >> 8) & 0xff) + hex(crc & 0xff);
    this.transport.send(Buffer.concat([
      Buffer.from([0x2a, 0x2a, 0x18, 0x42]),
      Buffer.from(body, 'ascii'),
      // CR, LF, XON - the trailer every hex header but ZFIN/ZACK carries.
      // Plain LF rather than Forsberg's 0x8a for the same reason
      // `normalizeHexHeaderTrailers` rewrites it: browser parsers refuse it.
      Buffer.from([0x0d, 0x0a, 0x11]),
    ]));
  }

  /**
   * Kill the child and tear down. Called on timeout or user abort.
   */
  cancel(): void {
    if (this.done || !this.proc) return;
    try {
      this.proc.kill('SIGTERM');
    } catch (err) {
      console.error(`[lrzsz ${this.direction}] kill failed:`, err);
    }
    // 'close' handler will fire finish() once the child actually exits.
  }

  /**
   * Rewrite lrzsz's high-bit-LF hex-header trailer (\r \x8a \x11) to the
   * compatibility form (\r \n \x11). Both encode the same end-of-header
   * marker per the ZMODEM spec, but receivers vary in which they
   * tolerate. The high-bit form is the canonical Forsberg encoding;
   * the plain form is what every modern client expects.
   *
   * Only affects header trailer bytes — the high-bit-LF only ever
   * appears in hex headers (binary headers/data don't use LF as a
   * delimiter), so the targeted replace is safe and doesn't corrupt
   * binary file content.
   */
  /**
   * WITHDRAWN 2026-09-23, kept only so the reason is on the record.
   *
   * This rewrote rz's own ZRINIT on the wire to clear CANFC32, meaning to
   * stop senders opting into CRC32. It cannot work, and the shape of the
   * mistake is worth keeping: the bytes going OUT were changed and `rz` was
   * not. The receiver still believed it had advertised CANFC32 and went on
   * verifying subpackets as CRC32, while the sender - told CRC32 was
   * unavailable - framed them as ZBIN/CRC16. The two then disagreed about
   * every subpacket, which is precisely the "Bad CRC" it was written to
   * avoid.
   *
   * Measured, not argued: DiNO uploading UP-SABBS.LHA from SyncTerm over
   * telnet, 2026-09-23. `rz` stderr took the file to about 7 KB and then
   * repeated `Retry 0: Bad CRC` / `Garbage count exceeded` / `Got ERROR`
   * until `Got ZCAN`, `rz: UP-SABBS.LHA removed`, `Transfer incomplete` -
   * and the client's own panel said `Block: 128/CRC-16`, the mode this
   * patch had forced it into. SyncTerm sends ZBIN32 when it is allowed to,
   * which is the mode `rz` actually verifies.
   *
   * MuffinTerm's ZBIN/CRC16 upload is the case this was aimed at, and the
   * sysop's ruling on 2026-09-23 is that it stays unfixed here: "is it a
   * problem in muffin term then its muffin terms issue". Per the withdrawn
   * comment's own account the fault is `rz` mis-verifying ZBIN subpackets
   * as CRC32 - nobody has measured that - but either way it is not this
   * board's to paper over, and the paper tore the working clients.
   *
   * So: do not reintroduce a wire rewrite for it. A fix belongs in the
   * receiver (a patched lrzsz, or the in-process zmodem.js path) or
   * nowhere.
   */
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  /**
   * Process a stdout chunk from the lrzsz child: patch ZRINIT flags,
   * normalize hex-header trailers, split at hex-header boundaries so
   * each frame goes out as its own socket message, and suppress
   * duplicate keepalive ZRINITs. Public-ish (private but called via
   * `(mgr as any).processStdoutChunk` from regression tests) so the
   * full transport pipeline can be exercised without spawning rz.
   */
  private processStdoutChunk(chunk: Buffer): void {
    const normalized = this.normalizeHexHeaderTrailers(chunk);
    if (process.env.LRZSZ_DEBUG) {
      const preview = normalized.slice(0, 64).toString('hex');
      console.log(`[lrzsz ${this.direction}] stdout -> ${normalized.length}B: ${preview}${normalized.length > 64 ? '...' : ''}`);
    }
    // Identify if a chunk is exclusively a ZRINIT (hex header type
    // 01) so we can suppress repeated keepalive ZRINITs after the
    // first one — see zrinitForwarded comment on the class field.
    const isLoneZrinit = (buf: Buffer): boolean => {
      if (buf.length === 0 || buf.length > 28) return false;
      if (buf[0] !== 0x2a || buf[1] !== 0x2a || buf[2] !== 0x18 || buf[3] !== 0x42) return false;
      return buf[4] === 0x30 && buf[5] === 0x31;
    };
    // ARMING is a different question from SUPPRESSION, and must not borrow
    // `isLoneZrinit`'s 28-byte cap: a ZRINIT that arrives with rz chatter
    // after it is still rz saying "send me a file", and if that does not
    // re-arm the screen the next file in the batch goes unchecked.
    const startsWithZrinit = (buf: Buffer): boolean =>
      buf.length >= 6 &&
      buf[0] === 0x2a && buf[1] === 0x2a && buf[2] === 0x18 && buf[3] === 0x42 &&
      buf[4] === 0x30 && buf[5] === 0x31;

    // Split at ZMODEM hex-header boundaries (`**\x18B`) so each
    // initial header is delivered to the peer as its own frame.
    // zmodem.js's Sentry requires the *first* chunk it consumes to
    // contain exactly ONE ZMODEM initialization header (see
    // zsentry.js _parse). lrzsz can emit two back-to-back ZRINITs
    // (~21B each) in a single 42B stdout chunk on spawn, which makes
    // detection fail and the bytes leak to to_terminal.
    const HEADER_MARKER = Buffer.from([0x2a, 0x2a, 0x18, 0x42]);
    const parts: Buffer[] = [];
    let cursor = 0;
    while (cursor < normalized.length) {
      const next = normalized.indexOf(HEADER_MARKER, cursor + HEADER_MARKER.length);
      if (next === -1) {
        parts.push(normalized.slice(cursor));
        break;
      }
      parts.push(normalized.slice(cursor, next));
      cursor = next;
    }
    // ZRINIT suppression only applies to web: the browser-side
    // zmodem.js Send session throws on repeated ZRINIT after
    // detection. Telnet / SSH clients (SyncTerm, NetRunner, MuffinTerm,
    // mTelnet, etc.) are tolerant ZMODEM parsers and EXPECT a fresh
    // ZRINIT in response to their ZRQINIT — suppressing it leaves
    // them stuck at "Waiting for OK to send".
    // TP-12: everything that is not TELNET. SSH's parser is the client's
    // own (SyncTerm, PuTTY + sz/rz, OpenSSH), reached over a clean 8-bit
    // stream, and the tolerance this exempts is a serial-line telnet trait.
    const suppressDuplicates = this.transport.type !== 'telnet';
    for (const part of parts) {
      if (part.length === 0) continue;
      // A ZRINIT is the receiver saying "send me a file", so a ZFILE may now
      // arrive - and only now. See `expectingZfile`.
      if (startsWithZrinit(part)) this.expectingZfile = true;
      if (suppressDuplicates && isLoneZrinit(part)) {
        if (this.zrinitForwarded) {
          if (process.env.LRZSZ_DEBUG) {
            console.log(`[lrzsz ${this.direction}] suppressed duplicate ZRINIT (${part.length}B)`);
          }
          continue;
        }
        this.zrinitForwarded = true;
      } else if (suppressDuplicates) {
        // Any non-ZRINIT chunk (ZACK, ZRPOS, etc.) means the
        // protocol has moved past initial handshake. Clear the
        // suppression flag so the next ZRINIT — which signals
        // "ready for next file or session end" after ZEOF — is
        // delivered to the browser Sentry. Otherwise the Send
        // session hangs after the first file completes.
        this.zrinitForwarded = false;
      }
      this.transport.send(part);
    }
  }

  private patchZrinitFlags(chunk: Buffer): Buffer {
    const orig = Buffer.from('2a2a18423031303030303030323362653530', 'hex');
    const fixed = Buffer.from('2a2a18423031303030303030303339613332', 'hex');
    let out: Buffer | null = null;
    let cursor = 0;
    while (cursor <= chunk.length - orig.length) {
      const idx = chunk.indexOf(orig, cursor);
      if (idx === -1) break;
      if (!out) out = Buffer.from(chunk);
      fixed.copy(out, idx);
      console.log(`[lrzsz ${this.direction}] patched ZRINIT: cleared CANFC32 at offset ${idx}`);
      cursor = idx + fixed.length;
    }
    return out || chunk;
  }

  /**
   * MuffinTerm terminates its ZFILE name/info subpacket with ZCRCE (0x68)
   * — "frame ends, header packet follows". Per Forsberg the spec-compliant
   * marker is ZCRCW (0x6b) which signals "ZACK expected before more data",
   * since the sender must wait for the receiver's ZRPOS/ZSKIP before
   * sending file content. lrzsz `rz` strictly requires ZCRCW for ZFILE
   * and NAKs anything else, so the transfer dies in a retry loop.
   *
   * Rewrite the marker byte in-stream and recompute the 2-byte CRC16.
   * Only touches ZBIN ZFILE subpackets (the `*\x18A\x18D` prefix is
   * specific to ZBIN + ZFILE). SyncTerm and Forsberg sz both already
   * send ZCRCW so the matcher is a no-op for compliant senders.
   *
   * Handles fragmentation: if a chunk doesn't yet contain the full
   * subpacket terminator, buffer and wait for more bytes.
   */
  private rewriteMuffintermZfile(chunk: Buffer): Buffer {
    // Append incoming chunk to any unpassed bytes from prior fragments.
    const buf = Buffer.concat([this.inboundBuf, chunk]);
    this.inboundBuf = Buffer.alloc(0);

    // Look for ZBIN ZFILE prefix: 2a 18 41 18 44
    const prefix = Buffer.from([0x2a, 0x18, 0x41, 0x18, 0x44]);
    const startIdx = buf.indexOf(prefix);
    if (startIdx < 0) return buf;

    // After the prefix, scan forward for the ZDLE+ZCRCE terminator (18 68).
    // Subpacket data may include ZDLE-escaped bytes, but in practice
    // MuffinTerm's ZFILE has filename + metadata + NUL padding — no escapes.
    // Limit scan distance to avoid runaway on garbage.
    const scanEnd = Math.min(buf.length - 2, startIdx + 4096);
    let termIdx = -1;
    for (let i = startIdx + prefix.length; i < scanEnd; i++) {
      if (buf[i] === 0x18 && buf[i + 1] === 0x68) {
        termIdx = i;
        break;
      }
    }
    if (termIdx < 0) {
      // Not enough bytes yet (or no terminator); buffer and wait.
      this.inboundBuf = buf;
      return Buffer.alloc(0);
    }

    // Need 2 more bytes after termIdx+1 for the CRC.
    if (termIdx + 3 >= buf.length) {
      this.inboundBuf = buf;
      return Buffer.alloc(0);
    }

    // Decode subpacket data (strip ZDLE escapes) starting after the ZFILE
    // header. The header is 5 escape pairs (type + 4 ZF bytes) + 2 CRC
    // bytes (one possibly ZDLE-escaped). Find the end of the header by
    // counting bytes after the prefix until 7 decoded bytes are consumed.
    const headerStart = startIdx + 3; // after `*\x18A`
    let decodedHdrBytes = 0;
    let i = headerStart;
    while (decodedHdrBytes < 7 && i < termIdx) {
      if (buf[i] === 0x18) {
        i += 2; // ZDLE-escaped pair → 1 decoded byte
      } else {
        i += 1;
      }
      decodedHdrBytes++;
    }
    const subStart = i;
    const subEnd = termIdx; // exclusive
    // Decode subpacket data
    const decoded: number[] = [];
    for (let j = subStart; j < subEnd; j++) {
      if (buf[j] === 0x18 && j + 1 < subEnd) {
        decoded.push(buf[j + 1] ^ 0x40);
        j++;
      } else {
        decoded.push(buf[j]);
      }
    }
    // Compute CRC16 over decoded subpacket + new marker byte (ZCRCW = 0x6b)
    let crc = 0;
    for (const b of decoded) {
      crc ^= (b << 8);
      for (let k = 0; k < 8; k++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    const ZCRCW = 0x6b;
    crc ^= (ZCRCW << 8);
    for (let k = 0; k < 8; k++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    const crcHi = (crc >> 8) & 0xff;
    const crcLo = crc & 0xff;
    // Encode CRC bytes with ZDLE escape if they're control characters.
    const encodeCrc = (b: number): number[] => {
      const isCtl = (b & 0x60) === 0; // matches lrzsz's "needs escape" rule loosely
      if (b === 0x18 || b === 0x10 || b === 0x11 || b === 0x13 ||
          b === 0x90 || b === 0x91 || b === 0x93) {
        return [0x18, b ^ 0x40];
      }
      return [b];
    };
    const newTail = Buffer.from([0x18, ZCRCW, ...encodeCrc(crcHi), ...encodeCrc(crcLo)]);

    // Reassemble: bytes before terminator + new tail + bytes after old CRC.
    const beforeTerm = buf.slice(0, termIdx);
    const afterCrc = buf.slice(termIdx + 4); // skip 18 68 + 2 CRC bytes
    const out = Buffer.concat([beforeTerm, newTail, afterCrc]);
    console.log(`[lrzsz ${this.direction}] rewrote ZFILE ZCRCE→ZCRCW at offset ${termIdx}, new CRC=${crcHi.toString(16)}${crcLo.toString(16)}`);
    return out;
  }

  private normalizeHexHeaderTrailers(chunk: Buffer): Buffer {
    // Patch the high-bit-LF byte (`\x8a`) of ZMODEM hex-header trailers
    // to plain LF (`\x0a`) so receivers that don't tolerate the Forsberg
    // form (some web/JS ZMODEM parsers) accept the header.
    //
    // Hex header on the wire is exactly 21 bytes:
    //   `** \x18 B` (4) + 2 type + 8 flag + 4 crc (ASCII hex chars) +
    //   `\r \x8a \x11` (3 trailer)
    // = positions 0..3 marker, 4..17 ascii-hex, 18..20 trailer.
    //
    // Originally we matched `\r \x8a` anywhere — that corrupted JPEG
    // download payload where the same byte pair appeared by chance.
    // Tightened to also require `\x11` follow-byte, then tightened
    // again here to require the FULL hex-header shape: marker at
    // start, 14 ascii-hex chars, then trailer. With this check the
    // false-positive probability on random binary is effectively zero.
    const isHexChar = (b: number) =>
      (b >= 0x30 && b <= 0x39) || // 0-9
      (b >= 0x41 && b <= 0x46) || // A-F
      (b >= 0x61 && b <= 0x66); // a-f
    let hits = 0;
    for (let i = 0; i + 20 < chunk.length; i++) {
      if (
        chunk[i] !== 0x2a ||
        chunk[i + 1] !== 0x2a ||
        chunk[i + 2] !== 0x18 ||
        chunk[i + 3] !== 0x42
      ) {
        continue;
      }
      // Verify the 14 hex chars (positions 4..17 from header start).
      let allHex = true;
      for (let j = i + 4; j <= i + 17; j++) {
        if (!isHexChar(chunk[j])) {
          allHex = false;
          break;
        }
      }
      if (!allHex) continue;
      // Verify trailer shape.
      if (
        chunk[i + 18] === 0x0d &&
        chunk[i + 19] === 0x8a &&
        chunk[i + 20] === 0x11
      ) {
        chunk[i + 19] = 0x0a;
        hits++;
        // Skip past this header so we don't try to re-match within it.
        i += 20;
      }
    }
    if (hits > 0) {
      console.log(`[lrzsz ${this.direction}] normalized ${hits} hex-header trailer(s) \\r\\x8a -> \\r\\n`);
    }
    return chunk;
  }

  private buildArgs(): string[] {
    if (this.direction === 'download') {
      // sz -b -o -L 1024 -vv <files...>
      //   -b  binary mode (no CR/LF translation)
      //   -o  16-bit CRC. MuffinTerm's ZMODEM rz chokes on ZBIN32
      //       frames (ZNAK loop). Forcing CRC16 sidesteps it.
      //   -L 1024  Subpacket length cap. Keeps ZDATA subpackets
      //       small so MuffinTerm's receive buffer doesn't
      //       overflow (we saw it fail at 30KB with default
      //       8K subpackets). Per-subpacket CRC = quicker
      //       recovery on bad blocks.
      //   -vv verbose to stderr (we log it) — diagnoses silent aborts
      // NB1: removed -e (escape ctrl chars). The escape flag asks the
      // receiver to escape; MuffinTerm/SyncTerm typically send raw
      // binary frames regardless, and -e adds unnecessary overhead
      // that some receivers misinterpret as protocol errors.
      // NB2: removed -w (window size). With -w set, sz pauses for ZACK
      // every <window> bytes. MuffinTerm doesn't send sliding-window
      // ZACKs so sz hung at 0 bytes/6 errors. Streaming with bounded
      // subpacket size (no window) lets MuffinTerm keep up via its
      // own subpacket CRC validation.
      return ['-b', '-o', '-L', String(zmodemPacketLength()), '-vv', ...this.paths];
    }
    // rz upload args. Web vs telnet/SSH differ because the browser
    // zmodem.js Send session does NOT implement ZRPOS handling — the
    // moment rz finds a same-name file in the playpen (e.g. a leftover
    // from a previous batch that wasn't moved out by post-upload, or a
    // partial from `<conf>/PartUpload/` that resumeStuff restored), it
    // sends ZRPOS to request resume-from-offset and zmodem.js throws
    // "Unhandled header: ZRPOS" — the whole transfer dies in an
    // unrecoverable loop. Telnet/SSH clients (MuffinTerm, SyncTerm,
    // NetRunner, mTelnet) all DO implement ZRPOS so for them we keep
    // the express.e-style `-r` resume.
    //
    //   -b binary mode (no CR/LF translation)
    //   -r resume interrupted file transfer (Z) — telnet/SSH only.
    //   -y overwrite existing files — web only. Mutually exclusive
    //      with -r per lrzsz(1).
    //   -t 600 per-retry timeout in tenths of seconds → 60s. The
    //      default (~10 = 1s) was tuned for serial-line transfers
    //      where the sender is software. For web uploads the user
    //      has to navigate an OS file picker between ZSINIT/ZACK
    //      and ZFILE — that can easily take 10–30s. Without the
    //      bump rz times out post-ZACK, sends the YMODEM-fallback
    //      `C` + CAN abort sequence, and exits 128 before the
    //      browser's send_files() has a chance to emit ZFILE.
    //   -vv verbose to stderr
    // What decides this is the CLIENT, not the transport.
    //
    // TP-12 grouped SSH with the browser on the grounds that SSH "is not a
    // serial-line telnet client mid-stream". But the paragraph above gives the
    // real discriminator, and it is ZRPOS: the browser's zmodem.js does not
    // implement it, and every terminal program that speaks ZMODEM does. An
    // SSH caller is running MuffinTerm or SyncTerm or mTelnet - the same
    // programs as a telnet caller, over a different pipe - so SSH resumes
    // exactly as well as telnet does, and only the browser cannot.
    //
    // The cost of having it backwards was that an interrupted upload over SSH
    // could not be resumed: rz overwrote from byte zero, and the caller sent
    // the whole file again. express resumes (`-r` is its behaviour, and
    // `resumeStuff()` exists for it).
    if (this.transport.type === 'web') {
      return ['-b', '-y', '-t', '600', '-vv'];
    }
    return ['-b', '-r', '-t', '600', '-vv'];
  }

  private resolveCwd(): string | undefined {
    if (this.direction === 'upload' && this.paths.length > 0) {
      // First path is the target directory for received files.
      const candidate = this.paths[0];
      try {
        const st = fs.statSync(candidate);
        if (st.isDirectory()) return candidate;
      } catch { /* ignore */ }
      return path.dirname(candidate);
    }
    return undefined;
  }

  private finish(success: boolean, code: number | null, signal: NodeJS.Signals | null, errMsg?: string): void {
    if (this.done) return;
    this.done = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.session.transferRawActive = false;
    if ((this.session as any).transferRawSink) {
      (this.session as any).transferRawSink = null;
    }
    if ((this.session as any).transferManager === this) {
      (this.session as any).transferManager = null;
    }

    // Best-effort detect what was transferred. For download we sent
    // every path we were given (lrzsz doesn't tell us mid-transfer
    // exit which finished). For upload we'd need to inspect the cwd.
    let received: string[] = [];
    let sent: string[] = [];
    if (success) {
      if (this.direction === 'download') {
        sent = [...this.paths];
      } else {
        // Prefer stderr-captured filenames (authoritative, works with
        // -y overwrites where readdir-diff sees no change). Fall back
        // to the readdir-diff if rz didn't emit "Receiving:" lines for
        // some reason (e.g. very old lrzsz, locale-translated stderr).
        const cwd = this.resolveCwd();
        if (this.receivedFilenames.length > 0 && cwd) {
          for (const name of this.receivedFilenames) {
            const full = path.join(cwd, name);
            try {
              if (fs.statSync(full).isFile()) {
                received.push(full);
              }
            } catch { /* file gone — skip */ }
          }
        } else if (cwd) {
          try {
            for (const n of fs.readdirSync(cwd)) {
              if (this.preTransferFiles.has(n)) continue;
              received.push(path.join(cwd, n));
            }
          } catch { /* ignore */ }
        }
      }
    }

    try {
      this.onComplete?.(success, {
        received,
        sent,
        skipped: this.skippedFiles,
        exitCode: code,
        signal,
        stderr: this.stderrBuf,
      });
    } catch (err) {
      console.error(`[lrzsz ${this.direction}] onComplete handler threw:`, err);
    }

    if (errMsg) {
      console.error(`[lrzsz ${this.direction}] finished with error: ${errMsg}`);
    }
  }
}

/**
 * Check whether lrzsz is installed and runnable. Cached after first call.
 */
let _lrzszAvailable: boolean | null = null;
let _lrzszVersion: string | null = null;

export function isLrzszAvailable(): boolean {
  if (_lrzszAvailable !== null) return _lrzszAvailable;
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('sz', ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (result.status === 0 || (result.stderr && result.stderr.includes('lrzsz'))) {
      _lrzszAvailable = true;
      _lrzszVersion = (result.stdout || result.stderr || '').split(/\r?\n/)[0];
      console.log(`[lrzsz] available: ${_lrzszVersion}`);
    } else {
      _lrzszAvailable = false;
      console.warn('[lrzsz] sz --version returned non-zero; ZMODEM will fall back to zmodem.js');
    }
  } catch (err) {
    _lrzszAvailable = false;
    console.warn('[lrzsz] sz binary not found; ZMODEM will fall back to zmodem.js. install via `brew install lrzsz` or `apk add lrzsz`.');
  }
  return _lrzszAvailable;
}
