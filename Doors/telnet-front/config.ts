/**
 * What the login screen says about this board.
 *
 * Two things a sysop cannot otherwise set, both wrong on this board until
 * they could:
 *
 *   - the ADDRESS. With BBS_IP unset the door walked the machine's network
 *     interfaces and printed the first non-internal IPv4 it found - inside a
 *     container that is 172.18.0.2, a private address on a docker bridge that
 *     nobody outside can dial. Every user saw it.
 *   - the NODE COUNT. MAX_NODES is unset in the container, so the screen
 *     listed 8 nodes on a board whose own bbsConfig.info says 32.
 *
 * Layered lowest first: the defaults here, the environment variables the door
 * has always read, then what the sysop set in the admin. Only keys actually
 * set come from the last layer, so a declared default cannot overwrite an
 * environment a board is deliberately using.
 */

import * as os from 'os';
// The narrow subpath, not the package root: reading a JSON file has no
// business loading the SDK's audio engine.
import { readDoorSettingOverrides } from '@amiexpress/bbs-door-sdk/settings';

export interface FrontendConfig {
  /** Empty means "work it out from the machine". */
  bbsAddress: string;
  maxNodes: number;
}

/** AmiExpress allows at most 32 nodes - axconsts.e:43, MAXNODES=32. */
export const MAX_NODES_CEILING = 32;

export function defaultConfig(): FrontendConfig {
  return { bbsAddress: '', maxNodes: 8 };
}

/** The machine's first non-internal IPv4, which is a last resort, not an answer. */
export function firstExternalIPv4(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string {
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name] ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

export function loadConfig(
  startDir: string,
  env: NodeJS.ProcessEnv = process.env,
): FrontendConfig {
  const config = defaultConfig();

  if (env.BBS_IP) config.bbsAddress = env.BBS_IP;
  if (env.MAX_NODES) {
    const fromEnv = parseInt(env.MAX_NODES, 10);
    if (Number.isFinite(fromEnv)) config.maxNodes = fromEnv;
  }

  const overrides = readDoorSettingOverrides(startDir);
  if (typeof overrides.bbsAddress === 'string' && overrides.bbsAddress !== '') {
    config.bbsAddress = overrides.bbsAddress;
  }
  if (typeof overrides.maxNodes === 'number') config.maxNodes = overrides.maxNodes;

  config.maxNodes = Math.min(MAX_NODES_CEILING, Math.max(1, Math.round(config.maxNodes)));
  return config;
}

/** What to print. Falls back to the machine only when nobody has said. */
export function boardAddress(config: FrontendConfig): string {
  return config.bbsAddress !== '' ? config.bbsAddress : firstExternalIPv4();
}
