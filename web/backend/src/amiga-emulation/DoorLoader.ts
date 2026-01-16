// DoorLoader.ts
// Extracted from AmigaDoorSession.ts - Phase 3: Door Loading and Execution
// Handles Amiga door binary loading, HUNK parsing, and CPU register setup
// 2025-11-20

import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { DoorConfig } from "./DoorTypes.js";
import * as fs from "fs";
import * as amigafs from "../utils/amigafs";
import * as path from "path";
import { notifySysop } from "../utils/sysop-alert.util.js";
import { SysopDebugUtil } from "../utils/sysop-debug.util.js";
import { DoorLogger } from "./DoorLogger.js";
import { SharedBBSData } from "./structures/GlobalStructures.js";
import { debugLog } from '../utils/debug-log';

export class DoorLoader {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private config: DoorConfig;
  private stackBaseAddr: number = 0;
  private stackSizeBytes: number = 0;
  private readonly exitTrapAddress = 0x1ff000;
  private logger: DoorLogger | null = null;
  private sharedBBSData: SharedBBSData | null = null;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    config: DoorConfig,
    logger?: DoorLogger
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.config = config;
    this.logger = logger || null;
  }

  /**
   * Load door executable into emulator memory
   */
  async loadDoor(): Promise<void> {
    // Reset signal allocation for fresh door execution context
    // On real Amiga, each task has its own signal allocation. Our emulator
    // uses a shared pool that gets exhausted during XIM port initialization.
    // Reset it here so doors can allocate signals for their own MsgPorts.
    this.execLibrary.resetSignalsForDoor();

    // Write fresh random seed for doors that need entropy
    // This must be done per-door, not once at startup
    const randomSeed = (Date.now() & 0xFFFFFFFF) ^ (Math.random() * 0xFFFFFFFF >>> 0);
    console.log(`[DoorLoader] Writing random seed 0x${randomSeed.toString(16)} to 0x400`);
    this.emulator.writeMemory32(0x00000400, randomSeed);
    // Verify it was written
    const readBack = this.emulator.readMemory32(0x00000400);
    console.log(`[DoorLoader] Read back: 0x${readBack.toString(16)}`);

    // Read door binary (use amigafs for case-insensitive path resolution)
    let binary: Buffer;
    let executablePath = this.config.executablePath;

    // CRITICAL FIX: If path is a directory, look for executable inside
    // Many .info files have LOCATION=DoorName instead of LOCATION=DoorName/DoorName
    // Example: Bossnuke.info has LOCATION=Bossnuke, but executable is Bossnuke/BossNuke
    // Example: FR.info has LOCATION=AquaScan, but executable is AquaScan/AquaScan.020
    try {
      const stats = amigafs.statSync(executablePath);
      if (stats.isDirectory()) {
        // Path is a directory - look for executable with matching name
        const dirName = path.basename(executablePath);

        // Check common door binary patterns
        const candidates = [
          path.join(executablePath, dirName), // Exact match (Bossnuke/Bossnuke)
          path.join(executablePath, dirName.toLowerCase()), // Lowercase (Bossnuke/bossnuke)
          path.join(executablePath, dirName.toUpperCase()), // Uppercase (Bossnuke/BOSSNUKE)
          path.join(executablePath, `${dirName}.020`), // 68020 version (AquaScan/AquaScan.020)
          path.join(executablePath, `${dirName}.000`), // 68000 version (AquaScan/AquaScan.000)
          path.join(executablePath, `${dirName.toLowerCase()}.020`),
          path.join(executablePath, `${dirName.toLowerCase()}.000`),
          path.join(executablePath, `${dirName.toUpperCase()}.020`),
          path.join(executablePath, `${dirName.toUpperCase()}.000`),
        ];

        let found = false;
        for (const candidate of candidates) {
          if (amigafs.existsSync(candidate)) {
            const candidateStats = amigafs.statSync(candidate);
            if (candidateStats.isFile()) {
              debugLog(`[DoorLoader] Resolved directory ${executablePath} to executable: ${candidate}`);
              executablePath = candidate;
              found = true;
              break;
            }
          }
        }

        if (!found) {
          throw new Error(`LOCATION points to directory ${executablePath} but no matching executable found (tried: ${candidates.join(', ')})`);
        }
      }
    } catch (error) {
      // If stat fails, let readFileSync handle it and throw the error
      const socket = this.config.bbsSession?.socket;
      SysopDebugUtil.debugFileError(
        socket,
        this.config.bbsSession,
        'stat',
        executablePath,
        error as Error
      );
      throw error;
    }

    try {
      binary = amigafs.readFileSync(executablePath) as Buffer;
    } catch (error) {
      const socket = this.config.bbsSession?.socket;
      SysopDebugUtil.debugFileError(
        socket,
        this.config.bbsSession,
        'read',
        executablePath,
        error as Error
      );
      this.logger?.error(`Failed to read binary: ${executablePath}`);
      throw error;
    }
debugLog(`[DoorLoader] Door binary size: ${binary.length} bytes`);
    this.logger?.info(`Binary loaded: ${binary.length} bytes`);

    // Parse Amiga HUNK format
    const hunkLoader = new HunkLoader();
    const hunkFile = hunkLoader.parse(Buffer.from(binary));

debugLog(`[DoorLoader] Parsed ${hunkFile.segments.length} segments:`);
    this.logger?.info(`Parsed ${hunkFile.segments.length} segments`);
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const seg = hunkFile.segments[i];
      const segInfo = `Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(16)}, size=${seg.size} bytes`;
debugLog(`  ${segInfo}`);
      this.logger?.log('HUNK', segInfo);

      // Register CODE segments for self-modifying code detection
      if (seg.type.toUpperCase() === 'CODE') {
        this.emulator.registerCodeRegion(seg.address, seg.size);
      }
    }

    // Load segments into memory (pass fileName for synthetic relocations)
    hunkLoader.load(this.emulator, hunkFile, this.config.executablePath);

    // CRITICAL: Allocate door Task structure AFTER door segments to avoid overlap
    // Find the highest address used by door segments
    let highestSegmentEnd = 0;
    for (const seg of hunkFile.segments) {
      const segEnd = seg.address + seg.size;
      if (segEnd > highestSegmentEnd) {
        highestSegmentEnd = segEnd;
      }
    }

    // Allocate Task structure dynamically after door segments
    this.execLibrary.allocateDoorTask(highestSegmentEnd);

