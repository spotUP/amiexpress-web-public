import { BBSSession } from "../../index";
import { BBSState, LoggedOnSubState } from "../../constants/bbs-states";
import { AnsiUtil } from "../../utils/ansi.util";
import { SysopDebugUtil, DebugSeverity } from "../../utils/sysop-debug.util";

// Import from other handler modules
import { displayMenuPrompt } from "./menu";
import { processBBSCommand } from "./command-execution";
import { getSystemTime } from '../../utils/date-time.util';
import { acceptTypedChar, acceptBackspace, ANSI_PROMPT_MAX_LEN } from './line-input';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand,
} from "../command-execution.handler";

// Dependencies (injected)
let db: any;
let config: any;
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let processOlmMessageQueue: any;
let checkSecurity: any;
let setEnvStat: any;
let getRecentCallerActivity: any;
let doors: any[] = [];
let doorsList: any[] = [];

// Constants (injected)
let SCREEN_MENU: string = "MENU";

/**
 * Connect-screen graphics prompt (task 6 / audit F1-F3). Uppercase-only
 * ASCII: a power-on/reset real C64 renders unshifted PETSCII $41-$5A as
 * uppercase in graphics mode, so this string displays correctly on both
 * ASCII terminals and an undetected C64 sitting at this prompt. Inviting
 * <DEL> gives a real C64 caller something natural to press - PETSCII DEL
 * is $14, distinct from ASCII BS $08 / DEL $7F - which the raw-byte
 * classifier in index.ts's connection.on('data') handler (see
 * c64-detect.util.ts) reads before any PETSCII->ASCII conversion runs.
 *
 * Two lines (sysop addendum, 2026-09-02): the C64 DEL invite stays on its
 * own line, but the graphics question and the A/R/P/N prompt are merged
 * onto one line. The question comes last with a trailing space so the
 * input cursor sits right after it.
 * Kept identical to login-connect.service.ts's ANSI_GRAPHICS_PROMPT.
 */
const CONNECT_GRAPHICS_PROMPT =
  "\r\nCOMMODORE 64: PRESS <DEL>\r\nANSI, RIP, PETSCII, TELETEXT OR NO GRAPHICS (A/R/P/P8/T/N) [Q=SKIP BULLETINS]? ";

/**
 * Command Handler - Main Entry Point
 * Central command router and menu system
 * Handles all BBS command processing and routing
 * 1:1 port from AmiExpress express.e command processing
 */

/**
 * Debug log helper - logs to console AND sysop terminal/session log
 * When a sysop is logged in, debug messages appear in both backend.log and session log
 */
function debugLog(socket: any, session: BBSSession | undefined, message: string, category: string = "CMD") {
  // Always log to console (backend.log)
console.log(message);

  // If sysop logged in, also send to terminal and session log
  if (socket && session?.user?.secLevel && session.user.secLevel >= 200) {
    SysopDebugUtil.debug(socket, session, category, message.replace(/^\[.*?\]\s*/, ''));
  }
}

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

export function setConfig(cfg: any) {
  config = cfg;
}

export function setConferences(confs: any[]) {
  conferences = confs;
}

export function setMessageBases(bases: any[]) {
  messageBases = bases;
}

export function setFileAreas(areas: any[]) {
  fileAreas = areas;
}

export function setProcessOlmMessageQueue(fn: any) {
console.log("🔧 setProcessOlmMessageQueue called, fn type:", typeof fn);
  processOlmMessageQueue = fn;
console.log(
    "🔧 processOlmMessageQueue set, now type:",
    typeof processOlmMessageQueue
  );
}

export function setCheckSecurity(fn: any) {
  checkSecurity = fn;
}

export function setSetEnvStat(fn: any) {
  setEnvStat = fn;
}

export function setGetRecentCallerActivity(fn: any) {
  getRecentCallerActivity = fn;
}

export function setDoors(doorsListParam: any[]) {
  doors = doorsListParam;
  doorsList = doorsListParam;
}

export function setConstants(constants: any) {
  SCREEN_MENU = constants.SCREEN_MENU;
}

// Command Priority System - Express.e:28228-28282
// Priority order: SysCommand → BbsCommand → InternalCommand

// Check for System Command (express.e:4813-4819)
export async function runSysCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string
): Promise<string> {
  // Use the command-execution handler for SYSCMD lookup and execution
  const result = await execSysCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return "SUCCESS";
  if (result === -2) return "NOT_ALLOWED";
  return "FAILURE";
}

// Check for BBS Command (express.e:4807-4811)
export async function runBbsCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string
): Promise<string> {
  // Use the command-execution handler for BBSCMD lookup and execution
  const result = await execBbsCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return "SUCCESS";
  if (result === -2) return "NOT_ALLOWED";
  return "FAILURE";
}

