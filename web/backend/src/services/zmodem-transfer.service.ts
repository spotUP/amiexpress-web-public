import * as fs from 'fs';
import * as path from 'path';
import Zmodem = require('zmodem.js');
import { BBSSession } from '../index';
import { BBSSessionData } from '../amiga-emulation/xim/types';

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
  onComplete?: (success: boolean, detail: { received: string[]; sent: string[] }) => void;
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
  private onComplete?: (success: boolean, detail: { received: string[]; sent: string[] }) => void;
  private receivedFiles: string[] = [];
  private sentFiles: string[] = [];

  constructor(opts: TransferOptions) {
    this.session = opts.session;
    this.transport = opts.transport;
    this.direction = opts.direction;
    this.paths = opts.paths || [];
    this.onComplete = opts.onComplete;

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

    // Wire up cleanup on session end
    zsession.on('session_end', () => this.finish(true));
    zsession.on('aborted', () => this.finish(false));

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
          mtime: entry.stat.mtime || new Date(),
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
      const dest = path.join(targetDir, safeName);
      const dirForFile = path.dirname(dest);
      fs.mkdirSync(dirForFile, { recursive: true });

      const writer = fs.createWriteStream(dest);
      xfer.on('input', (octets: Uint8Array) => {
        writer.write(Buffer.from(octets));
      });

      xfer.accept().then(() => {
        writer.end();
        this.receivedFiles.push(dest);
      }).catch((err: any) => {
        console.error('[ZMODEM] Offer accept failed:', err);
        writer.end();
      });
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
    this.active = false;
    this.session.transferRawActive = false;
    (this.session as any).transferManager = undefined;
    (this.session as any).transferRawSink = undefined;
    (this.session as any).transferRawSend = undefined;
    if (typeof this.onComplete === 'function') {
      try {
        this.onComplete(success, { received: this.receivedFiles, sent: this.sentFiles });
      } catch (_) {
        /* ignore */
      }
    }
  }
}
