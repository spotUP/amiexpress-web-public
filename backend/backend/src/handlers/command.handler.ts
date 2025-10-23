/**
 * Command Handler
 * Central command router and menu system
 * Handles all BBS command processing and routing
 * 1:1 port from AmiExpress express.e command processing
 */

import { BBSSession, LoggedOnSubState, BBSState } from '../index';

// Import from other handlers
import { displayScreen, doPause } from './screen.handler';
import { displayConferenceBulletins, joinConference } from './conference.handler';
import { displayDoorMenu, executeDoor } from './door.handler';
import { startSysopPage } from './chat.handler';
import {
  displayFileList,
  displayFileMaintenance,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface
} from './file.handler';
import {
  displayAccountEditingMenu
} from './account.handler';
import {
  handleBulletinCommand,
  handleBulletinInput,
  setBulletinDependencies
} from './bulletin.handler';
import {
  handleUserStatsCommand,
  handleJoinConferenceCommand,
  handleUploadCommand,
  handleDownloadCommand,
  setUserCommandsDependencies
} from './user-commands.handler';
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
  setSystemCommandsDependencies
} from './system-commands.handler';
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
  setNavigationCommandsDependencies
} from './navigation-commands.handler';
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFileStatusCommand,
  handleReadBulletinCommand,
  handleBulletinInput as handleBulletinInputFromDisplayFileCommands,
  setDisplayFileCommandsDependencies
} from './display-file-commands.handler';
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  handlePageSysopCommand,
  handleOnlineMessageCommand,
  setPreferenceChatCommandsDependencies
} from './preference-chat-commands.handler';
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
  setAdvancedCommandsDependencies
} from './advanced-commands.handler';
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  handleJMInput,
  setMessageCommandsDependencies
} from './message-commands.handler';
import {
  handleVersionCommand,
  handleWhoCommand,
  handleWhoDetailedCommand,
  handleWriteUserParamsCommand,
  setInfoCommandsDependencies
} from './info-commands.handler';
import {
  handleRelogonCommand,
  handleViewFileCommand,
  handleZippySearchCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
  handleRelogonConfirm,
  handleViewFileInput,
  handleZippySearchInput,
  setUtilityCommandsDependencies
} from './utility-commands.handler';
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
  setSysopCommandsDependencies
} from './sysop-commands.handler';
import {
  handleZmodemUploadCommand,
  handleSysopUploadCommand,
  handleNodeUptimeCommand,
  handleVotingBoothCommand,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies
} from './transfer-misc-commands.handler';
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  setMessagingDependencies
} from './messaging.handler';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand,
  loadCommands,
  setCommandExecutionDependencies
} from './command-execution.handler';

// Import security/ACS system
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';

// Dependencies (injected)
let db: any;
let config: any;
let messageBases: any[] = [];
let processOlmMessageQueue: any;
let checkSecurity: any;
let setEnvStat: any;
let getRecentCallerActivity: any;
let doors: any[] = [];

// Re-export command loading functions for index.ts
export { loadCommands, setCommandExecutionDependencies } from './command-execution.handler';

// Constants (injected)
let SCREEN_MENU: string;

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

export function setConfig(cfg: any) {
  config = cfg;
}

export function setMessageBases(bases: any[]) {
  messageBases = bases;
}

