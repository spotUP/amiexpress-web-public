/**
 * Internal Commands Router
 * Maps command codes to handler functions
 * Based on express.e:24411-28227 (internalCommand* functions)
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { executeDoor } from '../door.handler';
import { getDoors } from './dependency-injection';
import * as path from 'path';
import * as fs from 'fs';

// Import all command handlers
import {
  handleUploadCommand,
  setUserCommandsDependencies
} from '../user-commands.handler';
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
  setSystemCommandsDependencies
} from '../system-commands.handler';
import { WebhookCommandsHandler } from '../webhook-commands.handler';
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
  setNavigationCommandsDependencies
} from '../navigation-commands.handler';
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFileStatusCommand,
  handleReadBulletinCommand,
  setDisplayFileCommandsDependencies
} from '../display-file-commands.handler';
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  handlePageSysopCommand,
  setPreferenceChatCommandsDependencies
} from '../preference-chat-commands.handler';
import {
  handleLiveChatCommand
} from '../chat-commands.handler';
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
  setAdvancedCommandsDependencies
} from '../advanced-commands.handler';
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  setMessageCommandsDependencies
} from '../message-commands.handler';
import {
  handleVersionCommand,
  handleWhoDetailedCommand,
  handleWriteUserParamsCommand,
  setInfoCommandsDependencies
} from '../info-commands.handler';
import {
  handleRelogonCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
  setUtilityCommandsDependencies
} from '../utility-commands.handler';
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
  setSysopCommandsDependencies
} from '../sysop-commands.handler';
import {
  handleZmodemUploadCommand,
  handleSysopUploadCommand,
  handleNodeUptimeCommand,
  handleVotingBoothCommand,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies
} from '../transfer-misc-commands.handler';
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  setMessagingDependencies
} from '../messaging.handler';
import { FileMaintenanceHandler } from '../file-maintenance.handler';
import { handleJoinConferenceCommand } from '../user-commands.handler';
import { displayDoorMenu } from '../door.handler';
import { handleUserStatsCommand } from '../user-commands.handler';

/**
 * Process internal BBS commands (express.e:24411-28227)
 * Maps commands to internalCommandX functions from AmiExpress
 */
