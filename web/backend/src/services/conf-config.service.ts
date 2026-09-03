import * as fs from 'fs';
import { readTooltypeMap } from '../utils/info-file.util';
import * as path from 'path';

export interface ConfConfigEntry {
  name: string;
  location: string;
}

export interface ConfConfigData {
  confCount: number;
  entries: ConfConfigEntry[];
}

/**
 * Memo of the last parse per BBS root, keyed on ConfConfig.info's mtime+size.
 * A file-scan door polls DT_NAME on every listing, and each poll used to
 * re-open and re-parse the icon; the sysop's edits still land because any
 * write moves the mtime.
 */
const confConfigCache = new Map<string, { stamp: string; data: ConfConfigData | null }>();

/**
 * Read ConfConfig.info tooltypes to determine conference count and names.
 * express.e: confNames/confDirs are populated from ConfConfig (NCONFS, NAME.n, LOCATION.n).
 */
export function loadConfConfig(bbsRoot: string): ConfConfigData | null {
  try {
    const confConfigPath = path.join(bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      confConfigCache.delete(bbsRoot);
      return null;
    }

    const st = fs.statSync(confConfigPath);
    const stamp = `${st.mtimeMs}:${st.size}`;
    const cached = confConfigCache.get(bbsRoot);
    if (cached && cached.stamp === stamp) {
      return cached.data;
    }

    const toolTypes = readTooltypeMap(confConfigPath);

    const countStr = toolTypes.get('NCONFS');
    const confCount = countStr ? parseInt(countStr, 10) || 0 : 0;
    if (!confCount) {
      confConfigCache.set(bbsRoot, { stamp, data: null });
      return null;
    }

    const entries: ConfConfigEntry[] = [];
    for (let i = 1; i <= confCount; i++) {
      const name = toolTypes.get(`NAME.${i}`) || `Conference ${i}`;
      const location = toolTypes.get(`LOCATION.${i}`) || '';
      entries.push({ name, location });
    }

    const data: ConfConfigData = { confCount, entries };
    confConfigCache.set(bbsRoot, { stamp, data });
    return data;
  } catch (error) {
console.error('[ConfConfig] Failed to read ConfConfig.info:', error);
    return null;
  }
}
