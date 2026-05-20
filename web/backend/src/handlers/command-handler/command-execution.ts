import { BBSSession } from "../../index";
import { LoggedOnSubState } from "../../constants/bbs-states";
import { SysopDebugUtil, DebugSeverity } from "../../utils/sysop-debug.util";
import * as path from "path";
import * as fs from "fs";

// Dependencies (injected)
let db: any;
let conferences: any[] = [];
let fileAreas: any[] = [];
let doors: any[] = [];

// Import from other handlers - command implementations
import { displayScreen } from "../screen.handler";
import {
  displayConferenceBulletins,
  joinConference,
} from "../operations/conference.handler";
import { displayDoorMenu, executeDoor } from "../door.handler";
import { startSysopPage } from "../chat/chat.handler";
import {
  displayFileMaintenance,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface,
} from "../file/file.handler";
import { FileMaintenanceHandler } from "../file/file-maintenance.handler";
import {
  handleCFFlagSelectInput,
  handleCFConfSelectInput,
} from "../commands/advanced-commands.handler";
import {
  handleUserStatsCommand,
  handleJoinConferenceCommand,
  handleUploadCommand,
  handleDownloadCommand,
} from "../commands/user-commands.handler";
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
} from "../commands/system-commands.handler";
import { WebhookCommandsHandler } from "../commands/webhook-commands.handler";
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
} from "../commands/navigation-commands.handler";
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFlagInput,
  handleFileStatusCommand,
  handleReadBulletinCommand,
} from "../commands/display-file-commands.handler";
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  handlePageSysopCommand,
} from "../chat/preference-chat-commands.handler";
import { handleLiveChatCommand } from "../chat/chat-commands.handler";
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
} from "../commands/advanced-commands.handler";
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  handleJMInput,
  handleCMInput,
  handleCMNumericInput,
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
} from "../commands/info-commands.handler";
import {
  handleRelogonCommand,
  handleViewFileCommand,
  handleZippySearchCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
} from "../commands/utility-commands.handler";
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
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
} from "../commands/transfer-misc-commands.handler";
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  handleMessageReaderNav,
} from "../message/messaging.handler";

// Import utilities
import { AnsiUtil } from "../../utils/ansi.util";
import { validateFilename, checkForFile } from "../../utils/file-upload.util";

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

export function setConferences(confs: any[]) {
  conferences = confs;
}

export function setFileAreas(areas: any[]) {
  fileAreas = areas;
}

export function setDoors(doorsList: any[]) {
  doors = doorsList;
}

/**
 * Process BBS commands (processInternalCommand equivalent)
 */
