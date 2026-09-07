/**
 * Whether this board runs an FTP server, and on what.
 *
 * A function rather than a block inside `index.ts` so the rule can be driven
 * by a test: "started only when the sysop turned it on" is exactly the kind of
 * thing that is easy to get wrong and impossible to notice, because a server
 * that never starts looks identical to one nobody has tried to use.
 */
import * as fs from 'fs';

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
  const server = new FtpServer(
    { port, host: env.FTP_HOST || '0.0.0.0', tls: tlsMaterial(env) },
    deps
  );
  await server.start();
  return server;
}
