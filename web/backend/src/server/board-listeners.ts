/**
 * Every port this process listens on, and what each one serves.
 *
 * WHY THIS EXISTS. The board is ONE node process: the web/API server, telnet,
 * SSH, the PETSCII telnet port and FTP are all bound by it, and so is every
 * 68K door's emulator. A door that opens a socket to one of these ports is
 * talking to the process that is running it, and that deadlocks the board -
 * not the door, the board:
 *
 *   The emulator parks in `deasync.loopWhile` waiting for the door's socket.
 *   `loopWhile` keeps timers and I/O running, so the connection is ACCEPTED -
 *   but it is reached from inside a promise continuation, and from there it
 *   cannot drain microtasks at all (`process._tickCallback()` refuses to
 *   re-enter itself; see `storage/file-cache.ts:945-965`). An async Express
 *   handler runs to its first `await` and can never resume. Measured on this
 *   machine: from a macrotask a pending microtask settles in 0 ms; from inside
 *   an `await` continuation it never settles, while a timer-backed one still
 *   settles in 51 ms.
 *
 * That happened on the live board on 2026-09-13. The Text-TV door was pointed
 * at 127.0.0.1:3001 and fetched its page from the board; every caller was
 * locked out, `/health` answered nothing, and the container went `unhealthy`
 * until it was recreated.
 *
 * So the ports are DERIVED, never restated: `index.ts` is what binds them and
 * this reads the same env and config it reads. A constant would be wrong the
 * first time a sysop moved a port.
 */
import { ftpPortFrom, type FtpConfig, type FtpEnv } from '../ftp/start-ftp';

/** The subset of `process.env` that moves a listener. */
export interface ListenerEnv extends FtpEnv {
  PORT?: string;
  TELNET_PORT?: string;
  SSH_PORT?: string;
  TELNET_PETSCII_PORT?: string;
}

/** What a port serves, for a message a sysop can act on. */
export interface BoardListener {
  port: number;
  serves: string;
}

/**
 * The board's default ports, and the only copy of them: `index.ts` falls back
 * to these when TELNET_PORT / SSH_PORT are unset, so one file answers "what
 * does the board listen on" and the two cannot drift apart.
 */
export const LISTENER_DEFAULTS = {
  http: 3001,
  telnet: 64128,
  ssh: 31337,
} as const;

function asPort(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : undefined;
}

/**
 * Every port the board binds, given the environment and its config.
 *
 * `httpPort` is the resolved `config.get('port')` - passed in rather than read
 * so this module never pulls the runtime config graph into a settings save.
 */
export function boardListeners(
  env: ListenerEnv = process.env as ListenerEnv,
  ftpConfig: FtpConfig | null = null,
  httpPort: number = LISTENER_DEFAULTS.http,
): BoardListener[] {
  const found: BoardListener[] = [
    { port: asPort(env.PORT) ?? httpPort, serves: 'the web terminal and the API' },
    { port: asPort(env.TELNET_PORT) ?? LISTENER_DEFAULTS.telnet, serves: 'telnet' },
    { port: asPort(env.SSH_PORT) ?? LISTENER_DEFAULTS.ssh, serves: 'SSH' },
  ];

  // Only bound when the sysop sets it (index.ts: "disabled unless set").
  const petscii = asPort(env.TELNET_PETSCII_PORT);
  if (petscii !== undefined) found.push({ port: petscii, serves: 'the PETSCII telnet port' });

  // FTP answers from the same process, through the rule FTP itself uses.
  try {
    const ftp = asPort(ftpPortFrom(ftpConfig, env));
    if (ftp !== undefined) found.push({ port: ftp, serves: 'FTP' });
  } catch {
    /* an unreadable FTP config must not stop a settings save */
  }

  // One entry per port; the first name wins if two collide.
  const byPort = new Map<number, BoardListener>();
  for (const l of found) if (!byPort.has(l.port)) byPort.set(l.port, l);
  return [...byPort.values()];
}

/** Hosts that mean "this machine", and so this process. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '', 'host.docker.internal']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(String(host).trim().toLowerCase());
}

/**
 * The listener `host:port` names, if it is one of the board's own.
 *
 * A non-loopback host is somebody else's machine and none of our business,
 * even on a port number we happen to share.
 */
export function boardListenerFor(
  host: string,
  port: number,
  listeners: BoardListener[],
): BoardListener | undefined {
  if (!isLoopbackHost(host)) return undefined;
  return listeners.find((l) => l.port === port);
}
