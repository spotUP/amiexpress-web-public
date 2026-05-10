// @ts-nocheck
/**
 * Regression: rexxsyslib's RxsLib counter fields (rl_NumTask,
 * rl_NumLib, rl_NumClip, rl_NumMsg, rl_NumPgm) and rl_TraceFH must
 * be zeroed after LibInit. The library's lib_Init initialises the
 * five MinList structures but leaves the trailing UWORD counts at
 * whatever AllocMem handed out. With one observed pattern
 * (rl_NumMsg = 0x5268) the daemon's dispatch arm dbra-loops 21K
 * times calling RemHead on its empty deferred-reply list, never
 * reaching GetMsg on the REXX port — daemon-driven dispatch hangs.
 *
 * Gated on the same binaries+ROM presence as native-arexx-smoke.
 * See thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const haveBinaries =
  fs.existsSync(path.join(repoRoot, 'System/RexxMast')) &&
  fs.existsSync(path.join(repoRoot, 'Libs/rexxsyslib.library')) &&
  (fs.existsSync(
    path.join(
      repoRoot,
      'data/amiga-roms',
      'Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom',
    ),
  ) || fs.existsSync(path.join(repoRoot, 'data/amiga-roms/aros-rom.bin')));

const describeIf = haveBinaries ? describe : describe.skip;

describeIf('rexxsyslib RxsLib counter fields zeroed post-LibInit', () => {
  let rexxMastService: any;
  let _resetNativeAREXXDetectionCache: any;
  let emu: any;
  let libBase: number;

  beforeAll(async () => {
    process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || repoRoot;
    process.env.SKIP_DB_INIT = '1';
    const { config } = require('../../src/config');
    config.set('dataDir', process.env.BBS_DATA_DIR);
    ({ rexxMastService } = require('../../src/services/arexx/rexxmast-service'));
    ({ _resetNativeAREXXDetectionCache } = require('../../src/services/arexx/native-engine'));
    _resetNativeAREXXDetectionCache();
    rexxMastService._reset();
    const ok = await rexxMastService.start();
    if (!ok) {
      throw new Error(`rexxMastService.start() failed: ${rexxMastService.getStatus().lastError}`);
    }
    emu = rexxMastService.emulator;
    libBase = rexxMastService.getStatus().rexxSysLibBase >>> 0;
  }, 30_000);

  afterAll(() => {
    try { rexxMastService._reset?.(); } catch { /* tolerate dirty teardown */ }
  });

  test('rl_NumTask (libBase + 0xB6) is zero', () => {
    expect(emu.readMemory16(libBase + 0xB6) & 0xffff).toBe(0);
  });

  test('rl_NumLib (libBase + 0xC6) is zero', () => {
    expect(emu.readMemory16(libBase + 0xC6) & 0xffff).toBe(0);
  });

  test('rl_NumClip (libBase + 0xD6) is zero', () => {
    expect(emu.readMemory16(libBase + 0xD6) & 0xffff).toBe(0);
  });

  test('rl_NumMsg (libBase + 0xE6) is zero — load-bearing for daemon dispatch', () => {
    // This is the field that drives the daemon's deferred-reply
    // dbra loop. Garbage here = thousands of spurious RemHead calls
    // before the daemon reaches its real GetMsg(REXX port).
    expect(emu.readMemory16(libBase + 0xE6) & 0xffff).toBe(0);
  });

  test('rl_NumPgm (libBase + 0xF6) is zero', () => {
    expect(emu.readMemory16(libBase + 0xF6) & 0xffff).toBe(0);
  });

  test('rl_TraceFH (libBase + 0xA4) is zero', () => {
    expect(emu.readMemory32(libBase + 0xA4) >>> 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Daemon task-spawn fields (libBase + 0x64..0x70)
  // The daemon's RXCOMM handler at file 0x6A4 does:
  //   movem.l 0x64(a5), d1-d4   ; load name/pri/seg/stack
  //   jsr -0x8a(a6)              ; dos.library CreateProc
  // With rl_TaskSeg=0 the CreateProc returns NULL, daemon hits the
  // error path at file 0x73A. populateTaskSpawnFields() loads rexxc
  // via LoadSeg and stamps the four fields.
  // -------------------------------------------------------------------------

  test('rl_TaskName (libBase + 0x64) points at a string', () => {
    const ptr = emu.readMemory32(libBase + 0x64) >>> 0;
    expect(ptr).not.toBe(0);
    // Should resolve to "rexx" (4 chars + NUL).
    const chars: string[] = [];
    for (let i = 0; i < 4; i++) {
      chars.push(String.fromCharCode(emu.readMemory(ptr + i) & 0xff));
    }
    expect(chars.join('')).toBe('rexx');
    expect(emu.readMemory(ptr + 4) & 0xff).toBe(0);
  });

  test('rl_TaskPri (libBase + 0x68) is zero', () => {
    expect(emu.readMemory32(libBase + 0x68) >>> 0).toBe(0);
  });

  test('rl_TaskSeg (libBase + 0x6C) is a non-zero BPTR — load-bearing for CreateProc', () => {
    // BPTR = address >> 2. If this is 0 the daemon's spawn-rexxc
    // subroutine returns 3 and the dispatch handler replies with an
    // error code instead of running the script.
    const bptr = emu.readMemory32(libBase + 0x6C) >>> 0;
    expect(bptr).not.toBe(0);
    // Header (size, next-BPTR) sits at (bptr << 2). The size field
    // should be a sane longword count for a 33KB+ binary.
    const segHeader = (bptr << 2) >>> 0;
    const sizeLongs = emu.readMemory32(segHeader) >>> 0;
    expect(sizeLongs).toBeGreaterThan(0);
    expect(sizeLongs).toBeLessThan(0x100000); // <1M longwords = <4MB
  });

  test('rl_StackSize (libBase + 0x70) is 8192', () => {
    expect(emu.readMemory32(libBase + 0x70) >>> 0).toBe(8192);
  });
});
