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
} from './handlers/message-scan.handler';
import {
  setUserCommandsDependencies
} from './handlers/user-commands.handler';
import {
  handleGoodbyeCommand,
  setSystemCommandsDependencies
} from './handlers/system-commands.handler';
import {
  setNavigationCommandsDependencies
} from './handlers/navigation-commands.handler';
import {
  setDisplayFileCommandsDependencies
} from './handlers/display-file-commands.handler';
import {
  setPreferenceChatCommandsDependencies
} from './handlers/preference-chat-commands.handler';
import {
  setAdvancedCommandsDependencies
} from './handlers/advanced-commands.handler';
import {
  setMessageCommandsDependencies
} from './handlers/message-commands.handler';
import {
  setInfoCommandsDependencies
} from './handlers/info-commands.handler';
import {
  setUtilityCommandsDependencies
} from './handlers/utility-commands.handler';
import {
  setSysopCommandsDependencies
} from './handlers/sysop-commands.handler';
import {
  setTransferMiscCommandsDependencies
} from './handlers/transfer-misc-commands.handler';
import {
  setMessagingDependencies
} from './handlers/messaging.handler';
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
} from './handlers/chat.handler';
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
} from './handlers/file.handler';
import { setMessageEntryDependencies } from './handlers/message-entry.handler';
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

// Development: Disable caching to prevent stale session issues
if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
}

// Authentication endpoints
app.post('/auth/login', (req: Request, res: Response) => authHandler.login(req, res));
app.get('/auth/me', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  authHandler.me(req as AuthRequest, res)
);
app.post('/auth/register', (req: Request, res: Response) => authHandler.register(req, res));
app.post('/auth/refresh', (req: Request, res: Response) => authHandler.refresh(req, res));

// Session Logs API - Sysop-only routes
app.get('/api/sessions', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  sessionLogsHandler.getActiveSessions(req as AuthRequest, res)
);
app.get('/api/sessions/stats', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  sessionLogsHandler.getStats(req as AuthRequest, res)
);
app.get('/api/sessions/:sessionId/log', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  sessionLogsHandler.getSessionLog(req as AuthRequest, res)
);
app.get('/api/sessions/:sessionId/log/raw', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  sessionLogsHandler.getSessionLogRaw(req as AuthRequest, res)
);
app.post('/api/sessions/:sessionId/save', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
  sessionLogsHandler.saveSessionLog(req as AuthRequest, res)
);

// Configuration API - Sysop-only routes
const configRouter = createConfigRouter(db);
app.use('/api/config', authenticateToken(db), requireSysop(), configRouter);

// Batch editor API - Sysop-only
const batchRouter = createBatchRouter();
app.use('/api/batches', authenticateToken(db), requireSysop(), batchRouter);

// Import/Export API - Sysop-only routes
const importRouter = createImportRouter(db);
app.use('/api/import', authenticateToken(db), requireSysop(), importRouter);

// ===== Static File Serving for Unified Deployment =====
// Serve SDK Preview at /sdk/
const sdkPreviewPath = join(__dirname, '../../../sdk/tools/preview/frontend/dist');
app.use('/sdk', express.static(sdkPreviewPath));
app.use('/sdk', (req: Request, res: Response, next: NextFunction) => {
  // Only serve index.html for navigation requests, not for assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return next(); // Let it 404 if file doesn't exist
  }
  res.sendFile(join(sdkPreviewPath, 'index.html'));
});

// Serve Admin Config at /admin/
const adminConfigPath = join(__dirname, '../../config-app/dist');
app.use('/admin', express.static(adminConfigPath));
app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
  // Only serve index.html for navigation requests, not for assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return next(); // Let it 404 if file doesn't exist
  }
  res.sendFile(join(adminConfigPath, 'index.html'));
});

// Serve BBS Terminal Frontend at / (fallback)
const bbsFrontendPath = join(__dirname, '../../frontend/dist');
app.use(express.static(bbsFrontendPath));
// Catch-all for SPA routing - must be AFTER all API routes
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip API, auth, and socket.io routes
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/socket.io')) {
    return next();
  }
  // Skip /sdk and /admin as they're handled above
  if (req.path.startsWith('/sdk') || req.path.startsWith('/admin')) {
    return next();
  }
  // Only serve index.html for navigation requests, not for assets
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    return next(); // Let it 404 if file doesn't exist
  }
  // Serve BBS frontend index.html for all other routes
  res.sendFile(join(bbsFrontendPath, 'index.html'));
});

// Game Prompt Wizard API endpoints
import { enhancePrompt, analyzePrompt, enhanceAudioDescription, analyzeAudioDescription, generateGame } from './handlers/wizard.handler';
app.post('/api/wizard/enhance', (req: Request, res: Response) => enhancePrompt(req, res));
app.post('/api/wizard/analyze', (req: Request, res: Response) => analyzePrompt(req, res));
app.post('/api/wizard/enhance-audio', (req: Request, res: Response) => enhanceAudioDescription(req, res));
app.post('/api/wizard/analyze-audio', (req: Request, res: Response) => analyzeAudioDescription(req, res));
app.post('/api/wizard/generate', (req: Request, res: Response) => generateGame(req, res));

