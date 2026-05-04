/**
 * RexxMast service — singleton 68K runtime that hosts the real
 * AREXX interpreter when a sysop has supplied System/RexxMast.
 *
 * #78 Phase 3b (skeleton).
 *
 * This file establishes the LIFECYCLE shape — start / stop / isReady /
 * getEmulator — without actually booting the emulator or loading the
 * binaries. The 68K bring-up (MoiraEmulator instantiation, ROM load,
 * library trap install, RexxMast task spawn, REXX-port watch) lands
 * in the follow-up "Phase 3b-real" pass, which is a focused chunk of
 * work substantial enough to warrant its own session.
 *
 * Locking the API now lets Phase 4 (host port + dispatch) and Phase 5
 * (executeScript wiring) reference a stable interface even though the
 * underlying implementation is still a stub.
 *
 * Singleton justification: see the JSDoc on NativeAREXXEngine in
 * native-engine.ts. Real Amiga AmiExpress ran one RexxMast for the
 * whole BBS regardless of node count; concurrent script invocations
 * are RexxMast's job (one interpreter task per inbound RexxMsg).
 */

import { detectNativeAREXX } from './native-engine';

export interface RexxMastServiceStatus {
  /** Has start() been called and completed without error? */
  started: boolean;
  /** Has stop() been called? Resets to false on next start(). */
  stopped: boolean;
  /** Is the underlying 68K runtime fully ready to accept scripts? */
  ready: boolean;
  /** Last error message from a failed start, or null. */
  lastError: string | null;
}

class RexxMastService {
  private status: RexxMastServiceStatus = {
    started: false,
    stopped: false,
    ready: false,
    lastError: null,
  };

  /**
   * Boot the singleton. Phase 3b-skeleton: confirms detection passes
   * and records that we *would* boot if Phase 3b-real were wired.
   * Returns true if the service can be considered started; false if
   * detection rejects the binaries.
   *
   * Phase 3b-real (next pass) will replace the body with:
   *   1. new MoiraEmulator(memSize) + initialize()
   *   2. KickstartRom + loadROM
   *   3. LibraryLoader.loadLibrary('rexxsyslib.library')
   *   4. LibraryTraps.installRexxSysLibVectors(libBase, lib)
   *   5. HunkLoader.parse(System/RexxMast) + load segments
   *   6. emulator.run() in worker thread until rm_Action set
   *   7. Watch for AddPort('REXX') call → set ready=true
   */
  async start(): Promise<boolean> {
    if (this.status.started && !this.status.stopped) {
      return true; // idempotent
    }
    this.status.lastError = null;
    this.status.stopped = false;

    const detection = detectNativeAREXX();
    if (!detection.available && !detection.rexxMastPath) {
      // Hard failure — binary missing entirely. The selector will
      // route every script to TS; nothing for us to start.
      this.status.lastError = detection.reason;
      return false;
    }

    if (!detection.rexxMastPath || !detection.rexxsysLibPath) {
      // Binaries didn't survive parse-time validation (Phase 3a
      // upgraded detection sets these to '' on failure).
      this.status.lastError = detection.reason;
      return false;
    }

    // Phase 3b-real: this is where MoiraEmulator + KickstartRom +
    // LibraryLoader + LibraryTraps + RexxMast task spawn happen.
    // For now we just record that we got past the parse gate.
    this.status.started = true;
    this.status.ready = false; // ready=true only after Phase 3b-real
    return true;
  }

  /**
   * Tear down the runtime cleanly. Phase 3b-skeleton: marks status.
   * Phase 3b-real: kill the emulator worker, free MOIRA RAM, remove
   * the REXX port from public list.
   */
  async stop(): Promise<void> {
    this.status.stopped = true;
    this.status.started = false;
    this.status.ready = false;
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
    };
  }
}

export const rexxMastService = new RexxMastService();
