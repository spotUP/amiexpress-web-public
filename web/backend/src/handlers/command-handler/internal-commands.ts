/**
 * Internal Commands Router
 * Maps command codes to handler functions
 * Based on express.e:24411-28227 (internalCommand* functions)
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { executeDoor } from '../door.handler';
import { getDoors } from './dependency-injection';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import * as path from 'path';
import * as fs from 'fs';

// Import all command handlers
import {
  handleUploadCommand,
  setUserCommandsDependencies
} from '../commands/user-commands.handler';
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
  setSystemCommandsDependencies
} from '../commands/system-commands.handler';
import { WebhookCommandsHandler } from '../commands/webhook-commands.handler';
import { handlePageSysopCommand } from './page-sysop-command';
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
  setNavigationCommandsDependencies
} from '../commands/navigation-commands.handler';
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFileStatusCommand,
  handleReadBulletinCommand,
  setDisplayFileCommandsDependencies
} from '../commands/display-file-commands.handler';
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  setPreferenceChatCommandsDependencies
} from '../chat/preference-chat-commands.handler';
import {
  handleLiveChatCommand
} from '../chat/chat-commands.handler';
// NOTE: commandCache must be accessed via require() at call time, not via static import.
// tsx can create dual ESM/CJS module instances, causing the static import to reference
// a different (empty) commandCache than the one populated by loadCommands().
// See: https://github.com/privatenumber/tsx/issues/354
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
  setAdvancedCommandsDependencies
} from '../commands/advanced-commands.handler';
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  setMessageCommandsDependencies
} from '../message/message-commands.handler';
import {
  handleVersionCommand,
  handleWhoDetailedCommand,
  handleWriteUserParamsCommand,
  setInfoCommandsDependencies
} from '../commands/info-commands.handler';
import {
  handleRelogonCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
  setUtilityCommandsDependencies
} from '../commands/utility-commands.handler';
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
  setSysopCommandsDependencies
} from '../commands/sysop-commands.handler';
import {
  handleZmodemUploadCommand,
  handleSysopUploadCommand,
  handleNodeUptimeCommand,
  handleVotingBoothCommand,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies
} from '../commands/transfer-misc-commands.handler';
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  setMessagingDependencies
} from '../message/messaging.handler';
import { FileMaintenanceHandler } from '../file/file-maintenance.handler';
import { handleJoinConferenceCommand } from '../commands/user-commands.handler';
import { displayDoorMenu } from '../door.handler';
import { handleUserStatsCommand } from '../commands/user-commands.handler';

// Result codes from express.e
const RESULT_SUCCESS = 0;
const RESULT_FAILURE = -1;

/**
 * Process internal BBS commands (express.e:24411-28227)
 * Maps commands to internalCommandX functions from AmiExpress
 *
 * @returns RESULT_SUCCESS if command was handled, RESULT_FAILURE if not recognized
 */
