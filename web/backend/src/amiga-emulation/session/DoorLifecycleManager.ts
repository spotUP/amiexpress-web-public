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
import { TIMDoorMessageHandler } from "./TIMDoorMessageHandler.js";
import { SysopDebugUtil, DebugSeverity } from "../../utils/sysop-debug.util.js";
import { DoorLogger } from "../DoorLogger.js";
import { DebugMonitor } from "./lifecycle/DebugMonitor.js";
import { DoorExecutionLogger } from "./lifecycle/DoorExecutionLogger.js";
import {
  logInitialState as logInitialStateHelper,
  sendStartupMessage as sendStartupMessageHelper,
} from "./lifecycle/DoorStartupHelper.js";
import { installMessageCallbacks } from "./lifecycle/door-message-callbacks.js";
import { DoorExitDetector, type CodeBoundsRef } from "./lifecycle/DoorExitDetector.js";
import { DoorTrapDispatcher } from "./lifecycle/DoorTrapDispatcher.js";
import { getSystemTime } from '../../utils/date-time.util';
import { debugLog } from "../../utils/debug-log";

// Performance: Verbose 68K debugging is disabled by default
// Set DEBUG_68K=1 to enable detailed execution tracing
// Set TRACE_PC_JUMPS=1 to log all PC jumps > 0x1000 bytes (catches bad jumps/returns)
const DEBUG_68K = process.env.DEBUG_68K === "1";
const TRACE_PC_JUMPS = process.env.TRACE_PC_JUMPS === "1";

// ExecutionState and LifecycleConfig live in ./lifecycle/lifecycle-types so
// the helper modules in that directory can import them without forming a
// cycle through this file. Re-exported here so existing
// `from "../DoorLifecycleManager.js"` imports keep working.
export type { ExecutionState, LifecycleConfig } from './lifecycle/lifecycle-types.js';
import type { ExecutionState, LifecycleConfig } from './lifecycle/lifecycle-types.js';

export class DoorLifecycleManager {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private libraryTraps: LibraryTraps | null = null;
  private ximProtocol: XIMProtocol | null = null;
  private timHandler: TIMDoorMessageHandler | null = null;
  private libraryManager: LibraryManager;
  private doorLoader: DoorLoader;
  private messageHandler: DoorMessageHandler | null = null;
  /**
   * Shared code-region bounds. Mutated on first DoorExitDetector.checkExitConditions
   * by reference so all readers in this file and the detector see the
   * computed values in the same iteration.
   */
  private codeBounds: CodeBoundsRef = { lowerBound: 0, upperBound: 0 };
  private logger: DoorLogger | null = null;
  private debugMonitor: DebugMonitor | null = null;

  // Forced-exit timer after JH_SHUTDOWN. Arms once when isShuttingDown() first
  // becomes true; if the door hasn't reached the sentinel PC within 2 s we
  // call terminate() ourselves. Prevents the 18-second stuck-loop wait.
  private postShutdownTimer: ReturnType<typeof setTimeout> | null = null;

  // Execution state
  private executionState: ExecutionState;
  /**
   * Optional callback fired once when terminate() transitions the lifecycle
   * from running to stopped, regardless of what triggered it (JH_SHUTDOWN,
   * exit trap, stuck-loop detection, user `door:terminate`, etc.).
   * AmigaDoorSession subscribes to this so its own cleanup runs on *every*
   * exit path, not just user-initiated kills — otherwise the debug registry
   * keeps stale entries long after a door has genuinely finished.
   */
  private onExitCallback: (() => void) | null = null;
  private lifecycleConfig: LifecycleConfig;
  private executionTimer: NodeJS.Timeout | null = null;
  private isPaused: boolean = false;

  // PERFORMANCE FIX: Track if doorMessageCallback is handling XIM messages
  // When active, skip pollXIMMessages to avoid duplicate processing
  private usingDoorMessageCallback: boolean = false;
  private messagesHandledThisBatch: number = 0;

  // Debug tracking
  private executionPath: string[] = [];
  // writeCallLog + aedoorCallLog now live on this.executionLogger (extracted
  // to lifecycle/DoorExecutionLogger to keep this file under the 2000-line
  // size budget). Getters below preserve the legacy property access path.
  private executionLogger!: DoorExecutionLogger;
  private exitDetector!: DoorExitDetector;
  private trapDispatcher!: DoorTrapDispatcher;
  private lastPCs: number[] = [];
  private traceRegs: boolean = false;
  private traceInterval: number = 500;
  private traceLogPath: string = "";
  private traceLogPathFirst: string = "";
  private traceFirstCount: number = 0;
  private traceFirstLogged: number = 0;
  private logArgStringOnce: boolean = true;
  private traceFirstPCOnly: boolean = true;
  private pcProbeMaxHits: number = 1;
  private spinLoopSleepMs: number = 1;
  private lastRomJumpLogIteration: number = -1000000;
  private watchAutoLower: number = 0;
  private watchAutoUpper: number = 0;
  private lastA5OutOfRangeLogged: number = 0;
  private firstInvalidPCLogged = false;
  private loggedAedoorPc = new Set<number>();
  private loggedAedoorPcCount = 0;
  private lastA3 = 0;
  private a3ChangeCount = 0;

  constructor(
    emulator: MoiraEmulator,
    socket: Socket,
    config: DoorConfig,
    libraryManager: LibraryManager,
    doorLoader: DoorLoader,
    messageHandler: DoorMessageHandler | null,
    logger?: DoorLogger
  ) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
    this.libraryManager = libraryManager;
    this.doorLoader = doorLoader;
    this.messageHandler = messageHandler;
    this.logger = logger || null;

    // Get loop guard settings from toolTypes (passed by batch-scheduler or run-amiga-door)
    // or fall back to environment variables
    const toolTypes = config.toolTypes || {};
    const disableGuardEnv = process.env.AEDOOR_DISABLE_GUARD;
    const disableGuardTooltype = toolTypes['DISABLE_GUARD'];

    // Loop limit: toolTypes > env > default (500K)
    const loopLimitTooltype = toolTypes['LOOP_LIMIT'];
    const loopLimit = loopLimitTooltype
      ? Number(loopLimitTooltype)
      : Number(process.env.AEDOOR_LOOP_LIMIT ?? 500000);

    // Disable guard: must be explicitly set to 'true' or '1' to disable
    // Default is ENABLED (guard active) to prevent runaway doors
    const disableGuard = disableGuardTooltype === 'true' || disableGuardTooltype === '1' ||
                          disableGuardEnv === 'true' || disableGuardEnv === '1';

    // Disable input wait extension: for batch doors that should not wait for input
    const disableInputWaitTooltype = toolTypes['DISABLE_INPUT_WAIT'];
    const disableInputWait = disableInputWaitTooltype === 'true' || disableInputWaitTooltype === '1';

    this.lifecycleConfig = {
      timeout: config.timeout || 300,
      loopGuardLimit: loopLimit,
      cycleTarget: 8, // 8MHz CPU cycles per microsecond
      debugLevel: (process.env.AEDOOR_DEBUG_LEVEL as any) || "normal",
      disableGuard: disableGuard,
      disableInputWaitExtension: disableInputWait,
      progressTimeoutMs: Number(process.env.AEDOOR_PROGRESS_TIMEOUT_MS ?? 5000),
    };
debugLog(
      `[DoorLifecycleManager] Config: loopGuard=${this.lifecycleConfig.loopGuardLimit} disableGuard=${this.lifecycleConfig.disableGuard} disableInputWait=${this.lifecycleConfig.disableInputWaitExtension} timeout=${this.lifecycleConfig.timeout}`
    );

    this.executionState = this.initializeExecutionState();

    // Call-trace + progress logger extracted to lifecycle/DoorExecutionLogger.
    this.executionLogger = new DoorExecutionLogger(
      this.emulator,
      this.executionState,
      this.lifecycleConfig,
    );

    // Exit detection + PC symbol formatting + paused-state polling
    // extracted to lifecycle/DoorExitDetector.
    this.exitDetector = new DoorExitDetector({
      emulator: this.emulator,
      socket: this.socket,
      config: this.config,
      libraryManager: this.libraryManager,
      doorLoader: this.doorLoader,
      executionState: this.executionState,
      codeBounds: this.codeBounds,
      getLibraryTraps: () => this.libraryTraps,
      getLastPCs: () => this.lastPCs,
      getPcHistory: () => this.pcHistory,
      terminate: () => this.terminate(),
      pollXIMMessages: () => this.pollXIMMessages(),
      pollTIMMessages: () => this.pollTIMMessages(),
    });

    // Library-trap dispatch + call logging + illegal-instruction handling
    // extracted to lifecycle/DoorTrapDispatcher.
    this.trapDispatcher = new DoorTrapDispatcher({
      emulator: this.emulator,
      libraryManager: this.libraryManager,
      executionState: this.executionState,
      executionLogger: this.executionLogger,
      getLibraryTraps: () => this.libraryTraps,
      getLastPCs: () => this.lastPCs,
    });

