import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import multer from 'multer';
import { User, Door, DoorSession, ChatSession, ChatMessage, ChatState } from './types';
import { db } from './database';
import { config } from './config';
import { qwkManager, ftnManager } from './qwk';
import { nodeManager, arexxEngine, protocolManager } from './nodes';
import { nodeFileManager } from './services/NodeFileManager';
import { callersLogManager } from './services/CallersLogManager';
import { doorDropFileManager } from './services/DoorDropFileManager';
import { triggerSamiLogRefresh } from './services/SamiLogService';
import { conferenceFileManager } from './services/ConferenceFileManager';
import { loadConfConfig } from './services/conf-config.service';
import {
  loadFileAreasFromDisk,
  ensureConferenceStructure,
  ensureRootScreens
} from './services/file-areas-loader';
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
export { BBSState, LoggedOnSubState };
import { extractAndReadDiz, getNodeWorkDir, getPlaypenDir } from './utils/file-diz.util';
import { testFile, TestResult } from './utils/file-test.util';
import { moveUploadedFile, getConferenceDir } from './utils/file-hold.util';
import { convertUnicodePuaToPetscii, convertPetsciiInputToAscii, convertAsciiToPetsciiOutput } from './utils/petscii.util';
import { writeUploadToDirFile } from './utils/dir-file.util';
import { updateSysopUploadStats, doUploadNotify } from './utils/upload-notify.util';
import { AuthHandler } from './handlers/auth.handler';
import { SessionLogsHandler } from './handlers/session-logs.handler';
import { authenticateToken, requireSysop, AuthRequest } from './middleware/auth.middleware';
import { createConfigRouter } from './api/config-routes';
import { createBatchRouter } from './api/batch-routes';
import { createImportRouter } from './handlers/import.handler';
import { displayScreen, doPause, parseMciCodes, loadScreenFile, addAnsiEscapes, setConferences, hasKeysFile } from './handlers/screen.handler';
import { registerSocketHandlers } from './server/socket-handlers';
import { displaySystemBulletins } from './server/database-helpers';
import { initializeData } from './server/initialization';
import { sessions, userSessions, socketToUser, setSession } from './server/session-manager';
import { app } from './server/app';
import { TelnetServer, TelnetConnection } from './server/telnet-server';
import { SSHServerImpl, SSHConnection } from './server/ssh-server';
import { SSHKeyUtil } from './utils/ssh-key.util';
import { findSecurityScreen } from './utils/screen-security.util';
import { DEFAULT_CONNECTION_BAUD } from './constants/modem';

const SCREEN_BBSTITLE = 'BBSTITLE';
const SCREEN_LOGON = 'LOGON';
const SCREEN_BULL = 'BULL';
const SCREEN_NODE_BULL = 'NODE_BULL';
const SCREEN_CONF_BULL = 'CONF_BULL';
const SCREEN_MENU = 'MENU';
const SCREEN_LOGOFF = 'LOGOFF';
const SCREEN_JOINCONF = 'JoinConf';
const SCREEN_JOINED = 'JOINED';
const SCREEN_JOINMSGBASE = 'JoinMsgBase';
const SCREEN_NONEWUSERS = 'NoNewUsers';
const SCREEN_NONEWATBAUD = 'NoNewAtBaud';
const SCREEN_NEWUSERPW = 'NewUserPw';
const SCREEN_GUESTLOGON = 'GuestLogon';
const SCREEN_JOIN = 'JOIN';

