/**
 * Standalone diagnostic: bring up the RexxMast singleton in isolation
 * with AREXX_TRACE=1 and dump the first 100 library calls. Lets us see
 * exactly what env feature RexxMast wedges on without booting the full
 * BBS server (which is long-running and can't be used for one-shot
 * diagnosis under the project's foreground-only rule).
 *
 * Usage from web/backend:
 *   AREXX_TRACE=1 SKIP_DB_INIT=1 BBS_DATA_DIR=/path/to/repo \
 *     npx tsx ../../dev/scripts/arexx-trace.ts
 */

import * as path from 'path';

process.env.AREXX_TRACE = process.env.AREXX_TRACE || '1';
process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../..');
process.env.SKIP_DB_INIT = '1';

import { config } from '../../web/backend/src/config.js';
import { rexxMastService } from '../../web/backend/src/services/arexx/rexxmast-service.js';
import { _resetNativeAREXXDetectionCache } from '../../web/backend/src/services/arexx/native-engine.js';

async function main() {
  config.set('dataDir', process.env.BBS_DATA_DIR);
  _resetNativeAREXXDetectionCache();
  rexxMastService._reset();

  console.log('[arexx-trace] dataDir =', config.get('dataDir'));
  const ok = await rexxMastService.start();
  console.log('[arexx-trace] start() ->', ok);
  if (!ok) {
    console.log('[arexx-trace] status:', rexxMastService.getStatus());
    process.exit(1);
  }

  const ready = await rexxMastService.runUntilReady(5_000_000);
  console.log('[arexx-trace] runUntilReady ->', ready);
  console.log('[arexx-trace] status:', rexxMastService.getStatus());
  if (!ready) {
    process.exit(2);
  }

  // Phase 7 — actually dispatch a script and observe what RexxMast
  // does. The trampoline + LoadSeg overrides should now spawn rexxc
  // and run the script there.
  console.log('\n[arexx-trace] === Dispatching test script ===');
  const result = await rexxMastService.executeRexxScript(
    'RETURN 0',
    [],
    { output: [] },
  );
  console.log('[arexx-trace] script result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 3);
}

main().catch(err => {
  console.error('[arexx-trace] fatal:', err);
  process.exit(99);
});
