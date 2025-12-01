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
  // AmiExpress defaults show bulletins unless explicitly disabled
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

    return result;
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
