/**
 * Command Handler
 * Central command router and menu system
 * Handles all BBS command processing and routing
 * 1:1 port from AmiExpress express.e command processing
 */

import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { validateFilename, checkForFile } from '../utils/file-upload.util';
import * as path from 'path';
import * as fs from 'fs';

// Import from other handlers
import { displayScreen, doPause, hasKeysFile } from './screen.handler';
import { displayConferenceBulletins, joinConference } from './conference.handler';
import { displayDoorMenu, executeDoor } from './door.handler';
import { startSysopPage } from './chat.handler';
import {
  displayFileList,
  displayFileMaintenance,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface,
  startFileUpload
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
  FileMaintenanceHandler,
  setFileMaintenanceDependencies
} from './file-maintenance.handler';
import {
  handleCFFlagSelectInput,
  handleCFConfSelectInput
} from './advanced-commands.handler';
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
import { WebhookCommandsHandler } from './webhook-commands.handler';
import { displaySysopMenu, handleSysopMenuInput } from './sysop-menu.handler';
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
  handleFlagInput,
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
  setPreferenceChatCommandsDependencies
} from './preference-chat-commands.handler';
import {
  handleLiveChatCommand
} from './chat-commands.handler';
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
  handleCMInput,
  handleCMNumericInput,
  setMessageCommandsDependencies
} from './message-commands.handler';
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
  handleVoteTopicSelect,
  handleVoteAnswerInput,
  handleVoteMenuChoice,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies
} from './transfer-misc-commands.handler';
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  handleMessageReaderNav,
  setMessagingDependencies
} from './messaging.handler';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand,
  loadCommands,
  setCommandExecutionDependencies
} from './command-execution.handler';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';

// Import security/ACS system
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
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
  handleMessageInsertTextInput
} from './message-entry.handler';

// Import utilities
import { AnsiUtil } from '../utils/ansi.util';

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

// Re-export command loading functions for index.ts
export { loadCommands, setCommandExecutionDependencies } from './command-execution.handler';

// Constants (injected)
let SCREEN_MENU: string = 'MENU';

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
  console.log('🔧 setProcessOlmMessageQueue called, fn type:', typeof fn);
  processOlmMessageQueue = fn;
  console.log('🔧 processOlmMessageQueue set, now type:', typeof processOlmMessageQueue);
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

