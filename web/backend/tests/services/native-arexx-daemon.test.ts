// @ts-nocheck
/**
 * Daemon-driven dispatch test for the native AREXX path.
 *
 * Goes beyond the bridged smoke (`native-arexx-smoke.test.ts`) by
 * verifying the full HLE bridge:
 *
 *   1. populateTaskSpawnFields() loaded rexxc and recorded its BPTR.
 *   2. setupPhantomRexxcPort() wired the phantom port on start().
 *   3. executeRexxScript() drives the daemon through its WaitPort →
 *      GetMsg → action-dispatch → RXCOMM handler → CreateProc path,
 *      which routes through our HLE bridge in the CreateProc override.
 *
 * See thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md
 * for the full investigation that drove this design, and
 * thoughts/shared/handoffs/2026-05-11_arexx-daemon-hle-bridge.md for
 * the bridge plan that this test guards.
 *
 * Gated on real binaries + Kickstart ROM. On CI / fresh checkouts the
 * AREXX binaries are gitignored (Commodore-copyrighted), so this suite
 * skips cleanly. On a local dev machine with the binaries in place,
 * jest runs the daemon-driven assertions.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const rexxMastBin = path.join(repoRoot, 'System/RexxMast');
const rexxSysLib = path.join(repoRoot, 'Libs/rexxsyslib.library');
const rexxcBin = path.join(repoRoot, 'System/Rexxc/RXC');
const rexxcAlt = path.join(repoRoot, 'System/Rexxc/RX');
const kickRom = path.join(
  repoRoot,
  'data/amiga-roms',
  'Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom',
);
const arosRom = path.join(repoRoot, 'data/amiga-roms/aros-rom.bin');

const haveBinaries =
  fs.existsSync(rexxMastBin) &&
  fs.existsSync(rexxSysLib) &&
  (fs.existsSync(rexxcBin) || fs.existsSync(rexxcAlt)) &&
  (fs.existsSync(kickRom) || fs.existsSync(arosRom));

const describeIf = haveBinaries ? describe : describe.skip;

describeIf('native AREXX dispatch — daemon-driven HLE bridge', () => {
  let rexxMastService: any;
  let _resetNativeAREXXDetectionCache: any;

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
      throw new Error(
        `rexxMastService.start() returned false: ${rexxMastService.getStatus().lastError || 'unknown'}`,
      );
    }
    const ready = await rexxMastService.runUntilReady(5_000_000);
    if (!ready) {
      throw new Error(
        `runUntilReady failed: ${rexxMastService.getStatus().lastError || 'unknown'}`,
      );
    }
  }, 60_000);

  afterAll(() => {
    try { rexxMastService._reset?.(); } catch { /* tolerate dirty teardown */ }
  });

  test('start() populates the phantom rexxc port', () => {
    const phantom = rexxMastService._getPhantomRexxcPort();
    expect(phantom).toBeGreaterThan(0);
  });

  test('populateTaskSpawnFields() records the rexxc segList BPTR', () => {
    const bptr = rexxMastService._getRexxcSegListBptr();
    expect(bptr).toBeGreaterThan(0);
  });

  test('phantom port is reachable via execLibrary.putMsg + getMsg', () => {
    // Sanity-check the phantom port registration so a regression in
    // addPort wiring fails here before the harder full-dispatch test.
    const emu = rexxMastService._getEmulator();
    const exec = (rexxMastService as any).execLibrary;
    const phantom = rexxMastService._getPhantomRexxcPort();
    const probe = exec.allocMem(64, 0x10001);
    expect(probe).toBeGreaterThan(0);
    // Minimal Msg header: ln_Type at +8 = NT_MESSAGE (5).
    emu.writeMemory(probe + 8, 5);
    exec.putMsg(phantom, probe);
    const out = exec.getMsg(phantom) >>> 0;
    expect(out).toBe(probe >>> 0);
    try { exec.freeMem(probe, 64); } catch { /* best-effort */ }
  });

  test('executeRexxScript() round-trips RETURN 0 through the daemon', async () => {
    const result = await rexxMastService.executeRexxScript(
      'RETURN 0',
      [],
      { output: [] },
    );
    expect(result.success).toBe(true);
    expect(result.result1).toBe(0);
  }, 60_000);

  test('executeRexxScript() captures SAY through the bridged interpreter', async () => {
    const captured: string[] = [];
    const result = await rexxMastService.executeRexxScript(
      'SAY "daemon-marker"',
      [],
      {
        output: [],
        outputCallback: (text: string) => captured.push(text),
      },
    );
    expect(result.success).toBe(true);
    const all = captured.join('') + (result.output || []).join('');
    expect(all).toMatch(/daemon-marker/);
  }, 60_000);
});

describe('native AREXX dispatch — daemon HLE gating', () => {
  test('test suite gated on real binaries + ROM', () => {
    expect(typeof haveBinaries).toBe('boolean');
  });
});