import {
  displayConferenceBulletins,
  joinConference,
  setConferences as setConferencesForConferenceHandler,
  setMessageBases,
  setDatabase,
  setHelpers,
  setConstants
} from './handlers/conference.handler';
import {
  handleBulletinCommand,
  handleBulletinInput,
  setBulletinDependencies
} from './handlers/bulletin.handler';
import {
  performConferenceScan,
  displayMailScanScreen,
  setMessageScanDependencies,
  checkConfAccess
} from './handlers/message/message-scan.handler';
import {
  setUserCommandsDependencies
} from './handlers/commands/user-commands.handler';
import {
  handleGoodbyeCommand,
  setSystemCommandsDependencies
} from './handlers/commands/system-commands.handler';
import {
  setNavigationCommandsDependencies
} from './handlers/commands/navigation-commands.handler';
import {
  setDisplayFileCommandsDependencies
} from './handlers/commands/display-file-commands.handler';
import {
  setPreferenceChatCommandsDependencies
} from './handlers/chat/preference-chat-commands.handler';
import {
  setAdvancedCommandsDependencies
} from './handlers/commands/advanced-commands.handler';
import {
  setMessageCommandsDependencies
} from './handlers/message/message-commands.handler';
import {
  setInfoCommandsDependencies
} from './handlers/commands/info-commands.handler';
import {
  setUtilityCommandsDependencies
} from './handlers/commands/utility-commands.handler';
import {
  setSysopCommandsDependencies
} from './handlers/commands/sysop-commands.handler';
import {
  setTransferMiscCommandsDependencies
} from './handlers/commands/transfer-misc-commands.handler';
import {
  setMessagingDependencies
} from './handlers/message/messaging.handler';
import {
  displayDoorMenu,
  executeDoor,
  initializeDoors,
  executePagerDoor,
  getDoors,
  setDoorSessions,
  setDatabase as setDatabaseForDoorHandler,
  setHelpers as setHelpersForDoorHandler,
  setConstants as setConstantsForDoorHandler
} from './handlers/door.handler';
import {
  startSysopPage,
  displayInternalPager,
  completePaging,
  acceptChat,
  enterChatMode,
  exitChat,
  sendChatMessage,
  toggleSysopAvailable,
  getChatStatus,
  setChatState,
  setConstants as setConstantsForChatHandler,
  setHelpers as setHelpersForChatHandler
} from './handlers/chat/chat.handler';
import {
  displayFileAreaContents,
  displayFileList,
  getDirSpan,
  displayDirectorySelectionPrompt,
  displaySelectedFileAreas,
  displayFileMaintenance,
  handleFileDelete,
  handleFileDeleteConfirmation,
  handleFileMove,
  handleFileMoveConfirmation,
  handleFileSearch,
  displayFileStatus,
  displayNewFiles,
  displayNewFilesInDirectories,
  displayUploadInterface,
  displayDownloadInterface,
  matchesWildcard,
  parseParams,
  dirLineNewFile,
  startFileUpload,
  startFileDownload,
  handleFileDownload,
  setFileAreas,
  setFileEntries,
  setDatabase as setDatabaseForFileHandler,
  setCallersLog,
  setGetUserStats,
  setFileMaintenanceDependencies
} from './handlers/file/file.handler';
import { setMessageEntryDependencies } from './handlers/message/message-entry.handler';
import {
  handleAccountEditing,
  displayUserList,
  handleEditUserAccount,
  handleViewUserStats,
  handleChangeSecLevel,
  handleToggleUserFlags,
  handleDeleteUserAccount,
  handleSearchUsers,
  setDatabase as setDatabaseForAccountHandler
} from './handlers/account.handler';
import {
  displayMainMenu,
  displayMenuPrompt,
  handleCommand,
  runSysCommand,
  runBbsCommand,
  processCommand,
  processBBSCommand,
  setDatabase as setDatabaseForCommandHandler,
  setConfig,
  setConferences as setConferencesForCommandHandler,
  setMessageBases as setMessageBasesForCommandHandler,
  setFileAreas as setFileAreasForCommandHandler,
  setProcessOlmMessageQueue,
  setCheckSecurity,
  setSetEnvStat,
  setGetRecentCallerActivity as setGetRecentCallerActivityForCommandHandler,
  setDoors as setDoorsForCommandHandler,
  setConstants as setConstantsForCommandHandler,
  loadCommands,
  setCommandExecutionDependencies
} from './handlers/command.handler';
import { reloadDoorCommands } from './handlers/command-execution.handler';
import * as fs from 'fs';
import * as path from 'path';

// Phase 9: Security/ACS System imports
import { ACSCode } from './constants/acs-codes';
import { EnvStat } from './constants/env-codes';
import {
  checkSecurity,
  setEnvStat,
  initializeSecurity,
  setTempSecurityFlag,
  clearTempSecurityFlag,
  setOverride,
  clearOverride
} from './utils/security.util';

// Phase 10: Message Pointer System imports
import {
  loadMsgPointers,
  saveMsgPointers,
  getMailStatFile,
  validatePointers,
  hasNewMessages,
  updateReadPointer,
  updateScanPointer
} from './utils/message-pointers.util';

export interface UploadSessionContext {
  uploadMode: true;
  fileArea: any;
  uploadSessionId: string;
  [key: string]: any;
}

