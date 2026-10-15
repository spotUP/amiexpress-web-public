import { debugLog } from "../../../utils/debug-log";

/**
 * TIM/SIM/IIM/SUP door message polling, extracted from DoorLifecycleManager
 * (2026-09-15) unchanged, so the manager could take the deferred-termination
 * fix without crossing the file-size limit. Same body, same log lines; the
 * manager's fields are reached through `deps` so nothing about ordering or
 * ownership moved with it.
 *
 * Reference: express.e lines 4371-4525 - TIM doors use the simpler doorMsg
 * structure instead of jhMessage.
 */
export interface TimPollerDeps {
  emulator: () => { writeString(addr: number, text: string): void };
  config: () => { doorType?: string; bbsSession?: { nodeId?: number | string; nodeNumber?: number | string } };
  execLibrary: () => { findPort(addr: number): number; getMsg(addr: number): number; replyMsg(addr: number): void } | null | undefined;
  timHandler: () => { handleMessage(addr: number): Promise<{ exit: boolean }> } | null;
  executionState: () => { isRunning: boolean };
}

export class TimMessagePoller {
  private timPollCount = 0;
  private lastTimPollLog = 0;

  constructor(private readonly deps: TimPollerDeps) {}

  /**
   * Poll for TIM door messages from DoorControl{n} port
   * Reference: express.e lines 4371-4525
   * TIM doors use simpler doorMsg structure instead of jhMessage
   */
  async poll(): Promise<void> {
    this.timPollCount++;

    // Log doorType on first poll
    if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] pollTIMMessages called: doorType="${this.deps.config().doorType}"`);
    }

    // Log every 10000 polls to confirm polling is active
    if (this.timPollCount - this.lastTimPollLog >= 10000) {
debugLog(`[DoorLifecycleManager] TIM polling active: ${this.timPollCount} polls so far`);
      this.lastTimPollLog = this.timPollCount;
    }

    // Poll for all DoorControl-using doors (TIM, SIM, IIM, SUP)
    const effectiveDoorType = (this.deps.config().doorType || "SIM").toUpperCase();
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

    const execLib = this.deps.execLibrary();
    if (!execLib) {
      if (this.timPollCount === 1) {
debugLog(`[DoorLifecycleManager] TIM polling FAILED: execLib is null`);
      }
      return;
    }

    // Get the DoorControl port address
    // For TIM doors, port name is DoorControl{nodeId} (e.g., "DoorControl1")
    // Must match port creation - use nodeId ?? nodeNumber ?? 1
    const nodeId = this.deps.config().bbsSession?.nodeId ?? this.deps.config().bbsSession?.nodeNumber ?? 1;
    const portName = `DoorControl${nodeId}`;

    // Write port name to temporary memory for findPort
    const portNameAddr = 0x500; // Temporary address for port name
    this.deps.emulator().writeString(portNameAddr, portName);

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
        const timHandler = this.deps.timHandler();
        if (timHandler) {
          const result = await timHandler.handleMessage(msgAddr);

          // CRITICAL: Reply to the message so door's GetMsg receives it!
          // TIM/SIM doors poll their reply port waiting for the replied message
          execLib.replyMsg(msgAddr);
debugLog(`[DoorLifecycleManager] TIM polling: Replied to message at 0x${msgAddr.toString(16)}`);

          if (result.exit) {
debugLog(`[DoorLifecycleManager] TIM door requested exit`);
            this.deps.executionState().isRunning = false;
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
}
