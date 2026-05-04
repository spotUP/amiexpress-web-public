/**
 * RexxMast service — singleton 68K runtime that hosts the real
 * AREXX interpreter when a sysop has supplied System/RexxMast.
 *
 * #78 Phase 3b — instantiates a private MoiraEmulator + Kickstart ROM,
 * loads rexxsyslib.library via LibraryLoader, installs the LVO traps
 * from REXXSYSLIB_VECTORS at the resolved library base, then parses +
 * loads RexxMast hunks into emulator memory. After this pass:
 *
 *   isStarted() = true   (everything loaded, vectors armed)
 *   isReady()   = false  (RexxMast task not yet executing — runs on
 *                          first script call in Phase 4 wire-up)
 *
 * Singleton justification: see the JSDoc on NativeAREXXEngine in
 * native-engine.ts. Real Amiga AmiExpress ran one RexxMast for the
 * whole BBS regardless of node count; concurrent script invocations
 * are RexxMast's job (one interpreter task per inbound RexxMsg).
 *
 * Phase 4 (next pass) will:
 *   1. Wire the host MsgPort the BBS owns ('AMIEXPRESS' or similar)
 *   2. Run RexxMast for setup cycles (until it Wait()'s on its REXX port)
 *   3. Flip ready=true once we observe AddPort('REXX')
 *   4. Provide sendScript(scriptPath, args) → CreateRexxMsg + PutMsg
 *
 * Failure modes (all surface via lastError):
 *   - System/RexxMast missing            → caught by Phase 3a detection
 *   - Hunk parse fails                   → ditto
 *   - Kickstart ROM not on disk          → KickstartRom throws
 *   - LibraryLoader.loadLibrary fails    → can't find libs
 *   - Out-of-memory during segment load  → execLibrary.allocMem returns 0
 */

import { detectNativeAREXX } from './native-engine';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';

// MOIRA emulator memory size for the singleton. RexxMast itself is
// ~3KB plus state; rexxsyslib is 33KB. ROM consumes 512KB. 4MB total
// matches the per-door default (env EMULATOR_MEMORY_MB) and leaves
// generous headroom for argstring + RexxMsg pools.
const SINGLETON_MEM_MB = 4;

export interface RexxMastServiceStatus {
  /** Has start() been called and completed without error? */
  started: boolean;
  /** Has stop() been called? Resets to false on next start(). */
  stopped: boolean;
  /** Is the underlying 68K runtime fully ready to accept scripts? */
  ready: boolean;
  /** Last error message from a failed start, or null. */
  lastError: string | null;
  /** Resolved RexxMast load base (0 until segment load succeeds). */
  rexxMastBase: number;
  /** Resolved rexxsyslib.library base (0 until LibraryLoader succeeds). */
  rexxSysLibBase: number;
}

class RexxMastService {
  private status: RexxMastServiceStatus = {
    started: false,
    stopped: false,
    ready: false,
    lastError: null,
    rexxMastBase: 0,
    rexxSysLibBase: 0,
  };

  // Lazily-instantiated 68K runtime. Lives for the BBS process
  // lifetime once started.
  private emulator: any = null;
  private execLibrary: any = null;
  private libraryLoader: any = null;
  private libraryTraps: any = null;
  private rexxSysLib: any = null;
  private kickstartRom: any = null;

