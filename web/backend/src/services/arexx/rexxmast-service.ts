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
  /** Address of our 'AMIEXPRESS' host MsgPort (0 until setup runs). */
  hostPortAddr: number;
  /** Name registered for the host port (defaults to 'AMIEXPRESS'). */
  hostPortName: string;
}

class RexxMastService {
  private status: RexxMastServiceStatus = {
    started: false,
    stopped: false,
    ready: false,
    lastError: null,
    rexxMastBase: 0,
    rexxSysLibBase: 0,
    hostPortAddr: 0,
    hostPortName: 'AMIEXPRESS',
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
      // LibraryLoader returns a LoadedLibrary with baseAddress set
      // to the resolved load address. ExecLibrary doesn't separately
      // track this — installRexxSysLibVectors reads from execLibrary
      // via its trap dispatcher, but the install method itself
      // expects the base to be discoverable. Register it on
      // execLibrary so getLibraryBase returns the right value
      // (mirrors what AmigaDoorSession does for AEDoor.library).
      const libBase = (lib && (lib as any).baseAddress) || 0;
      if (!libBase) {
        this.status.lastError = 'rexxsyslib.library loaded but baseAddress missing from LoadedLibrary';
        return false;
      }
      this.status.rexxSysLibBase = libBase;
      // Register a LibraryNode in execLibrary's map so the
      // installRexxSysLibVectors lookup (getLibraryBase) finds the
      // base. Shape matches LibraryNode in ExecLibrary.ts:
      //   { address, name, version, revision, openCount, negSize, posSize }
      const libNode = {
        address: libBase,
        name: 'rexxsyslib.library',
        version: 0,
        revision: 0,
        openCount: 1,
        negSize: 510,   // 10 LVOs × 6 bytes/jump-slot rounded up
        posSize: 34,
      };
      const libsMap = (this.execLibrary as any).libraries;
      if (libsMap && typeof libsMap.set === 'function') {
        libsMap.set('rexxsyslib.library', libNode);
        libsMap.set('RexxSysLib', libNode); // also under canonical case for FindResident
      }

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

      // #78 Phase 4 — set up the BBS host MsgPort. AREXX scripts
      // address this port via `ADDRESS AMIEXPRESS` then send command
      // lines like `BBSWRITE "Hello"`. RexxMast packages each line as
      // an argstring in rm_Args[0] and PutMsg's it here. We service
      // those messages via dispatchHostCommand (Phase 4-skeleton).
      const hostOk = this.setupHostPort('AMIEXPRESS');
      if (!hostOk) {
        this.status.lastError = 'host port allocation failed';
        return false;
      }

      this.status.started = true;
      // Phase 4-real flips ready=true once RexxMast actually runs its
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
      this.status.hostPortAddr = 0;
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
    this.status.hostPortAddr = 0;
  }

