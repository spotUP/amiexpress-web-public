import * as fs from 'fs';
import * as path from 'path';
import Zmodem = require('zmodem.js');
import { BBSSession } from '../index';
import { BBSSessionData } from '../amiga-emulation/xim/types';
import { getSystemTime } from '../utils/date-time.util';

export type TransferDirection = 'download' | 'upload';

export interface TransferTransport {
  type: 'web' | 'telnet' | 'ssh';
  send: (data: Uint8Array | Buffer) => void;
}

export interface TransferOptions {
  session: BBSSession | BBSSessionData | any;
  transport: TransferTransport;
  direction: TransferDirection;
  paths: string[];
  /**
   * express.e:16831 `zmdupecheck`, answered at the offer - which is this
   * library's name for the ZFILE header. `xfer.skip()` sends the ZSKIP
   * express sends at zmodem.e:2725, so a file the board already has costs the
   * caller nothing. Upload only; absent accepts everything.
   */
  isDuplicate?: (filename: string) => boolean | Promise<boolean>;
  onComplete?: (success: boolean, detail: { received: string[]; sent: string[]; skipped: string[] }) => void;
}

/**
 * ZMODEM transfer coordinator.
 * Wraps zmodem.js Sentry and drives send/receive flows against a single session.
 */
export class ZmodemTransferManager {
  private session: BBSSession;
  private transport: TransferTransport;
  private direction: TransferDirection;
  private paths: string[];
  private sentry: any;
  private active: boolean = false;
  private onComplete?: (success: boolean, detail: { received: string[]; sent: string[]; skipped: string[] }) => void;
  private receivedFiles: string[] = [];
  /** How much has come off the wire, for a transfer that never finishes. */
  private bytesIn = 0;
  private chunksIn = 0;
  private bytesWritten = 0;
  /** How many times the sender has offered a file in this session. */
  private offers = 0;
  private sentFiles: string[] = [];
  /** Names answered with ZSKIP - express's `skipdFiles`. */
  private skippedFiles: string[] = [];
  private isDuplicate?: (filename: string) => boolean | Promise<boolean>;

  constructor(opts: TransferOptions) {
    this.session = opts.session;
    this.transport = opts.transport;
    this.direction = opts.direction;
    this.paths = opts.paths || [];
    this.onComplete = opts.onComplete;
    this.isDuplicate = opts.isDuplicate;

    this.sentry = new Zmodem.Sentry({
      to_terminal: (octets: number[]) => {
        // Forward any stray output to the remote terminal verbatim.
        this.transport.send(Buffer.from(octets));
      },
      on_detect: (det: any) => this.handleDetection(det),
      on_retract: () => {
        // Detection was cancelled; keep listening.
      },
      sender: (octets: number[]) => {
        this.transport.send(Buffer.from(octets));
      },
    });
  }

  /**
   * Feed inbound bytes from the remote terminal.
   */
  handleInput(data: Buffer): void {
    if (!this.active && !this.session.transferRawActive) {
      return;
    }
    // A TRANSFER THAT FAILS LEAVES NOTHING BEHIND TO READ.
    //
    // "uploading via zmodem via telnet is broken it retries the file over and
    // over" (2026-09-23) - and the service had one log line in it, so the
    // attempt was undiagnosable after the fact. These are counts, not bytes:
    // enough to say WHERE a transfer stopped without putting a caller's file
    // in the log.
    this.bytesIn += data.length;
    this.chunksIn += 1;
    if (this.chunksIn === 1 || this.chunksIn % 200 === 0) {
console.log(`[ZMODEM] ${this.direction}: ${this.chunksIn} chunks in, ${this.bytesIn} bytes`);
    }
    try {
      this.sentry.consume(data);
    } catch (err) {
      const preview = data.slice(0, 32).toString('hex');
console.error('[ZMODEM] Sentry consume failed:', err, 'data(hex)=', preview);
      this.finish(false);
    }
  }

  /**
   * Begin monitoring for a ZMODEM negotiation.
   */
  start(): void {
console.log(`[ZMODEM] start ${this.direction}, paths=${JSON.stringify(this.paths)}`);
    this.active = true;
    this.session.transferRawActive = true;
    (this.session as any).transferManager = this;
    try {
      const hdr = Zmodem.Header.build('ZRQINIT');
      this.transport.send(Buffer.from(hdr.to_hex()));
    } catch (err) {
console.error('[ZMODEM] Failed to send ZRQINIT:', err);
    }
  }

  /**
   * Abort the transfer and clean up.
   */
  cancel(): void {
    this.finish(false);
  }

  private handleDetection(det: any): void {
    if (!det || typeof det.confirm !== 'function') {
      return;
    }
    let zsession;
    try {
      zsession = det.confirm();
    } catch (err) {
console.error('[ZMODEM] Failed to confirm detection:', err);
      this.finish(false);
      return;
    }

    if (!zsession) {
      this.finish(false);
      return;
    }

    // Wire up cleanup on session end. zmodem.js only registers
    // 'receive', 'garbage', 'session_end' on the base ZSession (see
    // zmodem.js/src/zsession.js:260-262). Registering 'aborted'
    // throws 'Bad event: aborted' from the Sentry consume() call,
    // killing the transfer right after detection. Aborts manifest
    // either as session_end without all files transferred, or as a
    // throw caught in handleInput.
    zsession.on('session_end', () => this.finish(true));

    const role = zsession.type;
    if (role === 'send') {
      this.startSend(zsession);
    } else if (role === 'receive') {
      this.startReceive(zsession);
    } else {
console.warn('[ZMODEM] Unknown session role:', role);
      this.finish(false);
    }
  }