// Process command with priority system (express.e:28229-28257)
// allowSyscmd=FALSE matches express.e default: SYSCMD is never searched for interactive
// user menu input. Pass allowSyscmd=TRUE only for internal BBS system calls (batch
// scripts, AREXX, door callbacks, ~CC_ MCI codes) — express.e:28249.
export async function processCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string,
  allowSyscmd: boolean = false
): Promise<string> {
  debugLog(
    socket,
    session,
    `[CommandPriority] Processing command: ${command} with params: ${params} allowSyscmd: ${allowSyscmd}`
  );

  // Try SysCommand first — only when allowSyscmd=TRUE (express.e:28249)
  // Interactive user menu input always uses allowSyscmd=FALSE (express.e:28229 default)
  if (allowSyscmd) {
    const sysResult = await runSysCommand(socket, session, command, params);
    if (sysResult === "SUCCESS") {
      debugLog(socket, session, "[CommandPriority] Executed as SysCommand");
      return "SUCCESS";
    }
    if (sysResult === "NOT_ALLOWED") {
      debugLog(socket, session, "[CommandPriority] SysCommand denied by permissions");
      return "NOT_ALLOWED";
    }
  }

  // Try BbsCommand second
  const bbsResult = await runBbsCommand(socket, session, command, params);
  if (bbsResult === "SUCCESS") {
    debugLog(socket, session, "[CommandPriority] Executed as BbsCommand");
    return "SUCCESS";
  }
  if (bbsResult === "NOT_ALLOWED") {
    debugLog(socket, session, "[CommandPriority] BbsCommand denied by permissions");
    return "NOT_ALLOWED";
  }

  // Try InternalCommand last
  debugLog(socket, session, "[CommandPriority] Trying as InternalCommand");
  await processBBSCommand(socket, session, command, params);
  return "SUCCESS";
}