    this.traceRegs = process.env.DOOR_TRACE_REGS === "1";
    this.traceInterval = Number(process.env.DOOR_TRACE_INTERVAL ?? 500);
    this.traceFirstCount = Number(process.env.DOOR_TRACE_FIRST_PC_COUNT ?? 0);
    this.pcProbeMaxHits = Number(process.env.DOOR_PC_PROBE_MAX_HITS ?? 1);
    const pcProbeRanges = DebugMonitor.parsePcProbeRanges(
      process.env.DOOR_PC_PROBE_RANGES || ""
    );
    const watchOffsetsEnv = process.env.DOOR_WATCH_VALUES_OFFSETS || "";
    const watchValueOffsets = watchOffsetsEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 16))
      .filter((n) => !Number.isNaN(n));

    // Initialize debug monitor
    this.debugMonitor = new DebugMonitor(
      this.emulator,
      this.libraryManager,
      pcProbeRanges,
      this.pcProbeMaxHits
    );
    this.debugMonitor.setWatchValueOffsets(watchValueOffsets);

    this.spinLoopSleepMs = Number(process.env.AEDOOR_SPIN_SLEEP_MS ?? 1);
    if (watchValueOffsets.length > 0) {
debugLog(
        `[DoorLifecycleManager] Value watch offsets: ${watchValueOffsets
          .map((o) => "0x" + o.toString(16))
          .join(", ")}`
      );
    }
