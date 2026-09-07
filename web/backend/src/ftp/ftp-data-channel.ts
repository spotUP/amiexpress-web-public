/**
 * The second connection FTP needs, and the reason it is awkward.
 *
 * A listing does not come back on the control connection: the client is told
 * an address, opens a second socket to it, and the bytes go there. `PASV` is
 * the form that works from behind NAT on the CLIENT side, which is every
 * client today, so it is the one implemented first.
 *
 * Two things it must be told rather than work out, both because this server
 * runs in a container behind a published port:
 *
 *  - the ADDRESS to advertise. The control socket's local address is the
 *    container's (172.x); a caller told that dials his own network and hangs.
 *    `FTP_PASV_ADDRESS` is the public one.
 *  - the PORT RANGE. Docker publishes a fixed range, so the listener has to
 *    bind inside it - an ephemeral port is a port nothing forwards.
 */
import * as net from 'net';
import type { Duplex } from 'stream';

export interface PassivePortRange {
  first: number;
  last: number;
}

/**
 * `50101-50107`, `50101,50102,...` or a single port - the two shapes the
 * board's own `FTPDATAPORT` tooltype is written in, plus the obvious one.
 * Invalid text yields null rather than a guess: PASV then refuses with 425,
 * which is a diagnosable answer.
 */
export function parsePortRange(text: string | null | undefined): PassivePortRange | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  const dash = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (dash) {
    const first = Number(dash[1]);
    const last = Number(dash[2]);
    return first > 0 && last >= first ? { first, last } : null;
  }

  const numbers = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((port) => Number.isInteger(port) && port > 0);
  if (numbers.length === 0) return null;
  return { first: Math.min(...numbers), last: Math.max(...numbers) };
}

/** `227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)` - the address, comma-wise. */
export function passiveReplyAddress(address: string, port: number): string {
  const quads = address.replace(/^::ffff:/, '').split('.');
  if (quads.length !== 4) throw new Error(`PASV needs an IPv4 address, got ${address}`);
  return `${quads.join(',')},${Math.floor(port / 256)},${port % 256}`;
}

/**
 * A listener the caller connects back to, for exactly one connection.
 *
 * It closes itself as soon as that connection arrives - a passive listener
 * left open is a port out of a small range that the next transfer cannot have.
 * The timeout is the other half of that: a client that never comes back must
 * not hold a port for ever.
 */
export class PassiveChannel {
  private readonly server: net.Server;
  private readonly connection: Promise<Duplex>;
  /** The caller's socket once it arrives, so an abandoned transfer can end it. */
  private accepted: Duplex | null = null;

  private constructor(server: net.Server, connection: Promise<Duplex>) {
    this.server = server;
    this.connection = connection;
    connection.then((socket) => { this.accepted = socket; }).catch(() => undefined);
  }

  /** The port actually bound, which is what PASV has to advertise. */
  port(): number {
    const address = this.server.address();
    return address && typeof address !== 'string' ? address.port : 0;
  }

  /** The caller's data connection, once he opens it. */
  accept(): Promise<Duplex> {
    return this.connection;
  }

  /**
   * Give the port back, and end the caller's data connection if he already
   * opened one.
   *
   * Closing only the LISTENER leaves a client that connected between `227` and
   * a refusal holding a socket nothing will ever write to - it waits for its
   * own timeout while the control connection has already told it 550. A
   * refusal should be immediate on both connections.
   */
  close(): void {
    try {
      this.server.close();
    } catch {
      /* already closed */
    }
    try {
      this.accepted?.destroy();
    } catch {
      /* the caller may have gone first */
    }
  }

  /**
   * Bind the first free port in the range.
   *
   * Tried in order rather than at random: a small published range is easier to
   * reason about in a firewall rule when the low ports are used first.
   */
  static async open(
    range: PassivePortRange,
    host: string,
    timeoutMs = 60_000
  ): Promise<PassiveChannel | null> {
    for (let port = range.first; port <= range.last; port++) {
      const server = net.createServer();
      const bound = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(port, host, () => resolve(true));
      });
      if (!bound) {
        server.close();
        continue;
      }

      const connection = new Promise<Duplex>((resolve, reject) => {
        const timer = setTimeout(() => {
          server.close();
          reject(new Error('the caller never opened the data connection'));
        }, timeoutMs);
        timer.unref?.();
        server.once('connection', (socket) => {
          clearTimeout(timer);
          server.close();
          resolve(socket);
        });
      });
      // Nothing may be left waiting on this promise if the transfer is
      // abandoned; the rejection is handled where accept() is awaited.
      connection.catch(() => undefined);

      return new PassiveChannel(server, connection);
    }
    return null;
  }
}