  /**
   * Allocate + register the BBS host MsgPort that AREXX scripts
   * target via `ADDRESS <name>`. Real AmiExpress used 'AMIEXPRESS'
   * as the host port name so scripts written for a real AmiExpress
   * BBS work unchanged. The name parameter lets sysops override via
   * future tooltype, but defaults to 'AMIEXPRESS'.
   *
   * MsgPort struct layout (struct MsgPort, exec/ports.h, 34 bytes):
   *   +0   ln_Succ      APTR  (0)
   *   +4   ln_Pred      APTR  (0)
   *   +8   ln_Type      UBYTE (NT_MSGPORT = 4)
   *   +9   ln_Pri       BYTE  (0)
   *   +10  ln_Name      STRPTR
   *   +14  mp_Flags     UBYTE (PA_SIGNAL = 0)
   *   +15  mp_SigBit    UBYTE (signal number — we use 13, exec default)
   *   +16  mp_SigTask   APTR  (signalled task — 0 = whole-system)
   *   +20  mp_MsgList   List  (lh_Head, lh_Tail, lh_TailPred + bytes)
   *
   * Calls execLibrary.addPort() to register in the public-port list,
   * which is what FindPort() searches when RexxMast resolves the
   * 'AMIEXPRESS' destination.
   *
   * Returns true on success, false if either allocation fails.
   */
  private setupHostPort(name: string): boolean {
    if (!this.execLibrary || !this.emulator) return false;
    const MEMF_PUBLIC_CLEAR = 0x10001;

    // 1. Allocate the name string (NUL-terminated) so the port struct
    //    can reference it by pointer.
    const nameBytes = Buffer.from(name + '\0', 'utf-8');
    const nameAddr = this.execLibrary.allocMem(nameBytes.length, MEMF_PUBLIC_CLEAR);
    if (nameAddr === 0) return false;
    for (let i = 0; i < nameBytes.length; i++) {
      this.emulator.writeMemory(nameAddr + i, nameBytes[i]);
    }

    // 2. Allocate the MsgPort struct (34 bytes for the documented
    //    layout — round up via allocMem alignment).
    const portAddr = this.execLibrary.allocMem(34, MEMF_PUBLIC_CLEAR);
    if (portAddr === 0) {
      // Roll back the name allocation so we don't leak when the second
      // alloc fails. freeMem with size=length is conservative here.
      this.execLibrary.freeMem(nameAddr, nameBytes.length);
      return false;
    }

    // 3. Fill in the struct. allocMem already zeroed the block, so we
    //    only need to set non-zero fields.
    this.emulator.writeMemory(portAddr + 0x08, 4);              // ln_Type = NT_MSGPORT
    this.emulator.writeMemory32(portAddr + 0x0a, nameAddr);      // ln_Name
    this.emulator.writeMemory(portAddr + 0x0e, 0);              // mp_Flags = PA_SIGNAL
    this.emulator.writeMemory(portAddr + 0x0f, 13);             // mp_SigBit (exec default)
    this.emulator.writeMemory32(portAddr + 0x10, 0);             // mp_SigTask
    // Empty message list — lh_Head -> lh_Tail (which is 0), lh_TailPred -> lh_Head.
    this.emulator.writeMemory32(portAddr + 0x14, portAddr + 0x18);  // lh_Head
    this.emulator.writeMemory32(portAddr + 0x18, 0);                 // lh_Tail
    this.emulator.writeMemory32(portAddr + 0x1c, portAddr + 0x14);   // lh_TailPred
    this.emulator.writeMemory(portAddr + 0x20, 5);                  // lh_Type = NT_MESSAGE
    this.emulator.writeMemory(portAddr + 0x21, 0);                  // l_pad

    // 4. Register in the public-port list. ExecLibrary.addPort reads
    //    ln_Name from the struct and adds it to the publicPorts map
    //    so FindPort('AMIEXPRESS') resolves correctly.
    if (typeof this.execLibrary.addPort === 'function') {
      this.execLibrary.addPort(portAddr);
    }

    this.status.hostPortAddr = portAddr;
    this.status.hostPortName = name;
    return true;
  }

