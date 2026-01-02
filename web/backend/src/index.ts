import "reflect-metadata"; // Must be first import for tsyringe decorators
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import multer from "multer";
import {
  User,
  Door,
  DoorSession,
  ChatSession,
  ChatMessage,
  ChatState,
} from "./types";
import { db } from "./database";
import { config } from "./config";
import { qwkManager, ftnManager } from "./services/qwk.service";
import {
  nodeManager,
  arexxEngine,
  protocolManager,
} from "./services/node-manager.service";
import { nodeFileManager } from "./services/NodeFileManager";
import { callersLogManager } from "./services/CallersLogManager";
import { doorDropFileManager } from "./services/DoorDropFileManager";
import { triggerSamiLogRefresh } from "./services/SamiLogService";
import { conferenceFileManager } from "./services/ConferenceFileManager";
import { loadConfConfig } from "./services/conf-config.service";
import { bbsEventEmitter } from "./services/bbs-event-emitter";
import {
  loadFileAreasFromDisk,
  ensureConferenceStructure,
  ensureRootScreens,
} from "./services/file-areas-loader";
import { BBSState, LoggedOnSubState } from "./constants/bbs-states";
export { BBSState, LoggedOnSubState };
import {
  extractAndReadDiz,
  getNodeWorkDir,
  getPlaypenDir,
} from "./utils/file-diz.util";
import { testFile, TestResult } from "./utils/file-test.util";
import { moveUploadedFile, getConferenceDir } from "./utils/file-hold.util";
import {
  convertUnicodePuaToPetscii,
  convertPetsciiInputToAscii,
  convertAsciiToPetsciiOutput,
} from "./utils/petscii.util";
import { writeUploadToDirFile } from "./utils/dir-file.util";
import {
  updateSysopUploadStats,
  doUploadNotify,
} from "./utils/upload-notify.util";
import { AuthHandler } from "./handlers/user/auth.handler";
import { SessionLogsHandler } from "./handlers/admin/session-logs.handler";
import {
  authenticateToken,
  requireSysop,
  AuthRequest,
} from "./middleware/auth.middleware";
import { createConfigRouter } from "./api/config-routes";
import { createBatchRouter } from "./api/batch-routes";
import { createImportRouter } from "./handlers/admin/import.handler";
import {
  displayScreen,
  doPause,
  parseMciCodes,
  loadScreenFile,
  addAnsiEscapes,
  setConferences,
  hasKeysFile,
} from "./handlers/screen.handler";
import { registerSocketHandlers } from "./server/socket-handlers";
import { displaySystemBulletins } from "./server/database-helpers";
import { initializeData } from "./server/initialization";
import {
  sessions,
  userSessions,
  socketToUser,
  setSession,
  getNextAvailableNodeId,
  createSession,
  socketToNodeId,
} from "./server/session-manager";
import { app } from "./server/app";
import { TelnetServer, TelnetConnection } from "./server/telnet-server";
import { SSHServerImpl, SSHConnection } from "./server/ssh-server";
import { SSHKeyUtil } from "./utils/ssh-key.util";
import { findSecurityScreen } from "./utils/screen-security.util";
import { DEFAULT_CONNECTION_BAUD } from "./constants/modem";

const SCREEN_BBSTITLE = "BBSTITLE";
const SCREEN_LOGON = "LOGON";
const SCREEN_BULL = "BULL";
const SCREEN_NODE_BULL = "NODE_BULL";
const SCREEN_CONF_BULL = "CONF_BULL";
const SCREEN_MENU = "MENU";
const SCREEN_LOGOFF = "LOGOFF";
const SCREEN_JOINCONF = "JoinConf";
const SCREEN_JOINED = "JOINED";
const SCREEN_JOINMSGBASE = "JoinMsgBase";
const SCREEN_NONEWUSERS = "NoNewUsers";
const SCREEN_NONEWATBAUD = "NoNewAtBaud";
const SCREEN_NEWUSERPW = "NewUserPw";
const SCREEN_GUESTLOGON = "GuestLogon";
const SCREEN_JOIN = "JOIN";

import {
  displayConferenceBulletins,
  joinConference,
  setConferences as setConferencesForConferenceHandler,
  setMessageBases,
  setDatabase,
  setHelpers,
  setConstants,
} from "./handlers/operations/conference.handler";
import {
  handleBulletinCommand,
  handleBulletinInput,
  setBulletinDependencies,
} from "./handlers/content/bulletin.handler";
import {
  performConferenceScan,
  displayMailScanScreen,
  setMessageScanDependencies,
  checkConfAccess,
} from "./handlers/message/message-scan.handler";
import { setUserCommandsDependencies } from "./handlers/commands/user-commands.handler";
import {
  handleGoodbyeCommand,
  setSystemCommandsDependencies,
} from "./handlers/commands/system-commands.handler";
import { setNavigationCommandsDependencies } from "./handlers/commands/navigation-commands.handler";
import { setDisplayFileCommandsDependencies } from "./handlers/commands/display-file-commands.handler";
import { setPreferenceChatCommandsDependencies } from "./handlers/chat/preference-chat-commands.handler";
import { setAdvancedCommandsDependencies } from "./handlers/commands/advanced-commands.handler";
import { setMessageCommandsDependencies } from "./handlers/message/message-commands.handler";
import { setInfoCommandsDependencies } from "./handlers/commands/info-commands.handler";
import { setUtilityCommandsDependencies } from "./handlers/commands/utility-commands.handler";
import { setSysopCommandsDependencies } from "./handlers/commands/sysop-commands.handler";
import { setTransferMiscCommandsDependencies } from "./handlers/commands/transfer-misc-commands.handler";
import { setMessagingDependencies } from "./handlers/message/messaging.handler";
import {
  displayDoorMenu,
  executeDoor,
  initializeDoors,
  executePagerDoor,
  getDoors,
  setDoorSessions,
  setDatabase as setDatabaseForDoorHandler,
  setHelpers as setHelpersForDoorHandler,
  setConstants as setConstantsForDoorHandler,
} from "./handlers/door.handler";
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
  setHelpers as setHelpersForChatHandler,
} from "./handlers/chat/chat.handler";
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
  setFileMaintenanceDependencies,
} from "./handlers/file/file.handler";
import { setMessageEntryDependencies } from "./handlers/message/message-entry.handler";
import {
  handleAccountEditing,
  displayUserList,
  handleEditUserAccount,
  handleViewUserStats,
  handleChangeSecLevel,
  handleToggleUserFlags,
  handleDeleteUserAccount,
  handleSearchUsers,
  setDatabase as setDatabaseForAccountHandler,
} from "./handlers/user/account.handler";
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
  setCommandExecutionDependencies,
} from "./handlers/command.handler";
import { reloadDoorCommands } from "./handlers/command-execution.handler";
import * as fs from "fs";
import * as path from "path";