export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  user?: any; // Will be User from database (expert stored as "X"/"N")
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: number;
  confRJoin: number; // Default conference to join (from user preferences)
  msgBaseRJoin: number; // Default message base to join
  commandBuffer: string; // Buffer for command input
  commandText?: string; // Current command text for PROCESS_COMMAND state (express.e:28639)
  menuPause: boolean; // Like AmiExpress menuPause - controls if menu displays immediately
  messageSubject?: string; // For message posting workflow
  messageBody?: string; // For message posting workflow
  messageRecipient?: string; // For private message recipient
  inputBuffer: string; // Buffer for line-based input (like login system)
  maskInput?: boolean; // When true, echo '*' instead of typed characters (password prompts)
  connectionType?: 'web' | 'telnet' | 'ssh';
  remoteAddress?: string;
  connectionHostname?: string;
  connectionPort?: number;
  connectionBaud?: number;
  connectionStart?: number;
  relConfNum: number; // Relative conference number (like AmiExpress relConfNum)
  currentConfName: string; // Current conference name (like AmiExpress currentConfName)
  currentMenuName?: string; // Current menu name set by ~SM_ MCI code (express.e:5575)
  cmdShortcuts: boolean; // Like AmiExpress cmdShortcuts - controls hotkey vs line input mode
  shortcuts?: Map<string, string>; // Loaded shortcuts from .keys (matches express.e shortcuts list)
  doorExpertMode: boolean; // Like AmiExpress doorExpertMode - express.e:28583 - door can force menu display
  displayFlowPaused?: boolean; // Waiting for keypress to advance BULL/NODE_BULL/CONF_BULL/menu flow
  tempData?: any; // Temporary data storage for complex operations (like file listing)
  uploadContext?: UploadSessionContext;
  pendingDisplayInputs?: string[];
  replayingDisplayInputs?: boolean;
  transferRawActive?: boolean; // When true, bypass cooked command handling for raw transfer (ZMODEM)
  transferRawSink?: ((buf: Buffer) => void) | null; // Handler for inbound raw data during transfers
  transferRawSend?: ((buf: Buffer) => void) | null; // Sender for raw bytes to the remote terminal
  transferManager?: any; // Active transfer manager (e.g., ZMODEM)
  flagManager?: any; // File flagging manager for batch downloads
  inDoorManager?: boolean; // Whether user is currently in door manager
  doorInputHandler?: ((input: string) => void) | null; // Door input handler callback for TypeScript doors
  doorKeyStateHandler?: ((data: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => void) | null; // Door key state handler for simultaneous key input
  keyState?: Record<string, boolean>; // Current key state for simultaneous input (which keys are pressed)
  mouseEventsEnabled?: boolean; // Whether mouse events should be sent to door (for ANSI editor, etc.)
  ansiEnabled?: boolean; // Whether ANSI is enabled for this session
  petsciiMode?: boolean; // Whether PETSCII mode is enabled (40x25, .seq files)
  ripMode?: boolean; // Whether RIP graphics mode is enabled (640x350, .rip files)
  terminalType?: 'c64' | 'modern' | 'unknown'; // Terminal type: C64 (raw PETSCII), modern (Unicode PUA), or unknown
  screenWidth?: number; // Terminal width (40 for C64, 80 for modern)
  screenHeight?: number; // Terminal height (25 for C64, 24 for modern)
  currentRoomId?: string; // Current chat room ID for group chat

  // Phase 9: Security/ACS System (express.e:165-167, 306-308)
  acsLevel: number; // Current ACS level (0-255, or -1 if invalid) - express.e:165
  securityFlags: string; // Temporary per-session ACS overrides ("T"/"F"/"?") - express.e:306
  secOverride: string; // Permanent override denials ("T"=deny) - strongest denial - express.e:307
  overrideDefaultAccess: boolean; // Whether to skip default access checks - express.e:166
  userSpecificAccess: boolean; // Whether user has specific access file - express.e:167
  currentStat: number; // Current environment status (what user is doing) - express.e:308
  quietFlag: boolean; // Whether node is in quiet mode (invisible to WHO) - express.e:309
  blockOLM: boolean; // Whether to block Online Messages (OLM) - express.e:310
  loginTime: number; // Login timestamp for session time tracking
  nodeStartTime: number; // Node start time for uptime display
  nodeId: number; // Virtual node number (1, 2, 3...) for multi-node emulation - express.e:163
  conferences?: import('./database/types').Conference[]; // Cached conference accounting stats (express.e confBases)
  queuedScreenCommands?: string[]; // Deferred screen commands (run after pause key)
  lastScreenHadPause?: boolean; // Whether the last displayed screen contained ~SP.
  lastScreenFilePath?: string; // Resolved path of last displayed screen (used for .keys lookup)
  loginRetryCount: number; // Login retry counter - express.e:29461, 29560 (max 5 before disconnect)
  callerNum?: number; // Caller number for this session (total calls to BBS)
  paginatedScreen?: {
    lines: string[];
    nextIndex: number;
    pageSize: number;
    eventName: 'ansi-output' | 'petscii-output';
    commands?: string[];
    onComplete?: () => void;
  };

  // Phase 10: Message Pointer System (express.e:199-200, 4882-4973)
  lastMsgReadConf: number; // Last message manually read (confBase.confYM) - express.e:199
  lastNewReadConf: number; // Last message auto-scanned (confBase.confRead) - express.e:200

  // Chat system properties
  livechatUserList?: any[]; // List of users for live chat selection
  livechatSelectedIndex?: number; // Selected user index in live chat
  chatWithUsername?: string; // Username currently chatting with
  chatWithUserId?: string; // User ID currently chatting with (internode chat)
  pendingChatSessionId?: string; // Pending chat session ID
  chatSessionId?: string; // Active chat session ID (internode chat)
  pagingInterval?: NodeJS.Timeout; // Interval for paging notifications
  inChat?: boolean; // Whether user is currently in chat
  chatSession?: any; // Active chat session object
  socketId?: string; // Socket.IO socket ID for this session
  lastTypingTime?: number; // Last time user was typing (for typing indicator)
  partnerTypingBuffer?: string; // Buffer for partner's typing indicator
  typingBlinkTimer?: NodeJS.Timeout; // Timer for typing indicator blinking

  // Group chat properties
  userId?: string; // User ID for chat system
  username?: string; // Username for chat system
  previousState?: BBSState; // Previous state before entering chat
  previousSubState?: LoggedOnSubState; // Previous substate before entering chat
  currentRoomName?: string; // Current group chat room name

  // File system properties
  flaggedFiles?: any[]; // List of flagged files for batch download
  expertMode?: boolean; // Expert mode flag for file display

  // Bulletin system properties
  bulletinContext?: any; // Context for bulletin display navigation

  // OLM (Online Messages) properties
  lastOlmNode?: number; // Last node number used for OLM
  olmMessageLines?: string[]; // Lines of current OLM message being composed
  olmNodeTarget?: number; // Target node number for OLM message
  olmBuffer?: string[]; // Buffer for incoming OLM message lines
  olmQueue?: string[]; // Queue of pending OLM messages to send

  // Preference settings
  ansiMode?: boolean; // ANSI mode preference
  pagesAllowed?: number; // Number of pages allowed (-1 = unlimited, 0 = none)
  quietMode?: boolean; // Quiet mode preference
  relogon?: boolean; // Flag for relogon after goodbye

  // Screen-triggered command execution
  executingScreenCommand?: boolean; // True while ~CC/~XI command is running
  pendingScreenCommand?: Promise<void>; // Resolves when screen-initiated commands complete
  screenCommandResolver?: (() => void) | null;
  lastScreenCommandsHash?: string;

  // Account editor state (Command 1)
  accountEditorState?: any; // State tracking for account editor
  inputCallback?: (input: string) => Promise<void>; // Callback for input handling

  // Command history (express.e:207-209, 2158-2168, 2669-2713)
  commandHistory: string[]; // Circular buffer of last 20 commands (historyBuf) - express.e:207
  historyIndex: number; // Current position for next command storage (historyNum) - express.e:208
  historyCycle: number; // Current position when navigating history - express.e:209
}