debugLog(
      `[DoorLifecycleManager] PC probe env="${process.env.DOOR_PC_PROBE_RANGES || ""}" maxHits=${this.pcProbeMaxHits} parsed=${pcProbeRanges
        .map(
          (r) =>
            `0x${r.start.toString(16)}-0x${r.end.toString(
              16
            )} (max ${this.pcProbeMaxHits})`
        )
        .join(", ") || "none"}`
    );
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
      stuckLoopCount: 0,
      lastJumpSize: 0,
      lastAedoorTracePc: -1,
      lastJumpSizes: [],
      sameJumpCount: 0,
    };
  }

  // Setter methods for dependencies
  setLibraryTraps(libraryTraps: LibraryTraps): void {
    this.libraryTraps = libraryTraps;
  }

  setXIMProtocol(ximProtocol: XIMProtocol | null): void {
    this.ximProtocol = ximProtocol;
  }

  setTIMHandler(timHandler: TIMDoorMessageHandler | null): void {
    this.timHandler = timHandler;
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
debugLog(
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

    // DISABLED: NodeStatusManager conflicts with MULTICOM
    // WHO doors like RTW use MULTICOM (cmd 531) to get node data, not FindSemaphore
    // MULTICOM creates the singlePort structures at 0xb1000+
    // NodeStatusManager was writing to the SAME addresses, causing conflicts
    // RTW gets masterNode from MULTICOM, follows myNode[i].s pointers to read singlePort data
    // So we only need MULTICOM, not NodeStatusManager

    // XIM callback wiring (Path A: AEDoor.library trap-sync processor,
    // Path B: direct-XIM doorMessageCallback) extracted to
    // lifecycle/door-message-callbacks so this file stays under the
    // 2000-line budget. Behaviour unchanged.
    installMessageCallbacks({
      libraryManager: this.libraryManager,
      emulator: this.emulator,
      executionState: this.executionState,
      getXimProtocol: () => this.ximProtocol,
      markUsingDoorMessageCallback: () => { this.usingDoorMessageCallback = true; },
      incrementMessagesHandled: () => { this.messagesHandledThisBatch++; },
    });

    // CRITICAL: Send INIT/STAT to door's pr_MsgPort BEFORE first instruction executes
    // AquaScan (and similar doors) call WaitPort on pr_MsgPort immediately after startup,
    // expecting INIT/STAT messages for BBS mode detection. This must happen:
    // - AFTER all initialization (DoorLoader, DoorMessageHandler, etc.)
    // - BEFORE the first instruction executes (before door can call WaitPort)
    // express.e starts door process at line 4336, then waits for JH_REGISTER. But doors
    // like AquaScan check pr_MsgPort first for BBS mode detection before sending JH_REGISTER.
    if (this.config.doorType === "XIM" && this.messageHandler && !this.executionState.startupMessageSent) {
debugLog("[DoorLifecycleManager] Sending INIT/STAT to pr_MsgPort BEFORE door execution starts");
      await sendStartupMessageHelper(
        this.executionState,
        this.messageHandler,
        this.libraryManager,
        this.config,
      );
    }

    // Set up timeout
    if (this.lifecycleConfig.timeout) {
      this.executionTimer = setTimeout(() => {
debugLog("[DoorLifecycleManager] Execution timeout");
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
        logInitialStateHelper(
          this.executionState,
          this.socket,
          this.config,
          this.lifecycleConfig,
        );
      }

      // ========== CONFIGURABLE OVERCLOCKING SYSTEM ==========
      // Priority order:
      // 1. Environment variable DOOR_OVERCLOCK (highest priority)
      // 2. Door .info OVERCLOCK tooltype (config.overclockFactor)
      // 3. Auto-detection: batch=10x, interactive=0x (lowest priority)

      let overclockFactor: number | undefined;
      let overclockSource = 'auto-detection';

      // Check environment variable first
      const envOverclock = process.env.DOOR_OVERCLOCK;
      if (envOverclock !== undefined) {
        const envFactor = parseInt(envOverclock, 10);
        if (!isNaN(envFactor)) {
          overclockFactor = envFactor;
          overclockSource = `environment variable DOOR_OVERCLOCK=${envOverclock}`;
        }
      }

      // Check config override (from .info OVERCLOCK tooltype)
      if (overclockFactor === undefined && this.config.overclockFactor !== undefined) {
        overclockFactor = this.config.overclockFactor;
        overclockSource = `.info OVERCLOCK=${overclockFactor}`;
      }

      // Auto-detection fallback
      // Default: 100x for all doors (tested and verified to work)
      // Doors that need slower speed can set OVERCLOCK=-1 or OVERCLOCK=1 in .info
      if (overclockFactor === undefined) {
        overclockFactor = 100;  // 100x default - all tested doors work at this speed
        overclockSource = `auto-detection (default 100x)`;
      }

      // Apply overclocking
      this.emulator.setOverclocking(overclockFactor);

      if (overclockFactor > 0) {
debugLog(`[DoorLifecycleManager] 🚀 Overclocking: ${overclockFactor}x (source: ${overclockSource})`);
      } else if (overclockFactor === -1) {
debugLog(`[DoorLifecycleManager] Overclocking: FORCE DISABLED (source: ${overclockSource})`);
      } else {
debugLog(`[DoorLifecycleManager] Overclocking: disabled (source: ${overclockSource})`);
      }
      // ========== END OVERCLOCKING SYSTEM ==========

      // CRITICAL: Create AEDoorPort BEFORE door execution starts
      // XIM doors check for this port at startup to detect BBS mode
      // If port doesn't exist, doors print error banner and exit
      // (commit 74898f658 - this fixed joincnf, RTW, Bulls, AquaScan)
      if (this.libraryManager?.execLibrary) {
        const nodeId = this.config.bbsSession?.nodeId || 1;
        const portName = `AEDoorPort${nodeId}`;
        const portAddr = this.libraryManager.execLibrary.createAEDoorPort(portName);
debugLog(`[DoorLifecycleManager] Created/verified ${portName} at 0x${portAddr.toString(16)} for BBS mode detection`);
      }

      // NOTE: DoorInfo structures are initialized on FIRST pollXIMMessages() call.
      // BBS does NOT pre-send INIT/STAT - doors initiate with JH_REGISTER first.
      // Old-style doors get INIT/STAT via 500ms fallback timer after JH_REGISTER.

      // CRITICAL: Verify all library trap ILLEGAL instructions are in place before execution
      if (this.libraryTraps) {
        const { verified, failed, failedAddrs } = this.libraryTraps.verifyIllegalInstructions();
        if (failed > 0) {
console.error(`[DoorLifecycleManager] CRITICAL: ${failed} library trap(s) missing ILLEGAL instruction!`);
console.error(`[DoorLifecycleManager] Failed addresses: ${failedAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);
        }

        // PERFORMANCE: Sync all trap addresses to MOIRA's C++ trap set
        // This enables high-performance batch execution using executeUntilTrap()
        this.libraryTraps.syncTrapAddressesToMoira();
        const trapCount = this.emulator.getTrapAddressCount();
debugLog(`[DoorLifecycleManager] Trap-aware batch execution enabled (${trapCount} trap addresses)`);
      }

      // DEBUG: Verify ExecBase pointer at 0x4 before execution
      const execBaseAtFour = this.emulator.readMemory32(0x4);
      const a6AtStart = this.emulator.getRegister(14);
debugLog(`[DoorLifecycleManager] PRE-EXEC CHECK: Memory[0x4]=0x${execBaseAtFour.toString(16)} A6=0x${a6AtStart.toString(16)}`);

      // SAFEGUARD: If ExecBase at 0x4 is 0 or corrupted, fix it
      const expectedExecBase = this.libraryManager?.execLibrary?.getExecBaseAddress() || 0x80000;
      if (execBaseAtFour === 0 || (execBaseAtFour !== expectedExecBase && execBaseAtFour < 0x1000)) {
console.error(`[DoorLifecycleManager] CRITICAL: Memory[0x4] is ${execBaseAtFour === 0 ? 'ZERO' : 'CORRUPTED'}! Fixing to 0x${expectedExecBase.toString(16)}`);
        this.emulator.writeMemory32(0x4, expectedExecBase);
        // Also fix A6 if it was loaded from corrupted memory
        if (a6AtStart === 0 || a6AtStart === execBaseAtFour) {
          this.emulator.setRegister(14, expectedExecBase);
debugLog(`[DoorLifecycleManager] Fixed A6 register to 0x${expectedExecBase.toString(16)}`);
        }
      }

      const watchRangeEnv = process.env.DOOR_WATCH_RANGE;
      if (watchRangeEnv) {
debugLog(`[DoorLifecycleManager] DOOR_WATCH_RANGE=${watchRangeEnv}`);
debugLog(
          `[DoorLifecycleManager] Watch range support: setWatchRange=${
            typeof this.emulator.setWatchRange
          } setDebugWatchpoints=${typeof this.emulator.setDebugWatchpoints}`
        );
      }
      if (
        watchRangeEnv &&
        this.emulator.setWatchRange &&
        this.emulator.setDebugWatchpoints
      ) {
        const parts = watchRangeEnv.split(/[:\-]/).map((part) => part.trim());
        if (parts.length === 2) {
          const start = Number(parts[0]);
          const end = Number(parts[1]);
          if (!Number.isNaN(start) && !Number.isNaN(end) && start > 0 && end >= start) {
            this.emulator.setWatchRange(start, end);
            this.emulator.setDebugWatchpoints(true);
debugLog(
              `[DoorLifecycleManager] Watch range enabled: 0x${start.toString(
                16
              )}-0x${end.toString(16)}`
            );
          } else {
console.error(
              `[DoorLifecycleManager] Invalid DOOR_WATCH_RANGE="${watchRangeEnv}"`
            );
          }
        } else {
console.error(
            `[DoorLifecycleManager] Invalid DOOR_WATCH_RANGE="${watchRangeEnv}"`
          );
        }
      }

      const debugStackWritesEnv = process.env.DEBUG_STACK_WRITES;
      if (debugStackWritesEnv) {
debugLog(`[DoorLifecycleManager] DEBUG_STACK_WRITES=${debugStackWritesEnv}`);
debugLog(
          `[DoorLifecycleManager] Stack write logging support: setDebugStackWrites=${
            typeof this.emulator.setDebugStackWrites
          }`
        );
      }
      // Stack write logging disabled by default - only enable via DEBUG_STACK_WRITES=1
      // Was previously force enabled for PC corruption debugging
      if (process.env.DEBUG_STACK_WRITES && this.emulator.setDebugStackWrites) {
        this.emulator.setDebugStackWrites(true);
debugLog("[DoorLifecycleManager] Stack write logging ENABLED via DEBUG_STACK_WRITES=1");
      }

      const callTrackingEnv = process.env.DOOR_CALL_TRACKING;
      if (callTrackingEnv) {
debugLog(`[DoorLifecycleManager] DOOR_CALL_TRACKING=${callTrackingEnv}`);
debugLog(
          `[DoorLifecycleManager] Call tracking support: enableCallTracking=${
            typeof this.emulator.enableCallTracking
          } isCallTrackingEnabled=${typeof this.emulator.isCallTrackingEnabled}`
        );
      }
      if (callTrackingEnv === "1" && this.emulator.enableCallTracking) {
        this.emulator.enableCallTracking(true);
debugLog(`[DoorLifecycleManager] Call tracking enabled`);
      }

      let prevA4 = this.emulator.getRegister(12);
      let prevA5 = this.emulator.getRegister(13);
      let earlyTraceCount = 0;

      // MULTI-USER FIX: Track time since last yield to prevent blocking other users
      // CRITICAL: Yields allow health checks to respond (prevents Render.com restarts)
      let lastYieldTime = Date.now();
      const YIELD_INTERVAL_MS = 5; // Yield every 5ms to allow health checks and other users

      // PERFORMANCE PROFILING: Track where time is spent (enabled via DOOR_PROFILE=1)
      const ENABLE_PROFILING = process.env.DOOR_PROFILE === '1';
      let profileStart = 0;
      let profileTrapHandling = 0;
      let profileBatchExec = 0;
      let profileYieldTime = 0;
      let profileLoopIters = 0;
      let profileTrapCount = 0;
      let profileLastReport = Date.now();

      while (this.executionState.isRunning) {
        if (ENABLE_PROFILING) profileStart = Date.now();
        // === STEP 0: Yield to event loop if too much time has elapsed ===
        // CRITICAL: This prevents blocking other users when running CPU-intensive doors
        const now = Date.now();
        if (now - lastYieldTime >= YIELD_INTERVAL_MS) {
          const yieldStart = ENABLE_PROFILING ? Date.now() : 0;
          await new Promise((resolve) => setImmediate(resolve));
          lastYieldTime = Date.now();
          if (ENABLE_PROFILING) profileYieldTime += Date.now() - yieldStart;
        }

        // === STEP 1: Check if paused (async input) ===
        if (this.emulator.isPaused()) {
          await this.exitDetector.handlePausedState();
          continue;
        }

        // === STEP 1.5: Honor DOS Delay() ===
        // dos.library Delay() sets a deadline on the DosLibrary instance;
        // without this check the door keeps executing and Delay is a
        // no-op. That turns any busy-poll loop with `Delay(50)` between
        // iterations (e.g. WarOLM's wait-for-idle STATS@N polling, or
        // any door animating via Delay) into a 100% CPU spin. Sleep
        // in small slices so we resume promptly when the deadline hits.
        const dosLib = this.libraryManager?.dosLibrary;
        if (dosLib?.isDelayed?.()) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          continue;
        }

        // === STEP 2: Get current PC and handle door-specific logic ===
        const pc = this.emulator.getRegister(16);
        this.executionLogger.recordProgressByPc(pc);
        // Track recent PCs for crash diagnostics
        const prevPC = this.lastPCs.length > 0 ? this.lastPCs[this.lastPCs.length - 1] : 0;
        this.lastPCs.push(pc);
        if (this.lastPCs.length > 8) {
          this.lastPCs.shift();
        }
      this.debugMonitor?.setLastPCs(this.lastPCs);

      // TRACE: Detect first invalid PC and log what instruction caused it
      if (!this.firstInvalidPCLogged &&
          this.codeBounds.lowerBound !== 0 && this.codeBounds.upperBound !== 0 &&
          pc !== 0 &&
          (pc < this.codeBounds.lowerBound || pc > this.codeBounds.upperBound)) {
        this.firstInvalidPCLogged = true;
        const cpu = (this.emulator as any).cpu;
        let prevInstr = '???';
        if (cpu && cpu.nativeDisassemble) {
          try {
            prevInstr = cpu.nativeDisassemble(prevPC);
          } catch {}
        }
        // Get all registers at time of failure
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const d2 = this.emulator.getRegister(2);
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
        const a2 = this.emulator.getRegister(10);
        const a3 = this.emulator.getRegister(11);
        const a4 = this.emulator.getRegister(12);
        const a5 = this.emulator.getRegister(13);
        const sp = this.emulator.getRegister(15);

        console.error(
          `[DoorLifecycleManager] FIRST INVALID PC DETECTED!\n` +
          `  Previous PC: 0x${prevPC.toString(16)}\n` +
          `  Instruction: ${prevInstr}\n` +
          `  New PC: 0x${pc.toString(16)} (OUT OF BOUNDS)\n` +
          `  Code region: 0x${this.codeBounds.lowerBound.toString(16)}-0x${this.codeBounds.upperBound.toString(16)}\n` +
          `  D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} D2=0x${d2.toString(16)}\n` +
          `  A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} A2=0x${a2.toString(16)}\n` +
          `  A3=0x${a3.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)} SP=0x${sp.toString(16)}\n` +
          `  This instruction caused the first jump outside code!`
        );
        // Read memory at prevPC to see the raw instruction bytes
        try {
          const opcode = this.emulator.readMemory16(prevPC);
          const operand = this.emulator.readMemory32(prevPC + 2);
          console.error(
            `  Raw bytes: opcode=0x${opcode.toString(16)} operand=0x${operand.toString(16)}`
          );
        } catch {}
        // If instruction involves A3, show what A3 points to
        if (prevInstr.includes('A3')) {
          console.error(
            `  A3 is involved in the instruction!\n` +
            `  A3 points to: 0x${a3.toString(16)}`
          );
        }
      }
      this.debugMonitor?.checkPcProbes(pc, this.executionState.iterationCount);
      this.debugMonitor?.checkWatchedValues();
        if (process.env.DEBUG_68K_NATIVE === '1') {
          const inAedoorRange = pc >= 0x1fff00 && pc <= 0x200600;
          if (
            inAedoorRange &&
            !this.loggedAedoorPc.has(pc) &&
            this.loggedAedoorPcCount < 50
          ) {
            this.loggedAedoorPc.add(pc);
            this.loggedAedoorPcCount++;
            const d0 = this.emulator.getRegister(0);
            const d1 = this.emulator.getRegister(1);
            const a0 = this.emulator.getRegister(8);
            const a1 = this.emulator.getRegister(9);
            const a4Now = this.emulator.getRegister(12);
            const a5Now = this.emulator.getRegister(13);
            const a6Now = this.emulator.getRegister(14);
            const spNow = this.emulator.getRegister(15);
            const stackWords: string[] = [];
            for (let i = 0; i < 5; i++) {
              try {
                const word = this.emulator.readMemory32(spNow + i * 4);
                stackWords.push(`SP+${i * 4}=0x${word.toString(16)}`);
              } catch {
                stackWords.push(`SP+${i * 4}=<err>`);
              }
            }
debugLog(
              `[DoorLifecycleManager] AEDoor PC=0x${pc.toString(
                16
              )} iter=${this.executionState.iterationCount} d0=0x${d0.toString(
                16
              )} d1=0x${d1.toString(16)} a0=0x${a0.toString(
                16
              )} a1=0x${a1.toString(16)} a4=0x${a4Now.toString(
                16
              )} a5=0x${a5Now.toString(16)} a6=0x${a6Now.toString(
                16
              )} sp=0x${spNow.toString(16)} stack=[${stackWords.join(" ")}]`
            );
          }
        }
        if (earlyTraceCount < 32) {
          const a4Now = this.emulator.getRegister(12);
          const a5Now = this.emulator.getRegister(13);
          const a6Now = this.emulator.getRegister(14);
          if (a4Now !== prevA4 || a5Now !== prevA5) {
            if (DEBUG_68K) {
debugLog(
                `[DoorLifecycleManager] Early A4/A5 change iter=${this.executionState.iterationCount} PC=0x${pc.toString(
                  16
                )} A4=0x${a4Now.toString(16)} A5=0x${a5Now.toString(16)}`
              );
            }
            if (process.env.DEBUG_68K_NATIVE === '1') {
              const execLib = this.libraryManager?.execLibrary;
              const stackLower = execLib?.getStackLower?.() || 0;
              const stackUpper = execLib?.getStackUpper?.() || 0;
              if (
                stackLower !== 0 &&
                stackUpper !== 0 &&
                (a5Now < stackLower || a5Now > stackUpper) &&
                a5Now !== this.lastA5OutOfRangeLogged
              ) {
                this.lastA5OutOfRangeLogged = a5Now;
                const cpu = this.emulator['cpu'];
                if (!cpu) {
                  // Native debugger not available; skip instruction dump.
                }
debugLog(
                  `[DoorLifecycleManager] A5 out of stack range in early trace: A5=0x${a5Now.toString(
                    16
                  )} stack=[0x${stackLower.toString(16)}-0x${stackUpper.toString(
                    16
                  )}] PC=0x${pc.toString(16)}`
                );
                const logCount = cpu ? cpu.nativeLoggedInstructions?.() || 0 : 0;
                if (cpu && logCount > 0) {
debugLog(
                    `[DoorLifecycleManager] Last ${Math.min(
                      logCount,
                      20
                    )} native instructions before A5 change:`
                  );
                  const start = Math.max(0, logCount - 20);
                  for (let i = start; i < logCount; i++) {
                    const logPc = cpu.nativeGetLogEntryPC?.(i) || 0;
                    const disasm = cpu.nativeDisassemble?.(logPc) || '???';
debugLog(
                      `[DoorLifecycleManager]   0x${logPc.toString(16)}: ${disasm}`
                    );
                  }
                }
              }
            }
            prevA4 = a4Now;
            prevA5 = a5Now;
          }
          // DEBUG: Track A6 changes in early iterations
          if (earlyTraceCount <= 10 && DEBUG_68K) {
            const memAt4 = this.emulator.readMemory32(0x4);
debugLog(
              `[DoorLifecycleManager] Early trace iter=${this.executionState.iterationCount} PC=0x${pc.toString(16)} A6=0x${a6Now.toString(16)} Memory[0x4]=0x${memAt4.toString(16)}`
            );
            // SAFEGUARD: Check if ExecBase at 0x4 got corrupted during execution
            if (memAt4 === 0 && earlyTraceCount > 0) {
console.error(`[DoorLifecycleManager] CRITICAL: Memory[0x4] became ZERO at iter ${this.executionState.iterationCount}! Fixing.`);
              this.emulator.writeMemory32(0x4, expectedExecBase);
            }
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
        if (this.exitDetector.checkExitConditions(pc)) {
          return;
        }

        // === STEP 3B: Arm post-shutdown forced-exit timer ===
        // This runs for ALL door paths (A and B). pollXIMMessages() only runs
        // for Path B (direct-XIM), so the timer check there misses Path A doors
        // like CONFTOP that use the AEDoor.library trap-sync processor.
        if (this.ximProtocol?.isShuttingDown() && !this.postShutdownTimer) {
          console.log(`[DoorLifecycleManager] JH_SHUTDOWN detected in main loop — arming 2s forced-exit timer`);
          this.postShutdownTimer = setTimeout(() => {
            if (this.executionState.isRunning) {
              console.log(`[DoorLifecycleManager] Post-shutdown timeout: forcing terminate`);
              this.terminate();
            }
          }, 2000);
        }

        // Historical dRE!WAll trace probes (PC=0x21d4 store, PC=0x2472/0x2478/0x2480
        // line-input boundary, per-instruction trace) removed 2026-04-20 — the
        // underlying bugs are fixed (commit d3dabc62c) and re-adding door-specific
        // PC probes belongs in a debugging branch, not the hot loop.
        this.debugMonitor?.setLastPCs(this.lastPCs);
        this.debugMonitor?.monitorExecBasePointer(pc);
        this.debugMonitor?.logA6Change(pc);

        // Targeted probes for runaway dispatches
        this.debugMonitor?.probeIndirectFlow(pc);

        // === STEP 4: Check if PC is at a trap address (before batch execution) ===
        const isTrapAddr = this.libraryTraps?.isTrapAddress(pc);
        if (isTrapAddr) {
          if (ENABLE_PROFILING) profileTrapCount++;
          const trapStart = ENABLE_PROFILING ? Date.now() : 0;
          // Handle the trap
          const trapHandled = this.trapDispatcher.checkAndHandleLibraryTrap(pc);
          if (trapHandled) {
            this.trapDispatcher.handleTrapExecution(pc);

            // === STEP 4B: Check if WaitPort returned 0 (no messages) ===
            // Doors like Bulls/FR use tight WaitPort loops and need immediate XIM polling.
            // Without this, messages queue up but never get processed because XIM polling
            // only happens every 10000 instructions (after batch execution).
            // AquaScan uses Wait() which pauses, so it doesn't need this - it polls during pause.
            // CRITICAL FIX 2026-01-08: ALWAYS poll for XIM messages after trap handling!
            // The door is in a tight GetMsg loop - each iteration handles a trap and continues,
            // which skips the batch execution path where pollXIMMessages was being called.
            // We must poll here for XIM doors, regardless of the needsXIMPoll flag.
            if (this.config.doorType === "XIM" || this.detectedXIMPort) {
              await this.pollXIMMessages();
            }

            // Also clear the flag if it was set
            const execLib = this.libraryManager?.execLibrary;
            if (execLib?.getNeedsXIMPoll()) {
              execLib.clearNeedsXIMPoll();
            }

            if (ENABLE_PROFILING) profileTrapHandling += Date.now() - trapStart;
            if (ENABLE_PROFILING) profileLoopIters++;
            continue;
          }
          // Check for ILLEGAL instruction if trap wasn't handled by library
          if (this.trapDispatcher.handleIllegalInstruction(pc)) {
            if (ENABLE_PROFILING) profileTrapHandling += Date.now() - trapStart;
            continue;
          }
        }

        // === STEP 5: BATCH EXECUTION using executeUntilTrap() ===
        // Execute instructions in tight C++ loop until a trap address is hit.
        // This is MUCH faster than single-instruction execution for CPU-intensive doors.
        // CRITICAL: Batch execution blocks the event loop (runs in C++ N-API).
        // Batch too large = health check timeouts on Render.com = container restart.
        // MULTI-USER: Default 2000 (down from 50000) to keep other users responsive.
        // The 5ms time-based yield at top of this loop is what actually bounds
        // latency; the batch is just the inner ceiling. Env override lets operators
        // tune per deployment: single-user local = higher (5000-10000) = snappier
        // door input echo; shared production = keep 2000 for fairness.
        const BATCH_SIZE = process.env.DEBUG_SINGLE_STEP
          ? 1
          : Number(process.env.AEDOOR_BATCH_SIZE ?? 2000);
        const pcBeforeBatch = this.emulator.getRegister(16);
        const batchStart = ENABLE_PROFILING ? Date.now() : 0;
        const result = this.emulator.executeUntilTrap(BATCH_SIZE);
        if (ENABLE_PROFILING) profileBatchExec += Date.now() - batchStart;

        // CRITICAL: If pause was set during batch execution (e.g., by doorMessageCallback
        // for a blocking XIM command like JH_LI/JH_HK), immediately yield to handlePausedState
        // instead of continuing. Without this, the door loops calling PutMsg/GetMsg rapidly.
        if (this.emulator.isPaused()) {
          continue;  // Will be caught by isPaused() check at top of loop
        }

        const pcAfterBatch = this.emulator.getRegister(16);

        // TEMP DEBUG: register PC=0x32e8 (DOORSMENU main() entry) as a hard
        // trap-stop in MOIRA so executeUntilTrap halts there before link.w runs.
        // No ILLEGAL is written. We just dump argc/argv state, remove the
        // trap-stop, and let execution continue normally into main().
        if (!(this as any)._mainTrapInstalled) {
          (this as any)._mainTrapInstalled = true;
          this.emulator.addTrapAddress(0x32e8);
          console.log(`[DIAG] Registered trap-stop at 0x32e8 for main() probe`);
        }
        if ((pcBeforeBatch === 0x32e8 || pcAfterBatch === 0x32e8) && !(this as any)._mainDumped) {
          (this as any)._mainDumped = true;
          const probePC = pcAfterBatch === 0x32e8 ? pcAfterBatch : pcBeforeBatch;
          const sp = this.emulator.getRegister(15);
          const a5 = this.emulator.getRegister(13);
          // At main() entry (BEFORE link.w runs): SP -> retaddr, SP+4 -> argc, SP+8 -> argv, SP+12 -> envp
          const retAddr = this.emulator.readMemory32(sp);
          const argcOnStack = this.emulator.readMemory32(sp + 4);
          const argvOnStack = this.emulator.readMemory32(sp + 8);
          const envpOnStack = this.emulator.readMemory32(sp + 12);
          // Read ___argc directly from BSS (0x206c relocated by BSS base 0x7808 = 0x9874)
          const argcFromBSS = this.emulator.readMemory32(0x9874);
          const argvFromBSS = this.emulator.readMemory32(0x985c);
          console.log(`[DIAG] main() entry! PC=0x${probePC.toString(16)} SP=0x${sp.toString(16)} A5=0x${a5.toString(16)}`);
          console.log(`[DIAG]   Stack: ret=0x${retAddr.toString(16)} argc=${argcOnStack} (0x${argcOnStack.toString(16)}) argv=0x${argvOnStack.toString(16)} envp=0x${envpOnStack.toString(16)}`);
          console.log(`[DIAG]   BSS ___argc (0x9874) = ${argcFromBSS} (0x${argcFromBSS.toString(16)})`);
          console.log(`[DIAG]   BSS ___argv (0x985c) = 0x${argvFromBSS.toString(16)}`);
          // Inspect argv[] (the actual argv value pushed onto stack)
          if (argvOnStack !== 0 && argvOnStack >= 0x1000 && argvOnStack < 0x1000000) {
            for (let i = 0; i < 4; i++) {
              const argvI = this.emulator.readMemory32(argvOnStack + i * 4);
              let str = '';
              if (argvI !== 0 && argvI >= 0x1000 && argvI < 0x1000000) {
                for (let j = 0; j < 30; j++) {
                  const c = this.emulator.readMemory(argvI + j);
                  if (c === 0) break;
                  str += (c >= 32 && c < 127) ? String.fromCharCode(c) : `\\x${c.toString(16).padStart(2, '0')}`;
                }
              }
              console.log(`[DIAG]   argv[${i}]=0x${argvI.toString(16)} "${str}"`);
            }
          }
          // Dump the relocated startup move.l instruction at memory 0x205c.
          // Should be: 2f 39 00 00 98 74 (move.l 0x9874.l, -(a7)) if reloc OK
          // Or:        2f 39 00 00 20 6c (move.l 0x206c.l, -(a7)) if reloc MISSING
          const startupBytes = [];
          for (let i = 0; i < 6; i++) startupBytes.push(this.emulator.readMemory(0x205c + i));
          console.log(`[DIAG]   startup@0x205c: ${startupBytes.map(b=>b.toString(16).padStart(2,'0')).join(' ')} (expect '2f 39 00 00 98 74' if argc reloc OK)`);
          // Remove trap-stop so execution continues into main()
          this.emulator.removeTrapAddress(0x32e8);
          console.log(`[DIAG] Removed trap-stop at 0x32e8; execution continues`);
        }

        // TRACE PC JUMPS: Log large PC changes to catch corrupted returns/jumps
        if (TRACE_PC_JUMPS && pcBeforeBatch > 0 && pcAfterBatch > 0) {
          const pcDelta = pcAfterBatch - pcBeforeBatch;
          const isPCInCode = pcAfterBatch >= this.codeBounds.lowerBound && pcAfterBatch <= this.codeBounds.upperBound;
          const wasPCInCode = pcBeforeBatch >= this.codeBounds.lowerBound && pcBeforeBatch <= this.codeBounds.upperBound;

          // Log jumps > 0x1000 that cross code boundaries (likely RTS/BSR/JMP)
          if (Math.abs(pcDelta) > 0x1000 && (!isPCInCode || !wasPCInCode)) {
            const sp = this.emulator.getRegister(15);
            const d0 = this.emulator.getRegister(0);
            const a0 = this.emulator.getRegister(8);

            try {
              const stackVal0 = this.emulator.readMemory32(sp);
              const stackVal4 = this.emulator.readMemory32(sp + 4);
              debugLog(
                `[PC_JUMP] 0x${pcBeforeBatch.toString(16)} -> 0x${pcAfterBatch.toString(16)} ` +
                `(delta=0x${pcDelta.toString(16)}) ` +
                `SP=0x${sp.toString(16)} [SP]=0x${stackVal0.toString(16)} [SP+4]=0x${stackVal4.toString(16)} ` +
                `D0=0x${d0.toString(16)} A0=0x${a0.toString(16)} ` +
                `inCode=${wasPCInCode}->${isPCInCode} ` +
                `codeRegion=[0x${this.codeBounds.lowerBound.toString(16)}-0x${this.codeBounds.upperBound.toString(16)}]`
              );
            } catch {
              debugLog(
                `[PC_JUMP] 0x${pcBeforeBatch.toString(16)} -> 0x${pcAfterBatch.toString(16)} ` +
                `(delta=0x${pcDelta.toString(16)}) inCode=${wasPCInCode}->${isPCInCode}`
              );
            }
          }
        }

        // TRACE A3 CHANGES (to find what sets A3 to 0x90000)
        const currentA3 = this.emulator.getRegister(11); // A3 is register 11
        if (currentA3 !== this.lastA3) {
          this.a3ChangeCount++;

          // Log significant A3 changes (> 0x1000) or if A3 reaches suspicious values
          const delta = currentA3 - this.lastA3;
          const isSuspicious = (currentA3 >= 0x8F000 && currentA3 <= 0x91000);

          if (Math.abs(delta) > 0x1000 || isSuspicious || this.a3ChangeCount < 20) {
            try {
              const cpu = (this.emulator as any).cpu;
              let instr = '???';
              if (cpu && cpu.nativeDisassemble) {
                try {
                  instr = cpu.nativeDisassemble(pcAfterBatch);
                } catch {}
              }

              debugLog(
                `[A3 CHANGE #${this.a3ChangeCount}] PC=0x${pcAfterBatch.toString(16)} ` +
                `A3: 0x${this.lastA3.toString(16)} -> 0x${currentA3.toString(16)} ` +
                `(delta=${delta >= 0 ? '+' : ''}0x${delta.toString(16)}) ` +
                `instr: ${instr}` +
                (isSuspicious ? ' *** SUSPICIOUS VALUE ***' : '')
              );

              // Stop tracking after we hit 0x90000
              if (currentA3 === 0x90000) {
                debugLog(`\n*** A3 = 0x90000 REACHED at PC=0x${pcAfterBatch.toString(16)} ***\n`);
              }
            } catch {}
          }

          this.lastA3 = currentA3;
        }

        // Generic stuck loop detection: detect ANY repeated identical PC jump pattern
        // This avoids door-specific magic numbers like 0x9c40 (CLAUDE.md rule #2)
        const jumpSize = pcAfterBatch - pcBeforeBatch;

        // Track if we see the same jump size repeatedly (indicates stuck execution pattern)
        // BUT: Don't trigger on legitimate Wait() loops - doors wait for XIM messages
        // XIM doors CAN legitimately loop polling for messages while waiting for input
        const isInWaitLoop = this.emulator.isPaused() ||
                            (this.libraryManager?.execLibrary as any)?.currentTask?.isWaiting;
        const isXIMDoor = this.config.doorType === 'XIM' || this.detectedXIMPort;
        const isPCInCodeRegion = pcAfterBatch >= this.codeBounds.lowerBound && pcAfterBatch <= this.codeBounds.upperBound;

        // CRITICAL: Check if XIM door is waiting for user input (sent JH_HK/JH_LI, awaiting reply)
        // When waiting for input, doors poll GetMsg repeatedly - this is NORMAL, not stuck!
        // The PC may be in trap handler code (0xc00000+) which is outside door's code region
        const isWaitingForXIMInput = this.ximProtocol?.isWaitingForLineInput() ?? false;

        // Smart PC bounds check: only flag truly invalid addresses
        // Valid PC ranges:
        // - 0x1000+ (code/data segments)
        // - 0x80000+ (libraries, system functions)
        // - 0xC00000+ (chip RAM for libraries/AEDoor)
        // Invalid: null (0), odd addresses, very low memory (<0x400)
        const isPCInvalid = pcAfterBatch === 0 ||
                           (pcAfterBatch % 2 !== 0) ||
                           (pcAfterBatch > 0x400 && pcAfterBatch < 0x1000);

        // "Same jump pattern" stuck loop detection DISABLED (2026-05-02).
        // This heuristic false-positived on every new SAS/C door installed (GLC, DOORSMENU, etc.)
        // because legitimate main loops produce identical batch-level PC deltas when iterating
        // through heap-resident C library code or processing config items.
        // Real stuck-door protection is provided by:
        //   - Execution timeout (300s hard limit)
        //   - Post-shutdown timeout (forces exit after JH_SHUTDOWN)
        //   - loopGuardLimit with progress tracking (iteration cap)

        // Skip invalid PC detection if:
        // 1. Emulator is paused or task is waiting (isInWaitLoop)
        // 2. PC is in any valid region (code, library, or chip RAM)
        // 3. XIM door waiting for user input (polling GetMsg for our reply)
        const skipStuckDetection = isInWaitLoop || !isPCInvalid || isWaitingForXIMInput;

        // Only detect invalid PC addresses (not stuck loops, those are handled above)
        if (isPCInvalid && !skipStuckDetection) {
console.error(`[DoorLifecycleManager] Invalid PC detected: 0x${pcAfterBatch.toString(16)}`);
console.error(`  PC: 0x${pcBeforeBatch.toString(16)} -> 0x${pcAfterBatch.toString(16)}, code region: [0x${this.codeBounds.lowerBound.toString(16)}-0x${this.codeBounds.upperBound.toString(16)}]`);
          this.terminate();
          return;
        }

        // Update iteration count with actual instructions executed
        const instructionsExecuted = result < 0 ? Math.abs(result) - 1 : result;
        this.executionState.iterationCount += instructionsExecuted;

        // Check if trap was hit (negative result means trap address encountered)
        if (result < 0) {
          // Clear trap hit flag for next iteration
          this.emulator.clearTrapHit();

          // CRITICAL FIX: For XIM doors, check if needsXIMPoll was set during trap handling
          // and poll BEFORE continuing. Otherwise XIM polling is skipped and door hangs.
          if (this.config.doorType === "XIM" || this.detectedXIMPort) {
            const execLib = this.libraryManager?.execLibrary;
            if (execLib?.getNeedsXIMPoll()) {
              await this.pollXIMMessages();
              execLib.clearNeedsXIMPoll();
            }
          }

          // Continue loop - next iteration will detect trap at current PC and handle it
          continue;
        }

        // Check if door exited during batch execution
        const pcAfter = this.emulator.getRegister(16);
        if (pcAfter === 0xffff00 || pcAfter === 0x1ff000) {
          // Door exited - checkExitConditions will handle it on next iteration
          continue;
        }

        // === STEP 5B: Poll for XIM messages from native AEDoor.library ===
        // PERFORMANCE: Only poll if NOT using callback-based processing
        // Callback-based processing handles messages synchronously in PutMsg - no async polling needed
        // Also skip if door type is known to be non-XIM (TIM/SIM/IIM/SUP use DoorControl instead)
        const execLib5b = this.libraryManager?.execLibrary;
        if (execLib5b?.getNeedsXIMPoll()) {
          execLib5b.clearNeedsXIMPoll();
        }
        // Only poll if: (1) not using callback, AND (2) either XIM type or auto-detected XIM port
        if (!this.usingDoorMessageCallback && (this.config.doorType === "XIM" || this.detectedXIMPort)) {
          await this.pollXIMMessages();
        }

        // === STEP 5C: Poll for TIM/SIM messages from DoorControl port ===
        // TIM, SIM, IIM, SUP doors all use DoorControl{n} port (per express.e:4316-4320)
        // Only XIM doors use AEDoorPort - all others use DoorControl
        // CRITICAL: Default to SIM if doorType not specified
        // PERFORMANCE: Only poll for non-XIM doors (XIM handled above or via callback)
        const effectiveDoorType = (this.config.doorType || "SIM").toUpperCase();
        if (effectiveDoorType !== "XIM" && !this.detectedXIMPort) {
          await this.pollTIMMessages();
        }

        // === STEP 6: Yield handled by time-based check at top of loop (YIELD_INTERVAL_MS) ===
        // REMOVED: Per-iteration setImmediate was causing severe slowdown for 68K doors
        // that print characters one at a time. Each character triggers a trap, and yielding
        // after every trap made output appear in "slow motion". The 10ms time-based yield
        // at the top of the loop is sufficient for multi-user responsiveness.

        // PERFORMANCE PROFILING: Report every second
        if (ENABLE_PROFILING) {
          profileLoopIters++;
          const profileNow = Date.now();
          if (profileNow - profileLastReport >= 1000) {
            const totalTime = profileNow - profileLastReport;
            console.log(`[DOOR_PROFILE] iters=${profileLoopIters} traps=${profileTrapCount} batchMs=${profileBatchExec} trapMs=${profileTrapHandling} yieldMs=${profileYieldTime} total=${totalTime}ms`);
            profileLoopIters = 0;
            profileTrapCount = 0;
            profileBatchExec = 0;
            profileTrapHandling = 0;
            profileYieldTime = 0;
            profileLastReport = profileNow;
          }
        }
      }