  /**
   * Boot the singleton. Phase 3b-real:
   *   1. Pass detection (Phase 3a — file present, hunk-parseable)
   *   2. new MoiraEmulator + initialize
   *   3. new KickstartRom (loads from disk; throws if missing)
   *   4. emulator.loadROM
   *   5. new LibraryLoader with searchPath=<dataDir>/Libs
   *   6. LibraryLoader.loadLibrary('rexxsyslib.library')
   *   7. new LibraryTraps + new RexxSysLibLibrary
   *   8. installRexxSysLibVectors at the resolved base
   *   9. HunkLoader.parse(System/RexxMast) + load segments + relocations
   *
   * Stops short of running RexxMast — that's Phase 4. After start()
   * returns true, the emulator has the binaries loaded and the
   * vectors armed; nothing is executing yet.
   *
   * Returns true on full success, false if any step fails. lastError
   * carries the precise failure reason for the [AREXX] startup log.
   */
  async start(): Promise<boolean> {
    if (this.status.started && !this.status.stopped) {
      return true; // idempotent
    }
    this.status.lastError = null;
    this.status.stopped = false;

    // Step 1 — detection.
    const detection = detectNativeAREXX();
    if (!detection.available && !detection.rexxMastPath) {
      this.status.lastError = detection.reason;
      return false;
    }
    if (!detection.rexxMastPath || !detection.rexxsysLibPath) {
      this.status.lastError = detection.reason;
      return false;
    }

    try {
      // Step 2 — emulator instantiation.
      const { MoiraEmulator } = require('../../amiga-emulation/cpu/MoiraEmulator');
      const memBytes = SINGLETON_MEM_MB * 1024 * 1024;
      this.emulator = new MoiraEmulator(memBytes);
      await this.emulator.initialize();

      // Step 3-4 — Kickstart ROM. KickstartRom's constructor reads
      // from disk; if no ROM is found it logs but doesn't throw —
      // we surface a failure here because RexxMast can't run without
      // exec.library / dos.library being addressable.
      const { KickstartRom } = require('../../amiga-emulation/KickstartRom');
      this.kickstartRom = new KickstartRom();
      const romData = this.kickstartRom.getRomData();
      if (!romData || romData.length === 0) {
        this.status.lastError = 'Kickstart ROM not found on disk (set ROM_DIR or place a ROM at data/amiga-roms/)';
        return false;
      }
      this.emulator.loadROM(romData);

      // Step 5-6 — LibraryLoader. Search path includes <dataDir>/Libs
      // so sysop's rexxsyslib.library lives next to the other Amiga
      // libs they ship.
      const { LibraryLoader } = require('../../amiga-emulation/loader/LibraryLoader');
      const libsDir = path.join(config.get('dataDir'), 'Libs');
      this.libraryLoader = new LibraryLoader(this.emulator, [libsDir], this.kickstartRom);

      // Step 7 — ExecLibrary, LibraryTraps, RexxSysLibLibrary all
      // bind to the same MoiraEmulator instance.
      const { ExecLibrary } = require('../../amiga-emulation/api/ExecLibrary');
      this.execLibrary = new ExecLibrary(this.emulator);
      const { LibraryTraps } = require('../../amiga-emulation/api/LibraryTraps');
      this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
      const { RexxSysLibLibrary } = require('../../amiga-emulation/api/RexxSysLibLibrary');
      this.rexxSysLib = new RexxSysLibLibrary(this.emulator, this.execLibrary);
      this.libraryTraps.setRexxSysLibLibrary(this.rexxSysLib);

      // Now load rexxsyslib.library — this allocates a base via
      // LibraryLoader's internal allocator + applies relocations.
      const lib = this.libraryLoader.loadLibrary('rexxsyslib.library', 0);
      if (!lib) {
        this.status.lastError = `LibraryLoader returned null for rexxsyslib.library at ${libsDir}`;
        return false;
      }
      // LibraryLoader registers the base on its own; for the trap
      // installer we read it back via execLibrary.getLibraryBase
      // which the loader already populates as part of loadLibrary.
      // (If that hasn't been wired to the loader yet, surface a
      // clear error so Phase 4 catches the gap.)
      const libBase = this.execLibrary.getLibraryBase
        ? this.execLibrary.getLibraryBase('rexxsyslib.library')
        : (lib && lib.baseAddress) || 0;
      if (!libBase) {
        this.status.lastError = 'rexxsyslib.library loaded but base address not registered with execLibrary';
        return false;
      }
      this.status.rexxSysLibBase = libBase;

      // Step 8 — install REXXSYSLIB_VECTORS at the resolved base.
      this.libraryTraps.installRexxSysLibVectors();

      // Step 9 — load RexxMast itself into emulator memory.
      const { HunkLoader } = require('../../amiga-emulation/loader/HunkLoader');
      const hunkLoader = new HunkLoader();
      const rexxMastBytes = fs.readFileSync(detection.rexxMastPath);
      const rexxMastHunks = hunkLoader.parse(rexxMastBytes);
      // HunkLoader.load copies all segments into memory + applies
      // relocations. The first segment's address is the entry point
      // RexxMast jumps to when run.
      hunkLoader.load(this.emulator, rexxMastHunks, 'RexxMast');
      const firstSegment = rexxMastHunks.segments && rexxMastHunks.segments[0];
      this.status.rexxMastBase = firstSegment ? firstSegment.address : 0;

      this.status.started = true;
      // Phase 4 flips ready=true once RexxMast actually executes its
      // setup and registers the REXX port. Until then the engine
      // selector still routes scripts to TS.
      this.status.ready = false;
      return true;
    } catch (err: any) {
      this.status.lastError = `RexxMast bring-up failed: ${err?.message || err}`;
      // Roll back partial state so the next start() retries cleanly.
      this.emulator = null;
      this.execLibrary = null;
      this.libraryLoader = null;
      this.libraryTraps = null;
      this.rexxSysLib = null;
      this.kickstartRom = null;
      this.status.rexxMastBase = 0;
      this.status.rexxSysLibBase = 0;
      this.status.started = false;
      return false;
    }
  }

  /**
   * Tear down the runtime. Releases the MOIRA emulator + ROM +
   * library handles so a subsequent start() can reload from disk.
   * Phase 4 will additionally signal RexxMast to exit cleanly via
   * its REXX port.
   */
  async stop(): Promise<void> {
    this.status.stopped = true;
    this.status.started = false;
    this.status.ready = false;
    this.emulator = null;
    this.execLibrary = null;
    this.libraryLoader = null;
    this.libraryTraps = null;
    this.rexxSysLib = null;
    this.kickstartRom = null;
    this.status.rexxMastBase = 0;
    this.status.rexxSysLibBase = 0;
  }

  isReady(): boolean {
    return this.status.ready;
  }

  isStarted(): boolean {
    return this.status.started && !this.status.stopped;
  }

  getStatus(): RexxMastServiceStatus {
    return { ...this.status };
  }

  /**
   * Test-only reset — production code uses stop()/start().
   */
  _reset(): void {
    this.status = {
      started: false,
      stopped: false,
      ready: false,
      lastError: null,
      rexxMastBase: 0,
      rexxSysLibBase: 0,
    };
    this.emulator = null;
    this.execLibrary = null;
    this.libraryLoader = null;
    this.libraryTraps = null;
    this.rexxSysLib = null;
    this.kickstartRom = null;
  }

  /** Test-only accessor for the loaded emulator (null until started). */
  _getEmulator(): any { return this.emulator; }
}

export const rexxMastService = new RexxMastService();