// Handle user commands (processCommand equivalent)
export async function handleCommand(
  socket: any,
  session: BBSSession,
  data: string
) {
console.log("=== handleCommand called ===");
console.log("data:", JSON.stringify(data));
console.log("session.state:", session.state);
console.log("session.subState:", session.subState);
  const trimmedScreenCommand = (data || "").trim();
  const isAwaitScreenRunning =
    (session as any).pendingScreenCommand &&
    (session as any).executingScreenCommand;
  const allowScreenCommand =
    !!((session as any).executingScreenCommand && trimmedScreenCommand.length > 1);
  const isScreenDoorsPath = /^DOORS:/i.test(trimmedScreenCommand);
  if (allowScreenCommand) {
console.log(
      "[handleCommand] Executing screen-initiated command (state bypass enabled)"
    );
  }

  // NOTE: Door input routing is handled in socket-handlers.ts (checks doorInputHandler)
  // This function should only be called for non-door input

  // Special handling for WHO2 helper tools (NI/NO) - these must run without authentication
  // NI (NodeIn) executes on connection, NO (NodeOut) executes on logout
  // They create tracking files that WHO2 door reads to display connected users
  if (data === "DOORS:who/NI" || data === "DOORS:who/No") {
console.log(`[WHO2] Executing helper tool: ${data}`);
    const fs = require("fs");
    const path = require("path");
    const nodeId = session.nodeId || 0;
    const username = session.user?.username || "Guest";
    const whoDir = path.join(process.cwd(), "../../doors/who");

    try {
      // Ensure directory exists
      if (!fs.existsSync(whoDir)) {
        fs.mkdirSync(whoDir, { recursive: true });
      }

      if (data === "DOORS:who/NI") {
        // NodeIn - create node tracking file on connection
        const nodeFile = path.join(whoDir, `node${nodeId}.txt`);
        const nodeData = `Node: ${nodeId}\nUser: ${username}\nConnected: ${getSystemTime().toISOString()}\n`;
        fs.writeFileSync(nodeFile, nodeData);
console.log(`[WHO2] NI created tracking file: ${nodeFile}`);
      } else {
        // NodeOut - remove node tracking file on logout
        const nodeFile = path.join(whoDir, `node${nodeId}.txt`);
        if (fs.existsSync(nodeFile)) {
          fs.unlinkSync(nodeFile);
console.log(`[WHO2] NO removed tracking file: ${nodeFile}`);
        }
      }
  } catch (error: any) {
console.error(`[WHO2] Error executing ${data}:`, error);
    }
    return; // Done - don't process further
  }

  // Screen-triggered commands (from ~CC_ / ~XC_ MCI codes) need to run even if the
  // session is still in AWAIT states (ANSI prompt, etc.). Allow them to bypass the
  // usual subState gating as long as they are not raw DOORS: helper paths.
  if (
    allowScreenCommand &&
    trimmedScreenCommand.length > 0 &&
    !isScreenDoorsPath
  ) {
    const normalized = trimmedScreenCommand.toUpperCase();
    const parts = normalized.split(/\s+/);
    const command = parts[0];
    const params = parts.slice(1).join(" ");
console.log(
      "[handleCommand] Running screen command immediately:",
      command,
      params
    );
    try {
      await processCommand(socket, session, command, params);
    } catch (error) {
console.error("[handleCommand] Screen command failed:", error);
    }
    return;
  }

  // Handle pre-login connection flow (AWAIT state)
  if (!allowScreenCommand && session.state === BBSState.AWAIT) {
    if (session.subState === LoggedOnSubState.DISPLAY_CONNECT) {
      // User pressed key after connection screen (welcome + node list)
      // reference-board BBS layout: everything shown on connect, now just show ANSI prompt
      // express.e:29528 - ANSI prompt
console.log("📋 Connection screen viewed, showing ANSI prompt");
      session.subState = LoggedOnSubState.ANSI_PROMPT;
      session.tempData = { inputBuffer: "" }; // Initialize input buffer
      if ((session as any).pendingScreenCommand) {
console.log(
          "[handleCommand] Await screen command still running, deferring prompt"
        );
        (session as any).pendingScreenCommand
          .then(() => {
            if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
              socket.emit(
                "ansi-output",
                CONNECT_GRAPHICS_PROMPT
              );
            }
          })
          .catch((error: any) => {
console.error(
              "[handleCommand] Pending screen command rejected:",
              error
            );
            socket.emit(
              "ansi-output",
              CONNECT_GRAPHICS_PROMPT
            );
          });
      } else {
        socket.emit(
          "ansi-output",
          CONNECT_GRAPHICS_PROMPT
        );
      }
      return;
    }

    if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
      if ((session as any).pendingScreenCommand) {
console.log(
          "[handleCommand] ANSI prompt input ignored until screen command completes"
        );
        return;
      }
      // express.e:29530-29546 - Line input for ANSI prompt (not single keypress!)
      // Buffer input until Enter is pressed
      if (data === "\r") {
        // Enter pressed - process the buffered input
        const answer = (session.tempData?.inputBuffer || "").toUpperCase();
console.log("📋 Graphics prompt response:", answer || "(empty = ANSI)");

        // express.e:29538-29546 - one shared implementation (see
        // applyGraphicsAnswer); this copy used to set only
        // tempData.ripMode "for future use", so R never reached the
        // screen loader.
        const { applyGraphicsAnswer } = require("./pre-login");
        applyGraphicsAnswer(socket, session, answer);

console.log(
          "📋 Graphics mode set:",
          session.petsciiMode
            ? "PETSCII"
            : session.ansiEnabled
            ? "ANSI/RIP"
            : "None"
        );

        // express.e:29551 - Display BBSTITLE screen and immediately show login prompt
        session.tempData.inputBuffer = ""; // Clear buffer
        const { displayScreen } = require("../screen.handler");
        await displayScreen(socket, session, "BBSTITLE");

        // Immediately transition to login state (no key press required)
        session.state = BBSState.LOGON;
        session.subState = undefined;
        socket.emit("ansi-output", "\r\n\r\n");
        socket.emit("prompt-login"); // Tell frontend to show login form
        return;
      } else if (data === "\x7f" || data === "\b") {
        // Backspace (express.e:2306), through the shared rule.
        {
          const edit = acceptBackspace(
            ((session.tempData as any)?.inputBuffer as string) || ""
          );
          (session.tempData as any).inputBuffer = edit.buffer;
          if (edit.echo) socket.emit("ansi-output", edit.echo);
        }
        return;
      } else if (data.length === 1 && data >= " " && data <= "~") {
        // Printable, and only while the field has room (express.e:2335,
        // maxLen 10 for this prompt at 29530). This is the SECOND copy of
        // the graphics prompt's input loop - pre-login.ts has the other -
        // so it had the same wrap-and-cannot-backspace bug and needs the
        // same rule until the two are merged.
        {
          const edit = acceptTypedChar(
            ((session.tempData as any)?.inputBuffer as string) || "",
            data,
            ANSI_PROMPT_MAX_LEN
          );
          (session.tempData as any).inputBuffer = edit.buffer;
          if (edit.echo) socket.emit("ansi-output", edit.echo);
        }
        return;
      }
      // Ignore other control characters
      return;
    }

    if (session.subState === LoggedOnSubState.DISPLAY_BBSTITLE) {
      // User pressed key after BBSTITLE, now ready for login
console.log("📋 BBSTITLE viewed, transitioning to login");
      session.state = BBSState.LOGON;
      session.subState = undefined;
      socket.emit(
        "ansi-output",
        "\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n"
      );
      socket.emit(
        "ansi-output",
        "\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n"
      );
      socket.emit("prompt-login"); // Tell frontend to show login form
      return;
    }

    return;
  }

  // Allow LOGGEDON, LOGON, and REGISTERING states to continue
  // LOGON is allowed temporarily due to session state race conditions
  if (
    !allowScreenCommand &&
    session.state !== BBSState.LOGGEDON &&
    session.state !== BBSState.LOGON &&
    session.state !== BBSState.REGISTERING
  ) {
console.log(
      "❌ Not in LOGGEDON/LOGON or REGISTERING state, ignoring command"
    );
console.log("   Current state:", session.state);
    return;
  }

  // If we get here, delegate to specialized input handlers
  const { handleSpecializedInput } = await import("./input-handlers");
  await handleSpecializedInput(socket, session, data);
}
