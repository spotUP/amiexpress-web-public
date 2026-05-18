import "reflect-metadata"; // Must be first import for tsyringe decorators
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import multer from "multer";
import { EventEmitter } from "events";
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
  protocolManager,
} from "./services/node-manager.service";
// Real AREXX interpreter (services/arexx.service.ts) — full REXX semantics
// with procedures, SIGNAL, trace, ARG, BBS function bindings. The stub
// previously imported from node-manager.service.ts only logged
// "Simulate script execution" — it didn't run the script body.
import { nodeFileManager } from "./services/NodeFileManager";
import { callersLogManager } from "./services/CallersLogManager";
import { doorDropFileManager } from "./services/DoorDropFileManager";
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
import {
  attachWSTerminalServer,
  WSTerminalConnection,
} from "./server/ws-terminal-server";
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
  displayFileMaintenance,
  handleFileDelete,
  handleFileDeleteConfirmation,
  handleFileMove,
  handleFileMoveConfirmation,
  handleFileSearch,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface,
  matchesWildcard,
  parseParams,
  dirLineNewFile,
  startFileUpload,
  startFileDownload,
  setFileAreas,
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
  uploadBatch: Array<{ filename: string; description: string; isPrivate: boolean }>;
  uploadCount: number;
  uploadStartTime: number;
  webUploadMode?: boolean;
  batchUpload?: boolean;
  currentUploadIndex?: number;
  filesProcessedCount?: number; // Sequential counter for tracking processed files
  uploadedFiles?: number; // Total files uploaded in this session
  uploadedBytes?: number; // Total bytes uploaded in this session
  currentUploadedFile?: { filename: string; path?: string; size: number };
  currentDescription?: string[];
  hasDiz?: boolean;
  skipDizExtraction?: boolean;
  maxDescLines?: number;
  descLineCount?: number;
  currentLineBuffer?: string;
  [key: string]: any;
}