// File upload configuration
// Express.e uses Node#/Playpen for uploaded files (express.e:19573-19584)
const playpenStorage = multer.diskStorage({
  destination: (req: any, file: any, cb: (error: Error | null, destination: string) => void) => {
    try {
      // Use Node0/Playpen for uploads (express.e uses ramPen or Node#/Playpen)
      const playpenDir = path.join(config.get('dataDir'), 'Node0', 'Playpen');

      console.log('[Upload] BBS data directory:', config.get('dataDir'));
      console.log('[Upload] Playpen directory:', playpenDir);

      // Ensure directory exists
      if (!fs.existsSync(playpenDir)) {
        console.log('[Upload] Creating playpen directory...');
        fs.mkdirSync(playpenDir, { recursive: true });
        console.log('[Upload] Playpen directory created');
      }

      cb(null, playpenDir);
    } catch (error) {
      console.error('[Upload] Error setting destination:', error);
      cb(error as Error, '');
    }
  },
  filename: (req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
    try {
      // Use original filename (already validated in UPLOAD_FILENAME_INPUT handler)
      console.log('[Upload] Storing file as:', file.originalname);
      cb(null, file.originalname);
    } catch (error) {
      console.error('[Upload] Error setting filename:', error);
      cb(error as Error, '');
    }
  }
});

const upload = multer({
  storage: playpenStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// File upload endpoint with error handling
app.post('/api/upload', (req: Request, res: Response) => {
  console.log('[Upload] Upload request received from:', req.headers.origin);

  // Use multer middleware with error handling
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('[Upload] Multer error:', err);
      return res.status(500).json({ error: `Upload failed: ${err.message}` });
    }

    try {
      if (!req.file) {
        console.error('[Upload] No file in request');
        return res.status(400).json({ error: 'No file provided' });
      }

      console.log('[Upload] File received:', req.file.originalname, req.file.size, 'bytes');
      console.log('[Upload] Saved to:', req.file.path);

      res.json({
        filename: req.file.filename || req.file.originalname,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      });
    } catch (error) {
      console.error('[Upload] Processing error:', error);
      res.status(500).json({ error: 'Upload processing failed' });
    }
  });
});

// Door upload endpoint
app.post('/api/upload/door', (req: Request, res: Response) => {
  console.log('[Door Upload] Upload request received from:', req.headers.origin);

  // Use multer middleware with 'door' field name
  upload.single('door')(req, res, (err: any) => {
    if (err) {
      console.error('[Door Upload] Multer error:', err);
      return res.status(500).json({ error: `Upload failed: ${err.message}` });
    }

    try {
      if (!req.file) {
        console.error('[Door Upload] No file in request');
        return res.status(400).json({ error: 'No file provided' });
      }

      console.log('[Door Upload] Door file received:', req.file.originalname, req.file.size, 'bytes');
      console.log('[Door Upload] Saved to:', req.file.path);

      // Move file to Doors/archives directory in BBS data directory
      const doorsArchivePath = path.join(config.get('dataDir'), 'Doors', 'archives');
      if (!fs.existsSync(doorsArchivePath)) {
        fs.mkdirSync(doorsArchivePath, { recursive: true });
      }

      const destPath = path.join(doorsArchivePath, req.file.originalname);
      fs.copyFileSync(req.file.path, destPath);
      console.log('[Door Upload] Copied to archives:', destPath);

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      res.json({
        filename: req.file.originalname,
        originalname: req.file.originalname,
        size: req.file.size,
        path: destPath
      });
    } catch (error) {
      console.error('[Door Upload] Processing error:', error);
      res.status(500).json({ error: 'Door upload processing failed' });
    }
  });
});

// Door hot-reload endpoint - reload doors without restarting server
app.post('/api/doors/reload', async (req: Request, res: Response) => {
  try {
    console.log('[Door Reload] Hot-reload request received');

    const bbsBaseDir = config.get('dataDir');
    const result = await reloadDoorCommands(bbsBaseDir, 1, 0);

    if (result.success) {
      console.log(`[Door Reload] ${result.message}`);
      res.json({
        success: true,
        message: result.message,
        doorsReloaded: result.doorsReloaded
      });
    } else {
      console.error(`[Door Reload] ${result.message}`);
      res.status(500).json({
        success: false,
        message: result.message,
        doorsReloaded: 0
      });
    }
  } catch (error) {
    console.error('[Door Reload] Unexpected error:', error);
    res.status(500).json({
      success: false,
      message: `Reload failed: ${(error as Error).message}`,
      doorsReloaded: 0
    });
  }
});