debugLog(
      `[DoorLoader] Door loaded at entry point: 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );
    this.logger?.info(`Entry point: 0x${hunkFile.entryPoint.toString(16)}`);

    // Initialize SharedBBSData for CommandsStructure access
    // RTW and other XIM doors expect A5-88 to point to CommandsStructure
    this.sharedBBSData = new SharedBBSData(this.emulator, 0xF00300);
    this.sharedBBSData.writeBBSData(this.config.bbsSession || {});
debugLog(`[DoorLoader] SharedBBSData initialized at 0x${this.sharedBBSData.getCmdsAddr().toString(16)}`);

    // Set up CPU for door execution
    this.setupCpuRegisters(hunkFile);

    // CRITICAL: Enable 100x overclocking for door execution speed
    // Without this, doors run at native 68000 speed (~1-2 seconds per XIM message)
    const overclockFactor = this.config.overclockFactor ?? 100;
    if (this.emulator.setOverclocking) {
      this.emulator.setOverclocking(overclockFactor);
debugLog(`[DoorLoader] Overclocking set to ${overclockFactor}x`);
    } else {
debugLog(`[DoorLoader] WARNING: setOverclocking not available - door will run at native speed`);
    }

    // Prefill the 68000 instruction queue
    this.emulator.refillPrefetch();
  }

  /**
   * Set up CPU registers for door execution
   */
  private setupCpuRegisters(hunkFile: any): void {
debugLog("[DoorLoader] Setting up CPU registers...");

    // Cache segment metadata up front for SAS/C style setup
    const codeSegment = hunkFile.segments.find(
      (s: any) => s.type.toUpperCase() === "CODE"
    );
    const dataSegment = hunkFile.segments.find(
      (s: any) => s.type.toUpperCase() === "DATA"
    );
    const dataBase = dataSegment ? dataSegment.address : 0;
    this.stackSizeBytes = Math.max(4096, this.config.stack || 65536);
    // Place stack AFTER last segment (like vamos does), not at hardcoded address
    // This prevents startup code from zeroing our stack/exit trap
    // For CODE+DATA programs: after DATA. For CODE-only: after CODE.
    let lastSegmentEnd = 0x10000; // fallback
    if (dataSegment) {
      lastSegmentEnd = dataSegment.address + dataSegment.data.length;
    } else if (codeSegment) {
      lastSegmentEnd = codeSegment.address + codeSegment.data.length;
    }
    // Align to 8 bytes and add small gap (vamos uses ~20 bytes gap)
    this.stackBaseAddr = ((lastSegmentEnd + 32) + 7) & ~7;
debugLog(`  Stack: lower=0x${this.stackBaseAddr.toString(16)}, upper=0x${(this.stackBaseAddr + this.stackSizeBytes).toString(16)} (after segment end 0x${lastSegmentEnd.toString(16)})`);

    // Match vamos startup: user mode, Z flag set from zeroed D registers
    this.emulator.setRegister(17, 0x0000); // SR (Status Register)
debugLog(`  SR: 0x0000 (user mode)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr); // A6 = ExecBase
debugLog(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    // Set up CLI/argument string similar to AmigaDOS
    // CRITICAL: Default to 1, not 0, to match AEDoorPort naming convention
    const nodeId = this.config.bbsSession?.nodeId || 1;
    const doorType = (this.config.doorType || "").toUpperCase();
    // AmiExpress uses SystemTagList("door node").
    // However, if we know the command alias (doorId from doorCommand), we should use that
    // as the program name so doors like AquaScan can detect which command invoked them.
    // Otherwise fallback to executable basename.
    const sessionCommand = this.config.bbsSession?.doorCommand;
debugLog(`[DoorLoader] sessionCommand="${sessionCommand}" type=${typeof sessionCommand} bbsSession=${!!this.config.bbsSession}`);
    const progName = (sessionCommand && typeof sessionCommand === 'string')
      ? sessionCommand.toUpperCase()
      : path.basename(this.config.executablePath);
debugLog(`[DoorLoader] progName="${progName}" (from sessionCommand="${sessionCommand}" or basename)`);

    let customArgs: string[] = [];
    const configArgs = Array.isArray(this.config.args) ? this.config.args : [];
    if (configArgs.length > 0) {
      // User provided explicit args - use those for any door type
      customArgs = [...configArgs];
debugLog(`[DoorLoader] Door with explicit args: ${JSON.stringify(customArgs)}`);
    } else {
      // Default CLI for all doors: pass node number (matches express.e tooling)
      // This is critical for XIM doors which use the node number to find AEDoorPort{node}
      // express.e: StringF(doorPort,'\s\d','AEDoorPort',node)
      customArgs = [nodeId.toString()];
debugLog(`[DoorLoader] Door with default args: ["${nodeId}"] (node number for AEDoorPort${nodeId})`);
    }
    const argStringBase = customArgs.join(" ").trim();
    // AmigaDOS requires argument string to be terminated with newline (0x0A), NOT null
    // This is critical - many doors check the argument length and parse differently
    // vamos shows: args: '1' (2) - the newline is INCLUDED in the length
    const argString = argStringBase + "\n";
debugLog(`[DoorLoader] Building CLI args for doorType=${doorType} from config.args=${JSON.stringify(this.config.args || [])} -> "${argStringBase}" (len=${argString.length} with newline)`);
    const ARG_STRING_ADDR = 0x0f0100;
    const ARG_BSTR_ADDR = ARG_STRING_ADDR + 0x100;

    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_STRING_ADDR + i, argString.charCodeAt(i));
    }
    // Null-terminate after the newline for safety (some code may expect it)
    this.emulator.writeMemory(ARG_STRING_ADDR + argString.length, 0);
    // Build BSTR for Amiga E runtime (-32(a5) expects this)
    this.emulator.writeMemory(ARG_BSTR_ADDR, argString.length);
    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_BSTR_ADDR + 1 + i, argString.charCodeAt(i));
    }

    // AmigaDOS process startup registers (from vamos dos/run.py):
    // D0 = arg_len (length of argument string, NOT argc)
    // A0 = arg_ptr (pointer to argument string)
    // D2 = stack_size
    // AmigaDOS startup passes the raw argument length in D0 (even for XIM doors).
    // Some earlier hacks zeroed this for XIM, which makes doors think they have no CLI.
    // Keep it faithful: D0 = length of the argument string.
    const argLen = argString.length;
    this.emulator.setRegister(0, argLen); // D0 = length of arg string
    this.emulator.setRegister(1, 0); // D1 = 0 at startup
    this.emulator.setRegister(2, this.stackSizeBytes); // D2 = stack size
    // D3 = random seed for doors that need entropy (changes each run)
    const randomSeed = (Date.now() & 0xFFFFFFFF) ^ ((Math.random() * 0xFFFFFFFF) >>> 0);
    this.emulator.setRegister(3, randomSeed); // D3 = random seed
