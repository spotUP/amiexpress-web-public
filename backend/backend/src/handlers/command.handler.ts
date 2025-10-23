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
      // DS is handled by same function as D in express.e
      // The difference is DS shows download status/progress
      // TODO for 100% 1:1: Implement status display during download - express.e:24853
      displayDownloadInterface(socket, session, params);
      return;

    case 'U': // Upload File(s) (internalCommandU) - express.e:25646-25658
      handleUploadCommand(socket, session);
      return;

    case 'UP': // Upload Status / Node Uptime (internalCommandUP) - express.e:25667
      // Shows when the node was started
      const uptimeMs = Date.now() - (session.nodeStartTime || Date.now());
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const startTime = session.nodeStartTime ? new Date(session.nodeStartTime).toLocaleString() : 'Unknown';

      socket.emit('ansi-output', `\r\n\x1b[36mNode 1 was started at ${startTime}.\x1b[0m\r\n`);
      socket.emit('ansi-output', `\x1b[32mUptime: ${uptimeHours}h ${uptimeMins}m\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'US': // Sysop Upload (internalCommandUS) - express.e:25660
      // Phase 9: Security/ACS System implemented
      // ✅ checkSecurity(ACS_SYSOP_COMMANDS) - express.e:25661 [IMPLEMENTED]
      // ✅ setEnvStat(ENV_UPLOADING) - express.e:25662 [IMPLEMENTED]

      // Phase 9: Check security permission (express.e:25661)
      if (!checkSecurity(session, ACSCode.SYSOP_COMMANDS)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:25662)
      setEnvStat(session, EnvStat.UPLOADING);

      socket.emit('ansi-output', '\x1b[36m-= Sysop Upload =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Special sysop upload mode - bypasses ratio checks.\r\n\r\n');

      // TODO for 100% 1:1: Implement sysopUpload() - express.e:25664
      // This should bypass all ratio/security checks for sysop uploads
      displayUploadInterface(socket, session, params);
      return;

    case '0': // Remote Shell (internalCommand0)
      console.log('Processing command 0');
      socket.emit('ansi-output', '\x1b[36m-= Remote Shell =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Remote shell access not available.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case '1': // Account Editing (internalCommand1) - 1:1 with AmiExpress account editing
      // Check sysop permissions (like AmiExpress secStatus check)
      if ((session.user?.secLevel || 0) < 200) { // Sysop level required
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Start account editing workflow (like accountEdit() in AmiExpress)
      displayAccountEditingMenu(socket, session);
      return; // Stay in input mode

    case '2': // View Callers Log (internalCommand2) - 1:1 with AmiExpress callers log
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', '\x1b[36m-= Callers Log =-\x1b[0m\r\n');

      // In web version, we read from caller_activity table
      // In real AmiExpress (express.e:9493), this reads BBS:NODE{x}/CALLERSLOG backwards
      socket.emit('ansi-output', 'Recent caller activity:\r\n\r\n');

      // Get recent caller activity from database (last 20 entries)
      const recentActivity = await getRecentCallerActivity(20);

      if (recentActivity.length === 0) {
        socket.emit('ansi-output', 'No caller activity recorded yet.\r\n');
      } else {
        recentActivity.forEach(entry => {
          const timestamp = new Date(entry.timestamp);
          const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
          const details = entry.details ? ` - ${entry.details}` : '';
          socket.emit('ansi-output', `${timeStr} ${entry.username.padEnd(15)} ${entry.action}${details}\r\n`);
        });
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case '3': // Edit Directory Files (internalCommand3) - 1:1 with AmiExpress MicroEmacs
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', '\x1b[36m-= Edit Directory Files =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Directory file editing allows you to edit file directory listings.\r\n\r\n');

      // Display available file areas for editing
      const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
      if (currentFileAreas.length === 0) {
        socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', 'Available file areas:\r\n');
      currentFileAreas.forEach((area, index) => {
        socket.emit('ansi-output', `${index + 1}. ${area.name}\r\n`);
      });

      socket.emit('ansi-output', '\r\nSelect file area to edit (1-' + currentFileAreas.length + ') or press Enter to cancel: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { editDirectories: true, fileAreas: currentFileAreas };
      return; // Stay in input mode

    case '4': // Edit Any File (internalCommand4) - express.e:24517
      // Phase 9: Security/ACS System implemented
      // ✅ setEnvStat(ENV_EMACS) - express.e:24518 [IMPLEMENTED]
      // ✅ checkSecurity(ACS_EDIT_FILES) - express.e:24519 [IMPLEMENTED]

      // Phase 9: Check security permission (express.e:24519)
      if (!checkSecurity(session, ACSCode.EDIT_FILES)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. File editing privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:24518)
      setEnvStat(session, EnvStat.EMACS);

      socket.emit('ansi-output', '\x1b[36m-= Edit Any File =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Edit any file on the system (sysop only).\r\n\r\n');

      // TODO for 100% 1:1: Implement editAnyFile(params) - express.e:24520
      // This should:
      // 1. Parse filename from params or prompt for it
      // 2. Load file into MicroEmacs-style editor
      // 3. Allow full editing capabilities
      // 4. Save changes back to file

      socket.emit('ansi-output', '\x1b[33mFile editor not yet implemented.\x1b[0m\r\n');
      socket.emit('ansi-output', 'This command will allow editing any file on the system.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case '5': // Change Directory (internalCommand5) - express.e:24523
      // Phase 9: Security/ACS System implemented
      // ✅ setEnvStat(ENV_SYSOP) - express.e:24524 [IMPLEMENTED]
      // ✅ checkSecurity(ACS_SYSOP_COMMANDS) - express.e:24525 [IMPLEMENTED]

      // Phase 9: Check security permission (express.e:24525)
      if (!checkSecurity(session, ACSCode.SYSOP_COMMANDS)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:24524)
      setEnvStat(session, EnvStat.SYSOP);

      socket.emit('ansi-output', '\x1b[36m-= Change Directory =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Navigate and execute files anywhere on the system (sysop only).\r\n\r\n');

      // TODO for 100% 1:1: Implement myDirAnyWhere(params) - express.e:24526
      // This should:
      // 1. Parse directory path from params or prompt
      // 2. Change to that directory
      // 3. Show directory listing
      // 4. Allow execution of programs from any location

      socket.emit('ansi-output', '\x1b[33mDirectory navigation not yet implemented.\x1b[0m\r\n');
      socket.emit('ansi-output', 'This command allows sysop to navigate the entire filesystem.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'MS': // Run mailscan (internalCommandMS) - 1:1 with AmiExpress mailscan
      socket.emit('ansi-output', '\x1b[36m-= Mailscan =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Scanning all conferences for new messages...\r\n\r\n');

      // Get all conferences user has access to
      const accessibleConferences = conferences.filter(conf => {
        // Check if user has access to this conference
        // For simplicity, assume all users have access to conferences 1-3
        return conf.id <= 3 || (session.user?.secLevel || 0) >= 10;
      });

      let totalNewMessages = 0;
      let scannedConferences = 0;

      accessibleConferences.forEach(conf => {
        const confMessages = messages.filter(msg =>
          msg.conferenceId === conf.id &&
          msg.timestamp > (session.user?.lastLogin || new Date(0)) &&
          (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
        );

        if (confMessages.length > 0) {
          socket.emit('ansi-output', `\x1b[33m${conf.name}:\x1b[0m ${confMessages.length} new message(s)\r\n`);
          totalNewMessages += confMessages.length;
        }
        scannedConferences++;
      });

      socket.emit('ansi-output', `\r\nTotal new messages: ${totalNewMessages}\r\n`);
      socket.emit('ansi-output', `Conferences scanned: ${scannedConferences}\r\n`);

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'OLM': // Send online message (internalCommandOLM) - 1:1 with AmiExpress OLM
      socket.emit('ansi-output', '\x1b[36m-= Send Online Message =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Send a message to users currently online.\r\n\r\n');

      // Get all online users (excluding quiet nodes)
      const onlineUsers = Array.from(sessions.values())
        .filter(sess => sess.state === BBSState.LOGGEDON && sess.user && !sess.user.quietNode)
        .map(sess => ({
          username: sess.user!.username,
          conference: sess.currentConfName,
          idle: Math.floor((Date.now() - sess.lastActivity) / 60000)
        }));

      if (onlineUsers.length === 0) {
        socket.emit('ansi-output', 'No users currently online.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', 'Currently online users:\r\n\r\n');
      onlineUsers.forEach((user, index) => {
        const idleStr = user.idle > 0 ? ` (${user.idle}min idle)` : '';
        socket.emit('ansi-output', `${index + 1}. ${user.username.padEnd(15)} ${user.conference}${idleStr}\r\n`);
      });

      socket.emit('ansi-output', '\r\n\x1b[32mSelect user (1-\x1b[33m' + onlineUsers.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
      session.subState = LoggedOnSubState.FILE_AREA_SELECT;
      session.tempData = { olmMode: true, onlineUsers };
      return; // Stay in input mode

    case 'RL': // RELOGON (internalCommandRL) - 1:1 with AmiExpress relogon
      socket.emit('ansi-output', '\x1b[36m-= Relogon =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This will disconnect you and return you to the login prompt.\r\n');
      socket.emit('ansi-output', 'Are you sure you want to relogon? (Y/N): ');

      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { relogonConfirm: true };
      return; // Stay in input mode

    case 'RZ': // Zmodem Upload Command (internalCommandRZ) - 1:1 with AmiExpress RZ
      socket.emit('ansi-output', '\x1b[36m-= Zmodem Upload =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This command starts an immediate Zmodem upload.\r\n\r\n');

      // Check if there are file directories to upload to
      const uploadFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
      if (uploadFileAreas.length === 0) {
        socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', 'Available file areas:\r\n');
      uploadFileAreas.forEach((area, index) => {
        socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
      });

      socket.emit('ansi-output', '\r\n\x1b[32mSelect file area (1-\x1b[33m' + uploadFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
      session.subState = LoggedOnSubState.FILE_AREA_SELECT;
      session.tempData = { rzUploadMode: true, fileAreas: uploadFileAreas };
      return; // Stay in input mode

    case 'S': // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return;

    case 'UP': // Display uptime for node (internalCommandUP) - 1:1 with AmiExpress UP
      socket.emit('ansi-output', '\x1b[36m-= System Uptime =-\x1b[0m\r\n\r\n');

      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      socket.emit('ansi-output', `System has been up for: ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds\r\n`);
      socket.emit('ansi-output', `Started: ${new Date(Date.now() - uptime * 1000).toLocaleString()}\r\n`);
      socket.emit('ansi-output', `Current time: ${new Date().toLocaleString()}\r\n\r\n`);

      socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'V': // View a Text File (internalCommandV) - 1:1 with AmiExpress view text file
      socket.emit('ansi-output', '\x1b[36m-= View Text File =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter filename to view (or press Enter to cancel): ');

      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { viewTextFile: true };
      return; // Stay in input mode

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      // In express.e, VS calls internalCommandV (view file command)
      socket.emit('ansi-output', '\x1b[36m-= View Statistics File =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter statistics filename to view (or press Enter to cancel): ');

      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { viewTextFile: true };
      return; // Stay in input mode

    case 'VO': // Voting Booth (internalCommandVO) - express.e:25700
      // Phase 9: Security/ACS System implemented
      // ✅ checkSecurity(ACS_VOTE) - express.e:25701 [IMPLEMENTED]
      // ✅ setEnvStat(ENV_DOORS) - express.e:25703 [IMPLEMENTED]
      // TODO for 100% 1:1: setEnvMsg('Voting Booth') - express.e:25704

      // Phase 9: Check security permission (express.e:25701)
      if (!checkSecurity(session, ACSCode.VOTE)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Voting privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:25703)
      setEnvStat(session, EnvStat.DOORS);

      socket.emit('ansi-output', '\x1b[36m-= Voting Booth =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Voice your opinion on various topics.\r\n\r\n');

      // TODO for 100% 1:1: Implement voting system - express.e:25705-25708
      // If user has ACS_MODIFY_VOTE: call voteMenu() (create/edit votes)
      // Otherwise: call vote() (just vote on existing items)
      // This requires:
      // - Vote database tables
      // - Vote creation/editing interface
      // - Vote results display
      // - Multi-choice voting support

      socket.emit('ansi-output', '\x1b[33mVoting booth not yet implemented.\x1b[0m\r\n');
      socket.emit('ansi-output', 'This system allows users to participate in polls and surveys.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'VER': // View ami-express version information (internalCommandVER) - 1:1 with AmiExpress VER
      socket.emit('ansi-output', '\x1b[36m-= AmiExpress Web Version Information =-\x1b[0m\r\n\r\n');

      socket.emit('ansi-output', 'AmiExpress Web v5.6.0\r\n');
      socket.emit('ansi-output', 'Modern web implementation of the classic AmiExpress BBS\r\n\r\n');

      socket.emit('ansi-output', 'Built with:\r\n');
      socket.emit('ansi-output', '- Node.js backend\r\n');
      socket.emit('ansi-output', '- React frontend\r\n');
      socket.emit('ansi-output', '- SQLite database\r\n');
      socket.emit('ansi-output', '- Socket.io real-time communication\r\n');
      socket.emit('ansi-output', '- xterm.js terminal emulation\r\n\r\n');

      socket.emit('ansi-output', 'Compatible with AmiExpress v5.6.0 features\r\n');
      socket.emit('ansi-output', 'WebSocket-based file transfers\r\n');
      socket.emit('ansi-output', 'Real-time chat and messaging\r\n');
      socket.emit('ansi-output', 'Multi-node support\r\n\r\n');

      socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'W': // Write User Parameters (internalCommandW) - 1:1 with AmiExpress user parameters
      socket.emit('ansi-output', '\x1b[36m-= User Parameters =-\x1b[0m\r\n\r\n');

      const currentUser = session.user!;
      socket.emit('ansi-output', `            1. LOGIN NAME..............${currentUser.username}\r\n`);
      socket.emit('ansi-output', `            2. REAL NAME...............${currentUser.realname || 'Not set'}\r\n`);
      socket.emit('ansi-output', `            3. INTERNET NAME...........${currentUser.username.toLowerCase()}\r\n`);
      socket.emit('ansi-output', `            4. LOCATION................${currentUser.location || 'Not set'}\r\n`);
      socket.emit('ansi-output', `            5. PHONE NUMBER............${currentUser.phone || 'Not set'}\r\n`);
      socket.emit('ansi-output', `            6. PASSWORD................ENCRYPTED\r\n`);
      socket.emit('ansi-output', `            7. LINES PER SCREEN........${currentUser.linesPerScreen || 23}\r\n`);
      socket.emit('ansi-output', `            8. COMPUTER................${currentUser.computer || 'Unknown'}\r\n`);
      socket.emit('ansi-output', `            9. SCREEN TYPE.............${currentUser.screenType || 'Web Terminal'}\r\n`);
      socket.emit('ansi-output', `           10. SCREEN CLEAR............${currentUser.ansi ? 'Yes' : 'No'}\r\n`);
      socket.emit('ansi-output', `           11. TRANSFER PROTOCOL.......WebSocket\r\n`);
      socket.emit('ansi-output', `           12. EDITOR TYPE.............Prompt\r\n`);
      socket.emit('ansi-output', `           13. ZOOM TYPE...............QWK\r\n`);
      socket.emit('ansi-output', `           14. AVAILABLE FOR CHAT/OLM..${currentUser.availableForChat ? 'Yes' : 'No'}\r\n\r\n`);

      socket.emit('ansi-output', 'Which to change <CR>= QUIT ? ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { userParameters: true };
      return; // Stay in input mode

    case 'WHO': // Node Information (internalCommandWHO) - 1:1 with AmiExpress WHO
      socket.emit('ansi-output', '\x1b[36m-= Online Users (WHO) =-\x1b[0m\r\n\r\n');

      // Get all online users
      const allOnlineUsers = Array.from(sessions.values())
        .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
        .map(sess => ({
          username: sess.user!.username,
          realname: sess.user!.realname,
          conference: sess.currentConfName,
          idle: Math.floor((Date.now() - sess.lastActivity) / 60000),
          node: 'Web1', // All users on same node for now
          quiet: sess.user!.quietNode
        }));

      if (allOnlineUsers.length === 0) {
        socket.emit('ansi-output', 'No users currently online.\r\n');
      } else {
        socket.emit('ansi-output', 'User Name'.padEnd(16) + 'Real Name'.padEnd(20) + 'Conference'.padEnd(15) + 'Idle  Node\r\n');
        socket.emit('ansi-output', '='.repeat(75) + '\r\n');

        allOnlineUsers.forEach(userInfo => {
          if (!userInfo.quiet || session.user?.secLevel === 255) { // Sysops can see quiet users
            const idleStr = userInfo.idle > 0 ? userInfo.idle.toString().padStart(4) : '    ';
            const quietIndicator = userInfo.quiet ? ' (Q)' : '';
            socket.emit('ansi-output',
              userInfo.username.padEnd(16) +
              userInfo.realname.padEnd(20) +
              userInfo.conference.padEnd(15) +
              idleStr + '  ' +
              userInfo.node + quietIndicator + '\r\n'
            );
          }
        });
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'WHD': // Who's Online - Detailed (internalCommandWHD) - express.e:26104
      socket.emit('ansi-output', '\x1b[36m-= Online Users (Detailed) =-\x1b[0m\r\n\r\n');

      // Get all online users with detailed status
      const detailedOnlineUsers = Array.from(sessions.values())
        .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
        .map(sess => ({
          username: sess.user!.username,
          realname: sess.user!.realname,
          conference: sess.currentConfName,
          idle: Math.floor((Date.now() - sess.lastActivity) / 60000),
          node: 'Web1',
          quiet: sess.user!.quietNode,
          subState: sess.subState || 'UNKNOWN',
          // Determine activity based on substate
          activity: getActivityFromSubState(sess.subState)
        }));

      if (detailedOnlineUsers.length === 0) {
        socket.emit('ansi-output', 'No users currently online.\r\n');
      } else {
        socket.emit('ansi-output', 'User Name'.padEnd(16) + 'Real Name'.padEnd(20) + 'Activity'.padEnd(20) + 'Node\r\n');
        socket.emit('ansi-output', '='.repeat(75) + '\r\n');

        detailedOnlineUsers.forEach(userInfo => {
          if (!userInfo.quiet || session.user?.secLevel === 255) { // Sysops can see quiet users
            const quietIndicator = userInfo.quiet ? ' (Q)' : '';
            socket.emit('ansi-output',
              userInfo.username.padEnd(16) +
              userInfo.realname.padEnd(20) +
              userInfo.activity.padEnd(20) +
              userInfo.node + quietIndicator + '\r\n'
            );
          }
        });
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'X': // Expert Mode Toggle (internalCommandX) - 1:1 with AmiExpress expert mode
      socket.emit('ansi-output', '\x1b[36m-= Expert Mode Toggle =-\x1b[0m\r\n');

      const currentExpert = session.user!.expert;
      session.user!.expert = !currentExpert;

      // Update in database
      await db.updateUser(session.user!.id, { expert: session.user!.expert });

      socket.emit('ansi-output', `Expert mode is now ${session.user!.expert ? 'ON' : 'OFF'}.\r\n`);

      if (session.user!.expert) {
        socket.emit('ansi-output', 'Menu will not be displayed after commands.\r\n');
        socket.emit('ansi-output', 'Type ? for help.\r\n');
      } else {
        socket.emit('ansi-output', 'Menu will be displayed after each command.\r\n');
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'Z': // Zippy Text Search (internalCommandZ) - 1:1 with AmiExpress zippy search
      socket.emit('ansi-output', '\x1b[36m-= Zippy Text Search =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Search for text in file descriptions.\r\n\r\n');
      socket.emit('ansi-output', 'Enter search pattern (or press Enter to cancel): ');

      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { zippySearch: true };
      return; // Stay in input mode

    case 'ZOOM': // Zoo Mail (internalCommandZOOM) - 1:1 with AmiExpress ZOOM
      socket.emit('ansi-output', '\x1b[36m-= Zoo Mail (QWK/FTN Download) =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Download your messages in offline format.\r\n\r\n');

      // Check if user has any unread messages
      const unreadMessages = messages.filter(msg =>
        msg.timestamp > (session.user?.lastLogin || new Date(0)) &&
        (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
      );

      if (unreadMessages.length === 0) {
        socket.emit('ansi-output', 'No unread messages to download.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', `You have ${unreadMessages.length} unread message(s).\r\n\r\n`);
      socket.emit('ansi-output', 'Available formats:\r\n');
      socket.emit('ansi-output', '1. QWK format (standard)\r\n');
      socket.emit('ansi-output', '2. ASCII text format\r\n\r\n');

      socket.emit('ansi-output', '\x1b[32mSelect format (1-2) or press Enter to cancel: \x1b[0m');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { zoomMail: true, unreadMessages };
      return; // Stay in input mode

    case 'VODUP': // Voting Booth (DUPLICATE - real one is earlier) - 1:1 with AmiExpress voting booth
      socket.emit('ansi-output', '\x1b[36m-= Voting Booth =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Participate in community polls and surveys.\r\n\r\n');

      // Check if voting booth is available for this conference
      socket.emit('ansi-output', 'Available voting topics:\r\n\r\n');
      socket.emit('ansi-output', '1. System Features Survey\r\n');
      socket.emit('ansi-output', '2. Conference Improvements\r\n');
      socket.emit('ansi-output', '3. File Area Organization\r\n\r\n');

      socket.emit('ansi-output', '\x1b[32mSelect topic (1-3) or press Enter to cancel: \x1b[0m');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { votingBooth: true };
      return; // Stay in input mode

    case '4': // Edit Any File (internalCommand4) - 1:1 with AmiExpress MicroEmacs
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', '\x1b[36m-= Edit Any File =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This allows you to edit any text file on the system.\r\n\r\n');
      socket.emit('ansi-output', 'Enter full path and filename to edit (or press Enter to cancel): ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for file path input
      session.tempData = { editAnyFile: true };
      return; // Stay in input mode

    case '5': // List System Directories (internalCommand5) - 1:1 with AmiExpress List command
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', '\x1b[36m-= List System Directories =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This works just like the AmigaDos List command.\r\n\r\n');
      socket.emit('ansi-output', 'Enter path to list (or press Enter to cancel): ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for path input
      session.tempData = { listDirectories: true };
      return; // Stay in input mode

    case 'R': // Read Messages (internalCommandR) - express.e:25518-25531
      // Enhanced for Phase 7 Part 2 - improved sorting and display
      // Phase 9: Security/ACS System implemented
      // Phase 10: Message Pointer System integrated
      // TODO for 100% 1:1 compliance:
      // 1. ✅ checkSecurity(ACS_READ_MESSAGE) - express.e:25519 [IMPLEMENTED]
      // 2. ✅ setEnvStat(ENV_MAIL) - express.e:25520 [IMPLEMENTED]
      // 3. parseParams(params) for message range/options - express.e:25521
      // 4. ✅ getMailStatFile(currentConf, currentMsgBase) - express.e:25523 [IMPLEMENTED]
      // 5. checkToolTypeExists(TOOLTYPE_CONF, 'CUSTOM') - custom msgbase check - express.e:25525
      // 6. callMsgFuncs(MAIL_READ) - proper message reader with navigation - express.e:25526

      // Phase 9: Check security permission (express.e:25519)
      if (!checkSecurity(session, ACSCode.READ_MESSAGE)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. You do not have permission to read messages.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:25520)
      setEnvStat(session, EnvStat.MAIL);

      // Phase 10: Load message pointers (express.e:25523 - getMailStatFile, loadMsgPointers)
      const mailStat = await getMailStatFile(session.currentConf, session.currentMsgBase);
      const confBase = await loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);

      // Validate pointers against boundaries (express.e:5037-5049)
      const validatedConfBase = validatePointers(confBase, mailStat);
      session.lastMsgReadConf = validatedConfBase.lastMsgReadConf;
      session.lastNewReadConf = validatedConfBase.lastNewReadConf;

      socket.emit('ansi-output', '\x1b[36m-= Message Reader =-\x1b[0m\r\n');
      socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n\r\n`);

      // Get messages for current conference and message base - sorted by ID (message number)
      const currentMessages = messages.filter(msg =>
        msg.conferenceId === session.currentConf &&
        msg.messageBaseId === session.currentMsgBase &&
        (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
      ).sort((a, b) => a.id - b.id); // Sort by message number

      if (currentMessages.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo messages in this area.\x1b[0m\r\n');
      } else {
        // Phase 10: Count unread based on lastNewReadConf pointer (not lastLogin)
        const unreadCount = currentMessages.filter(msg =>
          msg.id > session.lastNewReadConf
        ).length;

        socket.emit('ansi-output', `Total messages: ${currentMessages.length} `);
        if (unreadCount > 0) {
          socket.emit('ansi-output', `(\x1b[33m${unreadCount} new\x1b[0m)`);
        }
        socket.emit('ansi-output', '\r\n\r\n');

        // Phase 10: Track highest message number viewed for pointer update
        let highestMsgRead = session.lastMsgReadConf;

        currentMessages.forEach((msg, index) => {
          // Phase 10: Mark message as [NEW] if > lastNewReadConf pointer
          const isNew = msg.id > session.lastNewReadConf;
          const newIndicator = isNew ? '\x1b[33m[NEW]\x1b[0m ' : '';
          const privateIndicator = msg.isPrivate ? '\x1b[31m[PRIVATE]\x1b[0m ' : '';
          const replyIndicator = msg.parentId ? '\x1b[35m[REPLY]\x1b[0m ' : '';

          socket.emit('ansi-output', `\x1b[36mMessage ${index + 1} of ${currentMessages.length} (Msg #${msg.id})\x1b[0m\r\n`);
          socket.emit('ansi-output', `${newIndicator}${privateIndicator}${replyIndicator}\x1b[1;37m${msg.subject}\x1b[0m\r\n`);
          socket.emit('ansi-output', `\x1b[32mFrom:\x1b[0m ${msg.author}\r\n`);
          if (msg.isPrivate && msg.toUser) {
            socket.emit('ansi-output', `\x1b[32mTo:\x1b[0m ${msg.toUser}\r\n`);
          }
          socket.emit('ansi-output', `\x1b[32mDate:\x1b[0m ${msg.timestamp.toLocaleString()}\r\n\r\n`);
          socket.emit('ansi-output', `${msg.body}\r\n\r\n`);
          if (msg.attachments && msg.attachments.length > 0) {
            socket.emit('ansi-output', `\x1b[36mAttachments:\x1b[0m ${msg.attachments.join(', ')}\r\n\r\n`);
          }
          socket.emit('ansi-output', '\x1b[36m' + '-'.repeat(60) + '\x1b[0m\r\n');

          // Phase 10: Update lastMsgReadConf to highest message viewed
          if (msg.id > highestMsgRead) {
            highestMsgRead = msg.id;
          }
        });

        // Phase 10: Update and save read pointer (express.e:11985+ readMSG logic)
        if (highestMsgRead > session.lastMsgReadConf) {
          session.lastMsgReadConf = highestMsgRead;
          await updateReadPointer(session.user.id, session.currentConf, session.currentMsgBase, highestMsgRead);
        }
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      // Like AmiExpress: set menuPause=FALSE so menu doesn't display immediately
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL; // Wait for key press
      return; // Don't call displayMainMenu

    case 'A': // Post Message (internalCommandE - message entry)
      // Enhanced for Phase 7 Part 2 - added conference context
      // Start message posting workflow - prompt for subject first
      socket.emit('ansi-output', '\x1b[36m-= Post Message =-\x1b[0m\r\n');
      socket.emit('ansi-output', `Posting to: ${session.currentConfName}\r\n`);
      socket.emit('ansi-output', '\r\nEnter your message subject (or press Enter to abort):\r\n');
      socket.emit('ansi-output', '\x1b[32mSubject: \x1b[0m');
      session.inputBuffer = ''; // Clear input buffer
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
      return; // Don't call displayMainMenu - stay in input mode

    case 'E': // Enter Message (internalCommandE) - express.e:24860-24872
      // Enhanced for Phase 7 Part 2 - improved prompts and validation
      // Phase 9: Security/ACS System implemented
      // TODO for 100% 1:1 compliance:
      // 1. ✅ checkSecurity(ACS_ENTER_MESSAGE) - express.e:24861 [IMPLEMENTED]
      // 2. ✅ setEnvStat(ENV_MAIL) - express.e:24862 [IMPLEMENTED]
      // 3. parseParams(params) for message options - express.e:24863
      // 4. checkToolTypeExists(TOOLTYPE_CONF, 'CUSTOM') - custom msgbase - express.e:24864
      // 5. callMsgFuncs(MAIL_CREATE) -> EnterMSG() - full message editor - express.e:24865

      // Phase 9: Check security permission (express.e:24861)
      if (!checkSecurity(session, ACSCode.ENTER_MESSAGE)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. You do not have permission to post messages.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      // Phase 9: Set environment status (express.e:24862)
      setEnvStat(session, EnvStat.MAIL);

      // Start private message posting workflow
      socket.emit('ansi-output', '\x1b[36m-= Post Private Message =-\x1b[0m\r\n');
      socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n\r\n`);
      socket.emit('ansi-output', 'Enter recipient username (or press Enter to abort):\r\n');
      socket.emit('ansi-output', '\x1b[32mTo: \x1b[0m');
      session.inputBuffer = ''; // Clear input buffer
      session.tempData = { isPrivate: true };
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
      return; // Don't call displayMainMenu - stay in input mode

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

    case 'JM': // Join Message Base (internalCommandJM)
      socket.emit('ansi-output', '\x1b[36m-= Join Message Base =-\x1b[0m\r\n');

      // Check if there's a JoinMsgBase{sec}.txt file to display
      // Note: In web version, we don't have file system access, so we'll show a generic message
      socket.emit('ansi-output', 'Selecting message base...\r\n\r\n');

      // Display available message bases for current conference
      const currentConfBases = messageBases.filter(mb => mb.conferenceId === session.currentConf);
      if (currentConfBases.length === 0) {
        socket.emit('ansi-output', 'No message bases available in this conference.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', 'Available message bases:\r\n');
      currentConfBases.forEach(mb => {
        const currentIndicator = mb.id === session.currentMsgBase ? ' \x1b[32m<-- Current\x1b[0m' : '';
        socket.emit('ansi-output', `${mb.id}. ${mb.name}${currentIndicator}\r\n`);
      });

      // Like AmiExpress: If params provided (e.g., "jm 2"), process immediately
      if (params.trim()) {
        const msgBaseId = parseInt(params.trim());
        const selectedBase = currentConfBases.find(mb => mb.id === msgBaseId);
        if (selectedBase) {
          session.currentMsgBase = msgBaseId;
          socket.emit('ansi-output', `\r\n\x1b[32mJoined message base: ${selectedBase.name}\x1b[0m\r\n`);
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        } else {
          socket.emit('ansi-output', '\r\n\x1b[31mInvalid message base number.\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        }
      } else {
        // No params - prompt for input
        socket.emit('ansi-output', '\r\n\x1b[32mMessage base number: \x1b[0m');
        session.subState = LoggedOnSubState.CONFERENCE_SELECT; // Reuse for message base selection
        session.tempData = { messageBaseSelect: true, currentConfBases };
        return; // Stay in input mode
      }
      break;

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

    case 'O': // Operator Page (internalCommandO) - Sysop Chat
      // Check if user is already paging
      if (chatState.pagingUsers.includes(session.user!.id)) {
        socket.emit('ansi-output', '\r\n\x1b[31mYou are already paging the sysop.\x1b[0m\r\n\r\n');
        break;
      }

      // Check page limits (like pagesAllowed in AmiExpress)
      const userPagesRemaining = session.user?.secLevel === 255 ? -1 : 3; // Sysop unlimited, users limited

      if (userPagesRemaining !== -1 && userPagesRemaining <= 0) {
        socket.emit('ansi-output', '\x1b[36m-= Comment to Sysop =-\x1b[0m\r\n');
        socket.emit('ansi-output', 'You have exceeded your paging limit.\r\n');
        socket.emit('ansi-output', 'You can use \'C\' to leave a comment.\r\n\r\n');
        break;
      }

      // Check if sysop is available (like sysopAvail in AmiExpress)
      if (!chatState.sysopAvailable && (session.user?.secLevel || 0) < 200) { // 200 = override level
        socket.emit('ansi-output', '\r\n\x1b[31mSorry, the sysop is not around right now.\x1b[0m\r\n');
        socket.emit('ansi-output', 'You can use \'C\' to leave a comment.\r\n\r\n');
        break;
      }

      // Start paging process (like ccom() in AmiExpress)
      startSysopPage(socket, session);
      return; // Don't continue to menu display


    case 'T': // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return;

    case 'B': // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, commandArgs);
      return;

    case 'H': // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, commandArgs);
      return;

    case 'M': // Toggle ANSI Color (internalCommandM) - express.e:25239-25249
      // 1:1 port: Simple toggle for ANSI color on/off
      if (session.ansiColour === false || session.ansiColour === undefined) {
        session.ansiColour = true;
        socket.emit('ansi-output', '\r\n\x1b[32mAnsi Color On\x1b[0m\r\n');
      } else {
        session.ansiColour = false;
        socket.emit('ansi-output', '\r\nAnsi Color Off\r\n');
      }
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'NM': // New Messages (internalCommandNM) - express.e:25281
      // TODO: Implement new message scan from express.e
      socket.emit('ansi-output', '\x1b[36m-= New Messages =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Scanning for new messages...\r\n\r\n');

      // Count new messages since last login
      const newMessages = messages.filter(msg =>
        msg.conferenceId === session.currentConf &&
        msg.timestamp > (session.user?.lastLogin || new Date(0))
      );

      if (newMessages.length > 0) {
        socket.emit('ansi-output', `Found ${newMessages.length} new message(s) in this conference.\r\n`);
      } else {
        socket.emit('ansi-output', 'No new messages.\r\n');
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'CM': // Clear Message Scan Pointers (internalCommandCM) - express.e:24843
      // Like AmiExpress: Clear message scan pointers so all messages appear as "new"
      socket.emit('ansi-output', '\x1b[36m-= Clear Message Scan =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This will mark all messages as unread.\r\n');
      socket.emit('ansi-output', 'Are you sure? (Y/N): ');
      // TODO: Implement confirmation and clear scan pointers
      socket.emit('ansi-output', '\r\n\x1b[33mNot yet implemented.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'G': // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, commandArgs);
      return;

    case 'GR': // Greets (internalCommandGreets) - express.e:24411-24423
      // Tribute to the Amiga demo scene
      socket.emit('ansi-output', '\r\n\x1b[36mIn memory of those who came before us...\x1b[0m\r\n\r\n');

      socket.emit('ansi-output', '\x1b[34m[\x1b[0mscoopex\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mlsd\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mskid row\x1b[34m]\x1b[0m \x1b[34m[\x1b[0malpha flight\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mtrsi\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mbamiga sector one\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mfairlight\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mdefjam\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mparadox\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mlegend\x1b[34m]\x1b[0m \x1b[34m[\x1b[0manthrox\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mcrystal\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mangels\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mvision factory\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mzenith\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mslipstream\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mdual crew\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mdelight\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mshining\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mquartex\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mglobal overdose\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mparanoimia\x1b[34m]\x1b[0m \x1b[34m[\x1b[0msupplex\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mclassic\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mhoodlum\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0maccumulators\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mhellfire\x1b[34m]\x1b[0m \x1b[34m[\x1b[0moracle\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mendless piracy\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mhqc\x1b[34m]\x1b[0m \x1b[34m[\x1b[0msetrox\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mprodigy\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mprestige\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mnemesis\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mgenesis\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mloonies\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mhorizon\x1b[34m]\x1b[0m \x1b[34m[\x1b[0magile\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mcrack inc\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mvalhalla\x1b[34m]\x1b[0m \x1b[34m[\x1b[0msunflex inc\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mministry\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mthe band\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mrazor1911\x1b[34m]\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[34m[\x1b[0mconqueror and zike\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mmad\x1b[34m]\x1b[0m \x1b[34m[\x1b[0mthe company\x1b[34m]\x1b[0m\r\n\r\n');

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'C': // Comment to Sysop (internalCommandC)
      socket.emit('ansi-output', '\x1b[36m-= Comment to Sysop =-\x1b[0m\r\n');

      // Like AmiExpress: This is exactly the same as ENTER MESSAGE except addressed to sysop
      socket.emit('ansi-output', 'Enter your comment to the sysop (press Enter to abort):\r\n');
      socket.emit('ansi-output', 'Subject: ');

      session.inputBuffer = ''; // Clear input buffer
      session.tempData = { isCommentToSysop: true };
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
      return; // Don't call displayMainMenu - stay in input mode

    case 'CF': // Comment with Flags (internalCommandCF) - express.e:24672
      // Phase 9: Security/ACS System implemented
      // ✅ checkSecurity(ACS_CONFFLAGS) - express.e:24684 [IMPLEMENTED]

      // Phase 9: Check security permission (express.e:24684)
      if (!checkSecurity(session, ACSCode.CONFFLAGS)) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Conference flag privileges required.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      socket.emit('ansi-output', '\x1b[36m-= Conference Flags =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Manage which conferences are flagged for scanning.\r\n\r\n');

      // TODO for 100% 1:1: Implement full conference flag management - express.e:24685-24750
      // This requires:
      // - Display list of conferences with current flag status
      // - Allow toggle of individual conference flags
      // - Parse flag patterns like "1,3-5,7" for bulk changes
      // - Save conference flag preferences per user
      // - Database table for user conference flags

      socket.emit('ansi-output', '\x1b[33mConference flag management not yet implemented.\x1b[0m\r\n');
      socket.emit('ansi-output', 'This allows you to select which conferences to scan for new messages.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'Q': // Quiet Mode Toggle (internalCommandQ) - express.e:25504-25516
      handleQuietModeCommand(socket, session);
      return;

    case 'X': // Expert Mode Toggle (internalCommandX) - express.e:26113
      // Toggle expert mode (shortcuts vs full commands)
      if (session.user?.expert === 'X') {
        // Disable expert mode
        socket.emit('ansi-output', '\r\n\x1b[33mExpert mode disabled\x1b[0m\r\n');
        session.user.expert = 'N';
        if (session.user) {
          await db.updateUser(session.user.id, { expert: 'N' });
        }
      } else {
        // Enable expert mode
        socket.emit('ansi-output', '\r\n\x1b[33mExpert mode enabled\x1b[0m\r\n');
        if (session.user) {
          session.user.expert = 'X';
          await db.updateUser(session.user.id, { expert: 'X' });
        }
      }
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case '?': // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      handleQuestionMarkCommand(socket, session);
      return;

    case '^': // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089
      // Searches for help files in BBS:Help/ directory
      socket.emit('ansi-output', '\x1b[36m-= Help File Viewer =-\x1b[0m\r\n');

      // TODO for 100% 1:1: Implement full help file search - express.e:25089-25111
      // This should:
      // 1. Take params as partial filename (e.g., "^upload" looks for "help/upload")
      // 2. Use findSecurityScreen() to find help file with correct security level
      // 3. Display the help file with doPause()
      // 4. If not found, try removing last character and searching again (progressive search)
      // 5. Continue until file found or params empty

      if (params.trim()) {
        socket.emit('ansi-output', `Looking for help on: ${params}\r\n\r\n`);
        socket.emit('ansi-output', '\x1b[33mHelp file system not yet implemented.\x1b[0m\r\n');
        socket.emit('ansi-output', 'This would search for matching help files in BBS:Help/\r\n');
      } else {
        socket.emit('ansi-output', 'Usage: ^ <topic>\r\n');
        socket.emit('ansi-output', 'Example: ^upload (shows help on uploading files)\r\n');
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