export async function processBBSCommand(socket: any, session: BBSSession, command: string, params: string = ''): Promise<number> {
  // FIX: Prioritize external BBS commands (doors) over internal hardcoded commands.
  // If a command exists in the BBSCMD cache, it's a door and should always run.
  // Access commandCache via require() to avoid tsx ESM/CJS dual-instance issue.
  const { commandCache } = require('../command-execution.handler');
console.log(`[InternalRouter] Checking bbscmd cache for '${command}': has=${commandCache.bbscmd.has(command)}, cacheSize=${commandCache.bbscmd.size}, keys=${[...commandCache.bbscmd.keys()].slice(0,5).join(',')}`);
  if (commandCache.bbscmd.has(command)) {
console.log(`[InternalRouter] Overriding internal command '${command}' with external BBSCMD door.`);
    const { runBbsCommand } = require('../command-execution.handler');
    return runBbsCommand(socket, session, command, params);
  }

  const doors = getDoors();

  // Map commands to internalCommandX functions from AmiExpress
  switch (command) {
    case 'D': // Download File(s) (internalCommandD) - express.e:24853-24857
      const { DownloadHandler } = require('../file/download.handler');
      await DownloadHandler.handleDownloadCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302
      handleDownloadWithStatusCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'DB': // Download Batch - Download all flagged files
      const { BatchDownloadHandler } = require('../transfer/batch-download.handler');
      await BatchDownloadHandler.handleBatchDownload(socket, session);
      return RESULT_SUCCESS;

    case 'U': // Upload File(s) (internalCommandU) - express.e:25646-25658
      handleUploadCommand(socket, session);
      return RESULT_SUCCESS;

    case 'UP': // Upload Status / Node Uptime (internalCommandUP) - express.e:25667
      handleNodeUptimeCommand(socket, session);
      return RESULT_SUCCESS;

    case 'US': // Sysop Upload (internalCommandUS) - express.e:25660-25665
      handleSysopUploadCommand(socket, session, params);
      return RESULT_SUCCESS;

    case '0': // Remote Shell (internalCommand0) - express.e:24424-24451
      handleRemoteShellCommand(socket, session);
      return RESULT_SUCCESS;

    case '1': // Account Editing (internalCommand1) - express.e:24453-24459
      handleAccountEditingCommand(socket, session);
      return RESULT_SUCCESS;

    case '2': // View Callers Log (internalCommand2) - express.e:24461-24509
      await handleCallersLogCommand(socket, session, params);
      return RESULT_SUCCESS;

    case '3': // Edit Directory Files (internalCommand3) - express.e:24511-24515
      handleEditDirectoryFilesCommand(socket, session, params);
      return RESULT_SUCCESS;

    case '4': // Edit Any File (internalCommand4) - express.e:24517-24521
      handleEditAnyFileCommand(socket, session, params);
      return RESULT_SUCCESS;

    case '5': // Change Directory (internalCommand5) - express.e:24523-24527
      handleChangeDirectoryCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'MS': // Mail Scan (internalCommandMS) - express.e:25250-25279
      handleMailScanCommand(socket, session);
      return RESULT_SUCCESS;

    case 'O': // Page Sysop (internalCommandO) - express.e:25372-25405
      await handlePageSysopCommand(socket, session, socket.server);
      return RESULT_SUCCESS;

    case 'OLM': // Online Message (internalCommandOLM) - express.e:25406-25503
      const { handleOlmCommand: handleOlm } = require('../transfer/olm.handler');
      await handleOlm(socket, session, params);
      return RESULT_SUCCESS;

    case 'LIVECHAT': // Modern Real-Time Internode Chat (Enhancement)
console.log('[BEFORE] calling handleLiveChatCommand, params:', params);
      try {
        await handleLiveChatCommand(socket, session, params);
console.log('[OK] AFTER calling handleLiveChatCommand successfully');
      } catch (error) {
console.error('[ERROR] in handleLiveChatCommand:', error);
        throw error;
      }
      return RESULT_SUCCESS;

    case 'ROOM': // Group Chat Rooms (Modern Enhancement)
      const { handleRoomCommand } = require('../room-commands.handler');
      await handleRoomCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'Q': // Quiet Mode / Block OLM (internalCommandQ) - express.e:25505-25515
      const { handleQuietCommand } = require('../transfer/olm.handler');
      await handleQuietCommand(socket, session);
      return RESULT_SUCCESS;

    case 'RL': // RELOGON (internalCommandRL) - express.e:25534-25539
      handleRelogonCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'RZ': // Zmodem Upload Command (internalCommandRZ) - express.e:25608-25621
      handleZmodemUploadCommand(socket, session);
      return RESULT_SUCCESS;

    case 'S': // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return RESULT_SUCCESS;

    case 'V': // View a Text File (internalCommandV) - express.e:25675-25687
      const { ViewFileHandler } = require('../content/view-file.handler');
      await ViewFileHandler.handleViewFileCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      const { ViewFileHandler: ViewFileHandler2 } = require('../content/view-file.handler');
      await ViewFileHandler2.handleViewFileCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'VO': // Voting Booth (internalCommandVO) - express.e:25700-25710
      await handleVotingBoothCommand(socket, session);
      return RESULT_SUCCESS;

    case 'VER': // View ami-express version information (internalCommandVER) - express.e:25688-25699
      handleVersionCommand(socket, session);
      return RESULT_SUCCESS;

    case 'W': // Write User Parameters (internalCommandW) - express.e:25712-25785
      handleWriteUserParamsCommand(socket, session);
      return RESULT_SUCCESS;

    case 'WHO': // Who's Online (internalCommandWHO) - express.e:26094-26103
      const { handleWhoCommand } = require('../commands/info-commands.handler');
      handleWhoCommand(socket, session);
      return RESULT_SUCCESS;

    case 'WHD': // Who's Online - Detailed (internalCommandWHD) - express.e:26104-26112
      handleWhoDetailedCommand(socket, session);
      return RESULT_SUCCESS;

    case 'X': // Expert Mode Toggle (internalCommandX) - express.e:26113-26122
      await handleExpertModeCommand(socket, session);
      return RESULT_SUCCESS;

    case 'Z': // Zippy Text Search (internalCommandZ) - express.e:26123-26213
      const { ZippySearchHandler } = require('../zippy-search.handler');
      await ZippySearchHandler.handleZippySearchCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'ZOOM': // Zoo Mail (internalCommandZOOM) - express.e:26215-26240
      await handleZoomCommand(socket, session);
      return RESULT_SUCCESS;

    case 'R': // Read Messages (internalCommandR) - express.e:25518-25531
      await handleReadMessagesFullCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'A': // Alter Flags (file flagging) (internalCommandA) - express.e:24601-24605
      await handleAlterFlagsCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'E': // Enter Message (internalCommandE) - express.e:24860-24872
      handleEnterMessageFullCommand(socket, session, params);
      return RESULT_SUCCESS;

    case '<': // Previous Conference (internalCommandLT) - express.e:24529-24546
      await handlePreviousConferenceCommand(socket, session);
      return RESULT_SUCCESS;

    case '>': // Next Conference (internalCommandGT) - express.e:24548-24564
      await handleNextConferenceCommand(socket, session);
      return RESULT_SUCCESS;

    case '<<': // Previous Message Base (internalCommandLT2) - express.e:24566-24578
      await handlePreviousMessageBaseCommand(socket, session);
      return RESULT_SUCCESS;

    case '>>': // Next Message Base (internalCommandGT2) - express.e:24580-24592
      await handleNextMessageBaseCommand(socket, session);
      return RESULT_SUCCESS;

    case 'J': // Join Conference (internalCommandJ) - express.e:25113-25183
      await handleJoinConferenceCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'JM': // Join Message Base (internalCommandJM) - express.e:25185-25238
      handleJoinMessageBaseCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'F': // File Listings (internalCommandF) - express.e:24877-24881
      await handleFileListCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'FR': // File Listings Reverse (internalCommandFR) - express.e:24883-24887
      await handleFileListRawCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'FM': // File Maintenance (internalCommandFM) - express.e:24889-25045
      await FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'FS': // File Status (internalCommandFS) - express.e:24872-24875
      await handleFileStatusCommand(socket, session);
      return RESULT_SUCCESS;

    case 'N': // New Files (internalCommandN) - express.e:25275-25279
      await handleNewFilesCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'T': // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return RESULT_SUCCESS;

    case 'B': // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'H': // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'M': // Toggle ANSI Color (internalCommandM) - express.e:25239-25248
      handleAnsiModeCommand(socket, session);
      return RESULT_SUCCESS;

    case 'NM': // Node Management (SYSOP) (internalCommandNM) - express.e:25281-25370
      handleNodeManagementCommand(socket, session);
      return RESULT_SUCCESS;

    case 'CM': // Conference Maintenance (SYSOP) (internalCommandCM) - express.e:24843-24852
      await handleConferenceMaintenanceCommand(socket, session);
      return RESULT_SUCCESS;

    case 'WEBHOOK': // Webhook Management (SYSOP) - Custom web command
      await WebhookCommandsHandler.handleWebhookCommand(socket, session);
      return RESULT_SUCCESS;

    case 'G': // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'GR': // Greetings (internalCommandGreets) - express.e:24411-24423
      handleGreetingsCommand(socket, session);
      return RESULT_SUCCESS;

    case 'C': // Comment to Sysop (internalCommandC) - express.e:24658-24670
      handleCommentToSysopCommand(socket, session, params);
      return RESULT_SUCCESS;

    case 'CF': // Conference Flags (internalCommandCF) - express.e:24672-24841
      await handleConferenceFlagsCommand(socket, session);
      return RESULT_SUCCESS;

    case 'Q': // Quiet Mode Toggle (internalCommandQ) - express.e:25504-25516
      handleQuietModeCommand(socket, session);
      return RESULT_SUCCESS;


    case '?': // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      await handleQuestionMarkCommand(socket, session);
      return RESULT_SUCCESS;

    case '^': // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089-25111
      handleHelpFilesCommand(socket, session, params);
      return RESULT_SUCCESS;

    // === CUSTOM WEB COMMANDS (Not in express.e) ===
    case 'DOOR':
    case 'DOORS': // Door Games Menu - lists doors with arrow key navigation
      await displayDoorMenu(socket, session, params);
      return RESULT_SUCCESS;

    case 'DOORMAN': { // Door Manager plugin - for installing/managing doors
      try {
console.log('[DOORMAN] Starting Door Manager...');
        const doorManagerPath = '../../doors/DoorManager';
        const { executeDoor: executeDoorManager } = await import(doorManagerPath);
console.log('[DOORMAN] Module imported successfully');
        await executeDoorManager(socket, session);
console.log('[DOORMAN] executeDoor completed');
      } catch (error) {
console.error('[DOORMAN] Fatal error:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mError starting Door Manager:\x1b[0m\r\n');
        socket.emit('ansi-output', `${(error as Error).message}\r\n`);
        socket.emit('ansi-output', `${(error as Error).stack}\r\n\r\n`);
        socket.emit('ansi-output', 'Press any key to return to main menu...\r\n');

        // Clean up session state
        if (session.inDoorManager) {
          delete session.inDoorManager;
        }
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return RESULT_SUCCESS;
    }

    case 'GA': { // GetAnswer - Test simple Amiga door (8KB XIM door)
      try {
console.log('[GA] Starting GetAnswer door...');
        const { AmigaDoorSession } = await import('../../amiga-emulation/AmigaDoorSession');
        // Door path is relative to project root, not backend directory
        const doorPath = path.join(process.cwd(), '../../doors/GetAnswer/GetAnswer');

console.log(`[GA] Door path: ${doorPath}`);

        if (!fs.existsSync(doorPath)) {
          socket.emit('ansi-output', '\r\n\x1b[31mGetAnswer door not found!\x1b[0m\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          session.menuPause = false;
          return RESULT_SUCCESS;
        }

        socket.emit('ansi-output', '\r\n\x1b[36m🚀 Starting GetAnswer (8KB XIM door)...\x1b[0m\r\n\r\n');

        const amigaSession = new AmigaDoorSession(socket, {
          executablePath: doorPath,
          timeout: 600,
          bbsSession: session
        });

        // Route live input to the door (mirror launchAmigaDoor behavior)
        session.inDoorManager = true;
        session.subState = LoggedOnSubState.DOOR_RUNNING;
        session.doorInputHandler = (data: string) => {
          try {
            const shared: any = (amigaSession as any).sharedState || {};
            // IMPORTANT: Check if XIM is waiting for input BEFORE queueing
            // This prevents double-delivery when XIM completes a hotkey/line input
            const ximWaitingForInput = shared.ximProtocol?.isWaitingForLineInput?.() ?? false;
            if (shared.ximProtocol) {
              shared.ximProtocol.queueInput(data);
            }
            if (shared.dosLibrary && !ximWaitingForInput) {
              shared.dosLibrary.queueInput(data);
            }
          } catch (err) {
console.error('[GA] Error routing door input:', err);
          }
        };
        // Persist session so socket-handlers sees doorInputHandler
        try {
          const { setSession, userSessions } = require('../../server/session-manager');
          setSession(socket.id, session);
          if ((session as any).user?.id) {
            userSessions.set((session as any).user.id, session);
          }
        } catch (err) {
console.error('[GA] Unable to persist session for door input:', err);
        }

        await amigaSession.start();

        // Cleanup door input handling
        session.inDoorManager = false;
        session.mouseEventsEnabled = false; // Reset mouse events when door exits
        delete session.doorInputHandler;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        try {
          const { setSession, userSessions } = require('../../server/session-manager');
          setSession(socket.id, session);
          if ((session as any).user?.id) {
            userSessions.set((session as any).user.id, session);
          }
        } catch (err) {
console.error('[GA] Unable to persist session after door:', err);
        }

        socket.emit('ansi-output', '\r\n\x1b[32mGetAnswer door session completed.\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      } catch (error) {
console.error('[GA] Fatal error:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mError starting GetAnswer door:\x1b[0m\r\n');
        socket.emit('ansi-output', `${(error as Error).message}\r\n`);
        socket.emit('ansi-output', `${(error as Error).stack}\r\n\r\n`);
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return RESULT_SUCCESS;
    }

    // NOTE: Test door commands (MULTITOP, WH) removed - door-specific hacks
    // Doors should be accessed through proper door system via .info file registration

    default:
      // Not an internal command - return RESULT_FAILURE to allow external door lookup
      // express.e:4733-4748 - Internal commands checked first, then external command files
console.log(`[processBBSCommand] Command '${command}' not recognized as internal - returning RESULT_FAILURE`);
      return RESULT_FAILURE;
  }

  // All internal commands use early return, so we only reach here if something went wrong
console.warn(`[processBBSCommand] Unexpected: reached end of function without return`);
  return RESULT_FAILURE;
}