debugLog(`  D0 (argLen): ${argLen} D2 (stackSize)=0x${this.stackSizeBytes.toString(16)} D3 (seed)=0x${randomSeed.toString(16)}`);

    // Build CLI structure with key BPTR fields (dos/dosextens.h CommandLineInterface)
    // Memory Layout (from NDK amitools/vamos/libstructs/dos.py):
    //   0xa0000-0xa003F: CLIStruct (64 bytes, 16 fields), extended to 0xa007F for AX compat fields
    //   0xa0080-0xa00FF: BSTR command name (128 bytes max)
    //   0xa0200-0xa0213: FileLockStruct (20 bytes: fl_Link, fl_Key, fl_Access, fl_Task, fl_Volume)
    // NOTE: CLI MUST NOT be at 0xe0000 - that address is used by intuition.library stub!
    const cliSize = 0x80; // 128 bytes: 64-byte standard CLI + extended fields + padding
    const cliAddr = 0xa0000; // Between ExecBase (0x80000) and DOS library (0xb0000)
    const cliBptr = cliAddr >> 2;
    const compatCliAddr = cliBptr; // raw pointer form for doors that skip BADDR
    const compatBstrAddr = compatCliAddr + cliSize;
    for (let i = 0; i < cliSize; i++) {
      this.emulator.writeMemory(cliAddr + i, 0);
    }
    // BSTR command name
    const bstrAddr = cliAddr + cliSize;
    this.emulator.writeMemory(bstrAddr, progName.length);
    for (let i = 0; i < progName.length; i++) {
      this.emulator.writeMemory(bstrAddr + 1 + i, progName.charCodeAt(i));
    }
    const cmdNameBptr = bstrAddr >> 2;

    // Populate Process structure fields (pr_CLI, pr_CurrentDir, standard handles, arguments)
    const taskAddr = this.execLibrary.getCurrentTaskAddress();
    const segListBptr = hunkFile.segments[0]?.bptr || 0;
    // Offsets based on dos/Process layout (Task+MsgPort already written): see amitools dos.py
    const prSegList = taskAddr + 0x80;
    const prStackSize = taskAddr + 0x84;
    const prGlobVec = taskAddr + 0x88;
    const prTaskNum = taskAddr + 0x8c;
    const prStackBase = taskAddr + 0x90;
    const prResult2 = taskAddr + 0x94;
    const prCurrentDir = taskAddr + 0x98;
    const prCIS = taskAddr + 0x9c;
    const prCOS = taskAddr + 0xa0;
    const prConsoleTask = taskAddr + 0xa4;
    const prFileSystemTask = taskAddr + 0xa8;
    const prCLI = taskAddr + 0xac;
    const prReturnAddr = taskAddr + 0xb0;
    const prPktWait = taskAddr + 0xb4;
    const prWindowPtr = taskAddr + 0xb8;
    const prHomeDir = taskAddr + 0xbc;
    const prFlags = taskAddr + 0xc0;
    const prExitCode = taskAddr + 0xc4;
    const prExitData = taskAddr + 0xc8;
    const prArguments = taskAddr + 0xcc;
    const prLocalVars = taskAddr + 0xd0;
    const prShellPrivate = taskAddr + 0xdc;
    const prCES = taskAddr + 0xe0;

    const write32 = (addr: number, val: number) =>
      this.emulator.writeMemory32(addr, val >>> 0);

    // Create a minimal FileLock for BBS: as current dir/home dir
    // FileLockStruct is 20 bytes (5 x LONG/APTR/BPTR fields) - see amitools/vamos/libstructs/dos.py
    // Placed at 0xa0200 to avoid overlap with CLI (0xa0000-0xa007F) + BSTR (0xa0080-0xa00FF)
    const lockAddr = 0xa0200;
    const FILELOCK_SIZE = 20; // fl_Link(4) + fl_Key(4) + fl_Access(4) + fl_Task(4) + fl_Volume(4)
    for (let i = 0; i < FILELOCK_SIZE; i++) {
      this.emulator.writeMemory(lockAddr + i, 0);
    }
    write32(lockAddr + 0x0, 0); // fl_Link
    write32(lockAddr + 0x4, 0); // fl_Key
    write32(lockAddr + 0x8, -2); // fl_Access = ACCESS_READ(-2)
    write32(lockAddr + 0xc, taskAddr); // fl_Task = this process
    write32(lockAddr + 0x10, 0); // fl_Volume (not emulated)
    const lockBptr = lockAddr >> 2;

    write32(prSegList, segListBptr);
    write32(prStackSize, this.stackSizeBytes);
    // GlobVec: -1 = use library vectors
    write32(prGlobVec, 0xffffffff);
    write32(prTaskNum, nodeId);
    write32(prStackBase, this.stackBaseAddr);
    write32(prResult2, 0);
    write32(prCurrentDir, lockBptr);
    write32(prHomeDir, lockBptr);
    write32(prCIS, 1); // BPTR stdin
    write32(prCOS, 2); // BPTR stdout
    write32(prCES, 2); // error -> stdout
    write32(prConsoleTask, 0);
    write32(prFileSystemTask, 0);
    // pr_CLI handling: ALL doors need pr_CLI set to a valid CLI structure
    // CRITICAL FIX 2026-01-09: On real Amiga, doors started from AmiExpress BBS
    // inherit pr_CLI from the parent shell process. pr_CLI != 0 is NORMAL.
    // Doors use pr_CLI to parse command line arguments (e.g., node number).
    // The pr_CLI = 0 path is for WORKBENCH launches (icon double-click), not BBS.
    // RTW/Bulls/JoinCnf were failing because they saw pr_CLI = 0 and tried
    // to read WBStartup message instead of parsing CLI args.
    // Real Amiga logs show doors send JH_REGISTER immediately - they don't
    // wait on pr_MsgPort because they have pr_CLI != 0.
    const cliRequiredTooltype = this.config.toolTypes?.CLI_REQUIRED || this.config.toolTypes?.CLIREQUIRED;
    const cliRequired = cliRequiredTooltype?.toUpperCase() === "YES";
    // ALWAYS use CLI pointer - doors need to parse arguments
    const useCliPtr = true;
    write32(prCLI, cliBptr);
    // Route process return to the exit trap instead of the seglist header (DOS cleanup stub).
    write32(prReturnAddr, this.exitTrapAddress);
    write32(prPktWait, 0);
    write32(prWindowPtr, 0);
    write32(prFlags, 0);
    write32(prExitCode, 0);
    write32(prExitData, 0);
    write32(prArguments, ARG_STRING_ADDR);
    write32(prLocalVars, prLocalVars + 4); // basic empty MinList head
    write32(prLocalVars + 4, 0);
    write32(prLocalVars + 8, prLocalVars);
    write32(prShellPrivate, 0);

    // Fill CLI fields now that seglist exists
    const writeCli32 = (offset: number, val: number) =>
      this.emulator.writeMemory32(cliAddr + offset, val >>> 0);
    writeCli32(0x00, 0); // cli_Result2
    writeCli32(0x04, 0); // cli_SetName
    writeCli32(0x08, lockBptr); // cli_CommandDir
    writeCli32(0x0c, 0); // cli_ReturnCode
    writeCli32(0x10, cmdNameBptr); // cli_CommandName
    writeCli32(0x14, 0); // cli_FailLevel
    writeCli32(0x18, 0); // cli_Prompt
    writeCli32(0x1c, 1); // cli_StandardInput (BPTR)
    writeCli32(0x20, 1); // cli_CurrentInput (BPTR)
    writeCli32(0x24, 0); // cli_CommandFile
    writeCli32(0x28, 1); // cli_Interactive
    writeCli32(0x2c, 0); // cli_Background
    writeCli32(0x30, 2); // cli_CurrentOutput (BPTR)
    writeCli32(0x34, this.stackSizeBytes >> 2); // cli_DefaultStack (in longwords, not bytes)
    writeCli32(0x38, 2); // cli_StandardOutput (BPTR)
    writeCli32(0x3c, segListBptr); // cli_Module BPTR to seglist
    writeCli32(0x40, lockBptr); // cli_CurrentDir (mirror)
    writeCli32(0x44, 0); // cli_DirLen
    writeCli32(0x48, 0); // cli_DirBuf
    writeCli32(0x4c, 0); // cli_PathList
    // Point return address at the exit trap instead of the seglist header.
    // The real DOS cleanup lives in resident code; here we trap it explicitly.
    writeCli32(0x50, this.exitTrapAddress); // cli_ReturnAddr
    writeCli32(0x54, nodeId); // cli_Pid
    writeCli32(0x58, customArgs.length); // cli_NumArgs

    // Compatibility: some doors treat pr_CLI as an APTR instead of BPTR; mirror a direct-pointer CLI.
    for (let i = 0; i < cliSize; i++) {
      this.emulator.writeMemory(compatCliAddr + i, 0);
    }
    this.emulator.writeMemory(compatBstrAddr, progName.length);
    for (let i = 0; i < progName.length; i++) {
      this.emulator.writeMemory(compatBstrAddr + 1 + i, progName.charCodeAt(i));
    }
    const writeCompat32 = (offset: number, val: number) =>
      this.emulator.writeMemory32(compatCliAddr + offset, val >>> 0);
    writeCompat32(0x00, 0);
    writeCompat32(0x04, 0);
    writeCompat32(0x08, lockAddr); // command dir (APTR)
    writeCompat32(0x0c, 0);
    writeCompat32(0x10, compatBstrAddr); // command name APTR
    writeCompat32(0x14, 0);
    writeCompat32(0x18, 0);
    writeCompat32(0x1c, 1 << 2); // stdin as BPTR→APTR
    writeCompat32(0x20, 1 << 2);
    writeCompat32(0x24, 0);
    writeCompat32(0x28, 1);
    writeCompat32(0x2c, 0);
    writeCompat32(0x30, 2 << 2);
    writeCompat32(0x34, this.stackSizeBytes);
    writeCompat32(0x38, 2 << 2);
    writeCompat32(0x3c, segListBptr << 2); // module APTR
    writeCompat32(0x40, lockAddr);
    writeCompat32(0x44, 0);
    writeCompat32(0x48, 0);
    writeCompat32(0x4c, 0);
    writeCompat32(0x50, this.exitTrapAddress);
    writeCompat32(0x54, nodeId);
    writeCompat32(0x58, customArgs.length);

    // DEBUG: Verify what's actually at 0xf0081 after initialization
    const verify0xf0081 = this.emulator.readMemory32(0xf0081);