export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  skipNextDisplayFlowMenu?: boolean;
  manualMenuTargetState?: LoggedOnSubState;
  user?: any; // Will be User from database (expert stored as "X"/"N")
  // express.e:29554-29557 — when a sysop reserves a node for a specific
  // user, callers see "*** Node N is reserved right now, for <name> ***"
  // after BBSTITLE. We surface the field on the session so pre-login can
  // emit the warning even though there's no admin route to set it yet
  // (see WEB_ note at the call site in pre-login.ts). Audit A-3.
  reservedFor?: string;
  currentConf: number;
  currentConference?: number; // Current conference ID (GlobalStructures parity)
  conferenceId: number; // XIM doors read this property for current conference
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: number;
  logonTime?: number; // Unix timestamp when user logged on (express.e:540)
  lastTimeUpdate?: number; // Unix timestamp of last time update (express.e:541,552)
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
  /** Whether terminal supports Unicode (detected via TTYPE for telnet/SSH, always true for web) */
  unicodeCapable?: boolean;
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
  pendingDoorUpload?: boolean;        // requestArchiveUpload() is waiting for file-upload event
  pendingDoorUploadCallback?: ((result: { path: string; filename: string }) => void) | null;
  pendingDoorUploadReject?: ((reason: Error) => void) | null;
  doorInputHandler?: ((input: string) => void) | null; // Door input handler callback for TypeScript doors
  // Out-of-band Ctrl+C abort hook installed by long-running script engines
  // (e.g. AREXX). Invoked on incoming 0x03 bytes regardless of whether a
  // doorInputHandler is currently registered, so a script stuck in a
  // tight loop between input prompts can still be killed by the user.
  scriptAbortHandler?: (() => void) | null;
  clientDoorActive?: boolean; // Client (browser) door session active; suppress command handler input
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
  gamepadHandler?: (event: any) => void; // Set by GamepadInputManager; called by socket-handlers on gamepad-event
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
  sysopKicked?: boolean; // Session was forcibly disconnected by sysop via NM command - skip grace period
  loginTime: number; // Login timestamp for session time tracking
  nodeStartTime: number; // Node start time for uptime display
  nodeId: number; // Virtual node number (1, 2, 3...) for multi-node emulation - express.e:163
  conferences?: import("./database/types").Conference[]; // Cached conference accounting stats (express.e confBases)
  queuedScreenCommands?: string[]; // Deferred screen commands (run after pause key)
  lastScreenHadPause?: boolean; // Whether the last displayed screen contained ~SP.
  lastScreenFilePath?: string; // Resolved path of last displayed screen (used for .keys lookup)
  // Login retry counters — express.e:29629-29637 keeps these separate.
  // Conflating them (audit A-5) meant entering several wrong usernames
  // ate into the password-fail budget and vice versa. Now:
  //   loginRetryCount     — failed PASSWORD attempts (configurable cap)
  //   usernameRetryCount  — failed/empty USERNAME attempts (fixed cap of 5)
  loginRetryCount: number;
  usernameRetryCount?: number;
  // Password reset flow - express.e:29152-29213
  passwordResetCode?: string; // Generated 10-char reset code sent to email
  passwordResetUsername?: string; // Username attempting password reset
  passwordResetState?: 'await_confirm' | 'await_code' | 'await_new_password'; // Current reset flow state
  // Login-prompt-adapter slots used by services/login-prompt.service.ts to
  // own input fully during a multi-step pre-login UI flow on telnet/SSH
  // (where the web equivalent is a socket event modal). When set, the
  // telnet/SSH input dispatcher at command.handler.ts:1619 short-circuits
  // and forwards every char to `loginInputHandler` until the handler
  // resolves `loginPromptResolver`. Web does not use these (its frontend
  // events drive the same outcome).
  loginInputHandler?: (chunk: string) => void;
  loginPromptResolver?: ((result: unknown) => void) | undefined;
  // Forced password change flow - express.e:29785-29845 (forcePwdReset / PASSWORD_EXPIRY_DAYS)
  forcedPwdChangeState?: 'await_new' | 'await_confirm'; // Step in forced-change dialog
  forcedPwdChangeUsername?: string;    // Username being changed
  forcedPwdChangeUserId?: string;      // DB user id
  forcedPwdChangeSlot?: number;        // Amiga disk slot number
  forcedPwdChangeRetry?: number;       // Number of attempts so far (max 3)
  forcedPwdChangePwdHash?: string;     // Current password hash (to detect same-password re-use)
  forcedPwdChangeNewPass?: string;     // First entry of new password (waiting for confirm)
  forcedPwdChangeMinLen?: number;      // Cached MIN_PASSWORD_LENGTH tooltype value
  forcedPwdChangeMinStrength?: number; // Cached MIN_PASSWORD_STRENGTH tooltype value
  callerNum?: number; // Caller number for this session (total calls to BBS)
  paginatedScreen?: {
    lines: string[];
    nextIndex: number;
    pageSize: number;
    eventName: "ansi-output" | "petscii-output";
    commands?: string[];
    onComplete?: () => void;
    kind?: 'bbs' | 'door' | 'doPause'; // 'bbs' = More prompt, 'doPause' = Pause/Space prompt, 'door' = door-owned
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
  savedModemState?: { enabled: boolean; bps: number }; // Saved modem state for restoration after animation

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
  quickFlag?: boolean; // Quick logon flag (express.e:116) - skip bulletins when 'Q' entered at ANSI prompt

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
  // File uploads now go via HTTP multipart POST to /api/upload (multer
  // saves to playpen, frontend then emits a small `file-upload-ready`
  // event with metadata only). Before that migration, BBSTerminal emitted
  // the file body as a JSON-serialized number array — at ~3x inflation
  // a 10MB file became ~30MB on the wire and tripped the old 1MB cap (#11).
  // With binary moved off the socket the cap can be small. Keep 4MB so
  // ANSI screens, AREXX I/O, and any other large emit can still flow
  // without truncation, but anything pathological is caught early.
  maxHttpBufferSize: 4 * 1024 * 1024, // 4MB
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

// Expose io on global so emulator-side code paths (e.g. cross-node
// JH_SM routing in door-message-callbacks.ts) can emit into other
// sessions' sockets without threading io through every constructor.
// Mirrors the existing globalAny.currentBbsSession pattern.
(global as any).io = io;

// CRITICAL: Process-level error handlers to prevent crashes

const ERROR_LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard cap

function appendErrorLog(entry: string): void {
  try {
    const fs = require("fs");
    const logsDir = join(config.get("dataDir") || "./data", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = join(logsDir, "unhandled-errors.log");

    // Rotate: if the file is at or above the cap, keep only the newest half.
    try {
      const stat = fs.statSync(logPath);
      if (stat.size >= ERROR_LOG_MAX_BYTES) {
        const buf = fs.readFileSync(logPath);
        const half = Math.floor(buf.length / 2);
        // Find the next newline after the midpoint so we don't split a line.
        let cut = half;
        while (cut < buf.length && buf[cut] !== 0x0a) cut++;
        fs.writeFileSync(logPath, buf.slice(cut + 1));
      }
    } catch {
      // File may not exist yet — that's fine.
    }

    fs.appendFileSync(logPath, entry, "utf8");
  } catch (logError) {
    console.error("[CRITICAL] Failed to write error log:", logError);
  }
}

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("[CRITICAL] Unhandled Promise Rejection:", reason);
  console.error("[CRITICAL] Promise:", promise);
  console.error("[CRITICAL] Stack:", reason?.stack || "No stack trace");
  const timestamp = getSystemTime().toISOString();
  appendErrorLog(`\n\n=== UNHANDLED REJECTION at ${timestamp} ===\n${reason?.stack || reason}\n`);
  // Don't exit - keep server running
});

