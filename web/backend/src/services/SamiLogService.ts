import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';

const baseDir = config.get('dataDir');
const storePath = path.join(baseDir, 'S', 'SAmiLog.Store');
const samplePath = path.join(baseDir, 'Utils', 'samilog', 'SAmiLog.Store');
const STORE_SIZE_BYTES = 3638;

/**
 * Ensure that S:SAmiLog.Store exists so legacy 68k doors have data to read.
 * We copy the bundled sample store the first time the backend boots if the
 * real file has not been created by SAmiLog yet.
 */
function ensureStoreExists(): void {
  try {
    if (fs.existsSync(storePath)) {
      return;
    }

    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    if (fs.existsSync(samplePath)) {
      fs.copyFileSync(samplePath, storePath);
      console.log(`[SamiLog] Seeded storage file from ${samplePath}`);
      return;
    }

    // Create an empty placeholder so doors do not crash if the sample is missing
    const placeholder = Buffer.alloc(STORE_SIZE_BYTES, 0);
    placeholder.write('*SALv002', 0, 'latin1');
    fs.writeFileSync(storePath, placeholder);
    console.warn('[SamiLog] Sample store missing – created blank placeholder');
  } catch (error) {
    console.error('[SamiLog] Failed to prepare SAmiLog.Store:', error);
  }
}

ensureStoreExists();

/**
 * Triggered at startup/login to guarantee the storage file exists.
 * Actual updates are handled by the 68K SAmiLog binary via SamiLogRunner.
 */
export async function triggerSamiLogRefresh(): Promise<void> {
  ensureStoreExists();
}