export async function displayMainMenu(socket: any, session: BBSSession) {
  console.log('displayMainMenu called, current subState:', session.subState, 'menuPause:', session.menuPause);
  console.log('🔍 processOlmMessageQueue type:', typeof processOlmMessageQueue);

  // Like AmiExpress: only display menu if menuPause is TRUE
  if (session.menuPause) {
    console.log('menuPause is TRUE, displaying menu');

    // Express.e:28584 - IF (menuPause) THEN doPause()
    const { doPause } = require('./screen.handler');
    doPause(socket, session);

    // Clear screen before displaying menu (like AmiExpress does)
    console.log('Sending screen clear: \\x1b[2J\\x1b[H');
    socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and move cursor to top

    // Like express.e:28594 - process OLM message queue AFTER clearing screen but BEFORE menu
    // This ensures messages are visible and not immediately erased
    if (typeof processOlmMessageQueue === 'function') {
      processOlmMessageQueue(socket, session, true);
    } else {
      console.warn('⚠️  processOlmMessageQueue not injected yet, skipping OLM queue processing');
    }

    // Like express.e:6567 - default cmdShortcuts to FALSE (line input mode)
    session.cmdShortcuts = false;

    // CRITICAL FIX: Correct condition from express.e:28583
    // Express.e:28583 - IF ((loggedOnUser.expert="N") AND (doorExpertMode=FALSE)) OR (checkToolTypeExists(TOOLTYPE_CONF,currentConf,'FORCE_MENUS'))
    // Note: Database stores expert as BOOLEAN (true/false), not string ("Y"/"N")
    console.log('🔍 [Menu Display] Checking expert mode:');
    const relConfNumber = session.relConfNum || 1;
    const forceMenus = getConferenceToolFlags(relConfNumber).forceMenus;
    console.log('  - session.user?.expert:', session.user?.expert);
    console.log('  - session.doorExpertMode:', session.doorExpertMode);
    console.log('  - forceMenus tooltype:', forceMenus);
    console.log('  - Will display menu?', (session.user?.expert === false && !session.doorExpertMode) || forceMenus);

    if ((session.user?.expert === false && !session.doorExpertMode) || forceMenus) {
      console.log('Displaying menu screen file');
      // Phase 8: Use authentic screen file system (express.e:28586 - await displayScreen(SCREEN_MENU))
      const screenDisplayed = await displayScreen(socket, session, SCREEN_MENU);

      // Like express.e:6572-6573 - check for .keys file and set cmdShortcuts accordingly
      if (screenDisplayed && hasKeysFile(SCREEN_MENU, session.currentConf)) {
        console.log('✓ .keys file exists, enabling hotkey mode (cmdShortcuts = true)');
        session.cmdShortcuts = true;
      } else {
        console.log('No .keys file, using line input mode (cmdShortcuts = false)');
      }
    }

    displayMenuPrompt(socket, session);

    // Reset menuPause after using it (prevents repeated pauses)
    session.menuPause = false;
  } else {
    console.log('menuPause is FALSE, NOT displaying menu - staying in command mode');
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

// Display menu prompt (displayMenuPrompt equivalent)
export function displayMenuPrompt(socket: any, session: BBSSession) {
  console.log('📋 displayMenuPrompt called');
  const cfg = config;
  const msgBases = messageBases || [];

  if (!cfg || typeof cfg.get !== 'function') {
    console.warn('[Menu Prompt] Config not injected; skipping menu prompt render.');
    session.subState = LoggedOnSubState.READ_COMMAND;
    return;
  }

  console.log('  - bbsName:', cfg.get('bbsName'));
  console.log('  - currentConf:', session.currentConf);
  console.log('  - currentConfName:', session.currentConfName);
  console.log('  - relConfNum:', session.relConfNum);
  console.log('  - currentMsgBase:', session.currentMsgBase);
  console.log('  - timeRemaining:', session.timeRemaining);

  // Process queued OLM messages before showing prompt - express.e:1464-1473
  const { processOlmQueue } = require('./olm.handler');
  if (processOlmQueue) {
    processOlmQueue(socket, session);
  }

  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = cfg.get('bbsName') ?? 'AmiExpress Web';
  const timeLeft = Math.floor(session.timeRemaining);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = msgBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = msgBases.find(mb => mb.id === session.currentMsgBase);

  console.log('  - msgBasesInConf.length:', msgBasesInConf.length);
  console.log('  - currentMsgBase found:', !!currentMsgBase);

  if (msgBasesInConf.length > 1 && currentMsgBase) {
    // Multiple message bases: show "ConfName - MsgBaseName"
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log('📋 Sending multi-msgbase prompt:', prompt);
    socket.emit('ansi-output', prompt);
  } else {
    // Single message base: just show conference name
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${session.currentConfName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log('📋 Sending single-msgbase prompt:', prompt);
    socket.emit('ansi-output', prompt);
  }

  console.log('📋 Setting subState to READ_COMMAND');
  session.subState = LoggedOnSubState.READ_COMMAND;
}

// Handle user commands (processCommand equivalent)
export async function handleCommand(socket: any, session: BBSSession, data: string) {
  console.log('=== handleCommand called ===');
  console.log('data:', JSON.stringify(data));
  console.log('session.state:', session.state);
  console.log('session.subState:', session.subState);
  const isAwaitScreenRunning = session.pendingScreenCommand && session.executingScreenCommand;
  const allowScreenCommand = !!session.executingScreenCommand;
  const trimmedScreenCommand = (data || '').trim();
  const isScreenDoorsPath = /^DOORS:/i.test(trimmedScreenCommand);
  if (allowScreenCommand) {
    console.log('[handleCommand] Executing screen-initiated command (state bypass enabled)');
  }

  // NOTE: Door input routing is handled in socket-handlers.ts (checks doorInputHandler)
  // This function should only be called for non-door input

  // If user is responding to a paginated screen prompt, handle that first
  if (session.paginatedScreen) {
    const { handlePaginatedScreenInput } = require('./screen.handler');
    try {
      const handled = await handlePaginatedScreenInput(socket, session, data);
      if (handled) {
        return;
      }
    } catch (error) {
      console.error('[handleCommand] Error handling paginated screen input:', error);
      session.paginatedScreen = undefined;
      session.queuedScreenCommands = [];
    }
  }

  // Special handling for WHO2 helper tools (NI/NO) - these must run without authentication
  // NI (NodeIn) executes on connection, NO (NodeOut) executes on logout
  // They create tracking files that WHO2 door reads to display connected users
  if (data === 'DOORS:who/NI' || data === 'DOORS:who/No') {
    console.log(`[WHO2] Executing helper tool: ${data}`);
    const fs = require('fs');
    const path = require('path');
    const nodeId = session.nodeId || 0;
    const username = session.user?.username || 'Guest';
    const whoDir = path.join(process.cwd(), '../../doors/who');

    try {
      // Ensure directory exists
      if (!fs.existsSync(whoDir)) {
        fs.mkdirSync(whoDir, { recursive: true });
      }

      if (data === 'DOORS:who/NI') {
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
  if (allowScreenCommand && trimmedScreenCommand.length > 0 && !isScreenDoorsPath) {
    const normalized = trimmedScreenCommand.toUpperCase();
    const parts = normalized.split(/\s+/);
    const command = parts[0];
    const params = parts.slice(1).join(' ');
    console.log('[handleCommand] Running screen command immediately:', command, params);
    try {
      await processCommand(socket, session, command, params);
    } catch (error) {
      console.error('[handleCommand] Screen command failed:', error);
    }
    return;
  }

  // Handle pre-login connection flow (AWAIT state)
  if (!allowScreenCommand && session.state === BBSState.AWAIT) {
    if (session.subState === LoggedOnSubState.DISPLAY_CONNECT) {
      // User pressed key after connection screen (welcome + node list)
      // reference-board BBS layout: everything shown on connect, now just show ANSI prompt
      // express.e:29528 - ANSI prompt
      console.log('📋 Connection screen viewed, showing ANSI prompt');
      session.subState = LoggedOnSubState.ANSI_PROMPT;
      session.tempData = { inputBuffer: '' }; // Initialize input buffer
      if (session.pendingScreenCommand) {
        console.log('[handleCommand] Await screen command still running, deferring prompt');
        session.pendingScreenCommand.then(() => {
          if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
            socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
          }
        }).catch(error => {
          console.error('[handleCommand] Pending screen command rejected:', error);
          socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
        });
      } else {
        socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
      }
      return;
    }

    if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
      if (session.pendingScreenCommand) {
        console.log('[handleCommand] ANSI prompt input ignored until screen command completes');
        return;
      }
      // express.e:29530-29546 - Line input for ANSI prompt (not single keypress!)
      // Buffer input until Enter is pressed
      if (data === '\r') {
        // Enter pressed - process the buffered input
        const answer = (session.tempData?.inputBuffer || '').toUpperCase();
        console.log('📋 Graphics prompt response:', answer || '(empty = ANSI)');

        // express.e:29538-29546 - Check for specific letters in the string
        // Default (empty/just Enter) = ANSI enabled
        const hasN = answer.includes('N'); // No graphics
        const hasR = answer.includes('R'); // RIP mode
        const hasP = answer.includes('P'); // PETSCII mode
        const hasQ = answer.includes('Q'); // Quick logon

        // express.e:29538-29539 - If 'N' in string, disable ANSI
        session.ansiEnabled = !hasN;

        // express.e:29543-29544 - Quick logon flag (for future use)
        if (hasQ) {
          session.tempData.quickLogon = true;
        }

        // express.e:29545 - RIP mode flag (for future use)
        if (hasR) {
          session.tempData.ripMode = true;
        }

        // PETSCII mode - C64/128 terminal mode (40x25 display, .seq files)
        if (hasP) {
          session.petsciiMode = true;
          session.ansiEnabled = true; // PETSCII needs ANSI codes
          session.tempData.termWidth = 40;
          session.tempData.termHeight = 25;
          console.log('📋 PETSCII mode enabled: 40x25 terminal');
        }

        console.log('📋 Graphics mode set:', session.petsciiMode ? 'PETSCII' : session.ansiEnabled ? 'ANSI/RIP' : 'None');

        // express.e:29551 - Display BBSTITLE screen and immediately show login prompt
        session.tempData.inputBuffer = ''; // Clear buffer
        const { displayScreen } = require('./screen.handler');
        await displayScreen(socket, session, 'BBSTITLE');

        // Immediately transition to login state (no key press required)
        session.state = BBSState.LOGON;
        session.subState = undefined;
        socket.emit('ansi-output', '\r\n\r\n');
        socket.emit('prompt-login'); // Tell frontend to show login form
        return;
      } else if (data === '\x7f' || data === '\b') {
        // Backspace - remove last character from buffer
        if (session.tempData?.inputBuffer && session.tempData.inputBuffer.length > 0) {
          session.tempData.inputBuffer = session.tempData.inputBuffer.slice(0, -1);
          socket.emit('ansi-output', '\b \b'); // Echo backspace
        }
        return;
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        // Printable character - add to buffer and echo it
        session.tempData.inputBuffer = (session.tempData?.inputBuffer || '') + data;
        socket.emit('ansi-output', data); // Echo the character
        return;
      }
      // Ignore other control characters
      return;
    }

    if (session.subState === LoggedOnSubState.DISPLAY_BBSTITLE) {
      // User pressed key after BBSTITLE, now ready for login
      console.log('📋 BBSTITLE viewed, transitioning to login');
      session.state = BBSState.LOGON;
      session.subState = undefined;
      socket.emit('ansi-output', '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
      socket.emit('prompt-login'); // Tell frontend to show login form
      return;
    }

    return;
  }

  // Allow LOGGEDON, LOGON, and REGISTERING states to continue
  // LOGON is allowed temporarily due to session state race conditions
  if (!allowScreenCommand &&
    session.state !== BBSState.LOGGEDON &&
    session.state !== BBSState.LOGON &&
    session.state !== BBSState.REGISTERING) {
    console.log('❌ Not in LOGGEDON/LOGON or REGISTERING state, ignoring command');
    console.log('   Current state:', session.state);
    return;
  }

  // PRIORITY 1: Handle internode chat mode input - REAL-TIME keystroke transmission
  // When user is in active chat session, transmit each keystroke immediately
  if (session.subState === LoggedOnSubState.CHAT) {
    console.log('💬 [COMMAND] User in CHAT mode, real-time input');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    const { handleChatKeystroke } = require('./internode-chat.handler');

    // Handle arrow keys for cursor movement (left/right navigation)
    if (data === '\x1b[D') {
      // Left arrow - just move cursor left locally (don't transmit)
      socket.emit('ansi-output', '\x1b[D');
      return;
    }
    else if (data === '\x1b[C') {
      // Right arrow - just move cursor right locally (don't transmit)
      socket.emit('ansi-output', '\x1b[C');
      return;
    }
    // Ignore up/down arrows
    else if (data === '\x1b[A' || data === '\x1b[B') {
      return;
    }

    // Handle Enter key - finalize message
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();

      // Echo newline to move cursor to next line (express.e:2342)
      socket.emit('ansi-output', '\r\n');

      // Check for /END or /EXIT command
      if (input.toUpperCase() === '/END' || input.toUpperCase() === '/EXIT') {
        console.log('💬 [COMMAND] User wants to end chat');
        const { handleChatEnd } = require('./internode-chat.handler');
        await handleChatEnd(socket, session);
        return;
      }

      // Check for /HELP command
      if (input.toUpperCase() === '/HELP') {
        console.log('💬 [COMMAND] User requested help');
        socket.emit('ansi-output',
          '\r\n' +
          '\x1b[36mChat Mode Commands:\x1b[0m\r\n' +
          '  \x1b[33m/END\x1b[0m or \x1b[33m/EXIT\x1b[0m  - End chat session\r\n' +
          '  \x1b[33m/HELP\x1b[0m             - Show this help\r\n' +
          '  \x1b[33m<text>\x1b[0m            - Send message (max 500 chars)\r\n' +
          '\r\n'
        );
        session.inputBuffer = '';
        return;
      }

      // Regular message - finalize and send to scroll area
      if (input.length > 0) {
        console.log('💬 [COMMAND] Finalizing message:', input);
        const { handleChatMessage } = require('./internode-chat.handler');
        await handleChatMessage(socket, session, { message: input });
        session.inputBuffer = ''; // Clear buffer after sending
      }
    }
    // Handle Backspace - real-time transmission
    else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Echo backspace to local terminal (express.e:2307-2319)
        socket.emit('ansi-output', '\b \b');
        // Don't transmit backspace if we're typing a command
        const isCommand = session.inputBuffer.trim().startsWith('/');
        if (!isCommand) {
          await handleChatKeystroke(socket, session, { keystroke: '\x7f' });
        }
      }
    }
    // Handle printable characters - real-time transmission
    else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character to local terminal (express.e:2342)
      socket.emit('ansi-output', data);
      // Don't transmit commands (starting with /) to partner
      const isCommand = session.inputBuffer.trim().startsWith('/');
      if (!isCommand) {
        await handleChatKeystroke(socket, session, { keystroke: data });
      }
    }
    return;
  }

  // PRIORITY 2: Handle group chat room mode input
  // When user is in a chat room, intercept all input
  if (session.subState === LoggedOnSubState.CHAT_ROOM) {
    console.log('💬 User in CHAT_ROOM mode, handling room input');
    const input = data.trim();

    // Check for /LEAVE or /EXIT command
    if (input.toUpperCase() === '/LEAVE' || input.toUpperCase() === '/EXIT') {
      const { handleRoomLeave } = require('./group-chat.handler');
      await handleRoomLeave(socket, session);
      return;
    }

    // Check for /WHO command
    if (input.toUpperCase() === '/WHO') {
      const members = await db.getRoomMembers(session.currentRoomId);
      socket.emit('ansi-output', '\r\n\x1b[36mUsers in room (' + members.length + '):\x1b[0m\r\n');
      for (const member of members) {
        const modBadge = member.is_moderator ? ' \x1b[33m[MOD]\x1b[0m' : '';
        const muteBadge = member.is_muted ? ' \x1b[31m[MUTED]\x1b[0m' : '';
        socket.emit('ansi-output', '  ' + member.username + modBadge + muteBadge + '\r\n');
      }
      socket.emit('ansi-output', '\r\n');
      return;
    }

    // Check for /HELP command
    if (input.toUpperCase() === '/HELP') {
      socket.emit('ansi-output',
        '\r\n' +
        '\x1b[36mChat Room Commands:\x1b[0m\r\n' +
        '  \x1b[33m/LEAVE\x1b[0m or \x1b[33m/EXIT\x1b[0m  - Leave the room\r\n' +
        '  \x1b[33m/WHO\x1b[0m               - List users in room\r\n' +
        '  \x1b[33m/HELP\x1b[0m              - Show this help\r\n' +
        '  \x1b[33m<text>\x1b[0m             - Send message (max 500 chars)\r\n' +
        '\r\n'
      );
      return;
    }

    // Regular message - send to room
    if (input.length > 0) {
      const { handleRoomMessage } = require('./group-chat.handler');
      await handleRoomMessage(socket, session, { message: input });
    }
    return;
  }

  // PRIORITY 3: Handle LIVECHAT user selection
  // When user is selecting from numbered list
  if (session.subState === LoggedOnSubState.LIVECHAT_SELECT_USER) {
    console.log('💬 [LIVECHAT] User selecting from numbered list');
    const { handleLiveChatSelection } = require('./chat-commands.handler');
    await handleLiveChatSelection(socket, session, data);
    return;
  }

  // PRIORITY 4: Handle LIVECHAT invitation Y/n response
  // When user is responding to a chat invitation
  if (session.subState === LoggedOnSubState.LIVECHAT_INVITATION_RESPONSE) {
    console.log('💬 [LIVECHAT] User responding to invitation with Y/n');
    const { handleLiveChatInvitationResponse } = require('./chat-commands.handler');
    await handleLiveChatInvitationResponse(socket, session, data);
    return;
  }

  // PRIORITY 5: Handle OLM node input
  // When user is entering node number for OLM (line-buffered)
  if (session.subState === LoggedOnSubState.OLM_NODE_INPUT) {
    console.log('📨 [OLM] User entering node number');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const { handleOlmNodeInput } = require('./olm.handler');
      await handleOlmNodeInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        socket.emit('ansi-output', '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      socket.emit('ansi-output', session.maskInput ? '*' : data);
    }
    return;
  }

  // PRIORITY 6: Handle OLM message composition
  // When user is composing OLM message (line-buffered like READ_COMMAND)
  if (session.subState === LoggedOnSubState.OLM_COMPOSE) {
    console.log('📨 [OLM] User composing message');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const { handleOlmComposeInput } = require('./olm.handler');
      await handleOlmComposeInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        socket.emit('ansi-output', '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      socket.emit('ansi-output', session.maskInput ? '*' : data);
    }
    return;
  }

  // PRIORITY 7-16: Handle New User Registration states (express.e:30115-30310)
  if (session.state === BBSState.REGISTERING) {
    console.log('📝 [REGISTRATION] Handling input for subState:', session.subState);
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const newUserHandler = require('./new-user.handler');

      switch (session.subState) {
        case LoggedOnSubState.NEW_USER_NAME:
          await newUserHandler.handleNameInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_ACCESS_PASSWORD:
          await newUserHandler.handleAccessPasswordInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_AUTOVAL:
          await newUserHandler.handleAutoValidationInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_LOCATION:
          await newUserHandler.handleLocationInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PHONE:
          await newUserHandler.handlePhoneInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_EMAIL:
          await newUserHandler.handleEmailInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PASSWORD:
          await newUserHandler.handlePasswordInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM:
          await newUserHandler.handlePasswordConfirm(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_LINES:
          await newUserHandler.handleLinesInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_COMPUTER:
          await newUserHandler.handleComputerInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCREEN_CLEAR:
          await newUserHandler.handleScreenClearInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_CONFIRM:
          await newUserHandler.handleConfirmInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCRIPT:
          await newUserHandler.handleQuestionnaireAnswer(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCRIPT_CONFIRM:
          await newUserHandler.handleQuestionnaireConfirmInput(socket, session, input);
          break;
      }
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        socket.emit('ansi-output', '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      socket.emit('ansi-output', session.maskInput ? '*' : data);
    }
    return;
  }

  // Handle substate-specific input
  if (
    session.subState === LoggedOnSubState.DISPLAY_BULL ||
    session.subState === LoggedOnSubState.DISPLAY_NODE_BULL ||
    session.subState === LoggedOnSubState.CONF_SCAN ||
    session.subState === LoggedOnSubState.DISPLAY_CONF_BULL ||
    session.subState === LoggedOnSubState.DISPLAY_MENU
  ) {
    console.log('📋 In display state, continuing to next state');
    try {
      const confNumber = session.currentConf || session.user?.confRJoin || 1;
      const toolFlags = getConferenceToolFlags(confNumber);
      // If a previous screen deferred commands (runCommands=false), run them now on keypress
      if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
        console.log('📋 Executing queued screen commands before advancing state');
        const { runQueuedScreenCommands } = require('./screen.handler');
        try {
          await runQueuedScreenCommands(socket, session);
        } catch (error) {
          console.error('[handleCommand] Error running queued screen commands:', error);
          session.queuedScreenCommands = [];
          session.pendingScreenCommand = undefined;
          session.screenCommandResolver = null;
        }
        // After queued commands (GLC/GWALL/QuickNew etc.), wait for the next key to move forward
        return;
      }
      // Any key continues to next state
      if (session.subState === LoggedOnSubState.DISPLAY_BULL) {
        // express.e:28555 - IF (displayScreen(SCREEN_BULL)) THEN doPause()
        const skipBull = toolFlags.noBulls;
        if (!skipBull) {
          const shown = await displayScreen(socket, session, 'BULL');
          if (shown && !session.lastScreenHadPause) doPause(socket, session);
        }
        session.subState = LoggedOnSubState.DISPLAY_NODE_BULL;
      } else if (session.subState === LoggedOnSubState.DISPLAY_NODE_BULL) {
        // express.e:28557 - IF (displayScreen(SCREEN_NODE_BULL)) THEN doPause()
        const skipNodeBull = toolFlags.noBulls;
        if (!skipNodeBull) {
          const shown = await displayScreen(socket, session, 'NODE_BULL');
          if (shown && !session.lastScreenHadPause) doPause(socket, session);
        }
        session.subState = LoggedOnSubState.CONF_SCAN;
      } else if (session.subState === LoggedOnSubState.CONF_SCAN) {
        // express.e:28564 - confScan
        const { performConferenceScan } = require('./message-scan.handler');
        await performConferenceScan(socket, session);
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      } else if (session.subState === LoggedOnSubState.DISPLAY_CONF_BULL) {
        // express.e:28565 - IF (displayScreen(SCREEN_CONF_BULL)) THEN doPause()
        if (!toolFlags.noConfBulls) {
          await displayConferenceBulletins(socket, session);
        }
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = true;
      } else if (session.subState === LoggedOnSubState.DISPLAY_MENU) {
        // express.e:28586+ - show menu
        await displayMainMenu(socket, session);
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
   if (session.subState === LoggedOnSubState.FILES_SELECT_AREA) {
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
       // TODO: Implement handleFileDownload function
       // handleFileDownload(socket, session, fileNumber);
       socket.emit('ansi-output', '\r\n\x1b[33mFile download not yet implemented.\x1b[0m\r\n');
       session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
      // TODO: Implement startFileDownload function
      // startFileDownload(socket, session, selectedArea);
      socket.emit('ansi-output', '\r\n\x1b[33mFile download not yet implemented.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    } else {
      // Display files in selected area (like displayIt in AmiExpress)
      // TODO: Implement displayFileAreaContents function
      // displayFileAreaContents(socket, session, selectedArea);
      socket.emit('ansi-output', '\r\n\x1b[33mFile listing not yet implemented.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    }
    return;
  }

  // Handle upload filename input (express.e:17658-17687)
  if (session.subState === LoggedOnSubState.UPLOAD_FILENAME_INPUT) {
    const input = data.trim();

    // Check for abort (A or a alone) - express.e:17667-17671
    if ((input === 'A' || input === 'a') && input.length === 1) {
      socket.emit('ansi-output', '\r\n');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Blank line - start transfer (express.e:17673)
    if (input === '') {
      socket.emit('ansi-output', '\r\n');

      // Check if any files were queued
      if (!session.tempData?.uploadBatch || session.tempData.uploadBatch.length === 0) {
        socket.emit('ansi-output', 'No files queued for upload.\r\n');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      // Start transferring first file
      session.tempData.currentUploadIndex = 0;
      const firstFile = session.tempData.uploadBatch[0];

      socket.emit('show-file-upload', {
        accept: '*/*',
        maxSize: 10 * 1024 * 1024, // 10MB max
        uploadUrl: '/api/upload',
        fieldName: 'file',
        expectedFilename: firstFile.filename
      });

      session.subState = LoggedOnSubState.FILES_UPLOAD;
      return;
    }

    // Validate filename (express.e:17680-17684, 19212-19231)
    const validation = validateFilename(input);
    if (!validation.valid) {
      socket.emit('ansi-output', `\r\n${validation.error}\r\n`);
      socket.emit('ansi-output', `\r\nFileName ${session.tempData.uploadCount}: `);
      return;
    }

    // Check for duplicates (express.e:17685-17689)
    const isDuplicate = await checkForFile(input, session.currentConf);
    if (isDuplicate) {
      socket.emit('ansi-output', 'File Exists, or has a symbol (#?*).\r\n');
      socket.emit('ansi-output', `\r\nFileName ${session.tempData.uploadCount}: `);
      return;
    }

    // Apply filename capitalization if configured (express.e:19257)
    // TODO: Make this configurable via LVL_CAPITOLS_in_FILE
    const capitalizeFilenames = false;  // Default to false for now
    const finalFilename = capitalizeFilenames ? input.toUpperCase() : input;

    // Store current filename
    session.tempData.currentFilename = finalFilename;

    // Prompt for description (express.e:17689-17698)
    const maxDescLines = 10; // max_desclines from config
    socket.emit('ansi-output', `\r\nPlease enter a description, you only have ${maxDescLines} lines.\r\n`);
    socket.emit('ansi-output', 'Press return alone to end.  Begin  with (/) to make upload \'Private\' to Sysop.\r\n');
    socket.emit('ansi-output', '                                [--------------------------------------------]\r\n');
    socket.emit('ansi-output', `\x1b[13D${input.padEnd(13)}\x1b[0m:`); // Show filename with cursor at description start

    // Initialize description storage
    session.tempData.currentDescription = [];
    session.tempData.maxDescLines = maxDescLines;
    session.tempData.descLineCount = 0;

    session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
    return;
  }

  // Handle upload description input (express.e:17700-17717)
  if (session.subState === LoggedOnSubState.UPLOAD_DESC_INPUT) {
    // Initialize line buffer if needed
    if (!session.tempData.currentLineBuffer) {
      session.tempData.currentLineBuffer = '';
    }

    // Handle backspace
    if (data === '\x7f' || data === '\b') {
      if (session.tempData.currentLineBuffer.length > 0) {
        session.tempData.currentLineBuffer = session.tempData.currentLineBuffer.slice(0, -1);
      }
      return;
    }

    // Handle Enter - complete the line
    if (data === '\r' || data === '\n') {
      const input = session.tempData.currentLineBuffer;
      session.tempData.currentLineBuffer = ''; // Clear buffer

      // Blank line ends description (express.e:17704-17707)
      if (input.trim() === '') {
      // Web upload mode: process uploaded file immediately
      if (session.tempData.webUploadMode && session.tempData.currentUploadedFile) {
        const uploadedFile = session.tempData.currentUploadedFile;

        // Add file to batch with description
        session.tempData.uploadBatch.push({
          filename: uploadedFile.filename,
          description: session.tempData.currentDescription.join('\n'),
          isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
        });

        // Set currentUploadIndex to 0 so file-uploaded handler can process it
        session.tempData.currentUploadIndex = 0;

        // Trigger file processing by manually calling file-uploaded logic
        socket.emit('ansi-output', '\r\n\r\n\x1b[36mProcessing upload...\x1b[0m\r\n');

        // Re-emit file-uploaded event with stored file data
        socket.emit('file-uploaded', {
          filename: uploadedFile.filename,
          originalname: uploadedFile.filename,
          size: uploadedFile.size,
          path: uploadedFile.path
        });
        return;
      }

      // Original batch mode: Save file to upload batch
      session.tempData.uploadBatch.push({
        filename: session.tempData.currentFilename,
        description: session.tempData.currentDescription.join('\n'),
        isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
      });

      // Move to next filename
      session.tempData.uploadCount++;
      socket.emit('ansi-output', `\r\nFileName ${session.tempData.uploadCount}: `);
      session.subState = LoggedOnSubState.UPLOAD_FILENAME_INPUT;
      return;
    }

    // Store description line (max 44 chars as shown in express.e:17699)
    const descLine = input.substring(0, 44);
    session.tempData.currentDescription.push(descLine);
    session.tempData.descLineCount++;

    // Check if reached max lines
    if (session.tempData.descLineCount >= session.tempData.maxDescLines) {
      // Save file to upload batch
      session.tempData.uploadBatch.push({
        filename: session.tempData.currentFilename,
        description: session.tempData.currentDescription.join('\n'),
        isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
      });

      // Move to next filename
      session.tempData.uploadCount++;
      socket.emit('ansi-output', `\r\nFileName ${session.tempData.uploadCount}: `);
      session.subState = LoggedOnSubState.UPLOAD_FILENAME_INPUT;
      return;
    }

      // Prompt for next description line (express.e:17747)
      // Format: 32 spaces + ':' (aligns with first line at column 33)
      socket.emit('ansi-output', '                                :');
      return;
    }

    // Regular character - add to buffer (accumulate until Enter)
    if (data.length === 1 && data >= ' ' && data <= '~') {
      session.tempData.currentLineBuffer += data;
    }
    return;
  }

  // Handle file upload state
  if (session.subState === LoggedOnSubState.FILES_UPLOAD) {
    // In web upload mode, ignore key presses - wait for file-uploaded event
    // User is interacting with browser file picker, not terminal
    if (session.tempData?.webUploadMode) {
      console.log('📤 In web upload mode - ignoring key press (waiting for file-uploaded event)');
      return;
    }

    // In terminal mode, any key press cancels upload
    console.log('📤 In file upload state - canceling upload');
    socket.emit('ansi-output', '\r\n\x1b[33mUpload canceled\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Handle USER CONFIGURATION (U command) parameter selection
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.userParameters) {
    const input = data.trim();

    // Empty input (just Enter) = quit back to menu
    if (input.length === 0) {
      console.log('[USER CONFIG] User pressed Enter, returning to menu');
      session.tempData = undefined;
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // TODO: Handle numbered parameter selection (0-14)
    // For now, just return to menu for any input
    socket.emit('ansi-output', '\r\n\x1b[33mParameter editing not yet implemented.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.tempData = undefined;
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Handle WEBHOOK menu input (main menu with arrow navigation)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookMenu) {
    await WebhookCommandsHandler.handleWebhookMenuInput(socket, session, data);
    return;
  }

  // Handle WEBHOOK list menu input (arrow selection of webhooks)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookListMenu) {
    await WebhookCommandsHandler.handleWebhookListInput(socket, session, data);
    return;
  }

  // Handle WEBHOOK actions menu input (enable/disable/test/delete)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookActionsMenu) {
    await WebhookCommandsHandler.handleWebhookActionsInput(socket, session, data);
    return;
  }

  // Handle return to webhook menu
  if (session.tempData?.returnToWebhookMenu && (session.subState as any) === LoggedOnSubState.DISPLAY_CONF_BULL) {
    delete session.tempData;
    await WebhookCommandsHandler.handleWebhookCommand(socket, session);
    return;
  }

  // Handle return to webhook action menu
  if (session.tempData?.returnToWebhookActionMenu && (session.subState as any) === LoggedOnSubState.DISPLAY_CONF_BULL) {
    const menuData = session.tempData.returnToWebhookActionMenu;
    await WebhookCommandsHandler.showWebhookActions(socket, session, menuData.webhookId);
    return;
  }

  // Handle webhook add input (text input for new webhook)
  if (session.tempData?.webhookAdd) {
    await WebhookCommandsHandler.handleAddWebhookInput(socket, session, data.trim());
    return;
  }

  // Handle file list directory input (F command continuation)
  if (session.subState === LoggedOnSubState.FILE_LIST_DIR_INPUT) {
    const { FileListingHandler } = require('./file-listing.handler');
    await FileListingHandler.handleFileListDirInput(socket, session, data.trim());
    return;
  }

  // Handle flag input (A command continuation)
  if (session.subState === LoggedOnSubState.FLAG_INPUT ||
      session.subState === LoggedOnSubState.FLAG_CLEAR_INPUT ||
      session.subState === LoggedOnSubState.FLAG_FROM_INPUT) {
    const { AlterFlagsHandler } = require('./alter-flags.handler');
    await AlterFlagsHandler.handleFlagInput(socket, session, data.trim());
    return;
  }

  // Handle download input (D command continuation)
  if (session.subState === LoggedOnSubState.DOWNLOAD_FILENAME_INPUT) {
    const { DownloadHandler } = require('./download.handler');
    await DownloadHandler.handleFilenameInput(socket, session, data.trim());
    return;
  }

  if (session.subState === LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT) {
    const { DownloadHandler } = require('./download.handler');
    await DownloadHandler.handleConfirmInput(socket, session, data.trim());
    return;
  }

  // Handle view file input (V command continuation)
  if (session.subState === LoggedOnSubState.VIEW_FILE_INPUT) {
    const { ViewFileHandler } = require('./view-file.handler');
    await ViewFileHandler.handleFilenameInput(socket, session, data.trim());
    return;
  }

  // Handle zippy search input (Z command continuation)
  if (session.subState === LoggedOnSubState.ZIPPY_SEARCH_INPUT) {
    const { ZippySearchHandler } = require('./zippy-search.handler');
    await ZippySearchHandler.handleSearchInput(socket, session, data.trim());
    return;
  }

  // Handle batch download confirmation
  if (session.subState === LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM) {
    const { BatchDownloadHandler } = require('./batch-download.handler');
    await BatchDownloadHandler.handleBatchConfirm(socket, session, data.trim());
    return;
  }

  // Handle file maintenance operations
  if (session.tempData?.operation === 'delete_files') {
    // TODO: Implement handleFileDeleteConfirmation function
    // await handleFileDeleteConfirmation(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mFile delete confirmation not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.operation === 'move_files') {
    // TODO: Implement handleFileMoveConfirmation function
    // await handleFileMoveConfirmation(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mFile move confirmation not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Handle account editing operations
  if (session.tempData?.accountEditingMenu) {
    // TODO: Implement handleAccountEditing function
    // handleAccountEditing(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mAccount editing not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.editUserAccount) {
    // TODO: Implement handleEditUserAccount function
    // handleEditUserAccount(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mEdit user account not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.viewUserStats) {
    // TODO: Implement handleViewUserStats function
    // handleViewUserStats(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mView user stats not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.changeSecLevel) {
    // TODO: Implement handleChangeSecLevel function
    // handleChangeSecLevel(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mChange sec level not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.toggleUserFlags) {
    // TODO: Implement handleToggleUserFlags function
    // handleToggleUserFlags(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mToggle user flags not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.deleteUserAccount) {
    // TODO: Implement handleDeleteUserAccount function
    // handleDeleteUserAccount(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mDelete user account not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  if (session.tempData?.searchUsers) {
    // TODO: Implement handleSearchUsers function
    // handleSearchUsers(socket, session, data.trim());
    socket.emit('ansi-output', '\r\n\x1b[33mSearch users not yet implemented.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
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
        // TODO: Implement displayUserList function
        // displayUserList(socket, session, tempData.userListPage, tempData.searchTerm);
        socket.emit('ansi-output', '\r\nUser list display not yet implemented.\r\n');
        return;
      }
    }

    if (tempData.isNewFiles && tempData.searchDate) {
      // Continue new files display
      // TODO: Implement displayNewFilesInDirectories function
      // displayNewFilesInDirectories(socket, session, tempData.searchDate,
      //   { startDir: tempData.currentDir, dirScan: tempData.dirSpan.dirScan }, tempData.nonStop);
      socket.emit('ansi-output', '\r\nNew files display not yet implemented.\r\n');
    } else {
      // Continue regular file display
      // TODO: Implement displaySelectedFileAreas function
      // displaySelectedFileAreas(socket, session, tempData.fileAreas, tempData.dirSpan, tempData.reverse, tempData.nonStop);
      socket.emit('ansi-output', '\r\nFile area display not yet implemented.\r\n');
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

  // Handle message entry substates (E command flow)
  // These states require LINE-BUFFERED input, not single-key hotkeys
  // Initialize inputBuffer if needed
  if (!session.inputBuffer && (
    session.subState === LoggedOnSubState.POST_MESSAGE_TO ||
    session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT ||
    session.subState === LoggedOnSubState.POST_MESSAGE_PRIVATE
  )) {
    session.inputBuffer = '';
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_TO) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageToInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageSubjectInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_PRIVATE) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessagePrivateInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_BODY) {
    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const line = session.inputBuffer;
      session.inputBuffer = '';
      socket.emit('ansi-output', '\r\n'); // Move to next line
      await handleMessageBodyInput(socket, session, line);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        socket.emit('ansi-output', '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      socket.emit('ansi-output', data);
    }
    return;
  }

  // Handle message editor delete line prompt
  if (session.subState === LoggedOnSubState.POST_MESSAGE_DELETE_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageDeleteLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor delete confirmation
  if (session.subState === LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageDeleteConfirm(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor edit line prompt
  if (session.subState === LoggedOnSubState.POST_MESSAGE_EDIT_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageEditLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor edit line content
  if (session.subState === LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');
      session.inputBuffer = '';
      handleMessageEditLineContent(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor file attachment input (express.e:10515-10556)
  if (session.subState === LoggedOnSubState.POST_MESSAGE_ATTACH_FILE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMessageAttachFileInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor file attachment delete confirmation (express.e:10538-10549)
  if (session.subState === LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageAttachDeleteConfirm(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /R (Replace Text) - Search String Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageReplaceSearchInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /R (Replace Text) - Replacement String Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_REPLACE_WITH) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');  // Don't trim - allow empty replacement
      session.inputBuffer = '';
      handleMessageReplaceWithInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /I (Insert Line) - Line Number Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_INSERT_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageInsertLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /I (Insert Line) - Text Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_INSERT_TEXT) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');  // Don't trim - preserve spaces
      session.inputBuffer = '';
      handleMessageInsertTextInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message reader navigation (R command)
  // Like express.e:11046 - uses lineInput (line-based input, not single char)
  if (session.subState === LoggedOnSubState.MSG_READER_NAV) {
    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      const { handleMessageReaderNav } = await import('./messaging.handler');
      await handleMessageReaderNav(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo
    }
    return;
  }

  // Handle J (Join Conference) input
  if (session.subState === LoggedOnSubState.JOIN_CONF_INPUT) {
    console.log('📡 In JOIN_CONF_INPUT state');
    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      console.log('📡 Conference number entered:', input);

      // Process conference number
      const confNum = parseInt(input);
      if (isNaN(confNum) || confNum < 1 || confNum > conferences.length) {
        // express.e:25142-25150 - Redisplay JOINCONF and prompt again (no error message)
        await displayScreen(socket, session, 'JOINCONF');
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.complexPrompt([
          { text: 'Conference Number ', color: 'white' },
          { text: `(1-${conferences.length})`, color: 'cyan' },
          { text: ': ', color: 'white' }
        ]));
        session.inputBuffer = '';
        // Stay in JOIN_CONF_INPUT state to accept new input
        return;
      }

      // Get conference and join it
      const selectedConf = conferences[confNum - 1];
      const confId = selectedConf.id;
      const confMessageBases = messageBases.filter(mb => mb.conferenceId === confId);

      if (confMessageBases.length === 0) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('No message bases in this conference'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      const firstMsgBaseId = confMessageBases[0].id;
      await joinConference(socket, session, confId, firstMsgBaseId);
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo
    }
    return;
  }

  // Handle JM (Join Message Base) input
  if (session.subState === LoggedOnSubState.JM_INPUT) {
    console.log('📬 In JM input state');
    handleJMInput(socket, session, data.trim());
    return;
  }

  // Handle RL (Relogon) confirmation
  if (session.subState === LoggedOnSubState.RL_CONFIRM) {
    console.log('🔄 In RL confirmation state');
    handleRelogonConfirm(socket, session, data.trim());
    return;
  }

  // Handle CM (Conference Maintenance) menu input
  if (session.subState === LoggedOnSubState.CM_DISPLAY_MENU) {
    console.log('⚙️  In CM menu state');
    await handleCMInput(socket, session, data.trim());
    return;
  }

  // Handle CM numeric inputs (B and C options)
  if (session.subState === LoggedOnSubState.CM_INPUT_HIGH_MSG) {
    console.log('⚙️  In CM high message input state');
    await handleCMNumericInput(socket, session, data.trim(), 'HIGH_MSG');
    return;
  }

  if (session.subState === LoggedOnSubState.CM_INPUT_LOW_MSG) {
    console.log('⚙️  In CM low message input state');
    await handleCMNumericInput(socket, session, data.trim(), 'LOW_MSG');
    return;
  }

  // Handle voting booth states
  if (session.subState === LoggedOnSubState.VO_TOPIC_SELECT) {
    console.log('🗳️  In vote topic selection state');
    await handleVoteTopicSelect(socket, session, data.trim());
    return;
  }

  if (session.subState === LoggedOnSubState.VO_ANSWER_INPUT) {
    console.log('🗳️  In vote answer input state');
    await handleVoteAnswerInput(socket, session, data.trim());
    return;
  }

  if (session.subState === LoggedOnSubState.VO_MENU_CHOICE) {
    console.log('🗳️  In vote menu choice state');
    await handleVoteMenuChoice(socket, session, data.trim());
    return;
  }

  // Handle message posting workflow (line-based input like login system)
  console.log('📝 Checking if in POST_MESSAGE_SUBJECT state:', (session.subState as any) === LoggedOnSubState.POST_MESSAGE_SUBJECT);
  if ((session.subState as any) === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
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

  if ((session.subState as any) === LoggedOnSubState.POST_MESSAGE_BODY) {
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
          // TODO: Store message in database instead of in-memory array
          // Create and store the message
          // const newMessage: any = {
          //   id: messages.length + 1,
          //   subject: session.messageSubject || 'No Subject',
          //   body: body,
          //   author: session.user?.username || 'Anonymous',
          //   timestamp: new Date(),
          //   conferenceId: session.currentConf,
          //   messageBaseId: session.currentMsgBase
          // };
          // messages.push(newMessage);
          socket.emit('ansi-output', '\r\nMessage posted successfully!\r\n');

          // TODO: Log message posting activity (express.e:9493 callersLog)
          // await callersLog(session.user!.id, session.user!.username, 'Posted message', session.messageSubject);
        }
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        // TODO: Create and store the message in database
        // const newMessage: any = {
        //   id: messages.length + 1,
        //   subject: session.messageSubject || 'No Subject',
        //   body: body,
        //   author: session.user?.username || 'Anonymous',
        //   timestamp: new Date(),
        //   conferenceId: session.currentConf,
        //   messageBaseId: session.currentMsgBase,
        //   isPrivate: session.tempData?.isPrivate || false,
        //   toUser: session.messageRecipient,
        //   parentId: session.tempData?.parentId
        // };
        // messages.push(newMessage);

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

  // FM Command (File Maintenance) Input Handlers
  // express.e:24889-25045

  if (session.subState === LoggedOnSubState.FM_YESNO_INPUT) {
    // Y/n prompt for using flagged files
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await FileMaintenanceHandler.handleYesNoInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') {
      // Backspace (express.e:2304-2320)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342)
      socket.emit('ansi-output', data);
    }
    return;
  }

  if (session.subState === LoggedOnSubState.FM_FILENAME_INPUT) {
    // Filename pattern input
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await FileMaintenanceHandler.handleFilenameInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') {
      // Backspace (express.e:2304-2320)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342)
      socket.emit('ansi-output', data);
    }
    return;
  }

  if (session.subState === LoggedOnSubState.FM_DIRSPAN_INPUT) {
    // Directory span input
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await FileMaintenanceHandler.handleDirSpanInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.FM_ACTION_INPUT) {
    // D/M/V/Q action input
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await FileMaintenanceHandler.handleActionInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.FM_REMOVE_FLAG_INPUT) {
    // Remove from flagged list Y/n
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await FileMaintenanceHandler.handleRemoveFlagInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  // CF Command (Conference Flags) Input Handlers
  // express.e:24672-24841

  if (session.subState === LoggedOnSubState.CF_FLAG_SELECT_INPUT) {
    // M/A/F/Z flag type selection
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleCFFlagSelectInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.CF_CONF_SELECT_INPUT) {
    // Conference numbers input
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleCFConfSelectInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  // W Command (Write User Parameters) Input Handlers
  // express.e:25712-26092

  if (session.subState === LoggedOnSubState.W_OPTION_SELECT) {
    // Option selection (0-16 or CR to quit)
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWOptionSelectInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_NAME) {
    // Edit username
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditNameInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_EMAIL) {
    // Edit email
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditEmailInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_REALNAME) {
    // Edit real name
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditRealnameInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_INTERNETNAME) {
    // Edit internet name
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditInternetnameInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_LOCATION) {
    // Edit location
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditLocationInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_PHONE) {
    // Edit phone
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditPhoneInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_PASSWORD) {
    // Edit password (first entry)
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      handleWEditPasswordInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM) {
    // Edit password (confirmation)
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditPasswordConfirmInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_LINES) {
    // Edit lines per screen
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditLinesInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_COMPUTER) {
    // Edit computer type
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditComputerInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_SCREENTYPE) {
    // Edit screen type
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditScreentypeInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_PROTOCOL) {
    // Edit transfer protocol
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditProtocolInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.W_EDIT_TRANSLATOR) {
    // Edit translator
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleWEditTranslatorInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.READ_COMMAND) {
    console.log('✅ In READ_COMMAND state, reading line input');
    // Express.e:28619-28633 - Read command text using lineInput (line-buffered)

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Handle command history navigation (express.e:2236-2291)
    // Up Arrow - previous command (express.e:2258-2274)
    if (data === '\x1b[A') {
      const { getPreviousCommand } = require('../utils/command-history.util');
      const previousCmd = getPreviousCommand(session);
      if (previousCmd) {
        // Clear current line (express.e:2260-2267)
        let clearSequence = '';
        for (let i = 0; i < session.inputBuffer.length; i++) {
          clearSequence += '\b \b';
        }
        socket.emit('ansi-output', clearSequence);

        // Display previous command (express.e:2268, 2272)
        session.inputBuffer = previousCmd;
        socket.emit('ansi-output', previousCmd);
      }
      return;
    }
    // Down Arrow - next command (express.e:2275-2291)
    else if (data === '\x1b[B') {
      const { getNextCommand } = require('../utils/command-history.util');
      const nextCmd = getNextCommand(session);
      if (nextCmd) {
        // Clear current line (express.e:2277-2284)
        let clearSequence = '';
        for (let i = 0; i < session.inputBuffer.length; i++) {
          clearSequence += '\b \b';
        }
        socket.emit('ansi-output', clearSequence);

        // Display next command (express.e:2285, 2289)
        session.inputBuffer = nextCmd;
        socket.emit('ansi-output', nextCmd);
      }
      return;
    }
    // Ctrl-B - clear history (express.e:2236-2239)
    else if (data === '\x02') {
      const { clearHistory } = require('../utils/command-history.util');
      clearHistory(session);
      console.log('[CommandHistory] History cleared by user (Ctrl-B)');
      return;
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';

      if (input.length > 0) {
        // Add command to history (express.e:2158-2168)
        const { addToHistory } = require('../utils/command-history.util');
        addToHistory(session, input);

        // Store command text in session for PROCESS_COMMAND state
        session.commandText = input.toUpperCase();
        console.log('📝 Command text stored:', session.commandText);
        // Transition to PROCESS_COMMAND (express.e:28638)
        session.subState = LoggedOnSubState.PROCESS_COMMAND;
        // Process the command in the next event cycle
        setTimeout(() => {
          handleCommand(socket, session, '');  // Trigger process command
        }, 0);
      } else {
        // express.e:28228 - Empty command, just redisplay menu
        // IF StrLen(cmdtext)=0 THEN RETURN RESULT_SUCCESS
        console.log('📝 Empty command, redisplaying menu');
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        displayMainMenu(socket, session);
      }
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        socket.emit('ansi-output', '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      socket.emit('ansi-output', data);
    }
    return;
  } else if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {
    console.log('🔥 In READ_SHORTCUTS state, processing single key');
    try {
      // Process single character hotkeys immediately
      // IMPORTANT: Use processCommand() to respect the command priority system:
      // 1. SYSCMD, 2. BBSCMD (doors), 3. Internal commands (express.e:28228)
      const command = data.trim().toUpperCase();
      if (command.length > 0) {
        processCommand(socket, session, command, '').catch(error => {
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
    console.log('🔍 [AFTER COMMAND] subState is:', session.subState);
    console.log('🔍 [AFTER COMMAND] PROCESS_COMMAND const is:', LoggedOnSubState.PROCESS_COMMAND);
    console.log('🔍 [AFTER COMMAND] inDoorManager:', session.inDoorManager);

    // Skip menu display if Door Manager is active
    if (session.inDoorManager) {
      console.log('✅ [AFTER COMMAND] Door Manager is active - NOT showing menu');
      return;
    }

    // Skip menu display if Sysop Menu is active
    if (session.inSysopMenu) {
      console.log('✅ [AFTER COMMAND] Sysop Menu is active - NOT showing menu');
      return;
    }

    if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
      console.log('⚠️ [AFTER COMMAND] subState is still PROCESS_COMMAND, showing menu');
      // Command didn't change state, so default to showing menu
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
    } else {
      console.log('✅ [AFTER COMMAND] subState was changed to:', session.subState, '- NOT showing menu');
    }
    // If command changed subState (e.g., to DISPLAY_CONF_BULL), let handleCommand handle it on next input
    return;
  } else if (session.subState === LoggedOnSubState.USER_STATS_MENU) {
    // Handle user stats menu input (F=Font, Q=Quit)
    console.log('📊 In USER_STATS_MENU state, processing input');
    const { handleUserStatsMenuInput } = require('./user-commands.handler');
    handleUserStatsMenuInput(socket, session, data);
    return;
  } else if (session.subState === LoggedOnSubState.FONT_SELECTION) {
    // Handle font selection input (1-8 or Q)
    console.log('🔤 In FONT_SELECTION state, buffering input');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';

      const { handleFontSelectionInput } = require('./user-commands.handler');
      handleFontSelectionInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
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

  // Handle sysop menu input routing
  if (session.inSysopMenu) {
    await handleSysopMenuInput(socket, session, command);
    return 'SUCCESS';
  }

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
      const { DownloadHandler } = require('./download.handler');
      await DownloadHandler.handleDownloadCommand(socket, session, params);
      return;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302
      handleDownloadWithStatusCommand(socket, session, params);
      return;

    case 'DB': // Download Batch - Download all flagged files
      const { BatchDownloadHandler } = require('./batch-download.handler');
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
      const { handleOlmCommand: handleOlm } = require('./olm.handler');
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
      const { handleRoomCommand } = require('./room-commands.handler');
      await handleRoomCommand(socket, session, params);
      return;

    case 'Q': // Quiet Mode / Block OLM (internalCommandQ) - express.e:25505-25515
      const { handleQuietCommand } = require('./olm.handler');
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
      const { ViewFileHandler } = require('./view-file.handler');
      await ViewFileHandler.handleViewFileCommand(socket, session, params);
      return;

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      const { ViewFileHandler: ViewFileHandler2 } = require('./view-file.handler');
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
      const { ZippySearchHandler } = require('./zippy-search.handler');
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

    case 'SYSOP': // Sysop Commands Menu - Central hub for all sysop commands
      await displaySysopMenu(socket, session, params);
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
      handleQuestionMarkCommand(socket, session);
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
        const { executeDoor } = await import('../doors/DoorManager');
        console.log('[DOORMAN] Module imported successfully');
        await executeDoor(socket, session);
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
        const { AmigaDoorSession } = await import('../amiga-emulation/AmigaDoorSession');
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
          timeout: 600
        });

        await amigaSession.start();

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
        const { AmigaDoorSession } = await import('../amiga-emulation/AmigaDoorSession');
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
        const { AmigaDoorSession } = await import('../amiga-emulation/AmigaDoorSession');
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
