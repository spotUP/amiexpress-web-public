// DoorLifecycleManager.ts
// Phase 5A: Execution Loop and Lifecycle Management
// Handles the main execution loop, timeout management, and lifecycle events
// 2025-11-20

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { Socket } from "socket.io";
import { LibraryTraps } from "../api/LibraryTraps.js";
import { XIMProtocol } from "../XIMProtocol.js";
import { BullsDoorHandler } from "./BullsDoorHandler.js";
import { DoorConfig, DoorConstants } from "../DoorTypes.js";
import { LibraryManager } from "../LibraryManager.js";
import { DoorLoader } from "../DoorLoader.js";

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
}

export interface LifecycleConfig {
  timeout: number;
  loopGuardLimit: number;
  cycleTarget: number;
  debugLevel: "minimal" | "normal" | "verbose" | "comprehensive";
}

export class DoorLifecycleManager {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private libraryTraps: LibraryTraps | null = null;
  private ximProtocol: XIMProtocol | null = null;
  private bullsHandler: BullsDoorHandler;
  private libraryManager: LibraryManager;
  private doorLoader: DoorLoader;

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

  constructor(
    emulator: MoiraEmulator,
    socket: Socket,
    config: DoorConfig,
    bullsHandler: BullsDoorHandler,
    libraryManager: LibraryManager,
    doorLoader: DoorLoader
  ) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
    this.bullsHandler = bullsHandler;
    this.libraryManager = libraryManager;
    this.doorLoader = doorLoader;

    this.lifecycleConfig = {
      timeout: config.timeout || 300,
      loopGuardLimit: Number(process.env.AEDOOR_LOOP_LIMIT ?? 50000),
      cycleTarget: 8, // 8MHz CPU cycles per microsecond
      debugLevel: (process.env.AEDOOR_DEBUG_LEVEL as any) || "normal",
    };

    this.executionState = this.initializeExecutionState();
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

