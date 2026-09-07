/**
 * Whether this board runs an FTP server, and on what.
 *
 * A function rather than a block inside `index.ts` so the rule can be driven
 * by a test: "started only when the sysop turned it on" is exactly the kind of
 * thing that is easy to get wrong and impossible to notice, because a server
 * that never starts looks identical to one nobody has tried to use.
 */
import * as fs from 'fs';
import * as path from 'path';

import { parsePortRange } from './ftp-data-channel';
import { FtpServer } from './ftp-server';
import type { FtpDeps } from './ftp-session';

/** The fields the admin already writes to `system_config`. */
export interface FtpConfig {
  ftp_enabled?: boolean | number | null;
  ftp_host?: string | null;
  ftp_port?: number | null;
  ftp_data_ports?: string | null;
}

export interface FtpEnv {
  FTP_PORT?: string;
  FTP_HOST?: string;
  /** PEM paths. Without them the server runs, and `AUTH TLS` answers 431. */
  FTP_TLS_CERT?: string;
  FTP_TLS_KEY?: string;
  /**
   * The board answers to more than one name, and a certificate is issued for
   * ONE. `FTP_TLS_HOSTS` is the comma-separated list, in preference order
   * (first is the default for a client that sends no SNI), each read as
   * `<FTP_TLS_DIR>/<host>.crt` and `.key`.
   */
  FTP_TLS_DIR?: string;
  FTP_TLS_HOSTS?: string;
  /**
   * The passive data range Docker publishes, and the PUBLIC address a caller
   * is told to dial back on. Without the address PASV answers 425: a container
   * that advertised its own bridge address would send every client nowhere.
   */
  FTP_PASSIVE_PORTS?: string;
  FTP_PASSIVE_ADDRESS?: string;
  /**
   * `1` lets a caller off the box log in without `AUTH TLS`. Off by default,
   * and it should stay off wherever the clients can manage explicit FTPS.
   */
  FTP_ALLOW_PLAINTEXT?: string;
}

/**
 * 2121, not 21: the sysop's decision, and the reason is not taste. 21 is
 * privileged, so it needs the container to be allowed to bind it, and it is
 * the most scanned port on the internet.
 */
export const DEFAULT_FTP_PORT = 2121;

/** A declared, firewalled range - passive mode cannot work without one. */
export const DEFAULT_PASSIVE_PORTS = '30000-30099';

export function ftpPortFrom(config: FtpConfig | null, env: FtpEnv = {}): number {
  // Env beats config, exactly as the telnet and SSH ports do
  // (index.ts:1505-1514) - it is what lets a container be moved without an
  // admin round trip.
  const fromEnv = env.FTP_PORT ? parseInt(env.FTP_PORT, 10) : NaN;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (config?.ftp_port) return config.ftp_port;
  return DEFAULT_FTP_PORT;
}

export function ftpEnabled(config: FtpConfig | null): boolean {
  return Boolean(config?.ftp_enabled);
}

/**
 * Whether the sysop has switched the plaintext refusal off.
 *
 * Only an explicit `1`/`true`/`yes`: an empty string, an unset variable and
 * anything else all mean the policy stands. A weakening that could be turned
 * on by a typo would not be opt-in at all.
 */