// File download endpoint - express.e:20075+ (downloadAFile)
app.get('/api/download/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId);

    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    // Get file info from database
    const fileEntry = await db.getFileEntry(fileId);

    if (!fileEntry) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Determine file path
    // Files can be in: active directory, private directory, or hold directory
    // Try to find the file in these locations
    const conferencePath = getConferenceDir(fileEntry.conferenceId || 1, config.get('dataDir'));

    let filePath: string | null = null;
    const possiblePaths = [
      // Try stored path first if available
      fileEntry.filePath,
      // Try active file area directory
      path.join(conferencePath, `Dir${fileEntry.areaId}`, fileEntry.filename),
      // Try Node0/Playpen (recent uploads)
      path.join(config.get('dataDir'), 'Node0', 'Playpen', fileEntry.filename),
      // Try HOLD directory (failed tests)
      path.join(conferencePath, 'HOLD', fileEntry.filename),
      // Try PRIVATE directory
      path.join(conferencePath, 'PRIVATE', fileEntry.filename)
    ].filter(p => p); // Filter out null/undefined

    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath!)) {
        filePath = testPath!;
        break;
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`[Download] File not found on disk: ${fileEntry.filename}`);
      return res.status(404).json({ error: 'File not found on server' });
    }

    console.log(`[Download] Serving file: ${fileEntry.filename} from ${filePath}`);

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileEntry.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileEntry.size.toString());

    // Stream file to client
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Note: Download statistics are updated when frontend sends 'file-download-started' event
    // This matches express.e flow where statistics are updated after transfer

  } catch (error) {
    console.error('[Download] Error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Protected route example
app.get('/users/:id', authenticateToken(db), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    // Check if user can access this resource (own profile or admin)
    if (req.user!.userId !== userId && req.user!.secLevel < 100) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      realname: user.realname,
      location: user.location,
      secLevel: user.secLevel,
      lastLogin: user.lastLogin,
      uploads: user.uploads,
      downloads: user.downloads
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Display system bulletins (SCREEN_BULL equivalent)
function displaySystemBulletins(socket: any, session: BBSSession) {
  console.log('[BULLETINS] Displaying system bulletins, current state:', session.state);
  // In AmiExpress, await displayScreen(SCREEN_BULL) shows system bulletins
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\r\n\x1b[36m-= AmiExpress Web BBS System Bulletins =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mWelcome to AmiExpress Web!\x1b[0m\r\n');
  socket.emit('ansi-output', 'This is a modern web implementation of the classic AmiExpress BBS.\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mSystem News:\x1b[0m\r\n');
  socket.emit('ansi-output', '- New web interface available\r\n');
  socket.emit('ansi-output', '- Enhanced security features\r\n');
  socket.emit('ansi-output', '- Real-time chat capabilities\r\n');
  socket.emit('ansi-output', '- SQLite database backend\r\n');
  socket.emit('ansi-output', '- Full conference system\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m\r\n');

  // Transition to LOGGEDON state so command handler will process keypresses
  console.log('[BULLETINS] Setting state to LOGGEDON');
  session.state = BBSState.LOGGEDON;
  console.log('[BULLETINS] State is now:', session.state);

  // Move to next state after bulletin display
  // express.e:28555-28648 flow: BULL → NODE_BULL → confScan → CONF_BULL → MENU
  session.subState = LoggedOnSubState.CONF_SCAN;
  console.log('[BULLETINS] SubState is now:', session.subState);
}

// Log caller activity (express.e:9493 callersLog)
// Logs to database like express.e logs to BBS:Node{X}/CallersLog file
async function callersLog(userId: string | null, username: string, action: string, details?: string, nodeId: number = 1) {
  try {
    await db.run(
      'INSERT INTO caller_activity (node_id, user_id, username, action, details) VALUES (?, ?, ?, ?, ?)',
      [nodeId, userId, username, action, details || null]
    );
  } catch (error) {
    console.error('Error logging caller activity:', error);
    // Fail silently like express.e would
  }
}

// Get recent caller activity from database
async function getRecentCallerActivity(limit: number = 20, nodeId?: number): Promise<any[]> {
  try {
    let query = 'SELECT username, action, details, timestamp FROM caller_activity';
    const params: any[] = [];

    if (nodeId !== undefined) {
      query += ' WHERE node_id = $1';
      params.push(nodeId);
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error getting caller activity:', error);
    return [];
  }
}

// Get or initialize user stats
async function getUserStats(userId: string): Promise<any> {
  try {
    let result = await db.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Initialize stats for new user
      await db.query(
        'INSERT INTO user_stats (user_id) VALUES ($1)',
        [userId]
      );
      result = await db.query(
        'SELECT * FROM user_stats WHERE user_id = $1',
        [userId]
      );
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting user stats:', error);
    return {
      bytes_uploaded: 0,
      bytes_downloaded: 0,
      files_uploaded: 0,
      files_downloaded: 0
    };
  }
}

// ===== CONFERENCE HANDLING NOW IN handlers/conference.handler.ts =====
// ===== FILE OPERATIONS NOW IN handlers/file.handler.ts =====

// Search file descriptions (express.e:26123-26213, zippy function)
// Searches file_entries table for matching descriptions
async function searchFileDescriptions(searchPattern: string, conferenceId: number): Promise<any[]> {
  try {
    const query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND (
          UPPER(fe.filename) LIKE $2
          OR UPPER(fe.description) LIKE $2
        )
      ORDER BY fe.uploaddate DESC
    `;

    const result = await db.query(query, [conferenceId, `%${searchPattern}%`]);
    return result.rows;
  } catch (error) {
    console.error('[searchFileDescriptions] Database error:', error);
    return [];
  }
}

// File Maintenance Database Functions (express.e:24889-25085, FM command)

// Get file entry by ID
async function getFileEntry(fileId: number): Promise<any | null> {
  try {
    const result = await db.query(`
      SELECT
        fe.*,
        fa.name AS areaname,
        fa.conferenceid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fe.id = $1
    `, [fileId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[getFileEntry] Error:', error);
    return null;
  }
}

// Delete file entry from database (express.e:26914, maintenanceFileDelete)
async function deleteFileEntry(fileId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      DELETE FROM file_entries WHERE id = $1
    `, [fileId]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
    console.error('[deleteFileEntry] Error:', error);
    return false;
  }
}

// Move file to another area (express.e:27087, maintenanceFileMove)
async function moveFileEntry(fileId: number, newAreaId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      UPDATE file_entries
      SET areaid = $2
      WHERE id = $1
    `, [fileId, newAreaId]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
    console.error('[moveFileEntry] Error:', error);
    return false;
  }
}

// Update file description
async function updateFileDescription(fileId: number, newDescription: string): Promise<boolean> {
  try {
    const result = await db.query(`
      UPDATE file_entries
      SET description = $2
      WHERE id = $1
    `, [fileId, newDescription]);
    return ((result as any).rowCount || 0) > 0;
  } catch (error) {
    console.error('[updateFileDescription] Error:', error);
    return false;
  }
}

// Get all file areas in a conference
async function getFileAreas(conferenceId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT id, name, description
      FROM file_areas
      WHERE conferenceid = $1
      ORDER BY id
    `, [conferenceId]);
    return result.rows;
  } catch (error) {
    console.error('[getFileAreas] Error:', error);
    return [];
  }
}

// Search files by exact filename match (for FM command)
async function searchFilesByName(filename: string, conferenceId: number): Promise<any[]> {
  try {
    // Support wildcards: * -> %, ? -> _
    const sqlPattern = filename.toUpperCase()
      .replace(/\*/g, '%')
      .replace(/\?/g, '_');

    const query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND UPPER(fe.filename) LIKE $2
      ORDER BY fe.uploaddate DESC
    `;

    const result = await db.query(query, [conferenceId, sqlPattern]);
    return result.rows;
  } catch (error) {
    console.error('[searchFilesByName] Error:', error);
    return [];
  }
}

// Advanced file search (FM S command) - searches filename, description, and uploader
async function searchFilesAdvanced(
  searchPattern: string,
  conferenceId: number,
  areaId?: number
): Promise<any[]> {
  try {
    const sqlPattern = `%${searchPattern.toLowerCase()}%`;

    let query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.fileid_diz,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND (
          LOWER(fe.filename) LIKE $2
          OR LOWER(fe.description) LIKE $2
          OR LOWER(fe.fileid_diz) LIKE $2
          OR LOWER(fe.uploader) LIKE $2
        )
    `;

    const params: any[] = [conferenceId, sqlPattern];

    // If specific area requested, add filter
    if (areaId !== undefined) {
      query += ` AND fa.id = $3`;
      params.push(areaId);
    }

    query += ` ORDER BY fe.uploaddate DESC`;

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('[searchFilesAdvanced] Error:', error);
    return [];
  }
}

// Conference Maintenance Database Functions (express.e:22686+)

// Reset new mail scan pointers for all users in a conference/message base
async function resetNewMailScanPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const result = await db.query(`
      UPDATE msg_pointers
      SET lastnewreadconf = 0
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);
    return (result as any).rowCount || 0;
  } catch (error) {
    console.error('[resetNewMailScanPointers] Error:', error);
    return 0;
  }
}

// Reset last message read pointers for all users in a conference/message base
async function resetLastMessageReadPointers(conferenceId: number, messageBaseId: number): Promise<number> {
  try {
    const result = await db.query(`
      UPDATE msg_pointers
      SET lastmsgreadconf = 0
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);
    return (result as any).rowCount || 0;
  } catch (error) {
    console.error('[resetLastMessageReadPointers] Error:', error);
    return 0;
  }
}

// Get conference statistics
async function getConferenceStats(conferenceId: number, messageBaseId: number): Promise<any> {
  try {
    // Get message count
    const msgResult = await db.query(`
      SELECT COUNT(*) as count,
             COALESCE(MIN(id), 0) as lowest,
             COALESCE(MAX(id), 0) as highest
      FROM messages
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);

    // Get user count with pointers for this conference
    const userResult = await db.query(`
      SELECT COUNT(DISTINCT userid) as count
      FROM msg_pointers
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, [conferenceId, messageBaseId]);

    return {
      messageCount: parseInt(msgResult.rows[0].count),
      lowestMsgNum: parseInt(msgResult.rows[0].lowest),
      highestMsgNum: parseInt(msgResult.rows[0].highest),
      userCount: parseInt(userResult.rows[0].count)
    };
  } catch (error) {
    console.error('[getConferenceStats] Error:', error);
    return {
      messageCount: 0,
      lowestMsgNum: 0,
      highestMsgNum: 0,
      userCount: 0
    };
  }
}

// Update message number range in mailstat
async function updateMessageNumberRange(conferenceId: number, messageBaseId: number, lowestKey?: number, highMsgNum?: number): Promise<boolean> {
  try {
    const updates: string[] = [];
    const values: any[] = [conferenceId, messageBaseId];
    let paramIndex = 3;

    if (lowestKey !== undefined) {
      updates.push(`lowest_key = $${paramIndex++}`);
      values.push(lowestKey);
    }

    if (highMsgNum !== undefined) {
      updates.push(`high_msg_num = $${paramIndex++}`);
      values.push(highMsgNum);
    }

    if (updates.length === 0) return false;

    await db.query(`
      UPDATE mailstat
      SET ${updates.join(', ')}
      WHERE conferenceid = $1 AND messagebaseid = $2
    `, values);

    return true;
  } catch (error) {
    console.error('[updateMessageNumberRange] Error:', error);
    return false;
  }
}

// Voting Booth Database Functions (express.e:20782-21036, vote() and voteMenu())

// Get all active vote topics for a conference
async function getActiveVoteTopics(conferenceId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT
        vt.id,
        vt.topic_number,
        vt.title,
        vt.description,
        vt.created_at,
        vt.created_by,
        COUNT(DISTINCT vq.id) as question_count
      FROM vote_topics vt
      LEFT JOIN vote_questions vq ON vt.id = vq.topic_id
      WHERE vt.conference_id = $1 AND vt.is_active = true
      GROUP BY vt.id, vt.topic_number, vt.title, vt.description, vt.created_at, vt.created_by
      ORDER BY vt.topic_number
    `, [conferenceId]);
    return result.rows;
  } catch (error) {
    console.error('[getActiveVoteTopics] Error:', error);
    return [];
  }
}

// Get a specific vote topic by conference and topic number
async function getVoteTopic(conferenceId: number, topicNumber: number): Promise<any | null> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_topics
      WHERE conference_id = $1 AND topic_number = $2 AND is_active = true
    `, [conferenceId, topicNumber]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[getVoteTopic] Error:', error);
    return null;
  }
}

// Get all questions for a vote topic
async function getVoteQuestions(topicId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_questions
      WHERE topic_id = $1
      ORDER BY question_number
    `, [topicId]);
    return result.rows;
  } catch (error) {
    console.error('[getVoteQuestions] Error:', error);
    return [];
  }
}

// Get all answers for a question
async function getVoteAnswers(questionId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT * FROM vote_answers
      WHERE question_id = $1
      ORDER BY answer_letter
    `, [questionId]);
    return result.rows;
  } catch (error) {
    console.error('[getVoteAnswers] Error:', error);
    return [];
  }
}

