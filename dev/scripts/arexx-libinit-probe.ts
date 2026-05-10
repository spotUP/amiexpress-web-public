/**
 * Diagnostic for native AREXX dispatch wedge.
 *
 * Boots rexxMastService, calls runLibInit, then dumps the rexxsyslib
 * RxsLib struct fields that the daemon's dispatch arm depends on:
 *   - rl_LibList   (libBase + 0xB8) — function-library list
 *   - rl_TaskList  (libBase + 0xA8)
 *   - rl_MsgList   (libBase + 0xD8)
 *   - rl_PgmList   (libBase + 0xE8)
 *   - rl_ClipList  (libBase + 0xC8)
 *   - rl_RexxPort  (libBase + 0x80)
 *
 * For an empty NewList'd MinList:
 *   mlh_Head     (offset 0) = listAddr + 4   (points to mlh_Tail)
 *   mlh_Tail     (offset 4) = 0
 *   mlh_TailPred (offset 8) = listAddr       (points to mlh_Head)
 *
 * Anything else means LibInit didn't initialize that list.
 *
 * Usage from web/backend:
 *   SKIP_DB_INIT=1 BBS_DATA_DIR=/path/to/repo \
 *     npx tsx ../../dev/scripts/arexx-libinit-probe.ts
 */

import * as path from 'path';

process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../..');
process.env.SKIP_DB_INIT = '1';

import { config } from '../../web/backend/src/config';
import { rexxMastService } from '../../web/backend/src/services/arexx/rexxmast-service';
import { _resetNativeAREXXDetectionCache } from '../../web/backend/src/services/arexx/native-engine';

interface ListProbe {
  name: string;
  offset: number;
}

const LISTS: ListProbe[] = [
  { name: 'rl_RexxPort+mp_MsgList', offset: 0x80 + 0x14 }, // mp_MsgList inside RexxPort
  { name: 'rl_TaskList',  offset: 0xA8 },
  { name: 'rl_LibList',   offset: 0xB8 },
  { name: 'rl_ClipList',  offset: 0xC8 },
  { name: 'rl_MsgList',   offset: 0xD8 },
  { name: 'rl_PgmList',   offset: 0xE8 },
];

const SCALAR_FIELDS: { name: string; offset: number; size: number }[] = [
  { name: 'rl_Flags',     offset: 0x22, size: 1 },
  { name: 'rl_Shadow',    offset: 0x23, size: 1 },
  { name: 'rl_SysBase',   offset: 0x24, size: 4 },
  { name: 'rl_DOSBase',   offset: 0x28, size: 4 },
  { name: 'rl_NULL',      offset: 0x40, size: 4 },
  { name: 'rl_FALSE',     offset: 0x44, size: 4 },
  { name: 'rl_TRUE',      offset: 0x48, size: 4 },
  { name: 'rl_REXX',      offset: 0x4C, size: 4 },
  { name: 'rl_COMMAND',   offset: 0x50, size: 4 },
  { name: 'rl_TraceFH',   offset: 0xA4, size: 4 },
  { name: 'rl_NumTask',   offset: 0xB6, size: 2 },
  { name: 'rl_NumLib',    offset: 0xC6, size: 2 },
  { name: 'rl_NumClip',   offset: 0xD6, size: 2 },
  { name: 'rl_NumMsg',    offset: 0xE6, size: 2 },
  { name: 'rl_NumPgm',    offset: 0xF6, size: 2 },
];

function classifyList(emu: any, listAddr: number): string {
  const head     = emu.readMemory32(listAddr + 0) >>> 0;
  const tail     = emu.readMemory32(listAddr + 4) >>> 0;
  const tailPred = emu.readMemory32(listAddr + 8) >>> 0;
  const expectedHead     = (listAddr + 4) >>> 0;
  const expectedTailPred = listAddr >>> 0;

  const hex = (v: number) => '0x' + v.toString(16).padStart(8, '0');
  const detail =
    `Head=${hex(head)} Tail=${hex(tail)} TailPred=${hex(tailPred)}`;

  if (head === 0 && tail === 0 && tailPred === 0) {
    return `ZEROED            (LibInit did not NewList) — ${detail}`;
  }
  if (head === expectedHead && tail === 0 && tailPred === expectedTailPred) {
    return `EMPTY-INITIALIZED (NewList semantics OK)    — ${detail}`;
  }
  if (head !== 0 && tail === 0 && tailPred !== 0) {
    return `POPULATED         (has list members)         — ${detail}`;
  }
  return `MALFORMED         (does not match any pattern) — ${detail}`;
}

async function main() {
  config.set('dataDir', process.env.BBS_DATA_DIR);
  _resetNativeAREXXDetectionCache();
  rexxMastService._reset();

  console.log('[probe] dataDir =', config.get('dataDir'));
  const ok = await rexxMastService.start();
  console.log('[probe] start() ->', ok);
  if (!ok) {
    console.log('[probe] status:', rexxMastService.getStatus());
    process.exit(1);
  }

  const status = rexxMastService.getStatus();
  const libBase = status.rexxSysLibBase >>> 0;
  console.log('[probe] rexxSysLibBase =', '0x' + libBase.toString(16));

  // Reach into the service for the emulator handle. The probe is a
  // dev script, not production code — direct access is fine here.
  const emu = (rexxMastService as any).emulator;
  if (!emu) {
    console.error('[probe] emulator handle missing post-start');
    process.exit(2);
  }

  console.log('\n=== RxsLib LIST FIELDS (post-LibInit, pre-runUntilReady) ===');
  for (const list of LISTS) {
    const addr = (libBase + list.offset) >>> 0;
    const status = classifyList(emu, addr);
    console.log(
      `  ${list.name.padEnd(28)} @ 0x${addr.toString(16)}  ${status}`,
    );
  }

  console.log('\n=== RxsLib SCALAR FIELDS ===');
  for (const f of SCALAR_FIELDS) {
    const addr = (libBase + f.offset) >>> 0;
    const v =
      f.size === 1 ? emu.readMemory(addr) & 0xff :
      f.size === 2 ? emu.readMemory16(addr) & 0xffff :
                     emu.readMemory32(addr) >>> 0;
    const hex = '0x' + v.toString(16).padStart(f.size * 2, '0');
    console.log(`  ${f.name.padEnd(20)} @ 0x${addr.toString(16)}  ${hex}`);
  }

  // Run the daemon to ready, then re-probe — this surfaces any state
  // the daemon initializes itself (vs what LibInit does).
  console.log('\n=== RUNNING DAEMON TO READY ===');
  const ready = await rexxMastService.runUntilReady(5_000_000);
  console.log('[probe] runUntilReady ->', ready);

  console.log('\n=== RxsLib LIST FIELDS (post-runUntilReady) ===');
  for (const list of LISTS) {
    const addr = (libBase + list.offset) >>> 0;
    const status = classifyList(emu, addr);
    console.log(
      `  ${list.name.padEnd(28)} @ 0x${addr.toString(16)}  ${status}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[probe] fatal:', err);
  process.exit(99);
});
