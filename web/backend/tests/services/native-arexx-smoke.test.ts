// @ts-nocheck
/**
 * End-to-end smoke test for the native AREXX dispatch path
 * (RexxMast + rexxsyslib running under MOIRA + Kickstart ROM).
 *
 * Promoted from `dev/scripts/arexx-trace.ts` so CI catches regressions
 * in the bridged-interpretation path. The test is gated on the
 * presence of the Commodore binaries (RexxMast + rexxsyslib.library)
 * and a Kickstart ROM — both are gitignored, so in CI / on a fresh
 * checkout this suite will skip cleanly. On a local dev machine
 * (where the sysop has dropped real binaries into System/ + Libs/
 * and a ROM in data/amiga-roms/) it boots the service, dispatches a
 * trivial REXX script, and asserts the bridged path returns success.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const rexxMastBin = path.join(repoRoot, 'System/RexxMast');
const rexxSysLib = path.join(repoRoot, 'Libs/rexxsyslib.library');
const kickRom = path.join(
  repoRoot,
  'data/amiga-roms',
  'Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom',
);
const arosRom = path.join(repoRoot, 'data/amiga-roms/aros-rom.bin');

const haveBinaries =
  fs.existsSync(rexxMastBin) &&
  fs.existsSync(rexxSysLib) &&
  (fs.existsSync(kickRom) || fs.existsSync(arosRom));

const describeIf = haveBinaries ? describe : describe.skip;

describeIf('native AREXX dispatch — bridged interpreter smoke', () => {
  let rexxMastService: any;
  let _resetNativeAREXXDetectionCache: any;

  beforeAll(() => {
    process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || repoRoot;
    process.env.SKIP_DB_INIT = '1';
    const { config } = require('../../src/config');
    config.set('dataDir', process.env.BBS_DATA_DIR);
    ({ rexxMastService } = require('../../src/services/arexx/rexxmast-service'));
    ({ _resetNativeAREXXDetectionCache } = require('../../src/services/arexx/native-engine'));
    _resetNativeAREXXDetectionCache();
    rexxMastService._reset();
  });

  afterAll(() => {
    try { rexxMastService._reset?.(); } catch { /* tolerate dirty teardown */ }
  });

  test('start() boots RexxMast under MOIRA + ROM', async () => {
    const ok = await rexxMastService.start();
    if (!ok) {
      const status = rexxMastService.getStatus();
      // Surface the precise failure to the developer running locally —
      // bring-up errors are typically environmental (ROM mismatch,
      // hunk parse, library init), not regressions in the AREXX path.
      throw new Error(
        `rexxMastService.start() returned false: ${status.lastError || 'unknown'}`,
      );
    }
    expect(ok).toBe(true);
  }, 30_000);

  test('runUntilReady() reaches the AREXX message-port wait state', async () => {
    const ready = await rexxMastService.runUntilReady(5_000_000);
    expect(ready).toBe(true);
    expect(rexxMastService.isReady()).toBe(true);
  }, 30_000);

  test('executeRexxScript() runs a trivial RETURN 0 successfully', async () => {
    const result = await rexxMastService.executeRexxScript(
      'RETURN 0',
      [],
      { output: [] },
    );
    expect(result.success).toBe(true);
    // result1 is the exit code from the script — RETURN 0 → 0.
    expect(result.result1).toBe(0);
  }, 30_000);

  test('executeRexxScript() captures SAY output via outputCallback', async () => {
    const captured: string[] = [];
    const result = await rexxMastService.executeRexxScript(
      'SAY "smoke-test-marker"',
      [],
      {
        output: [],
        outputCallback: (text: string) => captured.push(text),
      },
    );
    expect(result.success).toBe(true);
    // Bridged interpretation routes SAY through BBSWRITE, which lands
    // in either output[] or outputCallback (whichever is provided).
    // Accept output[] form too — engine selection of output sink may
    // shift between releases, but the marker MUST land somewhere.
    const all = captured.join('') + (result.output || []).join('');
    expect(all).toMatch(/smoke-test-marker/);
  }, 30_000);
});

describe('native AREXX dispatch — gating', () => {
  test('test suite gated on real binaries + ROM', () => {
    // This always-passes test exists so the file reports as "ran" in
    // CI even when the conditional describe.skip elides the real
    // assertions. Without it, jest's "no tests in file" guard would
    // fail the suite on a clean checkout.
    expect(typeof haveBinaries).toBe('boolean');
  });
});
