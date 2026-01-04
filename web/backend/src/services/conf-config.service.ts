import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';

export interface ConfConfigEntry {
  name: string;
  location: string;
}

export interface ConfConfigData {
  confCount: number;
  entries: ConfConfigEntry[];
}

/**
 * Read ConfConfig.info tooltypes to determine conference count and names.
 * express.e: confNames/confDirs are populated from ConfConfig (NCONFS, NAME.n, LOCATION.n).
 */
export function loadConfConfig(bbsRoot: string): ConfConfigData | null {
  try {
    const confConfigPath = path.join(bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      return null;
    }

    const buffer = fs.readFileSync(confConfigPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    // Normalize keys to uppercase for lookups
    const toolTypes = new Map<string, string>();
    for (const [key, value] of parsed.toolTypes.entries()) {
      toolTypes.set(key.toUpperCase(), value);
    }

    const countStr = toolTypes.get('NCONFS');
    const confCount = countStr ? parseInt(countStr, 10) || 0 : 0;
    if (!confCount) {
      return null;
    }

    const entries: ConfConfigEntry[] = [];
    for (let i = 1; i <= confCount; i++) {
      const name = toolTypes.get(`NAME.${i}`) || `Conference ${i}`;
      const location = toolTypes.get(`LOCATION.${i}`) || '';
      entries.push({ name, location });
    }

    return { confCount, entries };
  } catch (error) {
console.error('[ConfConfig] Failed to read ConfConfig.info:', error);
    return null;
  }
}
