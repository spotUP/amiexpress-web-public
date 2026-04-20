// door-message-callbacks.ts
// Installs the two XIM-message callback paths used by DoorLifecycleManager.
// Extracted from the constructor body so that file stays under the
// 2000-line size budget. Behaviour unchanged — these are the same two
// callbacks that existed inline in startLifecycle().
//
// Path A (setXIMProcessor):
//   Called synchronously from AEDoor.library's trap handlers
//   (AEDoorLibrary.waitForReply) while the emulator is inside a trap.
//   waitForReply is a tight sync loop that cannot yield to the async
//   pollXIMMessages task, so it drives message processing itself via
//   this callback.
//
// Path B (setDoorMessageCallback):
//   Invoked by ExecLibrary.putMsg whenever a door PutMsg()s a message
//   to AEDoorPort, DoorReplyPort, or the door's own task port. Catches
//   direct-XIM doors (RTW, Bulls, JoinCnf) that don't go through
//   aedoor.library. Only AEDoorPort messages are processed; reply-port
//   traffic is ignored here (those are replies TO the door).
//
// Blocking command semantics (shared by both paths): JH_HK (6),
// JH_LI (0), JH_PM (5), JH_ExtHK (15) pre-pause the emulator so the
// handler's own pause()/waitingFor* state takes effect before the
// callback returns. Non-blocking commands rely on the handler's own
// reply() having already run and set state.replyHandled — the callback
// only falls back to replyMsg when the handler failed to reply.

import type { LibraryManager } from "../../LibraryManager.js";
import type { MoiraEmulator } from "../../cpu/MoiraEmulator.js";
import type { XIMProtocol } from "../../XIMProtocol.js";
import type { ExecutionState } from "../DoorLifecycleManager.js";

/** Blocking I/O XIM command codes — must pre-pause before handleMessage. */
const BLOCKING_COMMANDS = [6, 0, 5, 15]; // JH_HK=6, JH_LI=0, JH_PM=5, JH_ExtHK=15

export interface MessageCallbackDeps {
  libraryManager: LibraryManager;
  emulator: MoiraEmulator;
  executionState: ExecutionState;
  /**
   * Live accessor for the XIM protocol. Using a getter (vs a direct
   * reference at install time) lets DoorLifecycleManager.setXIMProtocol
   * swap the instance after callbacks are installed without rewiring.
   */
  getXimProtocol: () => XIMProtocol | null;
  /** Set by doorMessageCallback on first AEDoorPort message. */
  markUsingDoorMessageCallback: () => void;
  /** Bump the per-batch message count after each AEDoorPort message. */
  incrementMessagesHandled: () => void;
}

/** Install both XIM-message callback paths. */
export function installMessageCallbacks(deps: MessageCallbackDeps): void {
  installXIMProcessor(deps);
  installDoorMessageCallback(deps);
}

/**
 * Path A: synchronous XIM processor driven by AEDoor.library's trap
 * handler while the emulator is stuck inside waitForReply. Pulls one
 * message from bbsPortAddr, parses, handles, and (for non-blocking
 * commands) replies synchronously so the tight loop can find a reply
 * on the next iteration.
 */
