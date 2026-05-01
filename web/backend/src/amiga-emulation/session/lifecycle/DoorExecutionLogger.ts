// DoorExecutionLogger.ts
// Call-trace and progress logging for DoorLifecycleManager.
// Extracted 2026-04-20 to keep DoorLifecycleManager under the 2000-line
// file-size budget. Behaviour unchanged — the main lifecycle class simply
// delegates to this helper.

import { MoiraEmulator } from "../../cpu/MoiraEmulator.js";
import { debugLog } from "../../../utils/debug-log";
import { getLvoName } from "../../constants/lvo-names.generated.js";
import type { ExecutionState, LifecycleConfig } from "../DoorLifecycleManager.js";

export interface WriteCallLogEntry {
  pc: number;
  iteration: number;
  args: { fileHandle: number; buffer: number; length: number };
}

export interface AEDoorCallLogEntry {
  pc: number;
  iteration: number;
  function: string;
}

/**
 * Per-door call and progress log. Owned by DoorLifecycleManager; collects
 * Write()/AEDoor.library call traces and records progress-by-PC so the
 * stuck-loop guard doesn't kill doors still actively spinning in a known
 * busy loop (e.g. SAmiLog3 at 0x5c90-0x5d10).
 */
export class DoorExecutionLogger {
  public writeCallLog: WriteCallLogEntry[] = [];
  public aedoorCallLog: AEDoorCallLogEntry[] = [];

  constructor(
    private readonly emulator: MoiraEmulator,
    private readonly executionState: ExecutionState,
    private readonly lifecycleConfig: LifecycleConfig,
  ) {}

  /**
   * Record SAmiLog3-style busy-loop hits as "progress" so the guard doesn't
   * fire. Only effective when input-wait extension is enabled.
   */
  recordProgressByPc(pc: number): void {
    this.executionState.stuckInLoop = pc >= 0x5c90 && pc <= 0x5d10;
    if (
      !this.lifecycleConfig.disableInputWaitExtension &&
      this.executionState.stuckInLoop
    ) {
      this.executionState.lastProgressIteration = this.executionState.iterationCount;
      this.executionState.lastProgressTime = Date.now();
    }
  }

  /**
   * Log a progress milestone. Body is intentionally near-empty — the verbose
   * debugLog lines are kept commented as a reference for opt-in diagnostics.
   */
  logProgress(): void {
    // Kept as a hook for future instrumentation. Historic debugLog output is
    // preserved below (commented) so future debugging can reopen it without
    // rediscovering which fields carried the right context.
    //
    // const totalSeconds = this.executionState.totalCycles / 7093793;
    // const elapsed = Date.now() - this.executionState.startTime!;
    // const pc = this.emulator.getRegister(16);
    // debugLog(`[DoorLifecycleManager] progress iter=${this.executionState.iterationCount} ...`);
  }

  /**
   * Log a DOS.Write() call. PC is provided by the caller because it lives
   * in the execution hot path and we avoid an extra register read here.
   */
  logWriteCall(pc: number): void {
    const fileHandle = this.emulator.getRegister(8); // A0 = file handle
    const buffer = this.emulator.getRegister(9); // A1 = buffer
    const length = this.emulator.getRegister(0); // D0 = length

    debugLog(
      `[DoorLifecycleManager] *** DOS.Write() CALL #${this.executionState.writeCallCount} ***`,
    );
    debugLog(
      `[DoorLifecycleManager]   PC: 0x${pc.toString(16)}, Iteration: ${this.executionState.iterationCount}`,
    );
    debugLog(
      `[DoorLifecycleManager]   File handle: 0x${fileHandle.toString(16)}`,
    );
    debugLog(
      `[DoorLifecycleManager]   Buffer: 0x${buffer.toString(16)}, Length: ${length}`,
    );

    this.writeCallLog.push({
      pc,
      iteration: this.executionState.iterationCount,
      args: { fileHandle, buffer, length },
    });
  }

  logAEDoorCall(pc: number, offset: number): void {
    const functionName = this.getAEDoorFunctionName(offset);
    debugLog(
      `[DoorLifecycleManager] *** AEDoor.library CALL #${this.executionState.aedoorCallCount} ***`,
    );
    debugLog(
      `[DoorLifecycleManager]   Function: ${functionName} (offset ${offset})`,
    );
    debugLog(
      `[DoorLifecycleManager]   PC: 0x${pc.toString(16)}, Iteration: ${this.executionState.iterationCount}`,
    );

    this.aedoorCallLog.push({
      pc,
      iteration: this.executionState.iterationCount,
      function: functionName,
    });
  }

  /**
   * Map an AEDoor.library LVO offset to a human-readable function name.
   * AEDoor is custom (not in NDK) so we maintain a complete map from
   * library-vectors/aedoor-vectors.ts.
   */
  getAEDoorFunctionName(offset: number): string {
    const functionMap: Record<number, string> = {
      [-24]: 'Stub_-24',
      [-30]: 'CreateComm',
      [-36]: 'DeleteComm',
      [-42]: 'SendCmd',
      [-48]: 'SendStrCmd',
      [-54]: 'SendDataCmd',
      [-60]: 'SendStrDataCmd',
      [-66]: 'GetData',
      [-72]: 'GetString',
      [-78]: 'Prompt',
      [-84]: 'WriteStr',
      [-90]: 'ShowGFile',
      [-96]: 'ShowFile',
      [-102]: 'SetDT',
      [-108]: 'GetDT',
      [-114]: 'GetStr',
      [-120]: 'CopyStr',
      [-126]: 'HotKey',
      [-132]: 'PreCreateComm',
      [-138]: 'PostDeleteComm',
    };
    return functionMap[offset] || `Unknown(offset ${offset})`;
  }
}
