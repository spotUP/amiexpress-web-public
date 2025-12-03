// DoorLoader.ts
// Extracted from AmigaDoorSession.ts - Phase 3: Door Loading and Execution
// Handles Amiga door binary loading, HUNK parsing, and CPU register setup
// 2025-11-20

import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { DoorConfig } from "./DoorTypes.js";
import * as fs from "fs";
import * as path from "path";
import { notifySysop } from "../utils/sysop-alert.util.js";
import { SysopDebugUtil } from "../utils/sysop-debug.util.js";

export class DoorLoader {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private config: DoorConfig;
  private isBullsDoor: boolean = false;
  private stackBaseAddr: number = 0;
  private stackSizeBytes: number = 0;
  private readonly exitTrapAddress = 0x1ff000;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    config: DoorConfig
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.config = config;
    this.isBullsDoor = path
      .basename(config.executablePath)
      .toLowerCase()
      .includes("bull");
  }

  /**
   * Load door executable into emulator memory
   */
  async loadDoor(): Promise<void> {
    // Read door binary
    let binary: Buffer;
    try {
      binary = fs.readFileSync(this.config.executablePath);
    } catch (error) {
      const socket = this.config.bbsSession?.socket;
      SysopDebugUtil.debugFileError(
        socket,
        this.config.bbsSession,
        'read',
        this.config.executablePath,
        error as Error
      );
      throw error;
    }
    console.log(`[DoorLoader] Door binary size: ${binary.length} bytes`);

    // Parse Amiga HUNK format
    const hunkLoader = new HunkLoader();
    const hunkFile = hunkLoader.parse(Buffer.from(binary));

    console.log(`[DoorLoader] Parsed ${hunkFile.segments.length} segments:`);
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const seg = hunkFile.segments[i];
      console.log(
        `  Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(
          16
        )}, size=${seg.size} bytes`
      );

      // Register CODE segments for self-modifying code detection
      if (seg.type.toUpperCase() === 'CODE') {
        this.emulator.registerCodeRegion(seg.address, seg.size);
      }
    }

    // Load segments into memory
    hunkLoader.load(this.emulator, hunkFile);

    console.log(
      `[DoorLoader] Door loaded at entry point: 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );

    // Set up CPU for door execution
    this.setupCpuRegisters(hunkFile);

    // Set up Bulls-specific execution if needed
    if (this.isBullsDoor) {
      await this.setupBullsExecution();
    }

    // Prefill the 68000 instruction queue
    this.emulator.refillPrefetch();
  }

  /**
   * Set up CPU registers for door execution
   */
  private setupCpuRegisters(hunkFile: any): void {
    console.log("[DoorLoader] Setting up CPU registers...");

    // Cache segment metadata up front for SAS/C style setup
    const codeSegment = hunkFile.segments.find(
      (s: any) => s.type.toUpperCase() === "CODE"
    );
    const dataSegment = hunkFile.segments.find(
      (s: any) => s.type.toUpperCase() === "DATA"
    );
    const dataBase = dataSegment ? dataSegment.address : 0;
    this.stackSizeBytes = Math.max(4096, this.config.stack || 8192);
    // Mirror vamos layout: stack lower ~0x6e74, upper ~0x8e74, SP starts 8 bytes below top
    this.stackBaseAddr = 0x6e74;

    // Match vamos startup: user mode, Z flag set from zeroed D registers
    this.emulator.setRegister(17, 0x0000); // SR (Status Register)
    console.log(`  SR: 0x0000 (user mode)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr); // A6 = ExecBase
    console.log(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    // Set up CLI/argument string similar to AmigaDOS
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const progName = path.basename(this.config.executablePath);
    const customArgs =
      this.config.args && this.config.args.length > 0
        ? this.config.args
        : [nodeId.toString()];
    const argString = customArgs.join(" ").trim();
    const ARG_STRING_ADDR = 0x0f0100;
    const ARG_BSTR_ADDR = ARG_STRING_ADDR + 0x100;

    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_STRING_ADDR + i, argString.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG_STRING_ADDR + argString.length, 0);
    // Build BSTR for Amiga E runtime (-32(a5) expects this)
    this.emulator.writeMemory(ARG_BSTR_ADDR, argString.length);
    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_BSTR_ADDR + 1 + i, argString.charCodeAt(i));
    }

    // Vamos shows D0 counting command + args, D2=0x2000 on entry
    const argc = Math.max(1, customArgs.length + 1);
    this.emulator.setRegister(0, argc); // D0 = argc
    this.emulator.setRegister(1, 0); // D1 = 0 at startup
    this.emulator.setRegister(2, 0x2000); // D2 observed in vamos
    console.log(`  D0 (argc): ${argc} D2=0x2000`);

    // Build CLI structure with key BPTR fields (dos/dosextens.h CommandLineInterface)
    const cliSize = 0x80;
    const cliAddr = 0xe0000; // store CLI in chip space (must not overlap exception handlers at 0xf00000)
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
    const lockAddr = 0xe0000;
    for (let i = 0; i < 32; i++) {
      this.emulator.writeMemory(lockAddr + i, 0);
    }
    // struct FileLock: fl_Link (APTR), fl_Key (LONG), fl_Access (LONG), fl_Task (APTR), fl_Volume (BPTR)
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
    writeCli32(0x34, this.stackSizeBytes); // cli_DefaultStack
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
    console.log(`[DoorLoader] DEBUG: Memory at 0xf0081 = 0x${verify0xf0081.toString(16).padStart(8, '0')}`);
    console.log(`[DoorLoader] DEBUG: Expected 'who' = 0x77686f00, CLI at 0x${cliAddr.toString(16)}`);

    console.log(
      `[DoorLoader] CLI set: BPTR=0x${cliBptr.toString(
        16
      )} cmdNameBPTR=0x${cmdNameBptr.toString(
        16
      )} moduleBPTR=0x${segListBptr.toString(16)}`
    );

    // Store pr_CLI BPTR into Task at offset 0xac
    const execBase = this.execLibrary.getExecBaseAddress();
    const thisTaskPtr = this.emulator.readMemory32(execBase + 0x114); // pr_CurrentTask
    const prCLIOffset = 0xac;
    this.emulator.writeMemory32(thisTaskPtr + prCLIOffset, cliBptr);
    console.log(
      `[DoorLoader] Process set: pr_CLI=0x${cliBptr.toString(
        16
      )} pr_SegList=0x${segListBptr.toString(
        16
      )} pr_ReturnAddr=0x${this.exitTrapAddress.toString(
        16
      )} stackBase=0x${this.stackBaseAddr.toString(16)} stackSize=${this.stackSizeBytes}`
    );

    // Amiga E startup expects A0/A5 to point at the stack top (vamos shows A0/A5=stack upper)
    const stackTop = this.stackBaseAddr + this.stackSizeBytes;
    this.emulator.setRegister(8, stackTop); // A0 (vamos: A0=stack upper)

    // CRITICAL FIX: A4 must point to DATA segment + 0x7FFE for small data model
    // SAS/C and similar compilers use 16-bit signed A4-relative addressing
    // By setting A4 = dataSegment + 0x7FFE, we can address -32768 to +32767 range
    const dataSegmentForA4 = hunkFile.segments.find((seg: { type: string }) => seg.type.toUpperCase() === 'DATA');
    const a4Value = dataSegmentForA4 ? dataSegmentForA4.address + 0x7FFE : 0;
    this.emulator.setRegister(12, a4Value); // A4 = DATA segment + 0x7FFE (SAS/C small data model)

    this.emulator.setRegister(13, stackTop); // A5 = stack top (vamos)
    const a4Now = this.emulator.getRegister(12);
    const a5Now = this.emulator.getRegister(13);
    console.log(
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
    writeFrame32(-88, frameBase); // saved a5
    writeFrame32(-92, 1); // stdin (BPTR)
    writeFrame32(-120, taskAddr); // thistask
    writeFrame32(-128, 0); // opened files list (empty)
    writeFrame32(-132, 0); // utilitybase placeholder

    // Set A1 to end of CODE segment (SAS/C startup code uses this for initialization)
    // The startup code copies initialization data from end of CODE to BSS
    if (codeSegment) {
      const codeEnd = codeSegment.address + codeSegment.size;
    this.emulator.setRegister(9, codeEnd); // A1 = end of CODE
      console.log(`  A1 (end of CODE): 0x${codeEnd.toString(16)}`);
    }

    // Configure stack FIRST (before setting PC)
    this.setupStack(segListBptr);

    // Simulate JSR call to entry point by manually pushing return address
    // This is critical: many Amiga programs (like Bulls) do MOVEM.L at entry
    // to save registers. They expect a return address ABOVE those saved registers.
    // On real Amiga, the C startup code or shell CALLs the program via JSR,
    // which pushes the return address. We must simulate this.
    const currentSP = this.emulator.getRegister(15);
    const newSP = currentSP - 4;
    this.emulator.writeMemory32(newSP, this.exitTrapAddress);
    this.emulator.setRegister(15, newSP);

    // Update the saved SP value at finalSP+4 to reflect the new SP after JSR
    // Some doors (like Bulls) save/restore SP and expect this value to be correct
    this.emulator.writeMemory32(currentSP + 4, newSP);

    console.log(
      `[DoorLoader] Simulated JSR: Pushed return address 0x${this.exitTrapAddress.toString(
        16
      )} at SP=0x${newSP.toString(16)}`
    );
    console.log(
      `[DoorLoader] Updated saved SP at 0x${(currentSP + 4).toString(16)} to 0x${newSP.toString(16)}`
    );

    // Set PC to REAL HUNK ENTRY POINT
    console.log(
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
    console.log(
      `[DoorLoader] Preload state: A4=0x${this.emulator
        .getRegister(12)
        .toString(16)} A5=0x${this.emulator.getRegister(13).toString(16)} SP=0x${this.emulator
        .getRegister(15)
        .toString(16)} pr_SegList=0x${prSegListVal.toString(16)} cli_Module=0x${cliModuleVal.toString(
        16
      )} segHeader[size_longs=${segHeaderSizeLongs} nextBPTR=0x${segHeaderNext.toString(16)}]`
    );
  }

  /**
   * Set up stack for door execution
   */
  private setupStack(segListBptr: number): void {
    const stackBase = this.stackBaseAddr || 0;
    const stackSize = this.stackSizeBytes || Math.max(4096, this.config.stack || 8192);
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
    console.log(`  SP: 0x${finalSP.toString(16)} (stackBase=0x${stackBase.toString(16)})`);

    const currentPC = this.emulator.getRegister(16);
    console.log(`[PC-DEBUG] PC after setup: 0x${currentPC.toString(16)}`);

    const verifyFinalSP = this.emulator.getRegister(15);
    const verifyFinalPC = this.emulator.getRegister(16);
    const verifyFinalA0 = this.emulator.getRegister(8);
    console.log(
      `[DoorLoader] Door ready: SP=0x${verifyFinalSP.toString(
        16
      )}, PC=0x${verifyFinalPC.toString(16)}, A0=0x${verifyFinalA0.toString(
        16
      )}`
    );
  }

  /**
   * Set up Bulls-specific execution
   */
  private async setupBullsExecution(): Promise<void> {
    console.log(`[BULLS-FORCE] 🔧 Initializing Bulls for proper execution`);
    console.log(
      `[BULLS-FORCE]   Bulls Code segment: 0x1000-0x4b3f (19,228 bytes)`
    );
    console.log(
      `[BULLS-FORCE]   Bulls Data segment: 0x5c00-0x8b5f (27,876 bytes)`
    );

    // CRITICAL: Bulls sets A4 to 0x5c08 (DATA segment + 0x8) during execution
    // We must inject at the CORRECT A4 value Bulls will use, not the initial value
    // Bulls starts with A4=0xdc06 but immediately changes to A4=0x5c08 at PC=0x1016
    const a4Value = 0x5c08; // Bulls' actual A4 value during execution (DATA segment + 0x8)
    const aeDoorBaseAddr = (this.execLibrary as any).getLibraryBase?.("AEDoor.library") || 0x30000;
    const replyPortAddr = 0xa0000; // BBS reply port (AEDoorPort1)
    const doorInfoAddr = 0x100000; // Allocate DoorInfo structure at 1MB

    console.log(
      `[BULLS-FORCE] Using correct A4 value: 0x${a4Value.toString(16)} (Bulls sets this at PC=0x1016)`
    );

    // Create DoorInfo structure (per AEDoor_LIBRARY_NOTES.md)
    // Size: 0xE4 + node state buffer (~256 bytes total)
    const doorInfoSize = 0x200;
    for (let i = 0; i < doorInfoSize; i++) {
      this.emulator.writeMemory(doorInfoAddr + i, 0);
    }

    // Populate DoorInfo fields
    this.emulator.writeMemory32(doorInfoAddr + 0x00, replyPortAddr); // dif_AEPort
    this.emulator.writeMemory32(doorInfoAddr + 0x04, replyPortAddr); // dif_ReplyPort
    this.emulator.writeMemory32(doorInfoAddr + 0x08, 0); // dif_EventHook

    // dif_NameBuf: User name (0x0C + 0x32 bytes)
    const userName = "SYSOP";
    for (let i = 0; i < userName.length; i++) {
      this.emulator.writeMemory(doorInfoAddr + 0x0C + i, userName.charCodeAt(i));
    }

    // dif_BBSInfo: BBS title (0x46)
    const bbsTitle = "AmiExpress Web BBS Node 1";
    for (let i = 0; i < bbsTitle.length; i++) {
      this.emulator.writeMemory(doorInfoAddr + 0x46 + i, bbsTitle.charCodeAt(i));
    }

    // dif_NodeState: Node data (0xE4) - Bulls polls this!
    this.emulator.writeMemory32(doorInfoAddr + 0xE4, 1); // Node number
    this.emulator.writeMemory32(doorInfoAddr + 0xE8, 255); // Security level

    console.log(
      `[BULLS-FORCE] ✅ Created DoorInfo structure at 0x${doorInfoAddr.toString(16)} (${doorInfoSize} bytes)`
    );

    // Inject AEDoorBase at A4+0x988
    this.emulator.writeMemory32(a4Value + 0x988, aeDoorBaseAddr);
    console.log(
      `[BULLS-FORCE] ✅ Injected AEDoorBase=0x${aeDoorBaseAddr.toString(16)} at A4+0x988`
    );

    // Inject DoorInfo pointer at A4+0x6c24 (Bulls reads DoorInfo from here)
    this.emulator.writeMemory32(a4Value + 0x6c24, doorInfoAddr);
    console.log(
      `[BULLS-FORCE] ✅ Injected DoorInfo=0x${doorInfoAddr.toString(16)} at A4+0x6c24`
    );

    // Inject Reply Port at multiple A4 offsets (per Bulls_DISASM_NOTES.md:39-40)
    const replyPortOffsets = [0x44c, 0x450, 0x474, 0x57c, 0x5b8, 0x6a0, 0x720, 0x800, 0x9a4, 0x9a8, 0x6c6c];
    for (const offset of replyPortOffsets) {
      this.emulator.writeMemory32(a4Value + offset, replyPortAddr);
    }
    console.log(
      `[BULLS-FORCE] ✅ Injected Reply Port=0x${replyPortAddr.toString(16)} at ${replyPortOffsets.length} A4 offsets`
    );

    // CRITICAL FIX: Bulls parses CLI arguments from pointer at A4+0x6c16
    // Bulls disassembly at 0xfbc: movea.l 0x6c16(a4), a1  ; Load arg pointer
    // Bulls calls strcmp at 0x100c to validate arguments
    // Create empty argument string (Bulls accepts empty args for XIM mode)
    const cliArgAddr = 0xd0000; // Allocate at 0xd0000
    this.emulator.writeMemory(cliArgAddr, 0); // Empty string (null terminator)
    this.emulator.writeMemory32(a4Value + 0x6c16, cliArgAddr); // Inject pointer
    console.log(
      `[BULLS-FORCE] ✅ Injected CLI arg pointer=0x${cliArgAddr.toString(16)} at A4+0x6c16`
    );

    // Also initialize A4+0x510 buffer (where Bulls stores parsed arguments)
    for (let i = 0; i < 200; i++) {
      this.emulator.writeMemory(a4Value + 0x510 + i, 0);
    }
    console.log(
      `[BULLS-FORCE] ✅ Initialized argument buffer at A4+0x510 (200 bytes)`
    );

    // CRITICAL: Allow Bulls to execute naturally from HUNK entry point 0x13E9
    // Let startup code set A4 via LEA $984,A4 instruction
    console.log(
      "[BULLS-FORCE] Allowing natural Bulls startup from HUNK entry point..."
    );
    console.log(
      `[BULLS-FORCE] Bulls execution initialized - natural startup flow`
    );
  }
}