  /**
   * Send the requested files to the remote peer.
   */
  private async startSend(zsession: any): Promise<void> {
    try {
      const stats = this.paths.map((p) => {
        const st = fs.statSync(p);
        return { path: p, stat: st };
      });
      this.sentFiles = stats.map((s) => s.path);

      let filesRemaining = stats.length;
      let bytesRemaining = stats.reduce((acc, s) => acc + s.stat.size, 0);

      for (const entry of stats) {
        const basename = path.basename(entry.path);
        const offer = await zsession.send_offer({
          name: basename,
          size: entry.stat.size,
          mtime: entry.stat.mtime || getSystemTime(),
          mode: entry.stat.mode || 0o644,
          files_remaining: filesRemaining,
          bytes_remaining: bytesRemaining,
        });

        filesRemaining -= 1;
        bytesRemaining -= entry.stat.size;

        if (!offer) {
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          const stream = fs.createReadStream(entry.path, { highWaterMark: 8192 });
          stream.on('data', (chunk: Buffer | string) => {
            const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'binary') : chunk;
            offer.send(new Uint8Array(buf));
          });
          stream.on('end', () => {
            offer.end().then(() => resolve()).catch(reject);
          });
          stream.on('error', reject);
        });
      }

      await zsession.close();
    } catch (err) {
console.error('[ZMODEM] Send failed:', err);
      this.finish(false);
    }
  }

  /**
   * Receive files from the remote peer into the target directory.
   */
  private startReceive(zsession: any): void {
    const targetDir = this.resolveTargetDir();
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (err) {
console.error('[ZMODEM] Failed to create target dir:', targetDir, err);
      this.finish(false);
      return;
    }

    zsession.on('offer', (xfer: any) => {
      const details = xfer.get_details ? xfer.get_details() : {};
      const safeName = this.sanitizeFilename(details.name || 'upload.bin');
      // The offer COUNT is the whole question when a caller reports a file
      // retried over and over: a sender that never hears ZRINIT/ZACK offers
      // the same file again, and each one arrives here.
      this.offers += 1;
console.log(`[ZMODEM] offer #${this.offers}: ${safeName} size=${details.size ?? '?'} `
        + `mtime=${details.mtime ?? '?'} target=${targetDir}`);

      const accept = () => {
        const dest = path.join(targetDir, safeName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const writer = fs.createWriteStream(dest);
console.log(`[ZMODEM] accepting ${safeName} -> ${dest}`);
        xfer.on('input', (octets: Uint8Array) => {
          this.bytesWritten += octets.length;
          writer.write(Buffer.from(octets));
        });
        xfer.accept().then(() => {
          writer.end();
          this.receivedFiles.push(dest);
console.log(`[ZMODEM] received ${safeName}: ${this.bytesWritten} bytes written`);
        }).catch((err: any) => {
console.error(`[ZMODEM] Offer accept failed for ${safeName} after ${this.bytesWritten} bytes:`, err);
          writer.end();
        });
      };

      // THE DUPLICATE IS REFUSED HERE, before a byte is asked for -
      // express.e:16831 and zmodem.e:2725. Without a rule, everything is
      // accepted, which is what a sysop upload wants.
      if (this.direction === 'upload' && this.isDuplicate) {
        Promise.resolve()
          .then(() => this.isDuplicate!(safeName))
          .then((duplicate) => {
            if (!duplicate) return accept();
            this.skippedFiles.push(safeName);
console.log(`[ZMODEM] duplicate ${safeName} - sending ZSKIP`);
            xfer.skip();
          })
          .catch((err: any) => {
            // A rule that throws must not cost the caller his upload.
console.error('[ZMODEM] duplicate check failed, accepting file:', err);
            accept();
          });
        return;
      }

      accept();
    });

    zsession.start();
  }

  private resolveTargetDir(): string {
    if (!this.paths.length) {
      return path.join(process.cwd(), 'tmp', 'uploads');
    }
    const first = this.paths[0];
    try {
      if (fs.existsSync(first) && fs.statSync(first).isDirectory()) {
        return first;
      }
    } catch (_) {
      /* ignore */
    }
    return path.dirname(first);
  }

  private sanitizeFilename(name: string): string {
    const base = path.basename(name).replace(/[/\\]/g, '_');
    return base || 'upload.bin';
  }

  private finish(success: boolean): void {
    if (!this.active) return;
console.log(`[ZMODEM] finish ${this.direction} success=${success} offers=${this.offers} in=${this.bytesIn}B/${this.chunksIn} chunks `
      + `written=${this.bytesWritten}B received=${JSON.stringify(this.receivedFiles)} `
      + `skipped=${JSON.stringify(this.skippedFiles)}`);
    this.active = false;
    this.session.transferRawActive = false;
    (this.session as any).transferManager = undefined;
    (this.session as any).transferRawSink = undefined;
    (this.session as any).transferRawSend = undefined;
    if (typeof this.onComplete === 'function') {
      try {
        this.onComplete(success, { received: this.receivedFiles, sent: this.sentFiles, skipped: this.skippedFiles });
      } catch (_) {
        /* ignore */
      }
    }
  }
}