debugLog(
        "[DoorLifecycleManager] 🏁 Execution loop completed normally"
      );
    } catch (error) {
      await this.exitDetector.handleExecutionError(error);
    }
  }

  // handlePausedState + formatPC + checkExitConditions extracted to
  // lifecycle/DoorExitDetector.

  // checkAndHandleLibraryTrap + handleTrapExecution + handleIllegalInstruction
  // extracted to lifecycle/DoorTrapDispatcher.

  // Track PC history for debugging bad jumps
  private pcHistory: number[] = [];
  private readonly PC_HISTORY_SIZE = 50; // Increased from 10 to capture more context before crash

  private async executeInstruction(pc: number): Promise<void> {
    const wasAt24a6 = pc === 0x24a6;

    // DEBUG: Trace NCONFS parsing in joincnf door
    // Runtime addresses: FindToolType call=0x196c, save A5=0x1970, setup A0=0x1976
    // BSR atoi=0x1978, store NCONFS=0x197c, atoi entry=0x6320
    const DEBUG_NCONFS = process.env.DEBUG_NCONFS === '1';
    if (DEBUG_NCONFS) {
      if (pc === 0x196c) {
        // JSR FindToolType
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
debugLog(`[NCONFS] PC=0x196c JSR FindToolType A0=0x${a0.toString(16)} A1=0x${a1.toString(16)}`);
        // Read A1 string (tooltype name)
        const name = this.emulator.readString(a1);
debugLog(`[NCONFS]   Looking for: "${name}"`);
      } else if (pc === 0x1970) {
        // MOVEA.L D0, A5 - save FindToolType result
        const d0 = this.emulator.getRegister(0);
debugLog(`[NCONFS] PC=0x1970 MOVEA.L D0,A5  D0=0x${d0.toString(16)} (FindToolType result)`);
        if (d0 !== 0) {
          const value = this.emulator.readString(d0);
debugLog(`[NCONFS]   Value at D0: "${value}"`);
        }
      } else if (pc === 0x1976) {
        // MOVEA.L A5, A0 - setup A0 for atoi
        const a5 = this.emulator.getRegister(13);
debugLog(`[NCONFS] PC=0x1976 MOVEA.L A5,A0  A5=0x${a5.toString(16)}`);
      } else if (pc === 0x1978) {
        // BSR atoi
        const a0 = this.emulator.getRegister(8);
debugLog(`[NCONFS] PC=0x1978 BSR atoi  A0=0x${a0.toString(16)}`);
        if (a0 !== 0) {
          const value = this.emulator.readString(a0);
debugLog(`[NCONFS]   String to convert: "${value}"`);
        }
      } else if (pc === 0x197c) {
        // MOVE.L D0, -0x6fd0(A4) - store NCONFS result
        const d0 = this.emulator.getRegister(0);
        const a4 = this.emulator.getRegister(12);
debugLog(`[NCONFS] PC=0x197c MOVE.L D0,-0x6fd0(A4)  D0=${d0} A4=0x${a4.toString(16)}`);
debugLog(`[NCONFS]   NCONFS value: ${d0}`);
      } else if (pc === 0x6320) {
        // atoi entry
        const a0 = this.emulator.getRegister(8);
debugLog(`[NCONFS] PC=0x6320 atoi entry  A0=0x${a0.toString(16)}`);
        if (a0 !== 0) {
          const value = this.emulator.readString(a0);
debugLog(`[NCONFS]   atoi input string: "${value}"`);
          // Dump memory at A0
          const bytes: string[] = [];
          for (let i = 0; i < 8; i++) {
            bytes.push(this.emulator.readMemory(a0 + i).toString(16).padStart(2, '0'));
          }
debugLog(`[NCONFS]   Memory at A0: [${bytes.join(' ')}]`);
        }
      } else if (pc === 0x19b6) {
        // CMP.L -0x6fd0(A4), D7 - loop comparison
        const d7 = this.emulator.getRegister(7);
        const a4 = this.emulator.getRegister(12);
        const nconfsAddr = (a4 - 0x6fd0) >>> 0;
        const nconfs = this.emulator.readMemory32(nconfsAddr);
debugLog(`[NCONFS] PC=0x19b6 CMP.L -0x6fd0(A4),D7  D7=${d7} NCONFS=${nconfs} at 0x${nconfsAddr.toString(16)}`);
      }
    }

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
      // This is ROM space - log sparingly to avoid flooding when ROM init runs
      const iteration = this.executionState.iterationCount;
      if (iteration - this.lastRomJumpLogIteration >= 10000) {
        this.lastRomJumpLogIteration = iteration;
console.error(`\n*** JUMP TO ROM DETECTED ***`);
console.error(`  Current PC: 0x${pc.toString(16)}`);
console.error(`  PC History (last ${this.pcHistory.length} instructions):`);
        this.pcHistory.forEach((p, i) => {
console.error(`    [${i}] 0x${p.toString(16)}`);
        });
console.error(`  Iteration: ${iteration}`);
      }
    }

    // CRITICAL: Track SP before instruction to detect corruption
    const spBefore = this.emulator.getRegister(15);

    if (process.env.DOOR_WATCH_AUTO === "1") {
      const watchRadius = 0x80;
      const lower = (spBefore - watchRadius) >>> 0;
      const upper = (spBefore + watchRadius) >>> 0;
      if (
        this.watchAutoLower === 0 ||
        spBefore < this.watchAutoLower ||
        spBefore > this.watchAutoUpper
      ) {
        this.watchAutoLower = lower;
        this.watchAutoUpper = upper;
        this.emulator.setWatchRange(lower, upper);
debugLog(
          `[DoorLifecycleManager] Auto watch range set around SP=0x${spBefore.toString(
            16
          )} -> 0x${lower.toString(16)}-0x${upper.toString(16)}`
        );
      }
    }

    if (process.env.AEDOOR_TRACE === "1") {
      const aedoorBase =
        this.libraryManager.execLibrary?.getLibraryBase("aedoor.library") ?? 0;
      if (aedoorBase) {
        const offset = (pc - aedoorBase) | 0;
        if (
          offset === 0x2d2 ||
          offset === 0x2d6 ||
          offset === 0x2ec ||
          offset === 0x2f2 ||
          offset === 0x304 ||
          offset === 0x308
        ) {
          if (this.executionState.lastAedoorTracePc !== pc) {
            const d0 = this.emulator.getRegister(0);
            const d1 = this.emulator.getRegister(1);
            const a0 = this.emulator.getRegister(8);
            const a1 = this.emulator.getRegister(9);
            const a4 = this.emulator.getRegister(12);
            const a6 = this.emulator.getRegister(14);
            const a7 = spBefore;
debugLog(
              `[AEDOOR_TRACE] pc=0x${pc.toString(16)} off=0x${offset.toString(
                16
              )} d0=0x${d0.toString(16)} d1=0x${d1.toString(
                16
              )} a0=0x${a0.toString(16)} a1=0x${a1.toString(
                16
              )} a4=0x${a4.toString(16)} a6=0x${a6.toString(
                16
              )} sp=0x${a7.toString(16)}`
            );
            this.executionState.lastAedoorTracePc = pc;
          }
        }
      }
    }

    // ROM routines expect A6 to hold ExecBase; protect against it being cleared.
    const execBase = this.libraryManager.execLibrary?.getExecBaseAddress() ?? 0;
    if (pc >= 0xf80000 && execBase && this.emulator.getRegister(14) === 0) {
      this.emulator.setRegister(14, execBase);
    }

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

    // Check for native Moira debug events (DEBUG_68K_NATIVE=1)
    const cpu = this.emulator['cpu'];
    if (process.env.DEBUG_68K_NATIVE === '1' && cpu?.hasNativeWatchpointHit?.()) {
      const watchAddr = cpu.getNativeWatchpointAddr?.() || 0;
debugLog(`\n[NATIVE DEBUG] *** WATCHPOINT HIT at 0x${watchAddr.toString(16)} ***`);
debugLog(`[NATIVE DEBUG]   PC: 0x${pc.toString(16)}`);
debugLog(`[NATIVE DEBUG]   Iteration: ${this.executionState.iterationCount}`);

      // Dump last 20 logged instructions for context
      const logCount = cpu.nativeLoggedInstructions?.() || 0;
      if (logCount > 0) {
debugLog(`[NATIVE DEBUG]   Last ${Math.min(logCount, 20)} instructions:`);
        const start = Math.max(0, logCount - 20);
        for (let i = start; i < logCount; i++) {
          const logPc = cpu.nativeGetLogEntryPC?.(i) || 0;
          const disasm = cpu.nativeDisassemble?.(logPc) || '???';
debugLog(`[NATIVE DEBUG]     0x${logPc.toString(16)}: ${disasm}`);
        }
      }
      cpu.clearNativeWatchpointHit?.();
    }

    if (process.env.DEBUG_68K_NATIVE === '1' && cpu?.hasNativeBreakpointHit?.()) {
      const bpAddr = cpu.getNativeBreakpointAddr?.() || 0;
debugLog(`\n[NATIVE DEBUG] *** BREAKPOINT HIT at 0x${bpAddr.toString(16)} ***`);
      (this.emulator as any).dumpRegisters?.();
      cpu.clearNativeBreakpointHit?.();
    }

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
debugLog(`[DoorLifecycleManager] Recovered from ILLEGAL via library trap`);
          // Pop the exception frame manually (SR=2 bytes, PC=4 bytes)
          this.emulator.setRegister(15, sp + 6);
          return;
        }
      }

      // If not handled, log details and continue (exception handler will try to recover)