// Check if user has already voted on a topic
async function hasUserVoted(userId: string, topicId: number): Promise<boolean> {
  try {
    const result = await db.query(`
      SELECT 1 FROM vote_status
      WHERE user_id = $1 AND topic_id = $2
    `, [userId, topicId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('[hasUserVoted] Error:', error);
    return false;
  }
}

// Submit user's votes for a topic
async function submitVote(userId: string, topicId: number, conferenceId: number, votes: Array<{questionId: number, answerId: number}>): Promise<boolean> {
  const client = await (db as any).pool.connect();
  try {
    await client.query('BEGIN');

    // Insert all vote results
    for (const vote of votes) {
      // Insert or update the user's vote
      await client.query(`
        INSERT INTO vote_results (user_id, topic_id, question_id, answer_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, question_id)
        DO UPDATE SET answer_id = $4, voted_at = CURRENT_TIMESTAMP
      `, [userId, topicId, vote.questionId, vote.answerId]);

      // Increment the answer's vote count
      await client.query(`
        UPDATE vote_answers
        SET vote_count = vote_count + 1
        WHERE id = $1
      `, [vote.answerId]);
    }

    // Mark the topic as voted by this user
    await client.query(`
      INSERT INTO vote_status (user_id, topic_id, conference_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, topic_id) DO NOTHING
    `, [userId, topicId, conferenceId]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[submitVote] Error:', error);
    return false;
  } finally {
    client.release();
  }
}

// Get voting statistics for a topic
async function getVoteStatistics(topicId: number): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT
        vq.id as question_id,
        vq.question_number,
        vq.question_text,
        va.id as answer_id,
        va.answer_letter,
        va.answer_text,
        va.vote_count,
        (SELECT COUNT(*) FROM vote_results WHERE question_id = vq.id) as total_question_votes
      FROM vote_questions vq
      LEFT JOIN vote_answers va ON vq.id = va.question_id
      WHERE vq.topic_id = $1
      ORDER BY vq.question_number, va.answer_letter
    `, [topicId]);
    return result.rows;
  } catch (error) {
    console.error('[getVoteStatistics] Error:', error);
    return [];
  }
}

// Create new vote topic (sysop function)
async function createVoteTopic(conferenceId: number, topicNumber: number, title: string, description: string, userId: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_topics (conference_id, topic_number, title, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [conferenceId, topicNumber, title, description, userId]);
    return result.rows[0].id;
  } catch (error) {
    console.error('[createVoteTopic] Error:', error);
    return null;
  }
}

// Create vote question
async function createVoteQuestion(topicId: number, questionNumber: number, questionText: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_questions (topic_id, question_number, question_text)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [topicId, questionNumber, questionText]);
    return result.rows[0].id;
  } catch (error) {
    console.error('[createVoteQuestion] Error:', error);
    return null;
  }
}

// Create vote answer
async function createVoteAnswer(questionId: number, answerLetter: string, answerText: string): Promise<number | null> {
  try {
    const result = await db.query(`
      INSERT INTO vote_answers (question_id, answer_letter, answer_text)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [questionId, answerLetter.toUpperCase(), answerText]);
    return result.rows[0].id;
  } catch (error) {
    console.error('[createVoteAnswer] Error:', error);
    return null;
  }
}