// Conference and Message Base data structures (simplified)
interface Conference {
  id: number;
  name: string;
  description: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

// Global data caches (loaded from database)
// Note: doors are managed in door.handler.ts, access via getDoors()
let doorSessions: DoorSession[] = [];

// Chat system state (mirrors AmiExpress chatFlag, sysopAvail, pagedFlag)
let chatState: ChatState = {
  sysopAvailable: true, // Like AmiExpress sysopAvail - F7 toggle
  activeSessions: [],
  pagingUsers: [],
  chatToggle: true // Like AmiExpress F7 chat toggle
};

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.get('corsOrigins'),
    methods: ["GET", "POST"]
  },
  // Optimize for multiple connections on Render free tier
  pingTimeout: 60000, // Wait 60s for pong response before considering connection dead
  pingInterval: 25000, // Send ping every 25s to keep connection alive
  maxHttpBufferSize: 1e6, // 1MB max message size (reduced from 1MB default)
  // Development: Disable connection state recovery to prevent stale sessions
  connectionStateRecovery: process.env.NODE_ENV === 'production' ? {} : undefined,
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  allowEIO3: true, // Support older Socket.io clients
  perMessageDeflate: false, // Disable compression to reduce CPU usage
  httpCompression: false, // Disable HTTP compression to reduce CPU usage
  connectTimeout: 45000, // 45s connection timeout
});

const port = process.env.PORT || config.get('port');

// Create telnet and SSH servers for native BBS client connections (configured at runtime)
let telnetPort = parseInt(process.env.TELNET_PORT || '64128');
let sshPort = parseInt(process.env.SSH_PORT || '31337');
let telnetServer: TelnetServer | null = null;
let sshServer: SSHServerImpl | null = null;

// Store active sessions (in production, use Redis/database)
// NOTE: sessions, userSessions, and socketToUser are imported from session-manager module
// This ensures both index.ts and socket-handlers.ts use the SAME storage

// Connection rate limiting - track recent connections
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP
const CONNECTION_WINDOW = 60000; // 60 second window

export const LOCALHOST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function checkConnectionLimit(ip: string): boolean {
  // Always skip rate limiting for loopback/internal addresses
  if (LOCALHOST_IPS.includes(ip)) {
    return true;
  }

  // In development allow everything (already handled above for loopback but keep behaviour)
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const now = Date.now();
  const connections = recentConnections.get(ip) || [];

  // Remove old connections outside the window
  const recentConns = connections.filter(time => now - time < CONNECTION_WINDOW);

  if (recentConns.length >= MAX_CONNECTIONS_PER_IP) {
    return false; // Rate limit exceeded
  }

  // Add this connection
  recentConns.push(now);
  recentConnections.set(ip, recentConns);
  return true;
}