debugLog(`[DoorLoader] DEBUG: Memory at 0xf0081 = 0x${verify0xf0081.toString(16).padStart(8, '0')}`);
debugLog(`[DoorLoader] DEBUG: Expected 'who' = 0x77686f00, CLI at 0x${cliAddr.toString(16)}`);

debugLog(
      `[DoorLoader] CLI set: BPTR=0x${cliBptr.toString(
        16
      )} cmdNameBPTR=0x${cmdNameBptr.toString(
        16
      )} moduleBPTR=0x${segListBptr.toString(16)}`
    );

    // Store pr_CLI BPTR into Task at offset 0xac (already done above, but verify consistency)
    const execBase = this.execLibrary.getExecBaseAddress();
    const thisTaskPtr = this.emulator.readMemory32(execBase + 0x114); // pr_CurrentTask
    const prCLIOffset = 0xac;
    const finalPrCLI = useCliPtr ? cliBptr : 0;
    debugLog(`[DoorLoader] DEBUG: thisTaskPtr=0x${thisTaskPtr.toString(16)} writing pr_CLI to 0x${(thisTaskPtr + prCLIOffset).toString(16)}`);
    this.emulator.writeMemory32(thisTaskPtr + prCLIOffset, finalPrCLI);
    // Verify the write
    const verifyPrCLI = this.emulator.readMemory32(thisTaskPtr + prCLIOffset);
    debugLog(`[DoorLoader] DEBUG: Verified pr_CLI at 0x${(thisTaskPtr + prCLIOffset).toString(16)} = 0x${verifyPrCLI.toString(16)}`);
    // Also verify ExecBase->ThisTask
    const verifyThisTask = this.emulator.readMemory32(execBase + 0x114);
    debugLog(`[DoorLoader] DEBUG: ExecBase->ThisTask at 0x${(execBase + 0x114).toString(16)} = 0x${verifyThisTask.toString(16)}`);
    if (cliRequired) {
      debugLog(`[DoorLoader] CLI_REQUIRED=YES - pr_CLI set to 0x${cliBptr.toString(16)}`);
    } else if (doorType === "XIM") {
      debugLog(`[DoorLoader] XIM door - pr_CLI set to 0x${cliBptr.toString(16)} (BBS shell mode)`);
    }