function installXIMProcessor(deps: MessageCallbackDeps): void {
  const { libraryManager, emulator, executionState, getXimProtocol } = deps;
  if (!libraryManager?.aedoorLibrary || !libraryManager?.execLibrary) {
    return;
  }
  const execLib = libraryManager.execLibrary;

  libraryManager.aedoorLibrary.setXIMProcessor((bbsPortAddr: number) => {
    // Get one message from the BBS port (the message the door just sent)
    const msgAddr = execLib.getMsg(bbsPortAddr);
    const ximProtocol = getXimProtocol();
    if (!msgAddr || msgAddr === 0 || !ximProtocol) {
      return;
    }
    const parsed = ximProtocol.parseMessage(msgAddr);

    // CRITICAL FIX: Pre-pause for blocking I/O commands (same as
    // doorMessageCallback). handleMessage is async, so pause() inside
    // handlers won't take effect before the callback returns.
    const hasQueuedInput = ximProtocol.hasQueuedInput?.() ?? false;
    if (
      BLOCKING_COMMANDS.includes(parsed.command) &&
      emulator &&
      !hasQueuedInput
    ) {
      emulator.pause();
    }

    // Handle synchronously - for JH_WRITE this just emits to socket and
    // replies. Note: handleMessage is async but the sync parts run
    // immediately.
    // CRITICAL FIX 2026-01-16: For non-blocking commands, call replyMsg
    // SYNCHRONOUSLY! The .then() callback won't run until the call stack
    // is empty, but we're in a trap handler (synchronous loop in
    // waitForReply). If we defer replyMsg to .then(), it never runs
    // before waitForReply times out.
    //
    // For blocking commands (JH_HK, JH_LI, JH_PM, JH_ExtHK), we DON'T
    // reply immediately — the input handler will call replyMsg when
    // user input arrives.
    const isBlockingCommand = BLOCKING_COMMANDS.includes(parsed.command);

    if (isBlockingCommand) {
      console.log(
        `[DoorLifecycleManager] XIMProcessor: Blocking cmd=${parsed.command}, waiting for input`,
      );
      ximProtocol.handleMessage(parsed);
      return;
    }

    // Non-blocking command - handle and reply synchronously.
    // Handlers for DT_*, BB_* etc. are fully sync: their reply() writes
    // msg.string AND calls replyMsg() before handleMessage returns, then
    // marks state.replyHandled=true. Only fall back to replyMsg here
    // when the handler did NOT already reply (e.g. unhandled command).
    ximProtocol.handleMessage(parsed);
    const replyHandled = ximProtocol.wasReplyHandled();
    if (!ximProtocol.isWaitingForLineInput() && !replyHandled) {
      console.log(
        `[DoorLifecycleManager] XIMProcessor: Calling replyMsg SYNC for cmd=${parsed.command}`,
      );
      execLib.replyMsg(parsed.msgAddr);
    } else if (replyHandled) {
      console.log(
        `[DoorLifecycleManager] XIMProcessor: SKIPPING replyMsg - handler already replied for cmd=${parsed.command}`,
      );
    }

    // JH_SHUTDOWN is a cooperative signal: the door PutMsg's it, WaitPort's for
    // the reply, then continues executing (often doing final cleanup/delivery
    // like WarOLM which delivers cross-node OLM AFTER sending JH_SHUTDOWN at
    // file 0xDCA, then RTS's out of main). Halting immediately on JH_SHUTDOWN
    // kills code that hasn't run yet. The door exits naturally via RTS to the
    // 0xffff00/0x1ff000 sentinel, detected by DoorExitDetector.
    if (ximProtocol.isShuttingDown()) {
      console.log(
        `[DoorLifecycleManager] XIMProcessor: Door sent JH_SHUTDOWN - flagged, continuing execution until natural exit`,
      );
    }
  });
}

/**
 * Path B: doorMessageCallback for direct-XIM doors (RTW, Bulls, JoinCnf)
 * that PutMsg directly without going through aedoor.library. Fires on
 * PutMsg → AEDoorPort and processes messages there.
 *
 * Unlike Path A, this path uses the .then() pattern and does NOT
 * fall back to replyMsg — XIM handlers already reply. Calling replyMsg
 * here produced the "DOUBLED OUTPUT" regression fixed in 2026-01-20
 * (see AmigaDoorSession.ts comment block for the post-mortem).
 */
