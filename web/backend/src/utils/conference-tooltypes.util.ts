import { execSync } from 'child_process';
import * as fs from 'fs';
import * as amigafs from './amigafs';
import * as path from 'path';

import { config } from '../config';
import { db } from '../database';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';

export interface ConferenceToolFlags {
  forceNewscan: boolean;
  noNewscan: boolean;
  showNewFiles: boolean;
  noNewFiles: boolean;
  forceMenus: boolean;
  noBulls: boolean;
  noConfBulls: boolean;
  freeDownloads: boolean;
  // express.e:5013 / express.e:15269 — MENU_PROMPT tooltype overrides the standard menu prompt
  menuPrompt: string;
  // express.e:4078-4087 — CHECK_REALNAME tooltypes:
  //   USERNAME → require username on message TO: field (XIM data=2)
  //   REALNAME → require realname (XIM data=1)
  //   neither  → handle/alias OK (XIM data=0)
  // The per-msgbase form is `USERNAME.<n>` / `REALNAME.<n>`; we surface
  // those as keyed sets so the XIM handler can pick the right one for
  // the current message base.
  requireUsername: boolean;
  requireRealname: boolean;
  requireUsernameMsgBases: Set<number>;
  requireRealnameMsgBases: Set<number>;
}

const defaultFlags: ConferenceToolFlags = {
  forceNewscan: false,
  noNewscan: false,
  showNewFiles: false,
  noNewFiles: false,
  forceMenus: false,
  // AmiExpress defaults show bulletins unless explicitly disabled
  noBulls: false,
  noConfBulls: false,
  freeDownloads: false,
  menuPrompt: '',
  requireUsername: false,
  requireRealname: false,
  requireUsernameMsgBases: new Set<number>(),
  requireRealnameMsgBases: new Set<number>(),
};

const conferenceTooltypeCache = new Map<number, ConferenceToolFlags>();

function readFlagsFromDb(confNumber: number): Partial<ConferenceToolFlags> {
  try {
    const repo = db.getConfigRepository?.();
    if (!repo) {
      return {};
    }

    const confConfig = repo.getConferenceConfig(confNumber);
    if (!confConfig) {
      return {};
    }

    const result: Partial<ConferenceToolFlags> = {};
    if (confConfig.force_newscan) {
      result.forceNewscan = true;
    }
    if (confConfig.no_newscan) {
      result.noNewscan = true;
    }
    if (confConfig.show_new_files) {
      result.showNewFiles = true;
    }
    if (confConfig.no_new_files) {
      result.noNewFiles = true;
    }
    if ((confConfig as any).no_bulls) {
      result.noBulls = true;
    }
    if ((confConfig as any).no_conf_bulls) {
      result.noConfBulls = true;
    }
    if ((confConfig as any).free_downloads) {
      result.freeDownloads = true;
    }

    return result;
  } catch (error) {
console.error(`[ConferenceTooltypes] Error reading DB config for conference ${confNumber}:`, error);
    SysopDebugUtil.debug(
      null,
      null,
      'Conference Switching',
      `Failed to read DB config for conference ${confNumber}`,
      { error: error instanceof Error ? error.message : String(error), confNumber },
      DebugSeverity.WARNING
    );
    return {};
  }
}