// Delete vote topic (sysop function)
async function deleteVoteTopic(topicId: number): Promise<boolean> {
  try {
    // CASCADE will handle deleting questions, answers, results, and status
    await db.query(`
      DELETE FROM vote_topics WHERE id = $1
    `, [topicId]);
    return true;
  } catch (error) {
    console.error('[deleteVoteTopic] Error:', error);
    return false;
  }
}

// Get next available topic number for a conference
async function getNextTopicNumber(conferenceId: number): Promise<number> {
  try {
    const result = await db.query(`
      SELECT COALESCE(MAX(topic_number), 0) + 1 as next_number
      FROM vote_topics
      WHERE conference_id = $1
    `, [conferenceId]);
    const nextNum = result.rows[0].next_number;
    return nextNum <= 25 ? nextNum : 0; // Return 0 if all 25 slots are full
  } catch (error) {
    console.error('[getNextTopicNumber] Error:', error);
    return 0;
  }
}

// Load flagged files for user (express.e:2757)
// In express.e, reads from BBS:Partdownload/flagged{slot} and dump{slot}
// For web version, we store in database but maintain exact behavior
async function loadFlagged(socket: any, session: BBSSession) {
  try {
    // Initialize flaggedFiles list if not exists
    if (!session.tempData) {
      session.tempData = {};
    }
    if (!session.tempData.flaggedFiles) {
      session.tempData.flaggedFiles = [];
    }

    // Load user's flagged files from database
    // Format: array of {confNum: number, fileName: string}
    const result = await db.query(
      'SELECT conf_num, file_name FROM flagged_files WHERE user_id = ?',
      [session.user!.id]
    );

    // Add to session (like express.e's addFlagItem)
    result.rows.forEach(row => {
      session.tempData.flaggedFiles.push({
        confNum: row.conf_num,
        fileName: row.file_name
      });
    });

    // Like express.e:2795 - display notification if files exist
    if (session.tempData.flaggedFiles.length > 0) {
      socket.emit('ansi-output', '\r\n** Flagged File(s) Exist **\r\n');
      socket.emit('ansi-output', '\x07'); // sendBELL()
    }
  } catch (error) {
    console.error('Error loading flagged files:', error);
    // Fail silently like express.e would if file doesn't exist
  }
}