debugLog(
      `[DoorLoader] Process set: pr_CLI=0x${finalPrCLI.toString(
        16
      )} pr_SegList=0x${segListBptr.toString(
        16
      )} pr_ReturnAddr=0x${this.exitTrapAddress.toString(
        16
      )} stackBase=0x${this.stackBaseAddr.toString(16)} stackSize=${this.stackSizeBytes}`
    );

    // AmigaDOS startup: A0 = pointer to argument string (NOT stack top!)
    // Amiga E doors may expect A0=stack, but standard AmigaDOS programs expect A0=args
    // The arg string is at ARG_STRING_ADDR (0x0f0100)
    const stackTop = this.stackBaseAddr + this.stackSizeBytes;
    this.emulator.setRegister(8, ARG_STRING_ADDR); // A0 = arg string pointer
debugLog(`  A0 (arg string): 0x${ARG_STRING_ADDR.toString(16)} "${argString}"`);

    // CRITICAL FIX: A4 must point to DATA segment + 0x7FFE for small data model
    // SAS/C and similar compilers use 16-bit signed A4-relative addressing
    // By setting A4 = dataSegment + 0x7FFE, we can address -32768 to +32767 range
    const dataSegmentForA4 = hunkFile.segments.find((seg: { type: string }) => seg.type.toUpperCase() === 'DATA');
    let a4Value: number;

    if (!dataSegmentForA4) {
      // Single-hunk executable (CODE only) - allocate synthetic BSS area
      // This is common for SAS/C and DICE-compiled programs where DATA/BSS is embedded in CODE
console.warn(`[DoorLoader] No DATA segment found - allocating synthetic BSS for single-hunk executable`);
console.warn(`[DoorLoader] Segment types: ${hunkFile.segments.map((s: any) => s.type).join(', ')}`);

      if (codeSegment) {
        // SAS/C small data model uses A4 relative to the start of the DATA segment (or embedded data)
        // For single-hunk programs, A4 usually points to the start of the hunk + 32KB (0x7FFE)
        // or the end of the code if data is appended.
        // Let's try pointing A4 to the code segment itself, which is a common convention for
        // single-hunk executables that have data merged into the code segment.
        a4Value = codeSegment.address + 0x7FFE;
debugLog(`[DoorLoader] Single hunk: setting A4 relative to CODE segment: 0x${a4Value.toString(16)}`);

        // Allocate BSS after CODE segment
        // SAS/C programs typically need 64KB-128KB for BSS (globals, static data, heap)
        const bssSize = 0x20000; // 128KB - generous allocation for safety
        const bssBase = codeSegment.address + codeSegment.size;

        // Clear BSS to zero (critical for uninitialized globals)
debugLog(`[DoorLoader] Allocating BSS: base=0x${bssBase.toString(16)}, size=0x${bssSize.toString(16)} (${bssSize} bytes)`);
        for (let i = 0; i < bssSize; i++) {
          this.emulator.writeMemory(bssBase + i, 0);
        }
      } else {
console.error(`[DoorLoader] ERROR: No CODE segment found! Cannot allocate BSS.`);
        a4Value = 0;
      }
    } else {
      a4Value = dataSegmentForA4.address + 0x7FFE;
    }

    this.emulator.setRegister(12, a4Value); // A4 = DATA/BSS segment + 0x7FFE (SAS/C small data model)

    this.emulator.setRegister(13, stackTop); // A5 = stack top (vamos)
    const a4Now = this.emulator.getRegister(12);
    const a5Now = this.emulator.getRegister(13);
