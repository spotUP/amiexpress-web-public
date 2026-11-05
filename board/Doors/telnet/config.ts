/**
 * The BBSes this door can dial, and where that list lives.
 *
 * `Doors/telnet/telnetdoor.cfg`, which is what the door's own empty menu tells
 * a sysop to create. It used to be read from `process.cwd()` plus that path,
 * and the backend's cwd on the board is /app/web/backend - so the file a sysop
 * created by following that instruction exactly was never opened, with no
 * error to explain the empty menu.
 *
 * The list stays a file rather than becoming declared settings: a manifest
 * declares fields, and this is a list of hosts with per-host logins.
 */

import * as fs from 'fs';
import * as path from 'path';
// The narrow subpath, not the package root: this needs one path helper, not
// the SDK's audio engine.
import { resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';

export const CONFIG_FILE = 'telnetdoor.cfg';

export interface TelnetConfig {
  serverHost: string;
  telnetPort: number;
  usernamePrompt?: string;
  passwordPrompt?: string;
  username?: string;
  password?: string;
  autoLogin?: boolean;
}

/**
 * Load telnet configuration
 */
export function loadConfig(startDir: string = __dirname): TelnetConfig[] {
  // The door's own directory, not the process's. The backend's cwd on the
  // board is /app/web/backend, so cwd + Doors/telnet/telnetdoor.cfg named a
  // path that has never existed - a sysop who followed the door's own
  // instruction and created the file got the empty menu anyway. __dirname is
  // this directory in development and dist/ in production, so it is resolved.
  const configPath = path.join(resolveDoorRoot(startDir), CONFIG_FILE);
  const configs: TelnetConfig[] = [];

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const lines = fileContent.split('\n');
      let currentConfig: Partial<TelnetConfig> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) {
          continue;
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          if (currentConfig.serverHost) {
            configs.push({
              serverHost: currentConfig.serverHost,
              telnetPort: currentConfig.telnetPort || 23,
              usernamePrompt: currentConfig.usernamePrompt,
              passwordPrompt: currentConfig.passwordPrompt,
              username: currentConfig.username,
              password: currentConfig.password,
              autoLogin: currentConfig.autoLogin !== false
            });
          }
          currentConfig = {};
          continue;
        }

        if (!trimmed.includes('=')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        const upperKey = key.trim().toUpperCase();

        switch (upperKey) {
          case 'SERVERHOST':
            currentConfig.serverHost = value;
            break;
          case 'TELNETPORT':
            currentConfig.telnetPort = parseInt(value) || 23;
            break;
          case 'USERNAMEPROMPT':
            currentConfig.usernamePrompt = value;
            break;
          case 'PASSWORDPROMPT':
            currentConfig.passwordPrompt = value;
            break;
          case 'USERNAME':
            currentConfig.username = value;
            break;
          case 'PASSWORD':
            currentConfig.password = value;
            break;
          case 'AUTOLOGIN':
            currentConfig.autoLogin = value.toUpperCase() === 'YES' || value === '1';
            break;
        }
      }

      if (currentConfig.serverHost) {
        configs.push({
          serverHost: currentConfig.serverHost,
          telnetPort: currentConfig.telnetPort || 23,
          usernamePrompt: currentConfig.usernamePrompt,
          passwordPrompt: currentConfig.passwordPrompt,
          username: currentConfig.username,
          password: currentConfig.password,
          autoLogin: currentConfig.autoLogin !== false
        });
      }
    }
  } catch (err) {
    console.error('[TelnetConnect] Error loading config:', err);
  }

  return configs;
}