export function ftpAllowsPlaintext(env: FtpEnv = {}): boolean {
  const raw = (env.FTP_ALLOW_PLAINTEXT ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function tlsMaterial(env: FtpEnv): { cert: Buffer; key: Buffer } | undefined {
  if (!env.FTP_TLS_CERT || !env.FTP_TLS_KEY) return undefined;
  try {
    return { cert: fs.readFileSync(env.FTP_TLS_CERT), key: fs.readFileSync(env.FTP_TLS_KEY) };
  } catch (error) {
    // A missing certificate must not take the board down with it: the server
    // still runs, and refuses plaintext logins from off the box.
    console.warn(`[FTP] Could not read the TLS certificate, AUTH TLS will be refused: ${
      error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/**
 * A certificate per hostname the board answers to.
 *
 * One board, two names: `uptown.uprough.net` is the one the sysop gives out
 * and `bbs.uprough.net` is the one everything internal uses. They resolve to
 * the same address, but a TLS certificate is issued for a NAME - a client
 * dialling uptown and served the bbs certificate rejects it, which is not a
 * misconfiguration a caller can work around.
 *
 * So the server carries both and picks by SNI. `FTP_TLS_HOSTS` is the list, in
 * preference order, and each entry `<host>` is read as `<FTP_TLS_DIR>/<host>.crt`
 * and `.key` - the layout the deploy stages, and Caddy's own naming. The FIRST
 * one that loads is also the default, for a client that sends no SNI at all.
 *
 * A name whose files are missing is skipped with a warning rather than taking
 * the server down: one broken certificate must not cost the board the other.
 */
function tlsHostMaterial(env: FtpEnv): Record<string, { cert: Buffer; key: Buffer }> {
  const dir = env.FTP_TLS_DIR;
  const hosts = (env.FTP_TLS_HOSTS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (!dir || hosts.length === 0) return {};

  const contexts: Record<string, { cert: Buffer; key: Buffer }> = {};
  for (const host of hosts) {
    try {
      contexts[host] = {
        cert: fs.readFileSync(path.join(dir, `${host}.crt`)),
        key: fs.readFileSync(path.join(dir, `${host}.key`)),
      };
    } catch (error) {
      console.warn(`[FTP] No usable certificate for ${host}, that name will not serve TLS: ${
        error instanceof Error ? error.message : String(error)}`);
    }
  }
  return contexts;
}

/**
 * Start the server when the board wants one. Returns null when it does not,
 * which is not a failure and must not read like one.
 */
export async function startFtpServer(
  config: FtpConfig | null,
  deps: FtpDeps,
  env: FtpEnv = process.env as FtpEnv
): Promise<FtpServer | null> {
  if (!ftpEnabled(config)) return null;

  const port = ftpPortFrom(config, env);
  const allowPlaintext = ftpAllowsPlaintext(env);
  if (allowPlaintext) {
    // Loud, every boot, and never only in a config file: a board can be left
    // like this by accident, and the cost is every FTP password in the clear.
    console.warn(
      '[FTP] FTP_ALLOW_PLAINTEXT is set - a caller may log in WITHOUT TLS and ' +
        'his password crosses the network in clear text. Unset it once the ' +
        'clients can use AUTH TLS.'
    );
  }
  // Per-name certificates first: the board answers to two names and a caller
  // dialling either must be served the one his client will accept. The single
  // FTP_TLS_CERT/KEY pair stays as the fallback and as the default context.
  const hostCerts = tlsHostMaterial(env);
  const named = Object.keys(hostCerts);
  const fallback = tlsMaterial(env);
  const defaultCert = named.length > 0 ? hostCerts[named[0]] : fallback;
  if (named.length > 0) {
    console.log(`[FTP] TLS certificates loaded for ${named.join(', ')} (default ${named[0]})`);
  }

  // PASV needs two things the container cannot work out for itself: a port
  // range Docker publishes, and the PUBLIC address to send the caller back to.
  // The range comes from the sysop's own FTPDATAPORT unless the environment
  // overrides it; the address has no default worth guessing, and without it
  // PASV refuses with 425 rather than advertising a bridge address nobody can
  // reach.
  const passivePorts = parsePortRange(env.FTP_PASSIVE_PORTS ?? config?.ftp_data_ports ?? null);
  const passiveAddress = (env.FTP_PASSIVE_ADDRESS ?? '').trim() || null;
  if (passivePorts && !passiveAddress) {
    console.warn(
      '[FTP] FTP_PASSIVE_ADDRESS is not set, so PASV cannot advertise a reachable ' +
        'address and directory listings will answer 425. Set it to the public IP.'
    );
  }

  const server = new FtpServer(
    {
      port,
      host: env.FTP_HOST || '0.0.0.0',
      tls: defaultCert,
      tlsHosts: hostCerts,
      allowPlaintext,
      passivePorts,
      passiveAddress,
    },
    deps
  );
  await server.start();
  return server;
}