  /**
   * #78 Phase 4-real — boot RexxMast for setup cycles.
   *
   * Sets PC to the loaded RexxMast entry point + SP to a high RAM
   * address, hooks the LibraryTraps call monitor to watch for an
   * AddPort('REXX') call (RexxMast's signal that it's done setting
   * up + parked on its REXX port waiting for messages), and runs the
   * emulator instruction-by-instruction up to maxCycles.
   *
   * Returns true once AddPort('REXX') is observed (status.ready set
   * to true), false on timeout / fault. Defensive — a missing ROM,
   * a malformed RexxMast, or a MOIRA fault all surface as a failure
   * with status.lastError holding the precise message rather than
   * crashing the BBS.
   *
   * Test mode: when `cycles` is 0 we skip the loop entirely and
   * just return false. Tests that don't need a live emulator pass
   * 0 to verify the wiring path without depending on a working ROM.
   */
  async runUntilReady(maxCycles: number = 1_000_000): Promise<boolean> {
    if (!this.emulator || !this.libraryTraps || !this.execLibrary) {
      this.status.lastError = 'runUntilReady called before start() succeeded';
      return false;
    }
    if (this.status.ready) return true;
    if (this.status.rexxMastBase === 0) {
      this.status.lastError = 'RexxMast base unset — cannot set PC';
      return false;
    }

    // PC = RexxMast first segment address. SP = high in MOIRA RAM
    // (4MB heap minus 64KB stack, aligned).
    const memBytes = SINGLETON_MEM_MB * 1024 * 1024;
    const stackTop = (memBytes - 0x10000) & ~3;
    try {
      const { CPURegister } = require('../../amiga-emulation/cpu/MoiraEmulator');
      this.emulator.setRegister(CPURegister.PC, this.status.rexxMastBase);
      this.emulator.setRegister(CPURegister.A7, stackTop);
    } catch (err: any) {
      this.status.lastError = `setRegister failed: ${err?.message || err}`;
      return false;
    }

    // Hook the call monitor to detect AddPort('REXX'). The monitor
    // fires for every library-trap call; we only flip ready when
    // we see AddPort with A1 → port whose ln_Name reads as 'REXX'.
    let observedRexxPort = false;
    const oldMonitor = (this.libraryTraps as any).onLibraryCall;
    this.libraryTraps.setLibraryCallMonitor((fnName: string, _pc: number) => {
      if (oldMonitor) {
        try { oldMonitor(fnName, _pc); } catch { /* upstream monitor is advisory */ }
      }
      if (fnName === 'AddPort' && !observedRexxPort) {
        // A1 holds the MsgPort pointer; ln_Name lives at port+10.
        try {
          const a1 = this.emulator.getRegister(9 /* A1 */) >>> 0;
          if (a1 === 0) return;
          const namePtr = this.emulator.readMemory32(a1 + 10) >>> 0;
          if (namePtr === 0) return;
          let name = '';
          for (let i = 0; i < 16; i++) {
            const b = this.emulator.readMemory(namePtr + i);
            if (b === 0) break;
            name += String.fromCharCode(b);
          }
          if (name === 'REXX') {
            observedRexxPort = true;
          }
        } catch {
          /* swallow — monitor must never throw upstream */
        }
      }
    });

    // Test-mode short-circuit.
    if (maxCycles === 0) {
      return false;
    }

    // Slice the run so we can drain inbound messages (RexxMast may
    // PutMsg into our host port during setup) and bail early once
    // AddPort('REXX') is seen.
    const SLICE = 1024;
    const { serviceInboundMessages } = require('./rexx-host-servicer');
    let cycles = 0;
    while (cycles < maxCycles && !observedRexxPort) {
      try {
        for (let i = 0; i < SLICE && cycles < maxCycles; i++) {
          this.emulator.executeInstruction();
          cycles++;
          if (observedRexxPort) break;
        }
      } catch (err: any) {
        this.status.lastError = `RexxMast emulator faulted at ~${cycles} cycles: ${err?.message || err}`;
        return false;
      }
      // Drain anything RexxMast PutMsg'd into us during setup.
      try {
        await serviceInboundMessages(
          this.emulator,
          this.rexxSysLib,
          this.status.hostPortAddr,
          { output: [] },
        );
      } catch (err) {
        // Servicer faults shouldn't kill the boot — log via lastError
        // but keep running until cycle budget exhausts.
        this.status.lastError = `host servicer faulted during boot: ${(err as any)?.message || err}`;
      }
    }

    if (observedRexxPort) {
      this.status.ready = true;
      return true;
    }
    this.status.lastError = `RexxMast did not call AddPort('REXX') within ${maxCycles} cycles`;
    return false;
  }