// Cleanup old connection tracking data every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, connections] of recentConnections.entries()) {
    const recent = connections.filter(time => now - time < CONNECTION_WINDOW);
    if (recent.length === 0) {
      recentConnections.delete(ip);
    } else {
      recentConnections.set(ip, recent);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

// Helper: Get next available node ID (1-99)
// In AmiExpress, each physical node had a number - we simulate this for websockets
function getNextAvailableNodeId(): number {
  const usedNodeIds = new Set<number>();

  // Collect all currently used node IDs
  for (const session of sessions.values()) {
    if (session.nodeId) {
      usedNodeIds.add(session.nodeId);
    }
  }

  // Find first available node ID (1-99)
  for (let i = 1; i < 100; i++) {
    if (!usedNodeIds.has(i)) {
      return i;
    }
  }

  return 1; // Fallback (shouldn't happen with 99 nodes)
}

// Helper: Get session by socket ID
// Checks both pre-login (socketId-based) and post-login (userId-based) storage
function getSessionBySocketId(socketId: string): BBSSession | undefined {
  // First check if this socket is mapped to a user (post-login)
  const userId = socketToUser.get(socketId);
  if (userId) {
    return userSessions.get(userId);
  }
  // Otherwise check pre-login sessions
  return sessions.get(socketId);
}

// Helper: Update session (handles both pre-login and post-login)
function updateSessionForSocket(socketId: string, updates: Partial<BBSSession>): void {
  const session = getSessionBySocketId(socketId);
  if (!session) return;

  Object.assign(session, updates);
}

// Initialize handlers
const authHandler = new AuthHandler(db);
const sessionLogsHandler = new SessionLogsHandler();

// Initialize internode chat handler dependencies
const { setInternodeChatDependencies } = require('./handlers/internode-chat.handler');
const { setChatCommandsDependencies, handleChatCommand } = require('./handlers/chat-commands.handler');

setInternodeChatDependencies({ db, sessions, io });

const internodeChatHandler = require('./handlers/internode-chat.handler');
setChatCommandsDependencies({
  db,
  sessions,
  io,
  handleChatRequest: internodeChatHandler.handleChatRequest,
  handleChatAccept: internodeChatHandler.handleChatAccept,
  handleChatDecline: internodeChatHandler.handleChatDecline
});

// Initialize group chat room handler dependencies
const { setGroupChatDependencies } = require('./handlers/group-chat.handler');
const { setRoomCommandsDependencies } = require('./handlers/room-commands.handler');

setGroupChatDependencies({ db, sessions, io });
setRoomCommandsDependencies({
  db,
  sessions,
  io,
  handleRoomCreate: require('./handlers/group-chat.handler').handleRoomCreate,
  handleRoomJoin: require('./handlers/group-chat.handler').handleRoomJoin,
  handleRoomLeave: require('./handlers/group-chat.handler').handleRoomLeave,
  handleRoomList: require('./handlers/group-chat.handler').handleRoomList,
  handleRoomKick: require('./handlers/group-chat.handler').handleRoomKick,
  handleRoomMute: require('./handlers/group-chat.handler').handleRoomMute
});

// Initialize OLM (Online Message) handler dependencies - express.e:25406-25515
const { setOlmDependencies } = require('./handlers/olm.handler');

setOlmDependencies({
  db,
  sessions,
  io,
  setEnvStat: (session: any, envStat: number) => {
    // Placeholder for setEnvStat - express.e:24360
    console.log('📊 [ENV] Setting environment stat:', envStat);
    // TODO: Implement full environment stat tracking
  },
  config
});

// Initialize Preference/Chat commands handler dependencies - express.e:26113+ (Expert mode)
setPreferenceChatCommandsDependencies({
  startSysopPage: (socket: any, session: any) => {
    // Placeholder for sysop page - handled elsewhere
    console.log('[SYSOP] Page sysop requested');
  },
  db
});

// Initialize New User Registration handler dependencies - express.e:30003+
const { setNewUserDependencies } = require('./handlers/new-user.handler');

setNewUserDependencies({
  db,
  sessions,
  screens: {
    NONEWUSERS: SCREEN_NONEWUSERS,
    NONEWATBAUD: SCREEN_NONEWATBAUD,
    NEWUSERPW: SCREEN_NEWUSERPW,
    GUESTLOGON: SCREEN_GUESTLOGON,
    JOIN: SCREEN_JOIN
  },
  newUserPassword: config.get('newUserPassword'),
  autoValidationPassword: config.get('autoValidationPassword'),
  autoValidationSecLevel: config.get('autoValidationSecLevel')
});


// Import HTTP routes setup
import { registerHttpRoutes } from './server/routes-setup';

// ===== HTTP Routes (now in server/routes-setup.ts) =====
// Routes registered in startup section below


// Telnet/SSH Connection Handler
// Connects native telnet and SSH clients to BBS command processing
function setupTelnetSSHHandler(connection: TelnetConnection | SSHConnection, type: 'telnet' | 'ssh') {
  const remoteAddress = connection.getRemoteAddress();
  console.log(`[${type.toUpperCase()}] Connection from ${remoteAddress} on node ${connection.nodeId}`);

  // Create emitter interface that mimics Socket.IO socket
  const emitter = {
    emit: (event: string, data: any) => {
      if (event === 'ansi-output') {
        // Check if this is a C64/PETSCII terminal
        if (connection.session?.terminalType === 'c64' || connection.session?.petsciiMode) {
          // C64 terminal - convert ASCII text to PETSCII with proper case handling
          // This handles prompts like "Username:", "Password:", etc.
          if (typeof data === 'string') {
            // Strip ANSI escape sequences (C64 doesn't understand them)
            const strippedData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
            const petsciiBytes = convertAsciiToPetsciiOutput(strippedData);
            connection.write(petsciiBytes);
          } else {
            connection.write(data);
          }
        } else {
          // Modern terminal or unknown - send as-is (ANSI codes)
          connection.write(data);
        }
      } else if (event === 'petscii-output') {
        // Handle PETSCII output based on terminal type
        if (connection.session?.terminalType === 'c64') {
          // Real C64 - send raw PETSCII bytes (data is already in Unicode PUA format)
          // Need to convert Unicode PUA back to raw PETSCII bytes
          const petsciiBytes = convertUnicodePuaToPetscii(data);
          connection.write(petsciiBytes);
        } else {
          // Modern terminal - send Unicode PUA for PetMe64 font rendering
          connection.write(data);
        }
      }
    },
    id: connection.sessionId,
    on: (event: string, handler: (...args: any[]) => void) => {
      connection.on(event, handler);
    },
    off: (event: string, handler: (...args: any[]) => void) => {
      connection.off(event, handler);
    },
    // Allow handlers (logoff) to terminate the underlying transport cleanly
    disconnect: () => connection.close(),
    end: () => connection.close(),
    destroy: () => connection.close()
  };

  const attachTransferSender = () => {
    if (connection.session) {
      (connection.session as any).connectionType = type;
      (connection.session as any).transferRawSend = (buf: Buffer) => connection.write(buf);
    }
  };
  attachTransferSender();
  connection.on('ready', attachTransferSender);

  // Handle incoming data (user input)
  connection.on('data', async (data: Buffer) => {
    if (connection.session?.transferRawActive) {
      const sink = (connection.session as any).transferRawSink || (connection.session as any).transferManager?.handleInput;
      if (sink) {
        sink(Buffer.from(data));
        return;
      }
    }

    // Convert telnet/SSH data to string
    // For C64/PETSCII terminals, convert PETSCII bytes to ASCII
    // For modern terminals, use UTF-8 encoding
    let input: string;
    if (connection.session?.petsciiMode || connection.session?.terminalType === 'c64') {
      // PETSCII terminals send characters in PETSCII encoding, not ASCII
      // e.g., lowercase 'a' is 0xC1 in PETSCII, not 0x61 like ASCII
      input = convertPetsciiInputToAscii(data);
    } else {
      input = data.toString('utf-8');
    }

    // Process through BBS command handler (same as Socket.IO)
    if (connection.session) {
      // Call handleCommand directly (same logic as Socket.IO 'command' event)
      const { handleCommand } = await import('./handlers/command.handler');
      handleCommand(emitter as any, connection.session, input);
    }
  });

  // Handle terminal type detection (telnet TTYPE negotiation)
  connection.on('terminal-type', (info: { terminalType: string; isC64: boolean; width: number; height: number }) => {
    if (connection.session) {
      connection.session.terminalType = info.isC64 ? 'c64' : 'modern';
      connection.session.screenWidth = info.width;
      connection.session.screenHeight = info.height;
      connection.session.petsciiMode = info.isC64;
      console.log(`[${type.toUpperCase()}] Terminal detected: ${info.terminalType} (${info.isC64 ? 'C64' : 'Modern'}) - ${info.width}x${info.height}`);
    }
  });

  // Handle window size changes (NAWS)
  connection.on('window-size', (width: number, height: number) => {
    if (connection.session) {
      connection.session.screenWidth = width;
      connection.session.screenHeight = height;

      // Fallback detection: If terminal type not yet determined, use screen size
      if (!connection.session.terminalType || connection.session.terminalType === 'unknown') {
        const isC64 = (width === 40 && height === 25);
        connection.session.terminalType = isC64 ? 'c64' : 'modern';
        connection.session.petsciiMode = isC64;
        console.log(`[${type.toUpperCase()}] Terminal detected via NAWS: ${width}x${height} (${isC64 ? 'C64' : 'Modern'})`);
      } else {
        console.log(`[${type.toUpperCase()}] Window size: ${width}x${height}`);
      }
    }
  });

  // Handle disconnect
  connection.on('close', () => {
    console.log(`[${type.toUpperCase()}] Disconnected: node ${connection.nodeId}`);
    // Cleanup session
    if (connection.session) {
      sessions.delete(connection.sessionId);
    }
  });

  // Handle errors
  connection.on('error', (error: Error) => {
    console.error(`[${type.toUpperCase()}] Error on node ${connection.nodeId}:`, error.message);
  });

  // Function to send welcome message
  const sendWelcomeMessage = () => {
    // Clear screen and move cursor to home position
    connection.write('\x1b[2J\x1b[H');
    // Send welcome message with ASCII-safe characters
    // Use '=' instead of UTF-8 box-drawing for telnet compatibility
    connection.write('\r\n\x1b[36m' + '='.repeat(50) + '\x1b[0m\r\n');
    connection.write('\x1b[0;37mWelcome to AmiExpress BBS\x1b[0m\r\n');
    connection.write(`\x1b[33mConnected via ${type.toUpperCase()} on node ${connection.nodeId}\x1b[0m\r\n`);
    connection.write('\x1b[36m' + '='.repeat(50) + '\x1b[0m\r\n\r\n');
  };

  // For SSH: Wait for 'ready' event before sending welcome
  // For Telnet: Send welcome immediately (stream is ready on connection)
  if (type === 'ssh') {
    connection.once('ready', sendWelcomeMessage);
  } else {
    sendWelcomeMessage();
  }
}

// Set up telnet server event handlers
// Attach telnet connection handler when server is created (later in startup)


// SSH connection handlers are attached when the SSH server is created (startup section)

io.on('connection', async (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`Client connected from ${clientIp}`);

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
    console.warn(`[WARNING] Rate limit exceeded for IP: ${clientIp}`);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mToo many connections from your IP.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease wait a moment and try again.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return;
  }

  // Initialize session with multi-node support
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
  } catch (error) {
    console.error('Failed to assign node to session:', error);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSorry, all nodes are busy.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease try again in a moment.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return;
  }

  const bbsConfig = config.getConfig();
  const sessionStart = Date.now();

  const session: BBSSession = {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT, // Start with connection screen
    currentConf: 1, // Start in General conference (ID 1) → Conf1/
    currentMsgBase: 1, // Start in Main message base (ID 1)
    timeRemaining: 60, // 60 minutes default
    lastActivity: sessionStart,
    confRJoin: 1, // Default to General conference (ID 1)
    msgBaseRJoin: 1, // Default to Main message base (ID 1)
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    maskInput: false, // Echo typed characters unless password masking is active
    connectionType: 'web',
    remoteAddress: clientIp,
    connectionHostname: bbsConfig.hostname,
    connectionPort: bbsConfig.port,
    connectionBaud: DEFAULT_CONNECTION_BAUD,
    connectionStart: sessionStart,
    relConfNum: 0, // Relative conference number
    currentConfName: 'General', // Current conference name (matches ID 4)
    cmdShortcuts: false, // Like AmiExpress - default to line input mode, not hotkeys
    shortcuts: new Map(), // Loaded shortcuts from .keys
    doorExpertMode: false, // Like AmiExpress - doors can force menu display (express.e:28583)

    // Phase 9: Initialize security fields (express.e:447-455)
    acsLevel: -1, // Will be set on login
    securityFlags: '', // Temporary per-session ACS overrides
    secOverride: '', // Permanent override denials
    overrideDefaultAccess: false, // Skip default access checks
    userSpecificAccess: false, // User has specific access file
    currentStat: EnvStat.IDLE, // Environment status
    quietFlag: false, // Quiet mode (invisible to WHO)
    blockOLM: false, // Block Online Messages
    loginTime: Date.now(), // Login timestamp
    nodeStartTime: Date.now(), // Node start time for uptime
    nodeId: getNextAvailableNodeId(), // Assign unique virtual node ID - express.e:163
    loginRetryCount: 0, // Initialize retry counter - express.e:29560

    // Phase 10: Initialize message pointers (express.e:199-200)
    lastMsgReadConf: 0, // Last message manually read
    lastNewReadConf: 0, // Last message auto-scanned

    // Command history (express.e:31561-31563)
    commandHistory: [], // Circular buffer of last 20 commands (historyBuf)
    historyIndex: 0, // Current position for next command storage (historyNum)
    historyCycle: 0 // Current position when navigating history
  };
  setSession(socket.id, session); // Use helper to store by nodeId
  try {
    await triggerSamiLogRefresh();
  } catch (error) {
    console.error('[SamiLog] Initial refresh failed:', error);
  }

  // Display complete connection screen via AWAITSCREEN.TXT
  // reference-board BBS layout: everything shown via screen file with MCI codes
  // All messages, node list, etc. are in AWAITSCREEN.TXT
  await displayScreen(socket, session, 'AWAITSCREEN');
  if (session.pendingScreenCommand) {
    try {
      await session.pendingScreenCommand;
    } catch (error) {
      console.error('[AWAITSCREEN] Error waiting for screen commands:', error);
    }
  }

  // Show ANSI prompt immediately (reference-board style - no key wait)
  socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');

  // Set state to wait for ANSI response
  session.subState = LoggedOnSubState.ANSI_PROMPT;
  session.tempData = { inputBuffer: '' };

  // Execute login trigger for AREXX scripts
  await arexxEngine.executeTrigger('login', {
    userId: undefined,
    sessionId: socket.id,
    environment: { nodeId: nodeSession.nodeId }
  });

  // Register all socket event handlers via modular handlers
  // This includes: auth, file uploads/downloads, chat, preferences, commands, and disconnect
  registerSocketHandlers(io, socket, chatState);
});