export async function processBBSCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string = ""
) {
console.log(
    "processBBSCommand called with command:",
    JSON.stringify(command)
  );

  // Clear screen before showing command output (authentic BBS behavior)
console.log("Command processing: clearing screen for command output");
  socket.emit("ansi-output", "\x1b[2J\x1b[H");

  // Map commands to internalCommandX functions from AmiExpress
console.log("Entering switch statement for command:", command);
  switch (command) {
    case "D": // Download File(s) (internalCommandD) - express.e:24853-24857
      const { DownloadHandler } = require("../file/download.handler");
      await DownloadHandler.handleDownloadCommand(socket, session, params);
      return;

    case "DS": // Download with Status (internalCommandD with DS flag) - express.e:28302-28303
      await handleDownloadWithStatusCommand(socket, session, params);
      return;

    case "DB": // Download Batch - Download all flagged files
      const { BatchDownloadHandler } = require("../transfer/batch-download.handler");
      await BatchDownloadHandler.handleBatchDownload(socket, session);
      return;

    case "U": // Upload File(s) (internalCommandU) - express.e:25646-25658
      handleUploadCommand(socket, session);
      return;

    case "UP": // Upload Status / Node Uptime (internalCommandUP) - express.e:25667
      handleNodeUptimeCommand(socket, session);
      return;

    case "US": // Sysop Upload (internalCommandUS) - express.e:25660-25665
      handleSysopUploadCommand(socket, session, params);
      return;

    case "0": // Remote Shell (internalCommand0) - express.e:24424-24451
      handleRemoteShellCommand(socket, session);
      return;

    case "1": // Account Editing (internalCommand1) - express.e:24453-24459
      handleAccountEditingCommand(socket, session);
      return;

    case "2": // View Callers Log (internalCommand2) - express.e:24461-24509
      await handleCallersLogCommand(socket, session, params);
      return;

    case "3": // Edit Directory Files (internalCommand3) - express.e:24511-24515
      handleEditDirectoryFilesCommand(socket, session, params);
      return;

    case "4": // Edit Any File (internalCommand4) - express.e:24517-24521
      handleEditAnyFileCommand(socket, session, params);
      return;

    case "5": // Change Directory (internalCommand5) - express.e:24523-24527
      handleChangeDirectoryCommand(socket, session, params);
      return;

    case "MS": // Mail Scan (internalCommandMS) - express.e:25250-25279
      handleMailScanCommand(socket, session);
      return;

    case "OLM": // Online Message (internalCommandOLM) - express.e:25406-25503
      const { handleOlmCommand: handleOlm } = require("../transfer/olm.handler");
      await handleOlm(socket, session, params);
      return;

    case "LIVECHAT": // Modern Real-Time Internode Chat (Enhancement)
console.log("🔥 BEFORE calling handleLiveChatCommand, params:", params);
      try {
        await handleLiveChatCommand(socket, session, params);
console.log("✅ AFTER calling handleLiveChatCommand successfully");
      } catch (error) {
console.error("❌ ERROR in handleLiveChatCommand:", error);
        throw error;
      }
      return;

    case "ROOM": // Group Chat Rooms (Modern Enhancement)
      const { handleRoomCommand } = require("../room-commands.handler");
      await handleRoomCommand(socket, session, params);
      return;

    case "Q": // Quiet Mode / Block OLM (internalCommandQ) - express.e:25505-25515
      const { handleQuietCommand } = require("../transfer/olm.handler");
      await handleQuietCommand(socket, session);
      return;

    case "RL": // RELOGON (internalCommandRL) - express.e:25534-25539
      handleRelogonCommand(socket, session, params);
      return;

    case "RZ": // Zmodem Upload Command (internalCommandRZ) - express.e:25608-25621
      handleZmodemUploadCommand(socket, session);
      return;

    case "S": // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return;

    case "V": // View a Text File (internalCommandV) - express.e:25675-25687
      const { ViewFileHandler } = require("../content/view-file.handler");
      await ViewFileHandler.handleViewFileCommand(socket, session, params);
      return;

    case "VS": // View Statistics - Same as V command (internalCommandV) - express.e:28376
      const {
        ViewFileHandler: ViewFileHandler2,
      } = require("../content/view-file.handler");
      await ViewFileHandler2.handleViewFileCommand(socket, session, params);
      return;

    case "VO": // Voting Booth (internalCommandVO) - express.e:25700-25710
      await handleVotingBoothCommand(socket, session);
      return;

    case "VER": // View ami-express version information (internalCommandVER) - express.e:25688-25699
      handleVersionCommand(socket, session);
      return;

    case "W": // Write User Parameters (internalCommandW) - express.e:25712-25785
      handleWriteUserParamsCommand(socket, session);
      return;

    case "WHD": // Who's Online - Detailed (internalCommandWHD) - express.e:26104-26112
      handleWhoDetailedCommand(socket, session);
      return;

    case "X": // Expert Mode Toggle (internalCommandX) - express.e:26113-26122
      await handleExpertModeCommand(socket, session);
      return;

    case "Z": // Zippy Text Search (internalCommandZ) - express.e:26123-26213
      const { ZippySearchHandler } = require("../content/zippy-search.handler");
      await ZippySearchHandler.handleZippySearchCommand(
        socket,
        session,
        params
      );
      return;

    case "ZOOM": // Zoo Mail (internalCommandZOOM) - express.e:26215-26240
      await handleZoomCommand(socket, session);
      return;

    case "R": // Read Messages (internalCommandR) - express.e:25518-25531
      await handleReadMessagesFullCommand(socket, session, params);
      return;

    case "A": // Alter Flags (file flagging) (internalCommandA) - express.e:24601-24605
      await handleAlterFlagsCommand(socket, session, params);
      return;

    case "E": // Enter Message (internalCommandE) - express.e:24860-24872
      handleEnterMessageFullCommand(socket, session, params);
      return;

    case "<": // Previous Conference (internalCommandLT) - express.e:24529-24546
      await handlePreviousConferenceCommand(socket, session);
      return;

    case ">": // Next Conference (internalCommandGT) - express.e:24548-24564
      await handleNextConferenceCommand(socket, session);
      return;

    case "<<": // Previous Message Base (internalCommandLT2) - express.e:24566-24578
      await handlePreviousMessageBaseCommand(socket, session);
      return;

    case ">>": // Next Message Base (internalCommandGT2) - express.e:24580-24592
      await handleNextMessageBaseCommand(socket, session);
      return;

    case "J": // Join Conference (internalCommandJ) - express.e:25113-25183
      await handleJoinConferenceCommand(socket, session, params);
      return;

    case "JM": // Join Message Base (internalCommandJM) - express.e:25185-25238
      handleJoinMessageBaseCommand(socket, session, params);
      return;

    case "F": // File Listings (internalCommandF) - express.e:24877-24881
      await handleFileListCommand(socket, session, params);
      return;

    case "FR": // File Listings Raw (internalCommandFR) - express.e:24883-24887
      await handleFileListRawCommand(socket, session, params);
      return;

    case "FM": // File Maintenance (internalCommandFM) - express.e:24889-25045
      await FileMaintenanceHandler.handleFileMaintenanceCommand(
        socket,
        session,
        params
      );
      return;

    case "FS": // File Status (internalCommandFS) - express.e:24872-24875
      await handleFileStatusCommand(socket, session);
      return;

    case "N": // New Files (internalCommandN) - express.e:25275-25279
      await handleNewFilesCommand(socket, session, params);
      return;

    case "O": // Page Sysop (internalCommandO) - express.e:25372-25404
      handlePageSysopCommand(socket, session);
      return;

    case "T": // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return;

    case "B": // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, params);
      return;

    case "H": // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, params);
      return;

    case "M": // Toggle ANSI Color (internalCommandM) - express.e:25239-25248
      handleAnsiModeCommand(socket, session);
      return;

    case "NM": // Node Management (SYSOP) (internalCommandNM) - express.e:25281-25370
      handleNodeManagementCommand(socket, session);
      return;

    case "CM": // Conference Maintenance (SYSOP) (internalCommandCM) - express.e:24843-24852
      await handleConferenceMaintenanceCommand(socket, session);
      return;

    case "WEBHOOK": // Webhook Management (SYSOP) - Custom web command
      await WebhookCommandsHandler.handleWebhookCommand(socket, session);
      return;

    case "G": // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, params);
      return;

    case "GR": // Greetings (internalCommandGreets) - express.e:24411-24423
      handleGreetingsCommand(socket, session);
      return;

    case "C": // Comment to Sysop (internalCommandC) - express.e:24658-24670
      handleCommentToSysopCommand(socket, session, params);
      return;

    case "CF": // Conference Flags (internalCommandCF) - express.e:24672-24841
      await handleConferenceFlagsCommand(socket, session);
      return;

    // (Removed audit B-5) — duplicate `case "Q"` formerly at this line
    // was unreachable dead code: switch dispatch already takes the first
    // match at line 253 (handleQuietCommand from transfer/olm.handler,
    // which is the express.e:25505-25515 1:1 implementation). The
    // duplicate routed to a stale handleQuietModeCommand alias.

    case "?": // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      await handleQuestionMarkCommand(socket, session);
      return;

    case "^": // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089-25111
      handleHelpFilesCommand(socket, session, params);
      return;

    // === CUSTOM WEB COMMANDS (Not in express.e) ===
    case "DOOR":
    case "DOORS": // Door Games Menu - lists doors with arrow key navigation
      await displayDoorMenu(socket, session, params);
      return;

    case "DOORMAN": {
      // Door Manager plugin - for installing/managing doors
      try {
console.log("[DOORMAN] Starting Door Manager...");
        const {
          executeDoor: executeDoorDoorManager,
        } = require("../doors/DoorManager");
console.log("[DOORMAN] Module imported successfully");
        await executeDoorDoorManager(socket, session);
console.log("[DOORMAN] executeDoor completed");
      } catch (error) {
console.error("[DOORMAN] Fatal error:", error);
        socket.emit(
          "ansi-output",
          "\r\n\x1b[31mError starting Door Manager:\x1b[0m\r\n"
        );
        socket.emit("ansi-output", `${(error as Error).message}\r\n`);
        socket.emit("ansi-output", `${(error as Error).stack}\r\n\r\n`);
        socket.emit(
          "ansi-output",
          "Press any key to return to main menu...\r\n"
        );

        // Clean up session state
        if (session.inDoorManager) {
          delete session.inDoorManager;
        }
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return;
    }

    case "GA": {
      // GetAnswer - Test simple Amiga door (8KB XIM door)
      try {
console.log("[GA] Starting GetAnswer door...");
        const {
          AmigaDoorSession,
        } = require("../amiga-emulation/AmigaDoorSession");
        // Door path is relative to project root, not backend directory
        const doorPath = path.join(
          process.cwd(),
          "../../doors/GetAnswer/GetAnswer"
        );

console.log(`[GA] Door path: ${doorPath}`);

        if (!fs.existsSync(doorPath)) {
          socket.emit(
            "ansi-output",
            "\r\n\x1b[31mGetAnswer door not found!\x1b[0m\r\n"
          );
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          session.menuPause = false;
          return;
        }

        socket.emit(
          "ansi-output",
          "\r\n\x1b[36m🚀 Starting GetAnswer (8KB XIM door)...\x1b[0m\r\n\r\n"
        );

        const amigaSession = new AmigaDoorSession(socket, {
          executablePath: doorPath,
          timeout: 600,
        });

        await amigaSession.start();

        socket.emit(
          "ansi-output",
          "\r\n\x1b[32mGetAnswer door session completed.\x1b[0m\r\n"
        );
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      } catch (error) {
console.error("[GA] Fatal error:", error);
        socket.emit(
          "ansi-output",
          "\r\n\x1b[31mError starting GetAnswer door:\x1b[0m\r\n"
        );
        socket.emit("ansi-output", `${(error as Error).message}\r\n`);
        socket.emit("ansi-output", `${(error as Error).stack}\r\n\r\n`);
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return;
    }

    default:
      // NOTE: BVDBG test hook removed - door-specific hack with hardcoded path
      // Doors should use .info file registration and proper door system

      // Check if command matches a door (BBSCMD)
console.log(`[Command Handler] Checking for door match: "${command}"`);
console.log(`[Command Handler] Available doors: ${doors.length}`);
      if (doors.length > 0) {
console.log(
          `[Command Handler] Sample door commands: ${doors
            .slice(0, 5)
            .map((d) => d.command)
            .join(", ")}`
        );
      }

      const matchingDoor = doors.find(
        (door) => door.command.toLowerCase() === command.toLowerCase()
      );

      if (matchingDoor) {
        // Execute the door
console.log(
          `[Command Handler] Found matching door: ${matchingDoor.name}`
        );
        await executeDoor(socket, session, matchingDoor);
        return;
      }

      // No matching door - unknown command
console.log(`[Command Handler] No matching door found for: ${command}`);
      // express.e:28397 — aePuts('\b\nNo such command!!  Use ''?'' for command list.\b\n\b\n')
      // (\b\n = \r\n in express.e E language)
      socket.emit("ansi-output", `\r\nNo such command!!  Use '?' for command list.\r\n\r\n`);

      // Sysop debug message (appears after "Unknown command" and before "Press any key")
console.log('>>> ABOUT TO CALL SysopDebugUtil.debug()');
      SysopDebugUtil.debug(
        socket,
        session,
        'COMMAND',
        `Command not found: ${command}`,
        { attemptedCommand: command },
        DebugSeverity.INFO
      );

      socket.emit(
        "ansi-output",
        "\r\n\x1b[32mPress any key to continue...\x1b[0m"
      );
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      break;
  }
}
