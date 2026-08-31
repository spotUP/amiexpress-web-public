/**
 * Where BBSLink's configuration comes from, and in what order.
 *
 * Three layers, lowest first:
 *
 *   1. the defaults in this file - what a board with nothing set up gets;
 *   2. `bbslink.cfg` - the file the 68K door read, kept working so a sysop
 *      who set the board up before the admin could edit doors loses nothing;
 *   3. `settings.json` - what the sysop set in the admin, and the only layer
 *      that can hold a secret the admin knows how to hide.
 *
 * Only keys the sysop actually SET come from layer 3
 * (`readDoorSettingOverrides`): a declared default arriving as a value would
 * quietly overwrite what bbslink.cfg says.
 *
 * The per-game door codes (LORD=lord and the thirty-odd others) stay in
 * bbslink.cfg. They are a map, not a fixed set of fields, and a manifest
 * cannot declare one.
 */

import * as fs from 'fs';
import * as path from 'path';
// The narrow subpath, not the package root: the root reaches the server
// bundle and its audio engine, and reading a JSON file has no business
// loading Tone.js.
import { readDoorSettingOverrides, resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';

export interface BBSLinkConfig {
  serverHost: string;
  httpPort: number;
  telnetPort: number;
  timeout: number;
  syscode: string;
  authcode: string;
  schemecode: string;
  doorcode?: string;
  [key: string]: string | number | undefined;
}

export const CONFIG_FILE = 'bbslink.cfg';

export function defaultConfig(): BBSLinkConfig {
  return {
    serverHost: 'games.bbslink.net',
    httpPort: 80,
    telnetPort: 23,
    timeout: 10,
    syscode: '',
    authcode: '',
    schemecode: '',
  };
}

/** Trim spaces from both ends of a string. */
function fullTrim(str: string): string {
  let result = str.trim();
  while (result.length > 0 && result[result.length - 1] === ' ') {
    result = result.substring(0, result.length - 1);
  }
  return result;
}

/** Apply one bbslink.cfg's text to a config. Kept separate so it can be tested. */
export function applyConfigText(text: string, config: BBSLinkConfig, doorCode?: string): void {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) continue;
    if (!trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const value = fullTrim(valueParts.join('='));
    const upperKey = fullTrim(key).toUpperCase();
    switch (upperKey) {
      case 'SERVERHOST': config.serverHost = value; break;
      case 'TELNETPORT': config.telnetPort = parseInt(value) || 23; break;
      case 'HTTPPORT': config.httpPort = parseInt(value) || 80; break;
      case 'TIMEOUT': config.timeout = parseInt(value) || 10; break;
      case 'SYSCODE': config.syscode = value; break;
      case 'AUTHCODE': config.authcode = value; break;
      case 'SCHEMECODE': config.schemecode = value; break;
      case 'DOORCODE': config.doorcode = value; break;
      default:
        if (doorCode && upperKey === doorCode.toUpperCase()) config.doorcode = value;
        break;
    }
  }
}

/** Read bbslink.cfg if it is there. A board with no file is not an error. */
export function applyConfigFile(configPath: string, config: BBSLinkConfig, doorCode?: string): void {
  try {
    if (!fs.existsSync(configPath)) return;
    applyConfigText(fs.readFileSync(configPath, 'utf-8'), config, doorCode);
  } catch (err) {
    console.error('[BBSLink] Error parsing config:', err);
  }
}

/** What the sysop set in the admin, over everything below it. */
export function applyDoorSettings(
  config: BBSLinkConfig,
  overrides: Record<string, string | number | boolean | undefined>,
): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') continue;
    config[key] = typeof value === 'boolean' ? String(value) : value;
  }
}

/**
 * The whole configuration, from wherever the door happens to be running.
 *
 * `startDir` is the door's `__dirname`, which is the door's own directory in
 * development and its `dist/` in production - the backend imports `index.ts`
 * in one and `dist/index.js` in the other. `resolveDoorRoot` finds the
 * directory the admin writes to, and bbslink.cfg is read from the same place;
 * before this, a production board looked for bbslink.cfg inside dist/, did not
 * find it, and the door died on "syscode/authcode/schemecode missing".
 */
export function loadConfig(startDir: string, doorCodeParam?: string): BBSLinkConfig {
  const root = resolveDoorRoot(startDir);
  const config = defaultConfig();
  applyConfigFile(path.join(root, CONFIG_FILE), config, doorCodeParam);
  applyDoorSettings(config, readDoorSettingOverrides(startDir));
  return config;
}
