// DoorLifecycleManager.ts
// Phase 5A: Execution Loop and Lifecycle Management
// Handles the main execution loop, timeout management, and lifecycle events
// 2025-11-20

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { Socket } from "socket.io";
import { LibraryTraps } from "../api/LibraryTraps.js";
import * as fs from "fs";
import * as path from "path";
import { XIMProtocol } from "../XIMProtocol.js";
import { DoorConfig, DoorConstants } from "../DoorTypes.js";
import { LibraryManager } from "../LibraryManager.js";
import { DoorLoader } from "../DoorLoader.js";
import { DoorMessageHandler } from "./DoorMessageHandler.js";
import { SysopDebugUtil, DebugSeverity } from "../../utils/sysop-debug.util.js";

export interface ExecutionState {
  iterationCount: number;
  totalCycles: number;
  cycleCount: number;
  isRunning: boolean;
  startupMessageSent: boolean;
  trapVerified: boolean;
  mainExecutionReached: boolean;
  initializationComplete: boolean;
  romReturnAttempts: number;
  lastSignificantPC: number;
  progressCheckCount: number;
  stuckInLoop: boolean;
  loopDetectionCount: number;
  writeCallCount: number;
  aedoorCallCount: number;
  libraryCallsInLoop: number;
  lastInterceptedTrap: number;
  lastInterceptedIteration: number;
  loggedMoveaStack: boolean;
  startTime: number | null;
  progressCheckCountGlobal: number;
  loopStartPC: number;
  lastProgressIteration: number;
  lastProgressTime: number;
  gapJumpLogged: boolean;
}

export interface LifecycleConfig {
  timeout: number;
  loopGuardLimit: number;
  cycleTarget: number;
  debugLevel: "minimal" | "normal" | "verbose" | "comprehensive";
  disableGuard?: boolean;
  progressTimeoutMs: number;
}

export class DoorLifecycleManager {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private libraryTraps: LibraryTraps | null = null;
  private ximProtocol: XIMProtocol | null = null;
  private libraryManager: LibraryManager;
  private doorLoader: DoorLoader;
  private messageHandler: DoorMessageHandler | null = null;
  private codeLowerBound: number = 0;
  private codeUpperBound: number = 0;

  // Execution state
  private executionState: ExecutionState;
  private lifecycleConfig: LifecycleConfig;
  private executionTimer: NodeJS.Timeout | null = null;
  private isPaused: boolean = false;

  // Debug tracking
  private executionPath: string[] = [];
  private writeCallLog: Array<{ pc: number; iteration: number; args: any }> =
    [];
  private aedoorCallLog: Array<{
    pc: number;
    iteration: number;
    function: string;
  }> = [];
  private lastPCs: number[] = [];
  private traceRegs: boolean = false;
  private traceInterval: number = 500;
  private traceLogPath: string = "";
  private traceLogPathFirst: string = "";
  private traceFirstCount: number = 0;
  private traceFirstLogged: number = 0;
  private logArgStringOnce: boolean = true;
  private traceFirstPCOnly: boolean = true;
  private lastA6Logged: number = 0;
  private lastExecBasePointer: number = 0;

  constructor(
    emulator: MoiraEmulator,
    socket: Socket,
    config: DoorConfig,
    libraryManager: LibraryManager,
    doorLoader: DoorLoader,
    messageHandler: DoorMessageHandler | null
  ) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
    this.libraryManager = libraryManager;
    this.doorLoader = doorLoader;
    this.messageHandler = messageHandler;

    const disableGuardEnv = process.env.AEDOOR_DISABLE_GUARD;
    this.lifecycleConfig = {
      timeout: config.timeout || 300,
      loopGuardLimit: Number(process.env.AEDOOR_LOOP_LIMIT ?? 500000),
      cycleTarget: 8, // 8MHz CPU cycles per microsecond
      debugLevel: (process.env.AEDOOR_DEBUG_LEVEL as any) || "normal",
      // Allow env override so we can re-enable the guard for debugging tight loops
      disableGuard: disableGuardEnv ? disableGuardEnv === "1" : true,
      progressTimeoutMs: Number(process.env.AEDOOR_PROGRESS_TIMEOUT_MS ?? 5000),
    };
    console.log(
      `[DoorLifecycleManager] Config: loopGuard=${this.lifecycleConfig.loopGuardLimit} disableGuard=${this.lifecycleConfig.disableGuard} timeout=${this.lifecycleConfig.timeout}`
    );

    this.executionState = this.initializeExecutionState();