// Phase 9: Security/ACS System imports
import { ACSCode } from "./constants/acs-codes";
import { EnvStat } from "./constants/env-codes";
import {
  checkSecurity,
  setEnvStat,
  initializeSecurity,
  setTempSecurityFlag,
  clearTempSecurityFlag,
  setOverride,
  clearOverride,
} from "./utils/security.util";

// Phase 10: Message Pointer System imports
import {
  loadMsgPointers,
  saveMsgPointers,
  getMailStatFile,
  validatePointers,
  hasNewMessages,
  updateReadPointer,
  updateScanPointer,
} from "./utils/message-pointers.util";

export interface UploadSessionContext {
  uploadMode: true;
  fileArea: any;
  uploadSessionId: string;
  [key: string]: any;
}

export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  skipNextDisplayFlowMenu?: boolean;
  manualMenuTargetState?: LoggedOnSubState;
  user?: any; // Will be User from database (expert stored as "X"/"N")
  currentConf: number;
  currentConference?: number; // Current conference ID (GlobalStructures parity)
  conferenceId: number; // XIM doors read this property for current conference
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
  connectionType?: "web" | "telnet" | "ssh";
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
  newFilesPauseFlag?: boolean; // Like AmiExpress newFilesPauseFlag - express.e:216,28100 - controls pause during confScan
  inConfScan?: boolean; // Whether user is currently in conference scan - suppress menu prompts
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
  doorKeyStateHandler?:
    | ((data: {
        key: string;
        pressed: boolean;
        keyState: Record<string, boolean>;
      }) => void)
    | null; // Door key state handler for simultaneous key input
  doorReconnectHandler?: (() => void) | null; // Door reconnect handler to force redraw after socket reconnect
  pendingDoorCommands?: string[]; // Commands queued by doors to run after exit
  socket?: any; // Active socket instance (used for reconnect-safe output)
  socketId?: string; // Active socket id for this session
  bbsApi?: any; // Active BBS API instance for doors (used to rebind socket on reconnect)
  keyState?: Record<string, boolean>; // Current key state for simultaneous input (which keys are pressed)
  gameModeEnabled?: boolean; // Whether game mode is active (raw keydown/keyup events)
  currentDoorType?: string; // Type of currently running door (XIM, AMI, TS, etc.)
  keyRepeatManager?:
    | import("./services/KeyRepeatManager").KeyRepeatManager
    | null; // Backend key repeat for 68K doors
  mouseEventsEnabled?: boolean; // Whether mouse events should be sent to door (for ANSI editor, etc.)
  ansiEnabled?: boolean; // Whether ANSI is enabled for this session
  petsciiMode?: boolean; // Whether PETSCII mode is enabled (40x25, .seq files)
  ripMode?: boolean; // Whether RIP graphics mode is enabled (640x350, .rip files)
  terminalType?: "c64" | "modern" | "unknown"; // Terminal type: C64 (raw PETSCII), modern (Unicode PUA), or unknown
  screenWidth?: number; // Terminal width (40 for C64, 80 for modern)
  screenHeight?: number; // Terminal height (25 for C64, 24 for modern)
  currentRoomId?: string; // Current chat room ID for group chat
  currentVoiceChannelId?: string; // Current voice channel ID for voice chat

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
  conferences?: import("./database/types").Conference[]; // Cached conference accounting stats (express.e confBases)
  queuedScreenCommands?: string[]; // Deferred screen commands (run after pause key)
  lastScreenHadPause?: boolean; // Whether the last displayed screen contained ~SP.
  lastScreenFilePath?: string; // Resolved path of last displayed screen (used for .keys lookup)
  loginRetryCount: number; // Login retry counter - express.e:29461, 29560 (max 5 before disconnect)
  callerNum?: number; // Caller number for this session (total calls to BBS)
  paginatedScreen?: {
    lines: string[];
    nextIndex: number;
    pageSize: number;
    eventName: "ansi-output" | "petscii-output";
    commands?: string[];
    onComplete?: () => void;
  };
  // Screen segment state for ~SP (soft pause) handling
  // express.e:5455-5461 - ~SP pauses IMMEDIATELY at each occurrence
  screenSegments?: {
    segments: string[]; // Remaining screen content segments to process
    currentIndex: number; // Current segment index
    screenName: string; // Original screen name for context
    inlineMode: boolean; // Whether inline mode was active
    eventName: "ansi-output" | "petscii-output";
    isFlowScreen: boolean; // Whether this is a display flow screen
  };
  slowmo?: number; // Slow screen output speed (MCI ~SMO), 1-5 per express.e
  slowmoCount?: number; // Remaining byte budget before next slowmo delay
  modemEmulationEnabled?: boolean; // When true, throttle screen output to modem-like speeds
  modemBps?: number; // Target bits per second for modem emulation

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
  lastTypingTime?: number; // Last time user was typing (for typing indicator)
  partnerTypingBuffer?: string; // Buffer for partner's typing indicator
  typingBlinkTimer?: NodeJS.Timeout; // Timer for typing indicator blinking
  smileyPickerState?: import("./utils/smiley-picker.util").SmileyPickerState; // State for ASCII smiley picker (Ctrl+E)

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
  chatToggle: true, // Like AmiExpress F7 chat toggle
};

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.get("corsOrigins"),
    methods: ["GET", "POST"],
  },
  // ROBUST CONNECTION SETTINGS - Tolerate temporary network issues
  pingTimeout: 120000, // Wait 2 minutes for pong before considering connection dead (increased from 60s)
  pingInterval: 25000, // Send ping every 25s to keep connection alive
  maxHttpBufferSize: 1e6, // 1MB max message size
  // Connection state recovery - helps maintain sessions across brief disconnects
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes - keep session state during brief disconnects
    skipMiddlewares: true, // Skip auth middleware on recovery (session already authenticated)
  },
  transports: ["websocket", "polling"], // Prefer websocket, fallback to polling
  allowEIO3: true, // Support older Socket.io clients
  perMessageDeflate: false, // Disable compression to reduce CPU usage
  httpCompression: false, // Disable HTTP compression to reduce CPU usage
  connectTimeout: 60000, // 60s connection timeout (increased from 45s)
});

