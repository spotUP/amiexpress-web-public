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

    // child stdout → wire (the ZMODEM frames)
    proc.stdout?.on('data', (chunk: Buffer) => {
      try {
        this.transport.send(chunk);
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
    if (!this.proc || !this.proc.stdin || this.done) return;
    try {
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

  private buildArgs(): string[] {
    if (this.direction === 'download') {
      // sz -b -e -O <files...>
      // sz reads from -O stdin? No — for sender, stdin is the back-channel
      // from the receiver. sz writes ZMODEM frames to stdout. The file list
      // is positional args (files to send).
      return ['-b', '-e', ...this.paths];
    }
    // rz -b -e -y    (writes received files to CWD)
    // Set the child's cwd via spawn options? We pass through; caller sets
    // transferRawSink before start(). Files land in process.cwd() unless
    // we cd in via spawn cwd: option. We'll do that.
    // For simplicity, write to first path treated as a target directory.
    return ['-b', '-e', '-y'];
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