    this.traceRegs = process.env.DOOR_TRACE_REGS === "1";
    this.traceInterval = Number(process.env.DOOR_TRACE_INTERVAL ?? 500);
    this.traceFirstCount = Number(process.env.DOOR_TRACE_FIRST_PC_COUNT ?? 0);
    try {
      const root = path.resolve(process.cwd(), "../..");
      this.traceLogPath = path.join(root, "logs", "door-68k.log");
      if (this.traceFirstCount > 0) {
        // For first-PC tracing, write to a small temp file to avoid huge log noise
        this.traceLogPathFirst =
          process.env.DOOR_TRACE_FIRST_LOG ||
          path.join("/tmp", `door-trace-first-${Date.now()}.log`);
      }
    } catch {
      this.traceLogPath = "";
    }
  }

  private initializeExecutionState(): ExecutionState {
    return {
      iterationCount: 0,
      totalCycles: 0,
      cycleCount: 0,
      isRunning: false,
      startupMessageSent: false,
      trapVerified: false,
      mainExecutionReached: false,
      initializationComplete: false,
      romReturnAttempts: 0,
      lastSignificantPC: 0,
      progressCheckCount: 0,
      stuckInLoop: false,
      loopDetectionCount: 0,
      writeCallCount: 0,
      aedoorCallCount: 0,
      libraryCallsInLoop: 0,
      lastInterceptedTrap: 0,
      lastInterceptedIteration: 0,
      loggedMoveaStack: false,
      startTime: null,
      progressCheckCountGlobal: 0,
      loopStartPC: 0,
      lastProgressIteration: 0,
      lastProgressTime: Date.now(),
      gapJumpLogged: false,
    };
  }

  // Setter methods for dependencies
  setLibraryTraps(libraryTraps: LibraryTraps): void {
    this.libraryTraps = libraryTraps;
  }

  setXIMProtocol(ximProtocol: XIMProtocol | null): void {
    this.ximProtocol = ximProtocol;
  }

  /**
   * Start the door lifecycle and execution
   */
  async startLifecycle(): Promise<void> {
    this.executionState.isRunning = true;
    this.executionState.startTime = Date.now();

    // Log early registers before the first instruction executes (SAS/C startup debugging)
    try {
      if (this.emulator && this.libraryManager && this.libraryManager.execLibrary) {
        const pc = this.emulator.getRegister(16);
        const sp = this.emulator.getRegister(15);
        const a4 = this.emulator.getRegister(12);
        const a5 = this.emulator.getRegister(13);
        const currentTask = this.libraryManager.execLibrary.getCurrentTaskAddress();
        const prSegList = this.emulator.readMemory32(currentTask + 0x80);
        const prCli = this.emulator.readMemory32(currentTask + 0xac);
        const cliModule = prCli
          ? this.emulator.readMemory32((prCli << 2) + 0x3c)
          : 0;
        console.log(
          `[DoorLifecycleManager] Pre-loop state: PC=0x${pc.toString(
            16
          )} SP=0x${sp.toString(16)} A4=0x${a4.toString(
            16
          )} A5=0x${a5.toString(16)} pr_SegList=0x${prSegList.toString(
            16
          )} pr_CLI=0x${prCli.toString(16)} cli_Module=0x${cliModule.toString(16)}`
        );
      }
    } catch {
      /* ignore logging errors */
    }

    // Set up timeout
    if (this.lifecycleConfig.timeout) {
      this.executionTimer = setTimeout(() => {
        console.log("[DoorLifecycleManager] Execution timeout");
        this.socket.emit("door:error", { message: "Execution timeout" });
        this.terminate();
      }, this.lifecycleConfig.timeout * 1000);
    }

    // Start the main execution loop
    await this.runExecutionLoop();
  }

  /**
   * Main execution loop - CLEAN REWRITE for lifecycle management
   */
  private async runExecutionLoop(): Promise<void> {
    try {
      if (this.lifecycleConfig.debugLevel !== "minimal") {
        this.logInitialState();
      }
      // Ensure startup message is sent for XIM doors before looping
      if (!this.executionState.startupMessageSent && this.config.doorType === "XIM") {
        await this.sendStartupMessage();
      }

      // CRITICAL: Verify all library trap ILLEGAL instructions are in place before execution
      if (this.libraryTraps) {
        const { verified, failed, failedAddrs } = this.libraryTraps.verifyIllegalInstructions();
        if (failed > 0) {
          console.error(`[DoorLifecycleManager] CRITICAL: ${failed} library trap(s) missing ILLEGAL instruction!`);
          console.error(`[DoorLifecycleManager] Failed addresses: ${failedAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);
        }
      }

      let prevA4 = this.emulator.getRegister(12);
      let prevA5 = this.emulator.getRegister(13);
      let earlyTraceCount = 0;

      while (this.executionState.isRunning) {
        // === STEP 1: Check if paused (async input) ===
        if (this.emulator.isPaused()) {
          await this.handlePausedState();
          continue;
        }

        // === STEP 2: Get current PC and handle Bulls-specific logic ===
        const pc = this.emulator.getRegister(16);
        this.recordProgressByPc(pc);
        // Track recent PCs for crash diagnostics
        this.lastPCs.push(pc);
        if (this.lastPCs.length > 8) {
          this.lastPCs.shift();
        }
        if (earlyTraceCount < 32) {
          const a4Now = this.emulator.getRegister(12);
          const a5Now = this.emulator.getRegister(13);
          if (a4Now !== prevA4 || a5Now !== prevA5) {
            console.log(
              `[DoorLifecycleManager] Early A4/A5 change iter=${this.executionState.iterationCount} PC=0x${pc.toString(
                16
              )} A4=0x${a4Now.toString(16)} A5=0x${a5Now.toString(16)}`
            );
            prevA4 = a4Now;
            prevA5 = a5Now;
          }
          earlyTraceCount++;
        }
        if (this.logArgStringOnce) {
          this.logArgStringOnce = false;
          try {
            const a0 = this.emulator.getRegister(8);
            const argStr = this.emulator.readString(a0);
            fs.appendFileSync(
              this.traceLogPath,
              `[ARGS] A0=0x${a0.toString(16)} "${argStr}"\n`,
              { encoding: "utf8" }
            );
          } catch {
            /* ignore */
          }
        }
        if (this.traceFirstCount > this.traceFirstLogged && this.traceLogPath) {
          try {
            const d0 = this.emulator.getRegister(0);
            const a0 = this.emulator.getRegister(8);
            const sp = this.emulator.getRegister(15);
            const a4 = this.emulator.getRegister(12);
            const a5 = this.emulator.getRegister(13);
            const line = `[TRACE_FIRST] iter=${this.executionState.iterationCount} PC=0x${pc.toString(
              16
            )} D0=0x${d0.toString(16)} A0=0x${a0.toString(
              16
            )} SP=0x${sp.toString(16)} A4=0x${a4.toString(
              16
            )} A5=0x${a5.toString(16)}\n`;
            fs.appendFileSync(
              this.traceLogPathFirst || this.traceLogPath,
              line,
              { encoding: "utf8" }
            );
          } catch {
            /* ignore */
          }
          this.traceFirstLogged++;
        }

        if (this.traceFirstPCOnly && this.traceLogPath) {
          this.traceFirstPCOnly = false;
          try {
            const d0 = this.emulator.getRegister(0);
            const a0 = this.emulator.getRegister(8);
            const sp = this.emulator.getRegister(15);
            const a4 = this.emulator.getRegister(12);
            const a5 = this.emulator.getRegister(13);
            fs.appendFileSync(
              this.traceLogPath,
              `[TRACE_ENTRY] PC=0x${pc.toString(16)} D0=0x${d0.toString(
                16
              )} A0=0x${a0.toString(16)} SP=0x${sp.toString(
                16
              )} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)}\n`,
              { encoding: "utf8" }
            );
          } catch {
            /* ignore */
          }
        }

        // === STEP 3: Check exit conditions ===
        if (this.checkExitConditions(pc)) {
          return;
        }

        this.monitorExecBasePointer(pc);
        this.logA6Change(pc);

        // Targeted probes for runaway dispatches
        this.probeIndirectFlow(pc);

        // === STEP 4: UNIFIED trap detection (single canonical check) ===
        const trapHandled = await this.checkAndHandleLibraryTrap(pc);
        if (trapHandled) {
          await this.handleTrapExecution(pc);
          continue;
        }

        // === STEP 4A: Check for ILLEGAL instruction ===
        if (await this.handleIllegalInstruction(pc)) {
          continue;
        }

        // === STEP 5: Execute exactly ONE instruction ===
        await this.executeInstruction(pc);

        // === STEP 6: Track progress and yield ===
        await this.trackProgressAndYield();
      }

      console.log(
        "[DoorLifecycleManager] 🏁 Execution loop completed normally"
      );
    } catch (error) {
      await this.handleExecutionError(error);
    }
  }

  private async handlePausedState(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
  }

  private checkExitConditions(pc: number): boolean {
    // Exit trap: Door returned to our sentinel address
    if (pc === 0xffff00 || pc === 0x1ff000) {
      const returnCode = this.emulator.getRegister(0);
      console.log(`[DoorLifecycleManager] === DOOR EXITED CLEANLY ===`);
      console.log(`[DoorLifecycleManager] Return code (D0): ${returnCode}`);
      console.log(
        `[DoorLifecycleManager] Total iterations: ${this.executionState.iterationCount}`
      );
      this.terminate();
      return true;
    }

    // Low memory PC (crash/corruption)
    if (pc < 0x100 && this.executionState.iterationCount > 100) {
      const a4 = this.emulator.getRegister(12);
      const a5 = this.emulator.getRegister(13);
      const sp = this.emulator.getRegister(15);
      console.log(
        `[DoorLifecycleManager] PC in low memory (0x${pc.toString(
          16
        )}) - likely stack corruption; SP=0x${sp.toString(
          16
        )} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)}`
      );
      this.terminate();
      return true;
    }

    const execLib = this.libraryManager.execLibrary;
    if (!execLib) {
      return false;
    }

    // Compute code bounds once from the seglist header so we can spot runaway PCs
    if (this.codeLowerBound === 0 || this.codeUpperBound === 0) {
      try {
        const taskAddr = execLib.getCurrentTaskAddress();
        if (taskAddr !== null) {
          const segListBptr = this.emulator.readMemory32(taskAddr + 0x80);
          if (segListBptr) {
            const headerAddr = segListBptr << 2;
            const sizeLongs = this.emulator.readMemory32(headerAddr);
            this.codeLowerBound = headerAddr + 8;
            this.codeUpperBound = this.codeLowerBound + sizeLongs * 4;
          }
        }
      } catch {
        /* ignore */
      }
    }

    const romStart = 0xf80000;
    const trapRegion = this.codeUpperBound + 0x2000; // allow a little headroom for stubs
    const a5 = this.emulator.getRegister(13);
    const execBase = execLib.getExecBaseAddress() ?? 0;
    const dosBase = execLib.getLibraryBase("dos.library") ?? 0;
    const intuitionBase = execLib.getLibraryBase("intuition.library") ?? 0;
    const graphicsBase = execLib.getLibraryBase("graphics.library") ?? 0;
    const utilityBase = execLib.getLibraryBase("utility.library") ?? 0;
    const aedoorBase = execLib.getLibraryBase("AEDoor.library") ?? 0;
    const iconBase = execLib.getLibraryBase("icon.library") ?? 0;
    const execWindowLow = execBase ? execBase - 0x800 : 0;
    const execWindowHigh = execBase ? execBase + 0x2000 : 0;
    const dosWindowLow = dosBase ? dosBase - 0x800 : 0;
    const dosWindowHigh = dosBase ? dosBase + 0x2000 : 0;
    const stubBases = [
      intuitionBase,
      graphicsBase,
      utilityBase,
      aedoorBase,
      iconBase,
    ].filter((b) => b && b > 0) as number[];
    // Broadly allow stubs: any PC within base-0x1000 .. base+0x400000 is allowed
    const stubWindows = stubBases.map((b) => ({
      low: b - 0x1000,
      high: b + 0x400000,
    }));
    const inStubByA5 = stubBases.includes(a5);
    const safeRead32 = (addr: number): number | null => {
      try {
        return this.emulator.readMemory32(addr >>> 0);
      } catch {
        return null;
      }
    };

    if (
      this.codeLowerBound &&
      this.codeUpperBound &&
      !inStubByA5 &&
      pc > trapRegion &&
      pc < romStart &&
      !(pc >= execWindowLow && pc <= execWindowHigh) &&
      !(pc >= dosWindowLow && pc <= dosWindowHigh) &&
      !stubWindows.some((w) => pc >= w.low && pc <= w.high)
    ) {
      // If the PC landed inside the current stack bounds, assume a post-exit RTS into the stack
      // and treat it as a clean termination rather than a crash.
      const stackLower =
        (this.libraryManager as any)?.execLibrary?.getStackLower?.() ?? null;
      const stackUpper =
        (this.libraryManager as any)?.execLibrary?.getStackUpper?.() ?? null;
      if (
        stackLower !== null &&
        stackUpper !== null &&
        pc >= stackLower &&
        pc <= stackUpper + 0x100
      ) {
        console.log(
          `[DoorLifecycleManager] PC reached stack region after exit (pc=0x${pc.toString(
            16
          )} stack=[0x${stackLower.toString(16)}-0x${stackUpper.toString(
            16
          )}]) - treating as clean termination`
        );
        this.terminate();
        return true;
      }

      const sp = this.emulator.getRegister(15);
      const d0 = this.emulator.getRegister(0);
      const d1 = this.emulator.getRegister(1);
      const a4 = this.emulator.getRegister(12);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const stackWords: string[] = [];
      for (let i = 0; i < 5; i++) {
        try {
          const word = this.emulator.readMemory32(sp + i * 4);
          stackWords.push(`SP+${i * 4}=0x${word.toString(16)}`);
        } catch {
          stackWords.push(`SP+${i * 4}=<err>`);
        }
      }
      const memA5m58 = safeRead32(a5 - 0x58);
      const memA0 = safeRead32(a0);
      const memA1p28 = safeRead32(a1 + 0x28);
      const memA4p8 = safeRead32(a4 + 0x8);
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      const lastPcBytes = this.lastPCs
        .map((p) => {
          try {
            const w = this.emulator.readMemory16(p >>> 0);
            return `0x${p.toString(16)}:${w.toString(16)}`;
          } catch {
            return `0x${p.toString(16)}:<err>`;
          }
        })
        .join(",");
      console.log(
        `[DoorLifecycleManager] PC out of code region: pc=0x${pc.toString(
          16
        )} code=[0x${this.codeLowerBound.toString(
          16
        )}-0x${this.codeUpperBound.toString(16)}] sp=0x${sp.toString(
          16
        )} d0=0x${d0.toString(16)} d1=0x${d1.toString(
          16
        )} a0=0x${a0.toString(16)} a1=0x${a1.toString(
          16
        )} a4=0x${a4.toString(16)} a5=0x${a5.toString(
          16
        )} stack=[${stackWords.join(
          " "
        )}] lastPCs=[${lastPcTrace}] [-0x58(A5)]=0x${(memA5m58 ?? 0).toString(
          16
        )} [A0]=0x${(memA0 ?? 0).toString(16)} [A1+0x28]=0x${(
          memA1p28 ?? 0
        ).toString(16)} [A4+0x8]=0x${(memA4p8 ?? 0).toString(
          16
        )} lastPCbytes=[${lastPcBytes}]`
      );
      this.terminate();
      return true;
    }

    return false;
  }

  private async checkAndHandleLibraryTrap(pc: number): Promise<boolean> {
    if (!this.libraryTraps) {
      return false;
    }

    // Check for duplicate trap prevention
    if (
      this.executionState.lastInterceptedTrap === pc &&
      this.executionState.iterationCount -
        this.executionState.lastInterceptedIteration <=
        2
    ) {
      this.executionState.lastInterceptedTrap = 0;
      this.executionState.lastInterceptedIteration = 0;
      return true;
    }

    const handled = this.libraryTraps.handleTrap(pc);
    if (handled) {
      this.executionState.lastInterceptedTrap = pc;
      this.executionState.lastInterceptedIteration =
        this.executionState.iterationCount;
      return true;
    }

    return false;
  }

  private async handleTrapExecution(pc: number): Promise<void> {
    // Track library trap calls for debugging
    const a6 = this.emulator.getRegister(14);
    let offset = pc - a6;

    // Handle 16-bit signed offset wrapping
    if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
      const low16 = offset & 0xffff;
      offset = low16 >= 0x8000 ? low16 - 0x10000 : low16;
    } else if (offset > 0x7fffffff) {
      offset = offset - 0x100000000;
    }

    const execLib = this.libraryManager.execLibrary;
    if (!execLib) {
      return;
    }

    const safeRead32 = (addr: number): number | null => {
      try {
        return this.emulator.readMemory32(addr >>> 0);
      } catch {
        return null;
      }
    };

    // Track DOS.Write() calls
    if (offset === -48 || pc === 0xfffffed0) {
      this.executionState.writeCallCount++;
      await this.logWriteCall(pc);
    }

    // Track AEDoor.library calls
    if (a6 === 0xff4000 || (a6 >= 0xff4000 && a6 <= 0xff4fff)) {
      this.executionState.aedoorCallCount++;
      await this.logAEDoorCall(pc, offset);
    }

    this.executionState.iterationCount++;
    this.executionState.lastProgressIteration = this.executionState.iterationCount;
    this.executionState.lastProgressTime = Date.now();
    // Track A4/A5 changes to catch early corruption; log nearby frame slots
    const a4 = this.emulator.getRegister(12);
    const a5 = this.emulator.getRegister(13);
    const instrWord = this.emulator.readMemory16(pc);
    if (
      (a4 !== 0 && a4 !== this.executionState.lastSignificantPC) ||
      a5 !== this.executionState.lastInterceptedTrap
    ) {
      const memA4m40 =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x40) >>> 0) : 0;
      const memA4m1c =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x1c) >>> 0) : 0;
      console.log(
        `[DoorLifecycleManager] A4/A5 change iter=${this.executionState.iterationCount} PC=0x${pc.toString(
          16
        )} A4=0x${a4.toString(16)} A5=0x${a5.toString(
          16
        )} [-0x40]=0x${memA4m40.toString(16)} [-0x1c]=0x${memA4m1c.toString(
          16
        )}`
      );
      this.executionState.lastSignificantPC = a4;
      this.executionState.lastInterceptedTrap = a5;
    }

    // Generic probe for indirect jsr/jmp through A0/A1/A2 to catch runaway targets
    const isIndirectJump =
      instrWord === 0x4ed0 ||
      instrWord === 0x4ed1 ||
      instrWord === 0x4ed2 ||
      instrWord === 0x4e90 ||
      instrWord === 0x4e91 ||
      instrWord === 0x4e92;
    if (isIndirectJump) {
      const targetRegIndex = 8 + (instrWord & 0x7);
      const targetRegValue = this.emulator.getRegister(targetRegIndex);
      const memTarget = safeRead32(targetRegValue);
      const memA4m4c =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x4c) >>> 0) : 0;
      const memA4m50 =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x50) >>> 0) : 0;
      const memA4m58 =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x58) >>> 0) : 0;
      const memA5m58 = safeRead32(a5 - 0x58);
      const mem5cda = safeRead32(0x5cda);
      const mem5cfa = safeRead32(0x5cfa);
      const mem4b90 = safeRead32(0x4b90);
      const sp = this.emulator.getRegister(15);
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      const formatVal = (value: number | null): string =>
        value === null ? "<err>" : `0x${value.toString(16)}`;
      console.log(
        `[DoorLifecycleManager] INDIRECT-${instrWord >= 0x4ed0 ? "JMP" : "JSR"} pc=0x${pc.toString(
          16
        )} iter=${this.executionState.iterationCount} sp=0x${sp.toString(
          16
        )} targetReg=a${(instrWord & 0x7).toString(
          16
        )} target=0x${targetRegValue.toString(
          16
        )} [target]=${formatVal(memTarget)} A4=0x${a4.toString(
          16
        )} [-0x4c(A4)]=0x${memA4m4c.toString(
          16
        )} [-0x50(A4)]=0x${memA4m50.toString(
          16
        )} [-0x58(A4)]=0x${memA4m58.toString(
          16
        )} A5=0x${a5.toString(16)} [-0x58(A5)]=${formatVal(
          memA5m58
        )} [0x5cda]=${formatVal(mem5cda)} [0x5cfa]=${formatVal(
          mem5cfa
        )} [0x4b90]=${formatVal(mem4b90)} lastPCs=[${lastPcTrace}]`
      );
    }

    // Focused trace for MultiTop vtable call region (offset ~0x3bb0 -> PC ~0x4bb0)
    if (pc >= 0x4b20 && pc <= 0x4c30) {
      const sp = this.emulator.getRegister(15);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const memA5m58 = this.emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = this.emulator.readMemory32(a0 >>> 0);
      const memA1p28 = this.emulator.readMemory32((a1 + 0x28) >>> 0);
      const memA4p8 =
        a4 !== 0 ? this.emulator.readMemory32((a4 + 0x8) >>> 0) : 0;
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      console.log(
        `[DoorLifecycleManager] VTABLE probe PC=0x${pc.toString(
          16
        )} iter=${this.executionState.iterationCount} SP=0x${sp.toString(
          16
        )} A4=0x${a4.toString(16)} A5=0x${a5.toString(
          16
        )} A0=0x${a0.toString(16)} A1=0x${a1.toString(
          16
        )} [-0x58(A5)]=0x${memA5m58.toString(
          16
        )} [A0]=0x${memA0.toString(16)} [A1+0x28]=0x${memA1p28.toString(
          16
        )} [A4+0x8]=0x${memA4p8.toString(16)} lastPCs=[${lastPcTrace}]`
      );
    }

    // Probe near the post-FreeArgs jump site (observed PCs ~0x5c90-0x5cfa before runaway)
    if (pc >= 0x5c90 && pc <= 0x5d10) {
      const sp = this.emulator.getRegister(15);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const memA5m58 = this.emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = this.emulator.readMemory32(a0 >>> 0);
      const memA1p28 = this.emulator.readMemory32((a1 + 0x28) >>> 0);
      const memA4p8 =
        a4 !== 0 ? this.emulator.readMemory32((a4 + 0x8) >>> 0) : 0;
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      console.log(
        `[DoorLifecycleManager] POST-FREEARGS probe PC=0x${pc.toString(
          16
        )} iter=${this.executionState.iterationCount} SP=0x${sp.toString(
          16
        )} A4=0x${a4.toString(16)} A5=0x${a5.toString(
          16
        )} A0=0x${a0.toString(16)} A1=0x${a1.toString(
          16
        )} [-0x58(A5)]=0x${memA5m58.toString(
          16
        )} [A0]=0x${memA0.toString(16)} [A1+0x28]=0x${memA1p28.toString(
        16
        )} [A4+0x8]=0x${memA4p8.toString(
          16
        )} lastPCs=[${lastPcTrace}] SP=0x${sp.toString(16)}`
      );
    }

    // Probe jmp return blocks around 0x4c52/0x4c54 that may jump via A0
    if (pc >= 0x4c40 && pc <= 0x4c60) {
      const sp = this.emulator.getRegister(15);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const a2 = this.emulator.getRegister(10);
      const memA4m4c =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x4c) >>> 0) : 0;
      const memA4m50 =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x50) >>> 0) : 0;
      const memA4m58 =
        a4 !== 0 ? this.emulator.readMemory32((a4 - 0x58) >>> 0) : 0;
      const memA5m58 = this.emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = this.emulator.readMemory32(a0 >>> 0);
      const memA1 = this.emulator.readMemory32(a1 >>> 0);
      const memA2 = this.emulator.readMemory32(a2 >>> 0);
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      console.log(
        `[DoorLifecycleManager] JMP-A0 probe PC=0x${pc.toString(
          16
        )} iter=${this.executionState.iterationCount} SP=0x${sp.toString(
          16
        )} A4=0x${a4.toString(16)} A5=0x${a5.toString(
          16
        )} A0=0x${a0.toString(16)} A1=0x${a1.toString(
          16
        )} A2=0x${a2.toString(
          16
        )} [-0x4c(A4)]=0x${memA4m4c.toString(
          16
        )} [-0x50(A4)]=0x${memA4m50.toString(
          16
        )} [-0x58(A4)]=0x${memA4m58.toString(
          16
        )} [-0x58(A5)]=0x${memA5m58.toString(
          16
        )} [A0]=0x${memA0.toString(16)} [A1]=0x${memA1.toString(
          16
        )} [A2]=0x${memA2.toString(16)} lastPCs=[${lastPcTrace}]`
      );
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  private probeIndirectFlow(pc: number): void {
    try {
      const instrWord = this.emulator.readMemory16(pc >>> 0);
      const opType = instrWord & 0xffc0;
      const isJsr = opType === 0x4e80;
      const isJmp = opType === 0x4ec0;
      const inStartupFlow = pc >= 0x3b00 && pc <= 0x3c00;
      const inPostFreeRange = pc >= 0x5c90 && pc <= 0x5d10;
      if (!isJsr && !isJmp && !inPostFreeRange && !inStartupFlow) {
        return;
      }

      const safeRead16 = (addr: number): number | null => {
        try {
          return this.emulator.readMemory16(addr >>> 0);
        } catch {
          return null;
        }
      };
      const safeRead32 = (addr: number): number | null => {
        try {
          return this.emulator.readMemory32(addr >>> 0);
        } catch {
          return null;
        }
      };
      const signExtend16 = (val: number): number =>
        val & 0x8000 ? val - 0x10000 : val;

      const mmm = (instrWord >> 3) & 0x7;
      const regField = instrWord & 0x7;
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const a2 = this.emulator.getRegister(10);
      const a4 = this.emulator.getRegister(12);
      const a5 = this.emulator.getRegister(13);
      const a6 = this.emulator.getRegister(14);
      const sp = this.emulator.getRegister(15);
      let target: number | null = null;
      let extWord: number | null = null;
      let extLong: number | null = null;

      if (isJsr || isJmp) {
        extWord = safeRead16(pc + 2);
        switch (mmm) {
          case 2: {
            target = this.emulator.getRegister(8 + regField);
            break;
          }
          case 5: {
            if (extWord !== null) {
              const base = this.emulator.getRegister(8 + regField);
              target = (base + signExtend16(extWord)) >>> 0;
            }
            break;
          }
          case 7: {
            if (regField === 0 && extWord !== null) {
              target = signExtend16(extWord) >>> 0;
            } else if (regField === 1) {
              extLong = safeRead32(pc + 2);
              if (extLong !== null) {
                target = extLong >>> 0;
              }
            }
            break;
          }
          default:
            break;
        }
      }

      const targetMem = target !== null ? safeRead32(target) : null;
      const memA5m58 = safeRead32(a5 - 0x58);
      const mem5cda = safeRead32(0x5cda);
      const mem5cfa = safeRead32(0x5cfa);
      const mem4b90 = safeRead32(0x4b90);
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      const formatVal = (value: number | null): string =>
        value === null ? "<err>" : `0x${value.toString(16)}`;

      if (inStartupFlow || inPostFreeRange) {
      if (inStartupFlow || inPostFreeRange) {
        const targetBytes =
          target !== null
            ? [safeRead16(target), safeRead16(target + 2)]
                .map((v) => (v === null ? "<err>" : `0x${v.toString(16)}`))
                .join(",")
            : "<none>";
        console.log(
          `[DoorLifecycleManager] FLOW probe pc=0x${pc.toString(
            16
          )} instr=0x${instrWord.toString(
            16
          )} kind=${isJsr ? "JSR" : isJmp ? "JMP" : "PCWIN"} mode=${mmm}/${
            regField
          } target=${target !== null ? `0x${target.toString(16)}` : "<unk>"} ext=${
            extWord !== null ? `0x${extWord.toString(16)}` : "<none>"
          } extLong=${
            extLong !== null ? `0x${extLong.toString(16)}` : "<none>"
          } targetWords=${targetBytes} sp=0x${sp.toString(
            16
          )} A0=0x${a0.toString(16)} A1=0x${a1.toString(
            16
          )} A2=0x${a2.toString(16)} A4=0x${a4.toString(
            16
          )} A5=0x${a5.toString(16)} A6=0x${a6.toString(
            16
          )} [-0x58(A5)]=${formatVal(
            memA5m58
          )} [target]=${formatVal(targetMem)} [0x5cda]=${formatVal(
            mem5cda
          )} [0x5cfa]=${formatVal(mem5cfa)} [0x4b90]=${formatVal(
            mem4b90
          )} lastPCs=[${lastPcTrace}]`
        );
      }
      }
    } catch {
      /* ignore probe errors */
    }
  }

  private logA6Change(pc: number): void {
    const execBase = this.libraryManager.execLibrary?.getExecBaseAddress();
    const dosBase =
      this.libraryManager.execLibrary?.getLibraryBase("dos.library") ?? 0;
    const intuitionBase =
      this.libraryManager.execLibrary?.getLibraryBase("intuition.library") ?? 0;
    const graphicsBase =
      this.libraryManager.execLibrary?.getLibraryBase("graphics.library") ?? 0;
    const utilityBase =
      this.libraryManager.execLibrary?.getLibraryBase("utility.library") ?? 0;
    const allowedBases = [
      execBase,
      dosBase,
      intuitionBase,
      graphicsBase,
      utilityBase,
    ].filter((b) => b && b > 0) as number[];

    const a6 = this.emulator.getRegister(14);
    const isAllowed = allowedBases.includes(a6);
    if (a6 !== this.lastA6Logged && !isAllowed) {
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      console.log(
        `[DoorLifecycleManager] A6 change pc=0x${pc.toString(
          16
        )} newA6=0x${a6.toString(16)} allowed=${isAllowed} lastPCs=[${lastPcTrace}]`
      );
      this.lastA6Logged = a6;
    }
  }

  private monitorExecBasePointer(pc: number): void {
    const execBasePtr = this.safeRead32Global(0x4);
    if (execBasePtr === null) {
      return;
    }
    if (this.lastExecBasePointer === 0) {
      this.lastExecBasePointer = execBasePtr;
      return;
    }
    if (execBasePtr !== this.lastExecBasePointer) {
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      console.log(
        `[DoorLifecycleManager] ExecBase pointer changed at pc=0x${pc.toString(
          16
        )}: 0x${this.lastExecBasePointer.toString(
          16
        )} -> 0x${execBasePtr.toString(16)} lastPCs=[${lastPcTrace}]`
      );
      this.lastExecBasePointer = execBasePtr;
    }
  }

  private safeRead32Global(addr: number): number | null {
    try {
      return this.emulator.readMemory32(addr >>> 0);
    } catch {
      return null;
    }
  }

  private async handleIllegalInstruction(pc: number): Promise<boolean> {
    const instrAtPC = this.emulator.readMemory16(pc);
    if (instrAtPC === 0x4afc) {
      // ILLEGAL instruction
      console.log(
        `[DoorLifecycleManager] 🔥 ILLEGAL DETECTED at PC=0x${pc.toString(16)}`
      );
      const handled = this.emulator.handleIllegal(pc);
      if (handled) {
        this.executionState.iterationCount++;
        await new Promise((resolve) => setImmediate(resolve));
        return true;
      }
    }
    return false;
  }

  // Track PC history for debugging bad jumps
  private pcHistory: number[] = [];
  private readonly PC_HISTORY_SIZE = 50; // Increased from 10 to capture more context before crash

  private async executeInstruction(pc: number): Promise<void> {
    const wasAt24a6 = pc === 0x24a6;

    // Track PC history (circular buffer)
    this.pcHistory.push(pc);
    if (this.pcHistory.length > this.PC_HISTORY_SIZE) {
      this.pcHistory.shift();
    }

    // Detect jumps to unusual memory regions
    // Exception handlers are now at 0x180000 (within chip RAM)
    if (pc >= 0x180000 && pc < 0x180800) {
      // This is our exception handler space (64 handlers x 32 bytes) - ok
    } else if (pc >= 0x8000 && pc < 0xa000 && !this.executionState.gapJumpLogged) {
      // PC in gap between typical CODE and DATA segments - likely bad jump
      // This range 0x8000-0xA000 typically falls between segments
      console.error(`\n*** JUMP TO CODE/DATA GAP DETECTED ***`);
      console.error(`  Current PC: 0x${pc.toString(16)}`);
      console.error(`  Iteration: ${this.executionState.iterationCount}`);
      console.error(`  SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.error(`  A4: 0x${this.emulator.getRegister(12).toString(16)}`);
      console.error(`  A5: 0x${this.emulator.getRegister(13).toString(16)}`);
      console.error(`  PC History (last ${Math.min(20, this.pcHistory.length)}):`);
      const startIdx = Math.max(0, this.pcHistory.length - 20);
      this.pcHistory.slice(startIdx).forEach((p, i) => {
        console.error(`    [${startIdx + i}] 0x${p.toString(16)}`);
      });
      this.executionState.gapJumpLogged = true; // Only log once
    } else if (pc >= 0xf80000) {
      // This is ROM space - check if it's a bad jump
      console.error(`\n*** JUMP TO ROM DETECTED ***`);
      console.error(`  Current PC: 0x${pc.toString(16)}`);
      console.error(`  PC History (last ${this.pcHistory.length} instructions):`);
      this.pcHistory.forEach((p, i) => {
        console.error(`    [${i}] 0x${p.toString(16)}`);
      });
      console.error(`  Iteration: ${this.executionState.iterationCount}`);
    }

    // CRITICAL: Track SP before instruction to detect corruption
    const spBefore = this.emulator.getRegister(15);

    // CRITICAL FIX: Check for ILLEGAL instruction (0x4AFC) BEFORE executing
    // This is how we intercept library calls - doors use JSR -offset(A6)
    // which jumps to library vectors containing ILLEGAL instructions
    const opcode = this.emulator.readMemory16(pc);
    if (opcode === 0x4AFC) {
      // ILLEGAL instruction - this is a library call trap!
      // handleIllegal will route to LibraryTraps if PC is at library vector
      const handled = this.emulator.handleIllegal(pc);
      if (handled) {
        // Library call was handled, no need to execute the instruction
        this.executionState.totalCycles += 4; // ILLEGAL takes ~4 cycles
        return;
      }
      // If not handled, fall through to normal execution
    }

    const cyclesExecuted = this.emulator.executeInstruction();
    this.executionState.totalCycles += cyclesExecuted;

    // CRITICAL: Check if we ended up at an exception handler
    // This means MOIRA triggered an exception internally (not through our ILLEGAL check)
    const pcAfterExec = this.emulator.getRegister(16);
    if (pcAfterExec >= 0x180000 && pcAfterExec < 0x180800) {
      // We're at an exception handler! MOIRA handled an exception internally.
      // Check which exception (each handler is 32 bytes apart)
      const exceptionNum = (pcAfterExec - 0x180000) / 32;
      console.error(`[DoorLifecycleManager] *** MOIRA EXCEPTION ${exceptionNum} at PC=0x${pc.toString(16)} ***`);

      // For ILLEGAL (exception 4), try our library trap handler
      if (exceptionNum === 4) {
        // Get the PC that caused the exception (it's on stack)
        const sp = this.emulator.getRegister(15);
        const exceptionPC = this.emulator.readMemory32(sp + 2); // SR is at SP, PC at SP+2
        console.error(`[DoorLifecycleManager] ILLEGAL exception, original PC was 0x${exceptionPC.toString(16)}`);

        // Try to handle as library trap
        const handled = this.emulator.handleIllegal(exceptionPC);
        if (handled) {
          console.log(`[DoorLifecycleManager] Recovered from ILLEGAL via library trap`);
          // Pop the exception frame manually (SR=2 bytes, PC=4 bytes)
          this.emulator.setRegister(15, sp + 6);
          return;
        }
      }

      // If not handled, log details and continue (exception handler will try to recover)
      console.error(`[DoorLifecycleManager] Exception not handled as library trap, letting handler run`);
    }

    // Check for unexpected PC jumps (not normal instruction flow)
    const newPc = this.emulator.getRegister(16);
    const pcDelta = newPc - pc;
    // Normal instructions advance PC by 2-10 bytes, branches go backwards or small forward
    // A jump from 0x2xxx to 0x9xxx is suspicious
    if (pcDelta > 0x2000 || (pcDelta < 0 && pcDelta > -0x8000 && newPc > 0x8000 && newPc < 0xa000)) {
      console.error(`\n*** UNEXPECTED PC JUMP DETECTED ***`);
      console.error(`  PC before: 0x${pc.toString(16)}`);
      console.error(`  PC after:  0x${newPc.toString(16)}`);
      console.error(`  Delta: 0x${pcDelta.toString(16)} (${pcDelta})`);
      console.error(`  SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.error(`  SR: 0x${this.emulator.getRegister(17).toString(16)}`);
      console.error(`  Iteration: ${this.executionState.iterationCount}`);
      try {
        const op0 = this.emulator.readMemory(pc);
        const op1 = this.emulator.readMemory(pc + 1);
        const opcode = (op0 << 8) | op1;
        console.error(`  Instruction at 0x${pc.toString(16)}: 0x${opcode.toString(16).padStart(4, '0')}`);
      } catch (e) {
        console.error(`  Could not read instruction`);
      }
      console.error(`  Registers: D0=0x${this.emulator.getRegister(0).toString(16)} D1=0x${this.emulator.getRegister(1).toString(16)}`);
      console.error(`             A0=0x${this.emulator.getRegister(8).toString(16)} A5=0x${this.emulator.getRegister(13).toString(16)} A6=0x${this.emulator.getRegister(14).toString(16)}`);
    }

    // CRITICAL: Check for SP corruption immediately after instruction
    const spAfter = this.emulator.getRegister(15);
    if (spAfter === 0xfffffffa || spAfter < 0x1000 || spAfter > 0x100000) {
      const newPc = this.emulator.getRegister(16);
      console.error(`\n*** SP CORRUPTION DETECTED AFTER INSTRUCTION ***`);
      console.error(`  PC before: 0x${pc.toString(16)}`);
      console.error(`  PC after:  0x${newPc.toString(16)}`);
      console.error(`  SP before: 0x${spBefore.toString(16)}`);
      console.error(`  SP after:  0x${spAfter.toString(16)} *** CORRUPTED ***`);
      console.error(`  Cycles: ${cyclesExecuted}`);
      console.error(`  Iteration: ${this.executionState.iterationCount}`);
      console.error(`  PC History (last ${this.pcHistory.length}):`);
      this.pcHistory.forEach((p, i) => {
        console.error(`    [${i}] 0x${p.toString(16)}`);
      });

      // Read instruction bytes at PC
      try {
        const op0 = this.emulator.readMemory(pc);
        const op1 = this.emulator.readMemory(pc + 1);
        const opcode = (op0 << 8) | op1;
        console.error(`  Instruction at 0x${pc.toString(16)}: 0x${opcode.toString(16).padStart(4, '0')}`);
      } catch (e) {
        console.error(`  Could not read instruction at 0x${pc.toString(16)}`);
      }

      // This will be caught by the main loop and terminate the door
      throw new Error(`SP corrupted from 0x${spBefore.toString(16)} to 0x${spAfter.toString(16)}`);
    }

    // Check PC after executeInstruction() if we were at 0x24a6
    if (wasAt24a6) {
      const newPc = this.emulator.getRegister(16);
      console.log(
        `[DoorLifecycleManager] AFTER executeInstruction(): PC = 0x${newPc.toString(
          16
        )}, cycles=${cyclesExecuted}`
      );
    }
  }

  private async trackProgressAndYield(): Promise<void> {
    this.executionState.iterationCount++;
    this.executionState.progressCheckCount++;
    this.executionState.progressCheckCountGlobal++;

    // Initialize start time for elapsed tracking
    if (!this.executionState.startTime) {
      this.executionState.startTime = Date.now();
    }

    // Log progress every 5k iterations only when explicitly enabled
    const progressLoggingEnabled = process.env.AEDOOR_PROGRESS_LOG === "1";
    if (
      progressLoggingEnabled &&
      this.executionState.iterationCount % 5000 === 0 &&
      this.executionState.iterationCount > 0
    ) {
      await this.logProgress();
    }

    const isWaitingForInput =
      this.ximProtocol?.isWaitingForLineInput() ?? false;

    if (this.traceRegs && this.traceLogPath) {
      if (this.executionState.iterationCount % this.traceInterval === 0) {
        try {
          const pc = this.emulator.getRegister(16);
      const d0 = this.emulator.getRegister(0);
      const d1 = this.emulator.getRegister(1);
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const line = `[DoorRegs] ${new Date().toISOString()} iter=${this.executionState.iterationCount} pc=0x${pc.toString(
        16
      )} d0=0x${d0.toString(16)} d1=0x${d1.toString(
        16
      )} a0=0x${a0.toString(16)} a1=0x${a1.toString(16)}\n`;
          fs.appendFileSync(this.traceLogPath, line, { encoding: "utf8" });
        } catch {
          /* ignore trace errors */
        }
      }
    }

    // Prevent infinite loops (safety limit). When the door is waiting for user
    // input, extend the guard to give time for keystrokes to arrive.
    const iterationsSinceProgress =
      this.executionState.iterationCount -
      this.executionState.lastProgressIteration;
    const timeSinceProgress =
      Date.now() - this.executionState.lastProgressTime;
    const guardTriggered =
      !this.lifecycleConfig.disableGuard &&
      iterationsSinceProgress > this.lifecycleConfig.loopGuardLimit &&
      timeSinceProgress > this.lifecycleConfig.progressTimeoutMs;

    if (guardTriggered) {
      if (isWaitingForInput) {
        // Extend guard and continue looping to allow user input.
        this.lifecycleConfig.loopGuardLimit += 50000;
        console.log(
          `[DoorLifecycleManager] Extending loop guard while waiting for input -> ${this.lifecycleConfig.loopGuardLimit}`
        );
        this.executionState.lastProgressIteration = this.executionState.iterationCount;
        this.executionState.lastProgressTime = Date.now();
      } else {
        await this.handleGuardLimit();
        return;
      }
    }

    // Yield to event loop for responsiveness
    if (isWaitingForInput) {
      if (this.executionState.iterationCount % 10 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    } else {
      if (this.executionState.iterationCount % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  private recordProgressByPc(pc: number): void {
    // SAmiLog3 busy loop lives around 0x5c90-0x5d10; count it as progress so the guard
    // doesn't kill a door that is still actively spinning.
    if (pc >= 0x5c90 && pc <= 0x5d10) {
      this.executionState.lastProgressIteration = this.executionState.iterationCount;
      this.executionState.lastProgressTime = Date.now();
    }
  }

  private async logProgress(): Promise<void> {
    const elapsed = Date.now() - this.executionState.startTime!;
    const totalSeconds =
      this.executionState.totalCycles /
      (this.lifecycleConfig.cycleTarget * 1000000);
    const pc = this.emulator.getRegister(16);

    console.log(
      `[DoorLifecycleManager] 📊 PROGRESS: Iteration ${
        this.executionState.iterationCount
      } (${(this.executionState.totalCycles / 1000000).toFixed(
        1
      )}M cycles, ${totalSeconds.toFixed(2)}s virtual, ${elapsed}ms real)`
    );
    console.log(`[DoorLifecycleManager] 📊 PC: 0x${pc.toString(16)}`);
    // console.log(
    //   `[DoorLifecycleManager] 📊 Write calls: ${this.executionState.writeCallCount}, AEDoor calls: ${this.executionState.aedoorCallCount}`
    // );

    // // Memory check at progress milestones
    // try {
    //   const mem2001 = this.emulator.readMemory32(0x2001);
    //   console.log(
    //     `[DoorLifecycleManager] 📊 memory[0x2001]: 0x${mem2001.toString(16)}`
    //   );
    // } catch (e) {
    //   console.log(`[DoorLifecycleManager] 📊 memory[0x2001]: ERROR ${e}`);
    // }
  }

  private async handleGuardLimit(): Promise<void> {
    console.log(
      `[DoorLifecycleManager] 🛑 SAFETY LIMIT: Door running for ${this.lifecycleConfig.loopGuardLimit} iterations - likely stuck`
    );
    console.log(
      `[DoorLifecycleManager] 🛑 Last PC: 0x${this.emulator
        .getRegister(16)
        .toString(16)}`
    );
    console.log(
      `[DoorLifecycleManager] 🛑 Iterations since last progress: ${
        this.executionState.iterationCount -
        this.executionState.lastProgressIteration
      }, ms since progress: ${
        Date.now() - this.executionState.lastProgressTime
      }`
    );
    console.log(
      `[DoorLifecycleManager] 🛑 Total cycles: ${this.executionState.totalCycles}`
    );
    console.log(
      `[DoorLifecycleManager] 🛑 Elapsed time: ${
        Date.now() - this.executionState.startTime!
      }ms`
    );
    console.log(`[DoorLifecycleManager] 🛑 Terminating for debugging purposes`);
    this.terminate();
  }

  private async logWriteCall(pc: number): Promise<void> {
    const fileHandle = this.emulator.getRegister(8); // A0 = file handle
    const buffer = this.emulator.getRegister(9); // A1 = buffer
    const length = this.emulator.getRegister(0); // D0 = length

    console.log(
      `[DoorLifecycleManager] *** DOS.Write() CALL #${this.executionState.writeCallCount} ***`
    );
    console.log(
      `[DoorLifecycleManager]   PC: 0x${pc.toString(16)}, Iteration: ${
        this.executionState.iterationCount
      }`
    );
    console.log(
      `[DoorLifecycleManager]   File handle: 0x${fileHandle.toString(16)}`
    );
    console.log(
      `[DoorLifecycleManager]   Buffer: 0x${buffer.toString(
        16
      )}, Length: ${length}`
    );

    // Log the Write() call details
    this.writeCallLog.push({
      pc,
      iteration: this.executionState.iterationCount,
      args: { fileHandle, buffer, length },
    });
  }

  private async logAEDoorCall(pc: number, offset: number): Promise<void> {
    const functionName = this.getAEDoorFunctionName(offset);
    console.log(
      `[DoorLifecycleManager] *** AEDoor.library CALL #${this.executionState.aedoorCallCount} ***`
    );
    console.log(
      `[DoorLifecycleManager]   Function: ${functionName} (offset ${offset})`
    );
    console.log(
      `[DoorLifecycleManager]   PC: 0x${pc.toString(16)}, Iteration: ${
        this.executionState.iterationCount
      }`
    );

    this.aedoorCallLog.push({
      pc,
      iteration: this.executionState.iterationCount,
      function: functionName,
    });
  }

  private getAEDoorFunctionName(offset: number): string {
    // Simplified version - would reference the full mapping
    const functionMap: { [key: string]: string } = {
      "-6": "Open",
      "-12": "Close",
      "-48": "Write",
      "-500": "WriteStr",
      "-512": "GetUserInput",
      "-572": "LineInput",
    };
    return functionMap[offset.toString()] || `Unknown(offset ${offset})`;
  }

  private async handleExecutionError(error: unknown): Promise<void> {
    const pc = this.emulator.getRegister(16);
    const sp = this.emulator.getRegister(15);
    const doorName = path.basename(this.config.executablePath);

    console.error("[DoorLifecycleManager] ERROR in execution loop:", error);
    console.error(
      `[DoorLifecycleManager] Iteration: ${this.executionState.iterationCount}`
    );
    console.error(`[DoorLifecycleManager] PC: 0x${pc.toString(16)}`);
    console.error(`[DoorLifecycleManager] SP: 0x${sp.toString(16)}`);
    console.error(
      `[DoorLifecycleManager] Stack: ${
        error instanceof Error ? error.stack : "No stack"
      }`
    );

    // Gather all registers for crash dump
    const registers = {
      d0: this.emulator.getRegister(0),
      d1: this.emulator.getRegister(1),
      d2: this.emulator.getRegister(2),
      d3: this.emulator.getRegister(3),
      d4: this.emulator.getRegister(4),
      d5: this.emulator.getRegister(5),
      d6: this.emulator.getRegister(6),
      d7: this.emulator.getRegister(7),
      a0: this.emulator.getRegister(8),
      a1: this.emulator.getRegister(9),
      a2: this.emulator.getRegister(10),
      a3: this.emulator.getRegister(11),
      a4: this.emulator.getRegister(12),
      a5: this.emulator.getRegister(13),
      a6: this.emulator.getRegister(14),
    };

    // Read stack contents (8 longwords starting at SP)
    const stackContents: number[] = [];
    try {
      for (let i = 0; i < 8; i++) {
        const addr = sp + (i * 4);
        if (addr >= 0 && addr < 0x1000000) { // Valid 24-bit address
          stackContents.push(this.emulator.readMemory32(addr));
        }
      }
    } catch {
      // Ignore memory read errors during crash dump
    }

    // Gather memory at key locations
    const memoryDump: { address: number; value: number; label?: string }[] = [];
    try {
      // A4-relative data (small data model)
      const a4 = registers.a4;
      if (a4 >= 0x7FFE) {
        memoryDump.push({ address: a4 - 0x40, value: this.emulator.readMemory32(a4 - 0x40), label: 'A4-0x40' });
        memoryDump.push({ address: a4 - 0x1c, value: this.emulator.readMemory32(a4 - 0x1c), label: 'A4-0x1c' });
      }
      // A5-relative frame (Amiga E runtime)
      const a5 = registers.a5;
      if (a5 > 0) {
        memoryDump.push({ address: a5 - 0x28, value: this.emulator.readMemory32(a5 - 0x28), label: 'A5-0x28 execbase' });
        memoryDump.push({ address: a5 - 0x2c, value: this.emulator.readMemory32(a5 - 0x2c), label: 'A5-0x2c dosbase' });
      }
      // Memory at PC (what instruction caused the crash)
      if (pc > 0 && pc < 0x1000000) {
        memoryDump.push({ address: pc, value: this.emulator.readMemory32(pc), label: 'at PC' });
      }
    } catch {
      // Ignore memory read errors during crash dump
    }

    // Send detailed crash information to sysop
    SysopDebugUtil.debugDoorCrash(
      this.socket,
      this.config.bbsSession,
      doorName,
      {
        pc,
        sp,
        iteration: this.executionState.iterationCount,
        error: error instanceof Error ? error.message : String(error),
        registers,
        pcHistory: [...this.pcHistory], // Copy of PC history
        stackContents,
        memoryDump,
        lastSignificantPC: this.executionState.lastSignificantPC,
        writeCallCount: this.executionState.writeCallCount,
        aedoorCallCount: this.executionState.aedoorCallCount,
        stackBase: 0x6e74, // From DoorLoader
        stackSize: this.config.stack || 8192,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    this.socket.emit("door:error", {
      message: error instanceof Error ? error.message : "Execution error",
    });
    this.terminate();
  }

  private logInitialState(): void {
    console.log(
      "[DoorLifecycleManager] ==============================================="
    );
    console.log(
      "[DoorLifecycleManager] 🚀 EXECUTION LOOP STARTING - LIFECYCLE MANAGER"
    );
    console.log(
      "[DoorLifecycleManager] ==============================================="
    );

    // Verify all critical components
    console.log("[DoorLifecycleManager] 📋 SYSTEM STATUS:");
    console.log(`[DoorLifecycleManager]   Emulator: ✅`);
    console.log(
      `[DoorLifecycleManager]   Running: ${this.executionState.isRunning} ✅`
    );
    console.log(`[DoorLifecycleManager]   Socket: ${this.socket.connected} ✅`);
    console.log(
      `[DoorLifecycleManager]   Door Type: ${this.config.doorType || "SIM"}`
    );
    console.log(
      `[DoorLifecycleManager]   Executable: ${this.config.executablePath
        .split("/")
        .pop()}`
    );
    console.log(
      `[DoorLifecycleManager]   Debug Level: ${this.lifecycleConfig.debugLevel}`
    );
  }

  private async sendStartupMessage(): Promise<void> {
    console.log(
      "[DoorLifecycleManager] === SENDING STARTUP MESSAGE TO DOOR ==="
    );
    this.executionState.startupMessageSent = true;
    if (this.messageHandler) {
      try {
        this.messageHandler.sendStartupMessage();
      } catch (err) {
        console.error(
          "[DoorLifecycleManager] Error sending startup message:",
          err
        );
      }
    } else {
      console.warn(
        "[DoorLifecycleManager] No DoorMessageHandler available for startup message"
      );
    }
  }

  /**
   * Terminate the door lifecycle
   */
  terminate(): void {
    if (!this.executionState.isRunning) return;

    console.log("[DoorLifecycleManager] Terminating door lifecycle");

    this.executionState.isRunning = false;

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }

    console.log("[DoorLifecycleManager] 🚪 Emitting door:status = terminated");
    this.socket.emit("door:status", { status: "terminated" });
    console.log("[DoorLifecycleManager] Door lifecycle terminated");
  }

  /**
   * Pause the execution
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume the execution
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Get current execution state
   */
  getExecutionState(): Readonly<ExecutionState> {
    return { ...this.executionState };
  }

  /**
   * Check if lifecycle is running
   */
  isRunning(): boolean {
    return this.executionState.isRunning;
  }
}
