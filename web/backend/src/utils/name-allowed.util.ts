/**
 * express.e:11234-11268 checkIfNameAllowed - one copy for sign-up (30163)
 * and W's LOGIN NAME (25910).
 */
import * as path from 'path';
import * as amigafs from './amigafs';
import { config } from '../config';
import { parseInfoFile } from './info-file.util';

/**
 * Load banned names from NamesNotAllowed.info tooltypes (NAME.1, NAME.2, ...).
 * express.e:11254-11266 — TOOLTYPE_NAMESNOTALLOWED, NAME.n tooltype entries.
 */
function loadBannedNames(): string[] {
  const banned: string[] = [];
  try {
    const baseDir = config.getConfig().dataDir;
    const candidates = [
      path.join(baseDir, 'NamesNotAllowed.info'),
      path.join(baseDir, '..', 'NamesNotAllowed.info')
    ];
    let infoPath: string | null = null;
    for (const p of candidates) {
      if (amigafs.existsSync(p)) {
        infoPath = p;
        break;
      }
    }
    if (!infoPath) return banned;
    const info = parseInfoFile(infoPath);
    for (const tt of info.tooltypes) {
      if (tt.commented) continue;
      if (/^NAME\.\d+$/i.test(tt.key) && tt.value) {
        banned.push(tt.value.toLowerCase());
      }
    }
  } catch (error) {
    console.warn('[NEW USER] Unable to load NamesNotAllowed.info:', error);
  }
  return banned;
}

/**
 * Check if a name is allowed (express.e:11234-11268 checkIfNameAllowed).
 * Returns null if allowed, or the rejection message string if disallowed.
 * Checks: empty, 'NEW', starts with 'ACS.', banned list.
 */
export function checkIfNameAllowed(name: string): string | null {
  const upper = name.toUpperCase();
  // express.e:11239-11241
  if (name === '') return 'Username not allowed!!';
  // express.e:11244-11246
  if (upper === 'NEW') return 'Username not allowed!!';
  // express.e:11249-11251
  if (upper.startsWith('ACS.')) return 'Username not allowed!!';
  // express.e:11254-11266 — banned names from NamesNotAllowed.info
  const banned = loadBannedNames();
  for (const b of banned) {
    if (b === upper.toLowerCase()) return 'Username not allowed!!';
  }
  return null;
}

