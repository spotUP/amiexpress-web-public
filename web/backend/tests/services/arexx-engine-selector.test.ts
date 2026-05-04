// @ts-nocheck
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  selectAREXXEngine,
  _resetAREXXEngineSelectorCache,
} from '../../src/services/arexx/engine-selector';
import {
  detectNativeAREXX,
  _resetNativeAREXXDetectionCache,
} from '../../src/services/arexx/native-engine';

describe('AREXX engine selector — #78 Phase 1', () => {
  let tmpDataDir: string;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-arexx-sel-'));
    // Point config at the temp dir for this test.
    const { config } = require('../../src/config');
    config.set('dataDir', tmpDataDir);
    _resetNativeAREXXDetectionCache();
    _resetAREXXEngineSelectorCache();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
  });

  test('Phase 1 default: detection reports unavailable even when files present', () => {
    // Drop both required binaries — Phase 1 must STILL report unavailable
    // because we haven't wired the native path yet. This test pins the
    // Phase-1 contract: don't accidentally short-circuit to native before
    // Phase 5 lands.
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'fake-binary');
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'fake-lib');

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/Phase 1/);
    expect(det.rexxMastPath).toContain('System/RexxMast');
    expect(det.rexxsysLibPath).toContain('rexxsyslib.library');
  });

  test('detection short-circuits when RexxMast is missing', () => {
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'fake-lib');

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/RexxMast binary not found/);
  });

  test('detection short-circuits when rexxsyslib.library is missing', () => {
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'fake-binary');

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/rexxsyslib\.library not found/);
  });

  test('detection rejects empty RexxMast file', () => {
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), '');
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), 'fake-lib');

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/is empty/);
  });

  test("selector with auto + native unavailable returns 'ts'", () => {
    // No binaries — auto must fall back to TS without complaint.
    const { choice, reason } = selectAREXXEngine();
    expect(choice).toBe('ts');
    expect(reason).toMatch(/auto/);
  });

  test('selector reports the underlying detection reason on auto fallback', () => {
    // Auto path should bubble the missing-component message into the
    // selector's reason so the startup log line is informative.
    const { reason } = selectAREXXEngine();
    expect(reason).toMatch(/RexxMast binary not found/);
  });
});