debugLog(
      `  A4=0x${a4Now.toString(16)} (DATA segment), A5=0x${a5Now.toString(
        16
      )} (stack top), stackTop=0x${stackTop.toString(16)}`
    );

    // Seed Amiga E runtime frame around A5 (negative offsets from Technical_info.txt)
    const frameBase = stackTop;
    const writeFrame32 = (offset: number, value: number) =>
      this.emulator.writeMemory32(frameBase + offset, value >>> 0);
    // Standard handles
    writeFrame32(-8, 2); // stdout (BPTR)
    writeFrame32(-12, 2); // conout (BPTR)
    writeFrame32(-16, 0); // stdrast (unused)
    // Return/exit wiring
    writeFrame32(0, this.exitTrapAddress); // top-of-stack return fallback
    writeFrame32(-4, this.exitTrapAddress); // stack return -> exit trap
    writeFrame32(-24, this.exitTrapAddress); // exit jump address (RTS trap)
    writeFrame32(-28, 0); // cli return value
    writeFrame32(-32, ARG_BSTR_ADDR); // arg BSTR pointer
    writeFrame32(-36, 0); // wbmessage
    // Bases
    writeFrame32(-40, execBaseAddr);
    const dosBaseAddr =
      (this.execLibrary as any).DOS_LIB_ADDR ??
      (this.execLibrary as any).dosLibraryBase ??
      0x20000;
    writeFrame32(-44, dosBaseAddr);
    const intuitionBaseAddr =
      (this.execLibrary as any).INTUITION_LIB_ADDR ??
      (this.execLibrary as any).intuitionLibraryBase ??
      0x50000;
    const gfxBaseAddr =
      (this.execLibrary as any).GRAPHICS_LIB_ADDR ??
      (this.execLibrary as any).graphicsLibraryBase ??
      0;
    writeFrame32(-48, intuitionBaseAddr);
    writeFrame32(-52, gfxBaseAddr);
    writeFrame32(-64, this.stackBaseAddr); // stack bottom
    // A5-88: Pointer to CommandsStructure (cmds) - XIM doors like RTW read BBS config from here
    // NOT the saved A5 value - that was incorrect and caused RTW to exit with code 30
    const cmdsAddr = this.sharedBBSData?.getCmdsAddr() || 0xF00300;