// Initialize BBS event emitter for LiveChat integration
bbsEventEmitter.setIO(io);

// CRITICAL: Process-level error handlers to prevent crashes
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("[CRITICAL] Unhandled Promise Rejection:", reason);
  console.error("[CRITICAL] Promise:", promise);
  console.error("[CRITICAL] Stack:", reason?.stack || "No stack trace");
  // Log to file for debugging
  const fs = require("fs");
  const logPath = join(
    config.get("dataDir") || "./data",
    "logs/unhandled-errors.log"
  );
  const timestamp = new Date().toISOString();
  const errorLog = `\n\n=== UNHANDLED REJECTION at ${timestamp} ===\n${
    reason?.stack || reason
  }\n`;
  fs.appendFileSync(logPath, errorLog, "utf8");
  // Don't exit - keep server running
});

process.on("uncaughtException", (error: Error) => {
  console.error("[CRITICAL] Uncaught Exception:", error);
  console.error("[CRITICAL] Stack:", error.stack);
  // Log to file for debugging
  const fs = require("fs");
  const logPath = join(
    config.get("dataDir") || "./data",
    "logs/unhandled-errors.log"
  );
  const timestamp = new Date().toISOString();
  const errorLog = `\n\n=== UNCAUGHT EXCEPTION at ${timestamp} ===\n${error.stack}\n`;
  fs.appendFileSync(logPath, errorLog, "utf8");
  // Don't exit - keep server running unless it's truly fatal
  // Only exit for critical errors that could corrupt state
  const fatalErrors = ["EADDRINUSE", "EACCES", "EMFILE"];
  if (fatalErrors.some((code) => (error as any).code === code)) {
    console.error("[CRITICAL] Fatal error - shutting down");
    process.exit(1);
  }
});

// Socket.IO global error handler
io.engine.on("connection_error", (err: any) => {
  console.error("[Socket.IO] Connection error:", err);
  console.error("[Socket.IO] Error code:", err.code);
  console.error("[Socket.IO] Error message:", err.message);
  console.error("[Socket.IO] Error context:", err.context);
});

// Socket.IO authentication middleware for operator chat
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const hasToken = !!token;
  console.log(
    `[Socket.IO Auth] New connection, has token: ${hasToken}, socket id: ${socket.id}`
  );

  // If no token provided, allow connection (for BBS clients)
  if (!token) {
    console.log(
      "[Socket.IO Auth] No token provided, allowing anonymous connection"
    );
    return next();
  }

  try {
    // Try JWT authentication first (for logged-in admins)
    try {
      const jwtModule = await import("jsonwebtoken");
      // Handle both ESM and CommonJS module formats
      const jwt = jwtModule.default || jwtModule;

      // Use same fallback as database.ts for JWT_SECRET consistency
      const jwtSecret =
        process.env.JWT_SECRET || "amiexpress-secret-key-change-in-production";
      if (!process.env.JWT_SECRET) {
        console.warn(
          "[Socket.IO Auth] JWT_SECRET not set, using fallback (not recommended for production)"
        );
      }

      const decoded = jwt.verify(token, jwtSecret) as any;
      console.log("[Socket.IO Auth] JWT decoded successfully:", {
        userId: decoded.userId,
        username: decoded.username,
      });

      // Get user from database
      const user = await db.getUserById(decoded.userId);
      if (!user) {
        console.error(
          "[Socket.IO Auth] User not found in database:",
          decoded.userId
        );
        throw new Error("User not found");
      }

      // Check if this is a chat-only user (from web chat login)
      if (decoded.chatOnly) {
        // Create a proper BBS session for web chat users
        const nodeId = getNextAvailableNodeId();
        const session = createSession(nodeId);

        // Attach user info to the session
        (session as any).user = {
          id: user.id,
          username: user.username,
          secLevel: user.secLevel,
        };
        session.nodeId = nodeId;
        (session as any).chatOnly = true; // Mark as web chat session

        // Register the session so getSessionBySocketId() will find it
        setSession(socket.id, session);

        // Also attach to socket for direct access
        (socket as any).session = session;

        console.log(
          `[Socket.IO Auth] Web chat user authenticated: ${user.username} (nodeId: ${nodeId})`
        );
      } else {
        // Admin UI user - attach user info without full BBS session
        (socket as any).session = {
          user: {
            id: user.id,
            username: user.username,
            secLevel: user.secLevel,
          },
          nodeId: 0, // Admin UI doesn't have a node
        };

        console.log(
          `[Socket.IO Auth] Admin authenticated: ${user.username} (secLevel: ${user.secLevel})`
        );
      }
      return next();
    } catch (jwtError: any) {
      // JWT failed - check if it's expired vs invalid
      const isExpired = jwtError.name === "TokenExpiredError";
      const errorMsg = isExpired
        ? "Session expired - please log in again"
        : (jwtError as Error).message;
      console.log("[Socket.IO Auth] JWT verification failed:", errorMsg);
      console.log(
        "[Socket.IO Auth] Token preview:",
        token?.substring(0, 20) + "..."
      );

      // Try operator page token (UUID from Discord links) as fallback
      console.log(
        "[Socket.IO Auth] Checking if token is an operator page token instead..."
      );
      try {
        const operatorChatRepo = db.getOperatorChatRepository();
        const page = operatorChatRepo.getPageRequestByToken(token);

        if (page) {
          console.log(
            `[Socket.IO Auth] Valid operator page token for page ${page.id}`
          );

          // Create a temporary sysop session for operator page access
          (socket as any).session = {
            user: {
              id: "operator-page-" + page.id,
              username: "Operator (Discord)",
              secLevel: 100, // Sysop level for operator chat
            },
            nodeId: 0,
            pageId: page.id, // Attach page ID for context
          };

          return next();
        } else {
          console.log(
            "[Socket.IO Auth] No operator page found for token (may be expired or invalid)"
          );
        }
      } catch (repoError) {
        console.error(
          "[Socket.IO Auth] Error looking up operator page:",
          repoError
        );
      }

      // Neither JWT nor operator page token worked - provide specific error
      if (isExpired) {
        throw new Error("Session expired - please log in again");
      }
      throw new Error("Invalid authentication token");
    }
  } catch (error: any) {
    console.error("[Socket.IO Auth] Authentication failed:", error.message);
    next(new Error(error.message || "Authentication failed"));
  }
});

