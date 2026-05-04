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

  test('start() returns true when detection passes parse-time validation', async () => {
    // Drop a minimal valid hunk file (matches Phase 3a contract test).
    const buf = Buffer.alloc(40);
    let o = 0;
    buf.writeUInt32BE(0x000003F3, o); o += 4;   // HUNK_HEADER
    buf.writeUInt32BE(0x00000000, o); o += 4;   // resident terminator
    buf.writeUInt32BE(0x00000001, o); o += 4;   // table_size
    buf.writeUInt32BE(0x00000000, o); o += 4;   // first
    buf.writeUInt32BE(0x00000000, o); o += 4;   // last
    buf.writeUInt32BE(0x00000001, o); o += 4;   // hunk[0] size = 1 longword
    buf.writeUInt32BE(0x000003E9, o); o += 4;   // HUNK_CODE
    buf.writeUInt32BE(0x00000001, o); o += 4;   // 1 longword of code
    buf.writeUInt32BE(0x4E714E71, o); o += 4;   // NOPs
    buf.writeUInt32BE(0x000003F2, o); o += 4;   // HUNK_END
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), buf);
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), buf);

    const ok = await rexxMastService.start();
    expect(ok).toBe(true);
    const s = rexxMastService.getStatus();
    expect(s.started).toBe(true);
    // Phase 3b-skeleton intentionally leaves ready=false — only
    // Phase 3b-real flips it once the 68K runtime is actually up.
    expect(s.ready).toBe(false);
    expect(s.lastError).toBeNull();
  });

  test('start() is idempotent — calling twice is a no-op when already started', async () => {
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

    await rexxMastService.start();
    const ok = await rexxMastService.start();
    expect(ok).toBe(true);
    expect(rexxMastService.getStatus().started).toBe(true);
  });

  test('stop() resets started/ready flags', async () => {
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

    await rexxMastService.start();
    expect(rexxMastService.isStarted()).toBe(true);
    await rexxMastService.stop();
    expect(rexxMastService.isStarted()).toBe(false);
    expect(rexxMastService.isReady()).toBe(false);
    expect(rexxMastService.getStatus().stopped).toBe(true);
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