function readFlagsFromIcon(confNumber: number): Partial<ConferenceToolFlags> {
  try {
    const baseDir = config.getConfig().dataDir;
    const iconPath = path.join(baseDir, `Conf${confNumber}.info`);

    if (!amigafs.existsSync(iconPath)) {
      return {};
    }

    const buffer = fs.readFileSync(iconPath);
    // flagSet holds boolean keys; tooltypeMap holds key=value pairs for string tooltypes
    const flagSet = new Set<string>();
    const tooltypeMap = new Map<string, string>();
    let currentString = '';

    for (let i = 0; i < buffer.length; i++) {
      const charCode = buffer[i];
      if (charCode >= 32 && charCode <= 126) {
        currentString += String.fromCharCode(charCode);
      } else {
        if (currentString.length >= 2) {
          const cleaned = currentString.replace(/^[^a-zA-Z0-9+(%#']+/g, '').trim();
          if (cleaned) {
            // Strip common AmiExpress prefixes
            let token = cleaned;
            if (token.startsWith('#') || token.startsWith('+') || token.startsWith("'")) {
              token = token.substring(1);
            }
            const eqIdx = token.indexOf('=');
            if (eqIdx > 0) {
              const key = token.substring(0, eqIdx).trim().toUpperCase();
              const val = token.substring(eqIdx + 1);
              if (key) {
                flagSet.add(key);
                tooltypeMap.set(key, val);
              }
            } else {
              const key = token.trim().toUpperCase();
              if (key) flagSet.add(key);
            }
          }
        }
        currentString = '';
      }
    }

    const result: Partial<ConferenceToolFlags> = {};
    if (flagSet.has('FORCE_NEWSCAN')) {
      result.forceNewscan = true;
    }
    if (flagSet.has('NO_NEWSCAN')) {
      result.noNewscan = true;
    }
    if (flagSet.has('SHOW_NEW_FILES')) {
      result.showNewFiles = true;
    }
    if (flagSet.has('NO_NEW_FILES')) {
      result.noNewFiles = true;
    }
    if (flagSet.has('FORCE_MENUS')) {
      result.forceMenus = true;
    }
    if (flagSet.has('NO_BULLS')) {
      result.noBulls = true;
    }
    if (flagSet.has('NO_CONF_BULLS')) {
      result.noConfBulls = true;
    }
    if (flagSet.has('FREEDOWNLOADS')) {
      result.freeDownloads = true;
    }
    // express.e:5013 / express.e:15269 — MENU_PROMPT=<string> overrides the standard menu prompt
    if (tooltypeMap.has('MENU_PROMPT')) {
      result.menuPrompt = tooltypeMap.get('MENU_PROMPT')!;
    }

    // express.e:4081-4084 — USERNAME / REALNAME tooltypes (conf-wide, plus
    // per-msgbase variants USERNAME.<n> / REALNAME.<n>).
    if (flagSet.has('USERNAME')) result.requireUsername = true;
    if (flagSet.has('REALNAME')) result.requireRealname = true;
    const msgBaseUserSet = new Set<number>();
    const msgBaseRealSet = new Set<number>();
    for (const key of flagSet) {
      const usernameMatch = /^USERNAME\.(\d+)$/.exec(key);
      if (usernameMatch) {
        msgBaseUserSet.add(parseInt(usernameMatch[1]!, 10));
        continue;
      }
      const realnameMatch = /^REALNAME\.(\d+)$/.exec(key);
      if (realnameMatch) {
        msgBaseRealSet.add(parseInt(realnameMatch[1]!, 10));
      }
    }
    if (msgBaseUserSet.size > 0) result.requireUsernameMsgBases = msgBaseUserSet;
    if (msgBaseRealSet.size > 0) result.requireRealnameMsgBases = msgBaseRealSet;

    return result;
  } catch (error) {
console.error(`[ConferenceTooltypes] Error parsing Conf${confNumber}.info:`, error);
    SysopDebugUtil.debug(
      null,
      null,
      'Conference Switching',
      `Failed to parse Conf${confNumber}.info tooltypes`,
      { error: error instanceof Error ? error.message : String(error), confNumber },
      DebugSeverity.WARNING
    );
    return {};
  }
}

export function getConferenceToolFlags(confNumber: number): ConferenceToolFlags {
  if (conferenceTooltypeCache.has(confNumber)) {
    return conferenceTooltypeCache.get(confNumber)!;
  }

  const flags: ConferenceToolFlags = {
    ...defaultFlags,
    ...readFlagsFromDb(confNumber),
    ...readFlagsFromIcon(confNumber),
  };

  conferenceTooltypeCache.set(confNumber, flags);
  return flags;
}