export function setProcessOlmMessageQueue(fn: any) {
  processOlmMessageQueue = fn;
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

export function setDoors(doorsList: any[]) {
  doors = doorsList;
}

export function setConstants(constants: any) {
  SCREEN_MENU = constants.SCREEN_MENU;
}

// ===== Exported Functions =====

export function displayMainMenu(socket: any, session: BBSSession) {
  console.log('displayMainMenu called, current subState:', session.subState, 'menuPause:', session.menuPause);

  // Like express.e:28594 - process OLM message queue before displaying menu
  processOlmMessageQueue(socket, session, true);

  // Like AmiExpress: only display menu if menuPause is TRUE
  if (session.menuPause) {
    console.log('menuPause is TRUE, displaying menu');

    // Clear screen before displaying menu (like AmiExpress does)
    console.log('Sending screen clear: \\x1b[2J\\x1b[H');
    socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and move cursor to top

    // CRITICAL FIX: Correct condition from express.e:28583
    // Express.e:28583 - IF ((loggedOnUser.expert="N") AND (doorExpertMode=FALSE)) OR (checkToolTypeExists(TOOLTYPE_CONF,currentConf,'FORCE_MENUS'))
    // Note: Database stores expert as BOOLEAN (true/false), not string ("Y"/"N")
    if ((session.user?.expert === false && !session.doorExpertMode) /* TODO: || FORCE_MENUS check */) {
      console.log('Displaying menu screen file');
      // Phase 8: Use authentic screen file system (express.e:28586 - displayScreen(SCREEN_MENU))
      displayScreen(socket, session, SCREEN_MENU);
    }

    displayMenuPrompt(socket, session);
  } else {
    console.log('menuPause is FALSE, NOT displaying menu - staying in command mode');
  }

  // Reset doorExpertMode after menu display (express.e:28586)
  session.doorExpertMode = false;

  // Like AmiExpress: Check cmdShortcuts to determine input mode
  if (session.cmdShortcuts === false) {
    session.subState = LoggedOnSubState.READ_COMMAND;
  } else {
    session.subState = LoggedOnSubState.READ_SHORTCUTS;
  }
}

// Display menu prompt (displayMenuPrompt equivalent)
export function displayMenuPrompt(socket: any, session: BBSSession) {
  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = config.get('bbsName');
  const timeLeft = Math.floor(session.timeRemaining);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = messageBases.find(mb => mb.id === session.currentMsgBase);

  if (msgBasesInConf.length > 1 && currentMsgBase) {
    // Multiple message bases: show "ConfName - MsgBaseName"
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    socket.emit('ansi-output', `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `);
  } else {
    // Single message base: just show conference name
    socket.emit('ansi-output', `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${session.currentConfName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `);
  }

  session.subState = LoggedOnSubState.READ_COMMAND;
}

// Handle user commands (processCommand equivalent)
export async function handleCommand(socket: any, session: BBSSession, data: string) {
  console.log('=== handleCommand called ===');
  console.log('data:', JSON.stringify(data));
  console.log('session.state:', session.state);
  console.log('session.subState:', session.subState);
  console.log('session id:', sessions.has(socket.id) ? 'found' : 'NOT FOUND');

  if (session.state !== BBSState.LOGGEDON) {
    console.log('❌ Not in LOGGEDON state, ignoring command');
    return;
  }

  // Handle substate-specific input
  if (session.subState === LoggedOnSubState.DISPLAY_BULL ||
      session.subState === LoggedOnSubState.CONF_SCAN ||
      session.subState === LoggedOnSubState.DISPLAY_CONF_BULL ||
      session.subState === LoggedOnSubState.FILE_LIST) {
    console.log('📋 In display state, continuing to next state');
    try {
      // Any key continues to next state
      if (session.subState === LoggedOnSubState.DISPLAY_BULL) {
        // express.e:28555-28648 flow: BULL → confScan
        // Import and call performConferenceScan from message-scan.handler
        const { performConferenceScan } = require('./message-scan.handler');
        await performConferenceScan(socket, session);
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      } else if (session.subState === LoggedOnSubState.CONF_SCAN) {
        // express.e:28555-28648 flow: confScan → CONF_BULL
        await displayConferenceBulletins(socket, session);
      } else if (session.subState === LoggedOnSubState.DISPLAY_CONF_BULL) {
        // Like AmiExpress: after command completes, set menuPause=TRUE and display menu
        session.menuPause = true;
        displayMainMenu(socket, session);
      } else if (session.subState === LoggedOnSubState.FILE_LIST) {
        // Return to file area selection
        session.subState = LoggedOnSubState.FILE_AREA_SELECT;
        // Re-trigger F command to show file areas again
        processBBSCommand(socket, session, 'F');
        return;
      }
    } catch (error) {
      console.error('Error in display state handling:', error);
      socket.emit('ansi-output', '\r\n\x1b[31mAn error occurred. Returning to main menu...\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    }
    return;
  }

  // Handle file area selection (like getDirSpan in AmiExpress)
   if (session.subState === LoggedOnSubState.FILE_AREA_SELECT) {
     console.log('📁 In file area selection state');
     const input = data.trim();
     const areaNumber = parseInt(input);

     if (input === '' || (isNaN(areaNumber) && input !== '0')) {
       // Empty input or invalid - return to menu with error handling
       socket.emit('ansi-output', '\r\n\x1b[31mInvalid selection. Returning to main menu...\x1b[0m\r\n');
       socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
       session.menuPause = false;
       session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
       session.tempData = undefined;
       return;
     }

    // Handle door selection
     if (session.tempData?.doorMode) {
       const availableDoors = session.tempData.availableDoors;
       const doorNumber = parseInt(input);

       if (isNaN(doorNumber) || doorNumber < 1 || doorNumber > availableDoors.length) {
         socket.emit('ansi-output', '\r\n\x1b[31mInvalid door number. Please enter a number between 1 and ' + availableDoors.length + '.\x1b[0m\r\n');
         socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
         session.menuPause = false;
         session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
         session.tempData = undefined;
         return;
       }

       const selectedDoor = availableDoors[doorNumber - 1];
       await executeDoor(socket, session, selectedDoor);
       return;
     }

    // Handle file download selection (when areaFiles are available)
     if (session.tempData?.areaFiles) {
       const areaFiles = session.tempData.areaFiles;
       const fileNumber = parseInt(input);

       if (isNaN(fileNumber) || fileNumber < 1 || fileNumber > areaFiles.length) {
         socket.emit('ansi-output', '\r\n\x1b[31mInvalid file number. Please enter a number between 1 and ' + areaFiles.length + '.\x1b[0m\r\n');
         socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
         session.menuPause = false;
         session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
         session.tempData = undefined;
         return;
       }

       // Start file download
       handleFileDownload(socket, session, fileNumber);
       return;
     }

    // Handle file area selection for upload/download
     if (isNaN(areaNumber) || areaNumber === 0) {
       socket.emit('ansi-output', '\r\n\x1b[31mInvalid file area number. Please enter a valid number.\x1b[0m\r\n');
       socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
       session.menuPause = false;
       session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
       session.tempData = undefined;
       return;
     }

    // Get file areas for current conference and find by relative number (1,2,3...)
    const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
    const selectedArea = currentFileAreas[areaNumber - 1]; // 1-based indexing

    if (!selectedArea) {
      socket.emit('ansi-output', '\r\nInvalid file area number.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Check if this is upload mode
    if (session.tempData?.uploadMode) {
      // Start upload process for selected area
      startFileUpload(socket, session, selectedArea);
    } else if (session.tempData?.downloadMode) {
      // Start download process for selected area
      startFileDownload(socket, session, selectedArea);
    } else {
      // Display files in selected area (like displayIt in AmiExpress)
      displayFileAreaContents(socket, session, selectedArea);
    }
    return;
  }

  // Handle directory selection for file listing (like getDirSpan interactive)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT) {
    console.log('📂 In file directory selection state');
    const input = data.trim();

    if (input === '') {
      // Empty input - return to menu
      socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
      return;
    }

    // Handle file maintenance operations
    if (session.tempData?.operation === 'delete_files') {
      handleFileDeleteConfirmation(socket, session, input);
      return;
    }

    if (session.tempData?.operation === 'move_files') {
      handleFileMoveConfirmation(socket, session, input);
      return;
    }

    // Handle account editing operations
    if (session.tempData?.accountEditingMenu) {
      handleAccountEditing(socket, session, input);
      return;
    }

    if (session.tempData?.editUserAccount) {
      handleEditUserAccount(socket, session, input);
      return;
    }

    if (session.tempData?.viewUserStats) {
      handleViewUserStats(socket, session, input);
      return;
    }

    if (session.tempData?.changeSecLevel) {
      handleChangeSecLevel(socket, session, input);
      return;
    }

    if (session.tempData?.toggleUserFlags) {
      handleToggleUserFlags(socket, session, input);
      return;
    }

    if (session.tempData?.deleteUserAccount) {
      handleDeleteUserAccount(socket, session, input);
      return;
    }

    if (session.tempData?.searchUsers) {
      handleSearchUsers(socket, session, input);
      return;
    }

    // Handle regular file directory selection
    const upperInput = input.toUpperCase();
    const tempData = session.tempData as { fileAreas: any[], reverse: boolean, nonStop: boolean };
    const dirSpan = getDirSpan(upperInput, tempData.fileAreas.length);

    if (dirSpan.startDir === -1) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display selected directories
    displaySelectedFileAreas(socket, session, tempData.fileAreas, dirSpan, tempData.reverse, tempData.nonStop);
    return;
  }

  // Handle continuation of file listing between areas
  if (session.subState === LoggedOnSubState.FILE_LIST_CONTINUE) {
    console.log('📄 Continuing file list display');
    const tempData = session.tempData as {
      fileAreas: any[],
      dirSpan: { startDir: number, dirScan: number },
      reverse: boolean,
      nonStop: boolean,
      currentDir: number,
      searchDate?: Date,
      isNewFiles?: boolean,
      userListPage?: number,
      searchTerm?: string
    };

    // Handle user list pagination
    if (tempData.userListPage) {
      const input = data.trim().toUpperCase();
      if (input === 'Q') {
        socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        displayMainMenu(socket, session);
        return;
      } else {
        // Continue to next page
        displayUserList(socket, session, tempData.userListPage, tempData.searchTerm);
        return;
      }
    }

    if (tempData.isNewFiles && tempData.searchDate) {
      // Continue new files display
      displayNewFilesInDirectories(socket, session, tempData.searchDate,
        { startDir: tempData.currentDir, dirScan: tempData.dirSpan.dirScan }, tempData.nonStop);
    } else {
      // Continue regular file display
      displaySelectedFileAreas(socket, session, tempData.fileAreas, tempData.dirSpan, tempData.reverse, tempData.nonStop);
    }
    return;
  }

  // Handle conference selection
  if (session.subState === LoggedOnSubState.CONFERENCE_SELECT) {
    console.log('🏛️ In conference selection state');
    const input = data.trim();

    // Check if this is message base selection (from JM command)
    if (session.tempData?.messageBaseSelect) {
      const msgBaseId = parseInt(input);
      if (isNaN(msgBaseId) || msgBaseId === 0) {
        // Empty input or invalid - return to menu
        socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData = undefined;
        displayMainMenu(socket, session);
        return;
      }

      const currentConfBases = session.tempData.currentConfBases;
      const selectedBase = currentConfBases.find((mb: any) => mb.id === msgBaseId);
      if (!selectedBase) {
        socket.emit('ansi-output', '\r\nInvalid message base number.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      // Join the selected message base
      session.currentMsgBase = msgBaseId;
      socket.emit('ansi-output', `\r\n\x1b[32mJoined message base: ${selectedBase.name}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Regular conference selection
    const relConfNum = parseInt(input); // Relative conference number (1-based)
    if (isNaN(relConfNum) || relConfNum === 0) {
      // Empty input or invalid - return to menu
      socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
      return;
    }

    // Validate relative conference number and convert to conference object
    if (relConfNum < 1 || relConfNum > conferences.length) {
      socket.emit('ansi-output', '\r\nInvalid conference number.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    const selectedConf = conferences[relConfNum - 1]; // Convert to 0-based index
    const confId = selectedConf.id; // Get actual database ID

    // Find first message base for this conference (express.e uses first base as default)
    const confMessageBases = messageBases.filter(mb => mb.conferenceId === confId);
    if (confMessageBases.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo message bases available in this conference!\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    const firstMsgBaseId = confMessageBases[0].id; // Use first message base

    // Join the selected conference
    if (await joinConference(socket, session, confId, firstMsgBaseId)) {
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    }
    return;
  }

  // Handle JM (Join Message Base) input
  if (session.subState === 'JM_INPUT') {
    console.log('📬 In JM input state');
    handleJMInput(socket, session, data.trim());
    return;
  }

  // Handle RL (Relogon) confirmation
  if (session.subState === 'RL_CONFIRM') {
    console.log('🔄 In RL confirmation state');
    handleRelogonConfirm(socket, session, data.trim());
    return;
  }

  // Handle V (View File) input
  if (session.subState === 'VIEW_FILE_INPUT') {
    console.log('📄 In View File input state');
    handleViewFileInput(socket, session, data.trim());
    return;
  }

  // Handle Z (Zippy Search) input
  if (session.subState === 'ZIPPY_SEARCH_INPUT') {
    console.log('🔍 In Zippy Search input state');
    handleZippySearchInput(socket, session, data.trim());
    return;
  }

  // Handle message posting workflow (line-based input like login system)
  console.log('📝 Checking if in POST_MESSAGE_SUBJECT state:', session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT);
  if (session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
    console.log('📝 ENTERED message subject input handler');
    console.log('📝 Data received:', JSON.stringify(data), 'type:', typeof data);
    console.log('📝 Data === "\\r":', data === '\r');
    console.log('📝 Data === "\\n":', data === '\n');
    console.log('📝 Data.charCodeAt(0):', data.charCodeAt ? data.charCodeAt(0) : 'no charCodeAt');

    // Handle line-based input like the login system
    if (data === '\r' || data === '\n') { // Handle both carriage return and newline
      console.log('📝 ENTER CONDITION MET!');
      // Enter pressed - process the input
      const input = session.inputBuffer.trim();
      console.log('📝 ENTER PRESSED - Processing input:', JSON.stringify(input), 'length:', input.length);

      // Check if this is private message recipient input
      if (session.tempData?.isPrivate && !session.messageRecipient) {
        if (input.length === 0) {
          console.log('📝 Recipient is empty, aborting private message posting');
          socket.emit('ansi-output', '\r\nPrivate message posting aborted.\r\n');
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          session.inputBuffer = '';
          session.tempData = undefined;
          return;
        }
        console.log('📝 Recipient accepted:', JSON.stringify(input), '- now prompting for subject');
        session.messageRecipient = input;
        socket.emit('ansi-output', '\r\nEnter your message subject (or press Enter to abort): ');
        session.inputBuffer = '';
        return;
      }

      // Check if this is comment to sysop (skip recipient, go directly to subject)
      if (session.tempData?.isCommentToSysop && !session.messageRecipient) {
        console.log('📝 Comment to sysop - setting recipient to SYSOP');
        session.messageRecipient = 'SYSOP';
        // Continue with subject input
      }

      // Handle subject input
      if (input.length === 0) {
        console.log('📝 Subject is empty, aborting message posting');
        socket.emit('ansi-output', '\r\nMessage posting aborted.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.inputBuffer = '';
        session.tempData = undefined;
        return;
      }
      console.log('📝 Subject accepted:', JSON.stringify(input), '- moving to message body input');
      session.messageSubject = input;
      socket.emit('ansi-output', '\r\nEnter your message (press Enter twice to finish):\r\n> ');
      session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
      session.inputBuffer = '';
      console.log('📝 Changed state to POST_MESSAGE_BODY');
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b'); // Erase character from terminal
        console.log('📝 Backspace - buffer now:', JSON.stringify(session.inputBuffer));
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') { // Only printable characters
      // Regular character - add to buffer and echo
      session.inputBuffer += data;
      socket.emit('ansi-output', data);
      console.log('📝 Added character to buffer, current buffer:', JSON.stringify(session.inputBuffer));
    } else {
      console.log('📝 Ignoring non-printable character:', JSON.stringify(data), 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');
    }
    console.log('📝 EXITING message subject handler');
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_BODY) {
    console.log('📝 In message body input state, received:', JSON.stringify(data));

    // Handle line-based input for message body
    if (data === '\r' || data === '\n') {
      // Enter pressed - check if this is an empty line (end of message)
      if (session.inputBuffer.trim().length === 0) {
        // Empty line - end message posting
        const body = (session.messageBody || '').trim();
        if (body.length === 0) {
          socket.emit('ansi-output', '\r\nMessage posting aborted.\r\n');
        } else {
          // Create and store the message
          const newMessage: any = {
            id: messages.length + 1,
            subject: session.messageSubject || 'No Subject',
            body: body,
            author: session.user?.username || 'Anonymous',
            timestamp: new Date(),
            conferenceId: session.currentConf,
            messageBaseId: session.currentMsgBase
          };
          messages.push(newMessage);
          socket.emit('ansi-output', '\r\nMessage posted successfully!\r\n');

          // Log message posting activity (express.e:9493 callersLog)
          await callersLog(session.user!.id, session.user!.username, 'Posted message', session.messageSubject);
        }
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        // Create and store the message
        const newMessage: any = {
          id: messages.length + 1,
          subject: session.messageSubject || 'No Subject',
          body: body,
          author: session.user?.username || 'Anonymous',
          timestamp: new Date(),
          conferenceId: session.currentConf,
          messageBaseId: session.currentMsgBase,
          isPrivate: session.tempData?.isPrivate || false,
          toUser: session.messageRecipient,
          parentId: session.tempData?.parentId
        };
        messages.push(newMessage);

        // Clear message data
        session.messageSubject = undefined;
        session.messageBody = undefined;
        session.messageRecipient = undefined;
        session.inputBuffer = '';
        session.tempData = undefined;
        return;
      } else {
        // Non-empty line - add to message body
        if (session.messageBody) {
          session.messageBody += '\r\n' + session.inputBuffer;
        } else {
          session.messageBody = session.inputBuffer;
        }
        socket.emit('ansi-output', '\r\n> '); // New line prompt
        session.inputBuffer = '';
      }
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b'); // Erase character from terminal
      }
    } else {
      // Regular character - add to buffer and echo
      session.inputBuffer += data;
      socket.emit('ansi-output', data);
    }
    return;
  }

  if (session.subState === LoggedOnSubState.READ_COMMAND) {
    console.log('✅ In READ_COMMAND state, reading line input');
    // Express.e:28619-28633 - Read command text and transition to PROCESS_COMMAND
    const input = data.trim();
    if (input.length > 0) {
      // Store command text in session for PROCESS_COMMAND state
      session.commandText = input.toUpperCase();
      console.log('📝 Command text stored:', session.commandText);
      // Transition to PROCESS_COMMAND (express.e:28638)
      session.subState = LoggedOnSubState.PROCESS_COMMAND;
      // Process the command in the next event cycle
      setTimeout(() => {
        handleCommand(socket, session, '');  // Trigger process command
      }, 0);
    }
    return;
  } else if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {
    console.log('🔥 In READ_SHORTCUTS state, processing single key');
    try {
      // Process single character hotkeys immediately
      const command = data.trim().toUpperCase();
      if (command.length > 0) {
        processBBSCommand(socket, session, command).catch(error => {
          console.error('Error processing shortcut command:', error);
          socket.emit('ansi-output', '\r\n\x1b[31mError processing command. Please try again.\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        });
      }
    } catch (error) {
      console.error('Error in shortcut processing:', error);
      socket.emit('ansi-output', '\r\n\x1b[31mShortcut processing error. Returning to menu...\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    }
  } else if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
    // Express.e:28639-28642 - Process the command with priority system
    console.log('⚙️ In PROCESS_COMMAND state, executing command:', session.commandText);
    if (session.commandText) {
      const parts = session.commandText.split(' ');
      const command = parts[0];
      const params = parts.slice(1).join(' ');
      try {
        // Express.e:28244-28256 - Command priority: SysCommand → BbsCommand → InternalCommand
        const result = await processCommand(socket, session, command, params);
        if (result === 'NOT_ALLOWED') {
          // Permission denied - already handled
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          return;
        }
      } catch (error) {
        console.error('Error processing command:', error);
        socket.emit('ansi-output', '\r\n\x1b[31mError processing command.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }
    }
    // After processing: Check if command changed subState (commands like R set DISPLAY_CONF_BULL to wait for keypress)
    // If subState was changed by command, respect it. Otherwise, go to DISPLAY_MENU (express.e:28641-28642)
    session.commandText = undefined; // Clear command text
    if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
      // Command didn't change state, so default to showing menu
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
    }
    // If command changed subState (e.g., to DISPLAY_CONF_BULL), let handleCommand handle it on next input
    return;
  } else {
    console.log('❌ Not in command input state, current subState:', session.subState, '- IGNORING COMMAND');
  }
  console.log('=== handleCommand end ===\n');
}

// Command Priority System - Express.e:28228-28282
// Priority order: SysCommand → BbsCommand → InternalCommand

// Check for System Command (express.e:4813-4819)
export async function runSysCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for SYSCMD lookup and execution
  const result = await execSysCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return 'SUCCESS';
  if (result === -2) return 'NOT_ALLOWED';
  return 'FAILURE';
}

// Check for BBS Command (express.e:4807-4811)
export async function runBbsCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for BBSCMD lookup and execution
  const result = await execBbsCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return 'SUCCESS';
  if (result === -2) return 'NOT_ALLOWED';
  return 'FAILURE';
}

// Process command with priority system (express.e:28229-28257)
export async function processCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  console.log(`[CommandPriority] Processing command: ${command} with params: ${params}`);

  // Try SysCommand first
  const sysResult = await runSysCommand(socket, session, command, params);
  if (sysResult === 'SUCCESS') {
    console.log('[CommandPriority] Executed as SysCommand');
    return 'SUCCESS';
  }
  if (sysResult === 'NOT_ALLOWED') {
    console.log('[CommandPriority] SysCommand denied by permissions');
    return 'NOT_ALLOWED';
  }

  // Try BbsCommand second
  const bbsResult = await runBbsCommand(socket, session, command, params);
  if (bbsResult === 'SUCCESS') {
    console.log('[CommandPriority] Executed as BbsCommand');
    return 'SUCCESS';
  }
  if (bbsResult === 'NOT_ALLOWED') {
    console.log('[CommandPriority] BbsCommand denied by permissions');
    return 'NOT_ALLOWED';
  }

  // Try InternalCommand last
  console.log('[CommandPriority] Trying as InternalCommand');
  await processBBSCommand(socket, session, command, params);
  return 'SUCCESS';
}

// Process BBS commands (processInternalCommand equivalent)
export async function processBBSCommand(socket: any, session: BBSSession, command: string, params: string = '') {
  console.log('processBBSCommand called with command:', JSON.stringify(command));

  // Clear screen before showing command output (authentic BBS behavior)
  console.log('Command processing: clearing screen for command output');
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Map commands to internalCommandX functions from AmiExpress
  console.log('Entering switch statement for command:', command);
  switch (command) {
    case 'D': // Download File(s) (internalCommandD) - express.e:24853-24857
      handleDownloadCommand(socket, session, commandArgs);
      return;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302
      handleDownloadWithStatusCommand(socket, session, params);
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

    case 'OLM': // Online Message (internalCommandOLM) - express.e:25406-25470
      handleOnlineMessageCommand(socket, session, commandArgs);
      return;

    case 'RL': // RELOGON (internalCommandRL) - express.e:25534-25539
      handleRelogonCommand(socket, session, commandArgs);
      return;

    case 'RZ': // Zmodem Upload Command (internalCommandRZ) - express.e:25608-25621
      handleZmodemUploadCommand(socket, session);
      return;

    case 'S': // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return;

    case 'V': // View a Text File (internalCommandV) - express.e:25675-25687
      handleViewFileCommand(socket, session, commandArgs);
      return;

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      handleViewFileCommand(socket, session, commandArgs);
      return;

    case 'VO': // Voting Booth (internalCommandVO) - express.e:25700-25710
      handleVotingBoothCommand(socket, session);
      return;

    case 'VER': // View ami-express version information (internalCommandVER) - express.e:25688-25699
      handleVersionCommand(socket, session);
      return;

    case 'W': // Write User Parameters (internalCommandW) - express.e:25712-25785
      handleWriteUserParamsCommand(socket, session);
      return;

    case 'WHO': // Node Information (internalCommandWHO) - express.e:26094-26103
      handleWhoCommand(socket, session);
      return;

    case 'WHD': // Who's Online - Detailed (internalCommandWHD) - express.e:26104-26112
      handleWhoDetailedCommand(socket, session);
      return;

    case 'X': // Expert Mode Toggle (internalCommandX) - express.e:26113-26122
      handleExpertModeCommand(socket, session);
      return;

    case 'Z': // Zippy Text Search (internalCommandZ) - express.e:26123-26213
      handleZippySearchCommand(socket, session, commandArgs);
      return;

    case 'ZOOM': // Zoo Mail (internalCommandZOOM) - express.e:26215-26240
      handleZoomCommand(socket, session);
      return;

    case 'R': // Read Messages (internalCommandR) - express.e:25518-25531
      await handleReadMessagesFullCommand(socket, session, params);
      return;

    case 'A': // Alter Flags (file flagging) (internalCommandA) - express.e:24601-24605
      handleAlterFlagsCommand(socket, session, commandArgs);
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
      await handleJoinConferenceCommand(socket, session, commandArgs);
      return;

    case 'JM': // Join Message Base (internalCommandJM) - express.e:25185-25238
      handleJoinMessageBaseCommand(socket, session, commandArgs);
      return;

    case 'F': // File Listings (internalCommandF) - express.e:24877-24881
      handleFileListCommand(socket, session, commandArgs);
      return;

    case 'FR': // File Listings Raw (internalCommandFR) - express.e:24883-24887
      handleFileListRawCommand(socket, session, commandArgs);
      return;

    case 'FM': // File Maintenance (internalCommandFM) - maintenanceFileSearch()
      displayFileMaintenance(socket, session, params);
      return; // Don't continue to menu display

    case 'FS': // File Status (internalCommandFS) - express.e:24872-24875
      handleFileStatusCommand(socket, session);
      return;

    case 'N': // New Files (internalCommandN) - express.e:25275-25279
      await handleNewFilesCommand(socket, session, commandArgs);
      return;

    case 'O': // Page Sysop (internalCommandO) - express.e:25372-25404
      handlePageSysopCommand(socket, session);
      return;


    case 'T': // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return;

    case 'B': // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, commandArgs);
      return;

    case 'H': // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, commandArgs);
      return;

    case 'M': // Toggle ANSI Color (internalCommandM) - express.e:25239-25248
      handleAnsiModeCommand(socket, session);
      return;

    case 'NM': // Node Management (SYSOP) (internalCommandNM) - express.e:25281-25370
      handleNodeManagementCommand(socket, session);
      return;

    case 'CM': // Conference Maintenance (SYSOP) (internalCommandCM) - express.e:24843-24852
      handleConferenceMaintenanceCommand(socket, session);
      return;

    case 'G': // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, commandArgs);
      return;

    case 'GR': // Greetings (internalCommandGreets) - express.e:24411-24423
      handleGreetingsCommand(socket, session);
      return;

    case 'C': // Comment to Sysop (internalCommandC) - express.e:24658-24670
      handleCommentToSysopCommand(socket, session, commandArgs);
      return;

    case 'CF': // Conference Flags (internalCommandCF) - express.e:24672-24750
      handleConferenceFlagsCommand(socket, session);
      return;

    case 'Q': // Quiet Mode Toggle (internalCommandQ) - express.e:25504-25516
      handleQuietModeCommand(socket, session);
      return;


    case '?': // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      handleQuestionMarkCommand(socket, session);
      return;

    case '^': // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089-25111
      handleHelpFilesCommand(socket, session, commandArgs);
      return;

    default:
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
