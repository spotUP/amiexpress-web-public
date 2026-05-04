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

  test('Phase 1 contract: available=false even when binaries present + parseable', () => {
    // Phase 3a upgrade: detection now ALSO parses the hunks. Synthesise
    // a minimal valid hunk file (HUNK_HEADER + 1-longword HUNK_CODE +
    // HUNK_END). Parsing must succeed; the engine STILL reports
    // unavailable because Phase 5 dispatch isn't wired yet. Locks the
    // no-regression contract — no future change should flip the flag
    // before Phase 5 lands.
    const buf = Buffer.alloc(40);  // exactly enough; trailing zeros are
                                    // read as unknown hunk types after HUNK_END
    let o = 0;
    // HUNK_HEADER block
    buf.writeUInt32BE(0x000003F3, o); o += 4;   // HUNK_HEADER cookie
    buf.writeUInt32BE(0x00000000, o); o += 4;   // resident library list terminator (no libs)
    buf.writeUInt32BE(0x00000001, o); o += 4;   // table_size = 1 hunk
    buf.writeUInt32BE(0x00000000, o); o += 4;   // first hunk index = 0
    buf.writeUInt32BE(0x00000000, o); o += 4;   // last hunk index = 0
    buf.writeUInt32BE(0x00000001, o); o += 4;   // hunk[0] size = 1 longword
    // HUNK_CODE
    buf.writeUInt32BE(0x000003E9, o); o += 4;   // HUNK_CODE cookie
    buf.writeUInt32BE(0x00000001, o); o += 4;   // code size in longwords
    buf.writeUInt32BE(0x4E714E71, o); o += 4;   // 2× NOP (0x4E71)
    // HUNK_END
    buf.writeUInt32BE(0x000003F2, o); o += 4;
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), buf);
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), buf);

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/Phase 5/);
    expect(det.rexxMastPath).toContain('System/RexxMast');
    expect(det.rexxsysLibPath).toContain('rexxsyslib.library');
  });

  test('detection reports parse failure when RexxMast is not a hunk file', () => {
    // Phase 3a: corrupt or non-hunk binaries get caught at startup
    // rather than blowing up later in Phase 5 dispatch.
    fs.mkdirSync(path.join(tmpDataDir, 'System'));
    fs.mkdirSync(path.join(tmpDataDir, 'Libs'));
    fs.writeFileSync(path.join(tmpDataDir, 'System/RexxMast'), 'this is not a hunk file at all');
    // Valid (minimal) library so RexxMast is the failing binary.
    const minimalHunk = Buffer.alloc(20);
    minimalHunk.writeUInt32BE(0x000003F3, 0);
    fs.writeFileSync(path.join(tmpDataDir, 'Libs/rexxsyslib.library'), minimalHunk);

    const det = detectNativeAREXX(true);
    expect(det.available).toBe(false);
    expect(det.reason).toMatch(/RexxMast hunk parse failed/);
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
