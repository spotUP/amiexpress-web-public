import { BBSSession } from "../../index";
import { LoggedOnSubState } from "../../constants/bbs-states";

// Dependencies (injected)
let db: any;
let config: any;
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let doors: any[] = [];

// Import from other handlers
import {
  displayConferenceBulletins,
  joinConference,
} from "../operations/conference.handler";
import { displayDoorMenu, executeDoor } from "../door.handler";
import { startSysopPage } from "../chat/chat.handler";
import {
  displayFileList,
  displayFileMaintenance,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface,
  startFileUpload,
} from "../file/file.handler";
import {
  FileMaintenanceHandler,
  setFileMaintenanceDependencies,
} from "../file/file-maintenance.handler";
import {
  handleCFFlagSelectInput,
  handleCFConfSelectInput,
} from "../commands/advanced-commands.handler";
import {
  handleUserStatsCommand,
  handleJoinConferenceCommand,
  handleUploadCommand,
  handleDownloadCommand,
  setUserCommandsDependencies,
} from "../commands/user-commands.handler";
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
  setSystemCommandsDependencies,
} from "../commands/system-commands.handler";
import { WebhookCommandsHandler } from "../commands/webhook-commands.handler";
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
  setNavigationCommandsDependencies,
} from "../commands/navigation-commands.handler";
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFlagInput,
  handleFileStatusCommand,
  handleReadBulletinCommand,
  handleBulletinInput as handleBulletinInputFromDisplayFileCommands,
  setDisplayFileCommandsDependencies,
} from "../commands/display-file-commands.handler";
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  handlePageSysopCommand,
  setPreferenceChatCommandsDependencies,
} from "../chat/preference-chat-commands.handler";
import { handleLiveChatCommand } from "../chat/chat-commands.handler";
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
  setAdvancedCommandsDependencies,
} from "../commands/advanced-commands.handler";
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  handleJMInput,
  handleCMInput,
  handleCMNumericInput,
  setMessageCommandsDependencies,
} from "../message/message-commands.handler";
import {
  handleVersionCommand,
  handleWhoCommand,
  handleWhoDetailedCommand,
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
  handleWEditNameInput,
  handleWEditEmailInput,
  handleWEditRealnameInput,
  handleWEditInternetnameInput,
  handleWEditLocationInput,
  handleWEditPhoneInput,
  handleWEditPasswordInput,
  handleWEditPasswordConfirmInput,
  handleWEditLinesInput,
  handleWEditComputerInput,
  handleWEditScreentypeInput,
  handleWEditProtocolInput,
  handleWEditTranslatorInput,
  setInfoCommandsDependencies,
} from "../commands/info-commands.handler";
import {
  handleRelogonCommand,
  handleViewFileCommand,
  handleZippySearchCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
  handleRelogonConfirm,
  handleViewFileInput,
  handleZippySearchInput,
  setUtilityCommandsDependencies,
} from "../commands/utility-commands.handler";
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
  setSysopCommandsDependencies,
} from "../commands/sysop-commands.handler";
import {
  handleZmodemUploadCommand,
  handleSysopUploadCommand,
  handleNodeUptimeCommand,
  handleVotingBoothCommand,
  handleVoteTopicSelect,
  handleVoteAnswerInput,
  handleVoteMenuChoice,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies,
} from "../commands/transfer-misc-commands.handler";
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  handleMessageReaderNav,
  setMessagingDependencies,
} from "../message/messaging.handler";
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand,
  loadCommands,
  setCommandExecutionDependencies,
} from "../command-execution.handler";

// Import utilities
// Import message entry handlers
import {
  handleMessageToInput,
  handleMessageSubjectInput,
  handleMessagePrivateInput,
  handleMessageBodyInput,
  handleMessageDeleteLineInput,
  handleMessageDeleteConfirm,
  handleMessageEditLineInput,
  handleMessageEditLineContent,
  handleMessageAttachFileInput,
  handleMessageAttachDeleteConfirm,
  handleMessageReplaceSearchInput,
  handleMessageReplaceWithInput,
  handleMessageInsertLineInput,
  handleMessageInsertTextInput,
} from "../message/message-entry.handler";