debugLog(`[DoorLoader] DEBUG A5-88: sharedBBSData=${!!this.sharedBBSData}, cmdsAddr=0x${cmdsAddr.toString(16)}, frameBase=0x${frameBase.toString(16)}, A5=0x${a5Now.toString(16)}`);
    writeFrame32(-88, cmdsAddr);
debugLog(`[DoorLoader] DEBUG A5-88: Wrote 0x${cmdsAddr.toString(16)} to address 0x${(frameBase - 88).toString(16)}, verify: 0x${this.emulator.readMemory32(frameBase - 88).toString(16)}`);
    writeFrame32(-92, 1); // stdin (BPTR)
    writeFrame32(-120, taskAddr); // thistask
    writeFrame32(-128, 0); // opened files list (empty)
    writeFrame32(-132, 0); // utilitybase placeholder

    // Set A1 to end of CODE segment (SAS/C startup code uses this for initialization)
    // The startup code copies initialization data from end of CODE to BSS
    if (codeSegment) {
      const codeEnd = codeSegment.address + codeSegment.size;
    this.emulator.setRegister(9, codeEnd); // A1 = end of CODE
debugLog(`  A1 (end of CODE): 0x${codeEnd.toString(16)}`);
    }

    // Configure stack FIRST (before setting PC)
    this.setupStack(segListBptr);

    // Simulate JSR call to entry point by manually pushing return address
    // This is critical: many Amiga programs do MOVEM.L at entry
    // to save registers. They expect a return address ABOVE those saved registers.
    // On real Amiga, the C startup code or shell CALLs the program via JSR,
    // which pushes the return address. We must simulate this.
    const currentSP = this.emulator.getRegister(15);
    const newSP = currentSP - 4;
    this.emulator.writeMemory32(newSP, this.exitTrapAddress);
    this.emulator.setRegister(15, newSP);

    // Update the saved SP value at finalSP+4 to reflect the new SP after JSR
    // Some doors save/restore SP and expect this value to be correct
    this.emulator.writeMemory32(currentSP + 4, newSP);

