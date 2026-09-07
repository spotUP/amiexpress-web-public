/**
 * The FTP control listener.
 *
 * Deliberately shaped like `server/ssh-server.ts` and started from the same
 * place in `index.ts`: a non-HTTP listener whose port comes from
 * `system_config` unless an env var overrides it, inside a try/catch that lets
 * the board come up without it. A second listener shape would be a second set
 * of failure modes to learn.
 */
import * as net from 'net';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import type { Duplex } from 'stream';

import { FtpSession, type FtpDeps } from './ftp-session';

export interface FtpServerOptions {
  port: number;
  host?: string;
  /** PEM certificate and key. Without them `AUTH TLS` answers 431. */
  tls?: { cert: Buffer; key: Buffer };
  /**
   * Let a caller off the box log in without `AUTH TLS`. Off unless the sysop
   * sets `FTP_ALLOW_PLAINTEXT=1` - see `FtpSession.mustUpgradeFirst`.
   */
  allowPlaintext?: boolean;
}

export class FtpServer extends EventEmitter {
  private readonly options: FtpServerOptions;
  private readonly deps: FtpDeps;
  private server: net.Server | null = null;
  private secureContext: tls.SecureContext | null = null;

  constructor(options: FtpServerOptions, deps: FtpDeps) {
    super();
    this.options = options;
    this.deps = deps;
    if (options.tls) {
      this.secureContext = tls.createSecureContext({ cert: options.tls.cert, key: options.tls.key });
    }
  }

  /** The port actually bound - which is what an ephemeral-port test asks for. */
  address(): net.AddressInfo | null {
    const addr = this.server?.address();
    return addr && typeof addr !== 'string' ? addr : null;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer(socket => this.onConnection(socket));
      this.server.on('error', error => {
        this.emit('error', error);
        reject(error);
      });
      this.server.listen(this.options.port, this.options.host ?? '0.0.0.0', () => resolve());
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  private onConnection(socket: net.Socket): void {
    const deps: FtpDeps = this.secureContext
      ? { ...this.deps, startTls: raw => this.upgrade(raw) }
      : { ...this.deps, startTls: undefined };

    const session = new FtpSession(socket, deps, socket.remoteAddress, {
      allowPlaintext: this.options.allowPlaintext,
    });
    session.start();
  }

  /**
   * `AUTH TLS`: the SAME connection continues inside TLS. The reply has
   * already gone out in the clear - that is what explicit FTPS is - so the
   * handshake starts on the socket as it stands.
   */
  private upgrade(raw: Duplex): Promise<Duplex> {
    return new Promise((resolve, reject) => {
      const secured = new tls.TLSSocket(raw as net.Socket, {
        isServer: true,
        secureContext: this.secureContext!,
      });
      secured.once('secure', () => resolve(secured));
      secured.once('error', reject);
    });
  }
}
