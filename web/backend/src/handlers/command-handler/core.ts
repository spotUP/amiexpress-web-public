import { BBSSession } from "../../index";
import { BBSState, LoggedOnSubState } from "../../constants/bbs-states";
import { AnsiUtil } from "../../utils/ansi.util";

// Import from other handler modules
import { displayMenuPrompt } from "./menu";
import { handleSysopMenuInput } from "./input-handlers";
import { processBBSCommand } from "./command-execution";
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
 * Command Handler - Main Entry Point
 * Central command router and menu system
 * Handles all BBS command processing and routing
 * 1:1 port from AmiExpress express.e command processing
 */

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
export async function processCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string
): Promise<string> {
  console.log(
    `[CommandPriority] Processing command: ${command} with params: ${params}`
  );

  // Handle sysop menu input routing
  if ((session as any).inSysopMenu) {
    await handleSysopMenuInput(socket, session, command);
    return "SUCCESS";
  }

  // Try SysCommand first
  const sysResult = await runSysCommand(socket, session, command, params);
  if (sysResult === "SUCCESS") {
    console.log("[CommandPriority] Executed as SysCommand");
    return "SUCCESS";
  }
  if (sysResult === "NOT_ALLOWED") {
    console.log("[CommandPriority] SysCommand denied by permissions");
    return "NOT_ALLOWED";
  }

  // Try BbsCommand second
  const bbsResult = await runBbsCommand(socket, session, command, params);
  if (bbsResult === "SUCCESS") {
    console.log("[CommandPriority] Executed as BbsCommand");
    return "SUCCESS";
  }
  if (bbsResult === "NOT_ALLOWED") {
    console.log("[CommandPriority] BbsCommand denied by permissions");
    return "NOT_ALLOWED";
  }

  // Try InternalCommand last
  console.log("[CommandPriority] Trying as InternalCommand");
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
  const isAwaitScreenRunning =
    (session as any).pendingScreenCommand &&
    (session as any).executingScreenCommand;
  const allowScreenCommand = !!(session as any).executingScreenCommand;
  const trimmedScreenCommand = (data || "").trim();
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
        const nodeData = `Node: ${nodeId}\nUser: ${username}\nConnected: ${new Date().toISOString()}\n`;
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
    } catch (error) {
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
                "\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? "
              );
            }
          })
          .catch((error) => {
            console.error(
              "[handleCommand] Pending screen command rejected:",
              error
            );
            socket.emit(
              "ansi-output",
              "\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? "
            );
          });
      } else {
        socket.emit(
          "ansi-output",
          "\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? "
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

        // express.e:29538-29546 - Check for specific letters in the string
        // Default (empty/just Enter) = ANSI enabled
        const hasN = answer.includes("N"); // No graphics
        const hasR = answer.includes("R"); // RIP mode
        const hasP = answer.includes("P"); // PETSCII mode
        const hasQ = answer.includes("Q"); // Quick logon

        // express.e:29538-29539 - If 'N' in string, disable ANSI
        session.ansiEnabled = !hasN;

        // express.e:29543-29544 - Quick logon flag (for future use)
        if (hasQ) {
          (session.tempData as any).quickLogon = true;
        }

        // express.e:29545 - RIP mode flag (for future use)
        if (hasR) {
          (session.tempData as any).ripMode = true;
        }

        // PETSCII mode - C64/128 terminal mode (40x25 display, .seq files)
        if (hasP) {
          session.petsciiMode = true;
          session.ansiEnabled = true; // PETSCII needs ANSI codes
          (session.tempData as any).termWidth = 40;
          (session.tempData as any).termHeight = 25;
          console.log("📋 PETSCII mode enabled: 40x25 terminal");
        }

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
        // Backspace - remove last character from buffer
        if (
          session.tempData?.inputBuffer &&
          (session.tempData as any).inputBuffer.length > 0
        ) {
          (session.tempData as any).inputBuffer = (
            session.tempData as any
          ).inputBuffer.slice(0, -1);
          socket.emit("ansi-output", "\b \b"); // Echo backspace
        }
        return;
      } else if (data.length === 1 && data >= " " && data <= "~") {
        // Printable character - add to buffer and echo it
        (session.tempData as any).inputBuffer =
          (session.tempData?.inputBuffer || "") + data;
        socket.emit("ansi-output", data); // Echo the character
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
