import { BBSSession } from "../../index";
import { LoggedOnSubState } from "../../constants/bbs-states";

// Dependencies (injected) - these are managed by core.ts
let db: any;
let config: any;
let conferences: any[] = [];
let messageBases: any[] = [];
let processOlmMessageQueue: any;

// Constants (injected) - managed by core.ts
let SCREEN_MENU: string = "MENU";

// Import from screen handler
import { displayScreen, doPause, hasKeysFile } from "../screen.handler";

/**
 * Display main menu
 */
export async function displayMainMenu(socket: any, session: BBSSession) {
  console.log(
    "displayMainMenu called, current subState:",
    session.subState,
    "menuPause:",
    session.menuPause
  );
  console.log("🔍 processOlmMessageQueue type:", typeof processOlmMessageQueue);

  // Like AmiExpress: only display menu if menuPause is TRUE
  if (session.menuPause) {
    console.log("menuPause is TRUE, displaying menu");

    // Express.e:28584 - IF (menuPause) THEN doPause()
    doPause(socket, session);

    // Clear screen before displaying menu (like AmiExpress does)
    console.log("Sending screen clear: \\x1b[2J\\x1b[H");
    socket.emit("ansi-output", "\x1b[2J\x1b[H"); // Clear screen and move cursor to top

    // Like express.e:28594 - process OLM message queue AFTER clearing screen but BEFORE menu
    // This ensures messages are visible and not immediately erased
    if (typeof processOlmMessageQueue === "function") {
      processOlmMessageQueue(socket, session, true);
    } else {
      console.warn(
        "⚠️  processOlmMessageQueue not injected yet, skipping OLM queue processing"
      );
    }

    // Like express.e:6567 - default cmdShortcuts to FALSE (line input mode)
    session.cmdShortcuts = false;

    // CRITICAL FIX: Correct condition from express.e:28583
    // Express.e:28583 - IF ((loggedOnUser.expert="N") AND (doorExpertMode=FALSE)) OR (checkToolTypeExists(TOOLTYPE_CONF,currentConf,'FORCE_MENUS'))
    // Note: Database stores expert as BOOLEAN (true/false), not string ("Y"/"N")
    console.log("🔍 [Menu Display] Checking expert mode:");
    console.log("  - session.user?.expert:", session.user?.expert);
    console.log("  - session.doorExpertMode:", session.doorExpertMode);
    console.log(
      "  - Will display menu?",
      session.user?.expert === false && !session.doorExpertMode
    );

    if (
      session.user?.expert === false &&
      !session.doorExpertMode /* TODO: || FORCE_MENUS check */
    ) {
      console.log("Displaying menu screen file");
      // Phase 8: Use authentic screen file system (express.e:28586 - await displayScreen(SCREEN_MENU))
      const screenDisplayed = await displayScreen(socket, session, SCREEN_MENU);

      // Like express.e:6572-6573 - check for .keys file and set cmdShortcuts accordingly
      if (screenDisplayed && hasKeysFile(SCREEN_MENU, session.currentConf)) {
        console.log(
          "✓ .keys file exists, enabling hotkey mode (cmdShortcuts = true)"
        );
        session.cmdShortcuts = true;
      } else {
        console.log(
          "No .keys file, using line input mode (cmdShortcuts = false)"
        );
      }
    }

    displayMenuPrompt(socket, session);

    // Reset menuPause after using it (prevents repeated pauses)
    session.menuPause = false;
  } else {
    console.log(
      "menuPause is FALSE, NOT displaying menu - staying in command mode"
    );
  }

  // Reset doorExpertMode after menu display (express.e:28588)
  session.doorExpertMode = false;

  // Like AmiExpress: Check cmdShortcuts to determine input mode (express.e:28598-28603)
  if (session.cmdShortcuts === false) {
    session.subState = LoggedOnSubState.READ_COMMAND;
  } else {
    session.subState = LoggedOnSubState.READ_SHORTCUTS;
  }
}

/**
 * Display menu prompt (displayMenuPrompt equivalent)
 */
export function displayMenuPrompt(socket: any, session: BBSSession) {
  console.log("📋 displayMenuPrompt called");
  console.log("  - bbsName:", config.get("bbsName"));
  console.log("  - currentConf:", session.currentConf);
  console.log("  - currentConfName:", session.currentConfName);
  console.log("  - relConfNum:", session.relConfNum);
  console.log("  - currentMsgBase:", session.currentMsgBase);
  console.log("  - timeRemaining:", session.timeRemaining);

  // Process queued OLM messages before showing prompt - express.e:1464-1473
  const { processOlmQueue } = require("../olm.handler");
  if (processOlmQueue) {
    processOlmQueue(socket, session);
  }

  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = config.get("bbsName");
  const timeLeft = Math.floor(session.timeRemaining);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(
    (mb) => mb.conferenceId === session.currentConf
  );
  const currentMsgBase = messageBases.find(
    (mb) => mb.id === session.currentMsgBase
  );

  console.log("  - msgBasesInConf.length:", msgBasesInConf.length);
  console.log("  - currentMsgBase found:", !!currentMsgBase);

  if (msgBasesInConf.length > 1 && currentMsgBase) {
    // Multiple message bases: show "ConfName - MsgBaseName"
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log("📋 Sending multi-msgbase prompt:", prompt);
    socket.emit("ansi-output", prompt);
  } else {
    // Single message base: just show conference name
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${session.currentConfName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log("📋 Sending single-msgbase prompt:", prompt);
    socket.emit("ansi-output", prompt);
  }

  console.log("📋 Setting subState to READ_COMMAND");
  session.subState = LoggedOnSubState.READ_COMMAND;
}

// Export dependency setters that will be called by core.ts
export function setMenuDependencies(deps: {
  db: any;
  config: any;
  conferences: any[];
  messageBases: any[];
  processOlmMessageQueue: any;
  SCREEN_MENU: string;
}) {
  db = deps.db;
  config = deps.config;
  conferences = deps.conferences;
  messageBases = deps.messageBases;
  processOlmMessageQueue = deps.processOlmMessageQueue;
  SCREEN_MENU = deps.SCREEN_MENU;
}
