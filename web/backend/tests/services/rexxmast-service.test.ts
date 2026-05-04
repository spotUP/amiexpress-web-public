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

/**
 * #78 Phase 6 — Amiga env wiring around RexxMast.
 *
 * These assertions only fire when start() succeeds — i.e. when the dev
 * machine has both a Kickstart ROM and the sysop-supplied RexxMast +
 * rexxsyslib.library binaries on disk. CI without those skips the
 * assertions but still exercises the path so a regression in start()
 * still trips the existing top-level suite.
 *
 * Why this is the right shape: Phase 6 is "wire the missing Amiga env"
 * — every assertion below pins one concrete invariant that, if broken,
 * would re-introduce the original bug (RexxMast running but not
 * trapping any library calls). Together they lock the contract that:
 *   1. ExecBase + low-memory pointers are written
 *   2. dos.library is opened and its trap vectors are armed
 *   3. RexxMast has a Process struct that FindTask(0) resolves
 *   4. The Process is tagged NT_PROCESS (not NT_TASK) and pr_TaskNum=1
 *   5. The MOIRA trap address set is synced (catches the
 *      syncTrapAddressesToMoira-not-called regression specifically)
 */
describe('RexxMastService — #78 Phase 6 env wiring', () => {
  let tmpDataDir: string;
  let rexxBootSucceeded = false;

  beforeAll(async () => {
    // Use the project root as dataDir so the sysop's actual RexxMast +
    // rexxsyslib.library + Kickstart ROM are picked up. The repo ships
    // these files in System/, Libs/, and data/amiga-roms/.
    const repoRoot = path.resolve(__dirname, '../../../..');
    const { config } = require('../../src/config');
    config.set('dataDir', repoRoot);
    tmpDataDir = repoRoot;
    _resetNativeAREXXDetectionCache();
    rexxMastService._reset();
    rexxBootSucceeded = await rexxMastService.start();
  });

  afterAll(async () => {
    await rexxMastService.stop();
  });

  test('ExecBase pointer is written at low-memory 0x4 (regression: initialize() not called)', () => {
    if (!rexxBootSucceeded) return;
    const emu = rexxMastService._getEmulator();
    expect(emu).not.toBeNull();
    // ExecBase lives at 0x80000; the low-memory pointer at 0x4 must
    // resolve to it so RexxMast's `MOVEA.L 4.W,A6` finds ExecBase.
    const ptr = emu.readMemory32(0x4) >>> 0;
    expect(ptr).toBe(0x80000);
  });

  test('dos.library is registered (regression: dos vectors never armed)', () => {
    if (!rexxBootSucceeded) return;
    const status = rexxMastService.getStatus();
    expect(status.started).toBe(true);
    // ExecLibrary.libraries is populated by openLibraryHybrid for both
    // canonical "dos.library" and any case variants.
    const emu = rexxMastService._getEmulator();
    expect(emu).not.toBeNull();
    // dos.library opens at a known stub address; libraryLoader resolves
    // it to the ROM-resident base (typically 0xb0000) when Kickstart is
    // available. Either way the LVO trap at -498 (PutStr) must be an
    // ILLEGAL instruction — otherwise dos.library calls go to garbage.
    const dosBase = (rexxMastService as any).execLibrary?.getLibraryBase('dos.library') >>> 0;
    expect(dosBase).toBeGreaterThan(0);
    const trapInstr = emu.readMemory16(dosBase + (-30 & 0xffffffff)) >>> 0;
    // -30 = LVO Open. Should be 0x4afc (ILLEGAL) per installDOSVectors.
    expect(trapInstr).toBe(0x4afc);
  });

  test('rexxMast Process struct is allocated and tagged NT_PROCESS', () => {
    if (!rexxBootSucceeded) return;
    const emu = rexxMastService._getEmulator();
    const taskAddr = rexxMastService._getRexxMastTaskAddr();
    expect(taskAddr).toBeGreaterThan(0);

    // ln_Type at +0x08 must be NT_PROCESS (13). Default door pattern
    // sets NT_TASK (1); Phase 6 patches it to NT_PROCESS so RexxMast's
    // Process-vs-Task discrimination passes.
    const lnType = emu.readMemory(taskAddr + 0x08) >>> 0;
    expect(lnType).toBe(13);

    // pr_TaskNum at +0x8C must be 1 (singleton).
    const taskNum = emu.readMemory32(taskAddr + 0x8c) >>> 0;
    expect(taskNum).toBe(1);

    // pr_CLI at +0xAC must be 0 (RexxMast called via Workbench-style
    // entry, not from CLI).
    const prCli = emu.readMemory32(taskAddr + 0xac) >>> 0;
    expect(prCli).toBe(0);

    // ln_Name at +0x0a must point at a non-zero string.
    const namePtr = emu.readMemory32(taskAddr + 0x0a) >>> 0;
    expect(namePtr).toBeGreaterThan(0);
  });

  test('FindTask(NULL) resolves to the rexxMast Process (regression: ExecBase.thisTask not updated)', () => {
    if (!rexxBootSucceeded) return;
    const taskAddr = rexxMastService._getRexxMastTaskAddr();
    const emu = rexxMastService._getEmulator();
    // ExecBase.thisTask lives at execBase + 276 = 0x80114. RexxMast's
    // entry sequence does `MOVEA.L 0x114(A6),A4` to find its own task.
    const thisTask = emu.readMemory32(0x80000 + 276) >>> 0;
    expect(thisTask).toBe(taskAddr);
  });

  test('exec.library trap vectors are installed at known LVOs', () => {
    if (!rexxBootSucceeded) return;
    const emu = rexxMastService._getEmulator();
    // FindTask LVO = -294 from execBase 0x80000 = 0x7FEDA. Must be
    // ILLEGAL (0x4afc) so JSR -294(A6) routes to handleTrap.
    const findTaskTrap = emu.readMemory16(0x80000 - 294) >>> 0;
    expect(findTaskTrap).toBe(0x4afc);
    // OpenLibrary LVO = -552 → 0x7FDD8.
    const openLibTrap = emu.readMemory16(0x80000 - 552) >>> 0;
    expect(openLibTrap).toBe(0x4afc);
  });

  test('AMIEXPRESS host port is published before runUntilReady (regression: hostPort wired late)', () => {
    if (!rexxBootSucceeded) return;
    const status = rexxMastService.getStatus();
    expect(status.hostPortAddr).toBeGreaterThan(0);
    expect(status.hostPortName).toBe('AMIEXPRESS');
    expect(rexxMastService._readHostPortName()).toBe('AMIEXPRESS');
  });

  test('runUntilReady reaches AddPort("AREXX") via the CreateProc trampoline', async () => {
    if (!rexxBootSucceeded) return;
    // Bring-up calls a chain of exec/dos primitives. The last one we
    // care about is AddPort with the daemon's port; for AmiExpress's
    // RexxMast that name is "AREXX" (Commodore stock uses "REXX" — we
    // match either). Without the CreateProc trampoline this never
    // fires (launcher loops in LockRexxBase forever); without the
    // OpenDevice override the daemon bails on "Can't open
    // timer.device"; without the prefetch refill the first daemon
    // instruction decodes wrong.
    const ready = await rexxMastService.runUntilReady(10_000_000);
    expect(ready).toBe(true);
    const s = rexxMastService.getStatus();
    expect(s.ready).toBe(true);
    expect(s.lastError).toBeNull();
  }, 30_000);
});