process.on("uncaughtException", (error: Error) => {
  console.error("[CRITICAL] Uncaught Exception:", error);
  console.error("[CRITICAL] Stack:", error.stack);
  const timestamp = getSystemTime().toISOString();
  appendErrorLog(`\n\n=== UNCAUGHT EXCEPTION at ${timestamp} ===\n${error.stack}\n`);
  // Don't exit - keep server running unless it's truly fatal.
  // EADDRINUSE is NOT fatal here: Telnet/SSH start is wrapped in try/catch
  // and will log a warning + continue. Crashing the whole backend over a busy
  // auxiliary port is wrong.
  const fatalErrors = ["EACCES", "EMFILE"];
  if (fatalErrors.some((code) => (error as any).code === code)) {
    console.error("[CRITICAL] Fatal error - shutting down");
    process.exit(1);
  }
});

// Memory monitoring and heartbeat (helps diagnose Render.com crashes)
const MEMORY_LOG_INTERVAL = 60000; // Log every 60 seconds
let lastHeartbeat = Date.now();
setInterval(() => {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const now = Date.now();
  const uptime = Math.round((now - lastHeartbeat) / 1000);
  console.log(`[HEARTBEAT] Alive, heap: ${heapMB}MB, rss: ${rssMB}MB, interval: ${uptime}s`);
  lastHeartbeat = now;
  // Warn if memory is getting high (configurable via MEMORY_LIMIT_MB, default 3072MB for 4GB servers)
  const memLimitMB = parseInt(process.env.MEMORY_LIMIT_MB || "3072", 10);
  const warnThreshold = Math.round(memLimitMB * 0.8); // Warn at 80% of limit
  if (rssMB > warnThreshold) {
    console.warn(`[MEMORY WARNING] RSS ${rssMB}MB approaching ${memLimitMB}MB limit!`);
  }
}, MEMORY_LOG_INTERVAL);

