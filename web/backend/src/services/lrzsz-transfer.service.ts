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
        const normalized = this.normalizeHexHeaderTrailers(chunk);
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
      // Diagnostic: log first 64 bytes of inbound data per chunk. Helps
      // diagnose why rz exits 128 immediately without receiving the file.
      const preview = data.slice(0, 64).toString('hex');
      console.log(`[lrzsz ${this.direction}] stdin <- ${data.length}B: ${preview}${data.length > 64 ? '...' : ''}`);
      this.proc.stdin.write(data);
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
      // sz -b -vv <files...>
      //   -b binary mode (no CR/LF translation)
      //   -vv verbose to stderr (we log it) — helps diagnose silent aborts
      // NB: removed -e (escape ctrl chars). The escape flag asks the
      // receiver to escape; MuffinTerm/SyncTerm typically send raw
      // binary frames regardless, and -e adds unnecessary overhead
      // that some receivers misinterpret as protocol errors.
      return ['-b', '-vv', ...this.paths];
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
            received = fs.readdirSync(cwd).map((n) => path.join(cwd, n));
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