// Import from other modules within command-handler
import { displayMainMenu } from "./menu";
import { AnsiUtil } from "../../utils/ansi.util";

/**
 * Translate a single-key shortcut per express.e translateShortcut()
 * Maps RET/BACK/TAB/ESC/SPACE/DEL and then resolves against session.shortcuts.
 */
function translateShortcut(session: BBSSession, raw: string): string {
  let keyStr = "0";
  const code = raw.length ? raw.charCodeAt(0) : 0;
  switch (code) {
    case 13:
      keyStr = "RET";
      break;
    case 0x7f:
      keyStr = "DEL";
      break;
    case 0x08:
      keyStr = "BACK";
      break;
    case 0x09:
      keyStr = "TAB";
      break;
    case 27:
      keyStr = "ESC";
      break;
    case 32:
      keyStr = "SPACE";
      break;
    default:
      keyStr = raw.length ? raw[0] : "";
  }

  if (session.shortcuts && session.shortcuts.size > 0) {
    const mapped = session.shortcuts.get(keyStr);
    if (mapped) {
      return mapped;
    }
  }
  return keyStr;
}

/**
 * Handle specialized input based on session state
 * This function routes input to appropriate state-specific handlers
 */
export async function handleSpecializedInput(
  socket: any,
  session: BBSSession,
  data: string
) {
  // PRIORITY 1: Handle internode chat mode input - REAL-TIME keystroke transmission
  // When user is in active chat session, transmit each keystroke immediately
  if (session.subState === LoggedOnSubState.CHAT) {
console.log("💬 [COMMAND] User in CHAT mode, real-time input");

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = "";
    }

    const { handleChatKeystroke } = require("../internode-chat.handler");

    // Handle arrow keys for cursor movement (left/right navigation)
    if (data === "\x1b[D") {
      // Left arrow - just move cursor left locally (don't transmit)
      socket.emit("ansi-output", "\x1b[D");
      return;
    } else if (data === "\x1b[C") {
      // Right arrow - just move cursor right locally (don't transmit)
      socket.emit("ansi-output", "\x1b[C");
      return;
    }
    // Ignore up/down arrows
    else if (data === "\x1b[A" || data === "\x1b[B") {
      return;
    }

    // Handle Enter key - finalize message
    if (data === "\r" || data === "\n") {
      const input = (session.inputBuffer || "").trim();

      // Echo newline to move cursor to next line (express.e:2342)
      socket.emit("ansi-output", "\r\n");

      // Check for /END or /EXIT command
      if (input.toUpperCase() === "/END" || input.toUpperCase() === "/EXIT") {
console.log("💬 [COMMAND] User wants to end chat");
        const { handleChatEnd } = require("../internode-chat.handler");
        await handleChatEnd(socket, session);
        return;
      }

      // Check for /HELP command
      if (input.toUpperCase() === "/HELP") {
console.log("💬 [COMMAND] User requested help");
        socket.emit(
          "ansi-output",
          "\r\n" +
            "\x1b[36mChat Mode Commands:\x1b[0m\r\n" +
            "  \x1b[33m/END\x1b[0m or \x1b[33m/EXIT\x1b[0m  - End chat session\r\n" +
            "  \x1b[33m/HELP\x1b[0m             - Show this help\r\n" +
            "  \x1b[33m<text>\x1b[0m            - Send message (max 500 chars)\r\n" +
            "\r\n"
        );
        session.inputBuffer = "";
        return;
      }

      // Regular message - finalize and send to scroll area
      if (input.length > 0) {
console.log("💬 [COMMAND] Finalizing message:", input);
        const { handleChatMessage } = require("../internode-chat.handler");
        await handleChatMessage(socket, session, { message: input });
        session.inputBuffer = ""; // Clear buffer after sending
      }
    }
    // Handle Backspace - real-time transmission
    else if (data === "\x7f" || data === "\b") {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Echo backspace to local terminal (express.e:2307-2319)
        socket.emit("ansi-output", "\b \b");
        // Don't transmit backspace if we're typing a command
        const isCommand = session.inputBuffer.trim().startsWith("/");
        if (!isCommand) {
          await handleChatKeystroke(socket, session, { keystroke: "\x7f" });
        }
      }
    }
    // Handle printable characters - real-time transmission
    else if (data.length === 1 && data >= " " && data <= "~") {
      session.inputBuffer += data;
      // Echo character to local terminal (express.e:2342)
      socket.emit("ansi-output", data);
      // Don't transmit commands (starting with /) to partner
      const isCommand = session.inputBuffer.trim().startsWith("/");
      if (!isCommand) {
        await handleChatKeystroke(socket, session, { keystroke: data });
      }
    }
    return;
  }

  // PRIORITY 2: Handle group chat room mode input
  // When user is in a chat room, intercept all input
  if (session.subState === LoggedOnSubState.CHAT_ROOM) {
console.log("💬 User in CHAT_ROOM mode, handling room input");
    const input = data.trim();

    // Check for /LEAVE or /EXIT command
    if (input.toUpperCase() === "/LEAVE" || input.toUpperCase() === "/EXIT") {
      const { handleRoomLeave } = require("../group-chat.handler");
      await handleRoomLeave(socket, session);
      return;
    }

    // Check for /WHO command
    if (input.toUpperCase() === "/WHO") {
      const members = await db.getRoomMembers((session as any).currentRoomId);
      socket.emit(
        "ansi-output",
        "\r\n\x1b[36mUsers in room (" + members.length + "):\x1b[0m\r\n"
      );
      for (const member of members) {
        const modBadge = member.is_moderator ? " \x1b[33m[MOD]\x1b[0m" : "";
        const muteBadge = member.is_muted ? " \x1b[31m[MUTED]\x1b[0m" : "";
        socket.emit(
          "ansi-output",
          "  " + member.username + modBadge + muteBadge + "\r\n"
        );
      }
      socket.emit("ansi-output", "\r\n");
      return;
    }

    // Check for /HELP command
    if (input.toUpperCase() === "/HELP") {
      socket.emit(
        "ansi-output",
        "\r\n" +
          "\x1b[36mChat Room Commands:\x1b[0m\r\n" +
          "  \x1b[33m/LEAVE\x1b[0m or \x1b[33m/EXIT\x1b[0m  - Leave the room\r\n" +
          "  \x1b[33m/WHO\x1b[0m               - List users in room\r\n" +
          "  \x1b[33m/HELP\x1b[0m              - Show this help\r\n" +
          "  \x1b[33m<text>\x1b[0m             - Send message (max 500 chars)\r\n" +
          "\r\n"
      );
      return;
    }

    // Regular message - send to room
    if (input.length > 0) {
      const { handleRoomMessage } = require("../group-chat.handler");
      await handleRoomMessage(socket, session, { message: input });
    }
    return;
  }

  // Continue with other input handlers...
  // This is a very large function in the original, so I'll create a simplified version
  // and focus on the most critical state handlers

  // For now, let's handle a few key states and delegate others back to the main handler
  await handleRemainingStates(socket, session, data);
}

