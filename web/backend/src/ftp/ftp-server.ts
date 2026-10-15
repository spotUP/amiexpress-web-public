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

import type { PassivePortRange } from './ftp-data-channel';
import { FtpSession, type FtpDeps } from './ftp-session';

export interface FtpServerOptions {
  port: number;
  host?: string;
  /** PEM certificate and key. Without them `AUTH TLS` answers 431. */
  tls?: { cert: Buffer; key: Buffer };
  /**
   * A certificate per hostname, chosen by SNI at handshake time.
   *
   * The board answers to `uptown.uprough.net` and `bbs.uprough.net`; a
   * certificate is issued for one name, and a client dialling the other
   * rejects it. `tls` above stays the default, for a client that sends no
   * server name.
   */
  tlsHosts?: Record<string, { cert: Buffer; key: Buffer }>;
  /**
   * Let a caller off the box log in without `AUTH TLS`. Off unless the sysop
   * sets `FTP_ALLOW_PLAINTEXT=1` - see `FtpSession.mustUpgradeFirst`.
   */
  allowPlaintext?: boolean;
  /** The published port range a `PASV` listener may bind inside. */
  passivePorts?: PassivePortRange | null;
  /**
   * The address `PASV` advertises. Must be the PUBLIC one: this server runs in
   * a container, and its own address is on a bridge no caller can reach.
   */
  passiveAddress?: string | null;
}

export class FtpServer extends EventEmitter {
  private readonly options: FtpServerOptions;
  private readonly deps: FtpDeps;
  private server: net.Server | null = null;
  private secureContext: tls.SecureContext | null = null;

  /** One context per name in `tlsHosts`, built once - not per handshake. */
  private readonly hostContexts = new Map<string, tls.SecureContext>();

  constructor(options: FtpServerOptions, deps: FtpDeps) {
    super();
    this.options = options;
    this.deps = deps;
    if (options.tls) {
      this.secureContext = tls.createSecureContext({ cert: options.tls.cert, key: options.tls.key });
    }
    for (const [host, material] of Object.entries(options.tlsHosts ?? {})) {
      this.hostContexts.set(
        host.toLowerCase(),
        tls.createSecureContext({ cert: material.cert, key: material.key })
      );
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
    const secure = this.secureContext
      ? {
          startTls: (raw: Duplex) => this.upgrade(raw),
          // The data connection is upgraded the same way, but only after
          // `PROT P`: a client may protect the control channel and leave the
          // data one clear, and that is its choice to make.
          secureData: (raw: Duplex) => this.upgrade(raw),
        }
      : { startTls: undefined, secureData: undefined };

    const deps: FtpDeps = {
      ...this.deps,
      ...secure,
      passivePorts: () => this.options.passivePorts ?? null,
      passiveAddress: () => this.options.passiveAddress ?? null,
    };

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
        // The name the client dialled decides the certificate. Unknown names
        // and clients that send none fall through to `secureContext` above,
        // which is the first configured host - better a certificate the
        // client may not like than a handshake that fails outright.
        SNICallback: (servername, callback) => {
          const context = this.hostContexts.get(String(servername).toLowerCase());
          callback(null, context ?? this.secureContext ?? undefined);
        },
      });
      secured.once('secure', () => resolve(secured));
      secured.once('error', reject);
    });
  }
}
