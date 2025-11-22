import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { db } from '../database';

export interface ConferenceToolFlags {
  forceNewscan: boolean;
  noNewscan: boolean;
  showNewFiles: boolean;
  noNewFiles: boolean;
  forceMenus: boolean;
  noBulls: boolean;
  noConfBulls: boolean;
  freeDownloads: boolean;
}

const defaultFlags: ConferenceToolFlags = {
  forceNewscan: false,
  noNewscan: false,
  showNewFiles: false,
  noNewFiles: false,
  forceMenus: false,
  noBulls: false,
  noConfBulls: false,
  freeDownloads: false,
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

    return {
      forceNewscan: Boolean(confConfig.force_newscan),
      noNewscan: Boolean(confConfig.no_newscan),
      showNewFiles: Boolean(confConfig.show_new_files),
      noNewFiles: Boolean(confConfig.no_new_files),
      noBulls: Boolean((confConfig as any).no_bulls),
      noConfBulls: Boolean((confConfig as any).no_conf_bulls),
      freeDownloads: Boolean((confConfig as any).free_downloads),
    };
  } catch (error) {
    console.error(`[ConferenceTooltypes] Error reading DB config for conference ${confNumber}:`, error);
    return {};
  }
}

function readFlagsFromIcon(confNumber: number): Partial<ConferenceToolFlags> {
  try {
    const baseDir = config.getConfig().dataDir;
    const iconPath = path.join(baseDir, `Conf${confNumber}.info`);

    if (!fs.existsSync(iconPath)) {
      return {};
    }

    const output = execSync(`strings "${iconPath}"`, { encoding: 'utf8' });
    const flagSet = new Set<string>();

    for (const rawLine of output.split('\n')) {
      const cleaned = rawLine.replace(/[^\x20-\x7E]/g, '').trim();
      if (!cleaned) {
        continue;
      }

      // Strip common AmiExpress prefixes
      let token = cleaned;
      if (token.startsWith('#') || token.startsWith('+') || token.startsWith("'")) {
        token = token.substring(1);
      }

      const key = token.split('=')[0]?.trim().toUpperCase();
      if (key) {
        flagSet.add(key);
      }
    }

    return {
      forceNewscan: flagSet.has('FORCE_NEWSCAN'),
      noNewscan: flagSet.has('NO_NEWSCAN'),
      showNewFiles: flagSet.has('SHOW_NEW_FILES'),
      noNewFiles: flagSet.has('NO_NEW_FILES'),
      forceMenus: flagSet.has('FORCE_MENUS'),
      noBulls: flagSet.has('NO_BULLS'),
      noConfBulls: flagSet.has('NO_CONF_BULLS'),
      freeDownloads: flagSet.has('FREEDOWNLOADS'),
    };
  } catch (error) {
    console.error(`[ConferenceTooltypes] Error parsing Conf${confNumber}.info:`, error);
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
