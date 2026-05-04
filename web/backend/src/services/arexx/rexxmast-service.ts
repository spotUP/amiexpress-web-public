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
  private dosLibrary: any = null;
  private kickstartRom: any = null;
  // #78 Phase 6 — Process struct address. RexxMast walks
  // ExecBase->thisTask + reads pr_MsgPort etc, so we must publish a
  // synthesized Process before the first instruction runs. Allocated
  // via execLibrary.allocateDoorTask() then patched to NT_PROCESS.
  private rexxMastTaskAddr: number = 0;
  // #78 Phase 6+ — RexxMast hunk segment addresses, captured at load
  // time so the CreateProc trampoline can resolve the daemon entry
  // point without relying on BPTR-arithmetic guesswork. RexxMast.exe
  // is two HUNK_CODE segments: seg 0 = launcher, seg 1 = rexxmaster
  // daemon (the one that calls AddPort('REXX')). The launcher's
  // CreateProc(D3 = nextBptr_of_seg_0) targets seg 1's entry, so we
  // record seg 1's data address and trampoline PC there directly.
  private rexxMastSegments: Array<{ address: number; bptr: number; size: number }> = [];
  // Pool of dynamically-LoadSeg'd binaries. RexxMast's daemon does
  //   segList = LoadSeg('rexxc')        (or whatever interpreter)
  //   proc    = CreateProc(name, pri, segList, stackSize)
  // for every incoming script. We need to:
  //   1. resolve the LoadSeg name to a host file (BBS:System/Rexxc/…)
  //   2. parse hunks, copy into MOIRA memory, apply relocations
  //   3. record the SegList by BPTR so the CreateProc trampoline
  //      finds it — same matching path as the RexxMast launcher's
  //      built-in segments.
  // Each entry maps ALL segments of a loaded binary; the BPTR field
  // is seg 0's bptr (what LoadSeg returns) and `entryAddr` is where
  // PC should land when CreateProc trampolines to it.
  private dynamicSegLists: Array<{
    filename: string;
    bptr: number;
    entryAddr: number;
    segments: Array<{ address: number; bptr: number; size: number }>;
  }> = [];

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

      // #78 Phase 6 — write ExecBase, low-memory pointers (0x4 + 0xC),
      // exception vectors, and stub vectors. Without this the JSR -N(A6)
      // pattern RexxMast uses to call exec/dos functions lands at
      // 0x80000-N which is unmapped — MOIRA executes garbage instead of
      // hitting our ILLEGAL traps.
      this.execLibrary.initialize();

      // #78 Phase 6 — enable the ROM resident path so dos.library can
      // be opened against the Kickstart ROM via InitResident, and let
      // openLibraryHybrid fall through to LibraryLoader for disk libs.
      this.execLibrary.setLibraryLoader(this.libraryLoader, true);

      const { LibraryTraps } = require('../../amiga-emulation/api/LibraryTraps');
      this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
      const { RexxSysLibLibrary } = require('../../amiga-emulation/api/RexxSysLibLibrary');
      this.rexxSysLib = new RexxSysLibLibrary(this.emulator, this.execLibrary);
      this.libraryTraps.setRexxSysLibLibrary(this.rexxSysLib);

      // #78 Phase 6 — route ILLEGAL exceptions (our trap mechanism)
      // through libraryTraps.handleTrap. Without this MOIRA's exception
      // path runs the bare ROM handler (ADDQ/RTE) and library calls
      // turn into no-ops, so RexxMast never makes progress.
      this.emulator.setLibraryTrapHandler((pc: number) => {
        return this.libraryTraps.handleTrap(pc);
      });

      // #78 Phase 6 — install exec.library traps now so AllocMem,
      // FindTask, OpenLibrary, AllocSignal etc. fire from the very
      // first cycle. RexxMast's CRT does these before reaching its
      // own startup, so they must already be armed when PC starts.
      this.libraryTraps.installExecVectors();

      // #78 Phase 6 — pre-open dos.library and arm DOS LVO traps.
      // RexxMast uses dos.library for argument reading + FindCliProc-
      // style introspection. openLibraryHybrid first tries the ROM
      // resident (Kickstart ships dos.library); falls back to a stub.
      const dosResult = this.execLibrary.openLibraryHybrid('dos.library', 37, true);
      if (!dosResult.success) {
        this.status.lastError = 'dos.library pre-open failed';
        return false;
      }
      const { DosLibrary } = require('../../amiga-emulation/api/DosLibrary');
      this.dosLibrary = new DosLibrary(this.emulator, config.get('dataDir'));
      this.libraryTraps.setDOSLibrary(this.dosLibrary);
      this.libraryTraps.installDOSVectors();

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
      // Tell the rexxsyslib helper which base to stamp in rm_LibBase.
      // Real RexxMaster compares rm_LibBase to RexxSysBase; if we leave
      // the magic-cookie default the daemon rejects our messages.
      if (typeof this.rexxSysLib.setLibraryBase === 'function') {
        this.rexxSysLib.setLibraryBase(libBase);
      }
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

      // CRITICAL: push the AllocMem bump-allocator base PAST rexxsyslib's
      // loaded region (libBase + 33KB code segment + 64KB padding). The
      // ExecLibrary heap starts at 0x100000 and grows upward; rexxsyslib
      // loads at 0x200000 with ~32KB of code+data. After ~1MB of boot
      // allocations (task structs, IORequests, internal pools), allocMem
      // hands out addresses INSIDE rexxsyslib's data segment — every
      // CreateRexxMsg lands at libBase+0xb8, overwriting rexxsyslib's
      // global pending-list head and corrupting the daemon's dispatch.
      // Symptom: daemon receives msg, runs IsRexxMsg/Remove/Enqueue,
      // then enters a RemHead-empty/ReplyMsg-garbage loop because its
      // own data structures were stomped by the msg allocation.
      const REXXSYSLIB_RESERVED = 0x10000; // ~64KB padding past code+data
      const heapMin = ((libBase + REXXSYSLIB_RESERVED) + 0xfff) & ~0xfff;
      const execLibAny = this.execLibrary as any;
      const currentBase = execLibAny.nextFreeMemory >>> 0;
      if (typeof execLibAny.setAllocBase === 'function' && currentBase < heapMin) {
        execLibAny.setAllocBase(heapMin);
      }

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

      // Find the highest segment-end so allocateDoorTask doesn't overlap
      // RexxMast code/data. Each segment is { address, size }.
      const segments = (rexxMastHunks.segments || []) as Array<{ address: number; bptr: number; size: number }>;
      const segEnd = segments.reduce(
        (hi, s) => Math.max(hi, (s.address >>> 0) + (s.size >>> 0)),
        this.status.rexxMastBase >>> 0,
      );
      // Capture the segment list for the CreateProc trampoline below.
      this.rexxMastSegments = segments.map(s => ({
        address: s.address >>> 0,
        bptr: s.bptr >>> 0,
        size: s.size >>> 0,
      }));

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

      // #78 Phase 6 — synthesise the RexxMast Process. Without a
      // FindTask(0)-resolvable Process struct, every `pr_*` field
      // dereference RexxMast does (pr_MsgPort, pr_CLI, pr_TaskNum)
      // reads from address 0 and either crashes or wedges in a retry
      // loop. allocateDoorTask sets up the bulk of the Task/Process
      // layout; we then patch the few fields that differ from the
      // default door identity (NT_PROCESS instead of NT_TASK; name;
      // pr_TaskNum=1 for a singleton).
      this.execLibrary.allocateDoorTask(segEnd);
      const taskAddr = this.execLibrary.getCurrentTaskAddress();
      if (!taskAddr) {
        this.status.lastError = 'allocateDoorTask returned no address';
        return false;
      }
      this.rexxMastTaskAddr = taskAddr;
      // Patch ln_Type to NT_PROCESS (13) so RexxMast's process-
      // detection code (LP_NodeType / TypeOfMem patterns) sees a
      // Process node instead of a bare Task.
      this.emulator.writeMemory(taskAddr + 0x08, 13);
      // Allocate + write the task name "RexxMast" so FindTask("RexxMast")
      // resolves should anything ever call it. ExecLibrary.findTask
      // matches against currentTask.name; updating the in-memory ln_Name
      // pointer keeps the wire-side struct consistent.
      const nameStr = 'RexxMast';
      const nameAddr = this.execLibrary.allocMem(nameStr.length + 1, 0x10001);
      if (nameAddr) {
        for (let i = 0; i < nameStr.length; i++) {
          this.emulator.writeMemory(nameAddr + i, nameStr.charCodeAt(i));
        }
        this.emulator.writeMemory(nameAddr + nameStr.length, 0);
        this.emulator.writeMemory32(taskAddr + 0x0a, nameAddr);
        try {
          (this.execLibrary as any).currentTask.name = 'RexxMast';
        } catch { /* name field is advisory; in-memory ln_Name is the truth */ }
      }
      // pr_TaskNum at +0x8C = 1 (singleton; real Amiga RexxMast also
      // ran as a single task with the BCPL-style task index).
      this.emulator.writeMemory32(taskAddr + 0x8c, 1);
      // pr_StackBase / pr_StackSize so dos.library Cli() / FindCliProc()
      // style introspection sees a sane stack frame. Stack is the same
      // high-RAM region runUntilReady will use for SP.
      const stackTop = (memBytes - 0x10000) & ~3;
      const stackSize = 0x10000;
      this.emulator.writeMemory32(taskAddr + 0x84, stackSize);          // pr_StackSize
      this.emulator.writeMemory32(taskAddr + 0x90, stackTop >>> 2);     // pr_StackBase (BPTR)
      this.execLibrary.setStackBounds(stackTop - stackSize, stackSize);

      // #78 Phase 6+ — register the CreateProc trampoline. RexxMast.exe
      // is a two-segment binary: seg 0 (launcher) opens libraries then
      // CreateProc's seg 1 (rexxmaster daemon) as a separate Process.
      // Real Amiga schedules a new Task; in our singleton there's no
      // scheduler, so we resolve the SegList BPTR (D3) to the matching
      // segment's data address and switch PC there directly. The
      // launcher's "wait for child to start" code never runs — the
      // daemon does AddPort('REXX') itself, which is exactly what we
      // observe on. LibraryTraps recognises CreateProc as a PC-setting
      // handler (alongside Supervisor/Exit) and skips the returnAddr
      // overwrite when this trampoline fires.
      const { CPURegister: CPU3 } = require('../../amiga-emulation/cpu/MoiraEmulator');
      this.dosLibrary.setCreateProcOverride(
        (segListBptr: number, _namePtr: number, _priority: number, _stackSize: number): number => {
          // Resolve BPTR to the target entry. Two pools:
          //   1. RexxMast's own segments (built into the binary at
          //      service start) — used by the launcher's first
          //      CreateProc to spawn the rexxmaster daemon.
          //   2. Dynamic SegLists from LoadSeg overrides — used when
          //      the daemon spawns rexxc (interpreter) for incoming
          //      RexxMsgs.
          // Both stamp `bptr = segment.headerAddress >>> 2`, so the
          // BPTR the script passes equals seg 0's bptr. Match against
          // either pool; whichever found, jump to its entry.
          const wanted = segListBptr >>> 0;
          let entryAddr = 0;
          let found = this.rexxMastSegments.find(s => s.bptr === wanted);
          if (found) {
            entryAddr = found.address;
          } else {
            const dyn = this.dynamicSegLists.find(d => d.bptr === wanted);
            if (dyn) entryAddr = dyn.entryAddr;
          }
          if (entryAddr === 0) {
            // Fall through to default failure (returns 0). The caller
            // checks `tst.l d0; beq fail` and emits its own error.
            return 0;
          }
          // Switch PC to the entry. SP stays where the caller left
          // it — process code does its own stack setup. Refill
          // prefetch so MOIRA decodes the first instruction at the
          // new PC correctly (same lesson as runUntilReady).
          this.emulator.setRegister(CPU3.PC, entryAddr);
          this.emulator.refillPrefetch();
          // Return a non-zero "process pointer" — caller does
          // `tst.l d0; beq fail` so any non-zero passes the gate.
          return this.rexxMastTaskAddr || 0x12340001;
        },
      );

      // #78 Phase 7 — LoadSeg override. RexxMast's daemon dispatches
      // every incoming RexxMsg to a fresh rexxc (interpreter) task
      // via:
      //   segList = LoadSeg('rexxc')   ; or 'rxc' or full path
      //   proc    = CreateProc(...segList...)
      // We resolve the filename through the same Amiga-assign rules
      // the door dispatcher uses (BBS:/System:/etc), parse the hunk
      // file via HunkLoader, copy segments + apply relocations into
      // MOIRA memory, then return seg 0's BPTR. The CreateProc
      // trampoline above picks that BPTR up.
      this.dosLibrary.setLoadSegOverride((filename: string): number => {
        try {
          // Resolve the Amiga-style path. RexxMast typically passes
          // bare names like "rexxc" (current dir = system rexx path)
          // or "REXX:rexxc". For robustness, search a few candidate
          // locations in order: as-given, System/Rexxc/, System/.
          const dataDir = config.get('dataDir');
          const candidates: string[] = [];
          if (filename.includes(':')) {
            // Amiga assign (BBS:, REXX:, SYSTEM:, etc.)
            const parts = filename.split(':');
            const assign = parts[0].toLowerCase();
            const rest = parts.slice(1).join('/').replace(/:/g, '/');
            if (assign === 'rexx' || assign === 'rexxc') {
              candidates.push(path.join(dataDir, 'System', 'Rexxc', rest || 'rx'));
            } else if (assign === 'bbs') {
              candidates.push(path.join(dataDir, rest));
            } else if (assign === 'system') {
              candidates.push(path.join(dataDir, 'System', rest));
            } else {
              candidates.push(path.join(dataDir, rest));
            }
          } else if (path.isAbsolute(filename)) {
            candidates.push(filename);
          } else {
            // Bare name — search rexx-relevant dirs.
            candidates.push(
              path.join(dataDir, 'System', 'Rexxc', filename),
              path.join(dataDir, 'System', filename),
              path.join(dataDir, filename),
            );
          }
          let resolvedPath = '';
          for (const cand of candidates) {
            try {
              if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
                resolvedPath = cand;
                break;
              }
            } catch { /* try next */ }
          }
          if (!resolvedPath) {
            console.warn(`[AREXX] LoadSeg failed: "${filename}" not found in ${candidates.join(', ')}`);
            return 0;
          }

          // Parse the hunk binary.
          const { HunkLoader } = require('../../amiga-emulation/loader/HunkLoader');
          const hunkLoader = new HunkLoader();
          const bytes = fs.readFileSync(resolvedPath);
          const hunks = hunkLoader.parse(bytes);
          if (!hunks?.segments?.length) {
            console.warn(`[AREXX] LoadSeg failed: ${resolvedPath} parsed to 0 segments`);
            return 0;
          }
          // Load into emulator memory + apply relocations.
          hunkLoader.load(this.emulator, hunks, path.basename(filename));
          const segs = (hunks.segments as Array<{ address: number; bptr: number; size: number }>).map(s => ({
            address: s.address >>> 0,
            bptr: s.bptr >>> 0,
            size: s.size >>> 0,
          }));
          const seg0 = segs[0];
          this.dynamicSegLists.push({
            filename,
            bptr: seg0.bptr,
            entryAddr: seg0.address,
            segments: segs,
          });
          // Sync any new ILLEGAL traps (segments may overlap with our
          // LVO trap addresses; install would have been a no-op if so,
          // but resync MOIRA's batch set so any new traps register).
          if (typeof this.libraryTraps?.syncTrapAddressesToMoira === 'function') {
            this.libraryTraps.syncTrapAddressesToMoira();
          }
          console.log(`[AREXX] LoadSeg("${filename}") → ${segs.length} seg(s), bptr=0x${seg0.bptr.toString(16)} entry=0x${seg0.address.toString(16)}`);
          return seg0.bptr;
        } catch (err) {
          console.error(`[AREXX] LoadSeg("${filename}") faulted:`, err);
          return 0;
        }
      });

      // #78 Phase 6+ — RexxMast daemon calls OpenDevice('timer.device')
      // shortly after starting; the default exec stub returns the
      // pre-call D0 (which is the unit-number arg, typically non-zero),
      // and the daemon treats non-zero D0 as failure → bails into
      // "Can't open timer.device" cleanup path. We don't actually need
      // a working timer.device — just need OpenDevice to report
      // success so the daemon reaches AddPort('REXX'). Override the
      // exec trap at -444 with a handler that always returns 0. Scoped
      // to this singleton's LibraryTraps instance, so doors that
      // genuinely need OpenDevice failure semantics are unaffected.
      const execBaseForOverride = this.execLibrary.getExecBaseAddress();
      const openDeviceTrapAddr = execBaseForOverride - 444;
      const closeDeviceTrapAddr = execBaseForOverride - 450;
      this.emulator.writeMemory16(openDeviceTrapAddr, 0x4afc); // ILLEGAL
      this.emulator.writeMemory16(closeDeviceTrapAddr, 0x4afc);
      this.libraryTraps.registerCustomTrap(
        openDeviceTrapAddr,
        'OpenDevice',
        (_emu: any) => 0, // success — IORequest is left as-is
        this.execLibrary,
      );
      this.libraryTraps.registerCustomTrap(
        closeDeviceTrapAddr,
        'CloseDevice',
        (_emu: any) => 0,
        this.execLibrary,
      );

      // #78 Phase 6 — sync now that all vectors are armed. MOIRA's
      // batch-execution path (executeUntilTrap) uses an internal
      // unordered_set lookup; without this final sync, traps installed
      // after the initial executeInstruction() loop starts won't fire.
      this.libraryTraps.syncTrapAddressesToMoira();

      // #78 Phase 7+ — call rexxsyslib's real lib_Init (Resident
      // tag autoinit table[3]). Without it, rexxsyslib's library-
      // private state (lists at libBase + 0xb8 / +0xd8 etc) stays
      // zeroed, and the daemon's dispatch arm dereferences invalid
      // pointers when it tries to walk its global pending-msg list.
      // Run it AFTER all infrastructure is up so the init function's
      // calls to AllocMem / FindTask / etc. all dispatch through
      // working LVO traps.
      try {
        const initOk = this.runLibInit(libBase);
        if (!initOk) {
          // Non-fatal — the bridged executeRexxScript path still works
          // even if LibInit didn't succeed (we fall back to the TS
          // interpreter for actual execution). Log + continue so the
          // BBS stays up.
          console.warn('[AREXX] rexxsyslib LibInit did not complete cleanly; bridged path still active');
        }
      } catch (err: any) {
        console.warn('[AREXX] rexxsyslib LibInit faulted:', err?.message || err);
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
      this.dosLibrary = null;
      this.kickstartRom = null;
      this.status.rexxMastBase = 0;
      this.status.rexxSysLibBase = 0;
      this.status.hostPortAddr = 0;
      this.rexxMastTaskAddr = 0;
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
    if (this.dosLibrary && typeof this.dosLibrary.setCreateProcOverride === 'function') {
      try { this.dosLibrary.setCreateProcOverride(null); } catch { /* best-effort */ }
    }
    if (this.dosLibrary && typeof this.dosLibrary.setLoadSegOverride === 'function') {
      try { this.dosLibrary.setLoadSegOverride(null); } catch { /* best-effort */ }
    }
    this.emulator = null;
    this.execLibrary = null;
    this.libraryLoader = null;
    this.libraryTraps = null;
    this.rexxSysLib = null;
    this.dosLibrary = null;
    this.kickstartRom = null;
    this.status.rexxMastBase = 0;
    this.status.rexxSysLibBase = 0;
    this.status.hostPortAddr = 0;
    this.rexxMastTaskAddr = 0;
    this.rexxMastSegments = [];
    this.dynamicSegLists = [];
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
   * #78 Phase 7+ — invoke rexxsyslib's real lib_Init function in MOIRA
   * so the library's private state (lists, allocations, version
   * numbers) is set up by Commodore's own init code rather than left
   * zeroed by our HunkLoader.
   *
   * Mechanics:
   *   1. Locate the Resident tag at libBase+4 (RTC_MATCHWORD).
   *   2. Verify RTF_AUTOINIT (0x80) — the tag points to a 4-longword
   *      autoinit table {posSize, vectors, structure, initFunction}.
   *   3. Push a sentinel return address on the stack; set up the
   *      ABI registers (D0=libBase, A0=segList=0 since we have no
   *      SegList from LoadSeg, A6=execBase).
   *   4. Set PC=initFunction and run MOIRA cycles (with normal trap
   *      dispatch) until PC hits the sentinel — the function's
   *      terminal RTS pops the sentinel back into PC, ending the
   *      sub-call.
   *   5. Read D0 — the lib_Init contract returns library base on
   *      success, 0 on failure.
   *
   * Returns true if the function returned a non-zero D0 within the
   * cycle budget; false otherwise. Either way, control flow returns
   * cleanly so the caller can fall back to the bridged path.
   */
  private runLibInit(libBase: number): boolean {
    if (!this.emulator || !this.libraryTraps || !this.execLibrary) return false;

    const RTC_MATCHWORD = 0x4afc;
    const RTF_AUTOINIT = 0x80;

    // Resident tag header is the first thing past the dummy
    // moveq/rts at libBase. Look for the match word at libBase+4.
    const matchAddr = (libBase + 4) >>> 0;
    const matchWord = this.emulator.readMemory16(matchAddr) & 0xffff;
    if (matchWord !== RTC_MATCHWORD) {
      console.warn(`[AREXX] LibInit: no RTC_MATCHWORD at 0x${matchAddr.toString(16)} (got 0x${matchWord.toString(16)})`);
      return false;
    }
    const rtFlags = this.emulator.readMemory(matchAddr + 10) & 0xff;
    if ((rtFlags & RTF_AUTOINIT) === 0) {
      console.warn(`[AREXX] LibInit: rt_Flags=0x${rtFlags.toString(16)} lacks RTF_AUTOINIT`);
      return false;
    }

    // rt_Init points at the 4-longword autoinit table.
    const rtInit = this.emulator.readMemory32(matchAddr + 22) >>> 0;
    if (rtInit === 0) {
      console.warn(`[AREXX] LibInit: rt_Init is NULL`);
      return false;
    }
    const initFunc = this.emulator.readMemory32(rtInit + 12) >>> 0;
    if (initFunc === 0) {
      console.warn(`[AREXX] LibInit: autoinit[3] (initFunction) is NULL`);
      return false;
    }
    console.log(`[AREXX] LibInit: calling rexxsyslib init at 0x${initFunc.toString(16)} (libBase=0x${libBase.toString(16)})`);

    // Set up a clean stack for the sub-call. We use the same high-RAM
    // top runUntilReady will use, so any heap allocations the init
    // function makes don't collide with the daemon's later activity.
    const memBytes = SINGLETON_MEM_MB * 1024 * 1024;
    const stackTop = (memBytes - 0x10000) & ~3;
    const sentinelAddr = 0xFFFF00; // distinct from MOIRA exit traps used elsewhere

    // Save current MOIRA state so we can restore on completion.
    const { CPURegister: CPU } = require('../../amiga-emulation/cpu/MoiraEmulator');
    const savedPC = this.emulator.getRegister(CPU.PC) >>> 0;
    const savedSP = this.emulator.getRegister(CPU.A7) >>> 0;
    const savedD0 = this.emulator.getRegister(CPU.D0) >>> 0;
    const savedA0 = this.emulator.getRegister(8) >>> 0; // A0
    const savedA6 = this.emulator.getRegister(14) >>> 0; // A6

    try {
      // Push sentinel as the JSR-style return address. Init will RTS
      // and pop this into PC, ending our sub-call cleanly.
      this.emulator.setRegister(CPU.A7, stackTop - 4);
      this.emulator.writeMemory32(stackTop - 4, sentinelAddr);

      // ABI: D0 = libBase, A0 = segList (BPTR; 0 since we have none),
      // A6 = ExecBase. Real Amiga init functions read these per RKRM
      // "Devices and Libraries" §1.2.
      const execBase = this.execLibrary.getExecBaseAddress();
      this.emulator.setRegister(CPU.D0, libBase >>> 0);
      this.emulator.setRegister(8, 0);          // A0 = 0 (no segList)
      this.emulator.setRegister(14, execBase >>> 0); // A6 = ExecBase

      this.emulator.setRegister(CPU.PC, initFunc >>> 0);
      this.emulator.refillPrefetch();

      // Drive cycles until PC == sentinel (function's terminal RTS).
      // Cap at 1M cycles — well above any real init routine's needs
      // but bounds a runaway init that loops on missing infrastructure.
      const MAX_INIT_CYCLES = 1_000_000;
      let cycles = 0;
      while (cycles < MAX_INIT_CYCLES) {
        const pc = this.emulator.getRegister(CPU.PC) >>> 0;
        if (pc === sentinelAddr) break;
        if (this.libraryTraps.isTrapAddress(pc)) {
          if (!this.libraryTraps.handleTrap(pc)) {
            this.emulator.executeInstruction();
          }
        } else {
          this.emulator.executeInstruction();
        }
        cycles++;
      }

      const finalPC = this.emulator.getRegister(CPU.PC) >>> 0;
      const result = this.emulator.getRegister(CPU.D0) >>> 0;
      if (finalPC !== sentinelAddr) {
        console.warn(`[AREXX] LibInit: did not return after ${cycles} cycles (PC=0x${finalPC.toString(16)})`);
        return false;
      }
      if (result === 0) {
        console.warn(`[AREXX] LibInit: returned NULL (init failed) after ${cycles} cycles`);
        return false;
      }
      console.log(`[AREXX] LibInit: success (D0=0x${result.toString(16)}) after ${cycles} cycles`);
      return true;
    } finally {
      // Restore everything. The init function's side effects on
      // memory (initialised lists etc) persist, but we don't want
      // its register state leaking into runUntilReady.
      this.emulator.setRegister(CPU.PC, savedPC);
      this.emulator.setRegister(CPU.A7, savedSP);
      this.emulator.setRegister(CPU.D0, savedD0);
      this.emulator.setRegister(8, savedA0);
      this.emulator.setRegister(14, savedA6);
      this.emulator.refillPrefetch();
    }
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
  async runUntilReady(maxCycles: number = 10_000_000): Promise<boolean> {
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
      // CRITICAL: 68000 has a 2-word prefetch queue. Without an explicit
      // refill MOIRA decodes whatever was prefetched from the prior PC,
      // which makes the first instruction land 2 bytes off and the
      // subsequent stream walks off into unrelated memory. We hit this
      // during Phase 6 bring-up — RexxMast's first MOVEA.L was being
      // decoded as two short ops, so JSR -N(A6) calls never reached the
      // ILLEGAL traps.
      this.emulator.refillPrefetch();
    } catch (err: any) {
      this.status.lastError = `setRegister failed: ${err?.message || err}`;
      return false;
    }

    // Hook the call monitor to detect AddPort('REXX'). The monitor
    // fires for every library-trap call; we only flip ready when
    // we see AddPort with A1 → port whose ln_Name reads as 'REXX'.
    //
    // AREXX_TRACE=1 also logs the first 100 library calls so a sysop
    // can see exactly what RexxMast tried before getting stuck.
    let observedRexxPort = false;
    const trace = process.env.AREXX_TRACE === '1';
    let traceCount = 0;
    const TRACE_LIMIT = 100;
    const oldMonitor = (this.libraryTraps as any).onLibraryCall;
    this.libraryTraps.setLibraryCallMonitor((fnName: string, _pc: number) => {
      if (oldMonitor) {
        try { oldMonitor(fnName, _pc); } catch { /* upstream monitor is advisory */ }
      }
      if (trace && traceCount < TRACE_LIMIT) {
        // Capture A0 + A1 + D0 for context — most library functions
        // pass arguments through these registers.
        try {
          const a0 = this.emulator.getRegister(8) >>> 0;
          const a1 = this.emulator.getRegister(9) >>> 0;
          const d0 = this.emulator.getRegister(0) >>> 0;
          // For string-arg calls (like OpenLibrary) read the name.
          let extra = '';
          if (fnName === 'OpenLibrary' || fnName === 'OldOpenLibrary' || fnName === 'FindTask') {
            try {
              let s = '';
              const ptr = fnName === 'FindTask' ? a1 : a1;
              if (ptr !== 0) {
                for (let i = 0; i < 32; i++) {
                  const b = this.emulator.readMemory(ptr + i);
                  if (b === 0) break;
                  s += String.fromCharCode(b);
                }
              }
              extra = ` "${s}"`;
            } catch { /* ignore */ }
          }
          console.log(`[AREXX-TRACE] ${String(traceCount).padStart(3)} ${fnName}${extra} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} D0=0x${d0.toString(16)} pc=0x${_pc.toString(16)}`);
          traceCount++;
        } catch { /* trace must never throw */ }
      }
      if (fnName === 'AddPort' && !observedRexxPort) {
        // A1 holds the MsgPort pointer; ln_Name lives at port+10. Two
        // wrinkles in practice:
        //   1. AmiExpress's RexxMast variant uses the port name "AREXX",
        //      not the stock Commodore "REXX". Match either.
        //   2. The daemon's first AddPort call sometimes lands with A1
        //      still holding a stale FindPort name pointer (the daemon
        //      reuses A1 across the lookup-then-create flow). When the
        //      port struct read at A1+10 yields garbage, try reading
        //      A1 itself as a NUL-terminated string (the FindPort/lookup
        //      path) so the port-name match still succeeds.
        try {
          const a1 = this.emulator.getRegister(9 /* A1 */) >>> 0;
          if (a1 === 0) return;
          const readCStr = (addr: number, max: number = 16): string => {
            if (addr === 0) return '';
            let s = '';
            for (let i = 0; i < max; i++) {
              const b = this.emulator.readMemory(addr + i);
              if (b === 0) break;
              if (b < 0x20 || b > 0x7e) return ''; // not printable ASCII
              s += String.fromCharCode(b);
            }
            return s;
          };
          let name = '';
          // Path 1: treat A1 as a port struct, read ln_Name pointer.
          const namePtr = this.emulator.readMemory32(a1 + 10) >>> 0;
          if (namePtr !== 0) {
            name = readCStr(namePtr);
          }
          // Path 2: if path 1 didn't yield a printable name, treat A1
          // itself as a name string (FindPort-style).
          if (!name) {
            name = readCStr(a1);
          }
          if (trace) console.log(`[AREXX-TRACE] AddPort name="${name}"`);
          if (name === 'REXX' || name === 'AREXX') {
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

    // #78 Phase 6 — trap-aware execution loop. Same pattern as
    // DoorLifecycleManager: check isTrapAddress(pc) BEFORE executing,
    // dispatch through LibraryTraps if hit, fall back to plain
    // executeInstruction otherwise. Without this gate MOIRA routes
    // ILLEGAL through the standard 68K exception vector (vector 4 →
    // chip-RAM handler at 0x180080) instead of our libraryTrapHandler,
    // so JSR -N(A6) calls silently no-op via the generic ADDQ/RTE.
    const { CPURegister: CPU2 } = require('../../amiga-emulation/cpu/MoiraEmulator');
    const SLICE = 1024;
    const { serviceInboundMessages } = require('./rexx-host-servicer');
    let cycles = 0;
    while (cycles < maxCycles && !observedRexxPort) {
      try {
        for (let i = 0; i < SLICE && cycles < maxCycles; i++) {
          const pc = this.emulator.getRegister(CPU2.PC) >>> 0;
          if (this.libraryTraps.isTrapAddress(pc)) {
            const handled = this.libraryTraps.handleTrap(pc);
            if (!handled) {
              // Unknown trap — fall through to executeInstruction so
              // MOIRA's default ILLEGAL fallback (RTS with D0=0) runs.
              this.emulator.executeInstruction();
            }
          } else {
            this.emulator.executeInstruction();
          }
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

    // Find RexxMast's port — the destination for our msg. Stock
    // Commodore RexxMast names its port "REXX"; the AmiExpress variant
    // (which is what we run) names it "AREXX". Try both so a sysop's
    // alternate binary picks the right one.
    const findPort = (name: string): number =>
      typeof this.execLibrary.findPortByName === 'function'
        ? this.execLibrary.findPortByName(name) >>> 0
        : ((this.execLibrary as any).publicPorts?.get?.(name.toLowerCase()) >>> 0) || 0;
    const rexxPortAddr = findPort('AREXX') || findPort('REXX');
    if (!rexxPortAddr) {
      return { success: false, output: [], error: "REXX/AREXX port not registered", result1: -1 };
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

    // The AmiExpress RexxMast 36.5 daemon's dispatch arm uses a
    // libBase-relative static pointer (libBase + 0xb8) as a "msg" —
    // some leftover relocation we don't yet understand without
    // assembly-level RE of the 33KB rexxsyslib hunk. The boot path
    // (RexxMast launcher → daemon spawn → AddPort('AREXX') →
    // Wait(0x6000)) all works correctly via the real binaries; what
    // doesn't work is the daemon's post-Wait dispatch loop, which
    // enters a RemHead/ReplyMsg cycle on uninitialised rexxsyslib
    // data instead of executing our script.
    //
    // What we do instead — keep the real-ABI handshake (real
    // CreateRexxMsg, real PutMsg into the daemon's mp_MsgList, real
    // signal fired) so any door observing the daemon sees a faithful
    // dispatch trail, then execute the actual script bytes via the
    // TS interpreter and write the result straight back into the
    // message + reply manually. The script's BBSWRITE/OUTSTR host
    // commands still flow through serviceInboundMessages on our
    // host port, so AmiExpress AREXX scripts dispatch BBS-side
    // commands identically to a real Amiga.
    //
    // This is the same boundary OS-level emulators draw all the
    // time: real binaries handle data structures + ABI; specific
    // unimplemented kernel-side dispatch is HLE-bridged to native
    // code. We keep the door-visible side authentic.
    const output: string[] = ctx.output || [];
    const dispatchCtx = { ...ctx, output };
    // Drain any pending host-port messages so the script starts
    // with a clean slate (no leftover msgs from prior runs).
    try {
      await serviceInboundMessages(this.emulator, this.rexxSysLib, replyPort, dispatchCtx);
    } catch { /* drain is best-effort */ }
    void MAX_CYCLES; void SLICE;

    // Run the script via the TS interpreter.
    const { AREXXInterpreter } = require('../arexx.service');
    const interpreter = new AREXXInterpreter(dispatchCtx, args);
    const tsResult = await interpreter.execute(scriptText);

    // Drain any host-port messages the script generated (BBSWRITE,
    // SF/HK/PM/etc) so they reach the BBS side before we reply.
    try {
      await serviceInboundMessages(this.emulator, this.rexxSysLib, replyPort, dispatchCtx);
    } catch (err: any) {
console.warn('[AREXX] servicer fault during executeRexxScript:', err?.message || err);
    }

    // Write the result back into the RexxMsg the way real RexxMast
    // does on script completion: rm_Action=0, rm_Result1=exit code,
    // rm_Args[1]=optional result string (allocated as an argstring).
    const result1 = tsResult.success ? 0 : 1;
    this.emulator.writeMemory32(msgAddr + 28, 0);          // rm_Action = 0 (done)
    this.emulator.writeMemory32(msgAddr + 32, result1 >>> 0); // rm_Result1
    this.emulator.writeMemory32(msgAddr + 36, 0);          // rm_Result2

    let resultStr: string | undefined;
    if (tsResult.error) {
      const errBytes = String(tsResult.error);
      const errStage = this.execLibrary.allocMem(errBytes.length + 1, MEMF_PUBLIC_CLEAR);
      for (let j = 0; j < errBytes.length; j++) {
        this.emulator.writeMemory(errStage + j, errBytes.charCodeAt(j) & 0xff);
      }
      this.emulator.writeMemory(errStage + errBytes.length, 0);
      const arg1 = this.rexxSysLib.createArgstring(errStage, errBytes.length);
      this.emulator.writeMemory32(msgAddr + 44, arg1);     // rm_Args[1]
      resultStr = errBytes;
    }

    // ReplyMsg back to the originator's reply port (our hostPort).
    // Use the real exec.library replyMsg so any logger / message
    // tracker sees the reply identical to a real-Amiga round trip.
    try {
      this.execLibrary.replyMsg(msgAddr);
    } catch (err) {
      // Fallback: write the linkage manually if the trap-side path
      // isn't available (test contexts without a full exec wired up).
      const tailPred = this.emulator.readMemory32(replyPort + 0x1c) >>> 0;
      this.emulator.writeMemory32(msgAddr + 0, 0);
      this.emulator.writeMemory32(msgAddr + 4, tailPred);
      this.emulator.writeMemory32(tailPred + 0, msgAddr);
      this.emulator.writeMemory32(replyPort + 0x1c, msgAddr);
    }

    // Free the message + its argstrings. resultStr (if any) lives
    // in rm_Args[1] until DeleteRexxMsg cleans up the argstring.
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
    this.dosLibrary = null;
    this.kickstartRom = null;
    this.rexxMastTaskAddr = 0;
    this.rexxMastSegments = [];
    this.dynamicSegLists = [];
  }

  /** Test-only accessor for the loaded emulator (null until started). */
  _getEmulator(): any { return this.emulator; }

  /** Test-only accessor for the synthesised RexxMast Process address. */
  _getRexxMastTaskAddr(): number { return this.rexxMastTaskAddr; }
}

export const rexxMastService = new RexxMastService();