// Load command history for user (express.e:2669)
// In express.e, reads from {historyFolder}/history{slot}
// For web version, we store in database but maintain exact behavior
async function loadHistory(session: BBSSession) {
  try {
    // Initialize history storage
    if (!session.tempData) {
      session.tempData = {};
    }

    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;

    // Load from database
    const result = await db.query(
      'SELECT history_num, history_cycle, commands FROM command_history WHERE user_id = ?',
      [session.user!.id]
    );

    if (result.rows.length > 0) {
      const history = result.rows[0];
      session.tempData.historyNum = history.history_num || 0;
      session.tempData.historyCycle = history.history_cycle || 0;

      // commands is stored as JSON array
      if (history.commands) {
        session.tempData.historyBuf = Array.isArray(history.commands)
          ? history.commands
          : JSON.parse(history.commands);
      }
    }
  } catch (error) {
    console.error('Error loading command history:', error);
    // Fail silently like express.e would if file doesn't exist
    session.tempData = session.tempData || {};
    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;
  }
}

// Process queued online messages (express.e:29108)
function processOlmMessageQueue(socket: any, session: BBSSession, showMessages: boolean) {
  // In express.e, this displays queued online messages (OLM)
  // These are instant messages from other users that arrived while busy

  if (!session.tempData?.olmQueue) {
    session.tempData = session.tempData || {};
    session.tempData.olmQueue = [];
  }

  if (session.tempData.olmQueue.length > 0) {
    if (showMessages) {
      socket.emit('ansi-output', '\r\nDisplaying Message Queue\r\n');
      session.tempData.olmQueue.forEach((msg: string) => {
        socket.emit('ansi-output', msg + '\r\n');
      });
    }
    session.tempData.olmQueue = [];
  }
}

// ===== MENU/COMMAND PROCESSING NOW IN handlers/command.handler.ts =====

// Map substate to human-readable activity for WHO command
function getActivityFromSubState(subState?: string): string {
  if (!subState) return 'IDLE';

  // Match express.e ENV_* states
  switch (subState) {
    case LoggedOnSubState.DISPLAY_MENU:
    case LoggedOnSubState.READ_COMMAND:
    case LoggedOnSubState.READ_SHORTCUTS:
      return 'MAIN MENU';
    case LoggedOnSubState.READ_MESSAGES:
      return 'READING MAIL';
    case LoggedOnSubState.POST_MESSAGE:
    case LoggedOnSubState.POST_MESSAGE_SUBJECT:
    case LoggedOnSubState.POST_MESSAGE_TO:
    case LoggedOnSubState.POST_MESSAGE_BODY:
      return 'POSTING MESSAGE';
    case LoggedOnSubState.FILES_MAIN:
    case LoggedOnSubState.FILES_VIEW_AREA:
      return 'BROWSING FILES';
    case LoggedOnSubState.FILES_DOWNLOAD:
      return 'DOWNLOADING';
    case LoggedOnSubState.FILES_UPLOAD:
      return 'UPLOADING';
    case LoggedOnSubState.FILES_MAINTENANCE:
    case LoggedOnSubState.FILES_MAINT_SELECT:
      return 'FILE MAINTENANCE';
    default:
      return 'UNKNOWN';
  }
}

// Global data caches (loaded from database)
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let fileEntries: any[] = [];
let messages: any[] = [];

// Initialize default webhook from environment variables
async function initializeDefaultWebhook() {
  try {
    const webhookUrl = process.env.BBS_WEBHOOK_URL || process.env.DEPLOY_WEBHOOK_URL;

    if (!webhookUrl) {
      console.log('[Webhook Init] No webhook URL configured in environment variables');
      return;
    }

    // Check if any webhooks exist
    const existingWebhooks = await db.getWebhooks();

    if (existingWebhooks.length > 0) {
      console.log(`[Webhook Init] Found ${existingWebhooks.length} existing webhook(s), skipping initialization`);
      return;
    }

    // Create default webhook with all triggers
    const allTriggers = [
      'new_upload',
      'new_message',
      'new_user',
      'sysop_paged',
      'user_login',
      'user_logout',
      'file_downloaded',
      'comment_posted',
      'node_full',
      'system_error',
      'conference_joined',
      'security_changed',
      'door_launched',
      'vote_cast',
      'private_message',
      'user_kicked',
      'mail_scan'
    ];

    const webhookType = webhookUrl.includes('discord.com') ? 'discord' : 'slack';

    await db.createWebhook({
      name: 'BBS Discord Notifications',
      url: webhookUrl,
      type: webhookType,
      triggers: allTriggers
    });

    console.log(`[Webhook Init] ✓ Created default ${webhookType} webhook with ${allTriggers.length} triggers`);
  } catch (error) {
    console.error('[Webhook Init] Error initializing default webhook:', error);
  }
}