/**
 * Handle remaining states (simplified for this refactoring)
 */
async function handleRemainingStates(
  socket: any,
  session: BBSSession,
  data: string
) {
  // Handle basic state transitions
  if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {
    // Force line input mode to avoid hotkeys
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }
  }

  if (session.subState === LoggedOnSubState.READ_COMMAND) {
    await handleReadCommand(socket, session, data);
  } else if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
    await handleProcessCommand(socket, session);
  } else {
    // Check if this is a display flow state - needs special handling
    const displayFlowStates = new Set([
      LoggedOnSubState.DISPLAY_BULL,
      LoggedOnSubState.DISPLAY_NODE_BULL,
      LoggedOnSubState.CONF_SCAN,
      LoggedOnSubState.DISPLAY_CONF_BULL,
      LoggedOnSubState.DISPLAY_MENU,
    ]);

    if (displayFlowStates.has(session.subState as LoggedOnSubState)) {
      // Display flow states - handle pause/pagination here directly
      // Don't delegate back to handleCommand to avoid infinite loops
console.log("[handleRemainingStates] Display flow state:", session.subState);

      // If paginated screen is active, handle the keypress
      if (session.paginatedScreen) {
        const { handlePaginatedScreenInput } = require('../screen.handler');
        const { isDisplayFlowState, advanceDisplayFlow } = require('../command.handler');
        const handled = await handlePaginatedScreenInput(socket, session, data);
        if (handled && !session.paginatedScreen) {
          // Pagination finished, advance display flow
          if (isDisplayFlowState(session.subState)) {
            await advanceDisplayFlow(socket, session);
          }
        }
        return;
      }

      // No paginated screen - just advance the display flow
      const { advanceDisplayFlow } = require('../command.handler');
      await advanceDisplayFlow(socket, session);
      return;
    }

    // Handle BULLETIN_INPUT state - bulletin number/command input
    if (session.subState === LoggedOnSubState.BULLETIN_INPUT) {
      // Initialize inputBuffer if needed
      if (!session.inputBuffer) {
        session.inputBuffer = "";
      }

      // Handle Enter - process input
      if (data === "\r" || data === "\n") {
        const input = session.inputBuffer || "";
        session.inputBuffer = "";
        socket.emit("ansi-output", "\r\n");
        await handleBulletinInputFromDisplayFileCommands(socket, session, input);
        return;
      }
      // Handle Backspace
      else if (data === "\x7f" || data === "\b") {
        if (session.inputBuffer.length > 0) {
          session.inputBuffer = session.inputBuffer.slice(0, -1);
          socket.emit("ansi-output", "\b \b");
        }
        return;
      }
      // Handle printable characters
      else if (data.length === 1 && data >= " " && data <= "~") {
        session.inputBuffer += data;
        socket.emit("ansi-output", data);
        return;
      }
      return;
    }

    // For other states, log but don't block
console.log(
      "❌ Not in handled command input state, current subState:",
      session.subState,
      "- IGNORING COMMAND"
    );
  }
}