function installDoorMessageCallback(deps: MessageCallbackDeps): void {
  const {
    libraryManager,
    emulator,
    executionState,
    getXimProtocol,
    markUsingDoorMessageCallback,
    incrementMessagesHandled,
  } = deps;
  if (!libraryManager?.execLibrary) {
    return;
  }
  const execLib = libraryManager.execLibrary;

  execLib.setDoorMessageCallback((portAddr: number, msgAddr: number) => {
    const ximProtocol = getXimProtocol();
    if (!ximProtocol) {
      return;
    }
    // Only process messages to this node's server port (door -> BBS).
    // Accepted targets:
    //   1. AEDoorPort{N} — convention for direct-XIM doors (RTW, Bulls,
    //      JoinCnf) that PutMsg straight to the door's own msgport.
    //   2. AEServer.{N} for this node — the express.e convention for
    //      FindPort("AEServer.%d")+PutMsg (e.g. WarOLM's table-render
    //      DT_NAME/DT_LOCATION queries). Full XIM handling.
    //   3. AEServer.<other N> — doors that enumerate nodes by sending
    //      to each per-node port in turn (WarOLM does this for MULTICOM
    //      status). We can't answer with the OTHER node's user data
    //      without cross-session IPC, but we MUST still reply — else
    //      the door's GetMsg returns NULL and its saved msg-pointer
    //      global gets clobbered to 0, which corrupts every subsequent
    //      iteration and forces an early FAIL exit. Zero the string
    //      field (so no stale sysop/location from a prior reply leaks
    //      into that row) and reply via the standard path.
    // DoorReplyPort messages are replies going back TO the door, not
    // commands, and are still filtered out.
    const portName = (execLib.getPortName(portAddr) ?? "").toLowerCase();
    const isOwnServerPort =
      typeof (execLib as any).getDoorPortAddress === "function" &&
      (execLib as any).getDoorPortAddress() === portAddr;
    const isOtherAEServer =
      portName.startsWith("aeserver.") && !isOwnServerPort;

    if (isOtherAEServer) {
      // Cross-node PutMsg to AEServer.<otherNodeId>. Two cases:
      //   (a) DT_NAME / DT_LOCATION read — answer from MulticomManager
      //       (the sender wants to know who's on node N).
      //   (b) JH_SM (Send Message) — the sender wants to deliver text
      //       to node N's screen. This is WarOLM's OLM delivery path:
      //       after target status hits IDLE, WarOLM loops over the
      //       10-line buffer and PutMsg's a JH_SM per line to
      //       AEServer.<target>. Route to target session's socket via
      //       the existing olm.handler infrastructure.
      if (msgAddr && typeof (execLib as any).replyMsg === "function") {
        const STRING_OFFSET = 0x14;
        const STRING_LEN = 200;
        const COMMAND_OFFSET = 0xe0;
        const JH_SM = 4;
        const DT_NAME = 100;
        const DT_LOCATION = 102;

        // Parse target nodeId from "AEServer.<N>"
        const dot = portName.indexOf(".");
        const targetNodeId =
          dot >= 0 ? parseInt(portName.slice(dot + 1), 10) : NaN;

        // Read the query command (DT_NAME=100, DT_LOCATION=102, JH_SM=4, …)
        const command = emulator.readMemory32(msgAddr + COMMAND_OFFSET);

        // Peek the string buffer for tracing (first 40 bytes, printable only)
        let _peekStr = "";
        for (let i = 0; i < 40; i++) {
          const b = emulator.readMemory(msgAddr + STRING_OFFSET + i);
          if (b === 0) break;
          _peekStr += b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
        }
        console.log(
          `[X-NodeRoute] AEServer.${targetNodeId} cmd=${command} dataFlag=${emulator.readMemory32(
            msgAddr + 0xdc,
          )} str="${_peekStr}"`,
        );

        // ---------- (b) Cross-node JH_SM delivery ----------
        if (
          command === JH_SM &&
          Number.isFinite(targetNodeId) &&
          targetNodeId > 0
        ) {
          const DATA_OFFSET = 0xdc;
          // JH_SM semantics: msg.data == 1 → print+newline, 0 → inline.
          const data = emulator.readMemory32(msgAddr + DATA_OFFSET);

          // Extract the NUL-terminated string from the jhMessage buffer
          let text = "";
          for (let i = 0; i < STRING_LEN; i++) {
            const b = emulator.readMemory(msgAddr + STRING_OFFSET + i);
            if (b === 0) break;
            text += String.fromCharCode(b & 0xff);
          }
          try {
            const {
              getSocketIdByNodeId,
              sessions,
            } = require("../../../server/session-manager.js");
            const targetSocketId = getSocketIdByNodeId(targetNodeId);
            const targetSession = sessions.get(String(targetNodeId));
            if (targetSocketId && targetSession) {
              const io = (global as any).io;
              if (io && typeof io.to === "function") {
                const payload = data === 1 ? text + "\r\n" : text;
                io.to(targetSocketId).emit("ansi-output", payload);
              }
            }
          } catch {
            /* session-manager not loadable — drop the msg silently */
          }

          execLib.removeMessageFromPort(portAddr, msgAddr);
          (execLib as any).replyMsg(msgAddr);
          return;
        }

        // ---------- (a) Cross-node data query ----------
        const DT_SLOTNUMBER = 104;
        let reply = "";
        if (Number.isFinite(targetNodeId) && targetNodeId > 0) {
          // DT_SLOTNUMBER must answer for any live target node, even if
          // MulticomManager has no user record for it. WarOLM probes STATS@N
          // first and only reaches us when the target is IDLE, so the caller
          // has already proven the node exists. Returning an empty string
          // here made WarOLM build a truncated path — `LISTS/` instead of
          // `LISTS/<slot>` — which Open() then hit as a directory, IoErr=214.
          //
          // express.e: slot number is the user's user.db index. We use
          // nodeId as a stable stand-in so cross-node doors can form
          // per-user filenames without hitting the user db from inside the
          // emulator.
          if (command === DT_SLOTNUMBER) {
            reply = String(targetNodeId);
          }
          try {
            const { multicomManager } =
              require("../../../nodes/MulticomManager.js");
            const info = multicomManager.getNode?.(targetNodeId);
            if (info) {
              if (command === DT_NAME) reply = info.username ?? "";
              else if (command === DT_LOCATION) reply = info.location ?? "";
            }
          } catch {
            /* MulticomManager not loadable — DT_NAME/LOCATION stay empty,
             * DT_SLOTNUMBER is already set above. */
          }
        }

        // Zero the full buffer then write the reply (NUL-terminated,
        // capped to 199 bytes so there's always a terminator).
        for (let i = 0; i < STRING_LEN; i++) {
          emulator.writeMemory(msgAddr + STRING_OFFSET + i, 0);
        }
        const bytes = Buffer.from(reply, "latin1");
        const len = Math.min(bytes.length, STRING_LEN - 1);
        for (let i = 0; i < len; i++) {
          emulator.writeMemory(msgAddr + STRING_OFFSET + i, bytes[i]);
        }

        // removeMessageFromPort so the msg doesn't also sit in the
        // target port's queue after we've "processed" it.
        execLib.removeMessageFromPort(portAddr, msgAddr);
        (execLib as any).replyMsg(msgAddr);
      }
      return;
    }

    if (!portName.startsWith("aedoorport") && !isOwnServerPort) {
      return;
    }
    // PERFORMANCE FIX 2026-01-14: Mark that we're using callback-based
    // processing. This prevents pollXIMMessages from double-processing
    // the same messages.
    markUsingDoorMessageCallback();
    incrementMessagesHandled();

    // Remove from queue and process immediately
    execLib.removeMessageFromPort(portAddr, msgAddr);
    const parsed = ximProtocol.parseMessage(msgAddr);

    // CRITICAL FIX: For blocking I/O commands (JH_HK, JH_LI, JH_PM,
    // JH_ExtHK), we MUST pause the emulator BEFORE calling handleMessage.
    // handleMessage is async, and without this the pause() inside
    // handleHotkey/etc won't take effect until AFTER this callback
    // returns (due to await in handleMessage). This causes the door to
    // continue executing and spin on GetMsg. ONLY pause if no input is
    // already queued - otherwise the handler replies immediately.
    const hasQueuedInput = ximProtocol.hasQueuedInput?.() ?? false;
    if (
      BLOCKING_COMMANDS.includes(parsed.command) &&
      emulator &&
      !hasQueuedInput
    ) {
      emulator.pause();
    }

    // Handle message synchronously for blocking commands, async for others
    // Note: handleMessage is async but sync parts run immediately
    ximProtocol.handleMessage(parsed).then(() => {
      // CRITICAL FIX 2026-01-20: DO NOT call replyMsg here - XIM
      // handlers already reply! Calling replyMsg here causes DOUBLE
      // REPLIES which confuses door state machines. The door receives
      // the same message twice → wrong branch logic → infinite loops.
      // AmigaDoorSession.ts:415-420 documents this: "DOUBLED OUTPUT"
      // when both callback and handler reply. XIM handlers (bbs-info.ts,
      // data-query.ts, etc.) call reply() which calls replyMsg().
      console.log(
        `[DoorLifecycleManager] doorMessageCallback: Message handled for cmd=${parsed.command} (XIM handler replied)`,
      );

      // See comment in XIMProcessor path above: JH_SHUTDOWN is a cooperative
      // signal, not a hard stop. Let the door continue and exit via the
      // sentinel-PC path handled by DoorExitDetector.
      const currentXim = getXimProtocol();
      if (currentXim && currentXim.isShuttingDown()) {
        console.log(
          `[DoorLifecycleManager] doorMessageCallback: Door sent JH_SHUTDOWN - flagged, continuing execution until natural exit`,
        );
      }
    });
  });
}