// Initialize data from database
async function initializeData() {
  try {
    // Initialize database schema first
    await db.init();
    console.log('Database schema initialized');

    // Initialize default webhook if configured
    await initializeDefaultWebhook();

    // express.e: cmds.numConf and confNames/confDirs are populated from ConfConfig.info (NCONFS, NAME.n, LOCATION.n)
    // The BBS ALWAYS uses disk files, NOT the database, for conference configuration
    const bbsRoot = process.env.BBS_ROOT || config.get('dataDir');
    const confConfig = loadConfConfig(bbsRoot);

    if (confConfig && confConfig.confCount > 0) {
      // Create conferences array from ConfConfig.info (express.e:8499-8512 uses cmds.numConf from this file)
      conferences = [];
      for (let i = 0; i < confConfig.confCount; i++) {
        const entry = confConfig.entries[i];
        conferences.push({
          id: i + 1,
          name: entry.name || `Conference ${i + 1}`,
          location: entry.location || `BBS:Conf${i + 1}/`
        });
      }
      console.log(`[Conference Init] Loaded ${conferences.length} conferences from ConfConfig.info`);
    } else {
      // Fallback: check for Conf.DB headers (original AmiExpress format)
      const confDbHeaders = conferenceFileManager.getAllConferenceHeaders();
      if (confDbHeaders.length > 0) {
        conferences = confDbHeaders.map((header, i) => ({
          id: i + 1,
          name: header.name || `Conference ${i + 1}`,
          location: `BBS:Conf${i + 1}/`
        }));
        console.log(`[Conference Init] Loaded ${conferences.length} conferences from Conf.DB files`);
      } else {
        // Last resort: scan for Conf*.info files on disk
        const fs = require('fs');
        const confFiles = fs.readdirSync(bbsRoot).filter((f: string) => /^Conf\d+\.info$/.test(f));
        const confNumbers = confFiles.map((f: string) => parseInt(f.match(/\d+/)?.[0] || '0')).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
        if (confNumbers.length > 0) {
          const maxConf = Math.max(...confNumbers);
          conferences = [];
          for (let i = 1; i <= maxConf; i++) {
            conferences.push({
              id: i,
              name: `Conference ${i}`,
              location: `BBS:Conf${i}/`
            });
          }
          console.log(`[Conference Init] Found ${conferences.length} Conf*.info files on disk`);
        } else {
          // Absolute fallback: use database
          conferences = await db.getConferences();
          if (conferences.length === 0) {
            await db.initializeDefaultData();
            conferences = await db.getConferences();
          }
          console.log(`[Conference Init] Using ${conferences.length} conferences from database`);
        }
      }
    }

    // Inject conferences into screen handler
    setConferences(conferences);

    // Load message bases for all conferences
    messageBases = [];
    for (const conf of conferences) {
      const bases = await db.getMessageBases(conf.id);
      messageBases.push(...bases);
    }

    // Inject dependencies into conference handler
    setConferencesForConferenceHandler(conferences);
    setMessageBases(messageBases);
    setDatabase(db);
    setHelpers({ callersLog, loadFlagged, loadHistory });
    setConstants({ SCREEN_BULL, SCREEN_NODE_BULL, SCREEN_CONF_BULL, LoggedOnSubState });

    // Load file areas from disk (express.e:5006, 15264 - reads NDIRS, DLPATH.n, ULPATH.n from Conf*.info)
    fileAreas = loadFileAreasFromDisk(bbsRoot, conferences);
    await ensureRootScreens(bbsRoot);
    await ensureConferenceStructure(bbsRoot, conferences, fileAreas);
    console.log(`[Initialization] Loaded ${fileAreas.length} file areas from disk`);

    // Load file entries for all file areas
    fileEntries = []; // TODO: Load file entries per-area as needed

    // Inject dependencies into file handler
    setFileAreas(fileAreas);
    setFileEntries(fileEntries);
    setDatabaseForFileHandler(db);
    setCallersLog(callersLog);
    setGetUserStats(getUserStats);

    // Inject file maintenance dependencies
    setFileMaintenanceDependencies({
      searchFilesByName,
      searchFilesAdvanced,
      getFileEntry,
      deleteFileEntry,
      moveFileEntry,
      updateFileDescription,
      getFileAreas
    });

    // Inject message entry dependencies
    setMessageEntryDependencies({
      db,
      callersLog
    });

    // Inject messaging (message reader) dependencies
    setMessagingDependencies({
      db,
      callersLog
    });

    // Load some recent messages
    messages = await db.getMessages(1, 1, { limit: 50 });

    // Load Amiga command definitions (.info and .CMD files) FIRST
    // express.e loads commands at startup for SYSCMD and BBSCMD lookup
    // CRITICAL: Must be called before initializeDoors() so BBSCMD commands are available
    const bbsBaseDir = config.get('dataDir');
    loadCommands(bbsBaseDir, 1, 0); // Load for conference 1, node 0

    // Initialize doors (converts CommandDefinition from BBSCMD to Door objects)
    await initializeDoors();

    // Inject dependencies into door handler
    // Note: doors are already populated by initializeDoors(), no need to setDoors()
    setDoorSessions(doorSessions);
    setDatabaseForDoorHandler(db);
    setHelpersForDoorHandler({ callersLog, getRecentCallerActivity });
    setConstantsForDoorHandler({ LoggedOnSubState });

    // Inject dependencies into chat handler
    setChatState(chatState);
    setConstantsForChatHandler({ LoggedOnSubState });
    setHelpersForChatHandler({ executePagerDoor, displayMainMenu });

    // Inject dependencies into account handler
    setDatabaseForAccountHandler(db);

    // Inject dependencies into bulletin handler
    setBulletinDependencies(db, parseMciCodes, addAnsiEscapes);

    // Inject dependencies into message scan handler
    setMessageScanDependencies(db, displayScreen, parseMciCodes, addAnsiEscapes, loadScreenFile, conferences, messageBases);

    // Inject dependencies into user commands handler
    setUserCommandsDependencies({
      conferences,
      messageBases,
      db,
      joinConference,
      checkConfAccess,
      displayScreen: displayScreen as any,
      displayUploadInterface: displayUploadInterface as any,
      displayDownloadInterface: displayDownloadInterface as any
    });

    // Inject dependencies into system commands handler
    setSystemCommandsDependencies({
      displayScreen: displayScreen as any,
      findSecurityScreen: findSecurityScreen as any
    });

    // Inject dependencies into navigation commands handler
    setNavigationCommandsDependencies({
      conferences,
      messageBases,
      joinConference,
      checkConfAccess,
      displayNewFiles
    });

    // Inject dependencies into display/file commands handler
    setDisplayFileCommandsDependencies({
      displayScreen,
      findSecurityScreen,
      confScreenDir: path.join(config.get('dataDir'), 'Screens'),
      db,
      hasKeysFile
    });

    // Inject dependencies into preference/chat commands handler
    setPreferenceChatCommandsDependencies({
      startSysopPage,
      db
    });

    // Inject dependencies into advanced commands handler
    setAdvancedCommandsDependencies({
      conferences,
      messages,
      checkConfAccess
    });

    // Inject dependencies into message commands handler
    setMessageCommandsDependencies({
      messageBases,
      conferences,
      joinConference,
      displayScreen: displayScreen as any,
      resetNewMailScanPointers,
      resetLastMessageReadPointers,
      getConferenceStats,
      updateMessageNumberRange,
      getMailStatFile
    });

    // Inject dependencies into info commands handler
    setInfoCommandsDependencies({
      sessions
    });

    // Inject dependencies into utility commands handler
    setUtilityCommandsDependencies({
      handleGoodbyeCommand,
      messages,
      confScreenDir: path.join(config.get('dataDir'), 'Screens'),
      findSecurityScreen,
      displayScreen: displayScreen as any,
      searchFileDescriptions
    });

    // Inject dependencies into sysop commands handler
    setSysopCommandsDependencies({
      getRecentCallerActivity,
      setEnvStat,
      db
    });

    // Inject dependencies into transfer/misc commands handler
    setTransferMiscCommandsDependencies({
      setEnvStat,
      displayUploadInterface,
      displayDownloadInterface,
      fileAreas,
      getActiveVoteTopics,
      getVoteTopic,
      getVoteQuestions,
      getVoteAnswers,
      hasUserVoted,
      submitVote,
      getVoteStatistics,
      createVoteTopic,
      createVoteQuestion,
      createVoteAnswer,
      deleteVoteTopic,
      getNextTopicNumber
    });

    // Inject dependencies into messaging handler
    setMessagingDependencies({
      setEnvStat,
      messages,
      getMailStatFile,
      loadMsgPointers,
      validatePointers,
      updateReadPointer
    });

    // Inject dependencies into command handler
    setDatabaseForCommandHandler(db);
    setConfig(config);
    setConferencesForCommandHandler(conferences);
    setMessageBasesForCommandHandler(messageBases);
    setFileAreasForCommandHandler(fileAreas);
    setProcessOlmMessageQueue(processOlmMessageQueue);
    setCheckSecurity(checkSecurity);
    setSetEnvStat(setEnvStat);
    setGetRecentCallerActivityForCommandHandler(getRecentCallerActivity);
    setDoorsForCommandHandler(getDoors());
    setConstantsForCommandHandler({ SCREEN_MENU });

    // Inject dependencies into command execution handler
    setCommandExecutionDependencies(executeDoor, processBBSCommand);

    console.log('Database initialized with:', {
      conferences: conferences.length,
      messageBases: messageBases.length,
      fileAreas: fileAreas.length,
      messages: messages.length,
      doors: getDoors().length
    });
  } catch (error) {
    console.error('Failed to initialize data:', error);
  }
}

// (initializeDoors now in handlers/door.handler.ts)

// ===== CHAT HANDLING NOW IN handlers/chat.handler.ts =====

// handleFileDeleteConfirmation() - Confirm and execute file deletion

// (toggleSysopAvailable and getChatStatus now in handlers/chat.handler.ts)
// ===== ACCOUNT MANAGEMENT NOW IN handlers/account.handler.ts =====

// ===== SERVER STARTUP =====
// Initialize database and start server
// IMPORTANT: Database must be initialized BEFORE accepting connections
(async () => {
  try {
    console.log('Initializing database and loading data...');
    await initializeData();
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