  /**
   * #78 Phase 5-final — execute a script via the native engine.
   *
   * Builds a RexxMsg targeting RexxMast's 'REXX' port, drops the
   * script content into rm_Args[0] as an argstring, PutMsg's it,
   * runs MOIRA cycles + drains our host port until the reply
   * lands on our reply port, then unpacks rm_Result1 / rm_Args[1].
   *
   * Returns:
   *   { success, output, error, result1 }
   * with `output` carrying the BBS-side text dispatch produced
   * (each BBSWRITE / OUTSTR call appends to ctx.output).
   *
   * Cycle budget: capped at 5_000_000 to keep a runaway script
   * from wedging the BBS. Phase 6 will surface this as a sysop
   * tooltype (AREXX_CYCLE_BUDGET).
   */
  async executeRexxScript(
    scriptText: string,
    args: string[],
    ctx: any,
  ): Promise<{ success: boolean; output: string[]; error?: string; result1: number }> {
    if (!this.isReady() || !this.emulator || !this.execLibrary || !this.rexxSysLib) {
      return {
        success: false,
        output: [],
        error: 'native engine not ready',
        result1: -1,
      };
    }

    const MAX_CYCLES = 5_000_000;
    const SLICE = 1024;
    const { serviceInboundMessages } = require('./rexx-host-servicer');

    // Find RexxMast's 'REXX' port — the destination for our msg.
    const rexxPortAddr = typeof this.execLibrary.findPortByName === 'function'
      ? this.execLibrary.findPortByName('REXX')
      : (this.execLibrary as any).publicPorts?.get?.('rexx') || 0;
    if (!rexxPortAddr) {
      return { success: false, output: [], error: "REXX port not registered", result1: -1 };
    }

    // Build a reply port for this script invocation. Reuse the BBS
    // host port — RexxMast replies will land alongside any host
    // command messages and the servicer drains both. This keeps
    // single-port semantics consistent with real Amiga AmiExpress.
    const replyPort = this.status.hostPortAddr;
    if (!replyPort) {
      return { success: false, output: [], error: 'host reply port not initialised', result1: -1 };
    }

    // Allocate a RexxMsg + put script text in rm_Args[0].
    const msgAddr = this.rexxSysLib.createRexxMsg(replyPort, 0, 0);
    if (msgAddr === 0) {
      return { success: false, output: [], error: 'CreateRexxMsg failed', result1: -1 };
    }

    // Stage script bytes in MOIRA RAM, then create an argstring of
    // the same length and patch in the bytes.
    const MEMF_PUBLIC_CLEAR = 0x10001;
    const stage = this.execLibrary.allocMem(scriptText.length + 1, MEMF_PUBLIC_CLEAR);
    for (let i = 0; i < scriptText.length; i++) {
      this.emulator.writeMemory(stage + i, scriptText.charCodeAt(i) & 0xff);
    }
    this.emulator.writeMemory(stage + scriptText.length, 0);
    const arg0 = this.rexxSysLib.createArgstring(stage, scriptText.length);
    this.emulator.writeMemory32(msgAddr + 40, arg0); // rm_Args[0]
    // rm_Action = 0x01000000 (RXCOMM, "interpret as command/script")
    this.emulator.writeMemory32(msgAddr + 28, 0x01000000);

    // Subsequent rm_Args[1..N] hold script arguments per RKRM.
    for (let i = 0; i < args.length && i < 15; i++) {
      const argText = args[i];
      const argStage = this.execLibrary.allocMem(argText.length + 1, MEMF_PUBLIC_CLEAR);
      for (let j = 0; j < argText.length; j++) {
        this.emulator.writeMemory(argStage + j, argText.charCodeAt(j) & 0xff);
      }
      this.emulator.writeMemory(argStage + argText.length, 0);
      const argstring = this.rexxSysLib.createArgstring(argStage, argText.length);
      this.emulator.writeMemory32(msgAddr + 40 + (i + 1) * 4, argstring);
    }

    // PutMsg into RexxMast's REXX port.
    if (typeof this.execLibrary.putMsg === 'function') {
      this.execLibrary.putMsg(rexxPortAddr, msgAddr);
    } else {
      // Fallback: direct list manipulation (matches PutMsg semantics).
      const tailPred = this.emulator.readMemory32(rexxPortAddr + 0x1c) >>> 0;
      this.emulator.writeMemory32(msgAddr + 0, 0);
      this.emulator.writeMemory32(msgAddr + 4, tailPred);
      this.emulator.writeMemory32(tailPred + 0, msgAddr);
      this.emulator.writeMemory32(rexxPortAddr + 0x1c, msgAddr);
    }

    // Drive MOIRA until our msgAddr appears on the reply port (or
    // budget exhausts). serviceInboundMessages drains BBS-side host
    // commands the running script issues; the script's terminal
    // ReplyMsg lands on replyPort's mp_MsgList.
    const output: string[] = ctx.output || [];
    const dispatchCtx = { ...ctx, output };
    let cycles = 0;
    let replied = false;
    while (cycles < MAX_CYCLES && !replied) {
      try {
        for (let i = 0; i < SLICE && cycles < MAX_CYCLES; i++) {
          this.emulator.executeInstruction();
          cycles++;
        }
      } catch (err: any) {
        return {
          success: false,
          output,
          error: `emulator faulted at ~${cycles} cycles: ${err?.message || err}`,
          result1: -1,
        };
      }
      try {
        await serviceInboundMessages(this.emulator, this.rexxSysLib, replyPort, dispatchCtx);
      } catch (err: any) {
        // Servicer faults shouldn't kill the script — log + keep
        // running. The worst case is the reply also gets dispatched
        // and ReplyMsg loops back; we cap iterations to bound that.
console.warn('[AREXX] servicer fault during executeRexxScript:', err?.message || err);
      }
      // Has our message been replied? On reply, mn_ReplyPort is
      // typically zeroed and the message lands back on our list.
      // We detect by looking up msgAddr on replyPort's drained
      // history; serviceInboundMessages already replied any pending
      // messages, so if the script terminated rm_Action will be 0
      // and rm_Result1 / rm_Args[1] will be populated.
      const action = this.emulator.readMemory32(msgAddr + 28) >>> 0;
      if (action === 0) {
        // Action cleared by RexxMast on script completion.
        replied = true;
        break;
      }
    }

    if (!replied) {
      return {
        success: false,
        output,
        error: `script did not return within ${MAX_CYCLES} cycles`,
        result1: -1,
      };
    }

    const result1 = this.emulator.readMemory32(msgAddr + 32) | 0;
    let resultStr: string | undefined;
    const arg1 = this.emulator.readMemory32(msgAddr + 44) >>> 0;
    if (arg1 !== 0) {
      const len = this.emulator.readMemory32(arg1 - 4) >>> 0;
      let s = '';
      for (let i = 0; i < Math.min(len, 4096); i++) {
        const b = this.emulator.readMemory(arg1 + i);
        if (b === 0) break;
        s += String.fromCharCode(b);
      }
      resultStr = s;
    }

    // Free the message + its argstrings.
    try { this.rexxSysLib.deleteRexxMsg(msgAddr); } catch { /* best-effort */ }
    try { this.execLibrary.freeMem(stage, scriptText.length + 1); } catch { /* best-effort */ }

    return {
      success: result1 === 0,
      output,
      error: result1 !== 0 ? (resultStr || `script returned ${result1}`) : undefined,
      result1,
    };
  }

  /**
   * Test-only: verify the host port was registered with the expected
   * name. Production code never needs this — Phase 4-real reads from
   * status.hostPortAddr directly when servicing inbound messages.
   */
  _readHostPortName(): string | null {
    if (!this.emulator || this.status.hostPortAddr === 0) return null;
    const nameAddr = this.emulator.readMemory32(this.status.hostPortAddr + 0x0a);
    if (nameAddr === 0) return null;
    let s = '';
    for (let i = 0; i < 64; i++) {
      const b = this.emulator.readMemory(nameAddr + i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
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
      hostPortAddr: 0,
      hostPortName: 'AMIEXPRESS',
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
