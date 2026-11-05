/**
 * End-to-end AREXX smoke test: bring up RexxMast, send a minimal
 * script as a RexxMsg, observe what the daemon does. Validates the
 * host-port round trip in the singleton emulator.
 *
 * Usage from web/backend:
 *   AREXX_TRACE=1 SKIP_DB_INIT=1 BBS_DATA_DIR=~/Code/AmiExpress/amiexpress-web \
 *     npx tsx ../../dev/scripts/arexx-smoke.ts
 */

import * as path from 'path';

process.env.AREXX_TRACE = process.env.AREXX_TRACE || '1';
process.env.BBS_DATA_DIR = boardRoot();
process.env.SKIP_DB_INIT = '1';

import { config } from '../../web/backend/src/config.js';
import { rexxMastService } from '../../web/backend/src/services/arexx/rexxmast-service.js';
import { _resetNativeAREXXDetectionCache } from '../../web/backend/src/services/arexx/native-engine.js';
import { boardRoot } from '../../web/backend/src/utils/board-root.util';

async function main() {
  config.set('dataDir', process.env.BBS_DATA_DIR);
  _resetNativeAREXXDetectionCache();
  rexxMastService._reset();

  console.log('[smoke] dataDir =', config.get('dataDir'));
  const ok = await rexxMastService.start();
  if (!ok) {
    console.log('[smoke] start() failed:', rexxMastService.getStatus());
    process.exit(1);
  }
  const ready = await rexxMastService.runUntilReady(5_000_000);
  if (!ready) {
    console.log('[smoke] runUntilReady -> false:', rexxMastService.getStatus().lastError);
    process.exit(2);
  }
  console.log('[smoke] daemon READY — sending minimal script');

  // The simplest possible AREXX script: literal RETURN 0. RexxMast
  // dispatches RXCOMM messages to a fresh rexxc interpreter task; the
  // interpreter parses + runs + replies. We're testing what the
  // daemon does when it gets the message — even a partial round-trip
  // (daemon picks up msg → tries to spawn interpreter → fails or
  // succeeds) tells us what's wired and what's not.
  const ctx: any = { output: [] };
  const result = await rexxMastService.executeRexxScript(
    'RETURN 0',
    [],
    ctx,
  );
  console.log('[smoke] executeRexxScript result:', JSON.stringify(result, null, 2));
  console.log('[smoke] ctx.output =', ctx.output);
  console.log('[smoke] final status:', rexxMastService.getStatus());
  process.exit(result.success ? 0 : 3);
}

main().catch(err => {
  console.error('[smoke] fatal:', err);
  process.exit(99);
});