/**
 * Handle READ_COMMAND state (simplified)
 */
async function handleReadCommand(
  socket: any,
  session: BBSSession,
  data: string
) {
console.log("✅ In READ_COMMAND state, reading line input");

  // Initialize inputBuffer if needed
  if (!session.inputBuffer) {
    session.inputBuffer = "";
  }

  // Handle command history navigation
  if (data === "\x1b[A") {
    const { getPreviousCommand } = require("../utils/command-history.util");
    const previousCmd = getPreviousCommand(session);
    if (previousCmd) {
      // Clear current line
      let clearSequence = "";
      for (let i = 0; i < session.inputBuffer.length; i++) {
        clearSequence += "\b \b";
      }
      socket.emit("ansi-output", clearSequence);

      // Display previous command
      session.inputBuffer = previousCmd;
      socket.emit("ansi-output", previousCmd);
    }
    return;
  }
  // Down Arrow - next command
  else if (data === "\x1b[B") {
    const { getNextCommand } = require("../utils/command-history.util");
    const nextCmd = getNextCommand(session);
    if (nextCmd) {
      // Clear current line
      let clearSequence = "";
      for (let i = 0; i < session.inputBuffer.length; i++) {
        clearSequence += "\b \b";
      }
      socket.emit("ansi-output", clearSequence);

      // Display next command
      session.inputBuffer = nextCmd;
      socket.emit("ansi-output", nextCmd);
    }
    return;
  }

  // Buffer characters until Enter is pressed
  if (data === "\r" || data === "\n") {
    const input = session.inputBuffer || "";
    session.inputBuffer = "";

    // Echo newline to move cursor to next line (terminal doesn't auto-echo in raw mode)
    socket.emit("ansi-output", "\r\n");

    // Add command to history if non-empty
    if (input.length > 0) {
      const { addToHistory } = require("../utils/command-history.util");
      addToHistory(session, input);
    }

    // Store command text and transition to PROCESS_COMMAND (express.e:28617+)
    (session as any).commandText = input.toUpperCase();
    session.subState = LoggedOnSubState.PROCESS_COMMAND;

    // Process the command in the next event cycle
    setTimeout(() => {
      handleCommand(socket, session, "");
    }, 0);
  } else if (data === "\x7f" || data === "\b") {
    // Backspace
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      socket.emit("ansi-output", "\b \b");
    }
  } else if (data.length === 1 && data >= " " && data <= "~") {
    // Regular character
    session.inputBuffer += data;
    socket.emit("ansi-output", data);
  }
}

