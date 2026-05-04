// @ts-nocheck
/**
 * #78 Phase 3b skeleton — RexxMast service lifecycle.
 *
 * The skeleton establishes the start/stop/isReady contract without
 * booting the 68K runtime. These tests lock the API shape so the
 * Phase 3b-real bring-up can swap in the real boot sequence without
 * breaking call sites.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rexxMastService } from '../../src/services/arexx/rexxmast-service';
import { _resetNativeAREXXDetectionCache } from '../../src/services/arexx/native-engine';

describe('RexxMastService — Phase 3b skeleton lifecycle', () => {
  let tmpDataDir: string;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-rexxmast-'));
    const { config } = require('../../src/config');
    config.set('dataDir', tmpDataDir);
    _resetNativeAREXXDetectionCache();
    rexxMastService._reset();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
  });

  test('start() returns false when binaries are missing', async () => {
    // No System/RexxMast or Libs/rexxsyslib.library in the temp dir.
    const ok = await rexxMastService.start();
    expect(ok).toBe(false);
    const s = rexxMastService.getStatus();
    expect(s.started).toBe(false);
    expect(s.lastError).toMatch(/RexxMast binary not found/);
  });

  test('start() reports a no-ROM environment cleanly', async () => {
    // Phase 3b-real attempts to boot a MoiraEmulator + Kickstart ROM
    // when binaries are present. In a clean test sandbox neither the
    // ROM nor a real RexxMast is available, so start() should fail
    // with a precise reason rather than crashing or hanging.
    const buf = Buffer.alloc(40);
    let o = 0;
    buf.writeUInt32BE(0x000003F3, o); o += 4;
    buf.writeUInt32BE(0x00000000, o); o += 4;
    buf.writeUInt32BE(0x00000001, o); o += 4;
    buf.writeUInt32BE(0x00000000, o); o += 4;
    buf.writeUInt32BE(0x00000000, o); o += 4;
    buf.writeUInt32BE(0x00000001, o); o += 4;
    buf.writeUInt32BE(0x000003E9, o); o += 4;
    buf.writeUInt32BE(0x00000001, o); o += 4;
    buf.writeUInt32BE(0x4E714E71, o); o += 4;
    buf.writeUInt32BE(0x000003F2, o); o += 4;
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), buf);
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), buf);

    // Force ROM_DIR to a non-existent path so the lookup fails
    // deterministically regardless of the dev machine's setup.
    const oldRomDir = process.env.ROM_DIR;
    process.env.ROM_DIR = path.join(tmpDataDir, 'no-rom-here');
    try {
      const ok = await rexxMastService.start();
      const s = rexxMastService.getStatus();
      // Outcome depends on whether the dev machine has a real Amiga
      // ROM on disk (KickstartRom searches well-known fallback
      // paths beyond ROM_DIR — Docker prod path, project data dir,
      // etc.). Both outcomes are valid:
      //
      //   - No ROM anywhere: ok=false, lastError mentions ROM /
      //     bring-up / hunk parse / loadLibrary
      //   - ROM found via fallback: ok=true, started=true (the
      //     binaries we wrote are minimal-but-valid hunks so
      //     LibraryLoader + HunkLoader will succeed)
      if (!ok) {
        expect(s.started).toBe(false);
        expect(s.lastError).toMatch(/ROM|RexxMast bring-up|hunk parse|loadLibrary|rexxsyslib/);
      } else {
        expect(s.started).toBe(true);
        // Phase 5: ready stays false until runUntilReady observes
        // AddPort('REXX').
        expect(s.ready).toBe(false);
      }
    } finally {
      if (oldRomDir === undefined) delete process.env.ROM_DIR;
      else process.env.ROM_DIR = oldRomDir;
    }
  });

  test('stop() is safe to call when never started', async () => {
    // Defensive: stop() before start() should be a clean no-op.
    await rexxMastService.stop();
    const s = rexxMastService.getStatus();
    expect(s.stopped).toBe(true);
    expect(s.started).toBe(false);
    expect(s.ready).toBe(false);
  });

  test('runUntilReady fails fast when service has not been started', async () => {
    // Phase 4-real wiring contract: calling runUntilReady before
    // start() must surface a clear error rather than throwing or
    // crashing the emulator.
    const ok = await rexxMastService.runUntilReady(0);
    expect(ok).toBe(false);
    expect(rexxMastService.getStatus().lastError).toMatch(/before start/);
  });

  test('runUntilReady returns false in test-mode (cycles=0) without faulting', async () => {
    // Phase 4-real lets tests pass cycles=0 to verify the wiring
    // (PC + SP set, monitor hooked) without depending on a working
    // ROM. The body short-circuits after wiring, returning false
    // because AddPort('REXX') was never observed.
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'not a hunk');
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'not a hunk');

    // start() will fail (corrupt binaries) — which is fine, we just
    // want to verify runUntilReady doesn't crash when called
    // afterwards. It should fail with a stable message.
    await rexxMastService.start();
    const ok = await rexxMastService.runUntilReady(0);
    expect(ok).toBe(false);
  });

  test('stop() releases the emulator handle', async () => {
    // Even on a failed start, stop() should always reset internal
    // state so the next start() retries cleanly.
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'not a hunk');
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'not a hunk');

    await rexxMastService.start();
    await rexxMastService.stop();
    expect(rexxMastService._getEmulator()).toBeNull();
  });

  test('start() captures the detection failure reason on a corrupt binary', async () => {
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    // Garbage that can't possibly be a hunk file.
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'not a hunk');
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'not a hunk');

    const ok = await rexxMastService.start();
    expect(ok).toBe(false);
    const s = rexxMastService.getStatus();
    expect(s.lastError).toMatch(/hunk parse failed/);
  });
});