export async function processBBSCommand(socket: any, session: BBSSession, command: string, params: string = '') {
  // Clear screen before showing command output (authentic BBS behavior)
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  const doors = getDoors();

  // Map commands to internalCommandX functions from AmiExpress
  switch (command) {
    case 'D': // Download File(s) (internalCommandD) - express.e:24853-24857
      const { DownloadHandler } = require('../download.handler');
      await DownloadHandler.handleDownloadCommand(socket, session, params);
      return;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302
      handleDownloadWithStatusCommand(socket, session, params);
      return;

    case 'DB': // Download Batch - Download all flagged files
      const { BatchDownloadHandler } = require('../batch-download.handler');
      await BatchDownloadHandler.handleBatchDownload(socket, session);
      return;

    case 'U': // Upload File(s) (internalCommandU) - express.e:25646-25658
      handleUploadCommand(socket, session);
      return;

    case 'UP': // Upload Status / Node Uptime (internalCommandUP) - express.e:25667
      handleNodeUptimeCommand(socket, session);
      return;

    case 'US': // Sysop Upload (internalCommandUS) - express.e:25660-25665
      handleSysopUploadCommand(socket, session, params);
      return;

    case '0': // Remote Shell (internalCommand0) - express.e:24424-24451
      handleRemoteShellCommand(socket, session);
      return;

    case '1': // Account Editing (internalCommand1) - express.e:24453-24459
      handleAccountEditingCommand(socket, session);
      return;

    case '2': // View Callers Log (internalCommand2) - express.e:24461-24509
      await handleCallersLogCommand(socket, session, params);
      return;

    case '3': // Edit Directory Files (internalCommand3) - express.e:24511-24515
      handleEditDirectoryFilesCommand(socket, session, params);
      return;

    case '4': // Edit Any File (internalCommand4) - express.e:24517-24521
      handleEditAnyFileCommand(socket, session, params);
      return;

    case '5': // Change Directory (internalCommand5) - express.e:24523-24527
      handleChangeDirectoryCommand(socket, session, params);
      return;

    case 'MS': // Mail Scan (internalCommandMS) - express.e:25250-25279
      handleMailScanCommand(socket, session);
      return;

    case 'OLM': // Online Message (internalCommandOLM) - express.e:25406-25503
      const { handleOlmCommand: handleOlm } = require('../olm.handler');
      await handleOlm(socket, session, params);
      return;

    case 'LIVECHAT': // Modern Real-Time Internode Chat (Enhancement)
      console.log('🔥 BEFORE calling handleLiveChatCommand, params:', params);
      try {
        await handleLiveChatCommand(socket, session, params);
        console.log('✅ AFTER calling handleLiveChatCommand successfully');
      } catch (error) {
        console.error('❌ ERROR in handleLiveChatCommand:', error);
        throw error;
      }
      return;

    case 'ROOM': // Group Chat Rooms (Modern Enhancement)
      const { handleRoomCommand } = require('../room-commands.handler');
      await handleRoomCommand(socket, session, params);
      return;

    case 'Q': // Quiet Mode / Block OLM (internalCommandQ) - express.e:25505-25515
      const { handleQuietCommand } = require('../olm.handler');
      await handleQuietCommand(socket, session);
      return;

    case 'RL': // RELOGON (internalCommandRL) - express.e:25534-25539
      handleRelogonCommand(socket, session, params);
      return;

    case 'RZ': // Zmodem Upload Command (internalCommandRZ) - express.e:25608-25621
      handleZmodemUploadCommand(socket, session);
      return;

    case 'S': // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return;

    case 'V': // View a Text File (internalCommandV) - express.e:25675-25687
      const { ViewFileHandler } = require('../view-file.handler');
      await ViewFileHandler.handleViewFileCommand(socket, session, params);
      return;

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      const { ViewFileHandler: ViewFileHandler2 } = require('../view-file.handler');
      await ViewFileHandler2.handleViewFileCommand(socket, session, params);
      return;

    case 'VO': // Voting Booth (internalCommandVO) - express.e:25700-25710
      await handleVotingBoothCommand(socket, session);
      return;

    case 'VER': // View ami-express version information (internalCommandVER) - express.e:25688-25699
      handleVersionCommand(socket, session);
      return;

    case 'W': // Write User Parameters (internalCommandW) - express.e:25712-25785
      handleWriteUserParamsCommand(socket, session);
      return;

    // WHO command removed - should use BBSCMD door instead (WHO.info → DOORS:RTW/RTW)
    // See express.e:26094-26103 - calls who(0) which launches door
    // case 'WHO': // Node Information (internalCommandWHO) - express.e:26094-26103
    //   handleWhoCommand(socket, session);
    //   return;

    case 'WHD': // Who's Online - Detailed (internalCommandWHD) - express.e:26104-26112
      handleWhoDetailedCommand(socket, session);
      return;

    case 'X': // Expert Mode Toggle (internalCommandX) - express.e:26113-26122
      await handleExpertModeCommand(socket, session);
      return;

    case 'Z': // Zippy Text Search (internalCommandZ) - express.e:26123-26213
      const { ZippySearchHandler } = require('../zippy-search.handler');
      await ZippySearchHandler.handleZippySearchCommand(socket, session, params);
      return;

    case 'ZOOM': // Zoo Mail (internalCommandZOOM) - express.e:26215-26240
      await handleZoomCommand(socket, session);
      return;

    case 'R': // Read Messages (internalCommandR) - express.e:25518-25531
      await handleReadMessagesFullCommand(socket, session, params);
      return;

    case 'A': // Alter Flags (file flagging) (internalCommandA) - express.e:24601-24605
      await handleAlterFlagsCommand(socket, session, params);
      return;

    case 'E': // Enter Message (internalCommandE) - express.e:24860-24872
      handleEnterMessageFullCommand(socket, session, params);
      return;

    case '<': // Previous Conference (internalCommandLT) - express.e:24529-24546
      await handlePreviousConferenceCommand(socket, session);
      return;

    case '>': // Next Conference (internalCommandGT) - express.e:24548-24564
      await handleNextConferenceCommand(socket, session);
      return;

    case '<<': // Previous Message Base (internalCommandLT2) - express.e:24566-24578
      await handlePreviousMessageBaseCommand(socket, session);
      return;

    case '>>': // Next Message Base (internalCommandGT2) - express.e:24580-24592
      await handleNextMessageBaseCommand(socket, session);
      return;

    case 'J': // Join Conference (internalCommandJ) - express.e:25113-25183
      await handleJoinConferenceCommand(socket, session, params);
      return;

    case 'JM': // Join Message Base (internalCommandJM) - express.e:25185-25238
      handleJoinMessageBaseCommand(socket, session, params);
      return;

    case 'F': // File Listings (internalCommandF) - express.e:24877-24881
      await handleFileListCommand(socket, session, params);
      return;

    case 'FR': // File Listings Raw (internalCommandFR) - express.e:24883-24887
      await handleFileListRawCommand(socket, session, params);
      return;

    case 'FM': // File Maintenance (internalCommandFM) - express.e:24889-25045
      await FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, params);
      return;

    case 'FS': // File Status (internalCommandFS) - express.e:24872-24875
      await handleFileStatusCommand(socket, session);
      return;

    case 'N': // New Files (internalCommandN) - express.e:25275-25279
      await handleNewFilesCommand(socket, session, params);
      return;

    case 'O': // Page Sysop (internalCommandO) - express.e:25372-25404
      handlePageSysopCommand(socket, session);
      return;


    case 'T': // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return;

    case 'B': // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, params);
      return;

    case 'H': // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, params);
      return;

    case 'M': // Toggle ANSI Color (internalCommandM) - express.e:25239-25248
      handleAnsiModeCommand(socket, session);
      return;

    case 'NM': // Node Management (SYSOP) (internalCommandNM) - express.e:25281-25370
      handleNodeManagementCommand(socket, session);
      return;

    case 'CM': // Conference Maintenance (SYSOP) (internalCommandCM) - express.e:24843-24852
      await handleConferenceMaintenanceCommand(socket, session);
      return;

    case 'WEBHOOK': // Webhook Management (SYSOP) - Custom web command
      await WebhookCommandsHandler.handleWebhookCommand(socket, session);
      return;

    case 'G': // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, params);
      return;

    case 'GR': // Greetings (internalCommandGreets) - express.e:24411-24423
      handleGreetingsCommand(socket, session);
      return;

    case 'C': // Comment to Sysop (internalCommandC) - express.e:24658-24670
      handleCommentToSysopCommand(socket, session, params);
      return;

    case 'CF': // Conference Flags (internalCommandCF) - express.e:24672-24841
      await handleConferenceFlagsCommand(socket, session);
      return;

    case 'Q': // Quiet Mode Toggle (internalCommandQ) - express.e:25504-25516
      handleQuietModeCommand(socket, session);
      return;


    case '?': // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      await handleQuestionMarkCommand(socket, session);
      return;

    case '^': // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089-25111
      handleHelpFilesCommand(socket, session, params);
      return;

    // === CUSTOM WEB COMMANDS (Not in express.e) ===
    case 'DOOR':
    case 'DOORS': // Door Games Menu - lists doors with arrow key navigation
      await displayDoorMenu(socket, session, params);
      return;

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
      return;
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
          return;
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
            if (shared.ximProtocol) {
              shared.ximProtocol.queueInput(data);
            }
            if (shared.dosLibrary && !(shared.ximProtocol?.isWaitingForLineInput?.() ?? false)) {
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
      return;
    }

    case 'MULTITOP': { // MultiTop - Top users door from reference-board
      try {
        console.log('[MULTITOP] Starting MultiTop door...');
        const { AmigaDoorSession } = await import('../../amiga-emulation/AmigaDoorSession');
        const doorPath = path.join(process.cwd(), '../../doors/MultiTopDoor');

        console.log(`[MULTITOP] Door path: ${doorPath}`);

        if (!fs.existsSync(doorPath)) {
          socket.emit('ansi-output', '\r\n\x1b[31mMultiTop door not found!\x1b[0m\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          session.menuPause = false;
          return;
        }

        socket.emit('ansi-output', '\r\n\x1b[36mStarting MultiTop (37KB)...\x1b[0m\r\n\r\n');

        const amigaSession = new AmigaDoorSession(socket, {
          executablePath: doorPath,
          timeout: 600,
          bbsSession: session // Use actual session with proper nodeId
        });

        await amigaSession.start();

        socket.emit('ansi-output', '\r\n\x1b[32mMultiTop door session completed.\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      } catch (error) {
        console.error('[MULTITOP] Fatal error:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mError starting MultiTop door:\x1b[0m\r\n');
        socket.emit('ansi-output', `${(error as Error).message}\r\n`);
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return;
    }

    case 'WH': { // What - Test door with message ports
      try {
        console.log('[WH] Starting What door...');
        const { AmigaDoorSession } = await import('../../amiga-emulation/AmigaDoorSession');
        // Door path
        const doorPath = path.join(process.cwd(), '../../Doors/What/WHAT');

        console.log(`[WH] Door path: ${doorPath}`);

        if (!fs.existsSync(doorPath)) {
          socket.emit('ansi-output', '\r\n\x1b[31mWhat door not found!\x1b[0m\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          session.menuPause = false;
          return;
        }

        socket.emit('ansi-output', '\r\n\x1b[36mStarting What door (AEDoorPort test)...\x1b[0m\r\n\r\n');

        const amigaSession = new AmigaDoorSession(socket, {
          executablePath: doorPath,
          timeout: 600
        });

        await amigaSession.start();

        socket.emit('ansi-output', '\r\n\x1b[32mWhat door session completed.\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      } catch (error) {
        console.error('[WH] Fatal error:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mError starting What door:\x1b[0m\r\n');
        socket.emit('ansi-output', `${(error as Error).message}\r\n`);
        socket.emit('ansi-output', `${(error as Error).stack}\r\n\r\n`);
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = false;
      }
      return;
    }

    default:
      // express.e:28228 - Command priority:
      // 1. SysCommand (SYSCMD) - system-level commands
      // 2. BbsCommand (BBSCMD) - door commands
      // 3. InternalCommand - built-in commands (already handled above)
      //
      // Check if command matches a door (BBSCMD)
      console.log(`[Command Handler] Checking for door match: "${command}"`);
      console.log(`[Command Handler] Available doors: ${doors.length}`);
      if (doors.length > 0) {
        console.log(`[Command Handler] Sample door commands: ${doors.slice(0, 5).map(d => d.command).join(', ')}`);
      }

      const matchingDoor = doors.find(door =>
        door.command.toLowerCase() === command.toLowerCase()
      );

      if (matchingDoor) {
        // Execute the door
        console.log(`[Command Handler] Found matching door: ${matchingDoor.name}`);
        await executeDoor(socket, session, matchingDoor);
        return;
      }

      // No matching door - unknown command
      console.log(`[Command Handler] No matching door found for: ${command}`);
      socket.emit('ansi-output', `\r\nUnknown command: ${command}\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      break;
  }

  // Note: State transition is handled by PROCESS_COMMAND handler in handleCommand
  // Commands that use 'return' will skip this point
  // Commands that use 'break' or fall through will reach here
  // If no subState was set, PROCESS_COMMAND handler will default to DISPLAY_MENU
}
