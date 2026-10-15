/**
 * HLE-bridge probe. Boots rexxMastService, instruments the CreateProc
 * override + phantom port + signal flow, then calls executeRexxScript
 * once and reports what happened.
 *
 * Run from repo root:
 *   SKIP_DB_INIT=1 BBS_DATA_DIR=$PWD npx tsx dev/scripts/arexx-hle-probe.ts
 */

import * as path from 'path';
process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../..');
process.env.SKIP_DB_INIT = '1';

import { config } from '../../web/backend/src/config';
import { rexxMastService } from '../../web/backend/src/services/arexx/rexxmast-service';
import { _resetNativeAREXXDetectionCache } from '../../web/backend/src/services/arexx/native-engine';

function log(...args: any[]) { console.log('[probe]', ...args); }

async function main() {
  config.set('dataDir', process.env.BBS_DATA_DIR);
  _resetNativeAREXXDetectionCache();
  rexxMastService._reset();

  log('starting service…');
  if (!(await rexxMastService.start())) {
    console.error('start failed:', rexxMastService.getStatus().lastError);
    process.exit(1);
  }
  if (!(await rexxMastService.runUntilReady(5_000_000))) {
    console.error('runUntilReady failed:', rexxMastService.getStatus());
    process.exit(2);
  }
  const svc: any = rexxMastService;
  const exec = svc.execLibrary;
  const status = rexxMastService.getStatus();
  log('READY. status =', status);
  log('phantom port =', '0x' + svc.phantomRexxcPort.toString(16));
  log('phantom task =', '0x' + svc.phantomRexxcTaskBase.toString(16));
  log('rexxc BPTR  =', '0x' + svc.rexxcSegListBptr.toString(16));
  log('rexxMastTaskAddr =', '0x' + svc.rexxMastTaskAddr.toString(16));
  log('exec.currentTask.address =', '0x' + exec.currentTask.address.toString(16));

  // AREXX port details
  const findPort = (name: string): number =>
    typeof exec.findPortByName === 'function'
      ? exec.findPortByName(name) >>> 0
      : (exec.publicPorts?.get?.(name.toLowerCase()) >>> 0) || 0;
  const rexxPort = findPort('AREXX') || findPort('REXX');
  const emu = svc.emulator;
  const sigBit = emu.readMemory(rexxPort + 15) & 0xff;
  const sigTask = emu.readMemory32(rexxPort + 16) >>> 0;
  const flags = emu.readMemory(rexxPort + 14) & 0xff;
  log('AREXX port=0x' + rexxPort.toString(16), 'sigBit=' + sigBit, 'sigTask=0x' + sigTask.toString(16), 'flags=0x' + flags.toString(16));

  // Wrap the CreateProc override to log every call
  const origCreateProc = svc.dosLibrary.createProcOverride;
  svc.dosLibrary.createProcOverride = (segListBptr: number, namePtr: number, pri: number, stack: number): number => {
    const a2 = emu.getRegister(10) >>> 0;
    log(`>>> CreateProc(seg=0x${segListBptr.toString(16)}, name=0x${namePtr.toString(16)}, pri=${pri}, stack=${stack}) A2=0x${a2.toString(16)}`);
    const r = origCreateProc.call(svc.dosLibrary, segListBptr, namePtr, pri, stack);
    log(`<<< CreateProc → 0x${r.toString(16)}`);
    return r;
  };

  log('executing RETURN 42 via executeRexxScript');
  const t0 = Date.now();
  const result = await rexxMastService.executeRexxScript('RETURN 42', [], { output: [] });
  log(`executeRexxScript returned in ${Date.now() - t0}ms:`, result);

  process.exit(0);
}

main().catch(e => { console.error('fatal:', e); process.exit(99); });
