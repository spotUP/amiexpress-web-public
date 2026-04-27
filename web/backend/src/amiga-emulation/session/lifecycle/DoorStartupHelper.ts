// DoorStartupHelper.ts
// One-shot door-startup helpers extracted from DoorLifecycleManager to keep
// that file under the 2000-line size budget. Two concerns live here:
//   1. logInitialState — verbose header + component status written to the
//      debug log at the start of a door lifecycle.
//   2. sendStartupMessage — WBStartup (XIM) or jhMessage fallback delivery
//      to the door's pr_MsgPort so it progresses past its initial Wait().
//
// No class; these are module functions with all dependencies passed in.

import * as path from "path";
import { Socket } from "socket.io";
import { DoorConfig } from "../../DoorTypes.js";
import { LibraryManager } from "../../LibraryManager.js";
import { DoorMessageHandler } from "../DoorMessageHandler.js";
import { debugLog } from "../../../utils/debug-log";
import type {
  ExecutionState,
  LifecycleConfig,
} from "../DoorLifecycleManager.js";

/**
 * Log the "LIFECYCLE MANAGER starting" banner + current component status.
 * Called once per door run, after executionState.isRunning has been set.
 */
export function logInitialState(
  executionState: ExecutionState,
  socket: Socket,
  config: DoorConfig,
  lifecycleConfig: LifecycleConfig,
): void {
  debugLog(
    "[DoorLifecycleManager] ===============================================",
  );
  debugLog(
    "[DoorLifecycleManager] 🚀 EXECUTION LOOP STARTING - LIFECYCLE MANAGER",
  );
  debugLog(
    "[DoorLifecycleManager] ===============================================",
  );

  debugLog("[DoorLifecycleManager] 📋 SYSTEM STATUS:");
  debugLog(`[DoorLifecycleManager]   Emulator: ✅`);
  debugLog(
    `[DoorLifecycleManager]   Running: ${executionState.isRunning} ✅`,
  );
  debugLog(`[DoorLifecycleManager]   Socket: ${socket.connected} ✅`);
  debugLog(
    `[DoorLifecycleManager]   Door Type: ${config.doorType || "SIM"}`,
  );
  debugLog(
    `[DoorLifecycleManager]   Executable: ${config.executablePath
      .split("/")
      .pop()}`,
  );
  debugLog(
    `[DoorLifecycleManager]   Debug Level: ${lifecycleConfig.debugLevel}`,
  );
}

/**
 * Deliver the initial startup message to the door.
 *
 * - For XIM doors: send a Workbench-style sm_ArgList message via
 *   ExecLibrary.seedWorkbenchStartup so doors like RTW/Bulls/JoinCnf that
 *   check offset 0x24 take the correct init path. Also populates
 *   DoorInfo/BBSInfo via DoorMessageHandler.sendInitAndStatusMessages so
 *   XIM doors that read user data from memory (ZooStats) see the right
 *   fields before their first XIM round-trip.
 * - For all other doors: delegate to
 *   DoorMessageHandler.sendStartupMessage (jhMessage).
 *
 * On XIM seedWorkbenchStartup failure, falls back to the jhMessage path so
 * the door still gets a wake-up message instead of hanging on Wait().
 *
 * Mutates executionState.startupMessageSent on entry (matches historical
 * DoorLifecycleManager behavior — the flag is set before the message
 * actually lands, so "sent" here means "delivery attempted").
 */
export async function sendStartupMessage(
  executionState: ExecutionState,
  messageHandler: DoorMessageHandler | null,
  libraryManager: LibraryManager,
  config: DoorConfig,
): Promise<void> {
  debugLog("[DoorLifecycleManager] === SENDING STARTUP MESSAGE TO DOOR ===");
  executionState.startupMessageSent = true;

  // CRITICAL FIX 2026-01-09: RTW/Bulls/JoinCnf expect WBStartup message format
  // on pr_MsgPort. These doors check offset 0x24 (sm_ArgList) for a valid
  // pointer. Our jhMessage format has 0 at that offset, causing doors to
  // take the wrong code path. Solution: send a WBStartup message instead of
  // jhMessage to pr_MsgPort.
  //
  // express.e shows the BBS waits for the door to send JH_REGISTER first,
  // but doors like RTW check pr_MsgPort expecting a Workbench-style startup
  // (since pr_CLI == 0).

  // CRITICAL: Also populate DoorInfo/BBSInfo structure for XIM doors that
  // read user data from memory (like ZooStats) rather than using XIM
  // commands.
  if (messageHandler) {
    messageHandler.sendInitAndStatusMessages();
  }

  // CRITICAL: Also deliver INIT/STAT directly to AEDoorPort so doors like
  // AquaScan.020 that scan ExecBase's port list and call GetMsg on AEDoorPort
  // (bypassing FindPort) see the startup message. We mark the messages as
  // "replied" so pollXIMMessages()'s getMsg({ skipReplies: true }) skips them —
  // only the door's own GetMsg (no skipReplies) will dequeue them.
  if (libraryManager?.execLibrary && config.doorType === "XIM") {
    const execLib = libraryManager.execLibrary;
    const aePortAddr = execLib.getDoorPortAddress();
    if (aePortAddr !== 0 && messageHandler) {
console.log(`[DoorStartupHelper] Sending INIT/STAT to AEDoorPort 0x${aePortAddr.toString(16)} (marked as skipReplies)`);
      messageHandler.sendStartupToAEDoorPort(aePortAddr);
      // Mark these messages so skipReplies polling doesn't consume them.
      const port = (execLib as any).messagePorts?.get(aePortAddr);
      if (port && port.messages) {
        for (const msgAddr of port.messages) {
          execLib.markMessageAsReplied(msgAddr);
        }
      }
    }
  }

  if (libraryManager?.execLibrary && config.doorType === "XIM") {
    try {
      const execLib = libraryManager.execLibrary;
      const doorName =
        config.doorId || path.basename(config.executablePath) || "XIM";
      // XIM doors like AquaScan use ReadArgs which may require arguments.
      // When the user provides args, use those; otherwise default to "1"
      // (upload directory).
      const args =
        Array.isArray(config.args) && config.args.length > 0
          ? config.args.map(String)
          : ["1"];
      debugLog(
        `[DoorLifecycleManager] Sending WBStartup message for XIM door: ${doorName} args=[${args.join(", ")}]`,
      );
      const msgAddr = execLib.seedWorkbenchStartup(doorName, args);
      if (msgAddr !== 0) {
        debugLog(
          `[DoorLifecycleManager] WBStartup message sent at 0x${msgAddr.toString(16)}`,
        );
      } else {
        console.warn(
          "[DoorLifecycleManager] Failed to send WBStartup message, falling back to jhMessage",
        );
        if (messageHandler) {
          messageHandler.sendStartupMessage();
        }
      }
    } catch (err) {
      console.error(
        "[DoorLifecycleManager] Error sending WBStartup message:",
        err,
      );
      if (messageHandler) {
        messageHandler.sendStartupMessage();
      }
    }
  } else if (messageHandler) {
    try {
      messageHandler.sendStartupMessage();
    } catch (err) {
      console.error(
        "[DoorLifecycleManager] Error sending startup message:",
        err,
      );
    }
  } else {
    console.warn(
      "[DoorLifecycleManager] No DoorMessageHandler available for startup message",
    );
  }
}