// SIGTERM handler - Docker/orchestrator sends this before stopping the container
// This helps diagnose if crashes are due to health check timeouts
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received - container is being stopped");
  console.log("[SHUTDOWN] This is normal for deployments, but unexpected during operation");
  // Log memory state before shutdown
  const mem = process.memoryUsage();
  console.log(`[SHUTDOWN] Memory at exit: heap=${Math.round(mem.heapUsed/1024/1024)}MB rss=${Math.round(mem.rss/1024/1024)}MB`);
  // Give logs time to flush
  setTimeout(() => process.exit(0), 1000);
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

      // Check if this is a chat-only user:
      //  - decoded.chatOnly=true: token minted via /api/chat/login
      //  - OR the handshake query ?chatOnly=true: standard BBS token reused for SSO
      const chatOnlyQuery = socket.handshake?.query?.chatOnly === "true";
      if (decoded.chatOnly || chatOnlyQuery) {
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

// Connection rate limiting - track recent connections.
// Bumped from 5 -> 30 because legitimate sysop / tester traffic
// (multiple tabs, hard refreshes, /chat reload after token expiry)
// blew past the old window and started locking the user out of their
// own BBS during debugging. 30/min still throttles connection-spam
// abuse while leaving normal use comfortably under the cap.
// Override via env: BBS_MAX_CONNECTIONS_PER_IP / BBS_CONNECTION_WINDOW_MS.
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.BBS_MAX_CONNECTIONS_PER_IP || '30', 10);
const CONNECTION_WINDOW = parseInt(process.env.BBS_CONNECTION_WINDOW_MS || '60000', 10);

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
import { getSystemTime } from './utils/date-time.util';

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

  // Create emitter interface that mimics Socket.IO socket.
  // Backs synthetic events ('command', 'file-uploaded', etc.) with a
  // real EventEmitter so DoorManager's socket.once/on/listenerCount
  // calls behave the same on telnet/SSH as they do on web. Transport
  // I/O ('ansi-output', 'binary-output', 'petscii-output') is still
  // routed straight to connection.write below.
  const eventBus = new EventEmitter();
  eventBus.setMaxListeners(50);

  const emitter: any = {
    // socket.io's `.once / .removeListener / .removeAllListeners /
    // .listenerCount / .listeners` all map to the synthetic event bus.
    once: (event: string, handler: (...args: any[]) => void) => {
      eventBus.once(event, handler);
      return emitter;
    },
    listenerCount: (event: string) => eventBus.listenerCount(event),
    listeners: (event: string) => eventBus.listeners(event),
    removeListener: (event: string, handler: (...args: any[]) => void) => {
      eventBus.removeListener(event, handler);
      return emitter;
    },
    removeAllListeners: (event?: string) => {
      eventBus.removeAllListeners(event);
      return emitter;
    },
    emitInternal: (event: string, ...args: any[]) => eventBus.emit(event, ...args),
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
          // Modern terminal or unknown - send as-is (ANSI codes),
          // but normalize bare LF to CRLF so raw TCP clients (nc,
          // some terminal apps without telnet NVT) don't stair-step
          // content across the screen. Proper telnet clients already
          // treat LF as "next row, column 0" via NVT; this is a no-op
          // for them. Only normalize strings — binary file transfer
          // buffers (e.g. ZModem) MUST pass through untouched.
          if (typeof data === "string") {
            connection.write(data.replace(/\r?\n/g, "\r\n"));
          } else {
            connection.write(data);
          }
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
    // Telnet/SSH emitter doesn't have Socket.IO's `.connected` property.
    // The BBS menu code (menu.ts:121) treats falsy `socket.connected` as
    // "carrier dropped" and sets subState=LOGOFF, which causes every
    // subsequent telnet keypress to be ignored ("subState: logoff -
    // IGNORING COMMAND"). Default to true; the connection's own 'close'
    // event handler tears down the session when the transport really dies.
    connected: true,
    on: (event: string, handler: (...args: any[]) => void) => {
      // Transport-level events live on the underlying telnet/SSH
      // connection; synthetic events (used by DoorManager, file
      // upload flow, etc.) live on the local event bus.
      const transportEvents = new Set(["data", "close", "error", "ready", "terminal-type", "window-size"]);
      if (transportEvents.has(event)) {
        connection.on(event, handler);
      } else {
        eventBus.on(event, handler);
      }
      return emitter;
    },
    off: (event: string, handler: (...args: any[]) => void) => {
      const transportEvents = new Set(["data", "close", "error", "ready", "terminal-type", "window-size"]);
      if (transportEvents.has(event)) {
        connection.off(event, handler);
      } else {
        eventBus.off(event, handler);
      }
      return emitter;
    },
    // Allow handlers (logoff) to terminate the underlying transport cleanly
    disconnect: () => connection.close(),
    end: () => connection.close(),
    destroy: () => connection.close(),
  };

  // Expose the socket-shaped emitter on the connection so telnet/SSH
  // server entry points (which run BEFORE this handler completes) can
  // invoke pre-login pipeline pieces like the FRONTEND syscmd through
  // the same code path the web transport uses.
  (connection as any).emitter = emitter;

  const attachTransferSender = () => {
    if (connection.session) {
      (connection.session as any).connectionType = type;
      // For telnet, TelnetConnection.write (telnet-server.ts:433)
      // already doubles IAC (0xFF) bytes per RFC 854. Adding a SECOND
      // doubling layer here turned each input 0xFF into 0xFF 0xFF 0xFF
      // 0xFF on the wire — ZOC's ZMODEM parser saw the extra 0xFF in
      // mid-data and ZNAK'd every subpacket containing a 0xFF byte.
      // Just pass through; the transport layer escapes IAC.
      // SSH connection wrapper is raw passthrough; no doubling
      // either way.
      (connection.session as any).transferRawSend = (buf: Buffer) => {
        connection.write(buf);
      };
      // Raw sender for protocol bytes (IAC negotiation, etc.) that
      // must NOT be doubled by the telnet write. TelnetConnection
      // currently has no separate raw-write path; sendCommand uses
      // the underlying socket directly. For now, write to the
      // underlying socket if exposed; otherwise this is identical
      // to transferRawSend and the caller must construct already-
      // escaped sequences if they need raw IAC.
      (connection.session as any).transferRawSendUnescaped = (buf: Buffer) => {
        // Telnet.connection.write escapes IAC. To send IAC bytes
        // raw (for option negotiation initiated by us), reach the
        // underlying socket. SSH connection.write is already raw.
        const conn: any = connection;
        if (type === 'telnet' && conn.socket?.write) {
          conn.socket.write(buf);
        } else {
          conn.write(buf);
        }
      };
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

    // Telnet clients may send CR NUL sequences; strip NUL padding
    if (type === "telnet") {
      input = input.replace(/\0/g, "");
    }

    // Process through BBS command handler (same as Socket.IO)
    // Must use SAME routing logic as socket-handlers.ts:641-656
    if (connection.session) {
      const session = connection.session;

      // Out-of-band Ctrl+C abort for long-running script engines (AREXX).
      // Mirrors the socket-handlers Ctrl+C interceptor so telnet users can
      // also break out of a tight AREXX loop with no input prompt active.
      if (
        (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) &&
        session.scriptAbortHandler &&
        input.length > 0 &&
        input.charCodeAt(0) === 3
      ) {
        try { session.scriptAbortHandler(); } catch { /* never throw out of telnet handler */ }
      }

      // Check if door is active and needs input (socket-handlers.ts:641-656)
      if (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) {
        // TypeScript doors (DoorManager) listen on emitter 'command' events
        // the way the web frontend emits via socket.io. Web's socket.io
        // Socket fires 'command' natively on socket.emit('command', input);
        // telnet/SSH have no equivalent transport event, so bridge input
        // here. This is what makes socket.once('command', …) in DoorManager
        // resolve on telnet/SSH the same way it does on web.
        if (eventBus.listenerCount('command') > 0) {
          eventBus.emit('command', input);
          return;
        }
        if (session.doorInputHandler) {
          // Route input to active door's input handler
console.log('[TELNET] Routing input to doorInputHandler');
          session.doorInputHandler(input);
          return;
        } else {
          // Door active but no handler - emit door:input event for fallback
console.log('[TELNET] Door active but no handler - emitting door:input');
          emitter.emit('door:input', input);
          return;
        }
      }

      // No door active - route to BBS command handler
      const { handleCommand } = await import("./handlers/command.handler");
      handleCommand(emitter as any, session, input, io);
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
    // Release node back to available pool
    if (connection.nodeId !== undefined) {
      nodeManager.releaseSession(connection.sessionId).catch((err: Error) => {
        console.error(`[${type.toUpperCase()}] Failed to release node on disconnect:`, err);
      });
    }
  });

  // Handle errors
  connection.on("error", (error: Error) => {
console.error(
      `[${type.toUpperCase()}] Error on node ${connection.nodeId}:`,
      error.message
    );
  });

  // Welcome flow: match the web `io.on('connection')` path. Web does
  // NOT print any "Welcome to AmiExpress BBS / Connected via …"
  // banner — it just sets DISPLAY_CONNECT and waits for a keypress,
  // then transitions to the ANSI prompt → BBSTITLE → login. This
  // function used to print a hardcoded banner here that was visible
  // ONLY on telnet/SSH; removing it brings the two transports back
  // into alignment. If a sysop wants a pre-login welcome screen they
  // can wire it via the FRONTEND syscmd (the standard express.e
  // hook), which the DISPLAY_CONNECT handler will pick up on both
  // transports identically.
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
      `[Socket.IO] Web chat user ${existingSession.user?.username} - launching livechat door via SSO`
    );

    // Register socket handlers
    registerSocketHandlers(io, socket, chatState);

    // Mark tempData so livechat knows this is chat-only mode
    if (!existingSession.tempData) existingSession.tempData = {};
    existingSession.tempData.chatOnly = true;
    // Copy session.user to bbsSession-equivalent fields so livechat finds it
    // (livechat checks ctx.bbsSession?.user — session here IS the bbsSession)

    // Launch LiveChat door directly — user is already authenticated
    const { executeDoor } = require("./handlers/door.handler");
    const liveChatDoor = {
      id: "livechat",
      name: "LiveChat",
      command: "livechat",
      type: "typescript",
      path: "Doors/livechat",
    };

    console.log("[SSO] Executing LiveChat door for authenticated user");
    // Small delay to ensure client handlers are fully registered
    await new Promise((resolve) => setTimeout(resolve, 100));
    executeDoor(socket, existingSession, liveChatDoor).catch((err: any) => {
      console.error("[SSO] LiveChat door execution failed:", err);
    });
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
    // Small delay to ensure client handlers are fully registered
    await new Promise(resolve => setTimeout(resolve, 100));
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

  // Emulated AmiExpress version we report (matches xim/bbs-info.ts fallback
  // used for EXPRESS_VERSION responses to doors). Keep in sync if you change
  // the mimic'd version.
  const amiExpressVersion = "v5.6";
  // Web-port version, shown on the "Web port" credit line below.
  const packageJson = require("../package.json");
  const webPortVersion = packageJson.version || "1.0.0";

  const connectionTime = getSystemTime();
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
  const currentYear = getSystemTime().getFullYear();
  socket.emit(
    "ansi-output",
    `\r\n\r\nRunning AmiExpress ${amiExpressVersion} Copyright (c) 2018-${currentYear} Darren Coles,\r\n`
  );
  socket.emit("ansi-output", `Web port ${webPortVersion} by Spot/Up Rough\r\n`);

  // express.e:29516-29517 - Registration and node info
  // Use reg_key from disk config (bbsConfig.info REG_KEY tooltype)
  const regKey = diskConfig.reg_key || "UNREGISTERED";
  socket.emit(
    "ansi-output",
    `\r\nRegistered to ${regKey}. You are connected to Node ${nodeSession.nodeId} via web connection`
  );

  // express.e:29518-29522 - Connection timestamp
  socket.emit("ansi-output", `\r\nConnection occurred at ${dateStr}.`);

  // Blank line after banner
  socket.emit("ansi-output", "\r\n");

  // 3-second pause after banner (like real BBS connection negotiation)
  // User can read the banner during this pause before screen clear
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Create session using unified createSession function (same as telnet/SSH)
  // Use nodeSession.nodeId from node manager (NOT getNextAvailableNodeId which could differ)
  const session = createSession(nodeSession.nodeId, {
    connectionType: "web",
    remoteAddress: clientIp,
    connectionHostname: bbsConfig.hostname,
    connectionPort: bbsConfig.port,
    connectionBaud: DEFAULT_CONNECTION_BAUD
  });
  setSession(socket.id, session); // Use helper to store by nodeId

  // CRITICAL: Register all socket event handlers IMMEDIATELY after session setup
  // This MUST happen BEFORE any output is sent (including ANSI prompt)
  // Otherwise there's a race condition where user input arrives before handlers are ready
  registerSocketHandlers(io, socket, chatState);

  // Pre-login connect pipeline — operator chat listeners, SamiLog
  // refresh, FRONTEND syscmd, ANSI prompt + state, AREXX login trigger.
  // Web/telnet/SSH all call the same service; previously each transport
  // open-coded its own subset and they drifted apart silently (e.g.
  // FRONTEND only ran on web, SamiLog and operator chat too).
  const { runPreLoginConnect } = await import(
    "./services/login-connect.service"
  );
  const connectResult = await runPreLoginConnect(socket, session, {
    socketId: socket.id,
  });
  if (connectResult.passwordResetActive) return;

console.log(
    `[Connection] Welcome sequence complete for node ${nodeSession.nodeId}, waiting for ANSI response`
  );

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
    await initializeData(io);

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
    registerHttpRoutes(app, io);
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

    // Raw WebSocket terminal endpoint at /ws/terminal — same pipeline
    // telnet uses, no Socket.IO wrapper. Lets third-party web terminals
    // and CLI ws clients connect to the BBS over wss:// using just the
    // standard WebSocket protocol (no Socket.IO handshake).
    try {
      attachWSTerminalServer(server, (conn: WSTerminalConnection) => {
        const cfg = config.getConfig();
        const session = createSession(conn.nodeId, {
          connectionType: "telnet", // Raw bytes both ways — same surface as telnet.
          remoteAddress: conn.getRemoteAddress(),
          connectionHostname: cfg.hostname,
          connectionPort: port,
          connectionBaud: 0,
        });
        conn.session = session;
        setSession(conn.sessionId, session);
        // Reuse the same connection handler telnet/SSH use.
        setupTelnetSSHHandler(conn as any, "telnet", io);
      });
    } catch (err) {
console.error("[WS-Terminal] Failed to attach:", err);
    }

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