      while (this.executionState.isRunning) {
        // === STEP 1: Check if paused (async input) ===
        if (this.emulator.isPaused()) {
          await this.handlePausedState();
          continue;
        }

        // === STEP 2: Get current PC and handle Bulls-specific logic ===
        const pc = this.emulator.getRegister(16);
        await this.handleBullsExecution(pc);

        // === STEP 3: Check exit conditions ===
        if (this.checkExitConditions(pc)) {
          return;
        }

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
    if (
      this.bullsHandler.isBullsDoor() &&
      !this.bullsHandler.hasBullsReplyPortBeenInjected()
    ) {
      const a4Paused = this.emulator.getRegister(12);
      if (a4Paused !== 0) {
        console.log(
          `[DoorLifecycleManager] A4 set to 0x${a4Paused.toString(
            16
          )}, injecting reply ports`
        );
        this.bullsHandler.injectBullsReplyPort();
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  private async handleBullsExecution(pc: number): Promise<void> {
    if (!this.bullsHandler.isBullsDoor()) {
      return;
    }

    // 🔥 CRITICAL BULLS FIX: Force A4=0x0984 when stuck at PC=0x6C24 main loop
    if (pc === 0x6c24) {
      const a4 = this.emulator.getRegister(12);
      if (a4 === 0) {
        console.log(
          `[DoorLifecycleManager] 🔥 PC=0x6c24 A4=0x0 → FORCING A4=0x0984`
        );
        this.emulator.setRegister(12, 0x0984);
      }
    }

    // Bulls-specific PC tracking
    this.bullsHandler.logBullsPcState(pc);
    this.bullsHandler.logBullsHandshakeState(pc);
    this.bullsHandler.monitorBullsPointers(pc);

    // Bulls ROM return handling
    if (
      (pc >= 0xf00000 && pc <= 0xf30000) ||
      (pc >= 0x6fff0 && pc <= 0x7070f)
    ) {
      await this.handleBullsRomReturn(pc);
    }

    // Bulls early startup message
    if (!this.executionState.startupMessageSent) {
      await this.handleBullsStartup(pc);
    }

    // Bulls polling detection
    if (this.detectBullsPolling(pc)) {
      this.handleBullsPolling(pc);
    }
  }

  private async handleBullsRomReturn(pc: number): Promise<void> {
    console.log(
      `[DoorLifecycleManager] Bulls PC entered ROM/UNMAPPED region (0x${pc.toString(
        16
      )}), attempting recovery`
    );

    if (pc >= 0xf00000 && pc <= 0xf30000) {
      // Handle ROM wait loop
      if (this.forceROMReturn()) {
        this.executionState.romReturnAttempts++;
      }
    } else {
      // Handle unmapped memory
      const sp = this.emulator.getRegister(15);
      this.emulator.setRegister(15, sp + 4); // Pop return address
      this.emulator.setRegister(16, 0x6c24); // Force back to main Bulls loop
      this.emulator.refillPrefetch();
      this.executionState.romReturnAttempts++;
    }
  }

  private async handleBullsStartup(pc: number): Promise<void> {
    console.log(
      `[DoorLifecycleManager] *** BULLS DOOR DETECTED - SENDING EARLY STARTUP MESSAGE ***`
    );
    this.executionState.startupMessageSent = true;
    await this.sendStartupMessage();
    this.bullsHandler.injectBullsReplyPort();
  }

  private detectBullsPolling(pc: number): boolean {
    const bullsPollingAddresses = [
      0x1158, 0x118e, 0x1190, 0x1200, 0x1250, 0x1300,
    ];
    return (
      bullsPollingAddresses.includes(pc) &&
      !this.executionState.startupMessageSent
    );
  }

  private handleBullsPolling(pc: number): void {
    console.log(
      `[DoorLifecycleManager] *** BULLS POLLING DETECTED AT PC=0x${pc.toString(
        16
      )} - SENDING STARTUP MESSAGE ***`
    );
    this.executionState.startupMessageSent = true;
    this.sendStartupMessage();
  }

  private checkExitConditions(pc: number): boolean {
    // Exit trap: Door returned to our sentinel address
    if (pc === 0xffff00) {
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
      console.log(
        `[DoorLifecycleManager] PC in low memory (0x${pc.toString(
          16
        )}) - likely stack corruption`
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
    await new Promise((resolve) => setImmediate(resolve));
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

  private async executeInstruction(pc: number): Promise<void> {
    const wasAt24a6 = pc === 0x24a6;
    const cyclesExecuted = this.emulator.executeInstruction();
    this.executionState.totalCycles += cyclesExecuted;

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

    // Log progress every 5k iterations
    if (
      this.executionState.iterationCount % 5000 === 0 &&
      this.executionState.iterationCount > 0
    ) {
      await this.logProgress();
    }

    // Prevent infinite loops (safety limit)
    if (
      this.executionState.iterationCount > this.lifecycleConfig.loopGuardLimit
    ) {
      await this.handleGuardLimit();
      return;
    }

    // Yield to event loop for responsiveness
    const isWaitingForInput =
      this.ximProtocol?.isWaitingForLineInput() ?? false;
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
    console.error("[DoorLifecycleManager] 💥 ERROR in execution loop:", error);
    console.error(
      `[DoorLifecycleManager] 💥 Iteration: ${this.executionState.iterationCount}`
    );
    console.error(
      `[DoorLifecycleManager] 💥 PC: 0x${this.emulator
        .getRegister(16)
        .toString(16)}`
    );
    console.error(
      `[DoorLifecycleManager] 💥 Stack: ${
        error instanceof Error ? error.stack : "No stack"
      }`
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
    // Placeholder - would delegate to message handler
    console.log(
      "[DoorLifecycleManager] === SENDING STARTUP MESSAGE TO DOOR ==="
    );
    this.executionState.startupMessageSent = true;
  }

  private forceROMReturn(): boolean {
    // Placeholder - would implement ROM return logic
    console.log("[DoorLifecycleManager] Attempting to return door from ROM...");
    return true;
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