// Log caller activity (express.e:9493 callersLog)
// Logs to database like express.e logs to BBS:Node{X}/CallersLog file
// ===== Database Helpers (now in server/database-helpers.ts) =====
// All database helper functions moved to server/database-helpers.ts

// ===== Initialization (now in server/initialization.ts) =====
// initializeData() and dependency injection moved to server/initialization.ts

// ===== SERVER STARTUP =====
// Initialize database and start server
// IMPORTANT: Database must be initialized BEFORE accepting connections
(async () => {
  try {
    console.log('Initializing database and loading data...');
    await initializeData();

    // Register HTTP routes (auth, sessions, config, upload, download, etc.)
    registerHttpRoutes(app);
    console.log('[OK] HTTP routes registered');
    console.log('[OK] Database initialization complete');

    // Now start accepting connections
    // Bind to 0.0.0.0 for cloud deployments (Render, etc)
    const host = process.env.HOST || '0.0.0.0';

    // Load system config for port overrides (env takes precedence)
    try {
      const sysConfig = db.getConfigRepository().getSystemConfig();
      if (sysConfig) {
        if (!process.env.TELNET_PORT && sysConfig.telnet_port) {
          telnetPort = sysConfig.telnet_port;
        }
        if (!process.env.SSH_PORT && sysConfig.ssh_port) {
          sshPort = sysConfig.ssh_port;
        }
      }
    } catch (err) {
      console.warn('[CONFIG] Unable to load system config for ports, using defaults/env:', err);
    }

    // Start HTTP/Socket.IO server
    server.listen(port, host, () => {
      console.log(`[OK] HTTP/WebSocket Server running on ${host}:${port}`);
      console.log(`[WEB] BBS accessible at http://localhost:${port}/`);
    });

    // Start telnet server
    try {
      telnetServer = new TelnetServer(telnetPort);
      telnetServer.on('connection', (connection: TelnetConnection) => {
        setupTelnetSSHHandler(connection, 'telnet');
      });
      // Handle C64 terminal auto-detection (skip graphics prompt, show BBSTITLE directly)
      telnetServer.on('c64-detected', async (connection: TelnetConnection) => {
        if (connection.session) {
          console.log('[C64] Auto-detected C64 terminal, showing PETSCII BBSTITLE');
          const { displayScreen } = await import('./handlers/screen.handler');
          // Create a telnet-compatible emitter for displayScreen
          const emitter = {
            emit: (event: string, data: any) => {
              if (event === 'petscii-output' || event === 'ansi-output') {
                // For C64, convert to raw PETSCII if needed
                if (typeof data === 'string') {
                  const petsciiData = convertUnicodePuaToPetscii(data);
                  connection.write(petsciiData);
                } else {
                  connection.write(data);
                }
              }
            }
          };
          await displayScreen(emitter as any, connection.session, 'BBSTITLE');
          // Transition to login
          connection.session.state = BBSState.LOGON;
          connection.session.subState = undefined;
          connection.session.tempData = connection.session.tempData || {};
          connection.session.tempData.loginPhase = 'username';
          connection.write(Buffer.from([0x0D, 0x0D])); // Two CR for spacing
          // Send Username: prompt in proper PETSCII (uppercase displays correctly)
          connection.write(convertAsciiToPetsciiOutput('Username: '));
        }
      });
      await telnetServer.start();
      console.log(`[OK] Telnet Server ready on port ${telnetPort}`);
      console.log(`[TELNET] Connect: telnet localhost ${telnetPort}`);
    } catch (error) {
      console.error(`[WARNING] Failed to start Telnet server:`, error);
      console.log('   BBS will continue without telnet support');
    }

    // Start SSH server
    try {
      let sshHostKeys: Buffer[] = [];
      const hostKey = SSHKeyUtil.loadHostKey();
      if (hostKey) {
        sshHostKeys = [hostKey];
      } else {
        console.warn('[SSH] No SSH host key found. SSH server will not accept connections.');
        console.warn('[SSH] Generate a key via the admin configuration portal or by running:');
        console.warn('[SSH]   ssh-keygen -t rsa -b 4096 -f data/ssh/ssh_host_rsa_key -N \"\"');
      }

      sshServer = new SSHServerImpl(sshPort, sshHostKeys);
      sshServer.on('connection', (connection: SSHConnection) => {
        setupTelnetSSHHandler(connection, 'ssh');
      });
      await sshServer.start();
      console.log(`[OK] SSH Server ready on port ${sshPort}`);
      console.log(`[SSH] Connect: ssh -p ${sshPort} user@localhost`);
    } catch (error) {
      console.error(`[WARNING] Failed to start SSH server:`, error);
      console.log('   BBS will continue without SSH support');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[READY] AmiExpress BBS is ready for connections!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
})();