debugLog(
      `[DoorLoader] Simulated JSR: Pushed return address 0x${this.exitTrapAddress.toString(
        16
      )} at SP=0x${newSP.toString(16)}`
    );
debugLog(
      `[DoorLoader] Updated saved SP at 0x${(currentSP + 4).toString(16)} to 0x${newSP.toString(16)}`
    );

    // Set PC to REAL HUNK ENTRY POINT
debugLog(
      `[DoorLoader] Setting PC to HUNK entry point 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );
    this.emulator.setRegister(16, hunkFile.entryPoint);

    // Early instrumentation: capture pointers before execution
    const prSegListVal = this.emulator.readMemory32(taskAddr + 0x80);
    const cliModuleVal = this.emulator.readMemory32(cliAddr + 0x3c);
    const segHeaderSizeLongs =
      prSegListVal !== 0 ? this.emulator.readMemory32(prSegListVal << 2) : 0;
    const segHeaderNext =
      prSegListVal !== 0 ? this.emulator.readMemory32((prSegListVal << 2) + 4) : 0;
debugLog(
      `[DoorLoader] Preload state: A4=0x${this.emulator
        .getRegister(12)
        .toString(16)} A5=0x${this.emulator.getRegister(13).toString(16)} SP=0x${this.emulator
        .getRegister(15)
        .toString(16)} pr_SegList=0x${prSegListVal.toString(16)} cli_Module=0x${cliModuleVal.toString(
        16
      )} segHeader[size_longs=${segHeaderSizeLongs} nextBPTR=0x${segHeaderNext.toString(16)}]`
    );

    // Log initial CPU state to door log
    this.logger?.cpu(
      hunkFile.entryPoint,
      argLen,
      ARG_STRING_ADDR,
      this.emulator.getRegister(15),
      a4Value,
      `A5=0x${a5Now.toString(16)} A6=0x${execBaseAddr.toString(16)}`
    );
    this.logger?.info(`Args: "${argString}" len=${argLen}`);

    // CRITICAL DEBUG: Verify ExecBase pointer at 0x4 is set correctly
    const verifyExecBase = this.emulator.readMemory32(0x4);
debugLog(`[DoorLoader] VERIFY: Memory[0x4]=0x${verifyExecBase.toString(16)} (expected 0x${execBaseAddr.toString(16)})`);
    if (verifyExecBase !== execBaseAddr) {
console.error(`[DoorLoader] CRITICAL ERROR: Memory[0x4] is NOT ExecBase! Expected 0x${execBaseAddr.toString(16)}, got 0x${verifyExecBase.toString(16)}`);
    }
  }

  /**
   * Set up stack for door execution
   */
  private setupStack(segListBptr: number): void {
    const stackBase = this.stackBaseAddr || 0;
    const stackSize = this.stackSizeBytes || Math.max(4096, this.config.stack || 65536);
    const stackTop = (stackBase + stackSize) & ~3;
    // Vamos shows initial SP 8 bytes below top; mirror that spacing
    const finalSP = stackTop - 8;
    // Save the initial SP value so exit RTS can restore correctly
    const savedOriginalSP = finalSP;

    // Ensure exit trap is a safe RTS target (dos.library Exit sets PC here)
    this.emulator.writeMemory16(this.exitTrapAddress, 0x4e75);

    // Clear a small region at the top of the stack and seed return BPTRs
    for (let offset = -64; offset <= 256; offset += 4) {
      const addr = finalSP + offset;
      if (addr >= stackBase && addr < stackTop) {
        this.emulator.writeMemory32(addr, 0);
      }
    }
    // Prepare exit trap address on stack. When door does RTS, it will jump to our exit trap.
    // This allows DoorLifecycleManager to detect clean exit at PC=0x1ff000.
    this.emulator.writeMemory32(finalSP, this.exitTrapAddress);

    // Seed old SP at top of new stack (used by door stack switch to restore)
    this.emulator.writeMemory32(finalSP + 4, savedOriginalSP);

    // Set SP
    this.emulator.setRegister(15, finalSP); // A7 (SP)
    this.execLibrary.setStackBounds(stackBase, stackSize);
debugLog(`  SP: 0x${finalSP.toString(16)} (stackBase=0x${stackBase.toString(16)})`);

    const currentPC = this.emulator.getRegister(16);
debugLog(`[PC-DEBUG] PC after setup: 0x${currentPC.toString(16)}`);

    const verifyFinalSP = this.emulator.getRegister(15);
    const verifyFinalPC = this.emulator.getRegister(16);
    const verifyFinalA0 = this.emulator.getRegister(8);
debugLog(
      `[DoorLoader] Door ready: SP=0x${verifyFinalSP.toString(
        16
      )}, PC=0x${verifyFinalPC.toString(16)}, A0=0x${verifyFinalA0.toString(
        16
      )}`
    );
  }

}
