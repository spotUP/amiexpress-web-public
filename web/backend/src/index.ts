import "reflect-metadata"; // Must be first import for tsyringe decorators
import { startEventLoopWatchdog } from "./server/event-loop-watchdog";
// Type-only (erased at runtime, so it cannot displace reflect-metadata).
import type { PetsciiRenderCtx, PetsciiSpan } from './handlers/petscii-screen.render';
import type { WidthGateFallThrough } from './utils/door-min-columns.util';
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { SOCKET_IO_OPTIONS } from "./server/socket-io-options";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import multer from "multer";
import { setupTelnetSSHHandler, type TransportSessionDeps } from "./server/transport-session";
import { handleC64Detected } from "./server/c64-detected-handler";
import { resolveTelnetPetsciiPort } from "./utils/telnet-petscii-port.util";
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
  ensureScreensDirectory,
} from "./services/file-areas-loader";
import { BBSState, LoggedOnSubState } from "./constants/bbs-states";
export { BBSState, LoggedOnSubState };
import {
  extractAndReadDiz,
  getNodeWorkDir,
  getPlaypenDir,
} from "./utils/file-diz.util";
import { testFile, TestResult } from "./utils/file-test.util";
import { getConferenceDir } from "./utils/file-hold.util";
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
import { authenticateSocket } from "./server/socket-auth";
import { decideAdminSocket } from "./server/admin-socket";
import { launchChatOnlyLiveChat } from "./server/chat-only-launch";
import { initializeData } from "./server/initialization";
import { acceptWebConnection, type WebConnectionDeps } from "./server/web-connection";
import {
  sessions,
  userSessions,
  socketToUser,
  setSession,
  getNextAvailableNodeId,
  checkConnectionLimit,
  allNodesBusyNotice,
  createSession,
  socketToNodeId,
} from "./server/session-manager";
import { app } from "./server/app";
import { warmScreenIndex } from "./screens/screen-index.service";
import { TelnetServer, TelnetConnection } from "./server/telnet-server";
import {
  attachWSTerminalServer,
  WSTerminalConnection,
} from "./server/ws-terminal-server";
import { buildWsTerminalConnectionHandler } from "./server/ws-terminal-session";
import { SSHServerImpl, SSHConnection } from "./server/ssh-server";
import { LISTENER_DEFAULTS } from "./server/board-listeners";
import { SSHKeyUtil } from "./utils/ssh-key.util";
import type { WireCharset } from "./utils/wire-encoding.util";
import type { LoginEmitter } from "./types/login-emitter";
import type { OutputAttributes } from "./utils/output-pacing";
import { findSecurityScreen } from "./utils/screen-security.util";

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
  displayNewFiles,
  displayUploadInterface,
  matchesWildcard,
  parseParams,
  dirLineNewFile,
  setFileAreas,
  setDatabase as setDatabaseForFileHandler,
  setCallersLog,
  setGetUserStats,
  setFileSearchDependencies,
} from "./handlers/file/file.handler";
import { setMessageEntryDependencies } from "./handlers/message/message-entry.handler";
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
  setConstants as setConstantsForCommandHandler,
  loadCommands,
  setCommandExecutionDependencies,
} from "./handlers/command.handler";
import { reloadDoorCommands } from "./handlers/command-execution.handler";
import {
  startRestartCountdown,
  DEFAULT_RESTART_SECONDS,
} from "./services/restart-notice.service";
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
  /**
   * Descriptions the caller typed BEFORE the transfer, by upper-cased file
   * name - the pre-described batch XMODEM uses (express.e:17666-17720). A
   * file listed here is filed with it instead of being asked about again.
   */
  describedBefore?: Record<string, string[]>;
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
  /** Files the background check filed during the transfer (express.e bgData.checkedCount, 19059). */
  backgroundChecked?: number;
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
  /**
   * The screen theme this session has ALREADY been judged fit to wear.
   *
   * A real caller never carries this: `loadScreenFile` asks
   * `resolveCallerTheme` about `user.screenTheme`, and that function is the
   * one judge of what may be worn. Only the admin's preview sets it, because
   * a preview asks two questions at once - "may this ACCOUNT look at this
   * theme" and "what would a caller at level 20 be served" - and the second
   * must not be allowed to answer the first. The preview route asks the judge
   * with the requester's real identity and puts the answer here.
   */
  screenThemeResolved?: string;
  /**
   * The theme this BROWSER remembers wearing, off the handshake cookie.
   *
   * Used only while there is no user: the screens before login. A caller who
   * logs in is judged on their own stored preference, which wins from that
   * moment - see `remembered-theme.ts` for why a cookie is a preference and
   * never a credential.
   */
  preLoginTheme?: string;
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
  /**
   * The conference and message base joinConf last loaded: express.e's
   * msgBaseLocation (getMsgBaseLocation, express.e:5015) and confNameType
   * (5017-5024). joinConf sets them even when confScan=TRUE leaves
   * currentConf at 0 (4997-5000, 28103), so a reply made in the mail scan is
   * saved in the scanned base. Read it through utils/joined-conf.util.
   */
  joinedConf?: { conf: number; msgBase: number };
  timeRemaining: number;
  lastActivity: number;
  logonTime?: number; // Unix timestamp when user logged on (express.e:540)
  /**
   * express.e:136 newSinceFlag: N ran during this call (27902). Cleared at
   * logon (28504); at logoff it moves the account's newSinceDate to now
   * (8197), and each conference record's as its pointers load or save
   * (4911, 4945).
   */
  newSinceFlag?: boolean;
  /**
   * The logoff's saveAccount ran (services/account.service): the account in
   * memory is now every conference's sum, so no conference may take it back.
   */
  accountSavedAtLogoff?: boolean;
  lastTimeUpdate?: number; // Unix timestamp of last time update (express.e:541,552)
  /**
   * Which AmiExpress "day" this session's time accounting last belonged to.
   *
   * express.e:529 counts days as `Div(currTime-21600, 86400)` - a day turns at
   * 06:00 UTC, not at the server's local midnight - and it derives the
   * comparison from `logonTime`, which it MOVES to the day boundary on
   * rollover (express.e:540).
   *
   * We cannot move `logonTime`: two other readers take it as the real moment
   * this caller logged on - mci-dispatch.ts:261 shows it to them, and
   * clean-playpen.util.ts:44 decides from it which files in the playpen are
   * theirs. So the rollover check carries its own state instead of
   * reinterpreting a field other code depends on.
   */
  lastAccountingDay?: number;
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
  /**
   * The charset this caller's socket is written in, when it was NEGOTIATED
   * rather than classified (telnet CHARSET, RFC 2066) or is known by
   * construction (`/ws/terminal`, whose text frames are UTF-8 by RFC 6455).
   * It BEATS the `unicodeCapable` classification above; absent, the one
   * terminal predicate decides. See `utils/wire-encoding.util.ts`.
   */
  wireCharset?: WireCharset;
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
  confScanPauseOwed?: boolean; // express.e:28145 doPause() after the scan's part-upload check; paid by the display flow before the rejoin
  tempData?: any; // Temporary data storage for complex operations (like file listing)
  uploadContext?: UploadSessionContext;
  /** A procedure waiting for the upload to end (services/upload-end.service.ts). */
  uploadReturn?: import('./services/upload-end.service').UploadReturn;
  /** express.e rzmsg (240): the upload is the X of a message - its files go into <msgBaseLocation>F<msgNumb>. */
  rzmsg?: { dir: string; msgNumb: number };
  /**
   * express.e bgFileCheck (330): the node's BGFILECHECK, raised by the RZ
   * command (25614) and cleared by a message's file (10728). It stays set
   * until one of them changes it, so a later U upload is checked in the
   * background too. See services/background-file-check.service.
   */
  bgFileCheck?: boolean;
  /** The background file check running for the upload in progress (express.e's bg thread). */
  backgroundFileCheck?: import('./services/background-file-check.service').BackgroundFileCheck;
  /** express.e `editor` (219): the full-screen editor's object, what FULLEDIT reads and writes back (XIM EDITOR_STRUCT). */
  editor?: import('./amiga-emulation/xim/editor-struct').EditorState;
  pendingDisplayInputs?: string[];
  replayingDisplayInputs?: boolean;
  transferRawActive?: boolean; // When true, bypass cooked command handling for raw transfer (ZMODEM)
  transferRawSink?: ((buf: Buffer) => void) | null; // Handler for inbound raw data during transfers
  transferRawSend?: ((buf: Buffer) => void) | null; // Sender for raw bytes to the remote terminal
  transferManager?: any; // Active transfer manager (e.g., ZMODEM)
  flagManager?: any; // File flagging manager for batch downloads
  inDoorManager?: boolean; // Whether user is currently in door manager
  pendingDoorUpload?: boolean;        // requestArchiveUpload() is waiting for file-upload event
  doorUploadSavedPath?: string;      // where /api/upload saved this session's ticketed door upload
  pendingDoorUploadCallback?: ((result: { path: string; filename: string }) => void) | null;
  pendingDoorUploadReject?: ((reason: Error) => void) | null;
  doorInputHandler?: ((input: string) => void) | null; // Door input handler callback for TypeScript doors
  // Out-of-band Ctrl+C abort hook installed by long-running script engines
  // (e.g. AREXX). Invoked on incoming 0x03 bytes regardless of whether a
  // doorInputHandler is currently registered, so a script stuck in a
  // tight loop between input prompts can still be killed by the user.
  scriptAbortHandler?: (() => void) | null;
  clientDoorActive?: boolean; // Client (browser) door session active; suppress command handler input
  /**
   * WHICH client door is running, so a reconnect can be told.
   *
   * A phone that locks its screen drops the socket; the session survives the
   * grace period and the door keeps running, but the browser clears the door
   * it thought was up and nothing ever tells it again - the player is left on
   * the generic BBS keyboard for the rest of the door. The restore path
   * re-announces this (`door:active-client`).
   */
  clientDoorId?: string;
  doorKeyStateHandler?:
    | ((data: {
        key: string;
        pressed: boolean;
        keyState: Record<string, boolean>;
        /**
         * True when this press is the browser's synthetic REPEAT of a key
         * that is still held, rather than a new press.
         *
         * The browser has always sent it (`BBSTerminal.tsx`, `key-down`
         * with `repeat: true`) and the socket handler used to drop it, so a
         * door could only guess a repeat by keeping its own held-key set -
         * which goes stale the moment a key-up is lost to a blur or a
         * dropped frame, and a repeat then reads as a fresh press.
         */
        repeat?: boolean;
      }) => void)
    | null; // Door key state handler for simultaneous key input
  doorReconnectHandler?: (() => void) | null; // Door reconnect handler to force redraw after socket reconnect
  pendingDoorCommands?: string[]; // Commands queued by doors to run after exit
  socket?: any; // Active socket instance (used for reconnect-safe output)
  socketId?: string; // Active socket id for this session
  /**
   * The telnet/SSH connection emitter that reaches this session, bound by
   * `server/session-emitter-registry.ts` (TP-10) at the transport entry point
   * and dropped at close. Web sessions leave it undefined: their live socket is
   * resolved from `socketId` through the io namespace, because `socket` above
   * is the DEAD socket after a reconnect. NOTHING should read this field
   * directly - `emitterForSession()` is the one reader, so both transports get
   * one answer.
   */
  connectionEmitter?: LoginEmitter | null;
  /**
   * The link over this web caller's socket (server/session-link.ts): every holder of
   * the session holds it, never the raw socket. Set by acceptWebConnection;
   * `emitterForSession` answers it first. Telnet/SSH sessions have none.
   */
  webLink?: import('./server/session-link').SessionLink;
  /** When the caller's raw socket dropped and the session was parked (S6). */
  detachedAt?: number;
  /** The board clock at that drop: the CallersLog off time of a park that never resumes (S8). */
  detachedBoardTime?: Date;
  bbsApi?: any; // Active BBS API instance for doors (used to rebind socket on reconnect)
  keyState?: Record<string, boolean>; // Current key state for simultaneous input (which keys are pressed)
  gameModeEnabled?: boolean; // Whether game mode is active (raw keydown/keyup events)
  /**
   * Which synthetic key repeat the RUNNING door asked for.
   *
   * Set from the door's `KEY_REPEAT` tooltype when it launches, read by
   * `services/game-mode.service.ts` when game mode is switched on. Absent
   * means the arcade rate, which is what every client door had before this
   * existed - see the note at `door.handler.ts`'s `key-repeat-mode` emit.
   */
  doorKeyRepeatMode?: 'game' | 'application';
  currentDoorType?: string; // Type of currently running door (XIM, AMI, TS, etc.)
  /**
   * Registered command of the door currently running (e.g. "GMASTER").
   * Door events are attributed with this rather than commandText, which is
   * whatever the user typed - an alias, a differently-named menu entry or a
   * command with arguments all produced a door name that per-door webhook
   * filters could not match.
   */
  currentDoorName?: string;
  keyRepeatManager?:
    | import("./services/KeyRepeatManager").KeyRepeatManager
    | null; // Backend key repeat for 68K doors
  mouseEventsEnabled?: boolean; // Whether mouse events should be sent to door (for ANSI editor, etc.)
  ansiEnabled?: boolean; // Whether ANSI is enabled for this session
  petsciiMode?: boolean; // Whether PETSCII mode is enabled (PETSCII bytes on the wire)
  /**
   * How wide the PETSCII screen is: 40 (a C64) or 80 (the web terminal's
   * C128-style screen). Absent means 40.
   *
   * SEPARATE from petsciiMode on purpose. That one boolean was doing two
   * jobs - "send PETSCII bytes" and "the screen is 40x25" - across 87 call
   * sites, and only the handful that actually decide a WIDTH read this
   * field. Renaming the rest would buy nothing and risk everything.
   * petsciiMode still means bytes; this means geometry.
   */
  petsciiColumns?: 40 | 80;
  /** Per-session ANSI->PETSCII transducer for real C64 callers (connection-emitter.ts). Lazily created; shared by every emitter built for the connection so cursor/charset/reverse state never forks. */
  petsciiTransducer?: import("@amiexpress/bbs-door-sdk/petscii").AnsiToPetsciiTransducer;
  /** The character set the caller chose with CTRL+L (0 upper case/graphics, 1 lower case); absent = 1. utils/petscii-session-model.ts togglePetsciiCase. */
  petsciiCaseBank?: 0 | 1;
  ripMode?: boolean; // Whether RIP graphics mode is enabled (640x350, .rip files)
  // WEB_: teletext mode (T answer at the graphics prompt). TDAText font +
  // teletext palette in the web terminal; plain ANSI on byte transports.
  // Pure boolean like ripMode - no render ctx, cleared per-session.
  texttvMode?: boolean; // Whether teletext display mode is enabled
  terminalType?: "c64" | "modern" | "unknown"; // Terminal type: C64 (raw PETSCII), modern (Unicode PUA), or unknown
  screenWidth?: number; // The board's column MODEL (40 for C64, 80 for modern) - what its screens and doors are drawn for
  wireWidth?: number; // The caller's REAL terminal width, from NAWS / the PTY size. Not reset by the graphics prompt; the wire fold reads THIS, not screenWidth.
  wireHeight?: number; // wireWidth's twin: the REAL height, set by applyClientReportedGeometry for every transport (was tempData.termHeight, web only).
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
  cleanLogoff?: boolean; // Caller said goodbye with G - deliberate logoff, skip grace period (a 15s wait only serves drops, and a fast re-login reads its own ghost)
  entryUserId?: unknown; // Who this socket held before the current login overwrote session.user (ghostlogoff: same-socket re-auth skips the already-on check)
  loginTime: number; // Login timestamp for session time tracking
  nodeStartTime: number; // Node start time for uptime display
  nodeId: number; // Virtual node number (1, 2, 3...) for multi-node emulation - express.e:163
  conferences?: import("./database/types").Conference[]; // Cached conference accounting stats (express.e confBases)
  queuedScreenCommands?: string[]; // Deferred screen commands (run after pause key)
  lastScreenHadPause?: boolean; // Whether the last displayed screen contained ~SP.
  /**
   * The display flow owes this screen a pause, once its `~SP` segments end.
   *
   * express.e:28557 pauses AFTER a flow screen is displayed in full; `~SP`
   * pauses DURING it (express.e:5455-5461). They are different pauses, and
   * `pauseDisplayFlow` used to spend the second on the first - leaving the
   * last segment of a segmented screen to be wiped by whatever drew next.
   */
  flowPauseAfterSegments?: boolean;
  /** The last keystroke handed to the board; the next waits on it (terminal-input dispatchInOrder). */
  keyChain?: Promise<void>;
  keyBusy?: boolean;
  /** Input before this time is a finished transfer's protocol tail (raw-transfer-teardown). */
  transferDrainUntil?: number;
  /** Where the protocol-tail filter is inside a ZMODEM header (terminal-input isProtocolTail). */
  transferTail?: { can: boolean; hex: number; eol: number; header?: boolean };
  // express.e's non-stop text flag (`~NS` / `~NSF`): suppresses further
  // pauses for the rest of the display. Set by the MCI dispatch and the
  // pre-passes, read by the XIM bridge (`XIMProtocol.ts:150`) and ARexx
  // (BB_NONSTOPTEXT).
  nonStopText?: boolean;
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
  /**
   * A running door has lent the terminal to a board flow - JH_EF's edit()
   * (express.e:3477-3485). Every key goes to the board until the flow hands
   * it back; the door is paused waiting for its reply.
   */
  doorLentTerminal?: boolean;
  /**
   * The running door can be held still: no input, no CPU, no time. Set by the
   * door runner while a door runs; the command palette opened over the door
   * (services/palette-over-door.ts) pauses it and resumes it on close.
   */
  doorHold?: { pause: () => void; resume: () => void };
  /** An express.e lineInput / readChar a ported procedure is awaiting (utils/await-input). */
  inputWaiter?: import('./utils/await-input').InputWaitingSession['inputWaiter'];
  /** Keys held for a ported procedure that owns the input (utils/await-input holdInput). */
  typeAhead?: string[];
  /** Keys an ended procedure left unread; the board's next prompt reads them (utils/await-input readLineAhead). */
  lineAhead?: string[];
  /**
   * Set by a caller that opened the account editor and waits for it to close:
   * editInfo's flag (express.e:21647 `ENDPROC flag`) - 1 for X (no-save),
   * 2 for TAB - or 0 when the editor never opened.
   */
  accountEditDone?: (flag: number) => void;
  paginatedScreen?: {
    lines: string[];
    nextIndex: number;
    pageSize: number;
    eventName: "ansi-output" | "petscii-output";
    commands?: string[];
    /**
     * What the pause is holding back. It MAY be async - the join's tail is -
     * and whoever fires it must AWAIT it: see handlePaginatedScreenInput.
     */
    onComplete?: () => void | Promise<void>;
    kind?: 'bbs' | 'door' | 'doPause'; // 'bbs' = More prompt, 'doPause' = Pause/Space prompt, 'door' = door-owned
    /**
     * The gate belongs to an INCLUDED screen (~SS_/~SR_), and the host screen
     * is waiting on it. N stops only this file: the host's own segments and
     * queued commands are not the include's to throw away, and the host
     * resumes either way (displayIncludedScreen).
     */
    include?: boolean;
    /**
     * TP-5: the wire attribute page 1 went out with. Page 2 is the same
     * file's bytes, so it must carry the same source charset or a `.ans`
     * would reach a CP437 caller exactly for one page and transcoded for the
     * rest. Absent for a composed list (`file.handler.ts`).
     */
    sourceAttrs?: Readonly<OutputAttributes>;
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
    /** TP-5: the charset the screen this segment came from was decoded from. */
    sourceAttrs?: Readonly<OutputAttributes>;
    // --- PETSCII `.seq` segments (plan 2026-09-02-mci-in-petscii-seq, Task 8)
    /** Segments are latin-1 `.seq` bytes, already gated/pre-passed/tokenized. */
    petscii?: boolean;
    /** The render ctx (and therefore the PetsciiMachine) the paused screen
     *  was drawn with: the resume continues the SAME bank and cursor. */
    petsciiCtx?: PetsciiRenderCtx;
    /** Substitution spans per segment, rebased onto it (index-aligned with
     *  `segments`). */
    petsciiSpans?: PetsciiSpan[][];
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

  // FAME/FIM sysop page-wait (task 18): CF_InternalCmd "C" (5D_Page etc.)
  // pages the sysop mid-door via notifySysopPage() but the classic
  // AmiExpress page-wait UX (dots animation / sysop-answer / timeout) must
  // run AFTER the door exits, never interrupting it. sysopPagePending is
  // set by notifySysopPage() and consumed by door.handler.ts's post-exit
  // path via chat.handler.ts's runPendingSysopPageWait().
  sysopPagePending?: boolean;
  sysopPageChatSessionId?: string; // Chat session created by notifySysopPage, reused (not duplicated) by the post-door wait
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
  olmBuffer?: string[]; // Buffer for incoming OLM message lines
  olmQueue?: string[]; // Queue of pending OLM messages to send

  // Preference settings
  ansiMode?: boolean; // ANSI mode preference
  pagesAllowed?: number; // Number of pages allowed (-1 = unlimited, 0 = none)
  quietMode?: boolean; // Quiet mode preference
  relogon?: boolean; // Flag for relogon after goodbye
  quickFlag?: boolean; // Quick logon flag (express.e:116) - skip bulletins when 'Q' entered at ANSI prompt

  // Screen-triggered command execution
  // Width-gate fall-through (open backlog 11.1). Set to 'ARMED' by
  // processCommand before a door launch it can fall through from, answered
  // 'REFUSED' by executeDoor's MIN_COLUMNS gate instead of printing the
  // 80-column notice. See utils/door-min-columns.util.ts.
  widthGateFallThrough?: WidthGateFallThrough;

  // Locked-out comment form (login-post accountLocked / pwd-change-denied):
  // express.e runs the C flow to completion inline before Thanks + logoff,
  // but this port's C only emits the first prompt and returns - the rest
  // arrives over later keystrokes. Set when the form starts; the
  // message-entry funnel in command.handler.ts fires the deferred Thanks +
  // beginLogoff when the flow lands back on DISPLAY_MENU.
  logoffAfterComment?: boolean;

  executingScreenCommand?: boolean; // True while ~CC/~XI command is running
  /**
   * How many inline `~CC_` sentinels are awaiting a command right now.
   * A door launched by one is finished by the walker that launched it, which
   * arms the `~SP` boundary pause itself - see doorExitOwesThePause.
   */
  inlineScreenCommandDepth?: number;
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
  // Every other option (pingTimeout 20 s per Decision 9, no
  // connectionStateRecovery per Decision 10) lives in socket-io-options.ts.
  ...SOCKET_IO_OPTIONS,
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
/**
 * UNREF'D: it reports that the process is alive, it does not keep it alive.
 *
 * This is module-level, so a suite calling jest.resetModules() per test gets
 * one more of them each time - eight after four tests - and every one keeps
 * jest from exiting. The server itself is what holds the process open in
 * production, and while it does this timer goes on logging exactly as before.
 */
const heartbeatTimer = setInterval(() => {
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
heartbeatTimer.unref?.();

/*
 * The heartbeat above only PRINTS that the loop is turning. Nothing acted on
 * its silence, and on 2026-09-20 it went quiet at 14:27 inside a 68K door and
 * the board answered nobody until it was restarted by hand at 17:14. The
 * watchdog below is the thing that acts: it lives on a worker thread, off the
 * event loop, and kills the process when the loop stops so Docker's
 * restart=unless-stopped brings the board back in about a minute. See
 * server/event-loop-watchdog.ts for why a kill is the only move available.
 */
const eventLoopWatchdog = startEventLoopWatchdog();
if (!eventLoopWatchdog) {
  console.log(
    "[EventLoopWatchdog] Not watching (set EVENT_LOOP_WATCHDOG_SECONDS to arm it outside production).",
  );
}

// SIGUSR1 - the deploy workflow's "you are about to be replaced" signal.
//
// Sent after the new image has finished building and before the container is
// recreated, so the countdown runs while nothing is down yet and costs no
// extra downtime. A signal rather than an HTTP endpoint because Caddy proxies
// everything to 3001: an admin route would need its own secret and would be
// reachable from the outside, whereas `docker kill -s SIGUSR1` is not.
process.on("SIGUSR1", () => {
  const seconds = parseInt(process.env.RESTART_NOTICE_SECONDS || "", 10) || DEFAULT_RESTART_SECONDS;
  console.log(`[RESTART NOTICE] SIGUSR1 received - announcing restart in ${seconds}s`);
  try {
    startRestartCountdown(io, seconds);
  } catch (err) {
    console.error("[RESTART NOTICE] broadcast failed:", err);
  }
});

// SIGTERM handler - Docker/orchestrator sends this before stopping the container
// This helps diagnose if crashes are due to health check timeouts
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received - container is being stopped");
  // Every caller still on keeps his call: the account is in memory until
  // logoff (express.e:8207), and a stopped container has no logoff.
  try {
    const { saveOnlineAccounts } = require("./services/account.service");
    console.log(`[SHUTDOWN] Saved ${saveOnlineAccounts()} online account(s)`);
  } catch (err) {
    console.error("[SHUTDOWN] Saving the online accounts failed:", err);
  }
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

// Socket.IO authentication (server/socket-auth.ts).
io.use(authenticateSocket);

const port = process.env.PORT || config.get("port");

// Create telnet and SSH servers for native BBS client connections (configured at runtime)
let telnetPort = parseInt(process.env.TELNET_PORT || String(LISTENER_DEFAULTS.telnet));
let sshPort = parseInt(process.env.SSH_PORT || String(LISTENER_DEFAULTS.ssh));
let telnetServer: TelnetServer | null = null;
let sshServer: SSHServerImpl | null = null;
// Task 10: dedicated PETSCII port, disabled unless TELNET_PETSCII_PORT is set.
let telnetPetsciiServer: TelnetServer | null = null;

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
// The limiter itself is session-manager's checkConnectionLimit, the one
// every transport asks, under one switch (security/connection-limits.ts).

import { LOCALHOST_IPS } from "./constants/localhost-ips";
export { LOCALHOST_IPS };


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
import { getBoardConfig } from './services/bbs-config-file.service';

// ===== HTTP Routes (now in server/routes-setup.ts) =====
// Routes registered in startup section below

// Telnet/SSH Connection Handler
// Connects native telnet and SSH clients to BBS command processing.
//
// The body moved VERBATIM to server/transport-session.ts (plan TP-2,
// thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md). This file starts the
// HTTP, telnet and SSH servers from a top-level IIFE, so while the handler
// lived here no test could reach a telnet caller's real entry point - the
// `data` handler, the close handler, the emitter attach. Only the dependencies
// it used to close over are wired below.
const transportDeps: TransportSessionDeps = {
  io,
  sessions,
  nodeManager,
  // The same dynamic import the data handler did inline. Kept in the
  // production wiring so the runtime module graph is unchanged, while a test
  // can drive the entry point without pulling the whole command graph (and,
  // transitively, this file) in with it.
  handleCommand: async (emitter, session, input, ioArg) => {
    const { handleCommand } = await import("./handlers/command.handler");
    handleCommand(emitter, session, input, ioArg);
  },
};

// Set up telnet server event handlers
// Attach telnet connection handler when server is created (later in startup)

// SSH connection handlers are attached when the SSH server is created (startup section)

const webConnectionDeps: WebConnectionDeps = { nodeManager, chatState };

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

    // Launch LiveChat door directly — user is already authenticated.
    // server/chat-only-launch.ts: the launch goes through executeDoor and
    // its MIN_COLUMNS gate, judged against the REGISTERED LiveChat door
    // (Commands/BBSCmd/LIVECHAT.info), not a hand-built literal.
    console.log("[SSO] Executing LiveChat door for authenticated user");
    // Small delay to ensure client handlers are fully registered
    await new Promise((resolve) => setTimeout(resolve, 100));
    launchChatOnlyLiveChat(socket, existingSession).catch((err: any) => {
      console.error("[SSO] LiveChat door execution failed:", err);
    });
    return;
  }

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
console.warn(`[WARNING] Rate limit exceeded for IP: ${clientIp}`);
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31m------------------------------------\x1b[0m\r\n"
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
      "\x1b[31m------------------------------------\x1b[0m\r\n"
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

    // A node first, as every other transport takes one; a full board says so.
    const chatNodeId = getNextAvailableNodeId();
    if (chatNodeId === null) {
      socket.emit("ansi-output", allNodesBusyNotice());
      socket.disconnect();
      return;
    }

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
      nodeId: chatNodeId,
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

    // Launch LiveChat door immediately - it will show login modal and handle
    // auth. Same launch as the SSO branch above: through executeDoor and its
    // MIN_COLUMNS gate, against the registered LiveChat door.
console.log("[ChatOnly] Executing LiveChat door");
    // Small delay to ensure client handlers are fully registered
    await new Promise(resolve => setTimeout(resolve, 100));
    await launchChatOnlyLiveChat(socket, session);

    return;
  }

  // ADMIN-ONLY MODE: a dashboard socket, not a caller.
  //
  // The admin app opens a socket to watch the board - node status, transfers,
  // sysop pages. Without this branch it falls through to node assignment
  // below and is handed a real BBS node plus the whole welcome sequence, so
  // every admin browser tab occupied a node and showed up as a phantom user
  // in node status. It also joins the `admin` room, which nothing had ever
  // joined, leaving the import progress events emitted to it with no
  // listener.
  //
  // The query flag is a request, never the authority: the level is read from
  // the session the JWT middleware attached. A non-sysop passing
  // adminOnly=true falls through to the ordinary BBS path.
  const adminUser = (socket as any).session?.user;
  const adminDecision = decideAdminSocket(socket.handshake?.query, adminUser);

  if (adminDecision.serveAsAdmin) {
    for (const room of adminDecision.rooms) socket.join(room);
console.log(
      `[AdminOnly] Dashboard socket for ${adminUser?.username} - no node assigned`
    );
    return;
  }

  if (adminDecision.refusedReason) {
console.warn(
      `[AdminOnly] Refused for ${adminUser?.username ?? "an unauthenticated socket"}: ${adminDecision.refusedReason}. Continuing as a normal connection.`
    );
  }

  // The BBS-node body (node assignment to the end) lives in server/web-connection.ts
  // so a test can drive the browser caller's real entry point.
  await acceptWebConnection(io, socket, webConnectionDeps);
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
//
// IMPORTING THIS MODULE UNDER JEST MUST NOT START THE BOARD.
//
// This was a bare `(async () => { ... })()` - the board booted as an import
// side effect, and 53 files import something from here. Any suite that
// touched one of them started the HTTP, telnet and SSH servers, loaded the
// database and ran initializeData.
//
// The failure that exposed it: the boot is ASYNCHRONOUS, so when it threw
// (`initOperatorChatHandler is not a function`) the rejection surfaced
// against whichever test happened to be running at that moment - a DIFFERENT
// test on every run. tests/transport went red on entry-parity, then R1, then
// R2b, none of which had anything to do with it. The worst shape of failure
// to chase, because the red test is never the guilty one.
//
// The `throw error` guard below is what made it a flake rather than a
// run-killer: it stopped `process.exit(1)` taking the whole jest worker down
// (which read as "no tests work") but left an unhandled async rejection
// looking for a victim. Not booting at all is the fix; that guard stays for
// anything that calls `startBBS()` deliberately.
export async function startBBS(): Promise<void> {
  try {
console.log("Initializing database and loading data...");
    await initializeData(io);

    // Initialize operator chat handler.
    //
    // `require`, NOT `await import`. Under tsx a dynamic import of a TS
    // module yields a SECOND instance with its own module state, and under
    // jest it yields a namespace whose function is not callable at all -
    // "initOperatorChatHandler is not a function", which then took the
    // whole test run down through the exit below.
    const { initOperatorChatHandler } = require("./handlers/operator-chat.handler");
    const operatorChatRepo = db.getOperatorChatRepository();
    initOperatorChatHandler(io, operatorChatRepo);
console.log("[OK] Operator chat handler initialized");

    // Achievements (SP2): drain the outbox to the achievements server. The
    // timer is unref'd and does nothing while the board is not configured;
    // the reporter writes the outbox whether or not this runs.
    const { startFlusher, productionFlusherDeps } = await import("./achievements/flusher");
    const { currentSettings: achievementsNow } = await import("./achievements/reporter");
    startFlusher(productionFlusherDeps(io));
console.log(`[OK] Achievements flusher started (${achievementsNow().enabled ? "reporting to " + achievementsNow().serverUrl : "not configured, idle"})`);

    // Notifications (NOTIFY door): drain notify_outbox. N1 delivers the Board
    // channel; email and push senders are wired by their own phases.
    const { startNotifyDispatcher, productionDispatcherDeps } = await import("./notify/dispatcher");
    startNotifyDispatcher(productionDispatcherDeps(io));
console.log("[OK] Notification dispatcher started");

    // The achievements bulletin (Screens/AchieveTop.txt): the two
    // leaderboards a caller sees at login, on the Conftop-II shape - a file
    // the board writes, a screen the login ladder reads. Off boards remove
    // the file instead of writing one, so nothing is ever shown stale.
    const { startAchievementsBulletin } = await import("./achievements/bulletin");
    startAchievementsBulletin();
console.log("[OK] Achievements bulletin refresher started");

    // The news bulletins (Bulletins/bull7.txt news, bull8.txt sport): SVT
    // Text-TV headlines via texttv.nu, refreshed hourly. WHIP task
    // 8f358f41. A dead fetch keeps yesterday's file, never a blank one.
    const { startNewsBulletins } = await import("./services/news-bulletins");
    startNewsBulletins();
console.log("[OK] News bulletins refresher started");

    // amiscan's virus database and unpackers, kept current on the data
    // volume (AmiScan/). Does nothing when the binary is not installed.
    const { startAmiscanUpdates } = await import("./services/amiscan-update.service");
    if (startAmiscanUpdates()) {
console.log("[OK] AmiScan parts updater started");
    }

    // Initialize web push notifications with database config
    const { initWebPush } = await import("./utils/web-push.util");
    // config-source-ok: the VAPID push keys are database-only - express.e has
    // no tooltype for them, so there is nothing on disk to read.
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
      const sysConfig = getBoardConfig(config.get('dataDir'));
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

    /**
     * LISTENING IS OPTIONAL, AND ONLY A TEST TURNS IT OFF.
     *
     * Requiring `message-scan.handler` pulls in `command.handler`, which
     * pulls in this file, which starts the HTTP, telnet, SSH and FTP servers.
     * A suite that only wanted the mail scan therefore left four listening
     * servers behind, jest reported "did not exit one second after the test
     * run has completed", and the full backend run had to be killed at 25
     * minutes rather than finishing - which is how 86 failing tests went
     * unnoticed (2026-09-07).
     *
     * Absent, the flag changes nothing: every server starts exactly as it
     * did. A test that wants the handler chain without the ports sets
     * SKIP_SERVER_START=1 before its first require.
     */
    if (process.env.SKIP_SERVER_START === '1') {
console.log('[SETUP] SKIP_SERVER_START=1 - handlers wired, no listeners bound');
      return;
    }

    /**
     * Tee console output to logs/backend.log before anything else starts.
     *
     * The container runs `exec npx tsx src/index.ts`, so every line the board
     * logs goes to docker's stdout and nowhere else - it dies with the
     * container. On 2026-09-08 a caller's failing upload was investigated
     * twice and the evidence was gone both times because the container had
     * been recreated. The admin's own log viewer reads logs/backend.log,
     * which in production nothing had written since 22 April.
     *
     * Capped and rotated - the same logs/ directory held an 8.1 GB
     * filehandle-debug.log because a debug write had no ceiling.
     */
    try {
      const { installBackendFileLog } = require('./utils/backend-file-log.util');
      installBackendFileLog(config.get('dataDir') || './data');
    } catch (err: any) {
      console.error(`[SETUP] backend file log not installed: ${err?.message || err}`);
    }

    // Start HTTP/Socket.IO server
    server.listen(port, host, () => {
console.log(`[OK] HTTP/WebSocket Server running on ${host}:${port}`);
console.log(`[WEB] BBS accessible at http://localhost:${port}/`);
      // Pay the index build now, while the board is empty, instead of making
      // the admin's first Screens click (and any caller logging in during it)
      // wait for it. Defers itself while anyone is connected.
      warmScreenIndex(config.get('dataDir'), { isBusy: () => sessions.size > 0 });
    });

    // Raw WebSocket terminal endpoint at /ws/terminal — same pipeline
    // telnet uses, no Socket.IO wrapper. Lets third-party web terminals
    // and CLI ws clients connect to the BBS over wss:// using just the
    // standard WebSocket protocol (no Socket.IO handshake).
    try {
      // The handler lives in server/ws-terminal-session.ts now. It was an
      // inline callback here, and the PRE-LOGIN runs inside it - not in
      // attachWSTerminalServer and not in setupTelnetSSHHandler - so no test
      // could reach it while index.ts started servers on import. Same reason
      // TP-2 moved setupTelnetSSHHandler out.
      attachWSTerminalServer(server, buildWsTerminalConnectionHandler({
        createSession: createSession as never,
        setSession: setSession as never,
        transportDeps,
        hostname: config.getConfig().hostname,
        port,
      }));
    } catch (err) {
console.error("[WS-Terminal] Failed to attach:", err);
    }

    // Shared c64-detected handler (skip graphics prompt, show BBSTITLE
    // directly) — used by both the primary telnet server and, when
    // configured, the dedicated PETSCII port (task 10) below. Extracted to
    // server/c64-detected-handler.ts (final review wave, Finding 1) so it
    // reuses buildConnectionEmitter — the same emitter every other
    // telnet/SSH session uses — instead of a hand-rolled mini-emitter that
    // silently dropped `petscii-bytes` (Task 9's raw .seq transport) and
    // lacked the case-swap/charset-prelude handling real 'ansi-output'
    // needs for a C64.

    // Start telnet server
    try {
      telnetServer = new TelnetServer(telnetPort);
      telnetServer.on("connection", (connection: TelnetConnection) => {
        setupTelnetSSHHandler(connection, "telnet", transportDeps);
      });
      // Handle C64 terminal auto-detection (skip graphics prompt, show BBSTITLE directly)
      telnetServer.on("c64-detected", handleC64Detected);
      await telnetServer.start();
console.log(`[OK] Telnet Server ready on port ${telnetPort}`);
console.log(`[TELNET] Connect: telnet localhost ${telnetPort}`);
    } catch (error) {
console.error(`[WARNING] Failed to start Telnet server:`, error);
console.log("   BBS will continue without telnet support");
    }

    // Start dedicated PETSCII telnet server (task 10), disabled unless
    // TELNET_PETSCII_PORT is set. Synchronet convention: a port whose
    // connections are PETSCII from byte one — the strongest autodetect for
    // real C64s, whose WiFi modems negotiate no telnet options at all.
    // Feeds the SAME connection handler and c64-detected handler as the
    // primary telnet server above; only the port and the petsciiDefault
    // flag differ.
    const { port: telnetPetsciiPort, warning: telnetPetsciiPortWarning } =
      resolveTelnetPetsciiPort(process.env.TELNET_PETSCII_PORT);
    if (telnetPetsciiPortWarning) {
console.warn(`[WARNING] ${telnetPetsciiPortWarning}`);
    }
    if (telnetPetsciiPort) {
      try {
        telnetPetsciiServer = new TelnetServer(telnetPetsciiPort, { petsciiDefault: true });
        telnetPetsciiServer.on("connection", (connection: TelnetConnection) => {
          setupTelnetSSHHandler(connection, "telnet", transportDeps);
        });
        telnetPetsciiServer.on("c64-detected", handleC64Detected);
        await telnetPetsciiServer.start();
console.log(`[OK] PETSCII Telnet Server ready on port ${telnetPetsciiPort}`);
console.log(`[TELNET] PETSCII connect: telnet localhost ${telnetPetsciiPort}`);
      } catch (error) {
console.error(`[WARNING] Failed to start PETSCII Telnet server:`, error);
console.log("   BBS will continue without the dedicated PETSCII port");
      }
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
        setupTelnetSSHHandler(connection, "ssh", transportDeps);
      });
      await sshServer.start();
console.log(`[OK] SSH Server ready on port ${sshPort}`);
console.log(`[SSH] Connect: ssh -p ${sshPort} user@localhost`);
    } catch (error) {
console.error(`[WARNING] Failed to start SSH server:`, error);
console.log("   BBS will continue without SSH support");
    }

    // FTP, when the sysop has turned it on. Same posture as SSH above: the
    // board comes up without it if it cannot start, and the port comes from
    // system_config unless FTP_PORT overrides. Phase 2 of
    // thoughts/shared/plans/2026-09-07-ftp-server.md - login only so far, so a
    // caller who gets in is answered 502 by everything else.
    try {
      const { startFtpServer } = require("./ftp/start-ftp");
      const { boardFtpDeps } = require("./ftp/ftp-auth");
      const ftpConfig = (() => {
        try { return getBoardConfig(config.get('dataDir')); } catch { return null; }
      })();
      // The namespace answers the already-online gate for a web caller.
      const ftpServer = await startFtpServer(ftpConfig, boardFtpDeps((id: string) => io.of('/').sockets.has(id)));
      if (ftpServer) {
        const bound = ftpServer.address();
console.log(`[OK] FTP Server ready on port ${bound?.port}`);
console.log(`[FTP] Connect: ftp -p localhost ${bound?.port} (AUTH TLS required from off the box)`);
      }
    } catch (error) {
console.error(`[WARNING] Failed to start FTP server:`, error);
console.log("   BBS will continue without FTP support");
    }

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("[READY] AmiExpress BBS is ready for connections!");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
console.error("[ERROR] Failed to start server:", error);
    /**
     * A test that imports this module must not be able to kill the run.
     *
     * `process.exit(1)` here ends the JEST WORKER, so one suite that boots
     * the server and fails takes every suite queued behind it with it - the
     * run stops mid-way with no summary, which reads as "no tests work".
     * A real board still exits; a test gets an error it can assert on.
     */
    if (process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === "test") {
      throw error;
    }
    process.exit(1);
  }
}

// A real board boots on import, exactly as before. A test does not.
if (process.env.JEST_WORKER_ID === undefined && process.env.NODE_ENV !== "test") {
  void startBBS();
}