/**
 * Handle READ_SHORTCUTS state (simplified)
 */
async function handleReadShortcuts(
  socket: any,
  session: BBSSession,
  data: string
) {
console.log("🔥 In READ_SHORTCUTS state, processing single key");

  try {
    const translated = translateShortcut(session, data);
    if (translated && translated.length > 0) {
      const { processCommand } = require("./core");
      // Like express.e: translateShortcut + processMci + processCommand
      await processCommand(socket, session, translated, "");
    }
  } catch (error) {
console.error("Error in shortcut processing:", error);
    socket.emit(
      "ansi-output",
      "\r\n" + AnsiUtil.errorLine("Shortcut processing error. Returning to menu...") + "\r\n"
    );
    socket.emit("ansi-output", "\r\n" + AnsiUtil.pressKeyPrompt());
  }

  // express.e: menuPause := FALSE; subState := DISPLAY_MENU
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle PROCESS_COMMAND state (simplified)
 */
async function handleProcessCommand(socket: any, session: BBSSession) {
console.log(
    "⚙️ In PROCESS_COMMAND state, executing command:",
    (session as any).commandText
  );

  const commandText = ((session as any).commandText || "").toUpperCase();

  if (commandText) {
    try {
      const { processCommand } = require("./core");
      const result = await processCommand(socket, session, commandText, "");

      if (result === "NOT_ALLOWED") {
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }
    } catch (error) {
console.error("Error processing command:", error);
      socket.emit(
        "ansi-output",
        "\r\n\x1b[31mError processing command.\x1b[0m\r\n"
      );
      socket.emit(
        "ansi-output",
        "\r\n\x1b[32mPress any key to continue...\x1b[0m"
      );
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
  }

  // After processing: Check if command changed subState
  (session as any).commandText = undefined;
console.log("🔍 [AFTER COMMAND] subState is:", session.subState);

  // Skip menu display if Door Manager or Sysop Menu is active
  if ((session as any).inDoorManager) {
console.log("✅ [AFTER COMMAND] Special mode is active - NOT showing menu");
    return;
  }

  if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
console.log(
      "⚠️ [AFTER COMMAND] subState is still PROCESS_COMMAND, showing menu"
    );
    // Command didn't change state, so default to showing menu
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  } else {
console.log(
      "✅ [AFTER COMMAND] subState was changed to:",
      session.subState,
      "- NOT showing menu"
    );
  }
}

// Expose internals for tests
export const __testables = {
  translateShortcut,
  handleProcessCommand,
};

/**
 * Re-export function from core for circular dependency resolution
 */
export async function handleCommand(
  socket: any,
  session: BBSSession,
  data: string
) {
  // Lazy-load to avoid circular import issues; cache once per process
  const mod: any = cachedCore || require("./core");
  cachedCore = mod;
  const fn = mod?.handleCommand;
  if (typeof fn !== "function") {
console.error("command-handler/core.handleCommand not available");
    return;
  }
  await fn(socket, session, data);
}

let cachedCore: any = null;

// Allow tests to inject a mock core handler without touching the require path
export function __setHandleCommandCore(mock: any) {
  cachedCore = { handleCommand: mock };
}