const port = process.env.PORT || config.get("port");

// Create telnet and SSH servers for native BBS client connections (configured at runtime)
let telnetPort = parseInt(process.env.TELNET_PORT || "64128");
let sshPort = parseInt(process.env.SSH_PORT || "31337");
let telnetServer: TelnetServer | null = null;
let sshServer: SSHServerImpl | null = null;

// Store active sessions (in production, use Redis/database)
// NOTE: sessions, userSessions, and socketToUser are imported from session-manager module
// This ensures both index.ts and socket-handlers.ts use the SAME storage

// Connection rate limiting - track recent connections
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP
const CONNECTION_WINDOW = 60000; // 60 second window

export const LOCALHOST_IPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

function checkConnectionLimit(ip: string): boolean {
  // Always skip rate limiting for loopback/internal addresses
  if (LOCALHOST_IPS.includes(ip)) {
    return true;
  }

  // In development allow everything (already handled above for loopback but keep behaviour)
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const now = Date.now();
  const connections = recentConnections.get(ip) || [];

  // Remove old connections outside the window
  const recentConns = connections.filter(
    (time) => now - time < CONNECTION_WINDOW
  );

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
    const recent = connections.filter((time) => now - time < CONNECTION_WINDOW);
    if (recent.length === 0) {
      recentConnections.delete(ip);
    } else {
      recentConnections.set(ip, recent);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

// getNextAvailableNodeId is now imported from session-manager

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
function updateSessionForSocket(
  socketId: string,
  updates: Partial<BBSSession>
): void {
  const session = getSessionBySocketId(socketId);
  if (!session) return;

  Object.assign(session, updates);
}

// Initialize handlers
const authHandler = new AuthHandler(db);
const sessionLogsHandler = new SessionLogsHandler();

// Initialize internode chat handler dependencies
const {
  setInternodeChatDependencies,
} = require("./handlers/chat/internode-chat.handler");
const {
  setChatCommandsDependencies,
  handleChatCommand,
} = require("./handlers/chat/chat-commands.handler");

setInternodeChatDependencies({ db, sessions, io });

const internodeChatHandler = require("./handlers/chat/internode-chat.handler");
setChatCommandsDependencies({
  db,
  sessions,
  io,
  handleChatRequest: internodeChatHandler.handleChatRequest,
  handleChatAccept: internodeChatHandler.handleChatAccept,
  handleChatDecline: internodeChatHandler.handleChatDecline,
});

// Initialize group chat room handler dependencies
const {
  setGroupChatDependencies,
} = require("./handlers/chat/group-chat.handler");
const {
  setRoomCommandsDependencies,
} = require("./handlers/chat/room-commands.handler");

setGroupChatDependencies({ db, sessions, io });
setRoomCommandsDependencies({
  db,
  sessions,
  io,
  handleRoomCreate: require("./handlers/chat/group-chat.handler")
    .handleRoomCreate,
  handleRoomJoin: require("./handlers/chat/group-chat.handler").handleRoomJoin,
  handleRoomLeave: require("./handlers/chat/group-chat.handler")
    .handleRoomLeave,
  handleRoomList: require("./handlers/chat/group-chat.handler").handleRoomList,
  handleRoomKick: require("./handlers/chat/group-chat.handler").handleRoomKick,
  handleRoomMute: require("./handlers/chat/group-chat.handler").handleRoomMute,
});

// Initialize OLM (Online Message) handler dependencies - express.e:25406-25515
const { setOlmDependencies } = require("./handlers/transfer/olm.handler");

setOlmDependencies({
  db,
  sessions,
  io,
  setEnvStat,
  config,
});

// Initialize Preference/Chat commands handler dependencies - express.e:26113+ (Expert mode)
setPreferenceChatCommandsDependencies({
  startSysopPage: (socket: any, session: any) => {
    // Placeholder for sysop page - handled elsewhere
    console.log("[SYSOP] Page sysop requested");
  },
  db,
});

// Initialize New User Registration handler dependencies - express.e:30003+
const { setNewUserDependencies } = require("./handlers/user/new-user.handler");

setNewUserDependencies({
  db,
  sessions,
  screens: {
    NONEWUSERS: SCREEN_NONEWUSERS,
    NONEWATBAUD: SCREEN_NONEWATBAUD,
    NEWUSERPW: SCREEN_NEWUSERPW,
    GUESTLOGON: SCREEN_GUESTLOGON,
    JOIN: SCREEN_JOIN,
  },
  newUserPassword: config.get("newUserPassword"),
  autoValidationPassword: config.get("autoValidationPassword"),
  autoValidationSecLevel: config.get("autoValidationSecLevel"),
});

// Import HTTP routes setup
import { registerHttpRoutes } from "./server/routes-setup";

// ===== HTTP Routes (now in server/routes-setup.ts) =====
// Routes registered in startup section below

// Telnet/SSH Connection Handler
// Connects native telnet and SSH clients to BBS command processing
function setupTelnetSSHHandler(
  connection: TelnetConnection | SSHConnection,
  type: "telnet" | "ssh",
  io: any
) {
  const remoteAddress = connection.getRemoteAddress();
  console.log(
    `[${type.toUpperCase()}] Connection from ${remoteAddress} on node ${
      connection.nodeId
    }`
  );

  // Create emitter interface that mimics Socket.IO socket
  const emitter = {
    emit: (event: string, data: any) => {
      if (event === "ansi-output") {
        // Check if this is a C64/PETSCII terminal
        if (
          connection.session?.terminalType === "c64" ||
          connection.session?.petsciiMode
        ) {
          // C64 terminal - convert ASCII text to PETSCII with proper case handling
          // This handles prompts like "Username:", "Password:", etc.
          if (typeof data === "string") {
            // Strip ANSI escape sequences (C64 doesn't understand them)
            const strippedData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
            const petsciiBytes = convertAsciiToPetsciiOutput(strippedData);
            connection.write(petsciiBytes);
          } else {
            connection.write(data);
          }
        } else {
          // Modern terminal or unknown - send as-is (ANSI codes)
          connection.write(data);
        }
      } else if (event === "petscii-output") {
        // Handle PETSCII output based on terminal type
        if (connection.session?.terminalType === "c64") {
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
    destroy: () => connection.close(),
  };

  const attachTransferSender = () => {
    if (connection.session) {
      (connection.session as any).connectionType = type;
      (connection.session as any).transferRawSend = (buf: Buffer) =>
        connection.write(buf);
    }
  };
  attachTransferSender();
  connection.on("ready", attachTransferSender);

  // Handle incoming data (user input)
  connection.on("data", async (data: Buffer) => {
    if (connection.session?.transferRawActive) {
      const sink =
        (connection.session as any).transferRawSink ||
        (connection.session as any).transferManager?.handleInput;
      if (sink) {
        sink(Buffer.from(data));
        return;
      }
    }

    // Convert telnet/SSH data to string
    // For C64/PETSCII terminals, convert PETSCII bytes to ASCII
    // For modern terminals, use UTF-8 encoding
    let input: string;
    if (
      connection.session?.petsciiMode ||
      connection.session?.terminalType === "c64"
    ) {
      // PETSCII terminals send characters in PETSCII encoding, not ASCII
      // e.g., lowercase 'a' is 0xC1 in PETSCII, not 0x61 like ASCII
      input = convertPetsciiInputToAscii(data);
    } else {
      input = data.toString("utf-8");
    }

    // Process through BBS command handler (same as Socket.IO)
    if (connection.session) {
      // Call handleCommand directly (same logic as Socket.IO 'command' event)
      const { handleCommand } = await import("./handlers/command.handler");
      handleCommand(emitter as any, connection.session, input, io);
    }
  });

  // Handle terminal type detection (telnet TTYPE negotiation)
  connection.on(
    "terminal-type",
    (info: {
      terminalType: string;
      isC64: boolean;
      width: number;
      height: number;
    }) => {
      if (connection.session) {
        connection.session.terminalType = info.isC64 ? "c64" : "modern";
        connection.session.screenWidth = info.width;
        connection.session.screenHeight = info.height;
        connection.session.petsciiMode = info.isC64;
        console.log(
          `[${type.toUpperCase()}] Terminal detected: ${info.terminalType} (${
            info.isC64 ? "C64" : "Modern"
          }) - ${info.width}x${info.height}`
        );
      }
    }
  );

  // Handle window size changes (NAWS)
  connection.on("window-size", (width: number, height: number) => {
    if (connection.session) {
      connection.session.screenWidth = width;
      connection.session.screenHeight = height;

      // Fallback detection: If terminal type not yet determined, use screen size
      if (
        !connection.session.terminalType ||
        connection.session.terminalType === "unknown"
      ) {
        const isC64 = width === 40 && height === 25;
        connection.session.terminalType = isC64 ? "c64" : "modern";
        connection.session.petsciiMode = isC64;
        console.log(
          `[${type.toUpperCase()}] Terminal detected via NAWS: ${width}x${height} (${
            isC64 ? "C64" : "Modern"
          })`
        );
      } else {
        console.log(`[${type.toUpperCase()}] Window size: ${width}x${height}`);
      }
    }
  });

  // Handle disconnect
  connection.on("close", () => {
    console.log(
      `[${type.toUpperCase()}] Disconnected: node ${connection.nodeId}`
    );
    // Cleanup session
    if (connection.session) {
      sessions.delete(connection.sessionId);
    }
  });

  // Handle errors
  connection.on("error", (error: Error) => {
    console.error(
      `[${type.toUpperCase()}] Error on node ${connection.nodeId}:`,
      error.message
    );
  });

  // Function to send welcome message
  const sendWelcomeMessage = () => {
    // Clear screen and move cursor to home position
    connection.write("\x1b[2J\x1b[H");
    // Send welcome message with ASCII-safe characters
    // Use '=' instead of UTF-8 box-drawing for telnet compatibility
    connection.write("\r\n\x1b[36m" + "=".repeat(50) + "\x1b[0m\r\n");
    connection.write("\x1b[0;37mWelcome to AmiExpress BBS\x1b[0m\r\n");
    connection.write(
      `\x1b[33mConnected via ${type.toUpperCase()} on node ${
        connection.nodeId
      }\x1b[0m\r\n`
    );
    connection.write("\x1b[36m" + "=".repeat(50) + "\x1b[0m\r\n\r\n");
  };

  // For SSH: Wait for 'ready' event before sending welcome
  // For Telnet: Send welcome immediately (stream is ready on connection)
  if (type === "ssh") {
    connection.once("ready", sendWelcomeMessage);
  } else {
    sendWelcomeMessage();
  }
}

// Set up telnet server event handlers
// Attach telnet connection handler when server is created (later in startup)

// SSH connection handlers are attached when the SSH server is created (startup section)

io.on("connection", async (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`Client connected from ${clientIp}`);

  // Check if this is a web chat user (session already created in JWT auth middleware)
  const existingSession = (socket as any).session;
  if (existingSession?.chatOnly) {
    console.log(
      `[Socket.IO] Web chat user ${existingSession.user?.username} - skipping BBS initialization`
    );
    // Just register the socket handlers for chat functionality
    registerSocketHandlers(io, socket, chatState);
    return;
  }

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
    console.warn(`[WARNING] Rate limit exceeded for IP: ${clientIp}`);
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\x1b[31mToo many connections from your IP.\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\x1b[33mPlease wait a moment and try again.\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n"
    );
    socket.disconnect();
    return;
  }

  // CHAT-ONLY MODE: Skip all BBS screens and launch livechat directly
  const chatOnly = socket.handshake?.query?.chatOnly === "true";
  if (chatOnly) {
    console.log(
      "[ChatOnly] Launching livechat door directly (door will handle login)"
    );

    // Create minimal session for chat
    const sessionStart = Date.now();
    const session: BBSSession = {
      state: BBSState.LOGGEDON, // Set to LOGGEDON so door can run (door will handle auth)
      subState: LoggedOnSubState.DOOR_RUNNING,
      screenWidth: 80, // Will be updated by terminal-size event
      screenHeight: 24,
      currentConf: 1,
      conferenceId: 1,
      currentMsgBase: 1,
      timeRemaining: 60,
      lastActivity: sessionStart,
      confRJoin: 1,
      msgBaseRJoin: 1,
      commandBuffer: "",
      menuPause: false,
      inputBuffer: "",
      maskInput: false,
      connectionType: "web",
      remoteAddress: clientIp,
      connectionStart: sessionStart,
      relConfNum: 0,
      currentConfName: "General",
      cmdShortcuts: false,
      shortcuts: new Map(),
      doorExpertMode: false,
      acsLevel: -1,
      securityFlags: "",
      secOverride: "",
      overrideDefaultAccess: false,
      userSpecificAccess: false,
      currentStat: EnvStat.IDLE,
      quietFlag: false,
      blockOLM: false,
      loginTime: Date.now(),
      nodeStartTime: Date.now(),
      nodeId: getNextAvailableNodeId(),
      loginRetryCount: 0,
      lastMsgReadConf: 0,
      lastNewReadConf: 0,
      commandHistory: [],
      historyIndex: 0,
      historyCycle: 0,
      modemEmulationEnabled: false,
      modemBps: 0,
      tempData: { loginPhase: "username", chatOnly: true },
    };
    setSession(socket.id, session);

    // Register socket handlers
    registerSocketHandlers(io, socket, chatState);

    // Set up login handler for authentication
    const {
      setupChatOnlyLoginHandler,
    } = require("./handlers/chat-only-login.handler");
    setupChatOnlyLoginHandler(socket, session);

    // Launch LiveChat door immediately - it will show login modal and handle auth
    const { executeDoor } = require("./handlers/door.handler");
    const liveChatDoor = {
      id: "livechat",
      name: "LiveChat",
      command: "livechat",
      type: "typescript",
      path: "Doors/livechat",
    };

    console.log("[ChatOnly] Executing LiveChat door");
    await executeDoor(socket, session, liveChatDoor);

    return;
  }

  // Initialize session with multi-node support
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
  } catch (error) {
    console.error("Failed to assign node to session:", error);
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n"
    );
    socket.emit("ansi-output", "\x1b[31mSorry, all nodes are busy.\x1b[0m\r\n");
    socket.emit(
      "ansi-output",
      "\x1b[33mPlease try again in a moment.\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n"
    );
    socket.disconnect();
    return;
  }

  const bbsConfig = config.getConfig();
  const sessionStart = Date.now();

  // Load disk-based config for reg_key and version
  const { loadBBSConfig } = await import("./services/bbs-config-file.service");
  const diskConfig = loadBBSConfig(bbsConfig.dataDir);

  // Get version from package.json
  const packageJson = require("../package.json");
  const bbsVersion = packageJson.version || "1.0.0-web";

  const connectionTime = new Date();
  const dateStr = connectionTime.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // ===== /X NATIVE TELNET CONNECTION SEQUENCE (reference-board-style) =====
  // Small delay to ensure socket is ready to receive data (fixes race condition after rebuilds)
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(
    `[Connection] Starting welcome sequence for node ${nodeSession.nodeId}`
  );

  // Simulate classic AmiExpress telnet connection messages
  socket.emit(
    "ansi-output",
    "\r\n/X Native Telnet:  Searching for free node...\r\n"
  );
  socket.emit(
    "ansi-output",
    `/X Native Telnet:  Successful connection to node ${nodeSession.nodeId}\r\n`
  );
  socket.emit("ansi-output", "\r\nCONNECT 19200\r\n");
  socket.emit("ansi-output", "**EMSI_IRQ8E08\r\n");

  // express.e:29507-29512 - Welcome to {bbsName}, located in {location}
  // Display banner AFTER EMSI but BEFORE pause so it's visible during the pause
  const bbsName = diskConfig.bbs_name || bbsConfig.bbsName;
  const location = diskConfig.location || bbsConfig.location;

  // Blank line before banner
  socket.emit("ansi-output", "\r\n");

  if (location && location.length > 0) {
    socket.emit(
      "ansi-output",
      `\x1b[0mWelcome to ${bbsName}, located in ${location}`
    );
  } else {
    socket.emit("ansi-output", `\x1b[0mWelcome to ${bbsName}.`);
  }

  // express.e:29514-29515 - Running AmiExpress {version} Copyright...
  const currentYear = new Date().getFullYear();
  socket.emit(
    "ansi-output",
    `\r\n\r\nRunning AmiExpress ${bbsVersion} Copyright (c) 2018-${currentYear} Darren Coles,\r\n`
  );
  socket.emit("ansi-output", `Web port by Spot/Up Rough\r\n`);

  // express.e:29516-29517 - Registration and node info
  // Use reg_key from disk config (bbsConfig.info REG_KEY tooltype)
  const regKey = diskConfig.reg_key || "UNREGISTERED";
  socket.emit(
    "ansi-output",
    `\r\nRegistered to ${regKey}. You are connected to Node ${nodeSession.nodeId} at ${DEFAULT_CONNECTION_BAUD} baud`
  );

  // express.e:29518-29522 - Connection timestamp
  socket.emit("ansi-output", `\r\nConnection occurred at ${dateStr}.`);

  // Blank line after banner
  socket.emit("ansi-output", "\r\n");

  // 3-second pause after banner (like real BBS connection negotiation)
  // User can read the banner during this pause before screen clear
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const session: BBSSession = {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT, // Start with connection screen
    currentConf: 1, // Start in General conference (ID 1) → Conf1/
    conferenceId: 1, // XIM doors read this property
    currentMsgBase: 1, // Start in Main message base (ID 1)
    timeRemaining: 60, // 60 minutes default
    lastActivity: sessionStart,
    confRJoin: 1, // Default to General conference (ID 1)
    msgBaseRJoin: 1, // Default to Main message base (ID 1)
    commandBuffer: "", // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: "", // Buffer for line-based input
    maskInput: false, // Echo typed characters unless password masking is active
    connectionType: "web",
    remoteAddress: clientIp,
    connectionHostname: bbsConfig.hostname,
    connectionPort: bbsConfig.port,
    connectionBaud: DEFAULT_CONNECTION_BAUD,
    connectionStart: sessionStart,
    relConfNum: 0, // Relative conference number
    currentConfName: "General", // Current conference name (matches ID 4)
    cmdShortcuts: false, // Like AmiExpress - default to line input mode, not hotkeys
    shortcuts: new Map(), // Loaded shortcuts from .keys
    doorExpertMode: false, // Like AmiExpress - doors can force menu display (express.e:28583)

    // Phase 9: Initialize security fields (express.e:447-455)
    acsLevel: -1, // Will be set on login
    securityFlags: "", // Temporary per-session ACS overrides
    secOverride: "", // Permanent override denials
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
    historyCycle: 0, // Current position when navigating history
    modemEmulationEnabled: false,
    modemBps: 0,
  };
  setSession(socket.id, session); // Use helper to store by nodeId

  // CRITICAL: Register all socket event handlers IMMEDIATELY after session setup
  // This MUST happen BEFORE any output is sent (including ANSI prompt)
  // Otherwise there's a race condition where user input arrives before handlers are ready
  registerSocketHandlers(io, socket, chatState);

  // Setup operator chat listeners for this socket
  // This allows the user to receive chat-accepted and chat-ended events
  const { setupOperatorChatListeners } = await import(
    "./handlers/operator-chat.handler"
  );
  setupOperatorChatListeners(socket, session);

  try {
    await triggerSamiLogRefresh();
  } catch (error) {
    console.error("[SamiLog] Initial refresh failed:", error);
  }

  // express.e:29524 - Run FRONTEND syscmd (optional - runs custom telnet frontend screen)
  // This runs the FRONTEND door which typically displays who's online
  try {
    const { runSysCommand } = await import(
      "./handlers/command-execution.handler"
    );
    await runSysCommand(socket, session, "FRONTEND", "");
  } catch (err) {
    // FRONTEND syscmd is optional - continue if not found
    console.log("[Connection] FRONTEND syscmd not found, continuing");
  }

  // express.e:29527-29528 - ANSI prompt (unless FORCE_ANSI tooltype is set)
  // "ANSI, RIP or No graphics (A/r/n)?"
  socket.emit(
    "ansi-output",
    "\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? "
  );

  console.log(
    `[Connection] Welcome sequence complete for node ${nodeSession.nodeId}, waiting for ANSI response`
  );

  // Set state to wait for ANSI response
  session.subState = LoggedOnSubState.ANSI_PROMPT;
  session.tempData = { inputBuffer: "" };

  // Execute login trigger for AREXX scripts
  await arexxEngine.executeTrigger("login", {
    userId: undefined,
    sessionId: socket.id,
    environment: { nodeId: nodeSession.nodeId },
  });

  // NOTE: registerSocketHandlers was moved to run right after session setup (before welcome sequence)
  // to eliminate race condition where user input could arrive before handlers were registered
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
    console.log("Initializing database and loading data...");
    await initializeData();

    // Initialize operator chat handler
    const { initOperatorChatHandler } = await import(
      "./handlers/operator-chat.handler"
    );
    const operatorChatRepo = db.getOperatorChatRepository();
    initOperatorChatHandler(io, operatorChatRepo);
    console.log("[OK] Operator chat handler initialized");

    // Initialize web push notifications with database config
    const { initWebPush } = await import("./utils/web-push.util");
    const sysConfigForPush = db.getConfigRepository().getSystemConfig();
    if (initWebPush(sysConfigForPush || undefined)) {
      console.log("[OK] Web push notifications enabled");
    } else {
      console.log(
        "[INFO] Web push notifications disabled (VAPID keys not configured)"
      );
    }

    // Register HTTP routes (auth, sessions, config, upload, download, etc.)
    registerHttpRoutes(app);
    console.log("[OK] HTTP routes registered");
    console.log("[OK] Database initialization complete");

    // Now start accepting connections
    // Bind to 0.0.0.0 for cloud deployments (Render, etc)
    const host = process.env.HOST || "0.0.0.0";

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
      console.warn(
        "[CONFIG] Unable to load system config for ports, using defaults/env:",
        err
      );
    }

    // Check for sysop-level user on fresh install
    try {
      const sysopUsers = await db.query(
        "SELECT COUNT(*) as count FROM users WHERE seclevel >= 200"
      );
      const sysopCount = Number(sysopUsers.rows?.[0]?.count ?? 0);
      if (sysopCount === 0) {
        console.log(
          "[SETUP] No sysop-level users found - FIRST new user will automatically become sysop (level 255)"
        );
        // Set global flag that the new user handler will check
        (global as any).firstUserIsSysop = true;
      } else {
        console.log(`[SETUP] Found ${sysopCount} sysop-level user(s)`);
        (global as any).firstUserIsSysop = false;
      }
    } catch (err: any) {
      console.warn(
        "[SETUP] Failed to check for sysop users:",
        err.message || err
      );
      (global as any).firstUserIsSysop = false;
    }

    // Start HTTP/Socket.IO server
    server.listen(port, host, () => {
      console.log(`[OK] HTTP/WebSocket Server running on ${host}:${port}`);
      console.log(`[WEB] BBS accessible at http://localhost:${port}/`);
    });

    // Start telnet server
    try {
      telnetServer = new TelnetServer(telnetPort);
      telnetServer.on("connection", (connection: TelnetConnection) => {
        setupTelnetSSHHandler(connection, "telnet", io);
      });
      // Handle C64 terminal auto-detection (skip graphics prompt, show BBSTITLE directly)
      telnetServer.on("c64-detected", async (connection: TelnetConnection) => {
        if (connection.session) {
          console.log(
            "[C64] Auto-detected C64 terminal, showing PETSCII BBSTITLE"
          );
          const { displayScreen } = await import("./handlers/screen.handler");
          // Create a telnet-compatible emitter for displayScreen
          const emitter = {
            emit: (event: string, data: any) => {
              if (event === "petscii-output" || event === "ansi-output") {
                // For C64, convert to raw PETSCII if needed
                if (typeof data === "string") {
                  const petsciiData = convertUnicodePuaToPetscii(data);
                  connection.write(petsciiData);
                } else {
                  connection.write(data);
                }
              }
            },
          };
          await displayScreen(emitter as any, connection.session, "BBSTITLE");
          // Transition to login
          connection.session.state = BBSState.LOGON;
          connection.session.subState = undefined;
          connection.session.tempData = connection.session.tempData || {};
          connection.session.tempData.loginPhase = "username";
          connection.write(Buffer.from([0x0d, 0x0d])); // Two CR for spacing
          // Send Username: prompt in proper PETSCII (uppercase displays correctly)
          connection.write(convertAsciiToPetsciiOutput("Username: "));
        }
      });
      await telnetServer.start();
      console.log(`[OK] Telnet Server ready on port ${telnetPort}`);
      console.log(`[TELNET] Connect: telnet localhost ${telnetPort}`);
    } catch (error) {
      console.error(`[WARNING] Failed to start Telnet server:`, error);
      console.log("   BBS will continue without telnet support");
    }

    // Start SSH server
    try {
      let sshHostKeys: Buffer[] = [];
      const hostKey = SSHKeyUtil.loadHostKey();
      if (hostKey) {
        sshHostKeys = [hostKey];
      } else {
        console.warn(
          "[SSH] No SSH host key found. SSH server will not accept connections."
        );
        console.warn(
          "[SSH] Generate a key via the admin configuration portal or by running:"
        );
        console.warn(
          '[SSH]   ssh-keygen -t rsa -b 4096 -f data/ssh/ssh_host_rsa_key -N ""'
        );
      }

      sshServer = new SSHServerImpl(sshPort, sshHostKeys);
      sshServer.on("connection", (connection: SSHConnection) => {
        setupTelnetSSHHandler(connection, "ssh", io);
      });
      await sshServer.start();
      console.log(`[OK] SSH Server ready on port ${sshPort}`);
      console.log(`[SSH] Connect: ssh -p ${sshPort} user@localhost`);
    } catch (error) {
      console.error(`[WARNING] Failed to start SSH server:`, error);
      console.log("   BBS will continue without SSH support");
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[READY] AmiExpress BBS is ready for connections!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
    console.error("[ERROR] Failed to start server:", error);
    process.exit(1);
  }
})();
