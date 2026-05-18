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
  type: 'telnet' | 'ssh';
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
  /** Spawn timeout (ms). Default 10 minutes. */
  timeoutMs?: number;
  onComplete?: (success: boolean, detail: {
    received: string[];
    sent: string[];
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }) => void;
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

  constructor(opts: LrzszTransferOptions) {
    this.session = opts.session;
    this.transport = opts.transport;
    this.direction = opts.direction;
    this.paths = opts.paths || [];
    this.binary = opts.binary || (this.direction === 'download' ? 'sz' : 'rz');
    this.timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
    this.onComplete = opts.onComplete;
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
        const normalized = this.normalizeHexHeaderTrailers(this.patchZrinitFlags(chunk));
        const preview = normalized.slice(0, 64).toString('hex');
        console.log(`[lrzsz ${this.direction}] stdout -> ${normalized.length}B: ${preview}${normalized.length > 64 ? '...' : ''}`);
        this.transport.send(normalized);
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

    // Watchdog
    if (this.timeoutMs > 0) {
      this.timer = setTimeout(() => {
        console.warn(`[lrzsz ${this.direction}] timeout (${this.timeoutMs}ms), killing`);
        this.cancel();
      }, this.timeoutMs);
    }
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
      const rewritten = this.direction === 'upload' ? this.rewriteMuffintermZfile(data) : data;
      if (rewritten.length === 0) return; // buffering for fragmentation
      const preview = rewritten.slice(0, 64).toString('hex');
      console.log(`[lrzsz ${this.direction}] stdin <- ${rewritten.length}B: ${preview}${rewritten.length > 64 ? '...' : ''}`);
      try {
        require('fs').appendFileSync(`/tmp/rz-stdin-tee-${this.direction}.bin`, rewritten);
      } catch (_e) { /* ignore */ }
      this.proc.stdin.write(rewritten);
    } catch (err) {
      console.error(`[lrzsz ${this.direction}] stdin.write failed:`, err);
    }
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
   * lrzsz advertises CANFC32 (0x20) in its ZRINIT capabilities, then
   * incorrectly rejects subpackets sent with ZBIN (CRC16) framing as
   * "Bad CRC" — it tries to verify them as CRC32. SyncTerm avoids
   * this by always sending ZBIN32; MuffinTerm (and other strict
   * clients) correctly use ZBIN per-frame, hit the rz bug, and the
   * transfer dies in a ZNAK loop. Strip CANFC32 from rz's ZRINIT so
   * senders never opt into CRC32 mode in the first place.
   *
   * ZRINIT on wire is the HEX header:
   *   ** \x18 B 01 00000023 XXXX \r \x8a \x11
   * Replace ZF0 byte (the "23") with "03" (clears bit 0x20 = CANFC32,
   * keeps CANFDX 0x01 + CANOVIO 0x02) and recompute the CRC16.
   * New header CRC for type=0x01, flags=0x00000003 is 0x9a32.
   */
  private patchZrinitFlags(chunk: Buffer): Buffer {
    const orig = Buffer.from('2a2a18423031303030303030323362653530', 'hex');
    const fixed = Buffer.from('2a2a18423031303030303030303339613332', 'hex');
    const idx = chunk.indexOf(orig);
    if (idx === -1) return chunk;
    const out = Buffer.from(chunk);
    fixed.copy(out, idx);
    console.log(`[lrzsz ${this.direction}] patched ZRINIT: cleared CANFC32 at offset ${idx}`);
    return out;
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
    // Look for \r \x8a sequences and patch the \x8a → \x0a (LF).
    // ZMODEM hex headers always end with this exact pair.
    let hits = 0;
    for (let i = 0; i < chunk.length - 1; i++) {
      if (chunk[i] === 0x0d && chunk[i + 1] === 0x8a) {
        chunk[i + 1] = 0x0a;
        hits++;
      }
    }
    if (hits > 0) {
      console.log(`[lrzsz ${this.direction}] normalized ${hits} hex-header trailer(s) \\r\\x8a -> \\r\\n`);
    }
    return chunk;
  }

  private buildArgs(): string[] {
    if (this.direction === 'download') {
      // sz -b -o -vv <files...>
      //   -b  binary mode (no CR/LF translation)
      //   -o  16-bit CRC instead of 32-bit. MuffinTerm's ZMODEM rz
      //       chokes on ZBIN32 frames (it sends back ZNAK on every
      //       data subpacket and the transfer dies in a retry loop).
      //       Forcing CRC16 sidesteps the bug — same class of
      //       interop fix as the inbound ZRINIT CANFC32 clear we
      //       apply for uploads.
      //   -vv verbose to stderr (we log it) — diagnoses silent aborts
      // NB: removed -e (escape ctrl chars). The escape flag asks the
      // receiver to escape; MuffinTerm/SyncTerm typically send raw
      // binary frames regardless, and -e adds unnecessary overhead
      // that some receivers misinterpret as protocol errors.
      return ['-b', '-o', '-vv', ...this.paths];
    }
    // rz -b -y -vv
    //   -b binary mode
    //   -y overwrite existing files in target dir
    //   -vv verbose to stderr
    // Removed -e for same reason as sz.
    return ['-b', '-y', '-vv'];
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
        const cwd = this.resolveCwd();
        if (cwd) {
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