console.error(`[DoorLifecycleManager] Exception not handled as library trap, letting handler run`);
    }

    // Check for unexpected PC jumps (not normal instruction flow)
    // Note: This fires frequently for library calls which are legitimate, so only log in debug mode
    const newPc = this.emulator.getRegister(16);
    const pcDelta = newPc - pc;
    // Normal instructions advance PC by 2-10 bytes, branches go backwards or small forward
    // A jump from 0x2xxx to 0x9xxx is suspicious
    if (DEBUG_68K && (pcDelta > 0x2000 || (pcDelta < 0 && pcDelta > -0x8000 && newPc > 0x8000 && newPc < 0xa000))) {
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
    // Note: Programs can allocate their own stack via AllocMem (starts at 0x100000)
    // and set SP to that memory, so we allow SP up to 0x800000 (8MB)
    // IMPORTANT: Only trigger if SP CHANGED to invalid value (not if already invalid)
    const spAfter = this.emulator.getRegister(15);
    const spValid = (sp: number) => sp !== 0xfffffffa && sp >= 0x1000 && sp <= 0x800000;
    if (!spValid(spAfter) && spValid(spBefore)) {
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
debugLog(
        `[DoorLifecycleManager] AFTER executeInstruction(): PC = 0x${newPc.toString(
          16
        )}, cycles=${cyclesExecuted}`
      );
    }
  }

  /**
   * Poll for XIM messages from native AEDoor.library
   * Native doors use PutMsg to send XIM messages, we need to poll with GetMsg
   */
  private pollCount = 0;
  private lastPollLog = 0;
  private detectedXIMPort = false; // AUTO-DETECT: Set true when door creates AEDoorPort

  private async pollXIMMessages(): Promise<void> {
    // PERFORMANCE FIX 2026-01-23: Skip polling entirely if doorMessageCallback is active
    // The callback processes ALL messages synchronously during PutMsg - no async polling needed!
    // Check this FIRST before any other work to minimize overhead.
    if (this.usingDoorMessageCallback) {
      return;
    }

    // CRITICAL: Skip polling if we're already waiting for user input
    // This prevents processing duplicate JH_PM/JH_HK/JH_LI messages while waiting
    if (this.ximProtocol?.isWaitingForLineInput()) {
      return;
    }

    this.pollCount++;

    // Initialize protocol on first poll
    if (this.pollCount === 1) {
      // CORRECT PROTOCOL (from express.e:4352-4369):
      // - BBS waits for door to send JH_REGISTER first
      // - BBS does NOT pre-send INIT/STAT (that caused our polling to consume them)
      // - JH_REGISTER handler has 500ms fallback for old-style doors
    }

    const execLib = this.libraryManager?.execLibrary;
    if (!execLib) {
      if (this.pollCount === 1) {
debugLog(`[DoorLifecycleManager] XIM polling FAILED: execLib is null`);
      }
      return;
    }

    // Get the AEDoorPort address
    // For XIM doors, port name is AEDoorPort{nodeId} (e.g., "AEDoorPort1")
    // CRITICAL: Must match port creation in AmigaDoorSession.ts line 437
    // which uses: nodeId ?? nodeNumber ?? 1
    // AmiExpress nodes are 1-indexed, not 0-indexed
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const portName = `AEDoorPort${nodeId}`;

    // Write port name to temporary memory for findPort
    const portNameAddr = 0x500; // Temporary address for port name
    this.emulator.writeString(portNameAddr, portName);

    let aePortAddr = execLib.findPort(portNameAddr);

    if (!aePortAddr || aePortAddr === 0) {
      // Port not found yet - door might not have created it
      return;
    }

    // AUTO-DETECT: Mark that we found AEDoorPort - this door IS using XIM protocol
    // regardless of what its .info file says (handles missing/incorrect TYPE in .info)
    if (!this.detectedXIMPort) {
      this.detectedXIMPort = true;
console.log(`[DoorLifecycleManager] DETECTED AEDoorPort via findPort at 0x${aePortAddr.toString(16)} - updating XIMProtocol (hasXIM=${!!this.ximProtocol})`);
      // CRITICAL: Update XIMProtocol's port address to the actual port the door created.
      // Native AEDoor.library creates its own AEDoorPort{nodeId}, which may be different
      // from the AEServer.{nodeId} port we pre-created. Replies must go to this port.
      if (this.ximProtocol) {
        this.ximProtocol.setXimPortAddress(aePortAddr);
      }
    }

    // CRITICAL FIX 2026-01-16: Use the ACTUAL port address from door's GetMsg calls
    // The door creates its own AEDoorPort which may have a different address than
    // the one we found via findPort. We need to inject messages to the door's ACTUAL port.
    const actualDoorPort = execLib.getActualDoorPort();
    if (actualDoorPort && actualDoorPort !== 0 && this.ximProtocol) {
      const currentPort = (this.ximProtocol as any).doorPort;
      if (currentPort !== actualDoorPort) {
console.log(`[DoorLifecycleManager] UPDATING to actual AEDoorPort: 0x${actualDoorPort.toString(16)} (was 0x${currentPort.toString(16)})`);
        this.ximProtocol.setXimPortAddress(actualDoorPort);
        // Also update the address we use for polling
        aePortAddr = actualDoorPort;
      }
    }

    // Poll for messages with GetMsg
    // Messages from the door arrive on AEDoorPort. Since we also queue replies
    // on AEDoorPort for doors that poll there (instead of their reply port),
    // we use skipReplies option to leave reply messages for the door to get.
    try {
      const msgAddr = execLib.getMsg(aePortAddr, { skipReplies: true });
      if (msgAddr && msgAddr !== 0) {
        // Found a message! Parse and handle it
        if (this.ximProtocol) {
          const msg = this.ximProtocol.parseMessage(msgAddr);
          if (msg) {
            await this.ximProtocol.handleMessage(msg);

            // CRITICAL FIX: Don't reply immediately if waiting for user input!
            // Blocking commands (JH_PM, JH_LI, JH_HK) set waitingFor* flags and pause.
            // The reply will be sent when input arrives (completeLineInput, completeHotkey, etc.)
            // Sending premature reply causes door to continue with empty/stale data.
            const isWaiting = this.ximProtocol.isWaitingForLineInput();
            const replyHandled = this.ximProtocol.wasReplyHandled();
            const humanName = this.ximProtocol.parseMessage(msg.msgAddr)?.command;
            console.log(`[DoorLifecycleManager] After handleMessage: cmd=${humanName} isWaiting=${isWaiting} replyHandled=${replyHandled} msgAddr=0x${msg.msgAddr.toString(16)}`);
            if (!isWaiting && !replyHandled) {
              // Reply to door via mn_ReplyPort so door's WaitPort/GetMsg unblocks
              console.log(`[DoorLifecycleManager] Calling replyMsg for cmd=${humanName}`);
              execLib.replyMsg(msg.msgAddr);
              console.log(`[DoorLifecycleManager] replyMsg completed for cmd=${humanName}`);
            } else if (replyHandled) {
              console.log(`[DoorLifecycleManager] SKIPPING replyMsg - already handled by system command`);
            } else {
              console.log(`[DoorLifecycleManager] SKIPPING replyMsg - waiting for input`);
            }

            // JH_SHUTDOWN is a cooperative signal; the door keeps running
            // after PutMsg+WaitPort+GetMsg. The forced-exit timer is now armed
            // in the main loop (STEP 3B) so it fires for both Path A and Path B.
            if (this.ximProtocol.isShuttingDown()) {
              debugLog(
                `[DoorLifecycleManager] pollXIMMessages: JH_SHUTDOWN observed`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`[DoorLifecycleManager] XIM polling error:`, error);
    }
  }

  private timPollCount = 0;
  private lastTimPollLog = 0;

  /**
   * Poll for TIM door messages from DoorControl{n} port
   * Reference: express.e lines 4371-4525
   * TIM doors use simpler doorMsg structure instead of jhMessage
   */
  private async pollTIMMessages(): Promise<void> {
    this.timPollCount++;

    // Log doorType on first poll
    if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] pollTIMMessages called: doorType="${this.config.doorType}"`);
    }

    // Log every 10000 polls to confirm polling is active
    if (this.timPollCount - this.lastTimPollLog >= 10000) {
debugLog(`[DoorLifecycleManager] TIM polling active: ${this.timPollCount} polls so far`);
      this.lastTimPollLog = this.timPollCount;
    }

    // Poll for all DoorControl-using doors (TIM, SIM, IIM, SUP)
    const effectiveDoorType = (this.config.doorType || "SIM").toUpperCase();
    const usesDoorControl = effectiveDoorType === "TIM" ||
                            effectiveDoorType === "SIM" ||
                            effectiveDoorType === "IIM" ||
                            effectiveDoorType === "SUP";
    if (!usesDoorControl) {
      if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] TIM polling DISABLED: doorType=${effectiveDoorType} (not a DoorControl type)`);
      }
      return;
    }

    const execLib = this.libraryManager?.execLibrary;
    if (!execLib) {
      if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] TIM polling FAILED: execLib is null`);
      }
      return;
    }

    // Get the DoorControl port address
    // For TIM doors, port name is DoorControl{nodeId} (e.g., "DoorControl1")
    // Must match port creation - use nodeId ?? nodeNumber ?? 1
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const portName = `DoorControl${nodeId}`;

    // Write port name to temporary memory for findPort
    const portNameAddr = 0x500; // Temporary address for port name
    this.emulator.writeString(portNameAddr, portName);

    const timPortAddr = execLib.findPort(portNameAddr);
    if (!timPortAddr || timPortAddr === 0) {
      // Port not found yet, door might not have registered
      if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] TIM polling: DoorControl port not found yet (will retry)`);
      }
      return;
    }

    if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] TIM polling: Found DoorControl port at 0x${timPortAddr.toString(16)}`);
    }

    // Poll for messages with GetMsg
    try {
      const msgAddr = execLib.getMsg(timPortAddr);
      if (msgAddr && msgAddr !== 0) {
debugLog(`[DoorLifecycleManager] TIM polling: Got message at 0x${msgAddr.toString(16)}`);

        // Found a message! Handle it with TIM handler
        if (this.timHandler) {
          const result = await this.timHandler.handleMessage(msgAddr);

          // CRITICAL: Reply to the message so door's GetMsg receives it!
          // TIM/SIM doors poll their reply port waiting for the replied message
          execLib.replyMsg(msgAddr);
debugLog(`[DoorLifecycleManager] TIM polling: Replied to message at 0x${msgAddr.toString(16)}`);

          if (result.exit) {
debugLog(`[DoorLifecycleManager] TIM door requested exit`);
            this.executionState.isRunning = false;
          }
        } else {
debugLog(`[DoorLifecycleManager] TIM polling: timHandler is null`);
          // Even without handler, reply so door doesn't hang
          execLib.replyMsg(msgAddr);
        }
      }
    } catch (error) {
console.error(`[DoorLifecycleManager] TIM polling error:`, error);
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
      this.executionLogger.logProgress();
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
      const line = `[DoorRegs] ${getSystemTime().toISOString()} iter=${this.executionState.iterationCount} pc=0x${pc.toString(
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
      iterationsSinceProgress >= this.lifecycleConfig.loopGuardLimit &&
      (this.lifecycleConfig.disableInputWaitExtension || timeSinceProgress > this.lifecycleConfig.progressTimeoutMs);

    if (guardTriggered) {
      if (isWaitingForInput && !this.lifecycleConfig.disableInputWaitExtension) {
        // Extend guard and continue looping to allow user input.
        this.lifecycleConfig.loopGuardLimit += 50000;
debugLog(
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
      if (this.executionState.iterationCount % 200 === 0 && this.spinLoopSleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.spinLoopSleepMs));
      }
    } else {
      if (this.executionState.iterationCount % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (this.executionState.stuckInLoop && this.executionState.iterationCount % 1000 === 0 && this.spinLoopSleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.spinLoopSleepMs));
      }
    }
  }

  // recordProgressByPc + logProgress extracted to lifecycle/DoorExecutionLogger.

  private async handleGuardLimit(): Promise<void> {
    // debugLog(
    //   `[DoorLifecycleManager] SAFETY LIMIT: Door running for ${this.lifecycleConfig.loopGuardLimit} iterations - likely stuck`
    // );
    // debugLog(
    //   `[DoorLifecycleManager] Last PC: 0x${this.emulator
    //     .getRegister(16)
    //     .toString(16)}`
    // );
    // debugLog(
    //   `[DoorLifecycleManager] Iterations since last progress: ${
    //     this.executionState.iterationCount -
    //     this.executionState.lastProgressIteration
    //   }, ms since progress: ${
    //     Date.now() - this.executionState.lastProgressTime
    //   }`
    // );
    // debugLog(
    //   `[DoorLifecycleManager] Total cycles: ${this.executionState.totalCycles}`
    // );
    // debugLog(
    //   `[DoorLifecycleManager] Elapsed time: ${
    //     Date.now() - this.executionState.startTime!
    //   }ms`
    // );

    // Try to send SIGBREAKF_CTRL_C to door first (graceful interrupt)
    if (this.libraryManager?.execLibrary) {
      // debugLog(`[DoorLifecycleManager] Sending SIGBREAKF_CTRL_C to door task`);
      const SIGBREAKF_CTRL_C = 0x1000; // Bit 12
      try {
        // Signal current task (0 = current task)
        this.libraryManager.execLibrary.signal(0, SIGBREAKF_CTRL_C);

        // Give door 500ms to handle the signal and exit gracefully
        await new Promise(resolve => setTimeout(resolve, 500));

        // If still running after signal, terminate
        if (this.executionState.isRunning) {
          // debugLog(`[DoorLifecycleManager] Door did not respond to SIGBREAKF_CTRL_C, terminating`);
          this.terminate();
        }
      } catch (error) {
        // console.error(`[DoorLifecycleManager] Error sending signal:`, error);
        this.terminate();
      }
    } else {
      this.terminate();
    }
  }

  // logWriteCall + logAEDoorCall + getAEDoorFunctionName extracted to
  // lifecycle/DoorExecutionLogger.

  // handleExecutionError extracted to lifecycle/DoorExitDetector.

  // logInitialState + sendStartupMessage extracted to
  // lifecycle/DoorStartupHelper.

  /**
   * Terminate the door lifecycle
   */
  terminate(): void {
    if (!this.executionState.isRunning) return;

debugLog("[DoorLifecycleManager] Terminating door lifecycle");

    this.executionState.isRunning = false;

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }
    if (this.postShutdownTimer) {
      clearTimeout(this.postShutdownTimer);
      this.postShutdownTimer = null;
    }

debugLog("[DoorLifecycleManager] 🚪 Emitting door:status = terminated");
    this.socket.emit("door:status", { status: "terminated" });
debugLog("[DoorLifecycleManager] Door lifecycle terminated");

    // Fire one-shot exit hook so the parent AmigaDoorSession can run its
    // full cleanup (unregister from debug registry, remove socket handlers,
    // clear globals). Guarded in AmigaDoorSession.terminate() against
    // re-entry; safe to call even if caller was already inside terminate.
    const cb = this.onExitCallback;
    this.onExitCallback = null;  // one-shot
    if (cb) {
      try { cb(); } catch (err) {
console.error("[DoorLifecycleManager] onExit callback threw:", err);
      }
    }
  }

  /**
   * Register a callback to fire once when terminate() completes.
   * Overwrites any previously-registered callback.
   */
  setOnExit(cb: () => void): void {
    this.onExitCallback = cb;
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
